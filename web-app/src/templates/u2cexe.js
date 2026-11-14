import { cached, rgba, txt, mono, sparkle } from '../util/draw.js';
import { accentOn } from '../brand/palettes.js';
import { phrase } from '../engine/layout.js';
import { chainPose } from '../overlays/chains.js';
import { lineText, lineFont, lineColor, fitLine } from '../overlays/text.js';
import { win, openAmount, pulse, cablePath, drawCable, cableDots, timecode, ease, eqView, specAnalyzer, proMeter, goniometer, wavePro, tempoPro, lanesView, hitLog } from './kit.js';
import { ropeNodes, linkCount } from '../overlays/elephant.js';
import { snareBorder, kickCable } from '../engine/react.js';
// U2C.EXE (hero): a cyberpunk desktop of floating hairline .exe windows wired together. chains.dll is the centrepiece
// (the U2C logo dissolves/rebuilds letter by letter inside it), elephant.sys holds the swinging rope pendant, and the
// small windows run live readouts. Small windows fold shut in the last beat of each phrase and unfold again on the
// downbeat (line-draw, scale-from-titlebar, typewriter titles). Kicks: 1-3 % spring punch, border pulses, cable dots.
// Window grid (1080-unit layout, 8 px grid, 16 px gutters, 56 px margins). elephant.sys is a large window: 39 % of the
// width on 9:16, a full-height side column on 16:9. 9:16 respects the platform safe areas (TRENDS.md): the top 288 px
// (status/top bar) only holds the spectrum and the elephant's rope; the title, BPM and key sit inside y 288-1248;
// the logo is centred in the safe box; the caption zone (y > 1248) holds data windows only.
const LAYOUT = {
  '916': { W: 1080, H: 1920, w: {
    spec: [56, 72, 528, 200], beat: [56, 288, 528, 208], tempo: [56, 512, 528, 136], eq: [56, 664, 528, 232], eleph: [600, 72, 424, 824],
    chains: [56, 912, 968, 440], meter: [56, 1368, 344, 256], phase: [416, 1368, 296, 256], log: [728, 1368, 296, 256], lanes: [56, 1640, 968, 136] } },
  '169': { W: 1920, H: 1080, w: {
    beat: [40, 64, 560, 176], tempo: [40, 256, 560, 120], eq: [40, 392, 560, 216], lanes: [40, 624, 560, 200], log: [40, 840, 560, 176], chains: [616, 64, 856, 464],
    meter: [616, 544, 280, 472], phase: [912, 544, 264, 472], spec: [1192, 544, 280, 472], eleph: [1488, 64, 392, 952] } },
};
const WIN_IDS = ['beat', 'tempo', 'eq', 'eleph', 'chains', 'meter', 'phase', 'spec', 'lanes', 'log'];
const ORDER = ['beat', 'tempo', 'eq', 'meter', 'phase', 'spec', 'lanes', 'log'], FOLD = ['meter', 'phase', 'spec', 'lanes', 'log']; // only the secondary windows fold
const TITLES = { beat: 'u2c_beat.exe', tempo: 'tempo.cfg', eq: 'eq.vst', eleph: 'elephant.sys', chains: 'chains.dll', meter: 'meter.exe', phase: 'phase.scope', spec: 'spectrum.vst', lanes: 'transport.lanes', log: 'events.log' };
const CABLES = { '916': [['spec', 'beat'], ['beat', 'tempo'], ['eq', 'chains'], ['eleph', 'chains'], ['meter', 'chains'], ['phase', 'meter'], ['log', 'chains'], ['lanes', 'meter']],
  '169': [['beat', 'chains'], ['eq', 'chains'], ['eleph', 'chains'], ['meter', 'chains'], ['phase', 'meter'], ['spec', 'chains'], ['lanes', 'beat'], ['log', 'lanes']] };
