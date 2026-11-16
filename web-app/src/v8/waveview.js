// v11 waveform (Rekordbox / Ableton arrangement view) drawn from the beat's own audio: int16 min/max/rms columns at
// ~2400 col/s with x4 LODs, ONE COLUMN PER DEVICE PIXEL (zoom aware), the playhead fixed at the centre with the
// waveform scrolling under it on the bar grid, three-band colouring by tone (low / mid / high energy of that
// column, greys in Nigredo), kick and snare transients marked at the measured onsets, an overview strip of the whole
// song with the clip bracket, and a bar ruler. The data path is unchanged from v9 so the waveform accuracy test
// (u2c-motion tests/test_waveform_render.py: every drawn column vs numpy over its exact sample range) still applies.
export function createWaveLODs(L) {
  const { D, clamp } = L;
  const src = D.wave3 || { cps: D.wave2.cps, n: D.wave2.n, spc: 0, data: D.wave2.data }, FS = D.wave3 ? 32767 : 127, n0 = src.n, lv = [];
  const l0 = { cps: src.cps, n: n0, k: 1, mn: [new Float32Array(n0), new Float32Array(n0)], mx: [new Float32Array(n0), new Float32Array(n0)], ms: [new Float32Array(n0), new Float32Array(n0)] };
  for (let i = 0; i < n0; i++) for (let ch = 0; ch < 2; ch++) { const q = i * 6 + ch * 3, r = src.data[q + 2] / FS; l0.mn[ch][i] = src.data[q] / FS; l0.mx[ch][i] = src.data[q + 1] / FS; l0.ms[ch][i] = r * r; }
  lv.push(l0);
  while (lv[lv.length - 1].n > 64) {
    const p = lv[lv.length - 1], n = Math.ceil(p.n / 4), o = { cps: p.cps / 4, n, k: p.k * 4, mn: [new Float32Array(n), new Float32Array(n)], mx: [new Float32Array(n), new Float32Array(n)], ms: [new Float32Array(n), new Float32Array(n)] };
    for (let i = 0; i < n; i++) for (let ch = 0; ch < 2; ch++) {
      let mn = 1e9, mx = -1e9, s = 0, c = 0;
      for (let j = i * 4; j < Math.min(p.n, i * 4 + 4); j++) { const w = Math.min(p.k, n0 - j * p.k); mn = Math.min(mn, p.mn[ch][j]); mx = Math.max(mx, p.mx[ch][j]); s += p.ms[ch][j] * w; c += w; }
      o.mn[ch][i] = mn; o.mx[ch][i] = mx; o.ms[ch][i] = s / Math.max(1, c);
    }
    lv.push(o);
  }
  /** min / max / rms over the source columns the span [ta, tb) covers, plus the exact clip-sample range (for the test). */
  const col = (ta, tb, ch) => {
    let l = 0; const need = (tb - ta) * lv[0].cps; while (l < lv.length - 1 && need / lv[l + 1].k >= 4) l++;
    const V = lv[l], i0 = clamp(Math.floor(ta * V.cps + 1e-9), 0, V.n - 1), i1 = clamp(Math.max(i0, Math.ceil(tb * V.cps - 1e-9) - 1), 0, V.n - 1);
    let mn = 1e9, mx = -1e9, s = 0, c = 0;
    for (let i = i0; i <= i1; i++) { const w = Math.min(V.k, n0 - i * V.k); if (V.mn[ch][i] < mn) mn = V.mn[ch][i]; if (V.mx[ch][i] > mx) mx = V.mx[ch][i]; s += V.ms[ch][i] * w; c += w; }
    return { mn, mx, rms: Math.sqrt(s / c), lod: l, s0: i0 * V.k * src.spc, s1: Math.min(n0, (i1 + 1) * V.k) * src.spc };
  };
  return { lv, col, spc: src.spc, sr: src.sr || 0 };
}

const hexRGB = (h) => { const v = String(h).replace('#', ''); return v.length >= 6 ? [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)] : [200, 200, 200]; };

