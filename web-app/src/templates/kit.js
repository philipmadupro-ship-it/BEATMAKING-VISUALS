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
export function openAmount(ph, i, keep = false) {
  if (keep) return 1;
  let rel = ph.lb - (-.6 + i * .4); rel = ((rel % ph.C) + ph.C * 1.5) % ph.C - ph.C / 2;
  return easeIO((Math.abs(rel) - .15) / .35);
}
/** Kick pulse 0..1 (fast ease-out) for border brightness / punches. */
export const pulse = fs => Math.max(0, spring(fs.kickAge)) * Math.min(1, fs.kickS * 1.3);
/**
 * Draw a window frame. o = open amount: 0-.3 the title-bar line draws on, .3-1 the body unfolds down from the title
 * bar with its side borders drawing; contents fade in last. Returns {inner, alpha} (alpha 0 = skip content).
 */
export function win(ctx, r, title, o, S) {
  const { u, fg, bg, hi, pl = 0 } = S, tb = 26 * u; if (o <= 0) return { inner: null, alpha: 0 };
  const a = ease(o / .3), b = ease((o - .3) / .7), h = tb + (r.h - tb) * b, lw = 1.5 * u, bri = .55 + .45 * pl;
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
export function cableDots(ctx, pts, fs, S, offset = 0) {
  const { u, hi, acc } = S, bp = ((fs.beat + offset) % 1 + 1) % 1, q = ease(bp / .7);
  if (bp < .7) { const p = along(pts, q); ctx.fillStyle = rgba(hi, .9 * (1 - bp)); ctx.fillRect(p.x - 3 * u, p.y - 3 * u, 6 * u, 6 * u); }
  for (const r of fs.recent('kicks', .5, 2)) { const qq = ease((r.age - offset * .05) / .45); if (qq <= 0 || qq >= 1) continue;
    for (let k = 0; k < 5; k++) { const p = along(pts, Math.max(0, qq - k * .025)), z = (5 - k * .8) * u; ctx.fillStyle = rgba(k ? acc : hi, (1 - k / 5) * (1 - qq * .5)); ctx.fillRect(p.x - z, p.y - z, 2 * z, 2 * z); } }
}
// ---- live readouts (all draw inside r)
export function waveView(ctx, r, fs, P, S) {
  const { u, fg, hi } = S, n = Math.max(16, Math.round(r.w / (5 * u))), L = Math.max(.1, P.outT - P.inT), q = clamp(fs.lt / L), bw = r.w / n;
  for (let j = 0; j < n; j++) { const a = P.inT + L * j / n, v = fs.peak(a, a + L / n), hh = Math.max(1.5 * u, v * r.h * .9), played = j / n <= q;
    ctx.fillStyle = played ? rgba(hi, .9) : rgba(fg, .35); ctx.fillRect(r.x + j * bw, r.y + (r.h - hh) / 2, Math.max(1, bw * .55), hh); }
  const x = r.x + q * r.w; ctx.fillStyle = hi; ctx.fillRect(x - 1 * u, r.y - 4 * u, 2 * u, r.h + 8 * u); ctx.fillRect(x - 5 * u, r.y - 6 * u, 10 * u, 4 * u);
}
export function spectrumView(ctx, r, fs, S, bars = 24) {
  const { u, fg, hi } = S, bw = r.w / bars;
  for (let j = 0; j < bars; j++) { const k = Math.min(47, Math.round(j * 46 / (bars - 1))), v = fs.specAt(k), cap = Math.max(v, fs.spec(fs.t - .12, k) * .92, fs.spec(fs.t - .24, k) * .84), segs = 12, sh = r.h / segs;
    for (let s = 0; s < Math.round(v * segs); s++) { ctx.fillStyle = rgba(s > segs * .75 ? hi : fg, .35 + .5 * s / segs); ctx.fillRect(r.x + j * bw + 1, r.y + r.h - (s + 1) * sh + 1, bw - 2, sh - 2); }
    ctx.fillStyle = hi; ctx.fillRect(r.x + j * bw + 1, r.y + r.h - cap * r.h - 2 * u, bw - 2, 1.5 * u); }
}
export function scopeView(ctx, r, fs, S, span = .04) {
  const { u, fg, hi } = S, n = 160, w = fs.scopeAt(fs.t, n, span);
  ctx.strokeStyle = rgba(fg, .15); ctx.lineWidth = 1 * u; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h * i / 4); ctx.lineTo(r.x + r.w, r.y + r.h * i / 4); ctx.stroke(); }
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(r.x + r.w * i / 6, r.y); ctx.lineTo(r.x + r.w * i / 6, r.y + r.h); ctx.stroke(); }
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.strokeStyle = hi; ctx.lineWidth = 1.6 * u; ctx.beginPath();
  for (let j = 0; j < n; j++) { const x = r.x + j / (n - 1) * r.w, y = r.y + r.h / 2 - w[j] * r.h * .8; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
}
export function meterView(ctx, r, fs, S) {
  const { u, fg, hi, acc } = S, segs = 22, lv = [fs.level(fs.t - .05, fs.t), fs.level(fs.t - .07, fs.t - .01)], bh = (r.h - 34 * u) / 2 - 4 * u;
  lv.forEach((v, c) => { const y = r.y + c * (bh + 8 * u), sw = r.w / segs; txt(ctx, c ? 'R' : 'L', r.x, y + bh * .75, mono(11 * u, 700), rgba(fg, .7));
    for (let s = 0; s < segs; s++) { const on = s / segs < v; ctx.fillStyle = on ? (s > segs * .82 ? acc : s > segs * .6 ? hi : rgba(fg, .8)) : rgba(fg, .12); ctx.fillRect(r.x + 16 * u + s * (r.w - 16 * u) / segs, y, (r.w - 16 * u) / segs - 2 * u, bh); }
    const hold = Math.max(v, fs.level(fs.t - .6, fs.t) * .97), hx = r.x + 16 * u + hold * (r.w - 16 * u); ctx.fillStyle = hi; ctx.fillRect(hx - 1 * u, y - 2 * u, 2 * u, bh + 4 * u); void sw; });
  const lufs = fs.rmsDb() - 3; txt(ctx, `${lufs.toFixed(1)} LUFS-S`, r.x, r.y + r.h - 2 * u, mono(13 * u, 700), hi); txt(ctx, 'TP -1.0', r.x + r.w, r.y + r.h - 2 * u, mono(11 * u), rgba(fg, .6), 'right');
}
export function counterView(ctx, r, fs, S, bpmTxt, keyTxt, fonts) {
  const { u, fg, hi } = S, beatIn = ((Math.floor(fs.beat) % 4) + 4) % 4;
  txt(ctx, bpmTxt || Math.round(fs.bpm) + ' BPM', r.x, r.y + 38 * u, fonts.bpm || mono(36 * u, 700), hi);
  if (keyTxt) txt(ctx, keyTxt, r.x + r.w, r.y + 38 * u, fonts.key || mono(22 * u, 700), fg, 'right');
  txt(ctx, 'BAR ' + String(fs.bar + 1).padStart(3, '0') + '.' + (beatIn + 1), r.x, r.y + r.h - 4 * u, mono(14 * u, 500), rgba(fg, .8));
  for (let j = 0; j < 4; j++) { const on = j === beatIn, k = on ? 1 - ease(fs.bp) * .6 : 0, x = r.x + r.w - (4 - j) * 22 * u; ctx.fillStyle = on ? rgba(hi, .4 + .6 * k) : rgba(fg, .18); ctx.fillRect(x, r.y + r.h - 16 * u, 16 * u, 12 * u); }
}
const EV = ['KICK', 'SNR ', 'HAT ', 'SUB ', 'BUS ', 'SYNC'];
export function logView(ctx, r, fs, S, tag) {
  const { u, fg, hi } = S, lh = 17 * u, n = Math.max(2, Math.floor(r.h / lh)), b0 = Math.floor(fs.beat);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  for (let i = 0; i < n; i++) { const b = b0 - (n - 1 - i), hx = (hash(b, 91) * 0xffffff | 0).toString(16).padStart(6, '0').toUpperCase(), ev = EV[Math.floor(hash(b, 92) * EV.length)], bar = Math.floor(b / 4) + 1, bt = ((b % 4) + 4) % 4 + 1;
    let s = `${String(bar).padStart(3, '0')}.${bt}  0x${hx}  ${ev}  ${(hash(b, 93)).toFixed(2)}`; if (i === n - 1) s = s.slice(0, Math.ceil(s.length * ease(fs.bp / .35)));
    txt(ctx, s, r.x, r.y + (i + 1) * lh - 4 * u, mono(12 * u, i === n - 1 ? 700 : 400), i === n - 1 ? hi : rgba(fg, .35 + .5 * i / n)); }
  if (tag) txt(ctx, '> ' + tag, r.x, r.y + r.h, mono(12 * u, 700), hi);
  ctx.restore();
}
export const timecode = (fs) => tc2(fs.lt);
