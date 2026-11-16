// Inspector, laid out like Premiere's Effect Controls. With keys selected it edits them (time as BAR.BEAT.TICK, value by
// type, interpolation: hold / linear / bezier / auto + ease presets, ease strength and handles, duration, transition,
// text-cue fields) and holds the pattern tools (quantise, stamp to beats, paste attributes, save as key preset). With
// nothing selected it shows the elements of the look as groups: the chosen element (every property) and every element
// that is animated (its animated properties). Each property row: ◆ (add / select a key at the playhead), ‹ › (previous /
// next key), the label (drag it sideways to scrub the value), the value control, and a mini key strip aligned with the
// timeline's visible range (click a key to select it). A selected marker shows its label and kind. On a phone it lives
// in a bottom sheet.
import { bbtToBeats, beatsToBbt, snapBeat, SNAPS, newId, defaultEase, EASE_PRESETS, MARKER_KINDS } from '../cues/schema.js';
import { presetOf } from '../cues/ops.js';
import { LAYOUT } from '../v8/layout.js';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const fmtNum = (v, step) => { const d = step && step < 1 ? Math.min(4, Math.ceil(-Math.log10(step))) : 0; return (+v).toFixed(d); };
const RULES = [['beat', 'every beat'], ['offbeat', 'every offbeat'], ['bar', 'every bar'], ['2bar', 'every 2 bars'], ['section', 'every section'], ['kick', 'every kick'], ['snare', 'every snare'], ['marker', 'every marker']];
const INTERP_OPTS = () => [...Object.entries(EASE_PRESETS).map(([id, p]) => [id, p.label]), ['bezier', 'Bezier (custom handles)']];

