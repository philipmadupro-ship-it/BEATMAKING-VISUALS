// DAW bridge. Active only with ?daw=ws://127.0.0.1:PORT, or when the page is served by the U2C plugin (meta u2c-daw-ws).
// Wire (localhost WebSocket): text {t:"transport", bpm, beats, widx, playing, ts:[n,d], loop:[a,b]|null, rms, peak, sr} (beats = host PPQ
// of the newest audio sample); client {t:"pull"} -> binary "PCM0" [u32 sr][u32 n][f64 first sample index][f32 L*n][f32 R*n];
// client {t:"cap", on, fps, w} -> binary "JPG0"+jpeg frames of the DAW window; client {t:"save_begin", name} + binary chunks + {t:"save_end"}.
// Clock: while the host PLAYS, the app follows the host PPQ, interpolated every animation frame from the last transport message.
// While it is STOPPED the app runs its own clock (intro, sphere pick, scrub: exactly as in the web app).
// "Receive audio from: Master": the live stereo master is written into a bar-aligned window (4 bars), analysed like a file in the
// worker, and shown by the unchanged film; a looping DAW is exact from the second pass, a linear one trails by the analysis time.
const LIVE_BARS = 4;
const tagOf = (buf) => String.fromCharCode(...new Uint8Array(buf, 0, 4));

