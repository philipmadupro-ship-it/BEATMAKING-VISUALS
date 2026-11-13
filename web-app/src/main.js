// U2C Studio bootstrap: load libraries + assets, wire the store, clock, renderer and UI modules.
import { store } from './state.js';
import { loadLibs } from './lib/cdn.js';
import { loadAssets } from './engine/assets.js';
import { createClock } from './engine/clock.js';
import { createRenderer } from './engine/render.js';
import { createPostFX } from './fx/postfx.js';
import { useGsap as chainsGsap } from './overlays/chains.js';
import { useGsap as elephGsap } from './overlays/elephant.js';
import { analyzeBuffer, decodeFile, metaFromFilename, synthDemo, regrid } from './analysis/index.js';
import { TEMPLATES, applyDefaults } from './templates/index.js';
import { PALETTES, resolvePalette } from './brand/palettes.js';
import { phraseBars } from './engine/layout.js';
import { loopBuffer } from './export/audio.js';
import { createSeam } from './ui/seam.js';
import { createMotion } from './ui/motion.js';
import { createTimeline } from './ui/timeline.js';
import { createGrid } from './ui/grid.js';
import { createStudio } from './ui/studio.js';
import { createPanels } from './ui/panels.js';
import { createExporter } from './ui/exporter.js';

const $ = s => document.querySelector(s);
const all = s => [...document.querySelectorAll(s)];
const status = html => { $('#status').innerHTML = html; };

/** Most energetic section of ~`sec` seconds, snapped to a whole phrase (2/4/8/16/32 bars) starting on a downbeat. */
function hook(track, sec) {
  if (sec === 'full' || sec >= track.duration) return [0, track.duration];
  const n = phraseBars(track, sec);
  let bk = 0, bs = -1;
  for (let k = 0; k + n <= track.bars.length; k++) {
    let s = 0; for (let j = k; j < k + n; j++) s += track.energyCurve[j];
    s += track.energyCurve[k] * .5; // prefer a strong beat 1
    if (s > bs) { bs = s; bk = k; }
  }
  const a = track.bars[bk];
  return [a, Math.min(track.duration, a + n * track.barDur)];
}

