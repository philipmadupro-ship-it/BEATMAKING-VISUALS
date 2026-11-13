/* v7 meters, part 2: Aurora-method visualisers (ideas ported from Aurora by Joe Croskey, AGPL-3.0; no code copied):
 * spectrum with glow line + gradient fill + 0.22 s trail, spectrogram with a contrast LUT and alpha = v^0.56,
 * stereo density scope with 0.42 s persistence, folded-light spectral surface. Plus the shared look kit:
 * display type with per-letter decode, dashed elbow connectors, window chrome, micro labels. Exposes L6.M7 / L6.K. */
(function () {
  'use strict';
  const L = window.L6, { D, F, FPS, NF, BEAT, BAR, T, rgba, mix, text, fmt, bbt, fidx, clamp, lerp, hash, MONO, SANS } = L, M7 = L.M7;
  const X20 = (f, x, w) => x + w * Math.log(f / 20) / Math.log(1000);
  const lbl = (ctx, S, s, x, y, ui, o = {}) => text(ctx, s, x, y, { size: (o.size || 10) * ui, col: rgba(o.col || S.ink, o.a == null ? 0.6 : o.a), align: o.align, w: o.w || 500, ls: (o.ls == null ? 0.6 : o.ls) * ui, base: o.base });

  // monotone-ish interpolation of the 61 1/6-oct bands onto pixel columns (max of neighbours keeps narrow peaks)
  function specPx(sp, x, w) {
    const c = D.oct6, out = new Float32Array(Math.ceil(w) + 1);
    for (let px = 0; px <= w; px++) {
      const f = 20 * Math.pow(1000, px / w), lf = Math.log2(f / 1000) * 6 + 34, i = Math.max(0, Math.min(c.length - 2, Math.floor(lf))), k = clamp(lf - i);
      const a = sp[Math.max(0, i - 1)], b = sp[i], cc = sp[i + 1], d = sp[Math.min(c.length - 1, i + 2)];
      // Catmull-Rom between b and cc
      out[px] = 0.5 * ((2 * b) + (-a + cc) * k + (2 * a - 5 * b + 4 * cc - d) * k * k + (-a + 3 * b - 3 * cc + d) * k * k * k);
    }
    return out;
  }
  // spectrum: peak-keeping log projection, 3-stop gradient fill, 4 px glow at 10 %, 1.3 px line, 0.22 s trail (0.8 px, 0.17*(1-age/0.22))
  M7.spectrum = (ctx, S, r, t, o) => {
    const ui = o.ui, [x0, y0, w0, h0] = r;
    const y = L.M7.header(ctx, S, x0, y0, w0, ui, 'spectrum.vst', `SPECTRUM · ${D.key} · ${Math.round(D.bpm)}`);
    const x = x0, w = w0, h = y0 + h0 - y - 18 * ui, f = fidx(t), Y = (v) => y + h * clamp(-v / 90);
    for (let d = 0; d >= -90; d -= 10) { const yy = Math.round(Y(d)) + 0.5; ctx.strokeStyle = rgba(S.ink, d % 30 === 0 ? 0.12 : 0.05); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); if (d % 30 === 0) lbl(ctx, S, String(d), x + w - 3 * ui, yy - 7 * ui, ui, { size: 9, a: 0.45, align: 'right' }); }
    for (const fq of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const X = Math.round(X20(fq, x, w)) + 0.5; ctx.strokeStyle = rgba(S.ink, [100, 1000, 10000].includes(fq) ? 0.16 : 0.06); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); }
    [['20 Hz', 20, 'left'], ['632', 632, 'center'], ['20 kHz', 20000, 'right']].forEach(([s, fq, al]) => lbl(ctx, S, s, X20(fq, x, w), y + h + 10 * ui, ui, { size: 9, a: 0.55, align: al }));
    lbl(ctx, S, 'dBFS', x + 3 * ui, y + 8 * ui, ui, { size: 9, a: 0.5 });
    const trail = Math.round(0.22 * FPS);
    for (let k = trail; k >= 1; k--) { const p = specPx(F.spec[Math.max(0, f - k)], x, w); ctx.beginPath(); for (let px = 0; px <= w; px += 2) { const yy = Y(p[px]); px ? ctx.lineTo(x + px, yy) : ctx.moveTo(x + px, yy); } ctx.strokeStyle = rgba(S.ink, 0.17 * (1 - k / (trail + 1))); ctx.lineWidth = 0.8; ctx.stroke(); }
    ctx.lineWidth = 1;
    const p = specPx(F.spec[f], x, w);
    ctx.beginPath(); ctx.moveTo(x, y + h); for (let px = 0; px <= w; px++) ctx.lineTo(x + px, Y(p[px])); ctx.lineTo(x + w, y + h); ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgba(S.ink, 0.25)); g.addColorStop(0.5, rgba(S.waveHi, 0.19)); g.addColorStop(1, rgba(S.waveHi, 0.025)); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); for (let px = 0; px <= w; px++) { const yy = Y(p[px]); px ? ctx.lineTo(x + px, yy) : ctx.moveTo(x + px, yy); }
    ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(S.waveHi, 0.1); ctx.lineWidth = 4; ctx.stroke();
    const sg = ctx.createLinearGradient(0, y, 0, y + h); sg.addColorStop(0, S.ink); sg.addColorStop(1, S.waveHi); ctx.strokeStyle = sg; ctx.lineWidth = 1.3 * ui / 1.2; ctx.stroke(); ctx.lineWidth = 1;
  };
  M7.scopeTrace = (ctx, S, r, t, o) => {
    const ui = o.ui, [x, y, w, h] = r, span = BEAT * 2, t0 = t - span, cps = D.wave2.cps, W2 = L.W2;
    for (const [ch, off] of [[0, -0.22], [1, 0.22]]) {
      ctx.beginPath();
      for (let px = 0; px <= w; px += 2) { const tt = t0 + span * px / w, i = clamp(Math.floor(tt * cps), 0, D.wave2.n - 1), q = i * 6 + ch * 3, v = tt < 0 ? 0 : (px % 4 ? W2[q + 1] : W2[q]) / 127; const Yy = y + h * (0.5 + off) - v * h * 0.2; px ? ctx.lineTo(x + px, Yy) : ctx.moveTo(x + px, Yy); }
      ctx.strokeStyle = S.ink; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
    }
    lbl(ctx, S, 'ch1 l', x + 6 * ui, y + 10 * ui, ui, { size: 10 }); lbl(ctx, S, 'ch2 r', x + 6 * ui, y + h - 10 * ui, ui, { size: 10 });
    lbl(ctx, S, `${Math.round(span * 100)} ms/div · trig ${bbt(t)}`, x + w - 6 * ui, y + 10 * ui, ui, { size: 10, align: 'right' });
  };

  // spectrogram: 256-entry LUT, v = norm^contrast; <.18 panel->A, ..mid A->B, >mid B->C, >.76 toward ink 18 %; alpha v^0.56, 0 below .015; 12 s window
  const specCache = {};
  M7.spectro = (ctx, S, r, t, o) => {
    const ui = o.ui, [x0, y0, w, h0] = r, n = D.spectroBins, key = S.name;
    const y = L.M7.header(ctx, S, x0, y0, w, ui, 'spectrogram.vst', `SPECTROGRAM · 12 s · ${Math.round(D.bpm)}`), x = x0, h = y0 + h0 - y - 18 * ui;
    if (!specCache[key]) {
      const hx = (v) => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
      const P0 = hx(S.bg), A = hx(S.spec[1]), B = hx(S.spec[2]), C = hx(S.spec[3]), I = hx(S.ink), mid = 0.52, LUT = [];
      for (let i = 0; i < 256; i++) {
        const v = Math.pow(i / 255, 1.0); let col;
        if (v < 0.18) col = P0.map((c0, j) => lerp(c0, A[j], v / 0.18)); else if (v < mid) col = A.map((c0, j) => lerp(c0, B[j], (v - 0.18) / (mid - 0.18))); else col = B.map((c0, j) => lerp(c0, C[j], (v - mid) / (1 - mid)));
        if (v > 0.76) col = col.map((c0, j) => lerp(c0, I[j], 0.18 * (v - 0.76) / 0.24));
        LUT.push([...col, v < 0.015 ? 0 : 255 * Math.pow(v, 0.56)]);
      }
      const c = document.createElement('canvas'); c.width = NF; c.height = n; const g = c.getContext('2d'), im = g.createImageData(NF, n);
      for (let f = 0; f < NF; f++) for (let b = 0; b < n; b++) {
        const db = L.SPECTRO[f * n + b] / 255 * 100 - 100, idx = Math.round(clamp((db + 90) / 90) * 255), q = LUT[idx], o4 = ((n - 1 - b) * NF + f) * 4;
        im.data[o4] = q[0]; im.data[o4 + 1] = q[1]; im.data[o4 + 2] = q[2]; im.data[o4 + 3] = q[3];
      }
      g.putImageData(im, 0, 0); specCache[key] = c;
    }
    const WIN = 12, f = fidx(t), span = Math.round(WIN * FPS), f0 = f - span, sx = Math.max(0, f0), sw = f + 1 - sx, dx = x + w * (sx - f0) / span;
    ctx.imageSmoothingEnabled = true; if (sw > 0) ctx.drawImage(specCache[key], sx, 0, sw, n, dx, y, x + w - dx, h);
    for (const [s, fq] of [['10k', 10000], ['1k', 1000], ['100', 100]]) { const Yy = Math.round(y + h * (1 - Math.log(fq / 20) / Math.log(1000))) + 0.5; ctx.strokeStyle = rgba(S.ink, 0.14); ctx.beginPath(); ctx.moveTo(x, Yy); ctx.lineTo(x + w, Yy); ctx.stroke(); lbl(ctx, S, s, x + w - 4 * ui, Yy - 7 * ui, ui, { size: 9, a: 0.6, align: 'right' }); }
    for (let i = 1; i < 3; i++) { const X = Math.round(x + w * i / 3) + 0.5; ctx.strokeStyle = rgba(S.ink, 0.08); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); }
    lbl(ctx, S, '12 s', x, y + h + 10 * ui, ui, { size: 9, a: 0.55 }); lbl(ctx, S, 'now', x + w, y + h + 10 * ui, ui, { size: 9, align: 'right', a: 0.55 });
  };

  // stereo: M/S density scope, bilinear additive splats, persistence exp(-age/(0.31T))(1-age/T), T = 0.42 s,
  // alpha = 1 - exp(-(d + 0.085 * neighbours) * 0.85); correlation bar with a ring-dot marker
  M7.stereo = (ctx, S, r, t, o) => {
    const ui = o.ui, [x0, y0, w, h0] = r, f = fidx(t), N = D.gonioN;
    const y = L.M7.header(ctx, S, x0, y0, w, ui, 'gonio.scope', `STEREO · M/S · ${Math.round(D.bpm)}`), h = y0 + h0 - y;
    const G = 220, R = Math.min(w * 0.46, (h - 70 * ui) * 0.92), cx = x0 + w / 2, cy = y + R + 14 * ui;
    const dens = new Float32Array(G * G), Tp = 0.42, keep = Math.round(Tp * FPS);
    for (let back = 0; back <= keep; back++) {
      const ff = f - back; if (ff < 0) break; const age = back / FPS, wgt = Math.exp(-age / (0.31 * Tp)) * (1 - age / Tp);
      for (let i = 0; i < N; i++) {
        const sx = L.GS[ff * N + i] / 127, my = Math.abs(L.GM[ff * N + i] / 127), gx = (sx * 0.5 + 0.5) * (G - 2), gy = (1 - my) * (G - 2), ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
        dens[iy * G + ix] += wgt * (1 - fx) * (1 - fy); dens[iy * G + ix + 1] += wgt * fx * (1 - fy); dens[(iy + 1) * G + ix] += wgt * (1 - fx) * fy; dens[(iy + 1) * G + ix + 1] += wgt * fx * fy;
      }
    }
    const oc = document.createElement('canvas'); oc.width = G; oc.height = G; const og = oc.getContext('2d'), im = og.createImageData(G, G);
    const ink = [parseInt(S.ink.slice(1, 3), 16), parseInt(S.ink.slice(3, 5), 16), parseInt(S.ink.slice(5, 7), 16)];
    for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
      const d = dens[j * G + i], nb = dens[j * G + i - 1] + dens[j * G + i + 1] + dens[(j - 1) * G + i] + dens[(j + 1) * G + i];
      const a = 1 - Math.exp(-(d + 0.085 * nb) * 0.85 * 1.6); const o4 = (j * G + i) * 4; im.data[o4] = ink[0]; im.data[o4 + 1] = ink[1]; im.data[o4 + 2] = ink[2]; im.data[o4 + 3] = 255 * a;
    }
    og.putImageData(im, 0, 0);
    ctx.strokeStyle = rgba(S.ink, 0.16); ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
    for (const a of [Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy + 0.5); ctx.lineTo(cx + R, cy + 0.5); ctx.stroke();
    ctx.imageSmoothingEnabled = true; ctx.drawImage(oc, cx - R, cy - R, 2 * R, R);
    lbl(ctx, S, 'm', cx, cy - R - 9 * ui, ui, { size: 10, align: 'center', a: 0.6 }); lbl(ctx, S, 'l', cx - R * 0.74, cy - R * 0.76, ui, { size: 10, align: 'center', a: 0.55 }); lbl(ctx, S, 'r', cx + R * 0.74, cy - R * 0.76, ui, { size: 10, align: 'center', a: 0.55 }); lbl(ctx, S, 's', cx + R + 10 * ui, cy, ui, { size: 10, align: 'center', a: 0.5 });
    const c = F.corr[L.M7.tickF(t)], by = y0 + h0 - 12 * ui, bx = x0 + 40 * ui, bw = w - 80 * ui, X = (v) => bx + bw * (v + 1) / 2;
    ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(Math.round(bx), Math.round(by), Math.round(bw), 1);
    for (const v of [-1, -0.5, 0, 0.5, 1]) ctx.fillRect(Math.round(X(v)), Math.round(by - 3 * ui), 1, Math.round(6 * ui));
    ctx.fillStyle = S.ink; ctx.fillRect(Math.round(Math.min(X(0), X(c))), Math.round(by - 1), Math.round(Math.abs(X(c) - X(0))), 3);
    ctx.strokeStyle = S.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X(c), by + 0.5, 5 * ui, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    [['−1', -1], ['0', 0], ['+1', 1]].forEach(([s, v]) => lbl(ctx, S, s, X(v), by + 14 * ui, ui, { size: 9, align: 'center', a: 0.55 }));
    lbl(ctx, S, `corr ${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(2)}`, x0 + w, by - 14 * ui, ui, { size: 11, align: 'right', a: 0.9 });
  };

  // folded-light spectral surface (hero meter): spectral history as lit translucent ridges, slow orbit
  M7.surface = (ctx, S, r, t, o) => {
    const ui = o.ui, [x, y, w, h] = r, f = fidx(t), ROWS = 40, COLS = 72, STR = 2;
    const yaw = -0.6 + 0.4 * Math.sin(t * 0.21), pitch = 0.6, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), spn = Math.sin(pitch);
    const sc = Math.min(w * 0.52, h * 0.95), ox = x + w / 2, oy = y + h * 0.68;
    const proj = (u, v, hv) => { const X = u * 1.25, Z = (v - 0.5) * 1.6, Yv = hv * 0.8; const xr = X * cyw - Z * syw, zr = X * syw + Z * cyw; const yr = Yv * cp - zr * spn, zz = Yv * spn + zr * cp, p = 4 / (4 + zz); return [ox + xr * sc * p, oy - yr * sc * p, zz]; };
    const H = []; for (let ri = 0; ri < ROWS; ri++) { const ff = f - ri * STR, sp = F.spec[Math.max(0, ff)], row = new Float32Array(COLS); for (let c = 0; c < COLS; c++) { const b = Math.floor(c * sp.length / COLS); row[c] = ff < 0 ? 0 : clamp((sp[b] + 84) / 72); } H.push(row); }
    const P = H.map((row, ri) => Array.from(row, (hv, c) => proj(c / (COLS - 1) * 2 - 1, ri / (ROWS - 1), hv)));
    for (let ri = ROWS - 2; ri >= 0; ri--) {
      const fade = 1 - ri / ROWS;
      for (let c = 0; c < COLS - 1; c++) {
        const h0 = H[ri][c], h1 = H[ri][c + 1], h2 = H[ri + 1][c], nx = -(h1 - h0) * 6, nz = -(h2 - h0) * 3, nl = Math.hypot(nx, 1, nz), lit = clamp(0.5 + 0.5 * (nx * 0.45 + 0.8 - nz * 0.35) / nl);
        ctx.fillStyle = rgba(S.ink, (0.03 + 0.32 * lit * lit) * fade * clamp(0.2 + (h0 + h1) * 1.2));
        const a = P[ri][c], b = P[ri][c + 1], cc = P[ri + 1][c + 1], d = P[ri + 1][c];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(cc[0], cc[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); P[ri].forEach((p, c) => (c ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = rgba(S.ink, ri === 0 ? 0.95 : 0.08 + 0.2 * fade); ctx.lineWidth = ri === 0 ? 1.5 : 1; ctx.stroke(); ctx.lineWidth = 1;
    }
    lbl(ctx, S, 'FOLDED LIGHT · 2.6 s HISTORY · 72 BANDS', x + w - 4 * ui, y + 8 * ui, ui, { size: 9, align: 'right', a: 0.5 });
  };

  // ---------------------------------------------------------------- look kit
  const K = {};
  // display type: heavy grotesk, condensed/extended, per-letter decode on 16ths (block -> outline -> solid), glyph surgery
  K.word = (ctx, S, s, cx, cy, size, t, b0, o = {}) => {
    const wscale = o.width || 0.78, col = o.col || S.ink;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(wscale, 1);
    ctx.font = `700 ${size}px ${SANS}`; ctx.letterSpacing = '0px'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const chars = [...s], widths = chars.map((c) => ctx.measureText(c).width * 0.96), tw = widths.reduce((a, b) => a + b, 0);   // tight tracking
    let x0 = o.align === 'left' ? 0 : -tw / 2; const asc = size * 0.72;
    chars.forEach((ch, i) => {
      const st = o.static ? 9 : L.steps(t, b0 + i * 0.25 * (o.rate || 1), 3, 0.125 * (o.rate || 1));
      const surg = o.surgery && /[A-Z]/.test(ch) && chars.length >= 4 && i > 0 && i < chars.length - 1 && hash(i * 7.1 + s.length) < 0.22;
      if (st === 1) { ctx.fillStyle = col; ctx.fillRect(x0, -asc, widths[i] * 0.9, asc); }
      else if (st === 2 || (st >= 3 && o.hollow && hash(i * 3.3 + s.length * 1.7) < 0.3)) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, size * 0.018); ctx.strokeText(ch, x0, 0); }
      else if (st >= 3) {
        if (surg) { ctx.fillStyle = col; ctx.fillRect(x0 + widths[i] * 0.1, -asc * 0.62, widths[i] * 0.78, asc * 0.24); }   // glyph surgery: a letter becomes a bar
        else { ctx.fillStyle = col; ctx.fillText(ch, x0, 0); }
      }
      x0 += widths[i];
    });
    ctx.restore(); ctx.letterSpacing = '0px';
    return tw * wscale;
  };
  // dashed elbow connector with rounded corner + square terminals; n of 3 steps drawn (start, elbow, end)
  K.wire = (ctx, S, a, b, n = 3, vertFirst = false) => {
    if (n <= 0) return;
    const m = vertFirst ? [a[0], b[1]] : [b[0], a[1]];
    ctx.save(); ctx.strokeStyle = rgba(S.ink, 0.75); ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a[0] + 0.5, a[1] + 0.5);
    if (n >= 2) { ctx.arcTo(m[0] + 0.5, m[1] + 0.5, b[0] + 0.5, b[1] + 0.5, 14); }
    else ctx.lineTo((a[0] + m[0]) / 2 + 0.5, (a[1] + m[1]) / 2 + 0.5);
    if (n >= 3) ctx.lineTo(b[0] + 0.5, b[1] + 0.5);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = S.bg; ctx.strokeStyle = S.ink;
    for (const p of n >= 3 ? [a, b] : [a]) { ctx.fillRect(p[0] - 3, p[1] - 3, 7, 7); ctx.strokeRect(p[0] - 2.5, p[1] - 2.5, 6, 6); }
    ctx.restore();
  };
  K.micro = (ctx, S, s, x, y, ui, o = {}) => text(ctx, s, x, y, { size: (o.size || 13) * ui, col: rgba(S.ink, o.a == null ? 0.75 : o.a), align: o.align, w: 400, ls: 0.3 * ui });
  // window chrome: 1 px frame, mono lowercase title bar, tiny QR glyph, - x boxes
  K.window = (ctx, S, r, title, ui, o = {}) => {
    const [x, y, w, h] = r.map(Math.round), th = Math.round(22 * ui);
    ctx.fillStyle = o.fill || S.card; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = rgba(S.ink, 0.75); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = rgba(S.ink, 0.06); ctx.fillRect(x + 1, y + 1, w - 2, th);
    ctx.fillStyle = rgba(S.ink, 0.6); ctx.fillRect(x + 1, y + th, w - 2, 1);
    text(ctx, title, x + 9 * ui, y + th / 2 + 1, { size: 11 * ui, col: S.ink, w: 500, ls: 0.4 * ui });
    for (let i = 0; i < 2; i++) { const bx = x + w - (14 + i * 15) * ui; ctx.strokeStyle = rgba(S.ink, 0.6); ctx.strokeRect(Math.round(bx) + 0.5, Math.round(y + 6 * ui) + 0.5, Math.round(9 * ui), Math.round(9 * ui)); }
    if (!o.noQR) { const q = 3 * ui, qx = x + w - 13 * ui - 6 * q, qy = y + h - 9 * ui - 6 * q; ctx.fillStyle = rgba(S.ink, 0.7); for (let i = 0; i < 25; i++) if (hash(i * 3.7 + title.length) > 0.45) ctx.fillRect(Math.round(qx + (i % 5) * q), Math.round(qy + Math.floor(i / 5) * q), Math.ceil(q), Math.ceil(q)); }
    return [x + 8 * ui, y + th + 8 * ui, w - 16 * ui, h - th - 16 * ui];
  };
  L.K = K;
})();
