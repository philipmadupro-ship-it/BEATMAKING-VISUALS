import { mk, hash, hex3, rgba, mix, rrect, txt, mono, tc2, fitFont, sparkle, hud, wavebars, memo, cached, FONT_SERIF } from '../util/draw.js';
// HANDSET: off-white newsprint collage. Dithered phone + cassette + CD + pager, photocopy grain; screen flickers on snares.
function dither(drawFn, w, h, dot, ink, paper, seed) {
  const c = mk(w / dot, h / dot), g = c.getContext('2d'); g.scale(1 / dot, 1 / dot); drawFn(g);
  const d = g.getImageData(0, 0, c.width, c.height), D = d.data, ik = hex3(ink), pp = hex3(paper), B4 = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (D[i + 3] < 60) { D[i + 3] = 0; continue; }
    const l = D[i] / 255, th = (B4[(x & 3) + (y & 3) * 4] + .5) / 16 + (hash(x * 7919 + y, seed) - .5) * .35, q = l < th ? ik : pp; D[i] = q[0]; D[i + 1] = q[1]; D[i + 2] = q[2]; D[i + 3] = 255; }
  g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(d, 0, 0); return c;
}
const G = v => { const c = Math.round(v * 255); return `rgb(${c},${c},${c})`; };
function drawPhone(g) { g.fillStyle = G(.28); rrect(g, 10, 40, 380, 710, 60); g.fill(); g.fillStyle = G(.5); rrect(g, 26, 56, 348, 678, 48); g.fill();
  const gr = g.createLinearGradient(0, 0, 400, 0); gr.addColorStop(0, G(.18)); gr.addColorStop(.5, G(.42)); gr.addColorStop(1, G(.2)); g.fillStyle = gr; rrect(g, 34, 64, 332, 662, 44); g.fill();
  g.fillStyle = G(.3); g.fillRect(300, 0, 40, 60); g.fillStyle = G(.08); rrect(g, 150, 84, 100, 12, 6); g.fill(); g.fillStyle = G(.1); g.fillRect(48, 112, 304, 252); g.fillStyle = G(.95); g.fillRect(52, 120, 296, 236);
  g.fillStyle = G(.75); g.beginPath(); g.arc(200, 440, 52, 0, 7); g.fill(); g.fillStyle = G(.3); g.beginPath(); g.arc(200, 440, 24, 0, 7); g.fill();
  g.fillStyle = G(.85); for (let j = 0; j < 2; j++) { rrect(g, 64 + j * 220, 410, 52, 26, 10); g.fill(); }
  g.font = '700 26px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let r = 0; r < 4; r++) for (let cc = 0; cc < 3; cc++) { const x = 82 + cc * 118, y = 520 + r * 52; g.fillStyle = G(.88); rrect(g, x, y, 90, 40, 14); g.fill(); g.fillStyle = G(.15); g.fillText('123456789*0#'[r * 3 + cc], x + 45, y + 21); }
  for (let j = 0; j < 220; j++) { g.fillStyle = G(hash(j, 5) * .3); g.fillRect(40 + hash(j, 6) * 320, 70 + hash(j, 7) * 640, 2 + hash(j, 8) * 6, 2 + hash(j, 9) * 5); } }
function drawCassette(g) { g.fillStyle = G(.62); rrect(g, 0, 0, 360, 230, 14); g.fill(); g.fillStyle = G(.92); rrect(g, 22, 18, 316, 120, 8); g.fill();
  g.fillStyle = G(.35); for (let j = 0; j < 4; j++) g.fillRect(40, 40 + j * 20, 280, 3); g.fillStyle = G(.15); rrect(g, 90, 82, 180, 52, 24); g.fill();
  for (const x of [128, 232]) { g.fillStyle = G(.9); g.beginPath(); g.arc(x, 108, 20, 0, 7); g.fill(); g.fillStyle = G(.2); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.fillRect(x + Math.cos(a) * 12 - 3, 108 + Math.sin(a) * 12 - 3, 6, 6); } }
  g.fillStyle = G(.4); g.beginPath(); g.moveTo(60, 230); g.lineTo(80, 170); g.lineTo(280, 170); g.lineTo(300, 230); g.fill(); for (const x of [12, 348]) for (const y of [12, 218]) { g.fillStyle = G(.2); g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); } }
