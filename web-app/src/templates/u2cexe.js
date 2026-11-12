import { cached, rgba, txt, mono, sparkle } from '../util/draw.js';
import { accentOn } from '../brand/palettes.js';
import { phrase } from '../engine/layout.js';
import { chainPose } from '../overlays/chains.js';
import { lineText, lineFont, lineColor, fitLine } from '../overlays/text.js';
import { win, openAmount, pulse, cablePath, drawCable, cableDots, waveView, spectrumView, scopeView, meterView, counterView, logView, timecode, ease } from './kit.js';
// U2C.EXE (hero): a cyberpunk desktop of floating hairline .exe windows wired together. chains.dll is the centrepiece
// (the U2C logo dissolves/rebuilds letter by letter inside it), elephant.sys holds the swinging rope pendant, and the
// small windows run live readouts. Small windows fold shut in the last beat of each phrase and unfold again on the
// downbeat (line-draw, scale-from-titlebar, typewriter titles). Kicks: 1-3 % spring punch, border pulses, cable dots.
const LAYOUT = {
  '916': { W: 1080, H: 1920, w: {
    beat: [70, 150, 560, 210], tempo: [70, 384, 560, 150], eleph: [660, 150, 350, 384], chains: [70, 566, 940, 560],
    scope: [70, 1160, 450, 230], meter: [560, 1160, 450, 230], spec: [70, 1424, 450, 230], log: [560, 1424, 450, 230] } },
  '169': { W: 1920, H: 1080, w: {
    beat: [60, 96, 470, 200], tempo: [60, 322, 470, 140], eleph: [1420, 96, 440, 430], chains: [580, 96, 800, 590],
    scope: [60, 490, 470, 230], meter: [1420, 556, 440, 200], spec: [580, 716, 390, 270], log: [990, 716, 390, 270] } },
};
const ORDER = ['beat', 'tempo', 'scope', 'meter', 'spec', 'log'], FOLD = ['scope', 'meter', 'spec', 'log']; // only the secondary windows fold
const TITLES = { beat: 'u2c_beat.exe', tempo: 'tempo.cfg', eleph: 'elephant.sys', chains: 'chains.dll', scope: 'scope.exe', meter: 'meter.exe', spec: 'spectrum.vst', log: 'events.log' };
const CABLES = [['beat', 'chains'], ['tempo', 'chains'], ['eleph', 'chains'], ['scope', 'chains'], ['meter', 'chains'], ['spec', 'scope'], ['log', 'meter']];
function rects(P, fs) {
  const Lw = LAYOUT[P.aspect] || LAYOUT['916'], out = {}, TAU = Math.PI * 2;
  for (const id in Lw.w) { const [x, y, w, h] = Lw.w[id], k = Object.keys(Lw.w).indexOf(id), f = id === 'chains' ? 0 : 3 * P.u;
    const dx = fs ? Math.sin(fs.cyc(.06) * TAU + k * 1.7) * f : 0, dy = fs ? Math.cos(fs.cyc(.05) * TAU + k * 2.3) * f : 0;
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
  defaults: a => a === '916' ? { chains: { x: .5, y: .45, s: .72 }, eleph: { x: (660 + 175) / 1080, y: (150 + 26) / 1920 + .006, s: .38, len: .06 } }
    : { chains: { x: (580 + 400) / 1920, y: (96 + 26 + 282) / 1080, s: .9 }, eleph: { x: (1420 + 220) / 1920, y: (96 + 26) / 1080 + .01, s: .56, len: .08 } },
  reserved(P) { return Object.values(rects(P, null)); },
  draw(ctx, fs, P, p, assets) {
    const { W, H, u } = P, fg = p.main, hi = p.hi, bg = p.dark, acc = accentOn(p), ph = phrase(fs, P), pl = pulse(fs), glow = P.params && P.params.cables != null ? P.params.cables : .5;
    const S = { u, fg, hi, bg, acc, pl: 0 };
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(cached(`osgrid|${W}|${H}|${fg}`, W / 2, H / 2, (g, w, h) => { g.fillStyle = rgba(fg, .1); const st = w / 36; for (let y = st / 2; y < h; y += st) for (let x = st / 2; x < w; x += st) g.fillRect(x, y, 1, 1);
      g.strokeStyle = rgba(fg, .05); g.lineWidth = 1; for (let x = st * 6; x < w; x += st * 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } }), 0, 0, W, H);
    // menu bar + dock
    ctx.fillStyle = rgba(fg, .06); ctx.fillRect(0, 0, W, 44 * u); ctx.fillStyle = rgba(fg, .25); ctx.fillRect(0, 44 * u, W, 1 * u);
    txt(ctx, '✦ U2C OS', 24 * u, 29 * u, mono(15 * u, 700), hi); txt(ctx, 'FILE   EDIT   VIEW   WINDOW', 150 * u, 29 * u, mono(13 * u), rgba(fg, .6));
    txt(ctx, timecode(fs) + '  ●  ' + Math.round(fs.bpm) + ' BPM', W - 24 * u, 29 * u, mono(13 * u, 700), rgba(fg, .85), 'right');
    const R = rects(P, fs), O = {}; ORDER.forEach(id => { O[id] = FOLD.includes(id) ? openAmount(ph, FOLD.indexOf(id)) : 1; }); O.eleph = 1; O.chains = 1;
    // cables first (under the windows), with beat-grid signal dots
    CABLES.forEach(([a, b], i) => { const [p0, p1, dir] = port(R[a], R[b]), vis = Math.min(O[a], O[b]); if (vis <= .02) return;
      const pts = dir === 'v' ? [p0, { x: p0.x, y: (p0.y + p1.y) / 2 }, { x: p1.x, y: (p0.y + p1.y) / 2 }, p1] : cablePath(p0, p1, u);
      ctx.save(); ctx.globalAlpha = ease(vis); drawCable(ctx, pts, S, .25 + .35 * glow); cableDots(ctx, pts, fs, S, i * .13); ctx.restore(); });
    // windows
    const title = lineText(P, 'title', fs), bpm = lineText(P, 'bpm', fs), key = lineText(P, 'key', fs), tag = lineText(P, 'tag', fs);
    for (const id of ['chains', 'eleph', ...ORDER]) {
      const r = R[id], o = O[id]; S.pl = id === 'chains' ? pl : pl * .6;
      let rr = r; if (id === 'chains') { const k = 1 + .012 * pl; rr = { x: r.x + r.w / 2 - r.w * k / 2, y: r.y + r.h / 2 - r.h * k / 2, w: r.w * k, h: r.h * k }; }
      const { inner: I, alpha } = win(ctx, rr, TITLES[id] + (id === 'beat' && title ? '  —  ' + title.toLowerCase() : ''), o, S); if (!I || alpha <= 0) continue;
      ctx.save(); ctx.globalAlpha = alpha;
      if (id === 'beat') { if (title) txt(ctx, title, I.x, I.y + 34 * u, fitLine(ctx, P, 'title', title, I.w * .7, 34 * u, 700), lineColor(P, 'title', p));
        txt(ctx, timecode(fs), I.x + I.w, I.y + 30 * u, mono(24 * u, 500), hi, 'right'); waveView(ctx, { x: I.x, y: I.y + 56 * u, w: I.w, h: I.h - 60 * u }, fs, P, S); }
      else if (id === 'tempo') counterView(ctx, I, fs, S, bpm, key, { bpm: lineFont(P, 'bpm', 36 * u, 700), key: lineFont(P, 'key', 22 * u, 700) });
      else if (id === 'scope') scopeView(ctx, I, fs, S);
      else if (id === 'meter') meterView(ctx, I, fs, S);
      else if (id === 'spec') spectrumView(ctx, I, fs, S, 20);
      else if (id === 'log') logView(ctx, I, fs, S, tag);
      else if (id === 'chains') { const pose = chainPose(fs, P, assets), st = pose.letters, mode = st.some(s => s.mode === 'rebuild' && s.fill < 1) ? 'BUILDING' : st.some(s => s.mode === 'dissolve' && s.fill < 1) ? 'RELEASING' : 'LOADED';
        const pct = Math.round((st[0].fill + st[1].fill + st[2].fill) / 3 * 100);
        txt(ctx, `${mode} U2C … ${String(pct).padStart(3, ' ')}%`, I.x, I.y + I.h, mono(13 * u, 700), rgba(fg, .75));
        txt(ctx, `${Math.round(rr.w)}×${Math.round(rr.h)}  ·  PHRASE ${ph.k + 1}  ·  ${(ph.lb + 1).toFixed(0)}/${ph.C}`, I.x + I.w, I.y + I.h, mono(12 * u), rgba(fg, .55), 'right');
        ctx.strokeStyle = rgba(fg, .18); ctx.lineWidth = 1 * u; ctx.setLineDash([3 * u, 6 * u]); ctx.strokeRect(I.x + 8 * u, I.y + 4 * u, I.w - 16 * u, I.h - 30 * u); ctx.setLineDash([]); }
      else if (id === 'eleph') { txt(ctx, 'MASS 1.00  ·  ROPE 9 LINKS', I.x, I.y + I.h, mono(11 * u), rgba(fg, .55)); }
      ctx.restore();
    }
    // footer status
    const fy = (P.V ? 1700 : 1030) * u; ctx.fillStyle = rgba(fg, .2); ctx.fillRect(70 * u, fy, W - 140 * u, 1 * u);
    txt(ctx, 'u2c.exe  ·  ' + (tag || 'prod. U2C') + '  ·  ' + (ph.lb < ph.R ? 'build' : ph.lb >= ph.C - ph.D ? 'release' : 'run'), 70 * u, fy + 24 * u, mono(13 * u), rgba(fg, .55));
    sparkle(ctx, W - 80 * u, fy + 16 * u, 10 * u + 6 * u * pl, p.spark);
  },
};