async function boot() {
  status('Loading libraries…');
  const [libs, assets] = await Promise.all([loadLibs(), loadAssets('assets/')]);
  chainsGsap(libs.gsap); elephGsap(libs.gsap);
  const postfx = createPostFX(libs); await postfx.init();
  const fonts = ['700 20px "JetBrains Mono"', '500 20px "JetBrains Mono"', '600 20px "Instrument Sans"', 'italic 400 20px "Instrument Serif"', '20px Anton'];
  await Promise.race([Promise.all(fonts.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]).catch(() => {});

  const clock = createClock(), motion = createMotion(libs.gsap), renderFrame = createRenderer({ assets, postfx });
  const app = { store, clock, libs, assets, postfx, renderFrame, motion, hook, actions: {} };
  const A = app.actions; window.u2c = app; // handle for tests / console debugging
  app.seam = createSeam(app); app.timeline = createTimeline(app); app.grid = createGrid(app); app.studio = createStudio(app); app.panels = createPanels(app); app.exporter = createExporter(app);
  motion.press(document.body);
  $('#fxStatus').textContent = postfx.status;
  $('#fxBadge').textContent = 'FX · ' + postfx.status + (libs.gsap ? ' · GSAP' : '') + (libs.WaveSurfer ? ' · wavesurfer' : '') + (libs.mediabunny ? ' · mediabunny' : '');
  let userClip = false;

  A.setPaletteVars = () => { const p = resolvePalette(store.project); const r = document.documentElement.style;
    r.setProperty('--pal-main', p.light ? p.bg : p.main); r.setProperty('--pal-dark', p.light ? p.main : (PALETTES[p.fam] || p).bg); app.timeline.recolor(); };
  // preview loops on the same cross-faded buffer the export uses (sample-accurate, no restart gap)
  A.loopBuf = () => { const p = store.project, tr = store.session.track; return loopBuffer(store.session.buffer, p.inT, p.outT, tr ? Math.min(tr.spb, (p.outT - p.inT) / 4) : .02, p.export.loopSafe); };
  A.playLoop = t => { const p = store.project; app.seam.stop(); clock.playBuffer(A.loopBuf(), { offset: Math.max(0, t - p.inT), map: x => p.inT + x, kind: 'loop' }); };
  A.seek = t => { const p = store.project; if (clock.playing && p.loop && t >= p.inT && t < p.outT) A.playLoop(t); else clock.seek(t); app.studio.markDirty(); };
  A.togglePlay = () => { if (clock.playing) { clock.pause(); app.seam.stop(); } else { const p = store.project; let t = clock.time(); if (t >= p.outT - .05 || (p.loop && t < p.inT - .01)) t = p.inT; if (p.loop) A.playLoop(t); else clock.play(t); } };
  A.setClip = (a, b, why) => { userClip = true; store.set({ project: { inT: a, outT: b } }, why); app.timeline.setClip(a, b); app.studio.readouts(); if (clock.playing && clock.mode === 'loop') A.playLoop(clock.time()); };
  A.applyHook = sec => { const tr = store.session.track; if (!tr) return; const [a, b] = hook(tr, sec);
    store.set({ project: { inT: a, outT: b, clipLen: sec } }); app.timeline.setClip(a, b); app.studio.readouts(); A.seek(a); app.exporter.info(); };
  const placeFor = (changes) => { const p = app.store.snapshot(); Object.assign(p, changes); applyDefaults(p, p.tpl); return { ...changes, chains: p.chains, eleph: p.eleph }; };
  A.setTemplate = id => { store.set({ project: placeFor({ tpl: id }) });
    all('#lookGrid .lk').forEach(x => x.setAttribute('aria-pressed', x.dataset.tpl === id)); app.studio.paramsUI(); app.panels.sync(); app.exporter.info(); };
  A.setPalette = id => { store.set({ project: { pal: id } }); A.setPaletteVars(); app.studio.chips(); app.studio.thumbs(); app.exporter.info(); };
  A.setAspect = a => { store.set({ project: placeFor({ aspect: a }) }); app.studio.setAspectUI(); app.studio.layout(); app.studio.thumbs(); app.panels.sync(); app.exporter.info(); };
  A.textChanged = () => { app.grid.refreshText(); app.studio.markDirty(); };
  A.exportInfo = () => { app.exporter.info(); app.studio.setAspectUI(); };
  A.setBpm = bpm => { if (store.session.track && bpm >= 40 && bpm <= 250) A.regrid(bpm); };
  A.regrid = (bpm, t0) => { const tr = regrid(store.session.track, bpm, t0); store.set({ session: { track: tr } });
    if (!userClip) A.applyHook(store.project.clipLen || 15); app.panels.sync(); if (!$('#studio').hidden) app.timeline.build(tr); app.grid.setTrack(tr); app.studio.readouts(); };
  A.openStudio = (id, aspect) => { clock.pause(); const cur = store.project.pal, keep = cur === 'custom' || (PALETTES[cur] && PALETTES[cur].fam === TEMPLATES[id].pal && cur !== TEMPLATES[id].pal); store.set({ project: placeFor({ tpl: id, pal: keep ? cur : TEMPLATES[id].pal, aspect }) });
    $('#home').hidden = true; $('#studio').hidden = false; $('#backBtn').hidden = false; $('#exportTop').hidden = false; A.setPaletteVars();
    app.studio.chips(); app.studio.setAspectUI(); app.studio.layout(); app.timeline.build(store.session.track); app.studio.thumbs(); app.studio.readouts();
    app.panels.sync(); app.exporter.syncBatch(); app.exporter.info(); motion.viewIn($('#studio')); clock.seek(store.project.inT); app.studio.markDirty(); window.scrollTo(0, 0); };
  A.closeStudio = () => { clock.pause(); $('#studio').hidden = true; $('#home').hidden = false; $('#backBtn').hidden = true; $('#exportTop').hidden = true; app.grid.refreshText(); motion.viewIn($('#home')); };
  $('#backBtn').onclick = A.closeStudio;
  $('#exportTop').onclick = () => $('.tabs [data-tab="export"]').click();
  all('#gridAspect button').forEach(b => b.onclick = () => { all('#gridAspect button').forEach(x => x.setAttribute('aria-pressed', x === b)); app.grid.setAspect(b.dataset.a); });

  let loadId = 0;
  async function load(buffer, meta) {
    const id = ++loadId; clock.stop(); clock.setBuffer(buffer); store.set({ session: { buffer, track: null } }); userClip = false;
    $('#anaProg').style.width = '0%'; status(`Analysing <b>${meta.name}</b>…`);
    const setTrack = (tr, quick) => {
      if (id !== loadId) return; // a newer file was dropped while this one was analysing
      if (quick) store.session.quickAt = performance.now(); // the first preview came from the quick pass
      store.set({ session: { track: tr }, project: { text: { lines: { title: { text: meta.title }, key: { text: tr.key } } } } });
      if (!userClip) { const cl = store.project.clipLen; A.applyHook(cl === 'full' ? 'full' : (+cl || 15)); }
      const loop = app.grid.setTrack(tr); app.panels.sync();
      $('#loopNote').textContent = `Previews loop the loudest 8 bars (${loop[0].toFixed(1)} s → ${loop[1].toFixed(1)} s), muted. Hover a card to hear it, click to open it.`;
      if (!$('#studio').hidden) { app.timeline.build(tr); app.studio.thumbs(); app.studio.readouts(); app.exporter.info(); }
      status(`<b>${meta.name}</b> · ${tr.duration.toFixed(1)} s · ${Math.round(tr.bpm * 10) / 10} BPM (${tr.bpmSource}) · ${tr.key} · ${tr.kicks.t.length} kicks · ${tr.snares.t.length} snares${quick ? ' · <b>quick preview</b>, refining…' : ''}`);
      $('#trackInfo').textContent = `${tr.sampleRate} Hz · ${tr.frames} analysis frames · downbeat ${tr.t0.toFixed(3)} s. Tag, handle and caption format are remembered.`;
    };
    const t0 = performance.now();
    const full = await analyzeBuffer(buffer, meta, { onQuick: tr => setTrack(tr, true), onProgress: p => { $('#anaProg').style.width = (p * 100).toFixed(0) + '%'; } });
    if (id !== loadId) return; $('#anaProg').style.width = '100%'; setTrack(full, false);
    console.info('[u2c] analysis ' + ((performance.now() - t0) / 1000).toFixed(2) + ' s');
  }
  async function loadFile(file) {
    try { const buf = await decodeFile(file, clock.ctx); await load(buf, metaFromFilename(file.name)); }
    catch (e) { console.warn(e); status('That file could not be decoded. Try an mp3, wav, flac or m4a export.'); }
  }
  async function loadDemo() {
    status('Building the demo beat…'); const buf = await synthDemo();
    await load(buf, { name: 'demo beat (synthesised)', title: 'Night Shift', bpm: null });
    status($('#status').innerHTML + ' · <b>demo</b>: drop your own beat to replace it');
  }
  $('#file').addEventListener('change', e => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });
  $('#demoBtn').addEventListener('click', loadDemo);
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(n => drop.addEventListener(n, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  app.panels.sync(); A.setPaletteVars();
  document.documentElement.dataset.ready = '1';
  await loadDemo();
  document.documentElement.dataset.track = '1';
}
boot().catch(e => { console.error(e); status('Something failed while starting: ' + e.message); });
