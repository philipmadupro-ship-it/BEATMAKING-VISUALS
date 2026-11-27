// DAW bridge. Active only with ?daw=ws://127.0.0.1:PORT, or when the page is served by the U2C plugin (meta u2c-daw-ws).
// Receives host transport {bpm, playing, beats, rms, peak, sr} over a localhost WebSocket, drives the preview
// playhead from it, and offers "Record DAW" (screen via getDisplayMedia + plugin audio pulled as PCM) saved as a file.
// Wire format: text JSON {t:"transport",...}; client {t:"pull"} -> binary [u32 sampleRate][u32 n][f32 mono * n] (LE).
export async function initDaw(app) {
  let url = null;
  try { url = new URLSearchParams(location.search).get('daw'); } catch (_) {}
  if (!url) { const m = document.querySelector('meta[name=u2c-daw-ws]'); if (m) url = `ws://${location.hostname}:${m.content}`; }   // injected by the plugin's HTTP server
  if (!url) return null;
  const st = { url, connected: false, host: null, follow: true, rec: null };
  const ui = mountUi(st);
  let ws, retry = 0;
  const clk = () => app.clock, trk = () => app.store.session.track;
  const beatsToT = (b, bpm) => { const tr = trk(); return tr ? tr.t0 + b * tr.spb : b * 60 / (bpm || 120); };
  function onTransport(h) {
    st.host = h; ui.update(st);
    if (!st.follow || app.store.session.exporting) return;
    const t = Math.max(0, beatsToT(h.beats, h.bpm));
    clk().setManual(t); if (app.studio && app.studio.markDirty) app.studio.markDirty();
  }
  function connect() {
    ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
    ws.onopen = () => { st.connected = true; retry = 0; ui.update(st); };
    ws.onclose = () => { st.connected = false; ui.update(st); if (st.follow && !app.store.session.exporting) clk().setManual(null); setTimeout(connect, Math.min(5000, 500 * ++retry)); };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (m.t === 'transport') onTransport(m); }
      else if (st.rec) st.rec.onPcm(e.data);
    };
  }
  connect();

  const inBrowser = /[?&]record=1/.test(location.search);
  function openBrowser() { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'open_browser' })); ui.msg('Opened U2C Studio in your browser: press Record DAW there (screen capture is blocked inside the plugin window).'); }
  if (inBrowser) setTimeout(() => ui.msg('Press Record DAW, then pick the FL Studio window (tick "share audio" not needed: the plugin sends the audio).'), 500);
  async function startRecord() {
    if (st.rec) return;
    let screen;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { openBrowser(); return; }
    try { screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60 } }, audio: false }); }
    catch (err) { if (err && err.name === 'NotAllowedError' && !inBrowser) { openBrowser(); return; } ui.msg('Screen capture refused: ' + (err && err.name) + '. On macOS allow your browser in System Settings → Privacy → Screen Recording.'); return; }
    const ac = new AudioContext(), dest = ac.createMediaStreamDestination(); let next = 0;
    const onPcm = (buf) => {
      if (buf.byteLength < 8) return; const dv = new DataView(buf), sr = dv.getUint32(0, true), n = dv.getUint32(4, true); if (!n) return;
      const ab = ac.createBuffer(1, n, sr); ab.getChannelData(0).set(new Float32Array(buf, 8, n));
      const s = ac.createBufferSource(); s.buffer = ab; s.connect(dest);
      const now = ac.currentTime + 0.05; if (next < now) next = now; s.start(next); next += n / sr;
    };
    const stream = new MediaStream([...screen.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12e6 } : {}), chunks = [];
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const timer = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'pull' })); }, 50);
    mr.onstop = () => {
      clearInterval(timer); screen.getTracks().forEach(t => t.stop()); ac.close(); st.rec = null; ui.update(st);
      const a = document.createElement('a'), blob = new Blob(chunks, { type: mr.mimeType || 'video/webm' }), ext = /mp4/.test(mr.mimeType) ? 'mp4' : 'webm';
      a.href = URL.createObjectURL(blob); a.download = `u2c-daw-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000); ui.msg('Saved ' + a.download);
    };
    screen.getVideoTracks()[0].addEventListener('ended', () => { if (mr.state !== 'inactive') mr.stop(); });
    st.rec = { mr, onPcm }; ws.send(JSON.stringify({ t: 'pull' })); mr.start(1000); ui.update(st); ui.msg('Recording. Pick the DAW window or screen.');
  }
  const stopRecord = () => { if (st.rec) st.rec.mr.stop(); };
  ui.onRecord = () => (st.rec ? stopRecord() : startRecord());
  ui.onFollow = (v) => { st.follow = v; if (!v) clk().setManual(null); };
  const api = { state: st, startRecord, stopRecord, send: (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); } };
  app.daw = api; return api;
}

function mountUi() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;font:12px/1.3 ui-monospace,monospace;background:#111c;color:#eee;border:1px solid #555;border-radius:8px;padding:8px 10px;display:flex;gap:8px;align-items:center;backdrop-filter:blur(6px)';
  el.innerHTML = '<span data-s>DAW: connecting</span><label><input type="checkbox" data-f checked> follow</label><button data-r style="cursor:pointer">Record DAW</button><span data-m style="max-width:260px;opacity:.8"></span>';
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  const ui = {
    onRecord() {}, onFollow() {},
    update(s) { q('[data-s]').textContent = s.connected ? `DAW ${s.host ? (s.host.playing ? 'play' : 'stop') + ' ' + s.host.bpm.toFixed(1) + ' BPM, beat ' + s.host.beats.toFixed(2) : 'connected'}` : 'DAW: offline'; q('[data-r]').textContent = s.rec ? 'Stop + save' : 'Record DAW'; },
    msg(t) { q('[data-m]').textContent = t; },
  };
  q('[data-r]').onclick = () => ui.onRecord(); q('[data-f]').onchange = (e) => ui.onFollow(e.target.checked);
  return ui;
}
