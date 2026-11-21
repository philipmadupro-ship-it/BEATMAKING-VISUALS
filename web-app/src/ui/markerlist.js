// v21 MARKER LIST (left rail → Markers; Premiere's Markers panel): every sheet marker and section start in time order.
// Click the time to jump (the playhead moves, the lanes scroll), type to rename (one undo step per field), × deletes,
// "+ Marker" adds one at the playhead (as M). The filter matches labels. API: app.markerList = { refresh, items() }.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function createMarkerList(app) {
  const root = $('#markerItems'), P = () => app.store.project, tl = () => app.cuetl;
  function items() {
    const tr = app.store.session.track, e = app.clip.current(), out = [];
    for (const m of app.cues.sheet.markers || []) out.push({ id: m.id, b: m.b, label: m.label || '', kind: 'marker', user: true });
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
      ${m.user ? `<input class="inp small mk-l" value="${esc(m.label)}" aria-label="Marker name" data-id="${esc(m.id)}"><button class="mk-x" data-del="${esc(m.id)}" aria-label="Delete marker ${esc(m.label)}">×</button>` : `<span class="mk-s">${esc(m.label)}</span><span class="hint">section</span>`}</li>`).join('')
      : '<li class="hint">No markers yet. Press M on the timeline or use + Marker.</li>';
    if (html !== last) { last = html; root.innerHTML = html; }   // unchanged lists keep their DOM (a click in flight is never lost)
  }
  const seekBeat = (b) => { const tr = app.store.session.track; if (!tr) return; app.actions.seek(P().inT + Math.round(b * tr.spb * 30) / 30); const T = tl(), V = T.view(); if (b < V.a || b > V.z) { T.state.scroll = Math.max(0, b - (V.z - V.a) / 4); T.markDirty(); } };
  root.addEventListener('click', (e) => { const t = e.target.closest('[data-b]'); if (t) { seekBeat(+t.dataset.b); return; }
    const d = e.target.closest('[data-del]'); if (d) { const id = d.dataset.del; app.cues.edit((s) => { s.markers = (s.markers || []).filter((m) => m.id !== id); }, 'delete marker'); } });
  root.addEventListener('focusin', (e) => { if (e.target.classList.contains('mk-l')) app.cues.begin(); });
  root.addEventListener('input', (e) => { const el = e.target; if (!el.classList.contains('mk-l')) return; app.cues.preview((s) => { const m = (s.markers || []).find((q) => q.id === el.dataset.id); if (m) m.label = el.value; }); });
  root.addEventListener('focusout', (e) => { if (e.target.classList.contains('mk-l')) { app.cues.commit('rename marker'); setTimeout(refresh, 0); } });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('mk-l')) e.target.blur(); });
  $('#markerAdd').addEventListener('click', () => { const m = tl().addMarker(); refresh(); const inp = root.querySelector(`input[data-id="${m.id}"]`); if (inp) { inp.focus(); inp.select(); } });
  $('#markerFilter').addEventListener('input', refresh);
  app.cues.subscribe((why) => { if (why !== 'preview' && why !== 'saved') refresh(); });
  let lastPh = -1; setInterval(() => { const ph = tl() ? tl().state.playhead : 0; if (Math.abs(ph - lastPh) > 1e-3 && $('#pane-markers').closest('.rail').dataset.pane === 'markers') { lastPh = ph; refresh(); } }, 500);
  refresh();
  return { refresh, items, seekBeat };
}
