/* Meter + DAW components. Every value is read from the analysed clip (tools/clipdata.py, tested against
 * ffmpeg/pyloudnorm/numpy in tests/test_meters.py). Signature: (ctx, S, rect, t, k) with k = reveal step 0..1
 * (counted steps from the card, never an opacity ramp). Exposes L6.M. */
(function () {
  'use strict';
  const L = window.L6, { D, F, FPS, NF, BEAT, BAR, T, U, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, SANS, MONO, SERIF } = L;
  const lab = L.lab;
  const M = {};
  const X20 = (f, x, w) => x + w * Math.log(f / 20) / Math.log(1000);
  const lbl = (ctx, S, s, x, y, o = {}) => text(ctx, s, x, y, { size: o.size || 11, col: rgba(o.col || S.ink, o.a == null ? 0.6 : o.a), align: o.align, w: o.w || 500, ls: o.ls == null ? 0.6 : o.ls });
  // reveal: content is uncovered in horizontal bands (k = 0, .25, .5, .75, 1): a stepped wipe, no alpha
  function reveal(ctx, x, y, w, h, k) { ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, w + 4, (h + 4) * k); ctx.clip(); }

  // ---------------------------------------------------------------- SESSION: Ableton-arrangement-inspired
  M.session = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const f = fidx(t), song = D.song;
    // clip header bar
    const hy = y, hh = 24;
    ctx.fillStyle = rgba(S.sig1, S.name === 'ALBEDO' ? 0.18 : 0.28); ctx.fillRect(x, hy, w, hh);
    ctx.fillStyle = rgba(S.sig1, 0.9); ctx.fillRect(x, hy, 4, hh);
    text(ctx, `${D.title} · EXP-03 · TRIAL ${Math.round(D.bpm)}`, x + 12, hy + hh / 2 + 1, { size: 12, w: 700, col: S.ink, ls: 1 });
    lbl(ctx, S, `${D.bars} BARS · ${D.bpm.toFixed(2)} BPM · ${D.key} · 4/4`, x + w - 8, hy + hh / 2 + 1, { align: 'right', a: 0.8 });
    // song overview lane (whole track) with sections + clip bracket
    const oy = hy + hh + 8, oh = 34;
    const ov = song.overview, sx = (st) => x + w * st / song.duration;
    for (const q of song.phrases) {
      const a0 = song.bar1 + (q.bar - 1) * BAR, a1 = a0 + q.bars * BAR;
      if (a0 > song.duration) continue;
      ctx.fillStyle = rgba(q.label === 'drop' ? S.sig2 : q.label === 'break' ? S.dim : S.rule, q.label === 'drop' ? 0.16 : 0.06);
      ctx.fillRect(sx(a0), oy, sx(Math.min(a1, song.duration)) - sx(a0) - 1, oh);
    }
    let lastLab = '';
    for (const q of song.phrases) { if (q.label !== lastLab) lbl(ctx, S, q.label.toUpperCase(), sx(song.bar1 + (q.bar - 1) * BAR) + 3, oy + 7, { size: 8, a: 0.55 }); lastLab = q.label; }
    ctx.fillStyle = rgba(S.ink, 0.55);
    for (let i = 0; i < ov.length; i++) { const v = ov[i] / 1000 * (oh - 14) * 0.5; ctx.fillRect(x + w * i / ov.length, oy + 21 - v, Math.max(1, w / ov.length), v * 2); }
    const c0 = sx(song.startTime), c1 = sx(song.startTime + D.duration);
    ctx.strokeStyle = rgba(S.hot, 0.95); ctx.lineWidth = 1.5; ctx.strokeRect(c0, oy - 2, c1 - c0, oh + 4); ctx.lineWidth = 1;
    ctx.fillStyle = rgba(S.hot, 1); ctx.fillRect(sx(song.startTime + t), oy - 4, 2, oh + 8);
    // ruler: song bar numbers + beat ticks over the detail window (4 bars, playhead at 30 %)
    const ry = oy + oh + 10, rh = 20, span = 4 * BAR, t0 = t - 0.3 * span, tx = (tt) => x + w * (tt - t0) / span;
    ctx.strokeStyle = rgba(S.ink, 0.35); ctx.beginPath(); ctx.moveTo(x, ry + rh); ctx.lineTo(x + w, ry + rh); ctx.stroke();
    for (let b = Math.floor(t0 / BEAT) - 1; b * BEAT < t0 + span + BEAT; b++) {
      const X = Math.round(tx(b * BEAT)) + 0.5; if (X < x || X > x + w) continue;
      const isBar = ((b % 4) + 4) % 4 === 0;
      ctx.strokeStyle = rgba(S.ink, isBar ? 0.75 : 0.35); ctx.beginPath(); ctx.moveTo(X, ry + (isBar ? 2 : 12)); ctx.lineTo(X, ry + rh); ctx.stroke();
      if (isBar) lbl(ctx, S, String(song.startBar + b / 4), X + 3, ry + 7, { size: 11, w: 700, a: 0.9 });
      else lbl(ctx, S, `.${((b % 4) + 4) % 4 + 1}`, X + 2, ry + 9, { size: 8, a: 0.4 });
    }
    // warp-marker style ticks on transients (quantised kick + snare positions)
    const wy = ry + rh + 2;
    for (const [kind, col] of [['kick', S.sig2], ['snare', S.sig1]]) for (const [, s, tq] of D.onsets[kind]) {
      const X = tx(tq); if (X < x || X > x + w) continue;
      ctx.fillStyle = rgba(col, tq <= t ? 1 : 0.45); ctx.beginPath(); ctx.moveTo(X - 4, wy); ctx.lineTo(X + 4, wy); ctx.lineTo(X, wy + 6); ctx.fill();
    }
    // detail lanes L / R: peak (light) + RMS (solid), coloured by spectral tone
    const ly = wy + 10, lanes = ['L', 'R'], laneH = (h - (ly - y) - 64) / 2;
    const cps = D.wave.cps;
    lanes.forEach((ch, li) => {
      const cy = ly + laneH * li + laneH / 2;
      ctx.strokeStyle = rgba(S.ink, 0.12); ctx.beginPath(); ctx.moveTo(x, cy + 0.5); ctx.lineTo(x + w, cy + 0.5); ctx.stroke();
      lbl(ctx, S, ch, x + 3, cy - laneH / 2 + 8, { size: 10, w: 700 });
      const W = D.wave[ch], step = 1.5;
      for (let px = 0; px < w; px += step) {
        const tt = t0 + span * px / w; if (tt < 0 || tt >= D.duration) continue;
        const i = Math.floor(tt * cps), v = W[i]; if (!v) continue;
        const [mn, mx, rm] = v, tone = D.wave.tone[i], lo = clamp(tone[0] / 100), hi = clamp(tone[1] / 60);
        const col = mix(S.waveHi, S.waveLo, lo - hi * 0.5 + 0.3);
        const played = tt <= t;
        ctx.fillStyle = played ? col : mix(S.dim, S.dim, 0, 0.55);
        const sc = laneH * 0.46 / 1000;
        ctx.globalAlpha = played ? 0.45 : 0.3; ctx.fillRect(x + px, cy - mx * sc, step, Math.max(1, (mx - mn) * sc));
        ctx.globalAlpha = played ? 1 : 0.55; ctx.fillRect(x + px, cy - rm * sc, step, Math.max(1, rm * 2 * sc));
      }
      ctx.globalAlpha = 1;
    });
    // onset lanes
    const oy2 = ly + laneH * 2 + 6, lh = 18;
    [['KICK', 'kick', S.sig2], ['SNR', 'snare', S.sig1], ['HAT', 'hat', S.ink]].forEach(([nm, kind, col], i) => {
      const yy = oy2 + i * lh;
      lbl(ctx, S, nm, x + 2, yy + lh / 2, { size: 9, w: 700, a: 0.7 });
      ctx.strokeStyle = rgba(S.ink, 0.08); ctx.beginPath(); ctx.moveTo(x + 40, yy + lh - 0.5); ctx.lineTo(x + w, yy + lh - 0.5); ctx.stroke();
      for (const [, s, tq] of D.onsets[kind]) {
        const X = tx(tq); if (X < x + 40 || X > x + w) continue;
        const hit = tq <= t && t - tq < BEAT / 4;
        ctx.fillStyle = rgba(hit ? S.hot : col, tq <= t ? 1 : 0.4); ctx.fillRect(X, yy + 3 + (1 - s) * 5, hit ? 4 : 2.5, lh - 6 - (1 - s) * 5);
      }
    });
    // playhead
    const PX = Math.round(tx(t));
    ctx.fillStyle = rgba(S.hot, 1); ctx.fillRect(PX, ry - 2, 2, h - (ry - y));
    ctx.beginPath(); ctx.moveTo(PX - 6, ry - 4); ctx.lineTo(PX + 8, ry - 4); ctx.lineTo(PX + 1, ry + 4); ctx.fill();
    lbl(ctx, S, bbt(t), PX + 8, ry + rh + 16, { size: 11, w: 700, col: S.hot, a: 1 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- SPECTRUM 1/6 oct + peak hold
  M.spectrum = (ctx, S, r, t, k) => {
    const [x, y, w, h0] = r, h = h0 - 18; reveal(ctx, x, y, w, h0, k);
    const f = fidx(t), sp = F.spec[f], hd = F.hold[f], c = D.oct6, Y = (v) => y + h * clamp(-v / 90);
    ctx.lineWidth = 1;
    for (const d of [0, -18, -36, -54, -72, -90]) { const yy = Math.round(Y(d)) + 0.5; ctx.strokeStyle = rgba(S.ink, 0.08); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); lbl(ctx, S, String(d), x + 2, yy - 6, { size: 9, a: 0.45 }); }
    for (const [s, fq] of [['20', 20], ['100', 100], ['1k', 1000], ['10k', 10000], ['20k', 20000]]) { const X = X20(fq, x, w); ctx.strokeStyle = rgba(S.ink, 0.08); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); lbl(ctx, S, s, Math.min(x + w - 8, Math.max(x + 6, X)), y + h + 10, { size: 9, a: 0.5, align: 'center' }); }
    // bars per 1/6 octave band (instrument look), plus the line on top
    const bw = w / c.length;
    for (let i = 0; i < c.length; i++) {
      const X = X20(c[i], x, w) - bw * 0.35, top = Y(sp[i]);
      ctx.fillStyle = mix(S.sig1, S.sig2, i / c.length, S.name === 'ALBEDO' ? 0.35 : 0.42); ctx.fillRect(X, top, bw * 0.7, y + h - top);
      ctx.fillStyle = rgba(S.ink, 0.95); ctx.fillRect(X, Y(hd[i]) - 1, bw * 0.7, 2);
    }
    ctx.beginPath(); for (let i = 0; i < c.length; i++) { const X = X20(c[i], x, w), Yy = Y(sp[i]); i ? ctx.lineTo(X, Yy) : ctx.moveTo(X, Yy); }
    ctx.strokeStyle = rgba(S.ink, 0.9); ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
    lbl(ctx, S, '1/6 OCT · HOLD 1 s', x + w - 2, y + 6, { size: 9, align: 'right', a: 0.55 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- SPECTROGRAM (scrolling, 4 s)
  let spectroCanvas = null, spectroStage = null;
  function spectroImage(S) {
    if (spectroCanvas && spectroStage === S.name) return spectroCanvas;
    const n = D.spectroBins, c = document.createElement('canvas'); c.width = NF; c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(NF, n), stops = S.spec.map((h) => parseInt(h.slice(1), 16));
    for (let f = 0; f < NF; f++) for (let b = 0; b < n; b++) {
      const v = clamp((L.SPECTRO[f * n + b] / 255 * 100 - 100 + 96) / 84), xk = v * (stops.length - 1), i0 = Math.min(stops.length - 2, Math.floor(xk)), q = xk - i0;
      const a = stops[i0], bb = stops[i0 + 1], o = ((n - 1 - b) * NF + f) * 4;
      im.data[o] = lerp((a >> 16) & 255, (bb >> 16) & 255, q); im.data[o + 1] = lerp((a >> 8) & 255, (bb >> 8) & 255, q); im.data[o + 2] = lerp(a & 255, bb & 255, q); im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0); spectroCanvas = c; spectroStage = S.name; return c;
  }
  M.spectro = (ctx, S, r, t, k) => {
    const [x, y, w, h0] = r, h = h0 - 18; reveal(ctx, x, y, w, h0, k);
    const img = spectroImage(S), f = fidx(t), span = 4 * FPS, f0 = f - span;
    ctx.fillStyle = S.spec[0]; ctx.fillRect(x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    const sx = Math.max(0, f0), sw = f + 1 - sx, dx = x + w * (sx - f0) / span;
    if (sw > 0) ctx.drawImage(img, sx, 0, sw, D.spectroBins, dx, y, x + w - dx, h);
    for (const [s, fq] of [['10k', 10000], ['1k', 1000], ['100', 100]]) { const Yy = y + h * (1 - Math.log(fq / 20) / Math.log(1000)); ctx.strokeStyle = rgba(S.ink, 0.25); ctx.beginPath(); ctx.moveTo(x + w - 30, Yy); ctx.lineTo(x + w, Yy); ctx.stroke(); lbl(ctx, S, s, x + w - 34, Yy, { size: 9, align: 'right', a: 0.7 }); }
    // bar lines in the history
    for (let b = Math.ceil((t - 4) / BAR); b * BAR <= t; b++) { const X = x + w * (b * BAR - (t - 4)) / 4; if (X < x) continue; ctx.fillStyle = rgba(S.ink, 0.35); ctx.fillRect(X, y + h, 1, 6); lbl(ctx, S, String(D.song.startBar + b), X + 2, y + h + 10, { size: 9, a: 0.55 }); }
    lbl(ctx, S, 'now', x + w, y + h + 10, { size: 9, align: 'right', a: 0.6 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- LEVELS: peak/RMS + LUFS M/S/I + LRA + TP
  M.levels = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const f = fidx(t), mh = h * 0.7, my = y + 4, bw = Math.min(24, w * 0.09), gx = x + 30, Yd = (d) => my + mh * clamp(-d / 60);
    for (const d of [0, -3, -6, -12, -18, -24, -36, -48, -60]) { lbl(ctx, S, String(d), gx - 6, Yd(d), { size: 9, align: 'right', a: 0.5 }); ctx.fillStyle = rgba(S.ink, 0.25); ctx.fillRect(gx - 3, Yd(d), 3, 1); }
    [[F.rmsL[f], F.pkL[f], F.hlL[f], 'L'], [F.rmsR[f], F.pkR[f], F.hlR[f], 'R']].forEach(([rms, pk, hold, nm], i) => {
      const bx = gx + i * (bw + 5);
      ctx.fillStyle = rgba(S.ink, 0.06); ctx.fillRect(bx, my, bw, mh);
      for (let yy = my + mh; yy > Yd(rms); yy -= 4) { const lv = -60 * (yy - my) / mh; ctx.fillStyle = lv > -6 ? S.hot : lv > -18 ? S.sig2 : S.sig1; ctx.fillRect(bx, Math.max(Yd(rms), yy - 3), bw, Math.min(3, yy - Yd(rms))); }
      for (let yy = Yd(rms); yy > Yd(pk); yy -= 4) { ctx.fillStyle = rgba(S.ink, 0.35); ctx.fillRect(bx, Math.max(Yd(pk), yy - 3), bw, Math.min(3, yy - Yd(pk))); }
      ctx.fillStyle = S.ink; ctx.fillRect(bx, Yd(hold) - 1, bw, 2);
      lbl(ctx, S, nm, bx + bw / 2, my + mh + 9, { size: 9, align: 'center', w: 700 });
      lbl(ctx, S, fmt(hold), bx + bw / 2, my + mh + 23, { size: 10, align: 'center', a: 0.9 });
    });
    const rx = gx + 2 * bw + 18;
    const rows = [['M', F.M[f], 'LUFS'], ['S', F.S[f], 'LUFS'], ['LRA', F.LRA[f], 'LU'], ['TP', F.TP[f], 'dBTP']];
    const rs = Math.min(24, (mh - 56) / 4);
    rows.forEach(([nm, v, u], i) => { const yy = my + 10 + i * rs; lbl(ctx, S, nm, rx, yy, { size: 10, w: 700, a: 0.65 }); text(ctx, nm === 'LRA' ? v.toFixed(1) : fmt(v), x + w - 30, yy + 1, { size: 15, w: 500, col: S.ink, align: 'right' }); lbl(ctx, S, u, x + w - 2, yy + 1, { size: 8, align: 'right', a: 0.45 }); });
    const isz = Math.min(40, (x + w - rx) * 0.3, mh - 4 * rs - 30);
    lbl(ctx, S, 'INTEGRATED', rx, my + mh - isz - 6, { size: 9, w: 700, a: 0.65 });
    text(ctx, fmt(F.I[f]), rx - 2, my + mh - 2, { size: isz, w: 500, col: S.ink, base: 'alphabetic' });
    lbl(ctx, S, 'LUFS', x + w - 2, my + mh - 14, { size: 9, align: 'right', a: 0.5 });
    lbl(ctx, S, `TARGET −14.0 · ffmpeg I ${fmt(D.summary.ffmpeg.I)} · LRA ${D.summary.ffmpeg.LRA.toFixed(1)}`, x, y + h - 4, { size: 8, a: 0.5 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- GONIOMETER + correlation
  M.gonio = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const f = fidx(t), R = Math.min(w * 0.44, (h - 46) * 0.5), cx = x + w / 2, cy = y + R + 8;
    ctx.strokeStyle = rgba(S.ink, 0.2);
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx + R, cy); ctx.lineTo(cx, cy + R); ctx.lineTo(cx - R, cy); ctx.closePath(); ctx.stroke();
    for (const [a, b] of [[[cx, cy - R], [cx, cy + R]], [[cx - R, cy], [cx + R, cy]], [[cx - R / 2, cy - R / 2], [cx + R / 2, cy + R / 2]], [[cx + R / 2, cy - R / 2], [cx - R / 2, cy + R / 2]]]) { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
    lbl(ctx, S, 'M', cx, cy - R - 7, { size: 9, align: 'center', w: 700 }); lbl(ctx, S, 'L', cx - R / 2 - 8, cy - R / 2 - 8, { size: 9, align: 'center' }); lbl(ctx, S, 'R', cx + R / 2 + 8, cy - R / 2 - 8, { size: 9, align: 'center' });
    lbl(ctx, S, '+S', cx + R + 10, cy, { size: 9, align: 'center' }); lbl(ctx, S, '−S', cx - R - 10, cy, { size: 9, align: 'center' });
    const N = D.gonioN;
    for (let back = 2; back >= 0; back--) {           // phosphor persistence: the last 3 frames of points
      const ff = Math.max(0, f - back);
      ctx.fillStyle = back ? rgba(S.sig1, back === 1 ? 0.45 : 0.22) : rgba(S.ink, 0.95);
      for (let i = 0; i < N; i++) { const sx = L.GS[ff * N + i] / 127, my = L.GM[ff * N + i] / 127; ctx.fillRect(cx + sx * R - 1, cy - my * R - 1, 2, 2); }
    }
    const c = F.corr[f], by = y + h - 12;
    ctx.strokeStyle = rgba(S.ink, 0.35); ctx.beginPath(); ctx.moveTo(x + 18, by); ctx.lineTo(x + w - 18, by); ctx.stroke();
    for (const q of [-1, 0, 1]) { const X = x + 18 + (w - 36) * (q + 1) / 2; ctx.fillStyle = rgba(S.ink, 0.5); ctx.fillRect(X, by - 4, 1, 8); }
    const cxp = x + 18 + (w - 36) * (c + 1) / 2;
    ctx.fillStyle = rgba(c < 0 ? S.hot : S.sig2, 1); ctx.fillRect(Math.min(cxp, x + w / 2), by - 2, Math.abs(cxp - (x + w / 2)), 4);
    ctx.fillStyle = S.ink; ctx.fillRect(cxp - 1.5, by - 7, 3, 14);
    lbl(ctx, S, `CORR ${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(2)}`, x + w - 2, y + 4, { size: 10, w: 700, align: 'right', a: 0.9 });
    lbl(ctx, S, `WIDTH ${F.width[f].toFixed(2)}`, x + 2, y + 4, { size: 10, a: 0.7 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- SPECTRAL BALANCE vs pink + per-band energy
  M.balance = (ctx, S, r, t, k) => {
    const [x, y, w, h0] = r, h = h0 - 30; reveal(ctx, x, y, w, h0, k);
    const f = fidx(t), b = F.bal[f], n = b.length, bw = w / n, zy = y + h / 2, sc = h / 2 / 15;
    ctx.strokeStyle = rgba(S.ink, 0.5); ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, zy); ctx.lineTo(x + w, zy); ctx.stroke(); ctx.setLineDash([]);
    lbl(ctx, S, 'PINK = 0 dB', x + 2, zy - 8, { size: 8, a: 0.5 });
    for (let i = 0; i < n; i++) {
      const v = clamp(b[i], -15, 15), X = x + i * bw + bw * 0.18;
      ctx.fillStyle = v >= 0 ? rgba(S.sig2, 0.85) : rgba(S.sig1, 0.85);
      ctx.fillRect(X, v >= 0 ? zy - v * sc : zy, bw * 0.64, Math.abs(v) * sc);
      lbl(ctx, S, D.oct1[i] >= 1000 ? (D.oct1[i] / 1000) + 'k' : String(Math.round(D.oct1[i])), X + bw * 0.32, y + h + 9, { size: 8, align: 'center', a: 0.5, ls: 0 });
    }
    const tilt = F.tilt[f];
    ctx.strokeStyle = rgba(S.hot, 0.9); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, zy + tilt * 4.5 * sc); ctx.lineTo(x + w, zy - tilt * 4.5 * sc); ctx.stroke(); ctx.lineWidth = 1;
    lbl(ctx, S, `TILT ${tilt >= 0 ? '+' : '−'}${Math.abs(tilt).toFixed(1)} dB/oct`, x + w - 2, y + 6, { size: 9, w: 700, align: 'right', a: 0.85 });
    // per-band energy strip
    const be = F.bands[f], ey = y + h + 18;
    D.bandNames.forEach((nm, i) => { const bx = x + i * w / 6; ctx.fillStyle = rgba(S.ink, 0.08); ctx.fillRect(bx + 2, ey, w / 6 - 4, 8); ctx.fillStyle = mix(S.sig1, S.sig2, i / 5, 1); ctx.fillRect(bx + 2, ey, (w / 6 - 4) * clamp(be[i]), 8); });
    ctx.restore();
  };

  // ---------------------------------------------------------------- BPM / PHASE CLOCK
  M.clock = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const R = Math.min(h * 0.42, w * 0.2), cx = x + R + 8, cy = y + h / 2;
    ctx.strokeStyle = rgba(S.ink, 0.35); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + i * Math.PI / 8, L0 = i % 4 === 0 ? R * 0.72 : R * 0.88; ctx.strokeStyle = rgba(S.ink, i % 4 === 0 ? 0.9 : 0.35); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * L0, cy + Math.sin(a) * L0); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    // hand jumps 16th to 16th (stepped on the grid, like a sequencer)
    const s16 = Math.floor(t / (BEAT / 4)) % 16, a = -Math.PI / 2 + s16 * Math.PI / 8;
    ctx.strokeStyle = S.hot; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = S.hot; ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 7); ctx.fill();
    const tx0 = cx + R + 18;
    text(ctx, D.bpm.toFixed(2), tx0, cy - R * 0.32, { size: Math.min(34, h * 0.24), w: 500, col: S.ink });
    lbl(ctx, S, 'BPM · GRID LOCK', tx0, cy - R * 0.32 + Math.min(24, h * 0.17), { size: 9, a: 0.6 });
    text(ctx, bbt(t), tx0, cy + R * 0.42, { size: Math.min(22, h * 0.16), w: 700, col: S.hot });
    lbl(ctx, S, `${D.key} · SONG BAR ${D.song.startBar + Math.floor(t / BAR)}`, tx0, cy + R * 0.42 + Math.min(20, h * 0.15), { size: 9, a: 0.6 });
    ctx.restore();
  };

  window.L6.M = M;
})();
