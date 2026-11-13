/* U2C.EXE motion engine — deterministic canvas renderer.
 * Everything drawn is a pure function of (t, variant, aspect, analysis data). No clocks, no unseeded random.
 * Globals: window.U2C_DATA (analysis.js), gsap (lib/gsap.min.js). Exposes window.U2C.
 */
(function () {
  'use strict';
  const D = window.U2C_DATA;
  const FPS = D.fps, NF = D.frames, BEAT = D.beat, BAR = 4 * D.beat;

  // ------------------------------------------------------------------ brand palettes (ONLY these hexes)
  const HEX = {
    char0: '#161616', char1: '#232323', chain: '#c8c8c8',
    rust: '#6e4433', tan: '#c4a57a', ink: '#2a1710',
    ame: '#1d1426', lilac: '#b79ad8', magenta: '#e07ad0', ruby: '#e0475f', gold: '#f2c14e',
  };
  // themes: bg, panel, line (hairlines/text), dim text, accent (signal), hot (playhead/peaks), warm/cool (band colours)
  const THEMES = {
    charcoal: { bg: HEX.char0, panel: HEX.char1, line: HEX.chain, accent: HEX.lilac, hot: HEX.magenta, peak: HEX.gold,
      over: HEX.ruby, warm: HEX.chain, cool: HEX.lilac, logoTint: null, surf: [HEX.char1, HEX.chain, HEX.lilac] },
    rust: { bg: HEX.ink, panel: HEX.rust, line: HEX.tan, accent: HEX.tan, hot: HEX.chain, peak: HEX.chain,
      over: HEX.ruby, warm: HEX.rust, cool: HEX.tan, logoTint: HEX.tan, surf: [HEX.ink, HEX.rust, HEX.tan] },
    amethyst: { bg: HEX.ame, panel: HEX.ame, line: HEX.lilac, accent: HEX.magenta, hot: HEX.gold, peak: HEX.gold,
      over: HEX.ruby, warm: HEX.magenta, cool: HEX.lilac, logoTint: HEX.lilac, surf: [HEX.ame, HEX.lilac, HEX.magenta, HEX.chain] },
  };

  // ------------------------------------------------------------------ math utils
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
  const fidx = (t) => clamp(Math.floor(t * FPS + 1e-6), 0, NF - 1);
  function hash(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function hash2(a, b) { return hash(a * 57.31 + b * 113.97); }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function mix(h1, h2, k) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = [16, 8, 0].map((s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, clamp(k))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function mixA(h1, h2, k, al) { return mix(h1, h2, k).replace('rgb(', 'rgba(').replace(')', `,${al})`); }
  const ease = (name) => gsap.parseEase(name);
  const E = { io: ease('power2.inOut'), out: ease('power3.out'), expo: ease('expo.out'), sine: ease('sine.inOut'), in: ease('power2.in') };
  const SANS = '"Instrument Sans"', MONO = '"JetBrains Mono"', SERIF = '"Instrument Serif"';
  const font = (ctx, px, fam = MONO, w = 400, style = '') => { ctx.font = `${style} ${w} ${px}px ${fam}`; };

  // ------------------------------------------------------------------ audio-derived envelopes (precomputed per frame)
  const env = { kick: new Float32Array(NF), snare: new Float32Array(NF), hat: new Float32Array(NF) };
  const DEC = { kick: 0.16, snare: 0.22, hat: 0.06 };
  for (const k of Object.keys(env)) {
    for (const [t0, s] of D.onsets[k]) {
      for (let f = Math.max(0, Math.ceil(t0 * FPS)); f < NF; f++) {
        const dt = f / FPS - t0; if (dt > 1) break;
        env[k][f] = Math.max(env[k][f], s * Math.exp(-dt / DEC[k]));
      }
    }
  }
  const band = (t, i) => D.frame.bands[fidx(t)][i];
  const lastOnset = (k, t) => { let best = null; for (const o of D.onsets[k]) { if (o[0] <= t + 1e-6) best = o; else break; } return best; };

  // ------------------------------------------------------------------ assets
  const A = { logo: null, edge: null, eleph: null, tinted: {}, loop: null, grain: [], spectro: {} };
  function loadImg(src) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('missing ' + src)); im.src = src; });
  }
  function tintAtlas(img, hex, mode) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    if (hex) {
      g.globalCompositeOperation = mode || 'color'; g.fillStyle = hex; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0);
    }
    return c;
  }
  async function loadAssets(theme) {
    const [logo, edge, eleph, links] = await Promise.all([
      loadImg('assets/brand/u2c-links.png'), loadImg('assets/brand/u2c-links-edge.png'), loadImg('assets/brand/elephant.png'),
      Promise.resolve(window.U2C_LINKS)]);
    A.links = links;
    A.eleph = eleph;
    A.logo = tintAtlas(logo, theme.logoTint, 'color');
    A.edge = tintAtlas(edge, theme.accent, 'source-in');
    // optional AI elephant loop (assets/elephant-loop/), swapped in when tools/sync_elephant_loop.py found frames
    const L = window.U2C_ELEPHANT_LOOP;
    if (L && L.frames && L.frames.length) {
      const imgs = await Promise.all(L.frames.map((f) => loadImg('assets/elephant-loop/' + f)));
      A.loop = { ...L, imgs };
    }
    // grain tiles (seeded)
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      const im = g.createImageData(256, 256);
      for (let i = 0; i < 256 * 256; i++) { const v = hash(i * 1.37 + k * 9173.1) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
      g.putImageData(im, 0, 0); A.grain.push(c);
    }
    // spectrogram strip: one column per frame, one row per bin (high freq on top)
    const sc = document.createElement('canvas'); sc.width = NF; sc.height = D.spectrum.bins;
    const sg = sc.getContext('2d'); const sim = sg.createImageData(NF, D.spectrum.bins);
    const stops = theme.surf;
    for (let f = 0; f < NF; f++) {
      const sp = D.frame.spec[f];
      for (let b = 0; b < D.spectrum.bins; b++) {
        const v = clamp((sp[b] + 84) / 72);
        const x = v * (stops.length - 1), i0 = Math.min(stops.length - 2, Math.floor(x)), k = x - i0;
        const c1 = parseInt(stops[i0].slice(1), 16), c2 = parseInt(stops[i0 + 1].slice(1), 16);
        const o = ((D.spectrum.bins - 1 - b) * NF + f) * 4;
        sim.data[o] = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, k); sim.data[o + 1] = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, k);
        sim.data[o + 2] = lerp(c1 & 255, c2 & 255, k); sim.data[o + 3] = 255 * clamp(v * 1.6);
      }
    }
    sg.putImageData(sim, 0, 0); A.spectro = sc;
    await Promise.all([`600 40px ${SANS}`, `500 40px ${SANS}`, `700 40px ${SANS}`, `400 40px ${MONO}`, `500 40px ${MONO}`, `700 40px ${MONO}`, `italic 400 40px ${SERIF}`]
      .map((f) => document.fonts.load(f, 'U2C.EXE 0123456789 Pendant')));
  }

  // ------------------------------------------------------------------ pendulum (deterministic integration from t = 0)
  // Rope angle th (pivot at the anchor), pendant secondary sway ph relative to the rope. Natural period = 1 bar.
  // Kicks pump the swing in the direction of motion (like pushing a swing); amplitude soft-limited to ~7 deg.
  const PEND = (() => {
    const steps = 8, dt = 1 / FPS / steps, w1 = 2 * Math.PI / BAR, w2 = 2 * Math.PI / 0.62;
    const out = new Float32Array(NF * 3);
    let th = 0.035, om = 0, ph = 0, pv = 0; // small initial lean so frame 0 is not dead-still
    const kicks = D.onsets.kick.slice(); let ki = 0;
    for (let f = 0; f < NF; f++) {
      for (let s = 0; s < steps; s++) {
        const t = (f * steps + s) * dt;
        while (ki < kicks.length && kicks[ki][0] <= t) {
          const amp = Math.abs(th) + Math.abs(om) / w1;
          const room = clamp(1 - amp / 0.125);
          om += (om >= 0 ? 1 : -1) * 0.16 * kicks[ki][1] * room + (om === 0 ? 0.05 : 0); ki++;
        }
        const low = D.frame.bands[f][0];
        const acc = -w1 * w1 * Math.sin(th) - 0.32 * om + 0.02 * low * Math.sin(w1 * t);
        om += acc * dt; th += om * dt;
        const pacc = -w2 * w2 * ph - 2.2 * pv - 1.1 * acc;
        pv += pacc * dt; ph += pv * dt;
      }
      out[f * 3] = th; out[f * 3 + 1] = ph; out[f * 3 + 2] = om;
    }
    return out;
  })();
  const pend = (t) => { const f = fidx(t); return { th: PEND[f * 3], ph: PEND[f * 3 + 1], om: PEND[f * 3 + 2] }; };

  // ------------------------------------------------------------------ window chrome
  // st: {open 0..1, dim 0..1, focus 0..1}
  function chrome(ctx, T, r, title, unit, st, t) {
    const [x, y, w, h] = r, o = st.open;
    if (o <= 0) return false;
    const a = (1 - 0.6 * st.dim);
    // panel fill
    ctx.fillStyle = rgba(T.panel, (T.panel === T.bg ? 0.55 : 0.32) * smooth(o * 2) * a);
    if (T.panel === T.bg) ctx.fillStyle = rgba(HEX.char0, 0.35 * smooth(o * 2) * a);
    ctx.fillRect(x, y, w, h);
    // border draws on clockwise from the top-left corner
    const per = 2 * (w + h), len = per * E.out(clamp(o * 1.6));
    ctx.strokeStyle = rgba(T.line, (0.26 + 0.18 * st.focus) * a); ctx.lineWidth = 1;
    ctx.beginPath();
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    let rem = len; ctx.moveTo(x, y);
    for (let i = 1; i < pts.length && rem > 0; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = Math.hypot(x1 - x0, y1 - y0), k = Math.min(1, rem / d);
      ctx.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); rem -= d;
    }
    ctx.stroke();
    const ha = smooth((o - 0.35) / 0.4) * a;
    if (ha <= 0) return o >= 1;
    // header: ■ TITLE ............ unit ▢▢▢
    const hh = 30;
    ctx.strokeStyle = rgba(T.line, 0.16 * ha); ctx.beginPath(); ctx.moveTo(x, y + hh + 0.5); ctx.lineTo(x + w, y + hh + 0.5); ctx.stroke();
    ctx.fillStyle = rgba(T.accent, ha); ctx.fillRect(x + 12, y + 12, 6, 6);
    font(ctx, 12, MONO, 500); ctx.letterSpacing = '1.4px'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(T.line, 0.9 * ha); ctx.textAlign = 'left'; ctx.fillText(title.toUpperCase(), x + 26, y + hh / 2 + 1);
    ctx.textAlign = 'right'; ctx.fillStyle = rgba(T.line, 0.45 * ha);
    const bx = x + w - 12;
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = rgba(T.line, 0.4 * ha); ctx.strokeRect(bx - 8 - i * 13 + 0.5, y + 11.5, 8, 8); }
    if (unit) ctx.fillText(unit, bx - 46, y + hh / 2 + 1);
    ctx.letterSpacing = '0px';
    // corner ticks (Aurora-style notch bottom-right) + ports
    ctx.strokeStyle = rgba(T.line, 0.5 * ha); ctx.beginPath();
    ctx.moveTo(x + w - 10, y + h + 4); ctx.lineTo(x + w + 4, y + h + 4); ctx.lineTo(x + w + 4, y + h - 10); ctx.stroke();
    return o >= 1;
  }
  const content = (r) => [r[0] + 14, r[1] + 42, r[2] - 28, r[3] - 54];

  function label(ctx, T, txt, x, y, al = 0.5, size = 11, align = 'left', col) {
    font(ctx, size, MONO, 400); ctx.letterSpacing = '0.8px'; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(col || T.line, al); ctx.fillText(txt, x, y); ctx.letterSpacing = '0px';
  }
  const fmtDb = (v, d = 1) => (v <= -69 ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d));
  const tc = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };

  // log-frequency axis helpers
  const fx = (f, x, w) => x + w * Math.log(f / 20) / Math.log(1000);
  function freqGrid(ctx, T, x, y, w, h, a, dbs, dbMin, dbMax, labels = true) {
    ctx.lineWidth = 1;
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const X = Math.round(fx(f, x, w)) + 0.5; ctx.strokeStyle = rgba(T.line, (f === 100 || f === 1000 || f === 10000 ? 0.12 : 0.06) * a);
      ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke();
    }
    for (const d of dbs) {
      const Y = Math.round(y + h * (dbMax - d) / (dbMax - dbMin)) + 0.5; ctx.strokeStyle = rgba(T.line, 0.07 * a);
      ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x + w, Y); ctx.stroke();
      if (labels) label(ctx, T, String(d), x + 4, Y - 7, 0.38 * a, 10);
    }
    if (labels) [['20', 20], ['100', 100], ['632', 632], ['2k', 2000], ['20k', 20000]].forEach(([s, f], i) =>
      label(ctx, T, s, Math.min(x + w - 2, fx(f, x, w)), y + h + 10, 0.4 * a, 10, i === 0 ? 'left' : i === 4 ? 'right' : 'center'));
  }

  // ------------------------------------------------------------------ components
  const C = {};

  // session.exe — title, timecode, bar ruler, band-coloured L/R waveform with playhead, transport lanes
  C.session = (ctx, T, r, t, st) => {
    const [x, y, w, h] = content(r), a = (1 - 0.6 * st.dim) * smooth((st.open - 0.4) / 0.6);
    if (a <= 0) return;
    font(ctx, Math.round(h * 0.13), SANS, 600); ctx.letterSpacing = '-1px'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(T.line, 0.95 * a); ctx.fillText('PENDANT', x, y + h * 0.12);
    ctx.letterSpacing = '0px';
    font(ctx, Math.round(h * 0.085), MONO, 500); ctx.textAlign = 'right'; ctx.fillText(tc(t), x + w, y + h * 0.115);
    label(ctx, T, `${D.bpm} BPM · ${D.key} · 4/4 · 48 kHz`, x, y + h * 0.17, 0.45 * a);
    const bar = Math.floor(t / BAR) + 1, bt = Math.floor((t % BAR) / BEAT) + 1;
    label(ctx, T, `BAR ${String(bar).padStart(2, '0')}.${bt}`, x + w, y + h * 0.17, 0.6 * a, 11, 'right', T.accent);
    // ruler
    const wy = y + h * 0.24, wh = h * 0.42, ly = wy + wh + 10, lh = (y + h - ly);
    const tx = (tt) => x + w * tt / D.duration;
    ctx.strokeStyle = rgba(T.line, 0.25 * a); ctx.beginPath(); ctx.moveTo(x, wy); ctx.lineTo(x + w, wy); ctx.stroke();
    for (let b = 0; b * BAR < D.duration; b++) {
      const X = Math.round(tx(b * BAR)) + 0.5;
      ctx.strokeStyle = rgba(T.line, 0.3 * a); ctx.beginPath(); ctx.moveTo(X, wy - 8); ctx.lineTo(X, wy + wh + lh); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
      label(ctx, T, String(b + 1), X + 4, wy - 7, 0.5 * a, 10);
      for (let q = 1; q < 4; q++) { const Xq = Math.round(tx(b * BAR + q * BEAT)) + 0.5; ctx.strokeStyle = rgba(T.line, 0.18 * a); ctx.beginPath(); ctx.moveTo(Xq, wy - 3); ctx.lineTo(Xq, wy); ctx.stroke(); }
    }
    // waveform L / R
    const cols = D.wave.L.length, ch = (wh - 8) / 2;
    for (const [ci, key] of [[0, 'L'], [1, 'R']]) {
      const cy = wy + 6 + ch * ci + ch / 2;
      label(ctx, T, key, x - 2, cy - ch / 2 + 8, 0.45 * a, 9);
      for (let i = 0; i < cols; i++) {
        const X = x + 12 + (w - 12) * i / cols, tt = D.duration * i / cols, played = tt <= t;
        const [mn, mx] = D.wave[key][i], tone = D.wave.tone[i];
        ctx.fillStyle = mixA(T.cool, T.warm, clamp(tone * 1.4), (played ? 0.95 : 0.28) * a);
        ctx.fillRect(X, cy - mx * ch * 0.5, Math.max(1, (w - 12) / cols * 0.7), Math.max(1, (mx - mn) * ch * 0.5));
      }
    }
    // lanes: KICK / SNR / HAT ticks, 808 f0 line
    const lanes = [['KICK', 'kick'], ['SNR', 'snare'], ['HAT', 'hat'], ['808 F0', null]];
    const lnh = lh / lanes.length;
    lanes.forEach(([nm, k], i) => {
      const yy = ly + i * lnh;
      ctx.strokeStyle = rgba(T.line, 0.07 * a); ctx.beginPath(); ctx.moveTo(x, yy + 0.5); ctx.lineTo(x + w, yy + 0.5); ctx.stroke();
      label(ctx, T, nm, x, yy + lnh / 2, 0.42 * a, 9);
      if (k) for (const [t0, s] of D.onsets[k]) {
        const X = x + 56 + (w - 56) * t0 / D.duration, live = t0 <= t, hot = live && t - t0 < 0.12;
        ctx.fillStyle = rgba(hot ? T.hot : T.line, (live ? 0.85 : 0.22) * a);
        ctx.fillRect(X, yy + lnh * (0.5 - 0.32 * s), hot ? 3 : 2, lnh * 0.64 * s);
      } else {
        ctx.beginPath(); let first = true;
        for (let f = 0; f < NF; f += 2) {
          const f0 = D.frame.f0[f]; if (!f0) { first = true; continue; }
          const X = x + 56 + (w - 56) * f / NF, Y = yy + lnh * (0.85 - 0.7 * clamp(Math.log2(f0 / 30) / 1.7));
          first ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); first = false;
        }
        ctx.strokeStyle = rgba(T.accent, 0.55 * a); ctx.stroke();
      }
    });
    // playhead
    const P = tx(t) * (1) , PX = x + 12 + (w - 12) * t / D.duration;
    ctx.fillStyle = rgba(T.hot, a); ctx.fillRect(Math.round(PX), wy - 10, 1.5, wh + lh + 10);
    ctx.beginPath(); ctx.moveTo(PX - 5, wy - 12); ctx.lineTo(PX + 6, wy - 12); ctx.lineTo(PX + 0.5, wy - 5); ctx.fill();
  };

  // eq.vst — measured spectral envelope (fill) + EQ curve through nodes at the measured band levels vs pink
  C.eq = (ctx, T, r, t, st) => {
    const [x, y, w, h0] = content(r), h = h0 - 16, a = (1 - 0.6 * st.dim) * smooth((st.open - 0.4) / 0.6);
    if (a <= 0) return;
    freqGrid(ctx, T, x, y, w, h, a, [12, 6, 0, -6, -12], -15, 15);
    const f = fidx(t), sp = D.frame.spec[f], cen = D.spectrum.centers;
    // spectrum envelope, pink-compensated (+3 dB/oct), shown as a soft fill
    ctx.beginPath(); ctx.moveTo(x, y + h);
    for (let i = 0; i < sp.length; i++) {
      const v = sp[i] + 3 * Math.log2(cen[i] / 1000) + 32;
      ctx.lineTo(fx(cen[i], x, w), y + h * clamp((15 - v * 0.5) / 30));
    }
    ctx.lineTo(x + w, y + h); ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgba(T.cool, 0.28 * a)); g.addColorStop(1, rgba(T.cool, 0.02 * a));
    ctx.fillStyle = g; ctx.fill();
    // EQ curve: bells at the measured node gains (relative dB), clamped to ±12
    const eq = D.frame.eq[f], F = D.eqFreqs;
    const gain = (fr) => { let s = 0; for (let i = 0; i < F.length; i++) { const d = Math.log2(fr / F[i]); s += clamp(eq[i], -12, 12) * Math.exp(-d * d / (2 * 0.55 * 0.55)); } return s * 0.7; };
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) { const fr = 20 * Math.pow(1000, i / 160), Y = y + h * (15 - gain(fr)) / 30; i ? ctx.lineTo(fx(fr, x, w), Y) : ctx.moveTo(fx(fr, x, w), Y); }
    ctx.strokeStyle = rgba(T.line, 0.95 * a); ctx.lineWidth = 1.6; ctx.stroke(); ctx.lineWidth = 1;
    F.forEach((fr, i) => {
      const X = fx(fr, x, w), Y = y + h * (15 - gain(fr)) / 30;
      ctx.fillStyle = rgba(T.bg, a); ctx.strokeStyle = rgba(i === 0 || i === 1 ? T.accent : T.line, a);
      ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, 7); ctx.fill(); ctx.stroke();
      label(ctx, T, String(i + 1), X, Y - 13, 0.55 * a, 9, 'center');
    });
    label(ctx, T, `LS ${fmtDb(eq[0])} · HS ${fmtDb(eq[5])} dB · vs PINK`, x + w, y + 8, 0.45 * a, 10, 'right');
  };

  // spectrum.vst — Aurora-style line + soft fill, peak-hold dots, dBFS grid
  C.spectrum = (ctx, T, r, t, st, opt = {}) => {
    const [x, y, w, h0] = content(r), h = h0 - 16, a = (1 - 0.6 * st.dim) * smooth((st.open - 0.4) / 0.6);
    if (a <= 0) return;
    freqGrid(ctx, T, x, y, w, h, a, [0, -30, -60, -90], -96, 0);
    const f = fidx(t), sp = D.frame.spec[f], hold = D.specHold[f], cen = D.spectrum.centers;
    const Y = (v) => y + h * clamp(-v / 96);
    ctx.beginPath(); ctx.moveTo(x, y + h);
    for (let i = 0; i < sp.length; i++) ctx.lineTo(fx(cen[i], x, w), Y(sp[i]));
    ctx.lineTo(x + w, y + h); ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgba(T.accent, 0.35 * a)); g.addColorStop(1, rgba(T.accent, 0.0));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < sp.length; i++) { const X = fx(cen[i], x, w); i ? ctx.lineTo(X, Y(sp[i])) : ctx.moveTo(X, Y(sp[i])); }
    ctx.strokeStyle = rgba(T.line, 0.95 * a); ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = rgba(T.peak, 0.75 * a);
    for (let i = 0; i < hold.length; i += 2) ctx.fillRect(fx(cen[i], x, w) - 1, Y(hold[i]) - 1, 2, 2);
    // 808 fundamental marker
    const f0 = D.frame.f0[f];
    if (f0) { const X = fx(f0, x, w); ctx.strokeStyle = rgba(T.hot, 0.6 * a); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); ctx.setLineDash([]); label(ctx, T, `808 ${f0.toFixed(1)} Hz`, X + 5, y + 10, 0.7 * a, 10, 'left', T.hot); }
    label(ctx, T, '1/6 OCT · HOLD 1 s · −12 dB/s', x + w, y + 8, 0.4 * a, 10, 'right');
  };

  // spectro.vst — scrolling spectrogram (precomputed strip), 4 s history
  C.spectro = (ctx, T, r, t, st) => {
    const [x, y, w, h0] = content(r), h = h0 - 16, a = (1 - 0.6 * st.dim) * smooth((st.open - 0.4) / 0.6);
    if (a <= 0) return;
    const f = fidx(t), span = 4 * FPS, f0 = f - span;
    ctx.save(); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = true;
    const sx = Math.max(0, f0), sw = f + 1 - sx, dx = x + w * (sx - f0) / span;
    if (sw > 0) ctx.drawImage(A.spectro, sx, 0, sw, D.spectrum.bins, dx, y, x + w - dx, h);
    ctx.restore();
    for (const [s, fr] of [['10k', 10000], ['1k', 1000], ['100', 100]]) {
      const Y = y + h * (1 - Math.log(fr / 20) / Math.log(1000));
      ctx.strokeStyle = rgba(T.line, 0.1 * a); ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x + w, Y); ctx.stroke();
      label(ctx, T, s, x + w - 4, Y - 8, 0.5 * a, 10, 'right');
    }
    label(ctx, T, '4 s', x, y + h + 10, 0.4 * a, 10); label(ctx, T, 'now', x + w, y + h + 10, 0.4 * a, 10, 'right');
  };

  // meter.exe — segmented L/R (RMS body, peak tick, hold line), LUFS M/S/I, true peak
  C.meter = (ctx, T, r, t, st) => {
    const [x, y, w, h] = content(r), a = (1 - 0.6 * st.dim) * smooth((st.open - 0.4) / 0.6);
    if (a <= 0) return;
    const f = fidx(t), F = D.frame;
    const mh = h * 0.62, my = y + 4, bw = Math.min(26, w * 0.11), gx = x + 34;
    const Yd = (d) => my + mh * clamp(-d / 60);
    for (const d of [0, -6, -12, -18, -24, -36, -48, -60]) { label(ctx, T, String(d), gx - 8, Yd(d), 0.4 * a, 9, 'right'); }
    [[F.rmsL[f], F.pkL[f], D.peakHoldL[f], 'L'], [F.rmsR[f], F.pkR[f], D.peakHoldR[f], 'R']].forEach(([rms, pk, hold, nm], i) => {
      const bx = gx + i * (bw + 6);
      ctx.fillStyle = rgba(T.line, 0.06 * a); ctx.fillRect(bx, my, bw, mh);
      const top = Yd(rms + 3);  // RMS (+3 dB sine-calibrated) body
      const g = ctx.createLinearGradient(0, my + mh, 0, my);
      g.addColorStop(0, rgba(T.cool, 0.85 * a)); g.addColorStop(0.75, rgba(T.cool, 0.95 * a)); g.addColorStop(0.9, rgba(T.peak, a)); g.addColorStop(1, rgba(T.over, a));
      ctx.fillStyle = g; ctx.fillRect(bx, top, bw, my + mh - top);
      ctx.fillStyle = rgba(T.line, 0.25 * a); const pt = Yd(pk); ctx.fillRect(bx, pt, bw, Math.max(0, top - pt));
      ctx.fillStyle = rgba(T.bg, 0.9); for (let yy = my; yy < my + mh; yy += 4) ctx.fillRect(bx, yy, bw, 1.2);  // segment slots
      ctx.fillStyle = rgba(T.line, a); ctx.fillRect(bx, Yd(hold) - 1, bw, 2);
      label(ctx, T, nm, bx + bw / 2, my + mh + 10, 0.5 * a, 9, 'center');
      label(ctx, T, fmtDb(hold), bx + bw / 2, my + mh + 26, 0.85 * a, 11, 'center');
    });
    // readouts
    const rx = gx + 2 * bw + 22, rw = x + w - rx;
    const rows = [['MOMENTARY', F.lufsM[f]], ['SHORT-TERM', F.lufsS[f]], ['TRUE PEAK', F.tp[f], 'dBTP']];
    rows.forEach(([nm, v, u], i) => {
      const yy = my + 8 + i * 30;
      label(ctx, T, nm, rx, yy, 0.45 * a, 9);
      font(ctx, 15, MONO, 500); ctx.textAlign = 'right'; ctx.fillStyle = rgba(T.line, 0.9 * a); ctx.fillText(fmtDb(v) + (u ? '' : ''), x + w, yy + 1);
    });
    const ia = h * 0.8;
    label(ctx, T, 'INTEGRATED', rx, my + mh - 40, 0.55 * a, 9);
    label(ctx, T, 'LUFS', x + w, my + mh - 40, 0.45 * a, 9, 'right');
    font(ctx, Math.round(Math.min(rw * 0.3, 44)), MONO, 500); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = rgba(T.line, a);
    ctx.fillText(fmtDb(F.lufsI[f]), rx - 2, my + mh - 4);
    label(ctx, T, `TARGET −14.0 · ΔI ${fmtDb(F.lufsI[f] + 14)} LU · LIMITER −1 dBTP`, x, y + h - 6, 0.38 * a, 9);
  };

  // phase.scope — rotated M/S vectorscope with persistence, correlation bar
  C.phase = (ctx, T, r, t, st) => {
    const [x, y, w, h] = content(r), a = (1 - 0.6 * st.dim) * smooth((st.open - 0.4) / 0.6);
    if (a <= 0) return;
    const f = fidx(t), R = Math.min(w * 0.42, (h - 40) * 0.5), cx = x + w / 2, cy = y + R + 4;
    ctx.strokeStyle = rgba(T.line, 0.16 * a);
    for (const k of [1, 0.66, 0.33]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, 7); ctx.stroke(); }
    for (let i = 0; i < 4; i++) { const an = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx - Math.cos(an) * R, cy - Math.sin(an) * R); ctx.lineTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); ctx.stroke(); }
    label(ctx, T, 'M', cx, cy - R - 8, 0.5 * a, 9, 'center'); label(ctx, T, 'L', cx - R * 0.74, cy - R * 0.74, 0.5 * a, 9, 'center');
    label(ctx, T, 'R', cx + R * 0.74, cy - R * 0.74, 0.5 * a, 9, 'center'); label(ctx, T, '+S', cx + R + 10, cy, 0.4 * a, 9, 'center'); label(ctx, T, '−S', cx - R - 10, cy, 0.4 * a, 9, 'center');
    for (let back = 3; back >= 0; back--) {
      const ff = Math.max(0, f - back), v = D.vectorscope[ff], al = (back === 0 ? 0.9 : 0.35 / back) * a;
      ctx.fillStyle = rgba(back === 0 ? T.line : T.accent, al);
      for (let i = 0; i < v.length; i += 2) ctx.fillRect(cx + v[i] / 127 * R - 0.9, cy - v[i + 1] / 127 * R - 0.9, 1.8, 1.8);
    }
    const c = D.frame.corr[f], by = y + h - 10;
    ctx.strokeStyle = rgba(T.line, 0.3 * a); ctx.beginPath(); ctx.moveTo(x + 18, by); ctx.lineTo(x + w - 18, by); ctx.stroke();
    const cxp = x + 18 + (w - 36) * (c + 1) / 2;
    ctx.fillStyle = rgba(T.accent, 0.8 * a); ctx.fillRect(Math.min(cxp, x + w / 2), by - 1.5, Math.abs(cxp - (x + w / 2)), 3);
    ctx.strokeStyle = rgba(T.line, a); ctx.fillStyle = rgba(T.bg, a); ctx.beginPath(); ctx.arc(cxp, by, 5, 0, 7); ctx.fill(); ctx.stroke();
    label(ctx, T, '−1', x + 6, by, 0.4 * a, 9); label(ctx, T, '+1', x + w - 6, by, 0.4 * a, 9, 'right');
    label(ctx, T, `CORR ${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(2)} · W ${D.frame.width[f].toFixed(2)}`, x + w, y + 4, 0.75 * a, 10, 'right');
  };

  // surface.gl — folded-light 3D spectral waterfall (painter's algorithm, slope-lit quads)
  C.surface = (ctx, T, r, t, st, opt = {}) => {
    const [x, y, w, h] = content(r), a = (1 - 0.6 * st.dim) * smooth((st.open - 0.4) / 0.6);
    if (a <= 0) return;
    const f = fidx(t), ROWS = opt.rows || 34, STRIDE = 2, COLS = 64, bins = D.spectrum.bins;
    const yaw = (opt.yaw != null ? opt.yaw : -0.5 + 0.18 * Math.sin(t * 0.35)), pitch = opt.pitch != null ? opt.pitch : 0.62;
    const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), spn = Math.sin(pitch);
    const sc = Math.min(w * 0.62, h * 0.95) * (opt.scale || 0.62), ox = x + w / 2, oy = y + h * (opt.oy || 0.66);
    const proj = (u, v, hgt) => {  // u: -1..1 freq, v: 0 (now, front) .. 1 (past, back), hgt 0..1
      const X = u * 1.25, Z = (v - 0.5) * 1.6, Y = hgt * 0.9;
      const xr = X * cy_ - Z * sy_, zr = X * sy_ + Z * cy_;
      const yr = Y * cp - zr * spn, zz = Y * spn + zr * cp;
      const p = 4 / (4 + zz);
      return [ox + xr * sc * p, oy - yr * sc * p, zz];
    };
    const H = [];
    for (let rI = 0; rI < ROWS; rI++) {
      const ff = Math.max(0, f - rI * STRIDE), sp = D.frame.spec[ff], row = new Float32Array(COLS);
      for (let c = 0; c < COLS; c++) { const b = Math.floor(c * bins / COLS); row[c] = ff === f - rI * STRIDE || f - rI * STRIDE >= 0 ? clamp((sp[b] + 90) / 80) : 0; }
      H.push(row);
    }
    const P = H.map((row, rI) => Array.from(row, (hv, c) => proj(c / (COLS - 1) * 2 - 1, rI / (ROWS - 1), hv)));
    const stops = T.surf;
    const L = [0.45, 0.8, -0.35]; // light dir (folded light: rakes across ridges)
    // back rows first
    const order = [...Array(ROWS - 1).keys()].sort((p, q) => (P[q][COLS >> 1][2] + P[q + 1][COLS >> 1][2]) - (P[p][COLS >> 1][2] + P[p + 1][COLS >> 1][2]));
    for (const rI of order) {
      const fade = 1 - rI / ROWS;
      for (let c = 0; c < COLS - 1; c++) {
        const h00 = H[rI][c], h10 = H[rI][c + 1], h01 = H[rI + 1][c];
        const nx = -(h10 - h00) * 6, nz = -(h01 - h00) * 3, ny = 1, nl = Math.hypot(nx, ny, nz);
        const lit = clamp(0.5 + 0.5 * (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
        const hv = (h00 + h10) / 2, k = clamp(hv * 0.85 + lit * 0.45 - 0.1);
        const xk = k * (stops.length - 1), i0 = Math.min(stops.length - 2, Math.floor(xk));
        // folded light: the fill stays translucent (pearl), brightness comes from the slope facing the light
        ctx.fillStyle = mixA(stops[i0], stops[i0 + 1], xk - i0, (0.10 + 0.55 * lit * lit) * fade * a * clamp(0.25 + hv * 2.2));
        const p1 = P[rI][c], p2 = P[rI][c + 1], p3 = P[rI + 1][c + 1], p4 = P[rI + 1][c];
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill();
      }
      // every row is a hairline ridge; the front row is the live spectrum, brightest
      ctx.beginPath(); P[rI].forEach((p, c) => (c ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = rgba(rI === 0 ? T.line : T.cool, (rI === 0 ? 0.95 : 0.10 + 0.25 * fade) * a); ctx.lineWidth = rI === 0 ? 1.5 : 0.8; ctx.stroke(); ctx.lineWidth = 1;
    }
    if (!opt.bare) label(ctx, T, `WATERFALL · ${ROWS * STRIDE / FPS * 1000 | 0} ms · 64 BANDS`, x + w, y + 4, 0.45 * a, 10, 'right');
  };

  // chains.dll — the U2C chain logo: letters dissolve into pixel blocks and rebuild, a ghost outline always remains
  function logoState(t, events) {
    // events: [time, letter, 'rebuild'|'dissolve', dur]; returns solid amount per letter
    const s = [0, 0, 0];
    for (const [t0, k, kind, dur] of events) {
      if (t < t0) continue;
      const p = clamp((t - t0) / dur);
      s[k] = kind === 'rebuild' ? E.out(p) : 1 - E.in(p);
    }
    return s;
  }
  const pathCache = new Map();
  function letterMask(k, s, cell) {
    const key = k + ':' + Math.round(s * 60);
    if (pathCache.has(key)) return pathCache.get(key);
    const ps = A.links.pieces.filter((p) => p.k === k);
    const x0 = Math.min(...ps.map((p) => p.x)), y0 = Math.min(...ps.map((p) => p.y)), x1 = Math.max(...ps.map((p) => p.x + p.w)), y1 = Math.max(...ps.map((p) => p.y + p.h));
    const solid = new Path2D(), edge = [];
    const sq = Math.round(s * 60) / 60;
    for (let yy = y0; yy < y1; yy += cell) for (let xx = x0; xx < x1; xx += cell) {
      // build order: bottom-to-top sweep blended with block noise (reads as an assembling scan, not random static)
      const n = 0.55 * hash2(xx * 0.37 + k * 31, yy * 0.53) + 0.45 * (1 - (yy - y0) / (y1 - y0));
      if (n < sq) solid.rect(xx, yy, cell + 0.4, cell + 0.4);
      else if (n < sq + 0.07) edge.push([xx, yy]);
    }
    const out = { solid, edge };
    pathCache.set(key, out); return out;
  }
  C.chains = (ctx, T, r, t, st, opt) => {
    const [x, y, w, h] = content(r), a = (1 - 0.5 * st.dim) * smooth((st.open - 0.2) / 0.6);
    if (a <= 0) return;
    const LW = 887, LH = 647, sc = Math.min((w - 40) / LW, (h - 60) / LH) * (opt.logoScale || 1);
    const kick = env.kick[fidx(t)], snr = env.snare[fidx(t)];
    const punch = 1 + 0.012 * kick;
    const lx = x + w / 2 - LW * sc * punch / 2, ly = y + (h - 26) / 2 - LH * sc * punch / 2 + 4;
    const s = logoState(t, opt.logo || []);
    ctx.save(); ctx.translate(lx, ly); ctx.scale(sc * punch, sc * punch);
    const S = A.links.scale;
    // ghost outline: always visible (never fully gone)
    for (const p of A.links.pieces) {
      ctx.globalAlpha = a * (0.22 + 0.25 * snr + 0.35 * (1 - s[p.k]));
      ctx.drawImage(A.edge, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h);
    }
    for (let k = 0; k < 3; k++) {
      if (s[k] <= 0.001) continue;
      const ps = A.links.pieces.filter((p) => p.k === k);
      ctx.save();
      if (s[k] < 0.999) { const m = letterMask(k, s[k], 9); ctx.clip(m.solid); }
      ctx.globalAlpha = a * (0.94 + 0.06 * kick);
      for (const p of ps) ctx.drawImage(A.logo, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h);
      ctx.restore();
      if (s[k] < 0.999) {  // frontier blocks: the "being written" pixels
        const m = letterMask(k, s[k], 9);
        ctx.fillStyle = rgba(T.accent, 0.55 * a);
        for (const [ex, ey] of m.edge) if (inPieces(ps, ex + 4, ey + 4)) ctx.fillRect(ex + 1, ey + 1, 7, 7);
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
    const loaded = Math.round((s[0] + s[1] + s[2]) / 3 * 100);
    const bar = Math.floor(t / BAR), beat = Math.floor(t / BEAT) % 32 + 1;
    label(ctx, T, `LOADED U2C … ${String(loaded).padStart(3, ' ')}%   ${['U', '2', 'C'].map((c, i) => (s[i] > 0.99 ? c : s[i] > 0.01 ? c.toLowerCase() : '·')).join(' ')}`, x, y + h - 6, 0.6 * a, 11);
    label(ctx, T, `PHRASE ${Math.floor(bar / 8) + 1} · BEAT ${String(beat).padStart(2, '0')}/32`, x + w, y + h - 6, 0.6 * a, 11, 'right');
  };
  function inPieces(ps, px, py) { for (const p of ps) if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) return true; return false; }

  // elephant.sys — chain of interlocking links from the anchor to the pendant's bail; pendulum + secondary sway
  function drawChain(ctx, T, ax, ay, bx, by, sag, linkLen, a, kick) {
    // quadratic curve from anchor to bail, sag sideways (secondary motion)
    const mx = (ax + bx) / 2 + sag, my = (ay + by) / 2;
    const pts = []; const N = 80;
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push([(1 - u) * (1 - u) * ax + 2 * u * (1 - u) * mx + u * u * bx, (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * my + u * u * by]); }
    const cum = [0]; for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[N], n = Math.max(2, Math.round(total / linkLen));
    const at = (d) => { let i = 1; while (i < N && cum[i] < d) i++; const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k), Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])]; };
    for (let i = 0; i < n; i++) {
      const [cx, cy, an] = at((i + 0.5) * total / n);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(an);
      const L = total / n * 1.32, W = linkLen * 0.52;
      if (i % 2 === 0) { // face-on ring
        ctx.strokeStyle = rgba(HEX.chain, 0.95 * a); ctx.lineWidth = Math.max(2, W * 0.26);
        roundRect(ctx, -L / 2, -W / 2, L, W, W / 2); ctx.stroke();
        ctx.strokeStyle = rgba(HEX.char0, 0.5 * a); ctx.lineWidth = 1; roundRect(ctx, -L / 2 + W * 0.18, -W / 2 + W * 0.18, L - W * 0.36, W * 0.64, W / 3); ctx.stroke();
      } else { // edge-on
        ctx.fillStyle = rgba(HEX.chain, 0.8 * a); roundRect(ctx, -L / 2, -W * 0.13, L, W * 0.26, W * 0.13); ctx.fill();
        ctx.fillStyle = rgba('#ffffff'.replace('#ffffff', HEX.chain), 0.25 * a + 0.2 * kick);
      }
      ctx.restore();
    }
    ctx.lineWidth = 1;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  C.elephant = (ctx, T, r, t, st, opt = {}) => {
    const free = opt.free;  // free-hanging pendant (no window content box)
    const [x, y, w, h] = free ? r : content(r), a = (1 - 0.5 * st.dim) * (free ? 1 : smooth((st.open - 0.3) / 0.6));
    if (a <= 0) return;
    const { th, ph, om } = pend(t), kick = env.kick[fidx(t)];
    const ax = x + w / 2, ay = free ? y : y - 12;
    const rope = h * (opt.rope || 0.3), sc = (w * (opt.size || 0.92)) / 700;
    const bx = ax + Math.sin(th) * rope, by = ay + Math.cos(th) * rope;
    drawChain(ctx, T, ax, ay, bx, by, -ph * rope * 0.9, Math.max(14, 30 * sc), a, kick);
    ctx.save(); ctx.translate(bx, by); ctx.rotate(-(th + ph * 0.8));
    // soft shadow ground (alpha only, no new colour)
    ctx.globalAlpha = a;
    if (A.loop) {
      const L = A.loop, i = Math.floor(t * L.fps) % L.imgs.length, im = L.imgs[i], k = ((L.width || 700) / im.width) * sc, b = L.bail || { x: 343 * im.width / 700, y: 197 * im.width / 700 };
      ctx.drawImage(im, -b.x * k, -b.y * k, im.width * k, im.height * k);
    } else {
      ctx.drawImage(A.eleph, -343 * sc, -197 * sc, 700 * sc, 662 * sc);
    }
    // sparkle glints on snares (brand ✦), gold
    const sn = env.snare[fidx(t)];
    if (sn > 0.05) for (const [gx, gy, s0] of [[528, 140, 1], [565, 205, 0.7], [222, 238, 0.8]]) star(ctx, (gx - 343) * sc, (gy - 197) * sc, 16 * sc * s0 * (0.6 + sn), rgba(HEX.gold, sn * a));
    ctx.restore(); ctx.globalAlpha = 1;
    if (!free && !opt.noReadout) {
      const yy = y + h - 6;
      label(ctx, T, `ANGLE ${(th * 180 / Math.PI >= 0 ? '+' : '−')}${Math.abs(th * 180 / Math.PI).toFixed(1)}°`, x, yy, 0.65 * a, 11);
      label(ctx, T, `SWAY ${(ph * 180 / Math.PI).toFixed(1)}°`, x + w * 0.38, yy, 0.65 * a, 11);
      label(ctx, T, `T ${(1 + om * om * 0.8).toFixed(2)} g`, x + w, yy, 0.65 * a, 11, 'right');
    }
  };
  function star(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, rr = i % 2 ? r * 0.18 : r; ctx.lineTo(x + Math.sin(an) * rr, y - Math.cos(an) * rr); }
    ctx.closePath(); ctx.fill();
  }

  // ------------------------------------------------------------------ cables with signal dots
  function cablePath(L, c) {
    const [ia, sa, ib, sb] = c, ra = L.win[ia], rb = L.win[ib];
    const port = (r, s) => s === 'r' ? [r[0] + r[2], r[1] + r[3] * 0.5] : s === 'l' ? [r[0], r[1] + r[3] * 0.5] : s === 't' ? [r[0] + r[2] * 0.5, r[1]] : s === 'b' ? [r[0] + r[2] * 0.5, r[1] + r[3]] : s;
    const p = port(ra, sa), q = port(rb, sb);
    const pts = [p];
    if (sa === 'b' || sa === 't') { const my = (p[1] + q[1]) / 2; pts.push([p[0], my], [q[0], my]); }
    else { const mx = (p[0] + q[0]) / 2; pts.push([mx, p[1]], [mx, q[1]]); }
    pts.push(q);
    return pts;
  }
  function polyAt(pts, u) {
    let tot = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); tot += d; }
    let d = u * tot;
    for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? d / seg[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]; } d -= seg[i]; }
    return pts[pts.length - 1];
  }
  function drawCables(ctx, T, L, t, alpha, lit) {
    for (const c of L.cables) {
      const pts = cablePath(L, c), al = alpha * (lit ? lit(c) : 1);
      if (al <= 0) continue;
      ctx.strokeStyle = rgba(T.line, 0.2 * al); ctx.lineWidth = 1; ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      for (const p of [pts[0], pts[pts.length - 1]]) { ctx.fillStyle = rgba(T.bg, 1); ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8); ctx.strokeStyle = rgba(T.line, 0.55 * al); ctx.strokeRect(p[0] - 3.5, p[1] - 3.5, 7, 7); }
      // signal dots: each onset of this cable's type travels the cable in 0.42 s with a short trail
      const kind = c[4] || 'kick';
      for (const [t0, s] of D.onsets[kind]) {
        const dt = t - t0; if (dt < 0) break; if (dt > 0.42) continue;
        const u = E.out(dt / 0.42);
        for (let k = 0; k < 6; k++) {
          const uu = u - k * 0.025; if (uu < 0) break;
          const [px, py] = polyAt(pts, uu);
          ctx.fillStyle = rgba(k === 0 ? T.hot : T.accent, al * (k === 0 ? 1 : 0.5 - k * 0.07) * (0.5 + 0.5 * s));
          const sz = k === 0 ? 4 : 3; ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        }
      }
    }
  }

  // ------------------------------------------------------------------ overlays (screen space)
  function grain(ctx, W, H, t, amt) {
    const f = fidx(t), g = A.grain[f % 4];
    ctx.save(); ctx.globalAlpha = amt; ctx.globalCompositeOperation = 'overlay';
    const ox = Math.floor(hash(f * 3.1) * 256), oy = Math.floor(hash(f * 7.7) * 256);
    for (let yy = -oy; yy < H; yy += 256) for (let xx = -ox; xx < W; xx += 256) ctx.drawImage(g, xx, yy);
    ctx.restore();
  }
  function vignette(ctx, W, H, T, k) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, rgba(T.bg, 0)); g.addColorStop(1, rgba(HEX.char0, k));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function scanlines(ctx, W, H, a) { ctx.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1); }

  window.U2C = { D, FPS, NF, BEAT, BAR, HEX, THEMES, C, A, env, clamp, lerp, smooth, E, rgba, mix, mixA, hash, fidx, font, label, chrome, content,
    drawCables, cablePath, polyAt, grain, vignette, scanlines, loadAssets, tc, fmtDb, star, roundRect, SANS, MONO, SERIF, pend };
})();
