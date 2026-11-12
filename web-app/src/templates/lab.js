import { cached, rgba, txt, mono, slug, tc2, hud, sparkle, bez, wavebars } from '../util/draw.js';
// LAB: dark wireframe patch-bay. Nodes light up on hits and fire signal pulses along the cables.
const NODES = { in: [.06, .5, 'IN', 'rms'], kick: [.3, .2, 'KICK', 'kick'], snr: [.3, .8, 'SNR', 'snare'], hat: [.53, .06, 'HAT', 'hat'], eq: [.55, .48, 'EQ', 'kick'], sub: [.5, .93, 'SUB', 'kick'], bus: [.78, .28, 'BUS', 'snare'], out: [.92, .66, 'OUT', 'kick'] };
const EDGES = [['in','kick','kicks',0],['in','snr','snares',0],['in','hat','hats',0],['in','sub','kicks',0],['kick','eq','kicks',1],['snr','eq','snares',1],['hat','bus','hats',1],['eq','bus','kicks',2],['sub','out','kicks',1],['bus','out','snares',3],['eq','out','kicks',2]];
export default {
  id: 'lab', name: 'LAB', category: 'Interface', pal: 'charcoal', surface: 'dark', chainStyle: 'neon', ownText: true, glitchBoost: 1.35,
  params: [{ id: 'pulse', label: 'Pulse speed', min: .2, max: 1.2, step: .05, def: .42 }],
  defaults: a => a === '916' ? { chains: { x: .66, y: .72, s: .3 }, eleph: { x: .5, s: .36, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .86, y: .82, s: .34 }, eleph: { x: .5, s: .45, len: .03 }, text: { tx: .05, ty: .83 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, fg = p.main, hi = p.hi, bg = p.dark, T = P.text, prm = P.params || {};
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(cached(`labdots|${W}|${H}|${fg}`, W / 2, H / 2, (g, w, h) => { g.fillStyle = rgba(fg, .13); const st = w / 30; for (let y = st / 2; y < h; y += st) for (let x = st / 2; x < w; x += st) g.fillRect(x, y, 1.2, 1.2); }), 0, 0, W, H);
    const sb = P.safe.hard, mx = V ? sb.x0 : W * .07, top = V ? sb.y0 + 6 * u : H * .08, mxR = V ? sb.x1 : W - W * .07;
    txt(ctx, 'LAB', mx, top + 40 * u, mono(44 * u, 700), fg); txt(ctx, '001', mx + 150 * u, top + 40 * u, mono(44 * u, 700), fg);
    const nm = ((T.showTitle ? T.title : '') || 'untitled').toUpperCase().replace(/\s+/g, '_').slice(0, 12);
    txt(ctx, nm, mx, top + 92 * u, mono(44 * u, 700), fg); txt(ctx, '.WAV', mx + ctx.measureText(nm).width + 14 * u, top + 92 * u, mono(44 * u, 700), rgba(fg, .55));
    const bw = 250 * u, bh = 70 * u, bx = mxR - bw, by = top; ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(bx, by, bw, bh);
    txt(ctx, tc2(fs.t - P.inT), bx + bw / 2, by + bh / 2 + 2 * u, mono(40 * u, 500), hi, 'center', 'middle');
    ctx.fillStyle = rgba(fg, .25 + .75 * fs.kick); ctx.fillRect(bx + bw - 64 * u, by + bh + 12 * u, 64 * u, 36 * u); txt(ctx, 'U2C', bx + bw - 32 * u, by + bh + 31 * u, mono(20 * u, 700), bg, 'center', 'middle');
    if (T.showBpm) txt(ctx, `${Math.round(fs.bpm)} BPM · ${(T.key || '').toUpperCase()}`, bx, by + bh + 36 * u, mono(17 * u), rgba(fg, .7));
    const B = V ? { x: W * .1, y: top + 150 * u, w: W * .8, h: sb.y1 - top - 160 * u } : { x: W * .1, y: H * .27, w: W * .62, h: H * .6 };
    ctx.strokeStyle = rgba(fg, .28); ctx.lineWidth = 1.5 * u; ctx.strokeRect(B.x + 10 * u, B.y + 10 * u, B.w, B.h);
    ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(B.x, B.y, B.w, B.h); ctx.beginPath(); ctx.moveTo(B.x, B.y + 44 * u); ctx.lineTo(B.x + B.w, B.y + 44 * u); ctx.stroke();
    txt(ctx, '/u2c/lab/' + slug(T.title) + '.wav', B.x + 16 * u, B.y + 29 * u, mono(17 * u), fg);
    for (let j = 0; j < 3; j++) ctx.strokeRect(B.x + B.w - (28 + j * 24) * u, B.y + 14 * u, 14 * u, 14 * u);
    txt(ctx, 'FILE   ROUTE   MIX', B.x + 16 * u, B.y + 72 * u, mono(14 * u), rgba(fg, .55)); txt(ctx, 'BAR ' + (fs.bar + 1) + '.' + ((Math.floor(fs.beat) % 4 + 4) % 4 + 1), B.x + B.w - 16 * u, B.y + 72 * u, mono(14 * u), rgba(fg, .55), 'right');
    const IN = { x: B.x + 24 * u, y: B.y + 100 * u, w: B.w - 48 * u, h: B.h - 130 * u };
    const nw = Math.max(92 * u, IN.w * .12), nh = Math.max(54 * u, IN.h * .085), pos = id => [IN.x + NODES[id][0] * IN.w, IN.y + NODES[id][1] * IN.h];
    const envOf = ty => ty === 'kick' ? fs.kick : ty === 'snare' ? fs.snare : ty === 'hat' ? fs.hat : fs.rms, travel = prm.pulse || .42;
    for (const [a, b, sig, hop] of EDGES) { const [x0, y0] = pos(a), [x1, y1] = pos(b); const p0 = [x0 + nw / 2, y0], p3 = [x1 - nw / 2, y1], dx = Math.max(40 * u, (p3[0] - p0[0]) * .5), p1 = [p0[0] + dx, p0[1]], p2 = [p3[0] - dx, p3[1]];
      ctx.strokeStyle = rgba(fg, .42); ctx.lineWidth = 1.6 * u; ctx.beginPath(); ctx.moveTo(...p0); ctx.bezierCurveTo(...p1, ...p2, ...p3); ctx.stroke();
      for (const r of fs.recent(sig, 1.5, 3)) { const q = (r.age - hop * .14) / travel; if (q < 0 || q > 1) continue;
        for (let tr = 0; tr < 6; tr++) { const qq = q - tr * .03; if (qq < 0) break; const [px, py] = bez(p0, p1, p2, p3, qq); const z = (6 - tr * .7) * u; ctx.fillStyle = rgba(tr ? fg : hi, (1 - tr / 6) * r.s); ctx.fillRect(px - z, py - z, 2 * z, 2 * z); } } }
    for (const id in NODES) { const [x, y] = pos(id), n = NODES[id], e = envOf(n[3]); ctx.fillStyle = bg; ctx.fillRect(x - nw / 2, y - nh / 2, nw, nh); ctx.fillStyle = rgba(fg, .06 + .45 * e); ctx.fillRect(x - nw / 2, y - nh / 2, nw, nh);
      ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(x - nw / 2, y - nh / 2, nw, nh);
      if (e > .35) { ctx.strokeStyle = rgba(hi, e * .7); ctx.strokeRect(x - nw / 2 - 6 * u, y - nh / 2 - 6 * u, nw + 12 * u, nh + 12 * u); }
      txt(ctx, n[2], x - nw / 2 + 10 * u, y + 6 * u, mono(17 * u, 700), e > .55 ? bg : fg);
      for (let j = 0; j < 3; j++) { ctx.fillStyle = rgba(fg, j / 3 < e ? .95 : .25); ctx.fillRect(x + nw / 2 - (16 + j * 12) * u, y - nh / 2 + 8 * u, 8 * u, 8 * u); } }
    const sw = V ? { x: W * .1 + 30 * u, y: sb.y1 + 30 * u, w: W * .5, h: 150 * u } : { x: B.x + B.w * .66, y: B.y + B.h * .72, w: W * .26, h: H * .2 };
    ctx.fillStyle = bg; ctx.fillRect(sw.x, sw.y, sw.w, sw.h); ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(sw.x, sw.y, sw.w, sw.h);
    ctx.beginPath(); ctx.moveTo(sw.x, sw.y + 30 * u); ctx.lineTo(sw.x + sw.w, sw.y + 30 * u); ctx.stroke(); txt(ctx, 'scope_' + slug(T.title) + '.u2c', sw.x + 10 * u, sw.y + 21 * u, mono(14 * u), fg);
    wavebars(ctx, fs, sw.x + 12 * u, sw.y + 40 * u, sw.w - 24 * u, sw.h - 52 * u, fs.t - 2, fs.t + 2, 64, rgba(fg, .45), hi, fs.t, 'rms');
    ctx.fillStyle = hi; ctx.fillRect(sw.x + sw.w / 2, sw.y + 36 * u, 2 * u, sw.h - 44 * u);
    if (!V) { const bx2 = B.x + B.w + 60 * u, by2 = B.y, ww = W - bx2 - W * .07, hh = H * .3; ctx.strokeStyle = rgba(fg, .6); ctx.strokeRect(bx2, by2, ww, hh);
      for (let j = 0; j < 16; j++) { const v = fs.specAt(j * 3), bw2 = (ww - 40 * u) / 16; ctx.fillStyle = rgba(fg, .35 + .6 * v); ctx.fillRect(bx2 + 20 * u + j * bw2, by2 + hh - 20 * u - v * (hh - 60 * u), bw2 * .6, v * (hh - 60 * u) + 2); }
      txt(ctx, 'SPECTRUM / 16', bx2 + 16 * u, by2 + 28 * u, mono(14 * u), fg); }
    txt(ctx, 'u2c.lab  //  ' + (T.showTag ? T.tag : '') + '  //  x:' + fs.barP.toFixed(3), W / 2, V ? sb.y1 + 230 * u : H * .955, mono(16 * u), rgba(fg, .6), 'center');
    hud(ctx, 26 * u, 26 * u, W - 52 * u, H - 52 * u, 40 * u, rgba(fg, .6), 2 * u); sparkle(ctx, V ? sb.x1 : W * .93, V ? sb.y1 + 90 * u : H * .9, 16 * u + 10 * u * fs.hat, p.spark);
  },
};
