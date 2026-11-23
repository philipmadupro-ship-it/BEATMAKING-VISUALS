// Layers: the left rail of the studio, like Photoshop's Layers panel (v27). Groups: Windows, Text, Effects, Brand, Scene.
// Each row: the eye (visibility, where the thing has a switch), a small thumbnail / icon, the name, a diamond when it has
// keys on the timeline and the lock (windows: a locked window cannot be picked or dragged on the preview).
//   - Click a row: it is selected everywhere (the transform box on the preview, the Edit tab, the clip on the timeline).
//   - Selecting on the preview selects the row (both ways). Hovering a window row outlines that window on the preview.
//   - Double-click (or F2) a window name: rename the label shown on screen (tag windows.<id>). Arrow keys move between rows.
// Text pop-ups and your effects are listed one row per clip (Photoshop's text / adjustment layers).
import { UFX_TYPES } from '../v8/usereffects.js';
import { fxIcon } from './effects.js';
import { DEFAULT_TAGS } from '../v8/tags.js';
import { setTagIn } from './metadata.js';
import { ASPECTS } from '../v8/layout.js';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const BRAND = ['hero', 'logo', 'pendant'];
const SCENE = [['ground', 'Background'], ['camera', 'Camera'], ['intro', 'Intro'], ['scene', 'Look + stage'], ['stagecol', 'Stage colours'], ['overlays', 'Overlays'], ['focus', 'Featured meter'], ['fx', 'Finish + built-in FX'], ['video', 'Video layer']];
const SVG = (inner) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const EYE = SVG('<path d="M1.5 8s2.3-4.2 6.5-4.2S14.5 8 14.5 8 12.2 12.2 8 12.2 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.7" fill="currentColor" stroke="none"/>');
const EYE_OFF = SVG('<path d="M1.5 8s2.3-4.2 6.5-4.2S14.5 8 14.5 8 12.2 12.2 8 12.2 1.5 8 1.5 8z" opacity=".35"/><path d="M2.5 13.5l11-11"/>');
const LOCK = SVG('<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>');
const UNLOCK = SVG('<rect x="3.5" y="7" width="9" height="6.5" rx="1" opacity=".5"/><path d="M5.5 7V5a2.5 2.5 0 014.8-1" opacity=".5"/>');
const ICON = { text: SVG('<path d="M3 3.5h10M8 3.5v9M6 12.5h4"/>'), term: SVG('<path d="M2.5 4l3.5 4-3.5 4M8 12h5.5"/>'), voice: SVG('<path d="M8 2.5a2 2 0 012 2v3a2 2 0 01-4 0v-3a2 2 0 012-2zM4 7.5a4 4 0 008 0M8 11.5v2"/>'),
  social: SVG('<rect x="2" y="3" width="12" height="9" rx="1.2"/><path d="M2 5.5h12M4 3v2.5"/>'), hero: SVG('<rect x="2" y="2" width="12" height="12" rx="1.5"/><circle cx="8" cy="8" r="3"/>'), logo: SVG('<path d="M5.5 5.5a2.5 2.5 0 013.5 0l1.5 1.5M10.5 10.5a2.5 2.5 0 01-3.5 0L5.5 9M6.5 9.5l3-3"/>'),
  pendant: SVG('<path d="M8 1.5v5"/><circle cx="8" cy="10" r="3.5"/>'), ground: SVG('<path d="M2 5h12M2 8h12M2 11h12M5 2v12M8 2v12M11 2v12" opacity=".7"/>'), camera: SVG('<rect x="1.5" y="4.5" width="9.5" height="7" rx="1"/><path d="M11 7l3.5-2v6L11 9"/>'),
  intro: SVG('<circle cx="8" cy="8" r="6"/><path d="M6.5 5.5l4 2.5-4 2.5z" fill="currentColor"/>'), scene: SVG('<path d="M2 12l4-5 3 3.5 2-2 3 3.5z"/>'), stagecol: SVG('<circle cx="6" cy="6.5" r="3.5"/><circle cx="10" cy="6.5" r="3.5"/><circle cx="8" cy="10" r="3.5"/>'),
  overlays: SVG('<rect x="2" y="2" width="9" height="9" rx="1"/><rect x="5" y="5" width="9" height="9" rx="1"/>'), focus: SVG('<path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3"/>'), fx: SVG('<path d="M8 1.5l1.6 4.9h5l-4 3 1.5 4.9L8 11.3l-4.1 3 1.5-4.9-4-3h5z"/>'), video: SVG('<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M6.5 6l4 2-4 2z" fill="currentColor"/>'), cursor: SVG('<path d="M4 2l8 6.5-3.6.6 2 4.2-1.6.8-2-4.3L4 12.5z"/>') };
