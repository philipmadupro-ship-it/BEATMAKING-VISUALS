// Home grid: every template rendering the user's beat on its loudest 8 bars. Hover a card to hear it.
import { TEMPLATE_LIST, TEMPLATES, applyDefaults } from '../templates/index.js';
import { PALETTES } from '../brand/palettes.js';
import { ASPECTS } from '../engine/layout.js';
import { makeSurface } from '../engine/render.js';
export function createGrid(app) {
  const box = document.getElementById('grid'); let cards = [], aspect = '916', loop = [0, 8], t0 = performance.now(), hovered = null, tick = 0, surf = null, io = null;
  const home = document.getElementById('home');
  function previewProject(id) { const p = app.store.snapshot(), t = TEMPLATES[id]; p.tpl = id; p.pal = t.pal; p.aspect = aspect; applyDefaults(p, id); p.inT = loop[0]; p.outT = loop[1]; p.chains.cycle = 'auto'; p.params = p.params || {}; return p; }
  function build() {
    const tr = app.store.session.track; if (!tr) return; box.innerHTML = ''; cards = []; const { W, H } = ASPECTS[aspect];
    const cw = aspect === '916' ? 270 : 384, ch = Math.round(cw * H / W); surf = makeSurface(cw, ch);
    if (io) io.disconnect(); io = window.IntersectionObserver ? new IntersectionObserver(es => es.forEach(e => { const c = cards.find(c => c.cv === e.target); if (c) c.vis = e.isIntersecting; })) : null;
    TEMPLATE_LIST.forEach((t, i) => { const b = document.createElement('button'); b.className = 'card'; b.dataset.tpl = t.id; b.setAttribute('aria-label', `Open ${t.name} in the studio`);
      b.innerHTML = `<div class="shot"><canvas width="${cw}" height="${ch}"></canvas><span class="num">${String(i + 1).padStart(2, '0')}</span><span class="live">♪ LIVE</span></div><div class="meta"><b>${t.name}</b><span>${t.category} · ${PALETTES[t.pal].name}</span></div>`;
      const cv = b.querySelector('canvas'), c = { id: t.id, i, cv, ctx: cv.getContext('2d'), p: previewProject(t.id), vis: true, el: b };
      b.addEventListener('click', () => app.actions.openStudio(t.id, aspect));
      b.addEventListener('pointerenter', () => { hovered = c; const ua = navigator.userActivation; if (!ua || ua.hasBeenActive) { const len = loop[1] - loop[0]; app.clock.play(loop[0] + (((performance.now() - t0) / 1000) % len)); } });
      b.addEventListener('pointerleave', () => { if (hovered === c) { hovered = null; app.clock.pause(); } });
      app.motion.tilt(b); box.appendChild(b); cards.push(c); if (io) io.observe(cv); });
    app.motion.staggerIn(cards.map(c => c.el));
    cards.forEach(c => render(c, loop[0] + .02));
  }
  function render(c, t) { const tr = app.store.session.track; if (!tr) return; app.renderFrame(t, surf, c.p, tr, { target: c.ctx }); }
  function frame() {
    requestAnimationFrame(frame); const tr = app.store.session.track; if (home.hidden || !tr || app.store.session.exporting) return; tick++;
    const len = loop[1] - loop[0]; let t;
    if (hovered && app.clock.playing) { t = app.clock.time(); if (t >= loop[1] || t < loop[0] - .5) { app.clock.play(loop[0]); t = loop[0]; } }
    else t = loop[0] + (((performance.now() - t0) / 1000) % len);
    for (const c of cards) { if (!c.vis) continue; if (c !== hovered && (tick + c.i) % 2) continue; render(c, t); }
  }
  requestAnimationFrame(frame);
  return {
    setTrack(tr) { const b = Math.max(1, Math.min(tr.bars.length, 8)); const w = app.hook(tr, b * tr.barDur); loop = [w[0], w[1]]; t0 = performance.now(); build(); return loop; },
    setAspect(a) { aspect = a; build(); },
    get aspect() { return aspect; },
    refreshText() { const T = app.store.project.text, F = app.store.project.fx, C = app.store.project.custom; cards.forEach(c => { c.p.text = JSON.parse(JSON.stringify(T)); c.p.fx = { ...F }; c.p.custom = { ...C }; }); },
    get loop() { return loop; },
  };
}
