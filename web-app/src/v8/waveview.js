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
  // display gain: the clip's true peak maps to ~92 % of the lane half-height (a DAW 'normalised view'), so the scale is correct and the lane is used
  let PEAK = 0; { const l0 = WV.lv[0]; for (let i = 0; i < l0.n; i++) for (let ch = 0; ch < 2; ch++) PEAK = Math.max(PEAK, -l0.mn[ch][i], l0.mx[ch][i]); PEAK = Math.max(PEAK, 0.05); }
  /** Column colour from the tone map entry [low %, high %]: a weighted blend of the three band colours. */
  function toneCol(S, tone) {
    const wl = clamp(tone[0] / 100), wh = clamp(tone[1] / 100), wm = clamp(1 - wl - wh), key = S.name + (wl * 8 | 0) + '.' + (wm * 8 | 0) + '.' + (wh * 8 | 0);
    let c = cache.get(key); if (c) return c;
    const B = bandCols(S).map(hexRGB), s = wl + wm + wh + 1e-9, v = [0, 1, 2].map((i) => Math.round((B[0][i] * wl + B[1][i] * wm + B[2][i] * wh) / s));
    c = { base: `rgb(${v[0]},${v[1]},${v[2]})`, core: `rgb(${Math.min(255, v[0] + 70)},${Math.min(255, v[1] + 70)},${Math.min(255, v[2] + 70)})` }; cache.set(key, c); return c;
  }


  /** DAW-style clip body for one lane: a filled min/max envelope (peak hold looking back ~18 ms, so a kick's attack stays
   *  sharp and a 50 Hz bass reads as one body instead of a comb of cycles), a smooth RMS body inside it and a bright
   *  high-band core, all drawn as anti-aliased paths through per-device-pixel points (no rect stairs). Played part bright,
   *  unplayed dimmed; three tones: low = envelope, mid = RMS body, high = core (greys in Nigredo). */
  function drawEnvelope(ctx, S, Q, ch, g) {
    const { x, nc, cwp, cy, sc, t, t0, span, dpx } = g, dt = span / nc, bc = bandCols(S);
    const mx = new Float32Array(nc), mn = new Float32Array(nc), ms = new Float32Array(nc), hi = new Float32Array(nc), has = new Uint8Array(nc);
    for (let i = 0; i < nc; i++) { const q = Q[i]; if (q) { has[i] = 1; mx[i] = q.mx; mn[i] = q.mn; ms[i] = q.rms * q.rms; const wi = Math.min(D.wave.tone.length - 1, Math.floor(Math.max(0, t0 + dt * i) * D.wave.cps)); hi[i] = (D.wave.tone[Math.max(0, wi)] || [50, 10])[1] / 100; } }
    const W = Math.max(1, Math.round(0.032 / dt)), G = Math.max(1, Math.round(0.007 / dt));   // peak hold >= one cycle of a 30 Hz 808 (32 ms)
    const eMx = new Float32Array(nc), eMn = new Float32Array(nc), rb = new Float32Array(nc), hb = new Float32Array(nc);
    for (let i = 0; i < nc; i++) {
      let a = 0, b = 0; for (let j = Math.max(0, i - W); j <= i; j++) { if (mx[j] > a) a = mx[j]; if (mn[j] < b) b = mn[j]; } eMx[i] = a; eMn[i] = b;
    }
    const sm = (src, dst, r) => { for (let i = 0; i < nc; i++) { let s2 = 0, c = 0; for (let j = Math.max(0, i - r); j <= Math.min(nc - 1, i + r); j++) { const wgt = r + 1 - Math.abs(j - i); s2 += src[j] * wgt; c += wgt; } dst[i] = s2 / c; } };
    const Wf = Math.max(1, Math.round(0.008 / dt)), fMx = new Float32Array(nc), fMn = new Float32Array(nc);   // fast (8 ms) envelope, used only for the kick spikes
    for (let i = 0; i < nc; i++) { let a = 0, b = 0; for (let j = Math.max(0, i - Wf); j <= i; j++) { if (mx[j] > a) a = mx[j]; if (mn[j] < b) b = mn[j]; } fMx[i] = a; fMn[i] = b; }
    const e2 = new Float32Array(nc), n2 = new Float32Array(nc); sm(eMx, e2, Math.max(1, Math.round(0.006 / dt))); sm(eMn, n2, Math.max(1, Math.round(0.006 / dt)));
    const r2 = new Float32Array(nc); sm(ms, r2, G * 6); sm(hi, hb, G * 4);
    for (let i = 0; i < nc; i++) { const rr = Math.sqrt(r2[i]) * 1.0; rb[i] = Math.min(rr, e2[i], -n2[i] || rr); }
    const Xc = (i) => x + (i + 0.5) * cwp, path = (top, bot) => { ctx.beginPath(); let st = -1; for (let i = 0; i < nc; i++) { if (!has[i]) continue; if (st < 0) { st = i; ctx.moveTo(Xc(i), top(i)); } else ctx.lineTo(Xc(i), top(i)); } if (st < 0) return false; for (let i = nc - 1; i >= st; i--) if (has[i]) ctx.lineTo(Xc(i), bot(i)); ctx.closePath(); return true; };
    const PXl = Math.min(g.x + g.w, Math.max(g.x, x + g.w * (t - t0) / span)), fl = g.flash || 0;
    // transient score per column: how far the envelope sits above its own ~0.25 s average (a kick spikes, a bass body does not)
    const cum = new Float64Array(nc + 1); for (let i = 0; i < nc; i++) cum[i + 1] = cum[i] + e2[i]; const rw = Math.max(2, Math.round(0.125 / dt)), trn = new Float32Array(nc);
    for (let i = 0; i < nc; i++) { const a = Math.max(0, i - rw), b = Math.min(nc, i + rw + 1), av = (cum[b] - cum[a]) / (b - a) + 1e-4; trn[i] = clamp((fMx[i] / av - 1.12) / 0.4); }
    for (const played of [false, true]) {
      ctx.save(); ctx.beginPath(); if (played) ctx.rect(x, g.top0, PXl - x, g.laneH); else ctx.rect(PXl, g.top0, x + g.w - PXl, g.laneH); ctx.clip();
      const k = played ? 0.82 + 0.18 * (1 - fl) : 0.5;
      ctx.fillStyle = bc[0]; ctx.globalAlpha = 0.62 * k; if (path((i) => cy - e2[i] * sc, (i) => cy - n2[i] * sc)) ctx.fill();
      ctx.strokeStyle = bc[1]; ctx.globalAlpha = 0.9 * k; ctx.lineWidth = 1 / dpx; ctx.beginPath(); let f = true; for (let i = 0; i < nc; i++) { if (!has[i]) continue; const yy = cy - e2[i] * sc; if (f) { ctx.moveTo(Xc(i), yy); f = false; } else ctx.lineTo(Xc(i), yy); } ctx.stroke();
      ctx.beginPath(); f = true; for (let i = 0; i < nc; i++) { if (!has[i]) continue; const yy = cy - n2[i] * sc; if (f) { ctx.moveTo(Xc(i), yy); f = false; } else ctx.lineTo(Xc(i), yy); } ctx.stroke();
      ctx.fillStyle = bc[1]; ctx.globalAlpha = 0.95 * k; if (path((i) => cy - rb[i] * sc, (i) => cy + rb[i] * sc)) ctx.fill();
      ctx.fillStyle = bc[2]; ctx.globalAlpha = 0.9 * k; if (path((i) => cy - rb[i] * sc * clamp(0.06 + hb[i] * 1.3, 0, 0.5), (i) => cy + rb[i] * sc * clamp(0.06 + hb[i] * 1.3, 0, 0.5))) ctx.fill();
      // transients: columns that spike over their surroundings are drawn bright, full height (kicks read as white spikes)
      if (L.meter('session', 'spikes', false)) for (let i = 0; i < nc; i++) { ctx.fillStyle = bc[2]; if (!has[i] || trn[i] < 0.04) continue; ctx.globalAlpha = Math.min(1, trn[i] * 1.1) * (played ? 0.95 : 0.5); ctx.fillRect(Xc(i) - cwp / 2, cy - Math.max(e2[i], fMx[i]) * sc, cwp, (Math.max(e2[i], fMx[i]) - Math.min(n2[i], fMn[i])) * sc); }
      // kick flash: the played side brightens for ~120 ms after each kick
      if (played && fl > 0.01 && L.meter('session', 'kickflash', false)) { ctx.fillStyle = bc[2]; ctx.globalAlpha = 0.75 * fl; if (path((i) => cy - e2[i] * sc, (i) => cy - n2[i] * sc)) ctx.fill(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function session(ctx, S, r, t, k) {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const song = D.song;
    // overview (whole track) + sections + clip bracket + song playhead
    const cmp = h < 340, oy = y + (cmp ? 16 : 24), oh = cmp ? 18 : 30, sx = (st) => x + w * st / song.duration;
    for (const q of song.phrases) { const a0 = song.bar1 + (q.bar - 1) * BAR, a1 = a0 + q.bars * BAR; if (a0 > song.duration) continue; ctx.fillStyle = rgba(q.label === 'drop' ? S.sig2 : S.rule, q.label === 'drop' ? 0.16 : 0.05); ctx.fillRect(sx(a0), oy, sx(Math.min(song.duration, a1)) - sx(a0), oh); }
    const ov = song.overview; ctx.fillStyle = rgba(S.ink, 0.5);
    for (let i = 0; i < ov.length; i++) { const v = ov[i] / 1000 * oh * 0.46; ctx.fillRect(x + w * i / ov.length, oy + oh / 2 - v, Math.max(1, w / ov.length), v * 2); }
    const c0 = sx(song.startTime), c1 = sx(song.startTime + D.duration);
    ctx.strokeStyle = rgba(S.ink, 0.7); ctx.lineWidth = 1.5; ctx.strokeRect(c0, oy - 1, c1 - c0, oh + 2); ctx.lineWidth = 1;
    ctx.fillStyle = S.hot; ctx.fillRect(Math.round(sx(song.startTime + t)), oy - 3, 2, oh + 6);
    // ruler over the detail window: the playhead sits at the centre, the grid scrolls under it
    const ry = oy + oh + (cmp ? 5 : 8), rh = cmp ? 15 : 20, span = L.meter('session', 'span', 2) * BAR, t0 = t - 0.5 * span, tx = (tt) => x + w * (tt - t0) / span;
    ctx.fillStyle = rgba(S.ink, 0.3); ctx.fillRect(x, Math.round(ry + rh), w, 1);
    for (let b = Math.floor(t0 / BEAT) - 1; b * BEAT < t0 + span + BEAT; b++) {
      const X = Math.round(tx(b * BEAT)) + 0.5; if (X < x || X > x + w) continue; const isBar = ((b % 4) + 4) % 4 === 0;
      ctx.strokeStyle = rgba(S.ink, isBar ? 0.75 : 0.3); ctx.beginPath(); ctx.moveTo(X, ry + (isBar ? 0 : 12)); ctx.lineTo(X, ry + rh); ctx.stroke();
      if (isBar && X < x + w - 40) lbl(ctx, S, String(song.startBar + b / 4), X + 5, ry + 9, { w: 700, a: 0.9, size: 16 });
    }
    // L / R lanes: one column per DEVICE pixel, min/max envelope + RMS body + a bright core by the high-band share
    const ly = ry + rh + 4, laneH = (y + h - ly - 3) / 2, m = ctx.getTransform(), dpx = Math.max(1e-3, Math.hypot(m.a, m.b)), nc = Math.max(1, Math.round(w * dpx)), cwp = w / nc;
    const dbg = L.waveDebug ? (L.waveDebug.cols = [], L.waveDebug.skip = [], L.waveDebug) : null;
    if (dbg) Object.assign(dbg, { x, w, nc, dpx, laneH, lanes: [], sr: WV.sr, spc: WV.spc, lod0cps: WV.lv[0].cps });
    // kick flash (decays over 120 ms) and beat pulse (decays over ~1/3 beat) for the played-side brightening and the playhead
    let flash = 0; if (!dbg) for (const [tr0, , tq0] of D.onsets.kick) { const tr = L.kickT(tr0, tq0); if (tr > t) continue; const a = 1 - (t - tr) / 0.12; if (a > flash) flash = a; } flash = flash * flash;
    const bph = (((t / BEAT) % 1) + 1) % 1, pulse = dbg ? 0 : Math.exp(-bph * 7);
    const snap = (v) => Math.round(v * dpx) / dpx, PX = Math.round(tx(t)), look = dbg ? 'exact' : L.meter('session', 'look', 'envelope');   // the accuracy test renders 'exact'
    for (let ch = 0; ch < 2; ch++) {
      const top0 = ly + laneH * ch, cy = snap(top0 + laneH / 2), sc = laneH * 0.49 / (dbg ? 1 : PEAK);
      // grid behind the waveform: bars strong, beats faint, 16ths as short ticks at the lane edge
      for (let q = Math.floor(t0 / (BEAT / 4)) - 1; q * BEAT / 4 < t0 + span + BEAT; q++) {
        const X = snap(tx(q * BEAT / 4)); if (X < x || X > x + w) continue; const isBar = ((q % 16) + 16) % 16 === 0, isBeat = ((q % 4) + 4) % 4 === 0;
        ctx.fillStyle = rgba(S.ink, isBar ? 0.26 : isBeat ? 0.11 : 0.09); ctx.fillRect(X, isBeat ? top0 + 2 : top0 + laneH - 8, 1 / dpx, isBeat ? laneH - 4 : 6); if (dbg && isBeat) dbg.skip.push(X);
      }
      // pass 1: the exact columns (what the test checks). Pass 2 draws them, or, in the 'envelope' look (the default for
      // film, like Rekordbox), their peak-hold over ~12 ms so a 50 Hz bass reads as a body, not a comb of cycles.
      const Q = new Array(nc).fill(null);
      for (let px = 0; px < nc; px++) { const ta = t0 + span * px / nc, tb = t0 + span * (px + 1) / nc; if (tb <= 0 || ta >= D.duration) continue; Q[px] = WV.col(Math.max(0, ta), Math.min(D.duration, tb), ch); }
      const env = look === 'envelope', hw = 0;
      if (env) drawEnvelope(ctx, S, Q, ch, { x, w, nc, cwp, cy, sc, t, t0, span, top0, laneH, dpx, flash });
      else
      {
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
    if (pulse > 0.02) { ctx.fillStyle = rgba(S.hot, 0.22 * pulse); ctx.fillRect(PX - 5 * pulse - 1, ry - 2, 10 * pulse + 4, y + h - ry + 2); }
    ctx.fillStyle = S.hot; ctx.fillRect(PX - pulse * 0.8, ry - 2, 2 + pulse * 1.6, y + h - ry + 2);
    ctx.beginPath(); ctx.moveTo(PX - 7, ry - 3); ctx.lineTo(PX + 9, ry - 3); ctx.lineTo(PX + 1, ry + 6); ctx.fill();
    text(ctx, bbt(t), PX + 10, ly + 14, { size: 20, w: 700, col: S.hot });
    ctx.restore();
  }
  return { session };
}
