/* v8 DAW + v6-look meters. Every value is read from the analysed clip (tools/clipdata.py, tested against
 * ffmpeg/pyloudnorm/numpy in tests/test_meters.py). Signature: (ctx, S, rect, t, k) with k = reveal step 0..1
 * (counted steps from the window, never an opacity ramp). Type >= 22 px at the overview. Exposes L6.M. */
(function () {
  'use strict';
  const L = window.L6, { D, F, FPS, NF, BEAT, BAR, T, U, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, SANS, MONO } = L;
  const M = {};
  const X20 = (f, x, w) => x + w * Math.log(f / 20) / Math.log(1000);
  const lbl = (ctx, S, s, x, y, o = {}) => text(ctx, s, x, y, { size: o.size || 22, col: rgba(o.col || S.ink, o.a == null ? 0.7 : o.a), align: o.align, w: o.w || 500, ls: o.ls || 0, maxW: o.maxW });
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
    const ry = oy + oh + 6, rh = 28, span = 2 * BAR, t0 = t - 0.25 * span, tx = (tt) => x + w * (tt - t0) / span;
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
    const f = fidx(t), sp = F.spec[f], hd = F.hold[f], c = D.oct6, Y = (v) => y + h * clamp(-v / 90);
    for (const d of [0, -30, -60, -90]) { const yy = Math.round(Y(d)) + 0.5; ctx.strokeStyle = rgba(S.ink, 0.09); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); if (d > -90) lbl(ctx, S, String(d), x + 2, yy + 14, { a: 0.45 }); }
    for (const [s, fq] of [['20', 20], ['100', 100], ['1k', 1000], ['10k', 10000]]) { const X = X20(fq, x, w); ctx.strokeStyle = rgba(S.ink, 0.09); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); lbl(ctx, S, s, Math.min(x + w - 24, X + (fq === 20 ? 2 : -12)), y + h + 16, { a: 0.6 }); }
    const bw = w / c.length;
    for (let i = 0; i < c.length; i++) {
      const X = X20(c[i], x, w) - bw * 0.35, top = Y(sp[i]);
      ctx.fillStyle = mix(S.sig1, S.sig2, i / c.length, S.name === 'ALBEDO' ? 0.38 : 0.46); ctx.fillRect(X, top, bw * 0.7, y + h - top);
      ctx.fillStyle = rgba(S.ink, 0.95); ctx.fillRect(X, Y(hd[i]) - 1, bw * 0.7, 2);
    }
    // 0.22 s trail (older lines thinner and dimmer), then a soft glow and the live line
    const trail = Math.round(0.22 * FPS), line = (ff) => { ctx.beginPath(); const s2 = F.spec[Math.max(0, ff)]; for (let i = 0; i < c.length; i++) { const X = X20(c[i], x, w), Yy = Y(s2[i]); i ? ctx.lineTo(X, Yy) : ctx.moveTo(X, Yy); } };
    for (let q = trail; q >= 1; q--) { line(f - q); ctx.strokeStyle = rgba(S.ink, 0.2 * (1 - q / (trail + 1))); ctx.lineWidth = 1; ctx.stroke(); }
    line(f); ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(S.sig2, 0.18); ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = S.ink; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    lbl(ctx, S, '1/6 oct · hold 1 s', x + w - 2, y + 14, { align: 'right', a: 0.6 });
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

  // ---------------------------------------------------------------- BAND ENERGY: 6 segmented columns + onset counters
  M.bands = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const be = F.bands[fidx(t)], n = be.length, bw = w / n, bh = h - 34, top = be.indexOf(Math.max(...be));
    D.bandNames.forEach((nm, i) => {
      const X = x + i * bw + 4, v = clamp(be[i]), cw = bw - 8;
      ctx.fillStyle = rgba(S.ink, 0.07); ctx.fillRect(X, y, cw, bh);
      for (let yy = y + bh; yy > y + bh * (1 - v); yy -= 7) { ctx.fillStyle = i === top ? S.hot : mix(S.sig1, S.sig2, i / (n - 1), 1); ctx.fillRect(X, Math.max(y + bh * (1 - v), yy - 5), cw, Math.min(5, yy - (y + bh * (1 - v)))); }
      lbl(ctx, S, ['SUB', 'LO', 'LM', 'MID', 'HM', 'AIR'][i], X + cw / 2, y + bh + 17, { align: 'center', a: 0.7, maxW: bw - 2 });
    });
    ctx.restore();
  };

  window.L6.M = M;
})();
