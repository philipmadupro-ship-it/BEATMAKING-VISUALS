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
import { LAYOUT, CONTENT, SCOPE_NAMES, BOOT_RECT, openBeat, WINDOW_IDS } from './layout.js';
import { DEFAULT_TAGS } from './tags.js';
import { mergeDeep, createEvaluator, emptySheet } from '../cues/schema.js';
import { buildRegistry, meterPath } from './registry.js';

const METER_KIND = { scope: 'logo', session: 'waveform', spectro: 'spectrogram', loud: 'loudness' };

export function createFilm({ D, assets, aspect = '916' }) {
  const L = createCore(D), lab = createLab(L), M = createMeters(L), BR = createBrand(L, assets);
  const { F, FPS, BEAT, BAR, T, U, steps, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, hs, hash, kickEnv, labelAt, SANS, MONO, SERIF, HAND } = L;
  const port = aspect === '916', W = port ? 1080 : 1920, H = port ? 1920 : 1080, NB = D.bars;
  let c = null, ev = createEvaluator(emptySheet()), b = 0, LOOK = 'exe', S = stageOf('nigredo'), LY = {}, IDS = [], tagDoc = DEFAULT_TAGS;
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
  const CODE = (id) => `${tag('codes.prefix') || 'SPC'}-${String(IDS.indexOf(id) + 1).padStart(2, '0')}`;
  const WIN = (id) => tag('windows.' + (id === 'chains' ? 'logo' : id === 'session' ? 'wave' : id === 'stereo' ? 'gonio' : id)) || id;

  // ---------------------------------------------------------------- windows: rect, open steps, content
  const rectOf = (id) => { const r = LAYOUT[LOOK][aspect][id]; return [V(`win.${id}.x`, r[0]), V(`win.${id}.y`, r[1]), V(`win.${id}.w`, r[2]), V(`win.${id}.h`, r[3])]; };
  function openStep(id, t) {
    const n0 = steps(t, V(`win.${id}.open`, openBeat(LOOK, aspect, id)), 6, U.t32), k = ev.lastKey(`win.${id}.visible`, t / BEAT);
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
  // ---------------------------------------------------------------- handwritten notes (stay once written), pinned to bars
  const NOTE_DEFS = [
    [2, (L2) => (L2.session ? 'session' : 'chains'), (r, cr, t, n, Sx) => { const x = cr[0] + cr[2] * 0.52, y = LY.session ? cr[1] + cr[3] - 64 : cr[1] + 40; c.fillStyle = rgba(Sx.card, 0.85); c.fillRect(x - 8, y - 22, Math.min(cr[2] * 0.48, 480), 70); lab.crossed(c, tag('notes.loud_old'), x, y - 4, Sx, 22); lab.hand(c, tag('notes.loud_new'), x + 4, y + 38, 30, Sx.hot, t, 11); }],
    [3, () => 'spectrum', (r, cr, t, n, Sx) => { const x = cr[0] + cr[2] * 0.1, y = cr[1] + cr[3] * 0.5; lab.arrow(c, [[x + 150, y - 70], [x + 70, y - 50], [x + 14, y]], Sx.hot, t, 5, n, 2.6); lab.hand(c, tag('notes.spectrum'), x + 140, y - 80, 32, Sx.hot, t, 6); }],
    [4, () => 'session', (r, cr, t, n, Sx) => { lab.ring(c, cr[0] + cr[2] * 0.25, cr[1] + 60, 80, 30, Sx.hot, t, 9, n); lab.hand(c, tag('notes.wave'), cr[0] + cr[2] * 0.25 + 100, cr[1] + 74, 32, Sx.hot, t, 10, -0.02); }],
    [5, () => 'stereo', (r, cr, t, n, Sx) => {   // v10: the note sits in the imager's title strip (left of the mode label), sized to fit, so it never crosses the scope
      const s = tag('notes.gonio'), mode = { level: 'POLAR LEVEL', lissajous: 'LISSAJOUS' }[L.meter('stereo', 'mode', 'sample')] || 'POLAR SAMPLE';
      c.save(); L.font(c, L.floorSize(c, 18), L.MONO, 500); const lw = c.measureText(mode).width; L.font(c, 28, L.HAND, 700); const w28 = c.measureText(s).width; c.restore();
      const sz = clamp(28 * (cr[2] - 44 - 8 - lw - 16) / w28, 12, 28); lab.hand(c, s, cr[0] + 4, cr[1] + 26, sz, Sx.hot, t, 12, 0); }],
    [6, () => 'loud', (r, cr, t, n, Sx) => { lab.stamp(c, tag('stamps.clock'), cr[0] + 70, cr[1] + cr[3] - 34, -0.12, Sx.stamp, 22); }],
    [7, () => 'eq', (r, cr, t, n, Sx) => { lab.hand(c, tag('notes.eq'), cr[0] + cr[2] - 8, cr[1] + cr[3] - 64, 30, Sx.hot, t, 13, -0.03, 'right'); }],
    [9, () => 'surface', (r, cr, t, n, Sx) => { lab.hand(c, '← the drop, folded', cr[0] + 8, cr[1] + cr[3] - 20, 28, Sx.hot, t, 14); }],
    [9, () => 'spectro', (r, cr, t, n, Sx) => { lab.hand(c, 'kick every beat ↓', cr[0] + 8, cr[1] + 30, 28, Sx.hot, t, 15); }],
  ];
  const notesFor = (look) => { const L2 = LAYOUT[look][aspect], out = []; for (const [bar, idf, fn] of NOTE_DEFS) { const id = idf(L2); if (bar < NB - 2 && L2[id]) out.push({ b: bar * 4 + 1, id, fn }); } return out; };
  const NOTES = {}; const notes = () => (NOTES[LOOK] = NOTES[LOOK] || notesFor(LOOK));

  // ---------------------------------------------------------------- look chrome (returns the content rect)
  function chrome(id, r, n, t, Sx, active) {
    const [x, y, w, h] = r, seed = hash(id.length * 13.7 + r[0] + r[1]) * 100;
    if (LOOK === 'exe') {
      if (n >= 3) { c.fillStyle = rgba('#000000', Sx.name === 'ALBEDO' ? 0.14 : 0.5); c.fillRect(x + 8, y + 8, w, h); c.fillStyle = Sx.card; c.fillRect(x, y, w, h); }
      c.strokeStyle = rgba(Sx.ink, 0.7); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); if (n >= 2) { c.lineTo(x + w, y + h); c.lineTo(x, y + h); } c.stroke(); c.lineWidth = 1;
      if (n < 3) return null;
      if (Sx.gloss) lab.gloss(c, x, y, w, h, Sx, seed);
      c.fillStyle = active ? Sx.ink : rgba(Sx.ink, 0.09); c.fillRect(x + 1, y + 1, w - 2, 40);
      c.fillStyle = rgba(Sx.ink, 0.6); c.fillRect(x + 1, y + 41, w - 2, 1);
      text(c, WIN(id), x + 12, y + 22, { size: 22, w: 700, col: active ? Sx.bg : Sx.ink, maxW: w - 140 });
      for (let i = 0; i < 3; i++) { const bx = x + w - 30 - i * 26; c.strokeStyle = active ? Sx.bg : rgba(Sx.ink, 0.7); c.strokeRect(Math.round(bx) + 0.5, y + 12.5, 16, 16); if (i === 0) { c.beginPath(); c.moveTo(bx + 4, y + 16); c.lineTo(bx + 13, y + 25); c.moveTo(bx + 13, y + 16); c.lineTo(bx + 4, y + 25); c.stroke(); } }
      return [x + 14, y + 54, w - 28, h - 66];
    }
    if (LOOK === 'lab') {
      if (n >= 3) { c.fillStyle = rgba('#000000', Sx.name === 'ALBEDO' ? 0.12 : 0.4); c.fillRect(x + 6, y + 6, w, h); c.fillStyle = Sx.card; c.fillRect(x, y, w, h); }
      c.strokeStyle = rgba(Sx.ink, 0.55); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); if (n >= 2) { c.lineTo(x + w, y + h); c.lineTo(x, y + h); } c.stroke();
      if (n < 3) return null;
      if (Sx.gloss) lab.gloss(c, x, y, w, h, Sx, seed);
      lab.graphPaper(c, x + 1, y + 44, w - 2, h - 45, Sx, 10, 50, 0.8);
      c.fillStyle = active ? rgba(Sx.hot, Sx.grey ? 0.16 : 0.2) : rgba(Sx.ink, 0.05); c.fillRect(x, y, w, 42);
      lab.stencil(c, WIN(id).toUpperCase(), x + 12, y + 22, 22, Sx.ink);
      if (w > 420) text(c, `${CODE(id)} · ${tag('codes.trial')}`, x + w - 12, y + 22, { size: 22, col: rgba(Sx.ink, 0.6), align: 'right' });
      c.strokeStyle = rgba(Sx.system ? Sx.rule : Sx.ink, Sx.system ? 0.9 : 0.4); c.lineWidth = Sx.system ? 2 : 1; c.beginPath(); c.moveTo(x, y + 42.5); c.lineTo(x + w, y + 42.5); c.stroke(); c.lineWidth = 1;
      return [x + 14, y + 54, w - 28, h - 66];
    }
    // scope: rack module with screws, an engraved plate, a kick LED, the screen inset
    if (n >= 3) { c.fillStyle = Sx.card; c.fillRect(x, y, w, h); c.fillStyle = rgba(Sx.ink, 0.05); c.fillRect(x, y, w, 3); c.fillStyle = rgba('#000000', 0.5); c.fillRect(x, y + h - 3, w, 3); }
    c.strokeStyle = rgba(Sx.ink, 0.45); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); if (n >= 2) { c.lineTo(x + w, y + h); c.lineTo(x, y + h); } c.stroke();
    if (n < 3) return null;
    for (const [sx, sy] of [[x + 14, y + 14], [x + w - 14, y + 14], [x + 14, y + h - 14], [x + w - 14, y + h - 14]]) { c.strokeStyle = rgba(Sx.ink, 0.5); c.beginPath(); c.arc(sx, sy, 6, 0, 7); c.stroke(); c.beginPath(); c.moveTo(sx - 4, sy + 1.5); c.lineTo(sx + 4, sy - 1.5); c.stroke(); }
    const name = SCOPE_NAMES[id] || id.toUpperCase();
    c.font = `800 22px ${MONO}`; const pw = Math.min(w - 110, c.measureText(name).width + 28);
    c.fillStyle = active ? Sx.ink : rgba(Sx.ink, 0.1); c.fillRect(x + 30, y + 8, pw, 32); c.strokeStyle = rgba(Sx.ink, 0.5); c.strokeRect(x + 30.5, y + 8.5, pw, 32);
    text(c, name, x + 44, y + 25, { size: 22, w: 800, col: active ? Sx.bg : Sx.ink, ls: 1, maxW: pw - 26 });
    const led = kickEnv[fidx(t)] > 0.3; c.fillStyle = led ? Sx.hot : rgba(Sx.ink, 0.15); c.beginPath(); c.arc(x + w - 40, y + 24, 7, 0, 7); c.fill();
    const sr = [x + 22, y + 50, w - 44, h - 72]; c.fillStyle = mix(Sx.bg, Sx.card, 0.4, 1); c.fillRect(sr[0], sr[1], sr[2], sr[3]); c.strokeStyle = rgba(Sx.ink, 0.3); c.strokeRect(sr[0] + 0.5, sr[1] + 0.5, sr[2], sr[3]);
    return [sr[0] + 10, sr[1] + 10, sr[2] - 20, sr[3] - 20];
  }
  function furniture(id, r, t, Sx) {
    const [x, y, w, h] = r, seed = hash(id.length * 13.7 + r[0]) * 100;
    if (LOOK === 'lab') {
      if (hash(seed) > 0.4) { lab.tape(c, x + 30, y - 2, 74, 24, -0.5 + hs(seed, 1) * 0.15, Sx, seed); lab.tape(c, x + w - 30, y + h + 2, 74, 24, -0.6 + hs(seed, 2) * 0.15, Sx, seed + 4); }
      else lab.staple(c, x + w / 2, y + 2, hs(seed, 3) * 0.06, Sx);
      if (Sx.exposed) lab.basting(c, x, y, w, h, Sx);
      if (Sx.obstruct && (id === 'spectro' || id === 'stereo')) { c.save(); c.translate(x + w * 0.74, y + h * 0.2); c.rotate(0.32); c.fillStyle = rgba(Sx.tape, 1); c.fillRect(-w * 0.18, -10, w * 0.36, 20); c.restore(); }
    }
    if (Sx.system) { c.fillStyle = Sx.rule; c.fillRect(x - 4, y + 54, 4, 34); }
    if (Sx.residue.includes('brass') && (id === 'session' || id === 'loud' || id === 'chains')) { c.fillStyle = '#b8975a'; c.fillRect(x, y + h - 3, w * 0.4, 3); }
    if (Sx.residue.includes('ink')) { c.strokeStyle = rgba(Sx.name === 'ALBEDO' ? '#1a1917' : '#000000', 0.55); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + w * 0.1, y + h + 1.5); c.bezierCurveTo(x + w * 0.4, y + h + 7, x + w * 0.6, y + h - 2, x + w * 0.95, y + h + 4); c.stroke(); c.lineWidth = 1; }
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
    const cb = Math.floor(t / BEAT + C / 2) % C, inOut = cb < C / 2 ? 'chain in' : 'chain out', lt = ['U', '2', 'C', '·'][Math.min(3, Math.floor(cb % (C / 2) / (C / 8)))];
    const load = Math.round((s[0] + s[1] + s[2]) / 3 * 100);
    text(c, hero ? `> chain locked  ${String(load).padStart(3, ' ')}%` : `> ${inOut} ${lt}  ${String(load).padStart(3, ' ')}%`, x, y + h - 14, { size: 22, w: 700, col: Sx.ink, maxW: w * 0.6 });
    text(c, LOOK === 'scope' ? `${(BEAT * 100 * V(meterPath('logo', 'span'), 0.25)).toFixed(1)} ms/div · trig ${bbt(t)}` : `cycle ${Math.floor(t / (C * BEAT)) + 1} · ${bbt(t)}`, x + w, y + h - 14, { size: 22, col: rgba(Sx.ink, 0.7), align: 'right', maxW: w * 0.4 });
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
    const { size, len, ax, ay } = pendantGeom(cr), g = BR.chainGeom(ax, ay, len, t);
    BR.drawChain(c, Sx, g);
    const sw = BR.elephant(c, Sx, g.end[0], g.end[1], size, t, g.ang[g.ang.length - 1]);
    if (LOOK === 'lab') lab.tape(c, ax, ay - 6, 70, 22, 0.08, Sx, 77);
    if (LOOK === 'scope') { c.fillStyle = rgba(Sx.ink, 0.8); c.fillRect(ax - 22, ay - 20, 44, 10); c.fillRect(ax - 3, ay - 12, 6, 12); }
    const hx = g.pts[0][0], hy = g.pts[0][1];   // the hand: a crosshair that pushes on the beat
    c.strokeStyle = Sx.hot; c.lineWidth = 2; c.beginPath(); c.arc(hx, hy, 7, 0, 7); c.stroke(); c.beginPath(); c.moveTo(hx - 14, hy); c.lineTo(hx + 14, hy); c.moveTo(hx, hy - 14); c.lineTo(hx, hy + 14); c.stroke(); c.lineWidth = 1;
    const R = Math.min(170, h * 0.3) + len; c.strokeStyle = rgba(Sx.ink, 0.5); c.setLineDash([4, 5]); c.beginPath(); c.arc(ax, ay, R, Math.PI / 2 - sw.amp, Math.PI / 2 + sw.amp); c.stroke(); c.setLineDash([]);
    for (const a of [-sw.amp, sw.amp]) { c.strokeStyle = rgba(Sx.ink, 0.6); c.beginPath(); c.moveTo(ax - Math.sin(a) * (R - 8), ay + Math.cos(a) * (R - 8)); c.lineTo(ax - Math.sin(a) * (R + 8), ay + Math.cos(a) * (R + 8)); c.stroke(); }
    c.beginPath(); c.moveTo(ax - Math.sin(sw.th) * (R - 14), ay + Math.cos(sw.th) * (R - 14)); c.lineTo(ax - Math.sin(sw.th) * (R + 14), ay + Math.cos(sw.th) * (R + 14)); c.strokeStyle = Sx.hot; c.lineWidth = 3; c.stroke(); c.lineWidth = 1;
    const deg = sw.th * 180 / Math.PI;
    lab.hand(c, tag('notes.elephant', { angle: `${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1)}` }), x + w - 4, y + 44, 34, Sx.hot, t, 21, -0.03, 'right');
    const per = V('pendant.period', 2), perTxt = `${BR.chainInfo().links} LINKS · T = ${+per.toFixed(2)} BEATS · ${Math.round(sw.amp * 180 / Math.PI)}°`;
    lab.tag(c, x + 2, y + h - 104, Math.min(300, w * 0.62), tag('specimen').map((s) => s.replace(/^(VERLET|CHAIN WAVE) · T0 = 2 BEATS$/, perTxt)), Sx, -0.04);
    c.restore();
  }
  const BODY = { logo: chainsBody, pendant: elephantBody, waveform: (cr, t, k, Sx) => M.session(c, Sx, cr, t, k), clock: (cr, t, k, Sx) => M.clock(c, Sx, cr, t, k), bands: (cr, t, k, Sx) => M.bands(c, Sx, cr, t, k),
    eq: (cr, t, k, Sx) => M.eq(c, Sx, cr, t, k), spectrum: (cr, t, k, Sx) => M.spectrum(c, Sx, cr, t, k), loudness: (cr, t, k, Sx) => M.loud(c, Sx, cr, t, k), stereo: (cr, t, k, Sx) => M.stereo(c, Sx, cr, t, k),
    spectrogram: (cr, t, k, Sx) => M.spectro(c, Sx, cr, t, k), surface: (cr, t, k, Sx) => M.surface(c, Sx, cr, t, k),
    levels: (cr, t, k, Sx) => M.levels(c, Sx, cr, t, k), ghost: (cr, t, k, Sx) => M.ghost(c, Sx, cr, t, k) };
  function card(id, t, att) {
    const r = LY[id], n = openStep(id, t); if (n <= 0) return;
    const acc = V(`win.${id}.accent`, null), Sx = acc && acc !== S.hot ? Object.assign({}, S, { hot: acc }) : S;
    const cr = chrome(id, r, n, t, Sx, att === id && t >= BEAT); if (!cr) return;
    const k = n >= 6 ? 1 : n === 5 ? 0.66 : n === 4 ? 0.33 : 0;
    c.save(); c.beginPath(); c.rect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); c.clip();
    L.curWin = id; if (k > 0) (BODY[contentOf(id)] || BODY.spectrum)(cr, t, k, Sx);
    if (n >= 6 && V('notes.on', true)) for (const nt of notes()) if (nt.id === id && t >= T(nt.b)) nt.fn(r, cr, t, steps(t, nt.b, 4, U.s16), Sx);
    c.restore();
    if (n >= 6 && V('furniture.on', true)) furniture(id, r, t, Sx);
  }
  // exe: dashed elbow wires between windows; one square signal dot steps along each wire on 16ths, lit on kicks
  function wires(t) {
    if (LOOK !== 'exe' || !V('wires.on', true)) return;
    const pairs = port ? [['session', 'chains', 0.3, 0.5], ['chains', 'elephant', 0.5, 0.5], ['eq', 'spectrum', 0.85, 0.85]] : [['session', 'chains', 0.3, 0.3], ['chains', 'elephant', 0.9, 0.5]];
    for (const [a, bq, fa, fb] of pairs) {
      if (!LY[a] || !LY[bq] || openStep(a, t) < 6 || openStep(bq, t) < 6) continue;
      const ra = LY[a], rb = LY[bq], A0 = [ra[0] + ra[2] * fa, ra[1] + ra[3]], B0 = [rb[0] + rb[2] * fb, rb[1]];
      const vert = Math.abs(A0[0] - B0[0]) < 2, mid = (A0[1] + B0[1]) / 2, P = vert ? [A0, B0] : [A0, [A0[0], mid], [B0[0], mid], B0];
      c.save(); c.strokeStyle = rgba(S.ink, 0.75); c.setLineDash([6, 5]); c.lineWidth = 1.5; c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.setLineDash([]); c.restore();
      for (const p of [A0, B0]) { c.fillStyle = S.bg; c.fillRect(p[0] - 5, p[1] - 5, 10, 10); c.strokeStyle = S.ink; c.strokeRect(p[0] - 4.5, p[1] - 4.5, 9, 9); }
      const seg = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1])), tot = seg.reduce((x, y) => x + y, 0);
      let d = tot * ((Math.floor(t / (BEAT / 4)) % 8) / 7), i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const u = seg[i] ? d / seg[i] : 0, X = lerp(P[i][0], P[i + 1][0], u), Y = lerp(P[i][1], P[i + 1][1], u), lit = kickEnv[fidx(t)] > 0.3;
      c.fillStyle = lit ? S.hot : S.ink; c.fillRect(Math.round(X) - (lit ? 7 : 5), Math.round(Y) - (lit ? 7 : 5), lit ? 14 : 10, lit ? 14 : 10);
    }
  }
  const resultAt = () => V('result.at', Math.max(0, (NB - (NB >= 8 ? 2 : 1)) * 4));
  function bracket(t, att) {
    if (!V('bracket.on', true) || t < BEAT || (V('result.on', true) && t >= T(resultAt())) || !att) return;
    const r = LY[att]; if (!r) return;
    const acc = V(`win.${att}.accent`, S.hot), [x, y, w, h] = r, g = 10, L0 = 34; c.strokeStyle = acc; c.lineWidth = 3; c.beginPath();
    for (const [px, py, sx, sy] of [[x - g, y - g, 1, 1], [x + w + g, y - g, -1, 1], [x - g, y + h + g, 1, -1], [x + w + g, y + h + g, -1, -1]]) { c.moveTo(px + sx * L0, py); c.lineTo(px, py); c.lineTo(px, py + sy * L0); }
    c.stroke(); c.lineWidth = 1;
  }
  // ---------------------------------------------------------------- overlays: boot terminal, result card, HUD, text cues, textures
  const bootAt = (i) => (i === 0 ? -1 : i * 0.75);
  function boot(t) {
    if (t >= BAR || !V('boot.on', true)) return;
    const BOOT = tag('boot'), TR = port ? BOOT_RECT[LOOK] : [W * 0.56, H * 0.36, 760, 0];
    const bw = TR[2], lh = port ? 42 : 38, bh = BOOT.length * lh + 70, x = TR[0], y = TR[1];
    c.fillStyle = rgba(S.bg, 0.96); c.fillRect(x, y, bw, bh); c.strokeStyle = rgba(S.ink, 0.75); c.lineWidth = 1.5; c.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1); c.lineWidth = 1;
    c.fillStyle = rgba(S.ink, 0.1); c.fillRect(x + 1, y + 1, bw - 2, 40);
    text(c, `${tag('windows.terminal')} · ${tag('experiment')}`, x + 14, y + 21, { size: 22, w: 700, col: S.ink });
    BOOT.forEach((line, i) => {
      const b0 = bootAt(i); if (t < T(b0)) return;
      const nch = Math.min(line.length, Math.floor((t - T(b0)) / T(1 / 16)) + 1);
      text(c, line.slice(0, nch), x + 18, y + 66 + i * lh, { size: 24, w: i === BOOT.length - 1 ? 700 : 400, col: i === BOOT.length - 1 ? S.hot : S.ink, maxW: bw - 36 });
    });
  }
  function result(t) {
    const ra = resultAt(); if (!V('result.on', true) || t < T(ra)) return;
    const n = steps(t, ra, 6, 0.5), R = (p) => tag('result.' + p);
    const cw = port ? 900 : 980, ch = port ? 700 : 600, x = (W - cw) / 2, y = port ? 520 : (H - ch) / 2;
    c.fillStyle = rgba(S.bg, 0.97); c.fillRect(x, y, cw, ch); c.strokeStyle = rgba(S.ink, 0.8); c.lineWidth = 2; c.strokeRect(x, y, cw, ch); c.lineWidth = 1;
    if (LOOK !== 'exe') lab.graphPaper(c, x, y, cw, ch, S, 10, 50, 0.9); else { c.fillStyle = rgba(S.ink, 0.1); c.fillRect(x + 1, y + 1, cw - 2, 44); text(c, tag('windows.result'), x + 14, y + 23, { size: 22, w: 700, col: S.ink }); }
    if (LOOK === 'lab') { lab.tape(c, x + 40, y, 110, 28, -0.4, S, 3); lab.tape(c, x + cw - 40, y + ch, 110, 28, -0.4, S, 8); }
    const top = LOOK === 'exe' ? 44 : 0;
    if (n >= 1) { lab.stencil(c, R('header'), x + 30, y + top + 46, 26, S.ink); text(c, `${S.name} · ${tag('codes.trial')}`, x + cw - 30, y + top + 46, { size: 22, col: rgba(S.ink, 0.75), align: 'right' }); }
    if (n >= 2) text(c, R('title'), x + cw / 2, y + ch * 0.38, { size: port ? 120 : 110, fam: SERIF, style: 'italic', col: S.ink, align: 'center', base: 'alphabetic', maxW: cw - 60 });
    if (n >= 3) text(c, R('meta'), x + cw / 2, y + ch * 0.5, { size: 30, w: 500, col: S.ink, align: 'center', ls: 3, maxW: cw - 60 });
    if (n >= 4) text(c, R('producer'), x + cw / 2, y + ch * 0.63, { size: 46, fam: SANS, w: 600, col: S.ink, align: 'center', maxW: cw - 60 });
    if (n >= 5) { lab.stamp(c, tag('stamps.result'), x + cw * 0.74, y + ch * 0.82, -0.14, S.stamp, 24); lab.hand(c, R('cta'), x + 40, y + ch * 0.84, 40, S.hot, t, 31); }
    if (n >= 6) text(c, R('measure'), x + 30, y + ch - 28, { size: 22, col: rgba(S.ink, 0.7), maxW: cw - 60 });
  }
  function hud(t) {
    if (!V('hud.on', true)) return;
    const hv = { tc: tc(t), bbt: bbt(t), songBar: String(D.song.startBar + Math.floor(t / BAR)) };
    const top = port ? 40 : 34, bot = H - (port ? 40 : 30), m = 24;
    if (LOOK === 'exe') { c.fillStyle = rgba(S.ink, 0.08); c.fillRect(0, 0, W, 72); c.fillRect(0, H - 72, W, 72); c.fillStyle = rgba(S.ink, 0.5); c.fillRect(0, 72, W, 1); c.fillRect(0, H - 73, W, 1); }
    if (LOOK === 'scope') { c.fillStyle = rgba(S.ink, 0.06); c.fillRect(0, 0, W, 72); c.fillRect(0, H - 72, W, 72); c.strokeStyle = rgba(S.ink, 0.4); c.strokeRect(8.5, 8.5, W - 17, 56); c.strokeRect(8.5, H - 64.5, W - 17, 56); }
    const left = LOOK === 'scope' ? `${tag('title')} · SCOPE` : tag('hud.left', hv);
    if (LOOK === 'lab') lab.stencil(c, left, m, top, 24, S.ink); else text(c, left, m, top, { size: 24, w: 800, col: S.ink, ls: 1, maxW: W * 0.62 });
    c.fillStyle = S.hot; c.fillRect(W - m - 250, top - 7, 14, 14);
    text(c, tag('hud.rec', hv), W - m, top, { size: 24, w: 700, col: S.ink, align: 'right' });
    text(c, tag('hud.bottomLeft', hv), m, bot, { size: 22, col: rgba(S.ink, 0.85), w: 500 });
    text(c, tag('hud.bottomRight', hv), W - m, bot, { size: 22, col: rgba(S.ink, 0.85), align: 'right', w: 500 });
    if (LOOK !== 'scope') text(c, LOOK === 'exe' ? `${tag('title')}` : `${tag('title')} · ${D.key}`, W / 2, bot, { size: 22, w: 700, col: S.ink, align: 'center', maxW: W * 0.34 });
    else text(c, `${D.key} · ${Math.round(D.bpm)}`, W / 2, bot, { size: 22, w: 700, col: S.ink, align: 'center' });
  }
  // text cues: typed one character per 64th note from the key, hard cut at the end of the clip (no fades)
  function textCues(t) {
    for (const k of ev.clipsAt('text.cue', b)) {
      const s = L.sub(String(k.v ?? '')); if (!s) continue;
      const n = Math.min(s.length, Math.floor((t - T(k.b)) / T(1 / 16) + 1e-6) + 1), str = s.slice(0, n), size = k.size || 56, x = (k.x ?? 0.5) * W, y = (k.y ?? 0.5) * H;
      const colr = k.color === 'hot' ? S.hot : k.color === 'dim' ? S.dim : /^#/.test(k.color || '') ? k.color : S.ink, al = k.align || 'center', st = k.font || 'mono';
      if (k.box !== false) { c.font = `700 ${size}px ${st === 'sans' ? SANS : MONO}`; const tw = Math.min(W - 40, c.measureText(s).width + size * 0.8), bx = al === 'left' ? x - size * 0.4 : al === 'right' ? x - tw + size * 0.4 : x - tw / 2;
        c.fillStyle = rgba(S.bg, 0.92); c.fillRect(bx, y - size * 0.85, tw, size * 1.7); c.strokeStyle = rgba(S.ink, 0.8); c.lineWidth = 2; c.strokeRect(bx, y - size * 0.85, tw, size * 1.7); c.lineWidth = 1; }
      if (st === 'hand') lab.hand(c, str, x, y + size * 0.3, size, colr, t, 40 + Math.floor(k.b), -0.02, al);
      else if (st === 'stencil') lab.stencil(c, str.toUpperCase(), al === 'center' ? x : x, y, size, colr, al);
      else text(c, str, x, y, { size, fam: st === 'sans' ? SANS : st === 'serif' ? SERIF : MONO, w: st === 'serif' ? 400 : 700, style: st === 'serif' ? 'italic' : '', col: colr, align: al, maxW: W - 60 });
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
  /** Draw clip time t into ctx (a canvas of width W*scale). opts: {ev, fps (sample at the frame centre), look, stage}. */
  function render(ctx, t, opts = {}) {
    c = ctx; ev = opts.ev || ev; tagDoc = opts.tags || DEFAULT_TAGS;
    const fps = opts.fps || FPS, scale = ctx.canvas.width / W;
    t = clamp(t, 0, D.duration - 1 / fps) + 0.5 / fps; b = t / BEAT;
    setState(V('look', opts.look || 'exe'), V('stage', opts.stage || 'nigredo')); pendulum();
    c.setTransform(scale, 0, 0, scale, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.imageSmoothingEnabled = true;
    if (opts.test) { L.view.camZ = 1; L.view.base = scale; testMode(opts.test, t); c.setTransform(1, 0, 0, 1, 0, 0); return { look: LOOK, stage: S.name, test: opts.test }; }
    const cam = camera(), z = cam.z; L.view.camZ = z; L.view.base = scale;
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H);
    c.setTransform(scale * z, 0, 0, scale * z, scale * (W / 2 - cam.x * z), scale * (H / 2 - cam.y * z));
    ground();
    const att = attention(t);
    for (const id of IDS) card(id, t, att);
    wires(t);
    if (z < 1.05) bracket(t, att);
    c.setTransform(scale, 0, 0, scale, 0, 0); L.view.camZ = 1;
    boot(t); result(t); hud(t); textCues(t); textures(t);
    const f = fidx(t); if (ev.keysIn('fx.flash', 0, NB * 4 + 1).some((k) => fidx(T(k.b) + 0.5 / FPS) === f)) { c.globalCompositeOperation = 'difference'; c.fillStyle = S.grey ? '#ffffff' : S.ink; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
    glitch(t, scale);
    c.setTransform(1, 0, 0, 1, 0, 0);
    return { look: LOOK, stage: S.name, cam, attention: att };
  }
  /** Every scheduled visual event of the current cue sheet (beats + labels), for the sync test and the timeline. */
  function schedule(evx, opts = {}) {
    ev = evx; const out = [], add = (bb, what) => { if (bb >= 0 && bb <= NB * 4) out.push({ b: bb, t: T(bb), what }); };
    b = 0; setState(V('look', opts.look || 'exe'), V('stage', opts.stage || 'nigredo'));
    for (const t of ev.tracksOf('camera.shot')) for (const k of t.keys) { if (k.transition !== 'cut') add(k.b - (k.dur ?? 1), `camera push → ${k.v} (start)`); add(k.b, `camera ${k.transition === 'cut' ? 'cut' : 'push'} → ${k.v} (land)`); }
    for (const id of IDS) { const o = V(`win.${id}.open`, openBeat(LOOK, aspect, id)); if (o >= 0) for (let q = 0; q < 6; q++) add(o + q * U.t32, `open ${id} step ${q + 1}`); }
    tag('boot').forEach((l, i) => { if (i) add(bootAt(i), `boot line ${i + 1}`); }); add(4, 'boot terminal closes (hard)');
    const ra = resultAt(); for (let q = 0; q < 6; q++) add(ra + q * 0.5, `result line ${q + 1}`);
    for (const nt of notes()) add(nt.b, `note ${nt.id}`);
    for (const [bb, w] of BR.logoEvents(0, NB * 4, Math.max(4, Math.round(V('logo.cycle', 2) * 4)))) add(bb, w);
    for (let k = 0; k < NB * 4; k++) add(k * V('pendant.period', 2) / 2, 'pendant swing extreme');
    if (V('logo.runner', true)) for (let q = 0; q < NB * 16; q++) add(q / 4, 'logo runner step (16th)');
    for (const k of ev.keysIn('fx.flash', 0, NB * 4)) add(k.b, '1-frame invert');
    for (const k of ev.keysIn('text.cue', 0, NB * 4)) add(k.b, `text cue "${String(k.v).slice(0, 24)}"`);
    for (const t of ev.sheet.tracks) if (!['camera.shot', 'text.cue', 'fx.flash'].includes(t.path)) for (const k of t.keys) add(k.b, `${t.path} key`);
    return out.sort((x, y) => x.b - y.b);
  }
  /** Window rects of a look (with the sheet's overrides at beat bb), for hit testing and camera framing in the UI. */
  function rects(evx, bb, look) { ev = evx; b = bb; setState(look || V('look', 'exe'), V('stage', 'nigredo')); return { ...LY }; }
  // motion trace in the pendant test geometry (testRect): hand, every joint, every link angle, the body angle
  const trace = (t, evx) => { if (evx) ev = evx; b = 0; pendulum(); const g = pendantGeom(testRect()); return BR.tracePts(g.ax, g.ay, g.size, t + 0.5 / FPS, g.len); };
  return { W, H, D, render, schedule, rects, trace, testRect, waveRect, registry: (o = {}) => buildRegistry({ aspect, bars: NB, ...o }), core: L, brand: BR, WINDOW_IDS };
}
export { mergeDeep };
