// Window kit for the OS-style looks (U2C.EXE, LAB): hairline .exe windows that open/close with crisp eased motion
// (border line-draw, scale-from-titlebar, typewriter titles), orthogonal cables with beat-grid signal dots, and small
// live readouts (waveform + playhead, spectrum, scope, VU/LUFS meter, tempo counter, hex log, timecode).
// All motion is a pure function of frameState (beat / loop phase), so it is loop-safe and export-deterministic.
import { rgba, txt, mono, hash, tc2, clamp } from '../util/draw.js';
import { spring } from '../overlays/chains.js';
export const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
export const easeIO = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/**
 * Open amount 0..1 for window i around the phrase turnover. Each window folds briefly around its own moment
 * (-0.6, -0.2, +0.2, +0.6 … beats from the downbeat), so the folds ripple across the turn and at most two windows
 * are shut at any instant; the screen is never empty.
 */
export function openAmount(ph, i, keep = false, spb = .43) {
  if (keep) return 1;
  // choreography at the logo's rebuild moment (mid-loop, so frame 0 is a complete, calm frame): each secondary window
  // folds in 120 ms (ease-in), stays shut briefly, then re-opens with ease-out-expo over 450 ms; 40 ms stagger
  let rel = ((ph.lbL % ph.C) + ph.C * 1.5) % ph.C - ph.C / 2; const s = rel * spb, c0 = -.2 + i * .04, o0 = .06 + i * .04;
  if (s < c0) return 1; if (s < c0 + .12) { const q = (s - c0) / .12; return 1 - q * q * q; } if (s < o0) return 0;
  const q = Math.min(1, (s - o0) / .45); return q >= 1 ? 1 : 1 - Math.pow(2, -10 * q);
}
/** Kick pulse 0..1 (fast ease-out) for border brightness / punches. */
export const pulse = fs => Math.max(0, spring(fs.kickAge)) * Math.min(1, fs.kickS * 1.3);
/**
 * Draw a window frame. o = open amount: 0-.3 the title-bar line draws on, .3-1 the body unfolds down from the title
 * bar with its side borders drawing; contents fade in last. Returns {inner, alpha} (alpha 0 = skip content).
 */
export function win(ctx, r, title, o, S) {
  const { u, fg, bg, hi, pl = 0 } = S, tb = 26 * u; if (o <= 0) return { inner: null, alpha: 0 };
  const a = ease(o / .3), b = ease((o - .3) / .7), h = tb + (r.h - tb) * b, lw = 1.5 * u, bri = .55 * (1 + Math.min(.15, pl)); // snare: ≤ 15 % hairline brighten on one window
  ctx.save();
  if (b > 0) { ctx.fillStyle = rgba(bg, .9); ctx.fillRect(r.x, r.y, r.w, h); }
  ctx.strokeStyle = rgba(fg, bri); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w * a, r.y); ctx.stroke();
  if (b > 0) { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + h); ctx.lineTo(r.x + r.w, r.y + h); ctx.lineTo(r.x + r.w, r.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r.x, r.y + tb); ctx.lineTo(r.x + r.w, r.y + tb); ctx.strokeStyle = rgba(fg, .35); ctx.stroke(); }
  if (a > .2) { const n = Math.ceil(title.length * clamp((o - .06) / .45)); txt(ctx, title.slice(0, n) + (n < title.length && o < 1 ? '▌' : ''), r.x + 10 * u, r.y + 17.5 * u, mono(13 * u, 700), rgba(fg, .95));
    for (let j = 0; j < 3; j++) { ctx.strokeStyle = rgba(fg, .7); ctx.lineWidth = 1.2 * u; ctx.strokeRect(r.x + r.w - (20 + j * 16) * u, r.y + 8 * u, 9 * u, 9 * u); } }
  // corner ticks
  if (b > .9) { ctx.fillStyle = rgba(hi, .8 * bri); for (const [cx, cy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) ctx.fillRect(cx - 2.5 * u, cy - 2.5 * u, 5 * u, 5 * u); }
  ctx.restore();
  const pad = 10 * u; return { inner: { x: r.x + pad, y: r.y + tb + pad, w: r.w - 2 * pad, h: r.h - tb - 2 * pad }, alpha: clamp((o - .7) / .3) };
}
/** Orthogonal cable with rounded corners from a to b (points), horizontal-first. Returns the polyline for dots. */
export function cablePath(a, b, u, mid = .5) {
  const mx = a.x + (b.x - a.x) * mid; return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
}
export function drawCable(ctx, pts, S, alpha = .4) {
  const { u, fg } = S, r = 12 * u; ctx.save(); ctx.strokeStyle = rgba(fg, alpha); ctx.lineWidth = 1.3 * u; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) ctx.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, Math.min(r, Math.abs(pts[i + 1].y - pts[i].y) / 2 + .01, Math.abs(pts[i].x - pts[i - 1].x) / 2 + .01));
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke();
  for (const p of [pts[0], pts[pts.length - 1]]) { ctx.fillStyle = S.bg; ctx.fillRect(p.x - 4 * u, p.y - 4 * u, 8 * u, 8 * u); ctx.strokeStyle = rgba(fg, .9); ctx.lineWidth = 1.3 * u; ctx.strokeRect(p.x - 4 * u, p.y - 4 * u, 8 * u, 8 * u); }
  ctx.restore();
}
function along(pts, q) { let tot = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); tot += d; }
  let d = q * tot; for (let i = 1; i < pts.length; i++) { if (d <= seg[i - 1] || i === pts.length - 1) { const k = seg[i - 1] ? clamp(d / seg[i - 1]) : 0; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k }; } d -= seg[i - 1]; } return pts[pts.length - 1]; }
