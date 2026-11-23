// v27 EFFECTS LIBRARY ("+ Effect", the user's own effects). A popover with the 8 library effects (icon, name, one line);
// picking one drops a clip on the Effects track at the playhead (snapped to the beat, after the intro: the intro frames
// are drawn by their own pass), selects it on the timeline and opens it in Edit (intensity, length, ease in / out,
// colour, visible). Every add is one undo step with a History entry. Rendering: v8/usereffects.js (ufx.* paths).
// API: app.effects = { LIB, add(type, {b, v, dur}) -> key id, open(anchor), close(), clips() }.
import { UFX, UFX_TYPES } from '../v8/usereffects.js';
import { newId } from '../cues/schema.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// 20 px line icons, one per effect
export const FX_ICON = {
  neg: '<circle cx="10" cy="10" r="6.5"/><path d="M10 3.5a6.5 6.5 0 010 13z" fill="currentColor" stroke="none"/>',
  flash: '<path d="M11 2L5 11h4l-1 7 6-9h-4z"/>',
  zoom: '<rect x="3" y="3" width="14" height="14" rx="1.5"/><rect x="6.5" y="6.5" width="7" height="7"/><path d="M3 3l3.5 3.5M17 3l-3.5 3.5M3 17l3.5-3.5M17 17l-3.5-3.5"/>',
  shake: '<rect x="5" y="5" width="10" height="10" rx="1.5"/><path d="M2 7v6M18 7v6M3.5 5.5v9M16.5 5.5v9"/>',
  blur: '<circle cx="10" cy="10" r="6.5" stroke-dasharray="2 2"/><circle cx="10" cy="10" r="3"/>',
  glow: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.3 4.3l1.8 1.8M13.9 13.9l1.8 1.8M4.3 15.7l1.8-1.8M13.9 6.1l1.8-1.8"/>',
  tint: '<path d="M10 2.5s5.5 6 5.5 9.5a5.5 5.5 0 01-11 0C4.5 8.5 10 2.5 10 2.5z"/>',
  rgb: '<circle cx="8" cy="10" r="5" /><circle cx="12" cy="10" r="5" stroke-dasharray="2 1.5"/>',
};
export const fxIcon = (type, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FX_ICON[type] || FX_ICON.glow}</svg>`;

export function createEffects(app) {
  const ph = () => (app.cuetl ? app.cuetl.state.playhead : 0);
  /** Beats drawn by the intro pass (no post effects there). */
  const introBeats = () => { const ev = app.cues.ev(); return ev.value('intro.on', 0, true) === false ? 0 : Math.max(0, Math.round(ev.value('intro.length', 0, 2) * 4)); };
  function add(type, o = {}) {
    const T = UFX_TYPES[type]; if (!T) return null; const path = 'ufx.' + type, id = newId();
    let b = o.b != null ? o.b : Math.round(ph()); const ib = introBeats(); const moved = b < ib; if (moved) b = ib;
    const dur = o.dur ?? T.dur, k = { id, b, v: o.v ?? T.v, dur, ein: o.ein ?? 0, eout: o.eout ?? (dur >= 2 ? 0.5 : 0), ease: 'step' }; if (type === 'tint') k.col = o.col || '#ff3b6b';
    app.cues.edit((s) => { let t = s.tracks.find((q) => q.path === path); if (!t) { t = { id: newId('t'), path, kind: 'clip', lane: 'fx', auto: false, keys: [] }; s.tracks.push(t); } t.auto = false; t.keys.push(k); t.keys.sort((a, c) => a.b - c.b); }, 'add effect ' + T.name);
    const T2 = app.cuetl; if (T2) { if (T2.focusRowOf) T2.focusRowOf(path); if (T2.select) T2.select([id]); if (T2.markDirty) T2.markDirty(); }
    const tab = $('.tabs [data-tab="inspect"]'); if (tab) tab.click(); if (app.inspector) app.inspector.show();
    if (moved && app.toast) app.toast(`${T.name} starts after the intro (bar ${Math.floor(ib / 4) + 1})`); else if (app.toast) app.toast(`${T.name} added: drag its edges on the Effects track`);
    return id;
  }
  /** Every user effect clip of the sheet: [{path, type, key}] in time order. */
  const clips = () => app.cues.sheet.tracks.filter((t) => t.path.startsWith('ufx.')).flatMap((t) => t.keys.map((k) => ({ path: t.path, type: t.path.slice(4), key: k, track: t }))).sort((a, b) => a.key.b - b.key.b);
  // ---- the popover
  const pop = document.createElement('div'); pop.className = 'pop menu fxlib'; pop.hidden = true; pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'Effects library');
  pop.innerHTML = `<div class="fxlib-h"><b>Effects</b><span>added at the playhead · one undo step</span></div><div class="fxlib-grid">${UFX.map(([id, name, desc]) => `<button role="menuitem" data-fx="${id}" data-tip="${esc(name)}|${esc(desc)}|"><i>${fxIcon(id, 20)}</i><b>${esc(name)}</b><span>${esc(desc)}</span></button>`).join('')}</div>`;
  document.body.append(pop); let anchor = null;
  function close() { if (pop.hidden) return; pop.hidden = true; if (anchor) { anchor.setAttribute('aria-expanded', 'false'); } }
  function open(a) { anchor = a || null; pop.hidden = false; if (a) a.setAttribute('aria-expanded', 'true');
    const r = a ? a.getBoundingClientRect() : { left: innerWidth / 2 - 180, bottom: innerHeight / 2, top: innerHeight / 2 }, pw = Math.min(380, innerWidth - 16), phh = pop.offsetHeight || 320;
    pop.style.left = Math.max(8, Math.min(innerWidth - pw - 8, r.left)) + 'px'; pop.style.width = pw + 'px';
    pop.style.top = (r.top - phh - 8 > 8 ? r.top - phh - 8 : Math.min(innerHeight - phh - 8, r.bottom + 8)) + 'px';
    const f = pop.querySelector('button'); if (f) f.focus(); }
  pop.addEventListener('click', (e) => { const b = e.target.closest('[data-fx]'); if (!b) return; close(); add(b.dataset.fx); });
  pop.addEventListener('keydown', (e) => { const all = [...pop.querySelectorAll('button')], i = all.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); if (anchor) anchor.focus(); }
    else if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); const d = e.key === 'ArrowDown' ? 2 : e.key === 'ArrowUp' ? -2 : e.key === 'ArrowRight' ? 1 : -1; all[(i + d + all.length) % all.length].focus(); } });
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== anchor && !(anchor && anchor.contains(e.target))) close(); });
  return { LIB: UFX, add, open, close, clips, introBeats, get isOpen() { return !pop.hidden; } };
}
