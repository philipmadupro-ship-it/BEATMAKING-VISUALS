// Export tab: single export (offline MP4 via Mediabunny, MediaRecorder fallback), batch sets, thumbnails, voice tag.
import { TEMPLATES, TEMPLATE_LIST, applyDefaults } from '../templates/index.js';
import { ASPECTS } from '../engine/layout.js';
import { makeSurface } from '../engine/render.js';
import { prepareAudio } from '../export/audio.js';
import { canOffline, exportOffline } from '../export/offline.js';
import { exportRealtime } from '../export/recorder.js';
import { saveFile } from '../export/save.js';
import { slug, fmtTC, FONT_COND, mono, rgba } from '../util/draw.js';
import { resolvePalette, FAMILIES } from '../brand/palettes.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
export function createExporter(app) {
  let cancel = false; const P = () => app.store.project;
  const status = m => { $('#exStatus').textContent = m; }, prog = q => { $('#exProg').style.width = (q * 100).toFixed(1) + '%'; };
  const urls = new Set(); const track = u => { urls.add(u); return u; }, revoke = u => { if (urls.delete(u)) URL.revokeObjectURL(u); };
  const dims = p => { const { W, H } = ASPECTS[p.aspect], k = p.export.draft ? 2 / 3 : 1; return { W: Math.round(W * k / 2) * 2, H: Math.round(H * k / 2) * 2, mbps: p.export.draft ? Math.max(4, p.export.mbps * .5) : p.export.mbps }; };
  async function info() { const p = P(), tr = app.store.session.track; if (!tr) return; const { W, H, mbps } = dims(p), len = p.outT - p.inT;
    const c = await canOffline(app.libs.mediabunny, W, H, mbps, p.export.fps);
    $('#exKv').innerHTML = `<dt>Look</dt><dd>${TEMPLATES[p.tpl].name} · ${resolvePalette(p).name}</dd><dt>Frame</dt><dd>${W}×${H} · ${p.export.fps} fps · ${mbps} Mbps${p.export.draft ? ' · draft' : ''}</dd><dt>Section</dt><dd>${fmtTC(p.inT)} → ${fmtTC(p.outT)} (${len.toFixed(1)} s, ${(len / tr.barDur).toFixed(1)} bars)</dd>
      <dt>Encoder</dt><dd>${c ? `offline · ${c.container.toUpperCase()} · ${c.v === 'avc' ? 'H.264' : c.v.toUpperCase()} (${c.hw === 'prefer-hardware' ? 'hardware preferred' : 'software'}) + ${c.a.toUpperCase()} 48 kHz` : 'real-time MediaRecorder'}</dd>`; }
  /** Render one project section to a video blob. */
  async function renderVideo(project, label, onProg) {
    const tr = app.store.session.track, buf = app.store.session.buffer, ex = project.export, { W, H, mbps } = dims(project);
    status(`Preparing audio for ${label}…`);
    const au = await prepareAudio(buf, project, { loopSafe: ex.loopSafe, xf: Math.min(tr.spb, (project.outT - project.inT) / 4), loudness: ex.loudness, voiceTag: ex.voiceTag ? app.store.session.voiceTag : null, voiceEvery: ex.voiceEvery });
    $('#loudKv').innerHTML = `<dt>Measured in</dt><dd>${au.stats.inLufs.toFixed(1)} LUFS</dd><dt>Gain</dt><dd>${au.stats.gainDb >= 0 ? '+' : ''}${au.stats.gainDb.toFixed(1)} dB</dd><dt>Out</dt><dd>${au.stats.outLufs.toFixed(1)} LUFS · peak ${au.stats.peakDb.toFixed(1)} dBTP (approx.)</dd>`;
    // the renderer's own output canvas is handed to the encoder: one Pixi render per frame, no copies
    const work = makeSurface(W, H), render = t => app.renderFrame(t, work, project, tr);
    const rate = (q, s, n) => { const fps = n / Math.max(.001, s), eta = q >= 1 ? 0 : Math.max(0, Math.round((n / Math.max(q, 1e-6) - n) / Math.max(fps, .001))); $('#exRate').textContent = `${fps.toFixed(1)} fps · ETA ${eta} s`; };
    const codecs = await canOffline(app.libs.mediabunny, W, H, mbps, ex.fps); let res;
    if (codecs) { try { res = await exportOffline({ mb: app.libs.mediabunny, codecs, W, H, fps: ex.fps, mbps, inT: project.inT, outT: project.outT, audio: au.buffer, render, isCancelled: () => cancel,
        onProgress: (q, s, n) => { onProg(q); rate(q, s, n); status(`Encoding ${label}: ${Math.round(q * 100)}%`); } }); } catch (e) { console.warn('[u2c] offline export failed, falling back to real time', e); res = undefined; } }
    if (res === undefined) res = await exportRealtime({ ac: app.clock.ctx, W, H, fps: ex.fps, mbps, inT: project.inT, outT: project.outT, audio: au.buffer, monitor: false, render, isCancelled: () => cancel,
      onProgress: q => { onProg(q); status(`Recording ${label} in real time: ${Math.round(q * 100)}%`); } });
    if (res) res.stats = au.stats; return res;
  }
  function addResult(res, name) { const url = track(URL.createObjectURL(res.blob)), el = document.createElement('div'); el.className = 'res'; el.dataset.size = res.blob.size; el.dataset.type = res.type; el.dataset.fps = res.fps ? res.fps.toFixed(2) : '';
    el.innerHTML = `<b>${name}</b><button class="btn small primary">Save</button><span>${(res.blob.size / 1048576).toFixed(2)} MB · ${res.type} · ${res.codecs.v}${res.codecs.a ? '+' + res.codecs.a : ''}${res.seconds ? ' · rendered in ' + res.seconds.toFixed(1) + ' s (' + res.fps.toFixed(1) + ' fps)' : ''}</span><video controls playsinline muted src="${url}"></video>`;
    el.querySelector('button').onclick = async () => { const r = await saveFile(res.blob, name); el.querySelector('span').textContent += r === 'declined' ? ' · save cancelled' : ' · saved'; };
    $('#results').prepend(el); app.motion.viewIn(el);
    // keep the 6 newest results; free the blobs of older ones
    $$('#results .res').slice(6).forEach(x => { const v = x.querySelector('video'); if (v) revoke(v.src); x.remove(); }); }
  async function run(jobs) {
    if (app.store.session.exporting || !app.store.session.track) return; app.clock.pause(); cancel = false; app.store.set({ session: { exporting: true } });
    $('#exBtn').disabled = $('#batchBtn').disabled = true; $('#exCancel').hidden = false;
    try { for (let j = 0; j < jobs.length; j++) { const { project, name } = jobs[j]; const res = await renderVideo(project, `${name} (${j + 1}/${jobs.length})`, q => prog((j + q) / jobs.length));
        if (!res) { status('Export cancelled.'); break; } addResult(res, name + '.' + res.ext); }
      if (!cancel) status(jobs.length > 1 ? `Done: ${jobs.length} videos. Save them below.` : 'Done. Preview and save it below.'); }
    catch (e) { console.error(e); status('Export failed: ' + e.message); }
    finally { app.store.set({ session: { exporting: false } }); $('#exBtn').disabled = $('#batchBtn').disabled = false; $('#exCancel').hidden = true; prog(cancel ? 0 : 1); app.studio.markDirty(); }
  }
  const nameFor = p => `${slug(p.text.lines.title.text)}_${TEMPLATES[p.tpl].id}_${p.aspect === '916' ? '9x16' : '16x9'}_${Math.round(p.outT - p.inT)}s${p.export.voiceTag ? '_tagged' : ''}${p.export.draft ? '_draft' : ''}`;
  $('#exBtn').addEventListener('click', () => { const p = app.store.snapshot(); run([{ project: p, name: nameFor(p) }]); });
  $('#exCancel').addEventListener('click', () => { cancel = true; });
  $('#ytBtn').addEventListener('click', () => { app.actions.setAspect('169'); app.actions.applyHook('full'); info(); status('Set to 16:9 full length for YouTube. Press Export MP4.'); });
  // batch
  const bt = $('#batchTpl'); bt.innerHTML = TEMPLATE_LIST.map(t => `<label class="tog"><input type="checkbox" data-btpl="${t.id}"> ${t.name}</label>`).join('');
  function syncBatch() { const ex = P().export; $$('[data-btpl]').forEach(c => c.checked = ex.batch.includes(c.dataset.btpl)); $$('[data-blen]').forEach(c => c.checked = ex.batchLens.includes(+c.dataset.blen)); }
  bt.addEventListener('change', () => app.store.set({ project: { export: { batch: $$('[data-btpl]').filter(c => c.checked).map(c => c.dataset.btpl) } } }));
  $$('[data-blen]').forEach(c => c.addEventListener('change', () => app.store.set({ project: { export: { batchLens: $$('[data-blen]').filter(c => c.checked).map(c => +c.dataset.blen) } } })));
  $('#batchBtn').addEventListener('click', () => { const base = app.store.snapshot(), tr = app.store.session.track, jobs = [];
    for (const id of base.export.batch) for (const L of (base.export.batchLens.length ? base.export.batchLens : [15])) { const p = JSON.parse(JSON.stringify(base)); p.tpl = id; applyDefaults(p, id); const w = app.hook(tr, L); p.inT = w[0]; p.outT = w[1]; jobs.push({ project: p, name: nameFor(p) }); }
    if (!jobs.length) { status('Tick at least one look for the batch.'); return; } run(jobs); });
  // voice tag
  $('#vtFile').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; try { const b = await app.clock.ctx.decodeAudioData(await f.arrayBuffer()); app.store.set({ session: { voiceTag: b }, project: { export: { voiceTag: true } } }); $('#vtInfo').textContent = `${f.name} · ${b.duration.toFixed(1)} s`; $('#vtOn').checked = true; } catch (_) { $('#vtInfo').textContent = 'Could not read that file.'; } e.target.value = ''; });
  // thumbnails (YouTube 1280x720, bottom-right kept clear for the duration badge)
  $('#thumbBtn').addEventListener('click', async () => { const tr = app.store.session.track; if (!tr) return; const box = $('#thumbs'); box.querySelectorAll('img').forEach(im => revoke(im.src)); box.innerHTML = '';
    const base = app.store.snapshot(); base.aspect = '169'; applyDefaults(base, base.tpl); const w = app.hook(tr, 15); base.inT = w[0]; base.outT = w[1];
    const work = makeSurface(1280, 720), times = [w[0] + .04, w[0] + 8 * tr.spb + .03, w[0] + 2 * tr.barDur + 2 * tr.spb + .03], pals = [base.pal, ...['charcoal', 'rust', 'amethyst'].filter(x => !(FAMILIES[x] || []).includes(base.pal))].slice(0, 3);
    for (let i = 0; i < 3; i++) { const p = JSON.parse(JSON.stringify(base)); p.pal = pals[i]; const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const g = c.getContext('2d');
      app.renderFrame(times[i], work, p, tr, { target: g }); const pal = resolvePalette(p);
      g.fillStyle = rgba(pal.dark, .78); g.fillRect(0, 430, 860, 220); g.font = `150px ${FONT_COND}`; g.fillStyle = pal.main; g.textBaseline = 'alphabetic';
      const nm = (p.text.lines.title.text || 'U2C').toUpperCase(); let fsz = 150; while (g.measureText(nm).width > 800 && fsz > 40) { fsz -= 6; g.font = `${fsz}px ${FONT_COND}`; } g.fillText(nm, 40, 580);
      g.font = mono(34, 700); g.fillStyle = pal.hi; g.fillText(`${Math.round(tr.bpm)} BPM · ${(p.text.lines.key.text || '').toUpperCase()} · ${p.text.artistA} x ${p.text.artistB}`.toUpperCase(), 44, 630);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const img = document.createElement('img'); img.src = track(URL.createObjectURL(blob)); img.alt = 'Thumbnail variant ' + (i + 1); img.title = 'Click to save'; img.style.cursor = 'pointer';
      img.onclick = () => saveFile(blob, `${slug(p.text.lines.title.text)}_thumb_${i + 1}.png`); box.appendChild(img); }
    app.studio.markDirty(); });
  return { info, syncBatch };
}
