import { cached, rgba, txt, mono, slug, tc2, sparkle } from '../util/draw.js';
import { chainPose } from '../overlays/chains.js';
import { phrase } from '../engine/layout.js';
import { lineText, lineFont, lineColor } from '../overlays/text.js';
import { accentOn } from '../brand/palettes.js';
import { snareBorder, kickCable } from '../engine/react.js';
import { win, openAmount, drawCable, cableDots, scopeView, meterView, ease, wavePro, specAnalyzer, eqView, goniometer } from './kit.js';
// LAB: a patch-bay in nested windows. The outer lab.patch window holds small .exe node windows with live readouts
// (input waveform, kick/sub meters, snare scope, hat spectrum, bus/out meters); each node's cable plugs into a link of
// the U2C chains in the middle, with signal dots on the beat grid. The elephant swings inside monitor.sys.
const NODES = { in: [.0, .02, 'in.wav', 'wave'], kick: [.0, .4, 'kick.exe', 'meter'], snr: [.0, .78, 'snare.exe', 'scope'], hat: [.36, 0, 'hats.vst', 'spec'],
  sub: [.4, 1, 'sub_eq.vst', 'eq'], bus: [1, .52, 'bus.exe', 'meter'], out: [1, .9, 'out.phase', 'gonio'] };
