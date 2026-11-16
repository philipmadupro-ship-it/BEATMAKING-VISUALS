// v14 INSERTS: four small glass tiles, each a LIVE mini view from the clip's real data that reacts to the beat. No EQ curves.
//   1 SPEC   a mini gradient spectrum (spectrumview.traceData: the approved display ballistics + kick lift)
//   2 GR     a mini gain-reduction history (levelview.grFor, the same compressor curve as the levels window), the notch flashes on the kick
//   3 WIDTH  a mini correlation + width trace (F.corr solid, F.width dashed) over the last ~1.5 beats
//   4 3D     a wireframe surface (spectrum history: frequency x time) inside a cube outline; it turns one 90 degree step per beat, eased so it lands
//            exactly on the beat (cubeStep), with the exponential kick glow (levelview.glowAt)
// API: draw(ctx, rect, frame, opts)   rect = [x, y, w, h] (all four tiles), frame = fractional frame index (t * fps), opts = { L (core), S (stage) }.
// All text goes through L.text (Synkopy labels). Pure function of (frame, data): deterministic.
import * as ML from './meterlib.js';
import { glowAt, grFor } from './levelview.js';
import { traceData, toneCols } from './spectrumview.js';

export const LABELS = ['SPEC', 'GR', 'WIDTH', '3D'];
export const CUBE_EASE = 0.45;   // fraction of a beat the step takes (the last 45 % before the beat)

/** Cube turn in steps (1 step = 90 degrees) at time t: it holds, then eases (in-out cubic) over the last `ease` of each beat so that at every beat
 *  boundary the value is exactly an integer. Beat n (t = n * beat) is a landing: cubeStep = n. */
export function cubeStep(t, beat, ease = CUBE_EASE) {
  const u = Math.max(0, t) / beat, n = Math.floor(u + 1e-9), fr = u - n, a = 1 - ease;
  if (fr <= a) return n;
  const e = (fr - a) / ease; return n + (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2);
}

/** Surface heights 0..1 for the cube: R history rows (newest first, `hop` frames apart) x C frequency columns of the displayed spectrum. */
export function surfaceGrid(D, f, R = 9, C = 9, hop = 3) {
  const T = traceData(D), nb = T.nb, out = [], lo = -70, hi = -16;
  for (let r = 0; r < R; r++) {
    const ff = Math.max(0, Math.min(D.frames - 1, Math.floor(f) - r * hop)), row = [];
    for (let c = 0; c < C; c++) {
      const i0 = Math.floor(2 + (nb - 8) * c / C), i1 = Math.max(i0 + 1, Math.floor(2 + (nb - 8) * (c + 1) / C)); let m = -200;
      for (let i = i0; i < i1; i++) m = Math.max(m, T.disp[ff * nb + i]);
      row.push(Math.max(0, Math.min(1, (m - lo) / (hi - lo))));
    }
    out.push(row);
  }
  return out;
}

export function draw(ctx, rect, frame, opts) {
  const { L, S } = opts, D = L.D, F = L.F, FPS = L.FPS, rgba = L.rgba, text = L.text, clamp = L.clamp;
  const [x, y, w, h] = rect, gap = Math.max(6, Math.round(w * 0.018)), tw = (w - 3 * gap) / 4, f = Math.max(0, Math.min(D.frames - 1, Math.floor(frame + 1e-6))), t = frame / FPS;
  const g = glowAt(D, t, FPS), tone = toneCols(S), ink = (a) => rgba(S.ink, a), sL = L.floorSize ? L.floorSize(ctx, 11) : 11;
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const tx = x + i * (tw + gap), r = Math.max(8, Math.min(16, h * 0.16));
    if (L.panel) L.panel(ctx, tx, y, tw, h, S, { r }); else { ctx.fillStyle = ink(0.06); ctx.fillRect(tx, y, tw, h); ctx.strokeStyle = ink(0.25); ctx.strokeRect(tx + 0.5, y + 0.5, tw - 1, h - 1); }
    // label (Synkopy, top-left); the art sits in the rest of the tile
    const lh = Math.round(sL + 4), ax = tx + 6, ay = y + lh + 4, aw = tw - 12, ah = h - lh - 10;
    text(ctx, LABELS[i], tx + 8, y + 6 + sL * 0.5, { size: 11, col: ink(0.7), w: 500, maxW: tw - 16 });
    if (ah < 10 || aw < 10) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(tx + 2, y + 2, tw - 4, h - 4); ctx.clip();
    if (i === 0) spec(ctx, S, D, f, ax, ay, aw, ah, tone, g, rgba, ink);
    else if (i === 1) gr(ctx, S, D, t, FPS, ax, ay, aw, ah, g, rgba, ink, clamp);
    else if (i === 2) width(ctx, S, F, D, f, FPS, ax, ay, aw, ah, g, rgba, ink, clamp);
    else cube(ctx, S, D, t, f, ax, ay, aw, ah, g, rgba, ink, L.BEAT);
    ctx.restore();
  }
  ctx.restore();
}

