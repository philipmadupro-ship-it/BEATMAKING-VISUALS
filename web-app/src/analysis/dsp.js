// Pure DSP: STFT features, onsets, tempo, key, beat grid. Runs in the analysis worker (or main thread as a fallback).
export const BAND_NAMES = ['sub', 'bass', 'lowMid', 'mid', 'hi', 'air'];
export const NB = 6, NS = 48;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
function makeFFT(N) {
  const rev = new Uint32Array(N), lg = Math.log2(N);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < lg; b++) r |= ((i >> b) & 1) << (lg - 1 - b); rev[i] = r; }
  const co = new Float32Array(N / 2), si = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) { co[i] = Math.cos(2 * Math.PI * i / N); si[i] = Math.sin(2 * Math.PI * i / N); }
  return (re, im) => {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) { const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) for (let j = i, k = 0; j < i + half; j++, k += step) { const l = j + half;
        const tr = re[l] * co[k] + im[l] * si[k], ti = -re[l] * si[k] + im[l] * co[k]; re[l] = re[j] - tr; im[l] = im[j] - ti; re[j] += tr; im[j] += ti; } }
  };
}
export function pct(arr, p) { const n = arr.length; if (!n) return 1; const st = Math.max(1, Math.floor(n / 20000)), s = []; for (let i = 0; i < n; i += st) s.push(arr[i]); s.sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 1e-9; }
function follow(src, att, rel) { const o = new Float32Array(src.length); let v = 0; for (let i = 0; i < src.length; i++) { const x = src[i]; v += (x > v ? att : rel) * (x - v); o[i] = v; } return o; }
function pick(sig, fr, k, off, gapS) {
  const n = sig.length, p = pct(sig, .985), s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = Math.min(1.5, sig[i] / p);
  const ps = new Float64Array(n + 1); for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + s[i];
  const W = Math.round(.3 * fr), T = [], S = []; let last = -1e9;
  for (let i = 2; i < n - 2; i++) { const a = Math.max(0, i - W), b = Math.min(n, i + W + 1), m = (ps[b] - ps[a]) / (b - a), v = s[i];
    if (v > m * k + off && v >= s[i-1] && v >= s[i+1] && v >= s[i-2] && v >= s[i+2] && (i - last) / fr >= gapS) { T.push(i / fr); S.push(clamp(.35 + .65 * v)); last = i; } }
  return { list: { t: Float32Array.from(T), s: Float32Array.from(S) }, norm: s };
}
const KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const KMAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88], KMIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
function corr(a, b) { const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i]-ma)*(b[i]-mb); da += (a[i]-ma)**2; db += (b[i]-mb)**2; } return n / Math.sqrt(da * db || 1); }

