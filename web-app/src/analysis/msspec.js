// Hop STFT of the clip's L and R (NFFT 8192, periodic Hann, hop 1024 = 87.5 % overlap) and everything the imager,
// the M/S spectrogram and the EQ analyzer read from it, per video frame (frame f ends at sample c = f/fps·sr; the hops
// whose centre lies in (c - 1/fps, c] belong to it). Pure: worker, main thread and Node tests.
//  - spectral M/S per bin: XM = (XL+XR)/2, XS = (XL-XR)/2 (linear, from the two FFTs). Mono -> S = 0; hard-left -> M = S.
//  - spectroM / spectroS: 128 log bands 20 Hz..20 kHz, band power (sine-referenced dBFS), one shared encoding
//    (v = (dB + 100)·255/100, as the existing spectrogram), so S is never normalised up.
//  - widthSpec: per-bin EMA (τ 0.25 s) of PM and PS, then a 1/6-oct power mean at 64 log centres: W = PS/(PM+PS) · 255.
//  - bandWidth: 4 bands split at 120 Hz / 1.2 kHz / 6 kHz, EMA τ 0.3 s of ΣPS and ΣPM, width % = 100·√(ΣPS/ΣPM).
//  - anSpec: analyzer of (|XL|²+|XR|²)/2, coherent scaling 4/(Σw)² (a bin-centred full-scale sine = 0 dB), max over the
//    frame's hops, projected to 512 log bins 20 Hz..30 kHz keeping peaks (max of the bins inside a log bin plus a
//    Catmull-Rom interpolation in dB at its two edges). Uint8, dB = -v/2. No tilt baked in.
//  - ltas: per clip bar the mean power per bin, 1/3-oct power mean on a 96-point log grid (dB), for the match EQ.
import { makeFFT } from './dsp.js';
import { ltasGrid } from '../v8/meterlib.js';
export const MS_BANDS = 128, W_BINS = 64, AN_BINS = 512, AN_FMAX = 30000, XOVER = [120, 1200, 6000], LTAS_N = 96;
export const anFreq = (j) => 20 * (AN_FMAX / 20) ** (j / AN_BINS);   // edge j of the analyzer's log bins
export const wFreq = (j) => 20 * 1000 ** ((j + 0.5) / W_BINS);
const pdb = (p) => 10 * Math.log10(Math.max(p, 1e-30)), cl = (v, a, b) => (v < a ? a : v > b ? b : v);

