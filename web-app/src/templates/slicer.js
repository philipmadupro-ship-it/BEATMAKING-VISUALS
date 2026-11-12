import { cached, mk, rgba, hash, txt, mono, hud, sparkle } from '../util/draw.js';
import { elephFor, swingAngle } from '../overlays/elephant.js';
import { chainPose, chainImages, drawChains } from '../overlays/chains.js';
import { lineText, lineFont, lineColor } from '../overlays/text.js';
// SLICER: sample-chopper grid. The source image is live: a halftone elephant swinging on its chain with the U2C chains
// across it (still assembling / pulsing / shattering). The grid cuts through both: kicks shove a column,
// snares invert three tiles, bass opens the gaps.
function halftone(assets, p, w) {
  return cached(`slht|${p.id}|${Math.round(w)}`, w, w * 662 / 700, (g, cw, ch) => { const e = elephFor(assets, p, 'dark'), st = 6, t = mk(cw / st, ch / st), tg = t.getContext('2d');
    tg.drawImage(e, 0, 0, t.width, t.height); const d = tg.getImageData(0, 0, t.width, t.height).data; g.fillStyle = p.main;
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) { const i = (y * t.width + x) * 4, a = d[i + 3] / 255, l = (d[i] + d[i + 1] + d[i + 2]) / 765, v = a * (.35 + .65 * l); if (v < .05) continue; g.beginPath(); g.arc(x * st + st / 2, y * st + st / 2, st * .48 * Math.sqrt(v), 0, 7); g.fill(); } });
}
export default {
  id: 'slicer', name: 'Slicer', category: 'Grid', pal: 'rust', surface: 'dark', chainStyle: 'solid', selfChains: true, selfEleph: true,
  owns: ['bpm'], textPos: 'bottom',
  params: [{ id: 'grid', label: 'Grid', min: 4, max: 12, step: 1, def: 8 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .5, s: .8 }, eleph: { x: .5, y: 0, s: .6, len: .03 } } : { chains: { x: .5, y: .5, s: .8 }, eleph: { x: .5, y: 0, s: .6, len: .03 } },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, n = (P.params && P.params.grid) || 8; ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    const sb = P.safe.hard, G0 = V ? { x: sb.x0 - 90 * u, y: sb.y0 + 70 * u, w: sb.x1 - sb.x0 + 180 * u, h: 880 * u } : { x: W * .25, y: H * .09, w: W * .5, h: H * .8 };
    // live source: bg, swinging halftone elephant, U2C chains (half resolution)
    const ow = Math.round(G0.w * .5), oh = Math.round(G0.h * .5), src = cached(`slsrc|${ow}x${oh}`, ow, oh, () => {}), g = src.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.fillStyle = p.bg2; g.fillRect(0, 0, ow, oh);
    if (P.eleph.on) { const ew = ow * .62 * (P.eleph.s / .6), ht = halftone(assets, p, ew), th = swingAngle(fs), piv = { x: ow * P.eleph.x, y: -oh * .04 }, len = oh * .08 + P.eleph.len * oh;
      g.save(); g.translate(piv.x, piv.y); g.rotate(th); g.strokeStyle = p.main; g.lineWidth = 4; g.setLineDash([10, 6]); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, len); g.stroke(); g.setLineDash([]);
      g.translate(0, len); g.drawImage(ht, -ht.width / 2, 0); g.restore(); }
    if (P.chains.on) { const L = assets.links, sc = ow * .86 * (P.chains.s / .8) / L.w, pose = chainPose(fs, P, assets, { x: ow * P.chains.x, y: oh * (.62 + (P.chains.y - .5) * .5), sc });
      pose.flash = Math.max(pose.ph.tt >= 4 ? fs.snare : 0, pose.impact); drawChains(g, pose, chainImages(assets, p, 'solid', false, p.hi)); }
    const gap = (2 + 14 * fs.bass) * u, tw = G0.w / n, th = G0.h / n;
    const col = Math.floor(hash(fs.kickIdx, 5) * n), inv = new Set(); if (fs.snare > .2) for (let j = 0; j < 3; j++) inv.add(Math.floor(hash(fs.snareIdx, 30 + j) * n * n));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const dc = Math.abs(c - col), dy = dc === 0 ? (hash(fs.kickIdx, 6) - .5) * 160 * u * fs.kick : dc === 1 ? (hash(fs.kickIdx, 7) - .5) * 60 * u * fs.kick : 0;
      const jx = (hash(r * 16 + c, Math.floor(fs.lt * 30)) - .5) * 6 * u * fs.hi, x = G0.x + c * tw + gap / 2 + jx, y = G0.y + r * th + gap / 2 + dy;
      ctx.drawImage(src, c * ow / n, r * oh / n, ow / n, oh / n, x, y, tw - gap, th - gap);
      if (inv.has(r * n + c)) { ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = p.main; ctx.fillRect(x, y, tw - gap, th - gap); ctx.restore(); }
      if ((r + c) % 3 === 0) txt(ctx, String.fromCharCode(65 + r) + (c + 1), x + 6 * u, y + 16 * u, mono(11 * u), rgba(p.main, .55)); }
    const sx = G0.x + fs.barP * G0.w; ctx.fillStyle = rgba(p.hi, .7); ctx.fillRect(sx - 1.5 * u, G0.y - 20 * u, 3 * u, G0.h + 40 * u); ctx.fillStyle = rgba(p.hi, .08); ctx.fillRect(sx - 40 * u, G0.y, 40 * u, G0.h);
    hud(ctx, G0.x - 16 * u, G0.y - 16 * u, G0.w + 32 * u, G0.h + 32 * u, 36 * u, p.main, 2.5 * u);
    txt(ctx, `SLICER / ${n}×${n} / COL ` + (col + 1), G0.x, G0.y - 30 * u, mono(20 * u, 700), p.main);
    const bpm = lineText(P, 'bpm', fs); txt(ctx, bpm || ('GAP ' + gap.toFixed(1) + 'px'), G0.x + G0.w, G0.y - 30 * u, bpm ? lineFont(P, 'bpm', 20 * u, 700) : mono(18 * u), bpm ? lineColor(P, 'bpm', p) : rgba(p.main, .7), 'right');
    sparkle(ctx, G0.x + G0.w, G0.y + G0.h + 40 * u, 18 * u + 10 * u * fs.hat, p.hi);
  },
};
