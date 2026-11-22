// v21 EXPORT QUEUE (Export tab, top; Media Encoder / Resolve "Render Queue"): add delivery presets, then Run queue renders
// them one after another with a progress row each. Presets: TikTok 9:16 30 s, Reels 9:16 15 s, Shorts 9:16 60 s, YouTube 16:9
// full beat. An item with the current section length keeps the current section and cue sheet (the other aspect drops the
// per-aspect window geometry, as "Render both formats"); another length gets its own auto-picked section and a sheet rebuilt
// from the analysis, with your tags. File names come from a template: {title} {preset} {aspect} {len} {look} {stage} {bpm}
// {key} {date} {time} {n}. API: app.queue = { PRESETS, add(id | {name, aspect, len, draft}), remove(id), clear(), run(), items, nameOf(item) }.
import { generateSheet } from '../cues/generate.js';
import { slug } from '../util/draw.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export const QUEUE_PRESETS = {
  tiktok: { name: 'TikTok', label: 'TikTok 9:16 · 30 s', aspect: '916', len: 30 },
  reels: { name: 'Reels', label: 'Reels 9:16 · 15 s', aspect: '916', len: 15 },
  shorts: { name: 'Shorts', label: 'Shorts 9:16 · 60 s', aspect: '916', len: 60 },
  youtube: { name: 'YouTube', label: 'YouTube 16:9 · full', aspect: '169', len: 'full' },
};
const TPL_KEY = 'u2c.queue.tpl', DEF_TPL = '{title}_{preset}_{aspect}_{len}s';
export function createQueue(app) {
  const P = () => app.store.project, items = []; let nid = 0, running = false;
  let tpl = DEF_TPL; try { tpl = localStorage.getItem(TPL_KEY) || DEF_TPL; } catch {}
  const tplIn = $('#qTpl'); tplIn.value = tpl;
  tplIn.addEventListener('input', () => { tpl = tplIn.value || DEF_TPL; try { localStorage.setItem(TPL_KEY, tpl); } catch {} render(); });
  function windowFor(it) { const p = P(), tr = app.store.session.track, curBars = Math.round((p.outT - p.inT) / tr.barDur);
    const [a, b] = app.hook(tr, it.len), bars = Math.round((b - a) / tr.barDur); return bars === curBars ? { inT: p.inT, outT: p.outT, same: true } : { inT: a, outT: b, same: false }; }
  function nameOf(it, n = items.indexOf(it) + 1) { const p = P(), tr = app.store.session.track, d = new Date(), w = tr ? windowFor(it) : { inT: 0, outT: 0 };
    const vars = { title: p.title, preset: it.name, aspect: it.aspect === '916' ? '9x16' : '16x9', len: Math.round(w.outT - w.inT), look: p.look, stage: p.stage, bpm: tr ? Math.round(tr.bpm) : '', key: (p.key || (tr && tr.key) || '').replace(/\s+/g, ''),
      date: d.toISOString().slice(0, 10), time: d.toTimeString().slice(0, 5).replace(':', ''), n: String(n).padStart(2, '0') };
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)).split(/[\\/]+/).map((x) => x.replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')).filter(Boolean).join('_') || slug(p.title); }
  function add(id) { const pr = typeof id === 'string' ? QUEUE_PRESETS[id] : id; if (!pr) return null; const it = { id: ++nid, key: typeof id === 'string' ? id : 'custom', name: pr.name, label: pr.label || pr.name, aspect: pr.aspect, len: pr.len, draft: !!pr.draft, status: 'queued', progress: 0, note: '' };
    items.push(it); render(); return it; }
  function remove(id) { const i = items.findIndex((x) => x.id === id); if (i >= 0 && items[i].status !== 'running') { items.splice(i, 1); render(); } }
  function clear(all = false) { for (let i = items.length - 1; i >= 0; i--) if (all ? items[i].status !== 'running' : /done|failed|cancelled/.test(items[i].status)) items.splice(i, 1); render(); }
  async function jobOf(it) { const base = app.store.snapshot(), tr = app.store.session.track, w = windowFor(it), p = JSON.parse(JSON.stringify(base)); p.aspect = it.aspect; p.inT = w.inT; p.outT = w.outT; p.clipLen = it.len; if (it.draft) p.export.draft = true;
    let sheet; if (w.same) sheet = it.aspect === base.aspect ? undefined : app.exporter.sheetFor(it.aspect);
    else { const e = await app.clip.ensure(p.inT, p.outT); sheet = generateSheet({ bars: e.bars, labels: e.labels, look: p.look, stage: p.stage, aspect: p.aspect, meta: { title: p.title } }); sheet.tags = JSON.parse(JSON.stringify(app.cues.sheet.tags || {})); }
    void tr; return { project: p, sheet }; }
  async function run() {
    if (running || app.store.session.exporting || !app.store.session.track) return false; const todo = items.filter((x) => x.status === 'queued'); if (!todo.length) { app.toast && app.toast('The queue is empty: add a preset.'); return false; }
    running = true; app.clock.pause(); app.exporter.resetCancel(); app.store.set({ session: { exporting: true } }); $('#qRun').disabled = $('#exBtn').disabled = $('#batchBtn').disabled = true; $('#qCancel').hidden = false; $('#exCancel').hidden = false;
    let done = 0;
    try { for (const it of todo) { if (app.exporter.cancelled) { it.status = 'cancelled'; continue; } it.status = 'running'; it.progress = 0; render(); const t0 = performance.now();
        try { const { project, sheet } = await jobOf(it), name = nameOf(it);
          const res = await app.exporter.renderVideo(project, `${it.label} (${todo.indexOf(it) + 1}/${todo.length})`, (q) => { it.progress = q; paint(it); }, sheet);
          if (!res) { it.status = 'cancelled'; continue; } it.status = 'done'; it.progress = 1; it.file = name + '.' + res.ext; it.size = res.blob.size; it.secs = (performance.now() - t0) / 1000; app.exporter.addResult(res, it.file); done++; }
        catch (e) { console.error(e); it.status = 'failed'; it.note = e.message; }
        render(); } }
    finally { running = false; app.store.set({ session: { exporting: false } }); $('#qRun').disabled = $('#exBtn').disabled = $('#batchBtn').disabled = false; $('#qCancel').hidden = true; $('#exCancel').hidden = true; app.studio.markDirty(); render();
      $('#exStatus').textContent = `Queue: ${done} of ${todo.length} rendered${app.exporter.cancelled ? ' (cancelled)' : ''}. Save them below.`; }
    return done; }
  const root = $('#qList');
  function paint(it) { const el = root.querySelector(`[data-q="${it.id}"]`); if (!el) return; el.querySelector('i').style.width = (it.progress * 100).toFixed(1) + '%'; el.querySelector('.q-st').textContent = it.status === 'running' ? Math.round(it.progress * 100) + '%' : it.status; }
  function render() {
    root.innerHTML = items.length ? items.map((it, i) => `<li class="q ${it.status}" data-q="${it.id}"><div class="q-h"><b>${esc(it.label)}${it.draft ? ' · draft' : ''}</b><span class="q-st">${it.status === 'running' ? Math.round(it.progress * 100) + '%' : it.status}</span>${it.status !== 'running' ? `<button class="mk-x" data-qx="${it.id}" aria-label="Remove ${esc(it.label)} from the queue">×</button>` : ''}</div>
      <span class="hint">${esc(it.file || nameOf(it, i + 1) + '.mp4')}${it.size ? ` · ${(it.size / 1048576).toFixed(1)} MB · ${it.secs.toFixed(0)} s` : ''}${it.note ? ' · ' + esc(it.note) : ''}</span><div class="prog"><i style="width:${(it.progress * 100).toFixed(1)}%"></i></div></li>`).join('')
      : '<li class="hint">Add presets, then Run queue. Each renders in turn.</li>';
    $('#qRun').textContent = `Run queue${items.filter((x) => x.status === 'queued').length ? ' (' + items.filter((x) => x.status === 'queued').length + ')' : ''}`; }
  root.addEventListener('click', (e) => { const x = e.target.closest('[data-qx]'); if (x) remove(+x.dataset.qx); });
  $('#qPresets').innerHTML = Object.entries(QUEUE_PRESETS).map(([k, v]) => `<button class="btn small" data-qp="${k}" title="Add ${esc(v.label)} to the queue">+ ${esc(v.label)}</button>`).join('');
  $('#qPresets').addEventListener('click', (e) => { const b = e.target.closest('[data-qp]'); if (b) add(b.dataset.qp); });
  $('#qRun').addEventListener('click', run);
  $('#qCancel').addEventListener('click', () => app.exporter.cancel());
  $('#qClear').addEventListener('click', () => clear(true));
  app.store.subscribe((s, keys) => { if (!running && keys.some((k) => /project\.(title|look|stage|inT|outT)|session\.track/.test(k))) render(); });
  render();
  return { PRESETS: QUEUE_PRESETS, add, remove, clear, run, nameOf, render, get items() { return items; }, get running() { return running; }, set template(v) { tpl = v; tplIn.value = v; render(); }, get template() { return tpl; } };
}
