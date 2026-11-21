// v11.1 level meters after FabFilter Pro-L 2 / Pro-MB: a scrolling level + gain-reduction history (newest at the right
// edge, 2 bars wide, beat hairlines) beside tall thin L/R bars (RMS body + fainter peak, vertical gradient, peak-hold
// line, peak LED), a clean tick scale and small Akira readouts (peak, hold, GR, short-term and integrated LUFS). The GR
// is meterlib.grCurve (a feed-forward bus compressor on the clip's own envelope, so every kick is a dip). Nothing is
// drawn from fixed values: every pixel is a function of the audio at t. Pure: (ctx, S, rect, t, k) -> draws inside the rect.
import * as ML from './meterlib.js';

/** Gain-reduction curve for a clip (cached per level stream + settings): dB <= 0 per 1 ms block. */
export function grFor(D, o = {}) {
  const key = [o.thresh ?? 'auto', o.ratio ?? 4, o.knee ?? 6, o.attack ?? 1, o.release ?? 120, o.det ?? 'peak'].join('|'), c = D.lv._gr || (D.lv._gr = {});
  return c[key] || (c[key] = ML.grCurve(D.lv, { thresh: o.thresh ?? null, ratio: o.ratio ?? 4, knee: o.knee ?? 6, attack: o.attack ?? 1, release: o.release ?? 120, det: o.det ?? 'peak' }));
}
/** LED brightness 0..1 at t: 1 on a block over `thr` dBFS, decaying linearly over `decay` s (looks back at most `decay`). */
export function ledAt(lv, t, thr = -3, decay = 0.14) {
  const b1 = Math.min(lv.n, Math.floor(t * lv.rate + 1e-6)), b0 = Math.max(0, b1 - Math.ceil(decay * lv.rate));
  for (let b = b1 - 1; b >= b0; b--) if (Math.max(lv.pkL[b], lv.pkR[b]) >= 10 ** (thr / 20)) return Math.max(0, 1 - (b1 - 1 - b) / (decay * lv.rate));
  return 0;
}

/** Kick glow 0..1 at t: sharp attack on the frame that first shows each kick (L.kickT timing: the grid slot when the detected onset is within 12 ms
 *  of it, frame f drawn at its centre, so f = ceil(tk * fps - 0.5)), then a smooth exponential decay (tau 90 ms, about 120 ms to a quarter). Detector
 *  hits that are off the grid by more than 12 ms are 808 re-triggers, not kick onsets: they flash nothing. A pure function of t (frame-quantised). */
export const GLOW_TAU = 0.09;
export function glowAt(D, t, fps = 30, tau = GLOW_TAU) {
  const ks = D.onsets && D.onsets.kick; if (!ks || !ks.length) return 0;
  const fi = Math.floor(t * fps + 1e-6); let g = 0;
  for (let i = ks.length - 1; i >= 0; i--) {
    const [tr, , tq] = ks[i]; if (Math.abs(tr - tq) > 0.012) continue;
    const age = (fi - Math.max(0, Math.ceil(tq * fps - 0.5))) / fps;
    if (age < 0) continue; if (age > tau * 6) break;
    g = Math.max(g, Math.exp(-age / tau));
  }
  return g;
}

/** v14 player boxes: PEAK / RMS / DR over the `win` s ending at t, straight from the 1 ms level blocks (sample peak, mean square, both channels).
 *  peak = max sample peak (dBFS); rms = 10 log10 of the mean square over both channels (dBFS); dr = peak - rms (short-window PLR, dB).
 *  Pure function of (lv, t, win): the test recomputes it from the raw samples. */
export function playerStats(lv, t, win = 1.5) {
  const b1 = Math.max(0, Math.min(lv.n, Math.floor(t * lv.rate + 1e-6))), b0 = Math.max(0, b1 - Math.round(win * lv.rate)); let pk = 0, ms = 0;
  for (let b = b0; b < b1; b++) { const p = Math.max(lv.pkL[b], lv.pkR[b]); if (p > pk) pk = p; ms += lv.msL[b] + lv.msR[b]; }
  const nb = Math.max(1, b1 - b0), peak = pk > 1e-7 ? 20 * Math.log10(pk) : -Infinity, rms = ms > 1e-14 ? 10 * Math.log10(ms / (2 * nb)) : -Infinity;
  return { peak, rms, dr: Number.isFinite(peak) && Number.isFinite(rms) ? peak - rms : NaN };
}

