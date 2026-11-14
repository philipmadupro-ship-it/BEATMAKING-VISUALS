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
      return { ...rest, id: k.id || newId(), b, ease: EASE_IDS.includes(k.ease) ? k.ease : defaultEase(kind) }; }).sort((a, b) => a.b - b.b);
    sheet.tracks.push({ id: t.id || newId('t'), path: t.path, kind, lane: t.lane || laneOf(t.path), auto: !!t.auto, keys, ...(t.mute ? { mute: true } : {}) });
  }
  return sheet;
}
/** Internal sheet -> JSON document (BBT times, no internal ids on keys). */
export function serializeSheet(sheet) {
  const bpb = sheet.meta.beatsPerBar || 4;
  return { format: FORMAT, version: VERSION, meta: sheet.meta, base: sheet.base, tags: sheet.tags,
    tracks: sheet.tracks.map((t) => ({ id: t.id, path: t.path, kind: t.kind, lane: t.lane, ...(t.auto ? { auto: true } : {}), ...(t.mute ? { mute: true } : {}),
      keys: t.keys.map(({ id, b, ...k }) => ({ at: beatsToBbt(b, bpb), ...k })) })) };
}
export function cloneSheet(s) { return JSON.parse(JSON.stringify(s)); }
export function defaultEase(kind) { return kind === 'number' || kind === 'color' ? 'linear' : kind === 'shot' ? 'easeInOut' : 'step'; }
export function laneOf(path) {
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
  for (const t of sheet.tracks) { if (t.mute || !t.keys.length) continue; const list = byPath.get(t.path) || []; list.push(t); byPath.set(t.path, list); }
  for (const list of byPath.values()) list.forEach((t) => t.keys.sort((a, b) => a.b - b.b));
  const last = (keys, b) => { let lo = 0, hi = keys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (keys[m].b <= b + 1e-9) lo = m + 1; else hi = m; } return lo - 1; };
  const baseOf = (path, def) => (path in sheet.base ? sheet.base[path] : def);
  function trackValue(t, b, def) {
    const K = t.keys, i = last(K, b); if (i < 0) return def;
    const k = K[i], nx = K[i + 1];
    if (t.kind === 'number' && nx && k.ease !== 'step') { const u = (b - k.b) / Math.max(1e-9, nx.b - k.b), e = (EASES[k.ease] || EASES.linear)(Math.min(1, Math.max(0, u))); return +k.v + (+nx.v - +k.v) * e; }
    if (t.kind === 'color' && nx && k.ease !== 'step') { const u = (b - k.b) / Math.max(1e-9, nx.b - k.b); return lerpColor(k.v, nx.v, (EASES[k.ease] || EASES.linear)(Math.min(1, Math.max(0, u)))); }
    if (t.kind === 'clip') return b < k.b + (k.dur ?? 1) ? k.v : def;
    if (t.kind === 'event') return def;
    return k.v;
  }
  return {
    sheet,
    has: (path) => byPath.has(path) || path in sheet.base,
    tracksOf: (path) => byPath.get(path) || [],
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
        if (b < k.b - 1e-9 && push) { const u = (b - start) / d; return { from: prev, to: k.v, u: (EASES[k.ease] || EASES.easeInOut)(u), key: k, moving: true }; }
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
