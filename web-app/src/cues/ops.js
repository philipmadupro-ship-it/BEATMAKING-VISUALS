// Pure cue-sheet operations used by the timeline and the inspector (no DOM): quantise, ripple a bar, stamp a pattern on
// anchors, paste attributes, interpolation presets, key presets. Callers wrap them in cues.edit() so each is one undo step.
import { newId, EASE_PRESETS, EASE_HANDLES, INTERP_EASE, PPQ } from './schema.js';

const tick = (b) => Math.round(b * PPQ) / PPQ;
const sortKeys = (t) => t.keys.sort((a, b) => a.b - b.b);

/** Move keys toward the nearest target beat within `window` beats; strength 0..1 (1 = all the way). Returns moved count. */
export function quantiseKeys(keys, targets, { strength = 1, window = 0.5 } = {}) {
  const T = [...targets].sort((a, b) => a - b); let n = 0;
  for (const k of keys) { let lo = 0, hi = T.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < k.b) lo = m + 1; else hi = m; }
    let best = null; for (const j of [lo - 1, lo]) if (j >= 0 && j < T.length && (best == null || Math.abs(T[j] - k.b) < Math.abs(best - k.b))) best = T[j];
    if (best == null || Math.abs(best - k.b) > window + 1e-9 || Math.abs(best - k.b) < 1e-9) continue;
    k.b = Math.max(0, tick(k.b + (best - k.b) * strength)); n++; }
  return n;
}
/** Grid targets in [0, end] for a grid step in beats. */
export const gridTargets = (step, end) => { const o = []; for (let b = 0; b <= end + 1e-9; b += step) o.push(tick(b)); return o; };

/** Ripple: insert (len > 0) or delete (len < 0) |len| beats at `at` on the given tracks; later keys shift. Deleting removes
 *  the keys inside the span; a clip spanning the point grows / shrinks. Sheet markers shift too. */
export function ripple(sheet, at, len, tracks = sheet.tracks) {
  const span = Math.abs(len), del = len < 0;
  for (const t of tracks) {
    if (del) t.keys = t.keys.filter((k) => !(k.b >= at - 1e-9 && k.b < at + span - 1e-9));
    for (const k of t.keys) {
      if (k.b >= at - 1e-9) k.b = tick(k.b + len);
      else if (k.dur != null && (t.kind === 'clip') && k.b + k.dur > at + 1e-9) k.dur = Math.max(1 / 16, del ? k.dur - Math.min(span, k.b + k.dur - at) : k.dur + span);
    }
    sortKeys(t); t.auto = false;
  }
  if (sheet.markers) { if (del) sheet.markers = sheet.markers.filter((m) => !(m.b >= at - 1e-9 && m.b < at + span - 1e-9)); for (const m of sheet.markers) if (m.b >= at - 1e-9) m.b = tick(m.b + len); }
}

/** Stamp a pattern [{path, kind, key: {b relative, ...}}] at every anchor; keys landing on an existing key time replace
 *  it. trackOf(path, kind) returns (creating if needed) the track. Keys at or after `end` are skipped. Returns new ids. */
export function stamp(pattern, anchors, trackOf, end = Infinity) {
  const ids = [];
  for (const a of anchors) for (const c of pattern) { const b = tick(a + c.key.b); if (b < 0 || b >= end - 1e-9) continue; const t = trackOf(c.path, c.kind);
    if (!t || t.lock) continue; t.keys = t.keys.filter((q) => Math.abs(q.b - b) > 1e-6); const k = { ...JSON.parse(JSON.stringify(c.key)), id: newId(), b }; t.keys.push(k); t.auto = false; ids.push(k.id); }
  return ids;
}

/** The interpolation attributes of a key (what "Paste attributes" copies). */
export const ATTRS = ['ease', 'ty', 'ib', 'ob'];
export function attrsOf(k) { const o = {}; for (const f of ATTRS) if (k[f] != null) o[f] = JSON.parse(JSON.stringify(k[f])); return o; }
export function applyAttrs(k, a) { for (const f of ATTRS) delete k[f]; Object.assign(k, JSON.parse(JSON.stringify(a))); if (!k.ease) k.ease = 'linear'; }

