import { rgba, txt, mono, hud, hash, lerp } from '../util/draw.js';
import { accentOn, hotOn } from '../brand/palettes.js';
// METER DECK: dark minimal studio UI. Two dials (RMS, LOW), 16 segmented meters with peak hold, clip LED, overview strip.
export default {
  id: 'deck', name: 'Meter Deck', category: 'Vector', pal: 'charcoal', surface: 'dark', chainStyle: 'solid', ownText: true,
  params: [{ id: 'hold', label: 'Peak hold', min: 10, max: 90, step: 5, def: 45 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .83, s: .36 }, eleph: { x: .9, s: .26, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .11, y: .2, s: .17 }, eleph: { x: .95, s: .3, len: .03 }, text: { tx: .05, ty: .93 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, T = P.text, a2 = accentOn(p), hot = hotOn(p), hold = (P.params && P.params.hold) || 45; ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    const sb = P.safe.hard, PN = V ? { x: sb.x0 - 50 * u, y: sb.y0 + 10 * u, w: sb.x1 - sb.x0 + 100 * u, h: sb.y1 - sb.y0 - 20 * u } : { x: W * .22, y: H * .12, w: W * .7, h: H * .72 };
    const sh = (hash(fs.kickIdx, 1) - .5) * 8 * u * fs.kick; ctx.save(); ctx.translate(sh, -sh * .5);
    ctx.fillStyle = p.bg2; ctx.fillRect(PN.x, PN.y, PN.w, PN.h); ctx.strokeStyle = rgba(p.main, .25); ctx.lineWidth = 1.5 * u; ctx.strokeRect(PN.x, PN.y, PN.w, PN.h);
    hud(ctx, PN.x - 12 * u, PN.y - 12 * u, PN.w + 24 * u, PN.h + 24 * u, 30 * u, p.main, 2.5 * u);
    txt(ctx, 'U2C // ' + ((T.showTitle ? T.title : '') || 'METER DECK').toUpperCase().slice(0, 18), PN.x + 24 * u, PN.y + 44 * u, mono(20 * u, 700), p.main);
    if (T.showBpm) txt(ctx, `${Math.round(fs.bpm * 10) / 10} BPM · ${(T.key || '').toUpperCase()}`, PN.x + PN.w - 24 * u, PN.y + 44 * u, mono(18 * u), rgba(p.main, .7), 'right');
    const r = Math.min(PN.w * .18, PN.h * .16);
    const dial = (dx, dy, v, lab, col) => { ctx.save(); ctx.translate(dx, dy); ctx.strokeStyle = rgba(p.main, .3); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
      const a0 = Math.PI * .75, a1 = Math.PI * 2.25; for (let j = 0; j <= 20; j++) { const a = lerp(a0, a1, j / 20), l = j % 5 ? 8 : 16; ctx.strokeStyle = rgba(p.main, j / 20 <= v ? .95 : .3); ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 6 * u), Math.sin(a) * (r - 6 * u)); ctx.lineTo(Math.cos(a) * (r - (6 + l) * u), Math.sin(a) * (r - (6 + l) * u)); ctx.stroke(); }
      ctx.strokeStyle = col; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(0, 0, r + 10 * u, a0, lerp(a0, a1, v)); ctx.stroke();
      const a = lerp(a0, a1, v); ctx.strokeStyle = p.hi; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * .82, Math.sin(a) * r * .82); ctx.stroke(); ctx.fillStyle = p.main; ctx.beginPath(); ctx.arc(0, 0, 8 * u, 0, 7); ctx.fill();
      txt(ctx, lab, 0, r * .55, mono(16 * u), rgba(p.main, .7), 'center'); txt(ctx, (20 * Math.log10(Math.max(1e-4, v))).toFixed(1), 0, r * .55 + 26 * u, mono(20 * u, 700), p.text, 'center'); ctx.restore(); };
    dial(PN.x + PN.w * .26, PN.y + PN.h * .3, fs.rms, 'RMS', p.main); dial(PN.x + PN.w * .74, PN.y + PN.h * .3, fs.bass * .6 + fs.sub * .4, 'LOW', a2);
    ctx.fillStyle = fs.kick > .75 ? hot : rgba(p.main, .15); ctx.beginPath(); ctx.arc(PN.x + PN.w / 2, PN.y + PN.h * .3, 12 * u, 0, 7); ctx.fill(); txt(ctx, 'CLIP', PN.x + PN.w / 2, PN.y + PN.h * .3 + 34 * u, mono(13 * u), rgba(p.main, .6), 'center');
    const db = fs.rmsDb(); txt(ctx, (db > 0 ? '+' : '') + db.toFixed(1) + ' dB', PN.x + PN.w / 2, PN.y + PN.h * .3 - 40 * u, mono(24 * u, 700), p.text, 'center');
    const mx0 = PN.x + PN.w * .07, mw = PN.w * .86, my = PN.y + PN.h * .55, mh = PN.h * .27, bw = mw / 16;
    for (let j = 0; j < 16; j++) { let v = 0; for (let q = 0; q < 3; q++) v += fs.specAt(j * 3 + q); v /= 3; let pk = v;
      for (let b = 1; b < hold; b++) { const ii = fs.i - b; if (ii < 0) break; let vv = 0; for (let q = 0; q < 3; q++) vv += fs.specFrame(ii, j * 3 + q); pk = Math.max(pk, vv / 3 - b * .006); }
      const seg = 14; for (let s = 0; s < seg; s++) { const on = s / seg < v; ctx.fillStyle = on ? (s > 11 ? hot : s > 8 ? a2 : p.main) : rgba(p.main, .08); ctx.fillRect(mx0 + j * bw + bw * .15, my + mh - (s + 1) * mh / seg + 2 * u, bw * .7, mh / seg - 4 * u); }
      ctx.fillStyle = p.hi; ctx.fillRect(mx0 + j * bw + bw * .15, my + mh - pk * mh - 3 * u, bw * .7, 3 * u); txt(ctx, String(j + 1).padStart(2, '0'), mx0 + j * bw + bw / 2, my + mh + 24 * u, mono(12 * u), rgba(p.main, .5), 'center'); }
    const oy = PN.y + PN.h * .92, ow = PN.w * .86, dur = fs.duration; ctx.fillStyle = rgba(p.main, .05); ctx.fillRect(mx0, oy - 24 * u, ow, 48 * u);
    const nb = Math.floor(ow / (4 * u)); for (let j = 0; j < nb; j++) { const tt = j / nb * dur, v = fs.peak(tt, tt + dur / nb); ctx.fillStyle = tt >= P.inT && tt <= P.outT ? rgba(p.main, .8) : rgba(p.main, .25); ctx.fillRect(mx0 + j * 4 * u, oy - v * 22 * u, 2 * u, v * 44 * u + 1); }
    ctx.fillStyle = p.hi; ctx.fillRect(mx0 + fs.t / dur * ow, oy - 28 * u, 2 * u, 56 * u); ctx.restore();
    txt(ctx, 'BAR ' + String(fs.bar + 1).padStart(3, '0') + '  ·  BEAT ' + ((Math.floor(fs.beat) % 4 + 4) % 4 + 1), W / 2, PN.y + PN.h + (V ? 60 : 40) * u, mono(20 * u), rgba(p.main, .7), 'center');
  },
};
