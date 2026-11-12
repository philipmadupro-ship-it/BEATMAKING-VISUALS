import { rgba, txt, mono, hud, hash, sparkle, mix } from '../util/draw.js';
import { accentOn, hotOn } from '../brand/palettes.js';
// DAW: fake playlist screen built from the analysed track. Toolbar, channel rack (16 steps lit from detected hits),
// scrolling piano-roll lanes and a "cooking up" caption.
export default {
  id: 'daw', name: 'DAW', category: 'Roll', pal: 'amethyst', surface: 'dark', chainStyle: 'solid', ownText: true,
  params: [{ id: 'zoom', label: 'Roll zoom', min: .5, max: 2, step: .05, def: 1 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .82, s: .3 }, eleph: { x: .9, s: .24, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .9, y: .86, s: .2 }, eleph: { x: .95, s: .26, len: .03 }, text: { tx: .05, ty: .93 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, T = P.text, a2 = accentOn(p), hot = hotOn(p), Tr = fs.track, sb = P.safe.hard; ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    const X0 = V ? sb.x0 - 60 * u : W * .05, X1 = V ? sb.x1 + 60 * u : W * .95, Y0 = V ? sb.y0 : H * .08;
    // toolbar
    ctx.fillStyle = p.bg2; ctx.fillRect(X0, Y0, X1 - X0, 64 * u); ctx.strokeStyle = rgba(p.main, .25); ctx.lineWidth = 1.5 * u; ctx.strokeRect(X0, Y0, X1 - X0, 64 * u);
    ctx.fillStyle = p.main; ctx.beginPath(); ctx.moveTo(X0 + 22 * u, Y0 + 18 * u); ctx.lineTo(X0 + 46 * u, Y0 + 32 * u); ctx.lineTo(X0 + 22 * u, Y0 + 46 * u); ctx.fill();
    txt(ctx, fs.bpm.toFixed(3), X0 + 70 * u, Y0 + 42 * u, mono(26 * u, 700), p.text); txt(ctx, ((Math.floor(fs.bar) + 1) + ':' + ((Math.floor(fs.beat) % 4 + 4) % 4 + 1) + ':' + String(Math.floor(fs.bp * 16) % 16).padStart(2, '0')), X0 + 230 * u, Y0 + 42 * u, mono(24 * u), a2);
    txt(ctx, 'PAT 01 · ' + ((T.title || 'beat').toUpperCase().slice(0, 12)), X1 - 20 * u, Y0 + 42 * u, mono(18 * u), rgba(p.main, .7), 'right');
    // channel rack: steps of the current bar lit from detected onsets
    const rows = [['KICK', 'kicks', p.main], ['SNARE', 'snares', a2], ['HAT', 'hats', hot], ['808', 'kicks', p.hi]], ry = Y0 + 90 * u, rh = 46 * u, stepX = X0 + 150 * u, sw = (X1 - stepX - 10 * u) / 16;
    const barStart = Tr.t0 + Math.floor(fs.beat / 4) * 4 * fs.spb, cur = Math.floor((fs.beat - Math.floor(fs.beat / 4) * 4) * 4);
    rows.forEach(([nm, key, col], ri) => { const y = ry + ri * rh; txt(ctx, nm, X0 + 10 * u, y + rh * .62, mono(16 * u, 700), col); const L = Tr[key];
      for (let s = 0; s < 16; s++) { const t0 = barStart + s * fs.spb / 4, t1 = t0 + fs.spb / 4; let on = false;
        let lo = 0, hi = L.t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L.t[m] < t0 - .03) lo = m + 1; else hi = m; } on = lo < L.t.length && L.t[lo] < t1 - .03; if (nm === '808') on = on && fs.spec(t0, 3) > .4;
        const live = s === cur; ctx.fillStyle = on ? (live ? '#ffffff' : col) : rgba(p.main, (s >> 2) % 2 ? .08 : .14); ctx.fillRect(stepX + s * sw + 2 * u, y + 6 * u, sw - 4 * u, rh - 12 * u);
        if (live) { ctx.strokeStyle = p.hi; ctx.lineWidth = 2 * u; ctx.strokeRect(stepX + s * sw + 1 * u, y + 5 * u, sw - 2 * u, rh - 10 * u); } } });
    // piano-roll lanes
    const R = { y: ry + 4 * rh + 30 * u, h: V ? sb.y1 - (ry + 4 * rh + 30 * u) - 90 * u : H * .9 - (ry + 4 * rh + 30 * u) }, px = X0 + (X1 - X0) * .3, pps = (X1 - X0) * .25 / (4 * fs.spb) * ((P.params && P.params.zoom) || 1);
    ctx.save(); ctx.beginPath(); ctx.rect(X0, R.y, X1 - X0, R.h); ctx.clip(); ctx.fillStyle = mix(p.bg, '#000000', .25); ctx.fillRect(X0, R.y, X1 - X0, R.h);
    for (let k = 0; k < 24; k++) { ctx.fillStyle = rgba(p.main, [1, 3, 6, 8, 10].includes(k % 12) ? .06 : .02); ctx.fillRect(X0, R.y + k * R.h / 24, X1 - X0, R.h / 24 - 1); }
    for (let b = Math.ceil(fs.beat - (px - X0) / pps / fs.spb); b < fs.beat + (X1 - px) / pps / fs.spb; b++) { const tx = px + (Tr.t0 + b * fs.spb - fs.t) * pps; ctx.fillStyle = rgba(p.main, b % 4 === 0 ? .35 : .1); ctx.fillRect(tx, R.y, b % 4 === 0 ? 2 * u : 1 * u, R.h); if (b % 4 === 0) txt(ctx, String(Math.floor(b / 4) + 1), tx + 5 * u, R.y + 18 * u, mono(13 * u), rgba(p.main, .6)); }
    const lanes = [['kicks', p.main, .8], ['snares', a2, .55], ['hats', hot, .3]];
    for (const [key, col, yb] of lanes) { const L = Tr[key], t0 = fs.t - (px - X0) / pps, t1 = fs.t + (X1 - px) / pps; let lo = 0, hi = L.t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L.t[m] < t0) lo = m + 1; else hi = m; }
      for (let j = lo; j < L.t.length && L.t[j] < t1; j++) { const tx = px + (L.t[j] - fs.t) * pps, pitch = Math.floor(hash(j, key.length) * 6), yy = R.y + R.h * yb - pitch * R.h / 24, w = Math.max(12 * u, fs.spb / 4 * pps * (key === 'kicks' ? 2 : 1)), hh = R.h / 24 - 2;
        const near = tx <= px && tx + w >= px; ctx.fillStyle = near ? '#ffffff' : rgba(col, tx < px ? .45 : .9); ctx.fillRect(tx, yy, w, hh); if (near) { ctx.strokeStyle = rgba(col, .7); ctx.lineWidth = 5 * u; ctx.strokeRect(tx - 3 * u, yy - 3 * u, w + 6 * u, hh + 6 * u); } } }
    ctx.restore(); ctx.fillStyle = fs.kick > .5 ? p.hi : p.main; ctx.fillRect(px - 2 * u, R.y - 14 * u, 4 * u, R.h + 28 * u);
    ctx.strokeStyle = rgba(p.main, .3); ctx.lineWidth = 1.5 * u; ctx.strokeRect(X0, R.y, X1 - X0, R.h);
    const cap = 'cooking up "' + ((T.showTitle ? T.title : '') || 'untitled') + '"' + (T.showBpm ? ' · ' + Math.round(fs.bpm) + ' bpm' : '') + ' …';
    txt(ctx, cap, V ? sb.x0 : X0, R.y + R.h + 52 * u, mono(24 * u, 500), p.text); ctx.fillStyle = p.text; if (Math.floor(fs.beat * 2) % 2 === 0) { ctx.font = mono(24 * u, 500); ctx.fillRect((V ? sb.x0 : X0) + ctx.measureText(cap).width + 6 * u, R.y + R.h + 30 * u, 12 * u, 26 * u); }
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 40 * u, rgba(p.main, .5), 2 * u); sparkle(ctx, X1 - 10 * u, Y0 - 30 * u, 14 * u + 8 * u * fs.hat, p.spark);
  },
};
