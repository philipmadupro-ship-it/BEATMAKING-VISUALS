// Metering with real ballistics, as pure functions of (track, t): every value is recomputed from the analysis, never
// integrated frame-to-frame, so preview, scrubbing and export agree exactly.
//  peak bar: instant attack, 26 dB/s release · peak hold: 1.5 s hold, then 20 dB/s fall · RMS: 300 ms window
//  LUFS (BS.1770 K-weighted): momentary 400 ms, short-term 3 s, integrated over the clip (abs -70 / rel -10 LU gates)
//  true peak: 4× oversampled (BS.1770-4) over the last 1 s · clip LED: 2+ consecutive full-scale samples in the last 1 s
//  correlation: 200 ms window (0 when a channel is silent) · spectrum: calibrated dBFS per ~1/5-octave bin (a full-scale
//  sine = 0 dB), peak hold decaying 12 dB/s · EQ: 1 s spectral envelope relative to a pink (equal power per octave)
//  reference, band nodes at the measured band levels. Accuracy is checked against ffmpeg + numpy by tests/meters.mjs.
import { clamp } from '../util/draw.js';
const DB = v => 20 * Math.log10(Math.max(1e-6, v)), MEMO = new WeakMap();
const LK = ms => -0.691 + 10 * Math.log10(Math.max(1e-12, ms));
export function meters(T) {
  let m = MEMO.get(T); if (m) return m;
  const S = T.stereo, fr = S ? S.fr : T.fps, nF = S ? S.nF : T.frames;
  const fi = t => clamp(Math.floor(t * fr), 0, nF - 1);
  const pk = (ch, f) => (S ? (ch ? S.peakR[f] : S.peakL[f]) : Math.min(1, T.rmsRaw[f] * 1.6));
  const tp = (ch, f) => (S && S.tpL ? (ch ? S.tpR[f] : S.tpL[f]) : pk(ch, f));
  const msq = (ch, f) => (S ? (ch ? S.msR[f] : S.msL[f]) : T.rmsRaw[f] ** 2);
  const win = (cum, t, w) => { const b = fi(t) + 1, a = Math.max(0, b - Math.max(1, Math.round(w * fr))); return (cum[b] - cum[a]) / Math.max(1, b - a); };
  const integ = new Map();
  m = {
    mono: S ? S.mono : true,
    peakDb: (ch, t) => DB(pk(ch, fi(t))),
    peakBar(ch, t) { const f = fi(t); let best = -120; for (let k = 0; k < 3 * fr && f - k >= 0; k++) best = Math.max(best, DB(pk(ch, f - k)) - 26 * k / fr); return best; },
    holdDb(ch, t) { const f = fi(t); let best = -120; for (let k = 0; k < 4.5 * fr && f - k >= 0; k++) { const age = k / fr; best = Math.max(best, DB(pk(ch, f - k)) - (age < 1.5 ? 0 : (age - 1.5) * 20)); } return best; },
    rmsDb(ch, t) { const f = fi(t), w = Math.round(.3 * fr); let s = 0, c = 0; for (let k = 0; k < w && f - k >= 0; k++) { s += msq(ch, f - k); c++; } return DB(Math.sqrt(s / Math.max(1, c))); },
    lufsM: t => (S ? LK(win(S.cumK, t, .4)) : DB(T.rmsRaw[fi(t)]) - 3),
    lufsS: t => (S ? LK(win(S.cumK, t, 3)) : DB(T.rmsRaw[fi(t)]) - 3),
    lufsI(a, b) { if (!S) return -14; const key = a.toFixed(3) + '|' + b.toFixed(3); if (integ.has(key)) return integ.get(key);
      const blocks = []; for (let t = a + .4; t <= b; t += .1) blocks.push(win(S.cumK, t, .4)); const g1 = blocks.filter(x => LK(x) > -70); let v = -70;
      if (g1.length) { const rel = LK(g1.reduce((x, y) => x + y, 0) / g1.length) - 10, g2 = g1.filter(x => LK(x) > rel); v = LK(g2.reduce((x, y) => x + y, 0) / Math.max(1, g2.length)); }
      integ.set(key, v); return v; },
    /** Gain the export applies (target LUFS with a -1 dBTP ceiling, see export/audio.js), so meters show the exported audio. */
    exportGain(P) { if (!P || P.loudness == null || P.loudness === 'off') return 0; const key = 'g|' + P.inT.toFixed(3) + '|' + P.outT.toFixed(3) + '|' + P.loudness; if (integ.has(key)) return integ.get(key);
      let tp = -120; for (let t = P.inT; t <= P.outT; t += .5) tp = Math.max(tp, m.truePeak(t)); let g = +P.loudness - m.lufsI(P.inT, P.outT); if (tp + g > -1) g = -1 - tp; integ.set(key, g); return g; },
    truePeak(t) { const f = fi(t); let best = 0; for (let k = 0; k < fr && f - k >= 0; k++) best = Math.max(best, tp(0, f - k), tp(1, f - k)); return DB(best); },
    /** Clip LED: the source clipped (2+ consecutive full-scale samples) in the last second. */
    clip(t) { if (!S) return false; const f = fi(t); for (let k = 0; k < fr && f - k >= 0; k++) if (S.clipL[f - k] || S.clipR[f - k]) return true; return false; },
    corr(t) { if (!S) return 1; const b = fi(t) + 1, a = Math.max(0, b - 20), lr = S.cLR[b] - S.cLR[a], ll = S.cLL[b] - S.cLL[a], rr = S.cRR[b] - S.cRR[a];
      const e = Math.max(ll, rr); return e < 1e-10 || Math.min(ll, rr) < e * 1e-6 ? 0 : clamp(lr / Math.sqrt(ll * rr), -1, 1); },
    /** n stereo samples ending at t over `span` seconds (goniometer). */
    lr(t, n, span) { const out = { l: new Float32Array(n), r: new Float32Array(n) }; if (!S) return out;
      const r = S.scopeRate, s0 = Math.floor((t - span) * r); for (let j = 0; j < n; j++) { const i = s0 + Math.floor(j * span * r / n); out.l[j] = S.sL[i] || 0; out.r[j] = S.sR[i] || 0; } return out; },
    /** Calibrated spectrum in dBFS per log bin (full-scale sine = 0 dB) for analysis frame index i. */
    specDb(i) { const NS = T.specBins, f = clamp(i, 0, T.frames - 1);
      if (T.specP) return T.specP.subarray(f * NS, f * NS + NS);
      if (!m._sd) m._sd = new Float32Array(T.frames * NS).fill(NaN); // legacy tracks without the calibrated spectrum
      if (Number.isNaN(m._sd[f * NS])) for (let k = 0; k < NS; k++) m._sd[f * NS + k] = 12.5 * Math.log10(Math.max(1e-6, T.spec[f * NS + k]));
      return m._sd.subarray(f * NS, f * NS + NS); },
    /** Spectral envelope (dBFS per bin) as the power mean over the last `win` seconds ending at t. */
    envelope(t, win = 1) { const NS = T.specBins, f1 = clamp(Math.floor(t * T.fps), 0, T.frames - 1), n = Math.max(1, Math.round(win * T.fps)), f0 = Math.max(0, f1 - n + 1), acc = new Float64Array(NS);
      for (let f = f0; f <= f1; f++) { const d = m.specDb(f); for (let k = 0; k < NS; k++) acc[k] += Math.pow(10, d[k] / 10); }
      return Float32Array.from(acc, v => 10 * Math.log10(Math.max(1e-14, v / (f1 - f0 + 1)))); },
    /** Envelope relative to pink: per-bin dB minus the mean level over 60 Hz-12 kHz. Pink noise reads 0 dB everywhere;
     *  a bright mix tilts up, a bass-heavy one down. Returns {rel, ref (dBFS of the pink line per bin), level}. */
    pinkRel(t, win = 1) { const e = m.envelope(t, win), NS = e.length; let s = 0, c = 0, pw = 0;
      for (let k = 0; k < NS; k++) { const f = m.binHz(k); pw += Math.pow(10, e[k] / 10); if (f >= 60 && f <= 12000) { s += e[k]; c++; } }
      const ref = c ? s / c : -140, silent = pw < 1e-11;
      return { rel: Float32Array.from(e, v => (silent ? 0 : v - ref)), ref, silent }; },
    /** EQ band nodes: the measured level (dB rel. pink) around each node frequency (±1/3 octave, power mean). */
    eqBands(t, freqs = [80, 250, 1000, 4000, 11000], win = 1) { const { rel, silent } = m.pinkRel(t, win), NS = rel.length;
      return freqs.map(f0 => { if (silent) return { f: f0, db: 0 }; let p = 0, c = 0; for (let k = 0; k < NS; k++) if (Math.abs(Math.log2(m.binHz(k) / f0)) <= 1 / 3) { p += Math.pow(10, rel[k] / 10); c++; }
        return { f: f0, db: c ? 10 * Math.log10(Math.max(1e-12, p / c)) : 0 }; }); },
    /** Peak-hold line: max over the last 2.5 s of (dB − 12 dB/s × age). */
    specHold(t) { const NS = T.specBins, o = new Float32Array(NS).fill(-120), f0 = clamp(Math.floor(t * T.fps), 0, T.frames - 1), w = Math.round(5 * T.fps); // 5 s × 12 dB/s = the full 60 dB display
      for (let k = 0; k < w && f0 - k >= 0; k += 2) { const d = m.specDb(f0 - k), drop = 12 * k / T.fps; for (let b = 0; b < NS; b++) o[b] = Math.max(o[b], d[b] - drop); } return o; },
    /** Bin centre frequencies of the 48 log bins (30 Hz … 14 kHz, geometric centre). */
    binHz: k => 30 * Math.pow(14000 / 30, (k + .5) / T.specBins),
    /** Peak frequency of a spectrum (parabolic interpolation over the log bins), Hz. */
    peakHz(d) { let b = 0; for (let k = 1; k < d.length; k++) if (d[k] > d[b]) b = k; const y0 = d[Math.max(0, b - 1)], y1 = d[b], y2 = d[Math.min(d.length - 1, b + 1)], den = y0 - 2 * y1 + y2, o = den < 0 ? clamp(.5 * (y0 - y2) / den, -.5, .5) : 0; return 30 * Math.pow(14000 / 30, (b + .5 + o) / T.specBins); },
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