function spec(ctx, S, D, f, x, y, w, h, tone, g, rgba, ink) {
  const T = traceData(D), nb = T.nb, n = Math.max(8, Math.floor(w / 2)), top = -8, bot = -70, P = [];
  for (let j = 0; j < n; j++) { const u = j / (n - 1) * (nb - 1), i0 = Math.floor(u), i1 = Math.min(nb - 1, i0 + 1), a = u - i0, v = T.disp[f * nb + i0] * (1 - a) + T.disp[f * nb + i1] * a;
    P.push([x + w * j / (n - 1), y + h * (1 - clamp01((v - bot) / (top - bot)))]); }
  const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(tone[2], 0.9)); gr.addColorStop(0.5, rgba(tone[1], 0.45)); gr.addColorStop(1, rgba(tone[0], 0.04));
  ctx.beginPath(); ctx.moveTo(x, y + h); for (const p of P) ctx.lineTo(p[0], p[1]); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
  ctx.beginPath(); P.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.save(); if (g > 0.02) { ctx.shadowColor = rgba(tone[2], 1); ctx.shadowBlur = 4 + 10 * g; }
  ctx.strokeStyle = rgba(tone[2], 0.95); ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
  ctx.fillStyle = ink(0.12); ctx.fillRect(x, Math.round(y + h) - 0.5, w, 1);
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function gr(ctx, S, D, t, FPS, x, y, w, h, g, rgba, ink, clamp) {
  const G = grFor(D, {}), rate = D.lv.rate, span = 4 * D.beat, n = Math.max(12, Math.floor(w / 2));   // the last 4 beats (one bar)
  let depth = G._depth; if (depth == null) { depth = 0; for (let i = 0; i < G.length; i++) if (-G[i] > depth) depth = -G[i]; G._depth = depth; }
  const range = Math.max(2, Math.ceil(depth * 1.15 + 0.2)), P = [];
  for (let j = 0; j < n; j++) { const tt = t - span + span * (j + 1) / n; P.push([x + w * j / (n - 1), y + h * clamp(-(tt < 0 ? 0 : ML.grAt(G, tt, n / span, rate)) / range, 0, 1)]); }
  ctx.fillStyle = ink(0.1); for (let d = 1; d < range; d++) ctx.fillRect(x, Math.round(y + h * d / range), w, 1);
  const gg = ctx.createLinearGradient(0, y, 0, y + h); gg.addColorStop(0, rgba(S.hot, 0.2 + 0.2 * g)); gg.addColorStop(1, rgba(S.hot, 0.9));
  ctx.beginPath(); ctx.moveTo(x, y); for (const p of P) ctx.lineTo(p[0], p[1]); ctx.lineTo(x + w, y); ctx.closePath(); ctx.fillStyle = gg; ctx.fill();
  ctx.beginPath(); P.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = ink(0.9); ctx.lineWidth = 1.2; ctx.stroke();
  const ny = P[P.length - 1][1], R = 3 + 9 * g;   // the notch at the now edge
  if (g > 0.01) { const rg = ctx.createRadialGradient(x + w, ny, 0, x + w, ny, R * 2.4); rg.addColorStop(0, rgba(S.hot, 0.8 * g)); rg.addColorStop(1, rgba(S.hot, 0)); ctx.fillStyle = rg; ctx.fillRect(x + w - R * 3, ny - R * 3, R * 3, R * 6); }
  ctx.fillStyle = S.ink; ctx.beginPath(); ctx.arc(x + w - 2, ny, 2.2 + 1.6 * g, 0, 6.2832); ctx.fill();
}