function drawCD(g) { const gr = g.createRadialGradient(150, 150, 20, 150, 150, 150); gr.addColorStop(0, G(.9)); gr.addColorStop(.5, G(.55)); gr.addColorStop(1, G(.75)); g.fillStyle = gr; g.beginPath(); g.arc(150, 150, 148, 0, 7); g.fill();
  g.fillStyle = G(.98); g.beginPath(); g.moveTo(150, 150); g.arc(150, 150, 146, -.9, -.3); g.fill(); g.beginPath(); g.moveTo(150, 150); g.arc(150, 150, 146, 2.2, 2.6); g.fill();
  g.strokeStyle = G(.35); g.lineWidth = 2; for (const r of [60, 100, 140]) { g.beginPath(); g.arc(150, 150, r, 0, 7); g.stroke(); }
  g.fillStyle = G(.85); g.beginPath(); g.arc(150, 150, 44, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(150, 150, 18, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
function drawPager(g) { g.fillStyle = G(.32); rrect(g, 0, 0, 220, 280, 28); g.fill(); g.fillStyle = G(.12); g.fillRect(24, 30, 172, 120); g.fillStyle = G(.9); g.fillRect(30, 36, 160, 108);
  g.fillStyle = G(.75); for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(56 + j * 54, 200, 20, 0, 7); g.fill(); } g.fillStyle = G(.55); rrect(g, 40, 236, 140, 18, 9); g.fill();
  for (let j = 0; j < 90; j++) { g.fillStyle = G(hash(j, 15) * .3); g.fillRect(hash(j, 16) * 220, hash(j, 17) * 280, 3, 3); } }
const sprites = p => memo('hs-sprites-' + p.id, () => ({ phone: dither(drawPhone, 400, 760, 3, p.ink, p.paper, 1), cas: dither(drawCassette, 360, 230, 3, p.ink, p.paper, 2), cd: dither(drawCD, 300, 300, 3, p.ink, p.paper, 3), pager: dither(drawPager, 220, 280, 3, p.ink, p.paper, 4) }));
export default {
  id: 'handset', name: 'HANDSET', category: 'Print', pal: 'rust', surface: 'paper', chainStyle: 'solid', ownText: true, grainBoost: 1.3, glitchBoost: .7,
  params: [{ id: 'bump', label: 'Kick bump', min: 0, max: 2, step: .05, def: 1 }],
  defaults: a => a === '916' ? { chains: { x: .25, y: .5, s: .26 }, eleph: { x: .84, s: .3, len: .03 }, text: { tx: .15, ty: .65 } } : { chains: { x: .2, y: .72, s: .26 }, eleph: { x: .9, s: .42, len: .03 }, text: { tx: .05, ty: .83 } },
  draw(ctx, fs, P, p) {
    const { W, H, u, V } = P, T = P.text, bump = (P.params && P.params.bump != null ? P.params.bump : 1);
    ctx.fillStyle = p.paper; ctx.fillRect(0, 0, W, H);
    const v = ((Math.floor(fs.beat) % 3) + 3) % 3;
    ctx.drawImage(cached(`toner|${v}|${p.id}|${W}`, W / 3, H / 3, (g, w, h) => { for (let j = 0; j < 380; j++) { g.fillStyle = rgba(p.ink, .12 + hash(j, v * 3 + 1) * .5); const r = hash(j, v * 3 + 2) < .9 ? .6 + hash(j, v) * 1.4 : 2 + hash(j, v) * 4; g.beginPath(); g.arc(hash(j, v * 3 + 3) * w, hash(j, v * 3 + 4) * h, r, 0, 7); g.fill(); }
      g.strokeStyle = rgba(p.ink, .08); for (let j = 0; j < 6; j++) { g.beginPath(); const y = hash(j, v + 40) * h; g.moveTo(0, y); g.lineTo(w, y + (hash(j, v + 41) - .5) * 20); g.stroke(); } }), 0, 0, W, H);
    const sp = sprites(p); ctx.imageSmoothingEnabled = false;
    const kb = i => fs.kick * (10 + 12 * hash(i, fs.kickIdx)) * u * bump;
    const obj = (img, cx, cy, sc, r, i) => { const rr = r + (hash(i, fs.kickIdx + 7) - .5) * .06 * fs.kick * bump; ctx.save(); ctx.translate(cx, cy - kb(i)); ctx.rotate(rr); ctx.scale(sc, sc); ctx.drawImage(img, -img.width * 1.5, -img.height * 1.5, img.width * 3, img.height * 3); ctx.restore(); };
    const L = V ? { ph: [.5, .35, W * .38 / 400], cas: [.23, .2, W * .28 / 360, -.14], cd: [.8, .45, W * .24 / 300], pg: [.79, .19, W * .19 / 220, .1], ty: 1130 * u }
                : { ph: [.5, .42, H * .62 / 760], cas: [.2, .3, W * .17 / 360, -.12], cd: [.8, .62, W * .14 / 300], pg: [.8, .26, W * .11 / 220, .1], ty: H * .875 };
    obj(sp.cas, L.cas[0] * W, L.cas[1] * H, L.cas[2], L.cas[3], 1);
    ctx.save(); ctx.translate(L.cd[0] * W, L.cd[1] * H - fs.kick * 14 * u * bump); ctx.rotate(fs.beat * Math.PI / 8); ctx.scale(L.cd[2], L.cd[2]); ctx.drawImage(sp.cd, -150, -150, 300, 300); ctx.restore();
    obj(sp.pager, L.pg[0] * W, L.pg[1] * H, L.pg[2], L.pg[3], 3);
    ctx.save(); ctx.translate(L.pg[0] * W, L.pg[1] * H - kb(3)); ctx.rotate(L.pg[3]); ctx.scale(L.pg[2], L.pg[2]); ctx.translate(-110, -140);
    for (let j = 0; j < 8; j++) { const vv = fs.specAt(4 + j * 5); ctx.fillStyle = p.ink; for (let q = 0; q < Math.round(vv * 6); q++) ctx.fillRect(40 + j * 18, 128 - q * 14, 12, 10); } ctx.restore();
    const pc = L.ph; ctx.save(); ctx.translate(pc[0] * W, pc[1] * H - fs.kick * 16 * u * bump); ctx.rotate((hash(0, fs.kickIdx) - .5) * .03 * fs.kick * bump); ctx.scale(pc[2], pc[2]);
    ctx.drawImage(sp.phone, -200, -380, 400, 760); ctx.translate(-200, -380); ctx.imageSmoothingEnabled = true;
    const inv = fs.snareAge < .07 && fs.snare > .3, lite = mix(p.paper, '#ffffff', .35), sb = inv ? p.ink : lite, sf = inv ? lite : p.ink;
    ctx.fillStyle = sb; ctx.fillRect(52, 120, 296, 236);
    if (!(fs.snareAge < .04 && fs.snare > .5)) {
      txt(ctx, 'U2C ✦', 64, 146, mono(16, 700), sf); txt(ctx, tc2(fs.t - P.inT), 336, 146, mono(14, 500), sf, 'right');
      wavebars(ctx, fs, 64, 160, 272, 80, fs.t - 3, fs.t + 3, 40, rgba(sf, .45), sf, fs.t, 'rms'); ctx.fillStyle = sf; ctx.fillRect(199, 158, 2, 84);
      txt(ctx, Math.round(fs.bpm * 10) / 10 + ' BPM', 64, 296, mono(40, 700), sf); txt(ctx, (T.key || '').toUpperCase(), 336, 296, mono(18, 500), sf, 'right');
      ctx.fillStyle = rgba(sf, .3); ctx.fillRect(64, 316, 272, 10); ctx.fillStyle = sf; ctx.fillRect(64, 316, 272 * Math.min(1, Math.max(0, (fs.t - P.inT) / Math.max(.1, P.outT - P.inT))), 10);
      txt(ctx, 'BAR ' + (fs.bar + 1), 64, 346, mono(14), sf); txt(ctx, '▶ PLAY', 336, 346, mono(14), sf, 'right'); }
    ctx.fillStyle = rgba(p.ink, .12); for (let y = 120; y < 356; y += 4) ctx.fillRect(52, y, 296, 1.5);
    ctx.restore(); ctx.imageSmoothingEnabled = true;
    const tline = ((T.showTitle ? T.title : '') + '  ' + (T.handle || '')).trim();
    const fsz = fitFont(ctx, tline, V ? (P.safe.hard.x1 - P.safe.hard.x0) : W * .7, 70 * u, FONT_SERIF, 'italic 400');
    txt(ctx, tline, W / 2, L.ty, `italic 400 ${fsz}px ${FONT_SERIF}`, p.ink, 'center');
    if (T.showBpm) txt(ctx, `${Math.round(fs.bpm * 10) / 10} bpm ${(T.key || '').toLowerCase()}`, W / 2, L.ty + 52 * u, `italic 400 ${42 * u}px ${FONT_SERIF}`, rgba(p.ink, .8), 'center');
    if (T.showTag) txt(ctx, '— ' + T.tag + ' —', W / 2, V ? L.ty + 100 * u : H * .95, mono(18 * u), rgba(p.ink, .7), 'center');
    sparkle(ctx, W * .88, V ? H * .6 : H * .88, 22 * u + 14 * u * fs.hat, p.ink); sparkle(ctx, W * .12, V ? H * .12 : H * .1, 14 * u, p.ink);
    hud(ctx, 30 * u, 30 * u, W - 60 * u, H - 60 * u, 36 * u, rgba(p.ink, .5), 2 * u);
  },
};