/** Signal dots on the beat grid: one dot per beat zips along the cable (eased), kicks add a bright dot with a short trail. */
/** Calm signal dots: an ambient dot travels the cable whose turn it is on the beat grid (opt.beat), and only the cable
 *  chosen for this kick (opt.kick) carries the kick's signal. */
export function cableDots(ctx, pts, fs, S, offset = 0, opt = { beat: true, kick: true }) {
  const { u, hi, acc } = S, bp = ((fs.beat + offset) % 1 + 1) % 1, q = ease(bp / .9);
  if (opt.beat && bp < .9) { const p = along(pts, q); ctx.fillStyle = rgba(hi, .45 * (1 - bp)); ctx.fillRect(p.x - 2 * u, p.y - 2 * u, 4 * u, 4 * u); }
  if (opt.kick) for (const r of fs.recent('kicks', .7, 1)) { const qq = ease(r.age / .65); if (qq <= 0 || qq >= 1) continue;
    for (let k = 0; k < 5; k++) { const p = along(pts, Math.max(0, qq - k * .025)), z = (5 - k * .8) * u; ctx.fillStyle = rgba(k ? acc : hi, (1 - k / 5) * (1 - qq) * .8); ctx.fillRect(p.x - z * .8, p.y - z * .8, 1.6 * z, 1.6 * z); } }
}
// ---- live readouts (all draw inside r)
export function scopeView(ctx, r, fs, S, span = .04) {
  const { u, fg, hi } = S, n = 160, w = fs.scopeAt(fs.t, n, span);
  ctx.strokeStyle = rgba(fg, .15); ctx.lineWidth = 1 * u; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h * i / 4); ctx.lineTo(r.x + r.w, r.y + r.h * i / 4); ctx.stroke(); }
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(r.x + r.w * i / 6, r.y); ctx.lineTo(r.x + r.w * i / 6, r.y + r.h); ctx.stroke(); }
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.strokeStyle = hi; ctx.lineWidth = 1.6 * u; ctx.beginPath();
  for (let j = 0; j < n; j++) { const x = r.x + j / (n - 1) * r.w, y = r.y + r.h / 2 - w[j] * r.h * .8; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
}
export function meterView(ctx, r, fs, S) {
  const { u, fg, hi, acc } = S, segs = 22, lv = [0, 1].map(ch => clamp((fs.m.peakBar(ch, fs.t) + fs.m.exportGain(S.P) + 60) / 60)), bh = (r.h - 34 * u) / 2 - 4 * u;
  lv.forEach((v, c) => { const y = r.y + c * (bh + 8 * u), sw = r.w / segs; txt(ctx, c ? 'R' : 'L', r.x, y + bh * .75, mono(11 * u, 700), rgba(fg, .7));
    for (let s = 0; s < segs; s++) { const on = s / segs < v; ctx.fillStyle = on ? (s > segs * .82 ? acc : s > segs * .6 ? hi : rgba(fg, .8)) : rgba(fg, .12); ctx.fillRect(r.x + 16 * u + s * (r.w - 16 * u) / segs, y, (r.w - 16 * u) / segs - 2 * u, bh); }
    const hold = Math.max(v, fs.level(fs.t - .6, fs.t) * .97), hx = r.x + 16 * u + hold * (r.w - 16 * u); ctx.fillStyle = hi; ctx.fillRect(hx - 1 * u, y - 2 * u, 2 * u, bh + 4 * u); void sw; });
  const M = fs.m, g = M.exportGain(S.P); txt(ctx, `${(M.lufsS(fs.t) + g).toFixed(1)} LUFS-S`, r.x, r.y + r.h - 2 * u, mono(13 * u, 700), hi); txt(ctx, `TP ${(M.truePeak(fs.t) + g).toFixed(1)}`, r.x + r.w, r.y + r.h - 2 * u, mono(11 * u), rgba(fg, .6), 'right');
}
export const timecode = (fs) => tc2(fs.lt);
// ======================= pro meters (V3) =======================
const LOGF = f => Math.log(f / 20) / Math.log(1000); // 20 Hz … 20 kHz → 0 … 1
const FTICKS = [[50, '50'], [100, '100'], [200, '200'], [500, '500'], [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k']];
const lab = (ctx, s, x, y, S, al = .55, align = 'left') => txt(ctx, s, x, y, mono(9 * S.u, 500), rgba(S.fg, al), align);
function freqGrid(ctx, r, S, dbs, dbMin, dbMax, unit) {
  const { u, fg } = S; ctx.save(); ctx.lineWidth = 1 * u;
  for (const [f, l] of FTICKS) { const x = r.x + LOGF(f) * r.w; ctx.strokeStyle = rgba(fg, f === 1000 ? .22 : .1); ctx.beginPath(); ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); ctx.stroke(); lab(ctx, l, x + 2 * u, r.y + r.h - 2 * u, S, .45); }
  for (const d of dbs) { const y = r.y + (dbMax - d) / (dbMax - dbMin) * r.h; ctx.strokeStyle = rgba(fg, d === 0 ? .22 : .1); ctx.beginPath(); ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); ctx.stroke(); lab(ctx, (d > 0 ? '+' : '') + d + (d === dbs[0] ? unit : ''), r.x + r.w - 2 * u, y - 2 * u, S, .45, 'right'); }
  ctx.restore();
}
/** Parametric EQ display: 5 bands whose gains follow the (smoothed) band energies, summed curve, live spectrum behind. */
export function eqView(ctx, r, fs, S) {
  const { u, fg, hi, acc } = S, M = fs.m, sd = M.specDb(fs.i);
  freqGrid(ctx, r, S, [12, 6, 0, -6, -12], -15, 15, ' dB');
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  // spectrum, faint, behind
  ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h); for (let k = 0; k < sd.length; k++) { const x = r.x + LOGF(M.binHz(k)) * r.w, y = r.y + r.h - clamp((sd[k] + 60) / 60) * r.h * .9; ctx.lineTo(x, y); } ctx.lineTo(r.x + r.w, r.y + r.h); ctx.closePath(); ctx.fillStyle = rgba(fg, .08); ctx.fill();
  const g = x => clamp((x - .42) * 26, -12, 12), B = fs.bands;
  const bands = [{ f: 80, g: g(fs.bassE), q: 1.1, t: 'ls' }, { f: 250, g: g(B[2]), q: .9, t: 'pk' }, { f: 1000, g: g(fs.midE), q: .9, t: 'pk' }, { f: 4000, g: g(fs.highE), q: .9, t: 'pk' }, { f: 11000, g: g(B[5]), q: 1.1, t: 'hs' }];
  const resp = f => bands.reduce((a, b) => { const o = Math.log2(f / b.f); return a + (b.t === 'pk' ? b.g * Math.exp(-o * o / (2 * b.q * b.q * .35)) : b.t === 'ls' ? b.g / (1 + Math.exp(o * 3)) : b.g / (1 + Math.exp(-o * 3))); }, 0);
  const yOf = d => r.y + (15 - d) / 30 * r.h;
  ctx.beginPath(); for (let j = 0; j <= 120; j++) { const f = 20 * Math.pow(1000, j / 120), x = r.x + j / 120 * r.w, y = yOf(resp(f)); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.strokeStyle = hi; ctx.lineWidth = 1.8 * u; ctx.stroke(); ctx.lineTo(r.x + r.w, yOf(0)); ctx.lineTo(r.x, yOf(0)); ctx.closePath(); ctx.fillStyle = rgba(hi, .1); ctx.fill();
  bands.forEach((b, i) => { const x = r.x + LOGF(b.f) * r.w, y = yOf(resp(b.f)), z = (5 + (i === 0 ? 2.5 * fs.bassE : 0)) * u; /* bass → EQ low node */ ctx.fillStyle = S.bg; ctx.strokeStyle = i === 0 ? acc : hi; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.arc(x, y, z, 0, 7); ctx.fill(); ctx.stroke();
    lab(ctx, String(i + 1), x, y - z - 4 * u, S, .8, 'center'); });
  ctx.restore();
  lab(ctx, `LS ${bands[0].g.toFixed(1)}  ·  HS ${bands[4].g.toFixed(1)} dB`, r.x + 2 * u, r.y + 9 * u, S, .7);
}
/** Log-frequency spectrum analyser: 1/6-oct smoothing, -60…0 dB, filled area, 12 dB/s peak-hold line. */
export function specAnalyzer(ctx, r, fs, S) {
  const { u, hi } = S, M = fs.m, sd = M.specDb(fs.i), hold = M.specHold(fs.t), yOf = d => r.y + clamp((0 - d) / 60) * r.h, xs = k => r.x + LOGF(M.binHz(k)) * r.w;
  freqGrid(ctx, r, S, [0, -12, -24, -36, -48], -60, 0, ' dB');
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  const path = (arr) => { ctx.beginPath(); for (let k = 0; k < arr.length; k++) { const x = xs(k), y = yOf(arr[k]); if (!k) ctx.moveTo(r.x, y); ctx.lineTo(x, y); } ctx.lineTo(r.x + r.w, yOf(arr[arr.length - 1])); };
  path(sd); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.closePath(); const gr = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); gr.addColorStop(0, rgba(hi, .38)); gr.addColorStop(1, rgba(hi, .03)); ctx.fillStyle = gr; ctx.fill();
  path(sd); ctx.strokeStyle = hi; ctx.lineWidth = 1.4 * u; ctx.stroke();
  path(hold); ctx.strokeStyle = rgba(S.acc, .85); ctx.lineWidth = 1 * u; ctx.setLineDash([2 * u, 2 * u]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore(); lab(ctx, '1/6 OCT · HOLD −12 dB/s', r.x + 2 * u, r.y + 9 * u, S, .7);
}
/** L/R peak + RMS meter with dB scale, 1.5 s peak hold, clip LEDs and LUFS M/S/I + true-peak readouts. */
export function proMeter(ctx, r, fs, S, P) {
  const { u, fg, hi, acc } = S, M = fs.m, t = fs.t, G = M.exportGain(P), bw = 18 * u, x0 = r.x + 26 * u, top = r.y + 16 * u, h = r.h - 22 * u, yOf = d => top + clamp(-d / 60) * h;
  for (const d of [0, -3, -6, -18, -60]) { const y = yOf(d); lab(ctx, String(d), r.x + 20 * u, y + 3 * u, S, .6, 'right'); ctx.fillStyle = rgba(fg, .3); ctx.fillRect(x0 - 3 * u, y, 2 * u, 1 * u); }
  const clipped = M.truePeak(t) + G >= -.1;
  [0, 1].forEach(ch => { const x = x0 + ch * (bw + 6 * u), pkb = M.peakBar(ch, t) + G, rms = M.rmsDb(ch, t) + G, hold = M.holdDb(ch, t) + G;
    ctx.fillStyle = rgba(fg, .08); ctx.fillRect(x, top, bw, h);
    // peak (thin, bright) over RMS (wide, dimmer); segmented hairlines every 3 dB
    const yp = yOf(pkb), yr = yOf(rms); ctx.fillStyle = rgba(hi, .35); ctx.fillRect(x, yr, bw, top + h - yr);
    const grd = ctx.createLinearGradient(0, top, 0, top + h); grd.addColorStop(0, acc); grd.addColorStop(.1, hi); grd.addColorStop(1, rgba(hi, .7)); ctx.fillStyle = grd; ctx.fillRect(x + bw * .3, yp, bw * .4, top + h - yp);
    ctx.fillStyle = S.bg; for (let d = -3; d > -60; d -= 3) ctx.fillRect(x, yOf(d), bw, .8 * u);
    ctx.fillStyle = hi; ctx.fillRect(x, yOf(hold) - 1 * u, bw, 2 * u);
    ctx.fillStyle = clipped ? acc : rgba(fg, .15); ctx.fillRect(x, r.y + 2 * u, bw, 8 * u);
    lab(ctx, ch ? 'R' : 'L', x + bw / 2, top + h + 10 * u, S, .8, 'center'); });
  const rx = x0 + 2 * bw + 22 * u, line = (k, v, y, big) => { lab(ctx, k, rx, y, S, .55); txt(ctx, v, r.x + r.w, y + (big ? 2 : 0) * u, mono((big ? 17 : 12) * u, 700), big ? hi : rgba(fg, .9), 'right'); };
  line('MOMENTARY', (M.lufsM(t) + G).toFixed(1), r.y + 22 * u, true); line('SHORT-TERM', (M.lufsS(t) + G).toFixed(1), r.y + 50 * u, false);
  line('INTEGRATED', (M.lufsI(P.inT, P.outT) + G).toFixed(1), r.y + 72 * u, false); line('TRUE PEAK', (M.truePeak(t) + G).toFixed(1) + ' dBTP', r.y + 94 * u, false);
  line('PEAK L/R', (M.peakBar(0, t) + G).toFixed(1) + ' / ' + (M.peakBar(1, t) + G).toFixed(1), r.y + 116 * u, false);
  lab(ctx, 'LUFS · BS.1770 · ' + (G ? 'POST-NORM ' + (G > 0 ? '+' : '') + G.toFixed(1) + ' dB' : 'UNNORMALISED') + (M.mono ? ' · MONO' : ''), rx, r.y + r.h - 2 * u, S, .6);
}
/** Goniometer (M up, S across) + correlation meter (−1 … +1). */
export function goniometer(ctx, r, fs, S) {
  const { u, fg, hi, acc } = S, M = fs.m, sz = Math.min(r.w, r.h - 28 * u), cx = r.x + r.w / 2, cy = r.y + sz / 2, R = sz / 2;
  ctx.save(); ctx.strokeStyle = rgba(fg, .14); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.moveTo(cx - R * .707, cy - R * .707); ctx.lineTo(cx + R * .707, cy + R * .707); ctx.moveTo(cx + R * .707, cy - R * .707); ctx.lineTo(cx - R * .707, cy + R * .707); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  lab(ctx, 'M', cx + 3 * u, cy - R + 10 * u, S); lab(ctx, 'L', cx - R * .707 - 8 * u, cy - R * .707 + 4 * u, S); lab(ctx, 'R', cx + R * .707 + 3 * u, cy - R * .707 + 4 * u, S); lab(ctx, '+S', cx + R - 14 * u, cy - 3 * u, S); lab(ctx, '−S', cx - R + 2 * u, cy - 3 * u, S);
  const s = M.lr(fs.t, 360, .045); let pk = 1e-3; for (let i = 0; i < s.l.length; i++) pk = Math.max(pk, Math.abs(s.l[i]) + Math.abs(s.r[i])); const k = R * .92 / Math.max(.25, pk);
  ctx.beginPath(); ctx.rect(cx - R, cy - R, 2 * R, 2 * R); ctx.clip(); ctx.fillStyle = rgba(hi, .55);
  for (let i = 0; i < s.l.length; i++) { const x = cx + (s.r[i] - s.l[i]) * .707 * k, y = cy - (s.l[i] + s.r[i]) * .707 * k; ctx.fillRect(x - .9 * u, y - .9 * u, 1.8 * u, 1.8 * u); }
  ctx.restore();
  const c = M.corr(fs.t), by = r.y + r.h - 12 * u, bx = r.x + 16 * u, bw = r.w - 32 * u; ctx.fillStyle = rgba(fg, .15); ctx.fillRect(bx, by, bw, 3 * u);
  ctx.fillStyle = c < 0 ? acc : hi; ctx.fillRect(bx + bw / 2 + Math.min(0, c) * bw / 2, by - 1 * u, Math.abs(c) * bw / 2, 5 * u); ctx.fillRect(bx + (c + 1) / 2 * bw - 1 * u, by - 4 * u, 2 * u, 11 * u);
  lab(ctx, '−1', bx - 2 * u, by + 4 * u, S, .6, 'right'); lab(ctx, '+1', bx + bw + 2 * u, by + 4 * u, S, .6); lab(ctx, 'CORR ' + c.toFixed(2), bx + bw / 2, by - 6 * u, S, .85, 'center');
}
/** Clip waveform: peak + RMS layers, played part brighter, bar/beat ticks, playhead. */
export function wavePro(ctx, r, fs, P, S) {
  const { u, fg, hi } = S, T = fs.track, L = Math.max(.1, P.outT - P.inT), q = clamp(fs.lt / L), n = Math.max(24, Math.round(r.w / (3 * u))), bw = r.w / n, mid = r.y + r.h / 2;
  for (let j = 0; j < n; j++) { const a = P.inT + L * j / n, pk = fs.peak(a, a + L / n), rm = fs.level(a, a + L / n) * pk * .75, on = j / n <= q, x = r.x + j * bw;
    ctx.fillStyle = on ? rgba(hi, .45) : rgba(fg, .2); ctx.fillRect(x, mid - pk * r.h * .46, Math.max(1, bw - .6 * u), pk * r.h * .92);
    ctx.fillStyle = on ? hi : rgba(fg, .45); ctx.fillRect(x, mid - rm * r.h * .46, Math.max(1, bw - .6 * u), rm * r.h * .92); }
  for (let b = Math.ceil((P.inT - T.t0) / T.spb); T.t0 + b * T.spb <= P.outT; b++) { const x = r.x + (T.t0 + b * T.spb - P.inT) / L * r.w, bar = b % 4 === 0; ctx.fillStyle = rgba(fg, bar ? .6 : .25); ctx.fillRect(x, r.y, 1 * u, bar ? 6 * u : 3 * u); if (bar) lab(ctx, String(Math.floor(b / 4) + 1), x + 2 * u, r.y + 8 * u, S, .5); }
  const x = r.x + q * r.w; ctx.fillStyle = hi; ctx.fillRect(x - .75 * u, r.y, 1.5 * u, r.h); ctx.beginPath(); ctx.moveTo(x - 5 * u, r.y); ctx.lineTo(x + 5 * u, r.y); ctx.lineTo(x, r.y + 6 * u); ctx.fill();
}
/** Tempo panel: BPM, key, bar.beat.tick, 4-step metronome, swing/groove readout. */
export function tempoPro(ctx, r, fs, S, bpmTxt, keyTxt, fonts) {
  const { u, fg, hi } = S, beatIn = ((Math.floor(fs.beat) % 4) + 4) % 4, tick = Math.floor(fs.bp * 960), G = fs.m.groove;
  txt(ctx, bpmTxt || Math.round(fs.bpm) + ' BPM', r.x, r.y + 30 * u, fonts.bpm || mono(30 * u, 700), hi);
  if (keyTxt) txt(ctx, keyTxt, r.x + r.w, r.y + 30 * u, fonts.key || mono(20 * u, 700), fg, 'right');
  txt(ctx, `${String(fs.bar + 1).padStart(3, '0')}.${beatIn + 1}.${String(tick).padStart(3, '0')}`, r.x, r.y + r.h - 6 * u, mono(20 * u, 500), rgba(fg, .9));
  lab(ctx, `SWING ${G.swing}%  ·  GROOVE ±${G.tightMs} ms  ·  4/4`, r.x, r.y + r.h - 32 * u, S, .6);
  for (let j = 0; j < 4; j++) { const on = j === beatIn, k = on ? 1 - ease(fs.bp) * .7 : 0, x = r.x + r.w - (4 - j) * 24 * u; ctx.strokeStyle = rgba(fg, .5); ctx.lineWidth = 1 * u; ctx.strokeRect(x, r.y + r.h - 22 * u, 16 * u, 16 * u);
    if (on) { ctx.fillStyle = rgba(j === 0 ? S.acc : hi, .35 + .65 * k); ctx.fillRect(x + 2 * u, r.y + r.h - 20 * u, 12 * u, 12 * u); } }
}
/** Scrolling note lanes (drums / bass / mid / high onsets), like a DAW timeline, playhead at 70 %. */
export function lanesView(ctx, r, fs, S) {
  const { u, fg, hi, acc } = S, Ls = fs.m.lanes, keys = Object.keys(Ls), lh = r.h / keys.length, span = 3, t0 = fs.t - span * .7, lw = 34 * u, X = tt => r.x + lw + (tt - t0) / span * (r.w - lw);
  keys.forEach((k, i) => { const y = r.y + i * lh; ctx.fillStyle = rgba(fg, i % 2 ? .03 : .06); ctx.fillRect(r.x, y, r.w, lh); lab(ctx, k, r.x + 2 * u, y + lh / 2 + 3 * u, S, .7);
    // inside a loop the lanes are periodic too: notes come from the clip only, repeated every loop length
    const T = Ls[k], lp = fs.loop, Lp = lp ? lp.b - lp.a : 0, offs = lp ? [-Lp, 0, Lp] : [0];
    for (const off of offs) { const a = t0 - off, b = t0 + span - off; let lo = 0, hi2 = T.length; while (lo < hi2) { const m = (lo + hi2) >> 1; if (T[m] < a) lo = m + 1; else hi2 = m; }
      for (let j = lo; j < T.length && T[j] < b; j++) { if (lp && (T[j] < lp.a - .06 || T[j] >= lp.b - .06)) continue; const tt = T[j] + off, x = X(tt), past = tt <= fs.t, fresh = past && fs.t - tt < .15; ctx.fillStyle = fresh ? acc : past ? hi : rgba(fg, .45); ctx.fillRect(x - 1.5 * u, y + lh * .25, (fresh ? 5 : 3) * u, lh * .5); } } });
  for (let b = Math.ceil((t0 - fs.track.t0) / fs.spb); fs.track.t0 + b * fs.spb < t0 + span; b++) { const x = X(fs.track.t0 + b * fs.spb); ctx.fillStyle = rgba(fg, b % 4 ? .1 : .3); ctx.fillRect(x, r.y, 1 * u, r.h); }
  const px = X(fs.t); ctx.fillStyle = hi; ctx.fillRect(px - .75 * u, r.y, 1.5 * u, r.h);
}
/** Hex event log of the actual hits (kick/snare/hat), newest last, typed in as it arrives. */
export function hitLog(ctx, r, fs, S, tag) {
  const { u, fg, hi } = S, lh = 15 * u, n = Math.max(2, Math.floor((r.h - (tag ? lh : 0)) / lh)), ev = [];
  for (const [name, L] of [['KICK', 'kicks'], ['SNR ', 'snares'], ['HAT ', 'hats']]) for (const h of fs.recent(L, 4, n)) ev.push({ ...h, name });
  ev.sort((a, b) => b.age - a.age); const rows = ev.slice(-n);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  rows.forEach((e, i) => { const tt = fs.lt - e.age, s = `${tc2(Math.max(0, tt))}  ${e.name}  0x${((e.idx * 2654435761) >>> 0 & 0xffffff).toString(16).toUpperCase().padStart(6, '0')}  ${e.s.toFixed(2)}`, last = i === rows.length - 1;
    txt(ctx, last ? s.slice(0, Math.ceil(s.length * ease(e.age / .12))) + (Math.floor(fs.beat * 2) % 2 ? '' : ' ▌') : s, r.x, r.y + (i + 1) * lh - 3 * u, mono(11 * u, last ? 700 : 400), last ? hi : rgba(fg, .35 + .5 * i / n)); });
  if (tag) txt(ctx, '> ' + tag, r.x, r.y + r.h - 2 * u, mono(11 * u, 700), hi);
  ctx.restore();
}
