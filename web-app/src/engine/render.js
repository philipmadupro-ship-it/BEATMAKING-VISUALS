// The one render pipeline: renderFrame(t) draws the v8 film for audio time t from the section's clip data and the cue
// sheet. Preview, scrubbing, thumbnails, the home grid and export all call this; it is a pure function of
// (t, clip data, cue sheet, project), so every frame is deterministic.
import { createEvaluator } from '../cues/schema.js';
import { stageOf } from '../v8/core.js';
export function makeSurface(w, h) { const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h)); return { canvas, ctx: canvas.getContext('2d'), w: canvas.width, h: canvas.height }; }
const today = () => new Date().toUTCString().split(' ').slice(1, 4).join(' ').toUpperCase();

export function createRenderer(app) {
  /**
   * renderFrame(t, surf, project, track, opt): opt.entry (clip entry, default: the studio section), opt.sheet (a cue sheet,
   * default: the app's), opt.fps (export frame rate: frames are sampled at their centre), opt.target (2D context that
   * receives a scaled copy). Returns the canvas with the frame, or null while the clip data is still being measured.
   */
  return function renderFrame(t, surf, project, track, opt = {}) {
    const e = opt.entry || app.clip.current(), film = app.clip.film(e, project.aspect), ctx = surf.ctx;
    if (!film) { const S = stageOf(project.stage); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = S.bg; ctx.fillRect(0, 0, surf.w, surf.h);
      ctx.fillStyle = S.dim; ctx.font = `500 ${Math.max(10, surf.w / 40)}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.fillText('measuring the section…', surf.w / 2, surf.h / 2);
      if (opt.target) opt.target.drawImage(surf.canvas, 0, 0, opt.target.canvas.width, opt.target.canvas.height); return null; }
    const ev = opt.sheet ? (opt.sheet.__ev || (Object.defineProperty(opt.sheet, '__ev', { value: createEvaluator(opt.sheet), enumerable: false }), opt.sheet.__ev)) : app.cues.ev();
    const tags = opt.tags || app.cues.tags(today());
    if (project.producer && tags.producer === '@uche2crazy' && project.producer !== '@uche2crazy') tags.producer = project.producer;
    const pre = opt.preroll || 0;   // v19.4: click-to-play pre-roll (export): t runs from inT - pre; the film gets composition time and opts.preroll
    const info = film.render(ctx, t - e.inT + pre, { ev, tags, fps: opt.fps || 30, look: project.look, stage: project.stage, preroll: pre });
    if (opt.target) opt.target.drawImage(surf.canvas, 0, 0, opt.target.canvas.width, opt.target.canvas.height);
    if (opt.info) Object.assign(opt.info, info);
    return surf.canvas;
  };
}

/**
 * v20 shared motion blur (export + preview use the SAME code, so what you see is what the MP4 gets; it mirrors the native renderer):
 * render the frame; if the camera / intro moved against the previous frame (or this is a jump), render 2 sub-frames at
 * t +- shutter/2 frames and average them in (running mean, alpha 1/2 then 1/3). Still frames are never blurred.
 * createBlur(W, H) -> (renderOne(t, surf, info) -> canvas, t, work, fps, shutter, force?) -> canvas
 */
export function createBlur() {
  let prev = null, prevT = -1, off = null;
  const moving = (a, p, W) => { if (!p) return true; if (a.intro || p.intro) return !a.intro || !p.intro || Math.abs(a.index - p.index) > 0.002 || Math.abs(a.push - p.push) > 0.0005 || Math.abs(a.enter - p.enter) > 0.002;
    if (!a.cam || !p.cam) return true; return Math.abs(a.cam.z - p.cam.z) / a.cam.z * W + Math.abs(a.cam.x - p.cam.x) + Math.abs(a.cam.y - p.cam.y) > 2; };
  return function blurFrame(renderOne, t, work, fps, shutter = 0.5, force = false) {
    const info = {}, cv = renderOne(t, work, info) || work.canvas;
    let mv = force || Math.abs(t - prevT - 1 / fps) > 1e-4 || moving(info, prev, work.w);
    if (!force && Math.abs(t - prevT - 1 / fps) > 1e-4) { const pi = {}; off = off && off.w === work.w ? off : makeSurface(work.w, work.h); renderOne(t - 1 / fps, off, pi); mv = moving(info, pi, work.w); }   // a jump (preview scrub): compare with the frame before
    prev = info; prevT = t; if (!mv) return cv;
    off = off && off.w === work.w ? off : makeSurface(work.w, work.h); let k = 1;
    for (const d of [-0.5, 0.5]) { renderOne(t + d * shutter / fps, off, {}); k++; work.ctx.save(); work.ctx.setTransform(1, 0, 0, 1, 0, 0); work.ctx.globalCompositeOperation = 'source-over'; work.ctx.globalAlpha = 1 / k; work.ctx.drawImage(off.canvas, 0, 0); work.ctx.restore(); }
    return cv;
  };
}