export function createLevelView(L, M8, H) {
  const { D, F, FPS, rgba, text, fmt, fidx, clamp } = L, { levOpts, levRead, levScale, levBar, levTicks, hatch, reveal } = H;
  const lufsStr = (v) => (!Number.isFinite(v) || v < -69 ? '−∞' : v.toFixed(1));
  const WIN_BEATS = 8, NUM = 0.74;   // history span: 2 bars

  /** History columns for the window (t0, t1]: n columns of {lvl: peak dBFS, gr: deepest GR dB <= 0}. */
  function histCols(gr, t0, t1, n) {
    const lv = D.lv, rate = lv.rate, out = [], span = (t1 - t0) / n;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, Math.floor((t0 + i * span) * rate)), b = Math.min(lv.n, Math.max(a + 1, Math.floor((t0 + (i + 1) * span) * rate)));
      let pk = 0, g = 0; for (let j = a; j < b; j++) { const p = Math.max(lv.pkL[j], lv.pkR[j]); if (p > pk) pk = p; if (gr[j] < g) g = gr[j]; }
      out.push({ lvl: pk > 1e-7 ? 20 * Math.log10(pk) : -120, gr: g });
    }
    return out;
  }

  /** One tall thin bar: dim track; the peak region a faint ghost capped by a thin bright line; the RMS body a solid gradient with a
   *  bright cap (so body and peak read as two things); a fast peak tick that jumps on every hit; the kick glow halo (g). */
  function bar(ctx, S, x, y, w, h, sc, v, col, g = 0, tick = null) {
    const Y = (db) => y + h * (1 - sc.pos(clamp(db, -140, 6))), grad = ctx.createLinearGradient(0, y + h, 0, y);
    grad.addColorStop(0, rgba(col, 0.2)); grad.addColorStop(0.75, rgba(col, 0.72)); grad.addColorStop(1, rgba(col, 0.95));
    ctx.fillStyle = rgba(S.ink, 0.07); ctx.fillRect(x, y, w, h);
    const yr = Y(v.rms), yp = Y(v.pk), hasR = v.rms > -140, hasP = v.pk > -140;
    if (hasP) { ctx.fillStyle = rgba(col, 0.15); ctx.fillRect(x, yp, w, y + h - yp); ctx.fillStyle = rgba(S.ink, 0.9); ctx.fillRect(x, Math.round(yp) - 1, w, 2); }
    if (hasR) {
      if (g > 0.01) {   // halo only (the shape itself is thrown off-canvas): blur grows with the glow, alpha = glow
        const o = 4000; ctx.save(); ctx.beginPath(); ctx.rect(x - 40, y - 12, w + 80, h + 24); ctx.clip(); ctx.shadowColor = rgba(col, 1); ctx.shadowOffsetX = o; ctx.shadowBlur = 6 + 20 * g; ctx.globalAlpha = Math.min(1, 0.95 * g); ctx.fillStyle = '#000';
        for (let i = 0; i < 2; i++) ctx.fillRect(x - o, yr, w, Math.min(y + h - yr, 60)); ctx.restore(); }
      ctx.fillStyle = grad; ctx.fillRect(x, yr, w, y + h - yr);
      if (g > 0.01) { ctx.save(); const fg = ctx.createLinearGradient(0, yr, 0, y + h); fg.addColorStop(0, rgba(S.ink, 0.5 * g)); fg.addColorStop(0.25, rgba(col, 0.35 * g)); fg.addColorStop(1, rgba(col, 0.1 * g)); ctx.fillStyle = fg; ctx.fillRect(x, yr, w, y + h - yr); ctx.restore(); }
      ctx.fillStyle = rgba(S.ink, 0.55 + 0.45 * g); ctx.fillRect(x, Math.round(yr) - 1, w, 2);
    }
    if (v.hold > -140) { ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(x, Math.round(Y(v.hold)), w, 1); }   // slow long hold (the readout's number)
    const th = tick != null ? tick : v.hold;
    if (th > -140) { const ty = Math.round(Y(th)); ctx.save(); if (g > 0.01) { ctx.shadowColor = rgba(S.hot, 1); ctx.shadowBlur = 4 + 14 * g; } ctx.fillStyle = S.hot; ctx.fillRect(x - 3, ty - 1.5, w + 6, 3); ctx.restore(); }
  }
  function lamp(ctx, S, x, y, w, v, on) {
    ctx.fillStyle = rgba(S.ink, 0.1); ctx.fillRect(x, y, w, 3);
    if (on || v > 0.02) { ctx.fillStyle = rgba(S.hot, on ? 1 : 0.25 + 0.75 * v); ctx.fillRect(x, y, w, 3); }
  }

  // ---- v14 "player" variant (opt.variant = 'player'): tall segmented L / R bars with a dB scale, a slim GR bar, and four boxes PEAK / RMS / LUFS / DR.
  // Bars: lit segments up to the RMS (zone colour), dimmer up to the peak, an accent peak tick, the exponential kick glow (glowAt) on the lit body.
  // Boxes tick on the half beat: PEAK / RMS / DR = playerStats over the last 1.5 s, LUFS = short-term (BS.1770). Nothing is a fixed value.
  const PL_TICKS = [0, -6, -12, -18, -24, -30, -36, -42, -48, -54, -60];
  function levelsPlayer(ctx, S, r, t, k, opt) {
    const [x, y, w, h] = r; if (!opt.noReveal) reveal(ctx, x, y, w, h, k);
    const o = levOpts(), pos = (db) => ML.dbPos(clamp(db, -140, 0), 'live', 60, 0), Z = H.zonesOf(S), hb = L.BEAT / 2, tt = Math.floor(t / hb + 1e-6) * hb, tf = fidx(tt);
    const vL = levRead(0, t, o), vR = levRead(1, t, o), g = glowAt(D, t, FPS), tk = [0, 1].map((ch) => levRead(ch, t, { ...o, hold: 0.2, rel: 26 }).hold), led = ledAt(D.lv, t, -3);
    const gr = grFor(D, {}), grNow = ML.grAt(gr, t, FPS, D.lv.rate); let gd = gr._depth; if (gd == null) { gd = 0; for (let i = 0; i < gr.length; i++) if (-gr[i] > gd) gd = -gr[i]; gr._depth = gd; }
    const grRange = Math.max(2, Math.ceil(gd * 1.15 + 0.2));
    const sW = L.floorSize(ctx, 11), sN = L.floorSize(ctx, 16), nH = sN * NUM, pad = 4, gap = 6;
    const side = w > 1.1 * h, mW = side ? Math.round(w * 0.5) : w;   // v14.2: wide cell = smaller L/R bars + a 2x2 stat grid
    const boxH = Math.round(sW + nH + 16), boxY = y + h - boxH, hdr = Math.round(sW + 8), top = y + hdr, bot = side ? y + h - 8 : boxY - 12, bh = bot - top;
    const scaleW = Math.round(L.floorSize(ctx, 12) * NUM * 3.1 + 6), grW = mW >= 170 ? 12 : 0, grGap = grW ? 10 : 0, bg = 8;
    const bw = Math.floor((mW - scaleW - pad - grW - grGap - bg - 2) / 2), bx = x + scaleW + pad, grX = bx + 2 * bw + bg + grGap;
    const col = (db) => (db > 0 ? Z[3] : db > -6 ? Z[2] : db > -18 ? Z[1] : Z[0]), SEG = 1.5;
    [0, 1].forEach((ch) => lbl(ctx, S, ch ? 'R' : 'L', bx + ch * (bw + bg) + bw / 2, y + hdr / 2, { size: 12, align: 'center', a: 0.85, w: 600 }));
    if (grW) lbl(ctx, S, 'GR', x + mW, y + hdr / 2, { size: 11, align: 'right', a: 0.55 });
    { const fs = L.floorSize(ctx, 12), used = []; for (const d of PL_TICKS) { const yy = Math.round(top + bh * (1 - pos(d))) + 0.5; ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(bx - 5, yy - 0.5, 3, 1);
      if (used.some((u) => Math.abs(u - yy) < fs * NUM + 4)) continue; used.push(yy); text(ctx, d === 0 ? '0' : '−' + Math.abs(d), x + scaleW - 4, yy, { size: 12, align: 'right', col: rgba(S.ink, d === 0 ? 0.95 : 0.6), w: d === 0 ? 700 : 400 }); } }
    [vL, vR].forEach((v, ch) => {
      const X = bx + ch * (bw + bg), rmsDb = v.rms, pkDb = v.pk;
      ctx.fillStyle = rgba(S.ink, 0.04); ctx.fillRect(X, top, bw, bh);
      for (let d = 0; d > -60; d -= SEG) { const y0 = top + bh * (1 - pos(d)), y1 = top + bh * (1 - pos(d - SEG)), mid = d - SEG / 2, hh = Math.max(1, y1 - y0 - 1), lit = mid <= rmsDb, pkl = !lit && mid <= pkDb, c = col(mid);
        ctx.fillStyle = lit ? rgba(c, Math.min(1, 0.62 + 0.38 * pos(mid) + 0.2 * g)) : pkl ? rgba(c, 0.26) : rgba(S.ink, 0.07); ctx.fillRect(X, y0, bw, hh); }
      if (g > 0.01 && rmsDb > -60) { const yr = top + bh * (1 - pos(rmsDb)), o2 = 4000; ctx.save(); ctx.beginPath(); ctx.rect(X - 30, top - 10, bw + 60, bh + 20); ctx.clip();
        ctx.shadowColor = rgba(Z[3], 1); ctx.shadowOffsetX = o2; ctx.shadowBlur = 6 + 20 * g; ctx.globalAlpha = Math.min(1, 0.9 * g); ctx.fillStyle = '#000'; ctx.fillRect(X - o2, yr, bw, Math.min(bot - yr, 50)); ctx.restore(); }
      if (tk[ch] > -140) { ctx.save(); if (g > 0.01) { ctx.shadowColor = rgba(S.hot, 1); ctx.shadowBlur = 4 + 14 * g; } ctx.fillStyle = S.hot; ctx.fillRect(X - 3, Math.round(top + bh * (1 - pos(tk[ch]))) - 1.5, bw + 6, 3); ctx.restore(); }
      if (led > 0.02 || v.clip) { ctx.fillStyle = rgba(S.hot, v.clip ? 1 : 0.25 + 0.75 * led); ctx.fillRect(X, top - 4, bw, 3); }
    });
    if (grW) { ctx.fillStyle = rgba(S.ink, 0.07); ctx.fillRect(grX, top, grW, bh); const gh = bh * clamp(-grNow / grRange, 0, 1);
      if (gh > 0.5) { const gg = ctx.createLinearGradient(0, top, 0, top + gh); gg.addColorStop(0, rgba(S.hot, 0.35)); gg.addColorStop(1, rgba(S.hot, 0.95)); ctx.fillStyle = gg; ctx.fillRect(grX, top, grW, gh); }
      ctx.save(); if (g > 0.01) { ctx.shadowColor = rgba(S.hot, 1); ctx.shadowBlur = 4 + 14 * g; } ctx.fillStyle = S.ink; ctx.fillRect(grX - 2, top + gh - 1.5, grW + 4, 3); ctx.restore(); }
    const st = playerStats(D.lv, tt, 1.5), lufs = F.S[tf], cw = (w - 3 * gap) / 4, ls = (v) => (!Number.isFinite(v) || v < -69 ? '−∞' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
    const cells = [['PEAK', ls(st.peak), st.peak >= -0.1 ? S.hot : S.ink], ['RMS', ls(st.rms), S.ink], ['LUFS', ls(lufs), S.ink], ['DR', Number.isFinite(st.dr) ? st.dr.toFixed(1) : '—', S.ink]];
    if (side) { const gx = x + mW + 12, gw = w - mW - 12, gy = top, gh = h - hdr - 2, cw2 = (gw - gap) / 2, ch2 = (gh - gap) / 2, fN = Math.min(30, Math.max(16, ch2 * 0.3));
      cells.forEach(([nm, val, c], i) => { const cx = gx + (i % 2) * (cw2 + gap), cy = gy + Math.floor(i / 2) * (ch2 + gap), rr = L.rr(cx, cy, cw2, ch2, 10);
        ctx.fillStyle = rgba(S.ink, 0.05 + (i === 0 ? 0.06 * g : 0)); ctx.fill(rr); ctx.strokeStyle = rgba(S.ink, 0.22); ctx.lineWidth = 1; ctx.stroke(rr);
        lbl(ctx, S, nm, cx + 10, cy + 8 + sW * 0.5, { size: 11, a: 0.6, maxW: cw2 - 16 });
        text(ctx, val, cx + cw2 / 2, cy + ch2 * 0.6, { size: fN, w: 800, align: 'center', col: c, maxW: cw2 - 12 }); });
      if (!opt.noReveal) ctx.restore(); return; }
    cells.forEach(([nm, val, c], i) => { const cx = x + i * (cw + gap), rr = L.rr ? L.rr(cx, boxY, cw, boxH, 8) : null;
      if (rr) { ctx.fillStyle = rgba(S.ink, 0.05 + (i === 0 ? 0.05 * g : 0)); ctx.fill(rr); ctx.strokeStyle = rgba(S.ink, 0.24); ctx.lineWidth = 1; ctx.stroke(rr); } else { ctx.strokeStyle = rgba(S.ink, 0.24); ctx.strokeRect(cx + 0.5, boxY + 0.5, cw - 1, boxH - 1); }
      lbl(ctx, S, nm, cx + cw / 2, boxY + 6 + sW * 0.5, { size: 11, align: 'center', a: 0.6, maxW: cw - 8 });
      text(ctx, val, cx + cw / 2, boxY + boxH - 6 - nH * 0.5, { size: 16, w: 700, align: 'center', col: c, maxW: cw - 8 }); });
    if (!opt.noReveal) ctx.restore();
  }

  function levels(ctx, S, r, t, k, opt = {}) {
    if (opt.variant === 'player') return levelsPlayer(ctx, S, r, t, k, opt);
    const [x, y, w, h] = r; if (!opt.noReveal) reveal(ctx, x, y, w, h, k);
    const o = levOpts(), sc = levScale(o), compact = opt.compact || w < 200, col = S.grey ? S.ink : S.sig1, f = fidx(t);
    const vL = levRead(0, t, o), vR = levRead(1, t, o), ledPk = ledAt(D.lv, t, -3), kk = o.kmode ? o.K : 0;
    const g = glowAt(D, t, FPS), tk = [0, 1].map((ch) => levRead(ch, t, { ...o, hold: 0.2, rel: 26 }).hold);   // kick glow; fast peak ticks (jump on a hit, hold 200 ms, fall 26 dB/s)
    const grO = { thresh: L.meter('levels', 'grThresh', 0) || null, ratio: L.meter('levels', 'grRatio', 4), release: L.meter('levels', 'grRelease', 120), det: L.meter('levels', 'grDet', 'peak') };
    const gr = grFor(D, grO), grNow = ML.grAt(gr, t, FPS, D.lv.rate);
    const pad = 6, top = y + pad + 6, bh = y + h - pad - top - (w < 360 && h > 250 && w >= 200 ? Math.ceil((h > w * 1.5 ? 3 : 2) * (L.floorSize(ctx, 11) + L.floorSize(ctx, 16) * NUM + 10) + 10) : 0), bw = compact ? Math.max(6, Math.min(10, (w - 40) / 2 - 1)) : (w < 360 && h > 250 ? clamp(w * 0.095, 14, 26) : clamp(w * 0.05, 7, 26)), gap = clamp(w * 0.005, 2, 4);
    if (compact) {   // strip inside the loudness window: bars + scale only
      let cx = x + 2; [vL, vR].forEach((v, ch) => { bar(ctx, S, cx + ch * (bw + gap), top, bw, bh, sc, v, col, g, tk[ch]); lamp(ctx, S, cx + ch * (bw + gap), top - 7, bw, ledPk, v.clip); });
      levTicks(ctx, S, cx + 2 * bw + gap + 3, top, bh, sc, { size: 13 }); if (!opt.noReveal) ctx.restore(); return;
    }
    // type is floored at ~22 px at the overview (core.floorSize), so every size below is measured, not assumed
    const sW = L.floorSize(ctx, 11), sN = L.floorSize(ctx, 16), nH = sN * NUM, colW = Math.max(sW * 4.7, nH * 5.4) * (w > 440 ? 1.2 : 1) + 4, scaleW = L.floorSize(ctx, 12) * NUM * 2.3 + 8;
    const tall = w < 360 && h > 250;   // the 9:16 levels window (about 250 x 680): history + bars on top, the readouts in a 2-column grid below
    const ih = sW + nH + 10, RC = h > w * 1.5 ? 2 : 3, RR = h > w * 1.5 ? 3 : 2, rh = tall ? RR * ih + 10 : 0;
    const rx = x + w - pad - colW, bx = tall ? x + w - pad - 2 * bw - gap : rx - 10 - 2 * bw - gap, sx = bx - scaleW, hx = x + pad, hw = sx - 6 - hx;
    // ---- history panel: level (peak envelope, same scale as the bars) rising from the floor, GR hanging from the top
    const hy = top, hh = bh;
    // GR strip: its own dB range, fitted to the clip's real GR depth (about 4-6 dB here), so every notch is readable
    let gd = gr._depth; if (gd == null) { gd = 0; for (let i = 0; i < gr.length; i++) if (-gr[i] > gd) gd = -gr[i]; gr._depth = gd; }
    const grRange = Math.max(2, Math.ceil(gd * 1.15 + 0.2)), grH = hh > 140 ? clamp(hh * 0.3, 52, 170) : 0, ly0 = hy + (grH ? grH + 5 : 0), lh = hh - (grH ? grH + 5 : 0);
    ctx.save(); ctx.beginPath(); ctx.rect(hx, hy, hw, hh); ctx.clip();
    ctx.fillStyle = rgba(S.ink, 0.04); ctx.fillRect(hx, hy, hw, hh);
    for (const [d] of sc.ticks) { const yy = Math.round(ly0 + lh * (1 - sc.pos(d))) + 0.5; ctx.fillStyle = rgba(S.ink, d === 0 ? 0.16 : 0.055); ctx.fillRect(hx, yy, hw, 1); }
    const T = WIN_BEATS * L.BEAT, t0 = t - T, ncol = Math.max(24, Math.round(hw * 1.5)), Xc = (i) => hx + hw * (i / ncol);
    const cols = histCols(gr, t0, t, ncol).map((c, i) => (t0 + (i + 1) * T / ncol < 0 ? null : c)), i0 = cols.findIndex((c) => c);
    for (let b = Math.ceil(t0 / L.BEAT); b * L.BEAT <= t; b++) { const xx = Math.round(hx + hw * ((b * L.BEAT - t0) / T)) + 0.5; if (b * L.BEAT < 0) continue; ctx.fillStyle = rgba(S.ink, b % 4 === 0 ? 0.16 : 0.06); ctx.fillRect(xx, hy, 1, hh); }
    if (i0 >= 0) {
      // Pro-L 2 grammar: the input peak trace on top, the output (input + GR) below it, the slab between them is the gain reduction
      const Yl = (db) => ly0 + lh * (1 - sc.pos(clamp(db, -140, 6))), last = ncol - 1, Yi = (i) => Yl(cols[i].lvl), Yo = (i) => Yl(cols[i].lvl + cols[i].gr);
      const g1 = ctx.createLinearGradient(0, ly0 + lh, 0, ly0); g1.addColorStop(0, rgba(col, 0.03)); g1.addColorStop(1, rgba(col, 0.32));
      ctx.beginPath(); ctx.moveTo(Xc(i0), ly0 + lh); for (let i = i0; i <= last; i++) ctx.lineTo(Xc(i), Yo(i)); ctx.lineTo(Xc(last), ly0 + lh); ctx.closePath(); ctx.fillStyle = g1; ctx.fill();
      ctx.beginPath(); for (let i = i0; i <= last; i++) ctx.lineTo(Xc(i), Yi(i)); for (let i = last; i >= i0; i--) ctx.lineTo(Xc(i), Yo(i)); ctx.closePath();
      const g2 = ctx.createLinearGradient(0, ly0, 0, ly0 + lh * 0.5); g2.addColorStop(0, rgba(S.hot, 1)); g2.addColorStop(1, rgba(S.hot, 0.75)); ctx.fillStyle = g2; ctx.fill();
      ctx.beginPath(); for (let i = i0; i <= last; i++) (i === i0 ? ctx.moveTo(Xc(i), Yi(i)) : ctx.lineTo(Xc(i), Yi(i))); ctx.strokeStyle = rgba(col, 0.75); ctx.lineWidth = 1; ctx.stroke();
      if (grH) {   // GR history hangs from the top of the strip: 0 dB at the top edge, grRange dB at the bottom
        const Yg = (i) => hy + grH * clamp(-cols[i].gr / grRange, 0, 1);
        for (let d = 1; d < grRange; d++) { ctx.fillStyle = rgba(S.ink, 0.07); ctx.fillRect(hx, Math.round(hy + grH * d / grRange), hw, 1); }
        const g3 = ctx.createLinearGradient(0, hy, 0, hy + grH); g3.addColorStop(0, rgba(S.hot, 0.22 + 0.2 * g)); g3.addColorStop(1, rgba(S.hot, 0.9));
        ctx.beginPath(); ctx.moveTo(Xc(i0), hy); for (let i = i0; i <= last; i++) ctx.lineTo(Xc(i), Yg(i)); ctx.lineTo(Xc(last), hy); ctx.closePath(); ctx.fillStyle = g3; ctx.fill();
        ctx.beginPath(); for (let i = i0; i <= last; i++) (i === i0 ? ctx.moveTo(Xc(i), Yg(i)) : ctx.lineTo(Xc(i), Yg(i))); ctx.strokeStyle = rgba(S.ink, 0.85); ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
    if (grH) { ctx.fillStyle = rgba(S.ink, 0.22); ctx.fillRect(hx, hy + grH + 2, hw, 1); lbl(ctx, S, 'GR', hx + 5, hy + sW * 0.55 + 3, { size: 11, a: 0.6 }); if (hw > 170) lbl(ctx, S, '−' + grRange + ' dB', hx + hw - 5, hy + sW * 0.55 + 3, { size: 11, a: 0.6, align: 'right' }); else lbl(ctx, S, '−' + grRange, hx + hw - 5, hy + grH - sW * 0.55 - 2, { size: 11, a: 0.5, align: 'right' }); }
    ctx.restore();
    ctx.strokeStyle = rgba(S.ink, 0.2); ctx.lineWidth = 1; ctx.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);
    ctx.save(); if (g > 0.01) { ctx.shadowColor = rgba(S.hot, 1); ctx.shadowBlur = 6 + 18 * g; } ctx.fillStyle = S.hot; ctx.fillRect(hx + hw - 2, hy, 2, hh); ctx.restore();   // "now" edge
    if (grH) {   // the GR notch: a marker on the live GR depth at the now edge that flashes with the kick (halo, ring and a glow bar across the strip top)
      const ny = hy + grH * clamp(-grNow / grRange, 0, 1), R = 6 + 26 * g;
      ctx.save(); ctx.beginPath(); ctx.rect(hx, hy, hw, grH); ctx.clip();
      if (g > 0.01) { const rg = ctx.createRadialGradient(hx + hw, ny, 0, hx + hw, ny, R * 2.2); rg.addColorStop(0, rgba(S.hot, 0.85 * g)); rg.addColorStop(0.4, rgba(S.hot, 0.4 * g)); rg.addColorStop(1, rgba(S.hot, 0)); ctx.fillStyle = rg; ctx.fillRect(hx + hw - R * 2.2, ny - R * 2.2, R * 2.2, R * 4.4);
        const lg = ctx.createLinearGradient(0, hy, 0, hy + grH); lg.addColorStop(0, rgba(S.hot, 0.28 * g)); lg.addColorStop(1, rgba(S.hot, 0)); ctx.fillStyle = lg; ctx.fillRect(hx, hy, hw, grH); }
      ctx.fillStyle = rgba(S.ink, 1); ctx.fillRect(hx + hw - 12, Math.round(ny) - 1.5, 12, 3); ctx.beginPath(); ctx.arc(hx + hw - 2, ny, 3.2 + 3 * g, 0, 6.2832); ctx.fill();
      ctx.restore(); }
    // ---- bars + scale
    [vL, vR].forEach((v, ch) => { const X = bx + ch * (bw + gap); bar(ctx, S, X, ly0, bw, lh, sc, v, col, g, tk[ch]); lamp(ctx, S, X, ly0 - 7, bw, ledPk, v.clip); });
    levTicks(ctx, S, sx + 2, ly0, lh, sc, { size: 12 });
    // ---- readouts: small label (Synkopy) over an Akira numeral; units are group headers so the column stays narrow
    const mx = Math.max(vL.max, vR.max), hold = Math.max(vL.hold, vR.hold), hot = mx >= -0.1 || vL.clip || vR.clip;
    const rows = [['peak', mx < -140 ? '−∞' : fmt(Math.max(vL.pk, vR.pk) + kk), o.kmode ? 'K' + o.K : 'dB', hot ? S.hot : S.ink, 1], ['hold', hold < -140 ? '−∞' : fmt(hold + kk), 'dB', S.ink, 0.78],
      ['GR', grNow < -0.05 ? grNow.toFixed(1) : '0.0', 'dB', S.ink, 0.9], ['S', lufsStr(F.S[f]), 'LUFS', S.ink, 0.95], ['I', lufsStr(F.I[f]), 'LUFS', S.ink, 0.95]];
    if (tall) {   // 2 x 3 grid under the meters: peak, hold / GR, RMS / S, I (small label over an Akira numeral)
      const rms = Math.max(vL.rms, vR.rms), cw = (w - 2 * pad - 8) / RC, gy0 = y + h - pad - RR * ih;
      const cells0 = [['peak', mx < -140 ? '−∞' : fmt(Math.max(vL.pk, vR.pk) + kk), hot ? S.hot : S.ink, 1], ['hold', hold < -140 ? '−∞' : fmt(hold + kk), S.ink, 0.8],
        ['GR dB', grNow < -0.05 ? grNow.toFixed(1) : '0.0', S.ink, 0.95], ['RMS', rms < -140 ? '−∞' : fmt(rms + kk), S.ink, 0.9], ['LUFS S', lufsStr(F.S[f]), S.ink, 0.95], ['LUFS I', lufsStr(F.I[f]), S.ink, 0.95]], cells = RC === 3 ? [cells0[0], cells0[2], cells0[4], cells0[1], cells0[3], cells0[5]] : cells0;
      ctx.fillStyle = rgba(S.ink, 0.16); ctx.fillRect(x + pad, gy0 - 6, w - 2 * pad, 1);
      cells.forEach(([name, val, c, al], i) => { const cx = x + pad + (i % RC) * (cw + 8), cy = gy0 + Math.floor(i / RC) * ih;
        lbl(ctx, S, name, cx, cy + sW * 0.5, { size: 11, a: 0.55, maxW: cw });
        text(ctx, val, cx, cy + sW + nH * 0.55 + 4, { size: 16, w: 700, col: name === 'GR dB' ? rgba(c, 0.8 + 0.2 * g) : name === 'peak' ? c : rgba(S.ink, al), maxW: cw });
      });
      if (!opt.noReveal) ctx.restore(); return;
    }
    const want = [0, 2, 3, 4, 1];   // fill order by priority: peak, GR, short-term, integrated, hold
    const show = want.filter((_, n) => (n + 1) * ih <= bh + 4).sort(); let yy = top;
    for (const i of show) { const [name, val, unit, c, al] = rows[i];
      if (i === 3) { ctx.fillStyle = rgba(S.ink, 0.16); ctx.fillRect(rx, yy - 5, colW, 1); }
      lbl(ctx, S, name, rx, yy + sW * 0.5, { size: 11, a: 0.55 }); if (unit !== 'dB' || w > 440) lbl(ctx, S, unit, rx + colW, yy + sW * 0.5, { size: 11, a: 0.4, align: 'right' });
      text(ctx, val, rx, yy + sW + nH * 0.55 + 4, { size: 16, w: 700, col: i === 0 ? c : rgba(S.ink, al), maxW: colW });
      yy += ih; }
    if (!opt.noReveal) ctx.restore();
  }
  const lbl = (ctx, S, s, x, y, o = {}) => text(ctx, s, x, y, { size: o.size || 12, col: rgba(S.ink, o.a == null ? 0.6 : o.a), align: o.align, w: o.w || 400, maxW: o.maxW });
  return { levels, histCols };
}
