// Band detector stream for the dynamic EQ display (v11): the mono sum (L+R)/2 through six band-pass filters (the same
// six bands as the per-frame band meters: 20-60 / 60-150 / 150-500 / 0.5-2k / 2-6k / 6-20k Hz, 4th-order Butterworth
// high-pass + low-pass, RBJ biquads), then the band energy (v^2 through a one-pole smoother with a per-band time constant, long enough for the band's own
// ripple: 12 / 6 / 3 / 1.5 / 1 / 1 ms) read every 1 ms, in dB. Unlike the per-frame bands (an
// 8192-pt window centred on the frame, which smears a kick about +-85 ms) this follows a kick to the millisecond, so a
// sidechain-style gain reduction can land on the beat. Stored as Uint8 (dB = q / 2 - 120, i.e. -120 .. +7.5 dB).
import { rbj } from '../v8/meterlib.js';
export const BE_EDGES = [[20, 60], [60, 150], [150, 500], [500, 2000], [2000, 6000], [6000, 20000]];
export const BE_RATE = 1000, BE_TAU_MS = [12, 6, 3, 1.5, 1, 1];
const Q_BW = Math.SQRT1_2;
function biquad(co) { const [b0, b1, b2, a0, a1, a2] = co, B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; }; }
export function bandEnvStream({ L, R, sr }) {
  const n = L.length, nb = BE_EDGES.length, nBlk = Math.floor(n * BE_RATE / sr), q = new Uint8Array(nBlk * nb), mono = new Float64Array(n);
  for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) / 2;
  BE_EDGES.forEach(([lo, hi], j) => {
    const chain = [biquad(rbj('HP', lo, 0, Q_BW, sr)), biquad(rbj('HP', lo, 0, Q_BW, sr)), biquad(rbj('LP', Math.min(hi, sr * 0.45), 0, Q_BW, sr)), biquad(rbj('LP', Math.min(hi, sr * 0.45), 0, Q_BW, sr))];
    const k = 1 - Math.exp(-1000 / (BE_TAU_MS[j] * sr)); let p = 0;
    for (let b = 0; b < nBlk; b++) { const a = Math.round(b * sr / BE_RATE), e = Math.round((b + 1) * sr / BE_RATE);
      for (let i = a; i < e; i++) { let v = mono[i]; for (let c = 0; c < 4; c++) v = chain[c](v); p += (v * v - p) * k; }
      const db = 10 * Math.log10(Math.max(p, 1e-30)); q[b * nb + j] = Math.max(0, Math.min(255, Math.round((db + 120) * 2))); } });
  return { rate: BE_RATE, n: nBlk, nb, q };
}
