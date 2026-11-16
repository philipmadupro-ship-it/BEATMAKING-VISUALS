// U2C v8 "THE LABORATORY": core (ported from u2c-motion film/v8/core.js). Grid-scheduled, fade-free, deterministic.
// Everything is scheduled in BEATS from the clip start (bar 1 beat 1) and converted to seconds through the grid.
// Appearances are STEP functions of time; nothing tweens opacity. createCore(D) returns the shared helper object
// (the native code's window.L6) for one clip's data.

// ---------------------------------------------------------------- the four stages (a condition, not a colour)
export const STAGES = {
  // true black, white and greys only: R = G = B everywhere
  nigredo: { name: 'NIGREDO', n: 1, grey: true,
    bg: '#030303', paper: '#060606', card: '#0b0b0b', ink: '#f2f2f2', dim: '#8a8a8a', rule: '#bdbdbd',
    sig1: '#9c9c9c', sig2: '#d4d4d4', hot: '#ffffff', warn: '#c8c8c8', tape: '#1c1c1c', tapeA: 0.92, stamp: '#e6e6e6',
    waveLo: '#f2f2f2', waveHi: '#8f8f8f', spec: ['#060606', '#3a3a3a', '#9a9a9a', '#ffffff'],
    grain: 0.13, gloss: true, vignette: 0.72, gridA: 0.07, swing: 4.5, zoom: 1.08, gutter: 0.6, obstruct: true, residue: [] },
  albedo: { name: 'ALBEDO', n: 2,
    bg: '#e4dccb', paper: '#ece5d5', card: '#f2ede2', ink: '#1a1917', dim: '#7d776b', rule: '#2a2824',
    sig1: '#1a1917', sig2: '#6e4433', hot: '#a8432e', warn: '#6e4433', tape: '#cfc5ae', tapeA: 0.85, stamp: '#a8432e',
    waveLo: '#1a1917', waveHi: '#6e4433', spec: ['#ece5d5', '#bdb3a0', '#6e4433', '#1a1917'],
    grain: 0.10, gloss: false, vignette: 0.18, gridA: 0.16, swing: 5.0, zoom: 1.0, gutter: 1.0, exposed: true, residue: ['ink'] },
  citrinitas: { name: 'CITRINITAS', n: 3,
    bg: '#24170d', paper: '#2c1d10', card: '#352313', ink: '#ecd9b0', dim: '#a58a5e', rule: '#b8975a',
    sig1: '#d79a35', sig2: '#c4a57a', hot: '#e0475f', warn: '#e8b85a', tape: '#c4a57a', tapeA: 0.5, stamp: '#b8975a',
    waveLo: '#d79a35', waveHi: '#ecd9b0', spec: ['#24170d', '#6e4433', '#d79a35', '#f0d79a'],
    grain: 0.08, gloss: false, vignette: 0.4, gridA: 0.09, swing: 5.5, zoom: 1.0, gutter: 1.0, system: true, residue: ['ink', 'bone'] },
  rubedo: { name: 'RUBEDO', n: 4,
    bg: '#1a0d22', paper: '#21102c', card: '#2a1438', ink: '#f1e6f7', dim: '#a98cbf', rule: '#c79bf0',
    sig1: '#a35cf0', sig2: '#ff5cc8', hot: '#ff5cc8', warn: '#e0475f', tape: '#5a1020', tapeA: 0.8, stamp: '#7a1428',
    waveLo: '#ff5cc8', waveHi: '#a35cf0', spec: ['#1a0d22', '#5a1020', '#a35cf0', '#ff9be0'],
    grain: 0.09, gloss: true, vignette: 0.5, gridA: 0.08, swing: 7.5, zoom: 1.14, gutter: 1.0, embodied: true, residue: ['ink', 'bone', 'brass'] },
};
export const STAGE_IDS = Object.keys(STAGES);
export const STAGE_COLOR_KEYS = ['bg', 'paper', 'card', 'ink', 'dim', 'rule', 'sig1', 'sig2', 'hot', 'stamp', 'tape'];
export const BAND_COLS = { NIGREDO: ['#ffffff', '#bdbdbd', '#8a8a8a'], ALBEDO: ['#1a1917', '#a8432e', '#6e4433'], CITRINITAS: ['#d79a35', '#b8975a', '#ecd9b0'], RUBEDO: ['#a35cf0', '#ff5cc8', '#c79bf0'] };

/** Stage object for a stage id with optional colour overrides {ink: '#..', ...}. */
export function stageOf(id, over = {}) {
  const S = Object.assign({}, STAGES[id] || STAGES.nigredo);
  for (const k of STAGE_COLOR_KEYS) if (over[k]) S[k] = over[k];
  S.bandCols = S.grey && !Object.keys(over).length ? BAND_COLS.NIGREDO : (BAND_COLS[S.name] || BAND_COLS.NIGREDO);
  S.swingDeg = S.embodied ? { drop: 12.5, calm: 9 } : { drop: 12, calm: 8.5 };
  return S;
}

