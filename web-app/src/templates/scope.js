import { rgba, txt, mono, hud, sparkle } from '../util/draw.js';
import { accentOn } from '../brand/palettes.js';
// SCOPE: oscilloscope + XY figure + sweeping spectrum scanner with afterglow, phosphor style.
export default {
  id: 'scope', name: 'SCOPE', category: 'Spectrum', pal: 'charcoal', surface: 'dark', chainStyle: 'neon', glitchBoost: 1.1,
  params: [{ id: 'span', label: 'Time / div', min: .01, max: .12, step: .005, def: .05 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .13, s: .26 }, eleph: { x: .9, s: .22, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .86, y: .14, s: .2 }, eleph: { x: .06, s: .26, len: .03 }, text: { tx: .05, ty: .93 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, a2 = accentOn(p), span = (P.params && P.params.span) || .05, sb = P.safe.hard; ctx.fillStyle = p.dark; ctx.fillRect(0, 0, W, H);
    const S = V ? { x: sb.x0 - 50 * u, y: sb.y0 + 60 * u, w: sb.x1 - sb.x0 + 100 * u, h: 380 * u } : { x: W * .06, y: H * .12, w: W * .55, h: H * .55 };
    const grid = (r) => { ctx.strokeStyle = rgba(p.main, .14); ctx.lineWidth = 1 * u; for (let i = 0; i <= 10; i++) { const x = r.x + i * r.w / 10; ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); ctx.stroke(); } for (let i = 0; i <= 8; i++) { const y = r.y + i * r.h / 8; ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke(); } ctx.strokeStyle = rgba(p.main, .5); ctx.lineWidth = 2 * u; ctx.strokeRect(r.x, r.y, r.w, r.h); };
    grid(S); const n = 420, wave = fs.scopeAt(fs.t, n, span), g = 1.6 + 1.2 * fs.kick;
    ctx.save(); ctx.beginPath(); ctx.rect(S.x, S.y, S.w, S.h); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
    for (const [lw, al] of [[10, .12], [4, .35], [2, 1]]) { ctx.strokeStyle = rgba(lw === 2 ? p.hi : p.main, al); ctx.lineWidth = lw * u; ctx.beginPath(); for (let j = 0; j < n; j++) { const x = S.x + j / (n - 1) * S.w, y = S.y + S.h / 2 - wave[j] * g * S.h * .45; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    ctx.restore();
    const X = V ? { x: sb.x0, y: S.y + S.h + 40 * u, w: 280 * u, h: 280 * u } : { x: W * .66, y: H * .12, w: H * .4, h: H * .4 };
    grid(X); const lag = Math.max(2, Math.round(fs.spb / 16 * 4000 / (span * 4000 / n))); const xy = fs.scopeAt(fs.t, n + lag, span);
    ctx.save(); ctx.beginPath(); ctx.rect(X.x, X.y, X.w, X.h); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(a2, .8); ctx.lineWidth = 2 * u; ctx.beginPath();
    for (let j = 0; j < n; j++) { const x = X.x + X.w / 2 + xy[j] * g * X.w * .45, y = X.y + X.h / 2 - xy[j + lag] * g * X.h * .45; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
    const Z = V ? { x: X.x + X.w + 30 * u, y: X.y, w: sb.x1 - (X.x + X.w + 30 * u) + 50 * u, h: X.h } : { x: W * .06, y: H * .72, w: W * .88, h: H * .18 };
    grid(Z); const sweep = Z.x + fs.barP * Z.w; const bw = Z.w / 48;
    for (let k = 0; k < 48; k++) { const x = Z.x + k * bw, age = ((sweep - x) / Z.w + 1) % 1, v = fs.spec(fs.t - age * 4 * fs.spb, k); ctx.fillStyle = rgba(p.main, .2 + .8 * (1 - age)); ctx.fillRect(x + 1, Z.y + Z.h - v * Z.h, bw - 2, v * Z.h); }
    ctx.fillStyle = p.hi; ctx.fillRect(sweep - 1.5 * u, Z.y, 3 * u, Z.h);
    const hz = Math.round(fs.centroid * 6000 + 200);
    txt(ctx, 'CH1  2V/DIV   ' + Math.round(span * 100) + 'ms/DIV', S.x, S.y - 18 * u, mono(17 * u, 700), p.main); txt(ctx, 'TRIG ' + (fs.kick > .5 ? '■' : '□') + '  ' + Math.round(fs.bpm) + ' BPM', S.x + S.w, S.y - 18 * u, mono(17 * u), rgba(p.main, .8), 'right');
    txt(ctx, 'XY', X.x + 8 * u, X.y + 22 * u, mono(14 * u, 700), a2); txt(ctx, 'CENTROID ' + hz + ' Hz', Z.x + 8 * u, Z.y + 22 * u, mono(14 * u), rgba(p.main, .8));
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 44 * u, rgba(p.main, .5), 2 * u); sparkle(ctx, V ? sb.x1 : W * .94, V ? sb.y0 + 20 * u : H * .06, 16 * u + 10 * u * fs.hat, p.spark);
  },
};
