// Elephant pendant: hangs from the top edge on a chain, swings like a pendulum. Period = 2 beats (extremes on each beat),
// amplitude follows the slow low band. The swing curve is a paused GSAP sine timeline seeked by beat position.
import { cached, clamp, hex3, rrect } from '../util/draw.js';
let G = null, pend = null;
export function useGsap(gsap) { G = gsap; pend = null; }
function swing(beat) {
  const x = ((beat % 2) + 2) % 2;
  if (G) { if (!pend) { const o = { a: 1 }, tl = G.timeline({ paused: true }); tl.fromTo(o, { a: 1 }, { a: -1, duration: 1, ease: 'sine.inOut' }).to(o, { a: 1, duration: 1, ease: 'sine.inOut' }); pend = { o, tl }; } pend.tl.time(x, true); return pend.o.a; }
  return Math.cos(Math.PI * x);
}
export function elephFor(assets, pal, surface) {
  const img = assets.eleph;
  return cached('el|' + pal.id + surface, img.width, img.height, (g, w, h) => { g.drawImage(img, 0, 0);
    const duo = pal.duo; if (!duo) return; const d = g.getImageData(0, 0, w, h), D = d.data, c0 = hex3(duo[0]), c1 = hex3(duo[1]);
    for (let i = 0; i < D.length; i += 4) { if (!D[i + 3]) continue; const l = clamp(((.3 * D[i] + .59 * D[i + 1] + .11 * D[i + 2]) / 255 - .18) * 1.45); for (let k = 0; k < 3; k++) D[i + k] = c0[k] + (c1[k] - c0[k]) * l; }
    g.putImageData(d, 0, 0); });
}
const geo = (P, img) => { const sc = Math.min(P.W, P.H) * .42 / img.width * P.eleph.s, len = P.eleph.len * P.H + 10; return { sc, len }; };
export function elephantBounds(P, assets) { const img = assets.eleph, { sc, len } = geo(P, img); return { x: P.eleph.x * P.W - img.width * sc / 2, y: len - img.height * sc * .3, w: img.width * sc, h: img.height * sc }; }
export const elephant = {
  id: 'elephant', name: 'Elephant pendant',
  draw(ctx, fs, P, pal, assets, tpl) {
    const img = elephFor(assets, pal, tpl.surface), { sc, len } = geo(P, img);
    const amp = clamp((.06 + .34 * fs.lowSlow + .07 * fs.kick) * fs.I, 0, .55), th = amp * swing(fs.beat);
    const col = tpl.surface === 'paper' ? pal.ink : (tpl.chainStyle === 'neon' ? pal.main : (pal.id === 'rust' ? pal.dark : pal.main));
    ctx.save(); ctx.translate(P.eleph.x * P.W, -12); ctx.rotate(th);
    const Lk = Math.max(16, 46 * sc), n = Math.ceil(len / Lk); ctx.strokeStyle = col; ctx.fillStyle = col;
    for (let j = 0; j < n; j++) { const y = j * Lk; if (j % 2 === 0) { ctx.lineWidth = Lk * .17; rrect(ctx, -Lk * .27, y, Lk * .54, Lk * 1.12, Lk * .12); ctx.stroke(); } else ctx.fillRect(-Lk * .08, y - Lk * .05, Lk * .16, Lk * 1.2); }
    ctx.translate(0, len); ctx.rotate(-th * .35 * swing(fs.beat + .5)); const k = 1 + .035 * fs.kick; ctx.scale(sc * k, sc * k);
    ctx.drawImage(img, -img.width * .5, -img.height * .30); ctx.restore();
  },
};
