// Panel bindings: Beat, Style, FX, Text (editable printed lines + caption builder) tabs, the home fields, tabs, credits.
import { CREDITS } from '../lib/cdn.js';
import { KEYS_24 } from '../overlays/text.js';
import { LINE_IDS, LINE_LABELS } from '../state.js';
import { buildCaptions, DEFAULT_FORMAT } from '../export/captions.js';
import { saveFile } from '../export/save.js';
import { slug } from '../util/draw.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const nest = (path, v) => path.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), v);
const getp = (o, path) => path.split('.').reduce((a, k) => a && a[k], o);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function createPanels(app) {
  const P = () => app.store.project, set = (path, v) => app.store.set({ project: nest(path, v) });
  const fmt = { pct: v => Math.round(v * 100) + '%', x: v => (+v).toFixed(2) + '×', n: v => (+v).toFixed(2), s: v => v + 's', i100: v => Math.round(v * 100) };
  const ranges = [['chX', 'chains.x', 'n'], ['chY', 'chains.y', 'n'], ['chS', 'chains.s', 'x'], ['elX', 'eleph.x', 'n'], ['elS', 'eleph.s', 'x'], ['elL', 'eleph.len', 'n'], ['elSw', 'eleph.swing', 'i100'],
    ['fGrain', 'finish.grain', 'pct'], ['fInt', 'finish.intensity', 'x'], ['fxAmt', 'fx.amount', 'pct'], ['fxCrt', 'fx.crt', 'pct'], ['fxRgb', 'fx.rgb', 'pct'], ['fxBloom', 'fx.bloom', 'pct'], ['fxShock', 'fx.shock', 'pct'], ['vtEvery', 'export.voiceEvery', 's']];
  const checks = [['chOn', 'chains.on'], ['elOn', 'eleph.on'], ['fZoom', 'finish.zoom'], ['fxOn', 'fx.on'], ['exLoop', 'export.loopSafe'], ['exDraft', 'export.draft'], ['vtOn', 'export.voiceTag']];
  const texts = [['wA', 'text.artistA'], ['wB', 'text.artistB'], ['wPrice', 'text.price'], ['wLink', 'text.link'], ['capFmt', 'text.titleFormat'],
    ['fTag', 'text.lines.tag.text'], ['fKey', 'text.lines.key.text'], ['sKey', 'text.lines.key.text'], ['fTitle', 'text.lines.title.text'], ['projTitle', 'text.lines.title.text']];
  ranges.forEach(([id, path, f]) => { const el = $('#' + id); el.addEventListener('input', () => { set(path, +el.value); el.nextElementSibling.textContent = fmt[f](+el.value); }); });
  checks.forEach(([id, path]) => $('#' + id).addEventListener('change', e => { set(path, e.target.checked); if (/export/.test(path)) app.actions.exportInfo(); }));
  texts.forEach(([id, path]) => $('#' + id).addEventListener('input', e => { set(path, e.target.value); app.actions.textChanged(); syncText(); }));
  // glitch: its own 0-100 amount and trigger, separate from the master FX amount
  const gl = $('#fxGlitch'); gl.addEventListener('input', () => { set('fx.glitch', +gl.value / 100); gl.nextElementSibling.textContent = gl.value; });
  $('#fxGlitchOn').addEventListener('change', e => set('fx.glitchOn', e.target.value));
  $('#chC').addEventListener('change', e => set('chains.cycle', e.target.value === 'auto' ? 'auto' : +e.target.value));
  const segs = [['exFps', 'export.fps', Number], ['exMbps', 'export.mbps', Number], ['exLufs', 'export.loudness', v => v === 'off' ? 'off' : +v]];
  segs.forEach(([id, path, parse]) => $$('#' + id + ' button').forEach(b => b.addEventListener('click', () => { set(path, parse(b.dataset.v)); sync(); app.actions.exportInfo(); })));
  // ---- Text panel: every printed line, editable + toggleable, with font / size / position / case / colour
  const box = $('#textLines'), keyOpts = KEYS_24.map(k => `<option>${k}</option>`).join('');
  box.innerHTML = LINE_IDS.map(id => `<div class="tline" data-line="${id}">
    <div class="group-h"><label class="tog"><input type="checkbox" data-f="on"> ${LINE_LABELS[id]}</label><span class="hint">${id === 'bpm' ? '{bpm} = detected' : id === 'key' ? 'picker or free text' : ''}</span></div>
    <div class="inrow">${id === 'key' ? `<select class="inp mono" data-f="keypick" aria-label="Key"><option value="">free text…</option>${keyOpts}</select>` : ''}<input class="inp${id === 'bpm' || id === 'key' ? ' mono' : ''}" data-f="text" aria-label="${LINE_LABELS[id]} text" style="flex:1;min-width:0"></div>
    <div class="tstyle">
      <select class="inp mono" data-f="font" aria-label="Font"><option value="sans">sans</option><option value="mono">mono</option><option value="serif">serif italic</option></select>
      <select class="inp mono" data-f="pos" aria-label="Position"><option value="auto">auto</option><option value="top">top</option><option value="centre">centre</option><option value="bottom">bottom</option><option value="free">dragged</option></select>
      <select class="inp mono" data-f="case" aria-label="Case"><option value="upper">UPPER</option><option value="as">As typed</option><option value="title">Title</option><option value="lower">lower</option></select>
      <select class="inp mono" data-f="color" aria-label="Colour"><option value="main">main</option><option value="hi">highlight</option><option value="accent">accent</option><option value="text">text</option><option value="dim">dim</option></select>
      <input type="range" data-f="size" min="0.5" max="2.2" step="0.05" aria-label="Size">
    </div></div>`).join('');
  box.addEventListener('input', e => { const el = e.target, row = el.closest('.tline'); if (!row) return; const id = row.dataset.line, f = el.dataset.f;
    if (f === 'keypick') { if (el.value) { set(`text.lines.${id}.text`, el.value); syncText(); } }
    else if (f === 'on') set(`text.lines.${id}.on`, el.checked);
    else if (f === 'size') set(`text.lines.${id}.size`, +el.value);
    else set(`text.lines.${id}.${f}`, el.value);
    if (f === 'text' && id === 'key') row.querySelector('[data-f=keypick]').value = KEYS_24.includes(el.value) ? el.value : '';
    app.actions.textChanged(); });
  function syncText() { const L = P().text.lines;
    $$('.tline').forEach(row => { const l = L[row.dataset.line]; if (!l) return;
      for (const el of row.querySelectorAll('[data-f]')) { const f = el.dataset.f; if (document.activeElement === el) continue;
        if (f === 'on') el.checked = !!l.on; else if (f === 'keypick') el.value = KEYS_24.includes(l.text) ? l.text : ''; else el.value = l[f] ?? ''; } });
    ['fTitle', 'projTitle'].forEach(id => { const el = $('#' + id); if (document.activeElement !== el) el.value = L.title.text; }); }
  // BPM / grid
  ['fBpm', 'sBpm'].forEach(id => $('#' + id).addEventListener('change', e => app.actions.setBpm(+e.target.value)));
  $$('[data-bpm]').forEach(b => b.addEventListener('click', () => { const tr = app.store.session.track; if (tr) app.actions.setBpm(tr.bpm * +b.dataset.bpm); }));
  let taps = []; $('#tapBtn').addEventListener('click', () => { const n = performance.now(); taps = taps.filter(x => n - x < 3000); taps.push(n); if (taps.length >= 4) app.actions.setBpm(Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)) * 10) / 10); });
  $$('[data-nudge]').forEach(b => b.addEventListener('click', () => { const tr = app.store.session.track; if (!tr) return; const d = { '-b': -tr.spb, '+b': tr.spb, '-ms': -.01, '+ms': .01 }[b.dataset.nudge]; app.actions.regrid(tr.bpm, tr.t0 + d); }));
  // tabs
  const tabs = $$('.tabs [role=tab]'); tabs.forEach((b, i) => b.addEventListener('click', () => { tabs.forEach(x => x.setAttribute('aria-selected', x === b)); $$('.pane').forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
    app.motion.underline($('#tabUl'), i); app.motion.paneIn($(`.pane[data-pane="${b.dataset.tab}"]`)); if (b.dataset.tab === 'text') { captions(); syncText(); } if (b.dataset.tab === 'export') app.actions.exportInfo(); if (b.dataset.tab === 'look') app.studio.thumbs(); }));
  app.motion.underline($('#tabUl'), 1);
  // credits
  $('#creditList').innerHTML = CREDITS.map(c => `<li><b>${c.name}</b><span>${c.use} · ${c.licence} · <a href="${c.url}" target="_blank" rel="noopener">source</a></span></li>`).join('');
  $('#creditsBtn').addEventListener('click', e => { const pop = $('#credits'), open = pop.hidden; pop.hidden = !open; e.currentTarget.setAttribute('aria-expanded', open); if (open) app.motion.viewIn(pop); });
  document.addEventListener('click', e => { if (!e.target.closest('#credits,#creditsBtn')) { $('#credits').hidden = true; $('#creditsBtn').setAttribute('aria-expanded', 'false'); } });
  // caption builder
  function captions() { const tr = app.store.session.track; if (!tr) return; const c = buildCaptions(P().text, tr.bpm, P().text.titleFormat || DEFAULT_FORMAT); $('#capOut').value = c.txt; $('#capInfo').textContent = `title ${c.titleLen} chars${c.titleLen > 70 ? ' · keep the key phrase in the first 60-70' : ''}`; return c; }
  $('#capCopy').addEventListener('click', () => { const v = $('#capOut').value; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => { $('#capInfo').textContent = 'Copied.'; }).catch(() => { $('#capOut').select(); $('#capInfo').textContent = 'Selected: press Ctrl/Cmd+C.'; }); });
  $('#capSave').addEventListener('click', async () => { const c = captions(); if (c) { const r = await saveFile(new Blob([c.txt], { type: 'text/plain' }), slug(P().text.lines.title.text) + '_captions.txt'); $('#capInfo').textContent = r === 'declined' ? 'Save cancelled.' : 'Saved captions .txt'; } });
  function sync() { const p = P();
    ranges.forEach(([id, path, f]) => { const el = $('#' + id), v = getp(p, path); if (v != null) { el.value = v; el.nextElementSibling.textContent = fmt[f](v); } });
    gl.value = Math.round(p.fx.glitch * 100); gl.nextElementSibling.textContent = gl.value; $('#fxGlitchOn').value = p.fx.glitchOn || 'kicks';
    checks.forEach(([id, path]) => { $('#' + id).checked = !!getp(p, path); });
    texts.forEach(([id, path]) => { const el = $('#' + id); if (document.activeElement !== el) el.value = getp(p, path) ?? (path === 'text.titleFormat' ? DEFAULT_FORMAT : ''); });
    $('#chC').value = String(p.chains.cycle); syncText();
    segs.forEach(([id, path]) => { const v = String(getp(p, path)); $$('#' + id + ' button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); });
    const tr = app.store.session.track; if (tr) { ['fBpm', 'sBpm'].forEach(id => { if (document.activeElement !== $('#' + id)) $('#' + id).value = Math.round(tr.bpm * 10) / 10; }); $('#bpmSrc').textContent = '· ' + tr.bpmSource;
      $('#gridInfo').textContent = `${Math.round(tr.bpm * 100) / 100} BPM · downbeat ${tr.t0.toFixed(3)} s · bar ${tr.barDur.toFixed(3)} s`;
      $('#anaKv').innerHTML = `<dt>Detected BPM</dt><dd>${tr.bpmDetected}</dd><dt>Key</dt><dd>${esc(tr.key)}</dd><dt>Kicks · snares · hats</dt><dd>${tr.kicks.t.length} · ${tr.snares.t.length} · ${tr.hats.t.length}</dd><dt>Drops</dt><dd>${tr.drops.length ? [...tr.drops].map(d => d.toFixed(1) + 's').join(', ') : 'none found'}</dd><dt>Analysis</dt><dd>${tr.meta.quick ? 'quick pass (refining…)' : 'full · ' + tr.frames + ' frames'}</dd>`; } }
  return { sync, syncText, captions };
}
