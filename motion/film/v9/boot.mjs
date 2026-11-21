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
const opts = { ev, tags, fps: D.fps, look: html.dataset.look, stage: html.dataset.stage, test, preroll: C.preroll || 0 };
if (C.waveDebug) film.core.waveDebug = {};
// v17.2 adaptive motion blur: the frame itself first; only when the camera / intro is moving (vs the previous frame, if adjacent) are 2 more
// sub-frames rendered at +-shutter/2 of a frame and averaged in (running mean). Static frames cost 1 render, moving ones 3.
const MB = Math.max(1, C.mblur || 1), SH = C.shutter ?? 0.5; let off = null, prev = null, prevT = -1;
const moving = (a, p) => { if (!p) return true; if (a.intro || p.intro) return !a.intro || !p.intro || Math.abs(a.index - p.index) > 0.002 || Math.abs(a.push - p.push) > 0.0005 || Math.abs(a.enter - p.enter) > 0.002;
  if (!a.cam || !p.cam) return true; const W0 = ctx.canvas.width; return Math.abs(a.cam.z - p.cam.z) / a.cam.z * W0 + Math.abs(a.cam.x - p.cam.x) + Math.abs(a.cam.y - p.cam.y) > 2; };
const render = (t) => {
  const r = film.render(ctx, t, opts); if (MB <= 1) return r;
  const adj = Math.abs(t - prevT - 1 / D.fps) < 1e-4, mv = !adj || moving(r, prev); prev = r; prevT = t; if (!mv) return r;
  const cv = ctx.canvas; if (!off || off.width !== cv.width || off.height !== cv.height) { off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height; }
  const octx = off.getContext('2d'); let k = 1;
  for (const d of [-0.5, 0.5]) { octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, off.width, off.height); film.render(octx, t + d * SH / D.fps, opts); k++;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 / k; ctx.drawImage(off, 0, 0); ctx.restore(); }
  return r;
};
window.__u2cBoot(render, {
  film, sheet, D,
  schedule: () => film.schedule(ev, opts),
  trace: (t) => film.trace(t, ev),
  chainInfo: () => { film.trace(0, ev); return film.brand.chainInfo(); },
  waveDebug: () => film.core.waveDebug,
});
