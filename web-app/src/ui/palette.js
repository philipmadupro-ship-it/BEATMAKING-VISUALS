// v21 COMMAND PALETTE (Cmd/Ctrl+K) + KEYBOARD SHORTCUTS (?): run any action, jump to any property (inspector + its timeline
// lane) or any on-screen word (Meta search), by typing a few letters (fuzzy: every letter in order, word starts score
// higher, recent commands first). ↑ ↓ choose, Enter runs, Esc closes. The shortcut sheet lists every key of the studio.
// API: app.palette = { open(q), close(), run(id), commands(), search(q), shortcuts: { open, close } }.
import { LOOKS, LOOK_NAMES } from '../v8/layout.js';
import { STAGES, STAGE_IDS } from '../v8/core.js';
import { flattenTags, mergeDeep } from '../cues/schema.js';
import { DEFAULT_TAGS } from '../v8/tags.js';
import { newId, snapBeat } from '../cues/schema.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const MOD = mac ? '⌘' : 'Ctrl+';
export const SHORTCUTS = [
  ['Playback', [['Space', 'play / pause'], ['J', 'reverse shuttle (×2 per press)'], ['K', 'stop'], ['L', 'play'], [', .', 'one frame back / forward'], ['Home End', 'first / last frame'], ['I O', 'loop in / out'], ['Esc', 'clear selection, then the loop']]],
  ['Editing', [[MOD + 'Z', 'undo'], ['Shift+' + MOD + 'Z', 'redo'], [MOD + 'C V', 'copy / paste keys (a one-lane clip pastes into the targeted lane)'], ['Shift+' + MOD + 'V', 'paste attributes'], [MOD + 'D', 'duplicate'], [MOD + 'A', 'select all'], ['Delete', 'delete keys / marker'], ['S', 'split'], ['; ', 'key at the playhead'], ['← →', 'nudge by the grid (Shift: a bar)'], ['↑ ↓', 'nudge value'], ['B', 'interpolation'], ['Q  Shift+Q', 'quantise to markers / grid']]],
  ['Timeline', [['[ ]', 'previous / next key (Alt: any lane)'], ['Shift+[ ]', 'previous / next marker'], ['M', 'add marker'], ['R  Shift+R', 'ripple: insert / delete a bar'], ['T', 'target lane'], ['G', 'lane height'], ['E', 'graph editor'], ['N', 'magnet'], ['+ −', 'zoom'], ['Z  Shift+Z', 'zoom to selection / loop'], ['\\', 'fit'], ['drag the ruler', 'scrub with audio']]],
  ['Workspace', [[MOD + 'K', 'command palette'], ['?', 'this sheet'], [MOD + 'S', 'save project'], ['Shift+' + MOD + 'S', 'projects'], [MOD + 'Alt+[ ]', 'hide / show the left / right panel'], ['drag a panel edge', 'resize (double-click resets)']]],
];
export function createPalette(app) {
  const dlg = $('#palette'), input = $('#palIn'), list = $('#palList'), A = app.actions, tl = () => app.cuetl, mon = () => app.monitor;
  const tab = (t) => () => { const b = document.querySelector(`.tabs [data-tab="${t}"]`); if (b) b.click(); };
  const inStudio = () => !$('#studio').hidden;
  const studioOnly = (fn) => () => { if (!inStudio()) A.openStudio(); fn(); };
  let recent = []; try { recent = JSON.parse(localStorage.getItem('u2c.palette.recent')) || []; } catch {}
  function base() {
    const C = [];
    const c = (id, label, group, run, keys = '') => C.push({ id, label, group, run, keys });
    c('play', 'Play / pause', 'Playback', studioOnly(() => A.togglePlay()), 'Space');
    c('stop', 'Stop', 'Playback', () => app.clock.pause(), 'K');
    c('start', 'Go to the first frame', 'Playback', studioOnly(() => A.seek(app.store.project.inT)), 'Home');
    c('frame-back', 'Step one frame back', 'Playback', studioOnly(() => mon().stepFrames(-1)), ',');
    c('frame-fwd', 'Step one frame forward', 'Playback', studioOnly(() => mon().stepFrames(1)), '.');
    c('loop-io', 'Loop in / out on or off', 'Playback', studioOnly(() => mon().loopIO()), 'I O');
    c('undo', 'Undo', 'Edit', () => app.cues.undo(), MOD + 'Z'); c('redo', 'Redo', 'Edit', () => app.cues.redo(), 'Shift+' + MOD + 'Z');
    c('marker', 'Add a marker at the playhead', 'Timeline', studioOnly(() => tl().addMarker()), 'M');
    c('markers', 'Show the marker list', 'Timeline', studioOnly(() => { const b = document.querySelector('#railTabs [data-pane="markers"]'); if (b) b.click(); }));
    c('copy', 'Copy selected keys', 'Edit', () => tl().copy(), MOD + 'C'); c('paste', 'Paste keys at the playhead (into the targeted lane)', 'Edit', () => tl().paste(), MOD + 'V');
    c('paste-lane', 'Paste keys into the focused lane (across tracks)', 'Edit', () => pasteToLane(), 'Alt+' + MOD + 'V');
    c('zoom-fit', 'Zoom to fit the video', 'Timeline', studioOnly(() => tl().fit()), '\\'); c('zoom-sel', 'Zoom to the selection', 'Timeline', studioOnly(() => tl().zoomToSelection()), 'Z');
    c('graph', 'Graph editor (focused number lane)', 'Timeline', studioOnly(() => { tl().toggleGraph(); app.studio.syncTools(); }), 'E');
    c('rip-in', 'Ripple: insert a bar at the playhead', 'Timeline', studioOnly(() => tl().rippleBar(1)), 'R'); c('rip-out', 'Ripple: delete the bar at the playhead', 'Timeline', studioOnly(() => tl().rippleBar(-1)), 'Shift+R');
    c('quantise', 'Quantise to markers', 'Timeline', studioOnly(() => tl().quantise('markers', 1)), 'Q');
    c('thumbs', 'Filmstrip along the ruler on / off', 'Timeline', studioOnly(() => mon().setThumbs()));
    c('safe', 'Safe area (platform UI) on / off', 'Viewer', studioOnly(() => $('#safeBtn').click()));
    for (const [k, l] of [['action', 'Action-safe 93 %'], ['title', 'Title-safe 90 %'], ['thirds', 'Rule of thirds'], ['center', 'Centre cross']]) c('guide-' + k, `Guide: ${l} on / off`, 'Viewer', studioOnly(() => mon().setGuide(k)));
    c('compare', 'Compare A/B (current vs snapshot)', 'Viewer', studioOnly(() => mon().setCompare())); c('snap-b', 'Snapshot B = the current state', 'Viewer', studioOnly(() => { mon().snapshotB(); mon().setCompare(true); }));
    for (const [f, l] of [[1, 'Full'], [0.5, '1/2'], [0.25, '1/4']]) c('res-' + f, `Preview resolution: ${l}`, 'Viewer', studioOnly(() => mon().setRes(f)));
    c('blur', 'Preview motion blur on / off', 'Viewer', studioOnly(() => $('#blurBtn').click()));
    c('fullscreen', 'Fullscreen viewer', 'Viewer', studioOnly(() => $('#fsBtn').click()));
    for (const a of ['916', '169']) c('aspect-' + a, `Format ${a === '916' ? '9:16 (TikTok, Reels)' : '16:9 (YouTube)'}`, 'Look', () => A.setAspect(a));
    for (const id of LOOKS) c('look-' + id, `Look: ${LOOK_NAMES[id]}`, 'Look', () => A.setLook(id));
    for (const id of STAGE_IDS) c('stage-' + id, `Stage: ${STAGES[id].label || STAGES[id].name}`, 'Look', () => A.setStage(id));
    for (const [t, l] of [['inspect', 'Inspector'], ['look', 'Look'], ['text', 'Text'], ['meta', 'Metadata'], ['beat', 'Beat'], ['export', 'Export']]) c('tab-' + t, `Go to ${l}`, 'Panels', studioOnly(tab(t)));
    c('left', 'Hide / show the left panel', 'Panels', studioOnly(() => app.workspace.toggle('left')), MOD + 'Alt+['); c('right', 'Hide / show the right panel', 'Panels', studioOnly(() => app.workspace.toggle('right')), MOD + 'Alt+]');
    c('ws-reset', 'Reset the panel layout', 'Panels', () => app.workspace.reset());
    c('save', 'Save project', 'Project', () => app.projects.save(), MOD + 'S'); c('save-as', 'Save project as…', 'Project', () => app.projects.openDialog());
    c('projects', 'Open projects…', 'Project', () => app.projects.openDialog(), 'Shift+' + MOD + 'S'); c('proj-export', 'Export project file (.u2cproj)', 'Project', () => app.projects.exportFile());
    c('proj-import', 'Import project file…', 'Project', () => $('#pjFile').click()); c('home', 'Home (looks and recent projects)', 'Project', () => A.closeStudio());
    for (const k of Object.keys(app.queue.PRESETS)) c('queue-' + k, `Queue: add ${app.queue.PRESETS[k].label}`, 'Export', studioOnly(() => { tab('export')(); app.queue.add(k); }));
    c('queue-run', 'Run the export queue', 'Export', studioOnly(() => { tab('export')(); app.queue.run(); }));
    c('export', 'Export MP4', 'Export', studioOnly(() => $('#exBtn').click())); c('review', 'Review before export', 'Export', studioOnly(() => $('#reviewBtn').click()));
    c('shortcuts', 'Keyboard shortcuts', 'Help', () => openKeys(), '?');
    return C;
  }
  function dynamic() { const C = [];
    try { const R = app.registry(); for (const e of R.elements) for (const p of e.props) C.push({ id: 'prop:' + p.path, label: `${e.label} › ${p.label || p.path}`, sub: p.path, group: 'Property', run: studioOnly(() => jumpProp(p.path, e.id)) }); } catch {}
    const flat = flattenTags(mergeDeep(DEFAULT_TAGS, app.cues.sheet.tags || {})); for (const [k, v] of Object.entries(flat)) C.push({ id: 'tag:' + k, label: String(v) || '(empty)', sub: k, group: 'Word', run: studioOnly(() => app.meta.focusWord(k)) });
    return C; }
  function jumpProp(path, el) { tab('inspect')(); app.inspector.showElement(el); try { tl().focusRowOf(path); } catch {}
    requestAnimationFrame(() => { const row = document.querySelector(`#insp .prop[data-path="${CSS.escape(path)}"]`); if (!row) return; const d = row.closest('details'); if (d) d.open = true; row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1200);
      const f = row.querySelector('input,select,button'); if (f) f.focus(); }); }
  /** Paste the clipboard keys into the focused lane at the playhead (any lane of the same kind: copy a curve from one property
   *  to another; values are clamped to the destination's range). Alt+Cmd/Ctrl+V. */
  function pasteToLane(path = null) { const T = tl(), C = app.cues.clipboard.keys, R = app.registry().byPath || {};
    const r = path ? { path, kind: (R[path] && R[path].kind) || 'number', track: app.cues.sheet.tracks.find((t) => t.path === path) || null } : T.rows()[T.state.focusRow]; if (!r || r.summary || !C.length) return false;
    if (r.track && r.track.lock) return false; if (C.some((c) => c.kind !== r.kind)) { app.toast && app.toast(`The copied keys are ${C[0].kind} keys: focus a ${C[0].kind} lane`, { kind: 'warn' }); return false; }
    const p = (app.registry().byPath || {})[r.path] || {}, at = snapBeat(T.state.playhead, 1 / 16), ids = [];
    app.cues.edit(() => { const t = T.ensureTrack(r); for (const c of C) { const k = { ...JSON.parse(JSON.stringify(c.key)), id: newId(), b: at + c.key.b }; if (r.kind === 'number') k.v = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, +k.v));
      t.keys = t.keys.filter((q) => Math.abs(q.b - k.b) > 1e-6); t.keys.push(k); ids.push(k.id); } t.keys.sort((a, b) => a.b - b.b); t.auto = false; }, 'paste to lane');
    T.select(ids); return true; }
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyV' && !$('#studio').hidden && !/INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); e.stopPropagation(); pasteToLane(); } }, true);
  const commands = () => [...base(), ...dynamic()];
  /** Fuzzy score: every query letter in order; bonuses for word starts, consecutive letters and recent use. */
  function score(q, s) { s = s.toLowerCase(); q = q.replace(/\s+/g, ''); let i = 0, sc = 0, prev = -2; for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) { sc += (j === 0 || /[\s›.:/(-]/.test(s[j - 1]) ? 6 : 1) + (j === prev + 1 ? 3 : 0); prev = j; i++; }
    return i === q.length ? sc - s.length * 0.02 : -1; }
  function search(q) { q = q.trim().toLowerCase(); const C = commands(), rec = (id) => { const k = recent.indexOf(id); return k < 0 ? 0 : 8 - k; };
    if (!q) return C.filter((c) => c.group !== 'Property' && c.group !== 'Word').map((c) => ({ c, s: rec(c.id) })).sort((a, b) => b.s - a.s).slice(0, 60).map((x) => x.c);
    const out = []; for (const c of C) { const s = Math.max(score(q, c.label), c.sub ? score(q, c.sub) - 1 : -1, score(q, c.group + ' ' + c.label) - 2); if (s >= 0) out.push({ c, s: s + rec(c.id) + (c.group === 'Word' ? -3 : 0) }); }
    return out.sort((a, b) => b.s - a.s).slice(0, 60).map((x) => x.c); }
  let res = [], sel = 0, before = null;
  function draw() { list.innerHTML = res.length ? res.map((c, i) => `<li role="option" id="pal-${i}" aria-selected="${i === sel}" data-i="${i}"><span class="pal-g">${esc(c.group)}</span><span class="pal-l">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span>${c.keys ? `<kbd>${esc(c.keys)}</kbd>` : ''}</li>`).join('') : '<li class="hint">Nothing matches.</li>';
    input.setAttribute('aria-activedescendant', res.length ? 'pal-' + sel : ''); const el = list.children[sel]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
  function update() { res = search(input.value); sel = 0; draw(); }
  function open(q = '') { before = document.activeElement; input.value = q; update(); if (!dlg.open) dlg.showModal(); input.focus(); }
  function close() { if (dlg.open) dlg.close(); }
  function run(id) { const c = (typeof id === 'string' ? commands().find((x) => x.id === id) : id); if (!c) return false; close(); recent = [c.id, ...recent.filter((x) => x !== c.id)].slice(0, 8); try { localStorage.setItem('u2c.palette.recent', JSON.stringify(recent)); } catch {}
    try { c.run(); } catch (e) { console.warn('[u2c] command failed', c.id, e); } return true; }
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + res.length) % Math.max(1, res.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (res[sel]) run(res[sel]); } });
  list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) run(res[+li.dataset.i]); });
  list.addEventListener('mousemove', (e) => { const li = e.target.closest('[data-i]'); if (li && +li.dataset.i !== sel) { sel = +li.dataset.i; for (const x of list.children) x.setAttribute('aria-selected', String(x === li)); } });
  dlg.addEventListener('close', () => { if (before && before.focus && document.contains(before)) try { before.focus(); } catch {} });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  // ---- shortcut sheet
  const kd = $('#keysDlg');
  $('#keysBody').innerHTML = SHORTCUTS.map(([g, L]) => `<section><h3 class="lbl">${esc(g)}</h3><dl>${L.map(([k, d]) => `<dt>${k.split(/\s{1,2}/).filter(Boolean).map((x) => `<kbd>${esc(x)}</kbd>`).join(' ')}</dt><dd>${esc(d)}</dd>`).join('')}</dl></section>`).join('');
  function openKeys() { if (!kd.open) kd.showModal(); }
  $('#keysClose').addEventListener('click', () => kd.close()); kd.addEventListener('click', (e) => { if (e.target === kd) kd.close(); });
  $('#palKbd').textContent = mac ? '⌘K' : 'Ctrl K';
  $('#palBtn').addEventListener('click', () => open()); $('#keysBtn').addEventListener('click', openKeys);
  document.addEventListener('keydown', (e) => { const mod = e.metaKey || e.ctrlKey, typing = /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '') && !['range', 'checkbox'].includes(document.activeElement.type);
    if (mod && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (dlg.open) close(); else open(); return; }
    if (e.key === '?' && !typing && !mod) { e.preventDefault(); if (kd.open) kd.close(); else openKeys(); } }, true);
  return { open, close, run, commands, search, pasteToLane, shortcuts: { open: openKeys, close: () => kd.close() } };
}
