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
  const PLUGIN = /[?&]daw=/.test(location.search) || !!document.querySelector('meta[name=u2c-daw-ws]');
  function layout() { const { W, H } = ASPECTS[P().aspect], bw = stage.clientWidth - 24, bh = stage.clientHeight - 24, dpr = Math.max(1, Math.min(PLUGIN ? 1 : 2, devicePixelRatio || 1));   // in the plugin the preview is drawn at 1x (the recorder renders offscreen at export size)
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
  // ---- v27 FREE TRANSFORM (Photoshop): click a window on the preview (or its row in Layers) -> a transform box with 8 handles.
  // Drag the body = move, a corner / edge = resize (Shift keeps the proportions, Alt resizes from the centre, Ctrl / Cmd while
  // dragging = no snapping). Smart guides snap the moving edges / centre to the frame (edges, centre, the 9:16 safe band) and to
  // every other window's edges and centre, and draw the guide lines. Arrow keys nudge 1 px (Shift: 10 px) while the preview has
  // focus; Enter / Escape leave the transform. Writes win.<id>.x/y/w/h through app.actions.setProp (a key at the playhead when the
  // track has keys, else the base value): live preview while dragging, then ONE commit = one undo step + one History entry.
  // Locked layers (Layers rail, sheet.meta.locks) cannot be picked or dragged on the preview. Text pop-ups (text.cue clips) are
  // picked and dragged too (their x / y); a double-click on the empty background selects the Background layer.
  let layers = null;
  const surf = { canvas: view, ctx: vctx, get w() { return view.width; }, get h() { return view.height; } };
  const camNow = () => { const { W, H } = ASPECTS[P().aspect]; return info.cam || { x: W / 2, y: H / 2, z: 1 }; };
  function world(e) { const r = view.getBoundingClientRect(), { W, H } = ASPECTS[P().aspect], x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H, c = camNow();
    return { x: (x - W / 2) / c.z + c.x, y: (y - H / 2) / c.z + c.y, sx: x, sy: y, W, H }; }
  function rectsNow() { const e = app.clip.current(), f = e && app.clip.film(e, P().aspect); return f ? f.rects(app.cues.ev(), tl().state.playhead, info.look) : {}; }
  const locks = () => (app.cues.sheet.meta && app.cues.sheet.meta.locks) || {};
  const isLocked = (id) => !!locks()['win.' + id];
  const visibleNow = (id) => app.cues.ev().value(`win.${id}.visible`, tl().state.playhead, true) !== false;
  function hitWin(pt) { const R = rectsNow(); let best = null; for (const [id, r] of Object.entries(R)) if (!isLocked(id) && visibleNow(id) && pt.x >= r[0] && pt.x <= r[0] + r[2] && pt.y >= r[1] && pt.y <= r[1] + r[3]) best = [id, r]; return best; }
  const inRect = (pt, r) => r && pt.x >= r[0] && pt.x <= r[0] + r[2] && pt.y >= r[1] && pt.y <= r[1] + r[3];
  // world rect -> % of the preview (through the camera)
  const toPc = (r) => { const { W, H } = ASPECTS[P().aspect], c = camNow(), sx = (r[0] - c.x) * c.z + W / 2, sy = (r[1] - c.y) * c.z + H / 2; return { l: sx / W * 100, t: sy / H * 100, w: r[2] * c.z / W * 100, h: r[3] * c.z / H * 100, sx, sy }; };
  const place = (el, p) => Object.assign(el.style, { left: p.l + '%', top: p.t + '%', width: p.w + '%', height: p.h + '%' });
  // text pop-ups at the playhead: approximate boxes in frame (screen) units, like film.js textCues draws them
  function textBoxes() { const { W, H } = ASPECTS[P().aspect], b = tl().state.playhead, out = [];
    for (const k of app.cues.ev().clipsAt('text.cue', b)) { const sz = +k.size || 72, txt = String(k.v || ''), w = Math.max(sz, Math.min(W * 0.96, txt.length * sz * 0.62)) + 32, h = sz * 1.35 + 24, x = (k.x ?? 0.5) * W, y = (k.y ?? 0.5) * H;
      out.push({ k, r: [k.align === 'left' ? x - 16 : k.align === 'right' ? x - w + 16 : x - w / 2, y - h / 2, w, h] }); } return out; }
  // v25 FLOATING TOOLBAR (CapCut / Clipchamp): under the selected window on the preview, the things you do with it
  let pbar = null; const WN = { stage: 'Hero card', session: 'Waveform', inserts: 'Rack', spectrum: 'Spectrum', stereo: 'Imager', loud: 'Levels', meta: 'Metadata', spectro: 'Spectrogram', now: 'Now playing', chains: 'Logo', elephant: 'Pendant' };
  const nameOf = (id) => WN[id] || id;
  function pickBar() { if (pbar) return pbar; pbar = document.createElement('div'); pbar.className = 'pickbar'; pbar.setAttribute('role', 'toolbar'); pbar.setAttribute('aria-label', 'Selected window'); pbar.hidden = true; $('#cwrap').append(pbar);
    pbar.addEventListener('pointerdown', (e) => e.stopPropagation());
    pbar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || !pick) return; const id = pick, A = app.actions, bb = Math.max(4, Math.round(tl().state.playhead / 4) * 4);
      if (b.dataset.a === 'visit') app.cues.edit((sh) => { let t = sh.tracks.find((q) => q.path === 'camera.shot'); if (!t) return; t.auto = false; t.keys = t.keys.filter((q) => Math.abs(q.b - bb) > 1e-6); t.keys.push({ id: 'k' + Math.random().toString(36).slice(2, 9), b: bb, v: id, transition: 'push', dur: 2, ease: 'spring' }); t.keys.sort((x, y) => x.b - y.b); }, 'camera visit ' + nameOf(id));
      if (b.dataset.a === 'hide') A.setProp(`win.${id}.visible`, false);
      if (b.dataset.a === 'reset') app.cues.edit((sh) => { for (const k of ['x', 'y', 'w', 'h']) { delete sh.base[`win.${id}.${k}`]; sh.tracks = sh.tracks.filter((q) => q.path !== `win.${id}.${k}`); } }, 'reset ' + nameOf(id) + ' position');
      if (b.dataset.a === 'edit') { $('.tabs [data-tab="inspect"]').click(); app.inspector.showElement('win.' + id); }
      if (b.dataset.a === 'preset') { const n = window.prompt('Name this preset', 'My layout'); if (n != null && app.presets) { app.presets.save(n.trim() || undefined); app.toast && app.toast('Preset saved: Presets tab'); } }
      markDirty(); });
    return pbar; }
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const box = $('#pickBox'); box.innerHTML = HANDLES.map((h) => `<i class="th th-${h}" data-h="${h}" aria-hidden="true"></i>`).join('') + '<span class="tsz" aria-hidden="true"></span>';
  const guides = document.createElement('div'); guides.className = 'snapg'; guides.setAttribute('aria-hidden', 'true'); $('#cwrap').append(guides);
  const hov = document.createElement('div'); hov.className = 'hovbox'; hov.hidden = true; hov.setAttribute('aria-hidden', 'true'); $('#cwrap').append(hov);
  const live = document.createElement('span'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); $('#cwrap').append(live);
  let selText = null, hoverId = null;   // selText: id of the text.cue key picked on the preview
  function showPick() { const bar = pickBar(); hov.hidden = true;
    if (hoverId && hoverId !== pick) { const R = rectsNow()[hoverId]; if (R) { place(hov, toPc(R)); hov.hidden = false; } }
    if (selText) { const tb = textBoxes().find((q) => q.k.id === selText); if (!tb) selText = null; else { const { W, H } = ASPECTS[P().aspect]; place(box, { l: tb.r[0] / W * 100, t: tb.r[1] / H * 100, w: tb.r[2] / W * 100, h: tb.r[3] / H * 100 }); box.hidden = false; box.classList.add('text'); box.classList.remove('locked'); bar.hidden = true; return; } }
    box.classList.remove('text');
    if (!pick) { box.hidden = true; bar.hidden = true; return; } const R = rectsNow()[pick]; if (!R) { box.hidden = true; bar.hidden = true; return; }
    const p = toPc(R), { H } = ASPECTS[P().aspect]; place(box, p); box.hidden = false; box.classList.toggle('locked', isLocked(pick));
    box.querySelector('.tsz').textContent = drag && drag.mode === 'resize' ? `${Math.round(R[2])} × ${Math.round(R[3])}` : drag && drag.mode === 'move' && drag.moved ? `X ${Math.round(R[0])}  Y ${Math.round(R[1])}` : '';
    const by = Math.min(0.94, (p.sy + R[3] * camNow().z) / H); if (bar.dataset.for !== pick) { bar.dataset.for = pick; bar.innerHTML = `<b>${nameOf(pick)}</b><button data-a="visit" data-tip="Camera visit here|The camera travels to this window at the playhead (snapped to the bar).|">Visit</button><button data-a="edit" data-tip="Edit|Open this window's properties.|">Edit</button><button data-a="reset" data-tip="Reset position|Back to where the look puts it.|">Reset</button><button data-a="hide" data-tip="Hide|Closes this window from the playhead on (the eye in Layers brings it back).|">Hide</button><button data-a="preset" data-tip="Save as preset|Keep this layout (and your other changes) as a preset for every video.|">Save preset</button>`; }
    Object.assign(bar.style, { left: Math.max(1, Math.min(70, p.l)) + '%', top: by * 100 + '%' }); bar.hidden = !!drag; }
  function select(id, opts = {}) { selText = null; pick = id || null; if (pick && !opts.quiet) { app.inspector.showElement('win.' + pick); $('.tabs [data-tab="inspect"]').click(); } showPick(); if (layers) layers.update(true); }
  // ---- smart guides
  function snapLines(xs, ys) { const { W, H } = ASPECTS[P().aspect], c = camNow(), px = (x) => ((x - c.x) * c.z + W / 2) / W * 100, py = (y) => ((y - c.y) * c.z + H / 2) / H * 100;
    guides.innerHTML = xs.map((x) => `<i class="sg v" style="left:${px(x)}%"></i>`).join('') + ys.map((y) => `<i class="sg h" style="top:${py(y)}%"></i>`).join(''); }
  function targets(id) { const { W, H } = ASPECTS[P().aspect], X = [0, W / 2, W], Y = [0, H / 2, H]; if (P().aspect === '916') { const z = SAFE['916'].hard; X.push(z.x0, z.x1); Y.push(z.y0, z.y1); }
    for (const [o, r] of Object.entries(rectsNow())) if (o !== id && visibleNow(o)) { X.push(r[0], r[0] + r[2] / 2, r[0] + r[2]); Y.push(r[1], r[1] + r[3] / 2, r[1] + r[3]); } return { X, Y }; }
  const tol = () => { const r = view.getBoundingClientRect(), { W } = ASPECTS[P().aspect]; return 6 * W / Math.max(1, r.width) / camNow().z; };
  /** Best snap of any of `edges` to `cands` within tol: [delta, line] or null. */
  function snap1(edges, cands, t) { let best = null; for (const e of edges) for (const c of cands) { const d = c - e; if (Math.abs(d) <= t && (!best || Math.abs(d) < Math.abs(best[0]) - 1e-9)) best = [d, c]; } return best; }
  function writeRect(id, r) { for (const [k, v] of [['x', r[0]], ['y', r[1]], ['w', r[2]], ['h', r[3]]]) { const cur = app.cues.ev().value(`win.${id}.${k}`, tl().state.playhead, null); if (cur !== v) app.actions.setProp(`win.${id}.${k}`, v, true); } }
  function moveRect(d, pt, noSnap) { let dx = pt.x - d.x0, dy = pt.y - d.y0; const r = d.r0, lx = [], ly = [];
    if (!noSnap) { const T = d.tg, t = tol(), sx = snap1([r[0] + dx, r[0] + dx + r[2] / 2, r[0] + dx + r[2]], T.X, t), sy = snap1([r[1] + dy, r[1] + dy + r[3] / 2, r[1] + dy + r[3]], T.Y, t);
      if (sx) { dx += sx[0]; lx.push(sx[1]); } if (sy) { dy += sy[0]; ly.push(sy[1]); } }
    snapLines(lx, ly); return [Math.round(r[0] + dx), Math.round(r[1] + dy), r[2], r[3]]; }
  function resizeRect(d, pt, e) { const h = d.h, r = d.r0, sx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, sy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0, alt = e.altKey, shift = e.shiftKey, lx = [], ly = [];
    let dx = pt.x - d.x0, dy = pt.y - d.y0;
    if (!(e.ctrlKey || e.metaKey)) { const T = d.tg, t = tol();
      if (sx) { const s = snap1([sx > 0 ? r[0] + r[2] + dx : r[0] + dx], T.X, t); if (s) { dx += s[0]; lx.push(s[1]); } }
      if (sy) { const s = snap1([sy > 0 ? r[1] + r[3] + dy : r[1] + dy], T.Y, t); if (s) { dy += s[0]; ly.push(s[1]); } } }
    const k = alt ? 2 : 1; let nw = sx ? r[2] + sx * dx * k : r[2], nh = sy ? r[3] + sy * dy * k : r[3];
    if (shift) { const ar = r[2] / r[3]; if (sx && sy) { if (Math.abs(nw / r[2]) >= Math.abs(nh / r[3])) nh = nw / ar; else nw = nh * ar; } else if (sx) nh = nw / ar; else if (sy) nw = nh * ar; }
    nw = Math.max(60, nw); nh = Math.max(60, nh);
    const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
    const x = alt || (!sx && nw !== r[2]) ? cx - nw / 2 : sx > 0 ? r[0] : sx < 0 ? r[0] + r[2] - nw : r[0];
    const y = alt || (!sy && nh !== r[3]) ? cy - nh / 2 : sy > 0 ? r[1] : sy < 0 ? r[1] + r[3] - nh : r[1];
    snapLines(lx, ly); return [Math.round(x), Math.round(y), Math.round(nw), Math.round(nh)]; }
  function startDrag(e, d) { d.tg = d.mode === 'text' ? null : targets(d.id); drag = d; (e.currentTarget && e.currentTarget.setPointerCapture ? e.currentTarget : view).setPointerCapture(e.pointerId); }
  function dragMove(e) { if (!drag) return false; const pt = world(e), d = drag; if (!d.moved && Math.hypot(pt.sx - d.sx0, pt.sy - d.sy0) < 3) return true;
    if (!d.moved) { d.moved = true; app.cues.begin(); view.classList.add('grabbing'); }
    if (d.mode === 'text') { const { W, H } = ASPECTS[P().aspect], nx = Math.round((d.k0x + (pt.sx - d.sx0) / W) * 1000) / 1000, ny = Math.round((d.k0y + (pt.sy - d.sy0) / H) * 1000) / 1000;
      app.cues.preview((s) => { for (const t of s.tracks) if (t.path === 'text.cue') for (const q of t.keys) if (q.id === d.kid) { q.x = nx; q.y = ny; t.auto = false; } }); }
    else writeRect(d.id, d.mode === 'move' ? moveRect(d, pt, e.ctrlKey || e.metaKey) : resizeRect(d, pt, e));
    showPick(); return true; }
  function endDrag() { const d = drag; drag = null; guides.innerHTML = ''; view.classList.remove('grabbing'); if (!d) return;
    if (d.moved) { app.cues.commit(d.mode === 'text' ? 'move text' : `${d.mode === 'move' ? 'move' : 'resize'} ${nameOf(d.id)}`); const r = rectsNow()[d.id]; if (r) live.textContent = `${nameOf(d.id)}: ${Math.round(r[0])}, ${Math.round(r[1])}, ${Math.round(r[2])} × ${Math.round(r[3])}`; }
    app.inspector.show(); showPick(); }
  box.addEventListener('pointerdown', (e) => { const hd = e.target.closest('[data-h]'); if (!hd || !pick || isLocked(pick)) return; e.stopPropagation(); e.preventDefault(); view.focus({ preventScroll: true });
    const pt = world(e), r = rectsNow()[pick]; if (!r) return; startDrag(e, { mode: 'resize', h: hd.dataset.h, id: pick, x0: pt.x, y0: pt.y, sx0: pt.sx, sy0: pt.sy, r0: r.slice(), moved: false }); });
  box.addEventListener('pointermove', (e) => { if (drag) dragMove(e); });
  box.addEventListener('pointerup', endDrag); box.addEventListener('pointercancel', endDrag);
  view.tabIndex = 0;
  view.addEventListener('pointerdown', (e) => { const pt = world(e);
    // the selected window keeps the gesture inside its box (overlapping windows: Photoshop moves the selected layer)
    if (pick && !selText && !isLocked(pick) && inRect(pt, rectsNow()[pick])) { startDrag(e, { mode: 'move', id: pick, x0: pt.x, y0: pt.y, sx0: pt.sx, sy0: pt.sy, r0: rectsNow()[pick].slice(), moved: false }); showPick(); return; }
    const tb = textBoxes().reverse().find((q) => pt.sx >= q.r[0] && pt.sx <= q.r[0] + q.r[2] && pt.sy >= q.r[1] && pt.sy <= q.r[1] + q.r[3]);
    if (tb) { pick = null; selText = tb.k.id; if (tl().select) tl().select([tb.k.id]); $('.tabs [data-tab="inspect"]').click(); app.inspector.show(); startDrag(e, { mode: 'text', kid: tb.k.id, sx0: pt.sx, sy0: pt.sy, k0x: tb.k.x ?? 0.5, k0y: tb.k.y ?? 0.5, moved: false }); showPick(); if (layers) layers.update(true); return; }
    const h = hitWin(pt); selText = null;
    if (!h) { pick = null; showPick(); if (layers) layers.update(true); return; }
    select(h[0]); startDrag(e, { mode: 'move', id: pick, x0: pt.x, y0: pt.y, sx0: pt.sx, sy0: pt.sy, r0: h[1].slice(), moved: false }); showPick(); });
  view.addEventListener('dblclick', (e) => { const pt = world(e); if (hitWin(pt) || textBoxes().length && selText) return; pick = null; selText = null; showPick(); $('.tabs [data-tab="inspect"]').click(); app.inspector.showElement('ground'); if (layers) layers.update(true); });
  view.addEventListener('pointermove', (e) => { if (dragMove(e)) return; const pt = world(e); const ov = pick && !isLocked(pick) && inRect(pt, rectsNow()[pick]); view.classList.toggle('grab', !!(ov || hitWin(pt) || textBoxes().some((q) => pt.sx >= q.r[0] && pt.sx <= q.r[0] + q.r[2] && pt.sy >= q.r[1] && pt.sy <= q.r[1] + q.r[3]))); view.classList.toggle('movable', !!ov); });
  view.addEventListener('pointerup', endDrag); view.addEventListener('pointercancel', endDrag);
  /** Nudge the picked window by (dx, dy) world px: one undo step per press. */
  function nudge(dx, dy) { if (!pick || isLocked(pick)) return false; const r = rectsNow()[pick]; if (!r) return false; app.cues.begin(); writeRect(pick, [Math.round(r[0] + dx), Math.round(r[1] + dy), r[2], r[3]]); app.cues.commit(`nudge ${nameOf(pick)}`); showPick(); markDirty(); return true; }
  /** Alt+arrows: resize the picked window by (dw, dh) from its top-left corner (keyboard twin of the handles). */
  function resizeBy(dw, dh) { if (!pick || isLocked(pick)) return false; const r = rectsNow()[pick]; if (!r) return false; app.cues.begin(); writeRect(pick, [r[0], r[1], Math.max(60, Math.round(r[2] + dw)), Math.max(60, Math.round(r[3] + dh))]); app.cues.commit(`resize ${nameOf(pick)}`); showPick(); markDirty(); return true; }
  function lock(id, on) { const key = id.startsWith('win.') ? id : 'win.' + id; app.cues.edit((s) => { s.meta.locks = { ...(s.meta.locks || {}) }; if (on) s.meta.locks[key] = true; else delete s.meta.locks[key]; }, `${on ? 'lock' : 'unlock'} ${nameOf(key.slice(4))}`); if (on && pick === key.slice(4)) showPick(); }
  function hover(id) { hoverId = id || null; showPick(); }
  app.videoLayer = createVideoLayer(app);
  layers = createLayers(app, $('#layerList'), { pick: (id) => select(id, { quiet: true }), hover, lock, isLocked: (id) => !!locks()[id] });
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
  // v27: the dock height is remembered (per browser); double-click the grip = back to the default (Simple: the big timeline)
  const DOCK_KEY = 'u2c.dock.h.v1', saveDock = () => { try { const v = $('#studio').style.getPropertyValue('--dock-h'); if (v) localStorage.setItem(DOCK_KEY, v); else localStorage.removeItem(DOCK_KEY); } catch (_) {} };
  try { const v = localStorage.getItem(DOCK_KEY); if (v && /^\d+(\.\d+)?px$/.test(v)) $('#studio').style.setProperty('--dock-h', Math.min(parseFloat(v), window.innerHeight * .7) + 'px'); } catch (_) {}
  grip.addEventListener('pointerup', () => { if (gy != null) saveDock(); gy = null; });
  grip.addEventListener('dblclick', () => { $('#studio').style.removeProperty('--dock-h'); saveDock(); layout(); });
  grip.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const h = clamp($('#dock').getBoundingClientRect().height + (e.key === 'ArrowUp' ? 24 : -24), 180, window.innerHeight * .7); $('#studio').style.setProperty('--dock-h', h + 'px'); saveDock(); layout(); } });
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
    if (document.activeElement === view && !mod && (pick || selText)) {   // v27 free transform keys (the preview has focus)
      if (k.startsWith('Arrow')) { e.preventDefault(); const q = e.shiftKey ? 10 : 1, dx = k === 'ArrowLeft' ? -q : k === 'ArrowRight' ? q : 0, dy = k === 'ArrowUp' ? -q : k === 'ArrowDown' ? q : 0;
        if (pick && e.altKey) resizeBy(dx, dy); else if (pick) nudge(dx, dy); else { const { W, H } = ASPECTS[P().aspect]; app.cues.edit((s) => { for (const t of s.tracks) if (t.path === 'text.cue') for (const q2 of t.keys) if (q2.id === selText) { q2.x = Math.round(((q2.x ?? 0.5) + dx / W) * 10000) / 10000; q2.y = Math.round(((q2.y ?? 0.5) + dy / H) * 10000) / 10000; t.auto = false; } }, 'nudge text'); showPick(); }
        return; }
      if (k === 'Enter' || k === 'Escape') { e.preventDefault(); pick = null; selText = null; showPick(); layers.update(true); return; } }
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
      else { const pk = !app.clock.playing && tl().peekBeat != null ? p.inT + tl().peekBeat * tr.spb : null; app.renderFrame(pk ?? t, surf, p, tr, { info }); $('#stage').classList.toggle('peek', pk != null); } for (const fn of post) fn(t, surf, p, tr, info);
      $('#measuring').textContent = info.look ? '' : 'measuring the section…'; if (pick || selText || hoverId) showPick();   // v25: edit-point preview while a key is dragged (pk); v27: the transform box follows the camera
      app.timeline.setTime(t, !app.clock.playing); app.inspector.tick && app.inspector.tick(); }
    if (now - lastLayers > 250) { lastLayers = now; layers.update(); }
    tl().draw(); if (!app.clock.playing) app.inspector.tick && app.inspector.tick();
    if (now - lastUI > 40 || !app.clock.playing) { lastUI = now; $('#tc').textContent = fmtTC(Math.max(0, t - p.inT)); $('#barPill').textContent = tl().bbt(Math.max(0, (t - p.inT) / tr.spb)); }
  }
  requestAnimationFrame(frame);
  app.store.subscribe((st, keys) => { markDirty(); if (keys.some((k) => /project\.(inT|outT)/.test(k))) readouts(); });
  return { layout, setAspectUI, readouts, markDirty, setPlayIcon, surf, sheetSync, syncTools,
    /** v27 free transform: select(id) a window (null = none), the picked id, nudge(dx, dy), lock(id, on), hover(id), rects() in world px. */
    select, get pick() { return pick; }, get pickText() { return selText; }, clearPick() { pick = null; selText = null; showPick(); if (layers) layers.update(true); }, nudge, lock, isLocked, hover, rects: rectsNow, toScreen: toPc,
    /** v21: preview resolution factor (1, 0.5, 0.25) and post-draw hooks (fn(t, surf, project, track, info) after each preview frame). */
    setRes(f) { res = f; layout(); }, get res() { return res; }, onPostDraw(fn) { post.push(fn); }, get info() { return info; } };
}