// ---------------------------------------------------------------- colour + draw helpers (shared, pure)
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
export const hs = (n, s = 0) => hash(n * 12.9898 + s * 78.233) * 2 - 1;   // seeded [-1, 1]
const HX = new Map();
export function hexRgb(hex) { let c = HX.get(hex); if (!c) { const n = parseInt(String(hex).slice(1, 7), 16) || 0; c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; HX.set(hex, c); } return c; }
export function rgba(hex, a) { const c = hexRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
export function mix(h1, h2, k, a = 1) { const x = hexRgb(h1), y = hexRgb(h2), c = [0, 1, 2].map((i) => Math.round(lerp(x[i], y[i], clamp(k)))); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
export const SANS = '"Instrument Sans"', MONO = '"JetBrains Mono"', SERIF = '"Instrument Serif"', HAND = '"Caveat"';
export const MIN_PX = 22;

/** The shared helper object for one clip (v8 window.L6). D: see v8/data.js. */
export function createCore(D) {
  const FPS = D.fps, NF = D.frames, BEAT = D.beat, BAR = 4 * BEAT;
  const fidx = (t) => clamp(Math.floor(t * FPS + 1e-6), 0, NF - 1);
  const U = { bar: 4, beat: 1, e8: 0.5, s16: 0.25, t32: 0.125 };
  const T = (b) => b * BEAT, Bt = (t) => t / BEAT;
  const barOf = (t) => Math.floor(t / BAR), beatIn = (t) => Math.floor((((t % BAR) + BAR) % BAR) / BEAT);
  const SCHED = [];
  function ev(b, what) { const t = T(b); SCHED.push({ b, t, what }); return t; }
  const steps = (t, b0, n, u) => (t < T(b0) ? 0 : Math.min(n, Math.floor((t - T(b0)) / T(u) + 1e-6) + 1));
  const on = (t, b0, b1) => t >= T(b0) && (b1 == null || t < T(b1));
  const beatPhase = (t) => (t / BEAT) % 1, barPhase = (t) => (t / BAR) % 1;
  const F = D.frame;
  // kick envelope from the analysed kicks (visual punch), placed on their quantised grid times
  const kickEnv = new Float32Array(NF);
  for (const [, s, tq] of D.onsets.kick) for (let f = Math.ceil(tq * FPS); f < NF && f / FPS - tq < 0.6; f++) kickEnv[f] = Math.max(kickEnv[f], s * Math.exp(-(f / FPS - tq) / 0.14));
  const songBar = (clipBar) => D.song.startBar + clipBar;
  function labelAt(clipBar) { const sb = songBar(clipBar); let lab = 'intro'; for (const q of D.song.phrases) if (q.bar <= sb) lab = q.label; return lab; }
  const font = (ctx, px, fam = MONO, w = 400, style = '') => { ctx.font = `${style} ${w} ${px}px ${fam}`; };
  // legibility floor: no type smaller than MIN_PX on screen at the overview (camera zoom 1) on a 1080-wide frame
  const view = { camZ: 1, base: 1 };
  const floorSize = (ctx, size) => { const m = ctx.getTransform(), sc = Math.hypot(m.a, m.b) / (view.camZ * view.base) || 1; return Math.max(size, MIN_PX / sc); };
  function text(ctx, s, x, y, o = {}) {
    s = String(s);
    font(ctx, floorSize(ctx, o.size || 12), o.fam || MONO, o.w || 400, o.style || ''); ctx.letterSpacing = (o.ls || 0) + 'px';
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle'; ctx.fillStyle = o.col || '#fff';
    if (o.maxW) { const w0 = ctx.measureText(s).width; if (w0 > o.maxW) { ctx.save(); ctx.translate(x, y); ctx.scale(o.maxW / w0, 1); ctx.fillText(s, 0, 0); ctx.restore(); ctx.letterSpacing = '0px'; return o.maxW; } }
    ctx.fillText(s, x, y);
    const w = ctx.measureText(s).width; ctx.letterSpacing = '0px'; return w;
  }
  const fmt = (v, d = 1) => (v <= -69 ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d));
  const tc = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
  const bbt = (t) => `${String(barOf(t) + 1).padStart(2, '0')}.${beatIn(t) + 1}.${Math.floor((((t % BEAT) + BEAT) % BEAT) / BEAT * 4) + 1}`;
  // tags: the film sets L.tagGet(path) per frame (tags document + cue overrides); {vars} substituted
  const VARS = {};
  const tagVars = (o) => Object.assign(VARS, o);
  const sub = (s, extra) => String(s).replace(/\{(\w+)\}/g, (m, k) => (extra && k in extra ? extra[k] : k in VARS ? VARS[k] : m));
  const L = { view, floorSize, MIN_PX, tagVars, sub, D, F, FPS, NF, BEAT, BAR, U, T, Bt, barOf, beatIn, SCHED, ev, steps, on, beatPhase, barPhase, clamp, lerp, fidx, hash, hs,
    SPECTRO: D.spectro, GS: D.gonioS, GM: D.gonioM, W2: D.wave2.data, kickEnv, songBar, labelAt, STAGES, rgba, mix, font, text, fmt, tc, bbt, SANS, MONO, SERIF, HAND,
    tagGet: () => undefined, meter: (kind, key, def) => def };
  L.tag = (path, extra) => { const v = L.tagGet(path); if (v == null) return ''; return Array.isArray(v) ? v.map((x) => sub(x, extra)) : sub(v, extra); };
  return L;
}
