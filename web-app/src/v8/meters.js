// v8 meters (ported from u2c-motion film/v8/meters.js + meters8.js), drawn inside the windows: (ctx, S, rect, t, k),
// k = reveal step 0..1 (counted steps, never alpha). Every value is measured from the real audio (analysis/clipdata.js,
// checked against ffmpeg in tests/meters.mjs). Display settings come from the cue sheet through L.meter(kind, key, def).
// - EQ: moved to eqview.js in v11 (dynamic multiband EQ). No third-party logos or trade dress.
// - Loudness: Kollide-frames style instrument (segmented 270 deg arc gauge, sub-gauges, numeric cells).
// - Spectrogram / stereo / surface: methods after Aurora by Joe Croskey (AGPL-3.0). Ideas and parameters only were
//   re-implemented; no Aurora code is used.
import * as ML from './meterlib.js';
import { createLevelView } from './levelview.js';
import { createImagerView } from './imagerview.js';
import { createWaveView, createWaveLODs } from './waveview.js';
import { createEqView } from './eqview.js';
export function createMeters(L) {
  const { D, F, FPS, NF, BEAT, BAR, T, U, rgba, mix, text, fmt, tc, bbt, fidx, clamp, lerp, hash, SANS, MONO } = L;
  const M = {};
  // ---------------------------------------------------------------- waveform LODs (v9): level 0 = D.wave3 (int16, ~2400
  // col/s, spc samples per column) or D.wave2 (int8, 400 col/s); every next level merges 4 columns. col(ta, tb, ch) ->
  // min/max/rms over the source columns the pixel spans (and the exact clip-sample range they cover, for the test).
  const WV = createWaveLODs(L);   // v11: waveview.js (LODs, columns, 3-band colour, centred playhead)
  M.wave = WV;
  const X20 = (f, x, w) => x + w * Math.log(f / 20) / Math.log(1000);
  const lbl = (ctx, S, s, x, y, o = {}) => text(ctx, s, x, y, { size: o.size || 22, col: rgba(o.col || S.ink, o.a == null ? 0.7 : o.a), align: o.align, w: o.w || 500, ls: o.ls == null ? 0 : o.ls, base: o.base, maxW: o.maxW });
  function reveal(ctx, x, y, w, h, k) { ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, w + 4, (h + 4) * k); ctx.clip(); }

  // ---------------------------------------------------------------- SESSION: arrangement-view inspired, sample-accurate
  // clip header, whole-song overview with the clip bracket, bar ruler, warp ticks on transients, L/R lanes drawn from
  // 400 columns/s min/max/rms (1 px columns, crisp), onset lane, playhead. The detail window shows 2 bars.
  M.session = createWaveView(L, M, { lbl, reveal }).session;

  // ---------------------------------------------------------------- SPECTRUM: v6 look (1/6-oct bars, peak hold, line) + Aurora-method trail
  M.spectrum = (ctx, S, r, t, k) => {
    const [x0, y, w0, h0] = r, gut = Math.min(46, w0 * 0.1), x = x0 + gut, w = w0 - gut, h = h0 - 30; reveal(ctx, x0, y, w0, h0, k);   // left gutter holds the dB scale, clear of the bars
    const f = fidx(t), fl = L.meter('spectrum', 'floor', 90), sm = Math.max(1, Math.round(L.meter('spectrum', 'smooth', 1))), c = D.oct6, Y = (v) => y + h * clamp(-v / fl);
    const avg = (ff) => { if (sm <= 1) return F.spec[Math.max(0, ff)]; const o = new Float32Array(c.length); let k = 0; for (let j = 0; j < sm && ff - j >= 0; j++, k++) { const s2 = F.spec[ff - j]; for (let i = 0; i < o.length; i++) o[i] += s2[i]; } for (let i = 0; i < o.length; i++) o[i] /= Math.max(1, k); return o; };
    const sp = avg(f), hd = F.hold[f], showHold = L.meter('spectrum', 'hold', true);
    for (const d of [0, -30, -60, -90].filter((d) => -d <= fl)) { const yy = Math.round(Y(d)) + 0.5; ctx.strokeStyle = rgba(S.ink, 0.09); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); if (d > -fl) lbl(ctx, S, d ? '\u2212' + (-d) : '0', x - 6, yy, { align: 'right', size: 16, a: 0.5 }); }
    for (const [s, fq] of [['20', 20], ['100', 100], ['1k', 1000], ['10k', 10000]]) { const X = X20(fq, x, w); ctx.strokeStyle = rgba(S.ink, 0.09); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); lbl(ctx, S, s, Math.min(x + w - 24, X + (fq === 20 ? 2 : -12)), y + h + 16, { a: 0.6 }); }
    if (L.meter('spectrum', 'mode', 'bars') === 'ms') {   // M/S overlay: M filled, S a line, one dB axis (S never normalised up)
      const MSs = D.ms, nb = 128, row = (arr) => Array.from({ length: nb }, (_, i) => arr[f * nb + i] / 2.55 - 100), Xb = (i) => x + w * (i + 0.5) / nb, m = row(MSs.spectroM), sd = row(MSs.spectroS);
      ctx.beginPath(); ctx.moveTo(x, y + h); m.forEach((v, i) => ctx.lineTo(Xb(i), Y(v))); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fillStyle = rgba(S.sig1, 0.22); ctx.fill();
      ctx.beginPath(); m.forEach((v, i) => (i ? ctx.lineTo(Xb(i), Y(v)) : ctx.moveTo(Xb(i), Y(v)))); ctx.strokeStyle = S.ink; ctx.lineWidth = 1.25; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.beginPath(); sd.forEach((v, i) => (i ? ctx.lineTo(Xb(i), Y(v)) : ctx.moveTo(Xb(i), Y(v)))); ctx.strokeStyle = S.grey ? '#bdbdbd' : S.sig2; ctx.lineWidth = 1.5; if (S.grey) ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      lbl(ctx, S, 'M', x + w - 60, y + 14, { size: 16, w: 700, a: 0.9 }); lbl(ctx, S, 'S', x + w - 30, y + 14, { size: 16, w: 700, col: S.grey ? '#bdbdbd' : S.sig2 });
      ctx.restore(); return;
    }
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

  const M8 = M;
  const SC = D.scope, scopeSpan = (ff) => { const e = Math.min(SC.L.length, Math.floor(ff / FPS * SC.rate)); return [Math.max(0, e - Math.round(SC.rate / FPS)), e]; };
  const cr = (v) => Math.round(v) + 0.5;
  const tickF = (t) => fidx(Math.floor(t / (BEAT / 2)) * (BEAT / 2));   // display tick: the frame at the last half beat
  M8.tickF = tickF;
  M8.cells = (ctx, S, x, y, w, h, cells, accentIdx = -1, vSize = 30) => {   // numeric cells: label top-left, value bottom-right
    const gap = 8, cw = (w - gap * (cells.length - 1)) / cells.length;
    cells.forEach(([nm, v], i) => {
      const cx = x + i * (cw + gap);
      if (i === accentIdx) { ctx.fillStyle = rgba(S.hot, S.grey ? 0.1 : 0.16); ctx.fillRect(Math.round(cx), Math.round(y), Math.round(cw), Math.round(h)); }
      ctx.strokeStyle = rgba(S.ink, 0.4); ctx.strokeRect(cr(cx), cr(y), Math.round(cw) - 1, Math.round(h) - 1);
      lbl(ctx, S, nm, cx + 8, y + 15, { a: 0.6, maxW: cw - 14 });
      text(ctx, v, cx + cw - 8, y + h - Math.min(18, h * 0.3), { size: vSize, col: i === accentIdx ? S.hot : S.ink, align: 'right', w: 500, maxW: cw - 14 });
    });
  };

  // ---------------------------------------------------------------- EQ (v11): drawn by src/v8/eqview.js (dynamic multiband EQ)
  const EV = createEqView(L);
  M8.eqBandsAt = EV.bandsAt;
  M8.eq = (ctx, S, r, t, k) => EV.draw(ctx, S, r, t, k);

  // ---------------------------------------------------------------- DAW LEVEL METERS (the grammar of Live / Logic / FL meters, original look)
  // L/R sample peak (instant attack, `smoothing` dB/s release, the frame shows the max of the envelope over its interval),
  // RMS (300 ms rectangular; K modes 600 ms + 3.01 dB, 0 at -K dBFS), peak hold (`hold` s, then falls), latched clip
  // lamp, running max and RMS readouts. Scale: the measured Live 12 table (+6..-60) or dB-linear over `range`.
  // Zone colours sit at fixed scale positions per stage. Every value comes from the clip's 1 ms blocks (meterlib.levelAt).
  const ZONES = { NIGREDO: ['#9c9c9c', '#d4d4d4', '#f2f2f2', '#ffffff'], ALBEDO: ['#1a1917', '#6e4433', '#a8432e', '#a8432e'], CITRINITAS: ['#c4a57a', '#d79a35', '#e8b85a', '#e0475f'], RUBEDO: ['#a35cf0', '#c79bf0', '#ff5cc8', '#e0475f'] };
  const zonesOf = (S) => ZONES[S.name] || [S.sig1, S.sig2, S.ink, S.hot];
  const levOpts = () => { const mode = L.meter('levels', 'mode', 'peak-rms'), ms = ML.modeSpec(mode); return { mode, ...ms, scale: ms.kmode ? 'linear' : L.meter('levels', 'scale', 'live'), range: L.meter('levels', 'range', 60), rel: L.meter('levels', 'smoothing', 20), hold: L.meter('levels', 'hold', 1.5) }; };
  const levRead = (ch, t, o, running = true) => { const v = ML.levelAt(D.lv, ch, t, { rel: o.rel, hold: o.hold, rmsWin: o.rmsWin, fps: FPS, running }); v.rms += o.cal; return v; };
  // the meter's scale for these options: position of a dBFS value, tick list [dBFS, label], zone of a dBFS value
  function levScale(o) {
    if (o.kmode) { const top = 0, rng = o.K + 24, pos = (db) => ML.dbPos(db, 'linear', rng, top), ticks = [];
      for (const kv of [o.K, 8, 4, 0, -4, -8, -12, -20].filter((v) => v <= o.K && v >= -24 + 0)) ticks.push([kv - o.K, (kv > 0 ? '+' : '') + kv]);
      return { pos, ticks, zone: (db) => (db + o.K > 4 ? 3 : db + o.K > 0 ? 2 : 0), zEdges: [[-999, -o.K], [-o.K, -o.K + 4], [-o.K + 4, 99]].map(([a, b], i) => [a, b, [0, 2, 3][i]]) };
    }
    const lin = o.scale === 'linear', pos = (db) => ML.dbPos(db, lin ? 'linear' : 'live', o.range, 6), ticks = [];
    for (let d = 6; d >= -(lin ? o.range : 60); d -= 6) ticks.push([d, String(Math.abs(d))]);
    return { pos, ticks, zone: (db) => (db > 0 ? 3 : db > -6 ? 2 : db > -18 ? 1 : 0), zEdges: [[-999, -18, 0], [-18, -6, 1], [-6, 0, 2], [0, 99, 3]] };
  }
  function hatchOver(ctx, x, y, w, h, col) { hatch(ctx, x, y, w, h, col); }
  // one vertical bar: track, zone-coloured RMS (solid) + peak beyond RMS (45 %), segments, hold line (2 px, 2 px past)
  function levBar(ctx, S, x, y, w, h, sc, v, style, segs = true) {
    const Z = zonesOf(S), Y = (db) => y + h * (1 - sc.pos(db));
    ctx.fillStyle = rgba(S.ink, 0.07); ctx.fillRect(x, y, w, h);
    for (const [a, b, zi] of sc.zEdges) { const ya = Y(Math.min(b, 6)), yb = Y(Math.max(a, -200)); if (yb <= ya) continue;
      const draw = (top, al) => { const t0 = Math.max(ya, top); if (yb > t0) { if (zi === 3 && S.grey) { ctx.fillStyle = rgba(Z[3], al); ctx.fillRect(x, t0, w, yb - t0); hatchOver(ctx, x, t0, w, yb - t0, S.bg); } else { ctx.fillStyle = rgba(Z[zi], al); ctx.fillRect(x, t0, w, yb - t0); } } };
      if (v.pk > v.rms) draw(Y(v.pk), 0.45); draw(Y(v.rms), 1); }
    if (style === 'segment' && segs) { ctx.fillStyle = S.card; for (let d = 6; d > -70; d--) { const yy = Y(d); if (yy > y && yy < y + h) ctx.fillRect(x, yy - 0.33, w, 0.65); } }
    if (v.hold > -140) { ctx.fillStyle = S.hot; ctx.fillRect(x - 2, Math.round(Y(v.hold)) - 1, w + 4, 2); }
  }
  // scale column: 4 px ticks, unsigned numerals, 0 bold; labels skip when they would collide
  function levTicks(ctx, S, x, y, h, sc, o = {}) {
    const fs = L.floorSize(ctx, o.size || 15), used = [], Yt = (d) => Math.round(y + h * (1 - sc.pos(d))) + 0.5;
    for (const [d] of sc.ticks) { ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(x, Yt(d), 4, 1); }
    // labels by priority (0 first, then the top, then every other tick), skipping any that would collide
    const pri = [...sc.ticks].sort((a, b) => (b[1] === '0') - (a[1] === '0') || (b === sc.ticks[0]) - (a === sc.ticks[0]));
    for (const [d, s] of pri) { const yy = Yt(d); if (yy < y - 2 || yy > y + h + 2 || used.some((u) => Math.abs(u - yy) < fs + 1)) continue;
      lbl(ctx, S, s, x + 7, yy, { size: o.size || 15, a: s === '0' ? 0.95 : 0.6, w: s === '0' ? 700 : 400 }); used.push(yy); }
  }
  // v11: level meters live in levelview.js (peak / RMS ballistics, GR from the envelope, LEDs, LUFS bars)
  M8.levels = createLevelView(L, M8, { levOpts, levRead, levScale, levBar, levTicks, hatch, lbl, reveal, cr, zonesOf }).levels;
  M8.bands = (ctx, S, r, t, k) => M8.levels(ctx, S, r, t, k);

  // ---------------------------------------------------------------- LOUDNESS: strip meter + LUFS history + histogram + cells
  // (the Youlean-style reading: integrated as a filled area, short-term line, momentary faint, excess over the target,
  // a sideways histogram of short-term in 0.5 LU bins). Values: BS.1770-4 / EBU R128 from analysis/clipdata.js.
  M8.loud = (ctx, S, r, t, k) => {
    if (L.meter('loud', 'focus', 'ghost') === 'ghost' && L.curWin && L.shotTo === L.curWin) return M8.ghost(ctx, S, r, t, k);
    if (L.meter('loud', 'layout', 'history') === 'gauge') return M8.loudGauge(ctx, S, r, t, k);
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const f = fidx(t), tf = tickF(t), tgt = L.meter('loud', 'target', -14), fl = L.meter('loud', 'floor', -54), win = L.meter('loud', 'window', 0), lscale = L.meter('loud', 'scale', 'linear');
    const cellH = Math.max(50, 2 * L.floorSize(ctx, 18) + 8), gy = y + 6, gh = h - cellH - 34, stripW = 58, hw = 26, gx = x + stripW + 10, gw = w - stripW - 10 - hw - 4;
    M8.levels(ctx, S, [x, gy - 2, stripW, gh + 26], t, 1, { compact: true, noReveal: true });
    // LUFS axis (linear, or compressed above -18 like a loudness meter) and the graph grid
    const posL = (v) => (lscale === 'compressed' ? (v > -18 ? 0.6 + 0.4 * (v + 18) / 18 : 0.6 * (v - fl) / (-18 - fl)) : (v - fl) / -fl), Y = (v) => gy + gh * (1 - clamp(posL(v)));
    let last = -1e9; for (const v of [0, -6, -12, -18, -23, -30, -40, -54].filter((v) => v >= fl)) { const yy = Math.round(Y(v)) + 0.5; ctx.strokeStyle = rgba(S.ink, v === tgt ? 0 : 0.07); ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy); ctx.stroke();
      if (yy - last >= L.floorSize(ctx, 14) + 1 && Math.abs(v - tgt) > 4.5 && v > fl) { lbl(ctx, S, v ? '−' + -v : '0', gx + 3, yy + 9, { size: 14, a: 0.4 }); last = yy; } }
    // history: whole clip (window 0) or the last `window` s; future stays blank
    const t0 = win > 0 ? t - win : 0, span = win > 0 ? win : D.duration, X = (tt) => gx + gw * (tt - t0) / span, f0 = Math.max(1, Math.ceil(t0 * FPS)), path = (arr, fn) => { ctx.beginPath(); let st = false; for (let i = f0; i <= f; i++) { const v = arr[i]; if (v <= -69) { st = false; continue; } const xx = X(i / FPS), yy = Y(Math.max(fl, v)); st ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); st = true; } fn && fn(); };
    { ctx.beginPath(); let st = -1; for (let i = f0; i <= f; i++) { const v = F.I[i]; if (v <= -69) continue; const xx = X(i / FPS); if (st < 0) { ctx.moveTo(xx, gy + gh); st = i; } ctx.lineTo(xx, Y(Math.max(fl, v))); } if (st >= 0) { ctx.lineTo(X(f / FPS), gy + gh); ctx.closePath(); ctx.fillStyle = rgba(S.sig1, 0.25); ctx.fill(); } }
    // excess of short-term above the target
    ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, Y(tgt) - gy); ctx.clip(); { ctx.beginPath(); let st = false; for (let i = f0; i <= f; i++) { const v = F.S[i]; if (v <= -69) continue; const xx = X(i / FPS); if (!st) { ctx.moveTo(xx, Y(tgt)); st = true; } ctx.lineTo(xx, Y(v)); } if (st) { ctx.lineTo(X(f / FPS), Y(tgt)); ctx.closePath(); ctx.fillStyle = rgba(S.hot, 0.35); ctx.fill(); } } ctx.restore();
    path(F.M); ctx.strokeStyle = rgba(S.ink, 0.35); ctx.lineWidth = 1; ctx.stroke();
    path(F.S); ctx.strokeStyle = S.ink; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = S.warn; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(gx, cr(Y(tgt))); ctx.lineTo(gx + gw, cr(Y(tgt))); ctx.stroke(); ctx.setLineDash([]);
    lbl(ctx, S, `−${-tgt}`, gx + gw - 3, Y(tgt) + 10, { size: 14, w: 700, col: S.warn, a: 1, align: 'right' });
    ctx.fillStyle = S.hot; ctx.fillRect(Math.round(X(t)), gy, 1, gh);
    // time ruler: bars
    for (let b = Math.ceil(t0 / BAR); b * BAR <= t0 + span; b++) { const xx = X(b * BAR); if (xx < gx || xx > gx + gw) continue; ctx.fillStyle = rgba(S.ink, 0.3); ctx.fillRect(Math.round(xx), gy + gh, 1, 6); }
    // sideways histogram of short-term, 0.5 LU bins over the clip so far
    const hx0 = x + w - hw, hist = ML.histogram(Array.from(F.S.subarray(1, f + 1)), fl, 0, 0.5), hm = Math.max(1, ...hist);
    ctx.fillStyle = rgba(S.ink, 0.06); ctx.fillRect(hx0, gy, hw, gh);
    hist.forEach((c, i) => { if (!c) return; const v = fl + (i + 0.5) * 0.5, yy = Y(v), ww = hw * c / hm; ctx.fillStyle = v > tgt ? rgba(S.hot, 0.8) : rgba(S.ink, 0.7); ctx.fillRect(x + w - ww, yy - 1, ww, Math.max(1, gh * 0.5 / -fl)); });
    // numeric cells: S / I / LRA / TP max / PLR (ticked on the half beat)
    const I = F.I[tf], tp = F.TP[tf], plr = I > -69 && tp > -69 ? tp - I : NaN;
    M8.cells(ctx, S, x, y + h - cellH, w, cellH, [['S', fmt(F.S[tf])], ['I', fmt(I)], ['LRA', F.LRA[tf].toFixed(1)], ['TP', fmt(tp)], ['PLR', Number.isFinite(plr) ? plr.toFixed(1) : '—']], 1, 22);
    ctx.restore();
  };

  // ---------------------------------------------------------------- LOUDNESS, alternative look: Kollide-frames instrument (segmented arc gauge)
  M8.loudGauge = (ctx, S, r, t, k) => {
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

  // ---------------------------------------------------------------- GHOST: hero readout (after a free visualizer's 2x2 grammar)
  // Four tiles (PEAK dBFS · RMS dB · CREST dB · CORR), huge tabular-mono numbers (unit at 0.35x, caps label top-left)
  // over one glowing single-hue history line each (1.5 px core + soft bloom). Numbers tick on the half beat; the lines
  // run at frame rate. Peak/RMS from the 1 ms blocks with the level-meter ballistics, crest = peak - RMS.
  const ghostVals = (tt) => { const o = levOpts(), a = levRead(0, tt, o, false), b = levRead(1, tt, o, false), pk = Math.max(a.pk, b.pk), rms = 10 * Math.log10((10 ** (a.rms / 10) + 10 ** (b.rms / 10)) / 2);
    return [pk, rms, pk > -140 && rms > -140 ? pk - rms : NaN, F.corr[fidx(tt)]]; };
  M8.ghostVals = ghostVals;
  M8.ghost = (ctx, S, r, t, k) => {
    const [x, y, w, h] = r; reveal(ctx, x, y, w, h, k);
    const tf = tickF(t), now = ghostVals(tf / FPS), hist = L.meter('ghost', 'history', 4), N = 60, H = [];
    for (let i = 0; i <= N; i++) { const tt = t - hist + hist * i / N; H.push(tt < 0 ? null : ghostVals(tt)); }
    const core = S.grey ? '#ffffff' : mix(S.ink, S.sig1, 0.15), glow = S.grey ? '#ffffff' : S.sig1;
    const tiles = [['PEAK', 'dBFS', 0, [-60, 0]], ['RMS', 'dB', 1, [-60, 0]], ['CREST', 'dB', 2, [0, 24]], ['CORR', '', 3, [-1, 1]]], gw = w / 2, gh = h / 2;
    tiles.forEach(([nm, unit, i, rg0], q) => { let [lo, hi] = rg0;
      const tx = x + (q % 2) * gw, ty = y + Math.floor(q / 2) * gh; ctx.strokeStyle = rgba(S.ink, 0.22); ctx.strokeRect(cr(tx + 2), cr(ty + 2), Math.round(gw - 4), Math.round(gh - 4));
      lbl(ctx, S, nm, tx + 10, ty + 14, { size: 13, a: 0.6, ls: 1 });
      // history line in the lower half of the tile
      // history line in the lower part of the tile, auto-ranged to its own history (min span 6 dB; corr fixed -1..+1)
      if (i < 3) { const vs = H.filter((v) => v && Number.isFinite(v[i]) && v[i] > -140).map((v) => v[i]); if (vs.length) { const a = Math.min(...vs), b = Math.max(...vs), m = (a + b) / 2, sp = Math.max(6, (b - a) * 1.2) / 2; lo = m - sp; hi = m + sp; } }
      const ly0 = ty + gh * 0.6, lh = gh * 0.32, P = H.map((v, j) => (v && Number.isFinite(v[i]) && v[i] > -140 ? [tx + 10 + (gw - 20) * j / N, ly0 + lh * (1 - clamp((v[i] - lo) / (hi - lo)))] : null));
      ctx.beginPath(); let st = false; for (const p of P) { if (!p) { st = false; continue; } st ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); st = true; }
      ctx.lineJoin = 'round'; ctx.save(); ctx.shadowColor = rgba(glow, 0.9); ctx.shadowBlur = 8; ctx.strokeStyle = rgba(glow, 0.5); ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
      ctx.strokeStyle = core; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1;
      if (i === 3) { ctx.fillStyle = rgba(S.ink, 0.25); ctx.fillRect(tx + 6, Math.round(ly0 + lh / 2), gw - 12, 1); }
      // the number
      const v = now[i], s = i === 3 ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) : !Number.isFinite(v) || v < -140 ? '−∞' : i === 2 ? v.toFixed(1) : fmt(v), size = Math.min(gh * 0.34, gw * 0.24);
      const nw = text(ctx, s, tx + 10, ty + gh * 0.38, { size, w: 700, col: i === 0 && v >= -0.1 ? S.hot : S.ink, maxW: gw - 20 - (unit ? size * 0.35 * unit.length * 0.62 + 6 : 0) });
      if (unit) text(ctx, unit, tx + 14 + nw, ty + gh * 0.38 + size * 0.22, { size: size * 0.35, col: rgba(S.ink, 0.45) });
    });
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
      if (nm === 'M') for (const [s, fq] of [['1k', 1000], ['100', 100]]) lbl(ctx, S, s, x + w - 4, Math.round(py + ph * (1 - Math.log(fq / 20) / Math.log(1000))) + 12, { size: 16, align: 'right', a: 0.6 });
    }
    for (let b = Math.ceil((t - WIN) / BAR); b * BAR <= t; b++) { const X = x + w * (b * BAR - (t - WIN)) / WIN; if (X < x + 20) continue; ctx.fillStyle = rgba(S.ink, 0.4); ctx.fillRect(Math.round(X), y + h, 1, 8); if (b % 2 === 0 && X < x + w - 120) lbl(ctx, S, String(D.song.startBar + b), X + 4, y + h + 16, { a: 0.55 }); }
    ctx.restore();
  };

  // ---------------------------------------------------------------- IMAGER: vectorscope (polar sample / polar level / Lissajous),
  // v11: the stereo imager (Ozone-style vectorscope, correlation, balance, 4-band width) lives in imagerview.js
  function hatch(ctx, x, y, w, h, col) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); for (let d = -h; d < w + h; d += 4) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); } ctx.stroke(); ctx.restore(); }
  { const IV = createImagerView(L, M8, { lbl, reveal, cr, hatch, tickF }); M8.imager = IV.imager; M8.widthStrip = IV.widthStrip; }
  M8.stereo = M8.imager;

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
