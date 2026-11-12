import { rgba, txt, mono, hud, sparkle, hash, fitFont, FONT_COND } from '../util/draw.js';
import { accentOn } from '../brand/palettes.js';
// KINETIC: huge type locked to the beat. One word per beat (name, BPM, key, producer), punch-in on the beat,
// snare = inverted block, new bar = background flip.
const backOut = x => { const s = 1.7; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
export default {
  id: 'kinetic', name: 'KINETIC', category: 'Type', pal: 'charcoal', surface: 'dark', chainStyle: 'solid', ownText: true, glitchBoost: 1.1,
  params: [{ id: 'per', label: 'Beats per word', min: 1, max: 4, step: 1, def: 1 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .8, s: .34 }, eleph: { x: .88, s: .24, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .86, y: .82, s: .26 }, eleph: { x: .07, s: .3, len: .03 }, text: { tx: .05, ty: .93 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, T = P.text, a2 = accentOn(p), per = (P.params && P.params.per) || 1, sb = P.safe.hard;
    const words = []; if (T.showTitle && T.title) words.push(...T.title.toUpperCase().split(/\s+/).filter(Boolean)); if (T.showBpm) words.push(String(Math.round(fs.bpm)), 'BPM', (T.key || '').toUpperCase()); if (T.showTag) words.push(...(T.tag || '').toUpperCase().split(/\s+/)); words.push('U2C');
    const b = fs.beat - P.anchorBeat, wi = Math.floor(b / per), bar = Math.floor(b / 4), flip = ((bar % 2) + 2) % 2 === 1;
    const bgc = flip ? p.main : p.bg, fgc = flip ? p.dark : p.main; ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.strokeStyle = rgba(fgc, .08); ctx.lineWidth = 30 * u; const off = (fs.t * 60 * u) % (90 * u); for (let x = -H; x < W + H; x += 90 * u) { ctx.beginPath(); ctx.moveTo(x + off, 0); ctx.lineTo(x + off - H, H); ctx.stroke(); } ctx.restore();
    const word = words[((wi % words.length) + words.length) % words.length] || 'U2C', prev = words[(((wi - 1) % words.length) + words.length) % words.length];
    const q = Math.min(1, (b - wi * per) * fs.spb / .22), cx = W / 2, cy = V ? (sb.y0 + sb.y1) / 2 - 40 * u : H * .45;
    const maxW = V ? (sb.x1 - sb.x0) : W * .8, fsz = fitFont(ctx, word, maxW, V ? 420 * u : 460 * u, FONT_COND);
    ctx.save(); ctx.translate(cx, cy); ctx.globalAlpha = .18; ctx.lineWidth = 3 * u; ctx.strokeStyle = fgc; ctx.font = `${fitFont(ctx, prev, maxW, fsz * 1.1, FONT_COND)}px ${FONT_COND}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(prev, 0, -fsz * .02); ctx.restore();
    const sc = .6 + .4 * backOut(q), rot = (wi % 2 ? 1 : -1) * .05 * (1 - q) + (hash(fs.kickIdx, 2) - .5) * .04 * fs.kick;
    ctx.save(); ctx.translate(cx + (hash(fs.kickIdx, 3) - .5) * 20 * u * fs.kick, cy); ctx.rotate(rot); ctx.scale(sc * (1 + .05 * fs.kick), sc * (1 + .05 * fs.kick));
    ctx.font = `${fsz}px ${FONT_COND}`; const tw = ctx.measureText(word).width; const snr = fs.snare > .3;
    if (snr) { ctx.fillStyle = fgc; ctx.fillRect(-tw / 2 - 30 * u, -fsz * .55, tw + 60 * u, fsz * 1.08); }
    txt(ctx, word, 0, fsz * .05, `${fsz}px ${FONT_COND}`, snr ? bgc : fgc, 'center', 'middle'); ctx.restore();
    const ny = V ? sb.y1 - 40 * u : H * .86, nx0 = V ? sb.x0 : W * .1, nx1 = V ? sb.x1 : W * .9;
    for (let k = 0; k < 16; k++) { const on = k <= Math.floor((b - bar * 4) * 4); ctx.fillStyle = rgba(fgc, on ? .9 : .2); ctx.fillRect(nx0 + k * (nx1 - nx0) / 16, ny, (nx1 - nx0) / 16 - 6 * u, (k % 4 === 0 ? 22 : 12) * u); }
    txt(ctx, 'BEAT ' + (((Math.floor(b) % 4) + 4) % 4 + 1) + '/4', nx0, ny - 18 * u, mono(18 * u, 700), fgc); txt(ctx, 'BAR ' + (bar + 1), nx1, ny - 18 * u, mono(18 * u, 500), rgba(fgc, .7), 'right');
    sparkle(ctx, V ? sb.x1 : W * .9, V ? sb.y0 + 30 * u : H * .12, 22 * u + 14 * u * fs.hat, fgc);
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 44 * u, rgba(fgc, .5), 2 * u);
  },
};