const panel = P => { const { W, H, V } = P; return V ? { x: W * .05, y: 470 * P.u, w: W * .9, h: 1060 * P.u } : { x: W * .04, y: H * .19, w: W * .92, h: H * .74 }; };
export function monitorRect(P, assets) {
  const img = assets.eleph, sc = Math.min(P.W, P.H) * .42 / img.width * P.eleph.s, ew = img.width * sc, eh = img.height * sc, px = P.eleph.x * P.W, py = (P.eleph.y || 0) * P.H, len = P.eleph.len * P.H;
  const w = Math.max(ew * 1.5, 220 * P.u), top = py - 38 * P.u; return { x: px - w / 2, y: top, w, h: (py - top) + len + eh * .8 + 30 * P.u };
}
export default {
  id: 'lab', name: 'LAB', category: 'Interface', pal: 'charcoal', surface: 'dark', chainStyle: 'neon', glitchBoost: 1,
  owns: ['title', 'bpm', 'key', 'tag'], textPos: 'bottom',
  params: [{ id: 'pulse', label: 'Cable glow', min: 0, max: 1, step: .05, def: .5 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .565, s: .5 }, eleph: { x: .74, y: .31, s: .36, len: .03 } } : { chains: { x: .47, y: .6, s: .78 }, eleph: { x: .79, y: .3, s: .42, len: .03 } },
  reserved(P, assets) { const B = panel(P); return [B, { x: B.x, y: B.y - 210 * P.u, w: B.w, h: 200 * P.u }, { x: B.x, y: B.y + B.h + 20 * P.u, w: B.w, h: 150 * P.u }]; },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, fg = p.main, hi = p.hi, bg = p.dark, acc = accentOn(p), ph = phrase(fs, P), glow = P.params && P.params.pulse != null ? P.params.pulse : .5;
    const S = { u, fg, hi, bg, acc, pl: 0, P };
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = fs.duck;
    ctx.drawImage(cached(`labdots|${W}|${H}|${fg}`, W / 2, H / 2, (g, w, h) => { g.fillStyle = rgba(fg, .11); const st = w / 30; for (let y = st / 2; y < h; y += st) for (let x = st / 2; x < w; x += st) g.fillRect(x, y, 1.2, 1.2); }), 0, 0, W, H); ctx.globalAlpha = 1;
    const B = panel(P), mx = B.x, top = B.y - (V ? 180 : 170) * u;
    // header: LAB 001 / TITLE.WAV · timecode · bpm/key
    txt(ctx, 'LAB', mx, top + 40 * u, mono(40 * u, 700), fg); txt(ctx, '001', mx + 104 * u, top + 40 * u, mono(40 * u, 700), rgba(fg, .45));
    const title = lineText(P, 'title', fs); if (title) { const nm = title.replace(/\s+/g, '_').slice(0, 16); txt(ctx, nm, mx, top + 92 * u, lineFont(P, 'title', 42 * u, 700), lineColor(P, 'title', p)); txt(ctx, '.WAV', mx + ctx.measureText(nm).width + 10 * u, top + 92 * u, mono(26 * u, 700), rgba(fg, .4)); }
    const bw = 240 * u, bh = 64 * u, bx = B.x + B.w - bw, by = top; ctx.strokeStyle = rgba(fg, .55); ctx.lineWidth = 1.5 * u; ctx.strokeRect(bx, by, bw, bh);
    txt(ctx, tc2(fs.lt), bx + bw / 2, by + bh / 2 + 2 * u, mono(36 * u, 500), hi, 'center', 'middle');
    const bk = [lineText(P, 'bpm', fs), lineText(P, 'key', fs)].filter(Boolean).join(' · '); if (bk) txt(ctx, bk, bx + bw, by + bh + 32 * u, lineFont(P, 'bpm', 20 * u), lineColor(P, 'bpm', p), 'right');
    // outer window (nested): lab.patch
    S.pl = 0; const outer = win(ctx, B, `lab.patch  ·  /u2c/${slug(lineText(P, 'title', fs, { ignoreOn: true }))}`, 1, S);
    txt(ctx, 'BAR ' + (fs.bar + 1) + '.' + ((Math.floor(fs.beat) % 4 + 4) % 4 + 1) + '   ROUTE → U2C', B.x + B.w - 70 * u, B.y + 17.5 * u, mono(12 * u), rgba(fg, .55), 'right');
    const IN = outer.inner, nw = (V ? 208 : 240) * u, nh = (V ? 136 : 152) * u, pos = id => { const n = NODES[id]; return { x: IN.x + n[0] * (IN.w - nw), y: IN.y + n[1] * (IN.h - nh), w: nw, h: nh }; };
    // chain plugs: each node's cable lands on the link nearest to it
    const pose = chainPose(fs, P, assets), pcs = pose.anchors.length ? pose.anchors : pose.pieces;
    const plugOf = (x, y) => { let b = pcs[0], bd = 1e18; for (const q of pcs) { const d = (q.hx - x) ** 2 + (q.hy - y) ** 2; if (d < bd) { bd = d; b = q; } } return b; };
    const ids = Object.keys(NODES), opens = ids.map((id, i) => openAmount(ph, i, false, fs.spb)), nC = ids.length + 1, beatC = ((Math.floor(fs.beat) % nC) + nC) % nC, kC = kickCable(fs, nC);
    ids.forEach((id, i) => { const r = pos(id), cx = r.x + r.w / 2, cy = r.y + r.h / 2, q = plugOf(cx, cy), o = opens[i]; if (o <= .02) return;
      const fromRight = q.x > cx, a = { x: fromRight ? r.x + r.w : r.x, y: cy }, horiz = Math.abs(q.x - a.x) > Math.abs(q.y - a.y) * .3;
      const pts = horiz ? [a, { x: (a.x + q.x) / 2, y: a.y }, { x: (a.x + q.x) / 2, y: q.y }, { x: q.x, y: q.y }] : [{ x: cx, y: q.y < cy ? r.y : r.y + r.h }, { x: cx, y: (cy + q.y) / 2 }, { x: q.x, y: (cy + q.y) / 2 }, { x: q.x, y: q.y }];
      ctx.save(); ctx.globalAlpha = ease(o) * Math.max(.3, q.a); drawCable(ctx, pts, S, .22 + .35 * glow); cableDots(ctx, pts, fs, S, 0, { beat: beatC === i, kick: kC === i }); ctx.restore(); });
    const M = monitorRect(P, assets), mq = plugOf(M.x + M.w / 2, M.y + M.h);
    { const a = { x: M.x + M.w / 2, y: M.y + M.h }, pts = [a, { x: a.x, y: (a.y + mq.y) / 2 }, { x: mq.x, y: (a.y + mq.y) / 2 }, { x: mq.x, y: mq.y }]; drawCable(ctx, pts, S, .3 + .3 * glow); cableDots(ctx, pts, fs, S, 0, { beat: beatC === nC - 1, kick: kC === nC - 1 }); }
    ids.forEach((id, i) => { const r = pos(id), n = NODES[id]; S.pl = snareBorder(fs, P, i, ids.length + 1); const { inner: I, alpha } = win(ctx, r, n[2], opens[i], S); if (!I || alpha <= 0) return;
      ctx.save(); ctx.globalAlpha = alpha; if (n[3] === 'wave') wavePro(ctx, I, fs, P, S); else if (n[3] === 'meter') meterView(ctx, I, fs, S); else if (n[3] === 'scope') scopeView(ctx, I, fs, S, .02); else if (n[3] === 'eq') eqView(ctx, I, fs, S); else if (n[3] === 'gonio') goniometer(ctx, I, fs, S); else specAnalyzer(ctx, I, fs, S); ctx.restore(); });
    S.pl = snareBorder(fs, P, ids.length, ids.length + 1); win(ctx, M, 'monitor.sys  ·  eleph', 1, S);
    // footer: bus waveform strip + tag
    const sw = { x: B.x, y: B.y + B.h + 30 * u, w: B.w * .6, h: (V ? 110 : 60) * u };
    if (V || sw.y + sw.h < H - 20 * u) { ctx.strokeStyle = rgba(fg, .5); ctx.lineWidth = 1.5 * u; ctx.strokeRect(sw.x, sw.y, sw.w, sw.h); wavePro(ctx, { x: sw.x + 10 * u, y: sw.y + 10 * u, w: sw.w - 20 * u, h: sw.h - 20 * u }, fs, P, S); }
    const tag = lineText(P, 'tag', fs); if (tag) txt(ctx, tag, V ? B.x + B.w : W / 2, V ? sw.y + sw.h / 2 + 12 * u : top + 60 * u, lineFont(P, 'tag', 38 * u), lineColor(P, 'tag', p), V ? 'right' : 'center');
    sparkle(ctx, B.x + B.w - 24 * u, B.y + B.h - 24 * u, 12 * u, p.spark);
  },
};