export function stereoSpectra({ L, R, sr, NF, fps, bars = 1, barLen = L.length }) {
  const N = 8192, HOP = 1024, nb = N / 2 + 1, df = sr / N, n = L.length, fft = makeFFT(N);
  const win = new Float32Array(N); let sw = 0, sw2 = 0; for (let i = 0; i < N; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); sw += win[i]; sw2 += win[i] * win[i]; }
  const kCoh = 4 / (sw * sw), kPow = 4 / (N * sw2);
  const re = new Float32Array(N), im = new Float32Array(N), PL = new Float64Array(nb), PR = new Float64Array(nb), PM = new Float64Array(nb), PS = new Float64Array(nb);
  const eM = new Float64Array(nb), eS = new Float64Array(nb), aW = 1 - Math.exp(-HOP / sr / 0.25), aB = 1 - Math.exp(-HOP / sr / 0.3);
  const bandK = [0, ...XOVER.map((f) => Math.round(f / df)), Math.min(nb - 1, Math.round(20000 / df))], bM = new Float64Array(4), bS = new Float64Array(4);
  // band plans (whole bins whose centre lies in [lo, hi); a band narrower than a bin reads the interpolated bin)
  const plan = (lo, hi) => { const k0 = Math.ceil(lo / df - 1e-9), k1 = Math.min(nb, Math.ceil(hi / df - 1e-9)); return k1 > k0 ? [k0, k1, 0] : [lo / df, hi / df, 1]; };
  const sumP = (P, pl) => { if (!pl[2]) { let s = 0; for (let k = pl[0]; k < pl[1]; k++) s += P[k]; return s; } const x = (pl[0] + pl[1]) / 2, j = Math.min(nb - 2, Math.floor(x)), u = x - j; return (P[j] + (P[j + 1] - P[j]) * u) * (pl[1] - pl[0]); };
  const planMS = Array.from({ length: MS_BANDS }, (_, i) => plan(20 * 1000 ** (i / MS_BANDS), 20 * 1000 ** ((i + 1) / MS_BANDS)));
  const planW = Array.from({ length: W_BINS }, (_, j) => { const f = wFreq(j), k0 = Math.ceil(f * 2 ** (-1 / 12) / df - 1e-9), k1 = Math.floor(f * 2 ** (1 / 12) / df + 1e-9); return k1 >= k0 ? [k0, k1 + 1] : [Math.round(f / df), Math.round(f / df) + 1]; });
  const grid = ltasGrid(LTAS_N), planT = grid.map((f) => { const k0 = Math.max(1, Math.ceil(f * 2 ** (-1 / 6) / df - 1e-9)), k1 = Math.min(nb - 1, Math.floor(f * 2 ** (1 / 6) / df + 1e-9)); return k1 >= k0 ? [k0, k1 + 1] : [Math.round(f / df), Math.round(f / df) + 1]; });
  const spectroM = new Uint8Array(NF * MS_BANDS), spectroS = new Uint8Array(NF * MS_BANDS), widthSpec = new Uint8Array(NF * W_BINS), bandWidth = new Float32Array(NF * 4), anSpec = new Uint8Array(NF * AN_BINS);
  const barSum = Array.from({ length: bars }, () => new Float64Array(nb)), barCnt = new Float64Array(bars);
  const fMax = new Float64Array(nb), fM = new Float64Array(nb), fS = new Float64Array(nb), dbv = new Float64Array(nb);
  const nH = Math.floor(n / HOP) + 1; let h = 0, haveHop = false;
  const hopRun = (hh) => {   // L + iR packed in one complex FFT, then separated
    const s0 = hh * HOP - N / 2; for (let i = 0; i < N; i++) { const j = s0 + i, ok = j >= 0 && j < n; re[i] = ok ? L[j] * win[i] : 0; im[i] = ok ? R[j] * win[i] : 0; }
    fft(re, im);
    for (let k = 0; k < nb; k++) { const k2 = (N - k) % N, zr = re[k], zi = im[k], wr = re[k2], wi = -im[k2];
      const lr = 0.5 * (zr + wr), li = 0.5 * (zi + wi), rr = 0.5 * (zi - wi), ri = -0.5 * (zr - wr);   // XL = (Z+Z*')/2, XR = (Z-Z*')/2i
      PL[k] = lr * lr + li * li; PR[k] = rr * rr + ri * ri; PM[k] = 0.25 * ((lr + rr) ** 2 + (li + ri) ** 2); PS[k] = 0.25 * ((lr - rr) ** 2 + (li - ri) ** 2); }
    for (let k = 0; k < nb; k++) { eM[k] += aW * (PM[k] - eM[k]); eS[k] += aW * (PS[k] - eS[k]); }
    for (let b = 0; b < 4; b++) { let m = 0, s = 0; for (let k = Math.max(1, bandK[b]); k < bandK[b + 1]; k++) { m += PM[k]; s += PS[k]; } bM[b] += aB * (m - bM[b]); bS[b] += aB * (s - bS[b]); }
    const bar = Math.min(bars - 1, Math.floor(hh * HOP / barLen)); if (hh * HOP < n) { const bs = barSum[bar]; for (let k = 0; k < nb; k++) bs[k] += 0.5 * (PL[k] + PR[k]); barCnt[bar]++; }
  };
  const hermite = (x) => { const k = cl(Math.floor(x), 0, nb - 1), u = x - k, p0 = dbv[Math.max(0, k - 1)], p1 = dbv[k], p2 = dbv[Math.min(nb - 1, k + 1)], p3 = dbv[Math.min(nb - 1, k + 2)];
    return p1 + 0.5 * u * (p2 - p0 + u * (2 * p0 - 5 * p1 + 4 * p2 - p3 + u * (3 * (p1 - p2) + p3 - p0))); };
  for (let f = 0; f < NF; f++) {
    const c = f / fps * sr, a = c - sr / fps; let cnt = 0; fMax.fill(0); fM.fill(0); fS.fill(0);
    while (h < nH && h * HOP <= c) { hopRun(h); haveHop = true; if (h * HOP > a) { cnt++; for (let k = 0; k < nb; k++) { const p = 0.5 * (PL[k] + PR[k]); if (p > fMax[k]) fMax[k] = p; fM[k] += PM[k]; fS[k] += PS[k]; } } h++; }
    if (!cnt) { if (!haveHop) { hopRun(0); h = 1; haveHop = true; } for (let k = 0; k < nb; k++) { fMax[k] = 0.5 * (PL[k] + PR[k]); fM[k] = PM[k]; fS[k] = PS[k]; } cnt = 1; }
    for (let i = 0; i < MS_BANDS; i++) { const o = f * MS_BANDS + i; spectroM[o] = cl(Math.floor((pdb(sumP(fM, planMS[i]) * kPow / cnt) + 100) * 2.55), 0, 255); spectroS[o] = cl(Math.floor((pdb(sumP(fS, planMS[i]) * kPow / cnt) + 100) * 2.55), 0, 255); }
    for (let j = 0; j < W_BINS; j++) { const [k0, k1] = planW[j]; let m = 0, s = 0; for (let k = k0; k < k1; k++) { m += eM[k]; s += eS[k]; } widthSpec[f * W_BINS + j] = m + s > 1e-20 ? Math.round(255 * s / (m + s)) : 0; }
    for (let b = 0; b < 4; b++) bandWidth[f * 4 + b] = bM[b] > 1e-20 ? Math.round(cl(100 * Math.sqrt(bS[b] / bM[b]), 0, 999) * 10) / 10 : 0;
    for (let k = 0; k < nb; k++) dbv[k] = pdb(fMax[k] * kCoh);
    for (let j = 0; j < AN_BINS; j++) { const xa = anFreq(j) / df, xb = anFreq(j + 1) / df; let v;
      if (xa >= nb - 1) v = -150; else { v = Math.max(hermite(xa), hermite(Math.min(xb, nb - 1))); for (let k = Math.ceil(xa); k <= Math.min(nb - 1, Math.floor(xb)); k++) if (dbv[k] > v) v = dbv[k]; }
      anSpec[f * AN_BINS + j] = cl(Math.round(-2 * v), 0, 255); }
  }
  while (h < nH) { hopRun(h); h++; }   // the rest of the clip still counts toward the bar LTAS
  const ltas = new Float32Array(bars * LTAS_N);
  for (let b = 0; b < bars; b++) { const bs = barSum[b], nc = Math.max(1, barCnt[b]); for (let i = 0; i < LTAS_N; i++) { const [k0, k1] = planT[i]; let s = 0; for (let k = k0; k < k1; k++) s += bs[k]; ltas[b * LTAS_N + i] = Math.round(pdb(s / (k1 - k0) / nc * kPow) * 100) / 100; } }
  return { spectroM, spectroS, widthSpec, bandWidth, anSpec, ltas, ltasN: LTAS_N, anBins: AN_BINS, anFmax: AN_FMAX, wBins: W_BINS, xover: XOVER };
}
