// Single source of truth for time. Preview: AudioContext playback (output latency compensated). Export: setManual().
// play(from) plays the track; playBuffer(buf, {map, offset, loop}) plays any buffer (the cross-faded loop, the Seam
// check reel) and maps the buffer position back to track time, so visuals always follow what is heard.
export function createClock() {
  let ac = null, gain = null, src = null, playing = false, startCtx = 0, startPos = 0, pos = 0, buffer = null, manual = null, mode = null;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f(playing));
  const latency = () => (ac ? (ac.outputLatency || 0) + (ac.baseLatency || 0) : 0);
  const api = {
    ensure() { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); gain = ac.createGain(); gain.gain.value = .9; gain.connect(ac.destination); } return ac; },
    get ctx() { return api.ensure(); },
    get playing() { return playing; },
    get mode() { return mode ? mode.kind : 'track'; },
    setBuffer(b) { api.stop(); buffer = b; pos = 0; },
    setVolume(v) { api.ensure(); gain.gain.value = v; },
    play(from = pos) { if (!buffer) return; api.playBuffer(buffer, { offset: Math.max(0, Math.min(from, buffer.duration - .01)), loop: false, map: x => x, kind: 'track' }); },
    /** Play `buf` from `offset` s; time() = map(position in buf). With loop, the buffer repeats sample-accurately. */
    playBuffer(buf, { offset = 0, loop = true, map = x => x, kind = 'loop' } = {}) {
      api.ensure(); ac.resume(); api._kill(); src = ac.createBufferSource(); src.buffer = buf; src.loop = loop; if (loop) { src.loopStart = 0; src.loopEnd = buf.duration; } src.connect(gain);
      startCtx = ac.currentTime + .03; startPos = offset; src.start(startCtx, offset % buf.duration); mode = { kind, map, loop, dur: buf.duration }; playing = true; emit(); },
    pause() { if (playing) pos = api.time(); api._kill(); playing = false; mode = null; emit(); },
    stop() { api._kill(); playing = false; mode = null; emit(); },
    seek(t) { pos = Math.max(0, t); if (playing) api.play(pos); },
    time() {
      if (manual != null) return manual; if (!playing) return pos;
      let x = startPos + Math.max(0, ac.currentTime - startCtx - latency());
      if (mode.loop) x = x % mode.dur; else x = Math.min(x, mode.dur);
      return mode.map(x);
    },
    setManual(t) { manual = t; },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    _kill() { if (src) { try { src.stop(); } catch (_) {} src.disconnect(); src = null; } },
  };
  return api;
}
