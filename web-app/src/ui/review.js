// v20 REVIEW (the last step before export / upload): renders the video's key moments exactly as the MP4 will have them (same
// renderFrame, same pre-roll, same motion blur), runs the checks (covers, loop seam, text fit, length, blur / intro / clicks / video
// layer) and lists every word in the video as editable fields (tags; edits are live and undoable). Click a frame = playhead there.
import { PRE_S } from '../cues/generate.js';
import { makeSurface, createBlur } from '../engine/render.js';
import { DEFAULT_TAGS } from '../v8/tags.js';
import { mergeDeep } from '../cues/schema.js';
import { fmtTC } from '../util/draw.js';
import { setTagIn } from './metadata.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const getp = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const FIELDS = [['title', 'Beat title', 'proj'], ['producer', 'Producer tag'], ['social.title', 'Hook window title'], ['social.hook', 'Hook (frame 0, sound off)'],
  ['social.cta1.title', 'CTA 1 window'], ['social.cta1.body', 'CTA 1 text'], ['social.cta1.sub', 'CTA 1 small print'],
  ['social.cta2.title', 'CTA 2 window'], ['social.cta2.body', 'CTA 2 text'], ['social.cta2.sub', 'CTA 2 small print'],
  ['social.terminal.0', 'Terminal line 1'], ['social.terminal.1', 'Terminal line 2'], ['social.terminal.2', 'Terminal line 3'], ['social.terminal.3', 'Terminal line 4'],
  ['social.outro.title', 'Outro dialog window'], ['social.outro.body', 'Outro dialog text'], ['social.outro.sub', 'Outro small print'],
  ['social.caption', 'Post caption (not in the video)', 'area'], ['social.hashtags', 'Hashtags (not in the video)', 'area']];

