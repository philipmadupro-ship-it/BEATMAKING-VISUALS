// Elephant pendant on a real rope: a verlet chain of N links with distance constraints, gravity and damping, anchored
// at the top, with the elephant as the heavy end mass. The beat drives it gently: the low band pushes the end mass
// along its swing (resonant push), and every phrase start adds a bigger alternating impulse, so the chain shows
// secondary motion and each link rotates to follow the rope.
// Deterministic for export: the rope is simulated at a fixed 120 Hz step over the loop, starting from loop phase 0
// with two warm-up loops (same audio), and the last beat of the loop is blended into the state one loop earlier,
// so the last frame flows into frame 0. One simulation per (track, loop, phrase grid), memoised.
import { cached, clamp, hex3, mix } from '../util/draw.js';
export function elephFor(assets, pal, surface) {
  const img = assets.eleph;
  return cached('el|' + pal.id + surface, img.width, img.height, (g, w, h) => { g.drawImage(img, 0, 0);
    const duo = pal.duo; if (!duo) return; const d = g.getImageData(0, 0, w, h), D = d.data, c0 = hex3(duo[0]), c1 = hex3(duo[1]);
    for (let i = 0; i < D.length; i += 4) { if (!D[i + 3]) continue; const l = clamp(((.3 * D[i] + .59 * D[i + 1] + .11 * D[i + 2]) / 255 - .18) * 1.45); for (let k = 0; k < 3; k++) D[i + k] = c0[k] + (c1[k] - c0[k]) * l; }
    g.putImageData(d, 0, 0); });
}
// ---- rope simulation (normalised: rope length 1, anchor at 0,0, y down)
// gentle defaults: ~6-8° peak swing at swing = 0.4 (the Style slider scales the drive linearly)
const N = 9, HZ = 120, G = 13, DAMP = .9955, ITER = 12, INV_END = .12, PUSH = .3, KICKV = .16;
const SIMS = new WeakMap();
function simulate(T, a, b, anchorBeat, C, I) {
  const L = Math.max(.25, b - a), steps = Math.max(2, Math.round(L * HZ)), loops = 3, seg = 1 / N, dt = 1 / HZ;
  const x = new Float64Array(N + 1), y = new Float64Array(N + 1), px = new Float64Array(N + 1), py = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { x[i] = px[i] = 0; y[i] = py[i] = i * seg; }
  const rec = new Float32Array(2 * (steps + 1) * (N + 1) * 2); let r = 0;
  const low = t => { const f = clamp(t * T.fps, 0, T.frames - 1.001), i = f | 0; return T.lowSlow[i] + (T.lowSlow[i + 1] - T.lowSlow[i]) * (f - i); };
  for (let lp = 0; lp < loops; lp++) for (let s = 0; s < steps; s++) {
    const t = a + s * dt, beat = (t - T.t0) / T.spb - anchorBeat, ph = Math.floor(beat / C), prevPh = Math.floor((beat - dt / T.spb) / C);
    // record loops 2 and 3 (index 0..2*steps)
    if (lp >= 1) { for (let i = 0; i <= N; i++) { rec[r++] = x[i]; rec[r++] = y[i]; } }
    const vx = x[N] - px[N];
    let ax = PUSH * I * (.25 + low(t)) * Math.sign(vx || 1) * (1 - Math.min(1, Math.abs(x[N]) * 1.6)); // push along the swing, less at the extremes
    for (let i = 1; i <= N; i++) { const nx = x[i] + (x[i] - px[i]) * DAMP + (i === N ? ax : 0) * dt * dt, ny = y[i] + (y[i] - py[i]) * DAMP + G * dt * dt; px[i] = x[i]; py[i] = y[i]; x[i] = nx; y[i] = ny; }
    if (ph !== prevPh && s > 0) { const dir = (((ph % 2) + 2) % 2 ? -1 : 1); px[N] -= dir * KICKV * I * dt; }
    for (let it = 0; it < ITER; it++) for (let i = 0; i < N; i++) { const wa = i === 0 ? 0 : 1, wb = i + 1 === N ? INV_END : 1, dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], d = Math.hypot(dx, dy) || 1e-9, k = (d - seg) / d / (wa + wb);
      x[i] += dx * k * wa; y[i] += dy * k * wa; x[i + 1] -= dx * k * wb; y[i + 1] -= dy * k * wb; }
  }
  for (let i = 0; i <= N; i++) { rec[r++] = x[i]; rec[r++] = y[i]; } // state at the very end
  return { rec, steps, L, a, b };
}
function sim(T, P, I0) {
  const I = I0 * (P.eleph.swing ?? .4) / .4, lp = P.loop || { a: 0, b: T.duration }, key = [lp.a.toFixed(4), lp.b.toFixed(4), P.anchorBeat, P.cycleBeats, I.toFixed(3)].join('|');
  let m = SIMS.get(T); if (!m) { m = new Map(); SIMS.set(T, m); } let s = m.get(key);
  if (!s) { s = simulate(T, lp.a, lp.b, P.anchorBeat, P.cycleBeats, I); if (m.size > 12) m.clear(); m.set(key, s); } return s;
}
/** Rope node positions (normalised) for time t: loop-periodic, seam-blended. Returns Float32Array [x0,y0,...]. */
export function ropeNodes(fs, P) {
  const T = fs.track, S = sim(T, P, fs.I), stride = (N + 1) * 2, out = new Float32Array(stride);
  const at = idx => { const f = clamp(idx, 0, 2 * S.steps), i = Math.min(2 * S.steps - 1, f | 0), u = f - i; return [i, u]; };
  const sample = (idx, w) => { const [i, u] = at(idx); for (let k = 0; k < stride; k++) out[k] += w * (S.rec[i * stride + k] * (1 - u) + S.rec[(i + 1) * stride + k] * u); };
  let lt = ((fs.t - S.a) % S.L + S.L) % S.L; if (fs.t >= S.b - 1e-6 && fs.t <= S.b + 1e-6) lt = S.L; // the out point itself
  const idx2 = S.steps + lt * HZ, xf = Math.min(T.spb, S.L / 4), w0 = (lt - (S.L - xf)) / xf, w = w0 <= 0 ? 0 : w0 >= 1 ? 1 : w0 * w0 * (3 - 2 * w0);
  sample(idx2, 1 - w); if (w > 0) sample(idx2 - S.steps, w);
  return out;
}
const geo = (P, img) => { const sc = Math.min(P.W, P.H) * .42 / img.width * P.eleph.s, len = P.eleph.len * P.H + 10; return { sc, len, px: P.eleph.x * P.W, py: (P.eleph.y || 0) * P.H - 12 }; };
export function elephantBounds(P, assets) { const img = assets.eleph, { sc, len, px, py } = geo(P, img); return { x: px - img.width * sc / 2, y: py + len - img.height * sc * .3, w: img.width * sc, h: img.height * sc }; }
/** Area the pendant can sweep (for text layout): anchor ± swing, down to the elephant's feet. */
export function elephantSweep(P, assets) { const img = assets.eleph, { sc, len, px, py } = geo(P, img), rl = Math.max(len, 90 * sc), w = img.width * sc, reach = rl * .34 + w * .5;
  return { x: px - reach, y: py + rl - img.height * sc * .35, w: reach * 2, h: img.height * sc * 1.1 }; } // the body's zone (the rope itself is a hairline)
