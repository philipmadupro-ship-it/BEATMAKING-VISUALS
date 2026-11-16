// v11 stereo imager after iZotope Ozone Imager's Vectorscope (refs/ozone-polar-level.png, ozone-lissajous.png):
//   POLAR SAMPLE  half disc, one dot per 8 kHz sample, decaying persistence;
//   POLAR LEVEL   half disc, petals: per-sector level (instant attack, slow release) as a filled polygon, radial spikes,
//                 and a held outline;
//   LISSAJOUS     rotated square (L / R on the diagonals), dots with a connected trail of the newest samples;
// plus the vertical correlation bar (+1 .. -1, a square marker), the L .. R balance line with its dot, and 4-band width
// (the clip's M/S analysis, crossovers 120 Hz / 1.2 kHz / 6 kHz). Everything comes from the real per-bin M/S data
// (analysis/stereo.js, msspec.js) and the 8 kHz L/R scope stream; nothing is decorative.
import * as ML from './meterlib.js';

const IMG = { NIGREDO: ['#8a8a8a', '#ffffff', '#c8c8c8', '#c8c8c8'], ALBEDO: ['#6e4433', '#1a1917', '#3a2a22', '#a8432e'], CITRINITAS: ['#6e4433', '#f0d79a', '#d79a35', '#e0475f'], RUBEDO: ['#5a1020', '#ff9be0', '#a35cf0', '#e0475f'] };
export const imgCols = (S) => { const p = IMG[S.name] || [S.sig1, S.ink, S.ink, S.hot]; return { lo: p[0], hi: p[1], mid: p[2], neg: S.grey ? '#c8c8c8' : S.hot === p[3] ? p[3] : S.hot }; };