/** Apply an ease preset to key k (the segment to its next key nx). Named presets restore the exact v1 curve. */
export function applyEasePreset(k, nx, id) {
  const p = EASE_PRESETS[id]; if (!p) return;
  if (p.ty === 'hold' || p.ty === 'linear' || p.ty === 'auto') { k.ty = p.ty; k.ease = INTERP_EASE[p.ty]; delete k.ob; return; }
  if (p.ease && !p.ob) { delete k.ty; delete k.ob; k.ease = p.ease; return; }
  k.ty = 'bezier'; k.ease = p.ease || 'easeInOut'; k.ob = [...p.ob]; if (nx) nx.ib = [...p.ib];
}
/** Convert a key to bezier keeping its current shape where possible (named ease -> approximate handles). */
export function toBezier(k, nx) {
  if (k.ty === 'bezier') return; const h = EASE_HANDLES[k.ty === 'hold' ? 'step' : k.ty === 'linear' ? 'linear' : k.ease] || EASE_HANDLES.easeInOut;
  k.ty = 'bezier'; k.ob = [...h[0]]; if (nx && !nx.ib) nx.ib = [...h[1]];
}
/** Current preset id of a key (for the inspector select). */
export function presetOf(k, nx) {
  if (k.ty === 'hold' || k.ty === 'linear' || k.ty === 'auto') return k.ty;
  if (!k.ty) return k.ease === 'step' ? 'hold' : k.ease;
  for (const [id, p] of Object.entries(EASE_PRESETS)) if (p.ob && k.ob && Math.abs(p.ob[0] - k.ob[0]) < 1e-3 && Math.abs(p.ob[1] - k.ob[1]) < 1e-3 && (!nx || !nx.ib || (Math.abs(p.ib[0] - nx.ib[0]) < 1e-3 && Math.abs(p.ib[1] - nx.ib[1]) < 1e-3))) return id;
  return 'bezier';
}

/** Built-in key presets: small reusable gestures, keys relative to the anchor beat. */
export const BUILTIN_PRESETS = [
  { id: 'zoom-punch', name: 'Zoom punch (camera)', keys: [{ path: 'camera.zoom', kind: 'number', key: { b: 0, v: 1.12, ease: 'expoOut', ty: 'bezier', ob: [0.04, 0.9] } }, { path: 'camera.zoom', kind: 'number', key: { b: 1, v: 1, ease: 'linear', ib: [-0.7, 0] } }] },
  { id: 'swing-kick', name: 'Pendant kick swing', keys: [{ path: 'pendant.amp', kind: 'number', key: { b: 0, v: 9, ease: 'expoOut', ty: 'bezier', ob: [0.04, 0.9] } }, { path: 'pendant.amp', kind: 'number', key: { b: 0.75, v: 4.6, ease: 'linear', ib: [-0.7, 0] } }] },
  { id: 'flash', name: 'Flash (1 frame)', keys: [{ path: 'fx.flash', kind: 'event', key: { b: 0, v: true, ease: 'step' } }] },
  { id: 'glitch-hit', name: 'Glitch hit (16th)', keys: [{ path: 'fx.glitch', kind: 'clip', key: { b: 0, v: 0.35, dur: 0.25, ease: 'step' } }] },
];
/** Selection [[row, key]] -> preset keys relative to the earliest key. */
export function presetFromSelection(sel, name) {
  const b0 = Math.min(...sel.map(([, k]) => k.b));
  return { id: 'u' + newId('p'), name, keys: sel.map(([r, k]) => { const { id, ...key } = JSON.parse(JSON.stringify(k)); key.b = tick(k.b - b0); return { path: r.path, kind: r.kind, key }; }) };
}
