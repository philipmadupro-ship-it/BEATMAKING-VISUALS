// Panel bindings: Beat, Style, FX, Text (+ caption builder) tabs, the home fields, tabs and credits.
import { CREDITS } from '../lib/cdn.js';
import { TEXT_PRESETS } from '../overlays/text.js';
import { buildCaptions, DEFAULT_FORMAT } from '../export/captions.js';
import { saveFile } from '../export/save.js';
import { slug } from '../util/draw.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const nest = (path, v) => path.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), v);
const getp = (o, path) => path.split('.').reduce((a, k) => a && a[k], o);
export function createPanels(app) {
  const P = () => app.store.project, set = (path, v) => app.store.set({ project: nest(path, v) });
  const fmt = { pct: v => Math.round(v * 100) + '%', x: v => (+v).toFixed(2) + '×', n: v => (+v).toFixed(2), s: v => v + 's' };
  const ranges = [['chX', 'chains.x', 'n'], ['chY', 'chains.y', 'n'], ['chS', 'chains.s', 'x'], ['elX', 'eleph.x', 'n'], ['elS', 'eleph.s', 'x'], ['elL', 'eleph.len', 'n'],
    ['fGrain', 'finish.grain', 'pct'], ['fInt', 'finish.intensity', 'x'], ['fxCrt', 'fx.crt', 'pct'], ['fxRgb', 'fx.rgb', 'pct'], ['fxGlitch', 'fx.glitch', 'pct'], ['fxBloom', 'fx.bloom', 'pct'], ['fxShock', 'fx.shock', 'pct'], ['fxShatter', 'fx.shatter', 'pct'], ['vtEvery', 'export.voiceEvery', 's']];
  const checks = [['chOn', 'chains.on'], ['elOn', 'eleph.on'], ['fZoom', 'finish.zoom'], ['fxOn', 'fx.on'], ['wTitleOn', 'text.showTitle'], ['wBpmOn', 'text.showBpm'], ['wTagOn', 'text.showTag'], ['wHandleOn', 'text.showHandle'], ['exLoop', 'export.loopSafe'], ['vtOn', 'export.voiceTag']];
  const texts = [['wTag', 'text.tag'], ['fTag', 'text.tag'], ['wHandle', 'text.handle'], ['wA', 'text.artistA'], ['wB', 'text.artistB'], ['wPrice', 'text.price'], ['wLink', 'text.link'], ['fKey', 'text.key'], ['sKey', 'text.key'], ['capFmt', 'text.titleFormat']];
  ranges.forEach(([id, path, f]) => { const el = $('#' + id); el.addEventListener('input', () => { set(path, +el.value); el.nextElementSibling.textContent = fmt[f](+el.value); }); });
  checks.forEach(([id, path]) => $('#' + id).addEventListener('change', e => set(path, e.target.checked)));
  texts.forEach(([id, path]) => $('#' + id).addEventListener('input', e => { set(path, e.target.value); app.actions.textChanged(); }));
  ['fTitle', 'wTitle', 'projTitle'].forEach(id => $('#' + id).addEventListener('input', e => { set('text.title', e.target.value); app.actions.textChanged(); }));
  $('#chC').addEventListener('change', e => set('chains.cycle', e.target.value === 'auto' ? 'auto' : +e.target.value));
  const sel = $('#wPreset'); sel.innerHTML = Object.entries(TEXT_PRESETS).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); sel.addEventListener('change', e => { set('text.preset', e.target.value); app.actions.textChanged(); });
  const segs = [['exFps', 'export.fps', Number], ['exMbps', 'export.mbps', Number], ['exLufs', 'export.loudness', v => v === 'off' ? 'off' : +v]];
  segs.forEach(([id, path, parse]) => $$('#' + id + ' button').forEach(b => b.addEventListener('click', () => { set(path, parse(b.dataset.v)); sync(); app.actions.exportInfo(); })));
  // BPM / grid
  ['fBpm', 'sBpm'].forEach(id => $('#' + id).addEventListener('change', e => app.actions.setBpm(+e.target.value)));
  $$('[data-bpm]').forEach(b => b.addEventListener('click', () => { const tr = app.store.session.track; if (tr) app.actions.setBpm(tr.bpm * +b.dataset.bpm); }));
  let taps = []; $('#tapBtn').addEventListener('click', () => { const n = performance.now(); taps = taps.filter(x => n - x < 3000); taps.push(n); if (taps.length >= 4) app.actions.setBpm(Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)) * 10) / 10); });
  $$('[data-nudge]').forEach(b => b.addEventListener('click', () => { const tr = app.store.session.track; if (!tr) return; const d = { '-b': -tr.spb, '+b': tr.spb, '-ms': -.01, '+ms': .01 }[b.dataset.nudge]; app.actions.regrid(tr.bpm, tr.t0 + d); }));
  // tabs
  const tabs = $$('.tabs [role=tab]'); tabs.forEach((b, i) => b.addEventListener('click', () => { tabs.forEach(x => x.setAttribute('aria-selected', x === b)); $$('.pane').forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
    app.motion.underline($('#tabUl'), i); app.motion.paneIn($(`.pane[data-pane="${b.dataset.tab}"]`)); if (b.dataset.tab === 'text') captions(); if (b.dataset.tab === 'export') app.actions.exportInfo(); if (b.dataset.tab === 'look') app.studio.thumbs(); }));
  app.motion.underline($('#tabUl'), 1);
  // credits
  $('#creditList').innerHTML = CREDITS.map(c => `<li><b>${c.name}</b><span>${c.use} · ${c.licence} · <a href="${c.url}" target="_blank" rel="noopener">source</a></span></li>`).join('');
  $('#creditsBtn').addEventListener('click', e => { const pop = $('#credits'), open = pop.hidden; pop.hidden = !open; e.currentTarget.setAttribute('aria-expanded', open); if (open) app.motion.viewIn(pop); });
  document.addEventListener('click', e => { if (!e.target.closest('#credits,#creditsBtn')) { $('#credits').hidden = true; $('#creditsBtn').setAttribute('aria-expanded', 'false'); } });
  // caption builder
  function captions() { const tr = app.store.session.track; if (!tr) return; const c = buildCaptions(P().text, tr.bpm, P().text.titleFormat || DEFAULT_FORMAT); $('#capOut').value = c.txt; $('#capInfo').textContent = `title ${c.titleLen} chars${c.titleLen > 70 ? ' · keep the key phrase in the first 60-70' : ''}`; return c; }
  $('#capCopy').addEventListener('click', () => { const v = $('#capOut').value; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => { $('#capInfo').textContent = 'Copied.'; }).catch(() => { $('#capOut').select(); $('#capInfo').textContent = 'Selected: press Ctrl/Cmd+C.'; }); });
  $('#capSave').addEventListener('click', async () => { const c = captions(); if (c) { const r = await saveFile(new Blob([c.txt], { type: 'text/plain' }), slug(P().text.title) + '_captions.txt'); $('#capInfo').textContent = r === 'declined' ? 'Save cancelled.' : 'Saved captions .txt'; } });
  function sync() { const p = P();
    ranges.forEach(([id, path, f]) => { const el = $('#' + id), v = getp(p, path); if (v != null) { el.value = v; el.nextElementSibling.textContent = fmt[f](v); } });
    checks.forEach(([id, path]) => { $('#' + id).checked = !!getp(p, path); });
    texts.forEach(([id, path]) => { const el = $('#' + id); if (document.activeElement !== el) el.value = getp(p, path) ?? (path === 'text.titleFormat' ? DEFAULT_FORMAT : ''); });
    ['fTitle', 'wTitle', 'projTitle'].forEach(id => { const el = $('#' + id); if (document.activeElement !== el) el.value = p.text.title; });
    $('#chC').value = String(p.chains.cycle); sel.value = p.text.preset;
    segs.forEach(([id, path]) => { const v = String(getp(p, path)); $$('#' + id + ' button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); });
    const tr = app.store.session.track; if (tr) { ['fBpm', 'sBpm'].forEach(id => { if (document.activeElement !== $('#' + id)) $('#' + id).value = Math.round(tr.bpm * 10) / 10; }); $('#bpmSrc').textContent = '· ' + tr.bpmSource;
      $('#gridInfo').textContent = `${Math.round(tr.bpm * 100) / 100} BPM · downbeat ${tr.t0.toFixed(3)} s · bar ${tr.barDur.toFixed(3)} s`;
      $('#anaKv').innerHTML = `<dt>Detected BPM</dt><dd>${tr.bpmDetected}</dd><dt>Key</dt><dd>${tr.key}</dd><dt>Kicks · snares · hats</dt><dd>${tr.kicks.t.length} · ${tr.snares.t.length} · ${tr.hats.t.length}</dd><dt>Drops</dt><dd>${tr.drops.length ? [...tr.drops].map(d => d.toFixed(1) + 's').join(', ') : 'none found'}</dd><dt>Analysis</dt><dd>${tr.meta.quick ? 'quick pass (refining…)' : 'full · ' + tr.frames + ' frames'}</dd>`; } }
  return { sync, captions };
}
