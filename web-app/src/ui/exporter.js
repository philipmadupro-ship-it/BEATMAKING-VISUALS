// Export tab: MP4 from the cue sheet (offline WebCodecs via Mediabunny, MediaRecorder fallback), batch sets
// (look x length, each with a cue sheet rebuilt from the analysis of its own section), voice tag, cue sheet JSON.
import { ASPECTS, LOOKS, LOOK_NAMES } from '../v8/layout.js';
import { STAGES } from '../v8/core.js';
import { makeSurface, createBlur } from '../engine/render.js';
import { prepareAudio } from '../export/audio.js';
import { canOffline, exportOffline } from '../export/offline.js';
import { exportRealtime } from '../export/recorder.js';
import { saveFile } from '../export/save.js';
import { generateSheet } from '../cues/generate.js';
import { serializeSheet } from '../cues/schema.js';
import { slug, fmtTC } from '../util/draw.js';
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
export function createExporter(app) {
  let cancel = false; const P = () => app.store.project;
  const status = (m) => { $('#exStatus').textContent = m; }, prog = (q) => { $('#exProg').style.width = (q * 100).toFixed(1) + '%'; };
  const urls = new Set(); const keep = (u) => { urls.add(u); return u; }, revoke = (u) => { if (urls.delete(u)) URL.revokeObjectURL(u); };
  const dims = (p) => { const { W, H } = ASPECTS[p.aspect], k = p.export.draft ? 2 / 3 : 1; return { W: Math.round(W * k / 2) * 2, H: Math.round(H * k / 2) * 2, mbps: p.export.draft ? Math.max(4, p.export.mbps * .5) : p.export.mbps }; };
  async function info() { const p = P(), tr = app.store.session.track; if (!tr) return;
    { const sec = p.outT - p.inT, full = tr.bars.length - tr.song.startIdx, cur = String(p.clipLen) === 'full' || Math.round(sec / tr.barDur) >= full ? 'full' : String(p.clipLen);
      $$('#exLen button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.len === cur)); $('#exLenInfo').textContent = `${sec.toFixed(1)} s · ${Math.round(sec / tr.barDur)} bars`; } const { W, H, mbps } = dims(p), len = p.outT - p.inT;
    const c = await canOffline(app.libs.mediabunny, W, H, mbps, p.export.fps), nk = app.cues.sheet.tracks.reduce((s, t) => s + t.keys.length, 0);
    $('#exKv').innerHTML = `<dt>Look</dt><dd>${LOOK_NAMES[p.look]} · ${(STAGES[p.stage].label || STAGES[p.stage].name)}</dd><dt>Cue sheet</dt><dd>${app.cues.sheet.tracks.length} tracks · ${nk} keys</dd><dt>Frame</dt><dd>${W}×${H} · ${p.export.fps} fps · ${mbps} Mbps${p.export.draft ? ' · draft' : ''}</dd>
      <dt>Section</dt><dd>${fmtTC(p.inT)} → ${fmtTC(p.outT)} (${len.toFixed(2)} s, ${Math.round(len / tr.barDur)} bars)</dd><dt>Encoder</dt><dd>${c ? `offline · ${c.container.toUpperCase()} · ${c.v === 'avc' ? 'H.264' : c.v.toUpperCase()} + ${c.a.toUpperCase()} 48 kHz` : 'real-time MediaRecorder'}</dd>`; }
  /** Render one section to a video blob: project (section, look, aspect), opt.sheet (default: the studio's). */
  async function renderVideo(project, label, onProg, sheet) {
    const tr = app.store.session.track, buf = app.store.session.buffer, ex = project.export, { W, H, mbps } = dims(project);
    status(`Measuring ${label}…`); const entry = await app.clip.ensure(project.inT, project.outT);
    status(`Preparing audio for ${label}…`);
    const au = await prepareAudio(buf, project, { loopSafe: ex.loopSafe, xf: Math.min(tr.spb, (project.outT - project.inT) / 4), loudness: ex.loudness, voiceTag: ex.voiceTag ? app.store.session.voiceTag : null, voiceEvery: ex.voiceEvery });
    $('#loudKv').innerHTML = `<dt>Measured in</dt><dd>${au.stats.inLufs.toFixed(1)} LUFS</dd><dt>Gain</dt><dd>${au.stats.gainDb >= 0 ? '+' : ''}${au.stats.gainDb.toFixed(1)} dB</dd><dt>Out</dt><dd>${au.stats.outLufs.toFixed(1)} LUFS · peak ${au.stats.peakDb.toFixed(1)} dBTP (4× oversampled)</dd>`;
    const PRE = ex.preroll !== false && project.look === 'player' ? 1.9 : 0;   // v19.4 click-to-play pre-roll (as the native --preroll)
    const work = makeSurface(W, H), renderOne = (t, surf, info) => app.renderFrame(t, surf, project, tr, { entry, sheet, fps: ex.fps, info, preroll: PRE }), blur = ex.mblur !== false, SH = ex.shutter ?? 0.5;
    // Motion blur: the shared engine/render.js createBlur (the preview's Blur button runs the same code)
    const blurF = createBlur(), render = (t) => (blur ? blurF(renderOne, t, work, ex.fps, SH) : renderOne(t, work, {}) || work.canvas);
    const rate = (q, s, n) => { const fps = n / Math.max(.001, s), eta = q >= 1 ? 0 : Math.max(0, Math.round((n / Math.max(q, 1e-6) - n) / Math.max(fps, .001))); $('#exRate').textContent = `${fps.toFixed(1)} fps · ETA ${eta} s`; };
    // v19.4 audio: delay the beat by the pre-roll and mix the synthesized UI clicks (port of motion/tools/clicks.py) at the film's click times
    let audioOut = au.buffer;
    if (PRE > 0 || (ex.clicks !== false && project.look === 'player')) {
      renderOne(project.inT - PRE, work, {}); const film = app.clip.film(entry, project.aspect), times = ex.clicks !== false && film && film.clickTimes ? film.clickTimes() : [];
      const src = au.buffer, sr = src.sampleRate, n = src.length + Math.round(PRE * sr), outB = new AudioBuffer({ numberOfChannels: src.numberOfChannels, length: n, sampleRate: sr }), off0 = Math.round(PRE * sr);
      const click = (lv) => { const m = Math.round(0.012 * sr), o = new Float32Array(m); let prevN = 0, seed = 7; for (let i = 0; i < m; i++) { const tt = i / sr; seed = (seed * 16807) % 2147483647; const nz = (seed / 2147483647 - 0.5) * 2 * Math.exp(-tt / 0.0012), hp = nz - prevN; prevN = nz;
        o[i] = lv * (hp * 0.5 + Math.sin(2 * Math.PI * 3400 * tt) * Math.exp(-tt / 0.0025) * 0.6 + Math.sin(2 * Math.PI * 1200 * tt) * Math.exp(-tt / 0.004) * 0.3); } return o; };
      const press = click(1), rel = click(0.45), g = Math.pow(10, -16 / 20) / 1.4;
      for (let ch = 0; ch < src.numberOfChannels; ch++) { const d = outB.getChannelData(ch); d.set(src.getChannelData(ch), off0);
        for (const tc of times) for (const [dt, snd] of [[0, press], [0.055, rel]]) { const i0 = Math.round((tc + dt) * sr); for (let i = 0; i < snd.length && i0 + i < n; i++) if (i0 + i >= 0) d[i0 + i] += snd[i] * g; } }
      audioOut = outB;
    }
    const vl = app.videoLayer && app.videoLayer.loaded ? app.videoLayer : null, codecs = await canOffline(app.libs.mediabunny, W, H, mbps, ex.fps); let res;
    if (codecs) { try { res = await exportOffline({ mb: app.libs.mediabunny, codecs, W, H, fps: ex.fps, mbps, inT: project.inT - PRE, outT: project.outT, audio: audioOut, render, beforeFrame: vl ? (t) => vl.seek(t, project) : undefined, isCancelled: () => cancel,
        onProgress: (q, s, n) => { onProg(q); rate(q, s, n); status(`Encoding ${label}: ${Math.round(q * 100)}%`); } }); } catch (e) { console.warn('[u2c] offline export failed, falling back to real time', e); res = undefined; } }
    if (res === undefined) res = await exportRealtime({ ac: app.clock.ctx, W, H, fps: ex.fps, mbps, inT: project.inT, outT: project.outT, audio: au.buffer, monitor: false, render: vl ? (t) => { vl.nudge(t, project); return render(t); } : render, isCancelled: () => cancel,
      onProgress: (q) => { onProg(q); status(`Recording ${label} in real time: ${Math.round(q * 100)}%`); } });
    if (res) res.stats = au.stats; return res;
  }
  function addResult(res, name) { const url = keep(URL.createObjectURL(res.blob)), el = document.createElement('div'); el.className = 'res'; el.dataset.size = res.blob.size; el.dataset.type = res.type; el.dataset.fps = res.fps ? res.fps.toFixed(2) : '';
    el.innerHTML = `<b>${name}</b><button class="btn small primary">Save</button><span>${(res.blob.size / 1048576).toFixed(2)} MB · ${res.type} · ${res.codecs.v}${res.codecs.a ? '+' + res.codecs.a : ''}${res.seconds ? ' · rendered in ' + res.seconds.toFixed(1) + ' s (' + res.fps.toFixed(1) + ' fps)' : ''}</span><video controls playsinline muted src="${url}"></video>`;
    el.querySelector('button').onclick = async () => { const r = await saveFile(res.blob, name); el.querySelector('span').textContent += r === 'declined' ? ' · save cancelled' : ' · saved'; };
    $('#results').prepend(el); app.motion.viewIn(el);
    $$('#results .res').slice(6).forEach((x) => { const v = x.querySelector('video'); if (v) revoke(v.src); x.remove(); }); }
  async function run(jobs) {
    if (app.store.session.exporting || !app.store.session.track) return; app.clock.pause(); cancel = false; app.store.set({ session: { exporting: true } });
    $('#exBtn').disabled = $('#batchBtn').disabled = true; $('#exCancel').hidden = false;
    try { for (let j = 0; j < jobs.length; j++) { const { project, name, sheet } = jobs[j]; const res = await renderVideo(project, `${name} (${j + 1}/${jobs.length})`, (q) => prog((j + q) / jobs.length), typeof sheet === 'function' ? await sheet() : sheet);
        if (!res) { status('Export cancelled.'); break; } addResult(res, name + '.' + res.ext); }
      if (!cancel) status(jobs.length > 1 ? `Done: ${jobs.length} videos. Save them below.` : 'Done. Preview and save it below.'); }
    catch (e) { console.error(e); status('Export failed: ' + e.message); }
    finally { app.store.set({ session: { exporting: false } }); $('#exBtn').disabled = $('#batchBtn').disabled = false; $('#exCancel').hidden = true; prog(cancel ? 0 : 1); app.studio.markDirty(); }
  }
  const nameFor = (p) => `${slug(p.title)}_${p.look}_${p.stage}_${p.aspect === '916' ? '9x16' : '16x9'}_${Math.round(p.outT - p.inT)}s${p.export.voiceTag ? '_tagged' : ''}${p.export.draft ? '_draft' : ''}`;
  /** The same cue sheet for the other aspect: window geometry is per aspect, so its x / y / w / h overrides are dropped. */
  const sheetFor = (aspect) => { const s = JSON.parse(JSON.stringify(app.cues.sheet)), geo = /^win\.[^.]+\.(x|y|w|h)$/; s.meta.aspect = aspect; s.tracks = s.tracks.filter((t) => !geo.test(t.path)); s.base = Object.fromEntries(Object.entries(s.base || {}).filter(([k]) => !geo.test(k))); return s; };
  $('#exBtn').addEventListener('click', () => { const p = app.store.snapshot(), jobs = [{ project: p, name: nameFor(p) }];
    if (p.export.both) { const q = JSON.parse(JSON.stringify(p)); q.aspect = p.aspect === '916' ? '169' : '916'; jobs.push({ project: q, name: nameFor(q), sheet: sheetFor(q.aspect) }); jobs.sort((a, b) => (a.project.aspect === '916' ? 0 : 1) - (b.project.aspect === '916' ? 0 : 1)); }
    run(jobs); });
  $('#exCancel').addEventListener('click', () => { cancel = true; });
  $('#cueSave').addEventListener('click', () => saveFile(new Blob([JSON.stringify(serializeSheet(app.cues.sheet), null, 1)], { type: 'application/json' }), slug(P().title) + '.cues.json'));
  // batch
  const bt = $('#batchTpl'); bt.innerHTML = LOOKS.map((id) => `<label class="tog"><input type="checkbox" data-btpl="${id}"> ${LOOK_NAMES[id]}</label>`).join('');
  function syncBatch() { const ex = P().export; $$('[data-btpl]').forEach((c) => (c.checked = ex.batch.includes(c.dataset.btpl))); $$('[data-blen]').forEach((c) => (c.checked = ex.batchLens.includes(+c.dataset.blen))); }
  bt.addEventListener('change', () => app.store.set({ project: { export: { batch: $$('[data-btpl]').filter((c) => c.checked).map((c) => c.dataset.btpl) } } }));
  $$('[data-blen]').forEach((c) => c.addEventListener('change', () => app.store.set({ project: { export: { batchLens: $$('[data-blen]').filter((x) => x.checked).map((x) => +x.dataset.blen) } } })));
  $('#batchBtn').addEventListener('click', () => { const base = app.store.snapshot(), tr = app.store.session.track, jobs = [];
    for (const id of base.export.batch) for (const L of (base.export.batchLens.length ? base.export.batchLens : [15])) { const p = JSON.parse(JSON.stringify(base)); p.look = id; const w = app.hook(tr, L); p.inT = w[0]; p.outT = w[1];
      jobs.push({ project: p, name: nameFor(p), sheet: async () => { const e = await app.clip.ensure(p.inT, p.outT); return generateSheet({ bars: e.bars, labels: e.labels, look: id, stage: p.stage, aspect: p.aspect }); } }); }
    if (!jobs.length) { status('Tick at least one look for the batch.'); return; } run(jobs); });
  // voice tag
  $('#vtFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const b = await app.clock.ctx.decodeAudioData(await f.arrayBuffer()); app.store.set({ session: { voiceTag: b }, project: { export: { voiceTag: true } } }); $('#vtInfo').textContent = `${f.name} · ${b.duration.toFixed(1)} s`; $('#vtOn').checked = true; } catch (_) { $('#vtInfo').textContent = 'could not decode that file'; } });
  syncBatch();
  return { info, syncBatch, run, renderVideo, addResult, nameFor, sheetFor, dims,
    /** v21 queue: cancel the running render / reset the flag before a new one. */
    cancel() { cancel = true; }, resetCancel() { cancel = false; }, get cancelled() { return cancel; } };
}
