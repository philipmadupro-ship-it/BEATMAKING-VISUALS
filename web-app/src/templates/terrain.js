import { rgba, txt, mono, hud, sparkle, lerp, tc2 } from '../util/draw.js';
import { accentOn } from '../brand/palettes.js';
// TERRAIN: stacked spectrum ridgelines scrolling 8 lines per beat in perspective. Kicks lift the front ridges.
export default {
  id: 'terrain', name: 'Terrain', category: 'Wave', pal: 'amethyst', surface: 'dark', chainStyle: 'solid',
  params: [{ id: 'lines', label: 'Ridgelines', min: 16, max: 60, step: 2, def: 40 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .27, s: .42 }, eleph: { x: .86, s: .26, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .5, y: .2, s: .34 }, eleph: { x: .9, s: .28, len: .03 }, text: { tx: .05, ty: .93 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, NL = (P.params && P.params.lines) || 40, NP = 72, a2 = accentOn(p); ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    const dt = fs.spb / 8, fl = fs.t / dt, base = Math.floor(fl), fr = fl - base, cx = W / 2, tilt = (fs.lowMid - .5) * .07;
    ctx.save(); ctx.translate(cx, H * .6); ctx.rotate(tilt); ctx.translate(-cx, -H * .6);
    const hz = V ? H * .36 : H * .3, front = V ? H * .78 : H * .88; ctx.strokeStyle = rgba(p.main, .25); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();
    for (let k = NL - 1; k >= 0; k--) { const z = k + fr, d = z / NL, tk = (base - k) * dt; if (tk < 0) continue;
      const yb = lerp(front, hz, Math.pow(d, .75)), ww = W * .95 * lerp(1, .4, d), ah = H * (V ? .2 : .3) * lerp(1, .35, d) * (1 + .5 * (k < 2 ? fs.kick : 0));
      ctx.beginPath(); ctx.moveTo(cx - ww / 2, yb); const pts = [];
      for (let j = 0; j <= NP; j++) { const xn = j / NP * 2 - 1, bin = Math.min(47, Math.floor(Math.abs(xn) * 44)), v = fs.spec(tk, bin), win = Math.exp(-xn * xn * 3), y = yb - Math.pow(v, 1.4) * ah * win; pts.push([cx + xn * ww / 2, y]); ctx.lineTo(cx + xn * ww / 2, y); }
      ctx.lineTo(cx + ww / 2, yb + 4 * u); ctx.lineTo(cx - ww / 2, yb + 4 * u); ctx.closePath(); ctx.fillStyle = p.bg; ctx.fill();
      ctx.beginPath(); pts.forEach((q, j) => j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); const al = lerp(1, .12, d) * (.6 + .4 * fs.hi);
      if (k < 3) { ctx.strokeStyle = rgba(a2, al * .35); ctx.lineWidth = 8 * u; ctx.stroke(); }
      ctx.strokeStyle = rgba(k < 3 ? p.hi : p.main, al); ctx.lineWidth = (k < 3 ? 3 : 2) * u; ctx.stroke(); }
    ctx.restore();
    const sb = P.safe.hard, mx = V ? sb.x0 : W * .07, ty = V ? sb.y0 + 10 * u : H * .06;
    txt(ctx, 'TERRAIN // ' + String(fs.bar + 1).padStart(3, '0'), mx, ty, mono(20 * u, 700), p.main); txt(ctx, 'ALT ' + (fs.rms * 100).toFixed(0) + '  T-' + tc2(P.outT - fs.t), V ? sb.x1 : W - mx, ty, mono(18 * u), rgba(p.main, .7), 'right');
    for (let j = 0; j < 5; j++) txt(ctx, '+' + (j * 20), W * .05, lerp(front, hz, j / 5), mono(13 * u), rgba(p.main, .45));
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 40 * u, rgba(p.main, .5), 2 * u); sparkle(ctx, W * .93, hz - 30 * u, 16 * u + 10 * u * fs.hat, p.spark);
  },
};