export function createReview(app) {
  const dlg = $('#review'), P = () => app.store.project;
  const setTag = setTagIn;   // v22: array tags (social.terminal[n]) stay arrays
  function moments(p, tr, PRE) {
    const spb = tr.spb, ev = app.cues.ev(), out = [], add = (label, t, note = '') => { if (t >= p.inT - PRE - 1e-6 && t <= p.outT) out.push({ label, t, note }); };
    if (PRE > 0) { add('Frame 0 · thumbnail', p.inT - PRE, 'what the feed shows'); add('Hook + browse', p.inT - PRE + 0.8); add('Cursor picks the cover', p.inT - 0.5); }
    else add('Frame 0 · thumbnail', p.inT);
    add('Beat drops · push in', p.inT + 2 * spb);
    const cam = (app.cues.sheet.tracks.find((x) => x.path === 'camera.shot') || { keys: [] }).keys.slice().sort((a, b) => a.b - b.b);
    for (const k of cam) add(k.v === 'wide' ? 'Wide' : `Window · ${k.v}`, p.inT + (k.b + 0.6) * spb);
    if (p.look === 'player') for (const c of ['cta1', 'cta2']) { const at = +ev.value(`social.${c}.at`, 0, NaN); if (at === at) add(c === 'cta1' ? 'CTA 1 pop-up' : 'CTA 2 pop-up', p.inT + (at + 1.5) * spb); }
    add('Last frame', p.outT - 1 / (p.export.fps || 30), 'must match frame 0');
    return out.sort((a, b) => a.t - b.t);
  }
  const diff = (a, b) => { const A = a.ctx.getImageData(0, 0, a.w, a.h).data, B = b.ctx.getImageData(0, 0, b.w, b.h).data; let s = 0; for (let i = 0; i < A.length; i += 4) s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); return s / (A.length / 4) / 3; };
  async function frames() {
    const p = P(), tr = app.store.session.track; if (!tr) return; const ex = p.export, PRE = ex.preroll !== false && p.look === 'player' ? PRE_S : 0, port = p.aspect === '916';
    const W = port ? 216 : 320, H = port ? 384 : 180, entry = await app.clip.ensure(p.inT, p.outT), list = moments(p, tr, PRE), root = $('#revFrames'); root.innerHTML = '';
    const one = (t, s, info) => app.renderFrame(t, s, p, tr, { entry, fps: ex.fps, info, preroll: PRE });
    for (const m of list) {
      const s = makeSurface(W, H), b = document.createElement('button'); b.className = 'rev-fr'; b.type = 'button';
      const blurF = createBlur(); if (ex.mblur !== false) blurF(one, m.t, s, ex.fps, ex.shutter ?? 0.5); else one(m.t, s, {});
      s.canvas.setAttribute('aria-hidden', 'true'); b.append(s.canvas); b.insertAdjacentHTML('beforeend', `<b>${esc(m.label)}</b><span>${m.t < p.inT ? '−' + (p.inT - m.t).toFixed(2) + ' s intro' : fmtTC(m.t - p.inT)}${m.note ? ' · ' + esc(m.note) : ''}</span>`);
      b.onclick = () => { app.actions.seek(Math.max(p.inT, m.t)); dlg.close(); }; root.append(b);
      await new Promise((r) => setTimeout(r, 0));   // keep the page responsive while the frames draw
    }
    // checks
    const c = []; const ok = (t, lvl = '') => c.push([t, lvl]);
    const a0 = makeSurface(108, 192), a1 = makeSurface(108, 192); one(p.inT - PRE, a0, {}); one(p.outT - 1 / ex.fps, a1, {}); const seam = diff(a0, a1);
    ok(p.look === 'player' ? (seam < 6 ? `Loop seam clean (difference ${seam.toFixed(1)})` : `Loop seam jumps (difference ${seam.toFixed(1)}): the last frame does not match frame 0`) : `Loop seam difference ${seam.toFixed(1)}`, p.look === 'player' && seam >= 6 ? 'bad' : '');
    const cv = app.media ? app.media.list() : []; const mine = cv.filter((x) => x.user).length;
    ok(cv[0] && cv[0].user ? `Beat cover: ${cv[0].name}${cv[0].w < 1000 ? ' (low resolution: under 1000 px)' : ''}` : 'Beat cover is the built-in one: drop yours in Media', cv[0] && cv[0].user ? (cv[0].w < 1000 ? 'warn' : '') : 'warn');
    ok(`${mine} of ${cv.length} covers are yours`, mine < cv.length ? 'warn' : '');
    const len = p.outT - p.inT + PRE; ok(`Length ${len.toFixed(1)} s${PRE ? ` (incl. ${PRE} s intro)` : ''} · ${port ? '9:16' : '16:9'} · ${ex.fps} fps`);
    ok(ex.mblur !== false ? 'Motion blur on (as previewed with Blur)' : 'Motion blur off', ex.mblur !== false ? '' : 'warn');
    if (p.look === 'player') { ok(PRE ? 'Click-to-play intro on' : 'Click-to-play intro off: the video starts mid-beat', PRE ? '' : 'warn'); ok(ex.clicks !== false ? 'UI click sounds on' : 'UI click sounds off'); }
    ok(app.videoLayer && app.videoLayer.loaded ? 'Video layer loaded' : 'No video layer (optional)');
    const tags = app.cues.tags(''), long = FIELDS.filter(([k, , kind]) => kind !== 'area' && kind !== 'proj' && String(getp(tags, k) || '').length > 34).map(([, l]) => l);
    if (long.length) ok(`Long text may shrink: ${long.join(', ')}`, 'warn');
    $('#revChecks').innerHTML = c.map(([t, l]) => `<li class="${l}">${esc(t)}</li>`).join('');
    $('#revSum').textContent = `${list.length} moments · ${c.filter((x) => x[1] === 'bad').length ? 'fix the red check first' : c.filter((x) => x[1] === 'warn').length + ' notes'}`;
  }
  function fields() {
    const tags = mergeDeep(DEFAULT_TAGS, app.cues.sheet.tags);
    $('#revFields').innerHTML = FIELDS.map(([k, label, kind]) => { const v = kind === 'proj' ? ($('#projTitle') ? $('#projTitle').value : '') : getp(tags, k) ?? '';
      return `<label>${esc(label)}${kind === 'area' ? `<textarea rows="3" data-k="${esc(k)}">${esc(v)}</textarea>` : `<input data-k="${esc(k)}" data-kind="${kind || ''}" value="${esc(v)}">`}</label>`; }).join('');
  }
  let refreshT = 0;
  $('#revFields').addEventListener('focusin', (e) => { if (e.target.dataset.k && e.target.dataset.kind !== 'proj') app.cues.begin(); });
  $('#revFields').addEventListener('input', (e) => { const el = e.target, k = el.dataset.k; if (!k) return;
    if (el.dataset.kind === 'proj') { const pt = $('#projTitle'); pt.value = el.value; pt.dispatchEvent(new Event('input', { bubbles: true })); }
    else app.cues.preview((s) => setTag(s, k, el.value));
    app.studio.markDirty(); clearTimeout(refreshT); refreshT = setTimeout(frames, 700); });
  $('#revFields').addEventListener('focusout', (e) => { const el = e.target; if (!el.dataset.k) return; if (el.dataset.kind === 'proj') $('#projTitle').dispatchEvent(new Event('change', { bubbles: true })); else app.cues.commit('text'); });
  async function open() { if (!app.store.session.track) return; fields(); dlg.showModal(); $('#revFrames').innerHTML = '<p class="hint">rendering the key moments…</p>'; await frames(); }
  $('#reviewBtn').addEventListener('click', open);
  $('#revClose').addEventListener('click', () => dlg.close());
  $('#revRefresh').addEventListener('click', frames);
  $('#revExport').addEventListener('click', () => { dlg.close(); $('#exBtn').click(); });
  return { open, frames, moments };
}
