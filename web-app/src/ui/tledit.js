// v22 EDIT IN THE TIMELINE: values are changed where the keys are.
//   Double-click a key -> an inline editor on the key: a number field (registry range + unit), a dropdown (enums; camera shot
//   keys list "wide" + the windows of the look, by name), a colour well, a switch, or a text field. Enter / click away commits
//   (one undo step), Esc cancels.
//   Click a text clip (text.cue: its text; term.line: the terminal line it types, i.e. tag social.terminal[n]) -> edit the text in place.
//   Right-click -> a context menu: add a key here, add a marker here, edit value, set target (camera), ease presets, copy, delete.
// API: app.tlEdit = { inline(row, key), close(commit), menu(x, y), get open }.
import { EASE_PRESETS, newId, snapBeat, SNAPS } from '../cues/schema.js';
import { LAYOUT } from '../v8/layout.js';
import { setTagIn } from './metadata.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const TEXT_CLIPS = new Set(['text.cue', 'term.line']);
export const WINDOW_NAMES = { wide: 'Wide (whole desktop)', stage: 'Hero (cover + logo)', session: 'Waveform', spectrum: 'Spectrum', spectro: 'Spectrogram', stereo: 'Stereo imager', loud: 'Levels',
  inserts: 'Rack (inserts)', meta: 'Metadata', now: 'Now playing', logo: 'Logo', elephant: 'Pendant', wave: 'Waveform', eq: 'EQ', gonio: 'Imager', scope: 'Scope', surface: '3D surface' };