function width(ctx, S, F, D, f, FPS, x, y, w, h, g, rgba, ink, clamp) {
  const N = Math.max(4, Math.round(2 * D.beat * FPS)), n = Math.max(12, Math.floor(w / 2)), ffs = []; let cMin = 1, wMax = 0;
  for (let j = 0; j < n; j++) { const ff = Math.max(0, f - Math.round(N * (n - 1 - j) / (n - 1))); ffs.push(ff); cMin = Math.min(cMin, F.corr[ff]); wMax = Math.max(wMax, F.width[ff]); }
  // auto-ranged to the window (like the levels GR strip): corr from min(cMin, 0.9) up to +1, width from 0 up to at least 0.2 (S/M ratio)
  const cLo = Math.max(-1, Math.min(0.9, cMin - 0.05)), wHi = Math.max(0.2, wMax * 1.25), top = y + 3, bot = y + h - 3, hh = bot - top;
  const C = ffs.map((ff, j) => [x + w * j / (n - 1), top + hh * (1 - clamp((F.corr[ff] - cLo) / (1 - cLo), 0, 1)) * 0.55]);
  const W = ffs.map((ff, j) => [x + w * j / (n - 1), bot - hh * 0.4 * clamp(F.width[ff] / wHi, 0, 1)]);
  ctx.fillStyle = ink(0.12); ctx.fillRect(x, Math.round(top + hh * 0.6), w, 1);
  const line = (P, a, lw, dash) => { ctx.beginPath(); P.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.setLineDash(dash || []); ctx.strokeStyle = a; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); ctx.setLineDash([]); };
  const gw = ctx.createLinearGradient(0, bot - hh * 0.4, 0, bot); gw.addColorStop(0, ink(0.3)); gw.addColorStop(1, ink(0.02));
  ctx.beginPath(); ctx.moveTo(x, bot); for (const p of W) ctx.lineTo(p[0], p[1]); ctx.lineTo(x + w, bot); ctx.closePath(); ctx.fillStyle = gw; ctx.fill(); line(W, ink(0.6), 1.1);
  ctx.save(); if (g > 0.02) { ctx.shadowColor = rgba(S.hot, 1); ctx.shadowBlur = 3 + 8 * g; } line(C, ink(0.95), 1.4); ctx.restore();
  const e = C[C.length - 1]; ctx.fillStyle = S.hot; ctx.beginPath(); ctx.arc(e[0] - 1, e[1], 2.4 + 1.4 * g, 0, 6.2832); ctx.fill();
}

function cube(ctx, S, D, t, f, x, y, w, h, g, rgba, ink, beat) {
  const R = 9, C = 9, H = surfaceGrid(D, f, R, C, 3), th = cubeStep(t, beat) * Math.PI / 2, tilt = 0.62, cy0 = Math.cos(th), sy0 = Math.sin(th), ct = Math.cos(tilt), st = Math.sin(tilt);
  const sc = Math.min(w * 0.36, h * 0.36), ox = x + w / 2, oy = y + h / 2;
  const P = (px, py, pz) => { const rx = px * cy0 + pz * sy0, rz = -px * sy0 + pz * cy0, ry = py * ct - rz * st, rz2 = py * st + rz * ct, k = 1 / (1 + rz2 * 0.18); return [ox + rx * sc * k, oy - ry * sc * k, rz2]; };
  const seg = (a, b, al, lw = 1) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = ink(al); ctx.lineWidth = lw; ctx.stroke(); };
  const co = []; for (const px of [-1, 1]) for (const py of [-1, 1]) for (const pz of [-1, 1]) co.push(P(px, py, pz));
  for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(co[a], co[b], 0.28);   // the cube outline
  const V = (r, c) => P(-1 + 2 * c / (C - 1), -1 + 1.9 * H[r][c], 1 - 2 * r / (R - 1));
  ctx.save(); if (g > 0.02) { ctx.shadowColor = rgba(S.hot, 1); ctx.shadowBlur = 3 + 9 * g; }
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const a = V(r, c), al = 0.35 + 0.5 * clamp01(0.5 - a[2] * 0.25) + 0.25 * g;
    if (c + 1 < C) seg(a, V(r, c + 1), Math.min(1, al), 1.1); if (r + 1 < R) seg(a, V(r + 1, c), Math.min(1, al * 0.8), 1.1); }
  ctx.restore();
}
