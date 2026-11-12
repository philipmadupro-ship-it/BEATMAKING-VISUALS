import { cached, mk, rgba, hash, txt, mono, hud, sparkle } from '../util/draw.js';
import { elephFor } from '../overlays/elephant.js';
// SLICER: 8x8 sample-chopper grid of a halftone elephant. Kicks shove a column, snares invert three tiles, bass opens the gaps.
export default {
  id: 'slicer', name: 'Slicer', category: 'Grid', pal: 'rust', surface: 'dark', chainStyle: 'solid',
  params: [{ id: 'grid', label: 'Grid', min: 4, max: 12, step: 1, def: 8 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .8, s: .36 }, eleph: { x: .9, s: .22, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .88, y: .8, s: .24 }, eleph: { x: .07, s: .28, len: .03 }, text: { tx: .03, ty: .93 } },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, n = (P.params && P.params.grid) || 8; ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    const sb = P.safe.hard, G0 = V ? { x: sb.x0 - 60 * u, y: sb.y0 + 40 * u, w: sb.x1 - sb.x0 + 120 * u, h: 700 * u } : { x: W * .22, y: H * .08, w: W * .56, h: H * .8 };
    const mkSrc = inv => cached(`slsrc|${p.id}|${inv}|${Math.round(G0.w)}x${Math.round(G0.h)}`, G0.w / 2, G0.h / 2, (g, w, h) => { g.fillStyle = inv ? p.main : p.bg2; g.fillRect(0, 0, w, h); const e = elephFor(assets, p, 'dark');
      const t = mk(w / 6, h / 6), tg = t.getContext('2d'), sc = Math.min(t.width / e.width, t.height / e.height) * .95; tg.drawImage(e, (t.width - e.width * sc) / 2, (t.height - e.height * sc) / 2, e.width * sc, e.height * sc);
      const d = tg.getImageData(0, 0, t.width, t.height).data; g.fillStyle = inv ? p.dark : p.main;
      for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) { const i = (y * t.width + x) * 4, a = d[i + 3] / 255, l = (d[i] + d[i + 1] + d[i + 2]) / 765, v = a * (.35 + .65 * l); if (v < .05) continue; g.beginPath(); g.arc(x * 6 + 3, y * 6 + 3, 2.9 * Math.sqrt(v), 0, 7); g.fill(); } });
    const src = mkSrc(0), srcI = mkSrc(1), gap = (2 + 14 * fs.bass) * u, tw = G0.w / n, th = G0.h / n;
    const col = Math.floor(hash(fs.kickIdx, 5) * n), inv = new Set(); if (fs.snare > .2) for (let j = 0; j < 3; j++) inv.add(Math.floor(hash(fs.snareIdx, 30 + j) * n * n));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const dc = Math.abs(c - col), dy = dc === 0 ? (hash(fs.kickIdx, 6) - .5) * 160 * u * fs.kick : dc === 1 ? (hash(fs.kickIdx, 7) - .5) * 60 * u * fs.kick : 0;
      const jx = (hash(r * 16 + c, Math.floor(fs.t * 30)) - .5) * 6 * u * fs.hi, s = inv.has(r * n + c) ? srcI : src;
      ctx.drawImage(s, c * src.width / n, r * src.height / n, src.width / n, src.height / n, G0.x + c * tw + gap / 2 + jx, G0.y + r * th + gap / 2 + dy, tw - gap, th - gap);
      if ((r + c) % 3 === 0) txt(ctx, String.fromCharCode(65 + r) + (c + 1), G0.x + c * tw + gap / 2 + 6 * u, G0.y + r * th + gap / 2 + 16 * u + dy, mono(11 * u), rgba(p.main, .55)); }
    const sx = G0.x + fs.barP * G0.w; ctx.fillStyle = rgba(p.hi, .7); ctx.fillRect(sx - 1.5 * u, G0.y - 20 * u, 3 * u, G0.h + 40 * u); ctx.fillStyle = rgba(p.hi, .08); ctx.fillRect(sx - 40 * u, G0.y, 40 * u, G0.h);
    hud(ctx, G0.x - 16 * u, G0.y - 16 * u, G0.w + 32 * u, G0.h + 32 * u, 36 * u, p.main, 2.5 * u);
    txt(ctx, `SLICER / ${n}×${n} / COL ` + (col + 1), V ? sb.x0 : G0.x, G0.y - 30 * u, mono(20 * u, 700), p.main); txt(ctx, 'GAP ' + gap.toFixed(1) + 'px', V ? sb.x1 : G0.x + G0.w, G0.y - 30 * u, mono(18 * u), rgba(p.main, .7), 'right');
    sparkle(ctx, G0.x + G0.w, G0.y + G0.h + 40 * u, 18 * u + 10 * u * fs.hat, p.hi);
  },
};
