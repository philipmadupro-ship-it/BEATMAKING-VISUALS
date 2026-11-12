// Single source of truth for time. Preview: AudioContext playback. Export: driven by frame counter via setManual().
export function createClock() {
  let ac = null, gain = null, src = null, playing = false, startCtx = 0, startPos = 0, pos = 0, buffer = null, manual = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f(playing));
  const api = {
    ensure() { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); gain = ac.createGain(); gain.gain.value = .9; gain.connect(ac.destination); } return ac; },
    get ctx() { return api.ensure(); },
    get playing() { return playing; },
    setBuffer(b) { api.stop(); buffer = b; pos = 0; },
    setVolume(v) { api.ensure(); gain.gain.value = v; },
    play(from = pos) { if (!buffer) return; api.ensure(); ac.resume(); api._kill(); src = ac.createBufferSource(); src.buffer = buffer; src.connect(gain);
      startCtx = ac.currentTime + .03; startPos = Math.max(0, Math.min(from, buffer.duration - .01)); src.start(startCtx, startPos); playing = true; emit(); },
    pause() { if (playing) pos = api.time(); api._kill(); playing = false; emit(); },
    stop() { api._kill(); playing = false; emit(); },
    seek(t) { pos = Math.max(0, t); if (playing) api.play(pos); },
    time() { if (manual != null) return manual; return playing ? startPos + Math.max(0, ac.currentTime - startCtx) : pos; },
    setManual(t) { manual = t; },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    _kill() { if (src) { try { src.stop(); } catch (_) {} src.disconnect(); src = null; } },
  };
  return api;
}