// Where the elephant art's own chain meets its head: the bail knot on top of the head (image pixels, found on the
// 2x zoom of assets/elephant.png). The rope's last joint lands exactly here, so the pendant hangs from its own bail.
export const BAIL = Object.freeze({ x: 343, y: 197 });
/** Chain metal colours for a palette: body, highlight and the ink outline (the elephant art's chain has dark ink edges). */
export function chainColours(pal, tpl) {
  const light = pal.light, body = light ? mix(pal.main, pal.dark, .25) : mix(pal.dark, pal.main, .68);
  return { body, hi: light ? pal.main : pal.hi, ink: light ? pal.main : mix(pal.dark, '#000000', .35), shade: light ? mix(pal.main, pal.dark, .55) : mix(pal.dark, pal.main, .38) };
}
/** Smooth path through the rope nodes (centripetal-ish Catmull-Rom, 8 samples per segment) with cumulative arc length. */
function ropePath(n, X, Y) {
  const P = [], S = [0], K = 8;
  for (let i = 0; i < N; i++) { const i0 = Math.max(0, i - 1), i3 = Math.min(N, i + 2);
    for (let j = 0; j < K; j++) { const t = j / K, t2 = t * t, t3 = t2 * t, c = (a, b, c2, d) => .5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      P.push([c(X(i0), X(i), X(i + 1), X(i3)), c(Y(i0), Y(i), Y(i + 1), Y(i3))]); } }
  P.push([X(N), Y(N)]);
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const at = d => { d = clamp(d, 0, S[S.length - 1]); let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= d) lo = m; else hi = m; }
    const u = (d - S[lo]) / ((S[hi] - S[lo]) || 1); return [P[lo][0] + (P[hi][0] - P[lo][0]) * u, P[lo][1] + (P[hi][1] - P[lo][1]) * u]; };
  return { at, len: S[S.length - 1] };
}
/**
 * Real chain: a fixed number of rigid links of constant pitch laid along the rope (joint i at arc length i·pitch from
 * the anchor; the last joint is the elephant's bail). Links alternate face-on (a ring: you see the aperture) and edge-on
 * (a bar: the same link turned 90° about the rope axis), each rotated to its own joint-to-joint direction, so the chain
 * bends link by link as the verlet rope swings. Edge-on links are drawn first; face-on rings overlap their ends, and
 * the top end of every bar is redrawn over the rail of the ring above it, so each pair reads as interlocked.
 */
