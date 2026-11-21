// Panel bindings: tabs, Look (look cards rendered at the playhead, stages, cue presets), Text (every tag + caption
// builder), Beat (grid, key, sections, analysis), home fields, credits.
import { CREDITS } from '../lib/cdn.js';
import { buildCaptions, DEFAULT_FORMAT } from '../export/captions.js';
import { saveFile } from '../export/save.js';
import { slug } from '../util/draw.js';
import { LOOKS, LOOK_NAMES, LOOK_BLURB, ASPECTS } from '../v8/layout.js';
import { STAGES, STAGE_IDS } from '../v8/core.js';
import { PRESETS } from '../cues/generate.js';
import { flattenTags, mergeDeep } from '../cues/schema.js';
import { DEFAULT_TAGS } from '../v8/tags.js';
import { makeSurface } from '../engine/render.js';
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const nest = (path, v) => path.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), v);
const getp = (o, path) => path.split('.').reduce((a, k) => a && a[k], o);

export function createPanels(app) {
  const P = () => app.store.project, set = (path, v) => app.store.set({ project: nest(path, v) });
  // ---- tabs (WAI-ARIA, roving tabindex)
  const tabs = $$('.tabs [role=tab]');
  tabs.forEach((b, i) => b.addEventListener('click', () => { tabs.forEach((x) => x.setAttribute('aria-selected', x === b)); $$('.pane').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
    app.motion.underline($('#tabUl'), i); const t = b.dataset.tab; if (t === 'text') { tagList(); captions(); } if (t === 'export') app.exporter.info(); if (t === 'look') looks(); if (t === 'inspect') app.inspector.show(); rove(); }));
  const rove = () => tabs.forEach((t) => (t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1)); rove();
  $('.tabs').addEventListener('keydown', (e) => { const i = tabs.indexOf(document.activeElement); if (i < 0) return; let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = tabs.length - 1;
    if (j != null) { e.preventDefault(); tabs[j].click(); tabs[j].focus(); } });
  app.motion.underline($('#tabUl'), 0);
  // ---- Look tab
  function looks() {
    const tr = app.store.session.track, box = $('#lookGrid'), p = P(); box.innerHTML = '';
    const { W, H } = ASPECTS[p.aspect], cw = p.aspect === '916' ? 108 : 160, ch = Math.round(cw * H / W), s2 = makeSurface(cw * 2, ch * 2), t = app.clock.time();
    for (const id of LOOKS) { const b = document.createElement('button'); b.className = 'lk'; b.setAttribute('aria-pressed', id === p.look); b.setAttribute('aria-label', `${LOOK_NAMES[id]} look`);
      b.innerHTML = `<canvas width="${cw}" height="${ch}"></canvas><b>${LOOK_NAMES[id]}</b><span>${LOOK_BLURB[id]}</span>`; b.onclick = () => { app.actions.setLook(id); looks(); }; box.appendChild(b);
      if (tr) { const sheet = JSON.parse(JSON.stringify(app.cues.sheet)), lk = sheet.tracks.find((x) => x.path === 'look'); if (lk) lk.keys = [{ id: 'x', b: 0, v: id, ease: 'step' }]; sheet.base.look = id;
        app.renderFrame(t, s2, { ...p, look: id }, tr, { sheet, target: b.querySelector('canvas').getContext('2d') }); } }
    const sg = $('#stageGrid'); sg.innerHTML = STAGE_IDS.map((id) => { const S = STAGES[id]; return `<button class="stg" data-stage="${id}" aria-pressed="${id === p.stage}"><i style="background:linear-gradient(135deg,${S.inverse ? S.ink : S.bg} 0 50%,${S.inverse ? S.bg : S.grey ? S.ink : S.hot} 50%)"></i><div>${S.label || S.name}<span>${{ white: 'inverted: white, dark ink', nigredo: 'black, white, greys', albedo: 'bone + iron oxide', citrinitas: 'tobacco + ochre', rubedo: 'violet + magenta' }[id]}</span></div></button>`; }).join('');
    sg.querySelectorAll('.stg').forEach((b) => (b.onclick = () => { app.actions.setStage(b.dataset.stage); looks(); }));
    const pl = $('#presetList'), cur = app.cues.sheet.meta.preset || 'default';
    pl.innerHTML = Object.entries(PRESETS).map(([k, v]) => `<button class="preset" data-preset="${k}" aria-pressed="${k === cur}"><b>${v.name}</b><span>${v.blurb}</span></button>`).join('');
    pl.querySelectorAll('.preset').forEach((b) => (b.onclick = () => { app.actions.applyPreset(b.dataset.preset); looks(); }));
  }
  $('#regenBtn').onclick = () => { app.actions.applyPreset(app.cues.sheet.meta.preset || 'default'); looks(); };
  // ---- Text tab: every tag leaf (deep-merged doc), edited live, one undo step per field
  function tagList() {
    const merged = flattenTags(mergeDeep(DEFAULT_TAGS, app.cues.sheet.tags)), def = flattenTags(DEFAULT_TAGS), f = ($('#tagFilter').value || '').toLowerCase();
    $('#tagList').innerHTML = Object.entries(merged).filter(([k, v]) => !f || k.toLowerCase().includes(f) || String(v).toLowerCase().includes(f))
      .map(([k, v]) => `<label class="tagrow${def[k] !== v ? ' changed' : ''}"><code>${esc(k)}</code><input class="inp mono" data-tag="${esc(k)}" value="${esc(v)}"></label>`).join('');
  }
  $('#tagFilter').addEventListener('input', tagList);
  const setTag = (s, path, v) => { const parts = path.split('.'), base = flattenTags(DEFAULT_TAGS); let o = s.tags; const isArr = (p) => Array.isArray(getp(DEFAULT_TAGS, p));
    for (let i = 0; i < parts.length - 1; i++) { const pre = parts.slice(0, i + 1).join('.'); if (o[parts[i]] == null) o[parts[i]] = isArr(pre) ? [...getp(DEFAULT_TAGS, pre)] : {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = v; void base; };
  $('#tagList').addEventListener('focusin', (e) => { if (e.target.dataset.tag) app.cues.begin(); });
  $('#tagList').addEventListener('input', (e) => { const el = e.target; if (el.dataset.tag) app.cues.preview((s) => setTag(s, el.dataset.tag, el.value)); });
  $('#tagList').addEventListener('focusout', (e) => { if (e.target.dataset.tag) app.cues.commit('tag'); });
  // ---- caption builder + text fields
  const texts = [['wA', 'text.artistA'], ['wB', 'text.artistB'], ['wPrice', 'text.price'], ['wLink', 'text.link'], ['capFmt', 'text.titleFormat'], ['fTag', 'producer'], ['fTitle', 'title'], ['projTitle', 'title']];
  texts.forEach(([id, path]) => $('#' + id).addEventListener('input', (e) => { set(path, e.target.value); captions(); if (path === 'title') { ['fTitle', 'projTitle'].forEach((x) => { if (x !== id) $('#' + x).value = e.target.value; }); app.actions.syncCues && app.studio.markDirty(); } }));
  $('#projTitle').addEventListener('change', () => { app.clip.clear(); app.actions.syncCues(); app.studio.markDirty(); });
  $('#fTitle').addEventListener('change', () => { app.clip.clear(); app.grid.refresh(); });
  ['fKey', 'sKey'].forEach((id) => $('#' + id).addEventListener('change', (e) => { set('key', e.target.value.trim()); app.clip.clear(); app.actions.syncCues(); sync(); app.studio.markDirty(); }));
  function captions() { const tr = app.store.session.track; if (!tr) return null; const p = P(); const text = { ...p.text, lines: { title: { text: p.title }, key: { text: p.key || tr.key }, tag: { text: 'prod. ' + p.producer }, handle: { text: p.producer } } };
    const c = buildCaptions(text, tr.bpm, p.text.titleFormat || DEFAULT_FORMAT); $('#capOut').value = c.txt; $('#capInfo').textContent = `title ${c.titleLen} chars${c.titleLen > 70 ? ' · keep the key phrase in the first 60-70' : ''}`; return c; }
  $('#capCopy').addEventListener('click', () => { const v = $('#capOut').value; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => { $('#capInfo').textContent = 'Copied.'; }).catch(() => { $('#capOut').select(); $('#capInfo').textContent = 'Selected: press Ctrl/Cmd+C.'; }); });
  $('#capSave').addEventListener('click', async () => { const c = captions(); if (c) { const r = await saveFile(new Blob([c.txt], { type: 'text/plain' }), slug(P().title) + '_captions.txt'); $('#capInfo').textContent = r === 'declined' ? 'Save cancelled.' : 'Saved captions .txt'; } });
  // ---- Beat tab
  ['fBpm', 'sBpm'].forEach((id) => $('#' + id).addEventListener('change', (e) => app.actions.setBpm(+e.target.value)));
  $$('[data-bpm]').forEach((b) => b.addEventListener('click', () => { const tr = app.store.session.track; if (tr) app.actions.setBpm(tr.bpm * +b.dataset.bpm); }));
  let taps = []; $('#tapBtn').addEventListener('click', () => { const n = performance.now(); taps = taps.filter((x) => n - x < 3000); taps.push(n); if (taps.length >= 4) app.actions.setBpm(Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)) * 100) / 100); });
  $$('[data-nudge]').forEach((b) => b.addEventListener('click', () => { const tr = app.store.session.track; if (!tr) return; const d = { '-b': -tr.spb, '+b': tr.spb, '-ms': -.01, '+ms': .01 }[b.dataset.nudge]; app.actions.regrid(tr.bpm, tr.t0 + d); }));
  // ---- export segs + toggles
  const segs = [['exFps', 'export.fps', Number], ['exMbps', 'export.mbps', Number], ['exLufs', 'export.loudness', (v) => (v === 'off' ? 'off' : +v)]];
  segs.forEach(([id, path, parse]) => $$('#' + id + ' button').forEach((b) => b.addEventListener('click', () => { set(path, parse(b.dataset.v)); if (path === 'export.loudness') app.clip.clear(); sync(); app.exporter.info(); app.studio.markDirty(); })));
  [['exLoop', 'export.loopSafe'], ['exDraft', 'export.draft'], ['vtOn', 'export.voiceTag'], ['exBoth', 'export.both'], ['exBlur', 'export.mblur']].forEach(([id, path]) => $('#' + id).addEventListener('change', (e) => { set(path, e.target.checked); app.exporter.info(); }));
  // Seamless loop = the outro.rewind cue property (the last bar rewinds into the intro) + the audio crossfade into bar 1
  const seamNow = () => { try { const R = app.registry(), d = R.byPath['outro.rewind']; return !!app.cues.ev().value('outro.rewind', app.cuetl ? app.cuetl.state.playhead : 0, d ? d.default : false); } catch (_) { return false; } };
  $('#exSeam').addEventListener('change', (e) => { app.actions.setProp('outro.rewind', e.target.checked); set('export.loopSafe', e.target.checked); $('#exLoop').checked = e.target.checked; app.exporter.info(); app.studio.markDirty(); });
  app.cues.subscribe(() => { const el = $('#exSeam'); if (el && document.activeElement !== el) el.checked = seamNow(); });
  $('#exShutter').addEventListener('input', (e) => { set('export.shutter', +e.target.value); e.target.nextElementSibling.textContent = (+e.target.value).toFixed(2); });
  $('#vtEvery').addEventListener('input', (e) => { set('export.voiceEvery', +e.target.value); e.target.nextElementSibling.textContent = e.target.value + 's'; });
  // ---- credits
  $('#creditList').innerHTML = CREDITS.map((c) => `<li><b>${c.name}</b><span>${c.use} · ${c.licence} · <a href="${c.url}" target="_blank" rel="noopener">source</a></span></li>`).join('');
  $('#creditsBtn').addEventListener('click', (e) => { const pop = $('#credits'), open = pop.hidden; pop.hidden = !open; e.currentTarget.setAttribute('aria-expanded', open); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#credits,#creditsBtn')) { $('#credits').hidden = true; $('#creditsBtn').setAttribute('aria-expanded', 'false'); } });
  function sync() {
    const p = P(), tr = app.store.session.track;
    texts.forEach(([id, path]) => { const el = $('#' + id); if (document.activeElement !== el) el.value = getp(p, path) ?? (path === 'text.titleFormat' ? DEFAULT_FORMAT : ''); });
    segs.forEach(([id, path]) => { const v = String(getp(p, path)); $$('#' + id + ' button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v)); });
    $('#exBlur').checked = p.export.mblur !== false; $('#exShutter').value = p.export.shutter ?? 0.5; $('#exShutter').nextElementSibling.textContent = (+(p.export.shutter ?? 0.5)).toFixed(2);
    $('#exBoth').checked = !!p.export.both; $('#exSeam').checked = seamNow(); $('#exBtn').textContent = p.export.both ? 'Export both formats' : 'Export MP4';
    $('#exLoop').checked = !!p.export.loopSafe; $('#exDraft').checked = !!p.export.draft; $('#vtOn').checked = !!p.export.voiceTag; $('#vtEvery').value = p.export.voiceEvery; $('#vtEvery').nextElementSibling.textContent = p.export.voiceEvery + 's';
    ['fKey', 'sKey'].forEach((id) => { const el = $('#' + id); if (document.activeElement !== el) { el.value = p.key; el.placeholder = tr ? 'detected ' + tr.key : 'detected'; } });
    if (tr) { ['fBpm', 'sBpm'].forEach((id) => { if (document.activeElement !== $('#' + id)) $('#' + id).value = Math.round(tr.bpm * 100) / 100; }); $('#bpmSrc').textContent = '· ' + tr.bpmSource;
      $('#gridInfo').textContent = `${Math.round(tr.bpm * 100) / 100} BPM · first downbeat ${tr.t0.toFixed(4)} s · song bar 1 at ${tr.song.bar1.toFixed(3)} s · bar ${tr.barDur.toFixed(3)} s`;
      const sb0 = Math.round((p.inT - tr.t0) / tr.barDur) - tr.song.startIdx + 1, sb1 = sb0 + Math.round((p.outT - p.inT) / tr.barDur) - 1;
      $('#sectionList').innerHTML = tr.song.phrases.map((q) => `<span class="sec${q.label === 'drop' ? ' drop' : ''}${q.bar + q.bars - 1 >= sb0 && q.bar <= sb1 ? ' in' : ''}" title="song bars ${q.bar}-${q.bar + q.bars - 1}">${q.bar} ${q.label}</span>`).join('');
      $('#anaKv').innerHTML = `<dt>Detected BPM</dt><dd>${tr.bpmDetected}</dd><dt>Key</dt><dd>${esc(tr.key)}</dd><dt>Kicks · snares · hats</dt><dd>${tr.kicks.t.length} · ${tr.snares.t.length} · ${tr.hats.t.length}</dd><dt>Song bar 1</dt><dd>${tr.song.bar1.toFixed(3)} s</dd><dt>Section</dt><dd>song bars ${sb0}-${sb1}</dd><dt>Analysis</dt><dd>${tr.meta.quick ? 'quick pass (refining…)' : 'full'}</dd>`; }
    if (!$('#pane-look').hidden) looks();
  }
  return { sync, captions, looks, tagList };
}
