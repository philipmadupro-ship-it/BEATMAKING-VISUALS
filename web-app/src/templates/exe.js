import { mix, rgba, txt, mono, slug, tc2, hud, sparkle, rrect, fitFont, hash, wavebars, FONT_COND, FONT_MONO } from '../util/draw.js';
// EXE: light OS-window aesthetic. Giant condensed title types in letter by letter with motion blur, word swaps each bar,
// fake .exe window with a waveform strip and vertical scanner, big mono timecode, dotted selection frames.
export default {
  id: 'exe', name: 'EXE', category: 'Interface', pal: 'charcoal', surface: 'paper', chainStyle: 'neon', ownText: true, glitchBoost: 1.2,
  params: [{ id: 'blur', label: 'Type blur', min: 0, max: 2, step: .05, def: 1 }],
  defaults: a => a === '916' ? { chains: { x: .72, y: .7, s: .24 }, eleph: { x: .87, s: .28, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .17, y: .82, s: .3 }, eleph: { x: .93, s: .38, len: .03 }, text: { tx: .05, ty: .83 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, T = P.text, ink = p.ink, bg = mix(p.paper, '#ffffff', .5), grey = mix(ink, bg, .6), acc = p.pacc, sb = P.safe.hard, blur = P.params && P.params.blur != null ? P.params.blur : 1;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = rgba(ink, .08); ctx.lineWidth = 1 * u; ctx.setLineDash([2 * u, 10 * u]); for (let x = W / 12; x < W; x += W / 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } ctx.setLineDash([]);
    const words = ((T.showTitle ? T.title : '') || 'U2C').toUpperCase().split(/\s+/).filter(Boolean); words.push('U2C'); if (T.showBpm) words.push(Math.round(fs.bpm) + 'BPM');
    const bars = Math.floor((fs.beat - P.anchorBeat) / 4), word = words[((bars % words.length) + words.length) % words.length];
    const TB = V ? { x: sb.x0, y: sb.y0 + 20 * u, w: sb.x1 - sb.x0, h: 330 * u } : { x: W * .05, y: H * .08, w: W * .5, h: H * .4 };
    const fsz = Math.min(TB.h * .95, fitFont(ctx, word, TB.w, TB.h * .95, FONT_COND)); const F = `${fsz}px ${FONT_COND}`; ctx.font = F;
    const lb = (fs.beat - P.anchorBeat) - bars * 4, step = Math.min(.5, 3 / word.length), base = TB.y + fsz * .95, ws = [...word].map(ch => ctx.measureText(ch).width), totalW = ws.reduce((a, b) => a + b, 0);
    let x = TB.x;
    for (let j = 0; j < word.length; j++) { const age = (lb - j * step) * fs.spb, ch = word[j]; if (age < 0) { x += ws[j]; continue; }
      const jy = (hash(j, fs.kickIdx) - .5) * 34 * u * fs.kick, jx = (hash(j + 9, fs.kickIdx) - .5) * 20 * u * fs.kick;
      if (age < .2 && blur > 0) { const k = 1 - age / .2; for (let g = 5; g >= 1; g--) { ctx.globalAlpha = .1; txt(ctx, ch, x + jx + k * 160 * u * blur * g / 5, base + jy, F, ink); } ctx.globalAlpha = 1; }
      if (fs.snare > .2) { ctx.globalAlpha = fs.snare * .8; txt(ctx, ch, x + jx + 12 * u, base + jy + 4 * u, F, acc); ctx.globalAlpha = 1; }
      ctx.globalAlpha = Math.min(1, age / .08); txt(ctx, ch, x + jx, base + jy, F, ink); ctx.globalAlpha = 1; x += ws[j]; }
    const sel = (cx, cy, w, h, rot, lab) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.strokeStyle = rgba(ink, .65); ctx.lineWidth = 1.5 * u; ctx.setLineDash([5 * u, 6 * u]); ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]);
      for (const [hx, hy] of [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]) { ctx.fillStyle = bg; ctx.fillRect(hx * w / 2 - 7 * u, hy * h / 2 - 7 * u, 14 * u, 14 * u); ctx.strokeRect(hx * w / 2 - 7 * u, hy * h / 2 - 7 * u, 14 * u, 14 * u); }
      if (lab) txt(ctx, lab, w / 2 - 4 * u, h / 2 + 30 * u, mono(15 * u), rgba(ink, .7), 'right'); ctx.restore(); };
    sel(TB.x + totalW / 2, TB.y + fsz * .55, Math.max(totalW, 200 * u) + 50 * u, fsz * 1.05, -.035 + .01 * Math.sin(fs.beat * Math.PI / 2), 'w:' + Math.round(totalW) + ' h:' + Math.round(fsz));
    txt(ctx, '// ' + (T.showTag ? T.tag : 'u2c') + '.exe is running', TB.x, TB.y + fsz * 1.05 + 64 * u, mono(24 * u), rgba(ink, .6));
    const Wn = V ? { x: W * .07, y: TB.y + TB.h + 150 * u, w: W * .86, h: 300 * u } : { x: W * .42, y: H * .5, w: W * .53, h: H * .3 };
    const q = Math.min(1, Math.max(0, (fs.t - P.inT) / Math.max(.1, P.outT - P.inT)));
    ctx.fillStyle = rgba(ink, .12); ctx.fillRect(Wn.x + 10 * u, Wn.y + 10 * u, Wn.w, Wn.h);
    ctx.fillStyle = bg; ctx.fillRect(Wn.x, Wn.y, Wn.w, Wn.h); ctx.strokeStyle = ink; ctx.lineWidth = 2.5 * u; ctx.strokeRect(Wn.x, Wn.y, Wn.w, Wn.h);
    ctx.fillStyle = ink; ctx.fillRect(Wn.x, Wn.y, Wn.w, 38 * u); txt(ctx, slug(T.title) + '_u2c.exe', Wn.x + Wn.w / 2, Wn.y + 25 * u, mono(17 * u, 700), bg, 'center');
    for (let j = 0; j < 3; j++) { ctx.strokeStyle = bg; ctx.lineWidth = 2 * u; ctx.strokeRect(Wn.x + Wn.w - (30 + j * 24) * u, Wn.y + 12 * u, 14 * u, 14 * u); }
    txt(ctx, 'FILE   OPTIONS   HELP', Wn.x + 16 * u, Wn.y + 64 * u, mono(14 * u), rgba(ink, .7));
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5 * u; ctx.strokeRect(Wn.x + Wn.w - 250 * u, Wn.y + 48 * u, 234 * u, 26 * u); txt(ctx, `v.${Math.round(fs.bpm)}-${(T.key || '').replace(/\s+/g, '').toLowerCase()}`, Wn.x + Wn.w - 240 * u, Wn.y + 66 * u, mono(14 * u), ink);
    const sx = Wn.x + 20 * u, sy = Wn.y + 88 * u, sW = Wn.w - 40 * u, sH = Wn.h - 110 * u;
    wavebars(ctx, fs, sx, sy, sW, sH, P.inT, P.outT, Math.round(sW / (5 * u)), grey, ink, fs.t, 'peak');
    const px = sx + q * sW + (hash(fs.kickIdx, 3) - .5) * 14 * u * fs.kick, top = Wn.y - 110 * u, hh = Wn.h + 170 * u; ctx.fillStyle = rgba(ink, .1); ctx.strokeStyle = ink; ctx.lineWidth = 2 * u;
    rrect(ctx, px - 14 * u, top, 28 * u, hh, 6 * u); ctx.fill(); ctx.stroke(); ctx.fillStyle = ink; ctx.fillRect(px - 1.5 * u, top, 3 * u, hh); ctx.fillRect(px - 10 * u, top + hh - 18 * u, 20 * u, 18 * u);
    const tk = 1 + .04 * fs.kick; ctx.save(); ctx.translate(Wn.x, V ? Math.min(sb.y1, Wn.y + Wn.h + 150 * u) : Wn.y + Wn.h + H * .15); ctx.scale(tk, tk); txt(ctx, tc2(fs.t - P.inT), 0, 0, `500 ${V ? 118 * u : W * .07}px ${FONT_MONO}`, ink); ctx.restore();
    sel(Wn.x + Wn.w / 2 + 8 * u, Wn.y + Wn.h / 2, Wn.w + 40 * u, Wn.h + 40 * u, .018, 'sel 2.0x · ' + Math.round(fs.bpm) + ' bpm');
    sparkle(ctx, V ? sb.x1 - 10 * u : W * .52, TB.y + 10 * u, 18 * u + 12 * u * fs.hat, ink);
    hud(ctx, 24 * u, 24 * u, W - 48 * u, H - 48 * u, 30 * u, rgba(ink, .45), 2 * u);
  },
};