const rr = (ctx, x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
export function drawChainLinks(ctx, J, Lk, col) {
  const n = J.length - 1, t = Lk * .19, w = Lk * .58, r = Lk * .24;
  const ring = (i, pass) => { const [x0, y0] = J[i], [x1, y1] = J[i + 1], cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0) + 2 * t;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    if (i % 2 === 0) { // face-on: rounded ring (aperture left open, so the bars show through it), ink edge, metal body, lit upper rail
      const iw = L - 2 * t, ih = w - 2 * t, ir = Math.max(1, r - t), e = .7;
      ctx.beginPath(); rr(ctx, -L / 2 - e, -w / 2 - e, L + 2 * e, w + 2 * e, r + e); rr(ctx, -iw / 2 + e, -ih / 2 + e, iw - 2 * e, ih - 2 * e, ir); ctx.fillStyle = col.ink; ctx.fill('evenodd');
      ctx.beginPath(); rr(ctx, -L / 2, -w / 2, L, w, r); rr(ctx, -iw / 2, -ih / 2, iw, ih, ir); ctx.fillStyle = col.body; ctx.fill('evenodd');
      ctx.lineWidth = Math.max(1, t * .28); ctx.strokeStyle = col.hi; ctx.globalAlpha *= .85; ctx.beginPath(); ctx.moveTo(-L / 2 + r, -w / 2 + t * .4); ctx.lineTo(L / 2 - r, -w / 2 + t * .4); ctx.stroke();
      ctx.strokeStyle = col.shade; ctx.beginPath(); ctx.moveTo(-L / 2 + r, w / 2 - t * .4); ctx.lineTo(L / 2 - r, w / 2 - t * .4); ctx.stroke();
    } else if (pass === 0 || pass === 2) { // edge-on: a bar, ink edge, centre highlight
      if (pass === 2) { ctx.beginPath(); ctx.rect(-L / 2 - t, -w, t * 2.2, 2 * w); ctx.clip(); } // only its top end, over the ring above
      const h = t * 1.15; ctx.beginPath(); rr(ctx, -L / 2 - .6, -h / 2 - .6, L + 1.2, h + 1.2, h / 2 + .6); ctx.fillStyle = col.ink; ctx.fill();
      ctx.beginPath(); rr(ctx, -L / 2, -h / 2, L, h, h / 2); ctx.fillStyle = col.body; ctx.fill();
      ctx.strokeStyle = col.hi; ctx.lineWidth = Math.max(1, h * .22); ctx.beginPath(); ctx.moveTo(-L / 2 + h * .6, -h * .12); ctx.lineTo(L / 2 - h * .6, -h * .12); ctx.stroke();
    }
    ctx.restore(); };
  for (let i = 1; i < n; i += 2) ring(i, 0);
  for (let i = 0; i < n; i += 2) ring(i, 1);
  for (let i = 1; i < n; i += 2) ring(i, 2);
}
const linkSize = sc => Math.max(12, 58 * sc);
/** Number of links in the pendant chain (fixed by the rope's rest length; shown in U2C.EXE's readout). */
export function linkCount(P, assets) { const { sc, len } = geo(P, assets.eleph), rl = Math.max(len, 90 * sc); return Math.max(2, Math.round(rl / (linkSize(sc) * .74))); }
/** Joints of a chain with constant pitch along the rope path (count fixed by the rest length, never pops). */
export function chainJoints(n, X, Y, rl, Lk) {
  const path = ropePath(n, X, Y), pitch0 = Lk * .74, cnt = Math.max(2, Math.round(rl / pitch0)), pitch = path.len / cnt, J = [];
  for (let i = 0; i <= cnt; i++) J.push(path.at(i * pitch));
  return J;
}
/** Draw the pendant hanging from (px, py) with rope length len px and elephant scale sc. Returns the elephant centre. */
export function drawPendant(ctx, fs, P, pal, assets, tpl, px, py, len, sc, opt = {}) {
  const img = opt.img || elephFor(assets, pal, tpl.surface), n = ropeNodes(fs, P), rl = Math.max(len, 90 * sc);
  const X = i => px + n[2 * i] * rl, Y = i => py + n[2 * i + 1] * rl, Lk = linkSize(sc), col = chainColours(pal, tpl);
  const J = chainJoints(n, X, Y, rl, Lk), m = ctx.getTransform(), dev = Math.hypot(m.a, m.b);
  // chain on its own layer (the rings' apertures are punched out), at device resolution
  const x0 = Math.min(...J.map(j => j[0])) - Lk, y0 = Math.min(...J.map(j => j[1])) - Lk, x1 = Math.max(...J.map(j => j[0])) + Lk, y1 = Math.max(...J.map(j => j[1])) + Lk;
  const lw = Math.ceil((x1 - x0) * dev), lh = Math.ceil((y1 - y0) * dev), layer = cached('chainlayer|' + lw + 'x' + lh, lw, lh, () => {}), g = layer.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, lw, lh); g.globalAlpha = 1; g.setTransform(dev, 0, 0, dev, -x0 * dev, -y0 * dev);
  // eyelet at the anchor
  g.strokeStyle = col.body; g.lineWidth = Lk * .14; g.beginPath(); g.arc(px, py - Lk * .1, Lk * .26, 0, Math.PI * 2); g.stroke();
  drawChainLinks(g, J, Lk, col);
  ctx.drawImage(layer, x0, y0, lw / dev, lh / dev);
  const [ex, ey] = J[J.length - 1], [qx, qy] = J[J.length - 2], a2 = Math.atan2(ex - qx, ey - qy); // the bail follows the last link
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(-a2); ctx.scale(sc, sc); ctx.drawImage(img, -BAIL.x, -BAIL.y); ctx.restore();
  return { x: ex, y: ey + img.height * sc * .2, th: a2 };
}
export const elephant = {
  id: 'elephant', name: 'Elephant pendant',
  draw(ctx, fs, P, pal, assets, tpl) { const { sc, len, px, py } = geo(P, assets.eleph); drawPendant(ctx, fs, P, pal, assets, tpl, px, py, len, sc); },
};
