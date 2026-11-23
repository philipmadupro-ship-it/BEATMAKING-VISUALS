// v27 USER EFFECTS ("I can add my own effects"): the Effects library the user drops on the Effects track. Each effect is
// a clip on its own path (ufx.<type>) with an intensity (v, 0..1), a length (dur, beats), an ease in / ease out (ein /
// eout, beats), an optional colour (col, tint only) and an optional per-clip off switch (off: the eye in Layers).
// Rendering is a post pass over the finished frame (one call in film.js render(), right before the opt-in glitch):
// a pure function of (time, sheet), canvas 2D only (ctx.filter is fine), so the native renderer runs it as is.
// Nothing here runs unless the user added a clip: the default sheet has none (the brand bans default glitch moves).

/** The library: [type, name, one-line description, default intensity, default length (beats)]. */
export const UFX = [
  ['neg', 'Negative', 'The frame turns to its negative (intensity = how far).', 1, 4],
  ['flash', 'Flash', 'A white flash on every beat inside the clip, fading fast.', 0.7, 4],
  ['zoom', 'Zoom pulse', 'The frame punches in on every beat and settles.', 0.6, 4],
  ['shake', 'Shake', 'Camera shake (hand-held jitter, deterministic).', 0.5, 2],
  ['blur', 'Blur', 'Soft focus over the whole frame.', 0.6, 4],
  ['glow', 'Glow boost', 'Bright parts bloom: a soft light pass on top.', 0.6, 4],
  ['tint', 'Colour tint', 'Colours the frame (pick the colour).', 0.5, 4],
  ['rgb', 'RGB offset', 'VHS-style red / blue split (opt-in, use sparingly).', 0.4, 2],
];
export const UFX_TYPES = Object.fromEntries(UFX.map(([id, name, desc, v, dur]) => [id, { id, name, desc, v, dur }]));
export const UFX_PATHS = UFX.map(([id]) => 'ufx.' + id);
export const isUfx = (path) => typeof path === 'string' && path.startsWith('ufx.');

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Intensity of a clip key at beat b (0 outside), with its ease in / out (smoothstep ramps, in beats). */
export function ufxAmount(k, b) {
  if (!k || k.off) return 0; const dur = Math.max(1 / 16, +(k.dur ?? 1)), u = b - k.b; if (u < -1e-9 || u >= dur) return 0;
  const v = k.v === true ? 1 : clamp01(+k.v || 0), ein = Math.max(0, +k.ein || 0), eout = Math.max(0, +k.eout || 0);
  const a = ein > 0 ? smooth(u / ein) : 1, z = eout > 0 ? smooth((dur - u) / eout) : 1; return v * Math.min(a, z);
}
// a scratch canvas for passes that need a copy of the frame (rgb split)
const TMP = [];
function scratch(cv, i) { let q = TMP[i]; if (!q) q = TMP[i] = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cv.width, cv.height) : cv.ownerDocument.createElement('canvas'));
  if (q.width !== cv.width || q.height !== cv.height) { q.width = cv.width; q.height = cv.height; } return q; }

/**
 * Apply every active user effect to the finished frame in ctx. b = beat, t = seconds, ev = cue evaluator,
 * o = { beat (seconds per beat), accent (default tint colour) }. Works in device pixels (identity transform).
 */
export function userEffects(c, t, b, ev, o = {}) {
  if (!ev || !ev.clipsAt) return 0; let n = 0;
  const cv = c.canvas, w = cv.width, h = cv.height, BEAT = o.beat || 0.5, px = w / 1080;
  const pulse = (k, tau) => { const bb = Math.max(k.b, Math.floor(b + 1e-6)), age = (b - bb) * BEAT; return Math.exp(-Math.max(0, age) / tau); };
  for (const [type] of UFX) {
    for (const k of ev.clipsAt('ufx.' + type, b)) { const a = ufxAmount(k, b); if (a <= 0.001) continue; n++;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
      if (type === 'neg') { c.globalCompositeOperation = 'difference'; c.globalAlpha = a; c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); }
      else if (type === 'flash') { const p = pulse(k, 0.11) * a; if (p > 0.004) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, p); c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); } }
      else if (type === 'zoom') { const s = 1 + 0.09 * a * pulse(k, 0.16); if (s > 1.0005) { const dw = w * s, dh = h * s; c.drawImage(cv, (w - dw) / 2, (h - dh) / 2, dw, dh); } }
      else if (type === 'shake') { const f = Math.floor(t * 18), amp = 26 * px * a, dx = (hash(f * 1.7 + k.b) - 0.5) * 2 * amp, dy = (hash(f * 2.3 + 9.1 + k.b) - 0.5) * 2 * amp, s = 1 + (2.2 * amp) / Math.min(w, h);
        c.drawImage(cv, (w - w * s) / 2 + dx, (h - h * s) / 2 + dy, w * s, h * s); }
      else if (type === 'blur') { const r = 18 * px * a; if (r > 0.3) { c.filter = `blur(${r.toFixed(2)}px)`; c.drawImage(cv, 0, 0); } }
      else if (type === 'glow') { c.filter = `blur(${(22 * px).toFixed(2)}px) brightness(1.35)`; c.globalCompositeOperation = 'screen'; c.globalAlpha = Math.min(1, 0.85 * a); c.drawImage(cv, 0, 0); }
      else if (type === 'tint') { const col = /^#[0-9a-f]{6}$/i.test(String(k.col)) ? k.col : (o.accent || '#ff3b6b'); c.globalCompositeOperation = 'color'; c.globalAlpha = a; c.fillStyle = col; c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'soft-light'; c.globalAlpha = a * 0.35; c.fillRect(0, 0, w, h); }
      else if (type === 'rgb') { const d = Math.max(1, Math.round(14 * px * a)), R = scratch(cv, 0), B = scratch(cv, 1);
        for (const [T, col] of [[R, '#ff0000'], [B, '#0000ff']]) { const g = T.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(cv, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; }
        c.globalCompositeOperation = 'multiply'; c.fillStyle = '#00ff00'; c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'lighter'; c.drawImage(R, -d, 0); c.drawImage(B, d, 0); }
      c.restore(); }
  }
  return n;
}
