// Pure meter maths (no DOM): shared by the v8 meters (src/v8/meters.js), the analysis (src/analysis/clipdata.js) and
// the Node tests (tests/meters.mjs). Everything here is written fresh from published formulas and documented numbers:
//  - stereo scope geometry (rotation m = (l+r)/√2, s = (r-l)/√2, +s = right; point reflection for m < 0)
//  - DAW meter ballistics (peak release in dB/s, peak hold then fall, rectangular RMS windows, K-system calibration)
//  - the measured Live 12 meter scale table (facts measured from public screenshots, see METERS-SPEC §3)
//  - RBJ Audio EQ Cookbook biquads and their exact magnitude (|H|² in sin²(w/2) form)
//  - the per-section spectral-balance "match" EQ fit against a -4.5 dB/oct reference
export const SQ = Math.SQRT1_2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const dB = (p) => 10 * Math.log10(Math.max(p, 1e-30));
export const dBa = (a) => 20 * Math.log10(Math.max(a, 1e-15));

// ---------------------------------------------------------------- stereo scope
/** Rotate one L/R sample pair: m (mid, up), s (side, +s = right). Orthonormal, so hard-panned |x| = 1 reaches radius 1. */
export const msOf = (l, r) => [(l + r) * SQ, (r - l) * SQ];
/**
 * Polar-sample position of one L/R pair inside a unit half-disc (x right, y up, baseline at y = 0).
 * Negative mid is point-reflected (m, s) -> (-m, -s) so the half-disc keeps the side information; theta 0 = centre,
 * ±45° = hard right / left, beyond ±45° = out of phase, ±90° = anti-phase. Radius: log, `range` dB to the rim.
 */
export function polarSample(l, r, range = 40) {
  let m = (l + r) * SQ, s = (r - l) * SQ; if (m < 0) { m = -m; s = -s; }
  const rl = Math.hypot(m, s); if (rl < 1e-9) return null;
  const th = Math.atan2(s, m), rho = clamp(1 + dBa(rl) / range, 0, 1);
  return [rho * Math.sin(th), rho * Math.cos(th), th, rl];
}
/** Lissajous position (no fold): x = side (right +), y = mid (up +), times gain g. L lies up-left, R up-right. */
export function lissajous(l, r, g = 1) { return [(r - l) * SQ * g, (l + r) * SQ * g]; }
/** Sector (0..n-1) of the polar angle theta in [-90°, 90°]. */
export const sectorOf = (th, n = 90) => clamp(Math.floor((th + Math.PI / 2) / Math.PI * n), 0, n - 1);
/** Per-frame polar-level energies: Lj = 10·log10(Σρ² in sector j / N) for the samples [a, b) of the scope stream. */
export function polarLevels(L, R, a, b, n = 90, out = new Float32Array(n), scale = 1) {
  const E = new Float64Array(n); let N = 0;
  for (let i = a; i < b; i++) { const p = polarSample(L[i] * scale, R[i] * scale, 1e9); N++; if (!p) continue; E[sectorOf(p[2], n)] += p[3] * p[3]; }
  for (let j = 0; j < n; j++) out[j] = N ? Math.max(-150, dB(E[j] / N)) : -150;
  return out;
}
/** Instant-attack, linear-release (dB/s) envelope over a per-frame dB series, read at frame f (scan back). */
export function releaseAt(get, f, fps, rel, floor = -150, hold = 0) {
  let v = floor; const span = Math.ceil((hold + (0 - floor) / Math.max(rel, 1e-3)) * fps) + 1;
  for (let j = 0; j <= span && f - j >= 0; j++) { const age = j / fps, x = get(f - j) - rel * Math.max(0, age - hold); if (x > v) v = x; }
  return v;
}

// ---------------------------------------------------------------- correlation / balance (from 1 ms blocks)
/** Balance in dB over the window [t - win, t): 10·log10(ΣR² / ΣL²), negative = left louder (SPAN convention). */
export function balanceAt(lv, t, win = 3) {
  const b1 = clamp(Math.floor(t * lv.rate), 0, lv.n), b0 = Math.max(0, b1 - Math.round(win * lv.rate)); let sl = 0, sr = 0;
  for (let b = b0; b < b1; b++) { sl += lv.msL[b]; sr += lv.msR[b]; }
  return sl + sr < 1e-14 ? 0 : clamp(dB(sr + 1e-30) - dB(sl + 1e-30), -60, 60);
}

// ---------------------------------------------------------------- level meters
// lv = { rate: 1000, n, pkL, pkR (sample peak per 1 ms block, linear), msL, msR (mean square per block), clipL, clipR }
/**
 * Meter readout at clip time t for channel ch (0 = L, 1 = R). opts: rel (peak release, dB/s), hold (s), rmsWin (s),
 * floor (dB). Peak: instant attack, linear release; the value shown in a video frame is the max of the ballistic
 * envelope over the frame interval (t - 1/fps, t]. Hold: peak held `hold` s, then falls at `rel`.
 * RMS: 20·log10 √(mean x²) over the rectangular window ending at t. Max: running sample peak since the clip start.
 * Clip: any two consecutive samples at full scale so far (latched).
 */
