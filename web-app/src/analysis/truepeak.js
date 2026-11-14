// True peak (ITU-R BS.1770-4 Annex 2 style): 4× oversampling with a 97-tap Kaiser-windowed sinc (β 8, passband ripple
// < 0.1 dB to 20 kHz at 48 kHz). Only samples near the frame's sample peak are interpolated (an inter-sample over needs
// a large neighbour), so a full stereo track costs a few ms more than the plain sample peak.
const L = 97, D = 12, OS = 4, BETA = 8;
const i0 = x => { let s = 1, t = 1; for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-12 * s) break; } return s; };
/** Phase tables: H[p][k] multiplies x[i + D - k] to give the signal at i + p/4 (p = 1..3). */
export const TP_PHASES = (() => {
  const h = new Float64Array(L), c = (L - 1) / 2; let sum = 0;
  for (let n = 0; n < L; n++) { const x = (n - c) / OS, s = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x), r = (2 * n) / (L - 1) - 1; h[n] = s * i0(BETA * Math.sqrt(Math.max(0, 1 - r * r))) / i0(BETA); sum += h[n]; }
  for (let n = 0; n < L; n++) h[n] *= OS / sum;
  const P = []; for (let p = 0; p < OS; p++) { const t = []; for (let n = p; n < L; n += OS) t.push(h[n]); const g = t.reduce((a, b) => a + b, 0); P.push(Float64Array.from(t, v => v / g)); } // unity DC gain per phase
  return P;
})();
/** Interpolated value at i + p/4 (p = 1..3) of channel x (reads by index function, zero outside [0, n)). */
export function interp(x, n, i, p) { const H = TP_PHASES[p]; let y = 0; for (let k = 0; k < H.length; k++) { const j = i + D - k; if (j >= 0 && j < n) y += H[k] * x(j); } return y; }
/** True peak (linear) of samples [a, b) given their sample peak sp: max of |x| and the 4× interpolated points. */
export function truePeakRange(x, n, a, b, sp) {
  let tp = sp; if (sp < 1e-7) return tp; const thr = .5 * sp;
  for (let i = Math.max(0, a - 1); i < b; i++) { const v0 = Math.abs(x(i)), v1 = i + 1 < n ? Math.abs(x(i + 1)) : 0; if (v0 < thr && v1 < thr) continue;
    for (let p = 1; p < OS; p++) { const y = Math.abs(interp(x, n, i, p)); if (y > tp) tp = y; } }
  return tp;
}
/** True peak of a whole channel (Float32Array), linear. */
export function truePeakOf(d) { const n = d.length, x = i => d[i]; let sp = 0; for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > sp) sp = v; }
  // scan in blocks so the candidate threshold follows the local level
  let tp = sp, blk = 4800; for (let a = 0; a < n; a += blk) { let lp = 0; const b = Math.min(n, a + blk); for (let i = a; i < b; i++) { const v = Math.abs(d[i]); if (v > lp) lp = v; } if (lp > tp * .5) tp = Math.max(tp, truePeakRange(x, n, a, b, lp)); }
  return tp; }
