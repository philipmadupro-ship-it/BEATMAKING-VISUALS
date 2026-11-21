// v11 stereo imager after iZotope Ozone Imager's Vectorscope (refs/ozone-polar-level.png, ozone-lissajous.png):
//   POLAR SAMPLE  half disc, one dot per 8 kHz sample, decaying persistence;
//   POLAR LEVEL   half disc, petals: per-sector level (instant attack, slow release) as a filled polygon, radial spikes,
//                 and a held outline;
//   LISSAJOUS     rotated square (L / R on the diagonals), dots with a connected trail of the newest samples;
// plus the correlation bar, the L .. R balance line with its dot, and (v13) the static elephant mark, nothing around it (L.pendantMark). Everything comes from the real per-bin M/S data
// (analysis/stereo.js, msspec.js) and the 8 kHz L/R scope stream; nothing is decorative.
import * as ML from './meterlib.js';
import { hexRgb } from './core.js';

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


  // ======================================================================================================================
  // v12 POLAR SAMPLE: a dense density cloud. Every 8 kHz L/R sample of the last `persist` s is splatted into a half-disc
  // grid at its real polar position (M up, S sideways, radius = level in dB), decayed by age; colour and alpha follow the
  // accumulated density (stage ramp, greys in Nigredo). A near-mono beat stays a vertical column; its density, its length
  // (level) and the held peak ring still move with the music. Nothing is drawn off the data.
  const DENS = {};
  function lutFor(S) {
    const key = [S.name, S.ink, S.card].join('|'); if (DENS[key]) return DENS[key];
    const C = imgCols(S), A = hexRgb(C.lo), B = hexRgb(C.mid), Z = hexRgb(C.hi), lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) { const v = i / 255, c = v < 0.5 ? A.map((a, j) => a + (B[j] - a) * v / 0.5) : B.map((b, j) => b + (Z[j] - b) * (v - 0.5) / 0.5);
      lut[i * 4] = c[0]; lut[i * 4 + 1] = c[1]; lut[i * 4 + 2] = c[2]; lut[i * 4 + 3] = i < 3 ? 0 : 255 * Math.pow(v, 0.55); }
    return (DENS[key] = lut);
  }
  const GRID = {};
  /** v14 player rows under the half disc: WIDTH (real S/M width, 0..200 %), CORR (+1..-1), BAL (L .. R, +-6 dB) as slider bars with a value, then the 4 band
   *  widths (ms.bandWidth, splits 120 Hz / 1.2 kHz / 6 kHz) with their band labels. Values tick on the half beat (tf); the thumbs follow the frame. */
  function playerRows(ctx, S, x0, w, lay, rowH, f, tf, C) {
    const ink = (a) => rgba(S.ink, a), widY = lay.widY, corY = widY + lay.step, balY = corY + lay.step, labW = Math.max(L.floorSize(ctx, 11) * 3.3, 62), valW = Math.max(L.floorSize(ctx, 16) * 0.74 * 5.2, 66), bx0 = x0 + 6 + labW, bx1 = x0 + w - 6 - valW;
    const rows = [
      ['WIDTH', widY, (v) => (clamp(v, 0, 2)) / 2, F.width[f], F.width[tf], (v) => `${Math.round(v * 100)}%`, 0.5, [0, 0.5, 1]],
      ['CORR', corY, (v) => (clamp(v, -1, 1) + 1) / 2, F.corr[f], F.corr[tf], (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`, 0.5, [0, 0.25, 0.5, 0.75, 1]],
      ['BAL', balY, (v) => (clamp(v, -6, 6) + 6) / 12, ML.balanceAt(D.lv, f / FPS, 3), ML.balanceAt(D.lv, tf / FPS, 3), (v) => (Math.abs(v) < 0.05 ? '0.0 dB' : `${v < 0 ? 'L' : 'R'} ${Math.abs(v).toFixed(1)}`), 0.5, [0, 0.25, 0.5, 0.75, 1]]];
    for (const [nm, ry, pos, vNow, vTick, fmtv, zero, ticks] of rows) {
      const yc = Math.round(ry + rowH / 2), X = (u) => bx0 + (bx1 - bx0) * u, neg = nm === 'CORR' && vNow < 0, th = pos(vNow);
      lbl(ctx, S, nm, x0 + 6, yc, { size: 11, a: 0.7, maxW: labW - 2 });
      ctx.fillStyle = ink(0.16); ctx.fillRect(bx0, yc, bx1 - bx0, 1);                                         // the track
      ctx.fillStyle = ink(0.4); for (const u of ticks) ctx.fillRect(Math.round(X(u)), yc - (u === zero ? 5 : 3), 1, u === zero ? 10 : 6);
      const z = nm === 'WIDTH' ? 0.5 : zero, fx0 = Math.min(X(z), X(th)), fw = Math.abs(X(th) - X(z));   // fill from the centre mark (WIDTH: from 100 %)
      if (nm === 'WIDTH') { ctx.fillStyle = rgba(C.mid, 0.5); ctx.fillRect(bx0, yc - 1.5, X(th) - bx0, 3); } else if (neg && S.grey) hatch(ctx, fx0, yc - 1.5, fw, 3, C.neg); else { ctx.fillStyle = rgba(neg ? C.neg : C.mid, 0.6); ctx.fillRect(fx0, yc - 1.5, fw, 3); }
      ctx.fillStyle = neg ? C.neg : S.ink; ctx.fillRect(Math.round(X(th)) - 1.5, yc - 8, 3, 16);
      text(ctx, fmtv(vTick), x0 + w - 6, yc, { size: 16, w: 700, align: 'right', col: nm === 'CORR' && vTick < 0 ? C.neg : S.ink, maxW: valW });
    }
    // band widths: the value (Akira) over the band's range (Synkopy), a hairline underline scaled to the width (0..200 %)
    const by = lay.bandY + 6, bw4 = (w - 12) / 4, names = ['20–120', '120–1K', '1K–6K', '6K–20K'], bwv = D.ms.bandWidth, sV = L.floorSize(ctx, 16) * 0.74;
    ctx.fillStyle = ink(0.16); ctx.fillRect(x0 + 6, by - 3, w - 12, 1);
    for (let b = 0; b < 4; b++) { const v = bwv[tf * 4 + b], cxm = x0 + 6 + bw4 * (b + 0.5), u = clamp(v / 200);
      text(ctx, `${Math.round(v)}%`, cxm, by + 4 + sV * 0.55, { size: 16, w: 700, align: 'center', col: S.ink, maxW: bw4 - 6 });
      ctx.fillStyle = ink(0.12); ctx.fillRect(cxm - bw4 * 0.35, by + 8 + sV, bw4 * 0.7, 2); ctx.fillStyle = rgba(C.mid, 0.8); ctx.fillRect(cxm - bw4 * 0.35, by + 8 + sV, bw4 * 0.7 * u, 2);
      lbl(ctx, S, names[b], cxm, by + 14 + sV + L.floorSize(ctx, 11) * 0.55, { size: 11, a: 0.55, align: 'center', maxW: bw4 - 4 }); }
  }

  function imagerSample(ctx, S, r, t, k, opt = {}) {
    const [x0, y0, w, h] = r; reveal(ctx, x0, y0, w, h, k);
    const f = fidx(t), tf = tickF(t), C = imgCols(S), range = L.meter('stereo', 'range', 40), gain = L.meter('stereo', 'gain', 1), ink = (a) => rgba(S.ink, a);
    const fz = (s) => L.floorSize(ctx, s), small = h < 460, LH = fz(22);
    // v13 stack, top to bottom: the half disc (as wide as the window allows), CORR, BAL, then the static elephant mark (no frame) in whatever height is left (no BAND WIDTH, no WIDTH strip). Too little room (small windows): no mark.
    const rowH = Math.max(34, LH + 12), gap = 10, top = y0 + LH + 8, below = LH * 1.7, R0 = (w - 16) / 2 - 4;
    const wantD = Math.min(w - 12, 236), fixed = (top - y0) + below + 2 * rowH + 4 * gap;
    let R = Math.max(40, Math.min(R0, h - fixed - 20)), Dm = Math.min(wantD, h - fixed - R - 16);
    if (Dm < 110 || !L.pendantMark) { Dm = 0; R = Math.max(40, Math.min(R0, h - fixed + gap)); }
    let cx = x0 + w / 2, cy = top + R, balY = y0 + h - 12 - rowH, corY = balY - rowH - gap;   // CORR + BAL anchored to the bottom
    let mkTop = cy + below, mkH = corY - gap - mkTop, mkCx = cx, mkCy = mkTop + mkH / 2, mkR = Dm / 2;
    // v14 player: half disc on top, then WIDTH / CORR / BAL slider rows, then the 4 band widths (no elephant mark, no dB labels under the disc)
    let plLay = null; const PL = opt.variant === 'player', plRow = Math.max(28, LH + 8), plBand = Math.round(fz(11) + fz(16) * 0.74 + 14), plPad = 6;
    if (PL) { Dm = 0; const rowsH = 3 * plRow + plBand + 4 * 6, topPl = y0 + Math.round(LH * 0.9) + 4; R = Math.max(40, Math.min(R0, h - rowsH - (topPl - y0) - 12)); cx = x0 + w / 2; cy = topPl + R;
      const spare = Math.max(0, h - (cy - y0) - 8 - rowsH - 8), ex = Math.min(spare / 4, 26), stp = plRow + ex * 0.6; plLay = { widY: cy + 8 + ex * 0.5, step: stp, bandY: cy + 8 + ex * 0.5 + 3 * stp + ex * 0.2 };
      corY = plLay.widY + stp; balY = corY + stp; }
    // v14.1 player, wide cell: the disc on the left (as big as the cell allows), the WIDTH / CORR / BAL rows + bands on the right
    let plX = x0, plW = w;
    if (PL && w > 1.45 * h) { const topPl = y0 + Math.round(LH * 0.9) + 4, dW = Math.round(w * 0.47); cy = y0 + h - 22; R = Math.max(40, Math.min(dW / 2 - 10, cy - topPl - 22)); cx = x0 + 10 + dW / 2;
      const rowsH = 3 * plRow + plBand + 12, avail = y0 + h - 10 - topPl, ex = Math.min(Math.max(0, avail - rowsH) / 4, 22), stp = plRow + ex * 0.6, y1 = topPl + Math.max(0, (avail - rowsH - ex * 2) / 2) + plRow * 0.5;
      plLay = { widY: y1, step: stp, bandY: y1 + 3 * stp + ex * 0.2 }; corY = y1 + stp; balY = corY + stp; plX = x0 + dW + 8; plW = w - dW - 8; }
    if (Dm) L.portholeRect = [mkCx, mkCy, mkR];
    // ---- density
    const CELL = R >= 150 ? 2 : 1.5, gw = Math.ceil(2 * R / CELL) + 2, gh = Math.ceil(R / CELL) + 2, gk = gw + 'x' + gh;
    let G = GRID[gk]; if (!G) { G = GRID[gk] = { acc: new Float32Array(gw * gh), cv: document.createElement('canvas') }; G.cv.width = gw; G.cv.height = gh; G.im = G.cv.getContext('2d').createImageData(gw, gh); }
    const acc = G.acc; acc.fill(0);
    const Tp = Math.max(1 / FPS, L.meter('stereo', 'persist', 0.42)), keep = Math.min(Math.round(Tp * FPS * 1.6), f), sc = SC.scale * gain, ox = R / CELL + 1, oy = R / CELL + 0.5;
    for (let back = keep; back >= 0; back--) {
      const ff = f - back, wgt = Math.exp(-back / FPS / (0.45 * Tp)), [a0, a1] = scopeSpan(ff);
      for (let i = a0; i < a1; i++) { const p = ML.polarSample(SC.L[i] * sc, SC.R[i] * sc, range); if (!p) continue;
        const fx = ox + p[0] * R / CELL - 0.5, fy = oy - p[1] * R / CELL - 0.5, gx = Math.floor(fx), gy = Math.floor(fy), ux = fx - gx, uy = fy - gy;
        if (gx >= 0 && gx < gw - 1 && gy >= 0 && gy < gh - 1) { const o = gy * gw + gx; acc[o] += wgt * (1 - ux) * (1 - uy); acc[o + 1] += wgt * ux * (1 - uy); acc[o + gw] += wgt * (1 - ux) * uy; acc[o + gw + 1] += wgt * ux * uy; } }
    }
    const lut = lutFor(S), d = G.im.data, KD = 0.9;
    for (let i = 0; i < gw * gh; i++) { const v = acc[i], q = (v <= 0 ? 0 : Math.round(255 * (1 - Math.exp(-v * KD)))) * 4; d[i * 4] = lut[q]; d[i * 4 + 1] = lut[q + 1]; d[i * 4 + 2] = lut[q + 2]; d[i * 4 + 3] = lut[q + 3]; }
    G.cv.getContext('2d').putImageData(G.im, 0, 0);
    // ---- grid: dB rings, angle spokes (M 0°, L / R ±45°, S ±90°), rim ticks
    ctx.lineWidth = 1; const arc = (rho) => { ctx.beginPath(); ctx.arc(cx, cy, R * rho, Math.PI, 2 * Math.PI); ctx.stroke(); };
    ctx.strokeStyle = ink(0.13); for (const dB of [-10, -20, -30]) arc(1 + dB / range);
    ctx.strokeStyle = ink(0.4); arc(1);
    const spoke = (deg, a) => { const th = deg * Math.PI / 180; ctx.strokeStyle = ink(a); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(th) * R, cy - Math.cos(th) * R); ctx.stroke(); };
    spoke(-67.5, 0.07); spoke(-22.5, 0.07); spoke(22.5, 0.07); spoke(67.5, 0.07); spoke(-45, 0.26); spoke(45, 0.26); spoke(0, 0.26);
    ctx.strokeStyle = ink(0.4); ctx.beginPath(); ctx.moveTo(cx - R, Math.round(cy) + 0.5); ctx.lineTo(cx + R, Math.round(cy) + 0.5); ctx.stroke();
    ctx.beginPath(); for (let a = -90; a <= 90; a += 15) { const th = a * Math.PI / 180, l = a % 45 === 0 ? 9 : 5; ctx.moveTo(cx + Math.sin(th) * R, cy - Math.cos(th) * R); ctx.lineTo(cx + Math.sin(th) * (R - l), cy - Math.cos(th) * (R - l)); } ctx.stroke();
    // clip lights the rim
    let clip = false; { const lv = D.lv, b1 = Math.min(lv.n, Math.floor(f / FPS * lv.rate)), b0 = Math.max(0, b1 - Math.round(lv.rate / FPS)); for (let b = b0; b < b1; b++) if (lv.clipL[b] || lv.clipR[b]) clip = true; }
    if (clip) { ctx.strokeStyle = C.neg; ctx.lineWidth = 2.5; arc(1); ctx.lineWidth = 1; }
    // ---- the cloud (clipped to the disc), then the newest frame's own samples as sharp bright dots
    ctx.save(); ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.arc(cx, cy, R + 0.5, Math.PI, 2 * Math.PI); ctx.closePath(); ctx.clip();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(G.cv, 0, 0, gw, gh, cx - ox * CELL, cy - oy * CELL, gw * CELL, gh * CELL);
    { const [a0, a1] = scopeSpan(f); ctx.fillStyle = rgba(C.hi, 0.95); ctx.beginPath(); const ds = Math.max(2, Math.round(R / 100));
      for (let i = a0; i < a1; i++) { const p = ML.polarSample(SC.L[i] * sc, SC.R[i] * sc, range); if (p) ctx.rect(Math.round(cx + p[0] * R - ds / 2), Math.round(cy - p[1] * R - ds / 2), ds, ds); } ctx.fill(); }
    // held peak ring (6 dB/s fall after 0.4 s): the level the cloud last reached
    { const peakAt = (ff) => { const [a0, a1] = scopeSpan(ff); let m = 0; for (let i = a0; i < a1; i++) m = Math.max(m, Math.hypot((SC.L[i] + SC.R[i]) * ML.SQ, (SC.R[i] - SC.L[i]) * ML.SQ)); return 20 * Math.log10(Math.max(1e-6, m * sc)); };
      const pk = ML.releaseAt(peakAt, f, FPS, 6, -range - 1, 0.4), rho = clamp(1 + pk / range, 0, 1); if (rho > 0.02) { ctx.strokeStyle = rgba(C.hi, 0.7); ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(cx, cy, R * rho, Math.PI * 1.17, Math.PI * 1.83); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; } }
    ctx.restore();
    // ---- labels: M on top, L / R on the ±45° spokes, ∓S at the baseline ends, dB on the baseline
    const lb = (s, X, Y, o = {}) => lbl(ctx, S, s, X, Y, { size: 22, align: 'center', a: 0.75, ...o }), q45 = (R + LH * 0.75) * ML.SQ;
    lb('M', cx, cy - R - LH * 0.55); lb('L', cx - q45, cy - q45 - 2); lb('R', cx + q45, cy - q45 - 2);
    if (!PL) { lb('−S', cx - R + 3, cy + LH * 0.75, { align: 'left' }); lb('+S', cx + R - 3, cy + LH * 0.75, { align: 'right' }); }
    if (!PL) for (const dB of (R < 190 ? [-20] : [-10, -30])) lb(String(dB).replace('-', '−'), cx + R * (1 + dB / range) - 4, cy + LH * 0.75, { a: 0.45, size: 20, maxW: R * 0.23 });
    if (PL) { playerRows(ctx, S, plX, plW, plLay, plRow, f, tf, C); ctx.restore(); return; }
    // ---- correlation: a horizontal bar -1 .. +1, the value ticked (half beat) as a number, the last 0.5 s as ghost ticks
    const bx0 = x0 + 8 + LH * 3.2, bx1 = x0 + w - 8 - LH * 3.6, Xc = (v) => bx0 + (bx1 - bx0) * (clamp(v, -1, 1) + 1) / 2, cv = F.corr[f], ct = F.corr[tf], cyb = corY + rowH / 2;
    lbl(ctx, S, 'CORR', x0 + 6, cyb, { size: 22, a: 0.7 });
    ctx.fillStyle = ink(0.12); ctx.fillRect(bx0, Math.round(cyb) - 3, bx1 - bx0, 6);
    ctx.fillStyle = ink(0.4); for (const v of [-1, -0.5, 0, 0.5, 1]) ctx.fillRect(Math.round(Xc(v)), Math.round(cyb) - (v === 0 || Math.abs(v) === 1 ? 10 : 6), 1, v === 0 || Math.abs(v) === 1 ? 20 : 12);
    const fx0 = Math.min(Xc(0), Xc(cv)), fw = Math.abs(Xc(cv) - Xc(0));
    if (cv >= 0) { ctx.fillStyle = rgba(C.mid, 0.55); ctx.fillRect(fx0, Math.round(cyb) - 3, fw, 6); } else if (S.grey) hatch(ctx, fx0, Math.round(cyb) - 3, fw, 6, C.neg); else { ctx.fillStyle = rgba(C.neg, 0.7); ctx.fillRect(fx0, Math.round(cyb) - 3, fw, 6); }
    for (let b = 1; b <= 12; b++) { const v = F.corr[Math.max(0, f - b)]; ctx.fillStyle = ink(0.22 * (1 - b / 13)); ctx.fillRect(Math.round(Xc(v)) - 1, Math.round(cyb) - 7, 2, 14); }
    ctx.fillStyle = cv < 0 ? C.neg : S.ink; ctx.fillRect(Math.round(Xc(cv)) - 2, Math.round(cyb) - 9, 4, 18);
    text(ctx, `${ct >= 0 ? '+' : '−'}${Math.abs(ct).toFixed(2)}`, x0 + w - 6, cyb, { size: 26, w: 700, align: 'right', col: ct < 0 ? C.neg : S.ink });
    // ---- balance: 3 s level balance L .. R (±6 dB), the number in dB
    const bal = ML.balanceAt(D.lv, f / FPS, 3), Xb = (v) => bx0 + (bx1 - bx0) * (clamp(v, -6, 6) + 6) / 12, byc = balY + rowH / 2;
    lbl(ctx, S, 'BAL', x0 + 6, byc, { size: 22, a: 0.7 });
    ctx.fillStyle = ink(0.12); ctx.fillRect(bx0, Math.round(byc) - 3, bx1 - bx0, 6); ctx.fillStyle = ink(0.4); for (const v of [-6, -3, 0, 3, 6]) ctx.fillRect(Math.round(Xb(v)), Math.round(byc) - (v === 0 ? 10 : 6), 1, v === 0 ? 20 : 12);
    ctx.fillStyle = rgba(C.mid, 0.55); ctx.fillRect(Math.min(Xb(0), Xb(bal)), Math.round(byc) - 3, Math.abs(Xb(bal) - Xb(0)), 6); ctx.fillStyle = S.ink; ctx.fillRect(Math.round(Xb(bal)) - 2, Math.round(byc) - 9, 4, 18);
    text(ctx, Math.abs(bal) < 0.05 ? '0.0 dB' : `${bal < 0 ? 'L' : 'R'} ${Math.abs(bal).toFixed(1)} dB`, x0 + w - 6, byc, { size: 24, w: 600, align: 'right', col: S.ink, maxW: LH * 4.2 });
    // ---- the elephant: a STATIC logo mark with nothing around it (no ring, no frame); the art is the rest-pose elephant
    if (Dm && L.pendantMark) L.pendantMark(ctx, S, mkCx, mkCy, Dm);
    ctx.restore();
  }

  function imager(ctx, S, r, t, k, opt = {}) {
    if (opt.variant === 'player' || L.meter('stereo', 'mode', 'sample') === 'sample') return imagerSample(ctx, S, r, t, k, opt);
    const [x0, y0, w, h] = r; reveal(ctx, x0, y0, w, h, k);
    const f = fidx(t), tf = tickF(t), C = imgCols(S), mode = L.meter('stereo', 'mode', 'sample'), range = L.meter('stereo', 'range', 40), gain = L.meter('stereo', 'gain', 1);
    const fs = L.floorSize(ctx, 15), liss = mode === 'lissajous', hair = 1;
    // 4-band width rail along the bottom (real, ticked per frame), then the L..R balance line, then the scope
    const balY = y0 + h - 12, corrX = x0 + w - 40, top = y0 + 30, scopeBot = balY - 12;
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
    ctx.restore();
  }
  return { imager };
}
