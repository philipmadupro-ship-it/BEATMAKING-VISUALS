// The one render pipeline: template -> overlays (elephant, chains, text) -> finish (grain) -> post-FX.
import { TEMPLATES, paramDefaults } from '../templates/index.js';
import { PALETTES } from '../brand/palettes.js';
import { getFrameState } from './frame.js';
import { makeParams, phrase } from './layout.js';
import { chains, chainsScale } from '../overlays/chains.js';
import { elephant } from '../overlays/elephant.js';
import { textOverlay } from '../overlays/text.js';
import { noiseTile, pat, hash, clamp, mk } from '../util/draw.js';
export function makeSurface(w, h) { const canvas = mk(w, h); return { canvas, ctx: canvas.getContext('2d'), w: canvas.width, h: canvas.height }; }
export function createRenderer({ assets, postfx }) {
  function finish(ctx, fs, P, tpl, gpu) {
    const { W, H, u } = P, g = P.finish.grain * (tpl.grainBoost || 1);
    if (g > 0) { const fn = Math.floor(fs.t * 24), n = fn % 4, k = Math.max(1, 1.6 * u); ctx.save(); ctx.globalAlpha = clamp(g * .85); ctx.fillStyle = pat(ctx, 'n' + n, () => noiseTile(n));
      ctx.translate(-hash(fn, 3) * 256, -hash(fn, 4) * 256); ctx.scale(k, k); ctx.fillRect(0, 0, (W + 512) / k, (H + 512) / k); ctx.restore(); }
    if (!gpu && P.fx.on && P.fx.crt > 0) { ctx.save(); ctx.globalAlpha = clamp(P.fx.crt * (tpl.surface === 'paper' ? .3 : .55)); ctx.fillStyle = pat(ctx, 'scan', () => { const c = mk(1, 6), x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, 1, 2); return c; });
      ctx.scale(1, Math.max(1, u)); ctx.fillRect(0, 0, W, H / Math.max(1, u)); ctx.restore(); }
  }
  /**
   * renderFrame(t, surface, project, track) draws the frame for audio time t.
   * surface: {canvas, ctx, w, h} sized w = W*scale. Returns the canvas holding the finished frame (may be the WebGL canvas).
   */
  return function renderFrame(t, surf, project, track, opt = {}) {
    const tpl = TEMPLATES[project.tpl] || TEMPLATES.lab, pal = PALETTES[project.pal] || PALETTES.charcoal;
    const P = makeParams(project, track); P.params = { ...paramDefaults(tpl), ...((project.params || {})[tpl.id] || {}) };
    const s = surf.w / P.W, fs = getFrameState(track, t, { intensity: project.finish.intensity }), ph = phrase(fs, P), ctx = surf.ctx;
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = true;
    ctx.save();
    if (P.finish.zoom) { const z = 1 + .018 * (.5 - .5 * Math.cos(2 * Math.PI * ph.lb / ph.C)); ctx.translate(P.W / 2, P.H / 2); ctx.scale(z, z); ctx.translate(-P.W / 2, -P.H / 2); }
    ctx.save(); tpl.draw(ctx, fs, P, pal, assets); ctx.restore();
    if (P.eleph.on && !opt.noOverlays) { ctx.save(); elephant.draw(ctx, fs, P, pal, assets, tpl); ctx.restore(); }
    if (P.chains.on && !opt.noOverlays) { ctx.save(); chains.draw(ctx, fs, P, pal, assets, tpl); ctx.restore(); }
    ctx.save(); textOverlay.draw(ctx, fs, P, pal, assets, tpl); ctx.restore();
    if (P.text.showHandle && P.text.handle && tpl.id !== 'handset') { ctx.font = `500 ${22 * P.u}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.fillStyle = tpl.surface === 'paper' ? pal.ink : pal.main; ctx.globalAlpha = .75; ctx.fillText(P.text.handle, P.W / 2, P.V ? P.safe.hard.y1 + 40 * P.u : P.H * .955); ctx.globalAlpha = 1; }
    ctx.restore();
    finish(ctx, fs, P, tpl, postfx && postfx.gpu && P.fx.on);
    let dropAge = 99; const D = track.drops; for (let j = D.length - 1; j >= 0; j--) if (D[j] <= t) { dropAge = t - D[j]; break; }
    const L = assets.links, sc = chainsScale(P, L);
    const ev = { tpl, ph, dropAge, center: { x: P.chains.x * P.W, y: P.chains.y * P.H }, radius: Math.max(L.w, L.h) * sc * .7 };
    const out = postfx ? postfx.apply(surf.canvas, fs, P, ev, s) : surf.canvas;
    if (opt.target) { opt.target.drawImage(out, 0, 0, opt.target.canvas.width, opt.target.canvas.height); }
    return out;
  };
}
