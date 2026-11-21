// v21 METADATA (right panel → Meta): every metadata field of the video in one panel, and a search over every word on screen.
//   Title, producer, BPM, key (project + analysis grid), date and tags (tags `date`, `player.meta.tags`), and the metadata
//   card's FORMAT / DURATION / SIZE values. Those three come from the audio file; an override is kept per project
//   (project.meta = { bits, sr, bytes, duration }) and applied to the section's film data (the film reads D.fileInfo and
//   D.song.duration at draw time), so the preview, Review and the export all show it. Empty = from the file.
//   Search: every tag leaf (the merged tag document) and the fields above; type to filter by path or text, edit in place.
// API: app.meta = { fields(), set(field, value), search(q), apply(entry) }.
import { flattenTags, mergeDeep } from '../cues/schema.js';
import { DEFAULT_TAGS } from '../v8/tags.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const getp = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const parseDur = (v) => { v = String(v).trim(); if (!v) return null; const m = v.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2]; const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };

export function setTagIn(s, path, v) { const parts = path.split('.'); s.tags = s.tags || {}; let o = s.tags;
  for (let i = 0; i < parts.length - 1; i++) { const pre = parts.slice(0, i + 1).join('.'), d = getp(DEFAULT_TAGS, pre); if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = Array.isArray(d) ? [...d] : {}; o = o[parts[i]]; }
  o[parts[parts.length - 1]] = v; }

