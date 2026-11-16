// THE LABORATORY v8 composition (ported from u2c-motion film/v8/film.js) driven by a cue sheet.
// The v6 lab-OS bench (live windows, specimen tags, handwritten notes, stamps) per LOOK (exe | lab | scope), a camera
// that holds the whole bench wide and pushes in to one window on the grid, the logo chain threading IN / running OUT,
// the elephant pendant swinging on its own chain, every window showing live data from the audio.
// createFilm({D, assets, aspect}).render(ctx, t, {ev, fps}) draws clip time t (seconds from bar 1). Everything that can
// change over the video is read through ev.value(path, beat, default): see v8/registry.js for the paths.
import { createCore, stageOf, STAGE_COLOR_KEYS } from './core.js';
import { createLab } from './lab.js';
import { createMeters } from './meters.js';
import { createBrand } from './brand.js';
import { LAYOUT, CONTENT, openBeat, WINDOW_IDS, HUD_BAND } from './layout.js';
import { DEFAULT_TAGS } from './tags.js';
import { mergeDeep, createEvaluator, emptySheet } from '../cues/schema.js';
import { buildRegistry, meterPath } from './registry.js';
import { createIntro } from './intro.js';   // v11 intro

const METER_KIND = { scope: 'logo', session: 'waveform', spectro: 'spectrogram', loud: 'loudness' };

