// Stereo metering features, computed once per decoded file on the main thread (one linear pass, ~100 ms per minute):
// 100 Hz frames of per-channel sample peak (with an inter-sample estimate), mean square, K-weighted mean square
// (ITU-R BS.1770) and L·R products for correlation, plus an 8 kHz L/R scope for the goniometer.
// Mono files are mirrored to R with a slight decorrelation and flagged `mono`.
import { kWeight } from '../export/audio.js';
export function stereoFeatures(buffer) {
  const sr = buffer.sampleRate, n = buffer.length, L = buffer.getChannelData(0), Rraw = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  let mono = Rraw === L; if (!mono) { let d = 0, e = 0; for (let i = 0; i < n; i += 97) { d += Math.abs(L[i] - Rraw[i]); e += Math.abs(L[i]); } mono = d < e * 1e-4; }
  const R = mono ? (() => { const r = new Float32Array(n); for (let i = 0; i < n; i++) r[i] = .985 * L[i] + .015 * (L[i - 3] || 0); return r; })() : Rraw;
  const KL = kWeight(L, sr), KR = mono ? KL : kWeight(R, sr), hop = Math.round(sr / 100), nF = Math.ceil(n / hop);
  const peakL = new Float32Array(nF), peakR = new Float32Array(nF), msL = new Float32Array(nF), msR = new Float32Array(nF);
  const cumK = new Float64Array(nF + 1), cLR = new Float64Array(nF + 1), cLL = new Float64Array(nF + 1), cRR = new Float64Array(nF + 1);
  for (let f = 0; f < nF; f++) { const a = f * hop, b = Math.min(n, a + hop); let pl = 0, pr = 0, sl = 0, srr = 0, k = 0, lr = 0;
    for (let i = a; i < b; i++) { const l = L[i], r = R[i], al = Math.abs(l), ar = Math.abs(r); if (al > pl) pl = al; if (ar > pr) pr = ar;
      if (i > a) { const ml = Math.abs(l + L[i - 1]) * .53, mr = Math.abs(r + R[i - 1]) * .53; if (ml > pl) pl = ml; if (mr > pr) pr = mr; } // inter-sample estimate
      sl += l * l; srr += r * r; lr += l * r; k += KL[i] * KL[i] + KR[i] * KR[i]; }
    const m = Math.max(1, b - a); peakL[f] = pl; peakR[f] = pr; msL[f] = sl / m; msR[f] = srr / m;
    cumK[f + 1] = cumK[f] + k / m; cLR[f + 1] = cLR[f] + lr / m; cLL[f + 1] = cLL[f] + sl / m; cRR[f + 1] = cRR[f] + srr / m; }
  const dec = Math.max(1, Math.round(sr / 8000)), sN = Math.floor(n / dec), sL = new Float32Array(sN), sR = new Float32Array(sN);
  for (let i = 0; i < sN; i++) { sL[i] = L[i * dec]; sR[i] = R[i * dec]; }
  return Object.freeze({ fr: 100, nF, mono, peakL, peakR, msL, msR, cumK, cLR, cLL, cRR, scopeRate: sr / dec, sL, sR });
}