export async function initDaw(app) {
  let url = null;
  try { url = new URLSearchParams(location.search).get('daw'); } catch (_) {}
  if (!url) { const m = document.querySelector('meta[name=u2c-daw-ws]'); if (m) url = `ws://${location.hostname}:${m.content}`; }   // injected by the plugin's HTTP server
  if (!url) return null;
  const st = { url, connected: false, host: null, follow: true, rec: null, live: false, cap: false, capMsg: '', lat: 0, saved: '' };
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
    if (was && !h.playing) release();
  }
  // host stopped: hand the clock back, at the position we were at, so the intro / sphere / scrubbing work as in the web app
  let following = false;
  function release() { if (!following) return; following = false; const t = clk().time(); clk().setManual(null); clk().seek(t); dirty(); }
  function tick(now) {
    requestAnimationFrame(tick);
    if (pending) { const h = pending; pending = null; apply(h); }
    if (app.store.session.exporting) { return; }
    if (st.follow && an.playing && trk()) {
      const b = beatsAt(now) + st.lat / 1000 * an.bps;
      clk().setManual(Math.max(0, lv.on ? liveT(b) : beatsToT(b))); following = true; dirty();
    } else release();
    liveRebuild(now);
  }
  requestAnimationFrame(tick);
  function connect() {
    ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
    ws.onopen = () => { st.connected = true; retry = 0; ui.update(st); if (st.cap) send({ t: 'cap', on: true, fps: 20, w: 960 }); };
    ws.onclose = () => { st.connected = false; ui.update(st); release(); setTimeout(connect, Math.min(5000, 500 * ++retry)); };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') { let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.t === 'transport') onTransport(m);
        else if (m.t === 'cap_status') { st.capMsg = m.msg; if (m.msg !== 'ok') ui.msg('DAW image: ' + m.msg.replace(/^(permission|error): /, '')); }
        else if (m.t === 'saved') { if (saveDone) saveDone(m.path); } }
      else if (e.data.byteLength > 4) { const tg = tagOf(e.data); if (tg === 'JPG0') capFrame(e.data); else if (tg === 'PCM0') onPcm(e.data); }
    };
  }
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
    const cv = document.getElementById('view');
    if (!cv || !cv.captureStream || typeof MediaRecorder === 'undefined') { ui.msg('This webview cannot record the canvas. Use "Open in browser".'); return; }
    const ac = new AudioContext(), dest = ac.createMediaStreamDestination(); let next = 0; try { await ac.resume(); } catch (_) {}
    const onPcm2 = (L, R, sr) => {
      const ab = ac.createBuffer(2, L.length, sr); ab.copyToChannel(L, 0); ab.copyToChannel(R, 1);
      const s = ac.createBufferSource(); s.buffer = ab; s.connect(dest);
      const now = ac.currentTime + 0.08; if (next < now) next = now; s.start(next); next += L.length / sr;
    };
    const vid = cv.captureStream(30), stream = new MediaStream([...vid.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 10e6, audioBitsPerSecond: 192e3 } : {}), chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      ac.close(); vid.getTracks().forEach((t) => t.stop()); st.rec = null; ui.update(st);
      const type = mr.mimeType || 'video/webm', blob = new Blob(chunks, { type }), ext = /mp4/.test(type) ? 'mp4' : 'webm', name = `u2c-daw-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      if (ws && ws.readyState === 1) {   // the plugin writes the file (a webview cannot download): ~/Movies/U2C Studio
        send({ t: 'save_begin', name }); const CH = 1 << 20; for (let i = 0; i < blob.size; i += CH) ws.send(await blob.slice(i, i + CH).arrayBuffer());
        const p = await new Promise((res) => { saveDone = res; send({ t: 'save_end' }); setTimeout(() => res(null), 15000); }); saveDone = null;
        if (p) { ui.msg('Saved ' + p); return; } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); ui.msg('Saved ' + name);
    };
    st.rec = { mr, onPcm: onPcm2 }; mr.start(1000); ui.update(st); ui.msg('Recording the visuals with the master audio. Press play in the DAW.');
  }
  const stopRecord = () => { if (st.rec && st.rec.mr.state !== 'inactive') st.rec.mr.stop(); };

  ui.onRecord = () => (st.rec ? stopRecord() : startRecord());
  ui.onFollow = (v) => { st.follow = v; if (!v) release(); };
  ui.onLive = () => startLive();
  ui.onCap = (v) => setCap(v);
  ui.onLayer = (op, bl, commit) => { A().setProp('video.opacity', op, !commit); A().setProp('video.blend', bl, !commit); dirty(); };
  ui.onLat = (v) => { st.lat = v; };
  ui.onBrowser = () => { send({ t: 'open_browser' }); ui.msg('Opened U2C Studio in your browser.'); };
  const api = { state: st, startRecord, stopRecord, startLive, send, live: lv };
  app.daw = api; return api;
}

function mountUi(st) {
  // plugin mode: the home screen's "Choose audio" becomes "Receive audio from: Master"
  const lab = document.querySelector('label[for=file]'), hint = lab && lab.parentElement && lab.parentElement.querySelector('.hint');
  let big = null;
  if (lab) { big = document.createElement('button'); big.className = 'btn primary'; big.id = 'liveBtn'; big.textContent = 'Receive audio from: Master'; lab.after(big); lab.hidden = true; if (hint) hint.textContent = 'U2C Studio sits on your master: press play in the DAW and every visual follows it live.'; }
  const el = document.createElement('div'); el.id = 'u2cDaw';
  el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;font:12px/1.3 ui-monospace,monospace;background:#111d;color:#eee;border:1px solid #555;border-radius:8px;padding:8px 10px;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;max-width:min(560px,92vw);backdrop-filter:blur(6px)';
  el.innerHTML = '<b data-mode style="letter-spacing:.06em"></b><span data-s>DAW: connecting</span><label title="Follow the DAW transport while it plays"><input type="checkbox" data-f checked> follow</label>' +
    '<button data-l style="cursor:pointer">Master live</button><label title="Show the DAW window on the hero card"><input type="checkbox" data-c> DAW image</label>' +
    '<label>opacity <input type="range" data-o min="0" max="100" value="60" style="width:70px;vertical-align:middle"></label><select data-b><option>normal</option><option>screen</option><option>multiply</option></select>' +
    '<label title="Shift the visuals against the DAW (ms)">sync <input type="number" data-t value="0" step="10" style="width:52px"></label><button data-r style="cursor:pointer">Record DAW</button><span data-m style="flex-basis:100%;opacity:.8"></span>';
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  const ui = {
    onRecord() {}, onFollow() {}, onLive() {}, onCap() {}, onLayer() {}, onLat() {}, onBrowser() {},
    update(s) { const h = s.host, ts = h && h.ts ? h.ts.join('/') : '4/4', bar = h ? Math.floor(h.beats / 4) + 1 : 0, lp = h && h.loop ? ` loop ${(h.loop[0] / 4 + 1).toFixed(0)}-${(h.loop[1] / 4 + 1).toFixed(0)}` : '';
      q('[data-mode]').textContent = s.live ? 'LIVE' : s.connected ? 'DAW' : 'OFFLINE'; q('[data-mode]').style.color = s.live ? '#ff5d5d' : '#9ad';
      q('[data-s]').textContent = s.connected ? (h ? `${h.playing ? 'play' : 'stop'} ${h.bpm.toFixed(1)} BPM ${ts} bar ${bar}.${(Math.floor(h.beats % 4) + 1)}${lp}` : 'connected') : 'connecting';
      q('[data-r]').textContent = s.rec ? 'Stop + save' : 'Record DAW'; q('[data-l]').disabled = s.live; q('[data-l]').textContent = s.live ? 'Master: on' : 'Master live'; if (big) { big.disabled = s.live; big.textContent = s.live ? 'Receiving: Master' : 'Receive audio from: Master'; } },
    msg(t) { q('[data-m]').textContent = t; if (typeof document !== 'undefined') { const s = document.getElementById('status'); if (s && big) s.textContent = t; } },
    setLayer(op, bl) { q('[data-o]').value = Math.round(op * 100); q('[data-b]').value = bl; q('[data-c]').checked = true; },
  };
  const layer = (commit) => () => ui.onLayer(q('[data-o]').value / 100, q('[data-b]').value, commit);
  q('[data-r]').onclick = () => ui.onRecord(); q('[data-f]').onchange = (e) => ui.onFollow(e.target.checked); q('[data-l]').onclick = () => ui.onLive();
  q('[data-c]').onchange = (e) => ui.onCap(e.target.checked); q('[data-o]').oninput = layer(false); q('[data-o]').onchange = layer(true); q('[data-b]').onchange = layer(true);
  q('[data-t]').onchange = (e) => ui.onLat(+e.target.value || 0);
  if (big) big.onclick = () => ui.onLive();
  return ui;
}
