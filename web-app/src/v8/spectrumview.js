// v12 spectrum: the raw spectrum of the beat in the manner of a pro analyser (FabFilter Pro-Q style analyser pane), with NO EQ
// curve, nodes or bands. Original drawing; no third-party code.
//   draw(ctx, rect, frame, opts)
//     rect  [x, y, w, h]  the area to draw in (full-width bottom strip, ~984 x 340 at 9:16; fine from 400x200 up)
//     frame { t }         clip time in seconds
//     opts  { L, S, top, bottom, hold, labels, readout }   L = core (D, F, FPS, rgba, mix, text, clamp), S = stage
//   Pure helpers for tests: traceData(D), curveAt(D, f, hz), lowLevel(D, f), BALLISTICS.
// Data: the clip's real 1/6-octave spectrum (61 bands, 8192-pt Hann, sine-calibrated dBFS, analysis/clipdata.js), run through
//   display ballistics (fast attack, slow release, thin peak hold) and a KICK LIFT: the per-frame spectrum smears a kick by about
//   +-85 ms (8192-pt window), so the lowest bands get a lift in dB from the 1 ms band detector (analysis/bandenv.js, 20-150 Hz,
//   transient = level minus its own 90 ms follower). The lift is added to the 20-250 Hz bands (full under 90 Hz) the frame the
//   kick lands and decays in ~90 ms, so the low end jumps on every kick.
// Drawing: a log 20 Hz - 20 kHz axis, a monotone cubic through the band values (the curve never overshoots the data), one fill
//   column per device pixel with a vertical gradient (bright at the top edge, fading to dark at the bottom) in the waveform's
//   tone family (low / mid / high = waveview's three band colours: three greys in Nigredo, the stage ramp elsewhere), a crisp
//   top edge, a thin peak-hold line, a dB scale in the left gutter and frequency labels along the bottom (text() from core.js).

