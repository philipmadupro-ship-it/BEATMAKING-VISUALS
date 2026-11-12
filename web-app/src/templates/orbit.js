import { rgba, txt, mono, hud, sparkle, clamp } from '../util/draw.js';
import { accentOn } from '../brand/palettes.js';
import { chainsScale, chainImages } from '../overlays/chains.js';
import { phrase } from '../engine/layout.js';
// BLOOM ORBIT: the elephant hangs in the centre while the U2C chain links orbit it in three rings. Ring radius follows
// a band (bass / mid / highs) and the orbit speed is that band's energy, integrated over the loop (whole turns per
// loop, so it is seamless). On every phrase start the links snap out of orbit into the U2C word, hold, then release.
const RING_BAND = [1, 3, 4], RING_RATE = [.05, .08, .12];
function ease(x) { x = clamp(x); return x * x * (3 - 2 * x); }
/** 0 = orbiting, 1 = assembled into the logo. */
export function snapAmount(fs, P) {
  const ph = phrase(fs, P), C = ph.C, lb = ph.lb, hold = Math.min(4, C / 4), out = Math.min(2, C / 4);
  if (lb >= C - 1) return ease(lb - (C - 1)); if (lb < hold) return 1; if (lb < hold + out) return 1 - ease((lb - hold) / out); return 0;
}
function poses(fs, P, assets) {
  const { W, H, u, V } = P, L = assets.links, N = L.pieces.length, sc = chainsScale(P, L), lx = P.chains.x * W, ly = P.chains.y * H;
  const cx = W / 2, cy = V ? H * .4 : H * .5, R0 = Math.min(W, H) * (V ? .27 : .25), m = snapAmount(fs, P), Lp = Math.max(1, P.outT - P.inT), out = [];
  for (let i = 0; i < N; i++) { const pc = L.pieces[i], k = i % 3, idx = Math.floor(i / 3), cnt = Math.ceil((N - k) / 3), band = fs.bands[RING_BAND[k]];
    const r = R0 * (1 + .42 * k) * (1 + .22 * band + .05 * fs.kick), dir = k % 2 ? -1 : 1, cyc = Math.max(1, Math.round(Lp * RING_RATE[k]));
    const th = (idx / cnt + dir * fs.flow(RING_BAND[k], cyc)) * Math.PI * 2, ox = cx + Math.cos(th) * r, oy = cy + Math.sin(th) * r * (V ? .92 : .8);
    const hx = lx + (pc.x + pc.w / 2 - L.w / 2) * sc, hy = ly + (pc.y + pc.h / 2 - L.h / 2) * sc, me = clamp(m * 1.15 - (i / N) * .15);
    out.push({ pc, x: ox + (hx - ox) * me, y: oy + (hy - oy) * me, r: (th + Math.PI / 2) * (1 - me), s: (u * .78 * (1 + .18 * k)) * (1 - me) + sc * me * (1 + .05 * fs.kick * me), front: me >= .5 || Math.sin(th) > 0, k }); }
  return { list: out, m, cx, cy, R0 };
}
function drawPieces(ctx, list, imgs, front) {
  for (const q of list) { if (q.front !== front) continue; const pc = q.pc; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.r); ctx.scale(q.s, q.s);
    ctx.drawImage(imgs.img, pc.ax - imgs.pad, pc.ay - imgs.pad, pc.w + 2 * imgs.pad, pc.h + 2 * imgs.pad, -pc.w / 2 - imgs.pad, -pc.h / 2 - imgs.pad, pc.w + 2 * imgs.pad, pc.h + 2 * imgs.pad); ctx.restore(); }
}
export default {
  id: 'orbit', name: 'Bloom Orbit', category: 'Bloom', pal: 'amethyst', surface: 'dark', chainStyle: 'solid', selfChains: true,
  textPos: 'top',
  params: [{ id: 'trail', label: 'Ring glow', min: 0, max: 1, step: .05, def: .5 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .72, s: .66 }, eleph: { x: .5, y: 0, s: .72, len: .37 } } : { chains: { x: .84, y: .52, s: .62 }, eleph: { x: .5, y: 0, s: .7, len: .45 } },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, a2 = accentOn(p), glow = (P.params && P.params.trail != null) ? P.params.trail : .5, TAU = Math.PI * 2;
    const G = poses(fs, P, assets), { cx, cy, R0 } = G;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .65); gr.addColorStop(0, p.bg2); gr.addColorStop(1, p.bg); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // orbit rings: dotted ellipses, brightness from their band
    ctx.save(); ctx.translate(cx, cy);
    for (let k = 0; k < 3; k++) { const band = fs.bands[RING_BAND[k]], r = R0 * (1 + .42 * k) * (1 + .22 * band + .05 * fs.kick);
      ctx.strokeStyle = rgba(k === 1 ? a2 : p.main, (.12 + .4 * band) * glow * (1 - G.m * .7)); ctx.lineWidth = (2 + 6 * band * glow) * u; ctx.setLineDash([2 * u, 10 * u]);
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * (V ? .92 : .8), 0, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([]);
    for (let d = 0; d < 360; d += 30) { const a = d * Math.PI / 180 + fs.cyc(.01) * TAU, r = R0 * 2.15; ctx.fillStyle = rgba(p.main, .5); ctx.fillRect(Math.cos(a) * r - 2 * u, Math.sin(a) * r * (V ? .92 : .8) - 2 * u, 4 * u, 4 * u); }
    for (const r of fs.recent('snares', .5, 2)) { const q = r.age / .5; ctx.strokeStyle = rgba(p.spark, (1 - q) * .8 * r.s); ctx.lineWidth = 3 * u * (1 - q) + 1; ctx.beginPath(); ctx.arc(0, 0, R0 * (.4 + q * .9), 0, TAU); ctx.stroke(); }
    ctx.restore();
    if (P.chains.on) drawPieces(ctx, G.list, chainImages(assets, p, 'solid', false), false);
    const mx = V ? 70 * u : W * .04, ty = V ? 100 * u : H * .08;
    txt(ctx, 'ORBIT.SYS', mx, ty, mono(22 * u, 700), p.main); txt(ctx, G.m > .5 ? 'LOCKED · U2C' : 'ORBIT · ' + ['BASS', 'MID', 'HI'].map((b, k) => b + ' ' + fs.bands[RING_BAND[k]].toFixed(2)).join(' '), mx, ty + 30 * u, mono(16 * u), rgba(p.main, .65));
    sparkle(ctx, W - mx, ty, 18 * u + 12 * u * fs.hat, p.spark);
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 44 * u, rgba(p.main, .5), 2 * u);
  },
  // links on the near side of each ring pass in front of the elephant
  drawAfter(ctx, fs, P, p, assets) { if (P.chains.on) drawPieces(ctx, poses(fs, P, assets).list, chainImages(assets, p, 'solid', false), true); },
};
