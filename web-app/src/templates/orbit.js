import { rgba, txt, mono, hud, sparkle, clamp, rrect } from '../util/draw.js';
import { accentOn, glowOp } from '../brand/palettes.js';
import { chainsScale, chainImages, letterOf } from '../overlays/chains.js';
import { phrase } from '../engine/layout.js';
import { kickBreath } from '../engine/react.js';
// BLOOM ORBIT: the elephant hangs in the centre. The three letters of the logo (U, 2, C) orbit it as whole, upright
// letters on the middle ring, between two clean chain necklaces (inner + outer) whose radius follows the bass / highs.
// Orbit speed is the band energy integrated over the loop (whole turns per loop: seamless). On each phrase start the
// letters glide out of orbit and lock into the U2C word, hold for a bar, then release back into orbit.
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
/** 0 = orbiting, 1 = locked into the logo. */
export function snapAmount(fs, P) {
  const ph = phrase(fs, P), C = ph.C, lb = ph.lb, hold = Math.min(4, C / 4), out = Math.min(2, C / 4);
  if (lb >= C - 1) return ease(lb - (C - 1)); if (lb < hold) return 1; if (lb < hold + out) return 1 - ease((lb - hold) / out); return 0;
}
let LETTERS = null;
function letters(L) { return LETTERS || (LETTERS = [0, 1, 2].map(k => { const ps = L.pieces.filter(pc => letterOf(pc) === k); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const pc of ps) { x0 = Math.min(x0, pc.x); y0 = Math.min(y0, pc.y); x1 = Math.max(x1, pc.x + pc.w); y1 = Math.max(y1, pc.y + pc.h); } return { ps, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }; })); }
function geom(fs, P) { const { W, H, V } = P, cx = W / 2, cy = V ? H * .48 : H * .5, R0 = Math.min(W, H) * (V ? .19 : .25), ry = V ? .92 : .78;
  return { cx, cy, R0, ry, rIn: R0 * .62 * (1 + .12 * fs.bass), rMid: R0 * 1.18 * (1 + .06 * fs.mid), rOut: R0 * 1.72 * (1 + .1 * fs.hi) }; }
