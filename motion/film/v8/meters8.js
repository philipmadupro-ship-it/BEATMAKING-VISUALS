/* v8 meters, drawn inside the v6-style windows (content rect r = [x, y, w, h], reveal step k = 0..1, never alpha).
 * Every value is measured from the real audio (tools/clipdata.py, tested in tests/test_meters.py).
 * - EQ: an original display in the spirit of a pro parametric EQ (smooth summed curve, numbered band nodes, filled
 *   bands, tilted analyzer behind, dual dB rulers, note strip, hover bubble). No third-party logos or trade dress.
 * - Loudness: Kollide-frames style instrument (segmented 270 deg arc gauge, sub-gauges, numeric cells).
 * - Spectrogram / stereo / surface: methods after Aurora by Joe Croskey (AGPL-3.0). Ideas and parameters only were
 *   re-implemented here; no Aurora code is used.
 * Display ticks (numbers) step on the half beat; EQ gains are automation steps on the beat (eased 4 frames).
 * Exposes L6.M8. */
(function () {
  'use strict';
  const L = window.L6, { D, F, FPS, NF, BEAT, BAR, T, rgba, mix, text, fmt, bbt, fidx, clamp, lerp, hash, MONO, SANS } = L;
  const M8 = {};
  const lbl = (ctx, S, s, x, y, o = {}) => text(ctx, s, x, y, { size: o.size || 22, col: rgba(o.col || S.ink, o.a == null ? 0.7 : o.a), align: o.align, w: o.w || 500, ls: o.ls == null ? 0 : o.ls, base: o.base, maxW: o.maxW });
  const cr = (v) => Math.round(v) + 0.5;
  const tickF = (t) => fidx(Math.floor(t / (BEAT / 2)) * (BEAT / 2));   // display tick: the frame at the last half beat
  M8.tickF = tickF;
  function reveal(ctx, x, y, w, h, k) { ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, w + 4, (h + 4) * k); ctx.clip(); }
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
    const Yg = (db) => y + h * (0.5 - db / 30), Ya = (v) => y + h * clamp(-v / 90);
    for (const fq of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) { const X = cr(XF(fq, x, pw)); ctx.strokeStyle = rgba(S.ink, [100, 1000, 10000].includes(fq) ? 0.18 : 0.07); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); }
    for (let db = -12; db <= 12; db += 6) { const Y = cr(Yg(db)); ctx.strokeStyle = rgba(S.ink, db === 0 ? 0.32 : 0.07); ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x + pw, Y); ctx.stroke(); if (db % 12 === 0) lbl(ctx, S, (db > 0 ? '+' : '') + db, x - 8, Y, { align: 'right', a: 0.9 }); }
    for (const v of [0, -45, -90]) lbl(ctx, S, String(v), x + pw + 6, clamp(Ya(v), y + 11, y + h - 11), { a: 0.45 });
    // analyzer behind: pre (thin), post (filled + line), tilted +4.5 dB/oct about 1 kHz
    const sp = F.spec[f], c6 = D.oct6, path = (gf) => c6.map((fq, i) => [XF(fq, x, pw), Ya(sp[i] + 4.5 * Math.log2(fq / 1000) + gf(fq))]);
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
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5, NT = 48, A = (v) => a0 + span * clamp((v + 36) / 36), vS = F.S[f];
    for (let i = 0; i < NT; i++) {   // the segmented arc runs at frame rate (real ballistics)
      const v = -36 + 36 * i / (NT - 1), a = A(v), over = v > -13;
      ctx.strokeStyle = v <= vS ? (over ? S.hot : S.ink) : rgba(S.ink, 0.16); ctx.lineWidth = Math.max(3, R * 0.05);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
    }
    ctx.lineWidth = 1;
    const am = A(F.M[f]); ctx.strokeStyle = S.hot; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(am) * R * 0.45, cy + Math.sin(am) * R * 0.45); ctx.lineTo(cx + Math.cos(am) * R * 0.76, cy + Math.sin(am) * R * 0.76); ctx.stroke(); ctx.lineWidth = 1;
    const tv = A(-14); ctx.fillStyle = S.ink; ctx.beginPath(); ctx.arc(cx + Math.cos(tv) * R * 1.1, cy + Math.sin(tv) * R * 1.1, 4, 0, 7); ctx.fill();
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

  // ---------------------------------------------------------------- SPECTROGRAM: LUT, alpha v^0.56, 8 s window
  const specCache = {};
  M8.spectro = (ctx, S, r, t, k) => {
    const [x, y, w, h0] = r, n = D.spectroBins, key = S.name, h = h0 - 30; reveal(ctx, x, y, w, h0, k);
    if (!specCache[key]) {
      const hx = (v) => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
      const A = hx(S.spec[1]), B = hx(S.spec[2]), C = hx(S.spec[3]), I = hx(S.ink), P0 = hx(S.card), mid = 0.52, LUT = [];
      for (let i = 0; i < 256; i++) {
        const v = i / 255; let col;
        if (v < 0.18) col = P0.map((c0, j) => lerp(c0, A[j], v / 0.18)); else if (v < mid) col = A.map((c0, j) => lerp(c0, B[j], (v - 0.18) / (mid - 0.18))); else col = B.map((c0, j) => lerp(c0, C[j], (v - mid) / (1 - mid)));
        if (v > 0.76) col = col.map((c0, j) => lerp(c0, I[j], 0.18 * (v - 0.76) / 0.24));
        if (S.grey) { const g = Math.round((col[0] + col[1] + col[2]) / 3); col = [g, g, g]; }
        LUT.push([...col.map(Math.round), v < 0.015 ? 0 : 255 * Math.pow(v, 0.56)]);
      }
      const c = document.createElement('canvas'); c.width = NF; c.height = n; const g = c.getContext('2d'), im = g.createImageData(NF, n);
      for (let f = 0; f < NF; f++) for (let b = 0; b < n; b++) {
        const db = L.SPECTRO[f * n + b] / 255 * 100 - 100, q = LUT[Math.round(clamp((db + 90) / 90) * 255)], o4 = ((n - 1 - b) * NF + f) * 4;
        im.data[o4] = q[0]; im.data[o4 + 1] = q[1]; im.data[o4 + 2] = q[2]; im.data[o4 + 3] = q[3];
      }
      g.putImageData(im, 0, 0); specCache[key] = c;
    }
    const WIN = 8, f = fidx(t), span = Math.round(WIN * FPS), f0 = f - span, sx = Math.max(0, f0), sw = f + 1 - sx, dx = x + w * (sx - f0) / span;
    ctx.fillStyle = S.card; ctx.fillRect(x, y, w, h);
    ctx.imageSmoothingEnabled = true; if (sw > 0) ctx.drawImage(specCache[key], sx, 0, sw, n, dx, y, x + w - dx, h);
    for (const [s, fq] of [['10k', 10000], ['1k', 1000], ['100', 100]]) { const Yy = Math.round(y + h * (1 - Math.log(fq / 20) / Math.log(1000))) + 0.5; ctx.strokeStyle = rgba(S.ink, 0.16); ctx.beginPath(); ctx.moveTo(x, Yy); ctx.lineTo(x + w, Yy); ctx.stroke(); lbl(ctx, S, s, x + w - 4, Yy - 13, { align: 'right', a: 0.7 }); }
    for (let b = Math.ceil((t - WIN) / BAR); b * BAR <= t; b++) { const X = x + w * (b * BAR - (t - WIN)) / WIN; if (X < x + 20) continue; ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(Math.round(X), y + h, 1, 8); if (b % 2 === 0 && X < x + w - 80) lbl(ctx, S, String(D.song.startBar + b), X + 4, y + h + 16, { a: 0.55 }); }
    lbl(ctx, S, 'now', x + w, y + h + 16, { align: 'right', a: 0.7 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- STEREO: M/S density scope, 0.42 s persistence + correlation
  M8.stereo = (ctx, S, r, t, k) => {
    const [x0, y0, w, h] = r; reveal(ctx, x0, y0, w, h, k);
    const f = fidx(t), N = D.gonioN, G = 200, R = Math.min(w * 0.46, (h - 90) * 0.95), cx = x0 + w / 2, cy = y0 + R + 30;
    const dens = new Float32Array(G * G), Tp = 0.42, keep = Math.round(Tp * FPS);
    for (let back = 0; back <= keep; back++) {
      const ff = f - back; if (ff < 0) break; const age = back / FPS, wgt = Math.exp(-age / (0.31 * Tp)) * (1 - age / Tp);
      for (let i = 0; i < N; i++) {
        const sx = L.GS[ff * N + i] / 127, my = Math.abs(L.GM[ff * N + i] / 127), gx = (sx * 0.5 + 0.5) * (G - 2), gy = (1 - my) * (G - 2), ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
        dens[iy * G + ix] += wgt * (1 - fx) * (1 - fy); dens[iy * G + ix + 1] += wgt * fx * (1 - fy); dens[(iy + 1) * G + ix] += wgt * (1 - fx) * fy; dens[(iy + 1) * G + ix + 1] += wgt * fx * fy;
      }
    }
    const oc = M8._oc || (M8._oc = document.createElement('canvas')); oc.width = G; oc.height = G; const og = oc.getContext('2d'), im = og.createImageData(G, G);
    const hx = (v) => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)], c1 = hx(S.ink), c2 = hx(S.sig1);
    for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
      const d = dens[j * G + i], nb = dens[j * G + i - 1] + dens[j * G + i + 1] + dens[(j - 1) * G + i] + dens[(j + 1) * G + i];
      const a = 1 - Math.exp(-(d + 0.085 * nb) * 1.36), o4 = (j * G + i) * 4, m = clamp(d * 0.6);
      im.data[o4] = lerp(c2[0], c1[0], m); im.data[o4 + 1] = lerp(c2[1], c1[1], m); im.data[o4 + 2] = lerp(c2[2], c1[2], m); im.data[o4 + 3] = 255 * a;
    }
    og.putImageData(im, 0, 0);
    ctx.strokeStyle = rgba(S.ink, 0.2); ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
    for (const a of [Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy + 0.5); ctx.lineTo(cx + R, cy + 0.5); ctx.stroke();
    ctx.imageSmoothingEnabled = true; ctx.drawImage(oc, cx - R, cy - R, 2 * R, R);
    lbl(ctx, S, 'M', cx, cy - R - 14, { align: 'center', a: 0.8, w: 700 }); lbl(ctx, S, 'L', cx - R * 0.8, cy - R * 0.8, { align: 'center', a: 0.6 }); lbl(ctx, S, 'R', cx + R * 0.8, cy - R * 0.8, { align: 'center', a: 0.6 });
    const c = F.corr[tickF(t)], by = y0 + h - 18, bx = x0 + 34, bw = w - 68, X = (v) => bx + bw * (v + 1) / 2;
    ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(Math.round(bx), Math.round(by), Math.round(bw), 1);
    for (const v of [-1, 0, 1]) ctx.fillRect(Math.round(X(v)), Math.round(by - 6), 1, 12);
    ctx.fillStyle = c < 0 ? S.hot : S.ink; ctx.fillRect(Math.round(Math.min(X(0), X(F.corr[f]))), Math.round(by - 2), Math.round(Math.abs(X(F.corr[f]) - X(0))), 5);
    ctx.strokeStyle = S.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(F.corr[f]), by + 0.5, 7, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    lbl(ctx, S, '−1', bx - 6, by, { align: 'right', a: 0.55 }); lbl(ctx, S, '+1', bx + bw + 6, by, { a: 0.55 });
    lbl(ctx, S, `corr ${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(2)}`, x0 + w, by - 30, { align: 'right', a: 0.95 });
    lbl(ctx, S, `w ${F.width[tickF(t)].toFixed(2)}`, x0, by - 30, { a: 0.7 });
    ctx.restore();
  };

  // ---------------------------------------------------------------- SCOPE: L/R traces, sample-accurate (wave2), triggered on the beat
  const W2 = (() => { if (!D.wave2) return null; const b = atob(D.wave2.b64), a = new Int8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = (b.charCodeAt(i) << 24) >> 24; return a; })();
  L.W2 = W2;
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
    const f = fidx(t), ROWS = 34, COLS = 64, STR = 2, yaw = -0.5 + 0.12 * ((Math.floor(t / BAR) % 4) - 1.5), pitch = 0.62, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), spn = Math.sin(pitch);
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

  window.L6.M8 = M8;
})();
