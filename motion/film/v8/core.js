/* U2C v6 "THE LABORATORY": core. Grid-scheduled, fade-free, deterministic.
 * Every visible event is scheduled in BEATS (bar 1 = clip start, which is a downbeat) and converted to seconds
 * through the analysed grid. Appearances are STEP functions of time; nothing tweens opacity.
 * Globals: window.U2C_DATA (tools/clipdata.py), gsap. Exposes window.L6. */
(function () {
  'use strict';
  const D = window.U2C_DATA, FPS = D.fps, NF = D.frames, BEAT = D.beat, BAR = 4 * BEAT;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fidx = (t) => clamp(Math.floor(t * FPS + 1e-6), 0, NF - 1);
  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  const hs = (n, s = 0) => hash(n * 12.9898 + s * 78.233) * 2 - 1;   // seeded [-1, 1]

  // ---------------------------------------------------------------- the grid
  // b = beats from clip start (0 = bar 1 beat 1). Musical units in beats:
  const U = { bar: 4, beat: 1, e8: 0.5, s16: 0.25, t32: 0.125 };
  const T = (b) => b * BEAT;                        // beats -> seconds
  const Bt = (t) => t / BEAT;                       // seconds -> beats
  const barOf = (t) => Math.floor(t / BAR);          // 0-based bar index in the clip
  const beatIn = (t) => Math.floor((t % BAR) / BEAT); // 0..3
  // the schedule: every scheduled event is logged here for the sync test (seconds + label)
  const SCHED = [];
  function ev(b, what) { const t = T(b); SCHED.push({ b, t, what }); return t; }
  // stepped reveal: how many of `n` steps are visible at time t, starting at beat b0, one step per `u` beats
  const steps = (t, b0, n, u) => (t < T(b0) ? 0 : Math.min(n, Math.floor((t - T(b0)) / T(u) + 1e-6) + 1));
  const on = (t, b0, b1) => t >= T(b0) && (b1 == null || t < T(b1));
  // envelopes from the grid (motion, not appearance): beat phase 0..1, bar phase 0..1
  const beatPhase = (t) => (t / BEAT) % 1, barPhase = (t) => (t / BAR) % 1;

  // ---------------------------------------------------------------- data decode
  const b64 = (s) => { const bin = atob(s), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  const SPECTRO = b64(D.spectro), GS = new Int8Array(b64(D.gonioS).buffer), GM = new Int8Array(b64(D.gonioM).buffer);
  const F = D.frame;
  // kick envelope from the analysed kicks (visual punch), placed on their QUANTISED grid times
  const kickEnv = new Float32Array(NF);
  for (const [, s, tq] of D.onsets.kick) for (let f = Math.ceil(tq * FPS); f < NF && f / FPS - tq < 0.6; f++) kickEnv[f] = Math.max(kickEnv[f], s * Math.exp(-(f / FPS - tq) / 0.14));
  // song structure mapped to clip bars
  const songBar = (clipBar) => D.song.startBar + clipBar;     // clipBar 0-based -> song bar number
  function labelAt(clipBar) { const sb = songBar(clipBar); let lab = 'intro'; for (const q of D.song.phrases) if (q.bar <= sb) lab = q.label; return lab; }

  // ---------------------------------------------------------------- the four stages (a condition, not a colour)
  const STAGES = {
    // true black, white and greys only: R = G = B everywhere (tests/qa_video.py checks decoded frames)
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

  // ---------------------------------------------------------------- colour + draw helpers
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  function mix(h1, h2, k, a = 1) {
    const x = parseInt(h1.slice(1), 16), y = parseInt(h2.slice(1), 16), c = [16, 8, 0].map((s) => Math.round(lerp((x >> s) & 255, (y >> s) & 255, clamp(k))));
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  const SANS = '"Instrument Sans"', MONO = '"JetBrains Mono"', SERIF = '"Instrument Serif"', HAND = '"Caveat"';
  const font = (ctx, px, fam = MONO, w = 400, style = '') => { ctx.font = `${style} ${w} ${px}px ${fam}`; };
  // legibility floor: no type smaller than MIN_PX on screen at the overview (camera zoom 1) on a 1080-wide frame.
  // The floor ignores the camera zoom (camZ) so type scales naturally during a push-in instead of re-flowing.
  const MIN_PX = 22;
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
  const bbt = (t) => `${String(barOf(t) + 1).padStart(2, '0')}.${beatIn(t) + 1}.${Math.floor(((t % BEAT) / BEAT) * 4) + 1}`;

  // ---------------------------------------------------------------- tags (tags.default.json deep-merged with --tags)
  const TAGS = window.U2C_TAGS || {}, VARS = {};
  const tagVars = (o) => Object.assign(VARS, o);
  const sub = (s, extra) => String(s).replace(/\{(\w+)\}/g, (m, k) => (extra && k in extra ? extra[k] : k in VARS ? VARS[k] : m));
  const tag = (path, extra) => { const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), TAGS); if (v == null) return ''; return Array.isArray(v) ? v.map((x) => sub(x, extra)) : sub(v, extra); };

  window.L6 = { view, floorSize, MIN_PX, tag, tagVars, D, F, FPS, NF, BEAT, BAR, U, T, Bt, barOf, beatIn, SCHED, ev, steps, on, beatPhase, barPhase, clamp, lerp, fidx, hash, hs,
    SPECTRO, GS, GM, kickEnv, songBar, labelAt, STAGES, rgba, mix, font, text, fmt, tc, bbt, SANS, MONO, SERIF, HAND };
})();