export function createInspector(app, root) {
  const cues = app.cues, tl = () => app.cuetl, reg = () => app.registry(), P = () => app.store.project;
  let element = 'camera', selfEdit = false, stampRule = 'beat', quantTo = 'markers', quantStr = 100, presetSel = '';
  const open = {};   // <details> state per element id
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
  const sel = (o, v) => o.map(([id, l]) => `<option value="${id}" ${id === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  /** Mini key strip: the keys of one track over the timeline's visible beats, the playhead, click a key to select it. */
  function strip(track) {
    const V = tl().view(), span = Math.max(1e-6, V.z - V.a), pc = (b) => ((b - V.a) / span * 100).toFixed(2), S = tl().state.sel;
    const ks = track.keys.filter((k) => k.b >= V.a - 1e-6 && k.b <= V.z + 1e-6).map((k) => `<i data-key="${k.id}" class="${S.has(k.id) ? 'on' : ''} ${k.ty === 'bezier' || k.ty === 'auto' ? 'bz' : k.ty === 'hold' || k.ease === 'step' ? 'hd' : ''}" style="left:${pc(k.b)}%" title="${beatsToBbt(k.b)}"></i>`).join('');
    const ph = playBeat(); return `<div class="kstrip">${ks}${ph >= V.a && ph <= V.z ? `<b style="left:${pc(ph)}%"></b>` : ''}</div>`;
  }
  // ---------------------------------------------------------------- pattern tools (selection)
  function patternTools(n) {
    const presets = tl().presets();
    return `<div class="tools"><div class="tool-h lbl">Pattern</div>
      <div class="inrow"><select class="inp mono small" data-k="q-to" aria-label="Quantise target">${sel([['markers', 'to markers'], ['grid', 'to grid']], quantTo)}</select><input type="range" min="10" max="100" step="5" value="${quantStr}" data-k="q-str" aria-label="Quantise strength" class="qstr"><span class="hint mono" data-q-val>${quantStr}%</span><button class="btn small" data-act="quantise" title="Q (Shift+Q: grid)">Quantise</button></div>
      <div class="inrow"><button class="btn small" data-act="stamp" title="Repeat the selected keys">Stamp ${n > 1 ? 'pattern' : 'key'}</button><select class="inp mono small" data-k="stamp-rule" aria-label="Stamp on">${sel(RULES, stampRule)}</select><span class="hint">${tl().state.loop ? 'in the loop' : 'whole video'}</span></div>
      <div class="inrow"><button class="btn small" data-act="paste-attr" title="Shift+Cmd+V">Paste attributes</button><input class="inp mono small" data-k="preset-name" placeholder="name" aria-label="Preset name" style="width:96px"><button class="btn small" data-act="save-preset">Save preset</button></div>
      <p class="hint">${presets.length} key presets. Copy a key, then Paste attributes gives other keys its curve.</p></div>`;
  }
  // ---------------------------------------------------------------- key view
  function interpField(row, k, nx) {
    if (!['number', 'color', 'shot'].includes(row.kind)) return '';
    const cur = presetOf(k, row.kind === 'shot' ? k : nx);
    let h = `<label class="field"><span class="lbl">Interpolation ${row.kind === 'shot' ? '(the push)' : 'to the next key'} · B cycles</span><select class="inp mono" data-k="interp" aria-label="Interpolation">${sel(INTERP_OPTS(), cur)}</select></label>`;
    if (k.ty === 'bezier') { const ob = k.ob || [1 / 3, 1 / 3], ib = (row.kind === 'shot' ? k.ib : nx && nx.ib) || [-1 / 3, -1 / 3];
      h += `<div class="field"><span class="lbl">Ease strength (handle length)</span><input type="range" min="0" max="1" step="0.01" value="${ob[0]}" data-k="strength" aria-label="Ease strength"></div>
        <div class="grid4">${[['ox', 'out x', ob[0]], ['oy', 'out y', ob[1]], ['ix', 'in x', 1 + ib[0]], ['iy', 'in y', 1 + ib[1]]].map(([f, l, v]) => `<label class="field"><span class="lbl">${l}</span><input class="inp mono" type="number" step="0.01" data-k="h-${f}" value="${(+v).toFixed(2)}"></label>`).join('')}</div>
        <p class="hint">cubic-bezier(${ob[0].toFixed(2)}, ${ob[1].toFixed(2)}, ${(1 + ib[0]).toFixed(2)}, ${(1 + ib[1]).toFixed(2)}). Drag the handles in a tall lane (G) or the graph (E).</p>`; }
    return h;
  }
  function keyView(S) {
    if (S.length > 1) {
      const kinds = new Set(S.map(([r]) => r.kind)), interp = [...kinds].every((k) => ['number', 'color', 'shot'].includes(k));
      return `<div class="ins-h"><b>${S.length} keys</b><span class="hint">${esc([...new Set(S.map(([r]) => r.path))].join(', '))}</span></div>
        ${interp ? `<label class="field"><span class="lbl">Interpolation (all)</span><select class="inp mono" data-k="interp"><option value="">mixed</option>${sel(INTERP_OPTS(), '')}</select></label>` : ''}
        <div class="inrow"><button class="btn small" data-act="nudge-l">← grid</button><button class="btn small" data-act="nudge-r">grid →</button><button class="btn small" data-act="zoom-sel" title="Z">Zoom to keys</button><button class="btn small" data-act="copy">Copy</button><button class="btn small danger" data-act="del">Delete</button></div>${patternTools(S.length)}`;
    }
    const [row, k] = S[0], prop = reg().byPath[row.path] || { label: row.path, kind: row.kind }, bt = app.store.session.track ? app.store.session.track.spb : .5, K = row.track.keys, nx = K[K.indexOf(k) + 1];
    let h = `<div class="ins-h"><b>${esc(prop.elementLabel ? prop.elementLabel + ' · ' + prop.label : row.label)}</b><code>${esc(row.path)}</code></div>
      <div class="inrow keynav"><button class="btn small" data-act="nav-prev" aria-label="Previous key ([)">‹ key</button><span class="hint mono">${K.indexOf(k) + 1} / ${K.length}</span><button class="btn small" data-act="nav-next" aria-label="Next key (])">key ›</button>${row.kind === 'number' ? `<button class="btn small" data-act="graph" title="E">Graph</button>` : ''}</div>
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
    h += interpField(row, k, nx);
    h += `<div class="inrow"><button class="btn small" data-act="jump">Go to key</button><button class="btn small" data-act="copy">Copy</button><button class="btn small danger" data-act="del">Delete key</button></div>`;
    return h + patternTools(1);
  }
  // ---------------------------------------------------------------- marker view
  function markerView(m) {
    return `<div class="ins-h"><b>Marker</b><span class="hint">${beatsToBbt(m.b)} · Shift+[ and Shift+] jump between markers</span></div>
      <div class="grid2"><label class="field"><span class="lbl">Label</span><input class="inp mono" data-k="m-label" value="${esc(m.label)}" aria-label="Marker label"></label>
      <label class="field"><span class="lbl">Kind</span><select class="inp mono" data-k="m-kind">${MARKER_KINDS.map((k) => `<option ${k === m.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>
      <label class="field"><span class="lbl">At (bar.beat.tick)</span><input class="inp mono" data-k="m-at" value="${beatsToBbt(m.b)}"></label>
      <div class="inrow"><button class="btn small danger" data-act="m-del">Delete marker</button></div>`;
  }
  // ---------------------------------------------------------------- element view (Effect Controls)
  function propRow(p, b, ev) {
    const tr = cues.sheet.tracks.find((t) => t.path === p.path), hasKeys = tr && tr.keys.length, onKey = hasKeys && tr.keys.some((k) => Math.abs(k.b - b) < 1e-3);
    const v = p.kind === 'shot' ? ev.shot(b).to : p.kind === 'clip' || p.kind === 'event' ? null : ev.value(p.path, b, p.default), scrub = p.kind === 'number';
    return `<div class="prop${hasKeys ? ' anim' : ''}" data-path="${esc(p.path)}"><div class="prop-h"><button class="kf${hasKeys ? ' on' : ''}${onKey ? ' here' : ''}" data-act="kf" aria-label="${hasKeys ? 'Add or select key at the playhead' : 'Keyframe'} ${esc(p.label)}" title="${hasKeys ? 'key at the playhead' : 'animate: create a track'}">◆</button>
      <span class="lbl${scrub ? ' scrub' : ''}" ${scrub ? `data-scrub="${esc(p.path)}" title="drag sideways to change (Shift: ×10)"` : ''}>${esc(p.label)}</span>
      ${hasKeys ? `<button class="btn tiny" data-act="pk" aria-label="Previous key of ${esc(p.label)}">‹</button><button class="btn tiny" data-act="nk" aria-label="Next key of ${esc(p.label)}">›</button><button class="btn tiny" data-act="lane" title="reveal the lane">lane</button>` : ''}</div>
      ${p.kind === 'clip' || p.kind === 'event' ? `<span class="hint">${hasKeys ? tr.keys.length + ' on its lane' : 'timed: ◆ adds one at the playhead'}</span>` : control(p, v, 'data-k="prop"')}${hasKeys ? strip(tr) : ''}</div>`;
  }
  function elementView() {
    const R = reg(), groups = {}; for (const e of R.elements) if (!e.hidden || e.id === element) (groups[e.group] = groups[e.group] || []).push(e);   // v12: hidden elements (the EQ meter keys) stay registered but are not listed
    const el = R.elements.find((e) => e.id === element) || R.elements[0]; element = el.id;
    const b = playBeat(), ev = cues.ev(), animated = new Set(cues.sheet.tracks.filter((t) => t.keys.length).map((t) => t.path));
    let h = `<div class="ins-h"><b>Effect controls</b><span class="hint">at ${beatsToBbt(snapBeat(b, 1 / 960))} · ◆ keyframe · drag a label to scrub</span></div>
      <label class="field"><span class="lbl">Element (add a track from any property)</span><select class="inp mono" data-k="element">${Object.entries(groups).map(([gname, es]) => `<optgroup label="${esc(gname)}">${es.map((e) => `<option value="${e.id}" ${e.id === el.id ? 'selected' : ''}>${esc(e.label)}${e.props.some((p) => animated.has(p.path)) ? ' ◆' : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
    const others = R.elements.filter((e) => e.id !== el.id && e.props.some((p) => animated.has(p.path)));
    for (const e of [el, ...others]) { const mine = e === el, props = mine ? e.props : e.props.filter((p) => animated.has(p.path)), n = e.props.filter((p) => animated.has(p.path)).length, isOpen = open[e.id] ?? mine;
      h += `<details class="fx" data-el="${e.id}" ${isOpen ? 'open' : ''}><summary><span>${esc(e.label)}</span><span class="hint">${n ? n + ' animated' : 'static'}</span></summary><div class="props">${isOpen ? props.map((p) => propRow(p, b, ev)).join('') : ''}</div></details>`; }
    const presets = tl().presets();
    h += `<div class="tools"><div class="tool-h lbl">Key presets</div><div class="inrow"><select class="inp mono small" data-k="preset" aria-label="Key preset">${presets.map((p) => `<option value="${p.id}" ${p.id === presetSel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="btn small" data-act="preset-apply">At playhead</button></div>
      <div class="inrow"><button class="btn small" data-act="preset-stamp">Stamp</button><select class="inp mono small" data-k="stamp-rule" aria-label="Stamp on">${sel(RULES, stampRule)}</select><span class="hint">${tl().state.loop ? 'in the loop' : 'whole video'}</span>${presets.find((p) => p.id === presetSel && p.id.startsWith('u')) ? '<button class="btn small danger" data-act="preset-del">Delete</button>' : ''}</div></div>`;
    return h;
  }
  function render() {
    const S = tl() ? tl().selected() : [], mk = tl() && tl().state.selMarker ? (cues.sheet.markers || []).find((m) => m.id === tl().state.selMarker) : null;
    root.innerHTML = S.length ? keyView(S) : mk ? markerView(mk) : elementView();
    root.dataset.mode = S.length ? 'key' : mk ? 'marker' : 'element';
    document.body.classList.toggle('has-sel', S.length > 0); if (app.studio && app.studio.sheetSync) app.studio.sheetSync();
  }
  // ---------------------------------------------------------------- events
  function setKeyField(f, val) {
    const S = tl().selected().filter(([r]) => !(r.track && r.track.lock)); if (!S.length) return;
    if (f === 'interp') { if (val) { selfEdit = true; tl().setInterp(val); selfEdit = false; } return; }
    if (f === 'strength') { selfEdit = true; tl().setEaseStrength(+val); selfEdit = false; return; }
    edit(() => { for (const [r, k] of S) { r.track.auto = false; const K = r.track.keys, nx = r.kind === 'shot' ? k : K[K.indexOf(k) + 1];
      if (f === 'at') { try { k.b = Math.max(0, bbtToBeats(val)); } catch (_) {} }
      else if (f === 'b') k.b = Math.max(0, +val);
      else if (['x', 'y', 'size', 'dur'].includes(f)) k[f] = f === 'dur' ? Math.max(1 / 16, +val) : +val;
      else if (f.startsWith('h-')) { k.ty = 'bezier'; const o = k.ob || [1 / 3, 1 / 3]; if (f === 'h-ox') k.ob = [Math.min(1, Math.max(0, +val)), o[1]]; else if (f === 'h-oy') k.ob = [o[0], +val];
        else if (nx) { const i = nx.ib || [-1 / 3, -1 / 3]; nx.ib = f === 'h-ix' ? [Math.min(0, Math.max(-1, +val - 1)), i[1]] : [i[0], +val - 1]; } }
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
  function setMarker(f, val) { const id = tl().state.selMarker; edit((s) => { const m = (s.markers || []).find((q) => q.id === id); if (!m) return; if (f === 'm-label') m.label = val; else if (f === 'm-kind') m.kind = val; else if (f === 'm-at') { try { m.b = Math.max(0, bbtToBeats(val)); } catch (_) {} } s.markers.sort((a, b) => a.b - b.b); }, 'edit marker'); }
  const PASSIVE = ['v', 'element', 'q-to', 'stamp-rule', 'preset', 'preset-name', 'interp'];
  root.addEventListener('input', (e) => { const el = e.target, f = el.dataset.k; if (!f) return;
    if (f === 'prop') { const path = el.closest('.prop').dataset.path, v = readInput(el); if (el.type === 'range' || el.type === 'color') syncSibling(el, v); setProp(path, v); return; }
    if (f === 'q-str') { quantStr = +el.value; const o = root.querySelector('[data-q-val]'); if (o) o.textContent = quantStr + '%'; return; }
    if (f === 'strength') { setKeyField('strength', el.value); return; }
    if (PASSIVE.includes(f) || f.startsWith('m-') || f.startsWith('h-')) return; if (el.type === 'number' || el.tagName === 'SELECT' || el.type === 'checkbox') setKeyField(f, el.type === 'checkbox' ? el.checked : el.value); });
  root.addEventListener('change', (e) => { const el = e.target, f = el.dataset.k; if (!f) return;
    if (f === 'element') { element = el.value; open[element] = true; render(); return; }
    if (f === 'q-to') { quantTo = el.value; return; } if (f === 'stamp-rule') { stampRule = el.value; return; } if (f === 'preset') { presetSel = el.value; render(); return; }
    if (f.startsWith('m-')) { setMarker(f, el.value); return; }
    if (f === 'interp' || f.startsWith('h-') || f === 'strength') { setKeyField(f, el.value); render(); return; }
    if (f === 'v') { const v = el.dataset.type ? readInput(el) : el.value; syncSibling(el, v); setKeyField('v', v); return; }
    if (f === 'at') setKeyField('at', el.value); });
  // live typing for text values and range sliders on keys
  root.addEventListener('input', (e) => { const el = e.target; if (el.dataset.k === 'v' && (el.type === 'range' || el.type === 'color' || el.tagName === 'TEXTAREA')) { const v = readInput(el); syncSibling(el, v); setKeyField('v', v); } });
  function syncSibling(el, v) { const box = el.closest('.field,.prop'); if (!box) return; box.querySelectorAll(`[data-type="${el.dataset.type}"]`).forEach((o) => { if (o !== el) { if (o.type === 'checkbox') o.checked = !!v; else o.value = v; } }); }
  root.addEventListener('toggle', (e) => { const d = e.target; if (d.tagName === 'DETAILS' && d.dataset.el) { const was = open[d.dataset.el]; open[d.dataset.el] = d.open; if (d.open && !was && !d.querySelector('.prop')) render(); } }, true);
  root.addEventListener('click', (e) => { const sk = e.target.closest('.kstrip i[data-key]'); if (sk) { const f = tl().findKey(sk.dataset.key); if (f) { tl().focusRowOf(f[0].path); tl().select([f[1].id]); } return; }
    const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, T = tl(), path = b.closest('.prop') && b.closest('.prop').dataset.path;
    if (a === 'del') T.del(); else if (a === 'copy') T.copy(); else if (a === 'nudge-l') T.nudge(-1); else if (a === 'nudge-r') T.nudge(1);
    else if (a === 'jump') { const s = T.selected()[0]; if (s) { const bt = app.store.session.track.spb; app.actions.seek(P().inT + Math.round(s[1].b * bt * 30) / 30); } }
    else if (a === 'kf') keyframe(path);
    else if (a === 'lane') { const i = T.focusRowOf(path); if (i >= 0) { const r = T.rows()[i]; if (r.kind === 'number' && r.h < 40) T.toggleLaneHeight(r); } }
    else if (a === 'pk' || a === 'nk') { const i = T.focusRowOf(path); if (i >= 0) T.navKey(a === 'nk' ? 1 : -1, [T.rows()[i]]); }
    else if (a === 'nav-prev' || a === 'nav-next') { const s = T.selected()[0]; if (s) { const i = T.focusRowOf(s[0].path); T.navKey(a === 'nav-next' ? 1 : -1, [T.rows()[i]]); } }
    else if (a === 'graph') { const s = T.selected()[0]; if (s) { T.focusRowOf(s[0].path); T.toggleGraph(s[0].path); app.studio.syncTools && app.studio.syncTools(); } }
    else if (a === 'zoom-sel') T.zoomToSelection();
    else if (a === 'quantise') T.quantise(quantTo, quantStr / 100);
    else if (a === 'stamp') T.stamp('selection', stampRule);
    else if (a === 'paste-attr') T.pasteAttributes();
    else if (a === 'save-preset') { const n = root.querySelector('[data-k="preset-name"]'), p = T.savePreset(n && n.value.trim()); if (p) { presetSel = p.id; T.clearSel(); } }
    else if (a === 'preset-apply') T.applyPreset(presetSel || T.presets()[0].id);
    else if (a === 'preset-stamp') T.stamp(presetSel || T.presets()[0].id, stampRule);
    else if (a === 'preset-del') { T.deletePreset(presetSel); presetSel = ''; render(); }
    else if (a === 'm-del') T.del();
    else if (a === 'close') T.clearSel(); });
  // scrubby labels: drag a number property's label sideways (one undo step per drag)
  let scrub = null;
  root.addEventListener('pointerdown', (e) => { const l = e.target.closest('[data-scrub]'); if (!l) return; const path = l.dataset.scrub, p = reg().byPath[path]; if (!p) return; e.preventDefault(); l.setPointerCapture(e.pointerId);
    scrub = { path, p, x0: e.clientX, v0: +cues.ev().value(path, playBeat(), p.default), moved: false, el: l }; });
  root.addEventListener('pointermove', (e) => { if (!scrub) return; const dx = e.clientX - scrub.x0; if (!scrub.moved && Math.abs(dx) < 3) return; if (!scrub.moved) { scrub.moved = true; cues.begin(); document.body.classList.add('scrubbing'); }
    const p = scrub.p, step = p.step || 0.01, v = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, Math.round((scrub.v0 + dx * step * (e.shiftKey ? 10 : 1)) / step) * step)); selfEdit = true; app.actions.setProp(scrub.path, +v.toFixed(6), true); selfEdit = false;
    const inp = scrub.el.closest('.prop').querySelector('input[type="number"]'); if (inp) inp.value = fmtNum(v, step); });
  const endScrub = () => { if (!scrub) return; const s = scrub; scrub = null; document.body.classList.remove('scrubbing'); if (s.moved) { cues.commit('scrub ' + s.path); render(); } };
  root.addEventListener('pointerup', endScrub); root.addEventListener('pointercancel', endScrub);
  cues.subscribe((why) => { if (selfEdit || why === 'preview' || why === 'saved' || scrub) return; if (!root.contains(document.activeElement) || why === 'undo' || why === 'redo') render(); });
  let lastB = -1, lastT = 0, lastV = '';
  return {
    show: render,
    /** Refresh values and the mini strips while the playhead or the timeline view moves (not while typing or scrubbing). */
    tick() { if (root.dataset.mode !== 'element') return; const b = playBeat(), now = performance.now(), V = tl().view(), vk = `${V.a.toFixed(3)}|${V.z.toFixed(3)}`;
      if ((Math.abs(b - lastB) > 1e-6 || vk !== lastV) && now - lastT > (app.clock.playing ? 300 : 60) && !root.contains(document.activeElement) && !scrub) { lastB = b; lastT = now; lastV = vk; render(); } },
    showTrack(path) { const p = reg().byPath[path]; if (p) { element = p.element; open[element] = true; if (!tl().selected().length) render(); } },
    showElement(id) { element = id; open[id] = true; tl().clearSel(); render(); },
    focusValue() { const el = root.querySelector('[data-k="v"]'); if (el) el.focus(); },
    get element() { return element; },
  };
}
