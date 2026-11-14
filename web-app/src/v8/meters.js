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

  const M8 = M;
  const SC = D.scope, scopeSpan = (ff) => { const e = Math.min(SC.L.length, Math.floor(ff / FPS * SC.rate)); return [Math.max(0, e - Math.round(SC.rate / FPS)), e]; };
  const cr = (v) => Math.round(v) + 0.5;
  const tickF = (t) => fidx(Math.floor(t / (BEAT / 2)) * (BEAT / 2));   // display tick: the frame at the last half beat
  M8.tickF = tickF;
  M8.cells = (ctx, S, x, y, w, h, cells, accentIdx = -1) => {   // numeric cells: label top-left, value bottom-right
    const gap = 8, cw = (w - gap * (cells.length - 1)) / cells.length;
    cells.forEach(([nm, v], i) => {
      const cx = x + i * (cw + gap);
      if (i === accentIdx) { ctx.fillStyle = rgba(S.hot, S.grey ? 0.1 : 0.16); ctx.fillRect(Math.round(cx), Math.round(y), Math.round(cw), Math.round(h)); }
      ctx.strokeStyle = rgba(S.ink, 0.4); ctx.strokeRect(cr(cx), cr(y), Math.round(cw) - 1, Math.round(h) - 1);
      lbl(ctx, S, nm, cx + 8, y + 15, { a: 0.6, maxW: cw - 14 });
      text(ctx, v, cx + cw - 8, y + h - 18, { size: 30, col: i === accentIdx ? S.hot : S.ink, align: 'right', w: 500, maxW: cw - 14 });
    });
  };

  // ---------------------------------------------------------------- EQ
  const BANDS = [['LS', 70, 0.8], ['BELL', 900, 0.9], ['HS', 9000, 0.8]];
  const balAt = (f, fc) => { const oct = D.oct1, b = F.bal[f], lf = Math.log2(fc / 1000); let i = 0; while (i < oct.length - 2 && Math.log2(oct[i + 1] / 1000) < lf) i++; const a0 = Math.log2(oct[i] / 1000), a1 = Math.log2(oct[i + 1] / 1000); return lerp(b[i], b[i + 1], clamp((lf - a0) / (a1 - a0))); };
  const beatGain = (k, bi) => { const f = fidx(Math.max(0, k) * BEAT); let s = 0; for (let j = -3; j <= 3; j++) s += balAt(clamp(f + j, 0, NF - 1), BANDS[bi][1]); return clamp(s / 7 * 0.6, -12, 12); };
  function eqGain(t, bi) { const k = Math.floor(t / BEAT + 1e-9), u = clamp((t - k * BEAT) * FPS / 4), e = 1 - Math.pow(1 - u, 3); return lerp(beatGain(k - 1, bi), beatGain(k, bi), e); }
  const resp = (type, fc, q, g, f) => { const d = Math.log2(f / fc); return type === 'BELL' ? g * Math.exp(-(d * d) / (2 * q * q)) : type === 'LS' ? g / (1 + Math.exp(d * 4 / q)) : g / (1 + Math.exp(-d * 4 / q)); };
  const FMAX = 22000, XF = (f, x, w) => x + w * Math.log(f / 20) / Math.log(FMAX / 20);
  M8.eq = (ctx, S, r, t, k) => {
    const [x0, y0, w0, h0] = r; reveal(ctx, x0, y0, w0, h0, k);
    const pianoH = 20, rulerH = 30, x = x0 + 54, pw = w0 - 54 - 50, y = y0 + 4, h = h0 - pianoH - rulerH - 8;
    const f = fidx(t), g = BANDS.map((_, i) => eqGain(t, i)), sel = Math.floor(t / BAR) % 3, cols = S.bandCols;
    const rg = L.meter('eq', 'range', 15), tilt = L.meter('eq', 'tilt', 4.5), Yg = (db) => y + h * (0.5 - db / (2 * rg)), Ya = (v) => y + h * clamp(-v / 90);
    for (const fq of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) { const X = cr(XF(fq, x, pw)); ctx.strokeStyle = rgba(S.ink, [100, 1000, 10000].includes(fq) ? 0.18 : 0.07); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); }
    for (let db = -12; db <= 12; db += 6) { if (Math.abs(db) > rg) continue; const Y = cr(Yg(db)); ctx.strokeStyle = rgba(S.ink, db === 0 ? 0.32 : 0.07); ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x + pw, Y); ctx.stroke(); if (db % 12 === 0) lbl(ctx, S, (db > 0 ? '+' : '') + db, x - 8, Y, { align: 'right', a: 0.9 }); }
    for (const v of [0, -45, -90]) lbl(ctx, S, String(v), x + pw + 6, clamp(Ya(v), y + 11, y + h - 11), { a: 0.45 });
    // analyzer behind: pre (thin), post (filled + line), tilted +4.5 dB/oct about 1 kHz
    const sp = F.spec[f], c6 = D.oct6, path = (gf) => c6.map((fq, i) => [XF(fq, x, pw), Ya(sp[i] + tilt * Math.log2(fq / 1000) + gf(fq))]);
    const sum = (fq) => BANDS.reduce((a, [ty, fc, q], bi) => a + resp(ty, fc, q, g[bi], fq), 0);
    const pre = path(() => 0), post = path(sum);
    ctx.beginPath(); pre.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y))); ctx.strokeStyle = rgba(S.ink, 0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(post[0][0], y + h); post.forEach(([X, Y]) => ctx.lineTo(X, Y)); ctx.lineTo(post[post.length - 1][0], y + h); ctx.closePath();
    const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(S.sig1, 0.3)); gr.addColorStop(1, rgba(S.sig1, 0)); ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); post.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y))); ctx.strokeStyle = rgba(S.ink, 0.45); ctx.stroke();
    const NPT = 220, fr = (i) => 20 * Math.pow(FMAX / 20, i / NPT);
    BANDS.forEach(([ty, fc, q], bi) => {
      ctx.beginPath(); ctx.moveTo(x, Yg(0)); for (let i = 0; i <= NPT; i++) ctx.lineTo(XF(fr(i), x, pw), Yg(resp(ty, fc, q, g[bi], fr(i)))); ctx.lineTo(x + pw, Yg(0)); ctx.closePath();
      ctx.fillStyle = rgba(cols[bi], bi === sel ? 0.26 : 0.1); ctx.fill();
    });
    // summed curve: the thickest line on screen
    ctx.beginPath(); for (let i = 0; i <= NPT; i++) { const X = XF(fr(i), x, pw), Y = Yg(sum(fr(i))); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(S.ink, 0.14); ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = S.ink; ctx.lineWidth = 3.5; ctx.stroke(); ctx.lineWidth = 1;
    BANDS.forEach(([ty, fc], bi) => {
      const X = XF(fc, x, pw), Y = Yg(sum(fc)), R = bi === sel ? 15 : 12;
      ctx.fillStyle = cols[bi]; ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.fill(); ctx.strokeStyle = cols[bi]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(X, Y, R + 5, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
      text(ctx, String(bi + 1), X, Y + 1, { size: 22, w: 800, col: S.bg, align: 'center' });
    });
    { // hover bubble on the selected node (rows type in on 16ths from the bar line)
      const [ty, fc, q] = BANDS[sel], X = XF(fc, x, pw), Y = Yg(sum(fc)), bw = 250, bh = 96, bx = X < x + pw / 2 ? x + pw - bw - 4 : x + 4, by = Y < y + h / 2 ? y + h - bh - 4 : y + 4;
      const rows = L.steps(t, Math.floor(t / BAR) * 4, 3, 0.25);
      ctx.strokeStyle = rgba(S.ink, 0.6); ctx.beginPath(); ctx.moveTo(X, Y + (by > Y ? 18 : -18)); ctx.lineTo(bx + 12, by + (by > Y ? 0 : bh)); ctx.stroke();
      ctx.fillStyle = rgba(S.bg, 0.94); ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = rgba(S.ink, 0.85); ctx.strokeRect(cr(bx), cr(by), bw, bh);
      const n = 12 * Math.log2(fc / 440) + 57, ni = Math.round(n), nm = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((ni % 12) + 12) % 12] + Math.floor(ni / 12);
      [`${bi1(sel)} ${fc >= 1000 ? (fc / 1000).toFixed(1) + 'k' : fc} Hz · ${nm}`, `G ${g[sel] >= 0 ? '+' : '−'}${Math.abs(g[sel]).toFixed(1)} dB`, `Q ${(1 / q).toFixed(2)} · ${ty.toLowerCase()}`].slice(0, rows)
        .forEach((s, i) => lbl(ctx, S, s, bx + 10, by + 17 + i * 30, { a: 1, maxW: bw - 18 }));
    }
    const ry = y + h + rulerH / 2 + 2;
    [['20', 20], ['100', 100], ['1k', 1000], ['10k', 10000]].forEach(([s, fq]) => lbl(ctx, S, s, XF(fq, x, pw), ry, { align: 'center', a: 0.6 }));
    const py = y + h + rulerH + 2;
    ctx.strokeStyle = rgba(S.ink, 0.25); ctx.strokeRect(cr(x), cr(py), Math.round(pw), pianoH);
    for (let m = 21; m <= 108; m++) {
      const fq = 440 * Math.pow(2, (m - 69) / 12), X = XF(fq, x, pw), bk = [1, 3, 6, 8, 10].includes(m % 12), lit = BANDS.findIndex(([, fc]) => Math.abs(12 * Math.log2(fc / fq)) < 0.5);
      ctx.fillStyle = lit >= 0 ? cols[lit] : rgba(S.ink, bk ? 0.32 : 0.22);
      if (bk) ctx.fillRect(Math.round(X - 1.5), Math.round(py), 3, Math.round(pianoH * 0.6)); else ctx.fillRect(Math.round(X), Math.round(py), 1, pianoH);
    }
    ctx.restore();
  };
  const bi1 = (i) => `#${i + 1}`;

  // ---------------------------------------------------------------- LOUDNESS (Kollide-frames instrument)
  M8.loud = (ctx, S, r, t, k) => {
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
