import { hex3, mix, rgba, txt, mono, slug, tc2, hud, sparkle, rrect, fitFont, hash, wavebars, FONT_COND, FONT_MONO } from '../util/draw.js';
import { chainsBounds } from '../overlays/chains.js';
import { elephFor } from '../overlays/elephant.js';
import { lineText, lineFont, lineColor } from '../overlays/text.js';
// EXE: light OS-window aesthetic. The U2C chains ARE the giant title (they assemble link by link into the word),
// with dotted selection handles around them. Below, the beat title types in letter by letter. The elephant is the app
// icon (desktop + title bar) and swings inside the .exe window above its waveform scanner.
const win = P => { const { W, H, V } = P, u = P.u; return V ? { x: W * .07, y: 1010 * u, w: W * .86, h: 520 * u } : { x: W * .5, y: H * .12, w: W * .45, h: H * .66 }; };
export default {
  id: 'exe', name: 'EXE', category: 'Interface', pal: 'charcoal', surface: 'paper', chainStyle: 'neon', glitchBoost: 1,
  owns: ['title', 'bpm', 'key', 'tag'], textPos: 'top',
  params: [{ id: 'blur', label: 'Type blur', min: 0, max: 2, step: .05, def: 1 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .285, s: .8 }, eleph: { x: .5, y: .575, s: .36, len: .005 } } : { chains: { x: .25, y: .33, s: .82 }, eleph: { x: .725, y: .195, s: .6, len: .02 } },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u, V } = P, ink = p.ink, bg = (hex3(p.paper)[0] + hex3(p.paper)[1] + hex3(p.paper)[2]) / 765 < .45 ? p.paper : mix(p.paper, p.light ? p.paper : '#ffffff', .5), grey = mix(ink, bg, .6), acc = p.pacc, blur = P.params && P.params.blur != null ? P.params.blur : 1;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = rgba(ink, .08); ctx.lineWidth = 1 * u; ctx.setLineDash([2 * u, 10 * u]); for (let x = W / 12; x < W; x += W / 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } ctx.setLineDash([]);
    const sel = (cx, cy, w, h, rot, lab) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.strokeStyle = rgba(ink, .65); ctx.lineWidth = 1.5 * u; ctx.setLineDash([5 * u, 6 * u]); ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]);
      for (const [hx, hy] of [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]) { ctx.fillStyle = bg; ctx.fillRect(hx * w / 2 - 7 * u, hy * h / 2 - 7 * u, 14 * u, 14 * u); ctx.strokeRect(hx * w / 2 - 7 * u, hy * h / 2 - 7 * u, 14 * u, 14 * u); }
      if (lab) txt(ctx, lab, w / 2 - 4 * u, h / 2 + 30 * u, mono(15 * u), rgba(ink, .7), 'right'); ctx.restore(); };
    // the chain title's selection frame (the chains themselves are drawn by the overlay on top)
    const cb = chainsBounds(P, assets);
    sel(cb.x + cb.w / 2, cb.y + cb.h / 2, cb.w + 60 * u, cb.h + 40 * u, -.02 + .008 * Math.sin(fs.beat * Math.PI / 2), 'u2c_logo.svg · ' + Math.round(cb.w) + '×' + Math.round(cb.h));
    // typed title under the logo: words swap each bar and type in letter by letter
    const words = []; const tl = lineText(P, 'title', fs); if (tl) words.push(...tl.split(/\s+/).filter(Boolean)); const bpm = lineText(P, 'bpm', fs); if (bpm) words.push(bpm.replace(/\s+/g, ''));
    const key = lineText(P, 'key', fs); if (key) words.push(key.replace(/\s+/g, ''));
    if (words.length) {
      const bars = Math.floor((fs.beat - P.anchorBeat) / 4), word = words[((bars % words.length) + words.length) % words.length];
      const TB = V ? { x: P.safe.hard.x0, y: cb.y + cb.h + 46 * u, w: P.safe.hard.x1 - P.safe.hard.x0, h: 130 * u } : { x: W * .05, y: cb.y + cb.h + 50 * u, w: W * .4, h: 150 * u };
      const fsz = Math.min(TB.h, fitFont(ctx, word, TB.w, TB.h, FONT_COND)), F = `${fsz}px ${FONT_COND}`; ctx.font = F;
      const lb = (fs.beat - P.anchorBeat) - bars * 4, step = Math.min(.5, 3 / word.length), base = TB.y + fsz * .9, ws = [...word].map(ch => ctx.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0);
      let x = V ? W / 2 - tot / 2 : TB.x; const col = lineColor(P, 'title', p, true);
      for (let j = 0; j < word.length; j++) { const age = (lb - j * step) * fs.spb, ch = word[j]; if (age < 0) { x += ws[j]; continue; }
        const jy = (hash(j, fs.kickIdx) - .5) * 20 * u * fs.kick;
        if (age < .2 && blur > 0) { const k = 1 - age / .2; for (let g = 5; g >= 1; g--) { ctx.globalAlpha = .1; txt(ctx, ch, x + k * 120 * u * blur * g / 5, base + jy, F, col); } ctx.globalAlpha = 1; }
        if (fs.snare > .2) { ctx.globalAlpha = fs.snare * .7; txt(ctx, ch, x + 8 * u, base + jy + 3 * u, F, acc); ctx.globalAlpha = 1; }
        ctx.globalAlpha = Math.min(1, age / .08); txt(ctx, ch, x, base + jy, F, col); ctx.globalAlpha = 1; x += ws[j]; } }
    const tag = lineText(P, 'tag', fs);
    // the .exe window: elephant viewport on top, waveform scanner below
    const Wn = win(P), view = Wn.h * (V ? .56 : .62);
    ctx.fillStyle = rgba(ink, .12); ctx.fillRect(Wn.x + 10 * u, Wn.y + 10 * u, Wn.w, Wn.h);
    ctx.fillStyle = bg; ctx.fillRect(Wn.x, Wn.y, Wn.w, Wn.h); ctx.strokeStyle = ink; ctx.lineWidth = 2.5 * u; ctx.strokeRect(Wn.x, Wn.y, Wn.w, Wn.h);
    ctx.fillStyle = ink; ctx.fillRect(Wn.x, Wn.y, Wn.w, 38 * u);
    const icon = elephFor(assets, p, 'paper'), is = 28 * u; ctx.drawImage(icon, Wn.x + 10 * u, Wn.y + 5 * u, is * icon.width / icon.height, is);
    txt(ctx, slug(lineText(P, 'title', fs, { ignoreOn: true })) + '_u2c.exe', Wn.x + Wn.w / 2, Wn.y + 25 * u, mono(17 * u, 700), bg, 'center');
    for (let j = 0; j < 3; j++) { ctx.strokeStyle = bg; ctx.lineWidth = 2 * u; ctx.strokeRect(Wn.x + Wn.w - (30 + j * 24) * u, Wn.y + 12 * u, 14 * u, 14 * u); }
    txt(ctx, 'FILE   VIEW   ELEPHANT   HELP', Wn.x + 16 * u, Wn.y + 62 * u, mono(14 * u), rgba(ink, .7));
    ctx.strokeStyle = rgba(ink, .25); ctx.lineWidth = 1 * u; ctx.strokeRect(Wn.x + 16 * u, Wn.y + 74 * u, Wn.w - 32 * u, view - 80 * u);
    for (let y = Wn.y + 80 * u; y < Wn.y + view - 8 * u; y += 22 * u) { ctx.fillStyle = rgba(ink, .05); ctx.fillRect(Wn.x + 16 * u, y, Wn.w - 32 * u, 1 * u); }
    const sx = Wn.x + 20 * u, sy = Wn.y + view + 12 * u, sW = Wn.w - 40 * u, sH = Wn.h - view - 30 * u;
    wavebars(ctx, fs, sx, sy, sW, sH, P.inT, P.outT, Math.round(sW / (5 * u)), grey, ink, fs.t, 'peak');
    const q = Math.min(1, Math.max(0, fs.lt / Math.max(.1, P.outT - P.inT))), px = sx + q * sW, top = sy - 12 * u, hh = sH + 24 * u; ctx.fillStyle = rgba(ink, .1); ctx.strokeStyle = ink; ctx.lineWidth = 2 * u;
    rrect(ctx, px - 12 * u, top, 24 * u, hh, 6 * u); ctx.fill(); ctx.stroke(); ctx.fillStyle = ink; ctx.fillRect(px - 1.5 * u, top, 3 * u, hh);
    sel(Wn.x + Wn.w / 2 + 8 * u, Wn.y + Wn.h / 2, Wn.w + 40 * u, Wn.h + 40 * u, .012, 'sel 2.0x · ' + Math.round(fs.bpm) + ' bpm');
    // big timecode + status line
    const tk = 1 + .04 * fs.kick; ctx.save(); ctx.translate(Wn.x, V ? Wn.y + Wn.h + 140 * u : Wn.y + Wn.h + H * .14); ctx.scale(tk, tk); txt(ctx, tc2(fs.lt), 0, 0, `500 ${V ? 110 * u : W * .05}px ${FONT_MONO}`, ink); ctx.restore();
    if (tag) txt(ctx, '// ' + tag + '.exe is running', V ? Wn.x : W * .05, V ? Wn.y + Wn.h + 200 * u : H * .9, lineFont(P, 'tag', 26 * u), lineColor(P, 'tag', p, true));
    // desktop icon: the elephant app
    const di = V ? { x: W * .8, y: Wn.y + Wn.h + 40 * u } : { x: W * .06, y: H * .8 }, ds = 92 * u;
    ctx.fillStyle = rgba(acc, .18 + .3 * fs.kick); rrect(ctx, di.x - 8 * u, di.y - 8 * u, ds + 16 * u, ds + 16 * u, 14 * u); ctx.fill();
    ctx.drawImage(icon, di.x + ds / 2 - ds * .5 * icon.width / icon.height, di.y, ds * icon.width / icon.height, ds);
    txt(ctx, 'U2C.EXE', di.x + ds / 2, di.y + ds + 30 * u, mono(15 * u, 700), ink, 'center');
    sparkle(ctx, cb.x + cb.w + 30 * u, cb.y, 18 * u + 12 * u * fs.hat, ink);
    hud(ctx, 24 * u, 24 * u, W - 48 * u, H - 48 * u, 30 * u, rgba(ink, .45), 2 * u);
  },
};
