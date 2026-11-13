// Metering with real ballistics, as pure functions of (track, t): every value is recomputed from the analysis, never
// integrated frame-to-frame, so preview, scrubbing and export agree exactly.
//  peak bar: instant attack, 26 dB/s release · peak hold: 1.5 s hold, then 20 dB/s fall · RMS: 300 ms window
//  LUFS (BS.1770 K-weighted): momentary 400 ms, short-term 3 s, integrated over the clip (abs -70 / rel -10 LU gates)
//  true peak: inter-sample estimate over the last 1 s · clip LED: any peak >= -0.1 dBFS in the last 1 s
//  correlation: 200 ms window · spectrum: 1/6-octave smoothing, dB rel. full scale, peak hold decaying 12 dB/s
import { clamp } from '../util/draw.js';
const DB = v => 20 * Math.log10(Math.max(1e-6, v)), MEMO = new WeakMap();
const LK = ms => -0.691 + 10 * Math.log10(Math.max(1e-12, ms));
export function meters(T) {
  let m = MEMO.get(T); if (m) return m;
  const S = T.stereo, fr = S ? S.fr : T.fps, nF = S ? S.nF : T.frames;
  const fi = t => clamp(Math.floor(t * fr), 0, nF - 1);
  const pk = (ch, f) => (S ? (ch ? S.peakR[f] : S.peakL[f]) : Math.min(1, T.rmsRaw[f] * 1.6));
  const msq = (ch, f) => (S ? (ch ? S.msR[f] : S.msL[f]) : T.rmsRaw[f] ** 2);
  const win = (cum, t, w) => { const b = fi(t) + 1, a = Math.max(0, b - Math.max(1, Math.round(w * fr))); return (cum[b] - cum[a]) / Math.max(1, b - a); };
  const integ = new Map();
  m = {
    mono: S ? S.mono : true,
    peakDb: (ch, t) => DB(pk(ch, fi(t))),
    peakBar(ch, t) { const f = fi(t); let best = -120; for (let k = 0; k < 60 && f - k >= 0; k++) best = Math.max(best, DB(pk(ch, f - k)) - 26 * k / fr); return best; },
    holdDb(ch, t) { const f = fi(t); let best = -120; for (let k = 0; k < 4.5 * fr && f - k >= 0; k++) { const age = k / fr; best = Math.max(best, DB(pk(ch, f - k)) - (age < 1.5 ? 0 : (age - 1.5) * 20)); } return best; },
    rmsDb(ch, t) { const f = fi(t), w = Math.round(.3 * fr); let s = 0, c = 0; for (let k = 0; k < w && f - k >= 0; k++) { s += msq(ch, f - k); c++; } return DB(Math.sqrt(s / Math.max(1, c))); },
    lufsM: t => (S ? LK(win(S.cumK, t, .4)) : DB(T.rmsRaw[fi(t)]) - 3),
    lufsS: t => (S ? LK(win(S.cumK, t, 3)) : DB(T.rmsRaw[fi(t)]) - 3),
    lufsI(a, b) { if (!S) return -14; const key = a.toFixed(3) + '|' + b.toFixed(3); if (integ.has(key)) return integ.get(key);
      const blocks = []; for (let t = a + .4; t <= b; t += .1) blocks.push(win(S.cumK, t, .4)); const g1 = blocks.filter(x => LK(x) > -70); let v = -70;
      if (g1.length) { const rel = LK(g1.reduce((x, y) => x + y, 0) / g1.length) - 10, g2 = g1.filter(x => LK(x) > rel); v = LK(g2.reduce((x, y) => x + y, 0) / Math.max(1, g2.length)); }
      integ.set(key, v); return v; },
    truePeak(t) { const f = fi(t); let best = 0; for (let k = 0; k < fr && f - k >= 0; k++) best = Math.max(best, pk(0, f - k), pk(1, f - k)); return DB(best); },
    clip(t) { return m.truePeak(t) >= -.1; },
    corr(t) { if (!S) return 1; const b = fi(t) + 1, a = Math.max(0, b - 20), lr = S.cLR[b] - S.cLR[a], ll = S.cLL[b] - S.cLL[a], rr = S.cRR[b] - S.cRR[a]; return ll * rr > 1e-12 ? clamp(lr / Math.sqrt(ll * rr), -1, 1) : 1; },
    /** n stereo samples ending at t over `span` seconds (goniometer). */
    lr(t, n, span) { const out = { l: new Float32Array(n), r: new Float32Array(n) }; if (!S) return out;
      const r = S.scopeRate, s0 = Math.floor((t - span) * r); for (let j = 0; j < n; j++) { const i = s0 + Math.floor(j * span * r / n); out.l[j] = S.sL[i] || 0; out.r[j] = S.sR[i] || 0; } return out; },
    /** Spectrum in dB (rel. full scale), 1/6-octave smoothed, for analysis frame index i. */
    specDb(i) { const NS = T.specBins, o = new Float32Array(NS), raw = k => 12.5 * Math.log10(Math.max(1e-6, T.spec[clamp(i, 0, T.frames - 1) * NS + clamp(k, 0, NS - 1)]));
      for (let k = 0; k < NS; k++) o[k] = .25 * raw(k - 1) + .5 * raw(k) + .25 * raw(k + 1); return o; },
    /** Peak-hold line: max over the last 2.5 s of (dB − 12 dB/s × age). */
    specHold(t) { const NS = T.specBins, o = new Float32Array(NS).fill(-120), f0 = clamp(Math.floor(t * T.fps), 0, T.frames - 1), w = Math.round(2.5 * T.fps);
      for (let k = 0; k < w && f0 - k >= 0; k += 2) { const d = m.specDb(f0 - k), drop = 12 * k / T.fps; for (let b = 0; b < NS; b++) o[b] = Math.max(o[b], d[b] - drop); } return o; },
    /** Bin centre frequencies of the 48 log bins (30 Hz … 14 kHz). */
    binHz: k => 30 * Math.pow(14000 / 30, (k + .5) / T.specBins),
    groove: groove(T), lanes: lanes(T),
  };
  MEMO.set(T, m); return m;
}

/** Swing (mean position of off-beat 8th hats, 50 % = straight) and kick timing spread vs. the grid (ms). */
function groove(T) {
  const ph = x => (((x - T.t0) / T.spb) % 1 + 1) % 1; let sw = 0, n = 0;
  for (const t of T.hats.t) { const p = ph(t); if (p > .35 && p < .8) { sw += p; n++; } }
  let dev = 0, m = 0; for (const t of T.kicks.t) { const q = ph(t) * 4, d = (q - Math.round(q)) / 4 * T.spb; dev += d * d; m++; }
  return { swing: n ? Math.round(sw / n * 100) : 50, tightMs: m ? Math.round(Math.sqrt(dev / m) * 1000) : 0 };
}
/** Onset lanes for the note-lane view: drums from the detected hits, bass/mid/high from band-energy peaks. */
function lanes(T) {
  const NB = T.bandCount, pick = b => { const o = []; let last = -1; for (let i = 2; i < T.frames - 2; i++) { const v = T.bands[i * NB + b], p = T.bands[(i - 2) * NB + b];
    if (v - p > .18 && v >= T.bands[(i + 1) * NB + b] && i - last > T.fps * .12) { o.push(i / T.fps); last = i; } } return Float32Array.from(o); };
  return { KICK: T.kicks.t, SNR: T.snares.t, HAT: T.hats.t, BASS: pick(1), MID: pick(3), HIGH: pick(4) };
}
