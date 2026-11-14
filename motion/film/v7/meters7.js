/* v7 meters (skill spec: references/eq-display-spec.md, meters-and-frames.md, aurora-notes.md).
 * Every value is measured from the real audio (tools/clipdata.py, tested in tests/test_meters.py).
 * Display ticks (numbers) step on the HALF BEAT; EQ gains are automation steps on the beat (eased 4 frames).
 * Rects are screen pixels; o.ui scales type. One accent area per panel (S.hot). Exposes L6.M7, L6.tag. */
(function () {
  'use strict';
  const L = window.L6, { D, F, FPS, NF, BEAT, BAR, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, MONO, SANS } = L;
  const M7 = {};

  // ---------------------------------------------------------------- tags (tags.default.json deep-merged with --tags)
  const TAGS = window.U2C_TAGS || {}, VARS = {};
  L.tagVars = (o) => Object.assign(VARS, o);
  const sub = (s, extra) => String(s).replace(/\{(\w+)\}/g, (m, k) => (extra && k in extra ? extra[k] : k in VARS ? VARS[k] : m));
  L.tag = (path, extra) => { const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), TAGS); if (v == null) return ''; return Array.isArray(v) ? v.map((x) => sub(x, extra)) : sub(v, extra); };

  const lbl = (ctx, S, s, x, y, ui, o = {}) => text(ctx, s, x, y, { size: (o.size || 10) * ui, col: rgba(o.col || S.ink, o.a == null ? 0.6 : o.a), align: o.align, w: o.w || 500, ls: (o.ls == null ? 0.6 : o.ls) * ui, base: o.base });
  const cr = (v) => Math.round(v) + 0.5;
  const tickF = (t) => fidx(Math.floor(t / (BEAT / 2)) * (BEAT / 2));   // display tick: the frame at the last half beat
  M7.tickF = tickF;
  // header strip (Kollide grammar): filename micro, 2 px rule, wide-tracked bold mono line
  M7.header = (ctx, S, x, y, w, ui, file, line) => {
    lbl(ctx, S, file, x, y, ui, { size: 10, a: 0.55, ls: 0.3 });
    ctx.fillStyle = S.ink; ctx.fillRect(Math.round(x), Math.round(y + 9 * ui), Math.round(w), 2);
    lbl(ctx, S, line, x, y + 22 * ui, ui, { size: 11, w: 700, a: 1, ls: 2.2 });
    ctx.strokeStyle = rgba(S.ink, 0.7); ctx.strokeRect(cr(x + w - 10 * ui), cr(y + 17 * ui), Math.round(9 * ui), Math.round(9 * ui));
    return y + 36 * ui;
  };
  // numeric cells: label top-left (micro), value bottom-right (mono)
  M7.cells = (ctx, S, x, y, w, h, ui, cells, accentIdx = -1) => {
    const gap = 6 * ui, cw = (w - gap * (cells.length - 1)) / cells.length;
    cells.forEach(([nm, v], i) => {
      const cx = x + i * (cw + gap);
      if (i === accentIdx) { ctx.fillStyle = rgba(S.hot, S.grey ? 0.12 : 0.18); ctx.fillRect(Math.round(cx), Math.round(y), Math.round(cw), Math.round(h)); }
      ctx.strokeStyle = rgba(S.ink, 0.35); ctx.strokeRect(cr(cx), cr(y), Math.round(cw) - 1, Math.round(h) - 1);
      lbl(ctx, S, nm, cx + 7 * ui, y + 10 * ui, ui, { size: 9, a: 0.5, ls: 0.3 });
      text(ctx, v, cx + cw - 7 * ui, y + h - 11 * ui, { size: 17 * ui, col: i === accentIdx ? S.hot : S.ink, align: 'right', w: 500 });
    });
  };

  // ---------------------------------------------------------------- EQ (original spec in the Pro-Q spirit)
  // 3 bands (one shot never shows more): low shelf, a bell, high shelf. Gains = measured octave balance vs pink at the
  // band frequency, sampled ON THE BEAT (automation step) and eased over 4 frames (power3.out).
  const BANDS = [['LS', 70, 0.8, 1], ['BELL', 900, 0.9, 2], ['HS', 9000, 0.8, 3]];
  const balAt = (f, fc) => { const oct = D.oct1, b = F.bal[f], lf = Math.log2(fc / 1000); let i = 0; while (i < oct.length - 2 && Math.log2(oct[i + 1] / 1000) < lf) i++; const a0 = Math.log2(oct[i] / 1000), a1 = Math.log2(oct[i + 1] / 1000); return lerp(b[i], b[i + 1], clamp((lf - a0) / (a1 - a0))); };
  const beatGain = (k, bi) => { const f = fidx(k * BEAT); let s = 0; for (let j = -3; j <= 3; j++) s += balAt(clamp(f + j, 0, NF - 1), BANDS[bi][1]); return clamp(s / 7 * 0.6, -12, 12); };
  function eqGain(t, bi) {
    const k = Math.floor(t / BEAT + 1e-9), u = clamp((t - k * BEAT) * FPS / 4), e = 1 - Math.pow(1 - u, 3);
    return lerp(beatGain(k - 1, bi), beatGain(k, bi), e);
  }
  const resp = (type, fc, q, g, f) => { const d = Math.log2(f / fc); return type === 'BELL' ? g * Math.exp(-(d * d) / (2 * q * q)) : type === 'LS' ? g / (1 + Math.exp(d * 4 / q)) : g / (1 + Math.exp(-d * 4 / q)); };
  const FMAX = 30000, XF = (f, x, w) => x + w * Math.log(f / 20) / Math.log(FMAX / 20);
  M7.eq = (ctx, S, r, t, o) => {
    const ui = o.ui, [x0, y0, w] = r, h0 = r[3];
    const y = M7.header(ctx, S, x0, y0, w, ui, (L.tag('title') || '').toLowerCase().replace(/ /g, '_') + '.wav', `EQ · ${L.tag('experiment')} · ${L.tag('codes.trial')}`);
    const pianoH = 22 * ui, rulerH = 16 * ui, x = x0 + 34 * ui, pw = w - 70 * ui, h = y0 + h0 - y - pianoH - rulerH - 8 * ui;
    const f = fidx(t), g = BANDS.map((_, i) => eqGain(t, i)), sel = Math.floor(t / BAR) % 3, cols = S.bandCols;
    const Yg = (db) => y + h * (0.5 - db / 30), Ya = (v) => y + h * clamp(-v / 90);
    // grid
    for (const fq of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) { const X = cr(XF(fq, x, pw)); ctx.strokeStyle = rgba(S.ink, [100, 1000, 10000].includes(fq) ? 0.18 : 0.07); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); }
    for (let db = -12; db <= 12; db += 6) { const Y = cr(Yg(db)); ctx.strokeStyle = rgba(S.ink, db === 0 ? 0.3 : 0.07); ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x + pw, Y); ctx.stroke();
      lbl(ctx, S, (db > 0 ? '+' : '') + db, x - 6 * ui, Y, ui, { size: 9, align: 'right', a: 1, col: S.ink }); }
    for (let v = 0; v >= -90; v -= 30) lbl(ctx, S, String(v), x + pw + 6 * ui, Ya(v), ui, { size: 9, a: 0.45 });
    // analyzer: pre (1 px 20 %), post (fill 14 % -> 0 + 1 px 45 %), tilt +4.5 dB/oct about 1 kHz
    const sp = F.spec[f], c6 = D.oct6, path = (gainF) => { const P = []; for (let i = 0; i < sp.length; i++) { const fq = c6[i]; P.push([XF(fq, x, pw), Ya(sp[i] + 4.5 * Math.log2(fq / 1000) + gainF(fq))]); } return P; };
    const sum = (fq) => BANDS.reduce((a, [ty, fc, q], bi) => a + resp(ty, fc, q, g[bi], fq), 0);
    const pre = path(() => 0), post = path(sum);
    ctx.beginPath(); pre.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y))); ctx.strokeStyle = rgba(S.ink, 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(post[0][0], y + h); post.forEach(([X, Y]) => ctx.lineTo(X, Y)); ctx.lineTo(post[post.length - 1][0], y + h); ctx.closePath();
    const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(S.ink, 0.14)); gr.addColorStop(1, rgba(S.ink, 0)); ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); post.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y))); ctx.strokeStyle = rgba(S.ink, 0.45); ctx.stroke();
    // band areas (10 %, selected 22 %) with 1 px edges at 60 %
    const NPT = 240, fr = (i) => 20 * Math.pow(FMAX / 20, i / NPT);
    BANDS.forEach(([ty, fc, q], bi) => {
      ctx.beginPath(); ctx.moveTo(x, Yg(0)); for (let i = 0; i <= NPT; i++) ctx.lineTo(XF(fr(i), x, pw), Yg(resp(ty, fc, q, g[bi], fr(i)))); ctx.lineTo(x + pw, Yg(0)); ctx.closePath();
      ctx.fillStyle = rgba(cols[bi], bi === sel ? 0.22 : 0.1); ctx.fill();
      if (S.grey && bi === 1) ctx.setLineDash([5, 4]);
      ctx.beginPath(); for (let i = 0; i <= NPT; i++) { const X = XF(fr(i), x, pw), Y = Yg(resp(ty, fc, q, g[bi], fr(i))); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.strokeStyle = rgba(cols[bi], 0.6); ctx.stroke(); ctx.setLineDash([]);
    });
    // summed curve: the thickest line on screen (3 px + 6 px glow 12 %)
    ctx.beginPath(); for (let i = 0; i <= NPT; i++) { const X = XF(fr(i), x, pw), Y = Yg(sum(fr(i))); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(S.ink, 0.12); ctx.lineWidth = 6 * ui / 1.5; ctx.stroke(); ctx.strokeStyle = S.ink; ctx.lineWidth = 3 * ui / 1.5; ctx.stroke(); ctx.lineWidth = 1;
    // nodes
    BANDS.forEach(([ty, fc], bi) => {
      const X = XF(fc, x, pw), Y = Yg(sum(fc)), R = (bi === sel ? 9 : 7) * ui;
      ctx.fillStyle = cols[bi]; ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.fill(); ctx.strokeStyle = cols[bi]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, R + 2.5 * ui, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
      text(ctx, String(bi + 1), X, Y + 0.5, { size: 9 * ui, w: 700, col: S.bg, align: 'center' });
    });
    // hover bubble on the selected node (rows type in on 16ths from the bar line)
    { const [ty, fc, q] = BANDS[sel], X = XF(fc, x, pw), Y = Yg(sum(fc)), bx = Math.min(x + pw - 170 * ui, X + 16 * ui), by = Math.max(y + 4 * ui, Y - 76 * ui), bw = 160 * ui, bh = 56 * ui;
      const rows = L.steps(t, Math.floor(t / BAR) * 4, 3, 0.25);
      ctx.strokeStyle = rgba(S.ink, 0.6); ctx.beginPath(); ctx.moveTo(X + 8 * ui, Y - 8 * ui); ctx.lineTo(bx, by + bh); ctx.stroke();
      ctx.fillStyle = rgba(S.bg, 0.92); ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = rgba(S.ink, 0.8); ctx.strokeRect(cr(bx), cr(by), Math.round(bw), Math.round(bh));
      const note = (() => { const n = 12 * Math.log2(fc / 440) + 57, ni = Math.round(n), cents = Math.round((n - ni) * 100), nm = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((ni % 12) + 12) % 12]; return `${nm}${Math.floor(ni / 12)} ${cents >= 0 ? '+' : '−'}${Math.abs(cents)}c`; })();
      const R3 = [`F ${fc >= 1000 ? (fc / 1000).toFixed(2) + ' kHz' : fc.toFixed(1) + ' Hz'} · ${note}`, `G ${g[sel] >= 0 ? '+' : '−'}${Math.abs(g[sel]).toFixed(1)} dB`, `Q ${(1 / q).toFixed(2)} · ${ty}`];
      R3.slice(0, rows).forEach((s, i) => lbl(ctx, S, s, bx + 8 * ui, by + 12 * ui + i * 16 * ui, ui, { size: 10, a: 1 }));
    }
    // frequency ruler + piano strip on the same log x
    const ry = y + h + 2 * ui;
    [['20', 20], ['50', 50], ['100', 100], ['200', 200], ['500', 500], ['1k', 1000], ['2k', 2000], ['5k', 5000], ['10k', 10000], ['20k', 20000]].forEach(([s, fq]) => lbl(ctx, S, s, XF(fq, x, pw), ry + rulerH / 2, ui, { size: 9, align: 'center', a: 0.55 }));
    const py = ry + rulerH;
    ctx.strokeStyle = rgba(S.ink, 0.25); ctx.strokeRect(cr(x), cr(py), Math.round(pw), Math.round(pianoH));
    for (let m = 21; m <= 108; m++) {
      const fq = 440 * Math.pow(2, (m - 69) / 12), X = XF(fq, x, pw), bk = [1, 3, 6, 8, 10].includes(m % 12);
      const lit = BANDS.findIndex(([, fc]) => Math.abs(12 * Math.log2(fc / fq)) < 0.5);
      if (bk) { ctx.fillStyle = lit >= 0 ? cols[lit] : rgba(S.ink, 0.3); ctx.fillRect(Math.round(X - 1.5 * ui), Math.round(py), Math.max(2, Math.round(3 * ui)), Math.round(pianoH * 0.6)); }
      else { ctx.fillStyle = lit >= 0 ? cols[lit] : rgba(S.ink, 0.22); ctx.fillRect(Math.round(X), Math.round(py), 1, Math.round(pianoH)); }
      if (m % 12 === 0 && m >= 24 && m <= 96) lbl(ctx, S, 'C' + (m / 12 - 1), X + 2 * ui, py + pianoH - 6 * ui, ui, { size: 8, a: 0.5 });
    }
  };

  // ---------------------------------------------------------------- LOUDNESS: segmented 270° arc gauge + sub-gauges + numeric cells
  M7.loud = (ctx, S, r, t, o) => {
    const ui = o.ui, [x, y0, w, h] = r, f = fidx(t), tf = tickF(t);
    const y = M7.header(ctx, S, x, y0, w, ui, 'loudness.exe', `BEAT · ${D.key} · ${Math.round(D.bpm)}`);
    const cellsH = 52 * ui, avail = y0 + h - y - cellsH - 14 * ui, R = Math.min(w * 0.3, avail * 0.36), cx = x + w / 2, cy = y + R + 16 * ui;
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5, NT = 84, A = (v) => a0 + span * clamp((v + 36) / 36);
    const vS = F.S[tf], lit = (v) => v <= vS;
    for (let i = 0; i < NT; i++) {
      const v = -36 + 36 * i / (NT - 1), a = A(v), over = v > -14 + 1;
      ctx.strokeStyle = lit(v) ? (over ? S.hot : S.ink) : rgba(S.ink, 0.18); ctx.lineWidth = 2 * ui / 1.5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (const v of [-36, -24, -14, -6, 0]) lbl(ctx, S, String(v), cx + Math.cos(A(v)) * R * 1.13, cy + Math.sin(A(v)) * R * 1.13, ui, { size: 9, align: 'center', a: v === -14 ? 0.95 : 0.5 });
    ctx.strokeStyle = rgba(S.ink, 0.3); ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, a0, a0 + span); ctx.stroke();
    text(ctx, fmt(F.S[tf]), cx, cy, { size: R * 0.36, w: 500, col: S.ink, align: 'center' });
    lbl(ctx, S, 'lufs short-term', cx, cy + R * 0.3, ui, { size: 10, align: 'center', a: 0.55, ls: 0.3 });
    // sub-gauges: M and I at 22 %
    [['m', F.M[tf]], ['i', F.I[tf]]].forEach(([nm, v], i) => {
      const sr = R * 0.24, sx = cx + (i ? 1 : -1) * R * 0.62, sy = cy + R * 0.78;
      for (let k = 0; k < 24; k++) { const vv = -36 + 36 * k / 23, a = A(vv); ctx.strokeStyle = vv <= v ? S.ink : rgba(S.ink, 0.18); ctx.beginPath(); ctx.moveTo(sx + Math.cos(a) * sr * 0.72, sy + Math.sin(a) * sr * 0.72); ctx.lineTo(sx + Math.cos(a) * sr, sy + Math.sin(a) * sr); ctx.stroke(); }
      text(ctx, fmt(v), sx, sy, { size: sr * 0.5, w: 500, col: S.ink, align: 'center' }); lbl(ctx, S, nm, sx, sy + sr * 0.55, ui, { size: 9, align: 'center', a: 0.5 });
    });
    M7.cells(ctx, S, x, y0 + h - cellsH, w, cellsH, ui, [['peak', fmt(Math.max(F.hlL[tf], F.hlR[tf]))], ['lufs', fmt(F.I[tf])], ['lra', F.LRA[tf].toFixed(1)], ['true peak', fmt(F.TP[tf])]], 1);
  };

  // ---------------------------------------------------------------- WAVEFORM "cutter": played 90 %, unplayed 35 %, 2 px accent playhead
  const W2 = (() => { const b = atob(D.wave2.b64), a = new Int8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = (b.charCodeAt(i) << 24) >> 24; return a; })();
  L.W2 = W2;
  M7.wave = (ctx, S, r, t, o) => {
    const ui = o.ui, [x, y0, w, h] = r, cps = D.wave2.cps;
    const y = o.header === false ? y0 : M7.header(ctx, S, x, y0, w, ui, 'session.exe', `${L.tag('title')} · ${D.bars} BARS`);
    // segment tabs (song structure inside the clip)
    const tabs = []; let prev = null;
    for (let b = 0; b < D.bars; b++) { const lb = L.labelAt(b); if (lb !== prev) tabs.push([b, lb]); prev = lb; }
    const span = o.span || D.duration, t0 = o.span ? t - 0.3 * span : 0, X = (tt) => x + w * (tt - t0) / span;
    tabs.forEach(([b, lb], i) => { const xa = X(b * BAR), xb = X((tabs[i + 1] ? tabs[i + 1][0] : D.bars) * BAR); if (xb < x || xa > x + w) return; const xa2 = Math.max(x, xa), xb2 = Math.min(x + w, xb), act = t >= b * BAR && t < (tabs[i + 1] ? tabs[i + 1][0] : D.bars) * BAR;
      ctx.fillStyle = act ? S.ink : 'rgba(0,0,0,0)'; ctx.fillRect(Math.round(xa2), Math.round(y), Math.round(xb2 - xa2) - 2, Math.round(14 * ui)); ctx.strokeStyle = rgba(S.ink, 0.5); ctx.strokeRect(cr(xa2), cr(y), Math.round(xb2 - xa2) - 3, Math.round(14 * ui));
      text(ctx, lb, xa2 + 5 * ui, y + 7 * ui, { size: 9 * ui, col: act ? S.bg : rgba(S.ink, 0.7), w: 700, ls: 0.6 }); });
    const ry = y + 20 * ui;
    for (let b = Math.ceil(t0 / BAR); b * BAR <= t0 + span; b++) { const Xb = Math.round(X(b * BAR)); if (Xb < x || Xb > x + w) continue; ctx.fillStyle = rgba(S.ink, 0.6); ctx.fillRect(Xb, Math.round(ry), 1, Math.round(8 * ui)); lbl(ctx, S, String(D.song.startBar + b), Xb + 3 * ui, ry + 4 * ui, ui, { size: 9, w: 700, a: 0.8 }); }
    const wy = ry + 14 * ui, onsetH = 20 * ui, wh = y0 + h - wy - onsetH - 8 * ui, laneH = wh / 2;
    for (let ch = 0; ch < 2; ch++) {
      const cy = Math.round(wy + laneH * ch + laneH / 2), sc = laneH * 0.48 / 127;
      for (let px = 0; px < w; px++) {
        const ta = t0 + span * px / w, tb = t0 + span * (px + 1) / w; if (tb < 0 || ta >= D.duration) continue;
        const i0 = Math.max(0, Math.floor(ta * cps)), i1 = Math.min(D.wave2.n - 1, Math.max(i0, Math.ceil(tb * cps) - 1));
        let mn = 127, mx = -127, rm = 0; for (let i = i0; i <= i1; i++) { const q = i * 6 + ch * 3; if (W2[q] < mn) mn = W2[q]; if (W2[q + 1] > mx) mx = W2[q + 1]; if (W2[q + 2] > rm) rm = W2[q + 2]; }
        const played = ta <= t;
        ctx.fillStyle = rgba(S.ink, played ? 0.5 : 0.18); ctx.fillRect(Math.round(x + px), Math.round(cy - mx * sc), 1, Math.max(1, Math.round((mx - mn) * sc)));
        ctx.fillStyle = rgba(S.ink, played ? 0.9 : 0.35); ctx.fillRect(Math.round(x + px), Math.round(cy - rm * sc), 1, Math.max(1, Math.round(rm * 2 * sc)));
      }
    }
    // onset lane: kick, snare, hat as 1 px dashes
    const oy = y0 + h - onsetH;
    [['kick', 0], ['snare', 1], ['hat', 2]].forEach(([k, i]) => { for (const [, s, tq] of D.onsets[k]) { const Xo = Math.round(X(tq)); if (Xo < x || Xo > x + w) continue; ctx.fillStyle = rgba(S.ink, tq <= t ? 0.85 : 0.3); ctx.fillRect(Xo, Math.round(oy + i * 6 * ui), 1, Math.round(4 * ui)); } });
    const PX = Math.round(X(t)); ctx.fillStyle = S.hot; ctx.fillRect(PX, Math.round(y + 16 * ui), 2, Math.round(y0 + h - y - 16 * ui));
    lbl(ctx, S, bbt(t), PX + 6 * ui, wy + 6 * ui, ui, { size: 10, w: 700, a: 1, col: S.hot });
  };

  // ---------------------------------------------------------------- BAND ENERGY: horizontal bars, loudest band in the accent
  M7.bands = (ctx, S, r, t, o) => {
    const ui = o.ui, [x, y0, w, h] = r, tf = tickF(t), be = F.bands[tf];
    const y = M7.header(ctx, S, x, y0, w, ui, 'bands.dat', `BANDS · ${D.key} · ${Math.round(D.bpm)}`);
    const rows = D.bandNames.length, rh = (y0 + h - y) / rows, top = be.indexOf(Math.max(...be));
    D.bandNames.forEach((nm, i) => {
      const yy = y + i * rh + rh / 2, bx = x + 80 * ui, bw = w - 150 * ui, v = clamp(be[i]);
      lbl(ctx, S, nm.toLowerCase(), x, yy, ui, { size: 11, a: 0.7 });
      ctx.fillStyle = rgba(S.ink, 0.1); ctx.fillRect(Math.round(bx), Math.round(yy - 3 * ui), Math.round(bw), Math.round(6 * ui));
      ctx.fillStyle = i === top ? S.hot : S.ink; ctx.fillRect(Math.round(bx), Math.round(yy - 3 * ui), Math.round(bw * v), Math.round(6 * ui));
      text(ctx, v.toFixed(2), x + w, yy, { size: 15 * ui, col: S.ink, align: 'right' });
    });
  };

  window.L6.M7 = M7;
})();
