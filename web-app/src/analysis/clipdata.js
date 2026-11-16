// Per-frame clip data for the v8 looks: a JavaScript port of the native analysis (u2c-motion tools/clipdata.py +
// tools/meters.py). Pure (no DOM): runs in the analysis worker, on the main thread as a fallback, and in Node tests.
//
// Input: the full stereo track, the clip start (a downbeat), its length in bars and the beat period.
// The clip is gained like the export (to `target` LUFS integrated, capped so the 4x true peak stays <= tpCeil),
// so every readout shows the audio the viewer will hear. Per frame (fps, sampled at the frame's end sample c):
//  - LUFS momentary (400 ms) / short-term (3 s) / integrated (gated, BS.1770-4) / LRA (EBU 3342), running from the
//    clip start, true peak (4x oversampled) running max
//  - 1/6-octave spectrum (61 bands, 8192-pt Hann, sine-calibrated dBFS) with 24 dB/s fall and a 1 s peak hold
//  - 128-bin log spectrogram column (20 Hz..20 kHz), octave balance vs pink + tilt, 6 band energies
//  - correlation (0.3 s smoothing) and width, 160 goniometer points (S = (r-l)/√2, +S = right; M = (l+r)/√2) and the
//    full 8 kHz L/R scope stream
// Plus kick/snare/hat onsets (band spectral flux) quantised to the 16th grid, a 200 col/s tone map, a 400 col/s
// min/max/rms waveform (int8) and the whole-song overview.
import { makeFFT } from './dsp.js';
import { kCoeffs } from '../export/audio.js';
import { truePeakRange } from './truepeak.js';
import { meterStreams, POLAR_N } from './meterstreams.js';
export { POLAR_N };

export const OCT6 = Array.from({ length: 61 }, (_, i) => 1000 * 2 ** ((i - 34) / 6));
export const OCT1 = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const SPEC_BINS = 128;
export const BAND_NAMES = ['SUB', 'LOW', 'LO-MID', 'MID', 'HI-MID', 'AIR'];
const NFFT = 8192, GON = 160;
const pdb = p => 10 * Math.log10(Math.max(p, 1e-24));
const lufsOf = p => -0.691 + pdb(p);
const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);
function percentile(sorted, p) { const n = sorted.length; if (!n) return 0; const x = (n - 1) * p, i = Math.floor(x), f = x - i; return i + 1 < n ? sorted[i] + (sorted[i + 1] - sorted[i]) * f : sorted[i]; }

/** RBJ biquad (Butterworth Q for order 2) applied to x. */
function biquad(x, type, fc, sr) {
  const w = 2 * Math.PI * fc / sr, cw = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), a0 = 1 + al;
  const b = type === 'low' ? [(1 - cw) / 2, 1 - cw, (1 - cw) / 2] : [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2], a1 = -2 * cw / a0, a2 = (1 - al) / a0;
  const b0 = b[0] / a0, b1 = b[1] / a0, b2 = b[2] / a0, y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
