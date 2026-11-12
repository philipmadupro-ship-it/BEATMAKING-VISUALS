// U2C chain logo overlay: links fly in and slam together on the phrase downbeat, pulse on kicks/snares,
// then shatter in the last bar of the phrase. Motion is a paused GSAP timeline seeked from audio time.
import { cached, clamp, hash, mk } from '../util/draw.js';
import { phrase } from '../engine/layout.js';
let G = null, built = null;
export function useGsap(gsap) { G = gsap; built = null; }
const easeBackOut = (x, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const easeElastic = (x, p = .4) => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (2 * Math.PI) / (p * 3.33)) + 1;
function pieceSpec(L, i) {
  const P = L.pieces, N = P.length, pc = P[i], pcx = pc.x + pc.w / 2 - L.w / 2, pcy = pc.y + pc.h / 2 - L.h / 2, dl = Math.hypot(pcx, pcy) || 1;
  const h1 = hash(i, 11), h2 = hash(i, 12), h3 = hash(i, 13);
  const st = h1 * .35, land = 2.75 + Math.round(i / (N - 1) * 5) / 4;
  return { st, land, start: land - .75, sx: pcx / dl * 1500 + (h2 - .5) * 900, up: -(250 + 320 * h3), r1: (h1 - .5) * 10, jx: (h2 - .5) * 300, drop: -2600 - h3 * 600, r0: (h1 - .5) * 1.6 };
}
function build(L) {
  const objs = L.pieces.map(() => ({ x: 0, y: 0, r: 0, s: 1, a: 1 }));
  if (!G) return { objs, tl: null };
  const tl = G.timeline({ paused: true });
  objs.forEach((o, i) => { const q = pieceSpec(L, i), T = 2.5 - q.st;
    tl.fromTo(o, { x: 0, r: 0 }, { x: q.sx, r: q.r1, duration: T, ease: 'power1.in', immediateRender: false }, q.st);
    tl.fromTo(o, { y: 0 }, { y: q.up, duration: T * .3, ease: 'power2.out', immediateRender: false }, q.st);
    tl.to(o, { y: 2600, duration: T * .7, ease: 'power2.in' }, q.st + T * .3);
    tl.to(o, { a: 0, duration: T * .35, ease: 'none' }, 2.5 - T * .35);
    tl.set(o, { x: q.jx, y: q.drop, r: q.r0, a: 0 }, 2.5);
    tl.set(o, { a: 1 }, q.start);
    tl.to(o, { y: 0, duration: .75, ease: 'back.out(1.6)' }, q.start);
    tl.to(o, { x: 0, duration: .75, ease: 'power3.out' }, q.start);
    tl.to(o, { r: 0, duration: 1.4, ease: 'elastic.out(1,0.4)' }, q.start);
    tl.fromTo(o, { s: 1 }, { s: 1.16, duration: .01, ease: 'none', immediateRender: false }, 3.99);
    tl.to(o, { s: 1, duration: 1.6, ease: 'elastic.out(1.1,0.35)' }, 4);
  });
  tl.set({}, {}, 6);
  return { objs, tl };
}
// Same motion without GSAP (fallback).
function analytic(L, i, tt, o) {
  const q = pieceSpec(L, i); o.s = 1; o.a = 1; o.x = 0; o.y = 0; o.r = 0;
  if (tt < 2.5) { const T = 2.5 - q.st, u = clamp((tt - q.st) / T); if (u <= 0) return o; o.x = q.sx * u * u; o.r = q.r1 * u * u;
    o.y = u < .3 ? q.up * (1 - Math.pow(1 - u / .3, 2)) : q.up + (2600 - q.up) * Math.pow((u - .3) / .7, 2); o.a = clamp((2.5 - tt) / (T * .35)); return o; }
  if (tt < 4 || tt < q.start + 1.4) { if (tt < q.start) { o.a = 0; return o; } const u = clamp((tt - q.start) / .75);
    o.y = q.drop * (1 - easeBackOut(u)); o.x = q.jx * (1 - (1 - Math.pow(1 - u, 3))); o.r = q.r0 * (1 - easeElastic(clamp((tt - q.start) / 1.4))); }
  if (tt >= 4 && tt < 5.6) o.s = 1 + .16 * (1 - easeElastic((tt - 4) / 1.6, .35));
  return o;
}
const solidAtlas = (A, col) => cached('sa|' + col, A.atlas.width, A.atlas.height, (g, w, h) => { g.drawImage(A.atlas, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; g.drawImage(A.atlas, 0, 0); });
const flatAtlas = (A, col) => cached('fa|' + col, A.atlas.width, A.atlas.height, (g, w, h) => { g.drawImage(A.atlas, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, w, h); });
const neonAtlas = (A, col, glow) => cached('na|' + col + glow, A.edge.width, A.edge.height, (g, w, h) => {
  const tint = c => { const e = mk(w, h), eg = e.getContext('2d'); eg.drawImage(A.edge, 0, 0); eg.globalCompositeOperation = 'source-in'; eg.fillStyle = c; eg.fillRect(0, 0, w, h); return e; };
  const e = tint(glow), c = tint(col);
  try { g.filter = 'blur(7px)'; g.drawImage(e, 0, 0); g.drawImage(e, 0, 0); g.filter = 'blur(2px)'; g.drawImage(e, 0, 0); g.filter = 'none'; } catch (_) {}
  g.drawImage(c, 0, 0); g.drawImage(c, 0, 0); });
export function chainsScale(P, L) { return Math.min(P.W * .84 / L.w, P.H * .46 / L.h) * P.chains.s; }
export function chainsBounds(P, assets) { const L = assets.links, sc = chainsScale(P, L); return { x: P.chains.x * P.W - L.w * sc / 2, y: P.chains.y * P.H - L.h * sc / 2, w: L.w * sc, h: L.h * sc }; }
export const chains = {
  id: 'chains', name: 'U2C chains',
  draw(ctx, fs, P, pal, assets, tpl) {
    const L = assets.links, N = L.pieces.length; if (!built) built = build(L);
    const surf = tpl.surface === 'paper', neon = tpl.chainStyle === 'neon';
    const img = neon ? (surf ? neonAtlas(assets, pal.ink, pal.pacc) : neonAtlas(assets, pal.hi, pal.main)) : solidAtlas(assets, surf ? pal.ink : pal.chain);
    const flash = neon ? neonAtlas(assets, '#ffffff', pal.main) : flatAtlas(assets, surf ? pal.pacc : pal.hi);
    const pad = neon ? 16 : 0, sc = chainsScale(P, L), ph = phrase(fs, P), I = fs.I;
    if (built.tl) built.tl.time(ph.tt, true);
    const impact = ph.impactAge < .25 ? 1 - ph.impactAge / .25 : 0;
    ctx.save(); ctx.translate(P.chains.x * P.W, P.chains.y * P.H); ctx.scale(sc, sc);
    for (let i = 0; i < N; i++) {
      const pc = L.pieces[i], o = built.tl ? built.objs[i] : analytic(L, i, ph.tt, built.objs[i]); if (o.a <= .01) continue;
      const h1 = hash(i, 11), h2 = hash(i, 12), h3 = hash(i, 13);
      const hold = ph.tt >= 4 ? 1 : 0;
      const rot = o.r + hold * ((h2 - .5) * 2 * .085 * fs.kick * I + Math.sin(fs.beat * Math.PI + i) * .012);
      const oy = o.y - hold * fs.kick * 10 * h3, s = o.s * (1 + hold * .045 * fs.kick);
      ctx.save(); ctx.globalAlpha = o.a; ctx.translate(pc.x + pc.w / 2 - L.w / 2 + o.x, pc.y + pc.h / 2 - L.h / 2 + oy); ctx.rotate(rot); ctx.scale(s, s);
      const sx = pc.ax - pad, sy = pc.ay - pad, sw = pc.w + 2 * pad, sh = pc.h + 2 * pad;
      ctx.drawImage(img, sx, sy, sw, sh, -pc.w / 2 - pad, -pc.h / 2 - pad, sw, sh);
      const fl = Math.max(hold * fs.snare, impact); if (fl > .05) { ctx.globalAlpha = o.a * fl * .8; ctx.drawImage(flash, sx, sy, sw, sh, -pc.w / 2 - pad, -pc.h / 2 - pad, sw, sh); }
      ctx.restore(); void h1;
    }
    ctx.restore();
  },
};
