// U2C chain logo overlay. The logo never breaks: near the end of each phrase it dissolves gently letter by letter
// (U → 2 → C) through an ordered-dither mask with a scanline wipe; at the phrase start it rebuilds letter by letter
// (outline draws on left→right, then the fill dithers in). Kicks give the whole logo a 1-3 % spring scale punch and
// a brief edge-brightness pulse. Everything is a pure function of the phrase position (loop-safe).
import { cached, clamp, mk } from '../util/draw.js';
import { phrase, letterState } from '../engine/layout.js';
export function useGsap() {} // kept for API compatibility: the logo motion is analytic now
/** Letter of each link: 0 = U, 1 = 2, 2 = C (by the link's centre x in logo space). */
export const letterOf = pc => (pc.x + pc.w / 2 < 245 ? 0 : pc.x + pc.w / 2 < 540 ? 1 : 2);
let LB = null;
function letterBoxes(L) { return LB || (LB = [0, 1, 2].map(k => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const pc of L.pieces) if (letterOf(pc) === k) { x0 = Math.min(x0, pc.x); y0 = Math.min(y0, pc.y); x1 = Math.max(x1, pc.x + pc.w); y1 = Math.max(y1, pc.y + pc.h); } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; })); }
const solidAtlas = (A, col) => cached('sa|' + col, A.atlas.width, A.atlas.height, (g, w, h) => { g.drawImage(A.atlas, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; g.drawImage(A.atlas, 0, 0); });
const flatAtlas = (A, col) => cached('fa|' + col, A.atlas.width, A.atlas.height, (g, w, h) => { g.drawImage(A.atlas, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, w, h); });
const edgeAtlas = (A, col) => cached('ea|' + col, A.edge.width, A.edge.height, (g, w, h) => { g.drawImage(A.edge, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, w, h); });
const neonAtlas = (A, col, glow) => cached('na|' + col + glow, A.edge.width, A.edge.height, (g, w, h) => {
  const tint = c => { const e = mk(w, h), eg = e.getContext('2d'); eg.drawImage(A.edge, 0, 0); eg.globalCompositeOperation = 'source-in'; eg.fillStyle = c; eg.fillRect(0, 0, w, h); return e; };
  const e = tint(glow), c = tint(col);
  try { g.filter = 'blur(7px)'; g.drawImage(e, 0, 0); g.drawImage(e, 0, 0); g.filter = 'blur(2px)'; g.drawImage(e, 0, 0); g.filter = 'none'; } catch (_) {}
  g.drawImage(c, 0, 0); g.drawImage(c, 0, 0); });
// 4x4 Bayer dither masks: level q in 0..16 → that many cells of every 4x4 block kept (cell = `px` canvas pixels)
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function ditherTile(q, px) { return cached(`dt|${q}|${px}`, 4 * px, 4 * px, g => { g.fillStyle = '#fff'; for (let i = 0; i < 16; i++) if (B4[i] < q) g.fillRect((i % 4) * px, Math.floor(i / 4) * px, px, px); }); }
export function chainsScale(P, L) { return Math.min(P.W * .84 / L.w, P.H * .46 / L.h) * P.chains.s; }
export function chainsBounds(P, assets) { const L = assets.links, sc = chainsScale(P, L); return { x: P.chains.x * P.W - L.w * sc / 2, y: P.chains.y * P.H - L.h * sc / 2, w: L.w * sc, h: L.h * sc }; }
/** Spring for kick punches: 0 at the hit → fast ease-out with one small overshoot. Returns 0..~1.1 → 0. */
export const spring = age => (age < 0 || age > .6 ? 0 : Math.exp(-age / .085) * Math.cos(age * 28));
/** Logo pose for this frame: place, per-link positions (assembled, never scattered), per-letter states. */
export function chainPose(fs, P, assets, place) {
  const L = assets.links, pl = place || { x: P.chains.x * P.W, y: P.chains.y * P.H, sc: chainsScale(P, L) }, ph = phrase(fs, P);
  const punch = 1 + .022 * spring(fs.kickAge) * Math.min(1, fs.kickS * 1.2) * fs.I, letters = [0, 1, 2].map(k => letterState(ph, k)), pieces = [];
  for (const pc of L.pieces) { const k = letterOf(pc), lx = (pc.x + pc.w / 2 - L.w / 2) * punch, ly = (pc.y + pc.h / 2 - L.h / 2) * punch, st = letters[k];
    pieces.push({ pc, k, x: pl.x + lx * pl.sc, y: pl.y + ly * pl.sc, hx: pl.x + lx * pl.sc, hy: pl.y + ly * pl.sc, a: Math.max(st.fill, st.outline * .6), s: punch, r: 0 }); }
  return { ph, place: pl, pieces, letters, punch, pulse: Math.max(0, spring(fs.kickAge)) * fs.kickS, impact: ph.impactAge < .25 ? 1 - ph.impactAge / .25 : 0, boxes: letterBoxes(L), lw: L.w, lh: L.h };
}
/** Atlas images for a style: 'neon' (outline + glow) or 'solid'; colours from the palette unless given. */
export function chainImages(assets, pal, style, surfacePaper, col) {
  const neon = style === 'neon', c = col || (neon ? (surfacePaper ? pal.ink : pal.hi) : (surfacePaper ? pal.ink : pal.chain));
  const img = neon ? (surfacePaper ? neonAtlas(assets, c, pal.pacc) : neonAtlas(assets, c, pal.main)) : solidAtlas(assets, c);
  return { img, edge: edgeAtlas(assets, neon || surfacePaper ? c : (pal.light ? pal.main : pal.hi)), flash: flatAtlas(assets, surfacePaper ? pal.pacc : pal.hi), pad: neon ? 16 : 0 };
}
/** The assembled logo as one cached image (for static prints: phone screen, app icon, stickers). */
export function logoImage(assets, col, style = 'solid') {
  const L = assets.links;
  return cached('logo|' + col + style, L.w + 40, L.h + 40, (g) => { const A = style === 'neon' ? neonAtlas(assets, col, col) : flatAtlas(assets, col), pad = style === 'neon' ? 16 : 0;
    for (const pc of L.pieces) g.drawImage(A, pc.ax - pad, pc.ay - pad, pc.w + 2 * pad, pc.h + 2 * pad, 20 + pc.x - pad, 20 + pc.y - pad, pc.w + 2 * pad, pc.h + 2 * pad); });
}
function drawLetter(g, pose, k, A, pad) { for (const q of pose.pieces) if (q.k === k) { const pc = q.pc; g.drawImage(A, pc.ax - pad, pc.ay - pad, pc.w + 2 * pad, pc.h + 2 * pad, pc.x - pad, pc.y - pad, pc.w + 2 * pad, pc.h + 2 * pad); } }
/** Draw the logo from a pose: full letters directly; dissolving / rebuilding letters through dither + wipe masks. */
export function drawChains(ctx, pose, imgs, alpha = 1) {
  const { img, edge, pad } = imgs, sc = pose.place.sc * pose.punch, m = ctx.getTransform(), dev = Math.hypot(m.a, m.b) * sc, px = Math.max(1, Math.round(2.2 * Math.max(1, dev * 2)));
  ctx.save(); ctx.translate(pose.place.x, pose.place.y); ctx.scale(sc, sc); ctx.translate(-pose.lw / 2, -pose.lh / 2);
  // a dim outline ghost of every letter that is not whole: the logo is never fully gone between dissolve and rebuild
  for (let k = 0; k < 3; k++) { const st = pose.letters[k]; if (st.fill < .999) { ctx.globalAlpha = alpha * .25 * (1 - st.fill); drawLetter(ctx, pose, k, edge, 0); } }
  for (let k = 0; k < 3; k++) { const st = pose.letters[k], b = pose.boxes[k];
    if (st.fill >= .999 && st.outline >= .999) { ctx.globalAlpha = alpha; drawLetter(ctx, pose, k, img, pad);
      if (pose.pulse > .05) { ctx.globalAlpha = alpha * Math.min(1, pose.pulse) * .55; drawLetter(ctx, pose, k, edge, 0); } continue; }
    if (st.fill <= .001 && st.outline <= .001) continue;
    // offscreen letter at device resolution, masked by the dither level (fill) and the wipe (outline draw-on / scanline)
    const W = Math.ceil((b.w + 2 * pad + 8) * dev) + 2, H = Math.ceil((b.h + 2 * pad + 8) * dev) + 2, k2 = W / (b.w + 2 * pad + 8);
    const off = cached(`lt|${k}|${W}x${H}`, W, H, () => {}), g = off.getContext('2d');
    const paint = (A, p2, q, wipe, wipeDir) => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
      g.setTransform(k2, 0, 0, k2, (-b.x + pad + 4) * k2, (-b.y + pad + 4) * k2); drawLetter(g, pose, k, A, p2); g.setTransform(1, 0, 0, 1, 0, 0);
      if (q < 16) { g.globalCompositeOperation = 'destination-in'; g.fillStyle = g.createPattern(ditherTile(q, px), 'repeat'); g.fillRect(0, 0, W, H); }
      if (wipe < 1) { g.globalCompositeOperation = 'destination-in'; g.fillStyle = '#fff'; if (wipeDir === 'x') g.fillRect(0, 0, W * wipe, H); else { const y = H * (1 - wipe); g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 0, W, y); } }
      ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(off, b.x - pad - 4, b.y - pad - 4, W / k2, H / k2); ctx.restore(); };
    if (st.mode === 'rebuild') { if (st.outline > 0) paint(edge, 0, 16, st.outline, 'x'); if (st.fill > 0) paint(img, pad, Math.round(st.fill * 16), 1, 'x'); }
    else { const q = Math.round(st.fill * 16); if (q > 0) paint(img, pad, q, Math.min(1, st.fill * 1.6), 'y'); }
  }
  ctx.restore();
}
export const chains = {
  id: 'chains', name: 'U2C chains',
  draw(ctx, fs, P, pal, assets, tpl) { drawChains(ctx, chainPose(fs, P, assets), chainImages(assets, pal, tpl.chainStyle, tpl.surface === 'paper')); },
};
