// v12 SPECTROGRAM, FL Studio Edison style: a time x frequency heat map that scrolls with the audio.
//  - data: the clip's M (and S) band power from the hop STFT (analysis/msspec.js): 128 log bands 20 Hz .. 20 kHz per video frame,
//    uint8 (dB + 100) * 2.55, so a column at frame f IS the FFT of the audio around f (tests/meters.mjs checks that);
//  - crisp: one cached image (frame x band), drawn with image smoothing OFF; the playhead sits at 80 % with the next 20 %
//    of the clip dimmed (the real upcoming audio); log frequency axis; stage ramp (greys in Nigredo);
//  - a thin ruler with bar numbers and beat ticks; the S spectrogram as a thin lane under the plot (mode 'ms') or hidden ('m').
import { hexRgb, clamp, lerp, rgba } from './core.js';
import { flLUT } from '../lib/flcolors.js';

export const N_BANDS = 128, PLAYHEAD = 0.8, UP = 4;   // UP: the 128 stored bands are interpolated (in dB) to 128 x UP rows so the map is not blocky
/** 256-entry RGBA ramp for one stage (v = normalised dB), alpha = v^gamma; greys in Nigredo (S.grey). */
export function specLUT(S, gam = 0.56, cmap = 'stage') {
  if (cmap === 'FL') return flLUT(gam);
  const A = hexRgb(S.spec[1]), B = hexRgb(S.spec[2]), C = hexRgb(S.spec[3]), I = hexRgb(S.ink), P0 = hexRgb(S.card), mid = 0.52, LUT = [];
  for (let i = 0; i < 256; i++) {
    const v = i / 255; let col;
    if (v < 0.18) col = P0.map((c0, j) => lerp(c0, A[j], v / 0.18)); else if (v < mid) col = A.map((c0, j) => lerp(c0, B[j], (v - 0.18) / (mid - 0.18))); else col = B.map((c0, j) => lerp(c0, C[j], (v - mid) / (1 - mid)));
    if (v > 0.76) col = col.map((c0, j) => lerp(c0, I[j], 0.18 * (v - 0.76) / 0.24));
    if (S.grey) { const g = Math.round((col[0] + col[1] + col[2]) / 3); col = [g, g, g]; }
    LUT.push([...col.map(Math.round), v < 0.015 ? 0 : 255 * Math.pow(v, gam)]);
  }
  return LUT;
}
/** dB of one stored band value (v = (dB + 100) * 2.55). */
export const bandDb = (v) => v / 2.55 - 100;
/** RGBA pixels (nf wide, n tall, band 0 = bottom row) of `src` (frames x n uint8) through the ramp. */
export function heatPixels(src, nf, n, LUT, floor) {
  const px = new Uint8ClampedArray(nf * n * 4);
  for (let f = 0; f < nf; f++) for (let b = 0; b < n; b++) {
    const db = src[f * n + b] / 255 * 100 - 100, q = LUT[Math.round(clamp((db + floor) / floor) * 255)], o4 = ((n - 1 - b) * nf + f) * 4;
    px[o4] = q[0]; px[o4 + 1] = q[1]; px[o4 + 2] = q[2]; px[o4 + 3] = q[3];
  }
  return px;
}
const toCanvas = (px, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const im = g.createImageData(w, h); im.data.set(px); g.putImageData(im, 0, 0); return c; };
/** Vertical interpolation of a frames x n uint8 band map to n*up rows (linear in dB, centre-aligned): a smooth, honest upsample of the real bands. */
export function upRows(src, nf, n, up) {
  const m = n * up, out = new Uint8Array(nf * m);
  for (let f = 0; f < nf; f++) for (let r = 0; r < m; r++) { const p = clamp((r + 0.5) / up - 0.5, 0, n - 1), i = Math.floor(p), j = Math.min(n - 1, i + 1), a = p - i; out[f * m + r] = Math.round(src[f * n + i] * (1 - a) + src[f * n + j] * a); }
  return out;
}
/** S lane source: max over groups of `g` bands, so a thin lane never drops a peak. */
export function poolMax(src, nf, n, g) { const m = n / g, out = new Uint8Array(nf * m); for (let f = 0; f < nf; f++) for (let j = 0; j < m; j++) { let v = 0; for (let i = 0; i < g; i++) v = Math.max(v, src[f * n + j * g + i]); out[f * m + j] = v; } return out; }

const CACHE = new WeakMap();
function images(ms, nf, S, gam, floor, cmap) {
  const key = [S.spec.join(), S.ink, S.card, S.grey, gam, floor, cmap].join('|'); let o = CACHE.get(ms); if (!o) CACHE.set(ms, o = {});
  if (!o[key]) { const ks = Object.keys(o); if (ks.length > 6) delete o[ks[0]]; const LUT = specLUT(S, gam, cmap);
    o[key] = { M: toCanvas(heatPixels(upRows(ms.spectroM, nf, N_BANDS, UP), nf, N_BANDS * UP, LUT, floor), nf, N_BANDS * UP), S: toCanvas(heatPixels(poolMax(ms.spectroS, nf, N_BANDS, 8), nf, N_BANDS / 8, LUT, floor), nf, N_BANDS / 8) }; }
  return o[key];
}
/**
 * Draw the spectrogram into rect [x, y, w, h].  frame: playhead position in video frames (fractional ok).
 * o: { S (stage), ms, nf, fps, text, bar (s), startBar, win (s), floor (dB), gamma, mode ('ms' | 'm'), minPx (floor for type, optional) }
 */
