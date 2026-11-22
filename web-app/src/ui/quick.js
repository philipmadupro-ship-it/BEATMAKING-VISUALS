// v22 TASK CONTROLS (Inspect tab, top) + FIRST-RUN COACH.
//   Someone new understands it in 2 seconds: controls grouped by task (Intro, Camera, Text, Colours, Export), each with a
//   plain-language label, its current value with the unit, and a one-line hint. They write the same cue paths and tags as the
//   inspector (a property with keys gets a key at the playhead, else its base value; one undo step per change). The full
//   inspector (every property, raw paths, key editing) sits under "Advanced"; it opens by itself when keys or a window are picked.
//   Coach: 3 steps (load a beat -> pick a look -> export) inline on the home screen and in the studio, ticked as you go,
//   dismissable, remembered (localStorage u2c.coach.v1).
// API: app.quick = { render(), set(id, v), value(id), rows(), advanced(open), coach: { step, done(), reset() } }.
import { STAGES, STAGE_IDS } from '../v8/core.js';
import { setTagIn } from './metadata.js';
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const getp = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
// control kinds: prop-num | prop-bool | prop-enum (seg) | prop-sel | prop-color | tag | proj | stage | aspect | len | seed | action
const G = [
  ['Intro', 'How the video opens', [
    { id: 'intro.style', k: 'seg', path: 'intro.style', label: 'Intro style', opts: [['sphere', 'Sphere'], ['flow', 'Flow']], hint: 'Sphere: the covers orbit on a spinning 3D sphere. Flow: a row of cards.' },
    { id: 'seed', k: 'seed', label: 'Variation', hint: 'Same variation = same video. A new one reshuffles the camera order, intro direction and hook.' },
    { id: 'export.preroll', k: 'projbool', path: 'export.preroll', label: 'Click-to-play intro', hint: 'A silent browse before the beat starts; the cursor clicks play.' },
    { id: 'cursor.on', k: 'bool', path: 'cursor.on', label: 'Mouse cursor', hint: 'A Y2K cursor clicks each window before the camera moves.' },
    { id: 'social.on', k: 'bool', path: 'social.on', label: 'Hook and pop-ups', hint: 'The hook dialog on frame 0 and the two call-to-action pop-ups.' }]],
  ['Camera', 'How the camera moves', [
    { id: 'fx.punch', k: 'num', path: 'fx.punch', label: 'Kick punch', unit: '%', scale: 100, dp: 1, hint: 'The camera pushes in on every kick. 0 = still.' },
    { id: 'camera.zoom', k: 'num', path: 'camera.zoom', label: 'Zoom on windows', unit: '×', dp: 2, hint: 'How close the camera gets when it visits a window.' },
    { id: 'focus.dim', k: 'num', path: 'focus.dim', label: 'Dim the background', unit: '%', scale: 100 / 1.6, dp: 0, hint: 'How dark the other windows get while one is in front.' },
    { id: 'outro.rewind', k: 'bool', path: 'outro.rewind', label: 'Seamless loop', hint: 'The ending flows back into the first frame, so the video loops.' }]],
  ['Text', 'Every word on screen', [
    { id: 'title', k: 'proj', path: 'title', label: 'Beat title', hint: 'Used in the top bar, now playing and {title}.' },
    { id: 'producer', k: 'tag', path: 'producer', label: 'Producer tag', hint: 'Shown as PROD. … on the hero and the metadata.' },
    { id: 'social.hook', k: 'tag', path: 'social.hook', label: 'Hook (frame 0)', hint: 'The first thing people read, sound off.' },
    { id: 'social.cta1.body', k: 'tag', path: 'social.cta1.body', label: 'Pop-up 1', hint: 'First call to action.' },
    { id: 'social.cta2.body', k: 'tag', path: 'social.cta2.body', label: 'Pop-up 2', hint: 'Second call to action.' },
    { id: 'social.terminal.0', k: 'tag', path: 'social.terminal.0', label: 'Terminal line 1', hint: 'Types in and deletes like a terminal. {titleWord}, {bpm}, {key} are filled in.' },
    { id: 'social.terminal.1', k: 'tag', path: 'social.terminal.1', label: 'Terminal line 2', hint: '' },
    { id: 'social.terminal.2', k: 'tag', path: 'social.terminal.2', label: 'Terminal line 3', hint: '' },
    { id: 'social.terminal.3', k: 'tag', path: 'social.terminal.3', label: 'Terminal line 4', hint: '' },
    { id: 'social.outro.title', k: 'tag', path: 'social.outro.title', label: 'Outro dialog title', hint: 'The window that closes at the end.' },
    { id: 'social.outro.body', k: 'tag', path: 'social.outro.body', label: 'Outro dialog text', hint: '' },
    { id: 'social.outro.sub', k: 'tag', path: 'social.outro.sub', label: 'Outro small print', hint: '' },
    { id: 'words', k: 'action', label: 'All other words', btn: 'Open Meta → every word', hint: 'Search and edit every text in the video.' }]],
  ['Colours', 'The stage and its accents', [
    { id: 'stage', k: 'stage', label: 'Stage', hint: 'A condition, not a recolour: Nigredo black, White inverse, Albedo, Citrinitas, Rubedo.' },
    { id: 'hero.fry', k: 'sel', path: 'hero.fry', label: 'Cover look', opts: [['none', 'Clean'], ['negative', 'Negative'], ['thermal', 'Thermal'], ['night', 'Night vision'], ['stage', 'Stage colours']], hint: 'How the beat cover is deep-fried on the hero.' },
    { id: 'scan.color', k: 'color', path: 'scan.color', label: 'Detection boxes', hint: 'The boxes that track the hero cover.' },
    { id: 'meter.session.low', k: 'color', path: 'meter.session.low', label: 'Waveform low', hint: 'Kick and 808 (20-150 Hz).' },
    { id: 'meter.session.mid', k: 'color', path: 'meter.session.mid', label: 'Waveform mid', hint: 'Snare and vocals (150 Hz-2 kHz).' },
    { id: 'meter.session.high', k: 'color', path: 'meter.session.high', label: 'Waveform high', hint: 'Hats and air (2-20 kHz).' }]],
  ['Export', 'What you deliver', [
    { id: 'aspect', k: 'aspect', label: 'Format', hint: '9:16 for TikTok, Reels and Shorts; 16:9 for YouTube.' },
    { id: 'len', k: 'len', label: 'Length', hint: 'Picks the best section of the beat (the first drop).' },
    { id: 'export', k: 'action', label: 'Render', btn: 'Go to Export', hint: 'Review, the export queue and the MP4.' }]],
];
const COACH = [['Load a beat', 'Drop a WAV or MP3 (or keep the demo). BPM, key and sections are found for you.'], ['Pick a look', 'Click a look card: it opens the editor with your beat.'], ['Export', 'Check the Review, then Export MP4 (or queue TikTok, Reels and YouTube).']];

