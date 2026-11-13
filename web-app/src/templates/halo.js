import { rgba, txt, mono, hud, sparkle, hash, rrect } from '../util/draw.js';
import { accentOn, glowOp } from '../brand/palettes.js';
// BLOOM HALO: the elephant hangs inside a radial mandala built from U2C chain links. Each spoke is a short chain whose
// length follows a spectrum band (mirrored for symmetry); an inner necklace of links turns on loop phase. Snares fire
// bursts of gold ✦ sparkles out of the halo. The U2C word sits under the halo.
export default {
  id: 'halo', name: 'Bloom Halo', category: 'Bloom', pal: 'amethyst', surface: 'dark', chainStyle: 'solid',
  textPos: 'top',
  reserved(P) { const V = P.V, cx = V ? P.W / 2 : P.W * .42, cy = V ? P.H * .38 : P.H * .5, R = Math.min(P.W, P.H) * (V ? .21 : .21) * 1.9; return [{ x: cx - R, y: cy - R, w: 2 * R, h: 2 * R }]; },
  params: [{ id: 'spokes', label: 'Spokes', min: 12, max: 48, step: 2, def: 28 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .865, s: .56 }, eleph: { x: .5, y: 0, s: .62, len: .354 } } : { chains: { x: .84, y: .76, s: .5 }, eleph: { x: .42, y: 0, s: .64, len: .45 } },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, a2 = accentOn(p), n = (P.params && P.params.spokes) || 28, TAU = Math.PI * 2, gold = p.gold || p.spark;
    const cx = V ? W / 2 : W * .42, cy = V ? H * .38 : H * .5, R = Math.min(W, H) * (V ? .21 : .21) * (1 + .04 * fs.kick);
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .6); gr.addColorStop(0, p.bg2); gr.addColorStop(1, p.bg); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // a chain link drawn as a shape: flat links are rounded-rect outlines, edge-on links are bars (like a real chain)
    const link = (x, y, rot, len, flat, col, al) => { ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = col; ctx.fillStyle = col;
      if (flat) { ctx.lineWidth = len * .16; rrect(ctx, -len * .5, -len * .26, len, len * .52, len * .22); ctx.stroke(); } else { ctx.fillRect(-len * .55, -len * .07, len * 1.1, len * .14); } ctx.restore(); };
    const rot0 = fs.cyc(.03) * TAU, Lk = R * .2;
    ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = glowOp(p);
    // faint mandala guides
    ctx.strokeStyle = rgba(p.main, .14); ctx.lineWidth = 1.5 * u; for (const k of [1, 1.6, 2.2]) { ctx.beginPath(); ctx.arc(0, 0, R * k, 0, TAU); ctx.stroke(); }
    // spokes: short chains radiating out, length from the (mirrored) spectrum; alternate spokes in the accent colour
    for (let i = 0; i < n; i++) { const half = i < n / 2 ? i : n - 1 - i, v = fs.specAt(Math.min(47, Math.floor(half / (n / 2) * 40) + 2)), a = rot0 + i / n * TAU, cnt = 1 + v * 6, col = i % 2 ? a2 : p.main;
      for (let j = 0; j < Math.ceil(cnt); j++) { const d = R * 1.08 + Lk * (.5 + j * .82), al = Math.min(1, cnt - j) * (1 - j * .08), sz = Lk * (1 - j * .06);
        link(Math.cos(a) * d, Math.sin(a) * d, a, sz, j % 2 === 0, col, al); } }
    // inner necklace: a closed chain around the elephant, counter-rotating; outer petals every 4th spoke
    const m = Math.max(12, Math.round(TAU * R * .92 / (Lk * .82))); for (let i = 0; i < m; i++) { const a = -rot0 * 1.5 + i / m * TAU; link(Math.cos(a) * R * .92, Math.sin(a) * R * .92, a + Math.PI / 2, Lk * .95, i % 2 === 0, p.main, .9); }
    ctx.lineWidth = 2 * u; for (let i = 0; i < n; i += 4) { const a = rot0 + i / n * TAU; ctx.strokeStyle = rgba(a2, .35 + .4 * fs.snare); ctx.beginPath(); ctx.ellipse(Math.cos(a) * R * 2.2, Math.sin(a) * R * 2.2, Lk * .5, Lk * .22, a, 0, TAU); ctx.stroke(); }
    // snare bursts: gold sparkles fly out of the halo
    for (const r of fs.recent('snares', .7, 3)) { const q = r.age / .7, e = 1 - Math.pow(1 - q, 3);
      for (let j = 0; j < 10; j++) { const a = hash(r.idx, j) * TAU, d = R * (1.1 + e * (1 + hash(r.idx, j + 20) * 1.2)), sz = (14 + 22 * hash(r.idx, j + 40)) * u * (1 - q) * r.s; if (sz > .5) sparkle(ctx, Math.cos(a) * d, Math.sin(a) * d, sz, gold, q * 2); } }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    const mx = V ? 70 * u : W * .04, ty = V ? 100 * u : H * .08;
    txt(ctx, 'HALO.SYS', mx, ty, mono(22 * u, 700), p.main); txt(ctx, n + ' SPOKES · ✦ ON SNARE', mx, ty + 30 * u, mono(16 * u), rgba(p.main, .6));
    sparkle(ctx, W - mx, ty, 18 * u + 12 * u * fs.hat, gold);
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 44 * u, rgba(p.main, .5), 2 * u);
  },
};
