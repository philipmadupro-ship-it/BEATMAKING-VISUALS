// U2C Studio bootstrap: libraries + assets, the project store, the cue sheet store, the clip manager (per-section clip
// data + v8 films), the one renderFrame, and the UI modules. window.u2c is the handle for tests and the console.
import { store } from './state.js';
import { loadLibs } from './lib/cdn.js';
import { loadAssets } from './v8/assets.js';
import { createClock } from './engine/clock.js';
import { createRenderer } from './engine/render.js';
import { createClipManager } from './engine/clip.js';
import { createCueStore } from './cues/store.js';
import { generateSheet, PRESETS, PRE_S } from './cues/generate.js';
import { newId, defaultEase, snapBeat, SNAPS } from './cues/schema.js';
import { buildRegistry } from './v8/registry.js';
import { STAGES, loadFonts } from './v8/core.js';
import { analyzeBuffer, decodeFile, metaFromFilename, synthDemo, regrid } from './analysis/index.js';
import { loopBuffer } from './export/audio.js';
import { createMotion } from './ui/motion.js';
import { createTimeline } from './ui/timeline.js';
import { createCueTimeline } from './ui/cuetimeline.js';
import { createInspector } from './ui/inspector.js';
import { createGrid } from './ui/grid.js';
import { createStudio } from './ui/studio.js';
import { createPanels } from './ui/panels.js';
import { createMedia } from './ui/media.js';
import { makeSurface } from './engine/render.js';
import { createVoiceLab } from './ui/voicelab.js';
import { createTips } from './ui/tips.js';
import { createPip } from './ui/pip.js';
import { createHistory } from './ui/history.js';
import { createPresets } from './ui/presets.js';
import { createSimpleMode } from './ui/simple.js';
import { createTimelineGuide } from './ui/tlguide.js';
import { createShotList } from './ui/shotlist.js';
import { createAddLayer, createWorkspaces, createCoverPresets } from './ui/addlayer.js';
import { createReview } from './ui/review.js';
import { createExporter } from './ui/exporter.js';
import { slug } from './util/draw.js';
import { parseSheet } from './cues/schema.js';
import { createToast } from './util/toast.js';
import { createWorkspace } from './ui/workspace.js';
import { createMonitor } from './ui/monitor.js';
import { createMarkerList } from './ui/markerlist.js';
import { createMetadata } from './ui/metadata.js';
import { createQueue } from './ui/queue.js';
import { createProjects } from './ui/projects.js';
import { createPalette } from './ui/palette.js';
import { createTimelineEdit } from './ui/tledit.js';
import { createQuick } from './ui/quick.js';
import { createStatusBar } from './ui/statusbar.js';
import { createEffects } from './ui/effects.js';

const $ = (s) => document.querySelector(s);
const status = (html) => { $('#status').innerHTML = html; };

/** Section length in bars nearest `sec` (8 / 16 / 32 bars ...), whole phrases. */
function phraseBars(track, sec) { const want = sec / track.barDur; let best = 2; for (const n of [2, 4, 8, 16, 32, 64]) if (n <= track.bars.length && Math.abs(Math.log(n / want)) < Math.abs(Math.log(best / want))) best = n; return Math.min(best, Math.max(1, track.bars.length)); }
/** Section of ~sec seconds: one bar before the first drop that fits (v8), else the loudest phrase-aligned window. */
function hook(track, sec) {
  const B = track.bars, bd = track.barDur;
  if (sec === 'full') { const s = track.song.startIdx, n = B.length - s; return [B[s], B[s] + n * bd]; }
  const n = phraseBars(track, sec), song = track.song;
  for (const q of song.phrases) if (q.label === 'drop') { const k = q.bar - 1 + song.startIdx - 1; if (k >= 0 && k + n <= B.length) return [B[k], B[k] + n * bd]; }
  let bk = 0, bs = -1; for (let k = 0; k + n <= B.length; k++) { let s = 0; for (let j = k; j < k + n; j++) s += track.energyCurve[j]; if (s > bs) { bs = s; bk = k; } }
  return [B[bk], B[bk] + n * bd];
}