export function levelAt(lv, ch, t, { rel = 20, hold = 1.5, rmsWin = 0.3, fps = 30, floor = -150, running = true } = {}) {
  const P = ch ? lv.pkR : lv.pkL, MS = ch ? lv.msR : lv.msL, CL = ch ? lv.clipR : lv.clipL, rate = lv.rate;
  const b1 = clamp(Math.floor(t * rate + 1e-6), 0, lv.n), bF = Math.max(0, b1 - Math.round(rate / fps));
  const per = 1 / rate, back = Math.ceil((hold + (0 - floor) / rel) * rate) + 1;
  let pk = floor, hd = floor;
  for (let b = b1 - 1, k = 0; b >= 0 && k <= back; b--, k++) {
    const p = dBa(P[b]); if (p <= floor) continue;
    const ageF = Math.max(0, (bF - 1 - b) * per), ageH = (b1 - 1 - b) * per;   // to the frame start / to t
    const v = b >= bF ? p : p - rel * ageF; if (v > pk) pk = v;
    const h = p - rel * Math.max(0, ageH - hold); if (h > hd) hd = h;
  }
  const w = Math.max(1, Math.round(rmsWin * rate)), r0 = Math.max(0, b1 - w); let s = 0; for (let b = r0; b < b1; b++) s += MS[b];
  const rms = b1 > 0 ? Math.max(floor, dB(s / w)) : floor;
  let mx = 0, clip = false; if (running) for (let b = 0; b < b1; b++) { if (P[b] > mx) mx = P[b]; if (CL[b]) clip = true; }
  return { pk: Math.max(floor, pk), hold: Math.max(floor, hd), rms, max: Math.max(floor, dBa(mx)), clip };
}
/** Meter mode -> RMS window and calibration (K-system: 600 ms, +3.01 dB sine calibration, 0 at -K dBFS). */
export function modeSpec(mode) {
  const k = /^k(\d+)$/i.exec(mode || ''); if (k) return { rmsWin: 0.6, cal: 3.0103, K: +k[1], kmode: true };
  return { rmsWin: 0.3, cal: 0, K: 0, kmode: false };
}

// ---------------------------------------------------------------- meter scale
/** Live 12 track meter, measured: normalised position (1 = +6 dB) for dB. Below -60 the scale runs linearly on. */
export const LIVE_SCALE = [[6, 1], [0, 0.912], [-6, 0.805], [-12, 0.699], [-18, 0.592], [-24, 0.483], [-30, 0.372], [-36, 0.277], [-42, 0.195], [-48, 0.123], [-54, 0.058], [-60, 0]];
/** Position 0..1 of a dB value. scale 'live' (the table, +6..-60) or 'linear' (dB-linear from -range to top). */
export function dbPos(db, scale = 'live', range = 60, top = 6) {
  if (scale === 'linear') return clamp((db + range) / (range + top), 0, 1);
  if (db >= 6) return 1;
  for (let i = 0; i < LIVE_SCALE.length - 1; i++) { const [d0, p0] = LIVE_SCALE[i], [d1, p1] = LIVE_SCALE[i + 1]; if (db >= d1) return p1 + (p0 - p1) * (db - d1) / (d0 - d1); }
  return 0;   // below -60 dB the measured scale ends at the floor
}

// ---------------------------------------------------------------- RBJ cookbook biquads
/** Coefficients [b0, b1, b2, a0, a1, a2] (not normalised). type: BELL | LS | HS | HP | LP. */
export function rbj(type, f0, G, Q, fs = 96000) {
  const A = 10 ** (G / 40), w0 = 2 * Math.PI * Math.min(f0, fs * 0.49) / fs, c = Math.cos(w0), al = Math.sin(w0) / (2 * Q), sA = 2 * Math.sqrt(A) * al;
  switch (type) {
    case 'LS': return [A * ((A + 1) - (A - 1) * c + sA), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sA), (A + 1) + (A - 1) * c + sA, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sA];
    case 'HS': return [A * ((A + 1) + (A - 1) * c + sA), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sA), (A + 1) - (A - 1) * c + sA, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sA];
    case 'HP': return [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al];
    case 'LP': return [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al];
    default: return [1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A];
  }
}
/** Exact magnitude in dB of a biquad at frequency f: |H|² in φ = sin²(w/2) form (numerically stable at low f). */
export function magDb(co, f, fs = 96000) {
  const [b0, b1, b2, a0, a1, a2] = co, w = 2 * Math.PI * f / fs, s = Math.sin(w / 2), p = s * s;
  const num = (b0 + b1 + b2) ** 2 - 4 * (b0 * b1 + 4 * b0 * b2 + b1 * b2) * p + 16 * b0 * b2 * p * p;
  const den = (a0 + a1 + a2) ** 2 - 4 * (a0 * a1 + 4 * a0 * a2 + a1 * a2) * p + 16 * a0 * a2 * p * p;
  return 10 * Math.log10(Math.max(num, 1e-300) / Math.max(den, 1e-300));
}
/** A band {type, f, g, q} -> coefficients, cached on the object. */
export const coefOf = (b, fs = 96000) => (b._c && b._k === `${b.type}|${b.f}|${b.g}|${b.q}|${fs}` ? b._c : (b._k = `${b.type}|${b.f}|${b.g}|${b.q}|${fs}`, b._c = rbj(b.type, b.f, b.g, b.q, fs)));
/** Summed (cascaded) response in dB of a band list at f. */
export const sumDb = (bands, f, fs = 96000) => bands.reduce((a, b) => a + magDb(coefOf(b, fs), f, fs), 0);

