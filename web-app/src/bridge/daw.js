// DAW bridge. Active only with ?daw=ws://127.0.0.1:PORT, or when the page is served by the U2C plugin (meta u2c-daw-ws).
// Wire (localhost WebSocket): text {t:"transport", bpm, beats, widx, playing, ts:[n,d], loop:[a,b]|null, rms, peak, sr} (beats = host PPQ
// of the newest audio sample); client {t:"pull"} -> binary "PCM0" [u32 sr][u32 n][f64 first sample index][f32 L*n][f32 R*n];
// text {t:"hits", kick, snare, hat (strength 0..1, 0 = none), pos (sample index, same space as transport.widx), beats}: drum hits found by the plugin;
// text {t:"meters", pos, beats, momentary, short, tp, tpL, tpR, peakL, peakR, rmsL, rmsR (dB), corr, width, spec[61] (dBFS, 1/6 octave), fl:[{pk, rms, hold (dB), clip}, x2] (FL mixer-style peak / RMS body / held tick / clip per channel)}: ~30 per second,
// measured natively in the plugin (BS.1770 K-weighting, 4x true peak); with Master live they overwrite the analysed clip's values at the live position;
// text {t:"sends", list:[{id, name, rms, peak, bands[8], kick, snare, hat, pos (host sample or null), beats, rx}]}: the connected U2C Send plugins (one per DAW track),
// republished ~30 per second, stale ones dropped after 1.5 s; each is assigned a visual target in the panel (off / pulses / shake / glow);
// text {t:"midi", on, ch, note, vel (0..1), pos (ring index, like hits), host (host sample position or null), beats}: note on / off from the plugin's MIDI input;
// client {t:"cap", on, fps, w} -> binary "JPG0"+jpeg frames of the DAW window; client {t:"save_begin", name} + binary chunks + {t:"save_end"}.
// Clock: while the host PLAYS, the app follows the host PPQ, interpolated every animation frame from the last transport message.
// While it is STOPPED the app runs its own clock (intro, sphere pick, scrub: exactly as in the web app).
// "Receive audio from: Master": the live stereo master is written into a bar-aligned window (4 bars), analysed like a file in the
// worker, and shown by the unchanged film; a looping DAW is exact from the second pass, a linear one trails by the analysis time.
import { createPreview } from './preview.js';
import { showCard, planFor } from './livecard.js';
import { QUALITY, recordSpec, pickMime, startOffscreen } from './record.js';
import { ref as REF, refUpdate, importReferences, initReferences, addShow, removeShow, setColor, allRefs, shown, saveRefs } from './reference.js';
import { live as liveState, addHit, addMidi, releaseNotes, updateSends, SEND_TARGETS } from '../v8/livefx.js';
const LIVE_BARS = 4;
const OCT6 = Array.from({ length: 61 }, (_, i) => 1000 * 2 ** ((i - 34) / 6));
const tagOf = (buf) => String.fromCharCode(...new Uint8Array(buf, 0, 4));

