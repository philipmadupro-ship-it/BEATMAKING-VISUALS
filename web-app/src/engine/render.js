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
    const info = film.render(ctx, t - e.inT, { ev, tags, fps: opt.fps || 30, look: project.look, stage: project.stage });
    if (opt.target) opt.target.drawImage(surf.canvas, 0, 0, opt.target.canvas.width, opt.target.canvas.height);
    if (opt.info) Object.assign(opt.info, info);
    return surf.canvas;
  };
}
