// Inspector: edits the selected key(s) (time as BAR.BEAT.TICK, value by type, ease, duration, transition, text-cue
// fields) and, with nothing selected, any element of the look: every registry property with its value at the playhead,
// a diamond to keyframe it (creates its track = "Add track") and plain edits that change the base value or the key at
// the playhead. On a phone it lives in a bottom sheet.
import { EASE_IDS, bbtToBeats, beatsToBbt, snapBeat, SNAPS, newId, defaultEase } from '../cues/schema.js';
import { LAYOUT } from '../v8/layout.js';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const EASE_LABEL = { step: 'Step (hold)', linear: 'Linear', easeInOut: 'Ease in-out', expoOut: 'Expo out', backOut: 'Back out' };
const fmtNum = (v, step) => { const d = step && step < 1 ? Math.min(4, Math.ceil(-Math.log10(step))) : 0; return (+v).toFixed(d); };

export function createInspector(app, root) {
  const cues = app.cues, tl = () => app.cuetl, reg = () => app.registry(), P = () => app.store.project;
  let element = 'camera', selfEdit = false;
  const playBeat = () => tl().state.playhead, grid = () => SNAPS[P().timeline.snap] || 0;
  const edit = (fn, label) => { selfEdit = true; cues.edit(fn, label); selfEdit = false; };
  const winIds = () => Object.keys(LAYOUT[P().look][P().aspect]);
  function control(prop, v, attrs = '') {
    const k = prop.kind;
    if (k === 'number') return `<div class="num"><input class="inp mono" type="number" step="${prop.step ?? 'any'}" ${prop.min != null ? `min="${prop.min}"` : ''} ${prop.max != null ? `max="${prop.max}"` : ''} value="${fmtNum(v, prop.step)}" ${attrs} data-type="number" aria-label="${esc(prop.label)}">${prop.unit ? `<span class="unit">${esc(prop.unit)}</span>` : ''}</div>` +
      (prop.min != null && prop.max != null ? `<input type="range" min="${prop.min}" max="${prop.max}" step="${prop.step ?? 'any'}" value="${v}" ${attrs} data-type="number" aria-label="${esc(prop.label)} slider">` : '');
    if (k === 'color') return `<div class="num"><input type="color" value="${esc(v)}" ${attrs} data-type="color" aria-label="${esc(prop.label)}"><input class="inp mono" value="${esc(v)}" ${attrs} data-type="color" aria-label="${esc(prop.label)} hex"></div>`;
    if (k === 'enum' || k === 'shot') { const opts = k === 'shot' ? ['wide', ...winIds()] : prop.options || []; return `<select class="inp mono" ${attrs} data-type="enum" aria-label="${esc(prop.label)}">${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`; }
    if (k === 'bool' || k === 'event') return `<label class="tog"><input type="checkbox" ${v ? 'checked' : ''} ${attrs} data-type="bool"> ${v ? 'on' : 'off'}</label>`;
    return `<textarea class="inp mono" rows="${String(v).length > 40 ? 3 : 1}" ${attrs} data-type="text" aria-label="${esc(prop.label)}">${esc(v)}</textarea>`;
  }
  const readInput = (el) => (el.dataset.type === 'number' ? +el.value : el.dataset.type === 'bool' ? el.checked : el.value);
  // ---------------------------------------------------------------- key view
  function keyView(sel) {
    if (sel.length > 1) {
      const kinds = new Set(sel.map(([r]) => r.kind)), interp = [...kinds].every((k) => ['number', 'color', 'shot'].includes(k));
      return `<div class="ins-h"><b>${sel.length} keys</b><span class="hint">${[...new Set(sel.map(([r]) => r.path))].join(', ')}</span></div>
        ${interp ? `<label class="field"><span class="lbl">Ease (all)</span><select class="inp mono" data-k="ease-all">${EASE_IDS.map((e) => `<option value="${e}">${EASE_LABEL[e]}</option>`).join('')}</select></label>` : ''}
        <div class="inrow"><button class="btn small" data-act="nudge-l">← grid</button><button class="btn small" data-act="nudge-r">grid →</button><button class="btn small" data-act="copy">Copy</button><button class="btn small danger" data-act="del">Delete</button></div>`;
    }
    const [row, k] = sel[0], prop = reg().byPath[row.path] || { label: row.path, kind: row.kind }, bt = app.store.session.track ? app.store.session.track.spb : .5;
    let h = `<div class="ins-h"><b>${esc(prop.elementLabel ? prop.elementLabel + ' · ' + prop.label : row.label)}</b><code>${esc(row.path)}</code></div>
      <div class="grid2"><label class="field"><span class="lbl">At (bar.beat.tick)</span><input class="inp mono" data-k="at" value="${beatsToBbt(k.b)}" aria-label="Key time"></label>
      <label class="field"><span class="lbl">Beat</span><input class="inp mono" type="number" step="${grid() || 0.0625}" min="0" data-k="b" value="${+k.b.toFixed(4)}"></label></div>
      <p class="hint">${(k.b * bt).toFixed(3)} s from bar 1 · frame ${Math.round(k.b * bt * 30)}</p>`;
    const vprop = row.path === 'fx.glitch' ? { ...prop, kind: 'number', min: 0, max: 1, step: 0.01, label: 'Amount' } : row.path === 'logo.hero' ? null : row.kind === 'event' ? null : prop;
    if (row.path === 'text.cue') {
      h += `<label class="field"><span class="lbl">Text ({title}, {bpm}, {key} … work)</span><textarea class="inp mono" rows="2" data-k="v">${esc(k.v)}</textarea></label>
        <div class="grid2">${[['x', 'X (0-1)', 0.01], ['y', 'Y (0-1)', 0.01], ['size', 'Size px', 1], ['dur', 'Length (beats)', grid() || 0.25]].map(([f, l, s]) => `<label class="field"><span class="lbl">${l}</span><input class="inp mono" type="number" step="${s}" data-k="${f}" value="${k[f] ?? ''}"></label>`).join('')}</div>
        <div class="grid2"><label class="field"><span class="lbl">Type</span><select class="inp mono" data-k="font">${['mono', 'sans', 'serif', 'hand', 'stencil'].map((o) => `<option ${o === k.font ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <label class="field"><span class="lbl">Colour</span><select class="inp mono" data-k="color">${['ink', 'hot', 'dim'].map((o) => `<option ${o === k.color ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <label class="field"><span class="lbl">Align</span><select class="inp mono" data-k="align">${['left', 'center', 'right'].map((o) => `<option ${o === k.align ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <label class="tog field"><input type="checkbox" data-k="box" ${k.box !== false ? 'checked' : ''}> card behind</label></div>`;
    } else if (vprop) h += `<div class="field"><span class="lbl">${row.kind === 'shot' ? 'Target' : 'Value'}</span>${control(vprop, k.v, 'data-k="v"')}</div>`;
    if (row.kind === 'shot') h += `<div class="grid2"><label class="field"><span class="lbl">Transition</span><select class="inp mono" data-k="transition"><option value="push" ${k.transition !== 'cut' ? 'selected' : ''}>push (lands on the key)</option><option value="cut" ${k.transition === 'cut' ? 'selected' : ''}>cut</option></select></label>
      <label class="field"><span class="lbl">Push length (beats)</span><input class="inp mono" type="number" min="0.0625" step="${grid() || 0.25}" data-k="dur" value="${k.dur ?? 1}" ${k.transition === 'cut' ? 'disabled' : ''}></label></div>`;
    if (row.kind === 'clip' && row.path !== 'text.cue') h += `<label class="field"><span class="lbl">Length (beats)</span><input class="inp mono" type="number" min="0.0625" step="${grid() || 0.25}" data-k="dur" value="${k.dur ?? 1}"></label>`;
    if (['number', 'color', 'shot'].includes(row.kind)) h += `<label class="field"><span class="lbl">Ease to the next key</span><select class="inp mono" data-k="ease">${EASE_IDS.map((e) => `<option value="${e}" ${e === k.ease ? 'selected' : ''}>${EASE_LABEL[e]}</option>`).join('')}</select></label>`;
    h += `<div class="inrow"><button class="btn small" data-act="jump">Go to key</button><button class="btn small" data-act="copy">Copy</button><button class="btn small danger" data-act="del">Delete key</button></div>`;
    return h;
  }
  // ---------------------------------------------------------------- element view (every property of an element)
  function elementView() {
    const R = reg(), groups = {}; for (const e of R.elements) (groups[e.group] = groups[e.group] || []).push(e);
    const el = R.elements.find((e) => e.id === element) || R.elements[0]; element = el.id;
    const b = playBeat(), ev = cues.ev();
    let h = `<div class="ins-h"><b>Properties</b><span class="hint">at ${beatsToBbt(snapBeat(b, 1 / 960))} · ◆ = keyframe it</span></div>
      <label class="field"><span class="lbl">Element (add a track from any property)</span><select class="inp mono" data-k="element">${Object.entries(groups).map(([gname, es]) => `<optgroup label="${esc(gname)}">${es.map((e) => `<option value="${e.id}" ${e.id === el.id ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="props">`;
    for (const p of el.props) { const tr = cues.sheet.tracks.find((t) => t.path === p.path), hasKeys = tr && tr.keys.length, onKey = hasKeys && tr.keys.some((k) => Math.abs(k.b - b) < 1e-6);
      const v = p.kind === 'shot' ? ev.shot(b).to : p.kind === 'clip' || p.kind === 'event' ? null : ev.value(p.path, b, p.default);
      h += `<div class="prop" data-path="${esc(p.path)}"><div class="prop-h"><button class="kf${hasKeys ? ' on' : ''}${onKey ? ' here' : ''}" data-act="kf" aria-label="${hasKeys ? 'Add or select key at the playhead' : 'Keyframe'} ${esc(p.label)}" title="${hasKeys ? 'key at the playhead' : 'animate: create a track'}">◆</button><span class="lbl">${esc(p.label)}</span>${hasKeys ? `<button class="btn tiny" data-act="lane">lane</button>` : ''}</div>
        ${p.kind === 'clip' || p.kind === 'event' ? `<span class="hint">${hasKeys ? tr.keys.length + ' on its lane' : 'timed: ◆ adds one at the playhead'}</span>` : control(p, v, 'data-k="prop"')}</div>`; }
    return h + '</div>';
  }
  function render() {
    const sel = tl() ? tl().selected() : [];
    root.innerHTML = sel.length ? keyView(sel) : elementView();
    root.dataset.mode = sel.length ? 'key' : 'element';
    document.body.classList.toggle('has-sel', sel.length > 0);
  }
  // ---------------------------------------------------------------- events
  function setKeyField(f, val) {
    const sel = tl().selected(); if (!sel.length) return;
    edit(() => { for (const [r, k] of sel) { r.track.auto = false;
      if (f === 'at') { try { k.b = Math.max(0, bbtToBeats(val)); } catch (_) {} }
      else if (f === 'b') k.b = Math.max(0, +val);
      else if (['x', 'y', 'size', 'dur'].includes(f)) k[f] = f === 'dur' ? Math.max(1 / 16, +val) : +val;
      else if (f === 'ease-all') { if (['number', 'color', 'shot'].includes(r.kind)) k.ease = val; }
      else k[f] = val; }
      for (const t of cues.sheet.tracks) t.keys.sort((a, b) => a.b - b.b); }, 'edit key');
  }
  function setProp(path, v) {
    const b = snapBeat(playBeat(), grid()) , tr = cues.sheet.tracks.find((t) => t.path === path && t.keys.length);
    edit((s) => { if (!tr) { s.base[path] = v; return; } tr.auto = false; const k = tr.keys.find((q) => Math.abs(q.b - b) < 1e-6);
      if (k) k.v = v; else { tr.keys.push({ id: newId(), b, v, ease: defaultEase(tr.kind) }); tr.keys.sort((a, c) => a.b - c.b); } }, 'set ' + path);
  }
  function keyframe(path) {
    const p = reg().byPath[path], b = snapBeat(playBeat(), grid()); let tr = cues.sheet.tracks.find((t) => t.path === path);
    if (tr && tr.keys.some((k) => Math.abs(k.b - b) < 1e-6)) { const k = tr.keys.find((q) => Math.abs(q.b - b) < 1e-6); tl().focusRowOf(path); tl().select([k.id]); return; }
    const row = { path, kind: p.kind, track: tr || null };
    tl().addKeyAt(row, b); tl().focusRowOf(path);
  }
  root.addEventListener('input', (e) => { const el = e.target, f = el.dataset.k; if (!f) return;
    if (f === 'prop') { const path = el.closest('.prop').dataset.path, v = readInput(el); if (el.type === 'range' || el.type === 'color') syncSibling(el, v); setProp(path, v); return; }
    if (f === 'v' || f === 'element') return; if (el.type === 'number' || el.tagName === 'SELECT' || el.type === 'checkbox') setKeyField(f, el.type === 'checkbox' ? el.checked : el.value); });
  root.addEventListener('change', (e) => { const el = e.target, f = el.dataset.k; if (!f) return;
    if (f === 'element') { element = el.value; render(); return; }
    if (f === 'v') { const v = el.dataset.type ? readInput(el) : el.value; syncSibling(el, v); setKeyField('v', v); return; }
    if (f === 'at') setKeyField('at', el.value); });
  // live typing for text values and range sliders on keys
  root.addEventListener('input', (e) => { const el = e.target; if (el.dataset.k === 'v' && (el.type === 'range' || el.type === 'color' || el.tagName === 'TEXTAREA')) { const v = readInput(el); syncSibling(el, v); setKeyField('v', v); } });
  function syncSibling(el, v) { const box = el.closest('.field,.prop'); if (!box) return; box.querySelectorAll(`[data-type="${el.dataset.type}"]`).forEach((o) => { if (o !== el) { if (o.type === 'checkbox') o.checked = !!v; else o.value = el.dataset.type === 'number' && o.type === 'number' ? v : v; } }); }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
    if (a === 'del') tl().del(); else if (a === 'copy') tl().copy(); else if (a === 'nudge-l') tl().nudge(-1); else if (a === 'nudge-r') tl().nudge(1);
    else if (a === 'jump') { const s = tl().selected()[0]; if (s) { const bt = app.store.session.track.spb; app.actions.seek(P().inT + Math.round(s[1].b * bt * 30) / 30); } }
    else if (a === 'kf') keyframe(b.closest('.prop').dataset.path);
    else if (a === 'lane') tl().focusRowOf(b.closest('.prop').dataset.path);
    else if (a === 'close') tl().clearSel(); });
  cues.subscribe((why) => { if (selfEdit || why === 'preview' || why === 'saved') return; if (!root.contains(document.activeElement)) render(); });
  let lastB = -1, lastT = 0;
  return {
    show: render,
    /** Refresh the property values while the playhead moves (element view only, not while typing). */
    tick() { const b = playBeat(), now = performance.now(); if (root.dataset.mode === 'element' && Math.abs(b - lastB) > 1e-6 && now - lastT > (app.clock.playing ? 300 : 60) && !root.contains(document.activeElement)) { lastB = b; lastT = now; render(); } },
    showTrack(path) { const p = reg().byPath[path]; if (p) { element = p.element; if (!tl().selected().length) render(); } },
    showElement(id) { element = id; tl().clearSel(); render(); },
    focusValue() { const el = root.querySelector('[data-k="v"]'); if (el) el.focus(); },
    get element() { return element; },
  };
}
