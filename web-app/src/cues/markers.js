// Markers over musical time: what the analysis heard (downbeats, beats, kick / snare / hat onsets, section starts) plus
// the cue sheet's own markers (sheet.markers, the M key). Pure: no DOM. Times are beats from bar 1 (like keys).
// Onset times come from the clip analysis already quantised to the 16th grid (clipdata.js), so a key snapped or
// quantised to a marker stays on the frame grid the sync test checks.

export const DENSITY = ['fewer', 'more', 'all', 'off'];
export const DENSITY_LABEL = { fewer: 'Fewer', more: 'More', all: 'All', off: 'Off' };
/** Snap / draw priority by kind (higher wins when two candidates are inside the snap distance). */
export const MARKER_PRI = { cue: 6, drop: 6, hit: 6, note: 6, section: 5, kick: 4, snare: 4, downbeat: 3, hat: 2, beat: 1 };

/** Analysis markers for a clip entry {D, labels, bars}: sorted [{b, kind, s (0..1 strength), label}]. */
export function analysisMarkers(e) {
  if (!e || !e.ready || !e.D) return [];
  const D = e.D, spb = D.beat || 0.5, bars = e.bars || D.bars || 16, out = [];
  for (let k = 0; k < bars * 4; k++) out.push({ b: k, kind: k % 4 === 0 ? 'downbeat' : 'beat', s: k % 4 === 0 ? 1 : 0.5, label: '' });
  const L = e.labels || []; for (let i = 0; i < L.length; i++) if (i === 0 || L[i] !== L[i - 1]) out.push({ b: i * 4, kind: 'section', s: 1, label: L[i] });
  const ons = D.onsets || {};
  for (const kind of ['kick', 'snare', 'hat']) for (const o of ons[kind] || []) { const b = Math.round(o[2] / spb * 4) / 4; if (b >= 0 && b < bars * 4) out.push({ b, kind, s: o[1], label: '' }); }
  return out.sort((a, b) => a.b - b.b || MARKER_PRI[b.kind] - MARKER_PRI[a.kind]);
}
/** Which markers a density shows. User markers (sheet.markers) and sections always show. */
export function visibleMarker(m, density) {
  if (m.user || m.kind === 'section') return true;
  if (density === 'off') return false;
  if (density === 'fewer') return m.kind === 'downbeat' || (m.kind === 'kick' && m.s >= 0.55);
  if (density === 'more') return m.kind === 'downbeat' || m.kind === 'beat' || m.kind === 'kick' || (m.kind === 'snare' && m.s >= 0.45);
  return true;
}
/** Analysis + sheet markers filtered by density, sorted. */
export function markerList(e, sheet, density = 'fewer') {
  const user = (sheet.markers || []).map((m) => ({ ...m, user: true, s: 1 }));
  return [...analysisMarkers(e), ...user].filter((m) => visibleMarker(m, density)).sort((a, b) => a.b - b.b);
}
/** Anchors for "stamp every …": beats in [b0, b1) for a rule (beat, bar, 2bar, section, kick, snare, offbeat, marker). */
export function anchorsFor(rule, e, sheet, b0, b1, density = 'all') {
  const out = [];
  if (rule === 'beat' || rule === 'bar' || rule === '2bar' || rule === 'offbeat') { const st = rule === 'beat' ? 1 : rule === 'bar' ? 4 : rule === '2bar' ? 8 : 1, off = rule === 'offbeat' ? 0.5 : 0;
    for (let b = Math.ceil((b0 - off) / st - 1e-9) * st + off; b < b1 - 1e-9; b += st) out.push(b); return out; }
  const all = rule === 'marker' ? markerList(e, sheet, density).filter((m) => m.kind !== 'beat') : [...analysisMarkers(e), ...(sheet.markers || []).map((m) => ({ ...m, user: true }))].filter((m) => m.kind === rule);
  for (const m of all) if (m.b >= b0 - 1e-9 && m.b < b1 - 1e-9 && (!out.length || Math.abs(out[out.length - 1] - m.b) > 1e-6)) out.push(m.b);
  return out;
}