async function boot() {
  status('Loading libraries…');
  const [libs, assets] = await Promise.all([loadLibs(), loadAssets('assets/')]);
  await Promise.race([loadFonts(), new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
  const clock = createClock(), motion = createMotion(libs.gsap), cues = createCueStore();
  const app = { store, clock, libs, assets, cues, motion, hook, actions: {} };
  app.clip = createClipManager(app); app.renderFrame = createRenderer(app);
  const A = app.actions; window.u2c = app;
  import('./bridge/daw.js').then(m => m.initDaw(app)).catch(() => {});   // DAW plugin bridge: inert without ?daw= or the plugin's /__daw.json
  // the property registry of the look at the playhead (cached per look / stage / aspect / bars / tags)
  let regKey = '', regVal = null;
  app.registry = () => { const p = store.project, tr = store.session.track, bars = tr ? Math.max(1, Math.round((p.outT - p.inT) / tr.barDur)) : 16, b = app.cuetl ? app.cuetl.state.playhead : 0, ev = cues.ev();
    const look = ev.value('look', b, p.look), stage = ev.value('stage', b, p.stage), k = [look, stage, p.aspect, bars, cues.version].join('|');
    if (k !== regKey) { regKey = k; regVal = buildRegistry({ look, aspect: p.aspect, stage, bars, tags: cues.sheet.tags }); } return regVal; };
  app.timeline = createTimeline(app); app.grid = createGrid(app); app.studio = createStudio(app);
  app.cuetl = createCueTimeline(app, $('#cueCv')); app.inspector = createInspector(app, $('#insp'));
  app.panels = createPanels(app); app.exporter = createExporter(app);
  app.media = createMedia(app); app.review = createReview(app); app.voiceLab = createVoiceLab(app); app.shotList = createShotList(app); app.coverPresets = createCoverPresets(app);   // v20: media bin (covers / video / audio) + review before export
  // v21 editor: toasts, workspace (resizable / collapsible panels), program monitor, marker list, metadata, export queue,
  // projects, command palette + shortcut overlay
  app.toast = createToast(); app.workspace = createWorkspace(app); app.monitor = createMonitor(app); app.markerList = createMarkerList(app);
  app.meta = createMetadata(app); app.queue = createQueue(app); app.projects = createProjects(app); app.palette = createPalette(app);
  // v22: edit in the timeline (inline values, text clips, context menu), task controls + coach, the status strip
  app.tlEdit = createTimelineEdit(app); app.quick = createQuick(app); app.statusBar = createStatusBar(app);
  // v23: + Layer menu (grouped, described), workspaces (Edit / Motion / Audio / Export), Adobe-style rich tooltips
  app.addLayer = createAddLayer(app); app.workspaces = createWorkspaces(app); app.tips = createTips(document); app.pip = createPip(app); app.history = createHistory(app); app.presets = createPresets(app); app.simple = createSimpleMode(app); app.effects = createEffects(app); app.tlGuide = createTimelineGuide(app);
  store.subscribe(() => { const tr = store.session.track, el = document.getElementById('mediaAud'); if (el) el.textContent = tr ? `${tr.meta.name} · ${Math.round(tr.bpm)} BPM · ${tr.key || ''}` : ''; });
  motion.press(document.body);
  let userClip = false;

  const accent = () => { const S = STAGES[store.project.stage] || STAGES.nigredo, r = document.documentElement.style; r.setProperty('--st-acc', S.grey ? '#f2f2f2' : S.name === 'ALBEDO' ? '#d2674d' : S.hot === '#ff5cc8' ? '#c48cff' : S.sig1); r.setProperty('--st-acc-light', S.grey ? '#141414' : S.name === 'ALBEDO' ? '#a8432e' : S.name === 'CITRINITAS' ? '#8a5a12' : '#6d2fc0'); app.cuetl.recolor(); app.timeline.recolor(); };
  A.accent = accent;
  // ---- transport
  A.loopBuf = () => { const p = store.project, tr = store.session.track; return loopBuffer(store.session.buffer, p.inT, p.outT, tr ? Math.min(tr.spb, (p.outT - p.inT) / 4) : .02, p.export.loopSafe); };
  A.playLoop = (t) => { const p = store.project; clock.playBuffer(A.loopBuf(), { offset: Math.max(0, t - p.inT), map: (x) => p.inT + x, kind: 'loop' }); };
  A.seek = (t) => { const p = store.project; if (clock.playing && p.loop && clock.mode === 'loop' && t >= p.inT && t < p.outT) A.playLoop(t); else clock.seek(t); app.studio.markDirty(); };
  A.togglePlay = () => { if (clock.playing) { clock.pause(); return; } const p = store.project; let t = clock.time(); if (t >= p.outT - .05 || t < p.inT - .01) t = p.inT; const L = app.cuetl.state.loop, tr = store.session.track;
    if (L && tr) { const a = p.inT + L.a * tr.spb, b = p.inT + L.b * tr.spb; if (t < a || t >= b) t = a; clock.play(t); } else if (p.loop) A.playLoop(t); else clock.play(t); };
  A.loopChanged = () => { app.studio.markDirty(); };
  // ---- section, look, stage, aspect
  A.setClip = (a, b, why) => { userClip = true; store.set({ project: { inT: a, outT: b } }, why); app.timeline.setClip(a, b); afterClip(); };
  A.applyHook = (sec) => { const tr = store.session.track; if (!tr) return; const [a, b] = hook(tr, sec); store.set({ project: { inT: a, outT: b, clipLen: sec } }); app.timeline.setClip(a, b); clock.seek(a); afterClip(); };
  function afterClip() { app.studio.readouts(); app.cuetl.fit(); const e = app.clip.current(); if (e) e.promise.then(() => syncCues()); app.exporter.info(); app.studio.markDirty(); }
  A.setLook = (id) => { store.set({ project: { look: id } }); cues.edit((s) => { setFirst(s, 'look', id); s.base.look = id; refreshAutoIn(s); }, 'look'); app.panels.sync(); app.exporter.info(); };
  A.setStage = (id) => { store.set({ project: { stage: id } }); cues.edit((s) => { setFirst(s, 'stage', id); s.base.stage = id; refreshAutoIn(s); }, 'stage'); accent(); app.panels.sync(); app.exporter.info(); };
  A.setAspect = (a) => { store.set({ project: { aspect: a } }); cues.edit((s) => { s.meta.aspect = a; refreshAutoIn(s); }, 'aspect'); app.studio.setAspectUI(); app.studio.layout(); app.exporter.info(); };
  function setFirst(s, path, v) { const t = s.tracks.find((x) => x.path === path); if (t && t.keys.length) t.keys[0].v = v; else s.base[path] = v; }
  /** Regenerate the auto tracks for the current section / look / stage (keeps tracks the user edited). */
  function genOpts() { const p = store.project, e = app.clip.current(); return { bars: e ? e.bars : 16, labels: e && e.ready ? e.labels : [], look: p.look, stage: p.stage, aspect: p.aspect, meta: { title: p.title, seed: cues.sheet.meta && cues.sheet.meta.seed, spb: store.session.track ? store.session.track.spb : undefined } }; }
  function refreshAutoIn(s) { const g = generateSheet({ ...genOpts(), preset: s.meta.preset || 'default' }); for (const t of g.tracks) { const i = s.tracks.findIndex((x) => x.path === t.path); if (i < 0) s.tracks.push(t); else if (s.tracks[i].auto) s.tracks[i] = t; } s.meta.bars = g.meta.bars; }
  /** v22: a new seeded variation (meta.seed): the auto tracks are rebuilt with the new seed; tracks you edited are kept. */
  A.newVariation = (seed) => { seed = seed ?? Math.random().toString(36).slice(2, 8); cues.edit((s) => { s.meta.seed = String(seed); refreshAutoIn(s); }, 'new variation'); app.panels.sync(); return String(seed); };
  // v23: a preset rebuilds the AUTO tracks only (tracks you edited by hand stay), so a preset can be changed at any time
  A.applyPreset = (id) => { cues.edit((s2) => { s2.meta.preset = id; refreshAutoIn(s2); }, 'preset ' + id); app.panels.sync(); app.exporter && app.exporter.info && app.exporter.info(); };
  /** Set a property at the playhead: the key there (or a new key) when it has a track, else its base value. */
  A.setProp = (path, v, live = false) => { const tr = store.session.track, b = snapBeat(app.cuetl.state.playhead, SNAPS[store.project.timeline.snap] || 0);
    const fn = (s) => { const t = s.tracks.find((x) => x.path === path && x.keys.length); if (!t) { s.base[path] = v; return; } t.auto = false; const k = t.keys.find((q) => Math.abs(q.b - b) < 1e-6); if (k) k.v = v; else { t.keys.push({ id: newId(), b, v, ease: defaultEase(t.kind) }); t.keys.sort((x, y) => x.b - y.b); } };
    if (live) cues.preview(fn); else cues.edit(fn, 'set ' + path); void tr; };
  // ---- the cue sheet of this project: saved one, else generated from the analysis
  const projectKey = (tr) => slug((tr.meta && (tr.meta.title || tr.meta.name)) || 'beat') + '-' + Math.round(tr.duration);
  let needGen = false;
  function openCues(tr) { const k = projectKey(tr); if (cues.key === k) return; needGen = !cues.open(k);
    if (!needGen) { const look = cues.ev().value('look', 0, store.project.look), stage = cues.ev().value('stage', 0, store.project.stage); store.set({ project: { look, stage } }); accent(); } }
  function syncCues() {
    const e = app.clip.current(); if (!e || !e.ready) return;
    if (needGen) { needGen = false; const g = generateSheet({ ...genOpts(), preset: (cues.sheet.meta && cues.sheet.meta.preset) || 'default' }); cues.replace(g, 'generate', true);
      const dp = app.presets && app.presets.default && app.presets.list().find((q) => q.id === app.presets.default); if (dp) { app.presets.applyData(dp.data, 'preset ' + dp.name + ' (default for new videos)'); app.toast && app.toast('Started with your preset “' + dp.name + '”'); } }   // v25 ★ default preset
    else { const before = JSON.stringify(cues.sheet.tracks.filter((t) => t.auto).map((t) => t.keys.map((k) => [k.b, k.v]))), s2 = JSON.parse(JSON.stringify(cues.sheet)); refreshAutoIn(s2);
      if (JSON.stringify(s2.tracks.filter((t) => t.auto).map((t) => t.keys.map((k) => [k.b, k.v]))) !== before || s2.meta.bars !== cues.sheet.meta.bars) cues.edit((s) => refreshAutoIn(s), 'analysis'); }
    app.panels.sync(); app.cuetl.markDirty(); app.inspector.show(); warmCaches();
  }
  // v24 (audit W1): the first draw of an intro / hero / ground frame builds big caches (editorial sheet, Akira columns, fried + halftone covers):
  // 3-9 s once. Draw the key moments into a tiny offscreen surface while the browser is idle, so scrubbing there later is instant.
  let warmKey = '', lastInput = performance.now(), lastClock = -1; for (const ev2 of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(ev2, () => { lastInput = performance.now(); }, { capture: true, passive: true });   // the warm-up only runs when the user is idle
  function warmCaches() { const p = store.project, tr = store.session.track, e = app.clip.current(); if (!tr || !e || !e.ready || p.look !== 'player') return;
    const k = [p.aspect, p.stage, p.inT, cues.version].join('|'); if (k === warmKey) return; warmKey = k;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300)), s = makeSurface(54, 96), ts = [p.inT - PRE_S + 0.3, p.inT - 1.2, p.inT + 2.5, p.inT + (p.outT - p.inT) * 0.6]; let i = 0;
    const step = () => { if (i >= ts.length || store.session.exporting) return; const ct = clock.time(); if (ct !== lastClock) { lastClock = ct; lastInput = performance.now(); } if (performance.now() - lastInput < 1500 || clock.playing) { setTimeout(() => idle(step), 600); return; } try { app.renderFrame(ts[i++], s, p, tr, { entry: e, preroll: PRE_S, fps: 30, info: {} }); } catch (_) {} idle(step); };
    idle(step); }
  A.syncCues = syncCues;
  A.setBpm = (bpm) => { if (store.session.track && bpm >= 40 && bpm <= 250) A.regrid(bpm); };
  A.regrid = (bpm, t0) => { const tr = regrid(store.session.track, bpm, t0); store.set({ session: { track: tr } }); app.clip.clear();
    if (!userClip) A.applyHook(store.project.clipLen || 30); else afterClip(); app.panels.sync(); if (!$('#studio').hidden) app.timeline.build(tr); app.grid.setTrack(tr); };
  A.openStudio = (look, aspect) => { clock.pause(); store.set({ project: { aspect: aspect || store.project.aspect } }); if (look && look !== store.project.look) A.setLook(look);
    $('#home').hidden = true; $('#studio').hidden = false; $('#backBtn').hidden = false; $('#exportTop').hidden = false; accent();
    app.studio.setAspectUI(); app.studio.layout(); app.timeline.build(store.session.track); app.studio.readouts(); app.panels.sync(); app.exporter.info(); app.cuetl.fit(); app.inspector.show();
    motion.viewIn($('#studio')); clock.seek(store.project.inT); app.studio.markDirty(); window.scrollTo(0, 0); };
  A.closeStudio = () => { clock.pause(); $('#studio').hidden = true; $('#home').hidden = false; $('#backBtn').hidden = true; $('#exportTop').hidden = true; app.grid.refresh(); motion.viewIn($('#home')); };
  $('#backBtn').onclick = A.closeStudio;
  $('#exportTop').onclick = () => $('.tabs [data-tab="export"]').click();
  // ---- loading audio
  let loadId = 0;
  async function load(buffer, meta) {
    const id = ++loadId; clock.stop(); clock.setBuffer(buffer); store.set({ session: { buffer, track: null } }); userClip = false; app.clip.clear();
    $('#anaProg').style.width = '0%'; status(`Analysing <b>${meta.name}</b>…`);
    const setTrack = (tr, quick) => {
      if (id !== loadId) return;
      if (quick) store.session.quickAt = performance.now();
      store.set({ session: { track: tr }, project: { title: meta.title } }); app.panels.sync();
      openCues(tr);
      if (!userClip) A.applyHook(store.project.clipLen === 'full' ? 'full' : (+store.project.clipLen || 30)); else afterClip();
      const loop = app.grid.setTrack(tr);
      $('#loopNote').textContent = `Previews loop 8 bars (${loop[0].toFixed(1)} s → ${loop[1].toFixed(1)} s), muted. Hover a card to hear it, click to open it.`;
      if (!$('#studio').hidden) app.timeline.build(tr);
      status(`<b>${meta.name}</b> · ${tr.duration.toFixed(1)} s · ${Math.round(tr.bpm * 100) / 100} BPM (${tr.bpmSource}) · ${tr.key} · ${tr.song.phrases.filter((q) => q.label === 'drop').length} drop phrases${quick ? ' · <b>quick preview</b>, refining…' : ''}`);
      $('#trackInfo').textContent = `${tr.sampleRate} Hz · bar 1 at ${tr.song.bar1.toFixed(3)} s · ${tr.song.phrases.length} phrases. Title, producer and caption fields are remembered.`;
    };
    const t0 = performance.now();
    const full = await analyzeBuffer(buffer, meta, { onQuick: (tr) => setTrack(tr, true), onProgress: (p) => { $('#anaProg').style.width = (p * 100).toFixed(0) + '%'; } });
    if (id !== loadId) return; $('#anaProg').style.width = '100%'; setTrack(full, false);
    console.info('[u2c] analysis ' + ((performance.now() - t0) / 1000).toFixed(2) + ' s');
  }
  async function loadFile(file) {
    try { const buf = await decodeFile(file, clock.ctx); const fm = metaFromFilename(file.name);
      let bits = null; try { const h = new DataView(await file.slice(0, 64).arrayBuffer()); if (h.getUint32(0) === 0x52494646 && h.getUint32(8) === 0x57415645) bits = h.getUint16(34, true); } catch (_) {}   // v14 metadata card: real wav header
      fm.fileInfo = { sr: buf.sampleRate, bits, bytes: file.size, ch: buf.numberOfChannels }; store.session.file = file; await load(buf, fm); return true; }
    catch (e) { console.warn(e); status('That file could not be decoded. Try an mp3, wav, flac or m4a export.'); return false; }
  }
  async function loadDemo() { store.session.file = null; status('Building the demo beat…'); const buf = await synthDemo(); await load(buf, { name: 'demo beat (synthesised)', title: 'Night Shift', bpm: null }); status($('#status').innerHTML + ' · <b>demo</b>: drop your own beat to replace it'); }
  // v21: projects reopen their audio (a File / Blob) and adopt their saved cue sheet (no regeneration over it)
  A.loadFile = loadFile; A.loadDemo = loadDemo;
  A.adoptSheet = (doc, label = 'open project') => { needGen = false; cues.replace(parseSheet(doc), label, true); const look = cues.ev().value('look', 0, store.project.look), stage = cues.ev().value('stage', 0, store.project.stage);
    store.set({ project: { look, stage } }); accent(); app.panels.sync(); app.cuetl.markDirty(); app.inspector.show(); app.exporter.info(); };
  $('#file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });
  $('#demoBtn').addEventListener('click', loadDemo);
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  cues.subscribe((why) => { app.studio.markDirty(); if (why === 'saved') $('#savedTxt').textContent = 'saved locally ' + new Date().toTimeString().slice(0, 5); });
  app.panels.sync(); accent();
  document.documentElement.dataset.ready = '1';
  await loadDemo();
  document.documentElement.dataset.track = '1';
  app.PRESETS = PRESETS;
}
boot().catch((e) => { console.error(e); status('Something failed while starting: ' + e.message); });
