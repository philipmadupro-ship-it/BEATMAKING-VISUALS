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
// v11 type system: three voices. DISPLAY (Akira Expanded, stand-in Unbounded 800) for the title and the end card; UI
// (Synkopy, the user's "Sknopy"; stand-in Space Grotesk) for window labels and the credit; MONO = Akira Expanded, sized down, for every number (text() mixes the faces per run). The brand
// files are optional @font-face slots in assets/fonts/fonts.css: a missing file falls through to the stand-in, so the
// fonts swap by dropping the files in. Canvas font strings take these stacks as the family list.
export const FONT = { display: '"Akira Expanded", "Unbounded", sans-serif', ui: '"Synkopy", "Space Grotesk", sans-serif', mono: '"Akira Expanded", "Unbounded", sans-serif', fallback: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif' };
export const DISPLAY = FONT.display, UI = FONT.ui;
export const SANS = FONT.ui, MONO = FONT.mono, NUM_SCALE = 0.74, SERIF = '"Instrument Serif"', HAND = '"Caveat"';
/** Font faces the renderer waits for before the first frame (web main.js + native boot.mjs). */
export const FONT_LOADS = ['800 40px "Akira Expanded"', '800 40px "Unbounded"', '600 40px "Unbounded"', '400 22px "Synkopy"', '500 22px "Synkopy"', '400 22px "Space Grotesk"', '500 22px "Space Grotesk"',
  '600 22px "Space Grotesk"', '700 22px "Space Grotesk"', '700 24px "Caveat"'];
/** Resolve once every face above is loaded or known missing (a missing brand file resolves too). */
export function loadFonts(doc = globalThis.document, sample = 'ATELMANSION 3 Atelmansion prod. 0123456789 Hz dB LUFS') {
  if (!doc || !doc.fonts) return Promise.resolve([]);
  return Promise.all(FONT_LOADS.map((f) => doc.fonts.load(f, sample).catch(() => []))).then((r) => FONT_LOADS.map((f, i) => [f, r[i].length > 0]));
}
/** Which voice is live: {display: 'Akira Expanded' | 'Unbounded', ui: 'Synkopy' | 'Space Grotesk'} (after loadFonts). */
export function liveFonts(doc = globalThis.document) {
  const has = (f) => { try { return !!doc && doc.fonts.check(f) && [...doc.fonts].some((x) => x.status === 'loaded' && f.includes(x.family.replace(/"/g, ''))); } catch (_) { return false; } };
  return { display: has('800 40px "Akira Expanded"') ? 'Akira Expanded' : 'Unbounded', ui: has('400 22px "Synkopy"') ? 'Synkopy' : 'Space Grotesk' };
}
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
  // kick envelope from the analysed kicks. v13 timing: frame f is drawn at its CENTRE (f + 0.5) / FPS, so a kick at time tk first shows on frame
  // round(tk * FPS) (= ceil(tk * FPS - 0.5)), the frame whose centre has passed it (v12 used ceil(tk * FPS): up to a whole frame late), and
  // the attack is full strength there; the decay then runs per frame from the attack frame. tk = the grid slot when the detected onset is within
  // 12 ms of it (the beat is programmed on the grid: removes the detector jitter), else the detected onset (a genuinely off-grid hit).
  const kickT = (tr, tq) => (Math.abs(tr - tq) <= 0.012 ? tq : tr);
  // kickHits: the kicks the reactive visuals (logo glow, cover pulse, levels flash) follow = the ones that sit on the 16th grid (within 12 ms), at the
  // grid time. A long 808 re-triggers off the grid with weak detector hits that are not kick onsets: they do not flash anything.
  const kickHits = D.onsets.kick.filter(([tr, , tq]) => Math.abs(tr - tq) <= 0.012).map(([, s, tq]) => [tq, s]).sort((p, q) => p[0] - q[0]);
  const kickF = (tk) => Math.max(0, Math.ceil(tk * FPS - 0.5));   // the first frame that shows a hit at time tk (frame f is drawn at its centre)
  const kickEnv = new Float32Array(NF);
  for (const [tr, s, tq] of D.onsets.kick) { const f0 = Math.max(0, Math.ceil(kickT(tr, tq) * FPS - 0.5)); for (let f = f0; f < NF && (f - f0) / FPS < 0.6; f++) kickEnv[f] = Math.max(kickEnv[f], s * Math.exp(-(f - f0) / FPS / 0.14)); }
  const songBar = (clipBar) => D.song.startBar + clipBar;
  function labelAt(clipBar) { const sb = songBar(clipBar); let lab = 'intro'; for (const q of D.song.phrases) if (q.bar <= sb) lab = q.label; return lab; }
  const font = (ctx, px, fam = MONO, w = 400, style = '') => { ctx.font = `${style} ${w} ${px}px ${fam}`; };
  // legibility floor: no type smaller than MIN_PX on screen at the overview (camera zoom 1) on a 1080-wide frame
  const view = { camZ: 1, base: 1 };
  const floorSize = (ctx, size) => { const m = ctx.getTransform(), sc = Math.hypot(m.a, m.b) / (view.camZ * view.base) || 1; return Math.max(size, MIN_PX / sc); };
  // v11.1 one text helper for the whole film. Default ("mix"): numbers (6, -18.4, 128, 09.1.1, 1.2k) in Akira Expanded sized NUM_SCALE x down, words and units in
  // Synkopy, "@" in the fallback face (Synkopy draws it as "e"). An explicit o.fam draws one face (title, labels), still routing "@" to the fallback.
  const UNIT = '(?:\\s?(?:kHz|Hz|dBTP|dBFS|dB|LUFS|LU|ms|BPM|%|k|Q|s)(?![A-Za-z]))?';   // short units ride with the number in Akira (Synkopy breaks them at small sizes)
const NUMR = '(?<![A-Za-z])(?:Q\\s?)?[+\\-\\u2212]?\\d[\\d.,:]*';   // a number not glued to a word (uche2crazy stays one word), optional leading Q
const RUN = new RegExp(`@[A-Za-z]+\\d[A-Za-z\\d]*|${NUMR}${UNIT}|[@%]|[^@%]+?(?=${NUMR}|[@%]|$)`, 'gi');
  function runsOf(s, o) {
    const mix = !o.fam || o.mix, out = [];
    for (const m of s.match(RUN) || [s]) {
      if (m === '@' || m === '%' || /^@[A-Za-z]+\d/.test(m)) out.push([m, 'fb']);   // handles like @uche2crazy: Synkopy's 2 reads as z
      else if (mix && /^(?:Q\s?)?[+\-\u2212]?\d/.test(m)) out.push([m, 'num']); else out.push([m, 'main']);
    }
    return out;
  }
  function text(ctx, s, x, y, o = {}) {
    s = String(s);
    const size = floorSize(ctx, o.size || 12), w = o.w || 400, mainFam = o.fam && !o.mix ? o.fam : UI, runs = runsOf(s, o), ls = (o.ls || 0) + 'px';
    const fam = (r) => r === 'num' ? FONT.mono : r === 'fb' ? FONT.fallback : mainFam, px = (r) => r === 'num' ? size * NUM_SCALE : size;
    const wt = (r) => r === 'num' ? 400 : r === 'fb' ? 500 : w;
    const meas = () => { let t = 0; for (const [str, r] of runs) { font(ctx, px(r), fam(r), wt(r), o.style || ''); ctx.letterSpacing = ls; t += ctx.measureText(str).width; } return t; };
    const w0 = meas(); let sc = 1; if (o.maxW && w0 > o.maxW) sc = o.maxW / w0;
    const tw = w0 * sc, x0 = o.align === 'right' ? x - tw : o.align === 'center' ? x - tw / 2 : x;
    ctx.save(); ctx.translate(x0, y); if (sc !== 1) ctx.scale(sc, 1);
    ctx.textAlign = 'left'; ctx.textBaseline = o.base || 'middle'; ctx.fillStyle = o.col || '#fff';
    let cx = 0; for (const [str, r] of runs) { font(ctx, px(r), fam(r), wt(r), o.style || ''); ctx.letterSpacing = ls; ctx.fillText(str, cx, 0); cx += ctx.measureText(str).width; }
    ctx.restore(); ctx.letterSpacing = '0px'; return tw;
  }
  const fmt = (v, d = 1) => (v <= -69 ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d));
  const tc = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
  const bbt = (t) => `${String(barOf(t) + 1).padStart(2, '0')}.${beatIn(t) + 1}.${Math.floor((((t % BEAT) + BEAT) % BEAT) / BEAT * 4) + 1}`;
  // tags: the film sets L.tagGet(path) per frame (tags document + cue overrides); {vars} substituted
  const VARS = {};
  const tagVars = (o) => Object.assign(VARS, o);
  const sub = (s, extra) => String(s).replace(/\{(\w+)\}/g, (m, k) => (extra && k in extra ? extra[k] : k in VARS ? VARS[k] : m));
  const L = { view, floorSize, MIN_PX, tagVars, sub, D, F, FPS, NF, BEAT, BAR, U, T, Bt, barOf, beatIn, SCHED, ev, steps, on, beatPhase, barPhase, clamp, lerp, fidx, hash, hs,
    kickT, kickHits, kickF, SPECTRO: D.spectro, GS: D.gonioS, GM: D.gonioM, W2: D.wave2.data, kickEnv, songBar, labelAt, STAGES, rgba, mix, font, text, fmt, tc, bbt, SANS, MONO, SERIF, HAND, DISPLAY, UI, FONT,
    tagGet: () => undefined, meter: (kind, key, def) => def };
  // ---------------------------------------------------------------- v11 liquid glass (shell design system)
  // Backdrops: L.snap(ctx, slot) copies what is on the canvas NOW into a small blurred copy (1/8 size, canvas filter
  // blur, deterministic). The film snaps slot 'ground' after the ground (window glass), 'frame' before the end card and
  // 'halo' for the halation. L.glass draws a window in the current transform; L.panel a flat glass sub-panel for content.
  const SLOTS = {};
  const mkc = (w, h) => { const q = document.createElement('canvas'); q.width = Math.max(1, Math.ceil(w)); q.height = Math.max(1, Math.ceil(h)); return q; };
  L.snap = (ctx, slot = 'ground', px = 3) => {
    const cv = ctx.canvas, W0 = cv.width, H0 = cv.height; let o = SLOTS[slot];
    if (!o || o.W0 !== W0 || o.H0 !== H0) o = SLOTS[slot] = { W0, H0, a: mkc(W0 / 2, H0 / 2), b: mkc(W0 / 4, H0 / 4), s: mkc(W0 / 8, H0 / 8), out: mkc(W0 / 8, H0 / 8) };
    const ga = o.a.getContext('2d'), gb = o.b.getContext('2d'), gs = o.s.getContext('2d'), go = o.out.getContext('2d');
    ga.drawImage(cv, 0, 0, o.a.width, o.a.height); gb.drawImage(o.a, 0, 0, o.b.width, o.b.height); gs.drawImage(o.b, 0, 0, o.s.width, o.s.height);
    go.clearRect(0, 0, o.out.width, o.out.height); go.filter = `blur(${px}px)`; go.drawImage(o.s, 0, 0); go.filter = 'none';
    return o.out;
  };
  L.backdrop = (slot) => (SLOTS[slot] ? SLOTS[slot].out : null);
  const isLight = (S) => { const c = hexRgb(S.bg); return c[0] + c[1] + c[2] > 3 * 128; };
  L.isLight = isLight;
  /** The one accent of the stage (window override first). */
  L.accent = (S) => S.hot;
  /** Highlight colour of glass edges: the ink on dark grounds, white light on paper (Albedo). */
  const hiOf = (S) => (isLight(S) ? '#ffffff' : S.ink);
  const pxScale = (ctx) => { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; };
  L.rr = (x, y, w, h, r) => { const p = new Path2D(); p.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); return p; };
  /**
   * Liquid-glass window. o: {r (radius, 22), backdrop (slot name or canvas, 'ground'), tint (0..1 card fill, 0.38),
   * active (accent rim), shadow (0..1, 1), edge (0..1, 1)}. Returns the Path2D (clip to it for content).
   */
  L.glass = (ctx, x, y, w, h, S, o = {}) => {
    const r = o.r ?? 22, P = L.rr(x, y, w, h, r), k = pxScale(ctx), light = isLight(S), hi = hiOf(S), sh = o.shadow ?? 1, edge = o.edge ?? 1;
    if (sh > 0) { ctx.save(); ctx.shadowColor = light ? rgba(S.ink, 0.16 * sh) : `rgba(0,0,0,${0.62 * sh})`; ctx.shadowBlur = 56 * k; ctx.shadowOffsetY = 22 * k; ctx.fillStyle = S.bg; ctx.fill(P); ctx.restore(); }
    ctx.save(); ctx.clip(P);
    const bd = typeof (o.backdrop ?? 'ground') === 'string' ? L.backdrop(o.backdrop ?? 'ground') : o.backdrop;
    if (bd) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(bd, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); }
    else { ctx.fillStyle = S.paper; ctx.fillRect(x, y, w, h); }
    ctx.fillStyle = rgba(S.card, o.tint ?? 0.38); ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 260));   // soft inner light from the top
    g.addColorStop(0, rgba(hi, light ? 0.42 : 0.075)); g.addColorStop(1, rgba(hi, 0)); ctx.fillStyle = g; ctx.fillRect(x, y, w, Math.min(h, 260));
    if (edge > 0) {   // inner highlight: a second hairline 1.5 px inside, lit at the top only
      const gi = ctx.createLinearGradient(0, y, 0, y + 40); gi.addColorStop(0, rgba(hi, (light ? 0.9 : 0.28) * edge)); gi.addColorStop(1, rgba(hi, 0));
      ctx.strokeStyle = gi; ctx.lineWidth = 1.5; ctx.stroke(L.rr(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(0, r - 1.5)));
    }
    ctx.restore();
    if (edge > 0) {   // the hairline light edge: bright at the top, falling off, a faint rim light at the bottom
      const ge = ctx.createLinearGradient(0, y, 0, y + h); ge.addColorStop(0, rgba(hi, (light ? 0.95 : 0.34) * edge)); ge.addColorStop(0.35, rgba(hi, (light ? 0.5 : 0.1) * edge));
      ge.addColorStop(1, rgba(light ? S.ink : hi, (light ? 0.14 : 0.16) * edge)); ctx.strokeStyle = ge; ctx.lineWidth = 1.2; ctx.stroke(P);
    }
    if (o.active) { ctx.strokeStyle = rgba(S.hot, 0.85); ctx.lineWidth = 1.6; ctx.stroke(P); }
    ctx.lineWidth = 1; return P;
  };
  /** Flat glass sub-panel for content inside a window (readout cells, knob strips): no shadow, no backdrop. */
  L.panel = (ctx, x, y, w, h, S, o = {}) => {
    const r = o.r ?? 12, P = L.rr(x, y, w, h, r), hi = hiOf(S), light = isLight(S);
    ctx.fillStyle = light ? rgba('#ffffff', 0.32 * (o.fill ?? 1)) : rgba(S.ink, 0.045 * (o.fill ?? 1)); ctx.fill(P);
    const ge = ctx.createLinearGradient(0, y, 0, y + h); ge.addColorStop(0, rgba(hi, light ? 0.8 : 0.16)); ge.addColorStop(1, rgba(light ? S.ink : hi, light ? 0.1 : 0.05));
    ctx.strokeStyle = ge; ctx.lineWidth = 1; ctx.stroke(P); return P;
  };
  /** Screen-space halation: a blurred copy of the frame screened back over it (light-on-dark only). */
  L.halation = (ctx, amt) => {
    if (!(amt > 0)) return; const bd = L.snap(ctx, 'halo', 5);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = amt; ctx.drawImage(bd, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
  };
  L.tag = (path, extra) => { const v = L.tagGet(path); if (v == null) return ''; return Array.isArray(v) ? v.map((x) => sub(x, extra)) : sub(v, extra); };
  return L;
}
