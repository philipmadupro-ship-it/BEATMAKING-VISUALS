import { cached, rgba, hash, txt, mono, fitFont, hud, sparkle, wavebars, FONT_COND } from '../util/draw.js';
import { lineText, lineFont, lineColor, rawLine } from '../overlays/text.js';
// CHAIN POSTER: grunge print. The U2C chains are the hero, nearly full width; a torn tan band carries the title,
// BPM stamp, waveform strip, tape, sparkle. The elephant swings from the top tape.
export default {
  id: 'poster', name: 'Chain Poster', category: 'Print', pal: 'rust', surface: 'dark', chainStyle: 'solid', grainBoost: 1.2, owns: ['title', 'bpm', 'key', 'tag'], textPos: 'top',
  params: [{ id: 'tear', label: 'Tear depth', min: 0, max: 2, step: .05, def: 1 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .51, s: 1.05 }, eleph: { x: .8, y: 0, s: .42, len: .02 } } : { chains: { x: .58, y: .58, s: 1.3 }, eleph: { x: .12, y: 0, s: .5, len: .2 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, ink = p.dark, band = p.main, tear = P.params && P.params.tear != null ? P.params.tear : 1; ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(cached(`blot|${p.id}|${W}`, W / 3, H / 3, (g, w, h) => { for (let j = 0; j < 40; j++) { const x = hash(j, 1) * w, y = hash(j, 2) * h, r = 10 + hash(j, 3) * 60, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(hash(j, 4) < .5 ? ink : band, .12)); gr.addColorStop(1, rgba(ink, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
      g.strokeStyle = rgba(band, .12); for (let j = 0; j < 14; j++) { g.beginPath(); const x = hash(j, 7) * w; g.moveTo(x, hash(j, 8) * h); g.lineTo(x + (hash(j, 9) - .5) * 80, hash(j, 10) * h); g.stroke(); } }), 0, 0, W, H);
    const y0 = V ? 230 * u : H * .05, y1 = V ? 420 * u : H * .22; ctx.fillStyle = band; ctx.beginPath(); ctx.moveTo(-10, y0);
    for (let x = 0; x <= W + 20; x += 18 * u) ctx.lineTo(x, y0 + ((hash(x | 0, 21) - .5) * 22 + Math.sin(x / W * 5) * 14) * u * tear);
    for (let x = W + 20; x >= -20; x -= 18 * u) ctx.lineTo(x, y1 + ((hash(x | 0, 22) - .5) * 26 - Math.sin(x / W * 4) * 18) * u * tear); ctx.closePath(); ctx.fill();
    const title = lineText(P, 'title', fs), tsz = (rawLine(P, 'title') || {}).size || 1, fsz = title ? fitFont(ctx, title, V ? (P.safe.hard.x1 - P.safe.hard.x0) : W * .86, (y1 - y0) * .78 * Math.min(1, tsz), FONT_COND) : 0, ts = 1 + .06 * fs.kick;
    ctx.font = `${fsz}px ${FONT_COND}`; const tw = title ? ctx.measureText(title).width : 0, blk = title && fs.snare > .25;
    if (blk) { ctx.fillStyle = rgba(ink, fs.snare); ctx.fillRect(W / 2 - tw / 2 - 24 * u, (y0 + y1) / 2 - fsz * .55, tw + 48 * u, fsz * 1.1); }
    if (title) { ctx.save(); ctx.translate(W / 2, (y0 + y1) / 2 + fsz * .36); ctx.scale(ts, ts); txt(ctx, title, 0, 0, `${fsz}px ${FONT_COND}`, blk ? band : ink, 'center'); ctx.restore(); }
    ctx.fillStyle = rgba(band, .55); for (const [tx, ty, r] of [[W * .08, y0, -.5], [W * .9, y1, .45]]) { ctx.save(); ctx.translate(tx, ty); ctx.rotate(r); ctx.fillRect(-70 * u, -22 * u, 140 * u, 44 * u); ctx.restore(); }
    const lx = V ? P.safe.hard.x0 : W * .07, rx = V ? P.safe.hard.x1 : W * .93;
    txt(ctx, 'U2C  /  CHAIN POSTER', lx, y1 + 56 * u, mono(18 * u, 500), rgba(band, .85)); txt(ctx, 'BAR ' + String(fs.bar + 1).padStart(3, '0'), rx, y1 + 56 * u, mono(18 * u, 500), rgba(band, .85), 'right');
    const sx = V ? W * .2 : W * .1, sy = V ? y1 + 160 * u : H * .8, sr = V ? 100 * u : 120 * u; ctx.save(); ctx.translate(sx, sy); ctx.rotate(-.2 + (hash(fs.kickIdx, 4) - .5) * .1 * fs.kick); ctx.strokeStyle = band; ctx.lineWidth = 5 * u;
    ctx.beginPath(); ctx.arc(0, 0, sr, 0, 7); ctx.stroke(); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(0, 0, sr - 14 * u, 0, 7); ctx.stroke(); ctx.strokeStyle = rgba(band, 1 - fs.bp); ctx.beginPath(); ctx.arc(0, 0, sr + (1 - fs.bp) * 30 * u, 0, 7); ctx.stroke();
    const bpmL = lineText(P, 'bpm', fs), keyL = lineText(P, 'key', fs);
    if (bpmL) { const num = (bpmL.match(/\d+/) || [''])[0], rest = bpmL.replace(num, '').trim(); txt(ctx, num || bpmL, 0, 24 * u, `${sr * (num ? .85 : .3)}px ${FONT_COND}`, band, 'center'); txt(ctx, [rest, keyL].filter(Boolean).join(' · '), 0, sr * .55, lineFont(P, 'key', 16 * u, 700), band, 'center'); }
    else if (keyL) txt(ctx, keyL, 0, 8 * u, lineFont(P, 'key', 30 * u, 700), band, 'center'); ctx.restore();
    const tag = lineText(P, 'tag', fs); if (tag) txt(ctx, tag, rx, V ? y1 + 150 * u : H * .86, lineFont(P, 'tag', 54 * u), lineColor(P, 'tag', { ...p, main: band, hi: band }), 'right');
    const wy = V ? H * .72 : H * .9, wh = V ? H * .04 : H * .06; wavebars(ctx, fs, W * .06, wy, W * .88, wh, fs.t - 4, fs.t + 4, 80, rgba(band, .45), band, fs.t, 'rms'); ctx.fillStyle = ink; ctx.fillRect(W / 2 - 2 * u, wy - 10 * u, 4 * u, wh + 20 * u);
    sparkle(ctx, W * .9, V ? H * .79 : H * .3, (30 + 16 * (1 - fs.bp)) * u, ink); hud(ctx, 24 * u, 24 * u, W - 48 * u, H - 48 * u, 40 * u, rgba(band, .6), 2.5 * u);
  },
};
