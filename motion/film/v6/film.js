/* THE LABORATORY: composition. Layout per aspect, lab cards, the shot plan (built from the song structure and the
 * clip length), camera (GSAP timeline keyed in beats), stage behaviour, boot typing, result card, HUD.
 * Config comes from <html data-stage data-aspect>. Exposes window.U2C6 {renderAt, ready, schedule}. */
(function () {
  'use strict';
  const L = window.L6, { D, F, FPS, BEAT, BAR, T, U, ev, SCHED, steps, on, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, hs, hash, kickEnv, labelAt, SANS, MONO, SERIF, HAND } = L;
  const lab = L.lab, M = L.M, BR = L.B;
  const html = document.documentElement;
  const ASPECT = html.dataset.aspect || '916', S = L.STAGES[(html.dataset.stage || 'nigredo').toLowerCase()];
  const canvas = document.getElementById('stage'), ctx = canvas.getContext('2d');
  const NB = D.bars;

  // ---------------------------------------------------------------- layout (world px)
  const LAYOUT = {
    '916': { W: 1080, H: 1920, cards: {
      session: [36, 96, 1008, 430], chains: [36, 552, 640, 372], clock: [696, 552, 348, 176], balance: [696, 748, 348, 176],
      elephant: [36, 950, 520, 590], spectrum: [576, 950, 468, 282], spectro: [576, 1258, 468, 282],
      levels: [36, 1566, 336, 318], gonio: [392, 1566, 316, 318], bands: [728, 1566, 316, 318] } },
    '169': { W: 1920, H: 1080, cards: {
      session: [32, 84, 1180, 340], chains: [32, 444, 700, 360], clock: [752, 444, 460, 172], balance: [752, 632, 460, 172],
      elephant: [1232, 84, 656, 720], spectrum: [32, 824, 450, 236], spectro: [502, 824, 450, 236], levels: [972, 824, 300, 236],
      gonio: [1292, 824, 284, 236], bands: [1596, 824, 292, 236] } },
  };
  const LY = LAYOUT[ASPECT], W = LY.W, H = LY.H; canvas.width = W; canvas.height = H;
  // card meta: stencil title, specimen code, component
  const CARD = {
    session: ['SESSION.EXE', 'SPC-01', 'session'], chains: ['CHAINS.DLL', 'SPC-02', null], clock: ['CLOCK.SYS', 'SPC-03', 'clock'],
    balance: ['BALANCE.VST', 'SPC-04', 'balance'], elephant: ['ELEPHANT.SYS', 'SPC-05', null], spectrum: ['SPECTRUM.VST', 'SPC-06', 'spectrum'],
    spectro: ['SPECTROGRAM', 'SPC-07', 'spectro'], levels: ['LOUDNESS.EXE', 'SPC-08', 'levels'], gonio: ['GONIO.SCOPE', 'SPC-09', 'gonio'], bands: ['BANDS.DAT', 'SPC-10', 'bandsCard'],
  };
  M.bandsCard = (c, S_, r, t, k) => {   // per-band energy columns + onset counters
    const [x, y, w, h] = r; c.save(); c.beginPath(); c.rect(x - 2, y - 2, w + 4, (h + 4) * k); c.clip();
    const be = F.bands[fidx(t)], n = be.length, bw = w / n, bh = h - 64;
    D.bandNames.forEach((nm, i) => {
      const X = x + i * bw + 4, v = clamp(be[i]);
      c.fillStyle = rgba(S_.ink, 0.07); c.fillRect(X, y, bw - 8, bh);
      for (let yy = y + bh; yy > y + bh * (1 - v); yy -= 5) { c.fillStyle = mix(S_.sig1, S_.sig2, i / (n - 1), 1); c.fillRect(X, Math.max(y + bh * (1 - v), yy - 4), bw - 8, Math.min(4, yy - (y + bh * (1 - v)))); }
      text(c, nm, X + (bw - 8) / 2, y + bh + 10, { size: 8, col: rgba(S_.ink, 0.6), align: 'center', w: 700 });
      text(c, v.toFixed(2), X + (bw - 8) / 2, y + bh + 24, { size: 10, col: S_.ink, align: 'center' });
    });
    const cnt = (kind) => D.onsets[kind].filter((o) => o[2] <= t).length;
    text(c, `KICK ${String(cnt('kick')).padStart(3, '0')}  SNR ${String(cnt('snare')).padStart(3, '0')}  HAT ${String(cnt('hat')).padStart(3, '0')}`, x, y + h - 8, { size: 10, w: 700, col: S_.ink, ls: 0.5 });
    c.restore();
  };

  // ---------------------------------------------------------------- the plan (in bars), driven by length + structure
  const isDrop = (i) => labelAt(i) === 'drop';
  function plan() {
    const shots = [];
    const push = (bar, len, kind, cut = true) => shots.push({ bar, len, kind, cut });
    push(0, 1, 'boot');
    let i = 1; const end = NB - (NB >= 16 ? 2 : 1);
    const dropPool = ['wide', 'spec', 'elephant', 'meters', 'logo', 'detail', 'clock', 'elephant', 'all', 'meters', 'spec'];
    const calmPool = ['elephant', 'logo', 'detail', 'notes'];
    let dp = 0, cp = 0;
    while (i < end) {
      const drop = isDrop(i);
      let kind = drop ? dropPool[dp++ % dropPool.length] : calmPool[cp++ % calmPool.length];
      if (S.embodied && (kind === 'clock' || kind === 'all') && i > 2) kind = 'elephant';      // RUBEDO: proximity, the body
      if (S.exposed && kind === 'detail') kind = 'all';                                       // ALBEDO: show the construction
      let len = kind === 'logo' || kind === 'wide' ? 1 : 2;
      if (S.obstruct) len = Math.min(len, 1) || 1;                                           // NIGREDO: compressed, one bar per shot
      if (i + len > end) len = end - i;
      push(i, len, kind, drop || i === 1); i += len;
    }
    push(end, NB - end, 'end', true);
    return shots;
  }
  const SHOTS = plan();

  // ---------------------------------------------------------------- camera keys
  function rectOf(ids) { const rs = ids.map((id) => LY.cards[id]); const x0 = Math.min(...rs.map((r) => r[0])), y0 = Math.min(...rs.map((r) => r[1])); return [x0, y0, Math.max(...rs.map((r) => r[0] + r[2])) - x0, Math.max(...rs.map((r) => r[1] + r[3])) - y0]; }
  function frame(ids, pad = 24, z = 1, dx = 0, dy = 0) { const [x, y, w, h] = ids === 'all' ? [0, 0, W, H] : rectOf(ids); return { x: x + w / 2 + dx, y: y + h / 2 + dy, z: Math.min(W / (w + 2 * pad), H / (h + 2 * pad)) * z }; }
  const port = ASPECT === '916';
  const TARGET = {
    boot: () => frame(['chains'], 0, port ? 1.18 : 0.95, 0, port ? 70 : 40),
    wide: () => (port ? frame('all', 0, 1) : frame(['session', 'chains'], 20, 1)),
    spec: () => frame(['spectrum', 'spectro'], 22, 1),
    elephant: () => frame(['elephant'], port ? 20 : 30, 1, 0, 20),
    meters: () => frame(['levels', 'gonio', 'bands'], 20, 1),
    logo: () => frame(['chains'], 0, port ? 1.12 : 1, 0, 0),
    detail: () => frame(['session'], 0, port ? 1.55 : 1.25, port ? -150 : -200, 40),
    clock: () => frame(['clock', 'balance'], 18, 1),
    notes: () => frame(['elephant', 'chains'], 20, 1),
    all: () => frame('all', 0, 1),
    end: () => frame('all', 0, 1.03),
  };
  const cam = { x: W / 2, y: H / 2, z: 1 };
  const camTL = gsap.timeline({ paused: true });
  SHOTS.forEach((s, idx) => {
    const b0 = s.bar * 4, b1 = (s.bar + s.len) * 4;
    const base = TARGET[s.kind](), zf = S.zoom * (S.exposed ? 0.94 : 1);
    const a = { ...base, z: base.z * zf };
    // in-shot move: slow push (NIGREDO shallow, CITRINITAS directional pan, RUBEDO closer)
    const pushZ = S.obstruct ? 1.03 : S.embodied ? 1.09 : 1.06;
    const panX = S.system ? 40 : 0;
    const bEnd = { x: a.x + panX, y: a.y, z: a.z * pushZ };
    if (s.cut || idx === 0) { ev(b0, `cut → ${s.kind}`); camTL.set(cam, a, T(b0)); }
    else { ev(b0 - 1, `glide start → ${s.kind}`); ev(b0, `glide land ${s.kind}`); camTL.to(cam, { ...a, duration: T(1), ease: S.embodied ? 'power3.out' : 'power2.inOut' }, T(b0 - 1)); }
    camTL.to(cam, { ...bEnd, duration: T(b1 - b0), ease: 'sine.inOut' }, T(b0));
  });
  camTL.seek(0);

  // ---------------------------------------------------------------- card open schedule (stepped, on the grid)
  const OPEN = {}; const order = ['session', 'clock', 'balance', 'elephant', 'spectrum', 'spectro', 'levels', 'gonio', 'bands'];
  OPEN.chains = -2;   // already on the bench at frame 0 (frame 0 is fully drawn)
  order.forEach((id, i) => { OPEN[id] = 4 + i * 0.5; ev(OPEN[id], `open ${id}`); });
  // 6 steps per card on 32nds: outline (2 steps), header, content 1/3, 2/3, full
  const openStep = (id, t) => steps(t, OPEN[id], 6, U.t32);
  for (const id of Object.keys(OPEN)) if (OPEN[id] >= 0) for (let q = 1; q < 6; q++) ev(OPEN[id] + q * U.t32, `open ${id} step ${q + 1}`);

  // ---------------------------------------------------------------- annotations (handwritten), each pinned to a bar
  const NOTES = [];
  function note(bar, id, fn) { if (bar < NB) { NOTES.push({ b: bar * 4 + 1, id, fn }); ev(bar * 4 + 1, `note ${id}`); } }
  note(2, 'levels', (c, r, t, n) => { lab.crossed(c, 'SRC −10.7 LUFS', r[0] + 12, r[1] + r[3] + 22, S, 14); lab.hand(c, '→ −14.0 ✓ mastered', r[0] + 140, r[1] + r[3] + 28, 24, S.hot, t, 11); });
  note(3, 'spectrum', (c, r, t, n) => { const x = r[0] + 60, y = r[1] + 120; lab.arrow(c, [[x + 110, y - 60], [x + 50, y - 40], [x + 12, y]], rgba(S.hot, 1), t, 5, n); lab.hand(c, '808 lives here', x + 100, y - 66, 24, S.hot, t, 6); });
  note(4, 'session', (c, r, t, n) => { lab.ring(c, r[0] + r[2] * 0.62, r[1] + 58, r[2] * 0.2, 26, rgba(S.hot, 0.95), t, 9, n); lab.hand(c, 'DROP A — we are here', r[0] + r[2] * 0.62, r[1] + 22, 26, S.hot, t, 10, -0.02, 'center'); });
  note(5, 'gonio', (c, r, t, n) => { lab.hand(c, 'corr > 0 ✓ mono-safe', r[0] + 10, r[1] + r[3] + 30, 24, S.hot, t, 12); });
  note(6, 'clock', (c, r, t, n) => { lab.stamp(c, ['TRIAL 128', 'GRID LOCKED'], r[0] + r[2] - 90, r[1] + r[3] - 30, -0.12, S.stamp, 13); });
  note(7, 'balance', (c, r, t, n) => { lab.hand(c, 'vs pink: warm low end', r[0] + 10, r[1] + r[3] + 30, 24, S.hot, t, 13); });

  // ---------------------------------------------------------------- lab card
  function card(id, t) {
    const r = LY.cards[id], n = openStep(id, t); if (n <= 0) return;
    const [x, y, w, h] = r, seed = hash(id.length * 13.7 + r[0]) * 100;
    const [title, code, comp] = CARD[id];
    // hard offset shadow (paper on the bench)
    if (n >= 3) { c.fillStyle = rgba('#000000', S.name === 'ALBEDO' ? 0.12 : 0.35); c.fillRect(x + 6, y + 6, w, h); c.fillStyle = S.card; c.fillRect(x, y, w, h); }
    // outline: two steps (top+left, then all)
    c.strokeStyle = rgba(S.ink, 0.55); c.lineWidth = 1; c.beginPath();
    c.moveTo(x, y + h); c.lineTo(x, y); c.lineTo(x + w, y); if (n >= 2) { c.lineTo(x + w, y + h); c.lineTo(x, y + h); } c.stroke();
    if (n < 3) return;
    if (S.gloss) lab.gloss(c, x, y, w, h, S, seed);
    if (S.system) { const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, rgba('#e8b85a', 0.07)); g.addColorStop(1, rgba('#e8b85a', 0)); c.fillStyle = g; c.fillRect(x, y, w, h); }
    lab.graphPaper(c, x + 1, y + 34, w - 2, h - 35, S, 8, 40, 0.8);
    // header: stencil title + specimen code + trial
    c.fillStyle = rgba(S.ink, S.name === 'ALBEDO' ? 0.06 : 0.04); c.fillRect(x, y, w, 30);
    lab.stencil(c, title, x + 10, y + 16, 14, S.ink);
    text(c, `${code} · EXP-03 · T${Math.round(D.bpm)}`, x + w - 10, y + 16, { size: 10, col: rgba(S.ink, 0.6), align: 'right', ls: 1 });
    c.strokeStyle = rgba(S.system ? S.rule : S.ink, S.system ? 0.9 : 0.35); c.lineWidth = S.system ? 2 : 1; c.beginPath(); c.moveTo(x, y + 30.5); c.lineTo(x + w, y + 30.5); c.stroke(); c.lineWidth = 1;
    // content
    const k = n >= 6 ? 1 : n === 5 ? 0.66 : n === 4 ? 0.33 : 0;
    const cr = [x + 14, y + 44, w - 28, h - 56];
    c.save(); c.beginPath(); c.rect(x + 1, y + 31, w - 2, h - 32); c.clip();
    if (k > 0) {
      if (comp) M[comp](c, S, cr, t, k);
      else if (id === 'chains') chainsCard(cr, t, k);
      else if (id === 'elephant') elephantCard(r, cr, t, k);
    }
    c.restore();
    // stage furniture (residue of earlier stages stays visible)
    if (n >= 6) {
      const tapeIt = hash(seed) > 0.35;
      if (tapeIt) { lab.tape(c, x + 18, y - 2, 64, 20, -0.5 + hs(seed, 1) * 0.15, S, seed); lab.tape(c, x + w - 18, y + h + 2, 64, 20, -0.6 + hs(seed, 2) * 0.15, S, seed + 4); }
      else lab.staple(c, x + w / 2, y + 2, hs(seed, 3) * 0.06, S);
      if (S.exposed) { lab.basting(c, x, y, w, h, S); lab.cropMarks(c, x - 14, y - 14, w + 28, h + 28, rgba('#1a1917', 0.6)); text(c, `L${(hash(seed) * 3 + 1) | 0} · ${['FRAME', 'SIGNAL', 'INK'][(hash(seed) * 3) | 0]}`, x + 4, y + h + 14, { size: 10, w: 700, col: rgba('#1a1917', 0.75), ls: 1.5 }); }
      if (S.system) { c.fillStyle = S.rule; c.fillRect(x - 22, y + 40, 22, 30); text(c, code.slice(-2), x - 11, y + 55, { size: 12, w: 800, col: S.bg, align: 'center' }); }
      if (S.obstruct && (id === 'spectro' || id === 'balance' || id === 'gonio')) { c.save(); c.translate(x + w * 0.72, y + h * 0.18); c.rotate(0.32); c.fillStyle = S.tape; c.fillRect(-w * 0.2, -9, w * 0.4, 18); c.restore(); }
      if (S.residue.includes('ink')) { c.strokeStyle = rgba(S.name === 'ALBEDO' ? '#1a1917' : '#000000', S.name === 'ALBEDO' ? 0.5 : 0.6); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + w * 0.1, y + h + 1.5); c.bezierCurveTo(x + w * 0.4, y + h + 7, x + w * 0.6, y + h - 2, x + w * 0.95, y + h + 4); c.stroke(); c.lineWidth = 1; }
      if (S.residue.includes('brass') && (id === 'session' || id === 'levels')) { c.fillStyle = '#b8975a'; c.fillRect(x, y + h - 3, w * 0.4, 3); }
    }
    // annotations for this card (pen draw-on in 4 steps on 16ths)
    for (const nt of NOTES) if (nt.id === id && t >= T(nt.b)) nt.fn(c, r, t, steps(t, nt.b, 4, U.s16));
  }
  let c = ctx;

  function chainsCard(cr, t, k) {
    const [x, y, w, h] = cr; c.save(); c.beginPath(); c.rect(x - 4, y - 4, w + 8, (h + 8) * k); c.clip();
    const s = BR.logo(c, S, [x, y, w, h - 10], t);
    const cb = Math.floor(t / BEAT) % 8;
    text(c, `CHAIN ${cb < 4 ? 'IN ' : 'OUT'} ${['U', '2', 'C', '·'][cb % 4]}   LOADED ${String(Math.round((s[0] + s[1] + s[2]) / 3 * 100)).padStart(3, ' ')}%`, x, y + h - 2, { size: 11, w: 700, col: rgba(S.ink, 0.8), ls: 0.6 });
    text(c, `CYCLE 2 BARS · ${Math.floor(t / (2 * BAR)) + 1}`, x + w, y + h - 2, { size: 11, col: rgba(S.ink, 0.6), align: 'right' });
    c.restore();
  }
  function elephantCard(r, cr, t, k) {
    const [x, y, w, h] = cr; c.save(); c.beginPath(); c.rect(x - 14, y - 14, w + 28, (h + 28) * k); c.clip();
    const ax = x + w * 0.56, ay = y + 8, size = w * (port ? 0.98 : 0.86);
    const sw = BR.elephant(c, S, ax, ay, size, t);
    // pin + tape at the top of its own chain
    lab.tape(c, ax, ay - 4, 54, 16, 0.08, S, 77); c.fillStyle = S.hot; c.beginPath(); c.arc(ax, ay, 4, 0, 7); c.fill();
    // protractor callout: the measured swing angle
    const R = Math.min(130, h * 0.24); c.strokeStyle = rgba(S.ink, 0.5); c.setLineDash([3, 4]); c.beginPath(); c.arc(ax, ay, R, Math.PI / 2 - sw.amp * 1.3, Math.PI / 2 + sw.amp * 1.3); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax - Math.sin(sw.th) * R * 1.05, ay + Math.cos(sw.th) * R * 1.05); c.strokeStyle = rgba(S.hot, 0.9); c.stroke();
    const deg = sw.th * 180 / Math.PI;
    lab.hand(c, `θ = ${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1)}°`, x + w - 8, y + 34, 30, S.hot, t, 21, -0.03, 'right');
    lab.arrow(c, [[x + w - 70, y + 44], [ax + 60, y + 50], [ax + 14, ay + R * 0.5]], rgba(S.hot, 0.9), t, 22, 4, 1.8);
    lab.tag(c, x + 4, y + h - 64, 178, ['SPECIMEN 05', `ELEPHANT · ${S.name}`, `SWING ${S.swing.toFixed(1)}° / ${S.embodied ? 2 : 1} BAR`], S, -0.04);
    c.restore();
  }

  // ---------------------------------------------------------------- overlays: boot typing, result card, HUD
  const BOOT = ['> U2C.EXE  // LAB MODE', `> load EXP-03 "${D.title}"`, `> trial ${D.bpm.toFixed(2)} BPM · ${D.key}`, `> stage ${S.n}: ${S.name}`, '> run_'];
  const bootAt = (i) => (i === 0 ? -1 : i * 0.75);   // line 1 is already typed at frame 0
  BOOT.forEach((l, i) => { if (i) ev(bootAt(i), `boot line ${i + 1}`); });
  function boot(t) {
    if (t >= BAR) return;       // hard cut at bar 2
    const bw = port ? 760 : 700, bh = BOOT.length * (port ? 40 : 34) + 50, x = (W - bw) / 2, y = port ? H * 0.64 : H * 0.62;
    c.fillStyle = rgba(S.bg, 0.94); c.fillRect(x, y, bw, bh); c.strokeStyle = rgba(S.ink, 0.6); c.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
    lab.stencil(c, 'TERMINAL · EXP-03', x + 14, y + 18, 13, S.ink);
    BOOT.forEach((line, i) => {
      const b0 = bootAt(i); if (t < T(b0)) return;
      const nch = Math.min(line.length, Math.floor((t - T(b0)) / T(1 / 16)) + 1);   // one character per 64th note
      text(c, line.slice(0, nch), x + 16, y + 52 + i * (port ? 40 : 34), { size: port ? 26 : 22, w: i === 4 ? 700 : 400, col: i === 4 ? S.hot : S.ink });
    });
  }
  function result(t) {
    const sb = SHOTS[SHOTS.length - 1].bar * 4; if (t < T(sb)) return;
    const n = steps(t, sb, 6, 0.5);    // one line per 8th note
    const cw = port ? 820 : 900, ch = port ? 640 : 560, x = (W - cw) / 2, y = port ? 470 : (H - ch) / 2;
    c.fillStyle = rgba(S.bg, 0.96); c.fillRect(x, y, cw, ch); c.strokeStyle = rgba(S.ink, 0.7); c.lineWidth = 1.5; c.strokeRect(x, y, cw, ch); c.lineWidth = 1;
    lab.graphPaper(c, x, y, cw, ch, S, 10, 50, 0.9);
    lab.tape(c, x + 30, y, 90, 24, -0.4, S, 3); lab.tape(c, x + cw - 30, y + ch, 90, 24, -0.4, S, 8);
    if (n >= 1) lab.stencil(c, 'EXP-03 · RESULT', x + 28, y + 40, 20, S.ink);
    if (n >= 1) text(c, `${S.name} · TRIAL ${Math.round(D.bpm)}`, x + cw - 28, y + 40, { size: 14, col: rgba(S.ink, 0.7), align: 'right', ls: 1.5 });
    if (n >= 2) text(c, D.title.charAt(0) + D.title.slice(1).toLowerCase().replace(/(\d)/, ' $1').replace('  ', ' '), x + cw / 2, y + ch * 0.4, { size: port ? 120 : 112, fam: SERIF, style: 'italic', col: S.ink, align: 'center', base: 'alphabetic' });
    if (n >= 3) text(c, `${D.bpm.toFixed(0)} BPM  ·  ${D.key}  ·  4/4`, x + cw / 2, y + ch * 0.53, { size: 26, w: 500, col: S.ink, align: 'center', ls: 4 });
    if (n >= 4) text(c, 'prod. @uche2crazy', x + cw / 2, y + ch * 0.66, { size: 42, fam: SANS, w: 600, col: S.ink, align: 'center', ls: -0.5 });
    if (n >= 5) { lab.stamp(c, ['RESULT: POSITIVE', '13 NOV 2026'], x + cw * 0.74, y + ch * 0.83, -0.14, S.stamp, 15); lab.hand(c, 'full beat → link in bio', x + 40, y + ch * 0.86, 34, S.hot, t, 31); }
    if (n >= 6) text(c, `I ${fmt(D.summary.ffmpeg.I)} LUFS · LRA ${D.summary.ffmpeg.LRA.toFixed(1)} LU · TP ${fmt(D.summary.ffmpeg.TP)} dBTP`, x + 28, y + ch - 22, { size: 12, col: rgba(S.ink, 0.65), ls: 0.5 });
  }
  function hud(t) {
    const m = port ? 50 : 34, top = port ? 132 : 30, bot = port ? H - 132 : H - 30;
    const plate = (x0, y0, w0, h0) => { c.fillStyle = rgba(S.bg, 0.92); c.fillRect(x0, y0, w0, h0); c.strokeStyle = rgba(S.ink, 0.35); c.strokeRect(x0 + 0.5, y0 + 0.5, w0 - 1, h0 - 1); };
    plate(m - 12, top - 18, port ? 250 : 220, 36); plate(W - m - 200, top - 18, 212, 36); plate(m - 12, bot - 16, port ? 300 : 270, 32); plate(W - m - (port ? 188 : 168), bot - 16, port ? 200 : 180, 32);
    lab.stencil(c, `EXP-03 · ${S.name}`, m, top, port ? 16 : 14, S.ink);
    c.fillStyle = S.hot; c.fillRect(W - m - 186, top - 5, 10, 10);
    text(c, `REC ${tc(t)}`, W - m, top, { size: port ? 16 : 14, w: 700, col: S.ink, align: 'right' });
    text(c, `BAR ${bbt(t)} · SONG ${D.song.startBar + Math.floor(t / BAR)}`, m, bot, { size: port ? 14 : 12, col: rgba(S.ink, 0.8), w: 500 });
    text(c, 'prod. @uche2crazy', W - m, bot, { size: port ? 14 : 12, col: rgba(S.ink, 0.8), align: 'right', w: 500 });
  }

  // ---------------------------------------------------------------- textures
  const grain = [];
  for (let q = 0; q < 4; q++) { const g = document.createElement('canvas'); g.width = g.height = 256; const gx = g.getContext('2d'), im = gx.createImageData(256, 256); for (let i = 0; i < 65536; i++) { const v = hash(i * 1.37 + q * 9173.1) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } gx.putImageData(im, 0, 0); grain.push(g); }
  function textures(t) {
    const f = fidx(t), g = grain[Math.floor(t / T(U.s16)) % 4];     // grain re-seeds on the 16th grid
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = S.grain; const ox = (hash(f * 3.1) * 256) | 0, oy = (hash(f * 7.7) * 256) | 0;
    for (let yy = -oy; yy < H; yy += 256) for (let xx = -ox; xx < W; xx += 256) c.drawImage(g, xx, yy); c.restore();
    const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${S.vignette})`); c.fillStyle = v; c.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- frame
  let ready = false, pending = 0;
  function renderAt(t) {
    if (!ready) { pending = t; return; }
    // sample the schedule at the frame's centre: every grid event lands on its NEAREST frame (error <= 1/2 frame);
    // data lookups are unaffected (floor((f + .5) / fps * fps) = f)
    t = clamp(t, 0, D.duration - 1 / FPS) + 0.5 / FPS;
    camTL.seek(t, false);
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H);
    const z = cam.z * (1 + 0.004 * kickEnv[fidx(t)]);
    // keep the view inside the bench (no empty void past the last card) when zoomed in
    const hx = W / (2 * z), hy = H / (2 * z);
    const cx = z >= 1 ? clamp(cam.x, hx, W - hx) : W / 2, cy = z >= 1 ? clamp(cam.y, hy, H - hy) : H / 2;
    c.setTransform(z, 0, 0, z, W / 2 - cx * z, H / 2 - cy * z);
    c.fillStyle = S.paper; c.fillRect(-W, -H, 3 * W, 3 * H);
    lab.graphPaper(c, -W, -H, 3 * W, 3 * H, S, 20, 100, 1);
    for (const id of ['chains', 'session', 'clock', 'balance', 'elephant', 'spectrum', 'spectro', 'levels', 'gonio', 'bands']) card(id, t);
    c.setTransform(1, 0, 0, 1, 0, 0);
    boot(t); result(t); hud(t); textures(t);
  }
  const build = (async () => {
    await BR.load(S);
    await Promise.all([`800 20px ${MONO}`, `700 20px ${MONO}`, `500 20px ${MONO}`, `400 20px ${MONO}`, `600 20px ${SANS}`, `italic 400 40px ${SERIF}`, `700 24px ${HAND}`].map((f) => document.fonts.load(f, 'EXP-03 Atelmansion 0123456789')));
    for (const [b, w] of BR.logoEvents(NB)) ev(b, w);
    ready = true; renderAt(pending);
  })();
  window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {}; window.__hf.buildReady.u2c6 = build;
  window.addEventListener('hf-seek', (e) => renderAt(e.detail.time));
  const tl = gsap.timeline({ paused: true }); tl.to({}, { duration: D.duration });
  window.__timelines = window.__timelines || {}; window.__timelines.main = tl;
  window.U2C6 = { renderAt, ready: build, schedule: () => SCHED.slice().sort((a, b) => a.t - b.t), shots: SHOTS, stage: S.name };
})();