import { hexRgb } from './core.js';
import { ref as REF, refUpdate, refAt, shown } from '../bridge/reference.js';
import { flAt } from '../lib/flcolors.js';
const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const u = clampv((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
export const BALLISTICS = { attack: 0.010, release: 22, holdTime: 0.7, holdFall: 14, liftDb: 5, liftSens: 10, liftDecay: 0.09, slowMs: 90 };   // seconds, dB/s, dB

// ---------------------------------------------------------------- data (pure, cached per clip)
const CACHE = new WeakMap();
/** Kick transient 0..1 per frame from the 1 ms low-band detector (D.be), or the per-frame band levels if the clip has none. */
function kickTransient(D) {
  const NF = D.frames, fps = D.fps, out = new Float32Array(NF), B = BALLISTICS, ks = 1 - Math.exp(-1 / B.slowMs);
  if (D.be) {
    const { n, nb, q } = D.be, at = (i, j) => q[i * nb + j] / 2 - 120, ex = new Float32Array(n); let slow = Math.max(at(0, 0), at(0, 1));
    for (let i = 0; i < n; i++) { const db = Math.max(at(i, 0), at(i, 1)); ex[i] = Math.max(0, db - slow); slow += (db - slow) * ks; }
    // v13: each frame reads its OWN interval [f, f+1)/fps (v12 read the previous one: a frame late)
    for (let f = 0; f < NF; f++) { let m = 0; const a = Math.max(0, Math.floor(f / fps * 1000 + 1e-6)), b = Math.min(n - 1, Math.floor((f + 1) / fps * 1000 - 1e-6)); for (let i = a; i <= b; i++) if (ex[i] > m) m = ex[i]; out[f] = clampv(m / B.liftSens, 0, 1); }
  } else {
    const bd = D.frame.bandDb, g = (f, j) => (bd[f] && bd[f].length != null ? bd[f][j] : bd[f * 6 + j]); let slow = Math.max(g(0, 0), g(0, 1));
    for (let f = 0; f < NF; f++) { const db = Math.max(g(f, 0), g(f, 1)); out[f] = clampv((db - slow) / B.liftSens, 0, 1); slow += (db - slow) * (1 - Math.exp(-1 / (fps * B.slowMs / 1000))); }
  }
  return out;
}
/** Per-frame displayed spectrum and peak hold (NF x 61 Float32, dB), the kick lift per frame, and per-band lift weights. */
export function traceData(D) {
  let c = CACHE.get(D); if (c) return c;
  const NF = D.frames, fps = D.fps, dt = 1 / fps, nb = 61, B = BALLISTICS, F = D.frame, oct = D.oct6, kt = kickTransient(D);
  const w = new Float32Array(nb); for (let i = 0; i < nb; i++) w[i] = 1 - smooth(90, 250, oct[i]);
  const disp = new Float32Array(NF * nb), hold = new Float32Array(NF * nb), lift = new Float32Array(NF), lw = new Float32Array(nb), ha = new Float32Array(nb);
  const aA = 1 - Math.exp(-dt / B.attack), dec = Math.exp(-dt / B.liftDecay); let lf = 0;
  const raw = (f, i) => (F.spec[f] && F.spec[f].length != null ? F.spec[f][i] : F.spec[f * nb + i]);
  for (let f = 0; f < NF; f++) {
    lf = Math.max(kt[f], lf * dec); lift[f] = lf;
    for (let i = 0; i < nb; i++) {
      const target = raw(f, i) + B.liftDb * lf * w[i], p = f ? disp[(f - 1) * nb + i] : target;
      const s = target > p ? p + (target - p) * aA : Math.max(target, p - B.release * dt); disp[f * nb + i] = s;
      const hp = f ? hold[(f - 1) * nb + i] : s;
      if (s >= hp) { hold[f * nb + i] = s; ha[i] = 0; } else { ha[i] += dt; hold[f * nb + i] = ha[i] > B.holdTime ? Math.max(s, hp - B.holdFall * dt) : hp; }
    }
  }
  c = { disp, hold, lift, w, nb }; CACHE.set(D, c); return c;
}
/** Index (fractional) into the 61 bands for a frequency, on the clip's own centre frequencies. */
function bandPos(oct, hz) { const n = oct.length; if (hz <= oct[0]) return 0; if (hz >= oct[n - 1]) return n - 1; let a = 0, b = n - 1; while (b - a > 1) { const m = (a + b) >> 1; if (oct[m] <= hz) a = m; else b = m; } return a + Math.log(hz / oct[a]) / Math.log(oct[b] / oct[a]); }
/** Monotone-clamped Catmull-Rom through the band values at fractional position p: never overshoots its two neighbours. */
function cubic(v, p) {
  const n = v.length, i = Math.min(n - 2, Math.max(0, Math.floor(p))), u = p - i, y1 = v[i], y2 = v[i + 1], y0 = i ? v[i - 1] : y1, y3 = i + 2 < n ? v[i + 2] : y2;
  const m1 = (y2 - y0) / 2, m2 = (y3 - y1) / 2, u2 = u * u, u3 = u2 * u, r = (2 * u3 - 3 * u2 + 1) * y1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * y2 + (u3 - u2) * m2;
  return clampv(r, Math.min(y1, y2), Math.max(y1, y2));
}
const bandsOf = (T, a, f) => a.subarray(f * T.nb, f * T.nb + T.nb);
/** Displayed level (dB) at frame f and frequency hz (what the curve shows). */
export function curveAt(D, f, hz) { const T = traceData(D); return cubic(bandsOf(T, T.disp, f), bandPos(D.oct6, hz)); }
/** Mean displayed level (dB) of the bands at or below maxHz at frame f (the "low end"). */
export function lowLevel(D, f, maxHz = 90) { const T = traceData(D), v = bandsOf(T, T.disp, f); let s = 0, n = 0; D.oct6.forEach((fc, i) => { if (fc <= maxHz) { s += v[i]; n++; } }); return s / Math.max(1, n); }

// ---------------------------------------------------------------- drawing
const FREQ_ALL = [[20, '20'], [50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k'], [20000, '20k']];
const FREQ_MIN = [[20, '20'], [100, '100'], [1000, '1k'], [10000, '10k']];
let LAYER = null;
const layerCtx = (w, h) => { if (!LAYER) LAYER = document.createElement('canvas'); if (LAYER.width !== w || LAYER.height !== h) { LAYER.width = w; LAYER.height = h; } const g = LAYER.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h); return g; };
const fmtHzR = (f) => (f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + ' kHz' : Math.round(f) + ' Hz');

/** Three tone colours low / mid / high: the same as waveview.js bandCols (greys in Nigredo, the stage ramp elsewhere). */
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export const toneCols = (S, cmap) => (cmap === 'FL' ? [hex(flAt(0.42)), hex(flAt(0.7)), hex(flAt(0.95))] : S.grey ? ['#7d7d7d', '#b9b9b9', '#ffffff'] : [S.sig1, S.sig2 === S.sig1 ? S.ink : S.sig2, S.waveHi === S.sig1 || S.waveHi == null ? S.ink : S.waveHi]);

export function draw(ctx, rect, frame, opts = {}) {
  const { L, S } = opts; if (!L || !S) return;
  const { D, rgba, text } = L, [x0, y0, w0, h0] = rect, t = frame.t != null ? frame.t : frame, f = L.fidx(t), T = traceData(D);
  const top = opts.top ?? -6, bot = opts.bottom ?? -72, light = L.isLight ? L.isLight(S) : false, nb = 61, oct = D.oct6;
  const m = ctx.getTransform(), sc = Math.max(1, Math.hypot(m.a, m.b)), small = w0 < 560 || h0 < 240;
  // layout: left gutter (dB scale), bottom gutter (frequencies), small padding elsewhere
  const lblPx = small ? 18 : 20, gl = Math.round(small ? 46 : 54), gb = Math.round(small ? 32 : 36), pt = 12, pr = 12;
  const px = x0 + gl, py = y0 + pt, pw = w0 - gl - pr, ph = h0 - pt - gb; if (pw < 40 || ph < 30) return;
  const Y = (db) => py + ph * clampv((top - db) / (top - bot), 0, 1), fx = (hz) => px + pw * Math.log(hz / 20) / Math.log(1000);
  const ink = S.ink, bright = light ? hexRgb(ink) : [255, 255, 255], tone = toneCols(S, opts.cmap), hi = light ? ink : '#ffffff';
  const tcol = (u) => { const lo = 1 - smooth(0.22, 0.46, u), hg = smooth(0.58, 0.84, u), md = 1 - lo - hg, A = hexRgb(tone[0]), B = hexRgb(tone[1]), C = hexRgb(tone[2]); return [0, 1, 2].map((i) => A[i] * lo + B[i] * md + C[i] * hg); };   // u = log position 0..1 (20 Hz .. 20 kHz)
  const lab = (s, X, Yy, o = {}) => text(ctx, s, X, Yy, { size: lblPx, col: rgba(ink, o.a ?? 0.62), align: o.align, w: 500, base: o.base });

  ctx.save();
  // plate: a dark well behind the plot (the window is glass); nothing on light grounds
  if (!light) { ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fill(L.rr(px, py, pw, ph, 6)); }
  ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  // grid: dB lines every 12 dB, decade lines brighter, 2 / 5 faint
  ctx.lineWidth = 1;
  const grid = [];
  for (let d = Math.floor(top / 12) * 12; d > bot; d -= 12) if (d < top - 1) grid.push(d);
  ctx.strokeStyle = rgba(ink, light ? 0.12 : 0.085); ctx.beginPath(); for (const d of grid) { const yy = Math.round(Y(d)) + 0.5; ctx.moveTo(px, yy); ctx.lineTo(px + pw, yy); } ctx.stroke();
  const labF = pw >= 640 ? FREQ_ALL : FREQ_MIN, major = new Set([20, 100, 1000, 10000]);
  for (const [hz] of FREQ_ALL) { if (hz === 20 || hz === 20000) continue; const xx = Math.round(fx(hz)) + 0.5; ctx.strokeStyle = rgba(ink, major.has(hz) ? (light ? 0.16 : 0.13) : (light ? 0.07 : 0.05)); ctx.beginPath(); ctx.moveTo(xx, py); ctx.lineTo(xx, py + ph); ctx.stroke(); }

  // the curve: one sample per device pixel through the monotone cubic
  const n = Math.min(2400, Math.max(8, Math.ceil(pw * sc))), dbv = new Float32Array(n), hv = new Float32Array(n), pos = new Float32Array(n), dB = bandsOf(T, T.disp, f), hB = bandsOf(T, T.hold, f);
  for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, p = bandPos(oct, 20 * Math.pow(1000, u)); pos[i] = p; dbv[i] = cubic(dB, p); hv[i] = Math.max(dbv[i], cubic(hB, p)); }
  const lift = T.lift[f];
  // fill: an offscreen layer in device pixels, one column per device pixel, vertical gradient anchored at that column's top edge
  const LW = Math.max(1, Math.round(pw * sc)), LH = Math.max(1, Math.round(ph * sc)), g = layerCtx(LW, LH), cw = LW / n;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, yt = (Y(dbv[i]) - py) * sc, len = LH - yt; if (len < 0.5) continue;
    const c = tcol(u), lowK = 1 - smooth(0.12, 0.40, u), boost = lowK * lift;
    const rgb = (k, a) => { const tg = k < 0 ? [0, 0, 0] : bright, kk = Math.abs(k); return `rgba(${Math.round(c[0] + (tg[0] - c[0]) * kk)},${Math.round(c[1] + (tg[1] - c[1]) * kk)},${Math.round(c[2] + (tg[2] - c[2]) * kk)},${a})`; };
    // body alpha is anchored to the plot (so neighbouring columns match, no streaks); the top edge adds its own bright rim
    const gr = g.createLinearGradient(0, yt, 0, LH), Ab = (yy) => 0.06 + 0.52 * Math.pow(1 - clampv(yy / LH, 0, 1), 0.9) + 0.14 * boost;
    const e1 = Math.min(0.45, 8 * sc / len), e2 = Math.min(0.8, 34 * sc / len);
    gr.addColorStop(0, rgb(0.97, 0.99)); gr.addColorStop(e1, rgb(0.5 + 0.3 * boost, Math.min(0.95, Ab(yt + e1 * len) + 0.3)));
    gr.addColorStop(e2, rgb(0.12, Ab(yt + e2 * len) + 0.06)); gr.addColorStop(0.62 + 0.38 * 0, rgb(0, Ab(yt + 0.62 * len)));
    gr.addColorStop(1, rgb(-0.4, Ab(LH)));
    g.fillStyle = gr; g.fillRect(Math.floor(i * cw), yt, Math.ceil(cw) + 0.5, len + 1);
  }
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(LAYER, 0, 0, LW, LH, px, py, pw, ph); ctx.restore();

  const path = (arr, yOff = 0) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const X = px + pw * (i + 0.5) / n, Yy = Y(arr[i]) + yOff; i ? ctx.lineTo(X, Yy) : ctx.moveTo(X, Yy); } };
  // peak hold: thin line, only where it stands above the live curve
  if (opts.hold !== false) {
    ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(hi, light ? 0.5 : 0.5);
    ctx.beginPath(); let pen = false;
    for (let i = 0; i < n; i++) { const X = px + pw * (i + 0.5) / n, Yy = Y(hv[i]) - 0.0, up = hv[i] - dbv[i] > 0.35; if (up) { pen ? ctx.lineTo(X, Yy) : ctx.moveTo(X, Yy); pen = true; } else pen = false; }
    ctx.stroke();
  }
  // top edge: a soft glow underlay and the crisp bright line, coloured by the tone ramp, brightest on the kick
  const eg = ctx.createLinearGradient(px, 0, px + pw, 0);
  for (let k = 0; k <= 8; k++) { const c = tcol(k / 8), q = (0.55 + 0.45 * (k < 3 ? lift : 0)); eg.addColorStop(k / 8, light ? rgba(ink, 0.95) : `rgb(${Math.round(c[0] + (255 - c[0]) * q)},${Math.round(c[1] + (255 - c[1]) * q)},${Math.round(c[2] + (255 - c[2]) * q)})`); }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  path(dbv); ctx.strokeStyle = eg; ctx.globalAlpha = 0.2 + 0.2 * lift; ctx.lineWidth = 7; ctx.stroke(); ctx.globalAlpha = 1;
  path(dbv); ctx.strokeStyle = eg; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
  // reference overlay: the imported genre curve, level-aligned on the 200 Hz - 5 kHz average of what is shown
  if (REF.cur && opts.ref !== false) {
    { const lv = globalThis.u2cLive; if (!(lv && lv.mt && performance.now() - lv.mtAt < 600)) refUpdate(oct, dB, 0.08, 'clip'); }   // live: the plugin's own spectrum feeds it (daw.js)
    ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.6;
    for (const sh of shown()) { const off = REF.offs[sh.name] || 0; ctx.strokeStyle = rgba(sh.color, 0.85); ctx.beginPath();
      for (let i = 0; i < n; i++) { const X = px + pw * (i + 0.5) / n, Yy = Y(refAt(sh.r, 20 * Math.pow(1000, (i + 0.5) / n)) + off); i ? ctx.lineTo(X, Yy) : ctx.moveTo(X, Yy); }
      ctx.stroke(); }
    ctx.restore();
  }
  // peak marker + readout (real: the highest point of the displayed curve)
  let pk = 0; for (let i = 1; i < n; i++) if (dbv[i] > dbv[pk]) pk = i;
  const pkHz = 20 * Math.pow(1000, (pk + 0.5) / n), pkX = px + pw * (pk + 0.5) / n, pkY = Y(dbv[pk]);
  ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(pkX, pkY, 2.6, 0, 6.2832); ctx.fill();
  ctx.restore();   // plot clip

  // gutters: dB scale on the left, frequencies along the bottom
  for (const d of grid) lab('−' + (-d), px - 8, Y(d), { align: 'right', a: 0.55 });
  lab('dB', px - 8, py + ph + gb * 0.56, { align: 'right', a: 0.5 });
  for (const [hz, s] of labF) { const X = fx(hz), a = major.has(hz) ? 0.72 : 0.5; lab(s, hz === 20 ? Math.max(px, X) : hz === 20000 ? Math.min(px + pw, X) : X, py + ph + gb * 0.56, { align: hz === 20 ? 'left' : hz === 20000 ? 'right' : 'center', a }); }
  if (pw >= 420) lab(`${fmtHzR(pkHz)}  ${(dbv[pk]).toFixed(1).replace('-', '−')} dB`, px + pw - 8, py + 15, { align: 'right', a: 0.72 });
  if (REF.cur && opts.ref !== false && pw >= 300) lab(`ref ${shown().map((q) => q.name).join(' + ')} · ${Math.round(REF.match * 100)}%`, px + 8, py + 15, { align: 'left', a: 0.72 });
  ctx.restore();
}