/** Window rects in frame pixels (fs = null: without the gentle float). */
export function rects(P, fs) {
  const Lw = LAYOUT[P.aspect] || LAYOUT['916'], out = {}, TAU = Math.PI * 2;
  for (const id in Lw.w) { const [x, y, w, h] = Lw.w[id], k = Object.keys(Lw.w).indexOf(id), f = id === 'chains' ? 0 : 3 * P.u;
    const hz = fs ? 1 / (32 * fs.spb) : 0, dep = id === 'chains' || id === 'eleph' ? .5 : 1 + .15 * Math.sin(k), dx = fs ? Math.sin(fs.cyc(hz) * TAU) * 4 * P.u * dep : 0, dy = fs ? Math.cos(fs.cyc(hz) * TAU) * 2.5 * P.u * dep : 0; void f;
    out[id] = { x: x * P.u + dx, y: y * P.u + dy, w: w * P.u, h: h * P.u }; }
  return out;
}
const port = (a, b) => { const ax = a.x + a.w / 2, bx = b.x + b.w / 2; if (Math.abs(ax - bx) < (a.w + b.w) / 2 - 10) { const down = b.y > a.y; return [{ x: ax, y: down ? a.y + a.h : a.y }, { x: Math.max(b.x + 20, Math.min(b.x + b.w - 20, ax)), y: down ? b.y : b.y + b.h }, 'v']; }
  return bx > ax ? [{ x: a.x + a.w, y: a.y + Math.min(a.h - 20, 60) }, { x: b.x, y: Math.max(b.y + 40, Math.min(b.y + b.h - 20, a.y + 60)) }, 'h'] : [{ x: a.x, y: a.y + Math.min(a.h - 20, 60) }, { x: b.x + b.w, y: Math.max(b.y + 40, Math.min(b.y + b.h - 20, a.y + 60)) }, 'h']; };
