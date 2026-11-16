// U2C cue sheet: a JSON document describing a beat video over MUSICAL time (bars / beats / ticks). Pure ES module, no
// DOM: used by the web app (preview, scrub, export) and importable by the native renderer (see adapter-native.mjs and
// CUES.md). A sheet is { format, version, meta, base, tags, tracks }:
//   base   : { "<property path>": value }  values without keyframes (override the look's defaults)
//   tags   : deep overrides of the tag texts (v8/tags.js semantics)
//   tracks : [{ id, path, kind, lane, auto, keys: [{ at: "BAR.BEAT.TICK", v, ease, dur, ...fields }] }]
// Internally a key carries `b` = beats from the video start (0 = bar 1 beat 1). Ticks: 960 per beat.

export const FORMAT = 'u2c-cues', VERSION = 1, PPQ = 960;
export const SNAPS = { bar: 4, beat: 1, '1/8': 0.5, '1/16': 0.25, off: 0 };
/** Track kinds. number/color interpolate with the left key's ease; enum/bool/text step; shot = camera move; clip has a
 *  duration (text cues, glitch, logo hero); event is instantaneous (1-frame flash). */
export const KINDS = ['number', 'color', 'enum', 'bool', 'text', 'shot', 'clip', 'event'];
export const EASE_IDS = ['step', 'linear', 'easeInOut', 'expoOut', 'backOut'];
export const EASES = {
  step: () => 0,
  linear: (x) => x,
  easeInOut: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),         // power2.inOut
  expoOut: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  backOut: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
};
export const LANES = ['camera', 'focus', 'look', 'stage', 'logo', 'pendant', 'text', 'fx'];
/** Interpolation types (optional `ty` on a key; v1 sheets have none and use `ease`). The type describes the segment
 *  from this key to the next: hold = step, linear, bezier = cubic through the handles (this key's `ob`, the next key's
 *  `ib`), auto = monotone curve through the neighbours (no overshoot; number tracks). Handles are in the segment's unit
 *  square, like CSS cubic-bezier(): ob = [x1, y1] (x 0..1), ib = [x2 - 1, y2 - 1] (x -1..0). y is a fraction of the
 *  value change, free (overshoot allowed). A key that has `ty` still carries the nearest named `ease` for v1 readers. */
export const INTERP = ['hold', 'linear', 'bezier', 'auto'];
export const INTERP_EASE = { hold: 'step', linear: 'linear', bezier: 'easeInOut', auto: 'easeInOut' };
/** Ease presets. Named ones keep the exact v1 curve (no ty); the rest write bezier handles. */
export const EASE_PRESETS = {
  hold: { label: 'Hold', ty: 'hold' }, linear: { label: 'Linear', ty: 'linear' },
  easeInOut: { label: 'Ease in-out', ease: 'easeInOut' }, easeIn: { label: 'Ease in', ob: [0.42, 0], ib: [0, 0], ease: 'easeInOut' },
  easeOut: { label: 'Ease out', ob: [0, 0], ib: [-0.42, 0], ease: 'expoOut' }, expoOut: { label: 'Expo out', ease: 'expoOut' },
  backOut: { label: 'Back out (overshoot)', ease: 'backOut' }, hit: { label: 'Hit (fast in, slow out)', ob: [0.04, 0.9], ib: [-0.7, 0], ease: 'expoOut' },
  snap: { label: 'Snap (late, hard)', ob: [0.7, 0], ib: [-0.05, -0.1], ease: 'easeInOut' }, auto: { label: 'Auto bezier (smooth)', ty: 'auto' },
};
/** Bezier handles that approximate a named ease (used when a named-ease key is converted to bezier). */
export const EASE_HANDLES = { linear: [[1 / 3, 1 / 3], [-1 / 3, -1 / 3]], easeInOut: [[0.45, 0], [-0.45, 0]], expoOut: [[0.16, 1], [-0.7, 0]], backOut: [[0.34, 1.56], [-0.36, 0]], step: [[0.45, 0], [-0.45, 0]] };
const clampX = (h, lo, hi, d) => (Array.isArray(h) && h.length === 2 && h.every(Number.isFinite) ? [Math.min(hi, Math.max(lo, h[0])), h[1]] : d);
/** Cubic bezier (0,0),(x1,y1),(x2,y2),(1,1) evaluated at x = u. x1, x2 are clamped to [0,1], so x(t) is monotone and the
 *  solve is single-valued: Newton from a good start, bisection when the slope is flat. */
