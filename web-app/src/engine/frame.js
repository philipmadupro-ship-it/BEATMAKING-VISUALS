// getFrameState(track, t, opts): pure and deterministic. Preview, thumbnails and export all read from this.
// Loop mode (opts.loop = {a, b}): inside the clip the track is treated as periodic, so the last frame flows into frame 0:
//  - hit lists (kick/snare/hat) wrap: hits before the in point are taken from the end of the loop,
//  - continuous features cross-fade over the last beat towards their value one loop earlier (matches the audio crossfade),
//  - time-based queries (level/peak/spec) wrap into the loop, and `lp`, `lt`, `cyc()`, `flow()` give loop-phase motion.
import { clamp } from '../util/draw.js';
import { meters } from './meters.js';
const DELTA = .06; // hits up to 60 ms before the in point belong to the loop (early onset of the downbeat kick)
function lastIdx(T, t) { let lo = 0, hi = T.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m + 1; else hi = m; } return lo - 1; }
/** Hits at or before t, newest first, within `win` seconds; periodic inside a loop. */
function hitsBack(L, t, lp, win, max) {
  const out = [];
  if (!lp) { for (let j = lastIdx(L.t, t); j >= 0 && out.length < max; j--) { const age = t - L.t[j]; if (age > win) break; out.push({ age, s: L.s[j], idx: j, t: L.t[j] }); } return out; }
  const a = lp.a - DELTA, b = lp.b - DELTA, P = lp.b - lp.a; let tt = t, off = 0; if (tt >= b) tt -= P;
  for (let pass = 0; pass < 4 && out.length < max; pass++) {
    let j = lastIdx(L.t, pass ? b - 1e-9 : tt);
    for (; j >= 0 && L.t[j] >= a && out.length < max; j--) { const age = tt - (L.t[j] - off); if (age > win) return out; out.push({ age, s: L.s[j], idx: j, t: t - age }); }
    off += P; if (off > win + P) break;
  }
  return out;
}
export function recentHits(L, t, win, max = 6, lp = null) { return hitsBack(L, t, lp, win, max); }
// Attack/release envelope per hit, with anticipation: the rise starts PRE seconds (~1 frame) before the onset and
// peaks `atk` after it, so motion feels locked to the hit instead of a frame late. Strengths are adaptive (each hit
// relative to the loudest hit within ±4 s), so quiet and loud passages both react.
const PRE = 1 / 30;
function envAR(L, S, t, atk, rel, lp) { const h = hitsBack(L, t + PRE, lp, rel * 7 + PRE, 4); let v = 0, last = null;
  for (const x of h) { const age = x.age - PRE, s = S[x.idx]; const e = age < atk ? s * (1 - Math.pow(1 - Math.max(0, (age + PRE) / (atk + PRE)), 2)) : s * Math.exp(-(age - atk) / rel); if (e > v) v = e; if (!last && age >= 0) last = { ...x, age }; }
  return { v, age: last ? last.age : 99, idx: last ? last.idx : -1, s: last ? last.s : 0 }; }
function adaptive(L) { const n = L.t.length, o = new Float32Array(n); let b = 0; const dq = [];
  for (let i = 0; i < n; i++) { while (b < n && L.t[b] <= L.t[i] + 4) { while (dq.length && L.s[dq[dq.length - 1]] <= L.s[b]) dq.pop(); dq.push(b); b++; } while (L.t[dq[0]] < L.t[i] - 4) dq.shift(); o[i] = Math.min(1, .4 + .6 * L.s[i] / Math.max(1e-6, L.s[dq[0]])); }
  return o; }