export function createWaveView(L, M, H) {
  const { D, BEAT, BAR, rgba, text, bbt, clamp } = L, { lbl, reveal } = H, WV = M.wave;
  // three band colours per stage: low, mid, high. Nigredo is pure grey (dark -> white); the others walk the stage palette.
  const bandCols = (S) => (S.grey ? ['#7d7d7d', '#b9b9b9', '#ffffff'] : [S.sig1, S.sig2 === S.sig1 ? S.ink : S.sig2, S.waveHi === S.sig1 ? S.ink : S.waveHi]);
  const cache = new Map();
  /** Column colour from the tone map entry [low %, high %]: a weighted blend of the three band colours. */
  function toneCol(S, tone) {
    const wl = clamp(tone[0] / 100), wh = clamp(tone[1] / 100), wm = clamp(1 - wl - wh), key = S.name + (wl * 8 | 0) + '.' + (wm * 8 | 0) + '.' + (wh * 8 | 0);
    let c = cache.get(key); if (c) return c;
    const B = bandCols(S).map(hexRGB), s = wl + wm + wh + 1e-9, v = [0, 1, 2].map((i) => Math.round((B[0][i] * wl + B[1][i] * wm + B[2][i] * wh) / s));
    c = { base: `rgb(${v[0]},${v[1]},${v[2]})`, core: `rgb(${Math.min(255, v[0] + 70)},${Math.min(255, v[1] + 70)},${Math.min(255, v[2] + 70)})` }; cache.set(key, c); return c;
  }

  function session(ctx, S, r, t, k) {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const song = D.song;
    // readouts: tempo and key only (title and credit belong to the window label)
    lbl(ctx, S, `${Math.round(D.bpm)} BPM · ${D.key}`, x + w - 4, y + 12, { align: 'right', a: 0.7, size: 17 });
    // overview (whole track) + sections + clip bracket + song playhead
    const oy = y + 24, oh = 30, sx = (st) => x + w * st / song.duration;
    for (const q of song.phrases) { const a0 = song.bar1 + (q.bar - 1) * BAR, a1 = a0 + q.bars * BAR; if (a0 > song.duration) continue; ctx.fillStyle = rgba(q.label === 'drop' ? S.sig2 : S.rule, q.label === 'drop' ? 0.16 : 0.05); ctx.fillRect(sx(a0), oy, sx(Math.min(song.duration, a1)) - sx(a0), oh); }
    const ov = song.overview; ctx.fillStyle = rgba(S.ink, 0.5);
    for (let i = 0; i < ov.length; i++) { const v = ov[i] / 1000 * oh * 0.46; ctx.fillRect(x + w * i / ov.length, oy + oh / 2 - v, Math.max(1, w / ov.length), v * 2); }
    const c0 = sx(song.startTime), c1 = sx(song.startTime + D.duration);
    ctx.strokeStyle = rgba(S.ink, 0.7); ctx.lineWidth = 1.5; ctx.strokeRect(c0, oy - 1, c1 - c0, oh + 2); ctx.lineWidth = 1;
    ctx.fillStyle = S.hot; ctx.fillRect(Math.round(sx(song.startTime + t)), oy - 3, 2, oh + 6);
    // ruler over the detail window: the playhead sits at the centre, the grid scrolls under it
    const ry = oy + oh + 8, rh = 20, span = L.meter('session', 'span', 2) * BAR, t0 = t - 0.5 * span, tx = (tt) => x + w * (tt - t0) / span;
    ctx.fillStyle = rgba(S.ink, 0.3); ctx.fillRect(x, Math.round(ry + rh), w, 1);
    for (let b = Math.floor(t0 / BEAT) - 1; b * BEAT < t0 + span + BEAT; b++) {
      const X = Math.round(tx(b * BEAT)) + 0.5; if (X < x || X > x + w) continue; const isBar = ((b % 4) + 4) % 4 === 0;
      ctx.strokeStyle = rgba(S.ink, isBar ? 0.75 : 0.3); ctx.beginPath(); ctx.moveTo(X, ry + (isBar ? 0 : 12)); ctx.lineTo(X, ry + rh); ctx.stroke();
      if (isBar && X < x + w - 40) lbl(ctx, S, String(song.startBar + b / 4), X + 5, ry + 9, { w: 700, a: 0.9, size: 16 });
    }
    // L / R lanes: one column per DEVICE pixel, min/max envelope + RMS body + a bright core by the high-band share
    const ly = ry + rh + 6, laneH = (y + h - ly - 4) / 2, m = ctx.getTransform(), dpx = Math.max(1e-3, Math.hypot(m.a, m.b)), nc = Math.max(1, Math.round(w * dpx)), cwp = w / nc;
    const dbg = L.waveDebug ? (L.waveDebug.cols = [], L.waveDebug.skip = [], L.waveDebug) : null;
    if (dbg) Object.assign(dbg, { x, w, nc, dpx, laneH, lanes: [], sr: WV.sr, spc: WV.spc, lod0cps: WV.lv[0].cps });
    const snap = (v) => Math.round(v * dpx) / dpx, PX = Math.round(tx(t)), look = dbg ? 'exact' : L.meter('session', 'look', 'envelope');   // the accuracy test renders 'exact'
    for (let ch = 0; ch < 2; ch++) {
      const top0 = ly + laneH * ch, cy = snap(top0 + laneH / 2), sc = laneH * 0.47;
      // grid behind the waveform: bars strong, beats faint, 16ths as short ticks at the lane edge
      for (let q = Math.floor(t0 / (BEAT / 4)) - 1; q * BEAT / 4 < t0 + span + BEAT; q++) {
        const X = snap(tx(q * BEAT / 4)); if (X < x || X > x + w) continue; const isBar = ((q % 16) + 16) % 16 === 0, isBeat = ((q % 4) + 4) % 4 === 0;
        ctx.fillStyle = rgba(S.ink, isBar ? 0.26 : isBeat ? 0.11 : 0.09); ctx.fillRect(X, isBeat ? top0 + 2 : top0 + laneH - 8, 1 / dpx, isBeat ? laneH - 4 : 6); if (dbg && isBeat) dbg.skip.push(X);
      }
      // pass 1: the exact columns (what the test checks). Pass 2 draws them, or, in the 'envelope' look (the default for
      // film, like Rekordbox), their peak-hold over ~12 ms so a 50 Hz bass reads as a body, not a comb of cycles.
      const Q = new Array(nc).fill(null);
      for (let px = 0; px < nc; px++) { const ta = t0 + span * px / nc, tb = t0 + span * (px + 1) / nc; if (tb <= 0 || ta >= D.duration) continue; Q[px] = WV.col(Math.max(0, ta), Math.min(D.duration, tb), ch); }
      const env = look === 'envelope', hw = env ? Math.max(1, Math.round(0.006 / (span / nc))) : 0;
      for (let px = 0; px < nc; px++) {
        const q = Q[px]; if (!q) continue; const ta = t0 + span * px / nc;
        let mn = q.mn, mx = q.mx, rms = q.rms;
        if (env) { let c = 0; rms = 0; mn = 0; mx = 0; for (let j = Math.max(0, px - hw); j <= Math.min(nc - 1, px + hw); j++) { const o = Q[j]; if (!o) continue; mn = Math.min(mn, o.mn); mx = Math.max(mx, o.mx); rms += o.rms * o.rms; c++; } rms = Math.sqrt(rms / Math.max(1, c)); }
        const X = x + px * cwp, played = ta <= t, wi = Math.min(D.wave.tone.length - 1, Math.floor(Math.max(0, ta) * D.wave.cps)), tone = D.wave.tone[Math.max(0, wi)] || [50, 10], tc = toneCol(S, tone);
        const yT = snap(cy - mx * sc), hT = Math.max(1 / dpx, snap((mx - mn) * sc));
        const rHi = Math.min(rms, mx), rLo = Math.max(-rms, mn), yR = snap(cy - rHi * sc), hR = snap((rHi - rLo) * sc);
        ctx.fillStyle = tc.base; ctx.globalAlpha = played ? 0.55 : 0.34; ctx.fillRect(X, yT, cwp, hT);
        if (hR > 0) { ctx.globalAlpha = played ? 1 : 0.62; ctx.fillRect(X, yR, cwp, hR); }
        // high-band core: brighter, as tall as the RMS body times the column's high share (a hat reads as a bright spine)
        const hiK = clamp(0.18 + tone[1] / 60), hc = hR * hiK; if (hc > 0.5 / dpx) { ctx.fillStyle = tc.core; ctx.globalAlpha = played ? 0.95 : 0.55; ctx.fillRect(X, snap(cy - (rHi + rLo) / 2 * sc - hc / 2), cwp, hc); }   // centred on the RMS body, so it stays inside [min, max]
        ctx.fillStyle = tc.base; ctx.globalAlpha = played ? 0.95 : 0.5; ctx.fillRect(X, yT, cwp, 1 / dpx); ctx.fillRect(X, yT + hT - 1 / dpx, cwp, 1 / dpx);
        if (dbg) dbg.cols.push({ px, ch, X, mn: q.mn, mx: q.mx, rms: q.rms, s0: q.s0, s1: q.s1, lod: q.lod, yT, hT });
      }
      ctx.globalAlpha = 1; ctx.fillStyle = rgba(S.ink, 0.2); ctx.fillRect(x, cy, w, 1 / dpx);
      // transient markers at the measured onsets: hairline + a flag; a hit within 1/8 beat flashes bright
      for (const [kind, kk] of [['kick', 1], ['snare', 0.6]]) for (const [tr] of D.onsets[kind]) {
        const X = snap(tx(tr)); if (X < x || X > x + w) continue; const hit = tr <= t && t - tr < BEAT / 8, a = tr <= t ? (hit ? 1 : 0.7) : 0.3;
        ctx.fillStyle = rgba(S.ink, 0.18 * a); ctx.fillRect(X, top0 + 2, 1 / dpx, laneH - 4);
        ctx.fillStyle = rgba(kind === 'kick' ? S.hot : S.ink, a); ctx.beginPath(); ctx.moveTo(X, top0 + 2); ctx.lineTo(X + 6 * kk + 1, top0 + 2); ctx.lineTo(X, top0 + 2 + 8 * kk + 1); ctx.fill();
      }
      if (dbg) dbg.lanes.push({ ch, top: top0, h: laneH, cy, sc });
    }
    if (dbg) dbg.playX = PX;
    // playhead, fixed at the centre, with the bar.beat readout (the only moving text)
    ctx.fillStyle = S.hot; ctx.fillRect(PX, ry - 2, 2, y + h - ry + 2);
    ctx.beginPath(); ctx.moveTo(PX - 7, ry - 3); ctx.lineTo(PX + 9, ry - 3); ctx.lineTo(PX + 1, ry + 6); ctx.fill();
    text(ctx, bbt(t), PX + 10, ly + 14, { size: 20, w: 700, col: S.hot });
    ctx.restore();
  }
  return { session };
}
