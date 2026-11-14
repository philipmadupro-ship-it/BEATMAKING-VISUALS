// Clip data (analysis/clipdata.js) + track facts -> the data object the v8 composition reads (the native renderer's
// window.U2C_DATA shape): per-frame arrays become per-frame views, song structure and labels are mapped to the clip.
export function keyName(k) { const m = String(k || '').match(/^([A-G][#b]?)\s*(maj|min)/i); return m ? `${m[1]} ${m[2].toUpperCase()}` : String(k || 'C MIN').toUpperCase(); }
export function filmData(cd, track, { title = 'UNTITLED', inT = 0 } = {}) {
  const NF = cd.frames, f = cd.frame, view = (a, n) => Array.from({ length: NF }, (_, i) => a.subarray(i * n, i * n + n));
  const F = { M: f.M, S: f.S, I: f.I, LRA: f.LRA, TP: f.TP, corr: f.corr, width: f.width, tilt: f.tilt, spec: view(f.spec, 61), hold: view(f.hold, 61), bal: view(f.bal, 10), bands: view(f.bands, 6), bandDb: view(f.bandDb, 6) };
  const song = track.song, startBar = Math.round((inT - track.t0) / track.barDur) - song.startIdx + 1, tone = [];
  for (let i = 0; i < cd.wave.tone.length / 2; i++) tone.push([cd.wave.tone[2 * i], cd.wave.tone[2 * i + 1]]);
  return {
    fps: cd.fps, frames: NF, duration: cd.duration, bars: cd.bars, bpm: track.bpm, beat: track.spb, key: keyName(track.key), title: String(title || 'UNTITLED').toUpperCase(),
    song: { duration: track.duration, startBar, startTime: inT, bar1: song.bar1, phrases: song.phrases.map((q) => ({ bar: q.bar, label: q.label, bars: q.bars })), overview: cd.overview, lastBar: song.bars.length ? song.bars[song.bars.length - 1].bar : 0 },
    frame: F, oct6: cd.oct6, oct1: cd.oct1, bandNames: cd.bandNames, spectroBins: cd.spectroBins, spectro: cd.spectro, gonioN: cd.gonioN, gonioS: cd.gonioS, gonioM: cd.gonioM, scope: cd.scope, polar: cd.polar, polarN: cd.polarN, lv: cd.lv, ms: cd.ms,
    onsets: cd.onsets, wave: { cps: cd.wave.cps, tone }, wave2: cd.wave2, wave3: cd.wave3, srcLufs: cd.srcLufs, summary: cd.summary,
  };
}
/** Labels of each clip bar (0-based) from the song structure. */
export function clipBarLabels(D) { const out = []; for (let k = 0; k < D.bars; k++) { const sb = D.song.startBar + k; let lab = 'intro'; for (const q of D.song.phrases) if (q.bar <= sb) lab = q.label; out.push(lab); } return out; }
/**
 * The native renderer's window.U2C_DATA (u2c-motion tools/clipdata.py: base64 strings, nested arrays) -> the shape the
 * v8 composition reads (typed arrays). Used by the native v9 page (film/v9) so both renderers run this same code.
 */
export function fromNative(N) {
  const b64 = (s) => { const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  const i8 = (s) => new Int8Array(b64(s).buffer);
  const tone = Array.isArray(N.wave.tone[0]) ? N.wave.tone : Array.from({ length: N.wave.tone.length / 2 }, (_, i) => [N.wave.tone[2 * i], N.wave.tone[2 * i + 1]]);
  const D = { ...N, spectro: b64(N.spectro), gonioS: i8(N.gonioS), gonioM: i8(N.gonioM), wave: { cps: N.wave.cps, tone },
    wave2: { cps: N.wave2.cps, n: N.wave2.n, data: i8(N.wave2.b64) } };
  // per-frame scalar series as typed arrays (the meters use subarray etc.); Float64 keeps the native values exact
  if (N.frame) { D.frame = { ...N.frame }; for (const k of Object.keys(D.frame)) { const a = D.frame[k]; if (Array.isArray(a) && typeof a[0] === 'number') D.frame[k] = Float64Array.from(a); } }
  if (N.meters) Object.assign(D, unpackStreams(N.meters, b64));   // meters v2 streams (u2c-motion tools/meterdata.mjs)
  if (N.wave3) D.wave3 = { cps: N.wave3.cps, n: N.wave3.n, sr: N.wave3.sr, spc: N.wave3.spc, data: new Int16Array(b64(N.wave3.b64).buffer) };
  return D;
}
const TYPED = { Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Float32Array, Float64Array };
/** Inverse of analysis/meterstreams.js packStreams: {"$t": type, "b64"} records -> typed arrays, recursively. */
export function unpackStreams(o, b64) {
  if (o && typeof o === 'object' && o.$t && typeof o.b64 === 'string') return new TYPED[o.$t](b64(o.b64).buffer);
  if (o && typeof o === 'object') { const r = Array.isArray(o) ? [] : {}; for (const k of Object.keys(o)) r[k] = unpackStreams(o[k], b64); return r; }
  return o;
}
