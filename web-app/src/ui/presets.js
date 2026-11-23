// v25 PRESETS (left rail → Presets; user: "quick presets you already have, and save something as a preset; I move the spectrum, move this,
// move that, create a preset, and after everything has the same preset").
//   Built-in: the look presets (Lab, Hero, Calm / YouTube, Rack tour, Full beat).
//   Mine: "Save as preset" stores ONLY what you changed on top of the generated video: the look preset it started from, the stage, every base
//   value that differs from a freshly generated sheet (moved / resized windows, options, colours), the tag overrides (words), and the tracks
//   you edited by hand (auto = false). Apply = rebuild the preset's auto tracks for THIS beat, then lay your changes on top, so it fits any beat.
//   ★ "Use for new videos": applied automatically when a new beat gets its first sheet. Rename, update, delete, export / import (.u2cpreset.json).
// Stored in localStorage (per browser). API: app.presets = { list(), save(name), apply(id), remove(id), setDefault(id), capture(), default }
import { generateSheet, PRESETS, PLAYER_PRESETS } from '../cues/generate.js';
import { mergeDeep } from '../cues/schema.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const KEY = 'u2c.presets.v1', DEF = 'u2c.presets.default';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) { return []; } };
const store = (L) => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (_) {} };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createPresets(app) {
  const root = $('#presetPane'); if (!root) return null;
  let def = null; try { def = localStorage.getItem(DEF); } catch (_) {}
  const opts = () => { const p = app.store.project, e = app.clip.current(), tr = app.store.session.track; return { bars: e ? e.bars : 16, labels: e && e.ready ? e.labels : [], look: p.look, stage: p.stage, aspect: p.aspect, meta: { title: p.title, seed: app.cues.sheet.meta.seed, spb: tr ? tr.spb : undefined } }; };
  /** What the user changed, relative to a freshly generated sheet of the same look preset. */
  function capture() { const s = app.cues.sheet, preset = s.meta.preset || 'default', g = generateSheet({ ...opts(), preset }), base = {};
    for (const [k, v] of Object.entries(s.base)) if (!(k in g.base) || !same(g.base[k], v)) base[k] = v;
    const tracks = s.tracks.filter((t) => !t.auto && t.keys.length).map((t) => JSON.parse(JSON.stringify(t)));
    return { v: 1, look: app.store.project.look, stage: app.store.project.stage, preset, base, tags: JSON.parse(JSON.stringify(s.tags || {})), tracks }; }
  function applyData(d, why = 'apply preset') {
    if (d.look && d.look !== app.store.project.look) app.actions.setLook(d.look);
    if (d.stage && d.stage !== app.store.project.stage) app.actions.setStage(d.stage);
    const g = generateSheet({ ...opts(), look: d.look || app.store.project.look, preset: d.preset || 'default' });
    app.cues.edit((s) => { s.meta.preset = d.preset || 'default'; s.tracks = g.tracks; s.base = { ...g.base, ...(d.base || {}) }; s.tags = mergeDeep(s.tags || {}, d.tags || {});
      for (const t of d.tracks || []) { const i = s.tracks.findIndex((q) => q.path === t.path); const c = { ...JSON.parse(JSON.stringify(t)), auto: false }; if (i >= 0) s.tracks[i] = c; else s.tracks.push(c); } }, why);
    app.panels && app.panels.sync && app.panels.sync(); }
  const list = () => load();
  function save(name) { const L = load(), id = 'p' + Date.now().toString(36), d = capture(); L.push({ id, name: name || `My preset ${L.length + 1}`, at: Date.now(), data: d }); store(L); render(); return id; }
  function update(id) { const L = load(), p = L.find((q) => q.id === id); if (!p) return; p.data = capture(); p.at = Date.now(); store(L); render(); }
  function apply(id) { const p = load().find((q) => q.id === id); if (p) applyData(p.data, 'preset ' + p.name); }
  function remove(id) { store(load().filter((q) => q.id !== id)); if (def === id) setDefault(null); render(); }
  function setDefault(id) { def = id; try { if (id) localStorage.setItem(DEF, id); else localStorage.removeItem(DEF); } catch (_) {} render(); }
  const summary = (d) => { const n = Object.keys(d.base || {}).length, w = new Set(Object.keys(d.base || {}).filter((k) => k.startsWith('win.')).map((k) => k.split('.')[1])).size, t = (d.tracks || []).length;
    return [`${(PRESETS[d.preset] || {}).name || d.preset}`, d.stage, w ? `${w} window${w > 1 ? 's' : ''} moved` : '', n - (w ? 0 : 0) ? `${n} setting${n > 1 ? 's' : ''}` : '', t ? `${t} edited track${t > 1 ? 's' : ''}` : '', Object.keys(d.tags || {}).length ? 'words' : ''].filter(Boolean).join(' · '); };
  function render() {
    const cur = app.cues.sheet.meta.preset || 'default', isP = app.store.project.look === 'player', L = load();
    root.innerHTML = `<div class="group"><div class="group-h"><span class="lbl">Quick presets</span></div><div class="pr-quick">${PLAYER_PRESETS.map((k) => `<button class="pr-q" data-quick="${k}" aria-pressed="${isP && k === cur}" data-tip="${esc(PRESETS[k].name)}|${esc(PRESETS[k].blurb)}|"><b>${esc(PRESETS[k].name)}</b></button>`).join('')}</div></div>
      <div class="group"><div class="group-h"><span class="lbl">My presets</span><span class="inrow"><button class="btn small primary" id="prSave" data-tip="Save as preset|Stores what you changed here (moved windows, options, words, edited tracks) so you can put it on any video.|">Save as preset</button></span></div>
      ${L.length ? `<ul class="pr-list">${L.map((p) => `<li class="pr-item${p.id === def ? ' def' : ''}"><button class="pr-apply" data-apply="${p.id}" data-tip="Apply ${esc(p.name)}|Rebuilds the video for this beat with your changes on top. One undo step.|"><b>${esc(p.name)}</b><span>${esc(summary(p.data))}</span></button>
        <span class="pr-acts"><button class="ib sm" data-def="${p.id}" aria-pressed="${p.id === def}" aria-label="Use ${esc(p.name)} for new videos" data-tip="Use for new videos|Every new beat starts with this preset.|">★</button><button class="ib sm" data-upd="${p.id}" aria-label="Update ${esc(p.name)} with the current changes" data-tip="Update|Overwrite this preset with what you have now.|">↻</button><button class="ib sm" data-ren="${p.id}" aria-label="Rename ${esc(p.name)}">✎</button><button class="ib sm" data-exp="${p.id}" aria-label="Export ${esc(p.name)}">⇩</button><button class="ib sm" data-del="${p.id}" aria-label="Delete ${esc(p.name)}">×</button></span></li>`).join('')}</ul>`
        : '<p class="hint">No presets yet. Move windows, change options or words, then <b>Save as preset</b>. Your preset works on every beat.</p>'}
      <div class="inrow"><label class="btn small" for="prImport">Import preset</label><input type="file" id="prImport" accept=".json,application/json" hidden>${def ? `<span class="hint">★ new videos start with “${esc((L.find((q) => q.id === def) || {}).name || '')}”</span>` : ''}</div></div>`;
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.quick) { if (app.store.project.look !== 'player') app.actions.setLook('player'); app.actions.applyPreset(b.dataset.quick); render(); return; }
    if (b.id === 'prSave') { const n = window.prompt('Name this preset', `My preset ${load().length + 1}`); if (n != null) { save(n.trim() || undefined); app.toast && app.toast('Preset saved'); } return; }
    if (b.dataset.apply) { apply(b.dataset.apply); app.toast && app.toast('Preset applied (Ctrl+Z to undo)'); return; }
    if (b.dataset.def) { setDefault(def === b.dataset.def ? null : b.dataset.def); return; }
    if (b.dataset.upd) { update(b.dataset.upd); app.toast && app.toast('Preset updated'); return; }
    if (b.dataset.ren) { const L = load(), p = L.find((q) => q.id === b.dataset.ren), n = p && window.prompt('Rename preset', p.name); if (p && n) { p.name = n.trim(); store(L); render(); } return; }
    if (b.dataset.del) { const p = load().find((q) => q.id === b.dataset.del); if (p && window.confirm(`Delete the preset “${p.name}”?`)) remove(p.id); return; }
    if (b.dataset.exp) { const p = load().find((q) => q.id === b.dataset.exp); if (!p) return; const blob = new Blob([JSON.stringify({ format: 'u2c-preset', ...p }, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = p.name.replace(/[^\w-]+/g, '-') + '.u2cpreset.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); } });
  root.addEventListener('change', async (e) => { if (e.target.id !== 'prImport') return; const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (j.format !== 'u2c-preset' || !j.data) throw new Error('not a U2C preset'); const L = load(); L.push({ id: 'p' + Date.now().toString(36), name: j.name || 'Imported preset', at: Date.now(), data: j.data }); store(L); render(); app.toast && app.toast('Preset imported'); }
    catch (err) { app.toast && app.toast('Could not import: ' + err.message); } });
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved' && !root.contains(document.activeElement)) render(); });
  render();
  return { list, save, update, apply, applyData, remove, setDefault, capture, get default() { return def; } };
}