// ---------------------------------------------------------------- match EQ fit (per section)
/** Log frequency grid used by the LTAS (n points, 20 Hz .. 20 kHz). */
export const ltasGrid = (n = 96) => Array.from({ length: n }, (_, i) => 20 * 1000 ** ((i + 0.5) / n));
/**
 * Fit up to `max` bands to the long-term spectrum `ltasDb` (dBFS per grid point, 1/3-oct smoothed, power) so the
 * section moves toward a -4.5 dB/oct reference (flat after the +tilt), at `strength` (50 % suggestion):
 *   LTAS_t = LTAS + tilt·log2(f/1k); target = mean(LTAS_t, 100 Hz..5 kHz); d = LTAS_t - target on 30 Hz..16 kHz
 *   correction c = -strength·d; greedy: f* = argmax |c - Σbands|; G = clamp(residual, ±6); Q from the half-residual
 *   points (0.5..4); LS below 120 Hz / HS above 7 kHz when the deviation runs to that edge, else a bell; stop when the
 *   residual < strength·1.5 dB.
 */
export function fitMatch(freqs, ltasDb, { tilt = 4.5, strength = 0.5, max = 4, fs = 96000, stop = 1.5 } = {}) {
  const n = freqs.length, lt = ltasDb.map((v, i) => v + tilt * Math.log2(freqs[i] / 1000));
  if (!lt.some((v, i) => Number.isFinite(v) && ltasDb[i] > -120)) return [];
  let s = 0, k = 0; for (let i = 0; i < n; i++) if (freqs[i] >= 100 && freqs[i] <= 5000) { s += lt[i]; k++; }
  const target = s / Math.max(1, k), use = freqs.map((f) => f >= 30 && f <= 16000);
  const c = lt.map((v, i) => (use[i] ? clamp(-strength * (v - target), -12, 12) : 0)), bands = [];
  for (let it = 0; it < max; it++) {
    const res = c.map((v, i) => (use[i] ? v - sumDb(bands, freqs[i], fs) : 0));
    let im = -1, am = 0; for (let i = 0; i < n; i++) if (use[i] && Math.abs(res[i]) > am) { am = Math.abs(res[i]); im = i; }
    if (im < 0 || am < strength * stop) break;
    const sg = Math.sign(res[im]); let lo = im, hi = im;
    while (lo > 0 && use[lo - 1] && sg * res[lo - 1] > am / 2) lo--;
    while (hi < n - 1 && use[hi + 1] && sg * res[hi + 1] > am / 2) hi++;
    const fz = freqs[im], flo = freqs[lo] * 2 ** (-1 / 12), fhi = freqs[hi] * 2 ** (1 / 12);
    // a shelf only when the deviation runs out to that edge of the fitted range (and once per side); else a bell
    const edgeLo = lo === 0 || !use[lo - 1], edgeHi = hi === n - 1 || !use[hi + 1], has = (t) => bands.some((b) => b.type === t);
    const type = fz < 120 && edgeLo && !has('LS') ? 'LS' : fz > 7000 && edgeHi && !has('HS') ? 'HS' : 'BELL', q = type === 'BELL' ? clamp(fz / (fhi - flo), 0.5, 4) : 0.71;
    const f0 = type === 'LS' ? Math.min(fhi, 120) : type === 'HS' ? Math.max(flo, 7000) : fz;
    bands.push({ type, f: Math.round(f0 * 10) / 10, g: Math.round(clamp(res[im], -6, 6) * 10) / 10, q: Math.round(q * 100) / 100 });
  }
  return bands.sort((a, b) => a.f - b.f);
}

// ---------------------------------------------------------------- misc
/** Histogram of a value list in `step` bins between lo and hi. */
export function histogram(vals, lo, hi, step = 0.5) { const n = Math.ceil((hi - lo) / step), h = new Float32Array(n); for (const v of vals) if (v > lo && v <= hi) h[Math.min(n - 1, Math.floor((v - lo) / step))]++; return h; }
export const easeOut3 = (u) => 1 - (1 - clamp(u, 0, 1)) ** 3;
