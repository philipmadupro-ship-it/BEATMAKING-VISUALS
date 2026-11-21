// Native v9 boot: the web app's composition (src/v8/film.js, synced) on the native analysis (window.U2C_DATA, adapted
// by fromNative) driven by window.U2C_CUES = { sheet, tags, opts }. Exposes U2C6 {renderAt, schedule, trace, waveDebug}.
import { createFilm } from './src/v8/film.js';
import { fromNative } from './src/v8/data.js';
import { loadAssets } from './src/v8/assets.js';
import { loadFonts } from './src/v8/core.js';
import { DEFAULT_TAGS } from './src/v8/tags.js';
import { parseSheet, createEvaluator, mergeDeep } from './src/cues/schema.js';
const C = window.U2C_CUES, html = document.documentElement, aspect = html.dataset.aspect, test = html.dataset.test || '';
const D = fromNative(window.U2C_DATA);
const [assets] = await Promise.all([loadAssets('v9/assets/'), loadFonts()]);
const film = createFilm({ D, assets, aspect }), sheet = parseSheet(C.sheet), ev = createEvaluator(sheet);
const tags = mergeDeep(mergeDeep(DEFAULT_TAGS, sheet.tags || {}), C.tags || {});
const ctx = document.getElementById('stage').getContext('2d');
const opts = { ev, tags, fps: D.fps, look: html.dataset.look, stage: html.dataset.stage, test };
if (C.waveDebug) film.core.waveDebug = {};
// v17 motion blur: N sub-frames spread over `shutter` of a frame (centred on the frame time), running average (sub-frame k drawn at alpha 1/(k+1))
const MB = Math.max(1, C.mblur || 1), SH = C.shutter ?? 0.5; let off = null;
const render = (t) => {
  if (MB <= 1) return film.render(ctx, t, opts);
  const cv = ctx.canvas; if (!off || off.width !== cv.width || off.height !== cv.height) { off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height; }
  const octx = off.getContext('2d'); let r;
  for (let k = 0; k < MB; k++) { const tk = t + (k / (MB - 1) - 0.5) * SH / D.fps;
    if (k === 0) { r = film.render(ctx, tk, opts); continue; }
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, off.width, off.height); film.render(octx, tk, opts);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 / (k + 1); ctx.drawImage(off, 0, 0); ctx.restore(); }
  return r;
};
window.__u2cBoot(render, {
  film, sheet, D,
  schedule: () => film.schedule(ev, opts),
  trace: (t) => film.trace(t, ev),
  chainInfo: () => { film.trace(0, ev); return film.brand.chainInfo(); },
  waveDebug: () => film.core.waveDebug,
});