function necklace(ctx, cx, cy, r, ry, rot, Lk, col, al, u) {
  const n = Math.max(12, Math.round(2 * Math.PI * r / (Lk * .86)));
  for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * ry, t = Math.atan2(Math.cos(a) * r * ry, -Math.sin(a) * r);
    ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); ctx.rotate(t); ctx.strokeStyle = col; ctx.fillStyle = col;
    if (i % 2 === 0) { ctx.lineWidth = Lk * .15; rrect(ctx, -Lk * .5, -Lk * .24, Lk, Lk * .48, Lk * .2); ctx.stroke(); } else ctx.fillRect(-Lk * .55, -Lk * .065, Lk * 1.1, Lk * .13); ctx.restore(); }
  void u;
}
function letterPoses(fs, P, assets) {
  const L = assets.links, G = geom(fs, P), m = snapAmount(fs, P), sc = chainsScale(P, L), lx = P.chains.x * P.W, ly = P.chains.y * P.H, Lp = Math.max(1, P.outT - P.inT);
  const so = sc * .62, turn = fs.flow(3, Math.max(1, Math.round(Lp * .05))), punch = kickBreath(fs, P);
  return letters(L).map((lt, k) => { const me = ease(m * 1.3 - k * .15), a = (k / 3 + turn) * Math.PI * 2 - Math.PI / 2, ox = G.cx + Math.cos(a) * G.rMid, oy = G.cy + Math.sin(a) * G.rMid * G.ry;
    const hx = lx + (lt.cx - L.w / 2) * sc, hy = ly + (lt.cy - L.h / 2) * sc; return { lt, x: ox + (hx - ox) * me, y: oy + (hy - oy) * me, s: (so + (sc - so) * me) * punch, front: me > .5 || Math.sin(a) > 0, me }; });
}
function drawLetters(ctx, poses, imgs, front) {
  for (const q of poses) { if (q.front !== front) continue; ctx.save(); ctx.translate(q.x, q.y); ctx.scale(q.s, q.s);
    for (const pc of q.lt.ps) ctx.drawImage(imgs.img, pc.ax, pc.ay, pc.w, pc.h, pc.x - q.lt.cx, pc.y - q.lt.cy, pc.w, pc.h); ctx.restore(); }
}
export default {
  id: 'orbit', name: 'Bloom Orbit', category: 'Bloom', pal: 'amethyst', surface: 'dark', chainStyle: 'solid', selfChains: true,
  textPos: 'top',
  reserved(P) { const G = geom({ bass: 0, mid: 0, hi: 0 }, P), R = G.rOut * 1.05; return [{ x: G.cx - R, y: G.cy - R * G.ry, w: 2 * R, h: 2 * R * G.ry }]; },
  params: [{ id: 'trail', label: 'Ring glow', min: 0, max: 1, step: .05, def: .5 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .8, s: .58 }, eleph: { x: .5, y: 0, s: .6, len: .455 } } : { chains: { x: .84, y: .52, s: .62 }, eleph: { x: .5, y: 0, s: .6, len: .45 } },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, a2 = accentOn(p), glow = (P.params && P.params.trail != null) ? P.params.trail : .5, TAU = Math.PI * 2, G = geom(fs, P), m = snapAmount(fs, P);
    const gr = ctx.createRadialGradient(G.cx, G.cy, 0, G.cx, G.cy, Math.max(W, H) * .65); gr.addColorStop(0, p.bg2); gr.addColorStop(1, p.bg); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // guide ellipses + degree ticks
    ctx.strokeStyle = rgba(p.main, .12 + .1 * glow); ctx.lineWidth = 1.2 * u; ctx.setLineDash([2 * u, 9 * u]);
    for (const r of [G.rMid, G.rOut * 1.14]) { ctx.beginPath(); ctx.ellipse(G.cx, G.cy, r, r * G.ry, 0, 0, TAU); ctx.stroke(); } ctx.setLineDash([]);
    const tk = fs.cyc(.01) * TAU; for (let d = 0; d < 360; d += 15) { const a = d * Math.PI / 180 + tk, r = G.rOut * 1.14; ctx.fillStyle = rgba(p.main, d % 90 ? .3 : .8); ctx.fillRect(G.cx + Math.cos(a) * r - 2 * u, G.cy + Math.sin(a) * r * G.ry - 2 * u, 4 * u, 4 * u); }
    // chain necklaces (counter-rotating), fade a little while the letters are locked
    ctx.save(); ctx.globalCompositeOperation = glowOp(p);
    necklace(ctx, G.cx, G.cy, G.rIn, G.ry, -fs.flow(1, Math.max(1, Math.round((P.outT - P.inT) * .04))) * TAU, 30 * u, a2, (.55 + .35 * glow) * (1 - m * .5), u);
    necklace(ctx, G.cx, G.cy, G.rOut, G.ry, fs.flow(4, Math.max(1, Math.round((P.outT - P.inT) * .03))) * TAU, 38 * u, p.main, (.5 + .35 * glow) * (1 - m * .5), u);
    ctx.restore();
    for (const r of fs.recent('snares', .5, 2)) { const q = r.age / .5; ctx.strokeStyle = rgba(p.spark, (1 - q) * .3 * r.s); ctx.lineWidth = 2 * u * (1 - q) + 1; ctx.beginPath(); ctx.ellipse(G.cx, G.cy, G.rIn * (.6 + q * .5), G.rIn * (.6 + q * .5) * G.ry, 0, 0, TAU); ctx.stroke(); }
    if (P.chains.on) drawLetters(ctx, letterPoses(fs, P, assets), chainImages(assets, p, 'solid', false), false);
    const mx = V ? 70 * u : W * .04, ty = V ? 100 * u : H * .08;
    txt(ctx, 'ORBIT.SYS', mx, ty, mono(22 * u, 700), p.main); txt(ctx, m > .5 ? 'LOCKED · U2C' : 'ORBIT · U / 2 / C', mx, ty + 30 * u, mono(16 * u), rgba(p.main, .65));
    sparkle(ctx, W - mx, ty, 14 * u, p.spark);
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 44 * u, rgba(p.main, .5), 2 * u);
  },
  // letters on the near side of the ring (and locked letters) pass in front of the elephant
  drawAfter(ctx, fs, P, p, assets) { if (P.chains.on) drawLetters(ctx, letterPoses(fs, P, assets), chainImages(assets, p, 'solid', false), true); },
};