export function bezierAt(x1, y1, x2, y2, u) {
  if (u <= 0) return 0; if (u >= 1) return 1;
  x1 = Math.min(1, Math.max(0, x1)); x2 = Math.min(1, Math.max(0, x2));
  const bx = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t, dx = (t) => 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
  let t = u;
  for (let i = 0; i < 8; i++) { const e = bx(t) - u; if (Math.abs(e) < 1e-7) break; const d = dx(t); if (Math.abs(d) < 1e-6) break; t = Math.min(1, Math.max(0, t - e / d)); }
  if (Math.abs(bx(t) - u) > 1e-6) { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { t = (lo + hi) / 2; if (bx(t) < u) lo = t; else hi = t; } }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}
/** Progress 0..1 (may overshoot) through the segment k -> nx at u, honouring `ty` + handles, else the named ease. */
export function segProgress(k, nx, u) {
  u = Math.min(1, Math.max(0, u));
  if (!k.ty) return (EASES[k.ease] || EASES.linear)(u);
  if (k.ty === 'hold') return 0; if (k.ty === 'linear') return u;
  if (k.ty === 'auto') return EASES.easeInOut(u);
  const o = k.ob || EASE_HANDLES.linear[0], i = (nx && nx.ib) || EASE_HANDLES.linear[1];
  return bezierAt(o[0], o[1], 1 + i[0], 1 + i[1], u);
}
/** Monotone (Fritsch-Carlson) tangent at key i of a sorted key list, in value per beat. */
function autoSlope(K, i) {
  const k = K[i], p = K[i - 1], n = K[i + 1], d0 = p ? (+k.v - +p.v) / Math.max(1e-9, k.b - p.b) : null, d1 = n ? (+n.v - +k.v) / Math.max(1e-9, n.b - k.b) : null;
  if (d0 == null || d1 == null) return 0;   // flat at the ends: hits land and settle
  if (d0 * d1 <= 0) return 0; const m = (d0 + d1) / 2, a = m / d0, b = m / d1, s = a * a + b * b; return s > 9 ? m * 3 / Math.sqrt(s) : m;
}
/** Value of a number track between K[i] and K[i+1] at beat b (all interpolation types). */
export function numberSeg(K, i, b) {
  const k = K[i], nx = K[i + 1]; if (!nx) return +k.v; const L = Math.max(1e-9, nx.b - k.b), u = Math.min(1, Math.max(0, (b - k.b) / L));
  if (k.ty === 'auto') { const m0 = autoSlope(K, i) * L, m1 = autoSlope(K, i + 1) * L, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * +k.v + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * +nx.v + (u3 - u2) * m1; }
  if (!k.ty && k.ease === 'step') return +k.v;
  return +k.v + (+nx.v - +k.v) * segProgress(k, nx, u);
}
/** Key fields added after v1 (all optional): normalise or drop invalid values. */
function migrateKey(k) {
  if (k.ty != null && !INTERP.includes(k.ty)) delete k.ty;
  if (k.ob != null) { const h = clampX(k.ob, 0, 1, null); if (h) k.ob = h; else delete k.ob; }
  if (k.ib != null) { const h = clampX(k.ib, -1, 0, null); if (h) k.ib = h; else delete k.ib; }
  return k;
}


// ---------------------------------------------------------------- musical time
/** "BAR.BEAT.TICK" (1-based bar and beat, ticks 0..959) -> beats from the video start. Also accepts a number (beats). */
export function bbtToBeats(at, beatsPerBar = 4) {
  if (typeof at === 'number') return at;
  const m = String(at).trim().match(/^(-?\d+)(?:\.(\d+))?(?:\.(\d+))?$/); if (!m) throw new Error(`bad time "${at}" (want BAR.BEAT.TICK)`);
  return (+m[1] - 1) * beatsPerBar + ((m[2] ? +m[2] : 1) - 1) + (m[3] ? +m[3] : 0) / PPQ;
}
export function beatsToBbt(b, beatsPerBar = 4) {
  const tk = Math.round(b * PPQ), bar = Math.floor(tk / (PPQ * beatsPerBar)), rem = tk - bar * PPQ * beatsPerBar, beat = Math.floor(rem / PPQ), tick = rem - beat * PPQ;
  return `${bar + 1}.${beat + 1}.${tick}`;
}
export const snapBeat = (b, grid) => (grid > 0 ? Math.round(b / grid) * grid : Math.round(b * PPQ) / PPQ);

