import { rgba, txt, mono, hud, sparkle } from '../util/draw.js';
import { accentOn, glowOp } from '../brand/palettes.js';
import { lineText, lineFont, lineColor } from '../overlays/text.js';
// PENDANT BLOOM: radial spectrum around the swinging elephant; shockwave rings on snares, gold sparkles on hats,
// the U2C chains as the base of the composition. All rotation runs on loop phase (seamless).
export default {
  id: 'bloom', name: 'Pendant Bloom', category: 'Bloom', pal: 'amethyst', surface: 'dark', chainStyle: 'solid',
  owns: ['bpm'], textPos: 'top',
  reserved(P) { const V = P.V, cx = P.W / 2, cy = V ? P.H * .4 : P.H * .56, R = Math.min(P.W, P.H) * (V ? .27 : .3) * 1.45; return [{ x: cx - R, y: cy - R, w: 2 * R, h: 2 * R }]; },
  params: [{ id: 'spokes', label: 'Spokes', min: 32, max: 160, step: 8, def: 96 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .84, s: .6 }, eleph: { x: .5, y: 0, s: .8, len: .365 } } : { chains: { x: .83, y: .7, s: .62 }, eleph: { x: .5, y: 0, s: .85, len: .48 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, cx = W / 2, cy = V ? H * .4 : H * .56, n = (P.params && P.params.spokes) || 96, a2 = accentOn(p), TAU = Math.PI * 2;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .7); gr.addColorStop(0, p.bg2); gr.addColorStop(1, p.bg); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const R = Math.min(W, H) * ((V ? .27 : .3) + .05 * fs.kick), rot = fs.cyc(.02) * TAU + Math.sin(fs.cyc(.11) * TAU) * .15 * fs.mid;
    ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = glowOp(p);
    for (let pass = 0; pass < 2; pass++) { ctx.lineWidth = (pass ? 3 : 9) * u; for (let i = 0; i < n; i++) { const k = Math.floor((i < n / 2 ? i : n - 1 - i) / (n / 2) * 48), v = fs.specAt(Math.min(47, k)), a = rot + i / n * TAU, l = R * .05 + v * R * .7;
      ctx.strokeStyle = rgba(i % 2 ? p.main : a2, pass ? .9 : .18); ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a) * (R + l), Math.sin(a) * (R + l)); ctx.stroke(); } }
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = rgba(p.main, .55); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(0, 0, R * .96, 0, 7); ctx.stroke();
    ctx.save(); ctx.rotate(-fs.cyc(.013) * TAU); ctx.setLineDash([3 * u, 9 * u]); ctx.beginPath(); ctx.arc(0, 0, R * 1.95, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    for (let d = 0; d < 360; d += 45) { const a = d * Math.PI / 180; ctx.fillStyle = p.main; ctx.fillRect(Math.cos(a) * R * 1.95 - 3 * u, Math.sin(a) * R * 1.95 - 3 * u, 6 * u, 6 * u); txt(ctx, String(d).padStart(3, '0'), Math.cos(a) * R * 2.06, Math.sin(a) * R * 2.06, mono(14 * u), rgba(p.main, .7), 'center', 'middle'); } ctx.restore();
    for (const r of fs.recent('snares', .6, 3)) { const q = r.age / .6, e = 1 - Math.pow(1 - q, 3); ctx.strokeStyle = rgba(p.id === 'amethyst' ? p.a3 : p.hi, (1 - q) * r.s); ctx.lineWidth = 5 * u * (1 - q) + 1; ctx.beginPath(); ctx.arc(0, 0, R * (1 + e * .95), 0, 7); ctx.stroke(); }
    for (const r of fs.recent('hats', .45, 6)) { const q = r.age / .45, a = (r.idx * 2.39996) % 6.283, rr = R * (1.25 + ((r.idx * .618) % 1) * .5); sparkle(ctx, Math.cos(a) * rr, Math.sin(a) * rr, 26 * u * (1 - q) * r.s + 2, p.spark, q); }
    ctx.restore();
    const mx = V ? 70 * u : W * .04, ty = V ? 100 * u : H * .08, rx = W - mx;
    txt(ctx, 'BLOOM.SYS', mx, ty, mono(22 * u, 700), p.main);
    const bpm = lineText(P, 'bpm', fs); txt(ctx, n + ' BANDS' + (bpm ? ' / ' : ''), mx, ty + 30 * u, mono(16 * u), rgba(p.main, .6)); if (bpm) txt(ctx, bpm, mx + ctx.measureText(n + ' BANDS / ').width, ty + 30 * u, lineFont(P, 'bpm', 16 * u), lineColor(P, 'bpm', p));
    txt(ctx, 'KICK ' + fs.kick.toFixed(2), rx, ty, mono(16 * u), rgba(p.main, .8), 'right'); txt(ctx, 'SNR  ' + fs.snare.toFixed(2), rx, ty + 24 * u, mono(16 * u), rgba(a2, .9), 'right'); txt(ctx, 'LOW  ' + fs.lowSlow.toFixed(2), rx, ty + 48 * u, mono(16 * u), rgba(p.main, .6), 'right');
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 44 * u, rgba(p.main, .5), 2 * u);
  },
};
