import { cached, rgba, txt, mono, slug, tc2, hud, sparkle, bez, wavebars } from '../util/draw.js';
import { chainPose } from '../overlays/chains.js';
import { lineText, lineFont, lineColor } from '../overlays/text.js';
import { glowOp } from '../brand/palettes.js';
// LAB: dark wireframe patch-bay. The U2C chains are the central node cluster: every node's cable plugs into a link,
// signal pulses run along the cables on hits. The elephant swings inside a MONITOR node window.
const NODES = { in: [.04, .1, 'IN', 'rms'], kick: [.04, .44, 'KICK', 'kick'], snr: [.04, .8, 'SNR', 'snare'], hat: [.36, .04, 'HAT', 'hat'],
  sub: [.5, .97, 'SUB', 'kick'], bus: [.96, .5, 'BUS', 'snare'], out: [.96, .86, 'OUT', 'kick'] };
const SIG = { in: 'kicks', kick: 'kicks', snr: 'snares', hat: 'hats', sub: 'kicks', bus: 'snares', out: 'kicks' };
const LINKS = [['in', 'kick', 'kicks'], ['in', 'snr', 'snares'], ['in', 'hat', 'hats']];
const panel = P => { const { W, H, V } = P; return V ? { x: W * .06, y: 470 * P.u, w: W * .88, h: 1010 * P.u } : { x: W * .05, y: H * .2, w: W * .9, h: H * .7 }; };
export function monitorRect(P, assets) {
  const img = assets.eleph, sc = Math.min(P.W, P.H) * .42 / img.width * P.eleph.s, ew = img.width * sc, eh = img.height * sc, px = P.eleph.x * P.W, py = (P.eleph.y || 0) * P.H, len = P.eleph.len * P.H;
  const w = Math.max(ew * 1.45, 200 * P.u), top = py - 64 * P.u; return { x: px - w / 2, y: top, w, h: (py - top) + len + eh * .78 + 26 * P.u };
}
export default {
  id: 'lab', name: 'LAB', category: 'Interface', pal: 'charcoal', surface: 'dark', chainStyle: 'neon', glitchBoost: 1,
  owns: ['title', 'bpm', 'key', 'tag'], textPos: 'bottom',
  params: [{ id: 'pulse', label: 'Pulse speed', min: .2, max: 1.2, step: .05, def: .42 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .555, s: .78 }, eleph: { x: .75, y: .315, s: .42, len: .02 } } : { chains: { x: .46, y: .57, s: .82 }, eleph: { x: .8, y: .3, s: .5, len: .02 } },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, fg = p.main, hi = p.hi, bg = p.dark, prm = P.params || {};
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(cached(`labdots|${W}|${H}|${fg}`, W / 2, H / 2, (g, w, h) => { g.fillStyle = rgba(fg, .13); const st = w / 30; for (let y = st / 2; y < h; y += st) for (let x = st / 2; x < w; x += st) g.fillRect(x, y, 1.2, 1.2); }), 0, 0, W, H);
    const sb = P.safe.hard, mx = V ? sb.x0 - 60 * u : W * .05, top = V ? sb.y0 + 6 * u : H * .06, mxR = V ? sb.x1 + 60 * u : W * .95;
    // header: LAB 001 / TITLE.WAV / timecode / bpm · key
    txt(ctx, 'LAB', mx, top + 40 * u, mono(44 * u, 700), fg); txt(ctx, '001', mx + 120 * u, top + 40 * u, mono(44 * u, 700), rgba(fg, .5));
    const title = lineText(P, 'title', fs);
    if (title) { const nm = title.replace(/\s+/g, '_').slice(0, 14); txt(ctx, nm, mx, top + 96 * u, lineFont(P, 'title', 44 * u, 700), lineColor(P, 'title', p)); txt(ctx, '.WAV', mx + ctx.measureText(nm).width + 10 * u, top + 96 * u, mono(30 * u, 700), rgba(fg, .45)); }
    const bw = 250 * u, bh = 70 * u, bx = mxR - bw, by = top; ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(bx, by, bw, bh);
    txt(ctx, tc2(fs.lt), bx + bw / 2, by + bh / 2 + 2 * u, mono(40 * u, 500), hi, 'center', 'middle');
    const bk = [lineText(P, 'bpm', fs), lineText(P, 'key', fs)].filter(Boolean).join(' · '); if (bk) txt(ctx, bk, mxR, by + bh + 34 * u, lineFont(P, 'bpm', 20 * u), lineColor(P, 'bpm', p), 'right');
    // patch-bay window
    const B = panel(P); ctx.strokeStyle = rgba(fg, .25); ctx.lineWidth = 1.5 * u; ctx.strokeRect(B.x + 10 * u, B.y + 10 * u, B.w, B.h);
    ctx.fillStyle = rgba(bg, .6); ctx.fillRect(B.x, B.y, B.w, B.h); ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(B.x, B.y, B.w, B.h); ctx.beginPath(); ctx.moveTo(B.x, B.y + 44 * u); ctx.lineTo(B.x + B.w, B.y + 44 * u); ctx.stroke();
    txt(ctx, '/u2c/lab/' + slug(lineText(P, 'title', fs, { ignoreOn: true })) + '.patch', B.x + 16 * u, B.y + 29 * u, mono(17 * u), fg);
    for (let j = 0; j < 3; j++) ctx.strokeRect(B.x + B.w - (28 + j * 24) * u, B.y + 14 * u, 14 * u, 14 * u);
    txt(ctx, 'BAR ' + (fs.bar + 1) + '.' + ((Math.floor(fs.beat) % 4 + 4) % 4 + 1), B.x + B.w - 16 * u, B.y + 72 * u, mono(14 * u), rgba(fg, .55), 'right');
    txt(ctx, 'ROUTE → U2C', B.x + 16 * u, B.y + 72 * u, mono(14 * u), rgba(fg, .55));
    const IN = { x: B.x + 20 * u, y: B.y + 96 * u, w: B.w - 40 * u, h: B.h - 120 * u };
    const nw = 104 * u, nh = 54 * u, pos = id => { const n = NODES[id]; return [IN.x + nw / 2 + n[0] * (IN.w - nw), IN.y + nh / 2 + n[1] * (IN.h - nh)]; };
    const envOf = ty => ty === 'kick' ? fs.kick : ty === 'snare' ? fs.snare : ty === 'hat' ? fs.hat : fs.rms, travel = prm.pulse || .42;
    // chain pose: cables plug into the links nearest each node (and follow them when the logo shatters)
    const pose = chainPose(fs, P, assets), pcs = pose.pieces;
    const plugOf = (x, y) => { let b = pcs[0], bd = 1e18; for (const q of pcs) { const d = (q.hx - x) ** 2 + (q.hy - y) ** 2; if (d < bd) { bd = d; b = q; } } return b; };
    const cable = (p0, p3, sig, hop, alpha = .42) => { const dx = (p3[0] - p0[0]) * .5, p1 = [p0[0] + dx, p0[1]], p2 = [p3[0] - dx, p3[1]];
      ctx.strokeStyle = rgba(fg, alpha); ctx.lineWidth = 1.8 * u; ctx.beginPath(); ctx.moveTo(...p0); ctx.bezierCurveTo(...p1, ...p2, ...p3); ctx.stroke();
      for (const r of fs.recent(sig, 1.5, 3)) { const q = (r.age - hop * .12) / travel; if (q < 0 || q > 1) continue;
        for (let tr = 0; tr < 6; tr++) { const qq = q - tr * .03; if (qq < 0) break; const [px, py] = bez(p0, p1, p2, p3, qq), z = (6 - tr * .7) * u; ctx.fillStyle = rgba(tr ? fg : hi, (1 - tr / 6) * r.s); ctx.fillRect(px - z, py - z, 2 * z, 2 * z); } } };
    ctx.save(); ctx.globalCompositeOperation = glowOp(p);
    for (const [a, b, sig] of LINKS) { const [x0, y0] = pos(a), [x1, y1] = pos(b); cable([x0 + nw / 2, y0], [x1 - (x1 > x0 ? nw / 2 : -nw / 2), y1], sig, 0, .3); }
    for (const id in NODES) { if (id === 'in') continue; const [x, y] = pos(id), q = plugOf(x, y), side = x < q.x ? 1 : -1;
      cable([x + side * nw / 2, y], [q.x, q.y], SIG[id], 1, .25 + .5 * q.a); ctx.fillStyle = rgba(hi, .8 * q.a); ctx.beginPath(); ctx.arc(q.x, q.y, 5 * u, 0, 7); ctx.fill(); }
    // the MONITOR node: elephant window, wired into the logo too
    const M = monitorRect(P, assets), mq = plugOf(M.x + M.w / 2, M.y + M.h);
    cable([M.x + M.w / 2, M.y + M.h], [mq.x, mq.y], 'snares', 2, .4);
    ctx.restore();
    for (const id in NODES) { const [x, y] = pos(id), n = NODES[id], e = envOf(n[3]); ctx.fillStyle = bg; ctx.fillRect(x - nw / 2, y - nh / 2, nw, nh); ctx.fillStyle = rgba(fg, .06 + .45 * e); ctx.fillRect(x - nw / 2, y - nh / 2, nw, nh);
      ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(x - nw / 2, y - nh / 2, nw, nh);
      if (e > .35) { ctx.strokeStyle = rgba(hi, e * .7); ctx.strokeRect(x - nw / 2 - 6 * u, y - nh / 2 - 6 * u, nw + 12 * u, nh + 12 * u); }
      txt(ctx, n[2], x - nw / 2 + 10 * u, y + 6 * u, mono(17 * u, 700), e > .55 ? bg : fg);
      for (let j = 0; j < 3; j++) { ctx.fillStyle = rgba(fg, j / 3 < e ? .95 : .25); ctx.fillRect(x + nw / 2 - (16 + j * 12) * u, y - nh / 2 + 8 * u, 8 * u, 8 * u); } }
    ctx.fillStyle = rgba(bg, .92); ctx.fillRect(M.x, M.y, M.w, M.h); ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(M.x, M.y, M.w, M.h);
    ctx.fillStyle = fg; ctx.fillRect(M.x, M.y, M.w, 30 * u); txt(ctx, 'MONITOR · ELEPH', M.x + 10 * u, M.y + 21 * u, mono(14 * u, 700), bg);
    ctx.fillStyle = rgba(fg, .07); for (let y = M.y + 34 * u; y < M.y + M.h; y += 6 * u) ctx.fillRect(M.x, y, M.w, 1.5 * u);
    ctx.fillStyle = hi; ctx.fillRect(M.x + M.w / 2 - 10 * u, M.y + 30 * u, 20 * u, 8 * u);
    // scope strip (bottom) + spectrum box (16:9 right)
    const sw = V ? { x: W * .06, y: B.y + B.h + 40 * u, w: W * .58, h: 130 * u } : { x: W * .36, y: H * .06, w: W * .28, h: 84 * u };
    { ctx.fillStyle = bg; ctx.fillRect(sw.x, sw.y, sw.w, sw.h); ctx.strokeStyle = fg; ctx.lineWidth = 2 * u; ctx.strokeRect(sw.x, sw.y, sw.w, sw.h);
      wavebars(ctx, fs, sw.x + 12 * u, sw.y + 12 * u, sw.w - 24 * u, sw.h - 24 * u, fs.t - 2, fs.t + 2, 56, rgba(fg, .45), hi, fs.t, 'rms');
      ctx.fillStyle = hi; ctx.fillRect(sw.x + sw.w / 2, sw.y + 6 * u, 2 * u, sw.h - 12 * u); }
    const tag = lineText(P, 'tag', fs);
    if (tag) { const tx = V ? sw.x + sw.w + 30 * u : W * .95, ty = V ? sw.y + sw.h / 2 + 12 * u : H * .955; txt(ctx, tag, tx, ty, lineFont(P, 'tag', 40 * u), lineColor(P, 'tag', p), V ? 'left' : 'right'); }
    hud(ctx, 26 * u, 26 * u, W - 52 * u, H - 52 * u, 40 * u, rgba(fg, .6), 2 * u); sparkle(ctx, B.x + B.w - 30 * u, B.y + B.h - 30 * u, 16 * u + 10 * u * fs.hat, p.spark);
  },
};