export function createTimelineEdit(app) {
  const cv = $('#cueCv'), wrap = cv.parentElement, tl = () => app.cuetl, P = () => app.store.project, reg = () => app.registry().byPath;
  const box = document.createElement('div'); box.className = 'tl-inline'; box.hidden = true; wrap.append(box);
  const menuEl = document.createElement('div'); menuEl.className = 'tl-menu'; menuEl.hidden = true; menuEl.setAttribute('role', 'menu'); document.body.append(menuEl);
  let cur = null;   // {row, key, kind, input, orig}
  const winIds = () => Object.keys(LAYOUT[P().look][P().aspect]);
  const terminalIdx = (k) => (typeof k.v === 'number' || /^\d+$/.test(String(k.v)) ? +k.v : null);
  const tags = () => app.cues.tags('');
  function place(x, y, w) { const r = cv.getBoundingClientRect(), W = r.width; box.style.left = Math.max(4, Math.min(W - w - 4, x - 8)) + 'px'; box.style.top = Math.max(2, y - 15) + 'px'; box.style.width = w + 'px'; }
  /** Open the inline editor on a key (row from the timeline's rows; key object). */
  function inline(row, key) {
    close(false); if (!row || !key || (row.track && row.track.lock)) return false;
    const p = reg()[row.path] || { kind: row.kind, label: row.path }, pt = tl().keyPoint(key.id) || tl().pointOf(row.path, key.b); let html = '', kind = row.kind, w = 150;
    const label = `<span class="tl-l">${esc(row.kind === 'shot' ? 'Camera target' : (p.label || row.path).replace(/\s*\(.*\)\s*$/, ''))}</span>`;
    if (row.path === 'term.line') { const i = terminalIdx(key), v = i != null ? (tags().social.terminal || [])[i] ?? '' : key.v; kind = 'term'; w = 260; html = `<input class="inp small" data-v value="${esc(v)}" aria-label="Terminal line ${i != null ? i + 1 : ''} text">`; }
    else if (row.path === 'text.cue' || p.kind === 'text') { kind = 'text'; w = 260; html = `<input class="inp small" data-v value="${esc(key.v)}" aria-label="Text">`; }
    else if (row.kind === 'shot') { kind = 'shot'; w = 190; html = `<select class="inp small" data-v aria-label="Camera target">${['wide', ...winIds()].map((id) => `<option value="${id}" ${id === key.v ? 'selected' : ''}>${esc(WINDOW_NAMES[id] || id)}</option>`).join('')}</select>`; }
    else if (row.kind === 'number' || p.kind === 'number') { kind = 'number'; w = 140; html = `<span class="tl-num"><input class="inp small mono" type="number" data-v step="${p.step ?? 'any'}" ${p.min != null ? `min="${p.min}"` : ''} ${p.max != null ? `max="${p.max}"` : ''} value="${+(+key.v).toFixed(4)}" aria-label="${esc(p.label || row.path)}">${p.unit ? `<i>${esc(p.unit)}</i>` : ''}</span>`; }
    else if (row.kind === 'color') { kind = 'color'; w = 120; html = `<input type="color" data-v value="${esc(key.v)}" aria-label="Colour">`; }
    else if (row.kind === 'enum' || p.kind === 'enum') { kind = 'enum'; w = 160; html = `<select class="inp small" data-v aria-label="${esc(p.label || row.path)}">${(p.options || []).map((o) => `<option ${o === key.v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; }
    else if (row.kind === 'bool' || row.kind === 'event') { app.cues.edit(() => { key.v = !key.v; row.track.auto = false; }, 'toggle'); return true; }
    else if (row.kind === 'clip') { kind = 'text'; w = 200; html = `<input class="inp small" data-v value="${esc(key.v)}" aria-label="Clip value">`; }
    else return false;
    box.innerHTML = label + html + '<span class="tl-k hint">Enter ↵ · Esc</span>'; box.hidden = false; place(pt.x, pt.y, w + 8);
    const input = box.querySelector('[data-v]'); cur = { row, key, kind, input, orig: input.value };
    input.focus(); if (input.select && input.tagName === 'INPUT' && input.type !== 'color') input.select();
    if (kind === 'shot' || kind === 'enum' || kind === 'color') input.addEventListener('change', () => close(true));
    return true;
  }
  function close(commit = true) {
    if (!cur) return; const c = cur; cur = null; box.hidden = true; const v = c.input.value;
    if (commit && v !== c.orig) {
      if (c.kind === 'term') { const i = terminalIdx(c.key); if (i != null) app.cues.edit((s) => setTagIn(s, 'social.terminal.' + i, v), 'terminal line'); else app.cues.edit(() => { c.key.v = v; c.row.track.auto = false; }, 'terminal line'); }
      else { const p = reg()[c.row.path] || {}; let val = v; if (c.kind === 'number') { val = +v; if (!isFinite(val)) return; val = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, val)); }
        app.cues.edit(() => { c.key.v = val; if (c.row.track) c.row.track.auto = false; }, 'edit value'); }
      app.inspector && app.inspector.show(); }
    box.innerHTML = ''; tl().markDirty(); try { cv.focus({ preventScroll: true }); } catch {}
  }
  box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); close(true); } else if (e.key === 'Escape') { e.preventDefault(); close(false); } });
  box.addEventListener('focusout', (e) => { if (!box.contains(e.relatedTarget)) setTimeout(() => { if (cur && !box.contains(document.activeElement)) close(true); }, 0); });
  // click a text clip (no drag) -> edit its text in place
  let down = null;
  cv.addEventListener('pointerdown', (e) => { if (e.button !== 0) { down = null; return; } const r = cv.getBoundingClientRect(), h = tl().hit(e.clientX - r.left, e.clientY - r.top); down = h && h.zone === 'key' && h.part === 'body' && TEXT_CLIPS.has(h.row.path) && !e.shiftKey && !e.metaKey && !e.ctrlKey ? { x: e.clientX, y: e.clientY, h } : null; });
  cv.addEventListener('pointerup', (e) => { const d = down; down = null; if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 3) return; setTimeout(() => inline(d.h.row, d.h.key), 0); });
  // ---- context menu
  let mctx = null;
  function item(id, label, extra = '') { return `<button role="menuitem" data-m="${esc(id)}" ${extra}>${esc(label)}</button>`; }
  function menu(clientX, clientY) {
    const r = cv.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top, T = tl(), h = T.hit(x, y); if (!h || /ruler|sect|mini/.test(h.zone)) { if (h && h.zone !== 'mini') { mctx = { h, b: T.bOf(x) }; menuEl.innerHTML = item('marker', 'Add marker here'); show(clientX, clientY); return true; } return false; }
    const b = Math.max(0, snapBeat(T.bOf(x), SNAPS[P().timeline.snap] || 1 / 16)); mctx = { h, b }; let html = '';
    if (h.zone === 'key') { if (!T.state.sel.has(h.key.id)) T.select([h.key.id]); const kind = h.row.kind;
      html += item('edit', TEXT_CLIPS.has(h.row.path) ? 'Edit text…' : kind === 'shot' ? 'Change target…' : 'Edit value…');
      if (kind === 'shot') html += '<div class="tl-sub" role="group" aria-label="Target">' + ['wide', ...winIds()].map((id) => item('target:' + id, (id === h.key.v ? '● ' : '') + (WINDOW_NAMES[id] || id))).join('') + '</div>';
      if (['number', 'color', 'shot'].includes(kind)) html += '<div class="tl-sep"></div><span class="tl-h">Ease</span>' + Object.entries(EASE_PRESETS).map(([id, e]) => item('ease:' + id, e.label)).join('');
      html += '<div class="tl-sep"></div>' + item('copy', 'Copy') + item('delete', 'Delete key', 'class="danger"'); }
    else if (h.zone === 'lane' && h.row && !h.row.summary && !h.locked) html += item('add', `Add key here (${T.bbt(b)})`) + item('paste', 'Paste here');
    if (h.zone === 'lane' || h.zone === 'key') html += item('marker', 'Add marker here');
    if (!html) return false; menuEl.innerHTML = html; show(clientX, clientY); return true;
  }
  function show(cx, cy) { menuEl.hidden = false; const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight; menuEl.style.left = Math.max(4, Math.min(innerWidth - mw - 4, cx)) + 'px'; menuEl.style.top = Math.max(4, Math.min(innerHeight - mh - 4, cy)) + 'px'; const f = menuEl.querySelector('button'); if (f) f.focus(); }
  const hideMenu = () => { menuEl.hidden = true; mctx = null; };
  menuEl.addEventListener('click', (e) => { const btn = e.target.closest('[data-m]'); if (!btn || !mctx) return; const { h, b } = mctx, T = tl(), m = btn.dataset.m; hideMenu();
    const seekB = () => { const tr = app.store.session.track; app.actions.seek(P().inT + Math.round(b * tr.spb * 30) / 30); T.state.playhead = b; };
    if (m === 'edit') inline(h.row, h.key);
    else if (m.startsWith('target:')) app.cues.edit(() => { h.key.v = m.slice(7); h.row.track.auto = false; }, 'camera target');
    else if (m.startsWith('ease:')) T.setInterp(m.slice(5));
    else if (m === 'copy') T.copy();
    else if (m === 'delete') T.del();
    else if (m === 'add') T.addKeyAt(h.row, b);
    else if (m === 'paste') { seekB(); T.paste(); }
    else if (m === 'marker') { seekB(); T.addMarker(); }
    T.markDirty(); });
  menuEl.addEventListener('keydown', (e) => { const bs = [...menuEl.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    if (e.key === 'Escape') { hideMenu(); cv.focus(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); } });
  cv.addEventListener('contextmenu', (e) => { e.preventDefault(); close(true); if (!menu(e.clientX, e.clientY)) hideMenu(); });
  document.addEventListener('pointerdown', (e) => { if (!menuEl.hidden && !menuEl.contains(e.target)) hideMenu(); }, true);
  return { inline, close, menu, hideMenu, get open() { return !!cur; }, get menuOpen() { return !menuEl.hidden; } };
}
