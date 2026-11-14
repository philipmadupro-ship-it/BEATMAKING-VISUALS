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
    onsets: cd.onsets, wave: { cps: cd.wave.cps, tone }, wave2: cd.wave2, srcLufs: cd.srcLufs, summary: cd.summary,
  };
}
/** Labels of each clip bar (0-based) from the song structure. */
export function clipBarLabels(D) { const out = []; for (let k = 0; k < D.bars; k++) { const sb = D.song.startBar + k; let lab = 'intro'; for (const q of D.song.phrases) if (q.bar <= sb) lab = q.label; out.push(lab); } return out; }