export function draw(ctx, rect, frame, o) {
  const [x, y, w, h] = rect, S = o.S, text = o.text, fps = o.fps, nf = o.nf, win = o.win || 8, floor = o.floor || 90, mode = o.mode || 'ms';
  const fz = o.floorSize ? (s) => o.floorSize(ctx, s) : (s) => s, LH = fz(22), ink = (a) => rgba(S.ink, a), lbl = (s, X, Y, op = {}) => text(ctx, s, X, Y, { size: op.size || 22, col: ink(op.a == null ? 0.7 : op.a), align: op.align, w: 500, maxW: op.maxW });
  const gl = Math.round(LH * 2.2), rh = Math.round(LH + 8), laneH = mode === 'ms' && h > 150 ? Math.round(clamp(h * 0.12, 20, 30)) : 0, gap = laneH ? 3 : 0;
  const px0 = x + gl, pw = w - gl - 4, ph = h - rh - laneH - gap, py = y, img = images(o.ms, nf, S, o.gamma || 0.56, floor, o.cmap || 'stage');
  const t = frame / fps, tl = t - win * PLAYHEAD, Xt = (tt) => px0 + pw * (tt - tl) / win, span = win * fps, f0 = frame - span * PLAYHEAD;
  const plane = (im, ny, yy, hh, smooth) => {
    ctx.fillStyle = S.card; ctx.fillRect(px0, yy, pw, hh);
    const sx = Math.max(0, f0), ex = Math.min(nf, f0 + span); if (ex <= sx) return;
    const dx = px0 + pw * (sx - f0) / span, dw = pw * (ex - sx) / span;
    ctx.save(); ctx.beginPath(); ctx.rect(px0, yy, pw, hh); ctx.clip(); ctx.imageSmoothingEnabled = !!smooth; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, sx, 0, ex - sx, ny, Math.round(dx), yy, Math.round(dx + dw) - Math.round(dx), hh); ctx.restore();
  };
  plane(img.M, N_BANDS * UP, py, ph, true);
  // log frequency axis: faint grid at 20 / 50 / 100 / ... Hz, labels at 100 Hz, 1 kHz, 10 kHz (and 20 Hz / 20 kHz as end stops)
  const Yf = (fq) => py + ph * (1 - Math.log(fq / 20) / Math.log(1000));
  for (const fq of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const major = fq === 100 || fq === 1000 || fq === 10000, Yy = Math.round(Yf(fq)) + 0.5; ctx.fillStyle = ink(major ? 0.2 : 0.09); ctx.fillRect(px0, Yy - 0.5, pw, 1); }
  for (const [s, fq] of [['100', 100], ['1k', 1000], ['10k', 10000]]) lbl(s, px0 - 8, Math.round(Yf(fq)), { align: 'right', a: 0.65, size: 22 });
  // upcoming audio dimmed, then the playhead
  const phx = Math.round(px0 + pw * PLAYHEAD); ctx.fillStyle = rgba(S.card, 0.5); ctx.fillRect(phx, py, px0 + pw - phx, ph);
  // S lane
  if (laneH) { const ly = py + ph + gap; plane(img.S, N_BANDS / 8, ly, laneH); ctx.fillStyle = rgba(S.card, 0.5); ctx.fillRect(phx, ly, px0 + pw - phx, laneH); lbl('S', px0 - 8, ly + laneH / 2, { align: 'right', a: 0.65 }); }
  // ruler: bar ticks with the song bar number, beat ticks between
  const ry = y + h - rh, BARS = o.bar, beat = BARS / 4; ctx.fillStyle = ink(0.28); ctx.fillRect(px0, ry, pw, 1);
  for (let b = Math.ceil(tl / beat); b * beat <= tl + win; b++) { const X = Math.round(Xt(b * beat)); if (X < px0 || X > px0 + pw) continue; const bar = b % 4 === 0;
    ctx.fillStyle = ink(bar ? 0.55 : 0.28); ctx.fillRect(X, ry, 1, bar ? 9 : 5);
    if (bar && X > px0 + 4 && X < px0 + pw - LH * 1.5) lbl(String(o.startBar + b / 4), X + 5, ry + rh * 0.58, { a: 0.6, size: 22 });
    if (bar) { ctx.fillStyle = ink(0.07); ctx.fillRect(X, py, 1, ph); } }
  ctx.fillStyle = ink(0.3); ctx.fillRect(px0, py + ph, pw, 1);
  // playhead
  ctx.fillStyle = S.ink; ctx.fillRect(phx - 1, py, 2, ph + laneH + gap + 9); ctx.beginPath(); ctx.moveTo(phx - 6, py); ctx.lineTo(phx + 6, py); ctx.lineTo(phx, py + 8); ctx.closePath(); ctx.fill();
}
