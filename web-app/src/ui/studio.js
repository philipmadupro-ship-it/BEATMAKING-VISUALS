// Studio: stage canvas (live render, drag overlays), palette chips, aspect / fit / safe area, transport, keyboard.
import { TEMPLATE_LIST, TEMPLATE_ORDER, TEMPLATES, applyDefaults, paramDefaults } from '../templates/index.js';
import { PALETTES, PALETTE_ORDER } from '../brand/palettes.js';
import { ASPECTS, SAFE, makeParams } from '../engine/layout.js';
import { makeSurface } from '../engine/render.js';
import { chainsBounds } from '../overlays/chains.js';
import { elephantBounds } from '../overlays/elephant.js';
import { textBounds } from '../overlays/text.js';
import { getFrameState } from '../engine/frame.js';
import { fmtTC, clamp } from '../util/draw.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
export function createStudio(app) {
  const view = $('#view'), vctx = view.getContext('2d'), stage = $('#stage'); let surf = null, zoom = 'fit', dirty = true, drag = null;
  const S = () => app.store.project, track = () => app.store.session.track;
  const markDirty = () => { dirty = true; };
  function layout() { const { W, H } = ASPECTS[S().aspect], bw = stage.clientWidth - 32, bh = stage.clientHeight - 32, dpr = Math.min(2, devicePixelRatio || 1);
    const cssW = zoom === 'fit' ? W * Math.max(.05, Math.min(bw / W, bh / H)) : W, cssH = cssW * H / W; view.style.width = cssW + 'px'; view.style.height = cssH + 'px';
    const pw = zoom === 'fit' ? Math.min(W, Math.round(cssW * dpr)) : W; if (view.width !== pw) { view.width = pw; view.height = Math.round(pw * H / W); }
    if (!surf || surf.w !== view.width || surf.h !== view.height) surf = makeSurface(view.width, view.height);
    stage.style.placeItems = zoom === 'fit' ? 'center' : 'start'; buildSafe(); markDirty(); }
  function buildSafe() { const a = S().aspect, Z = SAFE[a], { W, H } = ASPECTS[a], el = $('#safe'), pc = (v, d) => (v / d * 100) + '%';
    el.innerHTML = Z.zones.map(z => `<i style="left:${pc(z.x, W)};top:${pc(z.y, H)};width:${pc(z.w, W)};height:${pc(z.h, H)}">${z.label}</i>`).join('') +
      `<b class="rel" style="left:${pc(Z.relaxed.x0, W)};top:${pc(Z.relaxed.y0, H)};width:${pc(Z.relaxed.x1 - Z.relaxed.x0, W)};height:${pc(Z.relaxed.y1 - Z.relaxed.y0, H)}"></b><b style="left:${pc(Z.hard.x0, W)};top:${pc(Z.hard.y0, H)};width:${pc(Z.hard.x1 - Z.hard.x0, W)};height:${pc(Z.hard.y1 - Z.hard.y0, H)}"></b>`; }
  function chips() { const box = $('#palChips'); box.innerHTML = ''; for (const k of PALETTE_ORDER) { const p = PALETTES[k], b = document.createElement('button'); b.className = 'chip'; b.setAttribute('aria-pressed', k === S().pal);
      b.innerHTML = `<span class="sw"><i style="background:${p.bg}"></i><i style="background:${p.main}"></i></span>${p.name}`; b.onclick = () => app.actions.setPalette(k); box.appendChild(b); } }
  function thumbs() { const g = $('#lookGrid'), tr = track(); if (!tr) return; g.innerHTML = ''; const { W, H } = ASPECTS[S().aspect], tt = S().inT + 4 * tr.spb + .05, cw = S().aspect === '916' ? 132 : 200, s2 = makeSurface(cw, Math.round(cw * H / W));
    TEMPLATE_LIST.forEach((t, i) => { const b = document.createElement('button'); b.className = 'lk'; b.dataset.tpl = t.id; b.setAttribute('aria-pressed', t.id === S().tpl);
      b.innerHTML = `<canvas width="${s2.w}" height="${s2.h}"></canvas><div class="lm"><b>${t.name}</b><kbd>${i < 9 ? i + 1 : ''}</kbd></div><span>${t.category}</span>`;
      const p = app.store.snapshot(); p.tpl = t.id; applyDefaults(p, t.id); p.fx.glitch = 0; app.renderFrame(tt, s2, p, tr, { target: b.querySelector('canvas').getContext('2d') });
      b.onclick = () => app.actions.setTemplate(t.id); g.appendChild(b); }); paramsUI(); }
  function paramsUI() { const t = TEMPLATES[S().tpl], box = $('#tplParams'), cur = { ...paramDefaults(t), ...((S().params || {})[t.id] || {}) };
    box.innerHTML = `<div class="lbl">${t.name} settings</div>` + (t.params || []).map(p => `<div class="ctl"><label class="lbl" for="tp_${p.id}">${p.label}</label><input type="range" id="tp_${p.id}" min="${p.min}" max="${p.max}" step="${p.step}" value="${cur[p.id]}"><output>${cur[p.id]}</output></div>`).join('');
    (t.params || []).forEach(p => { const el = $('#tp_' + p.id); el.addEventListener('input', () => { el.nextElementSibling.textContent = el.value; app.store.set({ project: { params: { [t.id]: { [p.id]: +el.value } } } }); }); }); }
  function setAspectUI() { $$('#aspectSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.a === S().aspect)); $('#metaLine').textContent = ASPECTS[S().aspect].label + ' · ' + S().export.fps + ' fps · ' + ASPECTS[S().aspect].platform; }
  function readouts() { const tr = track(); if (!tr) return; const p = S(), len = p.outT - p.inT;
    $('#readout').innerHTML = `<span>in <b>${fmtTC(p.inT)}</b></span><span>out <b>${fmtTC(p.outT)}</b></span><span>len <b>${len.toFixed(1)} s · ${(len / tr.barDur).toFixed(1)} bars</b></span>`;
    $('#lgCounts').textContent = `kicks ${tr.kicks.t.length} · snares ${tr.snares.t.length} · hats ${tr.hats.t.length} · drops ${tr.drops.length}`; }
  // ---- drag overlays on the canvas
  function logical(e) { const r = view.getBoundingClientRect(), { W, H } = ASPECTS[S().aspect]; return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  function hit(pt) { const tr = track(); if (!tr) return null; const P = makeParams(S(), tr), A = app.assets, inside = b => b && pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
    const fs = getFrameState(tr, app.clock.time(), {}); const tb = textBounds(vctx, P, fs, TEMPLATES[S().tpl]);
    if (inside(tb)) return { kind: 'text', b: tb }; if (S().chains.on && inside(chainsBounds(P, A))) return { kind: 'chains' }; if (S().eleph.on && inside(elephantBounds(P, A))) return { kind: 'eleph' }; return null; }
  view.addEventListener('pointerdown', e => { const pt = logical(e), h = hit(pt); if (!h) return; view.setPointerCapture(e.pointerId); const p = S(); drag = { ...h, start: pt, orig: JSON.parse(JSON.stringify({ chains: p.chains, eleph: p.eleph, text: p.text })) }; view.classList.add('grabbing'); });
  view.addEventListener('pointermove', e => { const pt = logical(e), { W, H } = ASPECTS[S().aspect];
    if (!drag) { view.classList.toggle('grab', !!hit(pt)); return; }
    const dx = (pt.x - drag.start.x) / W, dy = (pt.y - drag.start.y) / H, o = drag.orig;
    if (drag.kind === 'chains') app.store.set({ project: { chains: { x: clamp(o.chains.x + dx), y: clamp(o.chains.y + dy) } } }, 'drag');
    else if (drag.kind === 'eleph') app.store.set({ project: { eleph: { x: clamp(o.eleph.x + dx), len: clamp(o.eleph.len + dy, 0, .6) } } }, 'drag');
    else app.store.set({ project: { text: { tx: clamp(o.text.tx + dx), ty: clamp(o.text.ty + dy) } } }, 'drag'); });
  const endDrag = () => { drag = null; view.classList.remove('grabbing'); }; view.addEventListener('pointerup', endDrag); view.addEventListener('pointercancel', endDrag);
  // ---- transport + keys
  const setPlayIcon = () => { const pl = app.clock.playing && !$('#studio').hidden; $('#playIco').innerHTML = pl ? '<path d="M3 2h4v12H3zM9 2h4v12H9z" fill="currentColor"/>' : '<path d="M4 2l10 6-10 6z" fill="currentColor"/>'; $('#playBtn').setAttribute('aria-label', pl ? 'Pause' : 'Play'); };
  app.clock.onChange(setPlayIcon);
  $('#playBtn').onclick = () => app.actions.togglePlay();
  $('#restartBtn').onclick = () => app.actions.seek(S().inT);
  $('#loopBtn').onclick = e => { app.store.set({ project: { loop: !S().loop } }); e.currentTarget.setAttribute('aria-pressed', S().loop); };
  $('#vol').oninput = e => app.clock.setVolume(+e.target.value);
  document.addEventListener('keydown', e => { if ($('#studio').hidden || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return; const tr = track(); if (!tr) return;
    const t = app.clock.time();
    if (e.code === 'Space') { e.preventDefault(); app.actions.togglePlay(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const d = (e.shiftKey ? 4 : 1) * tr.spb * (e.key === 'ArrowRight' ? 1 : -1), b = Math.round((t - tr.t0) / tr.spb); app.actions.seek(clamp(tr.t0 + b * tr.spb + d, 0, tr.duration)); }
    else if (e.key === 'i' || e.key === 'I') { const a = app.timeline.snap(t); if (a < S().outT - tr.barDur * .5) app.actions.setClip(a, S().outT, 'key'); }
    else if (e.key === 'o' || e.key === 'O') { const b = app.timeline.snap(t); if (b > S().inT + tr.barDur * .5) app.actions.setClip(S().inT, b, 'key'); }
    else if (/^[1-9]$/.test(e.key) && TEMPLATE_ORDER[+e.key - 1]) app.actions.setTemplate(TEMPLATE_ORDER[+e.key - 1]);
    else if (e.key === 'Home') app.actions.seek(S().inT); });
  $$('#aspectSeg button').forEach(b => b.onclick = () => app.actions.setAspect(b.dataset.a));
  $$('#zoomSeg button').forEach(b => b.onclick = () => { zoom = b.dataset.z; $$('#zoomSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); layout(); });
  $('#safeBtn').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); $('#safe').hidden = !on; };
  $('#fsBtn').onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {}); };
  document.addEventListener('fullscreenchange', () => setTimeout(layout, 60)); window.addEventListener('resize', () => { if (!$('#studio').hidden) layout(); });
  $$('[data-len]').forEach(b => b.onclick = () => app.actions.applyHook(b.dataset.len === 'full' ? 'full' : +b.dataset.len));
  $('#wsZoom').addEventListener('input', e => app.timeline.zoom(+e.target.value));
  // ---- loop
  let lastUI = 0;
  function frame() { requestAnimationFrame(frame); const tr = track(); if ($('#studio').hidden || !tr || app.store.session.exporting) return;
    let t = app.clock.time(); const p = S();
    if (app.clock.playing) { if (p.loop && t >= p.outT) { app.clock.play(p.inT); t = p.inT; } else if (t >= tr.duration) { app.clock.pause(); app.clock.seek(tr.duration); } }
    if (!(app.clock.playing || dirty)) return; dirty = false;
    app.renderFrame(t, surf, p, tr, { target: vctx });
    app.timeline.setTime(t, !app.clock.playing);
    const now = performance.now(); if (now - lastUI > 40 || !app.clock.playing) { lastUI = now; $('#tc').textContent = fmtTC(t); const b = (t - tr.t0) / tr.spb; $('#barPill').textContent = 'bar ' + (Math.floor(b / 4) + 1) + '.' + ((Math.floor(b) % 4 + 4) % 4 + 1); } }
  requestAnimationFrame(frame);
  app.store.subscribe((st, keys, why) => { markDirty(); if (keys.some(k => /project\.(inT|outT)/.test(k))) readouts(); });
  return { layout, chips, thumbs, paramsUI, setAspectUI, readouts, markDirty, setPlayIcon, get surf() { return surf; } };
}