/** K-weighted channel-summed power per sample (BS.1770). */
function kPower(L, R, sr) {
  const [A, B] = kCoeffs(sr), out = new Float64Array(L.length);
  for (const ch of [L, R]) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
    for (let i = 0; i < ch.length; i++) { const x = ch[i], y = A[0] * x + A[1] * x1 + A[2] * x2 - A[3] * y1 - A[4] * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
      const z = B[0] * y + B[1] * u1 + B[2] * u2 - B[3] * z1 - B[4] * z2; u2 = u1; u1 = y; z2 = z1; z1 = z; out[i] += z * z; } }
  return out;
}
/** Loudness over a K-power buffer: momentary / short-term / gated integrated / LRA for any end sample. */
export function loudness(pw, sr) {
  const n = pw.length, c = new Float64Array(n + 1); for (let i = 0; i < n; i++) c[i + 1] = c[i] + pw[i];
  const mean = (a, b) => { a = Math.max(0, a); b = Math.min(n, b); return (c[b] - c[a]) / Math.max(1, b - a); };
  const blk = Math.floor(.4 * sr), hop = Math.floor(.1 * sr), st = Math.floor(3 * sr), blocks = [], stb = [];
  for (let i = 0; i + blk <= n; i += hop) blocks.push([i + blk, mean(i, i + blk)]);
  for (let i = 0; i + st <= n; i += hop) stb.push([i + st, mean(i, i + st)]);
  const api = {
    n, mean,
    momentary: e => (e >= blk ? lufsOf(mean(e - blk, e)) : -Infinity),
    shortTerm: e => (e >= blk ? lufsOf(mean(e - st, e)) : -Infinity),
    integrated(e = n) { let s = 0, k = 0; const g1 = []; for (const [end, p] of blocks) { if (end > e) break; if (lufsOf(p) > -70) { g1.push(p); s += p; k++; } }
      if (!k) return -Infinity; const rel = lufsOf(s / k) - 10; let s2 = 0, k2 = 0; for (const p of g1) if (lufsOf(p) > rel) { s2 += p; k2++; } return k2 ? lufsOf(s2 / k2) : -Infinity; },
    lra(e = n) { const L = []; for (const [end, p] of stb) { if (end > e) break; const l = lufsOf(p); if (l > -70) L.push(l); }
      if (L.length < 2) return 0; const rel = lufsOf(L.reduce((a, l) => a + 10 ** ((l + .691) / 10), 0) / L.length) - 20, G = L.filter(l => l > rel).sort((a, b) => a - b);
      return G.length < 2 ? 0 : percentile(G, .95) - percentile(G, .10); },
  };
  return api;
}

/** Band power levels (dBFS, sine referenced) for [lo, hi) edges from a one-sided power spectrum P (bin width df). */
function bandPlan(edges, df, nb) {
  return edges.map(([lo, hi]) => { const k0 = Math.ceil(lo / df - 1e-9), k1 = Math.min(nb, Math.ceil(hi / df - 1e-9)); return k1 > k0 ? { k0, k1 } : { fc: Math.sqrt(lo * hi) / df, w: (hi - lo) / df }; });
}
function bandLevels(P, plan, out) {
  for (let i = 0; i < plan.length; i++) { const b = plan[i];
    if (b.k0 != null) { let s = 0; for (let k = b.k0; k < b.k1; k++) s += P[k]; out[i] = pdb(s); }
    else { const x = b.fc, j = Math.floor(x), f = x - j; out[i] = pdb((P[j] + (P[j + 1] - P[j]) * f) * b.w); } }
  return out;
}

/** Spectral-flux onsets (scipy.signal.stft-equivalent framing, periodic Hann, 1/sum(win) scaling). */
function onsets(mono, sr, lo, hi, n, hop, log, thr, gap, clipLen, q16) {
  const fft = makeFFT(n), win = new Float32Array(n); let ws = 0; for (let i = 0; i < n; i++) { win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / n); ws += win[i]; }
  const k0 = Math.ceil(lo * n / sr - 1e-9), k1 = Math.ceil(hi * n / sr - 1e-9), nk = k1 - k0, nseg = Math.max(0, Math.floor((mono.length - n) / hop) + 1);
  const re = new Float32Array(n), im = new Float32Array(n); let prev = new Float32Array(nk), cur = new Float32Array(nk); const fl = new Float32Array(nseg), tt = new Float32Array(nseg);
  for (let s = 0; s < nseg; s++) { const o = s * hop; for (let i = 0; i < n; i++) { re[i] = mono[o + i] * win[i]; im[i] = 0; } fft(re, im);
    let f = 0; for (let k = 0; k < nk; k++) { let m = Math.hypot(re[k0 + k], im[k0 + k]) / ws; if (log) m = Math.log1p(30 * m); cur[k] = m; if (s) f += Math.max(0, m - prev[k]); }
    fl[s] = f; tt[s] = (o + hop) / sr; const t = prev; prev = cur; cur = t; }
  let mx = 1e-12; for (let s = 0; s < nseg; s++) mx = Math.max(mx, fl[s]); for (let s = 0; s < nseg; s++) fl[s] /= mx + 1e-12;
  const out = [], w = 4;
  for (let i = w; i < nseg - w; i++) { if (fl[i] < thr) continue; let m = 0; for (let j = i - w; j <= i + w; j++) if (fl[j] > m) m = fl[j];
    if (fl[i] === m && (!out.length || tt[i] - out[out.length - 1][0] >= gap)) out.push([tt[i], fl[i]]); }
  const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  return out.filter(([t]) => t >= 0 && t < clipLen).map(([t, s]) => [r(t, 4), r(s, 3), r(Math.round(t / q16) * q16, 6)]);
}

