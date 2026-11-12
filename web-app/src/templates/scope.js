import { rgba, txt, mono, hud, sparkle, memo, clamp } from '../util/draw.js';
import { accentOn, glowOp } from '../brand/palettes.js';
import { chainsScale } from '../overlays/chains.js';
import { phrase } from '../engine/layout.js';
import { lineText, lineFont, lineColor } from '../overlays/text.js';
// SCOPE: phosphor oscilloscope. Two traces wrap the U2C chains: CH1 rides the logo's top silhouette, CH2 its underside,
// so the waveform bends around the letters (and flattens while the logo shatters). XY figure in the corner, elephant
// swinging above the screen.
function contour(L) { return memo('contour', () => {
  const n = L.w, top = new Float32Array(n).fill(L.h / 2), bot = new Float32Array(n).fill(L.h / 2), has = new Uint8Array(n);
  for (const pc of L.pieces) for (let x = Math.max(0, pc.x); x < Math.min(n, pc.x + pc.w); x++) { if (!has[x]) { top[x] = pc.y; bot[x] = pc.y + pc.h; has[x] = 1; } else { top[x] = Math.min(top[x], pc.y); bot[x] = Math.max(bot[x], pc.y + pc.h); } }
  const R = 18, T = new Float32Array(n), B = new Float32Array(n);
  for (let x = 0; x < n; x++) { let a = 1e9, b = -1e9; for (let k = Math.max(0, x - R); k <= Math.min(n - 1, x + R); k++) { if (!has[k]) continue; a = Math.min(a, top[k]); b = Math.max(b, bot[k]); } T[x] = a < 1e9 ? a : L.h / 2; B[x] = b > -1e9 ? b : L.h / 2; }
  return { T, B }; }); }
export default {
  id: 'scope', name: 'SCOPE', category: 'Spectrum', pal: 'charcoal', surface: 'dark', chainStyle: 'neon', glitchBoost: 1,
  owns: ['bpm', 'key'], textPos: 'bottom',
  params: [{ id: 'span', label: 'Time / div', min: .01, max: .12, step: .005, def: .05 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .5, s: .78 }, eleph: { x: .5, y: 0, s: .5, len: .095 } } : { chains: { x: .42, y: .6, s: .78 }, eleph: { x: .42, y: 0, s: .44, len: .06 } },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, a2 = accentOn(p), span = (P.params && P.params.span) || .05, sb = P.safe.hard; ctx.fillStyle = p.dark; ctx.fillRect(0, 0, W, H);
    const S = V ? { x: W * .05, y: 560 * u, w: W * .9, h: 860 * u } : { x: W * .05, y: H * .3, w: W * .74, h: H * .6 };
    const grid = (r, n = 10, m = 8) => { ctx.strokeStyle = rgba(p.main, .13); ctx.lineWidth = 1 * u; for (let i = 0; i <= n; i++) { const x = r.x + i * r.w / n; ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); ctx.stroke(); } for (let i = 0; i <= m; i++) { const y = r.y + i * r.h / m; ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke(); } ctx.strokeStyle = rgba(p.main, .5); ctx.lineWidth = 2 * u; ctx.strokeRect(r.x, r.y, r.w, r.h); };
    grid(S, 10, V ? 10 : 8);
    // traces around the logo silhouette
    const L = assets.links, sc = chainsScale(P, L), cx = P.chains.x * P.W, cy = P.chains.y * P.H, C = contour(L), vis = phrase(fs, P).vis, gap = 26 * u;
    const n = 480, wv = fs.scopeAt(fs.t, n, span), wv2 = fs.scopeAt(fs.t - span * .5, n, span), g = 1.4 + 1.2 * fs.kick, amp = (V ? 120 : 110) * u;
    const base = (x, side) => { const lx = (x - cx) / sc + L.w / 2, inside = clamp(Math.min(lx + 60, L.w + 60 - lx) / 60), k = clamp(lx, 0, L.w - 1) | 0, c = side < 0 ? C.T[k] : C.B[k];
      return cy + ((L.h / 2 + (c - L.h / 2) * vis * inside) - L.h / 2) * sc + side * gap; };
    ctx.save(); ctx.beginPath(); ctx.rect(S.x, S.y, S.w, S.h); ctx.clip(); ctx.globalCompositeOperation = glowOp(p);
    for (const [side, W2, col] of [[-1, wv, p.hi], [1, wv2, a2]]) for (const [lw, al] of [[10, .1], [4, .3], [2, 1]]) {
      ctx.strokeStyle = rgba(lw === 2 ? col : p.main, al); ctx.lineWidth = lw * u; ctx.beginPath();
      for (let j = 0; j < n; j++) { const x = S.x + j / (n - 1) * S.w, y = base(x, side) + side * (.6 * Math.abs(W2[j]) + .4 * W2[j]) * g * amp; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    ctx.restore();
    // XY figure
    const X = V ? { x: S.x, y: S.y + S.h + 36 * u, w: 230 * u, h: 230 * u } : { x: W * .82, y: H * .3, w: W * .13, h: W * .13 };
    grid(X, 6, 6); const lag = Math.max(2, Math.round(n / 8)), xy = fs.scopeAt(fs.t, n + lag, span);
    ctx.save(); ctx.beginPath(); ctx.rect(X.x, X.y, X.w, X.h); ctx.clip(); ctx.globalCompositeOperation = glowOp(p); ctx.strokeStyle = rgba(a2, .8); ctx.lineWidth = 2 * u; ctx.beginPath();
    for (let j = 0; j < n; j++) { const x = X.x + X.w / 2 + xy[j] * g * X.w * .45, y = X.y + X.h / 2 - xy[j + lag] * g * X.h * .45; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
    txt(ctx, 'XY', X.x + 8 * u, X.y + 22 * u, mono(14 * u, 700), a2);
    // channel labels + bpm/key readout
    txt(ctx, 'CH1 ▲ U2C   ' + Math.round(span * 100) + 'ms/DIV', S.x, S.y - 18 * u, mono(17 * u, 700), p.main);
    const bk = [lineText(P, 'bpm', fs), lineText(P, 'key', fs)].filter(Boolean).join(' · ');
    txt(ctx, 'TRIG ' + (fs.kick > .5 ? '■' : '□') + (bk ? '  ' : ''), S.x + S.w - (bk ? ctx.measureText(bk).width + 10 * u : 0), S.y - 18 * u, mono(17 * u), rgba(p.main, .8), 'right');
    if (bk) txt(ctx, bk, S.x + S.w, S.y - 18 * u, lineFont(P, 'bpm', 17 * u, 700), lineColor(P, 'bpm', p), 'right');
    txt(ctx, 'CH2 ▼', S.x + 10 * u, S.y + S.h - 12 * u, mono(14 * u), rgba(a2, .9));
    if (!V) { const hz = Math.round(fs.centroid * 6000 + 200); txt(ctx, 'CENTROID', X.x, X.y + X.h + 34 * u, mono(14 * u), rgba(p.main, .7)); txt(ctx, hz + ' Hz', X.x, X.y + X.h + 64 * u, mono(26 * u, 700), p.main); }
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 44 * u, rgba(p.main, .5), 2 * u); sparkle(ctx, V ? sb.x1 : W * .94, V ? S.y - 60 * u : H * .08, 16 * u + 10 * u * fs.hat, p.spark);
  },
};