const TAGWIN = (id) => (id === 'chains' ? 'logo' : id === 'session' ? 'wave' : id === 'stereo' ? 'gonio' : id);

export function createLayers(app, root, hooks = {}) {
  const count = document.getElementById('layerCount');
  let sig = '', renaming = null, M = [];
  const beat = () => (app.cuetl ? app.cuetl.state.playhead : 0);
  /** Mini map of the frame with the window's rect (the Photoshop layer thumbnail). */
  function thumb(r) { const { W, H } = ASPECTS[app.store.project.aspect] || { W: 1080, H: 1920 }, k = 20 / Math.max(W, H), fw = W * k, fh = H * k, ox = (22 - fw) / 2, oy = (22 - fh) / 2;
    return `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="${ox}" y="${oy}" width="${fw}" height="${fh}" rx="1" fill="none" stroke="currentColor" stroke-opacity=".45"/>${r ? `<rect x="${(ox + r[0] * k).toFixed(1)}" y="${(oy + r[1] * k).toFixed(1)}" width="${Math.max(1, r[2] * k).toFixed(1)}" height="${Math.max(1, r[3] * k).toFixed(1)}" fill="currentColor" fill-opacity=".8"/>` : ''}</svg>`; }
  function model() {
    const R = app.registry(), b = beat(), ev = app.cues.ev(), sh = app.cues.sheet, has = (p) => !!R.byPath[p];
    const animated = new Set(sh.tracks.filter((t) => t.keys.length).map((t) => t.path)), anim = (e) => !!e && e.props.some((p) => animated.has(p.path));
    const el = (id) => R.elements.find((e) => e.id === id), locks = (sh.meta && sh.meta.locks) || {};
    const rects = app.studio && app.studio.rects ? (() => { try { return app.studio.rects(); } catch (_) { return {}; } })() : {};
    const sel = new Set(app.cuetl && app.cuetl.selected ? app.cuetl.selected().map(([, k]) => k.id) : []);
    const deep = !!(document.getElementById('advInsp') || {}).open, insEl = app.inspector && deep ? app.inspector.element : '', picked = app.studio && app.studio.pick, tags = app.cues.tags('').windows || {};
    const wins = R.elements.filter((e) => e.id.startsWith('win.')).map((e) => { const w = e.id.slice(4), tk = TAGWIN(w);
      return { kind: 'win', id: e.id, w, label: e.label.replace(/\s*\(.*\)$/, ''), eye: `${e.id}.visible`, vis: ev.value(`${e.id}.visible`, b, true) !== false, lock: !!locks[e.id], anim: anim(e), thumb: thumb(rects[w]),
        on: !!picked && picked === w, rename: DEFAULT_TAGS.windows && tk in DEFAULT_TAGS.windows ? tk : null, screen: tags[tk] || '' }; });
    const text = [];
    for (const t of sh.tracks) if (t.path === 'text.cue') for (const k of t.keys) text.push({ kind: 'clip', id: 'k:' + k.id, kid: k.id, path: t.path, b: k.b, label: `“${String(k.v || '').slice(0, 22)}”`, sub: `bar ${Math.floor(k.b / 4) + 1}`, icon: ICON.text, on: sel.has(k.id) });
    text.sort((a, c) => a.b - c.b);
    if (has('social.on')) text.push({ kind: 'prop', id: 'p:social.on', path: 'social.on', el: 'fx', label: 'Hook + pop-ups', icon: ICON.social, eye: 'social.on', vis: ev.value('social.on', b, true) !== false, on: false });
    if (has('term.on')) text.push({ kind: 'prop', id: 'p:term.on', path: 'term.on', el: 'fx', label: 'Terminal lines', icon: ICON.term, eye: 'term.on', vis: ev.value('term.on', b, true) !== false, on: false });
    if (has('voice.captions')) text.push({ kind: 'prop', id: 'p:voice.captions', path: 'voice.captions', el: 'ground', label: 'Voice captions', icon: ICON.voice, eye: 'voice.captions', vis: ev.value('voice.captions', b, true) !== false, on: false });
    if (has('outro.mode')) text.push({ kind: 'prop', id: 'p:outro.mode', path: 'outro.mode', el: 'fx', label: 'Outro dialog', icon: ICON.social, on: false });
    const fx = [];
    for (const t of sh.tracks) if (t.path.startsWith('ufx.') || t.path === 'fx.invert' || t.path === 'fx.glitch') for (const k of t.keys) { const u = t.path.startsWith('ufx.'), T = u ? UFX_TYPES[t.path.slice(4)] : null;
      fx.push({ kind: 'clip', id: 'k:' + k.id, kid: k.id, path: t.path, b: k.b, label: u ? (T ? T.name : t.path) : t.path === 'fx.invert' ? 'Negative (built-in)' : 'Glitch (built-in)', sub: `bar ${Math.floor(k.b / 4) + 1}${u ? ' · ' + Math.round((k.v === true ? 1 : +k.v || 0) * 100) + '%' : ''}`,
        icon: fxIcon(u ? t.path.slice(4) : t.path === 'fx.invert' ? 'neg' : 'rgb', 16), clipEye: u, vis: !k.off, on: sel.has(k.id) }); }
    fx.sort((a, c) => a.b - c.b);
    const brand = BRAND.map(el).filter(Boolean).map((e) => ({ kind: 'el', id: e.id, label: e.label.replace(/\s*\(.*\)$/, ''), icon: ICON[e.id] || ICON.hero, anim: anim(e), on: insEl === e.id && !picked && !sel.size,
      ...(e.id === 'hero' && has('hero.on') ? { eye: 'hero.on', vis: ev.value('hero.on', b, true) !== false } : {}) }));
    const scene = SCENE.map(([id, name]) => [el(id), name]).filter(([e]) => e).map(([e, name]) => ({ kind: 'el', id: e.id, label: name, icon: ICON[e.id] || ICON.scene, anim: anim(e), on: insEl === e.id && !picked && !sel.size }));
    if (has('cursor.on')) scene.splice(1, 0, { kind: 'prop', id: 'p:cursor.on', path: 'cursor.on', el: 'fx', label: 'Mouse cursor', icon: ICON.cursor, eye: 'cursor.on', vis: ev.value('cursor.on', b, true) !== false, on: false });
    return [['Windows', wins], ['Text', text], ['Effects', fx], ['Brand', brand], ['Scene', scene]];
  }
  function rowHtml(r) {
    const eye = r.eye || r.clipEye ? `<button class="eye" data-eye="${esc(r.id)}" aria-pressed="${r.vis}" aria-label="${r.vis ? 'Hide' : 'Show'} ${esc(r.label)}" data-tip="${r.vis ? 'Hide' : 'Show'}|${r.kind === 'win' ? 'Opens / closes the window (a key at the playhead when it is animated).' : 'Turns it on or off.'}|">${r.vis ? EYE : EYE_OFF}</button>` : '<span class="eye ph" aria-hidden="true"></span>';
    const lock = r.kind === 'win' ? `<button class="lk${r.lock ? ' on' : ''}" data-lock="${esc(r.id)}" aria-pressed="${r.lock}" aria-label="${r.lock ? 'Unlock' : 'Lock'} ${esc(r.label)}" data-tip="${r.lock ? 'Unlock' : 'Lock'}|A locked window cannot be picked or dragged on the preview.|">${r.lock ? LOCK : UNLOCK}</button>` : '<span class="lk ph" aria-hidden="true"></span>';
    const name = renaming === r.id ? `<input class="inp lren" data-ren="${esc(r.id)}" value="${esc(r.screen || '')}" aria-label="Label shown on screen for ${esc(r.label)}">`
      : `<button class="lname" data-sel="${esc(r.id)}" aria-current="${!!r.on}"${r.rename ? ` data-tip="${esc(r.label)}|Click to select. Double-click to rename the label on screen${r.screen ? ' (now: ' + esc(String(r.screen).toUpperCase()) + ')' : ''}.|"` : ''}><span class="ln-t">${esc(r.label)}</span>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</button>`;
    return `<div class="layer${r.on ? ' on' : ''}${r.vis === false ? ' off' : ''}${r.lock ? ' locked' : ''}" data-id="${esc(r.id)}" data-kind="${r.kind}">${eye}<span class="lth" aria-hidden="true">${r.thumb || r.icon || ''}</span>${name}${r.anim ? '<i class="kd" title="has keys on the timeline" aria-label="animated">◆</i>' : '<i class="kd ph"></i>'}${lock}</div>`;
  }
  function draw() {
    const top = root.scrollTop; root.innerHTML = M.map(([name, rows]) => rows.length ? `<div class="lgroup" role="group" aria-label="${name}"><div class="lhead">${name}<span>${rows.length}</span></div>${rows.map(rowHtml).join('')}</div>` : '').join('');
    count.textContent = M[0][1].length + ' windows'; root.scrollTop = top;
  }
  function update(force) {
    if (renaming && !force) return;
    M = model(); const s = (renaming || '') + M.map(([, rows]) => rows.map((r) => [r.id, r.vis, r.lock, r.anim, r.on, r.label, r.sub, r.thumb].join('/')).join(',')).join(';');
    if (!force && s === sig) return; sig = s;
    const a = document.activeElement, keep = root.contains(a) ? (a.dataset.sel ? ['sel', a.dataset.sel] : a.dataset.eye ? ['eye', a.dataset.eye] : a.dataset.lock ? ['lock', a.dataset.lock] : null) : null;
    draw(); if (keep) { const n = root.querySelector(`[data-${keep[0]}="${CSS.escape(keep[1])}"]`); if (n) n.focus(); }
    const ri = root.querySelector('[data-ren]'); if (ri && document.activeElement !== ri) { ri.focus(); ri.select(); }
  }
  const find = (id) => { for (const [, rows] of M) for (const r of rows) if (r.id === id) return r; return null; };
  function selectRow(r) {
    const tab = document.querySelector('.tabs [data-tab="inspect"]'); if (tab) tab.click();
    if (r.kind === 'win') { app.inspector.showElement(r.id); if (hooks.pick) hooks.pick(r.w); }
    else if (r.kind === 'clip') { const T = app.cuetl; if (hooks.pick) hooks.pick(null); const f = T.findKey(r.kid); if (f) { const k = f[1], ph = T.state.playhead;
        if (ph < k.b || ph >= k.b + (k.dur ?? 1)) { const tr = app.store.session.track, p = app.store.project; if (tr) app.actions.seek(p.inT + Math.round((k.b + Math.min(1, (k.dur ?? 1) / 2)) * tr.spb * 30) / 30); }
        T.focusRowOf(r.path); T.select([r.kid]); app.inspector.show(); } }
    else if (r.kind === 'prop') { if (hooks.pick) hooks.pick(null); if (app.inspector.showProp) app.inspector.showProp(r.path); else app.inspector.showElement(r.el); }
    else { if (hooks.pick) hooks.pick(null); app.inspector.showElement(r.id); }
    update(true);
  }
  root.addEventListener('click', (e) => {
    const eye = e.target.closest('[data-eye]'), lk = e.target.closest('[data-lock]'), sel = e.target.closest('[data-sel]');
    if (eye) { const r = find(eye.dataset.eye); if (!r) return;
      if (r.clipEye) app.cues.edit((s) => { for (const t of s.tracks) if (t.path === r.path) for (const k of t.keys) if (k.id === r.kid) { if (k.off) delete k.off; else k.off = true; } }, `${r.vis ? 'hide' : 'show'} ${r.label}`);
      else app.actions.setProp(r.eye, !r.vis);
      update(true); return; }
    if (lk) { const r = find(lk.dataset.lock); if (r && hooks.lock) hooks.lock(r.id, !r.lock); update(true); return; }
    if (sel) { const r = find(sel.dataset.sel); if (r) selectRow(r); }
  });
  root.addEventListener('dblclick', (e) => { const sel = e.target.closest('[data-sel]'); if (!sel) return; const r = find(sel.dataset.sel); if (!r || !r.rename) return; renaming = r.id; update(true); });
  const finishRename = (inp, ok) => { const r = find(renaming); renaming = null; if (ok && r && r.rename) { const v = inp.value; app.cues.edit((s) => setTagIn(s, 'windows.' + r.rename, v), `rename ${r.label} label`); } update(true); const n = root.querySelector(`[data-sel="${CSS.escape(r ? r.id : '')}"]`); if (n) n.focus(); };
  root.addEventListener('keydown', (e) => {
    const inp = e.target.closest('[data-ren]'); if (inp) { if (e.key === 'Enter') { e.preventDefault(); finishRename(inp, true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishRename(inp, false); } return; }
    if (e.key === 'F2') { const s = e.target.closest('[data-sel]'), r = s && find(s.dataset.sel); if (r && r.rename) { e.preventDefault(); renaming = r.id; update(true); } return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; const all = [...root.querySelectorAll('.lname')], i = all.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus();
  });
  root.addEventListener('focusout', (e) => { const inp = e.target.closest && e.target.closest('[data-ren]'); if (inp && renaming) finishRename(inp, true); });
  root.addEventListener('pointerover', (e) => { if (!hooks.hover) return; const row = e.target.closest('.layer'), r = row && find(row.dataset.id); hooks.hover(r && r.kind === 'win' ? r.w : null); });
  root.addEventListener('pointerleave', () => { if (hooks.hover) hooks.hover(null); });
  return { update, model: () => model() };
}
