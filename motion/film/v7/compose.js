/* v7 composition engine (skill: u2c-beat-preview-motion).
 * Static full-screen "screenshot" compositions that HARD-CUT on bar lines. The U2C logo chain is home (>= 50 % of bars);
 * the edit goes home -> one meter (full width, the hero of its shot) -> home -> another meter / the pendant.
 * Per frame: 1 hero, <= 1 secondary, 2-4 micro labels, <= 2 connectors, <= 1 accent element. Two type voices only:
 * display (heavy grotesk, decoded per letter on 16ths) and lowercase mono micro (>= 22 px at 1080 w).
 * Looks: exe (clean OS), lab (lab-notebook ground, specimen layer), scope (one oscilloscope screen).
 * Config: <html data-look data-stage data-aspect>. Exposes window.U2C6 {renderAt, ready, schedule, shots}. */
(function () {
  'use strict';
  const L = window.L6, { D, F, FPS, BEAT, BAR, T, U, ev, SCHED, steps, rgba, text, fmt, tc, bbt, fidx, clamp, hash, hs, kickEnv, labelAt, SANS, MONO, SERIF } = L;
  const M7 = L.M7, M6 = L.M, K = L.K, BR = L.B, lab = L.lab, tag = L.tag;
  const html = document.documentElement;
  const LOOK = (html.dataset.look || 'exe').toLowerCase(), port = (html.dataset.aspect || '916') === '916';
  const S = Object.assign({}, L.STAGES[(html.dataset.stage || 'nigredo').toLowerCase()]);
  S.bandCols = S.grey ? ['#ffffff', '#bdbdbd', '#8a8a8a'] : ({ ALBEDO: ['#1a1917', '#a8432e', '#7d776b'], CITRINITAS: ['#d79a35', '#b8975a', '#ecd9b0'], RUBEDO: ['#a35cf0', '#ff5cc8', '#c79bf0'] })[S.name];
  const canvas = document.getElementById('stage'), c = canvas.getContext('2d');
  const W = port ? 1080 : 1920, H = port ? 1920 : 1080; canvas.width = W; canvas.height = H;
  const ui = port ? 1.55 : 1.25, NB = D.bars;
  // safe cluster: x 12-88 %, y 15-78 % on 9:16
  const SX0 = W * 0.12, SX1 = W * 0.88, SY0 = port ? H * 0.15 : H * 0.1, SY1 = port ? H * 0.78 : H * 0.9, SW = SX1 - SX0;

  // ---------------------------------------------------------------- tag variables
  const titleCase = D.title.split(' ').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  L.tagVars({ title: D.title, Title: titleCase, titleWord: D.title.split(' ')[0], bpm: String(Math.round(D.bpm)), bpm2: D.bpm.toFixed(2), key: D.key,
    keyShort: D.key.replace(' MIN', 'm').replace(' MAJ', ''), stage: S.name, stageN: String(S.n), look: LOOK.toUpperCase(), lufs: fmt(D.summary.ffmpeg.I),
    srcLufs: fmt(D.srcLufs != null ? D.srcLufs : -10.7), lra: D.summary.ffmpeg.LRA.toFixed(1), tp: fmt(D.summary.ffmpeg.TP), bars: String(NB) });
  L.tagVars({ producer: tag('producer'), experiment: tag('experiment'), today: tag('date') });
  L.tagVars({ date: tag('date') });

  // ---------------------------------------------------------------- the edit (bar lines only)
  const METERS = { exe: ['eq', 'loud', 'spectrum', 'stereo', 'wave', 'spectro', 'bands'], lab: ['eq', 'loud', 'wave', 'spectrum', 'stereo', 'spectro', 'bands'], scope: ['scope', 'spectrum', 'stereo', 'spectro', 'surface', 'eq', 'loud'] }[LOOK];
  function plan() {
    const out = [], add = (bar, len, kind) => { out.push({ bar, len, kind }); ev(bar * 4, `cut → ${kind}`); };
    const tail = NB >= 8 ? 2 : 1, endBar = NB - tail;
    add(0, 1, 'boot');
    let mi = 0, hv = 0, slot = 0;
    for (let bar = 1; bar < endBar;) {
      const lb = labelAt(bar), drop = lb === 'drop', len = drop ? 1 : 2, l = Math.min(len, endBar - bar);
      const home = slot % 2 === 0;
      const kind = home ? ['home', 'homeWave', 'home'][hv++ % 3] : (slot % 6 === 5 ? 'elephant' : METERS[mi++ % METERS.length]);
      add(bar, l, kind); bar += l; slot++;
    }
    if (tail === 2) add(endBar, 1, 'result');
    add(NB - 1, 1, tail === 2 ? 'mirror' : 'result');
    return out;
  }
  const SHOTS = plan();
  const shotAt = (t) => { let s = SHOTS[0]; for (const q of SHOTS) if (t >= T(q.bar * 4)) s = q; return s; };

  // ---------------------------------------------------------------- kit
  const MS = 14.5;      // micro size (x ui) -> 22.5 px at 1080 w
  function micro(t, b0, items) {   // typed in at 64ths, staggered by 32nds, all on the grid
    items.forEach(([s, x, y, al], i) => { const nch = Math.min(s.length, Math.max(0, Math.floor((t - T(b0 + 0.125 + i * 0.125)) / T(1 / 16)) + 1)); if (nch > 0) K.micro(c, S, s.slice(0, nch), x, y, ui, { align: al || 'left', size: MS }); });
  }
  // step tag: accent square with a number + hairline box with an UPPERCASE condensed instruction; the underscore blinks hard on the beat
  function stepTag(n, s, x, y, t) {
    const bx = Math.round(x), by = Math.round(y), sz = Math.round(26 * ui);
    c.fillStyle = S.hot; c.fillRect(bx, by, sz, sz);
    text(c, String(n), bx + sz / 2, by + sz / 2 + 1, { size: 15 * ui, w: 800, col: S.bg, align: 'center' });
    const on = Math.floor(t / BEAT) % 2 === 0, str = s + (on ? '_' : ' ');
    c.save(); c.font = `700 ${Math.round(16 * ui)}px ${SANS}`; const tw = c.measureText(str).width * 0.8 + 18 * ui; c.restore();
    c.strokeStyle = rgba(S.ink, 0.8); c.strokeRect(bx + sz + 0.5, by + 0.5, Math.round(tw), sz - 1);
    c.save(); c.translate(bx + sz + 9 * ui, by + sz / 2 + 1); c.scale(0.8, 1); text(c, str, 0, 0, { size: 16 * ui, fam: SANS, w: 700, col: S.ink }); c.restore();
    return [bx + sz + tw, by + sz / 2];
  }
  const handNote = (s, x, y, t, seed, al) => { if (LOOK === 'lab' && s) lab.hand(c, s, x, y, 26 * ui, S.ink, t, seed, -0.03, al || 'left'); };

  // ---------------------------------------------------------------- compositions
  function home(t, b0, variant, quiet) {
    const lw = SW, lh = port ? H * 0.34 : H * 0.5, lx = SX0, ly = port ? H * 0.31 : H * 0.18;
    const s = BR.logo(c, S, [lx, ly, lw, lh], t);
    const cb = Math.floor(t / BEAT) % 8, inOut = (cb + 4) % 8 < 4 ? 'CHAIN IN' : 'CHAIN OUT';
    const ty = port ? H * 0.22 : H * 0.13;
    const [tx2, tyc] = stepTag(((cb + 4) % 4) + 1, inOut, SX0, ty, t);
    K.wire(c, S, [tx2 + 10, tyc], [lx + lw * 0.5, ly + 14], steps(t, b0, 3, U.t32));
    if (variant === 'homeWave') {
      const r = port ? [SX0, H * 0.66, SW, H * 0.11] : [SX0, H * 0.71, SW, H * 0.17];
      c.save(); c.beginPath(); c.rect(r[0] - 2, r[1] - 2, r[2] + 4, r[3] + 4); c.clip();
      if (steps(t, b0, 2, U.t32) >= 2) M7.wave(c, S, r, t, { ui: ui * 0.85, header: false, span: BAR * 2 });
      c.restore();
      micro(t, b0, [[`> ${tag('windows.logo')}`, SX0, ly + lh + 18 * ui], [`// ${bbt(t)}`, SX1, ly + lh + 18 * ui, 'right']]);
    } else if (!quiet) {
      micro(t, b0, [[`> ${tag('windows.logo')}`, SX0, ly + lh + 22 * ui], [`// cycle 2 bars · ${Math.round((s[0] + s[1] + s[2]) / 3 * 100)}%`, SX1, ly + lh + 22 * ui, 'right'], [`${tag('experiment').toLowerCase()} · ${tag('codes.trial').toLowerCase()}`, SX0, ly + lh + 52 * ui]]);
      if (LOOK === 'lab') handNote('U → 2 → C, on the beat', SX1, ly + lh + 60 * ui, t, 41, 'right');
    }
  }
  const METER_WORD = { eq: 'CARVE', loud: '−14', spectrum: 'SPEC', stereo: 'M / S', wave: 'TAPE', spectro: 'TIME', bands: 'BANDS', scope: 'CH1', surface: 'FOLD' };
  function meter(k, t, b0) {
    const fn = { eq: M7.eq, loud: M7.loud, spectrum: M7.spectrum, stereo: M7.stereo, wave: M7.wave, spectro: M7.spectro, bands: M7.bands, scope: M7.scopeTrace, surface: M7.surface }[k];
    const ph = port ? H * (k === 'loud' || k === 'stereo' ? 0.5 : 0.42) : H * 0.62, py = port ? H * 0.47 - ph / 2 + 60 : H * 0.3;
    const r = [SX0, py, SW, ph];
    // hero word above the panel (55-70 % of the width)
    const wordY = port ? py - 40 * ui : H * 0.22, wsize = port ? 235 : 190;
    const ww = K.word(c, S, METER_WORD[k], port ? W / 2 : SX0, wordY, wsize * (METER_WORD[k].length <= 3 ? 1.25 : 1), t, b0, { width: METER_WORD[k].length <= 3 ? 1.1 : 0.9, surgery: true, hollow: k === 'spectro', align: port ? 'center' : 'left', rate: 0.5 });
    if (steps(t, b0, 2, U.t32) >= 2) {
      c.save(); c.beginPath(); c.rect(r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8); c.clip();
      if (LOOK === 'lab') specimenCard(r, k);
      fn(c, S, r, t, { ui: ui * 0.92 });
      c.restore();
      c.strokeStyle = rgba(S.ink, 0.28); c.strokeRect(Math.round(r[0] - 10) + 0.5, Math.round(r[1] - 12) + 0.5, Math.round(r[2] + 20), Math.round(r[3] + 22));
    }
    K.wire(c, S, port ? [W / 2 + ww / 2 + 12, wordY - wsize * 0.3] : [SX0 + ww + 14, wordY - wsize * 0.3], [r[0] + r[2] - 30, r[1] - 12], steps(t, b0 + 0.125, 3, U.t32));
    const notes = { eq: tag('notes.eq'), loud: tag('notes.loud_new'), spectrum: tag('notes.spectrum'), stereo: tag('notes.gonio'), wave: tag('notes.wave'), spectro: '6 s → 12 s history', bands: 'loudest band lit', scope: 'trig on the grid', surface: 'folded light' };
    const by = r[1] + r[3] + 34 * ui;
    micro(t, b0, [[`> ${(notes[k] || '').toLowerCase()}`, SX0, by], [`${tag('experiment').toLowerCase()} // ${S.name.toLowerCase()}`, SX1, by, 'right']]);
    if (LOOK === 'lab' && k === 'loud') { lab.crossed(c, tag('notes.loud_old'), SX0, by + 40 * ui, S, 14 * ui); }
  }
  // LAB: specimen card behind a meter (stencil title, code, tape at two corners)
  function specimenCard(r, k) {
    const [x, y, w, h] = [r[0] - 18, r[1] - 52 * ui, r[2] + 36, r[3] + 70 * ui], seed = k.length * 13.1;
    c.fillStyle = S.card; c.fillRect(x, y, w, h); c.strokeStyle = rgba(S.ink, 0.5); c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    lab.stencil(c, (tag('windows.' + k) || k).toUpperCase(), x + 12 * ui, y + 18 * ui, Math.round(13 * ui), S.ink);
    text(c, `${tag('codes.prefix')}-${String(3 + METERS.indexOf(k)).padStart(2, '0')} · ${tag('codes.trial')}`, x + w - 12 * ui, y + 18 * ui, { size: 10 * ui, col: rgba(S.ink, 0.6), align: 'right', ls: 1 });
    lab.tape(c, x + 30, y, 90, 26, -0.45, S, seed); lab.tape(c, x + w - 30, y + h, 90, 26, -0.5, S, seed + 3);
  }
  // LAB home: a patch bay. The logo is the hero; two small node windows plug hairline cables into chain links,
  // one square signal dot steps along each cable on 16ths.
  function patchBay(t, b0) {
    const lw = SW, lh = port ? H * 0.32 : H * 0.48, lx = SX0, ly = port ? H * 0.33 : H * 0.22;
    BR.logo(c, S, [lx, ly, lw, lh], t);
    const LW = 887, LH = 647, sc = Math.min((lw - 30) / LW, (lh - 40) / LH), ox = lx + lw / 2 - LW * sc / 2, oy = ly + lh / 2 - 8 - LH * sc / 2;
    const anc = window.U2C_LINKS.anchors, A = (i) => [ox + anc[i][1] * sc, oy + anc[i][2] * sc];
    const n1 = port ? [SX0, H * 0.19, W * 0.34, H * 0.1] : [W * 0.06, H * 0.12, W * 0.2, H * 0.22];
    const n2 = port ? [SX1 - W * 0.34, H * 0.68, W * 0.34, H * 0.08] : [W * 0.74, H * 0.66, W * 0.2, H * 0.2];
    const i1 = K.window(c, S, n1, 'in.wav', ui * 0.8, { noQR: true });
    c.save(); c.beginPath(); c.rect(i1[0], i1[1], i1[2], i1[3]); c.clip(); M7.wave(c, S, [i1[0], i1[1] - 18 * ui, i1[2], i1[3] + 18 * ui], t, { ui: ui * 0.6, header: false, span: BAR }); c.restore();
    const i2 = K.window(c, S, n2, 'out.lufs', ui * 0.8, { noQR: true }), tf = M7.tickF(t);
    M7.cells(c, S, i2[0], i2[1], i2[2], i2[3], ui * 0.75, [['lufs', fmt(F.I[tf])], ['tp', fmt(F.TP[tf])]], 0);
    const cab = [[[n1[0] + n1[2] * 0.5, n1[1] + n1[3]], A(2)], [[n2[0] + n2[2] * 0.5, n2[1]], A(40)]];
    cab.forEach(([a, b], i) => {
      K.wire(c, S, a, b, steps(t, b0 + i * 0.125, 3, U.t32), true);
      const u = (Math.floor(t / (BEAT / 4)) % 8) / 8, m = [a[0], b[1]], L1 = Math.abs(m[1] - a[1]), L2 = Math.abs(b[0] - m[0]), d = u * (L1 + L2);
      const p = d < L1 ? [a[0], a[1] + Math.sign(m[1] - a[1]) * d] : [m[0] + Math.sign(b[0] - m[0]) * (d - L1), m[1]];
      c.fillStyle = S.hot; c.fillRect(Math.round(p[0]) - 4, Math.round(p[1]) - 4, 8, 8);
    });
    micro(t, b0, [[`> lab.patch // ${tag('experiment').toLowerCase()}`, SX0, ly + lh + 26 * ui]]);
    handNote('U → 2 → C, on the beat', SX1, port ? n1[1] + n1[3] * 0.6 : n2[1] - 30, t, 41, 'right');
  }
  function pendant(t, b0) {
    const size = port ? W * 0.86 : H * 0.8, ax = W * 0.52, ay = port ? H * 0.16 : H * 0.04;
    const sw = BR.elephant(c, S, ax, ay, size, t);
    const deg = sw.th * 180 / Math.PI, a = `${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1)}`;
    const ly = port ? H * 0.74 : H * 0.88;
    micro(t, b0, [[`> pendant // θ ${a}°`, SX0, ly], ['verlet · t0 = 2 beats', SX1, ly, 'right']]);
    if (LOOK === 'lab') { lab.tag(c, SX0, ly - 150 * ui, 220 * ui, tag('specimen'), S, -0.04); }
  }
  function boot(t, b0, mirror) {
    home(t, b0, 'home', true);
    const lines = tag('boot'), lh = 30 * ui, r = port ? [SX0, H * 0.67, SW, lines.length * lh + 52 * ui] : [W * 0.66, H * 0.6, W * 0.24, lines.length * lh + 52 * ui];
    const ti = K.window(c, S, r, tag('windows.terminal'), ui, { fill: S.bg, noQR: true });
    lines.forEach((line, i) => {
      const lb = (mirror ? b0 : 0) + (i === 0 && !mirror ? -1 : i * 0.75); if (t < T(lb)) return;
      if (i && !mirror) ev(lb, `boot line ${i + 1}`);
      const nch = Math.min(line.length, Math.floor((t - T(lb)) / T(1 / 16)) + 1);
      text(c, line.slice(0, nch).toLowerCase(), ti[0] + 2, ti[1] + 12 * ui + i * lh, { size: MS * ui, w: i === lines.length - 1 ? 700 : 400, col: S.ink });
    });
  }
  function result(t, b0) {
    const n = steps(t, b0, 5, 0.5), cx = W / 2;
    const ty = port ? H * 0.36 : H * 0.36;
    K.word(c, S, tag('result.title').toUpperCase(), cx, ty, port ? 210 : 220, t, b0, { width: port ? 0.5 : 0.78, rate: 0.5 });
    if (n >= 2) K.micro(c, S, tag('result.meta').toLowerCase(), cx, ty + 60 * ui, ui, { align: 'center', size: MS });
    if (n >= 3) text(c, tag('result.producer'), cx, ty + 120 * ui, { size: 24 * ui, fam: MONO, w: 700, col: S.ink, align: 'center', ls: 1 });
    if (n >= 4) stepTag(1, tag('result.cta').toUpperCase().replace('→', '>'), port ? SX0 : W * 0.32, ty + 160 * ui, t);
    if (n >= 5) K.micro(c, S, tag('result.measure').toLowerCase(), cx, port ? H * 0.76 : H * 0.88, ui, { align: 'center', size: 12, a: 0.6 });
    if (LOOK === 'lab' && n >= 4) lab.stamp(c, tag('stamps.result'), port ? W * 0.72 : W * 0.78, ty + 260 * ui, -0.14, S.stamp, 18);
  }
  // SCOPE look: the screen is the hero; its content swaps; cells below (Kollide)
  let contour = null;
  function logoContour() {
    if (contour) return contour; const P = window.U2C_LINKS.pieces, n = 887, top = new Float32Array(n).fill(323), bot = new Float32Array(n).fill(323), has = new Uint8Array(n);
    for (const p of P) for (let x = Math.max(0, Math.floor(p.x)); x < Math.min(n, Math.ceil(p.x + p.w)); x++) { if (!has[x]) { top[x] = p.y; bot[x] = p.y + p.h; has[x] = 1; } else { top[x] = Math.min(top[x], p.y); bot[x] = Math.max(bot[x], p.y + p.h); } }
    const blur = (A) => { for (let pass = 0; pass < 3; pass++) { const cc = Float32Array.from(A); for (let x = 0; x < n; x++) { let s = 0, m = 0; for (let k = Math.max(0, x - 30); k <= Math.min(n - 1, x + 30); k++) { s += cc[k]; m++; } A[x] = s / m; } } };
    blur(top); blur(bot); contour = { top, bot }; return contour;
  }
  function scope(k, t, b0) {
    const scr = port ? [SX0 - 40, H * 0.2, SW + 80, H * 0.46] : [W * 0.1, H * 0.12, W * 0.62, H * 0.7];
    const [x, y, w, h] = scr;
    c.strokeStyle = rgba(S.ink, 0.6); c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    c.strokeStyle = rgba(S.ink, 0.09); for (let i = 1; i < 10; i++) { const X = Math.round(x + w * i / 10) + 0.5; c.beginPath(); c.moveTo(X, y); c.lineTo(X, y + h); c.stroke(); } for (let i = 1; i < 8; i++) { const Y = Math.round(y + h * i / 8) + 0.5; c.beginPath(); c.moveTo(x, Y); c.lineTo(x + w, Y); c.stroke(); }
    const ch = k === 'home' || k === 'homeWave' || k === 'boot' || k === 'mirror' ? 'ch1 ▲ u2c' : k === 'elephant' ? 'ch2 · pendant' : `ch1 · ${tag('windows.' + k) || k}`;
    K.micro(c, S, `${ch} · trig ${bbt(t)}`, x, y - 16 * ui, ui, { size: MS });
    c.save(); c.beginPath(); c.rect(x + 1, y + 1, w - 2, h - 2); c.clip();
    if (['home', 'homeWave', 'boot', 'mirror'].includes(k)) {
      const lr = [x + w * 0.08, y + h * 0.16, w * 0.84, h * 0.68]; BR.logo(c, S, lr, t);
      const C = logoContour(), LW = 887, LH = 647, sc = Math.min((lr[2] - 30) / LW, (lr[3] - 40) / LH), ox = lr[0] + lr[2] / 2 - LW * sc / 2, oy = lr[1] + lr[3] / 2 - 8 - LH * sc / 2, cps = D.wave2.cps;
      for (const [arr, dir] of [[C.top, -1], [C.bot, 1]]) {
        c.beginPath();
        for (let px = 0; px <= w; px += 2) {
          const lx = (x + px - ox) / sc, base = lx >= 0 && lx < LW ? oy + arr[Math.floor(lx)] * sc + dir * 26 * ui : y + h / 2 + dir * 36 * ui;
          const tt = t - BEAT * (1 - px / w), i = clamp(Math.floor(tt * cps), 0, D.wave2.n - 1), amp = tt < 0 ? 0 : L.W2[i * 6 + 2] / 127;
          const yv = base + dir * amp * 70 * ui * (0.55 + 0.45 * Math.sin(px * 0.11 + i * 0.3));
          px ? c.lineTo(x + px, yv) : c.moveTo(x + px, yv);
        }
        c.strokeStyle = rgba(S.ink, 0.12); c.lineWidth = 6; c.stroke(); c.strokeStyle = S.ink; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1;
      }
    } else if (k === 'elephant') BR.elephant(c, S, x + w * 0.5, y + 4, Math.min(w * 0.7, h * 0.85), t);
    else if (k !== 'result') { const fn = { scope: M7.scopeTrace, spectrum: M7.spectrum, stereo: M7.stereo, spectro: M7.spectro, surface: M7.surface, eq: M7.eq, loud: M7.loud }[k]; if (fn && steps(t, b0, 2, U.t32) >= 2) fn(c, S, [x + 14 * ui, y + 14 * ui, w - 28 * ui, h - 28 * ui], t, { ui: ui * 0.9 }); }
    c.restore();
    const tf = M7.tickF(t), cells = [['lufs i', fmt(F.I[tf])], ['lufs s', fmt(F.S[tf])], ['true pk', fmt(F.TP[tf])], ['corr', (F.corr[tf] >= 0 ? '+' : '−') + Math.abs(F.corr[tf]).toFixed(2)]];
    const cr = port ? [x, y + h + 40 * ui, w, 56 * ui] : [W * 0.75, H * 0.12, W * 0.15, H * 0.7];
    if (port) M7.cells(c, S, cr[0], cr[1], cr[2], cr[3], ui, cells, 1);
    else cells.forEach((cl, i) => M7.cells(c, S, cr[0], cr[1] + i * (64 * ui), cr[2], 52 * ui, ui, [cl], i === 0 ? 0 : -1));
    K.word(c, S, D.title.split(' ')[0], port ? W / 2 : W * 0.1, port ? H * 0.16 : H * 0.08, port ? 120 : 70, t, 0, { static: true, width: 0.8, align: port ? 'center' : 'left' });
    if (k === 'boot' || k === 'mirror') { const lines = tag('boot'); lines.forEach((ln, i) => { const lb = (k === 'mirror' ? b0 : 0) + (i === 0 && k === 'boot' ? -1 : i * 0.75); if (t < T(lb)) return; const nch = Math.min(ln.length, Math.floor((t - T(lb)) / T(1 / 16)) + 1); K.micro(c, S, ln.slice(0, nch).toLowerCase(), port ? x : W * 0.1, (port ? y + h + 130 * ui : H * 0.86) + i * 26 * ui, ui, { size: MS }); }); }
    else micro(t, b0, [[k.startsWith('home') ? `> u2c.exe // chain ${(Math.floor(t / BEAT) + 4) % 8 < 4 ? 'in' : 'out'}` : `> ${tag('windows.' + k) || k} // ${S.name.toLowerCase()}`, port ? x : W * 0.1, port ? y + h + 140 * ui : H * 0.9]]);
  }

  function compose(shot, t) {
    const b0 = shot.bar * 4, k = shot.kind;
    if (LOOK === 'scope') { if (k === 'result') return result(t, b0); return scope(k, t, b0); }
    if (k === 'boot') return boot(t, b0, false);
    if (k === 'mirror') return boot(t, b0, true);
    if (k === 'result') return result(t, b0);
    if (k === 'home' || k === 'homeWave') return LOOK === 'lab' ? patchBay(t, b0) : home(t, b0, k);
    if (k === 'elephant') return pendant(t, b0);
    return meter(k, t, b0);
  }

  // ---------------------------------------------------------------- ground, hud, optics
  function ground() {
    c.fillStyle = S.bg; c.fillRect(0, 0, W, H);
    if (LOOK === 'lab') lab.graphPaper(c, 0, 0, W, H, S, 20, 100, 0.55);
  }
  function hud(t) {
    const m = W * 0.06, top = port ? H * 0.075 : H * 0.05, bot = port ? H * 0.82 : H * 0.95;
    K.micro(c, S, tag('hud.left').toLowerCase(), m, top, ui, { size: 12, a: 0.6 });
    K.micro(c, S, tag('hud.rec', { tc: tc(t) }).toLowerCase(), W - m, top, ui, { size: 12, align: 'right', a: 0.6 });
    K.micro(c, S, tag('hud.bottomLeft', { bbt: bbt(t), songBar: String(D.song.startBar + Math.floor(t / BAR)) }).toLowerCase(), m, bot, ui, { size: 12, a: 0.6 });
    K.micro(c, S, tag('hud.bottomRight'), W - m, bot, ui, { size: 12, align: 'right', a: 0.6 });
  }
  const grainT = []; for (let q = 0; q < 4; q++) { const g = document.createElement('canvas'); g.width = g.height = 256; const gx = g.getContext('2d'), im = gx.createImageData(256, 256); for (let i = 0; i < 65536; i++) { const v = hash(i * 1.37 + q * 9173.1) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } gx.putImageData(im, 0, 0); grainT.push(g); }
  function optics(t) {
    const f = fidx(t), g = grainT[Math.floor(t / T(U.s16)) % 4];
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = S.grain * 0.6; const ox = (hash(f * 3.1) * 256) | 0, oy = (hash(f * 7.7) * 256) | 0;
    for (let yy = -oy; yy < H; yy += 256) for (let xx = -ox; xx < W; xx += 256) c.drawImage(g, xx, yy); c.restore();
    if (S.name !== 'ALBEDO') { const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.62); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)'); c.fillStyle = v; c.fillRect(0, 0, W, H); }
  }

  let ready = false, pending = 0;
  function renderAt(t) {
    if (!ready) { pending = t; return; }
    t = clamp(t, 0, D.duration - 1 / FPS) + 0.5 / FPS;     // frame-centre sampling: events land on the nearest frame
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    ground();
    compose(shotAt(t), t);
    hud(t); optics(t);
  }
  const build = (async () => {
    await BR.load(S); BR.simulate(S);
    await Promise.all([`800 20px ${MONO}`, `700 20px ${MONO}`, `500 20px ${MONO}`, `400 20px ${MONO}`, `600 20px ${SANS}`, `700 20px ${SANS}`, '700 24px "Caveat"'].map((f) => document.fonts.load(f, 'EXP-03 Atelmansion 0123456789')));
    for (const [b, w] of BR.logoEvents(NB)) ev(b, w);
    ready = true; renderAt(pending);
  })();
  window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {}; window.__hf.buildReady.u2c7 = build;
  window.addEventListener('hf-seek', (e) => renderAt(e.detail.time));
  const tl = gsap.timeline({ paused: true }); tl.to({}, { duration: D.duration });
  window.__timelines = window.__timelines || {}; window.__timelines.main = tl;
  window.U2C6 = { renderAt, ready: build, schedule: () => SCHED.slice().sort((a, b) => a.t - b.t), shots: SHOTS, stage: S.name, look: LOOK };
})();