export function createImagerView(L, M8, H) {
  const { D, F, FPS, rgba, text, clamp, fidx, MONO } = L, { lbl, reveal, cr, hatch, tickF } = H, SC = D.scope;
  const scopeSpan = (ff) => { const e = Math.min(SC.L.length, Math.floor(ff / FPS * SC.rate)); return [Math.max(0, e - Math.round(SC.rate / FPS)), e]; };

  /** Closed smooth path through points (midpoint quadratic), starting at the first point. */
  function smooth(ctx, P) {
    ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length - 1; i++) { const m = [(P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2]; ctx.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]); }
    ctx.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  }

  function imager(ctx, S, r, t, k) {
    const [x0, y0, w, h] = r; reveal(ctx, x0, y0, w, h, k);
    const f = fidx(t), tf = tickF(t), C = imgCols(S), mode = L.meter('stereo', 'mode', 'sample'), range = L.meter('stereo', 'range', 40), gain = L.meter('stereo', 'gain', 1);
    const fs = L.floorSize(ctx, 15), liss = mode === 'lissajous', hair = 1;
    // 4-band width rail along the bottom (real, ticked per frame), then the L..R balance line, then the scope
    const railH = Math.round(clamp(h * 0.2, 52, 76)), balY = y0 + h - railH - 10, corrX = x0 + w - 40, top = y0 + 30, scopeBot = balY - 12;
    const avail = scopeBot - top, R = Math.max(30, Math.min((corrX - 24 - x0) / 2, liss ? avail / 2 : avail)), cx = x0 + (corrX - 14 - x0) / 2 + 6;
    const cy = liss ? top + avail / 2 : Math.min(scopeBot, top + R + (avail - R) * 0.5);   // half disc sits on its baseline
    const ink = (a) => rgba(S.ink, a);
    // ---- grid
    ctx.lineWidth = hair; ctx.strokeStyle = ink(0.32);
    if (liss) {
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx + R, cy); ctx.lineTo(cx, cy + R); ctx.lineTo(cx - R, cy); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = ink(0.14); ctx.beginPath(); ctx.moveTo(cx - R / 2, cy - R / 2); ctx.lineTo(cx + R / 2, cy + R / 2); ctx.moveTo(cx + R / 2, cy - R / 2); ctx.lineTo(cx - R / 2, cy + R / 2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = ink(0.14); ctx.beginPath(); for (const a of [-Math.PI / 4, Math.PI / 4]) { ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); } ctx.stroke();
      ctx.strokeStyle = ink(0.32); ctx.beginPath(); ctx.moveTo(cx - R, cr(cy)); ctx.lineTo(cx + R, cr(cy)); ctx.stroke();
    }
    // clipped samples in this frame: the rim lights
    let clip = false; { const lv = D.lv, b1 = Math.min(lv.n, Math.floor(f / FPS * lv.rate)), b0 = Math.max(0, b1 - Math.round(lv.rate / FPS)); for (let b = b0; b < b1; b++) if (lv.clipL[b] || lv.clipR[b]) clip = true; }
    if (clip) { ctx.strokeStyle = C.neg; ctx.lineWidth = 2.5; ctx.beginPath(); if (liss) { ctx.moveTo(cx, cy - R); ctx.lineTo(cx + R, cy); ctx.lineTo(cx, cy + R); ctx.lineTo(cx - R, cy); ctx.closePath(); } else ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI); ctx.stroke(); ctx.lineWidth = hair; }
    // ---- data
    if (mode === 'level') {
      // petals: fill (instant attack, release `smoothing` dB/s) and the held outline (3 dB/s fall after `hold` s)
      const PN = D.polarN, rel = L.meter('stereo', 'smoothing', 12), hold = L.meter('stereo', 'hold', 0.5), rho = (db) => clamp(1 + db / range, 0, 1);
      const fill = [], out = [];
      for (let j = 0; j < PN; j++) { const g = (ff) => D.polar[ff * PN + j] + 20 * Math.log10(gain); fill.push(rho(ML.releaseAt(g, f, FPS, rel, -range - 1))); out.push(rho(ML.releaseAt(g, f, FPS, 3, -range - 1, hold))); }
      const P = (j, v) => { const th = -Math.PI / 2 + (j + 0.5) / PN * Math.PI; return [cx + R * v * Math.sin(th), cy - R * v * Math.cos(th)]; };
      const poly = (arr) => [[cx - R * arr[0] * 1, cy], ...arr.map((v, j) => P(j, v)), [cx + R * arr[PN - 1], cy]];
      const gradF = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); gradF.addColorStop(0, rgba(C.hi, 0.5)); gradF.addColorStop(1, rgba(C.mid, 0.2));
      ctx.beginPath(); smooth(ctx, poly(fill)); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fillStyle = gradF; ctx.fill();
      ctx.strokeStyle = rgba(C.hi, 0.4); ctx.lineWidth = hair; ctx.beginPath(); for (let j = 0; j < PN; j++) if (fill[j] > 0.04) { const p = P(j, fill[j]); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); } ctx.stroke();
      ctx.beginPath(); smooth(ctx, poly(out)); ctx.strokeStyle = rgba(C.hi, 0.95); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); smooth(ctx, poly(fill)); ctx.strokeStyle = rgba(C.hi, 0.55); ctx.lineWidth = 1; ctx.stroke();
    } else {
      // dots: every 8 kHz sample of the last `persist` s, alpha exp(-age/(0.31 T))·(1 - age/T); the newest frame also as a trail line
      const Tp = Math.max(1 / FPS, L.meter('stereo', 'persist', 0.42)), keep = Math.round(Tp * FPS), sc = SC.scale * gain, dot = Math.max(1.1, R / 110);
      let g = 1; if (liss) { const peakAt = (ff) => { const [a0, a1] = scopeSpan(ff); let m = 0; for (let i = a0; i < a1; i++) m = Math.max(m, Math.abs(SC.L[i]), Math.abs(SC.R[i])); return 20 * Math.log10(Math.max(1e-6, m * sc)); };
        g = 0.9 / Math.max(0.075, 10 ** (ML.releaseAt(peakAt, f, FPS, 6, -24) / 20)); }
      const XY = (l, rr) =>  /* |x|+|y| = R is full scale */ { if (liss) { const [X, Y] = ML.lissajous(l, rr, g); return [cx + X * R * ML.SQ, cy - Y * R * ML.SQ];  } const p = ML.polarSample(l, rr, range); return p ? [cx + p[0] * R, cy - p[1] * R] : null; };
      ctx.save(); ctx.beginPath(); if (liss) { ctx.moveTo(cx, cy - R); ctx.lineTo(cx + R, cy); ctx.lineTo(cx, cy + R); ctx.lineTo(cx - R, cy); ctx.closePath(); } else { ctx.arc(cx, cy, R + 1, Math.PI, 2 * Math.PI); ctx.closePath(); } ctx.clip();
      for (let back = keep; back >= 0; back--) { const ff = f - back; if (ff < 0) continue; const age = back / FPS, wgt = Math.exp(-age / (0.31 * Tp)) * (1 - age / Tp); if (wgt <= 0.01) continue; const [a0, a1] = scopeSpan(ff);
        ctx.fillStyle = rgba(back === 0 ? C.hi : C.mid, clamp(0.12 + 0.88 * wgt)); ctx.beginPath();
        for (let i = a0; i < a1; i++) { const p = XY(SC.L[i] * sc, SC.R[i] * sc); if (p) ctx.rect(p[0] - dot / 2, p[1] - dot / 2, dot, dot); } ctx.fill(); }
      if (liss) { const [a0, a1] = scopeSpan(f); ctx.beginPath(); let st = false; for (let i = a0; i < a1; i++) { const p = XY(SC.L[i] * sc, SC.R[i] * sc); if (p) { st ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); st = true; } }
        ctx.strokeStyle = rgba(C.hi, 0.35); ctx.lineWidth = 1; ctx.stroke(); }
      ctx.restore();
    }
    // L / R under the baseline (half disc) or on the diagonals (Lissajous); the mode name, small, top-left
    if (liss) { lbl(ctx, S, 'L', cx - R * 0.5 - 10, cy - R * 0.5 - 10, { size: 15, align: 'center', a: 0.6 }); lbl(ctx, S, 'R', cx + R * 0.5 + 10, cy - R * 0.5 - 10, { size: 15, align: 'center', a: 0.6 }); }
    else { lbl(ctx, S, 'L', cx - R, cy + 12, { size: 15, align: 'center', a: 0.6 }); lbl(ctx, S, 'R', cx + R, cy + 12, { size: 15, align: 'center', a: 0.6 }); }
    lbl(ctx, S, { sample: 'POLAR SAMPLE', level: 'POLAR LEVEL', lissajous: 'LISSAJOUS' }[mode] || 'POLAR SAMPLE', x0 + 4, y0 + 12, { size: 15, a: 0.55, maxW: corrX - x0 - 70 });
    // ---- vertical correlation bar: +1 top, 0, -1 bottom; a square marker at the value (Ozone), faint fill from 0
    const cyM = (top + scopeBot) / 2, Yc = (v) => cyM - (scopeBot - top) / 2 * clamp(v, -1, 1), cv = F.corr[f], ct = F.corr[tf];
    ctx.fillStyle = ink(0.32); ctx.fillRect(corrX, top, 1, scopeBot - top); for (const v of [1, 0, -1]) ctx.fillRect(corrX - 3, Math.round(Yc(v)), 7, 1);
    const fy0 = Math.min(Yc(0), Yc(cv)), fh = Math.abs(Yc(cv) - Yc(0));
    if (cv >= 0) { ctx.fillStyle = rgba(C.mid, 0.35); ctx.fillRect(corrX + 2, fy0, 3, fh); } else if (S.grey) hatch(ctx, corrX + 2, fy0, 3, fh, C.neg); else { ctx.fillStyle = rgba(C.neg, 0.6); ctx.fillRect(corrX + 2, fy0, 3, fh); }
    ctx.fillStyle = cv < 0 ? C.neg : S.ink; ctx.fillRect(corrX - 4, Math.round(Yc(cv)) - 2, 9, 4);
    lbl(ctx, S, '+1', corrX + 10, top + 4, { size: 14, a: 0.5 }); lbl(ctx, S, '0', corrX + 10, cyM, { size: 14, a: 0.5 }); lbl(ctx, S, '−1', corrX + 10, scopeBot - 4, { size: 14, a: 0.5 });
    lbl(ctx, S, `${ct >= 0 ? '+' : '−'}${Math.abs(ct).toFixed(2)}`, x0 + w - 2, y0 + 12, { size: 16, align: 'right', a: 0.9, col: ct < 0 ? C.neg : S.ink });
    // ---- balance: a hairline L .. R with a dot at the 3 s level balance (±6 dB)
    const bx = x0 + 6, bw = corrX - 14 - bx, bal = ML.balanceAt(D.lv, f / FPS, 3), Xb = (v) => bx + bw * (clamp(v, -6, 6) + 6) / 12;
    ctx.fillStyle = ink(0.25); ctx.fillRect(bx, Math.round(balY), bw, 1); ctx.fillStyle = ink(0.5); ctx.fillRect(Math.round(Xb(0)), balY - 3, 1, 7);
    ctx.fillStyle = S.ink; ctx.fillRect(Math.round(Xb(bal)) - 2, Math.round(balY) - 2, 4, 5);
    // ---- 4-band width: crossovers 120 Hz / 1.2 kHz / 6 kHz; a bar per band (0 .. 200 %), the percentage under it
    const MS = D.ms, ry = y0 + h - railH, cw = (w - 6) / 4, edges = ['20–120', '120–1.2k', '1.2k–6k', '6k–20k'];
    for (let b = 0; b < 4; b++) {
      const v = MS.bandWidth[tf * 4 + b], bx0 = x0 + 3 + b * cw + 6, bw0 = cw - 12, u = clamp(v / 200), by = ry + 8;
      ctx.fillStyle = ink(0.1); ctx.fillRect(bx0, by, bw0, 4); ctx.fillStyle = rgba(C.mid, 0.9); ctx.fillRect(bx0, by, Math.max(1, bw0 * u), 4); ctx.fillStyle = ink(0.45); ctx.fillRect(Math.round(bx0 + bw0 / 2), by - 2, 1, 8);
      text(ctx, `${Math.round(v)}%`, bx0, ry + 28, { size: 17, w: 600, col: S.ink, maxW: bw0 });
      lbl(ctx, S, edges[b], bx0, ry + railH - 4, { size: 13, a: 0.5, maxW: bw0 });
    }
    ctx.restore();
  }
  // mirrored per-frequency width W(f) = PS/(PM+PS) about a centre line (a mono mix is a flat line), log f 20 Hz..20 kHz
  function widthStrip(ctx, S, r, t, C = imgCols(S)) {
    const [x, y, w, h] = r, MS = D.ms, nW = MS.wBins, f = fidx(t), cy = y + h * 0.5, hh = h * 0.4, Xf = (fq) => x + w * Math.log(fq / 20) / Math.log(1000);
    ctx.fillStyle = rgba(S.ink, 0.35); ctx.fillRect(x, Math.round(cy), w, 1);
    const pts = []; for (let j = 0; j < nW; j++) pts.push([Xf(20 * 1000 ** ((j + 0.5) / nW)), MS.widthSpec[f * nW + j] / 255]);
    ctx.beginPath(); pts.forEach(([X, v], i) => (i ? ctx.lineTo(X, cy - v * hh) : ctx.moveTo(X, cy - v * hh))); for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], cy + pts[i][1] * hh);
    ctx.closePath(); ctx.fillStyle = rgba(C.mid, 0.35); ctx.fill(); ctx.strokeStyle = S.ink; ctx.lineWidth = 1.25; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
  }
  return { imager, widthStrip };
}