export function createQuick(app) {
  const root = $('#quick'), adv = $('#advInsp'), P = () => app.store.project, tl = () => app.cuetl;
  const reg = () => { try { return app.registry().byPath; } catch { return {}; } };
  const pb = () => (tl() ? tl().state.playhead : 0);
  const pv = (path) => { const p = reg()[path]; return app.cues.ev().value(path, pb(), p ? p.default : undefined); };
  const tagv = (path) => getp(app.cues.tags(''), path);
  const open = (() => { try { return JSON.parse(localStorage.getItem('u2c.quick.open')) || { Intro: true, Text: true }; } catch { return { Intro: true, Text: true }; } })();
  function value(id) { const c = G.flatMap((g) => g[2]).find((x) => x.id === id); if (!c) return undefined;
    switch (c.k) { case 'tag': return tagv(c.path); case 'proj': case 'projbool': return getp(P(), c.path); case 'stage': return P().stage; case 'aspect': return P().aspect; case 'len': return String(P().clipLen);
      case 'seed': return (app.cues.sheet.meta && app.cues.sheet.meta.seed) || ''; case 'action': return null; default: return pv(c.path); } }
  const shown = (c) => !c.path || ['tag', 'proj', 'projbool'].includes(c.k) || reg()[c.path];
  function fmt(c, v) { if (c.k === 'num') { const x = (+v || 0) * (c.scale || 1); return `${x.toFixed(c.dp ?? 2)}${c.unit ? ' ' + c.unit : ''}`; }
    if (c.k === 'bool' || c.k === 'projbool') return v !== false && v != null && v !== 0 ? 'On' : 'Off';
    if (c.k === 'seg' || c.k === 'sel') return ((c.opts || []).find((o) => o[0] === v) || [v, v])[1];
    if (c.k === 'stage') return (STAGES[v] && (STAGES[v].label || STAGES[v].name)) || v; if (c.k === 'aspect') return v === '916' ? '9:16 · 1080×1920' : '16:9 · 1920×1080';
    if (c.k === 'len') return v === 'full' ? 'Full beat' : `${v} s`; if (c.k === 'color') return String(v || '').toUpperCase(); if (c.k === 'seed') return v ? `#${v}` : 'from the title';
    if (c.k === 'tag' || c.k === 'proj') return `${String(v ?? '').length} chars`; return ''; }
  function ctl(c, v) { const a = `data-q="${esc(c.id)}" aria-describedby="qh-${esc(c.id)}"`;
    switch (c.k) {
      case 'num': { const p = reg()[c.path] || {}; return `<input type="range" ${a} min="${p.min ?? 0}" max="${p.max ?? 1}" step="${p.step ?? 0.01}" value="${+v}" aria-label="${esc(c.label)}">`; }
      case 'bool': case 'projbool': return `<label class="sw"><input type="checkbox" role="switch" ${a} ${v !== false && v != null ? 'checked' : ''} aria-label="${esc(c.label)}"><i aria-hidden="true"></i></label>`;
      case 'seg': return `<div class="seg full" role="group" aria-label="${esc(c.label)}">${c.opts.map(([o, l]) => `<button type="button" ${a} data-v="${esc(o)}" aria-pressed="${o === v}">${esc(l)}</button>`).join('')}</div>`;
      case 'sel': return `<select class="inp" ${a} aria-label="${esc(c.label)}">${c.opts.map(([o, l]) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      case 'color': return `<span class="qc-col"><input type="color" ${a} value="${esc(v || '#000000')}" aria-label="${esc(c.label)}"></span>`;
      case 'tag': case 'proj': return `<input class="inp" ${a} value="${esc(v)}" aria-label="${esc(c.label)}">`;
      case 'stage': return `<div class="seg full qc-stage" role="group" aria-label="Stage">${STAGE_IDS.map((id) => `<button type="button" ${a} data-v="${id}" aria-pressed="${id === v}" title="${esc(STAGES[id].label || STAGES[id].name)}">${esc((STAGES[id].short || STAGES[id].name || id).slice(0, 4))}</button>`).join('')}</div>`;
      case 'aspect': return `<div class="seg full" role="group" aria-label="Format"><button type="button" ${a} data-v="916" aria-pressed="${v === '916'}">9:16</button><button type="button" ${a} data-v="169" aria-pressed="${v === '169'}">16:9</button></div>`;
      case 'len': return `<div class="seg full" role="group" aria-label="Length">${[['15', '15 s'], ['30', '30 s'], ['60', '1 min'], ['full', 'Full']].map(([o, l]) => `<button type="button" ${a} data-v="${o}" aria-pressed="${o === v}">${l}</button>`).join('')}</div>`;
      case 'seed': return `<div class="inrow"><input class="inp mono small" ${a} value="${esc(v)}" placeholder="auto" aria-label="Variation seed" style="flex:1"><button type="button" class="btn small" data-qact="newseed">New variation</button></div>`;
      case 'action': return `<button type="button" class="btn small" data-qact="${esc(c.id)}">${esc(c.btn)}</button>`;
    } return ''; }
  let busy = false;
  function render() {
    if (busy || root.contains(document.activeElement) && document.activeElement.matches('input[type=text],input:not([type]),select')) return;
    root.innerHTML = G.map(([name, sub, cs], gi) => `<details class="qg" data-g="${name}" ${open[name] ? 'open' : ''}><summary><span class="qg-n">[${String(gi + 1).padStart(2, '0')}]</span><b>${name}</b><span class="hint">${sub}</span></summary>
      ${cs.filter(shown).map((c) => { const v = value(c.id); return `<div class="qc" data-id="${esc(c.id)}"><div class="qc-h"><span class="qc-l">${esc(c.label)}</span><output class="qc-v" data-out="${esc(c.id)}">${esc(fmt(c, v))}</output></div>${ctl(c, v)}${c.hint ? `<p class="qc-hint" id="qh-${esc(c.id)}">${esc(c.hint)}</p>` : ''}</div>`; }).join('')}</details>`).join('');
  }
  const ctlOf = (id) => G.flatMap((g) => g[2]).find((x) => x.id === id);
  /** Set a control by id (v in the control's own units: numbers as the cue value). */
  function set(id, v, live = false) { const c = ctlOf(id); if (!c) return false; const A = app.actions;
    switch (c.k) {
      case 'num': case 'bool': case 'seg': case 'sel': case 'color': A.setProp(c.path, c.k === 'num' ? +v : v, live); break;
      case 'projbool': app.store.set({ project: { export: { [c.path.split('.')[1]]: !!v } } }); app.panels.sync(); break;
      case 'tag': if (live) app.cues.preview((s) => setTagIn(s, c.path, v)); else app.cues.edit((s) => setTagIn(s, c.path, v), 'text ' + c.path); break;
      case 'proj': { const t = $('#projTitle'); t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); if (!live) t.dispatchEvent(new Event('change', { bubbles: true })); break; }
      case 'stage': A.setStage(v); break; case 'aspect': A.setAspect(v); break; case 'len': A.applyHook(v === 'full' ? 'full' : +v); break;
      case 'seed': A.newVariation(v); break; default: return false; }
    const o = root.querySelector(`[data-out="${CSS.escape(id)}"]`); if (o) o.textContent = fmt(c, value(id)); app.studio.markDirty(); return true; }
  root.addEventListener('input', (e) => { const el = e.target, id = el.dataset.q; if (!id) return; const c = ctlOf(id);
    if (c.k === 'num') { app.cues.begin(); busy = true; set(id, +el.value, true); busy = false; }
    else if (c.k === 'tag' || c.k === 'proj') { if (c.k === 'tag') app.cues.begin(); busy = true; set(id, el.value, true); busy = false; } });
  root.addEventListener('change', (e) => { const el = e.target, id = el.dataset.q; if (!id) return; const c = ctlOf(id);
    if (c.k === 'num' || c.k === 'tag') { app.cues.commit(c.label); }
    else if (c.k === 'proj') set(id, el.value);
    else if (c.k === 'bool' || c.k === 'projbool') set(id, el.checked);
    else if (c.k === 'sel' || c.k === 'color' || c.k === 'seed') set(id, el.value);
    render(); });
  root.addEventListener('click', (e) => { const b = e.target.closest('button[data-q]'); if (b) { set(b.dataset.q, b.dataset.v); render(); return; }
    const a = e.target.closest('[data-qact]'); if (!a) return; const act = a.dataset.qact;
    if (act === 'newseed') { const s = app.actions.newVariation(); app.toast && app.toast(`New variation #${s}`); render(); }
    else if (act === 'words') { const t = $('.tabs [data-tab="meta"]'); if (t) t.click(); setTimeout(() => { const w = $('#wordSearch'); if (w) w.focus(); }, 0); }
    else if (act === 'export') { const t = $('.tabs [data-tab="export"]'); if (t) t.click(); } });
  root.addEventListener('toggle', (e) => { const d = e.target; if (d.classList && d.classList.contains('qg')) { open[d.dataset.g] = d.open; try { localStorage.setItem('u2c.quick.open', JSON.stringify(open)); } catch {} } }, true);
  // ---- Advanced: the full inspector; opens itself when the user picks keys, a marker, a window or a track
  const advOpen = (o = true) => { if (o && !adv.open) adv.open = true; else if (!o && adv.open) adv.open = false; syncMode(); };
  // Simple and Advanced are two views of the same pane: Advanced open = the full inspector on top, the task controls hidden
  function syncMode() { const T = tl(), sel = T && (T.selected().length || T.state.selMarker); if (sel && !adv.open) adv.open = true; const was = root.hidden; root.hidden = adv.open; $('#quickNote').hidden = !adv.open;
    $('#quickBack').textContent = sel ? 'Done: back to the simple controls' : 'Back to the simple controls'; if (was && !root.hidden) render(); }
  adv.addEventListener('toggle', syncMode);
  const I = app.inspector; for (const fn of ['showElement', 'showTrack', 'focusValue']) { const f0 = I[fn]; I[fn] = (...a) => { advOpen(true); return f0(...a); }; }
  const s0 = I.show; I.show = (...a) => { const r = s0(...a); syncMode(); return r; };
  $('#quickBack').addEventListener('click', () => { tl().clearSel(); adv.open = false; syncMode(); });
  app.cues.subscribe((why) => { if (why !== 'saved' && why !== 'preview') { syncMode(); if (!root.hidden) render(); } });
  app.store.subscribe((s, keys) => { if (keys.some((k) => /project\.(stage|aspect|clipLen|look|title|export)|session\.track/.test(k))) render(); });
  let lastB = -1; setInterval(() => { const b = pb(); if (Math.abs(b - lastB) > 1e-3 && !app.clock.playing && !$('#studio').hidden && !root.hidden) { lastB = b; render(); } }, 400);

  // ---- coach
  const CK = 'u2c.coach.v1'; let coach = { done: false, step: 0 }; try { coach = { ...coach, ...(JSON.parse(localStorage.getItem(CK)) || {}) }; } catch {}
  const saveC = () => { try { localStorage.setItem(CK, JSON.stringify(coach)); } catch {} };
  function drawCoach() { for (const el of $$('.coach')) { el.hidden = coach.done;
      if (coach.done) continue; el.innerHTML = `<span class="coach-k">FIG 00 · FIRST RUN</span><ol>${COACH.map(([t, h], i) => `<li class="${i < coach.step ? 'ok' : i === coach.step ? 'now' : ''}"><b><i>${i < coach.step ? '✓' : i + 1}</i>${esc(t)}</b><span>${esc(h)}</span></li>`).join('')}</ol><button class="btn small" data-coach="x" aria-label="Dismiss the guide">Got it</button>`; } }
  const stepTo = (n) => { if (coach.done || n <= coach.step) return; coach.step = Math.min(3, n); if (coach.step >= 3) coach.done = true; saveC(); drawCoach(); };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-coach="x"]')) { coach.done = true; saveC(); drawCoach(); } });
  $('#file').addEventListener('change', () => stepTo(1));
  new MutationObserver(() => { if (!$('#studio').hidden) stepTo(2); }).observe($('#studio'), { attributes: true, attributeFilter: ['hidden'] });
  $('#exBtn').addEventListener('click', () => stepTo(3)); $('#qRun').addEventListener('click', () => stepTo(3));
  drawCoach(); render();
  return { render, set, value, rows: () => G.map(([n, , cs]) => [n, cs.filter(shown).map((c) => c.id)]), advanced: advOpen,
    coach: { get step() { return coach.step; }, get done() { return coach.done; }, dismiss() { coach.done = true; saveC(); drawCoach(); }, reset() { coach = { done: false, step: 0 }; saveC(); drawCoach(); } } };
}
