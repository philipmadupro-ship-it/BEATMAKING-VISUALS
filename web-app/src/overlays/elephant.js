// Elephant pendant on a real rope: a verlet chain of N links with distance constraints, gravity and damping, anchored
// at the top, with the elephant as the heavy end mass. The beat drives it gently: the low band pushes the end mass
// along its swing (resonant push), and every phrase start adds a bigger alternating impulse, so the chain shows
// secondary motion and each link rotates to follow the rope.
// Deterministic for export: the rope is simulated at a fixed 120 Hz step over the loop, starting from loop phase 0
// with two warm-up loops (same audio), and the last beat of the loop is blended into the state one loop earlier,
// so the last frame flows into frame 0. One simulation per (track, loop, phrase grid), memoised.
import { cached, clamp, hex3, rrect } from '../util/draw.js';
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
/** Draw the pendant hanging from (px, py) with rope length len px and elephant scale sc. Returns the elephant centre. */
export function drawPendant(ctx, fs, P, pal, assets, tpl, px, py, len, sc, opt = {}) {
  const img = opt.img || elephFor(assets, pal, tpl.surface), n = ropeNodes(fs, P), rl = Math.max(len, 90 * sc);
  const col = opt.chainCol || (tpl.surface === 'paper' ? pal.ink : (tpl.chainStyle === 'neon' ? pal.main : (pal.id === 'rust' ? pal.dark : pal.main)));
  const X = i => px + n[2 * i] * rl, Y = i => py + n[2 * i + 1] * rl;
  // links along each rope segment, alternating flat / edge-on, each rotated to its segment
  const Lk = Math.max(12, 44 * sc); ctx.strokeStyle = col; ctx.fillStyle = col;
  for (let i = 0; i < N; i++) { const x0 = X(i), y0 = Y(i), x1 = X(i + 1), y1 = Y(i + 1), ang = Math.atan2(y1 - y0, x1 - x0), d = Math.hypot(x1 - x0, y1 - y0), cnt = Math.max(1, Math.round(d / (Lk * .9)));
    for (let j = 0; j < cnt; j++) { const q = (j + .5) / cnt, cx = x0 + (x1 - x0) * q, cy = y0 + (y1 - y0) * q, flat = (i * 7 + j) % 2 === 0;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); if (flat) { ctx.lineWidth = Lk * .16; rrect(ctx, -Lk * .55, -Lk * .26, Lk * 1.1, Lk * .52, Lk * .2); ctx.stroke(); } else ctx.fillRect(-Lk * .6, -Lk * .07, Lk * 1.2, Lk * .14); ctx.restore(); } }
  const ex = X(N), ey = Y(N), a2 = Math.atan2(X(N) - X(N - 2), Y(N) - Y(N - 2)), k = 1; // no kick scale: the elephant reacts to bass through the rope only
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(-a2); ctx.scale(sc * k, sc * k); ctx.drawImage(img, -img.width * .5, -img.height * .30); ctx.restore();
  return { x: ex, y: ey + img.height * sc * .2, th: a2 };
}
export const elephant = {
  id: 'elephant', name: 'Elephant pendant',
  draw(ctx, fs, P, pal, assets, tpl) { const { sc, len, px, py } = geo(P, assets.eleph); drawPendant(ctx, fs, P, pal, assets, tpl, px, py, len, sc); },
};