export async function initDaw(app) {
  let url = null;
  try { url = new URLSearchParams(location.search).get('daw'); } catch (_) {}
  if (!url) { const m = document.querySelector('meta[name=u2c-daw-ws]'); if (m) url = `ws://${location.hostname}:${m.content}`; }   // injected by the plugin's HTTP server
  if (!url) return null;
  const st = { rq: '1080p', rfps: 30, recs: [], url, connected: false, host: null, follow: true, rec: null, live: false, cap: false, capMsg: '', lat: 0, saved: '' };
  const ui = mountUi(st);
  let ws, retry = 0;
  const clk = () => app.clock, trk = () => app.store.session.track, A = () => app.actions;
  const dirty = () => { if (app.studio && app.studio.markDirty) app.studio.markDirty(); };

  // ---- host clock: last transport message + per-frame interpolation of the host PPQ
  // beats(now) = (now - O) * bps: O is the lowest-delay offset seen over 2.5 s (a late message only ever raises it), so a busy frame
  // cannot drag the clock behind; the plugin counts transport jumps (seek, loop, start/stop, tempo) and each one restarts the estimate.
  const an = { beats: 0, O: 0, bps: 2, playing: false, jump: -1, widx: 0, sr: 44100 }, offs = [];
  const beatsAt = (now) => (an.playing ? (now - an.O) / 1000 * an.bps : an.beats);
  function anchor(h) {
    const bps = (h.bpm || 120) / 60, rx = h.rx; an.widx = h.widx; an.sr = h.sr;
    if (!h.playing) { an.playing = false; an.beats = h.beats; an.bps = bps; offs.length = 0; return; }
    if (!an.playing || h.jump !== an.jump || bps !== an.bps) offs.length = 0;
    an.jump = h.jump; an.bps = bps; an.playing = true; offs.push([rx, rx - h.beats / bps * 1000]);
    while (offs.length > 1 && rx - offs[0][0] > 2500) offs.shift();
    an.O = Math.min(...offs.map((x) => x[1]));
  }
  const beatsToT = (b) => { const tr = trk(); return tr ? tr.t0 + b * tr.spb : b / an.bps; };

  // ---- live master window
  const lv = { on: false, bpm: 0, spb: 0, sr: 44100, len: 0, L: null, R: null, win: null, dirty: false, last: 0, busy: false, ready: null, origCurrent: null, filled: 0 };
  const winBeats = () => LIVE_BARS * 4;
  function liveWindowFor(b) { const h = st.host; const w = winBeats();
    if (h && h.loop && h.loop[1] - h.loop[0] <= w + 1e-6 && b >= h.loop[0] - 1e-6 && b < h.loop[0] + w) return Math.floor(h.loop[0] / 4) * 4;
    return Math.floor(b / w) * w; }
  function liveReset(win) { lv.win = win; if (lv.L) { lv.L.fill(0); lv.R.fill(0); } lv.filled = 0; lv.dirty = true; }
  const liveT = (b) => { if (lv.win == null || b < lv.win - 1e-6 || b >= lv.win + winBeats()) liveReset(liveWindowFor(b)); return Math.max(0, (b - lv.win) * lv.spb); };
  async function startLive() {
    const h = st.host; if (!h) { ui.msg('Waiting for the DAW...'); return; }
    if (lv.busy) return; lv.busy = true;
    try {
      const bpm = h.bpm || 120, sr = h.sr || 44100, spb = 60 / bpm; lv.bpm = bpm; lv.spb = spb; lv.sr = sr; lv.len = Math.ceil((LIVE_BARS * 4 * spb + 1) * sr);
      lv.L = new Float32Array(lv.len); lv.R = new Float32Array(lv.len);
      const buf = clk().ctx.createBuffer(2, lv.len, sr);
      await A().loadBuffer(buf, { name: 'Master (live)', title: 'Master', bpm, bpmSource: 'DAW' });
      A().regrid(bpm, 0); A().setClip(0, LIVE_BARS * 4 * spb, 'live master');
      const c = app.clip; if (!lv.origCurrent) { lv.origCurrent = c.current; let last = null;
        c.current = () => { const e = lv.origCurrent(); if (e && e.ready) { last = e; return e; } return last || e; }; }   // keep showing the last analysed window while the next is measured
      if (st.cap) { const o = ui.layerVals(); A().setProp('video.on', true); A().setProp('video.opacity', o.op); A().setProp('video.blend', o.bl); A().setProp('video.target', o.tg); }   // a new track = a new cue sheet: keep the DAW window layer
      lv.on = st.live = true; liveReset(liveWindowFor(beatsAt(performance.now()))); ui.update(st); ui.msg('Master live: the visuals follow what the DAW plays.');
      if (document.getElementById('studio').hidden) A().openStudio();
    } catch (e) { console.warn(e); ui.msg('Could not start the live master: ' + e.message); } finally { lv.busy = false; }
  }
  function liveFeed(L, R, sr, w0) {
    if (!lv.on || !an.playing || !an.sr || lv.win == null) return;
    const bAtStart = hostBeatsAtIndex(w0, sr); const off = Math.round(((bAtStart - lv.win) * lv.spb) * sr), n = L.length;
    const a = Math.max(0, -off), z = Math.min(n, lv.len - off); if (z <= a) return;
    lv.L.set(L.subarray(a, z), off + a); lv.R.set(R.subarray(a, z), off + a); lv.filled = Math.max(lv.filled, off + z); lv.dirty = true;
  }
  // host PPQ of ring sample index w: anchored on the newest transport message (its beats are those of its widx)
  const hostBeatsAtIndex = (w, sr) => { const h = st.host; return (h ? h.beats : an.beats) + (w - (h ? h.widx : an.widx)) / sr * an.bps; };
  function liveRebuild(now) {
    if (!lv.on || !lv.dirty || lv.busy || now - lv.last < 700 || !an.playing) return;
    const e = lv.origCurrent && lv.origCurrent(); if (e && !e.ready) return;   // the previous window is still being measured
    lv.last = now; lv.dirty = false;
    const nb = clk().ctx.createBuffer(2, lv.len, lv.sr); nb.copyToChannel(lv.L, 0); nb.copyToChannel(lv.R, 1);
    app.store.set({ session: { buffer: nb } }); app.clip.clear(); dirty();
  }

  // ---- key from what the session plays (DAWs don't send it)
  const KEY_S = 20; let kb = null, kn = 0, ksr = 0, keyBusy = false;
  function keyFeed(L, R, sr) {
    if (keyBusy || !an.playing) return; if (!kb || sr !== ksr) { ksr = sr; kb = new Float32Array(sr * KEY_S); kn = 0; }
    const m = Math.min(L.length, kb.length - kn); for (let i = 0; i < m; i++) kb[kn + i] = 0.5 * (L[i] + R[i]); kn += m;
    if (kn >= kb.length) { keyBusy = true; setTimeout(async () => { try { const { analyzeMono } = await import('../analysis/dsp.js'); const a = analyzeMono(kb, ksr, KEY_S); const k = a && a.key; const sel = document.getElementById('sKey');
      if (k && sel && sel.value !== k) { sel.value = k; sel.dispatchEvent(new Event('change', { bubbles: true })); ui.msg('Key from the session: ' + k); } } catch (_) {} kn = 0; keyBusy = false; }, 0); }
  }

  // ---- the DAW window as a layer (cue props video.on / video.opacity / video.blend / video.target, so it is keyable and saved in presets)
  let capCv = null, capBusy = false, capFirst = true;
  function capFrame(buf) {
    if (capBusy) return; capBusy = true;
    createImageBitmap(new Blob([new Uint8Array(buf, 4)], { type: 'image/jpeg' })).then((bm) => {
      if (!capCv) capCv = document.createElement('canvas'); if (capCv.width !== bm.width || capCv.height !== bm.height) { capCv.width = bm.width; capCv.height = bm.height; }
      capCv.getContext('2d').drawImage(bm, 0, 0); bm.close(); globalThis.u2cVideoLayer = { src: capCv, w: capCv.width, h: capCv.height }; if (!an.playing) dirty();
    }).catch(() => {}).finally(() => { capBusy = false; });
  }
  function setCap(on) {
    st.cap = on; send({ t: 'cap', on, fps: 20, w: 960 });
    if (on) { if (capFirst) { capFirst = false; const S = A(); S.setProp('video.opacity', 0.6); S.setProp('video.blend', 'normal'); S.setProp('video.target', 'hero'); ui.setLayer(0.6, 'normal'); }
      A().setProp('video.on', true); ui.msg('Showing the DAW window on the hero card.'); }
    else { A().setProp('video.on', false); globalThis.u2cVideoLayer = null; ui.msg('DAW image off.'); }
    ui.update(st); dirty();
  }

  // ---- transport
  let pending = null;   // the freshest transport message, applied once per frame (a burst after a busy frame collapses into its newest)
  function onTransport(h) { h.rx = performance.now(); pending = h; if (!st.host) apply(h); }
  function apply(h) {
    const was = an.playing; st.host = h; anchor(h); ui.update(st);
    if (h.bpm) { if (lv.on) { if (Math.abs(h.bpm - lv.bpm) > 0.05 && !lv.busy) startLive(); }
      else if (trk() && A().setBpm && h.bpm >= 40 && h.bpm <= 250 && Math.abs(h.bpm - trk().bpm) > 0.01 && !app.store.session.exporting) { try { A().setBpm(Math.round(h.bpm * 1000) / 1000); } catch (_) {} } }   // also after a re-analysis replaced the track
    if (was && !h.playing) { release(); releaseNotes(); }
  }
  // host stopped: hand the clock back, at the position we were at, so the intro / sphere / scrubbing work as in the web app
  let following = false;
  function release() { if (!following) return; following = false; const t = clk().time(); clk().setManual(null); clk().seek(t); dirty(); }
  function tick(now) {
    requestAnimationFrame(tick);
    if (pending) { const h = pending; pending = null; apply(h); }
    if (app.store.session.exporting) { liveState().on = false; return; }
    if (st.follow && an.playing && trk()) {
      const b = beatsAt(now) + st.lat / 1000 * an.bps;
      clk().setManual(Math.max(0, lv.on ? liveT(b) : beatsToT(b))); following = true; dirty();
    } else release();
    liveRebuild(now);
    if (pv.blanked && an.playing) pv.blank(false);
  }
  requestAnimationFrame(tick);
  const pv = createPreview(app);
  // a new track / re-analysis replaces the cue sheet and drops the layer's props: while the DAW image is on, put them back from the panel's values
  { let busy = false; app.cues.subscribe(() => { if (!st.cap || busy) return; let on = true; try { on = app.cues.ev().value('video.on', 0, false) === true; } catch (_) {} if (on) return;
    busy = true; try { const o = ui.layerVals(); A().setProp('video.on', true); A().setProp('video.opacity', o.op); A().setProp('video.blend', o.bl); A().setProp('video.target', o.tg); } catch (_) {} finally { busy = false; } }); }
  function connect() {
    ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
    ws.onopen = () => { st.connected = true; retry = 0; ui.update(st); send({ t: 'recordings' }); if (!st.layerAsked) { st.layerAsked = true; let seen = false; try { seen = localStorage.getItem('u2c.daw.layer') === '1'; localStorage.setItem('u2c.daw.layer', '1'); } catch (_) {} if (!seen) { let stable = 0; const iv = setInterval(() => { if (st.cap) clearInterval(iv); else if (trk() && app.cues && st.host && (!st.host.bpm || Math.abs(trk().bpm - st.host.bpm) < 0.05) && ++stable >= 5) { clearInterval(iv); try { setCap(true); ui.setLayerShown(true); } catch (_) {} } else if (!trk() || !st.host) stable = 0; }, 400); } } if (st.cap) send({ t: 'cap', on: true, fps: 20, w: 960 }); send({ t: 'windows' }); try { const w = +localStorage.getItem('u2c.daw.win'); if (w) send({ t: 'pick_window', id: w }); } catch (_) {} };
    ws.onclose = () => { st.connected = false; ui.update(st); release(); setTimeout(connect, Math.min(5000, 500 * ++retry)); };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') { let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.t === 'transport') onTransport(m);
        else if (m.t === 'hits') onHits(m);
        else if (m.t === 'meters') onMeters(m);
        else if (m.t === 'midi') onMidi(m);
        else if (m.t === 'sends') onSends(m.list || []);
        else if (m.t === 'windows') ui.setWindows(m.list || []);
        else if (m.t === 'cap_status') { st.capMsg = m.msg; if (m.msg !== 'ok') ui.msg('DAW image: ' + m.msg.replace(/^(permission|error): /, '')); }
        else if (m.t === 'saved') { if (saveDone) saveDone(m.path); }
        else if (m.t === 'recordings') ui.setRecs(m.list || []); }
      else if (e.data.byteLength > 4) { const tg = tagOf(e.data); if (tg === 'JPG0') capFrame(e.data); else if (tg === 'PCM0') onPcm(e.data); }
    };
  }
  // ---- live hits: the plugin stamps each with the sample index of the onset; its age is (newest sample - pos) / sr
  function onHits(m) {
    const h = st.host, now = performance.now(), sr = an.sr || 44100;
    const newest = h ? h.widx + (an.playing ? (now - h.rx) / 1000 * sr : 0) : m.pos, age = Math.max(0, Math.min(500, (newest - m.pos) / sr * 1000));
    liveState().on = !app.store.session.exporting; addHit(m, now - age - st.lat); if (!an.playing) dirty();
  }
  // ---- native meters: the plugin's exact values are written into the analysed clip at the live position (frame M / S / TP / corr / width / spec,
  // and the 1 ms level blocks), so every meter view reads real-time values at the playhead; the 4-bar analysis only supplies the history.
  const wr = { f: -1, b: -1 };
  function onMeters(m) {
    liveState().mt = m; liveState().mtAt = performance.now();
    if (REF.cur && m.spec) { refUpdate(OCT6, m.spec); ui.refLevels(); }
    ui.flMeter(m.fl);
    if (!lv.on || lv.win == null) return;
    const e = app.clip.current(), D = e && e.D; if (!D || !D.frame) return;   // current() keeps showing the last analysed window while the next one is measured
    const t = (m.beats - lv.win) * lv.spb; if (!(t >= 0) || t >= winBeats() * lv.spb) return;
    const F = D.frame, f = Math.min(D.frames - 1, Math.floor(t * D.fps)), f0 = wr.f >= 0 && f - wr.f > 0 && f - wr.f <= 4 ? wr.f + 1 : f;
    for (let g = f0; g <= f; g++) {
      F.M[g] = m.momentary; F.S[g] = m.short; F.TP[g] = Math.max(g ? F.TP[g - 1] : -99, m.tp); F.corr[g] = m.corr; F.width[g] = m.width;
      for (let i = 0; i < 61; i++) { const v = Math.max(-99, Math.min(0, m.spec[i])); F.spec[g * 61 + i] = Math.round(v); F.hold[g * 61 + i] = Math.round(Math.max(v, g ? F.hold[(g - 1) * 61 + i] - 24 / D.fps : v)); } }
    wr.f = f; const L = D.lv;
    if (L) { const b1 = Math.min(L.n - 1, Math.floor(t * L.rate)), b0 = wr.b >= 0 && b1 - wr.b > 0 && b1 - wr.b <= 200 ? wr.b + 1 : b1, lin = (d) => Math.pow(10, d / 20);
      for (let b = b0; b <= b1; b++) { L.pkL[b] = lin(m.peakL); L.pkR[b] = lin(m.peakR); L.msL[b] = lin(m.rmsL) ** 2; L.msR[b] = lin(m.rmsR) ** 2; L.clipL[b] = m.peakL >= -0.01 ? 1 : 0; L.clipR[b] = m.peakR >= -0.01 ? 1 : 0; } wr.b = b1; }
    if (!an.playing) dirty();
  }
  // ---- MIDI notes: placed by sample index like hits; held notes end when the host stops (a note-off after stop still lands)
  function onMidi(m) {
    const h = st.host, now = performance.now(), sr = an.sr || 44100;
    const newest = h ? h.widx + (an.playing ? (now - h.rx) / 1000 * sr : 0) : m.pos, age = Math.max(0, Math.min(500, (newest - m.pos) / sr * 1000)), at = now - age - st.lat;
    liveState().on = !app.store.session.exporting; addMidi(m, at);
    if (app.mpc) app.mpc.midi(m);
    if (m.on) { let tg = 'off'; try { tg = app.cues.ev().value('midi.pulse', 0, 'off'); } catch (_) {} if (tg === 'kick' || tg === 'snare' || tg === 'hat') addHit({ [tg]: Math.max(0.5, m.vel) }, at); }
    if (!an.playing) dirty();
  }
  // ---- U2C Send plugins: one entry per DAW track, with a target assigned here (kept per browser profile)
  let sendCfg = {}; try { sendCfg = JSON.parse(localStorage.getItem('u2c.daw.sends') || '{}') || {}; } catch (_) {}
  let lastIds = '';
  function onSends(list) {
    liveState().on = !app.store.session.exporting; updateSends(list, sendCfg); st.sends = list;
    const ids = list.map((e) => e.id).sort().join(); if (ids !== lastIds) { lastIds = ids; ui.setSends(list, sendCfg); }
    ui.sendLevels(list); if (!an.playing) dirty();
  }
  ui.onSend = (id, patch) => { sendCfg[id] = { ...(sendCfg[id] || {}), ...patch }; try { localStorage.setItem('u2c.daw.sends', JSON.stringify(sendCfg)); } catch (_) {} if (st.sends) { updateSends(st.sends, sendCfg); ui.sendLevels(st.sends); } dirty(); };
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  function onPcm(buf) {
    const dv = new DataView(buf), sr = dv.getUint32(4, true), n = dv.getUint32(8, true), w0 = dv.getFloat64(12, true); if (!n || buf.byteLength < 20 + n * 8) return;
    const L = new Float32Array(buf, 20, n), R = new Float32Array(buf, 20 + n * 4, n);
    if (st.rec) st.rec.onPcm(L, R, sr); liveFeed(L, R, sr, w0); keyFeed(L, R, sr);
  }
  setInterval(() => { if (ws && ws.readyState === 1 && (st.rec || an.playing)) ws.send('{"t":"pull"}'); }, 50);
  connect();

  // ---- Record: the visual output (canvas.captureStream) + the live master audio. No screen-capture permission involved.
  let saveDone = null;
  async function startRecord() {
    if (st.rec) return;
    if (document.getElementById('studio').hidden) A().openStudio();
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) { ui.msg('This webview cannot record the canvas. Use "Open in browser".'); return; }
    const P = app.store.project, spec = recordSpec(P.aspect, st.rq, st.rfps), off = startOffscreen(app, spec, ({ fps, drops }) => {
      ui.msg(`Recording ${spec.W}x${spec.H} at ${fps.toFixed(0)} fps` + (fps < spec.fps * 0.9 ? (spec.W > 2000 ? ' - this computer drops frames at 4K in real time: choose 1080p.' : ' - dropping frames: choose 30 fps.') : ''));
      if (st.rec) st.rec.fps = fps; });
    const ac = new AudioContext(), dest = ac.createMediaStreamDestination(); let next = 0; try { await ac.resume(); } catch (_) {}
    const onPcm2 = (L, R, sr) => {
      const ab = ac.createBuffer(2, L.length, sr); ab.copyToChannel(L, 0); ab.copyToChannel(R, 1);
      const s = ac.createBufferSource(); s.buffer = ab; s.connect(dest);
      const now = ac.currentTime + 0.08; if (next < now) next = now; s.start(next); next += L.length / sr;
    };
    const stream = new MediaStream([...off.stream.getVideoTracks(), ...dest.stream.getAudioTracks()]), mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: spec.mbps * 1e6, audioBitsPerSecond: 256e3 } : { videoBitsPerSecond: spec.mbps * 1e6 }), chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      ac.close(); off.stop(); const fin = st.rec ? st.rec.fps : 0; st.rec = null; ui.update(st);
      const type = mr.mimeType || 'video/webm', blob = new Blob(chunks, { type }), ext = /mp4/.test(type) ? 'mp4' : 'webm', name = `u2c-daw-${spec.W}x${spec.H}-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      if (ws && ws.readyState === 1) {   // the plugin writes the file (a webview cannot download): ~/Movies/U2C Studio
        send({ t: 'save_begin', name }); const CH = 1 << 20; for (let i = 0; i < blob.size; i += CH) ws.send(await blob.slice(i, i + CH).arrayBuffer());
        const p = await new Promise((res) => { saveDone = res; send({ t: 'save_end' }); setTimeout(() => res(null), 15000); }); saveDone = null;
        if (p) { ui.msg(`Saved ${spec.W}x${spec.H} ${fin ? fin.toFixed(0) + ' fps ' : ''}${p}`); ui.setRecs(st.recs || [], name); return; } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); ui.msg('Saved ' + name);
    };
    st.rec = { mr, onPcm: onPcm2, spec, fps: 0 }; mr.start(1000); ui.update(st); ui.msg(`Recording ${spec.W}x${spec.H} at ${spec.fps} fps with the master audio. Press play in the DAW.`);
  }
  const stopRecord = () => { if (st.rec && st.rec.mr.state !== 'inactive') st.rec.mr.stop(); };

  ui.onRecord = () => (st.rec ? stopRecord() : startRecord());
  ui.onFollow = (v) => { st.follow = v; if (!v) release(); };
  ui.onLive = () => startLive();
  ui.onCap = (v) => setCap(v);
  ui.onWindows = () => send({ t: 'windows' });
  ui.onPickWindow = (id) => { send({ t: 'pick_window', id: +id || 0 }); try { localStorage.setItem('u2c.daw.win', String(id)); } catch (_) {} };
  ui.onLayer = (op, bl, commit) => { A().setProp('video.opacity', op, !commit); A().setProp('video.blend', bl, !commit); dirty(); };
  ui.onProp = (p, v) => { A().setProp(p, v); dirty(); };
  ui.onLat = (v) => { st.lat = v; };
  ui.onRefFile = async (file) => { try { const list = await importReferences(await file.text()); ui.renderRefs(); ui.msg(`Reference: ${list.length} genres imported (kept in this browser only).`); } catch (e) { ui.msg('Reference: ' + (e && e.message || e)); } };
  ui.onRefAdd = (name) => { addShow(name); saveRefs(); ui.renderRefs(); dirty(); };
  ui.onRefRemove = (name) => { removeShow(name); saveRefs(); ui.renderRefs(); dirty(); };
  ui.onRefColor = (name, c) => { setColor(name, c); saveRefs(); dirty(); };
  initReferences().then(() => ui.renderRefs()); window.addEventListener('u2c-refs', () => { ui.renderRefs(); ui.msg('Reference added from your audio.'); dirty(); });
  function applyPlan(c) {
    if (!c) return; try { localStorage.setItem('u2c.live.setup', JSON.stringify(c)); } catch (_) {}
    const plan = planFor(c); for (const [k, v] of Object.entries(plan.props)) { try { A().setProp(k, v); } catch (_) {} }
    st.follow = plan.follow; ui.setFollow(plan.follow); if (plan.pres === 'daw') { try { setCap(true); ui.setLayerShown(true); } catch (_) {} } dirty();
    pv.blank(plan.blank && !an.playing); if (plan.preview) pv.start();
  }
  ui.onPreview = () => { if (!pv.start()) ui.msg('Load a beat first (Receive audio from: Master).'); };
  ui.onLiveSetup = () => { let saved = {}; try { saved = JSON.parse(localStorage.getItem('u2c.live.setup') || '{}') || {}; } catch (_) {} showCard(app, applyPlan, saved); };
  { let seen = true; try { seen = localStorage.getItem('u2c.live.setup') != null; } catch (_) {} if (!seen && document.querySelector('meta[name=u2c-daw-ws]')) setTimeout(() => ui.onLiveSetup(), 600); }
  ui.onNudge = (d) => { st.lat += d; ui.setLat(st.lat); };
  ui.onReveal = (name) => send({ t: 'reveal', name });
  ui.onRq = (q, f) => { st.rq = q; st.rfps = f; };
  ui.onBrowser = () => { send({ t: 'open_browser' }); ui.msg('Opened U2C Studio in your browser.'); };
  const api = { state: st, startRecord, stopRecord, startLive, send, live: lv, setCap, layer: (on) => { setCap(on); ui.setLayerShown(on); }, preview: pv, applyPlan, liveSetup: () => ui.onLiveSetup() };
  app.daw = api; return api;
}

function mountUi(st) {
  // plugin mode: the home screen's "Choose audio" becomes "Receive audio from: Master"
  const lab = document.querySelector('label[for=file]'), hint = lab && lab.parentElement && lab.parentElement.querySelector('.hint');
  let big = null;
  if (lab) { big = document.createElement('button'); big.className = 'btn primary'; big.id = 'liveBtn'; big.textContent = 'Receive audio from: Master'; lab.after(big); lab.hidden = true; if (hint) hint.textContent = 'U2C Studio sits on your master: press play in the DAW and every visual follows it live.'; }
  const el = document.createElement('div'); el.id = 'u2cDaw';
  el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;font:12px/1.3 ui-monospace,monospace;background:#111d;color:#eee;border:1px solid #555;border-radius:8px;padding:8px 10px;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;max-width:min(560px,92vw);backdrop-filter:blur(6px)';
  el.innerHTML = '<style>#u2cDaw{font-size:13px!important;max-width:min(720px,94vw)!important;max-height:78vh;overflow:auto}#u2cDaw select,#u2cDaw input[type=number],#u2cDaw input:not([type]){background:#262626;color:#eee;border:1px solid #666;border-radius:4px;padding:3px 5px;font:inherit}#u2cDaw button{background:#2c2c2c;color:#eee;border:1px solid #777;border-radius:5px;padding:4px 10px;font:inherit}#u2cDaw button:hover{background:#3a3a3a}#u2cDaw .g{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;border-top:1px solid #444;padding-top:6px}#u2cDaw .g>h4{flex-basis:100%;margin:0;font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;opacity:.65}</style>' +
    '<div class="g" style="border:0;padding:0"><b data-mode style="letter-spacing:.06em"></b><span data-s>DAW: connecting</span><button data-pv title="Play the current setup, intro included, without the DAW (click or Esc to stop)">Preview</button><button data-lc title="Presentation, motion and start">Live setup</button></div>' +
    '<div class="g"><h4>Source</h4><label title="Follow the DAW transport while it plays"><input type="checkbox" data-f checked> follow</label><button data-l>Master live</button><canvas data-fl width="150" height="22" title="Master peak / RMS / held peak (FL mixer style)" style="width:150px;height:22px"></canvas>' +
    '<span data-sends style="flex-basis:100%;display:none"></span></div>' +
    '<div class="g"><h4>Picture</h4><label title="Show the DAW window as a layer (also + Layer, DAW window)"><input type="checkbox" data-c> DAW image</label><select data-vt title="Where the DAW window goes"><option value="hero">hero card</option><option value="full">full background</option><option value="pip">corner picture</option></select>' +
    '<label>opacity <input type="range" data-o min="0" max="100" value="60" style="width:80px;vertical-align:middle"></label><select data-b><option>normal</option><option>screen</option><option>multiply</option></select><select data-w title="Which window to show" style="max-width:180px"><option value="0">window: DAW (auto)</option></select><button data-wr title="Refresh the window list">↻</button>' +
    '<span data-hits style="flex-basis:100%">hits: ' + ['kick', 'snare', 'hat'].map((k) => `<label><input type="checkbox" data-hk="${k}" checked> ${k}</label> <input type="range" data-ha="${k}" min="0" max="200" value="100" style="width:60px;vertical-align:middle" title="${k} amount">`).join(' ') + '</span>' +
    '<span data-midi style="flex-basis:100%">midi: <label><input type="checkbox" data-mk checked> layer</label> <select data-ms><option>roll</option><option>pads</option></select> <label>opacity <input type="range" data-mo min="0" max="100" value="85" style="width:60px;vertical-align:middle"></label> <label>pulse <select data-mp><option>off</option><option>kick</option><option>snare</option><option>hat</option></select></label></span>' +
    '<span data-ref style="flex-basis:100%">reference: <label class="btn" style="cursor:pointer;text-decoration:underline">import<input type="file" data-rf accept=".txt,.json,application/json,text/plain" hidden></label> <select data-rg style="max-width:160px"><option value="">add reference…</option></select> <span data-rs></span> <span data-rd></span> <span style="opacity:.6">drop audio here to make your own</span></span></div>' +
    '<div class="g"><h4>Motion</h4><label title="Shift the visuals against the DAW (ms)">sync <button data-tm title="-10 ms">−</button> <input type="number" data-t value="0" step="10" style="width:64px"> ms <button data-tp title="+10 ms">+</button></label></div>' +
    '<div class="g"><h4>Record</h4><label>size <select data-rq><option value="1080p">1080p</option><option value="4k">4K</option></select> <select data-rfp><option value="30">30 fps</option><option value="60">60 fps</option></select></label><button data-r>Record DAW</button><span data-recs style="flex-basis:100%"></span></div>' +
    '<span data-m style="flex-basis:100%;opacity:.85"></span>';
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  const ui = {
    onProp() {}, onPreview() {}, onLiveSetup() {}, onNudge() {}, onReveal() {}, onRq() {}, onSend() {}, onRefFile() {}, onRefAdd() {}, onRefRemove() {}, onRefColor() {}, onRecord() {}, onFollow() {}, onLive() {}, onCap() {}, onLayer() {}, onWindows() {}, onPickWindow() {}, onLat() {}, onBrowser() {},
    update(s) { const h = s.host, ts = h && h.ts ? h.ts.join('/') : '4/4', bar = h ? Math.floor(h.beats / 4) + 1 : 0, lp = h && h.loop ? ` loop ${(h.loop[0] / 4 + 1).toFixed(0)}-${(h.loop[1] / 4 + 1).toFixed(0)}` : '';
      q('[data-mode]').textContent = s.live ? 'LIVE' : s.connected ? 'DAW' : 'OFFLINE'; q('[data-mode]').style.color = s.live ? '#ff5d5d' : '#9ad';
      q('[data-s]').textContent = s.connected ? (h ? `${h.playing ? 'play' : 'stop'} ${h.bpm.toFixed(1)} BPM ${ts} bar ${bar}.${(Math.floor(h.beats % 4) + 1)}${lp}` : 'connected') : 'connecting';
      q('[data-r]').textContent = s.rec ? 'Stop + save' : 'Record DAW'; q('[data-l]').disabled = s.live; q('[data-l]').textContent = s.live ? 'Master: on' : 'Master live'; if (big) { big.disabled = s.live; big.textContent = s.live ? 'Receiving: Master' : 'Receive audio from: Master'; } },
    msg(t) { q('[data-m]').textContent = t; if (typeof document !== 'undefined') { const s = document.getElementById('status'); if (s && big) s.textContent = t; } },
    setWindows(list) { const sel = q('[data-w]'), cur = sel.value; sel.innerHTML = '<option value="0">window: DAW (auto)</option>' + list.filter((w) => !w.ours || !/U2C/.test(w.title)).map((w) => `<option value="${w.id}">${String(w.app || '').replace(/</g, '')}${w.title ? ' · ' + String(w.title).replace(/</g, '').slice(0, 40) : ''}</option>`).join(''); sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '0'; },
    setSends(list, cfg) { const box = q('[data-sends]'); box.style.display = list.length ? '' : 'none'; const esc = (x) => String(x == null ? '' : x).replace(/[<>&"]/g, '');
      box.innerHTML = 'sends: ' + list.map((e) => { const c = cfg[e.id] || {}; return `<span data-id="${esc(e.id)}" style="display:inline-flex;gap:4px;align-items:center;margin-right:8px"><input type="color" data-sc value="${/^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#9ad9ff'}" style="width:18px;height:18px;padding:0;border:0"><input data-sn value="${esc(c.name || e.name)}" size="9" title="Name this send"><select data-st>${SEND_TARGETS.map((t) => `<option${t === (c.target || 'off') ? ' selected' : ''}>${t}</option>`).join('')}</select><input type="number" data-so value="${+c.off || 0}" step="10" style="width:46px" title="Offset (ms)"><i data-sl style="display:inline-block;width:34px;height:6px;background:#555;vertical-align:middle"><b style="display:block;height:6px;width:0;background:#9ad"></b></i></span>`; }).join(''); },
    sendLevels(list) { for (const e of list) { const r = q(`[data-sends] [data-id="${String(e.id).replace(/[^a-z0-9]/gi, '')}"] [data-sl] b`); if (r) r.style.width = Math.round(Math.min(1, (e.rms || 0) * 3) * 100) + '%'; } },
    renderRefs() { const sel = q('[data-rg]'), g = REF.list.map((r) => r.name), u = REF.user.map((r) => r.name), e = (x) => String(x).replace(/[<>&"]/g, '');
      sel.innerHTML = '<option value="">add reference…</option>' + (g.length ? '<optgroup label="Genres">' + g.map((n) => `<option>${e(n)}</option>`).join('') + '</optgroup>' : '') + (u.length ? '<optgroup label="Yours">' + u.map((n) => `<option>${e(n)}</option>`).join('') + '</optgroup>' : '');
      q('[data-rs]').innerHTML = shown().map((x) => `<span data-rn="${e(x.name)}" style="white-space:nowrap"><input type="color" data-rc value="${/^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#ffffff'}" style="width:18px;height:18px;padding:0;border:0"> ${e(x.name)} <button data-rx style="cursor:pointer">×</button></span>`).join(' '); },
    flMeter(fl) { const cv = q('[data-fl]'); if (!cv || !fl) return; const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
      const pos = (db) => Math.max(0, Math.min(1, (db + 60) / 60)); fl.slice(0, 2).forEach((c, i) => { const y = 2 + i * (H / 2), h = H / 2 - 4;
        g.fillStyle = '#ffffff18'; g.fillRect(0, y, W, h); const grad = g.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#2f8f4f'); grad.addColorStop(0.75, '#9fd24a'); grad.addColorStop(0.92, '#ffd23f'); grad.addColorStop(1, '#ff4d4d');
        g.fillStyle = grad; g.globalAlpha = 0.55; g.fillRect(0, y, W * pos(c.pk), h); g.globalAlpha = 1; g.fillRect(0, y + h * 0.25, W * pos(c.rms), h * 0.5);   // peak behind, RMS body in front
        g.fillStyle = c.clip ? '#ff4d4d' : '#fff'; g.fillRect(Math.min(W - 2, W * pos(c.hold)), y, 2, h); if (c.clip) g.fillRect(W - 5, y, 5, h); }); },
    refLevels() { const d = REF.deltas, el = q('[data-rd]'); el.innerHTML = d ? d.map((b) => `${b.name} <b style="color:${Math.abs(b.db) < 1.5 ? '#8f8' : '#fc8'}">${b.db > 0 ? '+' : ''}${b.db.toFixed(1)}</b>`).join(' · ') + ' dB' : ''; },
    layerVals() { return { op: q('[data-o]').value / 100, bl: q('[data-b]').value, tg: q('[data-vt]').value }; },
    setFollow(v) { q('[data-f]').checked = !!v; },
    setLat(v) { q('[data-t]').value = v; },
    setLayerShown(on) { q('[data-c]').checked = !!on; },
    setRecs(list, fresh) { st.recs = list; const e = (x) => String(x).replace(/[<>&"]/g, '');
      q('[data-recs]').innerHTML = list.length ? 'recordings: ' + list.slice(0, 10).map((r) => `<span style="white-space:nowrap" data-rec="${e(r.name)}">${e(r.name.replace(/^u2c-daw-/, ''))} <button data-show style="cursor:pointer">Show in Finder</button></span>`).join(' ') : ''; },
    setLayer(op, bl) { q('[data-o]').value = Math.round(op * 100); q('[data-b]').value = bl; q('[data-c]').checked = true; },
  };
  q('[data-w]').addEventListener('change', (e) => ui.onPickWindow(e.target.value));
  q('[data-w]').addEventListener('focus', () => ui.onWindows());
  q('[data-wr]').addEventListener('click', () => ui.onWindows());
  const layer = (commit) => () => ui.onLayer(q('[data-o]').value / 100, q('[data-b]').value, commit);
  q('[data-r]').onclick = () => ui.onRecord(); q('[data-f]').onchange = (e) => ui.onFollow(e.target.checked); q('[data-l]').onclick = () => ui.onLive();
  q('[data-c]').onchange = (e) => ui.onCap(e.target.checked); q('[data-o]').oninput = layer(false); q('[data-o]').onchange = layer(true); q('[data-b]').onchange = layer(true);
  for (const k of ['kick', 'snare', 'hat']) { q(`[data-hk=${k}]`).onchange = (e) => ui.onProp(`live.${k}.on`, e.target.checked); q(`[data-ha=${k}]`).onchange = (e) => ui.onProp(`live.${k}.amt`, e.target.value / 100); }
  q('[data-mk]').onchange = (e) => ui.onProp('midi.on', e.target.checked); q('[data-ms]').onchange = (e) => ui.onProp('midi.style', e.target.value); q('[data-mo]').onchange = (e) => ui.onProp('midi.opacity', e.target.value / 100); q('[data-mp]').onchange = (e) => ui.onProp('midi.pulse', e.target.value);
  const sendRow = (e) => { const row = e.target.closest('[data-id]'); return row ? row.dataset.id : null; };
  q('[data-sends]').addEventListener('change', (e) => { const id = sendRow(e); if (!id) return; const t = e.target;
    if (t.matches('[data-st]')) ui.onSend(id, { target: t.value }); else if (t.matches('[data-sn]')) ui.onSend(id, { name: t.value.slice(0, 24) }); else if (t.matches('[data-so]')) ui.onSend(id, { off: +t.value || 0 }); else if (t.matches('[data-sc]')) ui.onSend(id, { color: t.value }); });
  q('[data-rf]').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) ui.onRefFile(f); }; q('[data-rg]').onchange = (e) => { if (e.target.value) ui.onRefAdd(e.target.value); e.target.value = ''; };
  q('[data-rs]').addEventListener('input', (e) => { const r = e.target.closest('[data-rn]'); if (r && e.target.matches('[data-rc]')) ui.onRefColor(r.dataset.rn, e.target.value); });
  q('[data-rs]').addEventListener('click', (e) => { const r = e.target.closest('[data-rn]'); if (r && e.target.matches('[data-rx]')) ui.onRefRemove(r.dataset.rn); });
  q('[data-recs]').addEventListener('click', (e) => { const r = e.target.closest('[data-rec]'); if (r && e.target.matches('[data-show]')) ui.onReveal(r.dataset.rec); });
  q('[data-rq]').onchange = q('[data-rfp]').onchange = () => ui.onRq(q('[data-rq]').value, +q('[data-rfp]').value);
  q('[data-vt]').onchange = (e) => ui.onProp('video.target', e.target.value);
  q('[data-pv]').onclick = () => ui.onPreview(); q('[data-lc]').onclick = () => ui.onLiveSetup(); q('[data-tm]').onclick = () => ui.onNudge(-10); q('[data-tp]').onclick = () => ui.onNudge(10);
  q('[data-t]').onchange = (e) => ui.onLat(+e.target.value || 0);
  if (big) big.onclick = () => ui.onLive();
  return ui;
}
