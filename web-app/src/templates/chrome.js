import { rgba, txt, mono, hud, sparkle, mix, hash, FONT_COND } from '../util/draw.js';
import { accentOn } from '../brand/palettes.js';
// CHROME: extruded 3D chrome "U2C" wordmark over a receding grid floor, using only palette hues. Kicks punch it forward.
export default {
  id: 'chrome', name: 'CHROME', category: '3D', pal: 'amethyst', surface: 'dark', chainStyle: 'solid', glitchBoost: 1.1,
  params: [{ id: 'depth', label: 'Extrude', min: 4, max: 40, step: 1, def: 22 }],
  defaults: a => a === '916' ? { chains: { x: .5, y: .78, s: .32 }, eleph: { x: .87, s: .26, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .5, y: .82, s: .26 }, eleph: { x: .9, s: .3, len: .03 }, text: { tx: .05, ty: .93 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, T = P.text, a2 = accentOn(p), depth = (P.params && P.params.depth) || 22;
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, p.bg); bg.addColorStop(.55, p.bg2); bg.addColorStop(1, p.bg); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // perspective floor grid scrolling one row per beat
    const hz = V ? H * .5 : H * .58; ctx.strokeStyle = rgba(p.main, .22); ctx.lineWidth = 1.5 * u;
    for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * W * .02, hz); ctx.lineTo(W / 2 + i * W * .22, H); ctx.stroke(); }
    for (let k = 0; k < 14; k++) { const z = ((k + fs.bp) / 14), y = hz + (H - hz) * Math.pow(z, 2.2); ctx.globalAlpha = z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.globalAlpha = 1;
    const word = 'U2C', fsz = (V ? 380 : 420) * u * (1 + .07 * fs.kick), cx = W / 2, cy = V ? H * .36 : H * .36 + 40 * u;
    const ang = Math.sin(fs.beat * Math.PI / 8) * .5, dx = Math.cos(ang + .9) * 1.4 * u, dy = Math.sin(ang + .9) * 1.4 * u;
    ctx.save(); ctx.translate(cx, cy - fs.kick * 26 * u); ctx.transform(1, 0, Math.sin(fs.beat * Math.PI / 16) * .12, 1, 0, 0);
    ctx.font = `${fsz}px ${FONT_COND}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = depth; k >= 1; k--) { ctx.fillStyle = mix(p.dark, p.main, .15 + .5 * (1 - k / depth)); ctx.fillText(word, k * dx * 3, k * dy * 3); }
    const sh = (fs.barP - .5) * fsz * 1.2, g = ctx.createLinearGradient(-fsz + sh, -fsz * .5, fsz + sh, fsz * .5);
    g.addColorStop(0, p.hi); g.addColorStop(.3, p.main); g.addColorStop(.47, p.dark); g.addColorStop(.53, p.hi); g.addColorStop(.75, a2); g.addColorStop(1, p.main);
    ctx.fillStyle = g; ctx.fillText(word, 0, 0); ctx.lineWidth = 3 * u; ctx.strokeStyle = rgba(p.hi, .8); ctx.strokeText(word, 0, 0);
    ctx.restore();
    // reflection
    ctx.save(); ctx.translate(cx, hz + (hz - cy) * .25); ctx.scale(1, -.35); ctx.globalAlpha = .18 + .1 * fs.kick; ctx.font = `${fsz}px ${FONT_COND}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = p.main; ctx.fillText(word, 0, 0); ctx.restore();
    for (const r of fs.recent('hats', .4, 5)) { const q = r.age / .4; sparkle(ctx, cx + (hash(r.idx, 2) - .5) * fsz * 1.6, cy + (hash(r.idx, 3) - .5) * fsz * .7, 30 * u * (1 - q) * r.s + 2, p.spark, q); }
    const sb = P.safe.hard, mx = V ? sb.x0 : W * .07, ty = V ? sb.y0 + 10 * u : H * .08;
    txt(ctx, 'CHROME.U2C', mx, ty, mono(22 * u, 700), p.main); txt(ctx, 'EXTRUDE ' + depth + '  ROT ' + (ang * 57.3).toFixed(1) + '°', V ? sb.x1 : W - mx, ty, mono(16 * u), rgba(p.main, .7), 'right');
    hud(ctx, 28 * u, 28 * u, W - 56 * u, H - 56 * u, 44 * u, rgba(p.main, .5), 2 * u);
    void T;
  },
};
