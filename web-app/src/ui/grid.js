// Home grid: the three looks rendering the user's beat on an 8-bar preview section (from the bar before the first
// drop), each with a cue sheet generated from the analysis. Hover a card to hear it, click it to open the studio.
import { LOOKS, LOOK_NAMES, LOOK_BLURB, ASPECTS } from '../v8/layout.js';
import { STAGES, STAGE_IDS } from '../v8/core.js';
import { makeSurface } from '../engine/render.js';
import { generateSheet } from '../cues/generate.js';
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
export function createGrid(app) {
  const box = $('#grid'), home = $('#home'); let cards = [], aspect = '916', loop = [0, 8], t0 = performance.now(), hovered = null, tick = 0, surf = null, entry = null, io = null;
  $('#gridStage').innerHTML = STAGE_IDS.map((id) => `<button data-stage="${id}" aria-pressed="${id === app.store.project.stage}">${(STAGES[id].short || STAGES[id].name.slice(0, 3))}</button>`).join('');
  $$('#gridStage button').forEach((b) => (b.onclick = () => { app.actions.setStage(b.dataset.stage); $$('#gridStage button').forEach((x) => x.setAttribute('aria-pressed', x === b)); sheets(); }));
  $$('#gridAspect button').forEach((b) => (b.onclick = () => { $$('#gridAspect button').forEach((x) => x.setAttribute('aria-pressed', x === b)); aspect = b.dataset.a; build(); }));
  function sheets() { if (!entry || !entry.ready) return; for (const c of cards) { c.sheet = generateSheet({ bars: entry.bars, labels: entry.labels, look: c.id, stage: app.store.project.stage, aspect }); c.sheet.base['result.on'] = false; } }  // cards loop: keep the bench live
  function build() {
    const tr = app.store.session.track; if (!tr) return; box.innerHTML = ''; cards = []; const { W, H } = ASPECTS[aspect];
    const cw = aspect === '916' ? 300 : 400, ch = Math.round(cw * H / W); surf = makeSurface(cw, ch);
    if (io) io.disconnect(); io = window.IntersectionObserver ? new IntersectionObserver((es) => es.forEach((e) => { const c = cards.find((x) => x.cv === e.target); if (c) c.vis = e.isIntersecting; })) : null;
    LOOKS.forEach((id, i) => { const b = document.createElement('button'); b.className = 'card'; b.dataset.tpl = id; b.setAttribute('aria-label', `Open ${LOOK_NAMES[id]} in the studio`);
      b.innerHTML = `<div class="shot"><canvas width="${cw}" height="${ch}"></canvas><span class="num">${String(i + 1).padStart(2, '0')}</span></div><div class="meta"><b>${LOOK_NAMES[id]}</b><span>${LOOK_BLURB[id]}</span></div>`;
      const cv = b.querySelector('canvas'), c = { id, i, cv, ctx: cv.getContext('2d'), vis: true, el: b, sheet: null };
      b.addEventListener('click', () => app.actions.openStudio(id, aspect));
      b.addEventListener('pointerenter', () => { hovered = c; const ua = navigator.userActivation; if (!ua || ua.hasBeenActive) app.clock.play(loop[0] + (((performance.now() - t0) / 1000) % (loop[1] - loop[0]))); });
      b.addEventListener('pointerleave', () => { if (hovered === c) { hovered = null; app.clock.pause(); } });
      app.motion.tilt(b); box.appendChild(b); cards.push(c); if (io) io.observe(cv); });
    app.motion.staggerIn(cards.map((c) => c.el)); sheets();
  }
  function render(c, t) { const tr = app.store.session.track; if (!tr || !entry || !c.sheet) return; app.renderFrame(t, surf, { ...app.store.project, look: c.id, aspect }, tr, { entry, sheet: c.sheet, target: c.ctx }); }
  function frame() {
    requestAnimationFrame(frame); const tr = app.store.session.track; if (home.hidden || !tr || app.store.session.exporting || !entry || !entry.ready) return; tick++;
    const len = loop[1] - loop[0]; let t;
    if (hovered && app.clock.playing) { t = app.clock.time(); if (t >= loop[1] || t < loop[0] - .5) { app.clock.play(loop[0]); t = loop[0]; } } else t = loop[0] + (((performance.now() - t0) / 1000) % len);
    for (const c of cards) { if (!c.vis && c.drawn) continue; if (c.vis && c !== hovered && (tick + c.i) % 2) continue; render(c, t); if (c.sheet && entry && entry.ready) c.drawn = true; }   // v22: off-screen cards still get one frame (a poster), so scrolling never shows a blank card
  }
  requestAnimationFrame(frame);
  return {
    setTrack(tr) { const w = app.hook(tr, 8 * tr.barDur); loop = [w[0], w[1]]; t0 = performance.now(); entry = app.clip.entry(loop[0], loop[1]); build(); if (entry) entry.promise.then(() => { sheets(); }); return loop; },
    refresh() { const tr = app.store.session.track; if (tr) { entry = app.clip.entry(loop[0], loop[1]); if (entry) entry.promise.then(sheets); } $$('#gridStage button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.stage === app.store.project.stage)); },
    get aspect() { return aspect; }, get loop() { return loop; }, get entry() { return entry; },
  };
}