export function createFilm({ D, assets, aspect = '916' }) {
  const L = createCore(D), lab = createLab(L), M = createMeters(L), BR = createBrand(L, assets), INTRO = createIntro(L, assets && assets.intro);
  const { F, FPS, BEAT, BAR, T, U, steps, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, hs, hash, kickEnv, labelAt, SANS, MONO, SERIF, HAND, DISPLAY, UI } = L;
  const port = aspect === '916', W = port ? 1080 : 1920, H = port ? 1920 : 1080, NB = D.bars;
  let c = null, ev = createEvaluator(emptySheet()), b = 0, IB = 0, LOOK = 'exe', S = stageOf('nigredo'), LY = {}, IDS = [], tagDoc = DEFAULT_TAGS;
  const V = (path, def) => ev.value(path, b, def);
  // ---------------------------------------------------------------- tag variables (every on-screen word is editable)
  const titleCase = D.title.split(' ').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  const getTag = (path) => { const parts = path.split('.'); let v = tagDoc; for (const p of parts) v = v == null ? v : v[p];
    if (Array.isArray(v)) return v.map((x, i) => V(`tag.${path}.${i}`, x)); return v == null ? undefined : V('tag.' + path, v); };
  L.tagGet = getTag; const tag = L.tag;
  L.meter = (kind, key, def) => V(`meter.${kind}.${key}`, def);
  function setVars() {
    L.tagVars({ title: D.title, Title: titleCase, titleWord: D.title.split(' ')[0], bpm: String(Math.round(D.bpm)), bpm2: D.bpm.toFixed(2), key: D.key,
      keyShort: D.key.replace(' MIN', 'm').replace(' MAJ', ''), stage: S.name, stageN: String(S.n), look: LOOK.toUpperCase(), lufs: fmt(D.summary.I),
      srcLufs: fmt(D.srcLufs != null ? D.srcLufs : -10.7), lra: D.summary.LRA.toFixed(1), tp: fmt(D.summary.TP), bars: String(NB) });
    L.tagVars({ producer: tag('producer'), experiment: tag('experiment'), today: tag('date') }); L.tagVars({ date: tag('date') });
  }
  const WIN = (id) => tag('windows.' + (id === 'chains' ? 'logo' : id === 'session' ? 'wave' : id === 'stereo' ? 'gonio' : id)) || id;

  // ---------------------------------------------------------------- windows: rect, open steps, content
  const rectOf = (id) => { const r = LAYOUT[LOOK][aspect][id]; return [V(`win.${id}.x`, r[0]), V(`win.${id}.y`, r[1]), V(`win.${id}.w`, r[2]), V(`win.${id}.h`, r[3])]; };
  // v11 intro: with an intro of IB beats the lab builds after it (default open beats shift by IB; -2 = open at the cut)
  const winOpen = (id) => { const d = openBeat(LOOK, aspect, id); return V(`win.${id}.open`, IB ? (d < 0 ? IB : d + IB) : d); };
  function openStep(id, t) {
    const n0 = steps(t, winOpen(id), 6, U.t32), k = ev.lastKey(`win.${id}.visible`, t / BEAT);
    if (!k) return V(`win.${id}.visible`, true) ? n0 : 0;
    const was = k.prev ? !!k.prev.v : true, on = !!k.key.v;
    if (on) return was ? n0 : Math.min(n0 || 6, steps(t, k.key.b, 6, U.t32));
    return was ? Math.max(0, 6 - steps(t, k.key.b, 6, U.t32)) : 0;
  }
  const contentOf = (id) => V(`win.${id}.content`, CONTENT[id]);
  // ---------------------------------------------------------------- camera: wide, or a push / cut to one window
  function framing(id) {
    if (!id || id === 'wide' || !LY[id]) return { x: W / 2, y: H / 2, z: 1 };
    const [x, y, w, h] = LY[id], pad = 40, z = clamp(Math.min(W / (w + 2 * pad), H / (h + 2 * pad)), 1.15, 2.2), mx = 30;
    return { x: clamp(x + w / 2, W / (2 * z) - mx, W - W / (2 * z) + mx), y: clamp(y + h / 2, H / (2 * z) - mx, H - H / (2 * z) + mx), z };
  }
  function camera() {
    const s = ev.shot(b), A = framing(s.from), Bf = framing(s.to), u = s.u, zm = V('camera.zoom', 1);
    L.shotTo = s.to;   // meters can switch to their focus-shot version when the camera is on their window
    return { x: lerp(A.x, Bf.x, u) + V('camera.x', 0), y: lerp(A.y, Bf.y, u) + V('camera.y', 0), z: lerp(A.z, Bf.z, u) * zm };
  }
  // ---------------------------------------------------------------- attention: the window this beat is about
  const kickAt = new Set(D.onsets.kick.map((o) => Math.round(o[2] / BEAT * 4))), snrAt = new Set(D.onsets.snare.map((o) => Math.round(o[2] / BEAT * 4)));
  function attention(t) {
    const has = (id) => LY[id] && openStep(id, t) >= 6, fe = V('focus.featured', 'auto');
    if (fe === 'none') return null; if (fe !== 'auto') return has(fe) ? fe : null;
    const bb = Math.floor(t / BEAT), q = bb * 4;
    let id = snrAt.has(q) ? 'spectrum' : kickAt.has(q) ? 'loud' : null;
    if (bb % 4 === 0) id = 'chains';
    if (bb % 8 === 6) id = 'elephant';
    if (!id || !has(id)) { const be = F.bands[fidx(bb * BEAT)], i = be.indexOf(Math.max(...be)); id = ['stereo', 'eq', 'eq', 'spectrum', 'spectro', 'spectro'][i]; }
    if (!has(id)) id = has('session') ? 'session' : 'chains';
    return id;
  }
  // v11: the handwritten notes, stamps, specimen tags and terminal chatter are gone (they said nothing). Only real
  // readouts (Hz, dB, LUFS, BPM, key, bar.beat) and the title / credit stay on screen.

  // ---------------------------------------------------------------- v11 window chrome: liquid glass (returns the content rect)
  // Opening steps (n = 1..6 on 32nds): 1 = the top hairline, 2 = the whole hairline outline, 3+ = the glass; content
  // grows over steps 4..6. No title bar, no window buttons: one hairline label in the UI voice, top left. The logo and
  // the pendant windows carry no label (the art is the label). The exe and lab looks share the glass; lab keeps faint
  // graph paper inside, scope adds a recessed CRT screen. API for content code: V11-SHELL-API.md.
  const NO_LABEL = new Set(['logo', 'pendant']);
  const PAD = 20, LABEL_H = 46;
  /** Content rect of window id for its rect r (also used by the camera framing and the API). */
  function contentRect(id, r) {
    const [x, y, w, h] = r, kind = contentOf(id), top = NO_LABEL.has(kind) ? PAD : LABEL_H;
    if (LOOK === 'scope') { const sr = screenRect(id, r); return [sr[0] + 10, sr[1] + 10, sr[2] - 20, sr[3] - 20]; }
    return [x + PAD, y + top, w - 2 * PAD, h - top - PAD];
  }
  const screenRect = (id, r) => { const [x, y, w, h] = r, top = NO_LABEL.has(contentOf(id)) ? 16 : LABEL_H - 4; return [x + 16, y + top, w - 32, h - top - 16]; };
  function label(id, x, y, w, Sx, active) {
    if (NO_LABEL.has(contentOf(id))) return;
    text(c, String(WIN(id)).toUpperCase(), x + PAD + 2, y + 26, { size: 18, fam: UI, w: 500, ls: 2.4, col: rgba(Sx.ink, active ? 0.95 : 0.52), maxW: w - 2 * PAD });
  }
  function chrome(id, r, n, t, Sx, active) {
    const [x, y, w, h] = r, rad = V('glass.radius', 22), lit = rgba(Sx.ink, 0.55);
    if (n < 3) {   // hairline build: top edge, then the full outline
      c.strokeStyle = lit; c.lineWidth = 1.2;
      if (n === 1) { c.beginPath(); c.moveTo(x + rad, y); c.lineTo(x + w - rad, y); c.stroke(); } else c.stroke(L.rr(x, y, w, h, rad));
      c.lineWidth = 1; return null;
    }
    L.glass(c, x, y, w, h, Sx, { r: rad, tint: V('glass.tint', LOOK === 'scope' ? 0.5 : 0.36), active: active && V('bracket.on', true) });
    if (LOOK === 'lab') { c.save(); c.clip(L.rr(x, y, w, h, rad)); lab.graphPaper(c, x, y, w, h, Sx, 10, 50, 0.45); c.restore(); }
    if (LOOK === 'scope') { const sr = screenRect(id, r); c.fillStyle = rgba(Sx.bg, 0.62); c.fill(L.rr(sr[0], sr[1], sr[2], sr[3], 12)); c.strokeStyle = rgba(Sx.ink, 0.12); c.stroke(L.rr(sr[0] + 0.5, sr[1] + 0.5, sr[2] - 1, sr[3] - 1, 12)); }
    label(id, x, y, w, Sx, active);
    return contentRect(id, r);
  }

  // ---------------------------------------------------------------- window contents
  function chainsBody(cr, t, k, Sx) {
    const [x, y, w, h] = cr; c.save(); c.beginPath(); c.rect(x - 4, y - 4, w + 8, (h + 8) * k); c.clip();
    const C = Math.max(4, Math.round(V('logo.cycle', 2) * 4)), hero = ev.clipsAt('logo.hero', b).some((q) => q.v !== false);
    if (LOOK === 'scope') {   // CRT: graticule 10 x 8 div, the two live traces run behind the logo, triggered on the 16th
      c.strokeStyle = rgba(Sx.ink, 0.1); for (let i = 0; i <= 10; i++) { const X = Math.round(x + w * i / 10) + 0.5; c.beginPath(); c.moveTo(X, y); c.lineTo(X, y + h - 40); c.stroke(); }
      for (let j = 0; j <= 8; j++) { const Y = Math.round(y + (h - 40) * j / 8) + 0.5; c.beginPath(); c.moveTo(x, Y); c.lineTo(x + w, Y); c.stroke(); }
      M.trace(c, Sx, [x, y, w, h - 40], t, { span: BEAT * V(meterPath('logo', 'span'), 0.25), amp: V(meterPath('logo', 'amp'), 0.2), lanes: [[0, 0.3, Sx.sig1], [1, 0.72, Sx.sig2]] });
    }
    const s = BR.logo(c, Sx, [x, y, w, h - (LOOK === 'scope' ? 40 : 34)], t, { cycle: C, mode: V('logo.mode', 'cycle'), hero, scale: V('logo.scale', 1),
      glow: V('logo.glow', 1) * (0.35 + 0.8 * kickEnv[fidx(t)]), bloom: V('logo.bloom', 1) * dropBloom(t), runner: V('logo.runner', true) });
    if (LOOK === 'scope') text(c, `${(BEAT * 1000 * V(meterPath('logo', 'span'), 0.25) / 10).toFixed(1)} ms/div`, x + w, y + h - 14, { size: 18, col: rgba(Sx.ink, 0.5), align: 'right', maxW: w * 0.4 });   // real timebase only (v11)
    c.restore();
  }
  // pendant geometry inside a content rect: the hand (top of the chain) and the chain length (v9 chain wave)
  function pendantGeom(cr) {
    const [x, y, w, h] = cr, avail = h - 80, len = avail * clamp(V('pendant.chain', 0.3), 0, 0.6), size = Math.min(w * 0.8, (avail - len) / 0.95) * V('pendant.size', 1);
    return { size, len, ax: x + w / 2 + size * (346 / 700 - 0.5) + V('pendant.x', 0), ay: y + 22 + V('pendant.y', 0) };
  }
  // drop bloom: inside a drop 0.35, plus an envelope from each drop phrase's downbeat that decays over 2 beats
  function dropBloom(t) {
    const bar = Math.floor(t / BAR); if (labelAt(bar) !== 'drop') return 0;
    const sb = D.song.startBar + bar; let p0 = sb; for (const q of D.song.phrases) if (q.bar <= sb) p0 = q.bar;
    return 0.35 + 0.65 * Math.exp(-Math.max(0, t - (p0 - D.song.startBar) * BAR) / (2 * BEAT));
  }
  function elephantBody(cr, t, k, Sx) {
    const [x, y, w, h] = cr; c.save(); c.beginPath(); c.rect(x - 14, y - 14, w + 28, (h + 28) * k); c.clip();
    const { size, len, ax, ay } = pendantGeom(cr), g = BR.drawChainFx(c, Sx, ax, ay, len, t);
    const sw = BR.elephant(c, Sx, g.end[0], g.end[1], size, t, g.ang[g.ang.length - 1]);
    if (LOOK === 'scope') { c.fillStyle = rgba(Sx.ink, 0.8); c.fillRect(ax - 22, ay - 20, 44, 10); c.fillRect(ax - 3, ay - 12, 6, 12); }
    c.restore();
  }
  const BODY = { logo: chainsBody, pendant: elephantBody, waveform: (cr, t, k, Sx) => M.session(c, Sx, cr, t, k), clock: (cr, t, k, Sx) => M.clock(c, Sx, cr, t, k), bands: (cr, t, k, Sx) => M.bands(c, Sx, cr, t, k),
    eq: (cr, t, k, Sx) => M.eq(c, Sx, cr, t, k), spectrum: (cr, t, k, Sx) => M.spectrum(c, Sx, cr, t, k), loudness: (cr, t, k, Sx) => M.loud(c, Sx, cr, t, k), stereo: (cr, t, k, Sx) => M.stereo(c, Sx, cr, t, k),
    spectrogram: (cr, t, k, Sx) => M.spectro(c, Sx, cr, t, k), surface: (cr, t, k, Sx) => M.surface(c, Sx, cr, t, k),
    levels: (cr, t, k, Sx) => M.levels(c, Sx, cr, t, k), ghost: (cr, t, k, Sx) => M.ghost(c, Sx, cr, t, k) };
  function card(id, t, active) {
    const r = LY[id], n = openStep(id, t); if (n <= 0) return;
    const acc = V(`win.${id}.accent`, null), Sx = acc && acc !== S.hot ? Object.assign({}, S, { hot: acc }) : S;
    const cr = chrome(id, r, n, t, Sx, active); if (!cr) return;
    const k = n >= 6 ? 1 : n === 5 ? 0.66 : n === 4 ? 0.33 : 0;
    c.save(); c.clip(L.rr(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2, V('glass.radius', 22)));
    L.avoid = []; L.curWin = id; L.winRect = r; L.contentRect = cr;
    if (k > 0) (BODY[contentOf(id)] || BODY.spectrum)(cr, t, k, Sx);
    c.restore();
  }
  const resultAt = () => V('result.at', Math.max(0, (NB - (NB >= 8 ? 2 : 1)) * 4));
  // ---------------------------------------------------------------- overlays: end card, HUD, text cues, textures
  // v11 end card: one liquid-glass card over the blurred bench (the frame itself is its backdrop). Six steps on half
  // beats: card, title (display voice), tempo + key (mono), credit (UI voice), a scrub bar with the real clip time
  // (it echoes the intro player), the measured loudness. Hard reveals, no fades.
  function result(t) {
    const ra = resultAt(); if (!V('result.on', true) || t < T(ra)) return;
    const n = steps(t, ra, 6, 0.5), R = (p) => tag('result.' + p), light = L.isLight(S);
    c.fillStyle = rgba(S.bg, light ? 0.35 : 0.55); c.fillRect(0, 0, W, H);   // the bench steps back (one step, no ramp)
    L.snap(c, 'frame', 4);
    const cw = port ? 860 : 1040, ch = port ? 760 : 560, x = (W - cw) / 2, y = port ? (H - ch) / 2 - 40 : (H - ch) / 2, cx = W / 2;
    L.glass(c, x, y, cw, ch, S, { r: 36, backdrop: 'frame', tint: light ? 0.5 : 0.3 });
    const ink = S.ink, dim = rgba(S.ink, 0.55), inner = cw - 120;
    if (n >= 2) text(c, R('title').toUpperCase(), cx, y + ch * 0.34, { size: port ? 84 : 92, fam: DISPLAY, w: 800, col: ink, align: 'center', base: 'alphabetic', maxW: inner, ls: -1 });
    if (n >= 3) text(c, R('meta'), cx, y + ch * 0.34 + 62, { size: 26, w: 500, col: dim, align: 'center', ls: 3, maxW: inner });
    if (n >= 4) text(c, R('producer'), cx, y + ch * 0.6, { size: 44, fam: UI, w: 500, col: ink, align: 'center', maxW: inner });
    if (n >= 5) {   // scrub bar: real position in the clip
      const bx = x + 60, bw = cw - 120, by = y + ch * 0.76, u = clamp(t / D.duration);
      c.fillStyle = rgba(S.ink, 0.16); c.fill(L.rr(bx, by - 3, bw, 6, 3)); c.fillStyle = S.hot; c.fill(L.rr(bx, by - 3, Math.max(6, bw * u), 6, 3));
      text(c, tc(t).slice(0, 5), bx, by + 34, { size: 20, col: dim }); text(c, tc(D.duration).slice(0, 5), bx + bw, by + 34, { size: 20, col: dim, align: 'right' });
    }
    if (n >= 6) text(c, R('measure'), cx, y + ch - 44, { size: 20, col: rgba(S.ink, 0.42), align: 'center', maxW: inner });
  }
  // v11 HUD: four quiet readouts in the margins (title, tempo + key, bar.beat, credit); no bars, no REC. It shows on
  // the wide shot only: from the first frame of a push until the camera is wide again it is off (hard), so it never
  // covers a pushed-in window.
  function hud(t, s) {
    if (!V('hud.on', true)) return;
    if (s && (s.to !== 'wide' || s.from !== 'wide')) return;
    const hv = { tc: tc(t), bbt: bbt(t), songBar: String(D.song.startBar + Math.floor(t / BAR)) }, [, t1, b0] = HUD_BAND[aspect];
    const m = port ? 52 : 52, top = t1 / 2 + 4, bot = (b0 + H) / 2 - 2, dim = rgba(S.ink, 0.55);
    text(c, tag('hud.left', hv), m, top, { size: port ? 24 : 22, fam: DISPLAY, w: 800, col: S.ink, ls: 0.5, maxW: W * 0.55 });
    text(c, tag('hud.right', hv), W - m, top, { size: 20, w: 500, col: dim, align: 'right', ls: 1.5 });
    text(c, tag('hud.bottomLeft', hv), m, bot, { size: 20, w: 500, col: dim, ls: 1.5 });
    text(c, tag('hud.bottomRight', hv), W - m, bot, { size: 20, fam: UI, w: 500, col: dim, align: 'right', ls: 0.5 });
  }
  // text cues: typed one character per 64th note from the key, hard cut at the end of the clip (no fades)
  function textCues(t) {
    for (const k of ev.clipsAt('text.cue', b)) {
      const s = L.sub(String(k.v ?? '')); if (!s) continue;
      const n = Math.min(s.length, Math.floor((t - T(k.b)) / T(1 / 16) + 1e-6) + 1), str = s.slice(0, n), size = k.size || 56, x = (k.x ?? 0.5) * W, y = (k.y ?? 0.5) * H;
      const colr = k.color === 'hot' ? S.hot : k.color === 'dim' ? S.dim : /^#/.test(k.color || '') ? k.color : S.ink, al = k.align || 'center', st = k.font || 'mono';
      const fam = st === 'display' ? DISPLAY : st === 'sans' || st === 'ui' ? UI : MONO;
      if (k.box !== false) { c.font = `700 ${size}px ${fam}`; const tw = Math.min(W - 40, c.measureText(s).width + size * 1.2), bx = al === 'left' ? x - size * 0.6 : al === 'right' ? x - tw + size * 0.6 : x - tw / 2;
        L.glass(c, bx, y - size * 0.95, tw, size * 1.9, S, { r: size * 0.95, backdrop: 'ground', tint: 0.45, shadow: 0.6 }); }
      if (st === 'hand') lab.hand(c, str, x, y + size * 0.3, size, colr, t, 40 + Math.floor(k.b), -0.02, al);
      else if (st === 'stencil') lab.stencil(c, str.toUpperCase(), al === 'center' ? x : x, y, size, colr, al);
      else text(c, st === 'display' ? str.toUpperCase() : str, x, y, { size, fam: st === 'serif' ? SERIF : fam, w: st === 'serif' ? 400 : st === 'display' ? 800 : st === 'mono' ? 700 : 500, style: st === 'serif' ? 'italic' : '', col: colr, align: al, maxW: W - 60 });
    }
  }
  const grain = [];
  for (let q = 0; q < 4; q++) { const g = document.createElement('canvas'); g.width = g.height = 256; const gx = g.getContext('2d'), im = gx.createImageData(256, 256); for (let i = 0; i < 65536; i++) { const v = hash(i * 1.37 + q * 9173.1) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } gx.putImageData(im, 0, 0); grain.push(g); }
  function textures(t) {
    const f = fidx(t), g = grain[Math.floor(t / T(U.s16)) % 4], gr = V('fx.grain', S.grain), vg = V('fx.vignette', S.vignette), sc = V('fx.scan', 0);
    if (gr > 0) { c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = gr * 0.8; const ox = (hash(f * 3.1) * 256) | 0, oy = (hash(f * 7.7) * 256) | 0;
      for (let yy = -oy; yy < H; yy += 256) for (let xx = -ox; xx < W; xx += 256) c.drawImage(g, xx, yy); c.restore(); }
    if (sc > 0) { c.fillStyle = `rgba(0,0,0,${0.45 * sc})`; for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 2); }
    if (vg > 0) { const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${vg * 0.7})`); c.fillStyle = v; c.fillRect(0, 0, W, H); }
  }
  function ground() {
    c.fillStyle = S.paper; c.fillRect(-W, -H, 3 * W, 3 * H);
    // v11: two soft light pools in the ground (the ink colour, so Nigredo stays grey) give the glass something to blur
    const pool = V('ground.pool', L.isLight(S) ? 0.5 : 1) * (L.isLight(S) ? 0.16 : 0.13);
    if (pool > 0) for (const [px, py, pr] of [[0.2, 0.3, 0.75], [0.85, 0.72, 0.6]]) { const g = c.createRadialGradient(W * px, H * py, 0, W * px, H * py, Math.max(W, H) * pr);
      g.addColorStop(0, rgba(S.ink, pool)); g.addColorStop(1, rgba(S.ink, 0)); c.fillStyle = g; c.fillRect(0, 0, W, H); }
    const pat = V('ground.pattern', 'auto'), p = pat === 'auto' ? { lab: 'graph', exe: 'dots', scope: 'scan' }[LOOK] : pat, gA = V('ground.gridA', S.gridA);
    if (p === 'graph') lab.graphPaper(c, 0, 0, W, H, Object.assign({}, S, { gridA: gA }), 20, 100, 1);
    else if (p === 'dots') { c.fillStyle = rgba(S.ink, 0.13 * gA / (S.gridA || 0.07)); for (let y = 30; y < H; y += 40) for (let x = 20; x < W; x += 40) c.fillRect(x, y, 2, 2); }
    else if (p === 'scan') { c.fillStyle = rgba(S.ink, 0.05 * gA / (S.gridA || 0.07)); for (let y = 0; y < H; y += 6) c.fillRect(0, y, W, 1); }
  }
  // opt-in glitch: on each beat inside a glitch clip, 3-4 thin horizontal slices shifted sideways for <= 80 ms
  function glitch(t, scale) {
    for (const k of ev.clipsAt('fx.glitch', b)) { const amt = clamp(+k.v || 0); if (amt <= 0) continue;
      const bb = Math.floor(b), age = (b - bb) * BEAT; if (age > 0.08) continue; const e = (1 - age / 0.08) ** 2, cv = c.canvas, w = cv.width, h = cv.height, seed = bb * 7.31 + 3;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); const n = 3 + Math.floor(amt * 2.2);
      for (let j = 0; j < n; j++) { const y = Math.floor(hash(seed + j * 1.7) * h * 0.92), hh = Math.max(1, Math.round((3 + 12 * hash(seed + j * 2.9)) * scale * (0.7 + amt))), dx = Math.round(hs(seed, j) * (8 + 34 * hash(seed + j * 4.3)) * scale * (0.4 + 1.6 * amt) * e);
        if (dx) c.drawImage(cv, 0, y, w, hh, dx, y, w, hh); }
      c.restore(); }
  }
  // ---------------------------------------------------------------- per-frame state
  function setState(look, stage) {
    LOOK = LAYOUT[look] ? look : 'exe';
    const over = {}; for (const k of STAGE_COLOR_KEYS) { const v = V('stage.' + k, null); if (v) over[k] = v; }
    S = stageOf(stage, over); LY = {}; IDS = Object.keys(LAYOUT[LOOK][aspect]); for (const id of IDS) LY[id] = rectOf(id);
    setVars();
  }
  function pendulum() {
    BR.pendulum((k) => { const st = ev.value('stage', k, 'nigredo'); return ev.value('pendant.amp', k, stageOf(st).swingDeg.calm); }, V('pendant.period', 2), V('pendant.react', 0.32),
      { links: V('pendant.links', 10), wave: V('pendant.wave', 0.75), damp: V('pendant.damp', 0.35) });
  }
  // test modes (native --test pendant | waveform, and the motion / waveform tests): one element alone, no camera or textures
  const testRect = () => (port ? [90, 240, 900, 1480] : [560, 90, 800, 900]);
  const waveRect = () => (port ? [24, 420, 1032, 1000] : [24, 160, 1872, 760]);
  function testMode(kind, t) {
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H); ground();
    if (kind === 'waveform') { const r = waveRect(); c.fillStyle = S.card; c.fillRect(r[0] - 8, r[1] - 8, r[2] + 16, r[3] + 16); M.session(c, S, r, t, 1); text(c, `WAVEFORM TEST · ${bbt(t)}`, 40, 120, { size: 28, w: 700, col: S.ink }); return; }
    elephantBody(testRect(), t, 1, S);
    const bb = Math.floor(t / BEAT + 1e-6); text(c, `PENDANT · CHAIN WAVE · beat ${bb + 1} · ${bbt(t)}`, 40, port ? 120 : 50, { size: 28, w: 700, col: S.ink });
  }
  function flash(t) { const f = fidx(t); if (ev.keysIn('fx.flash', 0, NB * 4 + 1).some((k) => fidx(T(k.b) + 0.5 / FPS) === f)) { c.globalCompositeOperation = 'difference'; c.fillStyle = S.grey ? '#ffffff' : S.ink; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; } }
  /** Draw clip time t into ctx (a canvas of width W*scale). opts: {ev, fps (sample at the frame centre), look, stage}. */
  function render(ctx, t, opts = {}) {
    c = ctx; ev = opts.ev || ev; tagDoc = opts.tags || DEFAULT_TAGS; IB = INTRO.beats(ev);
    const fps = opts.fps || FPS, scale = ctx.canvas.width / W;
    t = clamp(t, 0, D.duration - 1 / fps) + 0.5 / fps; b = t / BEAT;
    setState(V('look', opts.look || 'exe'), V('stage', opts.stage || 'nigredo')); pendulum();
    c.setTransform(scale, 0, 0, scale, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.imageSmoothingEnabled = true;
    if (opts.test) { L.view.camZ = 1; L.view.base = scale; testMode(opts.test, t); c.setTransform(1, 0, 0, 1, 0, 0); return { look: LOOK, stage: S.name, test: opts.test }; }
    if (IB && t < T(IB)) {   // v11 intro: player + cover-flow + push-in (hard cut into the lab at beat IB); grain / vignette stay on top
      L.view.camZ = 1; L.view.base = scale; INTRO.draw(c, t, { S, V, ev, tag, W, H }); c.setTransform(scale, 0, 0, scale, 0, 0); textCues(t); textures(t); flash(t); c.setTransform(1, 0, 0, 1, 0, 0);
      return { look: LOOK, stage: S.name, intro: true };
    }
    const cam = camera(), z = cam.z; L.view.camZ = z; L.view.base = scale;
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H);
    c.setTransform(scale * z, 0, 0, scale * z, scale * (W / 2 - cam.x * z), scale * (H / 2 - cam.y * z));
    ground(); L.snap(c, 'ground', 3);
    const att = attention(t);
    for (const id of IDS) card(id, t, att === id);
    c.setTransform(scale, 0, 0, scale, 0, 0); L.view.camZ = 1;
    if (!L.isLight(S)) L.halation(c, V('fx.halation', 0.16));
    result(t); hud(t, ev.shot(b)); textCues(t); textures(t);
    flash(t);
    glitch(t, scale);
    c.setTransform(1, 0, 0, 1, 0, 0);
    return { look: LOOK, stage: S.name, cam, attention: att };
  }
  /** Every scheduled visual event of the current cue sheet (beats + labels), for the sync test and the timeline. */
  function schedule(evx, opts = {}) {
    ev = evx; IB = INTRO.beats(ev); const out = [], add = (bb, what) => { if (bb >= 0 && bb <= NB * 4) out.push({ b: bb, t: T(bb), what }); };
    b = 0; setState(V('look', opts.look || 'exe'), V('stage', opts.stage || 'nigredo'));
    for (const t of ev.tracksOf('camera.shot')) for (const k of t.keys) { if (k.transition !== 'cut') add(k.b - (k.dur ?? 1), `camera push → ${k.v} (start)`); add(k.b, `camera ${k.transition === 'cut' ? 'cut' : 'push'} → ${k.v} (land)`); }
    for (const [bb, w] of INTRO.events(ev)) add(bb, w);   // v11 intro
    for (const id of IDS) { const o = winOpen(id); if (o >= 0) for (let q = 0; q < 6; q++) add(o + q * U.t32, `open ${id} step ${q + 1}`); }
    const ra = resultAt(); for (let q = 0; q < 6; q++) add(ra + q * 0.5, `result line ${q + 1}`);
    for (const [bb, w] of BR.logoEvents(0, NB * 4, Math.max(4, Math.round(V('logo.cycle', 2) * 4)))) add(bb, w);
    for (let k = 0; k < NB * 4; k++) add(k * V('pendant.period', 2) / 2, 'pendant swing extreme');
    if (V('logo.runner', true)) for (let q = 0; q < NB * 16; q++) add(q / 4, 'logo runner step (16th)');
    for (const k of ev.keysIn('fx.flash', 0, NB * 4)) add(k.b, '1-frame invert');
    for (const k of ev.keysIn('text.cue', 0, NB * 4)) add(k.b, `text cue "${String(k.v).slice(0, 24)}"`);
    for (const t of ev.sheet.tracks) if (!['camera.shot', 'text.cue', 'fx.flash'].includes(t.path)) for (const k of t.keys) add(k.b, `${t.path} key`);
    return out.sort((x, y) => x.b - y.b);
  }
  /** Window rects of a look (with the sheet's overrides at beat bb), for hit testing and camera framing in the UI. */
  function rects(evx, bb, look) { ev = evx; IB = INTRO.beats(ev); b = bb; setState(look || V('look', 'exe'), V('stage', 'nigredo')); return { ...LY }; }
  // motion trace in the pendant test geometry (testRect): hand, every joint, every link angle, the body angle
  const trace = (t, evx) => { if (evx) ev = evx; b = 0; pendulum(); const g = pendantGeom(testRect()); return BR.tracePts(g.ax, g.ay, g.size, t + 0.5 / FPS, g.len); };
  return { W, H, D, render, schedule, rects, trace, testRect, waveRect, registry: (o = {}) => buildRegistry({ aspect, bars: NB, ...o }), core: L, brand: BR, WINDOW_IDS };
}
export { mergeDeep };
