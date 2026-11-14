/* THE LABORATORY v8: composition. The v6 lab-OS bench (many live windows, specimen tags, handwritten notes, stamps)
 * rebuilt per LOOK, with a camera that holds the whole lab OS wide and only sometimes pushes in to one window on the
 * grid (in on a beat, hold 1-2 bars, back out on a beat). The logo chain threads IN / runs OUT at the centre of the
 * beat; the elephant pendant swings on its own chain; every window shows live data from the audio.
 * Looks: exe (OS desktop, window chrome, wires), lab (graph-paper notebook, stencils, tape, stamps),
 * scope (instrument rack around a CRT oscilloscope). Config: <html data-look data-stage data-aspect data-test>.
 * Exposes window.U2C6 {renderAt, ready, schedule, shots, trace}. */
(function () {
  'use strict';
  const L = window.L6, { D, F, FPS, BEAT, BAR, T, U, ev, SCHED, steps, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, hs, hash, kickEnv, labelAt, SANS, MONO, SERIF, HAND, tag } = L;
  const lab = L.lab, M = L.M, M8 = L.M8, BR = L.B;
  const html = document.documentElement;
  const LOOK = (html.dataset.look || 'exe').toLowerCase(), ASPECT = html.dataset.aspect || '916', TEST = html.dataset.test || '';
  const S = Object.assign({}, L.STAGES[(html.dataset.stage || 'nigredo').toLowerCase()]);
  S.bandCols = S.grey ? ['#ffffff', '#bdbdbd', '#8a8a8a'] : ({ ALBEDO: ['#1a1917', '#a8432e', '#6e4433'], CITRINITAS: ['#d79a35', '#b8975a', '#ecd9b0'], RUBEDO: ['#a35cf0', '#ff5cc8', '#c79bf0'] })[S.name];
  S.swingDeg = S.embodied ? { drop: 9.8, calm: 5 } : { drop: 9, calm: 4.6 };
  const canvas = document.getElementById('stage'), ctx = canvas.getContext('2d');
  const port = ASPECT === '916', W = port ? 1080 : 1920, H = port ? 1920 : 1080; canvas.width = W; canvas.height = H;
  const NB = D.bars;
  let c = ctx;

  // ---------------------------------------------------------------- tag variables (every on-screen word is editable)
  const titleCase = D.title.split(' ').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  L.tagVars({ title: D.title, Title: titleCase, titleWord: D.title.split(' ')[0], bpm: String(Math.round(D.bpm)), bpm2: D.bpm.toFixed(2), key: D.key,
    keyShort: D.key.replace(' MIN', 'm').replace(' MAJ', ''), stage: S.name, stageN: String(S.n), look: LOOK.toUpperCase(), lufs: fmt(D.summary.ffmpeg.I),
    srcLufs: fmt(D.srcLufs != null ? D.srcLufs : -10.7), lra: D.summary.ffmpeg.LRA.toFixed(1), tp: fmt(D.summary.ffmpeg.TP), bars: String(NB) });
  L.tagVars({ producer: tag('producer'), experiment: tag('experiment'), today: tag('date') });
  L.tagVars({ date: tag('date') });

  // ---------------------------------------------------------------- layouts (world = the screen; the overview is zoom 1)
  const LAYOUT = {
    exe: { '916': { session: [24, 86, 1032, 330], chains: [24, 432, 640, 470], clock: [680, 432, 376, 226], bands: [680, 674, 376, 228],
      elephant: [24, 918, 520, 620], eq: [560, 918, 496, 302], spectrum: [560, 1236, 496, 302], loud: [24, 1554, 340, 290], stereo: [380, 1554, 330, 290], spectro: [726, 1554, 330, 290] },
      '169': { session: [24, 76, 900, 300], chains: [24, 392, 900, 420], elephant: [940, 76, 480, 736], eq: [1436, 76, 460, 300], spectrum: [1436, 392, 460, 420],
      loud: [24, 828, 340, 220], stereo: [380, 828, 330, 220], spectro: [726, 828, 400, 220], clock: [1142, 828, 360, 220], bands: [1518, 828, 378, 220] } },
    lab: { '916': { chains: [24, 86, 1032, 500], session: [24, 602, 544, 300], elephant: [584, 602, 472, 640], spectrum: [24, 918, 544, 324],
      eq: [24, 1258, 544, 300], loud: [584, 1258, 472, 300], stereo: [24, 1574, 344, 270], spectro: [384, 1574, 344, 270], clock: [744, 1574, 312, 270] },
      '169': { chains: [24, 76, 900, 440], session: [24, 532, 900, 260], elephant: [940, 76, 480, 716], spectrum: [1436, 76, 460, 340], eq: [1436, 432, 460, 360],
      loud: [24, 808, 420, 240], stereo: [460, 808, 360, 240], spectro: [836, 808, 584, 240], clock: [1436, 808, 460, 240] } },
    scope: { '916': { chains: [24, 86, 1032, 760], elephant: [24, 862, 470, 660], eq: [510, 862, 546, 322], spectrum: [510, 1200, 546, 322],
      loud: [24, 1538, 340, 306], stereo: [380, 1538, 330, 306], surface: [726, 1538, 330, 306] },
      '169': { chains: [24, 76, 1000, 640], elephant: [1040, 76, 400, 640], eq: [1456, 76, 440, 312], spectrum: [1456, 404, 440, 312],
      loud: [24, 732, 420, 316], stereo: [460, 732, 380, 316], surface: [856, 732, 584, 316], spectro: [1456, 732, 440, 316] } },
  };
  const LY = LAYOUT[LOOK][ASPECT];
  const IDS = Object.keys(LY);
  const CODE = {}; IDS.forEach((id, i) => { CODE[id] = `${tag('codes.prefix') || 'SPC'}-${String(i + 1).padStart(2, '0')}`; });
  const WIN = (id) => tag('windows.' + (id === 'chains' ? 'logo' : id === 'session' ? 'wave' : id === 'stereo' ? 'gonio' : id === 'loud' ? 'loud' : id)) || id;
  const SCOPE_NAMES = { chains: 'CH1/CH2 · CHAIN', elephant: 'PENDANT', eq: 'PARAM EQ', spectrum: 'SPECTRUM', loud: 'LOUDNESS', stereo: 'STEREO', surface: 'SURFACE', spectro: 'SPECTROGRAM' };

  // ---------------------------------------------------------------- the plan: wide by default, an occasional focus push on the grid
  const FOCUS = { exe: [[3, 'chains', 2], [7, 'eq', 2], [11, 'elephant', 2]], lab: [[3, 'elephant', 2], [7, 'spectrum', 2], [11, 'chains', 1]], scope: [[3, 'eq', 2], [7, 'elephant', 2], [11, 'chains', 2]] }[LOOK]
    .filter(([b, , n]) => b + n < NB - 2);
  const cam = { x: W / 2, y: H / 2, z: 1 };
  const camTL = gsap.timeline({ paused: true });
  const SHOTS = [{ bar: 0, kind: 'boot' }];
  camTL.set(cam, { x: W / 2, y: H / 2, z: 1 }, 0);
  for (const [b, id, n] of FOCUS) {
    const [x, y, w, h] = LY[id], pad = 40, z = clamp(Math.min(W / (w + 2 * pad), H / (h + 2 * pad)), 1.15, 2.2);
    const mx = 30, tx = clamp(x + w / 2, W / (2 * z) - mx, W - W / (2 * z) + mx), ty = clamp(y + h / 2, H / (2 * z) - mx, H - H / (2 * z) + mx);
    // in: one beat, power2.inOut, landing on the downbeat; out: the mirrored move landing on the downbeat after the hold
    ev(b * 4 - 1, `focus in → ${id} (start)`); ev(b * 4, `focus in → ${id} (land)`);
    camTL.to(cam, { x: tx, y: ty, z, duration: T(1), ease: 'power2.inOut' }, T(b * 4 - 1));
    ev((b + n) * 4 - 1, `focus out ← ${id} (start)`); ev((b + n) * 4, 'focus out (land wide)');
    camTL.to(cam, { x: W / 2, y: H / 2, z: 1, duration: T(1), ease: 'power2.inOut' }, T((b + n) * 4 - 1));
    SHOTS.push({ bar: b, kind: 'focus ' + id, len: n });
  }
  camTL.seek(0);

  // ---------------------------------------------------------------- window open schedule: the build bar steps them in, one per half beat
  const OPEN = {};
  const first = { exe: ['chains', 'session', 'clock', 'bands', 'elephant'], lab: ['chains', 'session', 'elephant'], scope: ['chains', 'elephant', 'loud'] }[LOOK];
  IDS.forEach((id) => { if (first.includes(id)) OPEN[id] = -2; });
  IDS.filter((id) => !first.includes(id)).forEach((id, i) => { OPEN[id] = 0.5 + i * 0.5; ev(OPEN[id], `open ${id}`); for (let q = 1; q < 6; q++) ev(OPEN[id] + q * U.t32, `open ${id} step ${q + 1}`); });
  const openStep = (id, t) => steps(t, OPEN[id], 6, U.t32);
  // drop downbeat punctuation: one inverted frame (once per video), on the grid
  const dropBar = (() => { for (let b = 1; b < NB; b++) if (labelAt(b) === 'drop') return b; return 1; })();
  ev(dropBar * 4, 'drop: 1-frame invert');

  // ---------------------------------------------------------------- attention bracket: hops on every beat to the window that beat is about
  // (kick on the beat -> loudness, snare -> spectrum, otherwise the loudest band's meter); hard steps, no tween
  const kickAt = new Set(D.onsets.kick.map((o) => Math.round(o[2] / BEAT * 4))), snrAt = new Set(D.onsets.snare.map((o) => Math.round(o[2] / BEAT * 4)));
  function attention(t) {
    const b = Math.floor(t / BEAT), q = b * 4, has = (id) => LY[id] && openStep(id, t) >= 6;
    let id = snrAt.has(q) ? 'spectrum' : kickAt.has(q) ? 'loud' : null;
    if (b % 4 === 0) id = 'chains';
    if (b % 8 === 6) id = 'elephant';
    if (!id || !has(id)) { const be = F.bands[fidx(b * BEAT)], i = be.indexOf(Math.max(...be)); id = ['stereo', 'eq', 'eq', 'spectrum', 'spectro', 'spectro'][i]; }
    if (!has(id)) id = has('session') ? 'session' : 'chains';
    return id;
  }
  for (let b = 1; b < NB * 4; b++) ev(b, 'attention hop');
  for (let b = 0; b < NB * 4; b++) ev(b, 'pendant swing extreme (theta = A cos(pi beat))');

  // ---------------------------------------------------------------- handwritten notes (stay once written), pinned to bars
  const NOTES = [];
  function note(bar, id, fn) { if (bar < NB - 2 && LY[id]) { NOTES.push({ b: bar * 4 + 1, id, fn }); ev(bar * 4 + 1, `note ${id}`); } }
  const hot = S.hot;
  note(2, LY.session ? 'session' : 'chains', (r, cr, t, n) => { const x = cr[0] + cr[2] * 0.52, y = LY.session ? cr[1] + cr[3] - 64 : cr[1] + 40; c.fillStyle = rgba(S.card, 0.85); c.fillRect(x - 8, y - 22, Math.min(cr[2] * 0.48, 480), 70); lab.crossed(c, tag('notes.loud_old'), x, y - 4, S, 22); lab.hand(c, tag('notes.loud_new'), x + 4, y + 38, 30, hot, t, 11); });
  note(3, 'spectrum', (r, cr, t, n) => { const x = cr[0] + cr[2] * 0.1, y = cr[1] + cr[3] * 0.5; lab.arrow(c, [[x + 150, y - 70], [x + 70, y - 50], [x + 14, y]], hot, t, 5, n, 2.6); lab.hand(c, tag('notes.spectrum'), x + 140, y - 80, 32, hot, t, 6); });
  note(4, 'session', (r, cr, t, n) => { lab.ring(c, cr[0] + cr[2] * 0.25, cr[1] + 60, 80, 30, hot, t, 9, n); lab.hand(c, tag('notes.wave'), cr[0] + cr[2] * 0.25 + 100, cr[1] + 74, 32, hot, t, 10, -0.02); });
  note(5, 'stereo', (r, cr, t, n) => { lab.hand(c, tag('notes.gonio'), cr[0] + 4, cr[1] + 26, 28, hot, t, 12); });
  note(6, 'clock', (r, cr, t, n) => { lab.stamp(c, tag('stamps.clock'), cr[0] + 70, cr[1] + cr[3] - 34, -0.12, S.stamp, 22); });
  note(7, 'eq', (r, cr, t, n) => { lab.hand(c, tag('notes.eq'), cr[0] + cr[2] - 8, cr[1] + cr[3] - 64, 30, hot, t, 13, -0.03, 'right'); });
  note(9, 'surface', (r, cr, t, n) => { lab.hand(c, '← the drop, folded', cr[0] + 8, cr[1] + cr[3] - 20, 28, hot, t, 14); });
  note(9, 'spectro', (r, cr, t, n) => { lab.hand(c, 'kick every beat ↓', cr[0] + 8, cr[1] + 30, 28, hot, t, 15); });

  // ---------------------------------------------------------------- look chrome (returns the content rect)
  function chrome(id, r, n, t) {
    const [x, y, w, h] = r, seed = hash(id.length * 13.7 + r[0] + r[1]) * 100, active = attention(t) === id && t >= BEAT;
    if (LOOK === 'exe') {
      if (n >= 3) { c.fillStyle = rgba('#000000', S.name === 'ALBEDO' ? 0.14 : 0.5); c.fillRect(x + 8, y + 8, w, h); c.fillStyle = S.card; c.fillRect(x, y, w, h); }
      c.strokeStyle = rgba(S.ink, 0.7); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); if (n >= 2) { c.lineTo(x + w, y + h); c.lineTo(x, y + h); } c.stroke(); c.lineWidth = 1;
      if (n < 3) return null;
      if (S.gloss) lab.gloss(c, x, y, w, h, S, seed);
      c.fillStyle = active ? S.ink : rgba(S.ink, 0.09); c.fillRect(x + 1, y + 1, w - 2, 40);
      c.fillStyle = rgba(S.ink, 0.6); c.fillRect(x + 1, y + 41, w - 2, 1);
      text(c, WIN(id), x + 12, y + 22, { size: 22, w: 700, col: active ? S.bg : S.ink, maxW: w - 140 });
      for (let i = 0; i < 3; i++) { const bx = x + w - 30 - i * 26; c.strokeStyle = active ? S.bg : rgba(S.ink, 0.7); c.strokeRect(Math.round(bx) + 0.5, y + 12.5, 16, 16); if (i === 0) { c.beginPath(); c.moveTo(bx + 4, y + 16); c.lineTo(bx + 13, y + 25); c.moveTo(bx + 13, y + 16); c.lineTo(bx + 4, y + 25); c.stroke(); } }
      return [x + 14, y + 54, w - 28, h - 66];
    }
    if (LOOK === 'lab') {
      if (n >= 3) { c.fillStyle = rgba('#000000', S.name === 'ALBEDO' ? 0.12 : 0.4); c.fillRect(x + 6, y + 6, w, h); c.fillStyle = S.card; c.fillRect(x, y, w, h); }
      c.strokeStyle = rgba(S.ink, 0.55); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); if (n >= 2) { c.lineTo(x + w, y + h); c.lineTo(x, y + h); } c.stroke();
      if (n < 3) return null;
      if (S.gloss) lab.gloss(c, x, y, w, h, S, seed);
      lab.graphPaper(c, x + 1, y + 44, w - 2, h - 45, S, 10, 50, 0.8);
      c.fillStyle = active ? rgba(S.hot, S.grey ? 0.16 : 0.2) : rgba(S.ink, 0.05); c.fillRect(x, y, w, 42);
      lab.stencil(c, WIN(id).toUpperCase(), x + 12, y + 22, 22, S.ink);
      if (w > 420) text(c, `${CODE[id]} · ${tag('codes.trial')}`, x + w - 12, y + 22, { size: 22, col: rgba(S.ink, 0.6), align: 'right' });
      c.strokeStyle = rgba(S.system ? S.rule : S.ink, S.system ? 0.9 : 0.4); c.lineWidth = S.system ? 2 : 1; c.beginPath(); c.moveTo(x, y + 42.5); c.lineTo(x + w, y + 42.5); c.stroke(); c.lineWidth = 1;
      return [x + 14, y + 54, w - 28, h - 66];
    }
    // scope: rack module with screws, an engraved plate, a kick LED, the screen inset
    if (n >= 3) { c.fillStyle = S.card; c.fillRect(x, y, w, h); c.fillStyle = rgba(S.ink, 0.05); c.fillRect(x, y, w, 3); c.fillStyle = rgba('#000000', 0.5); c.fillRect(x, y + h - 3, w, 3); }
    c.strokeStyle = rgba(S.ink, 0.45); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); if (n >= 2) { c.lineTo(x + w, y + h); c.lineTo(x, y + h); } c.stroke();
    if (n < 3) return null;
    for (const [sx, sy] of [[x + 14, y + 14], [x + w - 14, y + 14], [x + 14, y + h - 14], [x + w - 14, y + h - 14]]) { c.strokeStyle = rgba(S.ink, 0.5); c.beginPath(); c.arc(sx, sy, 6, 0, 7); c.stroke(); c.beginPath(); c.moveTo(sx - 4, sy + 1.5); c.lineTo(sx + 4, sy - 1.5); c.stroke(); }
    const name = SCOPE_NAMES[id] || id.toUpperCase();
    c.font = `800 22px ${MONO}`; const pw = Math.min(w - 110, c.measureText(name).width + 28);
    c.fillStyle = active ? S.ink : rgba(S.ink, 0.1); c.fillRect(x + 30, y + 8, pw, 32); c.strokeStyle = rgba(S.ink, 0.5); c.strokeRect(x + 30.5, y + 8.5, pw, 32);
    text(c, name, x + 44, y + 25, { size: 22, w: 800, col: active ? S.bg : S.ink, ls: 1, maxW: pw - 26 });
    const led = kickEnv[fidx(t)] > 0.3; c.fillStyle = led ? S.hot : rgba(S.ink, 0.15); c.beginPath(); c.arc(x + w - 40, y + 24, 7, 0, 7); c.fill();
    const sr = [x + 22, y + 50, w - 44, h - 72]; c.fillStyle = mix(S.bg, S.card, 0.4, 1); c.fillRect(sr[0], sr[1], sr[2], sr[3]); c.strokeStyle = rgba(S.ink, 0.3); c.strokeRect(sr[0] + 0.5, sr[1] + 0.5, sr[2], sr[3]);
    return [sr[0] + 10, sr[1] + 10, sr[2] - 20, sr[3] - 20];
  }
  // furniture after the content: tape / staples / basting (lab), corner pins (exe), residue of earlier stages
  function furniture(id, r, t) {
    const [x, y, w, h] = r, seed = hash(id.length * 13.7 + r[0]) * 100;
    if (LOOK === 'lab') {
      if (hash(seed) > 0.4) { lab.tape(c, x + 30, y - 2, 74, 24, -0.5 + hs(seed, 1) * 0.15, S, seed); lab.tape(c, x + w - 30, y + h + 2, 74, 24, -0.6 + hs(seed, 2) * 0.15, S, seed + 4); }
      else lab.staple(c, x + w / 2, y + 2, hs(seed, 3) * 0.06, S);
      if (S.exposed) { lab.basting(c, x, y, w, h, S); }
      if (S.obstruct && (id === 'spectro' || id === 'stereo')) { c.save(); c.translate(x + w * 0.74, y + h * 0.2); c.rotate(0.32); c.fillStyle = rgba(S.tape, 1); c.fillRect(-w * 0.18, -10, w * 0.36, 20); c.restore(); }
    }
    if (S.system) { c.fillStyle = S.rule; c.fillRect(x - 4, y + 54, 4, 34); }
    if (S.residue.includes('brass') && (id === 'session' || id === 'loud' || id === 'chains')) { c.fillStyle = '#b8975a'; c.fillRect(x, y + h - 3, w * 0.4, 3); }
    if (S.residue.includes('ink')) { c.strokeStyle = rgba(S.name === 'ALBEDO' ? '#1a1917' : '#000000', 0.55); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + w * 0.1, y + h + 1.5); c.bezierCurveTo(x + w * 0.4, y + h + 7, x + w * 0.6, y + h - 2, x + w * 0.95, y + h + 4); c.stroke(); c.lineWidth = 1; }
  }

  // ---------------------------------------------------------------- window contents
  function chainsBody(cr, t, k) {
    const [x, y, w, h] = cr; c.save(); c.beginPath(); c.rect(x - 4, y - 4, w + 8, (h + 8) * k); c.clip();
    if (LOOK === 'scope') {   // CRT: graticule 10 x 8 div, the two live traces run behind the logo, triggered on the 16th
      c.strokeStyle = rgba(S.ink, 0.1); for (let i = 0; i <= 10; i++) { const X = Math.round(x + w * i / 10) + 0.5; c.beginPath(); c.moveTo(X, y); c.lineTo(X, y + h - 40); c.stroke(); }
      for (let j = 0; j <= 8; j++) { const Y = Math.round(y + (h - 40) * j / 8) + 0.5; c.beginPath(); c.moveTo(x, Y); c.lineTo(x + w, Y); c.stroke(); }
      M8.trace(c, S, [x, y, w, h - 40], t, { span: BEAT / 4, amp: 0.2, lanes: [[0, 0.3, S.sig1], [1, 0.72, S.sig2]] });
    }
    const s = BR.logo(c, S, [x, y, w, h - (LOOK === 'scope' ? 40 : 34)], t);
    const cb = Math.floor(t / BEAT + 4) % 8, inOut = cb < 4 ? 'chain in' : 'chain out', lt = ['U', '2', 'C', '·'][cb % 4];
    const load = Math.round((s[0] + s[1] + s[2]) / 3 * 100);
    text(c, `> ${inOut} ${lt}  ${String(load).padStart(3, ' ')}%`, x, y + h - 14, { size: 22, w: 700, col: S.ink, maxW: w * 0.6 });
    text(c, LOOK === 'scope' ? `${(BEAT * 100 / 4).toFixed(1)} ms/div · trig ${bbt(t)}` : `cycle ${Math.floor(t / (2 * BAR)) + 1} · ${bbt(t)}`, x + w, y + h - 14, { size: 22, col: rgba(S.ink, 0.7), align: 'right', maxW: w * 0.4 });
    c.restore();
  }
  function elephantBody(cr, t, k) {
    const [x, y, w, h] = cr; c.save(); c.beginPath(); c.rect(x - 14, y - 14, w + 28, (h + 28) * k); c.clip();
    const size = Math.min(w * 0.8, (h - 80) / 0.95), ax = x + w / 2 + size * (346 / 700 - 0.5), ay = y + 22;
    const sw = BR.elephant(c, S, ax, ay, size, t);
    // the hand point: a pin through the top of its own chain (lab: tape over it; exe: crosshair; scope: a clamp)
    if (LOOK === 'lab') lab.tape(c, ax, ay - 6, 70, 22, 0.08, S, 77);
    if (LOOK === 'scope') { c.fillStyle = rgba(S.ink, 0.8); c.fillRect(ax - 22, ay - 20, 44, 10); c.fillRect(ax - 3, ay - 12, 6, 12); }
    c.strokeStyle = S.hot; c.lineWidth = 2; c.beginPath(); c.arc(ax, ay, 7, 0, 7); c.stroke(); c.beginPath(); c.moveTo(ax - 14, ay); c.lineTo(ax + 14, ay); c.moveTo(ax, ay - 14); c.lineTo(ax, ay + 14); c.stroke(); c.lineWidth = 1;
    // protractor callout: the amplitude arc (dashed) and the live body angle
    const R = Math.min(170, h * 0.3); c.strokeStyle = rgba(S.ink, 0.5); c.setLineDash([4, 5]); c.beginPath(); c.arc(ax, ay, R, Math.PI / 2 - sw.amp, Math.PI / 2 + sw.amp); c.stroke(); c.setLineDash([]);
    for (const a of [-sw.amp, sw.amp]) { c.strokeStyle = rgba(S.ink, 0.6); c.beginPath(); c.moveTo(ax - Math.sin(a) * (R - 8), ay + Math.cos(a) * (R - 8)); c.lineTo(ax - Math.sin(a) * (R + 8), ay + Math.cos(a) * (R + 8)); c.stroke(); }
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - Math.sin(sw.th) * R * 1.08, ay + Math.cos(sw.th) * R * 1.08); c.strokeStyle = S.hot; c.lineWidth = 2; c.stroke(); c.lineWidth = 1;
    const deg = sw.th * 180 / Math.PI;
    lab.hand(c, tag('notes.elephant', { angle: `${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1)}` }), x + w - 4, y + 44, 34, S.hot, t, 21, -0.03, 'right');
    lab.tag(c, x + 2, y + h - 104, Math.min(300, w * 0.62), tag('specimen').map((s) => s.replace('VERLET · T0 = 2 BEATS', `T = 2 BEATS · ${Math.round(sw.amp * 180 / Math.PI)}°`)), S, -0.04);
    c.restore();
  }
  function body(id, cr, t, k) {
    if (id === 'chains') return chainsBody(cr, t, k);
    if (id === 'elephant') return elephantBody(cr, t, k);
    if (M8[id]) return M8[id](c, S, cr, t, k);
    if (M[id]) return M[id](c, S, cr, t, k);
  }
  function card(id, t) {
    const r = LY[id], n = openStep(id, t); if (n <= 0) return;
    const cr = chrome(id, r, n, t); if (!cr) return;
    const k = n >= 6 ? 1 : n === 5 ? 0.66 : n === 4 ? 0.33 : 0;
    c.save(); c.beginPath(); c.rect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); c.clip();
    if (k > 0) body(id, cr, t, k);
    if (n >= 6) for (const nt of NOTES) if (nt.id === id && t >= T(nt.b)) nt.fn(r, cr, t, steps(t, nt.b, 4, U.s16));
    c.restore();
    if (n >= 6) furniture(id, r, t);
  }
  // exe: dashed elbow wires between windows; one square signal dot steps along each wire on 16ths, lit on kicks
  function wires(t) {
    if (LOOK !== 'exe') return;
    const pairs = port ? [['session', 'chains', 0.3, 0.5], ['chains', 'elephant', 0.5, 0.5], ['eq', 'spectrum', 0.85, 0.85], ['clock', 'bands', 0.5, 0.5]] : [['session', 'chains', 0.3, 0.3], ['chains', 'elephant', 0.9, 0.5]];
    for (const [a, b, fa, fb] of pairs) {
      if (!LY[a] || !LY[b] || openStep(a, t) < 6 || openStep(b, t) < 6) continue;
      const ra = LY[a], rb = LY[b], A0 = [ra[0] + ra[2] * fa, ra[1] + ra[3]], B0 = [rb[0] + rb[2] * fb, rb[1]];
      const vert = Math.abs(A0[0] - B0[0]) < 2, mid = (A0[1] + B0[1]) / 2, P = vert ? [A0, B0] : [A0, [A0[0], mid], [B0[0], mid], B0];
      c.save(); c.strokeStyle = rgba(S.ink, 0.75); c.setLineDash([6, 5]); c.lineWidth = 1.5; c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); c.setLineDash([]); c.restore();
      for (const p of [A0, B0]) { c.fillStyle = S.bg; c.fillRect(p[0] - 5, p[1] - 5, 10, 10); c.strokeStyle = S.ink; c.strokeRect(p[0] - 4.5, p[1] - 4.5, 9, 9); }
      const seg = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1])), tot = seg.reduce((x, y) => x + y, 0);
      let d = tot * ((Math.floor(t / (BEAT / 4)) % 8) / 7), i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const u = seg[i] ? d / seg[i] : 0, X = lerp(P[i][0], P[i + 1][0], u), Y = lerp(P[i][1], P[i + 1][1], u), lit = kickEnv[fidx(t)] > 0.3;
      c.fillStyle = lit ? S.hot : S.ink; c.fillRect(Math.round(X) - (lit ? 7 : 5), Math.round(Y) - (lit ? 7 : 5), lit ? 14 : 10, lit ? 14 : 10);
    }
  }
  // attention bracket: four L corners around the window this beat is about + a mono reason label
  function bracket(t) {
    if (t < BEAT || t >= T(resultBar * 4)) return;
    const id = attention(t), r = LY[id]; if (!r) return;
    const [x, y, w, h] = r, g = 10, L0 = 34; c.strokeStyle = S.hot; c.lineWidth = 3; c.beginPath();
    for (const [px, py, sx, sy] of [[x - g, y - g, 1, 1], [x + w + g, y - g, -1, 1], [x - g, y + h + g, 1, -1], [x + w + g, y + h + g, -1, -1]]) { c.moveTo(px + sx * L0, py); c.lineTo(px, py); c.lineTo(px, py + sy * L0); }
    c.stroke(); c.lineWidth = 1;
  }

  // ---------------------------------------------------------------- overlays: boot terminal, result card, HUD, textures
  const BOOT = tag('boot');
  const bootAt = (i) => (i === 0 ? -1 : i * 0.75);
  BOOT.forEach((l, i) => { if (i) ev(bootAt(i), `boot line ${i + 1}`); });
  ev(4, 'boot terminal closes (hard)');
  function boot(t) {
    if (t >= BAR) return;
    // the terminal parks over the column whose meters are still stepping in, never over the logo or the pendant
    const TR = port ? { exe: [548, 930, 516, 300], lab: [16, 930, 560, 300], scope: [502, 880, 562, 300] }[LOOK] : [W * 0.56, H * 0.36, 760, 0];
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
  const resultBar = NB - (NB >= 8 ? 2 : 1);
  ev(resultBar * 4, 'result card');
  for (let q = 1; q < 6; q++) ev(resultBar * 4 + q * 0.5, `result line ${q + 1}`);
  function result(t) {
    if (t < T(resultBar * 4)) return;
    const n = steps(t, resultBar * 4, 6, 0.5), R = (p) => tag('result.' + p);
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
    const hv = { tc: tc(t), bbt: bbt(t), songBar: String(D.song.startBar + Math.floor(t / BAR)) };
    const top = port ? 40 : 34, bot = H - (port ? 40 : 30), m = 24;
    if (LOOK === 'exe') { c.fillStyle = rgba(S.ink, 0.08); c.fillRect(0, 0, W, 72); c.fillRect(0, H - 72, W, 72); c.fillStyle = rgba(S.ink, 0.5); c.fillRect(0, 72, W, 1); c.fillRect(0, H - 73, W, 1); }
    if (LOOK === 'scope') { c.fillStyle = rgba(S.ink, 0.06); c.fillRect(0, 0, W, 72); c.fillRect(0, H - 72, W, 72); c.strokeStyle = rgba(S.ink, 0.4); c.strokeRect(8.5, 8.5, W - 17, 56); c.strokeRect(8.5, H - 64.5, W - 17, 56); }
    // left: the full title (never cut); a narrower font before anything is dropped
    const left = LOOK === 'scope' ? `${tag('title')} · SCOPE` : tag('hud.left', hv);
    if (LOOK === 'lab') lab.stencil(c, left, m, top, 24, S.ink); else text(c, left, m, top, { size: 24, w: 800, col: S.ink, ls: 1, maxW: W * 0.62 });
    c.fillStyle = S.hot; c.fillRect(W - m - 250, top - 7, 14, 14);
    text(c, tag('hud.rec', hv), W - m, top, { size: 24, w: 700, col: S.ink, align: 'right' });
    text(c, tag('hud.bottomLeft', hv), m, bot, { size: 22, col: rgba(S.ink, 0.85), w: 500 });
    text(c, tag('hud.bottomRight', hv), W - m, bot, { size: 22, col: rgba(S.ink, 0.85), align: 'right', w: 500 });
    if (LOOK !== 'scope') text(c, LOOK === 'exe' ? `${tag('title')}` : `${tag('title')} · ${D.key}`, W / 2, bot, { size: 22, w: 700, col: S.ink, align: 'center', maxW: W * 0.34 });
    else text(c, `${D.key} · ${Math.round(D.bpm)}`, W / 2, bot, { size: 22, w: 700, col: S.ink, align: 'center' });
  }
  const grain = [];
  for (let q = 0; q < 4; q++) { const g = document.createElement('canvas'); g.width = g.height = 256; const gx = g.getContext('2d'), im = gx.createImageData(256, 256); for (let i = 0; i < 65536; i++) { const v = hash(i * 1.37 + q * 9173.1) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } gx.putImageData(im, 0, 0); grain.push(g); }
  function textures(t) {
    const f = fidx(t), g = grain[Math.floor(t / T(U.s16)) % 4];
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = S.grain * 0.8; const ox = (hash(f * 3.1) * 256) | 0, oy = (hash(f * 7.7) * 256) | 0;
    for (let yy = -oy; yy < H; yy += 256) for (let xx = -ox; xx < W; xx += 256) c.drawImage(g, xx, yy); c.restore();
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${S.vignette * 0.7})`); c.fillStyle = v; c.fillRect(0, 0, W, H);
  }
  function ground() {
    c.fillStyle = S.paper; c.fillRect(-W, -H, 3 * W, 3 * H);
    if (LOOK === 'lab') lab.graphPaper(c, 0, 0, W, H, S, 20, 100, 1);
    else if (LOOK === 'exe') { c.fillStyle = rgba(S.ink, 0.13); for (let y = 30; y < H; y += 40) for (let x = 20; x < W; x += 40) c.fillRect(x, y, 2, 2); }
    else { c.fillStyle = rgba(S.ink, 0.05); for (let y = 0; y < H; y += 6) c.fillRect(0, y, W, 1); }
  }

  // ---------------------------------------------------------------- the pendant test (4 bars, pendant alone)
  function testPendant(t) {
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H);
    const size = W * 0.8, ax = W / 2 + size * (346 / 700 - 0.5), ay = H * 0.18;
    BR.elephant(c, S, ax, ay, size, t);
    const b = t / BEAT; c.fillStyle = S.ink;
    text(c, `beat ${Math.floor(b) + 1}  bar ${Math.floor(b / 4) + 1}.${(Math.floor(b) % 4) + 1}`, 40, 60, { size: 30, col: S.ink });
    text(c, `θ ${(BR.swing(t).th * 180 / Math.PI).toFixed(2)}°`, W - 40, 60, { size: 30, col: S.ink, align: 'right' });
    for (let i = 0; i < 4; i++) { c.fillStyle = Math.floor(b) % 4 === i ? S.ink : rgba(S.ink, 0.2); c.fillRect(40 + i * 40, 100, 30, 30); }
  }

  // ---------------------------------------------------------------- frame
  let ready = false, pending = 0;
  function renderAt(t) {
    if (!ready) { pending = t; return; }
    t = clamp(t, 0, D.duration - 1 / FPS) + 0.5 / FPS;   // sample at the frame centre: grid events land on their nearest frame
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (TEST === 'pendant') { L.view.camZ = 1; return testPendant(t); }
    camTL.seek(t, false);
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H);
    const z = cam.z; L.view.camZ = z;
    c.setTransform(z, 0, 0, z, W / 2 - cam.x * z, H / 2 - cam.y * z);
    ground();
    for (const id of IDS) card(id, t);
    wires(t);
    if (z < 1.05) bracket(t);
    c.setTransform(1, 0, 0, 1, 0, 0); L.view.camZ = 1;
    boot(t); result(t); hud(t); textures(t);
    if (fidx(t) === fidx(T(dropBar * 4))) { c.globalCompositeOperation = 'difference'; c.fillStyle = S.grey ? '#ffffff' : S.ink; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
  }
  const build = (async () => {
    await BR.load(S); BR.pendulum(S);
    await Promise.all([`800 22px ${MONO}`, `700 22px ${MONO}`, `500 22px ${MONO}`, `400 22px ${MONO}`, `600 22px ${SANS}`, `italic 400 40px ${SERIF}`, `700 24px ${HAND}`].map((f) => document.fonts.load(f, 'EXP-03 Atelmansion 0123456789')));
    for (const [b, w] of BR.logoEvents(NB)) ev(b, w);
    ready = true; renderAt(pending);
  })();
  window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {}; window.__hf.buildReady.u2c6 = build;
  window.addEventListener('hf-seek', (e) => renderAt(e.detail.time));
  const tl = gsap.timeline({ paused: true }); tl.to({}, { duration: D.duration });
  window.__timelines = window.__timelines || {}; window.__timelines.main = tl;
  const trace = (t) => { t = t + 0.5 / FPS; const size = W * 0.8, ax = W / 2 + size * (346 / 700 - 0.5), ay = H * 0.18; return BR.tracePts(ax, ay, size, t); };
  window.U2C6 = { renderAt, ready: build, schedule: () => SCHED.slice().sort((a, b) => a.t - b.t), shots: SHOTS, stage: S.name, trace };
})();