// ---------------------------------------------------------------- colours
export const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(String(c));
const hex = (c) => { const n = parseInt(String(c).slice(1, 7), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function lerpColor(a, b, k) { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join(''); }

// ---------------------------------------------------------------- documents
let seq = 0;
export const newId = (p = 'k') => `${p}${Date.now().toString(36).slice(-4)}${(++seq).toString(36)}`;
export function emptySheet(meta = {}) { return { format: FORMAT, version: VERSION, meta: { beatsPerBar: 4, ppq: PPQ, ...meta }, base: {}, tags: {}, tracks: [] }; }
/** JSON document (or a parsed object) -> internal sheet (keys with `b`, sorted, ids). Throws on structural errors. */
export function parseSheet(doc) {
  const d = typeof doc === 'string' ? JSON.parse(doc) : doc;
  if (!d || typeof d !== 'object') throw new Error('not a cue sheet');
  if (d.format && d.format !== FORMAT) throw new Error(`format "${d.format}" is not ${FORMAT}`);
  const bpb = (d.meta && d.meta.beatsPerBar) || 4, sheet = emptySheet(d.meta || {});
  sheet.base = { ...(d.base || {}) }; sheet.tags = JSON.parse(JSON.stringify(d.tags || {}));
  for (const t of d.tracks || []) {
    if (!t || typeof t.path !== 'string') throw new Error('every track needs a "path"');
    const kind = KINDS.includes(t.kind) ? t.kind : 'number';
    const keys = (t.keys || []).map((k) => { const { at, beat, ...rest } = k; const b = beat != null ? +beat : bbtToBeats(at ?? 0, bpb); if (!Number.isFinite(b)) throw new Error(`bad key time in ${t.path}`);
      return migrateKey({ ...rest, id: k.id || newId(), b, ease: EASE_IDS.includes(k.ease) ? k.ease : defaultEase(kind) }); }).sort((a, b) => a.b - b.b);
    sheet.tracks.push({ id: t.id || newId('t'), path: t.path, kind, lane: t.lane || laneOf(t.path), auto: !!t.auto, keys, ...trackFlags(t) });
  }
  // markers (optional, added after v1): [{ at | beat, label, kind }]
  if (Array.isArray(d.markers)) sheet.markers = d.markers.map((m) => { const b = m.beat != null ? +m.beat : bbtToBeats(m.at ?? 0, bpb); return Number.isFinite(b) ? { id: m.id || newId('m'), b, label: String(m.label ?? ''), kind: MARKER_KINDS.includes(m.kind) ? m.kind : 'cue' } : null; }).filter(Boolean).sort((a, b) => a.b - b.b);
  return sheet;
}
/** Internal sheet -> JSON document (BBT times, no internal ids on keys). */
export function serializeSheet(sheet) {
  const bpb = sheet.meta.beatsPerBar || 4;
  return { format: FORMAT, version: VERSION, meta: sheet.meta, base: sheet.base, tags: sheet.tags,
    tracks: sheet.tracks.map((t) => ({ id: t.id, path: t.path, kind: t.kind, lane: t.lane, ...(t.auto ? { auto: true } : {}), ...trackFlags(t),
      keys: t.keys.map(({ id, b, ...k }) => ({ at: beatsToBbt(b, bpb), ...k })) })),
    ...(sheet.markers && sheet.markers.length ? { markers: sheet.markers.map((m) => ({ at: beatsToBbt(m.b, bpb), label: m.label, kind: m.kind })) } : {}) };
}
/** Optional track flags (mute is v1; lock, solo, target and the lane height h came later). Only set flags are written. */
export const MARKER_KINDS = ['cue', 'drop', 'hit', 'note'];
function trackFlags(t) { const o = {}; for (const f of ['mute', 'lock', 'solo', 'target']) if (t[f]) o[f] = true; if (Number.isFinite(t.h) && t.h > 0) o.h = Math.round(t.h); return o; }
export function cloneSheet(s) { return JSON.parse(JSON.stringify(s)); }
export function defaultEase(kind) { return kind === 'number' || kind === 'color' ? 'linear' : kind === 'shot' ? 'easeInOut' : 'step'; }
export function laneOf(path) {
  if (path.startsWith('intro.')) return 'stage';   // the intro shares the Stage lane group (keeps the laptop dock to the same row count)
  if (path.startsWith('camera.')) return 'camera'; if (path === 'focus.featured') return 'focus'; if (path === 'look') return 'look'; if (path === 'stage') return 'stage';
  if (path.startsWith('logo.')) return 'logo'; if (path.startsWith('pendant.')) return 'pendant'; if (path === 'text.cue') return 'text'; if (path.startsWith('fx.')) return 'fx'; return 'custom';
}
/** Structural validation of a JSON document against a property registry ({path: {type, options}}); returns messages. */
export function validateSheet(doc, registry = null) {
  const out = []; let s; try { s = parseSheet(doc); } catch (e) { return [e.message]; }
  for (const t of s.tracks) {
    const p = registry && registry[t.path]; if (registry && !p) out.push(`unknown property "${t.path}" (kept, ignored by this look)`);
    for (const k of t.keys) { if (k.b < 0) out.push(`${t.path}: key before bar 1 (${beatsToBbt(k.b)})`);
      if (p && p.options && !p.options.includes(k.v)) out.push(`${t.path}: "${k.v}" is not one of ${p.options.join(', ')}`); }
  }
  return out;
}

// ---------------------------------------------------------------- evaluation
/** Index a sheet for fast per-frame queries. value(path, b, def) is what every renderer reads. */
export function createEvaluator(sheet) {
  const byPath = new Map();
  const soloing = sheet.tracks.some((t) => t.solo && !t.mute);
  for (const t of sheet.tracks) { if (t.mute || !t.keys.length || (soloing && !t.solo)) continue; const list = byPath.get(t.path) || []; list.push(t); byPath.set(t.path, list); }
  for (const list of byPath.values()) list.forEach((t) => t.keys.sort((a, b) => a.b - b.b));
  const last = (keys, b) => { let lo = 0, hi = keys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (keys[m].b <= b + 1e-9) lo = m + 1; else hi = m; } return lo - 1; };
  const baseOf = (path, def) => (path in sheet.base ? sheet.base[path] : def);
  function trackValue(t, b, def) {
    const K = t.keys, i = last(K, b); if (i < 0) return def;
    const k = K[i], nx = K[i + 1];
    if (t.kind === 'number' && nx) return numberSeg(K, i, b);
    if (t.kind === 'color' && nx && (k.ty ? k.ty !== 'hold' : k.ease !== 'step')) { const u = (b - k.b) / Math.max(1e-9, nx.b - k.b); return lerpColor(k.v, nx.v, Math.min(1, Math.max(0, segProgress(k, nx, u)))); }
    if (t.kind === 'clip') return b < k.b + (k.dur ?? 1) ? k.v : def;
    if (t.kind === 'event') return def;
    return k.v;
  }
  return {
    sheet,
    has: (path) => byPath.has(path) || path in sheet.base,
    tracksOf: (path) => byPath.get(path) || [],
    /** Value of one specific track (also a muted or non-soloed one: lanes draw their own curve). */
    trackValue: (t, b, def) => trackValue(t, b, def),
    soloing,
    /** Value of a property at beat b: the first unmuted track with keys, else the sheet's base value, else def. */
    value(path, b, def) { const list = byPath.get(path); const d = baseOf(path, def); if (!list) return d; return trackValue(list[0], b, d); },
    /** Last key at or before b (with its predecessor), for step-triggered behaviour (window open/close). */
    lastKey(path, b) { const list = byPath.get(path); if (!list) return null; const K = list[0].keys, i = last(K, b); return i < 0 ? null : { key: K[i], prev: K[i - 1] || null }; },
    /** Clip keys active at b (text cues, glitch, hero). */
    clipsAt(path, b) { const out = []; for (const t of byPath.get(path) || []) for (const k of t.keys) if (k.b <= b + 1e-9 && b < k.b + (k.dur ?? 1)) out.push(k); return out; },
    /** Event or key times in [b0, b1). */
    keysIn(path, b0, b1) { const out = []; for (const t of byPath.get(path) || []) for (const k of t.keys) if (k.b >= b0 - 1e-9 && k.b < b1 - 1e-9) out.push(k); return out; },
    /** Camera: the shot state at b -> {from, to, u (eased 0..1), key}. A push key LANDS at its time; the move runs over
     *  the `dur` beats before it. A cut lands at its time. */
    shot(b, path = 'camera.shot') {
      const list = byPath.get(path); if (!list) return { from: 'wide', to: 'wide', u: 1, key: null };
      const K = list[0].keys; let prev = 'wide';
      for (let i = 0; i < K.length; i++) { const k = K[i], push = k.transition !== 'cut', d = push ? Math.max(1e-6, k.dur ?? 1) : 0, start = k.b - d;
        if (b < start - 1e-9) return { from: prev, to: prev, u: 1, key: K[i - 1] || null };
        if (b < k.b - 1e-9 && push) { const u = (b - start) / d; return { from: prev, to: k.v, u: k.ty ? segProgress(k, { ib: k.ib }, u) : (EASES[k.ease] || EASES.easeInOut)(u), key: k, moving: true }; }
        prev = k.v; }
      return { from: prev, to: prev, u: 1, key: K[K.length - 1] };
    },
  };
}

/** Deep merge for tag overrides (arrays replace). */
export function mergeDeep(a, b) {
  if (b == null) return a; if (Array.isArray(b) || typeof b !== 'object') return b;
  const o = { ...(a || {}) }; for (const k of Object.keys(b)) o[k] = mergeDeep(a ? a[k] : undefined, b[k]); return o;
}
/** Flatten a tags object to leaf paths: {"windows.eq": "eq.vst", "boot.0": "> U2C.EXE ..."}. */
export function flattenTags(o, pre = '', out = {}) {
  for (const [k, v] of Object.entries(o)) { const p = pre ? pre + '.' + k : k; if (v && typeof v === 'object') flattenTags(v, p, out); else out[p] = v; }
  return out;
}
