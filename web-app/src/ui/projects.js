// v21 PROJECTS (header → Projects, Cmd/Ctrl+S, home → Recent projects): named projects in this browser (IndexedDB
// 'u2c-projects'; a small index in localStorage for the home list), save / save as / open / duplicate / rename / delete,
// and project files (.u2cproj = JSON: project settings, cue sheet with its tags, metadata overrides, covers as data URLs,
// optionally the audio as a data URL) to move a project to another browser or keep it next to the beat.
// A record: { id, name, created, at, project, sheet, covers: [{slot, name, blob}], audio: {name, blob} | {demo: true}, thumb }.
// Opening a project loads its audio (analysis as usual), restores the section, look, stage, aspect, metadata, covers and adopts
// its cue sheet as is (no regeneration over it); the viewer's Compare B becomes the saved version.
// API: app.projects = { list(), save(name?), saveAs(name), open(id), duplicate(id), rename(id, name), remove(id), exportFile(id?, {audio}), importFile(file), current }.
import { kv, blobToDataURL, dataURLToBlob } from '../util/idb.js';
import { serializeSheet } from '../cues/schema.js';
import { makeSurface } from '../engine/render.js';
import { saveFile } from '../export/save.js';
import { slug } from '../util/draw.js';
import { ASPECTS } from '../v8/layout.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const INDEX = 'u2c.projects.index', CUR = 'u2c.projects.current', FORMAT = 'u2cproj';
const newPid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString(); };

