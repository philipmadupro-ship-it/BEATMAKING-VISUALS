// v21 MARKER LIST (left rail → Markers; Premiere's Markers panel): every sheet marker and section start in time order.
// Click the time to jump (the playhead moves, the lanes scroll), type to rename (one undo step per field), × deletes,
// "+ Marker" adds one at the playhead (as M). The filter matches labels. API: app.markerList = { refresh, items() }.
import { MARKER_COLOR, MARKER_KIND_LABEL } from '../cues/markers.js';
import { MARKER_KINDS } from '../cues/schema.js';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function createMarkerList(app) {
  const root = $('#markerItems'), P = () => app.store.project, tl = () => app.cuetl;
  function items() {
    const tr = app.store.session.track, e = app.clip.current(), out = [];
    for (const m of app.cues.sheet.markers || []) out.push({ id: m.id, b: m.b, label: m.label || '', kind: 'marker', mk: m.kind || 'cue', user: true });
    if (e && e.ready) { let last = ''; e.labels.forEach((lab, i) => { if (lab !== last) out.push({ id: 'sec' + i, b: i * 4, label: lab, kind: 'section', user: false }); last = lab; }); }
    void tr; return out.sort((a, b) => a.b - b.b || (a.user ? 1 : -1));
  }
  let last = '';
  function refresh() {
    if (root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const f = ($('#markerFilter').value || '').toLowerCase(), L = items().filter((m) => !f || m.label.toLowerCase().includes(f) || m.kind.includes(f)), ph = tl() ? tl().state.playhead : 0;
    $('#markerCount').textContent = `${(app.cues.sheet.markers || []).length} markers`;
    const html = L.length ? L.map((m) => `<li class="mk ${m.kind}${Math.abs(m.b - ph) < 1e-3 ? ' here' : ''}" data-id="${esc(m.id)}">
      <button class="mk-t" data-b="${m.b}" aria-label="Go to ${esc(m.label || m.kind)} at ${tl() ? tl().bbt(m.b) : m.b}">${tl() ? tl().bbt(m.b) : m.b}</button>
      ${m.user ? `<i class="mk-chip" style="background:${MARKER_COLOR[m.mk] || '#e7e2d6'}" aria-hidden="true"></i><input class="inp small mk-l" value="${esc(m.label)}" aria-label="Marker name" data-id="${esc(m.id)}"><select class="inp small mk-k" data-id="${esc(m.id)}" aria-label="Marker type" data-tip="Marker type|Colour label. Chapter markers become YouTube chapters; CTA marks where a call to action should pop.|">${MARKER_KINDS.map((k) => `<option value="${k}"${k === m.mk ? ' selected' : ''}>${MARKER_KIND_LABEL[k] || k}</option>`).join('')}</select><button class="mk-v" data-visit="${m.b}" aria-label="Camera visit here" data-tip="Visit here|Adds a camera stop to the hero card at this marker (snapped to the bar).|">◎</button><button class="mk-x" data-del="${esc(m.id)}" aria-label="Delete marker ${esc(m.label)}">×</button>` : `<span class="mk-s">${esc(m.label)}</span><span class="hint">section</span>`}</li>`).join('')
      : '<li class="hint">No markers yet. Press M on the timeline or use + Marker.</li>';
    if (html !== last) { last = html; root.innerHTML = html; }   // unchanged lists keep their DOM (a click in flight is never lost)
  }
  const seekBeat = (b) => { const tr = app.store.session.track; if (!tr) return; app.actions.seek(P().inT + Math.round(b * tr.spb * 30) / 30); const T = tl(), V = T.view(); if (b < V.a || b > V.z) { T.state.scroll = Math.max(0, b - (V.z - V.a) / 4); T.markDirty(); } };
  root.addEventListener('click', (e) => { const t = e.target.closest('[data-b]'); if (t) { seekBeat(+t.dataset.b); return; }
    const d = e.target.closest('[data-del]'); if (d) { const id = d.dataset.del; app.cues.edit((s) => { s.markers = (s.markers || []).filter((m) => m.id !== id); }, 'delete marker'); } });
  root.addEventListener('change', (e) => { const el = e.target; if (!el.classList.contains('mk-k')) return; app.cues.edit((s) => { const m = (s.markers || []).find((q) => q.id === el.dataset.id); if (m) m.kind = el.value; }, 'marker type'); });
  // v23: camera visit at a marker; previous / next marker; YouTube chapters from the Chapter markers (sections when there are none)
  root.addEventListener('click', (e) => { const v = e.target.closest('[data-visit]'); if (!v) return; const bb = Math.max(4, Math.round(+v.dataset.visit / 4) * 4);
    app.cues.edit((s) => { const t = s.tracks.find((q) => q.path === 'camera.shot'); if (!t) return; t.auto = false; t.keys = t.keys.filter((q) => Math.abs(q.b - bb) > 1e-6); t.keys.push({ id: 'k' + Math.random().toString(36).slice(2, 9), b: bb, v: 'stage', transition: 'push', dur: 2, ease: 'spring' }); t.keys.sort((x, y) => x.b - y.b); }, 'camera visit at marker'); });
  function chapters() { const tr = app.store.session.track; if (!tr) return ''; const pre = P().look === 'player' && P().export.preroll !== false ? 9 : 0, mm = (x) => { x = Math.max(0, Math.round(x)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };
    let L = (app.cues.sheet.markers || []).filter((m) => m.kind === 'chapter').map((m) => ({ b: m.b, label: m.label || 'Chapter' }));
    if (!L.length) L = items().filter((m) => m.kind === 'section').map((m) => ({ b: m.b, label: m.label.replace(/^./, (c) => c.toUpperCase()) }));
    const out = [{ t: 0, label: 'Intro · experimentation' }, ...L.map((m) => ({ t: pre + m.b * tr.spb, label: m.label }))].sort((a, b) => a.t - b.t).filter((q, i, a) => !i || q.t - a[i - 1].t >= 10);
    return out.map((q, i) => `${i ? mm(q.t) : '0:00'} ${q.label}`).join('\n'); }
  $('#markerPrev')?.addEventListener('click', () => tl() && tl().navMarker && tl().navMarker(-1));
  $('#markerNext')?.addEventListener('click', () => tl() && tl().navMarker && tl().navMarker(1));
  $('#markerChapters')?.addEventListener('click', () => { const txt = chapters(); navigator.clipboard?.writeText(txt).then(() => { $('#markerCount').textContent = 'YouTube chapters copied'; }, () => window.prompt('YouTube chapters', txt)); });
  root.addEventListener('focusin', (e) => { if (e.target.classList.contains('mk-l')) app.cues.begin(); });
  root.addEventListener('input', (e) => { const el = e.target; if (!el.classList.contains('mk-l')) return; app.cues.preview((s) => { const m = (s.markers || []).find((q) => q.id === el.dataset.id); if (m) m.label = el.value; }); });
  root.addEventListener('focusout', (e) => { if (e.target.classList.contains('mk-l')) { app.cues.commit('rename marker'); setTimeout(refresh, 0); } });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('mk-l')) e.target.blur(); });
  $('#markerAdd').addEventListener('click', () => { const m = tl().addMarker(); refresh(); const inp = root.querySelector(`input[data-id="${m.id}"]`); if (inp) { inp.focus(); inp.select(); } });
  $('#markerFilter').addEventListener('input', refresh);
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved') refresh(); });
  let lastPh = -1; setInterval(() => { const ph = tl() ? tl().state.playhead : 0; if (Math.abs(ph - lastPh) > 1e-3 && $('#pane-markers').closest('.rail').dataset.pane === 'markers') { lastPh = ph; refresh(); } }, 500);
  refresh();
  return { refresh, items, seekBeat, chapters };
}
