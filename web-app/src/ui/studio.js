// Studio: the preview canvas (renderFrame every frame while playing or after any change), click a window to inspect
// it and drag it to move it, transport, the timeline toolbar and the keyboard (NLE / DAW shortcuts).
import { ASPECTS } from '../v8/layout.js';
import { SNAPS, snapBeat, parseSheet, validateSheet, serializeSheet } from '../cues/schema.js';
import { PRESETS } from '../cues/generate.js';
import { saveFile } from '../export/save.js';
import { fmtTC, clamp, slug } from '../util/draw.js';
import { createLayers } from './layers.js';
import { createBlur } from '../engine/render.js';
import { createVideoLayer } from './video.js';
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const SAFE = { '916': { hard: { x0: 162, x1: 918, y0: 288, y1: 1248 }, relaxed: { x0: 108, x1: 972, y0: 288, y1: 1440 }, zones: [{ x: 0, y: 0, w: 1080, h: 288, label: 'status + top bar' }, { x: 0, y: 1248, w: 1080, h: 672, label: 'caption · CTA · audio' }, { x: 918, y: 1000, w: 162, h: 248, label: 'like/share' }] },
  '169': { hard: { x0: 96, x1: 1824, y0: 80, y1: 900 }, relaxed: { x0: 64, x1: 1856, y0: 54, y1: 960 }, zones: [{ x: 0, y: 960, w: 1920, h: 120, label: 'player controls' }] } };

