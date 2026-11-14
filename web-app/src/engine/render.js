// The one render pipeline: template -> overlays (elephant, chains, text) -> finish (grain) -> glitch slices -> post-FX.
import { TEMPLATES, paramDefaults } from '../templates/index.js';
import { resolvePalette } from '../brand/palettes.js';
import { getFrameState } from './frame.js';
import { makeParams, phrase } from './layout.js';
import { chains, chainsScale } from '../overlays/chains.js';
import { elephant } from '../overlays/elephant.js';
import { textOverlay } from '../overlays/text.js';
import { noiseTile, pat, hash, clamp, mk } from '../util/draw.js';
export function makeSurface(w, h) { const canvas = mk(w, h); return { canvas, ctx: canvas.getContext('2d'), w: canvas.width, h: canvas.height }; }
/**
 * Tasteful glitch trigger: strong kicks (top 25 % onset strength) or bar 1 of a phrase ('kicks'), every bar ('bars') or
 * phrase downbeats only ('phrases'). Returns {e: 0..1 ease-out envelope over <= 80 ms, seed} or null.
 */
export function glitchHit(fs, P, ph) {
  const mode = P.fx.glitchOn || 'kicks', WIN = .08, cand = [];
  const phraseAge = ph.lb >= 0 && ph.lb < 1 ? ph.lb * fs.spb : 99; cand.push([phraseAge, 7919 + ph.k]);
  if (mode === 'kicks' && fs.kickStrong) cand.push([fs.kickAge, fs.kickIdx]);
  if (mode === 'bars') { const a = fs.barP * 4 * fs.spb; cand.push([a, 104729 + fs.bar]); }
  let best = null; for (const [age, seed] of cand) if (age >= 0 && age < WIN && (!best || age < best.age)) best = { age, seed };
  if (!best) return null; const q = 1 - best.age / WIN; return { e: q * q, seed: best.seed };
}
function slices(ctx, P, s, g, hit) {
  // 3-4 thin horizontal slices, shifted sideways by a few pixels, cut from the frame itself (canvas self-copy)
  // default amount (~30 %): 3-4 thin slices, offsets of a few px; the slider scales count, height and offset
  const c = ctx.canvas, w = c.width, h = c.height, n = 3 + (hash(hit.seed, 1) > .5 ? 1 : 0) + Math.floor(g * 2.2), u = P.u * s, k = .4 + 1.6 * g;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (let j = 0; j < n; j++) { const y = Math.floor(hash(hit.seed, 20 + j) * h * .92), hh = Math.max(1, Math.round((3 + 12 * hash(hit.seed, 40 + j)) * u * (.7 + g))), dx = Math.round((hash(hit.seed, 60 + j) - .5) * 2 * (8 + 34 * hash(hit.seed, 80 + j)) * u * k * hit.e);
    if (dx) ctx.drawImage(c, 0, y, w, hh, dx, y, w, hh); }
  ctx.restore();
}
export function createRenderer({ assets, postfx }) {
  function finish(ctx, fs, P, tpl, gpu) {
    const { W, H, u } = P, g = P.finish.grain * (tpl.grainBoost || 1);
    if (g > 0) { const fn = Math.floor(fs.lt * 24), n = ((fn % 4) + 4) % 4, k = Math.max(1, 1.6 * u); ctx.save(); ctx.globalAlpha = clamp(g * .7); ctx.fillStyle = pat(ctx, 'n' + n, () => noiseTile(n));
      ctx.translate(-hash(fn, 3) * 256, -hash(fn, 4) * 256); ctx.scale(k, k); ctx.fillRect(0, 0, (W + 512) / k, (H + 512) / k); ctx.restore(); }
    if (!gpu && P.fx.on && P.fx.crt > 0) { ctx.save(); ctx.globalAlpha = clamp(P.fx.crt * P.fx.amount * (tpl.surface === 'paper' ? .4 : .7)); ctx.fillStyle = pat(ctx, 'scan', () => { const c = mk(1, 6), x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, 1, 2); return c; });
      ctx.scale(1, Math.max(1, u)); ctx.fillRect(0, 0, W, H / Math.max(1, u)); ctx.restore(); }
  }
  /**
   * renderFrame(t, surface, project, track, opt) draws the frame for audio time t.
   * surface: {canvas, ctx, w, h} sized w = W*scale. Returns the canvas holding the finished frame (may be the WebGL canvas);
   * opt.target (a 2D context) additionally receives a scaled copy (grid cards, thumbnails, the studio view).
   */
  return function renderFrame(t, surf, project, track, opt = {}) {
    const tpl = TEMPLATES[project.tpl] || TEMPLATES.u2cexe, pal = resolvePalette(project);
    const P = makeParams(project, track); P.params = { ...paramDefaults(tpl), ...((project.params || {})[tpl.id] || {}) };
    const s = surf.w / P.W, fs = getFrameState(track, t, { intensity: project.finish.intensity, loop: P.loop }), ph = phrase(fs, P), ctx = surf.ctx;
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = true;
    ctx.save();
    if (P.finish.zoom) { const z = 1 + .005 * (.5 - .5 * Math.cos(2 * Math.PI * ph.lb / ph.C)); /* 0.5 % camera push across each phrase (seamless) */ ctx.translate(P.W / 2, P.H / 2); ctx.scale(z, z); ctx.translate(-P.W / 2, -P.H / 2); }
    ctx.save(); tpl.draw(ctx, fs, P, pal, assets); ctx.restore();
    if (P.eleph.on && !opt.noOverlays) { ctx.save(); elephant.draw(ctx, fs, P, pal, assets, tpl); ctx.restore(); }
    if (P.chains.on && !opt.noOverlays) { ctx.save(); chains.draw(ctx, fs, P, pal, assets, tpl); ctx.restore(); }
    ctx.save(); textOverlay.draw(ctx, fs, P, pal, assets, tpl); ctx.restore();
    ctx.restore();
    finish(ctx, fs, P, tpl, postfx && postfx.gpu && P.fx.on);
    const gh = P.fx.on && P.fx.glitch > 0 ? glitchHit(fs, P, ph) : null;
    if (gh) slices(ctx, P, s, P.fx.glitch * (tpl.glitchBoost || 1), gh);
    let dropAge = 99; const D = track.drops; for (let j = D.length - 1; j >= 0; j--) if (D[j] <= t) { dropAge = t - D[j]; break; }
    const L = assets.links, sc = chainsScale(P, L);
    const ev = { tpl, pal, ph, gh, dropAge, center: { x: P.chains.x * P.W, y: P.chains.y * P.H }, radius: Math.max(L.w, L.h) * sc * .7 };
    const out = postfx ? postfx.apply(surf.canvas, fs, P, ev, s) : surf.canvas;
    if (opt.target) { opt.target.drawImage(out, 0, 0, opt.target.canvas.width, opt.target.canvas.height); }
    return out;
  };
}
