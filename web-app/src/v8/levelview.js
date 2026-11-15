// v11 level meters (DAW grammar of Ableton / Logic / FL, vstgui VU idioms): L/R peak + RMS bars with real ballistics,
// peak-hold tick, peak and clip LEDs that flash on transients (decay 140 ms), a hanging gain-reduction meter computed
// from the clip's own envelope (meterlib.grCurve: a feed-forward bus compressor, so it dips on every kick), momentary
// and short-term LUFS bars with exact numerals, and the 6-band power bars. Nothing is drawn from fixed values: every
// pixel is a function of the audio at t. Pure: (ctx, S, rect, t, k) -> draws inside the rect only.
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

export function createLevelView(L, M8, H) {
  const { D, F, FPS, rgba, mix, text, fmt, fidx, clamp } = L, { levOpts, levRead, levScale, levBar, levTicks, hatch, lbl, reveal, cr, zonesOf } = H;
  const lufsPos = (v, lo = -36) => clamp((v - lo) / (0 - lo));
  const gRange = 12;   // GR scale: 0 .. -12 dB, hanging from the top
  const lufsStr = (v) => (!Number.isFinite(v) || v < -90 ? '−∞' : v.toFixed(1));

  /** One thin hanging bar (GR) or rising bar (LUFS): x, y, w, h, value position 0..1 from the anchored end. */
  function slim(ctx, S, x, y, w, h, u, { hang = false, col, holdU = null, a = 1 } = {}) {
    ctx.fillStyle = rgba(S.ink, 0.07); ctx.fillRect(x, y, w, h);
    const hh = Math.round(h * clamp(u)); ctx.fillStyle = rgba(col, a);
    if (hang) ctx.fillRect(x, y, w, hh); else ctx.fillRect(x, y + h - hh, w, hh);
    if (holdU != null && holdU > 0.01) { const yy = Math.round(hang ? y + h * holdU : y + h * (1 - holdU)); ctx.fillStyle = S.hot; ctx.fillRect(x - 2, yy - 1, w + 4, 2); }
  }
  function led(ctx, S, x, y, w, hgt, v, on) {   // v = brightness 0..1; `on` forces the lit colour (latched clip)
    ctx.fillStyle = rgba(S.ink, 0.1); ctx.fillRect(x, y, w, hgt);
    if (on || v > 0.02) { ctx.fillStyle = rgba(S.hot, on ? 1 : 0.25 + 0.75 * v); ctx.fillRect(x, y, w, hgt); if (on && S.grey) hatch(ctx, x, y, w, hgt, S.bg); }
  }

  function levels(ctx, S, r, t, k, opt = {}) {
    const [x, y, w, h] = r; if (!opt.noReveal) reveal(ctx, x, y, w, h, k);
    const o = levOpts(), sc = levScale(o), st0 = L.meter('levels', 'style', 'auto'), style = st0 === 'auto' ? (S.grey ? 'segment' : 'gradient') : st0, compact = opt.compact || w < 140;
    const f = fidx(t), vL = levRead(0, t, o), vR = levRead(1, t, o), fs = L.floorSize(ctx, 15), fs18 = L.floorSize(ctx, 18);
    // gain reduction from the clip's envelope, shown as the deepest value in this frame; its hold falls like the peak hold
    const grO = { thresh: L.meter('levels', 'grThresh', 0) || null, ratio: L.meter('levels', 'grRatio', 4), release: L.meter('levels', 'grRelease', 120), det: L.meter('levels', 'grDet', 'peak') };
    const gr = grFor(D, grO), grNow = ML.grAt(gr, t, FPS, D.lv.rate), grHold = ML.releaseAt((ff) => -ML.grAt(gr, ff / FPS, FPS, D.lv.rate), f, FPS, 12, 0, 0.8);
    const ledPk = ledAt(D.lv, t, -3), kk = o.kmode ? o.K : 0;
    // layout: readout line, LED row, bars, footer names
    const rowH = compact ? 0 : 2 * (fs18 + 3) + 4, lampH = 8, top = y + rowH + lampH + 8, foot = compact ? 0 : fs + 8, bh = y + h - top - foot - 2;
    const bw = compact ? Math.max(8, Math.min(12, (w - 40) / 2 - 1)) : clamp(w * 0.04, 10, 18), gap = 2;
    let cx = x + (compact ? 2 : 6);
    // L / R
    [vL, vR].forEach((v, ch) => { const X = cx + ch * (bw + gap); levBar(ctx, S, X, top, bw, bh, sc, v, style); led(ctx, S, X, top - lampH - 4, bw, lampH, ledPk, v.clip); });
    cx += 2 * bw + gap; levTicks(ctx, S, cx + 3, top, bh, sc); cx += compact ? 30 : 36;
    if (!compact) {
      const l1 = y + (fs18 + 3) / 2, l2 = y + (fs18 + 3) * 1.5, fy = y + h - foot / 2, nm = (str, X, Y) => lbl(ctx, S, str, X, Y, { size: 13, a: 0.55 });
      // peak and RMS numerals, live every frame (peak = the frame's peak, RMS = both channels), under no fixed text
      const mx = Math.max(vL.max, vR.max), hot = mx >= -0.1 || vL.clip || vR.clip, rr = 10 * Math.log10((10 ** (vL.rms / 10) + 10 ** (vR.rms / 10)) / 2);
      const pkS = mx < -140 ? '−∞' : fmt(Math.max(vL.pk, vR.pk) + kk), rmS = rr < -140 ? '−∞' : fmt(rr + kk);
      text(ctx, pkS, x + 6, l1, { size: 18, w: 700, col: hot ? S.hot : S.ink, maxW: 78 }); text(ctx, rmS, x + 6, l2, { size: 18, col: rgba(S.ink, 0.6), maxW: 78 });
      nm(o.kmode ? 'K' + o.K : 'PK', x + 6, fy);
      // gain reduction: a hanging bar, scale 0 .. -12 dB, numeral in the row
      const gx = cx + 6; slim(ctx, S, gx, top, bw, bh, -grNow / gRange, { hang: true, col: S.grey ? S.ink : S.sig2, holdU: grHold / gRange, a: 0.9 });
      led(ctx, S, gx, top - lampH - 4, bw, lampH, clamp(-grNow / 6), false);
      for (const d of [0, 3, 6, 9, 12]) { const yy = Math.round(top + bh * d / gRange) + 0.5; ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(gx + bw, yy, 4, 1); if (d % 6 === 0) lbl(ctx, S, d ? '−' + d : '0', gx + bw + 7, yy, { size: 14, a: 0.55 }); }
      nm('GR', gx, fy);
      text(ctx, grNow < -0.05 ? grNow.toFixed(1) : '0.0', gx, l1, { size: 18, w: 600, col: S.ink, maxW: 60 });
      cx = gx + bw + 50;
      // momentary and short-term LUFS: rising bars on -36..0, numerals under the row
      if (x + w - cx > 150) {
        const lw = bw, lx = cx + 6, M = F.M[f], Sh = F.S[f];
        slim(ctx, S, lx, top, lw, bh, lufsPos(M), { col: S.ink, a: 0.85 }); slim(ctx, S, lx + lw + gap, top, lw, bh, lufsPos(Sh), { col: S.grey ? '#9a9a9a' : S.sig1, a: 0.9 });
        for (const d of [0, -12, -24, -36]) { const yy = Math.round(top + bh * (1 - lufsPos(d))) + 0.5; ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(lx + 2 * lw + gap, yy, 4, 1); lbl(ctx, S, d ? '−' + Math.abs(d) : '0', lx + 2 * lw + gap + 7, yy, { size: 14, a: 0.55 }); }
        nm('LUFS', lx, fy); text(ctx, lufsStr(M), lx, l1, { size: 18, w: 600, col: S.ink, maxW: 64 }); text(ctx, lufsStr(Sh), lx, l2, { size: 18, col: rgba(S.ink, 0.6), maxW: 64 });
        cx = lx + 2 * lw + gap + 50;
      }
      // 6-band power bars on the same scale as the peak meters when there is room
      const names = ['SB', 'LO', 'LM', 'MD', 'HM', 'AR'], b0 = cx + 4, bw2 = (x + w - 44 - b0) / 6;
      if (bw2 >= 12) { names.forEach((nm, i) => { const get = (ff) => F.bandDb[ff][i], v = { pk: get(f), rms: get(f), hold: ML.releaseAt(get, f, FPS, o.rel, -150, o.hold) }, X = b0 + i * bw2 + 2;
          levBar(ctx, S, X, top, bw2 - 6, bh, sc, v, style); if (L.floorSize(ctx, 14) * 1.3 <= bw2) lbl(ctx, S, nm, X + (bw2 - 6) / 2, y + h - foot / 2, { size: 14, align: 'center', a: 0.6 }); });
        levTicks(ctx, S, x + w - 40, top, bh, sc); }
    }
    if (!opt.noReveal) ctx.restore();
  }
  return { levels };
}