export function createStudio(app) {
  const view = $('#view'), vctx = view.getContext('2d'), stage = $('#stage'); let zoom = 'fit', res = 1, dirty = true, drag = null, info = {}, pick = null, shuttle = 0, lastNow = 0;
  const P = () => app.store.project, track = () => app.store.session.track, tl = () => app.cuetl;
  const markDirty = () => { dirty = true; };
  const phone = () => matchMedia('(max-width: 900px)').matches;
  function layout() { const { W, H } = ASPECTS[P().aspect], bw = stage.clientWidth - 24, bh = stage.clientHeight - 24, dpr = Math.max(1, Math.min(2, devicePixelRatio || 1));
    const cssW = zoom === 'fit' ? W * Math.max(.05, Math.min(bw / W, bh / H)) : W, cssH = cssW * H / W; view.style.width = cssW + 'px'; view.style.height = cssH + 'px';
    // the preview renders at the displayed size x dpr (capped at the delivery size), export always at full size
    // v21 playback resolution (Full / 1/2 / 1/4, Premiere's "Playback Resolution"): fewer pixels per preview frame, export untouched
    const pw = Math.max(64, Math.round((zoom === 'fit' ? Math.min(W, Math.round(cssW * dpr)) : W) * res)); if (view.width !== pw) { view.width = pw; view.height = Math.round(pw * H / W); }
    stage.style.placeItems = zoom === 'fit' ? 'center' : 'start'; buildSafe(); markDirty(); tl().setCollapsed(P().timeline.collapsed ?? phone()); $('#lanesBtn').setAttribute('aria-pressed', !!tl().state.collapsed); }
  function buildSafe() { const a = P().aspect, Z = SAFE[a], { W, H } = ASPECTS[a], pc = (v, d) => (v / d * 100) + '%';
    $('#safe').innerHTML = Z.zones.map((z) => `<i style="left:${pc(z.x, W)};top:${pc(z.y, H)};width:${pc(z.w, W)};height:${pc(z.h, H)}">${z.label}</i>`).join('') +
      `<b class="rel" style="left:${pc(Z.relaxed.x0, W)};top:${pc(Z.relaxed.y0, H)};width:${pc(Z.relaxed.x1 - Z.relaxed.x0, W)};height:${pc(Z.relaxed.y1 - Z.relaxed.y0, H)}"></b><b style="left:${pc(Z.hard.x0, W)};top:${pc(Z.hard.y0, H)};width:${pc(Z.hard.x1 - Z.hard.x0, W)};height:${pc(Z.hard.y1 - Z.hard.y0, H)}"></b>`; }
  function setAspectUI() { $$('#aspectSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.a === P().aspect)); $('#metaLine').textContent = `${ASPECTS[P().aspect].label} · ${P().export.fps} fps · ${ASPECTS[P().aspect].platform}`; }
  function readouts() { const tr = track(); if (!tr) return; const p = P(), len = p.outT - p.inT, sb = Math.round((p.inT - tr.t0) / tr.barDur) - tr.song.startIdx + 1;
    $('#readout').innerHTML = `<span>song bar <b>${sb}</b></span><span>len <b>${len.toFixed(1)} s · ${Math.round(len / tr.barDur)} bars</b></span><span><b>${Math.round(tr.bpm * 100) / 100}</b> bpm</span>`;
    $('#lgCounts').textContent = `${fmtTC(p.inT)} → ${fmtTC(p.outT)} · drag the region or pick a length`; }
  // ---- pick + drag windows on the preview
  let layers = null;
  const surf = { canvas: view, ctx: vctx, get w() { return view.width; }, get h() { return view.height; } };
  function world(e) { const r = view.getBoundingClientRect(), { W, H } = ASPECTS[P().aspect], x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H, c = info.cam || { x: W / 2, y: H / 2, z: 1 };
    return { x: (x - W / 2) / c.z + c.x, y: (y - H / 2) / c.z + c.y, sx: x, sy: y, W, H }; }
  function rectsNow() { const e = app.clip.current(), f = e && app.clip.film(e, P().aspect); return f ? f.rects(app.cues.ev(), tl().state.playhead, info.look) : {}; }
  function hitWin(pt) { const R = rectsNow(); let best = null; for (const [id, r] of Object.entries(R)) if (pt.x >= r[0] && pt.x <= r[0] + r[2] && pt.y >= r[1] && pt.y <= r[1] + r[3]) best = [id, r]; return best; }
  function showPick() { const box = $('#pickBox'); if (!pick) { box.hidden = true; return; } const R = rectsNow()[pick]; if (!R) { box.hidden = true; return; } const { W, H } = ASPECTS[P().aspect], c = info.cam || { x: W / 2, y: H / 2, z: 1 };
    const sx = (R[0] - c.x) * c.z + W / 2, sy = (R[1] - c.y) * c.z + H / 2; Object.assign(box.style, { left: sx / W * 100 + '%', top: sy / H * 100 + '%', width: R[2] * c.z / W * 100 + '%', height: R[3] * c.z / H * 100 + '%' }); box.hidden = false; }
  view.addEventListener('pointerdown', (e) => { const pt = world(e), h = hitWin(pt); if (!h) { pick = null; showPick(); return; }
    pick = h[0]; app.inspector.showElement('win.' + pick); $('.tabs [data-tab="inspect"]').click(); view.setPointerCapture(e.pointerId);
    drag = { id: pick, x0: pt.x, y0: pt.y, r0: h[1], moved: false }; showPick(); });
  view.addEventListener('pointermove', (e) => { const pt = world(e); if (!drag) { view.classList.toggle('grab', !!hitWin(pt)); return; }
    const dx = Math.round(pt.x - drag.x0), dy = Math.round(pt.y - drag.y0); if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; app.cues.begin(); view.classList.add('grabbing'); }
    app.actions.setProp(`win.${drag.id}.x`, drag.r0[0] + dx, true); app.actions.setProp(`win.${drag.id}.y`, drag.r0[1] + dy, true); showPick(); });
  const endDrag = () => { if (drag && drag.moved) app.cues.commit('move window'); drag = null; view.classList.remove('grabbing'); app.inspector.show(); };
  view.addEventListener('pointerup', endDrag); view.addEventListener('pointercancel', endDrag);
  app.videoLayer = createVideoLayer(app);
  layers = createLayers(app, $('#layerList'), { pick: (id) => { pick = id; showPick(); } });
  if (window.ResizeObserver) new ResizeObserver(() => { if (!$('#studio').hidden) layout(); }).observe(stage);
  // ---- transport
  const setPlayIcon = () => { const pl = app.clock.playing; $('#playIco').innerHTML = pl ? '<path d="M3 2h4v12H3zM9 2h4v12H9z" fill="currentColor"/>' : '<path d="M4 2l10 6-10 6z" fill="currentColor"/>'; $('#playBtn').setAttribute('aria-label', pl ? 'Pause' : 'Play'); };
  app.clock.onChange(setPlayIcon);
  $('#playBtn').onclick = () => { shuttle = 0; app.actions.togglePlay(); };
  $('#restartBtn').onclick = () => app.actions.seek(P().inT);
  $('#loopBtn').onclick = (e) => { app.store.set({ project: { loop: !P().loop } }); e.currentTarget.setAttribute('aria-pressed', P().loop); };
  $('#vol').oninput = (e) => app.clock.setVolume(+e.target.value);
  $$('#aspectSeg button').forEach((b) => (b.onclick = () => app.actions.setAspect(b.dataset.a)));
  $$('#zoomSeg button').forEach((b) => (b.onclick = () => { zoom = b.dataset.z; $$('#zoomSeg button').forEach((x) => x.setAttribute('aria-pressed', x === b)); layout(); }));
  $('#safeBtn').onclick = (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); $('#safe').hidden = !on; };
  $('#fsBtn').onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {}); };
  document.addEventListener('fullscreenchange', () => setTimeout(layout, 60)); window.addEventListener('resize', () => { if (!$('#studio').hidden) layout(); });
  $$('[data-len]').forEach((b) => (b.onclick = () => app.actions.applyHook(b.dataset.len === 'full' ? 'full' : +b.dataset.len)));
  // ---- timeline toolbar
  const syncSnap = () => $$('#snapSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === P().timeline.snap));
  $$('#snapSeg button').forEach((b) => (b.onclick = () => { app.store.set({ project: { timeline: { snap: b.dataset.s } } }); syncSnap(); tl().markDirty(); })); syncSnap();
  $('#undoBtn').onclick = () => app.cues.undo(); $('#redoBtn').onclick = () => app.cues.redo();
  $('#zoomIn').onclick = () => tl().zoomBy(1.5); $('#zoomOut').onclick = () => tl().zoomBy(1 / 1.5); $('#zoomFit').onclick = () => tl().fit();
  // magnet (object snapping), compact lanes, graph editor, ripple a bar
  const syncTools = () => { const t = P().timeline; $('#magnetBtn').setAttribute('aria-pressed', t.magnet !== false); $('#compactBtn').setAttribute('aria-pressed', !!tl().compact); $('#graphBtn').setAttribute('aria-pressed', !!tl().state.graph); };
  $('#magnetBtn').onclick = () => { app.store.set({ project: { timeline: { magnet: P().timeline.magnet === false } } }); syncTools(); };
  $('#compactBtn').onclick = () => { tl().setCompact(!tl().compact); requestAnimationFrame(syncTools); };
  $('#graphBtn').onclick = () => { tl().toggleGraph(); syncTools(); };
  $('#ripInBtn').onclick = () => tl().rippleBar(1); $('#ripOutBtn').onclick = () => tl().rippleBar(-1);
  app.cues.subscribe(() => requestAnimationFrame(syncTools)); requestAnimationFrame(syncTools);
  $('#lanesBtn').onclick = () => { const c = !tl().state.collapsed; app.store.set({ project: { timeline: { collapsed: c } } }); tl().setCollapsed(c); $('#lanesBtn').setAttribute('aria-pressed', c); };
  $('#addTrackBtn').onclick = () => { tl().clearSel(); $('.tabs [data-tab="inspect"]').click(); const s = $('#insp [data-k="element"]'); if (s) { s.focus(); try { s.showPicker && s.showPicker(); } catch (_) {} } };
  const ps = $('#presetSel'); ps.innerHTML = '<option value="">Preset…</option>' + Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  ps.onchange = () => { if (ps.value) app.actions.applyPreset(ps.value); ps.value = ''; };
  $('#cueExport').onclick = async () => { const blob = new Blob([JSON.stringify(serializeSheet(app.cues.sheet), null, 1)], { type: 'application/json' }); await saveFile(blob, slug(P().title) + '.cues.json'); };
  $('#cueImport').onclick = () => $('#cueFile').click();
  $('#cueFile').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const doc = JSON.parse(await f.text()), sheet = parseSheet(doc), warn = validateSheet(doc, app.registry().byPath); app.cues.replace(sheet, 'import'); $('#exStatus').textContent = `Imported ${f.name}${warn.length ? ' · ' + warn.length + ' note(s): ' + warn.slice(0, 2).join('; ') : ''}`; }
    catch (err) { alert('That file is not a U2C cue sheet: ' + err.message); } };
  const undoUI = () => { $('#undoBtn').disabled = !app.cues.canUndo; $('#redoBtn').disabled = !app.cues.canRedo; };
  app.cues.subscribe(undoUI); undoUI();
  // dock height (drag the grip)
  const grip = $('#dockGrip'); let gy = null, gh = 0;
  grip.addEventListener('pointerdown', (e) => { gy = e.clientY; gh = $('#dock').getBoundingClientRect().height; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointermove', (e) => { if (gy == null) return; const h = clamp(gh - (e.clientY - gy), 180, window.innerHeight * .7); document.querySelector('#studio').style.setProperty('--dock-h', h + 'px'); layout(); });
  grip.addEventListener('pointerup', () => { gy = null; });
  grip.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const h = clamp($('#dock').getBoundingClientRect().height + (e.key === 'ArrowUp' ? 24 : -24), 180, window.innerHeight * .7); $('#studio').style.setProperty('--dock-h', h + 'px'); layout(); } });
  // phone: the inspector moves into a bottom sheet while keys are selected
  const sheetSync = () => { const home = $('#inspHome'), body = $('#sheetBody'), ins = $('#insp'), want = phone() && tl().selected().length ? body : home; if (ins.parentElement !== want) want.appendChild(ins); };
  app.cues.subscribe(sheetSync); $('#sheetClose').onclick = () => { tl().clearSel(); sheetSync(); };
  // ---- keyboard
  document.addEventListener('keydown', (e) => {
    if ($('#studio').hidden || !track()) return; const tag = document.activeElement && document.activeElement.tagName, typing = /INPUT|SELECT|TEXTAREA/.test(tag) && !(document.activeElement.type === 'range' || document.activeElement.type === 'checkbox');
    const mod = e.metaKey || e.ctrlKey, k = e.key;
    if (mod && (k === 'z' || k === 'Z')) { if (typing) return; e.preventDefault(); if (e.shiftKey) app.cues.redo(); else app.cues.undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { if (typing) return; e.preventDefault(); app.cues.redo(); return; }
    if (typing) return;
    const T = tl(), grid = SNAPS[P().timeline.snap] || .25, tr = track();
    const seekB = (b) => app.actions.seek(P().inT + Math.round(clamp(b, 0, (P().outT - P().inT) / tr.spb) * tr.spb * 30) / 30);
    if (mod && k === 'c') { if (T.copy()) e.preventDefault(); return; }
    if (mod && (k === 'v' || k === 'V') && e.shiftKey) { if (T.pasteAttributes()) e.preventDefault(); return; }
    if (mod && k === 'v') { if (T.paste()) e.preventDefault(); return; }
    if (mod && k === 'd') { e.preventDefault(); T.duplicate(); return; }
    if (mod && k === 'a') { e.preventDefault(); T.selectAll(); return; }
    if (mod) return;
    if (k === ' ') { e.preventDefault(); shuttle = 0; app.actions.togglePlay(); }
    else if (k === 'k' || k === 'K') { shuttle = 0; app.clock.pause(); }
    else if (k === 'l' || k === 'L') { shuttle = 0; if (!app.clock.playing) app.actions.togglePlay(); }
    else if (k === 'j' || k === 'J') { if (app.clock.playing) app.clock.pause(); shuttle = shuttle < 0 ? Math.max(-4, shuttle * 2) : -1; lastNow = performance.now(); }
    else if (k === 'i' || k === 'I') T.setLoopIn();
    else if (k === 'o' || k === 'O') T.setLoopOut();
    else if (k === 's' || k === 'S') T.split();
    else if (k === 'Delete' || k === 'Backspace') { if (T.del()) e.preventDefault(); }
    else if (k === 'Escape') { if (T.selected().length) T.clearSel(); else T.clearLoop(); }
    else if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); const d = k === 'ArrowRight' ? 1 : -1; if (!T.nudge(d, e.shiftKey)) seekB(snapBeat(T.state.playhead, grid) + d * (e.shiftKey ? 4 : grid)); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') { if (T.nudgeValue(k === 'ArrowUp' ? 1 : -1)) e.preventDefault(); }
    else if (k === '+' || k === '=') T.zoomBy(1.5);
    else if (k === '-' || k === '_') T.zoomBy(1 / 1.5);
    else if (k === 'Home') seekB(0);
    else if (k === 'End') seekB(1e9);
    else if (k === '[' || k === ']' || k === '{' || k === '}') { e.preventDefault(); const d = k === ']' || k === '}' ? 1 : -1; if (e.shiftKey) T.navMarker(d); else T.navKey(d, null, e.altKey); }
    else if (k === 'm' || k === 'M') T.addMarker();
    else if (k === 'z' || k === 'Z') { if (e.shiftKey) T.zoomToLoop(); else T.zoomToSelection(); }
    else if (k === '\\') T.fit();
    else if (k === 'g' || k === 'G') T.toggleLaneHeight();
    else if (k === 'e' || k === 'E') { T.toggleGraph(); syncTools(); }
    else if (k === 'q' || k === 'Q') T.quantise(e.shiftKey ? 'grid' : 'markers', 1);
    else if (k === 'b' || k === 'B') T.cycleInterp();
    else if (k === 'n' || k === 'N') { app.store.set({ project: { timeline: { magnet: P().timeline.magnet === false } } }); syncTools(); }
    else if (k === 'r' || k === 'R') T.rippleBar(e.shiftKey ? -1 : 1);
    else if (k === 't' || k === 'T') { const r = T.rows()[T.state.focusRow]; if (r && !r.summary) T.setTarget(r.path, !(r.track && r.track.target)); }
    else if (k === ';') T.toggleKey();
    else if (k === ',' || k === '.') { const f = (k === '.' ? 1 : -1) / 30; app.actions.seek(clamp(app.clock.time() + f, P().inT, P().outT - 1 / 30)); }
  });
  // ---- loop
  let lastUI = 0, lastLayers = 0, lastTq = -1, blurOn = false; const blurF = createBlur(), post = [];   // post: v21 monitor overlays (A/B compare)
  try { blurOn = localStorage.getItem('u2c.previewBlur') === '1'; } catch {}
  const blurBtn = $('#blurBtn'); blurBtn.setAttribute('aria-pressed', blurOn);
  blurBtn.addEventListener('click', () => { blurOn = !blurOn; blurBtn.setAttribute('aria-pressed', blurOn); lastTq = -1; markDirty(); try { localStorage.setItem('u2c.previewBlur', blurOn ? '1' : '0'); } catch {} });
  function frame(now) {
    requestAnimationFrame(frame); const tr = track(); if ($('#studio').hidden || !tr || app.store.session.exporting) return;
    const p = P(); let t = app.clock.time();
    if (shuttle) { const dt = (now - (lastNow || now)) / 1000; lastNow = now; t = Math.max(p.inT, t + shuttle * dt); app.clock.seek(t); if (t <= p.inT) shuttle = 0; dirty = true; }
    const L = tl().state.loop;
    if (app.clock.playing) { if (L) { const a = p.inT + L.a * tr.spb, b = p.inT + L.b * tr.spb; if (t >= b) { app.clock.play(a); t = a; } }
      else if (app.clock.mode === 'track' && t >= p.outT) { if (p.loop) { app.actions.playLoop(p.inT); t = p.inT; } else { app.clock.pause(); app.clock.seek(p.outT - 1 / 30); } } }
    tl().setTime(t - p.inT); if (app.videoLayer.loaded) app.videoLayer.sync(t);
    if (blurOn) { const fps = p.export.fps || 30, tq = p.inT + Math.round((t - p.inT) * fps) / fps; if (tq !== lastTq) { lastTq = tq; dirty = true; } }   // v20: blur previews on the export's frame grid
    if (app.clock.playing ? (!blurOn || dirty) : dirty) { dirty = false; info = {};
      if (blurOn) { let first = true; blurF((tt, s2, inf) => { const r = app.renderFrame(tt, s2, p, tr, { info: inf }); if (first) { first = false; info = inf; } return r; }, lastTq, surf, p.export.fps || 30, p.export.shutter ?? 0.5); }
      else app.renderFrame(t, surf, p, tr, { info }); for (const fn of post) fn(t, surf, p, tr, info); $('#measuring').textContent = info.look ? '' : 'measuring the section…'; if (pick) showPick();
      app.timeline.setTime(t, !app.clock.playing); app.inspector.tick && app.inspector.tick(); }
    if (now - lastLayers > 250) { lastLayers = now; layers.update(); }
    tl().draw(); if (!app.clock.playing) app.inspector.tick && app.inspector.tick();
    if (now - lastUI > 40 || !app.clock.playing) { lastUI = now; $('#tc').textContent = fmtTC(Math.max(0, t - p.inT)); $('#barPill').textContent = tl().bbt(Math.max(0, (t - p.inT) / tr.spb)); }
  }
  requestAnimationFrame(frame);
  app.store.subscribe((st, keys) => { markDirty(); if (keys.some((k) => /project\.(inT|outT)/.test(k))) readouts(); });
  return { layout, setAspectUI, readouts, markDirty, setPlayIcon, surf, sheetSync, syncTools,
    /** v21: preview resolution factor (1, 0.5, 0.25) and post-draw hooks (fn(t, surf, project, track, info) after each preview frame). */
    setRes(f) { res = f; layout(); }, get res() { return res; }, onPostDraw(fn) { post.push(fn); }, get info() { return info; } };
}
