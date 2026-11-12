// Small drawing + math helpers shared by templates, overlays and export.
export const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
export const FONT_SANS = '"Instrument Sans", system-ui, sans-serif';
export const FONT_SERIF = '"Instrument Serif", "Iowan Old Style", Palatino, Georgia, serif';
export const FONT_COND = 'Anton, Impact, "Arial Narrow", sans-serif';
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export function hash(i, s = 0) {
  let h = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((s | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
const _hx = {};
export function hex3(h) { if (_hx[h]) return _hx[h]; const n = parseInt(h.slice(1), 16); return (_hx[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]); }
export function rgba(h, a) { const c = hex3(h); return `rgba(${c[0]},${c[1]},${c[2]},${clamp(a)})`; }
export function mix(a, b, t) { const x = hex3(a), y = hex3(b); return '#' + [0, 1, 2].map(i => Math.round(lerp(x[i], y[i], t)).toString(16).padStart(2, '0')).join(''); }
export function fmtTC(s) { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return String(m).padStart(2, '0') + ':' + r.toFixed(3).padStart(6, '0'); }
export function tc2(s) { s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60; return String(m).padStart(2, '0') + ':' + r.toFixed(2).padStart(5, '0'); }
export function slug(t) { return (t || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 22) || 'untitled'; }
const CACHE = new Map();
export function cached(key, w, h, fn) { let c = CACHE.get(key); if (c) return c; if (CACHE.size > 140) CACHE.clear(); c = mk(w, h); fn(c.getContext('2d'), c.width, c.height); CACHE.set(key, c); return c; }
export function memo(key, fn) { let v = CACHE.get(key); if (!v) { v = fn(); CACHE.set(key, v); } return v; }
export function sparkle(ctx, x, y, r, col, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * .12, -r * .12, r, 0); ctx.quadraticCurveTo(r * .12, r * .12, 0, r);
  ctx.quadraticCurveTo(-r * .12, r * .12, -r, 0); ctx.quadraticCurveTo(-r * .12, -r * .12, 0, -r);
  ctx.fillStyle = col; ctx.fill(); ctx.restore();
}
export function hud(ctx, x, y, w, h, L, col, lw) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
  ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
  ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h); ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
  ctx.stroke(); ctx.restore();
}
export function txt(ctx, s, x, y, font, col, align = 'left', base = 'alphabetic') { ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y); }
export function fitFont(ctx, s, maxW, maxSize, family, weight = '') { ctx.font = `${weight} ${maxSize}px ${family}`; const w = ctx.measureText(s).width; return w > maxW ? maxSize * maxW / w : maxSize; }
export function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
export const mono = (px, w = 500) => `${w} ${px}px ${FONT_MONO}`;
export function bez(p0, p1, p2, p3, t) { const u = 1 - t; return [u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]; }
export function noiseTile(n) {
  return cached('noise' + n, 256, 256, (g, w, h) => { const d = g.createImageData(w, h), D = d.data;
    for (let i = 0; i < w * h; i++) { const r = hash(i, n * 7 + 1); if (r < .09) { const v = hash(i, n * 7 + 2) < .5 ? 0 : 255; D[i*4] = D[i*4+1] = D[i*4+2] = v; D[i*4+3] = 40 + hash(i, n * 7 + 3) * 120; } }
    g.putImageData(d, 0, 0); });
}
const PATS = new WeakMap();
export function pat(ctx, name, make) { let m = PATS.get(ctx); if (!m) { m = {}; PATS.set(ctx, m); } if (!m[name]) m[name] = ctx.createPattern(make(), 'repeat'); return m[name]; }
// Bar-style waveform strip. mode 'peak' uses the overview peaks, 'rms' the analysis frames.
export function wavebars(ctx, fs, x, y, w, h, t0, t1, n, col, colPlayed, tp, mode) {
  const bw = w / n;
  for (let j = 0; j < n; j++) {
    const a = t0 + (t1 - t0) * j / n, b = t0 + (t1 - t0) * (j + 1) / n;
    const v = mode === 'peak' ? fs.peak(Math.max(0, a), Math.max(0, b)) : fs.level(Math.max(0, a), Math.max(0, b));
    const hh = Math.max(1.5, v * h); ctx.fillStyle = (tp != null && a <= tp) ? colPlayed : col; ctx.fillRect(x + j * bw, y + (h - hh) / 2, Math.max(1, bw * .6), hh);
  }
}