// one-pole attack/release follower over a band (frame rate), times in seconds
function follower(src, NB, b, fps, atk, rel, n) { const o = new Float32Array(n), ka = 1 - Math.exp(-1 / (fps * atk)), kr = 1 - Math.exp(-1 / (fps * rel)); let v = 0; for (let i = 0; i < n; i++) { const x = src[i * NB + b]; v += (x > v ? ka : kr) * (x - v); o[i] = v; } return o; }
// per-track derived data (memoised, the track itself is immutable)
const MEMO = new WeakMap();
function derived(T) {
  let d = MEMO.get(T); if (d) return d;
  const ks = Array.from(T.kicks.s).sort((x, y) => x - y), thr = ks.length ? ks[Math.floor(ks.length * .75)] : 1;
  const NB = T.bandCount, cum = []; // cumulative band energy (orbit speeds follow the bands but stay loop-periodic)
  for (let b = 0; b < NB + 1; b++) { const c = new Float64Array(T.frames + 1); for (let i = 0; i < T.frames; i++) c[i + 1] = c[i] + .15 + (b < NB ? T.bands[i * NB + b] : T.rms[i]); cum.push(c); }
  const ad = { kicks: adaptive(T.kicks), snares: adaptive(T.snares), hats: adaptive(T.hats) };
  const fol = { bass: follower(T.bands, NB, 1, T.fps, .012, .16, T.frames), mid: follower(T.bands, NB, 3, T.fps, .01, .12, T.frames), high: follower(T.bands, NB, 4, T.fps, .004, .07, T.frames) };
  d = { strongKick: thr, cum, ad, fol }; MEMO.set(T, d); return d;
}
function raw(T, t, I) {
  const NB = T.bandCount, NS = T.specBins, fi = clamp(t * T.fps, 0, T.frames - 1.001), i = fi | 0, a = fi - i;
  const g = arr => arr[i] + (arr[i + 1] - arr[i]) * a, gb = b => T.bands[i * NB + b] + (T.bands[(i + 1) * NB + b] - T.bands[i * NB + b]) * a;
  const bands = [gb(0), gb(1), gb(2), gb(3), gb(4), gb(5)];
  const D = derived(T), ff = arr => arr[i] + (arr[Math.min(T.frames - 1, i + 1)] - arr[i]) * a;
  return { i, bands, fol: [ff(D.fol.bass), ff(D.fol.mid), ff(D.fol.high)], rms: g(T.rms), lowSlow: g(T.lowSlow), centroid: g(T.centroid), spec: k => T.spec[i * NS + k] + (T.spec[(i + 1) * NS + k] - T.spec[i * NS + k]) * a };
}
export function getFrameState(track, t, opts = {}) {
  const T = track, I = opts.intensity ?? 1, NS = T.specBins, D = derived(T);
  const loop = opts.loop && opts.loop.b - opts.loop.a > .2 ? opts.loop : null;
  const inLoop = !!loop && t >= loop.a - 1e-6 && t <= loop.b + 1e-6, lp = inLoop ? loop : null, Lp = loop ? loop.b - loop.a : 0;
  let F = raw(T, t, I);
  // seam crossfade of continuous features over the last beat (same window as the audio crossfade)
  if (lp) { const xf = Math.min(T.spb, Lp / 4), w0 = (t - (lp.b - xf)) / xf;
    if (w0 > 0) { const w = w0 >= 1 ? 1 : w0 * w0 * (3 - 2 * w0), G = raw(T, t - Lp, I), m = (x, y) => x + (y - x) * w;
      F = { i: F.i, fol: F.fol.map((v, k) => m(v, G.fol[k])), bands: F.bands.map((v, k) => m(v, G.bands[k])), rms: m(F.rms, G.rms), lowSlow: m(F.lowSlow, G.lowSlow), centroid: m(F.centroid, G.centroid), spec: (fa => k => m(fa(k), G.spec(k)))(F.spec) }; } }
  const k = envAR(T.kicks, D.ad.kicks, t, .005, .12, lp), s = envAR(T.snares, D.ad.snares, t, .005, .18, lp), h = envAR(T.hats, D.ad.hats, t, .002, .06, lp), beat = (t - T.t0) / T.spb;
  const wrap = tt => (lp ? lp.a + ((((tt - lp.a) % Lp) + Lp) % Lp) : tt);
  const frameAt = tt => clamp(Math.round(wrap(tt) * T.fps), 0, T.frames - 1);
  const lt = lp ? t - lp.a : t, lph = lp ? lt / Lp : 0;
  const B = F.bands;
  return {
    t, i: F.i, I, bpm: T.bpm, m: meters(T), spb: T.spb, duration: T.duration, track: T, loop: lp,
    sub: B[0], bass: B[1], lowMid: B[2], mid: B[3], hi: B[4], air: B[5], bands: B,
    rms: F.rms, lowSlow: F.lowSlow, centroid: F.centroid, env: F.rms,
    kick: Math.min(1, k.v * I), kickAge: k.age, kickIdx: k.idx, kickS: k.s, kickStrong: k.idx >= 0 && k.s >= D.strongKick,
    snare: Math.min(1, s.v * I), snareAge: s.age, snareIdx: s.idx, hat: Math.min(1, h.v * I), hatAge: h.age, hatIdx: h.idx,
    // per-band followers + accents (V2): bass/mid/high envelopes, sidechain duck on kicks, downbeat accent
    bassE: F.fol[0], midE: F.fol[1], highE: F.fol[2], duck: 1 - .14 * Math.min(1, k.v * I), barAcc: (() => { const ab = ((beat / 4) % 1 + 1) % 1 * 4 * T.spb; return ab < .02 ? 1 : Math.exp(-(ab - .02) / .2); })(),
    beat, beatPhase: beat - Math.floor(beat), bp: beat - Math.floor(beat), bar: Math.floor(beat / 4), barPhase: beat / 4 - Math.floor(beat / 4), barP: beat / 4 - Math.floor(beat / 4),
    // loop phase: lt = seconds since the in point, lp = 0..1 through the loop
    lt, lp: lph,
    /** Phase in cycles of a motion at ~hz, quantised to a whole number of cycles per loop (seamless). */
    cyc: hz => (lp ? Math.max(1, Math.round(Math.abs(hz) * Lp)) * Math.sign(hz || 1) * lph : hz * t),
    /** Cumulative energy of band b (6 = rms) as cycles: speed follows the band, whole cycles per loop. */
    flow: (b, cycles) => { const c = D.cum[clamp(b, 0, D.cum.length - 1)], at = x => { const f = clamp(x * T.fps, 0, T.frames); const j = Math.min(T.frames - 1, f | 0); return c[j] + (c[j + 1] - c[j]) * (f - j); };
      if (lp) { const e0 = at(lp.a), e1 = at(lp.b); return Math.max(1, Math.round(cycles)) * (at(t) - e0) / Math.max(1e-9, e1 - e0); } return cycles * at(t) / Math.max(1, at(T.duration)) * (T.duration / 8); },
    // read-only queries over the immutable track
    specAt: kk => F.spec(kk),
    spec: (tt, kk) => T.spec[frameAt(tt) * NS + kk],
    specFrame: (fi2, kk) => T.spec[clamp(fi2, 0, T.frames - 1) * NS + kk],
    level: (t0, t1) => { const w0 = wrap(t0), w1 = w0 + (t1 - t0), x = clamp(Math.floor(w0 * T.fps), 0, T.frames - 1), y = clamp(Math.ceil(w1 * T.fps), x + 1, T.frames); let m = 0; for (let j = x; j < y; j++) if (T.rmsRaw[j] > m) m = T.rmsRaw[j]; return Math.min(1, m / T.rmsRef); },
    peak: (t0, t1) => { const w0 = wrap(t0), w1 = w0 + (t1 - t0), c = T.peaks.cols, x = clamp(Math.floor(w0 / T.duration * c), 0, c - 1), y = clamp(Math.ceil(w1 / T.duration * c), x + 1, c); let m = 0; for (let j = x; j < y; j++) m = Math.max(m, T.peaks.max[j], -T.peaks.min[j]); return m; },
    rmsDb: () => 20 * Math.log10(Math.max(1e-5, T.rmsRaw[F.i])),
    recent: (name, win, max) => hitsBack(T[name], t, lp, win, max || 6),
    scopeAt: (tt, n, span) => { const out = new Float32Array(n), r = T.scopeRate, s0 = Math.floor((tt - span / 2) * r); for (let j = 0; j < n; j++) out[j] = T.scope[s0 + Math.floor(j * span * r / n)] || 0; return out; },
  };
}
