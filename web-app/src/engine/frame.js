// getFrameState(track, t, opts): pure and deterministic. Preview, thumbnails and export all read from this.
import { clamp } from '../util/draw.js';
function lastIdx(T, t) { let lo = 0, hi = T.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m + 1; else hi = m; } return lo - 1; }
function env(L, t, dec) { const idx = lastIdx(L.t, t); if (idx < 0) return { v: 0, age: 99, idx: -1 }; let v = 0; for (let j = idx; j >= Math.max(0, idx - 2); j--) v = Math.max(v, L.s[j] * Math.exp(-(t - L.t[j]) / dec)); return { v, age: t - L.t[idx], idx }; }
export function recentHits(L, t, win, max = 6) { const out = []; for (let j = lastIdx(L.t, t); j >= 0 && out.length < max; j--) { const age = t - L.t[j]; if (age > win) break; out.push({ age, s: L.s[j], idx: j, t: L.t[j] }); } return out; }
export function getFrameState(track, t, opts = {}) {
  const T = track, I = opts.intensity ?? 1, NB = T.bandCount, NS = T.specBins;
  const fi = clamp(t * T.fps, 0, T.frames - 1.001), i = fi | 0, a = fi - i;
  const g = arr => arr[i] + (arr[i + 1] - arr[i]) * a, gb = b => T.bands[i * NB + b] + (T.bands[(i + 1) * NB + b] - T.bands[i * NB + b]) * a;
  const k = env(T.kicks, t, .16), s = env(T.snares, t, .12), h = env(T.hats, t, .07), beat = (t - T.t0) / T.spb;
  const frameAt = tt => clamp(Math.round(tt * T.fps), 0, T.frames - 1);
  return {
    t, i, I, bpm: T.bpm, spb: T.spb, duration: T.duration, track: T,
    sub: gb(0), bass: gb(1), lowMid: gb(2), mid: gb(3), hi: gb(4), air: gb(5), bands: [gb(0), gb(1), gb(2), gb(3), gb(4), gb(5)],
    rms: g(T.rms), lowSlow: g(T.lowSlow), centroid: g(T.centroid), env: g(T.rms),
    kick: Math.min(1, k.v * I), kickAge: k.age, kickIdx: k.idx, snare: Math.min(1, s.v * I), snareAge: s.age, snareIdx: s.idx, hat: Math.min(1, h.v * I), hatAge: h.age, hatIdx: h.idx,
    beat, beatPhase: beat - Math.floor(beat), bp: beat - Math.floor(beat), bar: Math.floor(beat / 4), barPhase: beat / 4 - Math.floor(beat / 4), barP: beat / 4 - Math.floor(beat / 4),
    // read-only queries over the immutable track
    specAt: kk => T.spec[i * NS + kk],
    spec: (tt, kk) => T.spec[frameAt(tt) * NS + kk],
    specFrame: (fi2, kk) => T.spec[clamp(fi2, 0, T.frames - 1) * NS + kk],
    level: (t0, t1) => { const x = clamp(Math.floor(t0 * T.fps), 0, T.frames - 1), y = clamp(Math.ceil(t1 * T.fps), x + 1, T.frames); let m = 0; for (let j = x; j < y; j++) if (T.rmsRaw[j] > m) m = T.rmsRaw[j]; return Math.min(1, m / T.rmsRef); },
    peak: (t0, t1) => { const c = T.peaks.cols, x = clamp(Math.floor(t0 / T.duration * c), 0, c - 1), y = clamp(Math.ceil(t1 / T.duration * c), x + 1, c); let m = 0; for (let j = x; j < y; j++) m = Math.max(m, T.peaks.max[j], -T.peaks.min[j]); return m; },
    rmsDb: () => 20 * Math.log10(Math.max(1e-5, T.rmsRaw[i])),
    recent: (name, win, max) => recentHits(T[name], t, win, max),
    scopeAt: (tt, n, span) => { const out = new Float32Array(n), r = T.scopeRate, s0 = Math.floor((tt - span / 2) * r); for (let j = 0; j < n; j++) out[j] = T.scope[s0 + Math.floor(j * span * r / n)] || 0; return out; },
  };
}