/** Whole-song facts that do not depend on the clip: source loudness and a 1200-column overview (cache per buffer). */
export function songFacts(L, R, sr) {
  const lo = loudness(kPower(L, R, sr), sr), OV = 1200, n = L.length, ow = n / OV, overview = new Int16Array(OV);
  for (let i = 0; i < OV; i++) { let m = 0; for (let j = Math.floor(i * ow); j < Math.floor((i + 1) * ow); j++) { const v = Math.abs(.5 * (L[j] + R[j])); if (v > m) m = v; } overview[i] = Math.round(1000 * m); }
  return { srcLufs: Math.round(lo.integrated() * 10) / 10, overview };
}

/**
 * clipData({L, R, sr, inT, bars, beat, fps, target, tpCeil}) -> plain object of typed arrays (transferable).
 * Frame f covers clip time f/fps; values are measured at the frame's end sample c = round(f / fps * sr), like v8.
 */
export function clipData({ L, R, sr, inT, bars, beat, fps = 30, target = -14, tpCeil = -1, progress }) {
  const BAR = 4 * beat, dur = bars * BAR, n = Math.round(dur * sr), i0 = Math.round(inT * sr), NF = Math.round(dur * fps), dt = 1 / fps;
  let cL = new Float32Array(n), cR = new Float32Array(n);
  for (let i = 0; i < n; i++) { const j = i0 + i; if (j >= 0 && j < L.length) { cL[i] = L[j]; cR[i] = R[j]; } }
  const fade = Math.floor(.005 * sr); for (let i = 0; i < fade; i++) { const k = i / Math.max(1, fade - 1); cL[i] *= k; cR[i] *= k; cL[n - 1 - i] *= k; cR[n - 1 - i] *= k; }
  // gain like the export: target LUFS integrated, true peak <= tpCeil
  let pw = kPower(cL, cR, sr), gainDb = 0;
  if (target !== 'off' && target != null) { const I0 = loudness(pw, sr).integrated();
    if (Number.isFinite(I0) && I0 > -60) { gainDb = target - I0; let tp = 0; for (const ch of [cL, cR]) tp = Math.max(tp, truePeakRange(i => ch[i], n, 0, n, ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
      const tpDb = 20 * Math.log10(tp || 1e-12); if (tpDb + gainDb > tpCeil) gainDb = tpCeil - tpDb; } }
  const G = 10 ** (gainDb / 20); if (G !== 1) { for (let i = 0; i < n; i++) { cL[i] *= G; cR[i] *= G; } for (let i = 0; i < n; i++) pw[i] *= G * G; }
  const LO = loudness(pw, sr); pw = null;
  const mono = new Float32Array(n); for (let i = 0; i < n; i++) mono[i] = .5 * (cL[i] + cR[i]);
  // true peak running max (10 ms blocks)
  const tb = Math.round(sr / 100), nTB = Math.ceil(n / tb), tpRun = new Float32Array(nTB); let run = 0;
  for (let b = 0; b < nTB; b++) { const a = b * tb, e = Math.min(n, a + tb); for (const ch of [cL, cR]) { let sp = 0; for (let i = a; i < e; i++) sp = Math.max(sp, Math.abs(ch[i])); run = Math.max(run, truePeakRange(i => ch[i], n, a, e, sp)); } tpRun[b] = run; }
  // per frame
  const fft = makeFFT(NFFT), win = new Float32Array(NFFT); let S2 = 0; for (let i = 0; i < NFFT; i++) { win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (NFFT - 1)); S2 += win[i] * win[i]; }
  const nb = NFFT / 2 + 1, df = sr / NFFT, re = new Float32Array(NFFT), im = new Float32Array(NFFT), P = new Float64Array(nb);
  const plan6 = bandPlan(OCT6.map(f => [f * 2 ** (-1 / 12), f * 2 ** (1 / 12)]), df, nb), planS = bandPlan(Array.from({ length: SPEC_BINS }, (_, i) => [20 * 1000 ** (i / SPEC_BINS), 20 * 1000 ** ((i + 1) / SPEC_BINS)]), df, nb);
  const plan1 = bandPlan(OCT1.map(f => [f / Math.SQRT2, f * Math.SQRT2]), df, nb), BANDS = [[20, 60], [60, 150], [150, 500], [500, 2000], [2000, 6000], [6000, 20000]].map(([lo, hi]) => [Math.ceil(lo / df - 1e-9), Math.min(nb, Math.ceil(hi / df - 1e-9))]);
  const lx = OCT1.map(f => Math.log2(f / 1000)), lxm = lx.reduce((a, b) => a + b) / lx.length, lxv = lx.reduce((a, b) => a + (b - lxm) ** 2, 0);
  const F = { M: new Float32Array(NF), S: new Float32Array(NF), I: new Float32Array(NF), LRA: new Float32Array(NF), TP: new Float32Array(NF), corr: new Float32Array(NF), width: new Float32Array(NF),
    spec: new Float32Array(NF * 61), hold: new Float32Array(NF * 61), bal: new Float32Array(NF * 10), tilt: new Float32Array(NF), bands: new Float32Array(NF * 6), bandDb: new Float32Array(NF * 6) };
  const spectro = new Uint8Array(NF * SPEC_BINS), gonioS = new Int8Array(NF * GON), gonioM = new Int8Array(NF * GON), bandRaw = new Float64Array(NF * 6);
  const specS = new Float64Array(61).fill(-100), hold = new Float64Array(61).fill(-100), hage = new Float64Array(61), lv = new Float64Array(61), col = new Float64Array(SPEC_BINS), oc = new Float64Array(10);
  const r1 = v => Math.round(v * 10) / 10, fin = v => (Number.isFinite(v) ? r1(v) : -99);
  let corrS = 1;
  for (let f = 0; f < NF; f++) {
    const c = Math.round(f * dt * sr);
    F.M[f] = fin(LO.momentary(c)); F.S[f] = fin(LO.shortTerm(c)); F.I[f] = fin(LO.integrated(c)); F.LRA[f] = r1(LO.lra(c));
    F.TP[f] = c ? r1(20 * Math.log10(Math.max(1e-12, tpRun[Math.min(nTB - 1, Math.floor(Math.max(0, c - 1) / tb))]))) : -99;
    const w0 = Math.max(0, c - Math.floor(.1 * sr)), w1 = Math.min(n, Math.max(c, w0 + 32)); let ll = 0, rr = 0, lr = 0, mm = 0, ss = 0;
    for (let i = w0; i < w1; i++) { const l = cL[i], r = cR[i]; ll += l * l; rr += r * r; lr += l * r; const m = (l + r) / 2, s = (l - r) / 2; mm += m * m; ss += s * s; }
    const den = Math.sqrt(ll * rr), cc = den > 1e-12 ? lr / den : 0; corrS += (cc - corrS) * (1 - Math.exp(-dt / .3));
    F.corr[f] = Math.round(corrS * 1000) / 1000; F.width[f] = mm / Math.max(1, w1 - w0) > 1e-14 ? Math.round(Math.sqrt(ss / mm) * 1000) / 1000 : 0;
    // spectrum of the mono frame centred on c
    const s0 = c - NFFT / 2; for (let i = 0; i < NFFT; i++) { const j = s0 + i; re[i] = j >= 0 && j < n ? mono[j] * win[i] : 0; im[i] = 0; } fft(re, im);
    for (let k = 0; k < nb; k++) P[k] = (re[k] * re[k] + im[k] * im[k]) * 4 / (NFFT * S2);
    bandLevels(P, plan6, lv);
    for (let i = 0; i < 61; i++) { specS[i] = lv[i] > specS[i] ? lv[i] : Math.max(lv[i], specS[i] - 24 * dt); const up = specS[i] >= hold[i]; hage[i] = up ? 0 : hage[i] + dt;
      hold[i] = up ? specS[i] : hage[i] > 1 ? Math.max(specS[i], hold[i] - 12 * dt) : hold[i];
      F.spec[f * 61 + i] = Math.round(clampv(specS[i], -99, 0)); F.hold[f * 61 + i] = Math.round(clampv(hold[i], -99, 0)); }
    bandLevels(P, planS, col); for (let b = 0; b < SPEC_BINS; b++) spectro[f * SPEC_BINS + b] = clampv(Math.floor((col[b] + 100) * 255 / 100), 0, 255);
    bandLevels(P, plan1, oc); let om = 0; for (let i = 0; i < 10; i++) om += oc[i] / 10; let cov = 0; for (let i = 0; i < 10; i++) { F.bal[f * 10 + i] = r1(clampv(oc[i] - om, -24, 24)); cov += (lx[i] - lxm) * (oc[i] - om); }
    F.tilt[f] = Math.round(cov / lxv * 100) / 100;
    BANDS.forEach(([a, b], j) => { let s = 0; for (let k = a; k < b; k++) s += P[k]; bandRaw[f * 6 + j] = s; });
    // goniometer points over the frame's samples
    const v0 = Math.max(0, c - Math.floor(sr * dt)), v1 = Math.max(c - 1, v0);
    for (let q = 0; q < GON; q++) { const i = Math.min(n - 1, Math.floor(v0 + (v1 - v0) * q / (GON - 1))), l = cL[i], r = cR[i];
      gonioS[f * GON + q] = clampv(Math.round((r - l) / Math.SQRT2 * 127 / .8), -127, 127); gonioM[f * GON + q] = clampv(Math.round((l + r) / Math.SQRT2 * 127 / .8), -127, 127); }
    if (progress && f % 120 === 0) progress(f / NF * .8);
  }
  for (let j = 0; j < 6; j++) { const col6 = []; for (let f = 0; f < NF; f++) col6.push(bandRaw[f * 6 + j]); col6.sort((a, b) => a - b); const p98 = percentile(col6, .98) || 1e-30;
    for (let f = 0; f < NF; f++) F.bandDb[f * 6 + j] = Math.round(Math.max(-120, pdb(bandRaw[f * 6 + j])) * 10) / 10;
    for (let f = 0; f < NF; f++) F.bands[f * 6 + j] = Math.round(clampv(Math.sqrt(bandRaw[f * 6 + j] / p98), 0, 1.5) * 1000) / 1000; }
  // onsets on the clip, quantised to the 16th grid
  const q16 = beat / 4, ons = { kick: onsets(mono, sr, 30, 120, 1024, 128, false, .3, .2, dur, q16), snare: onsets(mono, sr, 1500, 5000, 1024, 128, true, .4, .2, dur, q16), hat: onsets(mono, sr, 7000, 16000, 512, 64, true, .35, .06, dur, q16) };
  if (progress) progress(.9);
  // tone map (200 col/s) + sample-accurate waveform (400 col/s, int8 min/max/rms per channel)
  const lowm = biquad(mono, 'low', 200, sr), him = biquad(mono, 'high', 3000, sr), CPS = 200, cols = Math.floor(dur * CPS), cw = n / cols, tone = new Uint8Array(cols * 2);
  for (let i = 0; i < cols; i++) { const a = Math.floor(i * cw), b = Math.floor((i + 1) * cw); let t = 0, lo = 0, hi = 0; for (let j = a; j < b; j++) { t += mono[j] * mono[j]; lo += lowm[j] * lowm[j]; hi += him[j] * him[j]; }
    const tot = Math.sqrt(t / Math.max(1, b - a)) + 1e-9; tone[2 * i] = Math.min(255, Math.floor(100 * Math.sqrt(lo / Math.max(1, b - a)) / tot)); tone[2 * i + 1] = Math.min(255, Math.floor(100 * Math.sqrt(hi / Math.max(1, b - a)) / tot)); }
  const CPS2 = 400, cols2 = Math.floor(dur * CPS2), cw2 = n / cols2, w2 = new Int8Array(cols2 * 6);
  for (let i = 0; i < cols2; i++) { const a = Math.floor(i * cw2), b = Math.max(a + 1, Math.floor((i + 1) * cw2));
    [cL, cR].forEach((ch, k) => { let mn = Infinity, mx = -Infinity, s = 0; for (let j = a; j < b; j++) { const v = ch[j]; if (v < mn) mn = v; if (v > mx) mx = v; s += v * v; }
      w2[i * 6 + k * 3] = clampv(Math.round(mn * 127), -127, 127); w2[i * 6 + k * 3 + 1] = clampv(Math.round(mx * 127), -127, 127); w2[i * 6 + k * 3 + 2] = clampv(Math.round(Math.sqrt(s / (b - a)) * 127), -127, 127); }); }
  // v9 Ableton-grade waveform: finest LOD ~2400 col/s, an integer number of samples per column, int16 min/max/rms per channel
  const SPC3 = Math.max(1, Math.round(sr / 2400)), cols3 = Math.floor(n / SPC3), w3 = new Int16Array(cols3 * 6), q15 = (v) => clampv(Math.round(v * 32767), -32767, 32767);
  for (let i = 0; i < cols3; i++) { const a = i * SPC3, b = a + SPC3;
    [cL, cR].forEach((ch, k) => { let mn = Infinity, mx = -Infinity, s = 0; for (let j = a; j < b; j++) { const v = ch[j]; if (v < mn) mn = v; if (v > mx) mx = v; s += v * v; }
      w3[i * 6 + k * 3] = q15(mn); w3[i * 6 + k * 3 + 1] = q15(mx); w3[i * 6 + k * 3 + 2] = q15(Math.sqrt(s / SPC3)); }); }
  if (progress) progress(0.9);
  const MSX = meterStreams({ L: cL, R: cR, sr, NF, fps, bars, barLen: Math.round(BAR * sr) });
  let tpMax = 0; for (let b = 0; b < nTB; b++) tpMax = Math.max(tpMax, tpRun[b]);
  const summary = { I: Math.round(LO.integrated() * 100) / 100, LRA: Math.round(LO.lra() * 100) / 100, TP: Math.round(20 * Math.log10(tpMax || 1e-12) * 100) / 100, gainDb: Math.round(gainDb * 100) / 100 };
  if (progress) progress(1);
  return { fps, frames: NF, duration: dur, bars, beat, bpm: 60 / beat, inT, frame: F, oct6: OCT6.map(v => Math.round(v * 100) / 100), oct1: OCT1, bandNames: BAND_NAMES,
    spectroBins: SPEC_BINS, spectro, gonioN: GON, gonioS, gonioM, ...MSX, onsets: ons, wave: { cps: CPS, tone }, wave2: { cps: CPS2, n: cols2, data: w2 }, wave3: { cps: sr / SPC3, n: cols3, spc: SPC3, sr, data: w3 }, summary };
}

/** Typed arrays of a clipData result, for postMessage transfer lists. */
export function transferables(d) {
  const t = [d.spectro.buffer, d.gonioS.buffer, d.gonioM.buffer, d.scope.L.buffer, d.scope.R.buffer, d.polar.buffer, d.wave.tone.buffer, d.wave2.data.buffer]; if (d.wave3) t.push(d.wave3.data.buffer);
  for (const k of ['pkL', 'pkR', 'msL', 'msR', 'clipL', 'clipR']) t.push(d.lv[k].buffer); if (d.be) t.push(d.be.q.buffer);
  for (const k of ['spectroM', 'spectroS', 'widthSpec', 'bandWidth', 'anSpec', 'ltas']) t.push(d.ms[k].buffer);
  for (const k in d.frame) t.push(d.frame[k].buffer); return t;
}
