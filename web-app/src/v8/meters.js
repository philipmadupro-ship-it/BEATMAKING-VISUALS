// v8 meters (ported from u2c-motion film/v8/meters.js + meters8.js), drawn inside the windows: (ctx, S, rect, t, k),
// k = reveal step 0..1 (counted steps, never alpha). Every value is measured from the real audio (analysis/clipdata.js,
// checked against ffmpeg in tests/meters.mjs). Display settings come from the cue sheet through L.meter(kind, key, def).
// - EQ: an original display in the spirit of a pro parametric EQ (smooth summed curve, numbered band nodes, filled
//   bands, tilted analyzer behind, dual dB rulers, note strip, hover bubble). No third-party logos or trade dress.
// - Loudness: Kollide-frames style instrument (segmented 270 deg arc gauge, sub-gauges, numeric cells).
// - Spectrogram / stereo / surface: methods after Aurora by Joe Croskey (AGPL-3.0). Ideas and parameters only were
//   re-implemented; no Aurora code is used.
import * as ML from './meterlib.js';
export function createMeters(L) {
  const { D, F, FPS, NF, BEAT, BAR, T, U, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, hash, SANS, MONO } = L;
  const M = {};
  const X20 = (f, x, w) => x + w * Math.log(f / 20) / Math.log(1000);
  const lbl = (ctx, S, s, x, y, o = {}) => text(ctx, s, x, y, { size: o.size || 22, col: rgba(o.col || S.ink, o.a == null ? 0.7 : o.a), align: o.align, w: o.w || 500, ls: o.ls == null ? 0 : o.ls, base: o.base, maxW: o.maxW });
  function reveal(ctx, x, y, w, h, k) { ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, w + 4, (h + 4) * k); ctx.clip(); }

  // ---------------------------------------------------------------- SESSION: arrangement-view inspired, sample-accurate
  // clip header, whole-song overview with the clip bracket, bar ruler, warp ticks on transients, L/R lanes drawn from
  // 400 columns/s min/max/rms (1 px columns, crisp), onset lane, playhead. The detail window shows 2 bars.
  M.session = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const song = D.song, W2 = L.W2, cps = D.wave2.cps;
    const hh = 34; ctx.fillStyle = rgba(S.sig1, S.name === 'ALBEDO' ? 0.2 : 0.26); ctx.fillRect(x, y, w, hh); ctx.fillStyle = S.sig1; ctx.fillRect(x, y, 5, hh);
    text(ctx, `${L.tag('title')} · ${L.tag('experiment')}`, x + 14, y + hh / 2 + 1, { size: 22, w: 700, col: S.ink, maxW: w * 0.58 });
    lbl(ctx, S, `${Math.round(D.bpm)} BPM · ${D.key}`, x + w - 10, y + hh / 2 + 1, { align: 'right', a: 0.85 });
    // overview (whole track) + sections + clip bracket + song playhead
    const oy = y + hh + 8, oh = 36, sx = (st) => x + w * st / song.duration;
    for (const q of song.phrases) { const a0 = song.bar1 + (q.bar - 1) * BAR, a1 = a0 + q.bars * BAR; if (a0 > song.duration) continue; ctx.fillStyle = rgba(q.label === 'drop' ? S.sig2 : S.rule, q.label === 'drop' ? 0.18 : 0.06); ctx.fillRect(sx(a0), oy, sx(Math.min(a1, song.duration)) - sx(a0) - 1, oh); }
    const ov = song.overview; ctx.fillStyle = rgba(S.ink, 0.55);
    for (let i = 0; i < ov.length; i++) { const v = ov[i] / 1000 * oh * 0.46; ctx.fillRect(x + w * i / ov.length, oy + oh / 2 - v, Math.max(1, w / ov.length), v * 2); }
    const c0 = sx(song.startTime), c1 = sx(song.startTime + D.duration);
    ctx.strokeStyle = S.hot; ctx.lineWidth = 2; ctx.strokeRect(c0, oy - 2, c1 - c0, oh + 4); ctx.lineWidth = 1;
    ctx.fillStyle = S.hot; ctx.fillRect(Math.round(sx(song.startTime + t)), oy - 4, 2, oh + 8);
    // ruler over the detail window (2 bars, playhead at 25 %)
    const ry = oy + oh + 6, rh = 28, span = L.meter('session', 'span', 2) * BAR, t0 = t - 0.25 * span, tx = (tt) => x + w * (tt - t0) / span;
    ctx.strokeStyle = rgba(S.ink, 0.35); ctx.beginPath(); ctx.moveTo(x, ry + rh + 0.5); ctx.lineTo(x + w, ry + rh + 0.5); ctx.stroke();
    for (let b = Math.floor(t0 / BEAT) - 1; b * BEAT < t0 + span + BEAT; b++) {
      const X = Math.round(tx(b * BEAT)) + 0.5; if (X < x || X > x + w) continue; const isBar = ((b % 4) + 4) % 4 === 0;
      ctx.strokeStyle = rgba(S.ink, isBar ? 0.8 : 0.35); ctx.beginPath(); ctx.moveTo(X, ry + (isBar ? 0 : 16)); ctx.lineTo(X, ry + rh); ctx.stroke();
      if (isBar && X < x + w - 40) lbl(ctx, S, String(song.startBar + b / 4), X + 5, ry + 11, { w: 700, a: 0.95 });
    }
    // warp-marker ticks on the quantised kick + snare transients
    const wy = ry + rh + 2;
    for (const [kind, col] of [['kick', S.sig2], ['snare', S.ink]]) for (const [, s, tq] of D.onsets[kind]) { const X = tx(tq); if (X < x || X > x + w) continue; ctx.fillStyle = rgba(col, tq <= t ? 1 : 0.4); ctx.beginPath(); ctx.moveTo(X - 6, wy); ctx.lineTo(X + 6, wy); ctx.lineTo(X, wy + 9); ctx.fill(); }
    // L / R lanes, 1 px columns: peak (light) + rms (solid), coloured by tone, unplayed dimmed
    const ly = wy + 12, onH = 26, laneH = (y + h - ly - onH - 6) / 2;
    for (let ch = 0; ch < 2; ch++) {
      const cy = Math.round(ly + laneH * ch + laneH / 2), sc = laneH * 0.47 / 127;
      ctx.fillStyle = rgba(S.ink, 0.12); ctx.fillRect(x, cy, w, 1);
      for (let px = 0; px < w; px++) {
        const ta = t0 + span * px / w, tb = t0 + span * (px + 1) / w; if (tb < 0 || ta >= D.duration) continue;
        const i0 = Math.max(0, Math.floor(ta * cps)), i1 = Math.min(D.wave2.n - 1, Math.max(i0, Math.ceil(tb * cps) - 1));
        let mn = 127, mx = -127, rm = 0; for (let i = i0; i <= i1; i++) { const q = i * 6 + ch * 3; if (W2[q] < mn) mn = W2[q]; if (W2[q + 1] > mx) mx = W2[q + 1]; if (W2[q + 2] > rm) rm = W2[q + 2]; }
        const played = ta <= t, wi = Math.min(D.wave.tone.length - 1, Math.floor(ta * D.wave.cps)), tone = D.wave.tone[Math.max(0, wi)] || [50, 10];
        const col = played ? mix(S.waveHi, S.waveLo, clamp(tone[0] / 100 - tone[1] / 120 + 0.3), 1) : rgba(S.dim, 0.7);
        ctx.fillStyle = col; ctx.globalAlpha = played ? 0.42 : 0.3; ctx.fillRect(Math.round(x + px), Math.round(cy - mx * sc), 1, Math.max(1, Math.round((mx - mn) * sc)));
        ctx.globalAlpha = played ? 1 : 0.55; ctx.fillRect(Math.round(x + px), Math.round(cy - rm * sc), 1, Math.max(1, Math.round(rm * 2 * sc)));
      }
      ctx.globalAlpha = 1;
      lbl(ctx, S, ch ? 'R' : 'L', x + 6, cy - laneH / 2 + 14, { w: 700, a: 0.8 });
    }
    // onset lane: kick / snare / hat as tick marks, the one just hit in the accent
    const oy2 = y + h - onH;
    [['kick', 0, S.sig2], ['snare', 1, S.ink], ['hat', 2, S.dim]].forEach(([kind, i, col]) => { for (const [, s, tq] of D.onsets[kind]) { const X = tx(tq); if (X < x || X > x + w) continue; const hit = tq <= t && t - tq < BEAT / 4; ctx.fillStyle = hit ? S.hot : rgba(col, tq <= t ? 1 : 0.35); ctx.fillRect(Math.round(X), oy2 + i * 9, hit ? 4 : 2, 7); } });
    const PX = Math.round(tx(t)); ctx.fillStyle = S.hot; ctx.fillRect(PX, ry - 2, 2, y + h - ry + 2);
    ctx.beginPath(); ctx.moveTo(PX - 8, ry - 4); ctx.lineTo(PX + 10, ry - 4); ctx.lineTo(PX + 1, ry + 6); ctx.fill();
    text(ctx, bbt(t), PX + 10, ly + 14, { size: 22, w: 700, col: S.hot });
    ctx.restore();
  };

  // ---------------------------------------------------------------- SPECTRUM: v6 look (1/6-oct bars, peak hold, line) + Aurora-method trail
  M.spectrum = (ctx, S, r, t, k) => {
    const [x, y, w, h0] = r, h = h0 - 30; reveal(ctx, x, y, w, h0, k);
    const f = fidx(t), fl = L.meter('spectrum', 'floor', 90), sm = Math.max(1, Math.round(L.meter('spectrum', 'smooth', 1))), c = D.oct6, Y = (v) => y + h * clamp(-v / fl);
    const avg = (ff) => { if (sm <= 1) return F.spec[Math.max(0, ff)]; const o = new Float32Array(c.length); let k = 0; for (let j = 0; j < sm && ff - j >= 0; j++, k++) { const s2 = F.spec[ff - j]; for (let i = 0; i < o.length; i++) o[i] += s2[i]; } for (let i = 0; i < o.length; i++) o[i] /= Math.max(1, k); return o; };
    const sp = avg(f), hd = F.hold[f], showHold = L.meter('spectrum', 'hold', true);
    for (const d of [0, -30, -60, -90].filter((d) => -d <= fl)) { const yy = Math.round(Y(d)) + 0.5; ctx.strokeStyle = rgba(S.ink, 0.09); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); if (d > -fl) lbl(ctx, S, String(d), x + 2, yy + 14, { a: 0.45 }); }
    for (const [s, fq] of [['20', 20], ['100', 100], ['1k', 1000], ['10k', 10000]]) { const X = X20(fq, x, w); ctx.strokeStyle = rgba(S.ink, 0.09); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); lbl(ctx, S, s, Math.min(x + w - 24, X + (fq === 20 ? 2 : -12)), y + h + 16, { a: 0.6 }); }
    if (L.meter('spectrum', 'mode', 'bars') === 'ms') {   // M/S overlay: M filled, S a line, one dB axis (S never normalised up)
      const MSs = D.ms, nb = 128, row = (arr) => Array.from({ length: nb }, (_, i) => arr[f * nb + i] / 2.55 - 100), Xb = (i) => x + w * (i + 0.5) / nb, m = row(MSs.spectroM), sd = row(MSs.spectroS);
      ctx.beginPath(); ctx.moveTo(x, y + h); m.forEach((v, i) => ctx.lineTo(Xb(i), Y(v))); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fillStyle = rgba(S.sig1, 0.22); ctx.fill();
      ctx.beginPath(); m.forEach((v, i) => (i ? ctx.lineTo(Xb(i), Y(v)) : ctx.moveTo(Xb(i), Y(v)))); ctx.strokeStyle = S.ink; ctx.lineWidth = 1.25; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); sd.forEach((v, i) => (i ? ctx.lineTo(Xb(i), Y(v)) : ctx.moveTo(Xb(i), Y(v)))); ctx.strokeStyle = S.grey ? '#bdbdbd' : S.sig2; ctx.lineWidth = 1.5; if (S.grey) ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      lbl(ctx, S, 'M', x + w - 60, y + 14, { size: 16, w: 700, a: 0.9 }); lbl(ctx, S, 'S', x + w - 30, y + 14, { size: 16, w: 700, col: S.grey ? '#bdbdbd' : S.sig2 });
      ctx.restore(); return;
    }
    const bw = w / c.length;
    for (let i = 0; i < c.length; i++) {
      const X = X20(c[i], x, w) - bw * 0.35, top = Y(sp[i]);
      ctx.fillStyle = mix(S.sig1, S.sig2, i / c.length, S.name === 'ALBEDO' ? 0.38 : 0.46); ctx.fillRect(X, top, bw * 0.7, y + h - top);
      if (showHold) { ctx.fillStyle = rgba(S.ink, 0.95); ctx.fillRect(X, Y(hd[i]) - 1, bw * 0.7, 2); }
    }
    // 0.22 s trail (older lines thinner and dimmer), then a soft glow and the live line
    const trail = Math.round(L.meter('spectrum', 'trail', 0.22) * FPS), line = (ff) => { ctx.beginPath(); const s2 = avg(ff); for (let i = 0; i < c.length; i++) { const X = X20(c[i], x, w), Yy = Y(s2[i]); i ? ctx.lineTo(X, Yy) : ctx.moveTo(X, Yy); } };
    for (let q = trail; q >= 1; q--) { line(f - q); ctx.strokeStyle = rgba(S.ink, 0.2 * (1 - q / (trail + 1))); ctx.lineWidth = 1; ctx.stroke(); }
    line(f); ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(S.sig2, 0.18); ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = S.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    lbl(ctx, S, showHold ? '1/6 oct · hold 1 s' : '1/6 oct', x + w - 2, y + 14, { align: 'right', a: 0.6 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- BPM / PHASE CLOCK: the hand steps 16th to 16th
  M.clock = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const R = Math.min(h * 0.44, w * 0.22), cx = x + R + 6, cy = y + h / 2;
    ctx.strokeStyle = rgba(S.ink, 0.35); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + i * Math.PI / 8, L0 = i % 4 === 0 ? R * 0.7 : R * 0.86; ctx.strokeStyle = rgba(S.ink, i % 4 === 0 ? 0.9 : 0.35); ctx.lineWidth = i % 4 === 0 ? 2 : 1; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * L0, cy + Math.sin(a) * L0); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    const s16 = Math.floor(t / (BEAT / 4)) % 16, a = -Math.PI / 2 + s16 * Math.PI / 8;
    ctx.strokeStyle = S.hot; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = S.hot; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill();
    const tx0 = cx + R + 18, tw = x + w - tx0;
    text(ctx, D.bpm.toFixed(2), tx0, cy - h * 0.24, { size: Math.min(46, h * 0.26), w: 500, col: S.ink, maxW: tw });
    lbl(ctx, S, 'bpm · grid lock', tx0, cy + 2, { a: 0.65, maxW: tw });
    text(ctx, bbt(t), tx0, cy + h * 0.27, { size: 30, w: 700, col: S.hot, maxW: tw });
    ctx.restore();
  };

  const M8 = M;
  const SC = D.scope, scopeSpan = (ff) => { const e = Math.min(SC.L.length, Math.floor(ff / FPS * SC.rate)); return [Math.max(0, e - Math.round(SC.rate / FPS)), e]; };
  const cr = (v) => Math.round(v) + 0.5;
  const tickF = (t) => fidx(Math.floor(t / (BEAT / 2)) * (BEAT / 2));   // display tick: the frame at the last half beat
  M8.tickF = tickF;
  M8.cells = (ctx, S, x, y, w, h, cells, accentIdx = -1, vSize = 30) => {   // numeric cells: label top-left, value bottom-right
    const gap = 8, cw = (w - gap * (cells.length - 1)) / cells.length;
    cells.forEach(([nm, v], i) => {
      const cx = x + i * (cw + gap);
      if (i === accentIdx) { ctx.fillStyle = rgba(S.hot, S.grey ? 0.1 : 0.16); ctx.fillRect(Math.round(cx), Math.round(y), Math.round(cw), Math.round(h)); }
      ctx.strokeStyle = rgba(S.ink, 0.4); ctx.strokeRect(cr(cx), cr(y), Math.round(cw) - 1, Math.round(h) - 1);
      lbl(ctx, S, nm, cx + 8, y + 15, { a: 0.6, maxW: cw - 14 });
      text(ctx, v, cx + cw - 8, y + h - Math.min(18, h * 0.3), { size: vSize, col: i === accentIdx ? S.hot : S.ink, align: 'right', w: 500, maxW: cw - 14 });
    });
  };

  // ---------------------------------------------------------------- EQ: precise, in the spirit of a pro parametric EQ (original design)
  // Analyzer: 8192-pt Hann, hop 1024 (87.5 %), coherent scaling, max-preserving log projection (analysis/msspec.js);
  // here: instant attack + release (`smoothing` dB/s), optional peak hold with decay, +tilt dB/oct about 1 kHz, range
  // 60/90/120 dB, and the max of the log bins inside each pixel column (peaks survive decimation).
  // Curves: RBJ cookbook biquads evaluated at every pixel column (fs 96 kHz for display, as analog-matched EQs draw).
  // Bands: a spectral-balance match EQ fitted per SECTION against a -4.5 dB/oct reference (meterlib.fitMatch); they change
  // only on the section's first bar line, eased over 4 frames (power3.out). No per-beat wobble.
  const EQ_DASH = [[], [7, 4], [2, 3], [10, 3, 2, 3]], FS_EQ = 96000;
  const eqCols = (S) => (S.grey ? ['#ffffff', '#d4d4d4', '#a8a8a8', '#8a8a8a'] : [...S.bandCols, S.sig2 === S.bandCols[1] ? S.ink : S.sig2].slice(0, 4));
  const eqFit = { key: null, segOf: [], fits: [] };
  function eqSections(tilt, strength) {
    const key = tilt + '|' + strength; if (eqFit.key === key) return eqFit;
    const MS = D.ms, nT = MS.ltasN, grid = ML.ltasGrid(nT), segOf = [], segs = [];
    for (let k = 0; k < D.bars; k++) { const sb = D.song.startBar + k; let pi = -1; D.song.phrases.forEach((q, i) => { if (q.bar <= sb) pi = i; }); if (!segs.length || segs[segs.length - 1].pi !== pi) segs.push({ pi, bars: [], label: pi >= 0 ? D.song.phrases[pi].label : 'intro' }); segs[segs.length - 1].bars.push(k); segOf.push(segs.length - 1); }
    const fits = segs.map((sg) => { const lt = grid.map((_, i) => { let p = 0; for (const k of sg.bars) p += 10 ** (MS.ltas[k * nT + i] / 10); return 10 * Math.log10(Math.max(1e-30, p / sg.bars.length)); });
      return { label: sg.label, start: sg.bars[0], bands: ML.fitMatch(grid, lt, { tilt, strength }) }; });
    Object.assign(eqFit, { key, segOf, fits }); return eqFit;
  }
  function eqBandsAt(t, tilt, strength) {
    const E = eqSections(tilt, strength), k = clamp(Math.floor(t / BAR + 1e-9), 0, D.bars - 1), si = E.segOf[k], cur = E.fits[si];
    const u = (t - cur.start * BAR) * FPS / 4; if (si === 0 || u >= 1) return { bands: cur.bands, label: cur.label, seg: si };
    const prev = E.fits[si - 1].bands, n = Math.max(prev.length, cur.bands.length), e = ML.easeOut3(u), out = [];
    for (let i = 0; i < n; i++) { const a = prev[i] || { ...cur.bands[i], g: 0 }, b = cur.bands[i] || { ...prev[i], g: 0 };
      out.push(a.type === b.type ? { type: b.type, f: Math.exp(lerp(Math.log(a.f), Math.log(b.f), e)), g: lerp(a.g, b.g, e), q: lerp(a.q, b.q, e) } : (e < 0.5 ? a : b)); }
    return { bands: out, label: cur.label, seg: si };
  }
  M8.eqBandsAt = eqBandsAt;
  const noteName = (fc) => { const ni = Math.round(12 * Math.log2(fc / 440) + 57); return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((ni % 12) + 12) % 12] + Math.floor(ni / 12); };
  M8.eq = (ctx, S, r, t, k) => {
    const [x0, y0, w0, h0] = r; reveal(ctx, x0, y0, w0, h0, k);
    const MS = D.ms, AB = MS.anBins, FMX = MS.anFmax, x = Math.round(x0 + 44), pw = Math.round(w0 - 44 - 40), y = y0 + 34, h = h0 - 34 - 30, cols = eqCols(S);
    const tilt = L.meter('eq', 'tilt', 4.5), strength = L.meter('eq', 'strength', 50) / 100, anR = L.meter('eq', 'anRange', 90), rel = L.meter('eq', 'smoothing', 20), hold = L.meter('eq', 'hold', 1), mode = L.meter('eq', 'mode', 'pre-post');
    const XF = (f) => x + pw * Math.log(f / 20) / Math.log(FMX / 20), FX = (X) => 20 * (FMX / 20) ** ((X - x) / pw);
    const { bands, label } = eqBandsAt(t, tilt, strength), f = fidx(t), sel = bands.length ? Math.floor(t / BAR) % bands.length : -1;
    // per pixel column: summed curve and band curves (exact RBJ magnitude at the column's centre frequency)
    const colF = Array.from({ length: pw + 1 }, (_, i) => FX(x + i)), bandDb = bands.map((b) => colF.map((fq) => ML.magDb(ML.coefOf(b, FS_EQ), fq, FS_EQ))), sum = colF.map((_, i) => bandDb.reduce((a, d) => a + d[i], 0));
    let rg = L.meter('eq', 'range', 0); if (!rg) { const m = Math.max(0, ...sum.map(Math.abs)); rg = [3, 6, 12, 30].find((v) => v >= m * 1.15) || 30; }
    const Yg = (db) => y + h * (0.5 - db / (2 * rg)), Ya = (v) => y + h * clamp(-v / anR);
    // grid: 1..9 per decade (100 / 1k / 10k darker), dB lines every 6 (12 at ±30), 0 dB stronger
    for (let dec = 10; dec <= 10000; dec *= 10) for (let m = 1; m <= 9; m++) { const fq = dec * m; if (fq < 20 || fq > FMX) continue; const X = cr(XF(fq)); ctx.strokeStyle = rgba(S.ink, m === 1 && dec >= 100 ? 0.16 : 0.06); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); }
    const step = rg >= 30 ? 12 : rg >= 12 ? 6 : rg >= 6 ? 3 : 1;
    for (let db = -rg; db <= rg + 1e-9; db += step) { const Y = cr(Yg(db)); ctx.strokeStyle = rgba(S.ink, db === 0 ? 0.3 : 0.06); ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x + pw, Y); ctx.stroke(); if (db !== -rg) lbl(ctx, S, (db > 0 ? '+' : db < 0 ? '−' : '') + Math.abs(db), x - 6, Y, { size: 16, align: 'right', a: 0.9 }); }
    for (let v = 0; v <= anR; v += 30) if (v < anR) lbl(ctx, S, v ? '−' + v : '0', x + pw + 5, clamp(Ya(-v), y + 9, y + h - 9), { size: 15, a: 0.4 });
    // analyzer: release + hold per log bin, tilt, then the max per pixel column
    if (mode !== 'off') {
      const an = new Float32Array(AB), hd = new Float32Array(AB), get = (j) => (ff) => -MS.anSpec[ff * AB + j] / 2;
      for (let j = 0; j < AB; j++) { const tl = tilt * Math.log2(20 * (FMX / 20) ** ((j + 0.5) / AB) / 1000); an[j] = ML.releaseAt(get(j), f, FPS, rel, -anR - 30) + tl; hd[j] = hold > 0 ? ML.releaseAt(get(j), f, FPS, rel, -anR - 30, hold) + tl : -999; }
      const colMax = (arr, i) => { const j0 = clamp(Math.floor((i / pw) * AB), 0, AB - 1), j1 = clamp(Math.floor(((i + 1) / pw) * AB), j0, AB - 1); let v = -999; for (let j = j0; j <= j1; j++) if (arr[j] > v) v = arr[j]; return v; };
      const pre = colF.map((_, i) => colMax(an, i)), hl = hold > 0 ? colF.map((_, i) => colMax(hd, i)) : null;
      ctx.beginPath(); ctx.moveTo(x, y + h); pre.forEach((v, i) => ctx.lineTo(x + i, Ya(v))); ctx.lineTo(x + pw, y + h); ctx.closePath(); ctx.fillStyle = rgba(S.ink, 0.08); ctx.fill();
      if (mode === 'pre-post') { const post = pre.map((v, i) => v + sum[i]);
        ctx.beginPath(); ctx.moveTo(x, y + h); post.forEach((v, i) => ctx.lineTo(x + i, Ya(v))); ctx.lineTo(x + pw, y + h); ctx.closePath();
        const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(S.sig1, 0.18)); gr.addColorStop(1, rgba(S.sig1, 0.02)); ctx.fillStyle = gr; ctx.fill();
        ctx.beginPath(); post.forEach((v, i) => (i ? ctx.lineTo(x + i, Ya(v)) : ctx.moveTo(x, Ya(v)))); ctx.strokeStyle = rgba(S.ink, 0.55); ctx.lineWidth = 1; ctx.stroke(); }
      if (hl) { ctx.beginPath(); hl.forEach((v, i) => (i ? ctx.lineTo(x + i, Ya(v)) : ctx.moveTo(x, Ya(v)))); ctx.setLineDash([1, 2]); ctx.strokeStyle = rgba(S.ink, 0.3); ctx.stroke(); ctx.setLineDash([]); }
    }
    // band curves from 0 dB (thin, band colour); only the selected band is filled (both sides of 0)
    bands.forEach((b, bi) => { const d = bandDb[bi];
      if (bi === sel) { ctx.beginPath(); ctx.moveTo(x, Yg(0)); d.forEach((v, i) => ctx.lineTo(x + i, Yg(v))); ctx.lineTo(x + pw, Yg(0)); ctx.closePath(); ctx.fillStyle = rgba(cols[bi], 0.22); ctx.fill(); }
      ctx.beginPath(); d.forEach((v, i) => (i ? ctx.lineTo(x + i, Yg(v)) : ctx.moveTo(x, Yg(v)))); ctx.setLineDash(S.grey ? EQ_DASH[bi] : []); ctx.strokeStyle = rgba(cols[bi], 0.7); ctx.lineWidth = 1.25; ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; });
    // summed curve: the thickest line on screen
    ctx.beginPath(); sum.forEach((v, i) => (i ? ctx.lineTo(x + i, Yg(v)) : ctx.moveTo(x, Yg(v)))); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const sc = S.name === 'RUBEDO' ? S.hot : S.ink; ctx.strokeStyle = rgba(sc, 0.12); ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = sc; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap = 'butt';
    // nodes (at each band's own curve at f0) + collision-free number labels + the selected band's bubble
    const nodes = bands.map((b, bi) => { const X = XF(b.f), i = clamp(Math.round(X - x), 0, pw); return { bi, X, Y: Yg(bandDb[bi][i]), b }; });
    const boxes = nodes.map((n) => [n.X - 12, n.Y - 12, 24, 24]), hit = (a, q) => a[0] < q[0] + q[2] && q[0] < a[0] + a[2] && a[1] < q[1] + q[3] && q[1] < a[1] + a[3];
    const inPlot = (q) => q[0] >= x && q[1] >= y && q[0] + q[2] <= x + pw && q[1] + q[3] <= y + h;
    const place = (n, bw, bh, gap, own) => { for (const [sx, sy] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) { const q = [sx > 0 ? n.X + gap : n.X - gap - bw, sy < 0 ? n.Y - gap - bh : n.Y + gap, bw, bh];
      if (inPlot(q) && !boxes.some((o, j) => j !== own && hit(q, o))) return q; } return null; };
    const order = [...nodes].sort((a, b) => (a.bi === sel) - (b.bi === sel));
    if (sel >= 0) { const n = nodes[sel], bw = 196, bh = 74, q = place(n, bw, bh, 14, sel) || [clamp(n.X - bw / 2, x, x + pw - bw), n.Y < y + h / 2 ? n.Y + 20 : n.Y - 20 - bh, bw, bh]; boxes.push(q);
      const rows = L.steps(t, Math.floor(t / BAR) * 4, 3, 0.25), b = n.b, rh = Math.max(24, L.floorSize(ctx, 16) + 6); q[3] = 10 + rows * rh; if (q[1] + bh > n.Y) q[1] += bh - q[3];
      ctx.strokeStyle = rgba(S.ink, 0.6); ctx.beginPath(); ctx.moveTo(n.X, n.Y); ctx.lineTo(clamp(n.X, q[0], q[0] + bw), n.Y < q[1] ? q[1] : q[1] + q[3]); ctx.stroke();
      ctx.fillStyle = rgba(S.bg, 0.94); ctx.fillRect(q[0], q[1], bw, q[3]); ctx.strokeStyle = rgba(S.ink, 0.8); ctx.strokeRect(cr(q[0]), cr(q[1]), bw, q[3]);
      [`${b.f >= 1000 ? (b.f / 1000).toFixed(2) + 'k' : b.f.toFixed(1)} Hz · ${noteName(b.f)}`, `${b.g >= 0 ? '+' : '−'}${Math.abs(b.g).toFixed(1)} dB · #${sel + 1}`, `Q ${b.q.toFixed(2)} · ${b.type}`].slice(0, rows)
        .forEach((s, i) => lbl(ctx, S, s, q[0] + 8, q[1] + 5 + rh / 2 + i * rh, { size: 16, a: 1, maxW: bw - 14 })); }
    for (const n of order) { const s = n.bi === sel, R = s ? 7.5 : 5.5, close = nodes.some((o) => o !== n && Math.hypot(o.X - n.X, o.Y - n.Y) < 16 && !s);
      ctx.fillStyle = S.bg; ctx.beginPath(); ctx.arc(n.X, n.Y, R + 2, 0, 7); ctx.fill(); ctx.fillStyle = cols[n.bi]; ctx.beginPath(); ctx.arc(n.X, n.Y, R, 0, 7); ctx.fill();
      if (s || close) { ctx.strokeStyle = S.ink; ctx.lineWidth = 1.5; if (close) ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(n.X, n.Y, R + 3.5, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
      const q = place(n, 16, 18, 6, n.bi); if (q) { boxes.push(q); lbl(ctx, S, String(n.bi + 1), q[0] + 8, q[1] + 9, { size: 15, w: 700, align: 'center', a: 0.95 }); } }
    // header + frequency ruler (labels skip when they would collide)
    lbl(ctx, S, `MATCH · ${label.toUpperCase()} · ref −${tilt} dB/oct · ${Math.round(strength * 100)}%`, x0 + 6, y0 + 12, { size: 16, a: 0.65, maxW: w0 - 12 });
    let lastR = -1e9; for (const [s, fq] of [['20', 20], ['50', 50], ['100', 100], ['200', 200], ['500', 500], ['1k', 1000], ['2k', 2000], ['5k', 5000], ['10k', 10000], ['20k', 20000]]) {
      const X = XF(fq), wl = s.length * 0.62 * L.floorSize(ctx, 16) + 8; if (X - wl / 2 < lastR || X + wl / 2 > x0 + w0) continue; lbl(ctx, S, s, X, y + h + 14, { size: 16, align: 'center', a: [100, 1000, 10000].includes(fq) ? 0.8 : 0.5 }); lastR = X + wl / 2; }
    ctx.restore();
  };

  // ---------------------------------------------------------------- DAW LEVEL METERS (the grammar of Live / Logic / FL meters, original look)
  // L/R sample peak (instant attack, `smoothing` dB/s release, the frame shows the max of the envelope over its interval),
  // RMS (300 ms rectangular; K modes 600 ms + 3.01 dB, 0 at -K dBFS), peak hold (`hold` s, then falls), latched clip
  // lamp, running max and RMS readouts. Scale: the measured Live 12 table (+6..-60) or dB-linear over `range`.
  // Zone colours sit at fixed scale positions per stage. Every value comes from the clip's 1 ms blocks (meterlib.levelAt).
  const ZONES = { NIGREDO: ['#9c9c9c', '#d4d4d4', '#f2f2f2', '#ffffff'], ALBEDO: ['#1a1917', '#6e4433', '#a8432e', '#a8432e'], CITRINITAS: ['#c4a57a', '#d79a35', '#e8b85a', '#e0475f'], RUBEDO: ['#a35cf0', '#c79bf0', '#ff5cc8', '#e0475f'] };
  const zonesOf = (S) => ZONES[S.name] || [S.sig1, S.sig2, S.ink, S.hot];
  const levOpts = () => { const mode = L.meter('levels', 'mode', 'peak-rms'), ms = ML.modeSpec(mode); return { mode, ...ms, scale: ms.kmode ? 'linear' : L.meter('levels', 'scale', 'live'), range: L.meter('levels', 'range', 60), rel: L.meter('levels', 'smoothing', 20), hold: L.meter('levels', 'hold', 1.5) }; };
  const levRead = (ch, t, o, running = true) => { const v = ML.levelAt(D.lv, ch, t, { rel: o.rel, hold: o.hold, rmsWin: o.rmsWin, fps: FPS, running }); v.rms += o.cal; return v; };
  // the meter's scale for these options: position of a dBFS value, tick list [dBFS, label], zone of a dBFS value
  function levScale(o) {
    if (o.kmode) { const top = 0, rng = o.K + 24, pos = (db) => ML.dbPos(db, 'linear', rng, top), ticks = [];
      for (const kv of [o.K, 8, 4, 0, -4, -8, -12, -20].filter((v) => v <= o.K && v >= -24 + 0)) ticks.push([kv - o.K, (kv > 0 ? '+' : '') + kv]);
      return { pos, ticks, zone: (db) => (db + o.K > 4 ? 3 : db + o.K > 0 ? 2 : 0), zEdges: [[-999, -o.K], [-o.K, -o.K + 4], [-o.K + 4, 99]].map(([a, b], i) => [a, b, [0, 2, 3][i]]) };
    }
    const lin = o.scale === 'linear', pos = (db) => ML.dbPos(db, lin ? 'linear' : 'live', o.range, 6), ticks = [];
    for (let d = 6; d >= -(lin ? o.range : 60); d -= 6) ticks.push([d, String(Math.abs(d))]);
    return { pos, ticks, zone: (db) => (db > 0 ? 3 : db > -6 ? 2 : db > -18 ? 1 : 0), zEdges: [[-999, -18, 0], [-18, -6, 1], [-6, 0, 2], [0, 99, 3]] };
  }
  function hatchOver(ctx, x, y, w, h, col) { hatch(ctx, x, y, w, h, col); }
  // one vertical bar: track, zone-coloured RMS (solid) + peak beyond RMS (45 %), segments, hold line (2 px, 2 px past)
  function levBar(ctx, S, x, y, w, h, sc, v, style, segs = true) {
    const Z = zonesOf(S), Y = (db) => y + h * (1 - sc.pos(db));
    ctx.fillStyle = rgba(S.ink, 0.07); ctx.fillRect(x, y, w, h);
    for (const [a, b, zi] of sc.zEdges) { const ya = Y(Math.min(b, 6)), yb = Y(Math.max(a, -200)); if (yb <= ya) continue;
      const draw = (top, al) => { const t0 = Math.max(ya, top); if (yb > t0) { if (zi === 3 && S.grey) { ctx.fillStyle = rgba(Z[3], al); ctx.fillRect(x, t0, w, yb - t0); hatchOver(ctx, x, t0, w, yb - t0, S.bg); } else { ctx.fillStyle = rgba(Z[zi], al); ctx.fillRect(x, t0, w, yb - t0); } } };
      if (v.pk > v.rms) draw(Y(v.pk), 0.45); draw(Y(v.rms), 1); }
    if (style === 'segment' && segs) { ctx.fillStyle = S.card; for (let d = 6; d > -70; d--) { const yy = Y(d); if (yy > y && yy < y + h) ctx.fillRect(x, yy - 0.33, w, 0.65); } }
    if (v.hold > -140) { ctx.fillStyle = S.hot; ctx.fillRect(x - 2, Math.round(Y(v.hold)) - 1, w + 4, 2); }
  }
  // scale column: 4 px ticks, unsigned numerals, 0 bold; labels skip when they would collide
  function levTicks(ctx, S, x, y, h, sc, o = {}) {
    const fs = L.floorSize(ctx, o.size || 15), used = [], Yt = (d) => Math.round(y + h * (1 - sc.pos(d))) + 0.5;
    for (const [d] of sc.ticks) { ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(x, Yt(d), 4, 1); }
    // labels by priority (0 first, then the top, then every other tick), skipping any that would collide
    const pri = [...sc.ticks].sort((a, b) => (b[1] === '0') - (a[1] === '0') || (b === sc.ticks[0]) - (a === sc.ticks[0]));
    for (const [d, s] of pri) { const yy = Yt(d); if (yy < y - 2 || yy > y + h + 2 || used.some((u) => Math.abs(u - yy) < fs + 1)) continue;
      lbl(ctx, S, s, x + 7, yy, { size: o.size || 15, a: s === '0' ? 0.95 : 0.6, w: s === '0' ? 700 : 400 }); used.push(yy); }
  }
  M8.levels = (ctx, S, r, t, k, opt = {}) => {
    const [x, y, w, h] = r; if (!opt.noReveal) reveal(ctx, x, y, w, h, k);
    const o = levOpts(), sc = levScale(o), st0 = L.meter('levels', 'style', 'auto'), style = st0 === 'auto' ? (S.grey ? 'segment' : 'gradient') : st0, compact = opt.compact || w < 140, tf = tickF(t);
    const vL = levRead(0, t, o), vR = levRead(1, t, o), rd = [levRead(0, tf / FPS, o), levRead(1, tf / FPS, o)];
    const lampH = 10, cellH = compact ? 0 : Math.max(52, 2 * L.floorSize(ctx, 18) + 10), top = y + cellH + lampH + 8, foot = opt.foot ?? (compact ? 0 : L.floorSize(ctx, 14) + 6), bh = y + h - top - foot - 4;
    const bw = compact ? Math.max(8, Math.min(12, (w - 40) / 2 - 1)) : clamp(w * 0.045, 12, 20), gap = 2, bx = x + (compact ? 2 : 6);
    [vL, vR].forEach((v, ch) => { const X = bx + ch * (bw + gap); levBar(ctx, S, X, top, bw, bh, sc, v, style);
      ctx.fillStyle = v.clip ? S.hot : rgba(S.ink, 0.12); ctx.fillRect(X, top - lampH - 4, bw, lampH); if (v.clip && S.grey) hatch(ctx, X, top - lampH - 4, bw, lampH, S.bg); });
    levTicks(ctx, S, bx + 2 * bw + gap + 3, top, bh, sc);
    if (!compact) {   // readouts above the pair: peak max (red cell when >= -0.1 dBFS) and RMS
      const cw = (w * 0.34), cx0 = x + 6;
      const mx = Math.max(rd[0].max, rd[1].max), hot = mx >= -0.1 || rd[0].clip || rd[1].clip;
      if (hot) { ctx.fillStyle = rgba(S.hot, 0.16); ctx.fillRect(cx0, y, cw, cellH); }
      ctx.strokeStyle = rgba(S.ink, 0.4); ctx.strokeRect(cr(cx0), cr(y), Math.round(cw), Math.round(cellH));
      const rr = 10 * Math.log10((10 ** (rd[0].rms / 10) + 10 ** (rd[1].rms / 10)) / 2), kk = o.kmode ? o.K : 0;
      text(ctx, mx < -140 ? '−∞' : fmt(mx + kk), cx0 + cw - 6, y + cellH * 0.3, { size: 24, w: 600, col: hot ? S.hot : S.ink, align: 'right', maxW: cw - 10 });
      text(ctx, rr < -140 ? '−∞' : fmt(rr + kk), cx0 + cw - 6, y + cellH * 0.74, { size: 20, col: rgba(S.ink, 0.7), align: 'right', maxW: cw - 10 });
      lbl(ctx, S, o.kmode ? `K-${o.K}` : 'PK', cx0 + 5, y + cellH * 0.3, { size: 14, a: 0.5 }); lbl(ctx, S, o.kmode ? 'RMS' : 'RMS', cx0 + 5, y + cellH * 0.74, { size: 14, a: 0.5 });
      // band meters: dBFS band power (sine-referenced, 8192-pt) on the same scale, hold line per band
      const names = ['SUB', 'LO', 'LM', 'MID', 'HM', 'AIR'], b0 = x + w * 0.42, bw2 = (x + w - 48 - b0) / 6, f = fidx(t);
      names.forEach((nm, i) => { const get = (ff) => F.bandDb[ff][i], v = { pk: get(f), rms: get(f), hold: ML.releaseAt(get, f, FPS, o.rel, -150, o.hold) }, X = b0 + i * bw2 + 2;
        levBar(ctx, S, X, top, bw2 - 6, bh, sc, v, style); lbl(ctx, S, nm, X + (bw2 - 6) / 2, y + h - 10, { size: 14, align: 'center', a: 0.6, maxW: bw2 - 2 }); });
      levTicks(ctx, S, x + w - 44, top, bh, sc);
      lbl(ctx, S, 'BANDS dBFS', b0, y + 12, { size: 14, a: 0.5 });
    }
    if (!opt.noReveal) ctx.restore();
  };
  M8.bands = (ctx, S, r, t, k) => M8.levels(ctx, S, r, t, k);

  // ---------------------------------------------------------------- LOUDNESS: strip meter + LUFS history + histogram + cells
  // (the Youlean-style reading: integrated as a filled area, short-term line, momentary faint, excess over the target,
  // a sideways histogram of short-term in 0.5 LU bins). Values: BS.1770-4 / EBU R128 from analysis/clipdata.js.
  M8.loud = (ctx, S, r, t, k) => {
    if (L.meter('loud', 'focus', 'ghost') === 'ghost' && L.curWin && L.shotTo === L.curWin) return M8.ghost(ctx, S, r, t, k);
    if (L.meter('loud', 'layout', 'history') === 'gauge') return M8.loudGauge(ctx, S, r, t, k);
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const f = fidx(t), tf = tickF(t), tgt = L.meter('loud', 'target', -14), fl = L.meter('loud', 'floor', -54), win = L.meter('loud', 'window', 0), lscale = L.meter('loud', 'scale', 'linear');
    const cellH = Math.max(50, 2 * L.floorSize(ctx, 18) + 8), gy = y + 6, gh = h - cellH - 34, stripW = 58, hw = 26, gx = x + stripW + 10, gw = w - stripW - 10 - hw - 4;
    M8.levels(ctx, S, [x, gy - 2, stripW, gh + 26], t, 1, { compact: true, noReveal: true });
    // LUFS axis (linear, or compressed above -18 like a loudness meter) and the graph grid
    const posL = (v) => (lscale === 'compressed' ? (v > -18 ? 0.6 + 0.4 * (v + 18) / 18 : 0.6 * (v - fl) / (-18 - fl)) : (v - fl) / -fl), Y = (v) => gy + gh * (1 - clamp(posL(v)));
    let last = -1e9; for (const v of [0, -6, -12, -18, -23, -30, -40, -54].filter((v) => v >= fl)) { const yy = Math.round(Y(v)) + 0.5; ctx.strokeStyle = rgba(S.ink, v === tgt ? 0 : 0.07); ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy); ctx.stroke();
      if (yy - last >= L.floorSize(ctx, 14) + 1 && Math.abs(v - tgt) > 4.5 && v > fl) { lbl(ctx, S, v ? '−' + -v : '0', gx + 3, yy + 9, { size: 14, a: 0.4 }); last = yy; } }
    // history: whole clip (window 0) or the last `window` s; future stays blank
    const t0 = win > 0 ? t - win : 0, span = win > 0 ? win : D.duration, X = (tt) => gx + gw * (tt - t0) / span, f0 = Math.max(1, Math.ceil(t0 * FPS)), path = (arr, fn) => { ctx.beginPath(); let st = false; for (let i = f0; i <= f; i++) { const v = arr[i]; if (v <= -69) { st = false; continue; } const xx = X(i / FPS), yy = Y(Math.max(fl, v)); st ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); st = true; } fn && fn(); };
    { ctx.beginPath(); let st = -1; for (let i = f0; i <= f; i++) { const v = F.I[i]; if (v <= -69) continue; const xx = X(i / FPS); if (st < 0) { ctx.moveTo(xx, gy + gh); st = i; } ctx.lineTo(xx, Y(Math.max(fl, v))); } if (st >= 0) { ctx.lineTo(X(f / FPS), gy + gh); ctx.closePath(); ctx.fillStyle = rgba(S.sig1, 0.25); ctx.fill(); } }
    // excess of short-term above the target
    ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, Y(tgt) - gy); ctx.clip(); { ctx.beginPath(); let st = false; for (let i = f0; i <= f; i++) { const v = F.S[i]; if (v <= -69) continue; const xx = X(i / FPS); if (!st) { ctx.moveTo(xx, Y(tgt)); st = true; } ctx.lineTo(xx, Y(v)); } if (st) { ctx.lineTo(X(f / FPS), Y(tgt)); ctx.closePath(); ctx.fillStyle = rgba(S.hot, 0.35); ctx.fill(); } } ctx.restore();
    path(F.M); ctx.strokeStyle = rgba(S.ink, 0.35); ctx.lineWidth = 1; ctx.stroke();
    path(F.S); ctx.strokeStyle = S.ink; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = S.warn; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(gx, cr(Y(tgt))); ctx.lineTo(gx + gw, cr(Y(tgt))); ctx.stroke(); ctx.setLineDash([]);
    lbl(ctx, S, `−${-tgt}`, gx + 3, Y(tgt) + 9, { size: 14, w: 700, col: S.warn, a: 1 });
    ctx.fillStyle = S.hot; ctx.fillRect(Math.round(X(t)), gy, 1, gh);
    // time ruler: bars
    for (let b = Math.ceil(t0 / BAR); b * BAR <= t0 + span; b++) { const xx = X(b * BAR); if (xx < gx || xx > gx + gw) continue; ctx.fillStyle = rgba(S.ink, 0.3); ctx.fillRect(Math.round(xx), gy + gh, 1, 6); }
    lbl(ctx, S, win > 0 ? `−${win} s` : 'clip', gx, gy + gh + 14, { size: 14, a: 0.5 }); lbl(ctx, S, 'now', X(t), gy + gh + 14, { size: 14, a: 0.6, align: X(t) > gx + gw - 30 ? 'right' : 'center' });
    // sideways histogram of short-term, 0.5 LU bins over the clip so far
    const hx0 = x + w - hw, hist = ML.histogram(Array.from(F.S.subarray(1, f + 1)), fl, 0, 0.5), hm = Math.max(1, ...hist);
    ctx.fillStyle = rgba(S.ink, 0.06); ctx.fillRect(hx0, gy, hw, gh);
    hist.forEach((c, i) => { if (!c) return; const v = fl + (i + 0.5) * 0.5, yy = Y(v), ww = hw * c / hm; ctx.fillStyle = v > tgt ? rgba(S.hot, 0.8) : rgba(S.ink, 0.7); ctx.fillRect(x + w - ww, yy - 1, ww, Math.max(1, gh * 0.5 / -fl)); });
    // numeric cells: S / I / LRA / TP max / PLR (ticked on the half beat)
    const I = F.I[tf], tp = F.TP[tf], plr = I > -69 && tp > -69 ? tp - I : NaN;
    M8.cells(ctx, S, x, y + h - cellH, w, cellH, [['S', fmt(F.S[tf])], ['I', fmt(I)], ['LRA', F.LRA[tf].toFixed(1)], ['TP', fmt(tp)], ['PLR', Number.isFinite(plr) ? plr.toFixed(1) : '—']], 1, 22);
    ctx.restore();
  };

  // ---------------------------------------------------------------- LOUDNESS, alternative look: Kollide-frames instrument (segmented arc gauge)
  M8.loudGauge = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const tf = tickF(t), f = fidx(t), side = w / h > 1.15;
    // side layout (short windows): gauge left, numeric cells stacked right; tall windows: gauge over a cell row
    const cellsW = side ? Math.min(150, w * 0.42) : w, R = side ? Math.min((w - cellsW - 20) * 0.5, h * 0.5 - 6) : Math.min(w * 0.38, (h - 64 - 40) * 0.5);
    const cx = side ? x + R + 4 : x + w / 2, cy = side ? y + h * 0.52 : y + R + 26;
    const lf = L.meter('loud', 'floor', -36), tgt = L.meter('loud', 'target', -14), a0 = Math.PI * 0.75, span = Math.PI * 1.5, NT = 48, A = (v) => a0 + span * clamp((v - lf) / -lf), vS = F.S[f];
    for (let i = 0; i < NT; i++) {   // the segmented arc runs at frame rate (real ballistics)
      const v = lf - lf * i / (NT - 1), a = A(v), over = v > tgt + 1;
      ctx.strokeStyle = v <= vS ? (over ? S.hot : S.ink) : rgba(S.ink, 0.16); ctx.lineWidth = Math.max(3, R * 0.05);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    }
    ctx.lineWidth = 1;
    const am = A(F.M[f]); ctx.strokeStyle = S.hot; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(am) * R * 0.45, cy + Math.sin(am) * R * 0.45); ctx.lineTo(cx + Math.cos(am) * R * 0.76, cy + Math.sin(am) * R * 0.76); ctx.stroke(); ctx.lineWidth = 1;
    const tv = A(tgt); ctx.fillStyle = S.ink; ctx.beginPath(); ctx.arc(cx + Math.cos(tv) * R * 1.1, cy + Math.sin(tv) * R * 1.1, 4, 0, 7); ctx.fill();
    text(ctx, fmt(F.S[tf]), cx, cy - R * 0.06, { size: Math.max(34, R * 0.46), w: 500, col: S.ink, align: 'center' });
    lbl(ctx, S, 'lufs-s', cx, cy + R * 0.42, { align: 'center', a: 0.6 });
    const cells = [['I', fmt(F.I[tf])], ['TP', fmt(F.TP[tf])], ['LRA', F.LRA[tf].toFixed(1)]];
    if (side) {
      const ch = (h - 16) / 3, cx0 = x + w - cellsW;
      cells.forEach(([nm, v], i) => { const yy = y + i * (ch + 8); if (i === 0) { ctx.fillStyle = rgba(S.hot, S.grey ? 0.1 : 0.16); ctx.fillRect(cx0, yy, cellsW, ch); } ctx.strokeStyle = rgba(S.ink, 0.4); ctx.strokeRect(cr(cx0), cr(yy), cellsW - 1, Math.round(ch) - 1);
        lbl(ctx, S, nm, cx0 + 8, yy + 14, { a: 0.6 }); text(ctx, v, cx0 + cellsW - 8, yy + ch - 16, { size: 28, w: 500, col: i === 0 ? S.hot : S.ink, align: 'right' }); });
    } else M8.cells(ctx, S, x, y + h - 64, w, 64, cells, 0);
    ctx.restore();
  };

  // ---------------------------------------------------------------- GHOST: hero readout (after a free visualizer's 2x2 grammar)
  // Four tiles (PEAK dBFS · RMS dB · CREST dB · CORR), huge tabular-mono numbers (unit at 0.35x, caps label top-left)
  // over one glowing single-hue history line each (1.5 px core + soft bloom). Numbers tick on the half beat; the lines
  // run at frame rate. Peak/RMS from the 1 ms blocks with the level-meter ballistics, crest = peak - RMS.
  const ghostVals = (tt) => { const o = levOpts(), a = levRead(0, tt, o, false), b = levRead(1, tt, o, false), pk = Math.max(a.pk, b.pk), rms = 10 * Math.log10((10 ** (a.rms / 10) + 10 ** (b.rms / 10)) / 2);
    return [pk, rms, pk > -140 && rms > -140 ? pk - rms : NaN, F.corr[fidx(tt)]]; };
  M8.ghostVals = ghostVals;
  M8.ghost = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const tf = tickF(t), now = ghostVals(tf / FPS), hist = L.meter('ghost', 'history', 4), N = 60, H = [];
    for (let i = 0; i <= N; i++) { const tt = t - hist + hist * i / N; H.push(tt < 0 ? null : ghostVals(tt)); }
    const core = S.grey ? '#ffffff' : mix(S.ink, S.sig1, 0.15), glow = S.grey ? '#ffffff' : S.sig1;
    const tiles = [['PEAK', 'dBFS', 0, [-60, 0]], ['RMS', 'dB', 1, [-60, 0]], ['CREST', 'dB', 2, [0, 24]], ['CORR', '', 3, [-1, 1]]], gw = w / 2, gh = h / 2;
    tiles.forEach(([nm, unit, i, rg0], q) => { let [lo, hi] = rg0;
      const tx = x + (q % 2) * gw, ty = y + Math.floor(q / 2) * gh; ctx.strokeStyle = rgba(S.ink, 0.22); ctx.strokeRect(cr(tx + 2), cr(ty + 2), Math.round(gw - 4), Math.round(gh - 4));
      lbl(ctx, S, nm, tx + 10, ty + 14, { size: 13, a: 0.6, ls: 1 });
      // history line in the lower half of the tile
      // history line in the lower part of the tile, auto-ranged to its own history (min span 6 dB; corr fixed -1..+1)
      if (i < 3) { const vs = H.filter((v) => v && Number.isFinite(v[i]) && v[i] > -140).map((v) => v[i]); if (vs.length) { const a = Math.min(...vs), b = Math.max(...vs), m = (a + b) / 2, sp = Math.max(6, (b - a) * 1.2) / 2; lo = m - sp; hi = m + sp; } }
      const ly0 = ty + gh * 0.6, lh = gh * 0.32, P = H.map((v, j) => (v && Number.isFinite(v[i]) && v[i] > -140 ? [tx + 10 + (gw - 20) * j / N, ly0 + lh * (1 - clamp((v[i] - lo) / (hi - lo)))] : null));
      ctx.beginPath(); let st = false; for (const p of P) { if (!p) { st = false; continue; } st ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); st = true; }
      ctx.lineJoin = 'round'; ctx.save(); ctx.shadowColor = rgba(glow, 0.9); ctx.shadowBlur = 8; ctx.strokeStyle = rgba(glow, 0.5); ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
      ctx.strokeStyle = core; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
      if (i === 3) { ctx.fillStyle = rgba(S.ink, 0.25); ctx.fillRect(tx + 6, Math.round(ly0 + lh / 2), gw - 12, 1); }
      // the number
      const v = now[i], s = i === 3 ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) : !Number.isFinite(v) || v < -140 ? '−∞' : i === 2 ? v.toFixed(1) : fmt(v), size = Math.min(gh * 0.34, gw * 0.24);
      const nw = text(ctx, s, tx + 10, ty + gh * 0.38, { size, w: 700, col: i === 0 && v >= -0.1 ? S.hot : S.ink, maxW: gw - 20 - (unit ? size * 0.35 * unit.length * 0.62 + 6 : 0) });
      if (unit) text(ctx, unit, tx + 14 + nw, ty + gh * 0.38 + size * 0.22, { size: size * 0.35, col: rgba(S.ink, 0.45) });
    });
    ctx.restore();
  };

  // ---------------------------------------------------------------- SPECTROGRAM: stacked M and S panes, one LUT, one dB scale
  // M = (L+R)/2 and S = (L-R)/2 band power from the L/R hop STFT (analysis/msspec.js). Both panes share the floor and
  // the ceiling (0 dBFS), so S honestly reads darker than M; a mono mix leaves the S pane empty.
  const specCache = {};
  const hx3 = (v) => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  function specLUT(S, gam) {
    const A = hx3(S.spec[1]), B = hx3(S.spec[2]), C = hx3(S.spec[3]), I = hx3(S.ink), P0 = hx3(S.card), mid = 0.52, LUT = [];
    for (let i = 0; i < 256; i++) {
      const v = i / 255; let col;
      if (v < 0.18) col = P0.map((c0, j) => lerp(c0, A[j], v / 0.18)); else if (v < mid) col = A.map((c0, j) => lerp(c0, B[j], (v - 0.18) / (mid - 0.18))); else col = B.map((c0, j) => lerp(c0, C[j], (v - mid) / (1 - mid)));
      if (v > 0.76) col = col.map((c0, j) => lerp(c0, I[j], 0.18 * (v - 0.76) / 0.24));
      if (S.grey) { const g = Math.round((col[0] + col[1] + col[2]) / 3); col = [g, g, g]; }
      LUT.push([...col.map(Math.round), v < 0.015 ? 0 : 255 * Math.pow(v, gam)]);
    }
    return LUT;
  }
  function specImage(src, n, LUT, floor) {
    const c = document.createElement('canvas'); c.width = NF; c.height = n; const g = c.getContext('2d'), im = g.createImageData(NF, n);
    for (let f = 0; f < NF; f++) for (let b = 0; b < n; b++) {
      const db = src[f * n + b] / 255 * 100 - 100, q = LUT[Math.round(clamp((db + floor) / floor) * 255)], o4 = ((n - 1 - b) * NF + f) * 4;
      im.data[o4] = q[0]; im.data[o4 + 1] = q[1]; im.data[o4 + 2] = q[2]; im.data[o4 + 3] = q[3];
    }
    g.putImageData(im, 0, 0); return c;
  }
  M8.spectro = (ctx, S, r, t, k) => {
    const [x, y, w, h0] = r, MS = D.ms, n = 128, gam = L.meter('spectro', 'gamma', 0.56), floor = L.meter('spectro', 'range', 90), mode = L.meter('spectro', 'mode', 'ms'), h = h0 - 30; reveal(ctx, x, y, w, h0, k);
    const key = [S.spec.join(), S.ink, S.card, S.grey, gam, floor].join('|');
    if (!specCache[key]) { const ks = Object.keys(specCache); if (ks.length > 6) delete specCache[ks[0]]; const LUT = specLUT(S, gam); specCache[key] = { M: specImage(MS.spectroM, n, LUT, floor), S: specImage(MS.spectroS, n, LUT, floor) }; }
    const img = specCache[key], WIN = L.meter('spectro', 'window', 8), f = fidx(t), span = Math.round(WIN * FPS), f0 = f - span, sx = Math.max(0, f0), sw = f + 1 - sx;
    const panes = mode === 'm' ? [['M', img.M, y, h]] : [['M', img.M, y, (h - 2) / 2], ['S', img.S, y + (h - 2) / 2 + 2, (h - 2) / 2]];
    for (const [nm, im, py, ph] of panes) {
      const dx = x + w * (sx - f0) / span;
      ctx.fillStyle = S.card; ctx.fillRect(x, py, w, ph);
      ctx.imageSmoothingEnabled = true; if (sw > 0) ctx.drawImage(im, sx, 0, sw, n, dx, py, x + w - dx, ph);
      for (const fq of [100, 1000, 10000]) { const Yy = Math.round(py + ph * (1 - Math.log(fq / 20) / Math.log(1000))) + 0.5; ctx.strokeStyle = rgba(S.ink, 0.14); ctx.beginPath(); ctx.moveTo(x, Yy); ctx.lineTo(x + w, Yy); ctx.stroke(); }
      lbl(ctx, S, nm, x + 8, py + 13, { size: 18, w: 700, a: 0.8 });
      if (nm === 'M') for (const [s, fq] of [['1k', 1000], ['100', 100]]) lbl(ctx, S, s, x + w - 4, Math.round(py + ph * (1 - Math.log(fq / 20) / Math.log(1000))) + 12, { size: 16, align: 'right', a: 0.6 });
    }
    for (let b = Math.ceil((t - WIN) / BAR); b * BAR <= t; b++) { const X = x + w * (b * BAR - (t - WIN)) / WIN; if (X < x + 20) continue; ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(Math.round(X), y + h, 1, 8); if (b % 2 === 0 && X < x + w - 120) lbl(ctx, S, String(D.song.startBar + b), X + 4, y + h + 16, { a: 0.55 }); }
    lbl(ctx, S, 'now', x + w, y + h + 16, { align: 'right', a: 0.7 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- IMAGER: vectorscope (polar sample / polar level / Lissajous),
  // vertical correlation bar, balance bar, per-band width numerics and the mirrored per-frequency width strip.
  // Original layout and colours (stage palettes); the measurement grammar follows a free imaging plug-in's manual.
  const IMG = { NIGREDO: ['#8a8a8a', '#ffffff', '#ffffff', '#c8c8c8'], ALBEDO: ['#6e4433', '#1a1917', '#1a1917', '#a8432e'], CITRINITAS: ['#6e4433', '#f0d79a', '#f0d79a', '#e0475f'], RUBEDO: ['#5a1020', '#ff9be0', '#a35cf0', '#e0475f'] };
  const imgCols = (S) => { const p = IMG[S.name] || [S.sig1, S.ink, S.ink, S.hot]; return { lo: p[0], hi: p[1], mid: p[2], neg: S.grey ? '#c8c8c8' : S.hot === p[3] ? p[3] : S.hot }; };
  function hatch(ctx, x, y, w, h, col) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); for (let d = -h; d < w + h; d += 4) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); } ctx.stroke(); ctx.restore(); }
  const GD = 320;
  function splat(dens, X, Y, wgt) {   // X, Y in 0..GD-2 (bilinear splat)
    const ix = Math.min(GD - 2, Math.max(0, Math.floor(X))), iy = Math.min(GD - 2, Math.max(0, Math.floor(Y))), fx = clamp(X - ix), fy = clamp(Y - iy);
    dens[iy * GD + ix] += wgt * (1 - fx) * (1 - fy); dens[iy * GD + ix + 1] += wgt * fx * (1 - fy); dens[(iy + 1) * GD + ix] += wgt * (1 - fx) * fy; dens[(iy + 1) * GD + ix + 1] += wgt * fx * fy;
  }
  function densImage(dens, C, rows) {
    const oc = M8._oc || (M8._oc = document.createElement('canvas')); oc.width = GD; oc.height = rows; const og = oc.getContext('2d'), im = og.createImageData(GD, rows), a = hx3(C.lo), b = hx3(C.hi);
    for (let j = 1; j < rows - 1; j++) for (let i = 1; i < GD - 1; i++) {
      const d = dens[j * GD + i]; if (d <= 0) continue; const nb = dens[j * GD + i - 1] + dens[j * GD + i + 1] + dens[(j - 1) * GD + i] + dens[(j + 1) * GD + i];
      const al = 1 - Math.exp(-(d + 0.085 * nb) * 1.36), o4 = (j * GD + i) * 4, m = clamp(d * 0.5);
      im.data[o4] = lerp(a[0], b[0], m); im.data[o4 + 1] = lerp(a[1], b[1], m); im.data[o4 + 2] = lerp(a[2], b[2], m); im.data[o4 + 3] = 255 * al;
    }
    og.putImageData(im, 0, 0); return oc;
  }
  M8.imager = (ctx, S, r, t, k) => {
    const [x0, y0, w, h] = r; reveal(ctx, x0, y0, w, h, k);
    const f = fidx(t), tf = tickF(t), C = imgCols(S), mode = L.meter('stereo', 'mode', 'sample'), range = L.meter('stereo', 'range', 40), gain = L.meter('stereo', 'gain', 1);
    const stripH = Math.round(clamp(h * 0.25, 54, 110)), barW = 8, corrX = x0 + w - 44, top = y0 + 34, scopeBot = y0 + h - stripH - 34;
    const R = Math.max(30, Math.min((corrX - 30 - x0) / 2 - 6, scopeBot - top)), cx = x0 + (corrX - 24 - x0) / 2 + 4, cy = top + R;
    // grid: half-disc (sample / level) or rotated square (Lissajous), ±45° safe lines, centre tick
    ctx.strokeStyle = rgba(S.ink, 0.2); ctx.lineWidth = 1;
    if (mode === 'lissajous') {
      const q = R * 0.5, mx = cx, my = cy - R * 0.5;
      ctx.beginPath(); ctx.moveTo(mx, my - q * 1.0); ctx.lineTo(mx + q, my); ctx.lineTo(mx, my + q); ctx.lineTo(mx - q, my); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - q / 2, my - q / 2); ctx.lineTo(mx + q / 2, my + q / 2); ctx.moveTo(mx + q / 2, my - q / 2); ctx.lineTo(mx - q / 2, my + q / 2); ctx.moveTo(mx, my - q); ctx.lineTo(mx, my + q); ctx.stroke();
      lbl(ctx, S, 'L', mx - q / 2 - 12, my - q / 2 - 10, { size: 18, align: 'center', a: 0.7 }); lbl(ctx, S, 'R', mx + q / 2 + 12, my - q / 2 - 10, { size: 18, align: 'center', a: 0.7 });
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); for (const a of [-Math.PI / 4, Math.PI / 4]) { ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); } ctx.stroke();
      ctx.strokeStyle = rgba(S.ink, 0.35); ctx.beginPath(); ctx.moveTo(cx - R, cr(cy)); ctx.lineTo(cx + R, cr(cy)); ctx.moveTo(cr(cx), cy); ctx.lineTo(cr(cx), cy - 6); ctx.stroke();
      ctx.strokeStyle = rgba(S.ink, 0.1); ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, Math.PI, 2 * Math.PI); ctx.stroke();   // -range/2 dB ring
      lbl(ctx, S, 'L', cx - R - 4, cy - 12, { size: 18, align: 'right', a: 0.7 }); lbl(ctx, S, 'R', cx + R + 4, cy - 12, { size: 18, a: 0.7 });
    }
    // clipped samples in this frame: the rim lights in the over colour
    let clip = false; { const lv = D.lv, b1 = Math.min(lv.n, Math.floor(f / FPS * lv.rate)), b0 = Math.max(0, b1 - Math.round(lv.rate / FPS)); for (let b = b0; b < b1; b++) if (lv.clipL[b] || lv.clipR[b]) clip = true; }
    if (clip && mode !== 'lissajous') { ctx.strokeStyle = C.neg; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = 1; }
    if (mode === 'level') {
      // rays of per-sector level: fill (instant attack, release `smoothing` dB/s) + outline (hold, 3 dB/s)
      const PN = D.polarN, rel = L.meter('stereo', 'smoothing', 12), hold = L.meter('stereo', 'hold', 0.5), rho = (db) => clamp(1 + db / range, 0, 1);
      const fill = [], out = [];
      for (let j = 0; j < PN; j++) { const g = (ff) => D.polar[ff * PN + j] + 20 * Math.log10(gain); fill.push(rho(ML.releaseAt(g, f, FPS, rel, -range - 1))); out.push(rho(ML.releaseAt(g, f, FPS, 3, -range - 1, hold))); }
      const P = (j, v) => { const th = -Math.PI / 2 + (j + 0.5) / PN * Math.PI; return [cx + R * v * Math.sin(th), cy - R * v * Math.cos(th)]; };
      ctx.beginPath(); ctx.moveTo(cx, cy); for (let j = 0; j < PN; j++) { const p = P(j, fill[j]); ctx.lineTo(p[0], p[1]); } ctx.closePath(); ctx.fillStyle = rgba(C.mid, 0.55); ctx.fill();
      for (let j = 0; j < PN; j += 1) if (fill[j] > 0.02) { const p = P(j, fill[j]); ctx.strokeStyle = rgba(C.hi, 0.5); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
      ctx.beginPath(); for (let j = 0; j < PN; j++) { const p = P(j, out[j]); j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.strokeStyle = rgba(C.hi, 0.95); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
    } else {
      // dots: every 8 kHz sample of the last `persist` s, weight exp(-age/(0.31 T))·(1 - age/T), splatted into a density
      const dens = M8._dens || (M8._dens = new Float32Array(GD * GD)); dens.fill(0);
      const Tp = Math.max(1 / FPS, L.meter('stereo', 'persist', 0.42)), keep = Math.round(Tp * FPS), liss = mode === 'lissajous', sc = SC.scale * gain;
      let g = 1; if (liss) { const peakAt = (ff) => { const [a0, a1] = scopeSpan(ff); let m = 0; for (let i = a0; i < a1; i++) m = Math.max(m, Math.abs(SC.L[i]), Math.abs(SC.R[i])); return 20 * Math.log10(Math.max(1e-6, m * sc)); };
        g = 0.9 / Math.max(0.075, 10 ** (ML.releaseAt(peakAt, f, FPS, 6, -24) / 20)); }
      const rows = liss ? GD : GD / 2;
      for (let back = 0; back <= keep; back++) { const ff = f - back; if (ff < 0) break; const age = back / FPS, wgt = Math.exp(-age / (0.31 * Tp)) * (1 - age / Tp); if (wgt <= 0) continue; const [a0, a1] = scopeSpan(ff);
        for (let i = a0; i < a1; i++) { const l = SC.L[i] * sc, rr = SC.R[i] * sc;
          if (liss) { const [X, Y] = ML.lissajous(l, rr, g * 0.5); splat(dens, (X + 0.5) * (GD - 2), (0.5 - Y) * (GD - 2), wgt); }
          else { const p = ML.polarSample(l, rr, range); if (p) splat(dens, (p[0] * 0.5 + 0.5) * (GD - 2), (1 - p[1]) * (rows - 2), wgt); } } }
      const oc = densImage(dens, C, rows); ctx.imageSmoothingEnabled = true;
      if (liss) ctx.drawImage(oc, 0, 0, GD, GD, cx - R * 0.5, cy - R, R, R);
      else ctx.drawImage(oc, 0, 0, GD, GD / 2, cx - R, cy - R, 2 * R, R);
    }
    lbl(ctx, S, { sample: 'POLAR SAMPLE', level: 'POLAR LEVEL', lissajous: 'LISSAJOUS' }[mode] || 'POLAR SAMPLE', x0 + 6, y0 + 14, { size: 18, a: 0.6 });
    // vertical correlation bar: +1 top, 0 mid, -1 bottom; fill 0 -> value, marker 8x2
    const c1 = top, c2 = scopeBot, cyM = (c1 + c2) / 2, Yc = (v) => cyM - (c2 - c1) / 2 * clamp(v, -1, 1), cv = F.corr[f];
    ctx.fillStyle = rgba(S.ink, 0.35); ctx.fillRect(corrX + barW / 2, c1, 1, c2 - c1);
    for (const v of [1, 0, -1]) ctx.fillRect(corrX + barW / 2 - 3, Math.round(Yc(v)), 7, 1);
    const fy0 = Math.min(Yc(0), Yc(cv)), fh = Math.abs(Yc(cv) - Yc(0));
    if (cv >= 0) { ctx.fillStyle = rgba(C.mid, 0.9); ctx.fillRect(corrX, fy0, barW, fh); } else if (S.grey) hatch(ctx, corrX, fy0, barW, fh, C.neg); else { ctx.fillStyle = C.neg; ctx.fillRect(corrX, fy0, barW, fh); }
    ctx.fillStyle = cv < 0 ? C.neg : S.ink; ctx.fillRect(corrX - 2, Math.round(Yc(cv)) - 1, barW + 4, 2);
    lbl(ctx, S, '+1', corrX + barW + 4, c1 + 4, { size: 15, a: 0.5 }); lbl(ctx, S, '0', corrX + barW + 4, cyM, { size: 15, a: 0.5 }); lbl(ctx, S, '−1', corrX + barW + 4, c2 - 4, { size: 15, a: 0.5 });
    const ct = F.corr[tf]; lbl(ctx, S, `${ct >= 0 ? '+' : '−'}${Math.abs(ct).toFixed(2)}`, x0 + w - 2, scopeBot + 18, { size: 18, align: 'right', a: 0.95, col: ct < 0 ? C.neg : S.ink });
    // balance bar under the scope: ±6 dB, 3 s window, negative = left louder
    const bx = x0 + 58, bw = corrX - 70 - bx, by = scopeBot + 16, bal = ML.balanceAt(D.lv, f / FPS, 3), Xb = (v) => bx + bw * (clamp(v, -6, 6) + 6) / 12;
    ctx.fillStyle = rgba(S.ink, 0.12); ctx.fillRect(bx, by, bw, 4); ctx.fillStyle = rgba(S.ink, 0.5); ctx.fillRect(Math.round(Xb(0)), by - 3, 1, 10);
    ctx.fillStyle = rgba(C.mid, 0.9); ctx.fillRect(Math.min(Xb(0), Xb(bal)), by, Math.abs(Xb(bal) - Xb(0)), 4); ctx.fillStyle = S.ink; ctx.fillRect(Math.round(Xb(bal)) - 1, by - 3, 2, 10);
    lbl(ctx, S, 'BAL', x0 + 6, by + 2, { size: 15, a: 0.6 }); lbl(ctx, S, 'L', bx - 2, by + 16, { size: 13, a: 0.4 }); lbl(ctx, S, 'R', bx + bw + 2, by + 16, { size: 13, a: 0.4, align: 'right' });
    M8.widthStrip(ctx, S, [x0, y0 + h - stripH, w, stripH], t, C);
    ctx.restore();
  };
  M8.stereo = M8.imager;
  // mirrored per-frequency width W(f) = PS/(PM+PS) about a centre line (a mono mix is a flat line), log f 20 Hz..20 kHz,
  // crossover splits at the analysis bands with per-band width % (ticked on the half beat)
  M8.widthStrip = (ctx, S, r, t, C = imgCols(S)) => {
    const [x, y, w, h] = r, MS = D.ms, nW = MS.wBins, f = fidx(t), tf = tickF(t), cy = y + h * 0.42, hh = h * 0.36, Xf = (fq) => x + w * Math.log(fq / 20) / Math.log(1000);
    ctx.fillStyle = rgba(S.ink, 0.05); ctx.fillRect(x, y, w, h * 0.84); ctx.fillStyle = rgba(S.ink, 0.35); ctx.fillRect(x, Math.round(cy), w, 1);
    const pts = []; for (let j = 0; j < nW; j++) pts.push([Xf(20 * 1000 ** ((j + 0.5) / nW)), MS.widthSpec[f * nW + j] / 255]);
    ctx.beginPath(); pts.forEach(([X, v], i) => (i ? ctx.lineTo(X, cy - v * hh) : ctx.moveTo(X, cy - v * hh))); for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], cy + pts[i][1] * hh); ctx.closePath();
    ctx.fillStyle = rgba(C.mid, 0.35); ctx.fill(); ctx.strokeStyle = S.ink; ctx.lineWidth = 1.25; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
    const xo = MS.xover, edges = [20, ...xo, 20000];
    ctx.strokeStyle = rgba(S.ink, 0.4); ctx.setLineDash([2, 3]); ctx.beginPath(); for (const fq of xo) { const X = cr(Xf(fq)); ctx.moveTo(X, y); ctx.lineTo(X, y + h * 0.84); } ctx.stroke(); ctx.setLineDash([]);
    for (let b = 0; b < 4; b++) { const xa = Xf(edges[b]), xb = Xf(edges[b + 1]), v = MS.bandWidth[tf * 4 + b];
      lbl(ctx, S, `${Math.round(v)}%`, (xa + xb) / 2, y + h - 10, { size: 16, align: 'center', a: 0.9, maxW: xb - xa - 6 }); }
    lbl(ctx, S, 'W', x + 4, y + 12, { size: 14, a: 0.55 });
  };

  // ---------------------------------------------------------------- SCOPE: L/R traces, sample-accurate (wave2), triggered on the beat
    const W2 = L.W2;
  M8.trace = (ctx, S, r, t, o = {}) => {   // o.span seconds shown, o.amp vertical gain, o.lanes [[ch, yCentreFrac]]
    const [x, y, w, h] = r, span = o.span || BEAT, t0 = Math.floor(t / (BEAT / 4)) * (BEAT / 4) - span + (t % (BEAT / 4)), cps = D.wave2.cps;
    const val = (tt, ch, j) => { const fi = clamp(tt * cps - 0.5, 0, D.wave2.n - 1.001), i = Math.floor(fi), u = fi - i; return tt < 0 ? 0 : lerp(W2[i * 6 + ch * 3 + j], W2[(i + 1) * 6 + ch * 3 + j], u) / 127; };
    for (const [ch, yc, col] of o.lanes || [[0, 0.3, S.ink], [1, 0.7, S.sig2]]) {
      const g = h * (o.amp || 0.22), Yv = (v) => y + h * yc - v * g;
      ctx.beginPath();   // envelope (min..max), linear-interpolated between the 2.5 ms columns
      for (let px = 0; px <= w; px += 2) { const tt = t0 + span * px / w; px ? ctx.lineTo(x + px, Yv(val(tt, ch, 1))) : ctx.moveTo(x + px, Yv(val(tt, ch, 1))); }
      for (let px = w; px >= 0; px -= 2) ctx.lineTo(x + px, Yv(val(t0 + span * px / w, ch, 0)));
      ctx.closePath(); ctx.fillStyle = rgba(col, 0.2); ctx.fill();
      ctx.beginPath();   // the beam: centre of the envelope
      for (let px = 0; px <= w; px += 2) { const tt = t0 + span * px / w, v = (val(tt, ch, 0) + val(tt, ch, 1)) / 2; px ? ctx.lineTo(x + px, Yv(v)) : ctx.moveTo(x + px, Yv(v)); }
      ctx.strokeStyle = rgba(col, 0.14); ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    }
  };
  // folded-light spectral surface: spectral history as lit ridges (the orbit steps on the bar)
  M8.surface = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const f = fidx(t), ROWS = Math.max(4, Math.round(L.meter('surface', 'rows', 34))), COLS = 64, STR = 2, yaw = -0.5 + 0.12 * ((Math.floor(t / BAR) % 4) - 1.5), pitch = 0.62, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), spn = Math.sin(pitch);
    const sc = Math.min(w * 0.5, h * 0.9), ox = x + w / 2, oy = y + h * 0.66;
    const proj = (u, v, hv) => { const X = u * 1.25, Z = (v - 0.5) * 1.6, Yv = hv * 0.8, xr = X * cyw - Z * syw, zr = X * syw + Z * cyw, yr = Yv * cp - zr * spn, zz = Yv * spn + zr * cp, p = 4 / (4 + zz); return [ox + xr * sc * p, oy - yr * sc * p]; };
    const H = []; for (let ri = 0; ri < ROWS; ri++) { const ff = f - ri * STR, sp = F.spec[Math.max(0, ff)], row = new Float32Array(COLS); for (let c = 0; c < COLS; c++) row[c] = ff < 0 ? 0 : clamp((sp[Math.floor(c * sp.length / COLS)] + 84) / 72); H.push(row); }
    const P = H.map((row, ri) => Array.from(row, (hv, c) => proj(c / (COLS - 1) * 2 - 1, ri / (ROWS - 1), hv)));
    for (let ri = ROWS - 2; ri >= 0; ri--) {
      const fade = 1 - ri / ROWS;
      for (let c = 0; c < COLS - 1; c++) {
        const h0 = H[ri][c], h1 = H[ri][c + 1], h2 = H[ri + 1][c], nx = -(h1 - h0) * 6, nz = -(h2 - h0) * 3, nl = Math.hypot(nx, 1, nz), lit = clamp(0.5 + 0.5 * (nx * 0.45 + 0.8 - nz * 0.35) / nl);
        ctx.fillStyle = mix(S.sig1, S.ink, lit, (0.04 + 0.34 * lit * lit) * fade * clamp(0.2 + (h0 + h1) * 1.2));
        const a = P[ri][c], b = P[ri][c + 1], cc = P[ri + 1][c + 1], d = P[ri + 1][c];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(cc[0], cc[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); P[ri].forEach((p, c) => (c ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = rgba(S.ink, ri === 0 ? 0.95 : 0.06 + 0.2 * fade); ctx.lineWidth = ri === 0 ? 2 : 1; ctx.stroke(); ctx.lineWidth = 1;
    }
    lbl(ctx, S, '64 bands', x + w - 4, y + 14, { align: 'right', a: 0.6 });
    ctx.restore();
  };

  return M;
}
