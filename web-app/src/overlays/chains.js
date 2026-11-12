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
  // fly-in starts after the shatter has finished (2.5): links launch in logo order, so the word assembles left to right
  const st = h1 * .35, land = 3.25 + Math.round(i / (N - 1) * 6) / 8;
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
/** Seek the chain timeline for this frame. Returns the logo transform and each link's pose in canvas pixels. */
export function chainPose(fs, P, assets, place) {
  const L = assets.links, N = L.pieces.length; if (!built) built = build(L);
  const pl = place || { x: P.chains.x * P.W, y: P.chains.y * P.H, sc: chainsScale(P, L) }, ph = phrase(fs, P), I = fs.I, hold = ph.tt >= 4 ? 1 : 0;
  if (built.tl) built.tl.time(ph.tt, true);
  const pieces = [];
  for (let i = 0; i < N; i++) { const pc = L.pieces[i], o = built.tl ? built.objs[i] : analytic(L, i, ph.tt, built.objs[i]), h2 = hash(i, 12), h3 = hash(i, 13);
    const lx = pc.x + pc.w / 2 - L.w / 2 + o.x, ly = pc.y + pc.h / 2 - L.h / 2 + o.y - hold * fs.kick * 10 * h3;
    pieces.push({ i, pc, lx, ly, x: pl.x + lx * pl.sc, y: pl.y + ly * pl.sc, a: o.a, s: o.s * (1 + hold * .045 * fs.kick),
      r: o.r + hold * ((h2 - .5) * 2 * .085 * fs.kick * I + Math.sin(fs.beat * Math.PI + i) * .012), hx: pl.x + (pc.x + pc.w / 2 - L.w / 2) * pl.sc, hy: pl.y + (pc.y + pc.h / 2 - L.h / 2) * pl.sc }); }
  return { ph, place: pl, pieces, impact: ph.impactAge < .25 ? 1 - ph.impactAge / .25 : 0 };
}
/** Atlas images for a style: 'neon' (outline + glow) or 'solid'; colours from the palette unless given. */
export function chainImages(assets, pal, style, surfacePaper, col) {
  const neon = style === 'neon';
  const img = neon ? (surfacePaper ? neonAtlas(assets, col || pal.ink, pal.pacc) : neonAtlas(assets, col || pal.hi, pal.main)) : solidAtlas(assets, col || (surfacePaper ? pal.ink : pal.chain));
  const flash = neon ? neonAtlas(assets, pal.light || surfacePaper ? pal.ink : '#ffffff', pal.main) : flatAtlas(assets, surfacePaper ? pal.pacc : pal.hi);
  return { img, flash, pad: neon ? 16 : 0 };
}
/** The assembled logo as one cached image (for static prints: phone screen, app icon, stickers). */
export function logoImage(assets, col, style = 'solid') {
  const L = assets.links;
  return cached('logo|' + col + style, L.w + 40, L.h + 40, (g) => { const A = style === 'neon' ? neonAtlas(assets, col, col) : flatAtlas(assets, col), pad = style === 'neon' ? 16 : 0;
    for (const pc of L.pieces) g.drawImage(A, pc.ax - pad, pc.ay - pad, pc.w + 2 * pad, pc.h + 2 * pad, 20 + pc.x - pad, 20 + pc.y - pad, pc.w + 2 * pad, pc.h + 2 * pad); });
}
/** Draw the animated logo from a pose. */
export function drawChains(ctx, pose, imgs, alpha = 1) {
  const { img, flash, pad } = imgs, sc = pose.place.sc;
  for (const q of pose.pieces) { if (q.a <= .01) continue; const pc = q.pc;
    ctx.save(); ctx.globalAlpha = q.a * alpha; ctx.translate(q.x, q.y); ctx.scale(sc, sc); ctx.rotate(q.r); ctx.scale(q.s, q.s);
    const sx = pc.ax - pad, sy = pc.ay - pad, sw = pc.w + 2 * pad, sh = pc.h + 2 * pad;
    ctx.drawImage(img, sx, sy, sw, sh, -pc.w / 2 - pad, -pc.h / 2 - pad, sw, sh);
    ctx.restore(); }
  const fl = pose.flash || 0; if (fl > .05) for (const q of pose.pieces) { if (q.a <= .01) continue; const pc = q.pc;
    ctx.save(); ctx.globalAlpha = q.a * alpha * fl * .8; ctx.translate(q.x, q.y); ctx.scale(sc, sc); ctx.rotate(q.r); ctx.scale(q.s, q.s);
    ctx.drawImage(flash, pc.ax - pad, pc.ay - pad, pc.w + 2 * pad, pc.h + 2 * pad, -pc.w / 2 - pad, -pc.h / 2 - pad, pc.w + 2 * pad, pc.h + 2 * pad); ctx.restore(); }
}
export const chains = {
  id: 'chains', name: 'U2C chains',
  draw(ctx, fs, P, pal, assets, tpl) {
    const pose = chainPose(fs, P, assets), hold = pose.ph.tt >= 4 ? 1 : 0;
    pose.flash = Math.max(hold * fs.snare, pose.impact);
    drawChains(ctx, pose, chainImages(assets, pal, tpl.chainStyle, tpl.surface === 'paper'));
  },
};