export default {
  id: 'u2cexe', name: 'U2C.EXE', category: 'Hero · OS', pal: 'charcoal', surface: 'dark', chainStyle: 'neon', glitchBoost: 1,
  owns: ['title', 'bpm', 'key', 'tag'], textPos: 'bottom',
  params: [{ id: 'cables', label: 'Cable glow', min: 0, max: 1, step: .05, def: .5 }],
  // chains centred in chains.dll; the elephant hangs from elephant.sys's title bar
  defaults: a => a === '916' ? { chains: { x: .5, y: 1140 / 1920, s: .54 }, eleph: { x: 812 / 1080, y: 120 / 1920, s: .7, len: .27 } }
    : { chains: { x: 1044 / 1920, y: .3, s: .7 }, eleph: { x: 1690 / 1920, y: 102 / 1080, s: .62, len: .62 } },
  reserved(P) { return Object.values(rects(P, null)); },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u } = P, fg = p.main, hi = p.hi, bg = p.dark, acc = accentOn(p), ph = phrase(fs, P), pl = pulse(fs), glow = P.params && P.params.cables != null ? P.params.cables : .5;
    const S = { u, fg, hi, bg, acc, pl: 0, P };
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = fs.duck; // sidechain: the background grid ducks on kicks
    ctx.drawImage(cached(`osgrid|${W}|${H}|${fg}`, W / 2, H / 2, (g, w, h) => { g.fillStyle = rgba(fg, .1); const st = w / 36; for (let y = st / 2; y < h; y += st) for (let x = st / 2; x < w; x += st) g.fillRect(x, y, 1, 1);
      g.strokeStyle = rgba(fg, .05); g.lineWidth = 1; for (let x = st * 6; x < w; x += st * 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } }), 0, 0, W, H); ctx.globalAlpha = 1;
    // menu bar + dock
    ctx.fillStyle = rgba(fg, .06); ctx.fillRect(0, 0, W, 44 * u); ctx.fillStyle = rgba(fg, .25); ctx.fillRect(0, 44 * u, W, 1 * u);
    txt(ctx, '✦ U2C OS', 24 * u, 29 * u, mono(15 * u, 700), hi); txt(ctx, 'FILE   EDIT   VIEW   WINDOW', 150 * u, 29 * u, mono(13 * u), rgba(fg, .6));
    txt(ctx, timecode(fs) + '  ●  ' + Math.round(fs.bpm) + ' BPM', W - 24 * u, 29 * u, mono(13 * u, 700), rgba(fg, .85), 'right');
    const R = rects(P, fs), O = {}; ORDER.forEach(id => { O[id] = FOLD.includes(id) ? openAmount(ph, FOLD.indexOf(id), false, fs.spb) : 1; }); O.eleph = 1; O.chains = 1;
    // cables first (under the windows), with beat-grid signal dots
    const CB = CABLES[P.aspect] || CABLES['916']; CB.forEach(([a, b], i) => { const [p0, p1, dir] = port(R[a], R[b]), vis = Math.min(O[a], O[b]); if (vis <= .02) return;
      const pts = dir === 'v' ? [p0, { x: p0.x, y: (p0.y + p1.y) / 2 }, { x: p1.x, y: (p0.y + p1.y) / 2 }, p1] : cablePath(p0, p1, u);
      ctx.save(); ctx.globalAlpha = ease(vis); drawCable(ctx, pts, S, .25 + .35 * glow); cableDots(ctx, pts, fs, S, 0, { beat: ((Math.floor(fs.beat) % CB.length) + CB.length) % CB.length === i, kick: kickCable(fs, CB.length) === i }); ctx.restore(); });
    // windows
    const title = lineText(P, 'title', fs), bpm = lineText(P, 'bpm', fs), key = lineText(P, 'key', fs), tag = lineText(P, 'tag', fs);
    for (const id of ['chains', 'eleph', ...ORDER]) {
      const r = R[id], o = O[id], wi = WIN_IDS.indexOf(id); S.pl = snareBorder(fs, P, wi, WIN_IDS.length); // snare: one active window's hairline brightens
      const rr = r; // windows never punch: the kick only breathes the logo inside chains.dll
      const { inner: I, alpha } = win(ctx, rr, TITLES[id] + (id === 'beat' && title ? '  —  ' + title.toLowerCase() : ''), o, S); if (!I || alpha <= 0) continue;
      ctx.save(); ctx.globalAlpha = alpha;
      if (id === 'beat') { if (title) txt(ctx, title, I.x, I.y + 26 * u, fitLine(ctx, P, 'title', title, I.w * .66, 28 * u, 700), lineColor(P, 'title', p));
        txt(ctx, timecode(fs), I.x + I.w, I.y + 24 * u, mono(20 * u, 500), hi, 'right'); wavePro(ctx, { x: I.x, y: I.y + 40 * u, w: I.w, h: I.h - 40 * u }, fs, P, S); }
      else if (id === 'tempo') tempoPro(ctx, I, fs, S, bpm, key, { bpm: lineFont(P, 'bpm', 30 * u, 700), key: lineFont(P, 'key', 20 * u, 700) });
      else if (id === 'eq') eqView(ctx, I, fs, S);
      else if (id === 'meter') proMeter(ctx, I, fs, S, P);
      else if (id === 'phase') goniometer(ctx, I, fs, S);
      else if (id === 'spec') specAnalyzer(ctx, I, fs, S);
      else if (id === 'lanes') lanesView(ctx, I, fs, S);
      else if (id === 'log') hitLog(ctx, I, fs, S, tag);
      else if (id === 'chains') { const pose = chainPose(fs, P, assets), st = pose.letters, mode = st.some(s => s.mode === 'rebuild' && s.fill < 1) ? 'BUILDING' : st.some(s => s.mode === 'dissolve' && s.fill < 1) ? 'RELEASING' : 'LOADED';
        const pct = Math.round((st[0].fill + st[1].fill + st[2].fill) / 3 * 100);
        txt(ctx, `${mode} U2C … ${String(pct).padStart(3, ' ')}%`, I.x, I.y + I.h, mono(12 * u, 700), rgba(fg, .75));
        txt(ctx, `PHRASE ${ph.k + 1}  ·  BEAT ${String(Math.floor(ph.lb) + 1).padStart(2, '0')}/${ph.C}`, I.x + I.w, I.y + I.h, mono(12 * u), rgba(fg, .55), 'right');
        ctx.strokeStyle = rgba(fg, .16); ctx.lineWidth = 1 * u; ctx.setLineDash([2 * u, 6 * u]); ctx.strokeRect(I.x + 8 * u, I.y + 4 * u, I.w - 16 * u, I.h - 30 * u); ctx.setLineDash([]); }
      else if (id === 'eleph') { // live rope readout: swing angle, rope tension (in g) and link count
        const n0 = ropeNodes(fs, P), e = n0.length - 2, dt = 1 / 120, fa = { ...fs, t: fs.t - dt }, fb = { ...fs, t: fs.t + dt }, na = ropeNodes(fa, P), nb = ropeNodes(fb, P);
        const ang = Math.atan2(n0[e], n0[e + 1]) * 180 / Math.PI, ax = (nb[e] - 2 * n0[e] + na[e]) / (dt * dt), ay = (nb[e + 1] - 2 * n0[e + 1] + na[e + 1]) / (dt * dt);
        const ten = Math.hypot(ax, ay - 13) / 13, ry = I.y + I.h - 4 * u;
        ctx.fillStyle = rgba(bg, .85); ctx.fillRect(I.x - 2 * u, ry - 30 * u, I.w + 4 * u, 34 * u); ctx.fillStyle = rgba(fg, .25); ctx.fillRect(I.x, ry - 30 * u, I.w, 1 * u);
        const cell = (k, v, x) => { txt(ctx, k, x, ry - 16 * u, mono(9 * u, 500), rgba(fg, .55)); txt(ctx, v, x, ry, mono(13 * u, 700), hi); };
        cell('ANGLE', (ang >= 0 ? '+' : '') + ang.toFixed(1) + '°', I.x); cell('TENSION', ten.toFixed(2) + ' g', I.x + I.w * .34); cell('LINKS', linkCount(P, assets) + ' PCS', I.x + I.w * .7);
        // angle gauge arc at the pivot
        const gx = I.x + I.w / 2, gy = I.y + 4 * u; ctx.strokeStyle = rgba(fg, .3); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(gx, gy, 46 * u, Math.PI / 2 - .35, Math.PI / 2 + .35); ctx.stroke();
        for (let d = -15; d <= 15; d += 5) { const a = Math.PI / 2 + d * Math.PI / 180; ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * 42 * u, gy + Math.sin(a) * 42 * u); ctx.lineTo(gx + Math.cos(a) * 50 * u, gy + Math.sin(a) * 50 * u); ctx.stroke(); }
        const a0 = Math.PI / 2 - ang * Math.PI / 180; ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(gx + Math.cos(a0) * 46 * u, gy + Math.sin(a0) * 46 * u, 3 * u, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    { const sy = 52 * u + fs.barP * (H - 52 * u), g2 = ctx.createLinearGradient(0, sy - 60 * u, 0, sy); g2.addColorStop(0, rgba(fg, 0)); g2.addColorStop(1, rgba(fg, .035)); ctx.fillStyle = g2; ctx.fillRect(0, sy - 60 * u, W, 60 * u); ctx.fillStyle = rgba(fg, .07); ctx.fillRect(0, sy, W, 1 * u); }
    // footer status
    const fy = (P.V ? 1808 : 1040) * u; ctx.fillStyle = rgba(fg, .2); ctx.fillRect(70 * u, fy, W - 140 * u, 1 * u);
    txt(ctx, 'u2c.exe  ·  ' + (tag || 'prod. U2C') + '  ·  ' + (ph.lbL < ph.R * 1.25 ? 'build' : ph.lbL >= ph.C - ph.D ? 'release' : 'run'), 70 * u, fy + 24 * u, mono(13 * u), rgba(fg, .55));
    for (let j = 0; j < 48; j++) { ctx.fillStyle = rgba(fg, j % 4 ? .15 : .3); ctx.fillRect(W - 140 * u - j * 8 * u, fy - 6 * u, 1 * u, (j % 4 ? 3 : 6) * u); } // hat-driven tick shimmer
    sparkle(ctx, W - 80 * u, fy + 16 * u, 10 * u, p.spark);
  },
};