/** Analyse a mono signal. opts: {N, hop, progress(fraction)}. Returns a plain object of typed arrays (no grid yet). */
export function analyzeMono(mono, sr, duration, opts = {}) {
  const N = opts.N || 2048, HOP = opts.hop || 512, fr = sr / HOP, len = mono.length;
  const nF = Math.max(2, Math.floor((len - N) / HOP) + 1), nb = N / 2, binHz = sr / N;
  const fft = makeFFT(N), win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1));
  const re = new Float32Array(N), im = new Float32Array(N);
  // calibrated spectrum (dBFS, a full-scale sine = 0 dB): power per log bin, integrated over the FFT bins with fractional
  // overlap weights (so narrow low bins and wide high bins both carry the true band power; pink noise reads flat).
  // Stereo input (opts.L/R): the power is the mean of |L|² and |R|² (an out-of-phase signal still shows), and the mono
  // features use (L+R)/2 from the same two FFTs.
  const stereo = !!(opts.L && opts.R), reR = stereo ? new Float32Array(N) : null, imR = stereo ? new Float32Array(N) : null;
  const sW = []; for (let s = 0; s < NS; s++) { const f0 = 30 * Math.pow(14000 / 30, s / NS), f1 = 30 * Math.pow(14000 / 30, (s + 1) / NS), ws = [];
    for (let k = Math.max(1, Math.floor(f0 / binHz) - 1); k <= Math.min(nb - 1, Math.ceil(f1 / binHz) + 1); k++) { const ov = Math.min(f1, (k + .5) * binHz) - Math.max(f0, (k - .5) * binHz); if (ov > 0) ws.push(k, ov / binHz); }
    sW.push(Float64Array.from(ws)); }
  const specP = new Float32Array(nF * NS), pw = new Float64Array(nb), K2 = 1 / ((N / 4) * (N / 4) * 1.5);
  const BR = [[20,60],[60,200],[200,500],[500,2000],[2000,8000],[8000,16000]].map(([a, b]) => { const lo = Math.max(1, Math.round(a / binHz)); return [lo, Math.min(nb - 1, Math.max(lo + 1, Math.round(b / binHz)))]; });
  const bandsRaw = BR.map(() => new Float32Array(nF));
  const sEdge = []; for (let k = 0; k <= NS; k++) sEdge.push(Math.max(1, Math.min(nb - 1, Math.round(30 * Math.pow(14000 / 30, k / NS) / binHz))));
  const spec = new Float32Array(nF * NS), rms = new Float32Array(nF), fLo = new Float32Array(nF), fMid = new Float32Array(nF), fHi = new Float32Array(nF), cent = new Float32Array(nF);
  const kLo0 = Math.max(1, Math.round(40 / binHz)), kLo1 = Math.max(kLo0 + 1, Math.round(140 / binHz)), eLow = new Float32Array(nF), kWin = Math.max(2, Math.round(.12 * fr));
  const lo0 = Math.max(1, Math.round(30 / binHz)), lo1 = Math.max(lo0 + 1, Math.round(150 / binHz)), mid1 = Math.round(2500 / binHz), hi1 = Math.min(nb, Math.round(16000 / binHz));
  const pc = new Int8Array(nb).fill(-1); for (let k = 1; k < nb; k++) { const f = k * binHz; if (f >= 380 && f <= 4000) pc[k] = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12; }
  const chroma = new Float64Array(12); let prev = new Float32Array(nb), cur = new Float32Array(nb); const mag = new Float32Array(nb);
  for (let f = 0; f < nF; f++) {
    const off = f * HOP; let ss = 0;
    if (stereo) {
      for (let i = 0; i < N; i++) { const x = mono[off + i] || 0; ss += x * x; re[i] = (opts.L[off + i] || 0) * win[i]; im[i] = 0; reR[i] = (opts.R[off + i] || 0) * win[i]; imR[i] = 0; }
      fft(re, im); fft(reR, imR);
      for (let k = 0; k < nb; k++) { pw[k] = .5 * (re[k] * re[k] + im[k] * im[k] + reR[k] * reR[k] + imR[k] * imR[k]) * K2; re[k] = .5 * (re[k] + reR[k]); im[k] = .5 * (im[k] + imR[k]); }
    } else {
      for (let i = 0; i < N; i++) { const x = mono[off + i] || 0; ss += x * x; re[i] = x * win[i]; im[i] = 0; }
      fft(re, im); for (let k = 0; k < nb; k++) pw[k] = (re[k] * re[k] + im[k] * im[k]) * K2;
    }
    rms[f] = Math.sqrt(ss / N);
    for (let s = 0; s < NS; s++) { const ws = sW[s]; let e = 0; for (let j = 0; j < ws.length; j += 2) e += pw[ws[j]] * ws[j + 1]; specP[f * NS + s] = 10 * Math.log10(Math.max(1e-14, e)); }
    let cw = 0, cs = 0;
    for (let k = 0; k < nb; k++) { const m = Math.hypot(re[k], im[k]) / (N / 4); mag[k] = m; cur[k] = Math.log1p(m * 200); cw += m * k; cs += m; }
    cent[f] = cs > 0 ? (cw / cs) * binHz : 0;
    for (let b = 0; b < NB; b++) { const [a, c] = BR[b]; let e = 0; for (let k = a; k < c; k++) e += mag[k] * mag[k]; bandsRaw[b][f] = Math.sqrt(e / (c - a)); }
    let a = 0, b = 0, c = 0; for (let k = lo0; k < hi1; k++) { const d = cur[k] - prev[k]; if (d > 0) { if (k < lo1) a += d; else if (k < mid1) b += d; else c += d; } }
    // kick: rise of the low-band energy (40-140 Hz) in dB vs the louder of the two previous frames; a sustained or
    // decaying 808 / pad does not rise, a kick (or kick + 808 attack) jumps by 6-20 dB within a frame
    let el = 0; for (let k = kLo0; k < kLo1; k++) el += mag[k] * mag[k]; eLow[f] = el;
    let pm = 0; for (let j = Math.max(0, f - kWin); j < f; j++) if (eLow[j] > pm) pm = eLow[j];
    fLo[f] = f >= 2 ? Math.sqrt(Math.max(0, el - 1.1 * pm)) : 0; fMid[f] = b / Math.max(1, mid1 - lo1); fHi[f] = c / Math.max(1, hi1 - mid1);
    for (let s = 0; s < NS; s++) { let m = 0; const e = Math.max(sEdge[s] + 1, sEdge[s + 1]); for (let k = sEdge[s]; k < e; k++) if (cur[k] > m) m = cur[k]; spec[f * NS + s] = m; }
    if ((f & 3) === 0) for (let k = 1; k < nb; k++) if (pc[k] >= 0) chroma[pc[k]] += mag[k];
    const t = prev; prev = cur; cur = t;
    if (opts.progress && f % 500 === 0) opts.progress(f / nF);
  }
  const bands = new Float32Array(nF * NB);
  for (let b = 0; b < NB; b++) { const src = bandsRaw[b], p = pct(src, .97), o = new Float32Array(nF); for (let i = 0; i < nF; i++) o[i] = Math.min(1, Math.pow(src[i] / p, .8)); const sm = follow(o, .5, .12 * 86 / fr); for (let i = 0; i < nF; i++) bands[i * NB + b] = sm[i]; }
  const rp = pct(rms, .98); const rmsN = follow(rms.map(v => Math.min(1, v / rp)), .5, .1 * 86 / fr);
  const low = new Float32Array(nF); for (let i = 0; i < nF; i++) low[i] = Math.max(bands[i * NB], bands[i * NB + 1]);
  const lowSlow = follow(follow(low, .06, .012 * 86 / fr), .08, .03 * 86 / fr);
  const cp = pct(cent, .95); const centroid = follow(cent.map(v => Math.min(1, v / cp)), .2, .05);
  const spP = pct(spec, .995); for (let i = 0; i < spec.length; i++) spec[i] = clamp(Math.pow(spec[i] / spP, 1.6));
  const K = pick(fLo, fr, 1.45, .12, .1), Sn = pick(fMid.map((v, i) => v * .6 + fHi[i] * .4), fr, 1.5, .14, .1), Hh = pick(fHi, fr, 1.3, .08, .06);
  const env = new Float32Array(nF); for (let i = 0; i < nF; i++) env[i] = K.norm[i] + .7 * Sn.norm[i] + .3 * Hh.norm[i];
  { const W = Math.round(fr * .5), ps = new Float64Array(nF + 1); for (let i = 0; i < nF; i++) ps[i + 1] = ps[i] + env[i]; const tmp = env.slice(); for (let i = 0; i < nF; i++) { const a = Math.max(0, i - W), b = Math.min(nF, i + W + 1); env[i] = Math.max(0, tmp[i] - (ps[b] - ps[a]) / (b - a)); } }
  const bpm = detectBpm(env, fr);
  let best = -2, key = 'C maj'; for (let r = 0; r < 12; r++) { const rot = [...Array(12)].map((_, i) => chroma[(i + r) % 12]); const cM = corr(rot, KMAJ), cm = corr(rot, KMIN); if (cM > best) { best = cM; key = KEYS[r] + ' maj'; } if (cm > best) { best = cm; key = KEYS[r] + ' min'; } }
  // overview peaks + a 4 kHz scope signal for oscilloscope templates
  const cols = 2400, pkMin = new Float32Array(cols), pkMax = new Float32Array(cols); let gm = 1e-6;
  for (let c = 0; c < cols; c++) { const a = Math.floor(c * len / cols), b = Math.floor((c + 1) * len / cols); let mn = 0, mx = 0; for (let i = a; i < b; i += 2) { const v = mono[i]; if (v < mn) mn = v; if (v > mx) mx = v; } pkMin[c] = mn; pkMax[c] = mx; gm = Math.max(gm, mx, -mn); }
  for (let c = 0; c < cols; c++) { pkMin[c] /= gm; pkMax[c] /= gm; }
  const dec = Math.max(1, Math.round(sr / 4000)), scopeRate = sr / dec, scope = new Float32Array(Math.floor(len / dec));
  for (let i = 0; i < scope.length; i++) scope[i] = mono[i * dec] / gm;
  return { duration, sampleRate: sr, fps: fr, frames: nF, bandCount: NB, bandNames: BAND_NAMES, bands, specBins: NS, spec, rms: rmsN, rmsRaw: rms, rmsRef: rp, lowSlow, centroid,
    kicks: K.list, snares: Sn.list, hats: Hh.list, kickEnv: K.norm, onsetEnv: env, bpmDetected: bpm, key, peaks: { cols, min: pkMin, max: pkMax }, scope, scopeRate, specP, specStereo: stereo };
}
export function detectBpm(env, fr) {
  const nF = env.length, nUse = Math.min(nF, Math.round(fr * 150)), minL = Math.max(1, Math.floor(60 * fr / 185)), maxL = Math.ceil(60 * fr / 68), acN = maxL * 4 + 4, ac = new Float64Array(acN);
  for (let l = minL; l < acN; l++) { let s = 0; for (let i = 0; i + l < nUse; i++) s += env[i] * env[i + l]; ac[l] = s / Math.max(1, nUse - l); }
  const acAt = x => { const i = Math.floor(x), a = x - i; return i + 1 < acN ? ac[i] * (1 - a) + ac[i + 1] * a : 0; };
  const score = l => acAt(l) + .5 * acAt(2 * l) + .25 * acAt(3 * l) + .25 * acAt(4 * l);
  let bestL = minL, bs = -1; for (let l = Math.floor(60 * fr / 180); l <= Math.ceil(60 * fr / 70); l++) { const s = score(l); if (s > bs) { bs = s; bestL = l; } }
  const y0 = score(bestL - 1), y1 = score(bestL), y2 = score(bestL + 1), den = y0 - 2 * y1 + y2, dl = den !== 0 ? clamp(.5 * (y0 - y2) / den, -.5, .5) : 0;
  let bpm = 60 * fr / (bestL + dl); if (bpm < 100 && bpm * 2 <= 180) bpm *= 2; else if (bpm > 170) bpm /= 2;
  if (Math.abs(bpm - Math.round(bpm)) < .35) bpm = Math.round(bpm);
  return Math.round(bpm * 100) / 100;
}
/** Beat grid for a given bpm. If t0 is omitted the phase/downbeat are estimated from the onset envelope. */
export function makeGrid(a, bpm, t0) {
  bpm = clamp(+bpm || 120, 40, 250); const spb = 60 / bpm, fr = a.fps, spbF = fr * spb, env = a.onsetEnv, n = a.frames, bar = 4 * spb;
  if (t0 == null) {
    let bp = 0, bs = -1; for (let ph = 0; ph < spbF; ph += .5) { let s = 0; for (let x = ph; x < n; x += spbF) s += env[Math.round(x)] || 0; if (s > bs) { bs = s; bp = ph; } }
    let bj = 0, bjs = -1; for (let j = 0; j < 4; j++) { let s = 0; for (let x = bp + j * spbF; x < n; x += 4 * spbF) s += a.kickEnv[Math.round(x)] || 0; if (s > bjs) { bjs = s; bj = j; } }
    t0 = (((bp + bj * spbF) / fr) % bar + bar) % bar;
  }
  t0 = ((t0 % bar) + bar) % bar;
  const nBars = Math.max(1, Math.floor((a.duration - t0) / bar + 1e-6));
  const bars = new Float64Array(nBars), beats = new Float64Array(nBars * 4), energyCurve = new Float32Array(nBars);
  for (let k = 0; k < nBars; k++) { bars[k] = t0 + k * bar; for (let j = 0; j < 4; j++) beats[k * 4 + j] = t0 + (k * 4 + j) * spb;
    const i0 = Math.floor(bars[k] * fr), i1 = Math.min(n, Math.floor((bars[k] + bar) * fr)); let s = 0, kk = 0;
    for (let i = i0; i < i1; i++) s += a.rmsRaw[i];
    // transient on beat 1 makes a better hook start
    const ki = Math.round(bars[k] * fr); for (let i = Math.max(0, ki - 2); i <= Math.min(n - 1, ki + 2); i++) kk = Math.max(kk, a.kickEnv[i]);
    energyCurve[k] = s / Math.max(1, i1 - i0) + .02 * kk * a.rmsRef; }
  // drops: bars whose energy jumps well above the previous 4 bars
  const drops = [];
  for (let k = 4; k < nBars; k++) { let m = 0; for (let j = k - 4; j < k; j++) m += energyCurve[j]; m /= 4; if (energyCurve[k] > m * 1.45 && energyCurve[k] > .6 * Math.max(...energyCurve)) drops.push(bars[k]); }
  return { bpm, spb, t0, barDur: bar, bars, beats, energyCurve, drops: Float64Array.from(drops) };
}