export function createProjects(app) {
  const db = kv('u2c-projects', 'projects'), P = () => app.store.project;
  const readIndex = () => { try { return JSON.parse(localStorage.getItem(INDEX)) || []; } catch { return []; } };
  const writeIndex = (L) => { try { localStorage.setItem(INDEX, JSON.stringify(L)); } catch {} };
  let current = null; try { current = localStorage.getItem(CUR); } catch {}
  const setCurrent = (id) => { current = id; try { if (id) localStorage.setItem(CUR, id); else localStorage.removeItem(CUR); } catch {} syncHeader(); };
  const entryOf = (r) => ({ id: r.id, name: r.name, at: r.at, created: r.created, thumb: r.thumb, look: r.project.look, stage: r.project.stage, aspect: r.project.aspect, audio: r.audio ? (r.audio.demo ? 'demo beat' : r.audio.name) : 'no audio', covers: (r.covers || []).length });
  function index(r, drop = false) { const L = readIndex().filter((x) => x.id !== r.id); if (!drop) L.unshift(entryOf(r)); L.sort((a, b) => b.at - a.at); writeIndex(L); renderAll(); }
  const list = () => readIndex();
  function thumb() { const p = P(), tr = app.store.session.track; if (!tr || !app.clip.current() || !app.clip.current().ready) return null; const { W, H } = ASPECTS[p.aspect], w = p.aspect === '916' ? 90 : 160, s = makeSurface(w, Math.round(w * H / W));
    try { app.renderFrame(p.inT + 2.5 * tr.spb, s, p, tr, {}); return s.canvas.toDataURL('image/jpeg', 0.72); } catch { return null; } }
  async function snapshot(id, name, created) { const file = app.store.session.file, tr = app.store.session.track;
    return { id, name, created: created || Date.now(), at: Date.now(), project: app.store.snapshot(), sheet: serializeSheet(app.cues.sheet), covers: app.media ? await app.media.blobs() : [],
      audio: file ? { name: file.name, type: file.type, blob: file } : tr ? { demo: true } : null, thumb: thumb() }; }
  const defaultName = () => P().title || 'Untitled';
  /** Save over the current project (or a new one). */
  async function save(name) { const prev = current ? await db.get(current) : null, id = prev ? prev.id : newPid(), r = await snapshot(id, name || (prev && prev.name) || defaultName(), prev && prev.created);
    const ok = await db.put(id, r); if (!ok) { app.toast && app.toast('Could not save: browser storage is unavailable', { kind: 'bad' }); return null; }
    index(r); setCurrent(id); app.monitor && app.monitor.setB(r.sheet, r.project, 'saved ' + new Date(r.at).toTimeString().slice(0, 5)); $('#savedTxt').textContent = `saved “${r.name}” ${new Date(r.at).toTimeString().slice(0, 5)}`; app.toast && app.toast(`Saved project “${r.name}”`); return entryOf(r); }
  async function saveAs(name) { setCurrent(null); return save(name || defaultName() + ' copy'); }
  async function open(id) { const r = await db.get(id); if (!r) { app.toast && app.toast('That project is no longer in this browser', { kind: 'bad' }); index({ id }, true); return false; }
    return openRecord(r); }
  async function openRecord(r) {
    app.toast && app.toast(`Opening “${r.name}”…`);
    const A = app.actions, tr0 = app.store.session.track;
    const cur = app.store.session.file, same = cur && r.audio && r.audio.blob && cur.name === r.audio.name && cur.size === r.audio.blob.size;
    if (r.audio && r.audio.blob && !same) { const f = r.audio.blob instanceof File ? r.audio.blob : new File([r.audio.blob], r.audio.name || 'beat.wav', { type: r.audio.type || r.audio.blob.type }); const ok = await A.loadFile(f); if (!ok) return false; }
    else if (r.audio && r.audio.demo && (!tr0 || app.store.session.file)) await A.loadDemo();
    const pr = r.project || {}; app.store.set({ project: { ...pr, meta: { bits: null, sr: null, bytes: null, duration: null, ...(pr.meta || {}) } } }, 'open project');
    const tr = app.store.session.track; if (tr && pr.outT > pr.inT && pr.outT <= tr.duration + 0.01) A.setClip(pr.inT, pr.outT, 'open project');
    A.adoptSheet(r.sheet); if (app.media) await app.media.restore(r.covers || []);
    app.studio.setAspectUI(); if (!$('#studio').hidden) app.studio.layout(); app.panels.sync(); app.meta && app.meta.render(); app.clip.clear(); app.studio.markDirty();
    setCurrent(r.id); app.monitor && app.monitor.setB(r.sheet, r.project, 'saved ' + new Date(r.at).toTimeString().slice(0, 5));
    $('#projTitle').value = pr.title || ''; $('#savedTxt').textContent = `“${r.name}”`; return true; }
  async function duplicate(id) { const r = await db.get(id); if (!r) return null; const c = { ...r, id: newPid(), name: r.name + ' copy', created: Date.now(), at: Date.now() }; await db.put(c.id, c); index(c); app.toast && app.toast(`Duplicated as “${c.name}”`); return entryOf(c); }
  async function rename(id, name) { const r = await db.get(id); if (!r || !name) return false; r.name = name; r.at = Date.now(); await db.put(id, r); index(r); return true; }
  async function remove(id) { await db.del(id); index({ id }, true); if (current === id) setCurrent(null); return true; }
  // ---- project files
  async function toFile(r, withAudio) { return { format: FORMAT, version: 1, app: 'U2C Studio v21', name: r.name, created: r.created, saved: r.at, project: r.project, sheet: r.sheet, tags: r.sheet.tags || {},
    covers: await Promise.all((r.covers || []).map(async (c) => ({ slot: c.slot, name: c.name, data: await blobToDataURL(c.blob) }))),
    audio: r.audio && r.audio.blob && withAudio ? { name: r.audio.name, type: r.audio.type, data: await blobToDataURL(r.audio.blob) } : r.audio ? { name: r.audio.demo ? 'demo' : r.audio.name, demo: !!r.audio.demo, included: false } : null, thumb: r.thumb }; }
  async function exportFile(id = null, opt = {}) { const r = id ? await db.get(id) : await snapshot(current || newPid(), (current && (list().find((x) => x.id === current) || {}).name) || defaultName());
    if (!r) return null; const doc = await toFile(r, opt.audio ?? $('#pjAudio').checked), blob = new Blob([JSON.stringify(doc)], { type: 'application/json' }), fname = slug(r.name) + '.u2cproj';
    if (opt.download === false) return { doc, blob, fname }; await saveFile(blob, fname); return { doc, blob, fname }; }
  async function parseFile(doc) { if (!doc || doc.format !== FORMAT || !doc.sheet || !doc.project) throw new Error('not a U2C project file (.u2cproj)');
    const covers = []; for (const c of doc.covers || []) { try { covers.push({ slot: c.slot, name: c.name, blob: await dataURLToBlob(c.data) }); } catch {} }
    let audio = null; if (doc.audio && doc.audio.data) { const b = await dataURLToBlob(doc.audio.data); audio = { name: doc.audio.name, type: doc.audio.type, blob: new File([b], doc.audio.name || 'beat.wav', { type: doc.audio.type || b.type }) }; } else if (doc.audio && doc.audio.demo) audio = { demo: true };
    const sheet = { ...doc.sheet, tags: doc.sheet.tags || doc.tags || {} };
    return { id: newPid(), name: doc.name || 'Imported project', created: doc.created || Date.now(), at: Date.now(), project: doc.project, sheet, covers, audio, thumb: doc.thumb || null, needsAudio: !!(doc.audio && !doc.audio.data && !doc.audio.demo) }; }
  /** Import a .u2cproj: stored as a new project, then opened (without its audio the current beat stays). */
  async function importFile(file, openIt = true) { let r; try { r = await parseFile(typeof file === 'string' ? JSON.parse(file) : JSON.parse(await file.text())); } catch (e) { app.toast && app.toast('Import failed: ' + e.message, { kind: 'bad' }); return null; }
    const needs = r.needsAudio; delete r.needsAudio; if (needs && app.store.session.file) r.audio = { name: app.store.session.file.name, type: app.store.session.file.type, blob: app.store.session.file };
    await db.put(r.id, r); index(r); if (openIt) await openRecord(r); if (needs) app.toast && app.toast(`“${r.name}” has no audio inside: it uses the beat that is loaded now`, { kind: 'warn' }); return entryOf(r); }
  // ---- UI: dialog + home list + header
  const dlg = $('#projects');
  function card(e, compact) { return `<li class="pj${e.id === current ? ' cur' : ''}" data-id="${esc(e.id)}"><button class="pj-open" data-open="${esc(e.id)}" aria-label="Open project ${esc(e.name)}">${e.thumb ? `<img src="${e.thumb}" alt="">` : '<span class="pj-ph"></span>'}</button>
    <div class="pj-b">${compact ? `<b>${esc(e.name)}</b>` : `<input class="inp small pj-name" value="${esc(e.name)}" data-rename="${esc(e.id)}" aria-label="Project name">`}<span class="hint">${esc(ago(e.at))} · ${esc(e.look)} · ${e.aspect === '916' ? '9:16' : '16:9'} · ${esc(e.audio)}${e.covers ? ' · ' + e.covers + ' covers' : ''}</span>
    <span class="inrow"><button class="btn tiny" data-open="${esc(e.id)}">Open</button><button class="btn tiny" data-dup="${esc(e.id)}">Duplicate</button><button class="btn tiny" data-exp="${esc(e.id)}">Export</button><button class="btn tiny danger" data-del="${esc(e.id)}">Delete</button></span></div></li>`; }
  function renderAll() { const L = list();
    $('#pjList').innerHTML = L.length ? L.map((e) => card(e, false)).join('') : '<li class="hint">No saved projects yet. Save this one to start.</li>';
    const home = $('#recentList'); if (home) { home.innerHTML = L.slice(0, 6).map((e) => card(e, true)).join(''); $('#recent').hidden = !L.length; }
    $('#pjCount').textContent = `${L.length} project${L.length === 1 ? '' : 's'} in this browser`; }
  function syncHeader() { const e = list().find((x) => x.id === current); $('#projBtn').title = e ? `Project: ${e.name}` : 'Projects'; }
  async function onClick(e) { const t = e.target.closest('[data-open],[data-dup],[data-exp],[data-del]'); if (!t) return;
    if (t.dataset.open) { const fromHome = !!t.closest('#recentList'); if (dlg.open) dlg.close(); const ok = await open(t.dataset.open); if (ok && fromHome) app.actions.openStudio(); }
    else if (t.dataset.dup) await duplicate(t.dataset.dup);
    else if (t.dataset.exp) await exportFile(t.dataset.exp);
    else if (t.dataset.del) { const e2 = list().find((x) => x.id === t.dataset.del); if (confirm(`Delete “${e2 ? e2.name : 'this project'}” from this browser? This cannot be undone.`)) await remove(t.dataset.del); } }
  $('#pjList').addEventListener('click', onClick); $('#recentList').addEventListener('click', onClick);
  $('#pjList').addEventListener('change', (e) => { const id = e.target.dataset.rename; if (id) rename(id, e.target.value.trim() || 'Untitled'); });
  $('#projBtn').addEventListener('click', () => openDialog());
  function openDialog() { renderAll(); $('#pjName').value = (list().find((x) => x.id === current) || {}).name || defaultName(); if (!dlg.open) dlg.showModal(); }
  $('#pjClose').addEventListener('click', () => dlg.close());
  $('#pjSave').addEventListener('click', async () => { await save($('#pjName').value.trim() || defaultName()); renderAll(); });
  $('#pjSaveAs').addEventListener('click', async () => { await saveAs($('#pjName').value.trim() || defaultName() + ' copy'); renderAll(); });
  $('#pjExport').addEventListener('click', () => exportFile(null));
  $('#pjImport').addEventListener('click', () => $('#pjFile').click());
  $('#recentAll').addEventListener('click', () => openDialog());
  $('#recentImport').addEventListener('click', () => $('#pjFile').click());
  $('#pjFile').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (dlg.open) dlg.close(); const r = await importFile(f); if (r && $('#studio').hidden) app.actions.openStudio(); });
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (e.shiftKey) openDialog(); else save(); } });
  // v21 look: the project name, huge and soft, behind the crisp UI (home hero + program monitor)
  const echo = () => { const t = (P().title || 'U2C').toUpperCase(); const d = $('#drop'); if (d) d.dataset.echo = t; const s = $('#stageEcho'); if (s) s.textContent = t; };
  app.store.subscribe((st, keys) => { if (keys.some((k) => /project\.title/.test(k))) echo(); }); echo();
  renderAll(); syncHeader();
  return { list, save, saveAs, open, duplicate, rename, remove, exportFile, importFile, openDialog, get current() { return current; } };
}
