import { cached, rgba, hash, txt, mono, fitFont, hud, sparkle, wavebars, FONT_COND, FONT_SERIF } from '../util/draw.js';
// CHAIN POSTER: grunge print. Torn tan band with the title, big U2C chains, BPM stamp, waveform strip, tape, sparkle.
export default {
  id: 'poster', name: 'Chain Poster', category: 'Print', pal: 'rust', surface: 'dark', chainStyle: 'solid', ownText: true, grainBoost: 1.2,
  params: [{ id: 'tear', label: 'Tear depth', min: 0, max: 2, step: .05, def: 1 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .5, s: .95 }, eleph: { x: .86, s: .28, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .56, y: .6, s: .8 }, eleph: { x: .07, s: .36, len: .05 }, text: { tx: .05, ty: .93 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, T = P.text, ink = p.dark, band = p.main, tear = P.params && P.params.tear != null ? P.params.tear : 1; ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(cached(`blot|${p.id}|${W}`, W / 3, H / 3, (g, w, h) => { for (let j = 0; j < 40; j++) { const x = hash(j, 1) * w, y = hash(j, 2) * h, r = 10 + hash(j, 3) * 60, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(hash(j, 4) < .5 ? ink : band, .12)); gr.addColorStop(1, rgba(ink, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
      g.strokeStyle = rgba(band, .12); for (let j = 0; j < 14; j++) { g.beginPath(); const x = hash(j, 7) * w; g.moveTo(x, hash(j, 8) * h); g.lineTo(x + (hash(j, 9) - .5) * 80, hash(j, 10) * h); g.stroke(); } }), 0, 0, W, H);
    const y0 = V ? 300 * u : H * .08, y1 = V ? 560 * u : H * .3; ctx.fillStyle = band; ctx.beginPath(); ctx.moveTo(-10, y0);
    for (let x = 0; x <= W + 20; x += 18 * u) ctx.lineTo(x, y0 + ((hash(x | 0, 21) - .5) * 22 + Math.sin(x / W * 5) * 14) * u * tear);
    for (let x = W + 20; x >= -20; x -= 18 * u) ctx.lineTo(x, y1 + ((hash(x | 0, 22) - .5) * 26 - Math.sin(x / W * 4) * 18) * u * tear); ctx.closePath(); ctx.fill();
    const title = ((T.showTitle ? T.title : '') || 'U2C').toUpperCase(), fsz = fitFont(ctx, title, V ? (P.safe.hard.x1 - P.safe.hard.x0) : W * .86, (y1 - y0) * .78, FONT_COND), ts = 1 + .06 * fs.kick;
    ctx.font = `${fsz}px ${FONT_COND}`; const tw = ctx.measureText(title).width, blk = fs.snare > .25;
    if (blk) { ctx.fillStyle = rgba(ink, fs.snare); ctx.fillRect(W / 2 - tw / 2 - 24 * u, (y0 + y1) / 2 - fsz * .55, tw + 48 * u, fsz * 1.1); }
    ctx.save(); ctx.translate(W / 2, (y0 + y1) / 2 + fsz * .36); ctx.scale(ts, ts); txt(ctx, title, 0, 0, `${fsz}px ${FONT_COND}`, blk ? band : ink, 'center'); ctx.restore();
    ctx.fillStyle = rgba(band, .55); for (const [tx, ty, r] of [[W * .08, y0, -.5], [W * .9, y1, .45]]) { ctx.save(); ctx.translate(tx, ty); ctx.rotate(r); ctx.fillRect(-70 * u, -22 * u, 140 * u, 44 * u); ctx.restore(); }
    const lx = V ? P.safe.hard.x0 : W * .07, rx = V ? P.safe.hard.x1 : W * .93;
    txt(ctx, 'PROD. U2C  /  ' + new Date().getFullYear(), lx, y1 + 56 * u, mono(18 * u, 500), rgba(band, .85)); txt(ctx, 'BAR ' + String(fs.bar + 1).padStart(3, '0'), rx, y1 + 56 * u, mono(18 * u, 500), rgba(band, .85), 'right');
    const sx = V ? W * .27 : W * .12, sy = V ? 1110 * u : H * .74, sr = V ? 110 * u : 130 * u; ctx.save(); ctx.translate(sx, sy); ctx.rotate(-.2 + (hash(fs.kickIdx, 4) - .5) * .1 * fs.kick); ctx.strokeStyle = band; ctx.lineWidth = 5 * u;
    ctx.beginPath(); ctx.arc(0, 0, sr, 0, 7); ctx.stroke(); ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.arc(0, 0, sr - 14 * u, 0, 7); ctx.stroke(); ctx.strokeStyle = rgba(band, 1 - fs.bp); ctx.beginPath(); ctx.arc(0, 0, sr + (1 - fs.bp) * 30 * u, 0, 7); ctx.stroke();
    if (T.showBpm) { txt(ctx, String(Math.round(fs.bpm)), 0, 24 * u, `${sr * .85}px ${FONT_COND}`, band, 'center'); txt(ctx, 'BPM · ' + (T.key || '').toUpperCase(), 0, sr * .55, mono(16 * u, 700), band, 'center'); } ctx.restore();
    if (T.showTag) txt(ctx, T.tag, rx, V ? 1225 * u : H * .8, `italic 400 ${54 * u}px ${FONT_SERIF}`, band, 'right');
    const wy = V ? H * .8 : H * .9, wh = V ? H * .05 : H * .08; wavebars(ctx, fs, W * .06, wy, W * .88, wh, fs.t - 4, fs.t + 4, 80, rgba(band, .45), band, fs.t, 'rms'); ctx.fillStyle = ink; ctx.fillRect(W / 2 - 2 * u, wy - 10 * u, 4 * u, wh + 20 * u);
    sparkle(ctx, W * .88, V ? H * .9 : H * .18, (30 + 16 * (1 - fs.bp)) * u, ink); hud(ctx, 24 * u, 24 * u, W - 48 * u, H - 48 * u, 40 * u, rgba(band, .6), 2.5 * u);
  },
};