export function createMetadata(app) {
  const P = () => app.store.project, track = () => app.store.session.track;
  // ---- the override, applied to every film the renderer asks for
  function apply(e) {
    if (!e || !e.D) return; const D = e.D, m = P().meta || {};
    if (!D.__orig) Object.defineProperty(D, '__orig', { value: { fileInfo: { ...(D.fileInfo || {}) }, duration: D.song.duration }, enumerable: false });
    const o = D.__orig, fi = { ...o.fileInfo }; if (m.bits != null) fi.bits = m.bits || null; if (m.sr) fi.sr = m.sr; if (m.bytes != null) fi.bytes = m.bytes;
    D.fileInfo = fi; D.song.duration = m.duration || o.duration;
  }
  const film0 = app.clip.film; app.clip.film = (e, aspect) => { apply(e); return film0(e, aspect); };
  const tags = () => mergeDeep(DEFAULT_TAGS, app.cues.sheet.tags || {});
  function fileInfo() { const tr = track(), fi = (tr && tr.meta && tr.meta.fileInfo) || {}; return { sr: fi.sr || (app.store.session.buffer && app.store.session.buffer.sampleRate) || 48000, bits: fi.bits || null, bytes: fi.bytes || null, duration: tr ? tr.duration : 0 }; }
  /** The effective values of every field (what the video shows). */
  function fields() { const p = P(), m = p.meta || {}, fi = fileInfo(), tg = tags(), tr = track();
    const bits = m.bits != null ? m.bits : fi.bits, sr = m.sr || fi.sr;
    return { title: p.title, producer: tg.producer !== '@uche2crazy' ? tg.producer : p.producer, bpm: tr ? Math.round(tr.bpm * 100) / 100 : null, key: p.key || (tr ? tr.key : ''), date: tg.date, tags: tg.player && tg.player.meta ? tg.player.meta.tags : '',
      format: bits ? `WAV ${bits}-BIT · ${+(sr / 1000).toFixed(1)} KHZ` : `WAV · ${+(sr / 1000).toFixed(1)} KHZ`, bits, sr, size: (m.bytes != null ? m.bytes : fi.bytes) ? ((m.bytes != null ? m.bytes : fi.bytes) / 1048576).toFixed(1) + ' MB' : '—',
      sizeMB: (m.bytes != null ? m.bytes : fi.bytes) ? +((m.bytes != null ? m.bytes : fi.bytes) / 1048576).toFixed(2) : null, duration: mmss(m.duration || fi.duration), durationSec: m.duration || fi.duration, overridden: { bits: m.bits != null, sr: !!m.sr, bytes: m.bytes != null, duration: !!m.duration } }; }
  const fire = (id, type) => { const el = $('#' + id); if (el) el.dispatchEvent(new Event(type, { bubbles: true })); };
  function setMeta(patch) { app.store.set({ project: { meta: patch } }, 'meta'); app.studio.markDirty(); render(); }
  /** Set one field: title, producer, bpm, key, date, tags, bits, sr, sizeMB, duration (seconds or m:ss). Empty resets file fields. */
  function set(field, v) {
    switch (field) {
      case 'title': { const pt = $('#projTitle'); pt.value = v; fire('projTitle', 'input'); fire('projTitle', 'change'); break; }
      case 'producer': { const ft = $('#fTag'); ft.value = v; fire('fTag', 'input'); app.cues.edit((s) => setTagIn(s, 'producer', v), 'producer'); break; }
      case 'bpm': app.actions.setBpm(+v); break;
      case 'key': { const k = $('#sKey'); k.value = v; fire('sKey', 'change'); break; }
      case 'date': app.cues.edit((s) => setTagIn(s, 'date', v || '{today}'), 'date'); break;
      case 'tags': app.cues.edit((s) => setTagIn(s, 'player.meta.tags', v), 'metadata tags'); break;
      case 'bits': setMeta({ bits: v === '' || v == null ? null : +v || 0 }); break;
      case 'sr': setMeta({ sr: v === '' || v == null ? null : +v }); break;
      case 'sizeMB': setMeta({ bytes: v === '' || v == null ? null : Math.round(+v * 1048576) }); break;
      case 'duration': setMeta({ duration: v === '' || v == null ? null : parseDur(v) }); break;
      default: return false;
    }
    app.studio.markDirty(); render(); return true;
  }
  // ---- the panel
  const root = $('#metaForm');
  function render() {
    if (root.contains(document.activeElement)) return; const f = fields(), o = f.overridden, fi = fileInfo();
    const row = (id, label, html, note = '') => `<div class="field"><label class="lbl" for="${id}">${label}${note ? ` <span class="hint">${note}</span>` : ''}</label>${html}</div>`;
    root.innerHTML = row('mTitle', 'Title', `<input class="inp" id="mTitle" data-f="title" value="${esc(f.title)}">`) +
      row('mProd', 'Producer', `<input class="inp" id="mProd" data-f="producer" value="${esc(f.producer)}">`) +
      `<div class="grid2">${row('mBpm', 'BPM', `<input class="inp mono" id="mBpm" data-f="bpm" type="number" min="40" max="250" step="0.01" value="${f.bpm ?? ''}">`, 'regrids')}${row('mKey', 'Key', `<input class="inp mono" id="mKey" data-f="key" value="${esc(f.key)}">`)}</div>` +
      `<div class="grid2">${row('mBits', 'Bit depth', `<select class="inp mono" id="mBits" data-f="bits"><option value="">file (${fi.bits ? fi.bits + '-bit' : 'n/a'})</option>${[16, 24, 32].map((b) => `<option value="${b}"${o.bits && f.bits === b ? ' selected' : ''}>${b}-bit</option>`).join('')}<option value="0"${o.bits && !f.bits ? ' selected' : ''}>hide</option></select>`)}
        ${row('mSr', 'Sample rate', `<select class="inp mono" id="mSr" data-f="sr"><option value="">file (${fi.sr / 1000} kHz)</option>${[44100, 48000, 88200, 96000].map((r) => `<option value="${r}"${o.sr && f.sr === r ? ' selected' : ''}>${r / 1000} kHz</option>`).join('')}</select>`)}</div>` +
      `<div class="grid2">${row('mDur', 'Duration', `<input class="inp mono" id="mDur" data-f="duration" placeholder="${mmss(fi.duration)}" value="${o.duration ? esc(f.duration) : ''}">`, o.duration ? 'override' : 'from the file')}
        ${row('mSize', 'Size (MB)', `<input class="inp mono" id="mSize" data-f="sizeMB" type="number" min="0" step="0.1" placeholder="${fi.bytes ? (fi.bytes / 1048576).toFixed(1) : '—'}" value="${o.bytes ? f.sizeMB : ''}">`, o.bytes ? 'override' : 'from the file')}</div>` +
      row('mDate', 'Date', `<div class="inrow"><input class="inp mono" id="mDate" data-f="date" value="${esc(f.date)}" style="flex:1"><button class="btn small" type="button" data-today>Today</button></div>`, '{today} = the render date') +
      row('mTags', 'Tags', `<input class="inp" id="mTags" data-f="tags" value="${esc(f.tags)}">`) +
      `<p class="hint" id="metaCard">Card: ${esc(f.format)} · ${esc(f.duration)} · ${esc(f.size)} · ${esc(String(f.date).toUpperCase())} · ${esc(String(f.tags).toUpperCase())}</p>` +
      `<div class="inrow"><button class="btn small" type="button" id="metaReset">Reset file values</button></div>`;
  }
  root.addEventListener('change', (e) => { const k = e.target.dataset.f; if (k) { e.target.blur(); set(k, e.target.value); } });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.f && e.target.tagName === 'INPUT') e.target.blur(); });
  root.addEventListener('click', (e) => { if (e.target.closest('[data-today]')) set('date', '{today}'); if (e.target.id === 'metaReset') setMeta({ bits: null, sr: null, bytes: null, duration: null }); });
  // ---- search every word
  function search(q) { q = String(q || '').trim().toLowerCase(); const flat = flattenTags(tags()), out = [];
    for (const [k, v] of Object.entries(flat)) if (!q || k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)) out.push({ path: k, value: String(v), kind: 'tag' });
    return out; }
  const sroot = $('#wordResults');
  function renderSearch() { if (sroot.contains(document.activeElement)) return; const q = $('#wordSearch').value, R = search(q), n = R.length;
    $('#wordCount').textContent = q ? `${n} match${n === 1 ? '' : 'es'}` : `${n} words and lines`;
    const hl = (s) => { const t = esc(s); if (!q) return t; const i = s.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? t : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
    sroot.innerHTML = R.slice(0, 120).map((r) => `<label class="tagrow"><code>${hl(r.path)}</code><input class="inp mono" data-tag="${esc(r.path)}" value="${esc(r.value)}" aria-label="${esc(r.path)}"></label>`).join('') + (n > 120 ? `<p class="hint">${n - 120} more: refine the search</p>` : ''); }
  $('#wordSearch').addEventListener('input', renderSearch);
  sroot.addEventListener('focusin', (e) => { if (e.target.dataset.tag) app.cues.begin(); });
  sroot.addEventListener('input', (e) => { const el = e.target; if (el.dataset.tag) app.cues.preview((s) => setTagIn(s, el.dataset.tag, el.value)); });
  sroot.addEventListener('focusout', (e) => { if (e.target.dataset.tag) { app.cues.commit('text'); render(); } });
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved') { render(); renderSearch(); } });
  app.store.subscribe((s, keys) => { if (keys.some((k) => /project\.(title|producer|key|meta)|session\.track/.test(k))) render(); });
  render(); renderSearch();
  /** Focus a word (palette "jump to"): open Meta, fill the search with its path, focus its field. */
  function focusWord(path) { const tab = document.querySelector('.tabs [data-tab="meta"]'); if (tab) tab.click(); const s = $('#wordSearch'); s.value = path; renderSearch(); const el = sroot.querySelector(`[data-tag="${CSS.escape(path)}"]`); if (el) { el.focus(); el.select(); } }
  return { fields, set, search, apply, render, focusWord };
}
