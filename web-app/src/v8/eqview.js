// v11 EQ view: a dynamic multiband EQ in the spirit of a pro session (original drawing; ideas from the FabFilter Pro-MB /
// Pro-Q layout, no third-party code or trade dress). Drawn only inside the rect it is given, no opaque backdrop (the window
// is glass). Everything is measured from the real audio:
//  - analyzer: the clip's 1/6-octave spectrum (61 bands, instant attack, 24 dB/s fall, 1 s peak hold, analysis/clipdata.js),
//    smoothed over the log axis; PRE behind, POST = PRE x the dynamic curve; peak-hold dots
//  - bands: the per-section match-EQ fit (meterlib.fitMatch), static gain g. Each band is also DYNAMIC: its gain moves
//    with the level of the frequency band it listens to, g_dyn = g + dir * depth * env, where env is that band's 1 ms
//    detector (analysis/bandenv.js, 4th-order band-pass, mean square per ms) as a transient measure (level minus its
//    own 90 ms follower, `sens` dB = full) run through an attack/release follower. The lowest band ducks on every kick and recovers with the release time, the rest expand
//    or deepen on their own band. Native data without the detector falls back to the per-frame band levels.
//  - curves: STATIC sum (dashed), DYNAMIC sum (thick, with a short ghost trail of its last frames), per-band fills
//    between the static and the dynamic band curve (the gain-reduction area), band regions between the crossovers
//  - node handles on the dynamic curve with an exact Hz / dB / Q / GR readout for the active band only, dual dB scale,
//    log 20 Hz - 20 kHz axis with a piano strip, a GR meter with peak hold
// Pure helpers (dynEnvelope, bandDyn, dynGain, grAt) are exported for tests/meters.mjs.
import * as ML from './meterlib.js';

const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);
const FS_EQ = 96000;

// ---------------------------------------------------------------- dynamics (pure)
const envCache = new WeakMap(), SLOW_MS = 90;
/** Per band (6): the 1 ms detector in dB, from D.be (v11 data) or, failing that, the per-frame band levels held per ms. */
function detectorDb(D) {
  if (D.be) { const { n, nb, q } = D.be; return { n, nb, at: (i, j) => q[i * nb + j] / 2 - 120, src: 'be' }; }
  const nb = 6, n = Math.max(1, Math.ceil(D.duration * 1000)), F = D.frame, bd = F.bandDb, fps = D.fps;
  const get = (f, j) => (bd[f] && bd[f].length != null ? bd[f][j] : bd[f * 6 + j]);
  return { n, nb, at: (i, j) => get(Math.min(D.frames - 1, Math.floor(i / 1000 * fps)), j), src: 'frames' };
}
/**
 * Detector envelope per ms and band, 0..1. A transient detector, like a sidechain on the kick: the band's level in dB
 * minus a slow follower of itself (90 ms), so a note that just hit reads high and a sustained 808 reads low again;
 * x = excess / sens dB, then a follower with attack / release time constants (ms). Cached per clip + settings.
 * Returns { n, nb, env (Float32Array n*nb), at(t) -> Float32Array(nb) }.
 */
export function dynEnvelope(D, { attack = 4, release = 140, sens = 10 } = {}) {
  const key = attack + '|' + release + '|' + sens, c = envCache.get(D); if (c && c.key === key) return c;
  const det = detectorDb(D), { n, nb } = det, env = new Float32Array(n * nb), ka = 1 - Math.exp(-1 / Math.max(0.5, attack)), kr = 1 - Math.exp(-1 / Math.max(1, release)), ks = 1 - Math.exp(-1 / SLOW_MS);
  for (let j = 0; j < nb; j++) { let e = 0, slow = det.at(0, j); for (let i = 0; i < n; i++) { const db = det.at(i, j), x = clampv((db - slow) / sens, 0, 1); slow += (db - slow) * ks; e += (x - e) * (x > e ? ka : kr); env[i * nb + j] = e; } }
  const tmp = new Float32Array(nb), out = { key, n, nb, env, src: det.src, at: (t) => { const i = clampv(Math.floor(t * 1000 + 1e-6), 0, n - 1); for (let j = 0; j < nb; j++) tmp[j] = env[i * nb + j]; return tmp; } };
  envCache.set(D, out); return out;
}
/** Which detector bands a band listens to, its direction and depth (dB at env = 1). Low bands (< 150 Hz) duck on the beat. */
export function bandDyn(b, depth) {
  const f = b.f, low = f < 150, det = f < 60 ? [0, 1] : f < 150 ? [1] : f < 500 ? [2] : f < 2000 ? [3] : f < 6000 ? [4] : [5];
  return { det, depth: depth * (f < 60 ? 1 : low ? 0.6 : 0.45), dir: low ? -1 : (b.g < 0 ? -1 : 1) };
}
/** Offset in dB the detector adds to the band at this env (6 values). */
export function dynOffset(b, e6, depth) { const d = bandDyn(b, depth); let e = 0; for (const j of d.det) e = Math.max(e, e6[j]); return d.dir * d.depth * e; }
/** Gain reduction of the lowest band (the one that ducks on kicks), dB >= 0, at time t. */
export function grAt(D, t, { depth = 5, attack = 4, release = 140, sens = 10 } = {}) { const E = dynEnvelope(D, { attack, release, sens }); return -dynOffset({ f: 40, g: 0 }, E.at(t), depth); }

const noteName = (fc) => { const ni = Math.round(12 * Math.log2(fc / 440) + 57); return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((ni % 12) + 12) % 12] + Math.floor(ni / 12); };
const fmtHz = (f) => (f >= 1000 ? (f / 1000).toFixed(2) + ' kHz' : f.toFixed(f < 100 ? 1 : 0) + ' Hz');
const WHITE = [true, false, true, false, true, true, false, true, false, true, false, true];   // C C# D ... B: white key?

export function createEqView(L) {
  const { D, F, FPS, BAR, rgba, clamp, lerp, fidx, text } = L;
  const lbl = (ctx, S, s, x, y, o = {}) => text(ctx, s, x, y, { size: o.size || 16, col: rgba(o.col || S.ink, o.a == null ? 0.7 : o.a), align: o.align, w: o.w || 500, ls: 0, base: o.base, maxW: o.maxW });
  const cr = (v) => Math.round(v) + 0.5;
  const eqCols = (S) => (S.grey ? ['#ffffff', '#dcdcdc', '#b4b4b4', '#8c8c8c', '#6c6c6c'] : [...S.bandCols, S.sig2 === S.bandCols[1] ? S.ink : S.sig2, S.hot].slice(0, 5));

  // ---------------------------------------------------------------- match-EQ fit per section (static bands)
  const eqFit = { key: null, segOf: [], fits: [] };
  function eqSections(tilt, strength) {
    const key = tilt + '|' + strength; if (eqFit.key === key) return eqFit;
    const MS = D.ms, nT = MS.ltasN, grid = ML.ltasGrid(nT), segOf = [], segs = [];
    for (let k = 0; k < D.bars; k++) { const sb = D.song.startBar + k; let pi = -1; D.song.phrases.forEach((q, i) => { if (q.bar <= sb) pi = i; }); if (!segs.length || segs[segs.length - 1].pi !== pi) segs.push({ pi, bars: [], label: pi >= 0 ? D.song.phrases[pi].label : 'intro' }); segs[segs.length - 1].bars.push(k); segOf.push(segs.length - 1); }
    const fits = segs.map((sg) => { const lt = grid.map((_, i) => { let p = 0; for (const k of sg.bars) p += 10 ** (MS.ltas[k * nT + i] / 10); return 10 * Math.log10(Math.max(1e-30, p / sg.bars.length)); });
      return { label: sg.label, start: sg.bars[0], bands: ML.fitMatch(grid, lt, { tilt, strength }) }; });
    Object.assign(eqFit, { key, segOf, fits }); return eqFit;
  }
  function bandsAt(t, tilt, strength) {
    const E = eqSections(tilt, strength), k = clamp(Math.floor(t / BAR + 1e-9), 0, D.bars - 1), si = E.segOf[k], cur = E.fits[si];
    const u = (t - cur.start * BAR) * FPS / 4; if (si === 0 || u >= 1) return { bands: cur.bands, label: cur.label, seg: si };
    const prev = E.fits[si - 1].bands, n = Math.max(prev.length, cur.bands.length), e = ML.easeOut3(u), out = [];
    for (let i = 0; i < n; i++) { const a = prev[i] || { ...cur.bands[i], g: 0 }, b = cur.bands[i] || { ...prev[i], g: 0 };
      out.push(a.type === b.type ? { type: b.type, f: Math.exp(lerp(Math.log(a.f), Math.log(b.f), e)), g: lerp(a.g, b.g, e), q: lerp(a.q, b.q, e) } : (e < 0.5 ? a : b)); }
    return { bands: out, label: cur.label, seg: si };
  }

  // ---------------------------------------------------------------- draw
  function draw(ctx, S, r, t, k) {
    const [x0, y0, w0, h0] = r;
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 2, y0 - 2, w0 + 4, (h0 + 4) * k); ctx.clip();
    const MS = D.ms, FMX = MS.anFmax || 20000, x = Math.round(x0 + 46), pw = Math.round(w0 - 46 - 54), y = y0 + 8, h = h0 - 8 - 36, cols = eqCols(S), M = L.meter;
    const tilt = M('eq', 'tilt', 4.5), strength = M('eq', 'strength', 50) / 100, anR = M('eq', 'anRange', 90), mode = M('eq', 'mode', 'pre-post'), hold = M('eq', 'hold', 1);
    const depth = M('eq', 'depth', 5), atk = M('eq', 'attack', 4), rel = M('eq', 'release', 140), sens = M('eq', 'sens', 10), ghostS = M('eq', 'ghost', 0.14), regions = M('eq', 'regions', true), piano = M('eq', 'piano', true);
    const XF = (fq) => x + pw * Math.log(fq / 20) / Math.log(FMX / 20), FX = (X) => 20 * (FMX / 20) ** ((X - x) / pw);
    const E = dynEnvelope(D, { attack: atk, release: rel, sens }), e6 = E.at(t), e6c = Float32Array.from(e6);
    // static bands of this section, plus a band on the kick if the fit has none below 150 Hz
    const fit = bandsAt(t, tilt, strength); let bands = fit.bands.map((b) => ({ type: b.type, f: b.f, g: b.g, q: b.q }));
    if (!bands.some((b) => b.f < 150)) bands.push({ type: 'BELL', f: 70, g: 0, q: 0.9 });
    bands.sort((a, b) => a.f - b.f);
    for (let i = 0; i + 1 < bands.length;) { const a = bands[i], c = bands[i + 1];   // bands closer than 1/2 octave read as one node: merge them
      if (c.f / a.f < 1.41) { const wa = Math.abs(a.g) + 0.5, wc = Math.abs(c.g) + 0.5; bands.splice(i, 2, { type: a.type === c.type ? a.type : (wa >= wc ? a.type : c.type), f: Math.exp((Math.log(a.f) * wa + Math.log(c.f) * wc) / (wa + wc)), g: clamp(a.g + c.g, -9, 9), q: Math.min(a.q, c.q) }); } else i++; }
    bands = bands.slice(0, 5);
    const nb = bands.length, offs = bands.map((b) => dynOffset(b, e6c, depth)), dynB = bands.map((b, i) => ({ ...b, g: b.g + offs[i] }));
    // per pixel column frequencies; band curves (static / dynamic), sums
    const colF = Array.from({ length: pw + 1 }, (_, i) => FX(x + i));
    const curveOf = (bl, step = 1) => { const per = bl.map((b) => { const co = ML.coefOf(b, FS_EQ), a = new Float32Array(pw + 1); for (let i = 0; i <= pw; i += step) a[i] = ML.magDb(co, colF[i], FS_EQ); if (step > 1) a[pw] = ML.magDb(co, colF[pw], FS_EQ); return a; });
      const sum = new Float32Array(pw + 1); for (let i = 0; i <= pw; i += step) { let s = 0; for (const a of per) s += a[i]; sum[i] = s; } if (step > 1) { let s = 0; for (const a of per) s += a[pw]; sum[pw] = s; } return { per, sum }; };
    const stat = curveOf(bands), dyn = curveOf(dynB);
    let rg = M('eq', 'range', 0);
    if (!rg) { const worst = curveOf(bands.map((b) => { const d = bandDyn(b, depth); return { ...b, g: b.g + d.dir * d.depth }; }), 4);   // every band at full detector: a stable scale
      const m = Math.max(0, ...stat.sum.map(Math.abs), ...worst.sum.map(Math.abs)); rg = [3, 6, 12, 18, 30].find((v) => v >= m * 1.08) || 30; }
    const Yg = (db) => y + h * (0.5 - db / (2 * rg)), Ya = (v) => y + h * clamp(-v / anR);
    const sc = S.name === 'RUBEDO' ? S.hot : S.ink;
    // ---- grid (sparse: decades and the 0 dB line)
    ctx.lineWidth = 1;
    for (let dec = 10; dec <= 10000; dec *= 10) for (let m = 1; m <= 9; m++) { const fq = dec * m; if (fq < 20 || fq > FMX) continue; const X = cr(XF(fq)); ctx.strokeStyle = rgba(S.ink, m === 1 && dec >= 100 ? 0.12 : 0.04); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); }
    const step = rg >= 30 ? 12 : rg >= 12 ? 6 : rg >= 6 ? 3 : 1;
    for (let kk = -Math.floor(rg / step); kk <= Math.floor(rg / step); kk++) { const db = kk * step, Y = cr(Yg(db)); ctx.strokeStyle = rgba(S.ink, db === 0 ? 0.26 : 0.05); ctx.beginPath(); ctx.moveTo(x, Y); ctx.lineTo(x + pw, Y); ctx.stroke(); if (Y > y + 8 && Y < y + h - 8) lbl(ctx, S, (db > 0 ? '+' : db < 0 ? '−' : '') + Math.abs(db), x - 6, Y, { size: 15, align: 'right', a: 0.8 }); }
    for (let v = 0; v < anR; v += 30) lbl(ctx, S, v ? '−' + v : '0', x + pw + 5, clamp(Ya(-v), y + 9, y + h - 9), { size: 15, a: 0.38 });
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, pw, h); ctx.clip();
    // ---- band regions between the crossovers (geometric midpoints of neighbouring band frequencies)
    const edges = [20]; for (let i = 0; i < nb - 1; i++) edges.push(Math.sqrt(bands[i].f * bands[i + 1].f)); edges.push(FMX);
    if (regions) bands.forEach((b, i) => { const xa = XF(edges[i]), xb = XF(edges[i + 1]), a = Math.abs(offs[i]) / Math.max(0.01, bandDyn(b, depth).depth);
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgba(cols[i], 0.03 + 0.1 * a)); g.addColorStop(1, rgba(cols[i], 0.02 + 0.06 * a)); ctx.fillStyle = g; ctx.fillRect(xa, y, xb - xa, h); });
    if (regions) for (let i = 1; i < nb; i++) { const X = cr(XF(edges[i])); ctx.setLineDash([2, 3]); ctx.strokeStyle = rgba(S.ink, 0.2); ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X, y + h); ctx.stroke(); ctx.setLineDash([]); }
    // ---- analyzer: PRE (soft fill + hairline), POST = PRE x dynamic curve, peak-hold dots. 1/6-oct bands, cubic through the log axis
    const f = fidx(t);
    if (mode !== 'off') {
      const o6 = D.oct6, u0 = Math.log2(o6[0]), du = (Math.log2(o6[o6.length - 1]) - u0) / (o6.length - 1), nn = o6.length, sp = F.spec[f], hd = F.hold[f];
      const cat = (arr, u) => { const i = clamp(Math.floor(u), 0, nn - 2), s = clamp(u - i, 0, 1), p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(nn - 1, i + 2)];
        return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s * s * s); };
      const tl = (fq) => tilt * Math.log2(fq / 1000), pre = colF.map((fq) => cat(sp, (Math.log2(fq) - u0) / du) + tl(fq)), hl = colF.map((fq) => cat(hd, (Math.log2(fq) - u0) / du) + tl(fq));
      const path = (arr, add) => { ctx.beginPath(); arr.forEach((v, i) => { const Y = Ya(v + (add ? add[i] : 0)); i ? ctx.lineTo(x + i, Y) : ctx.moveTo(x, Y); }); };
      path(pre); ctx.lineTo(x + pw, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = rgba(S.ink, 0.045); ctx.fill();
      path(pre); ctx.strokeStyle = rgba(S.ink, 0.22); ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke();
      if (mode === 'pre-post') { path(pre, dyn.sum); ctx.lineTo(x + pw, y + h); ctx.lineTo(x, y + h); ctx.closePath();
        const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(S.sig1, 0.15)); gr.addColorStop(1, rgba(S.sig1, 0)); ctx.fillStyle = gr; ctx.fill();
        path(pre, dyn.sum); ctx.strokeStyle = rgba(S.ink, 0.6); ctx.stroke(); }
      if (hold > 0) { ctx.fillStyle = rgba(S.ink, 0.5); for (let i = 0; i <= pw; i += 3) ctx.fillRect(x + i, Ya(hl[i] + (mode === 'pre-post' ? dyn.sum[i] : 0)) - 0.5, 1.5, 1.5); }
    }
    // ---- band bodies: from 0 dB to the dynamic band curve (soft), and the gain-reduction area between static and dynamic
    bands.forEach((b, i) => { const a = dyn.per[i], s = stat.per[i];
      ctx.beginPath(); ctx.moveTo(x, Yg(0)); for (let c = 0; c <= pw; c++) ctx.lineTo(x + c, Yg(a[c])); ctx.lineTo(x + pw, Yg(0)); ctx.closePath(); ctx.fillStyle = rgba(cols[i], 0.08); ctx.fill();
      ctx.beginPath(); for (let c = 0; c <= pw; c++) (c ? ctx.lineTo(x + c, Yg(a[c])) : ctx.moveTo(x, Yg(a[c]))); for (let c = pw; c >= 0; c--) ctx.lineTo(x + c, Yg(s[c])); ctx.closePath(); ctx.fillStyle = rgba(cols[i], 0.3); ctx.fill();
      ctx.beginPath(); for (let c = 0; c <= pw; c++) (c ? ctx.lineTo(x + c, Yg(a[c])) : ctx.moveTo(x, Yg(a[c]))); ctx.strokeStyle = rgba(cols[i], 0.7); ctx.lineWidth = 1.1; ctx.stroke(); });
    // ---- static sum (dashed), ghost trail of the dynamic sum, then the dynamic sum itself
    ctx.beginPath(); stat.sum.forEach((v, i) => (i ? ctx.lineTo(x + i, Yg(v)) : ctx.moveTo(x, Yg(v)))); ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(S.ink, 0.38); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    const NG = Math.min(8, Math.round(ghostS * FPS)); ctx.lineJoin = 'round';
    for (let gi = NG; gi >= 1; gi--) { const tt = t - gi / FPS; if (tt < 0) continue; const eg = E.at(tt), gb = bands.map((b) => ({ ...b, g: b.g + dynOffset(b, eg, depth) })), gc = curveOf(gb, 4);
      ctx.beginPath(); let first = true; for (let c = 0; c <= pw; c++) { if (c % 4 && c !== pw) continue; const Y = Yg(gc.sum[c]); first ? ctx.moveTo(x + c, Y) : ctx.lineTo(x + c, Y); first = false; }
      ctx.strokeStyle = rgba(sc, 0.3 * (1 - (gi - 1) / NG) ** 1.5); ctx.lineWidth = 1; ctx.stroke(); }
    ctx.beginPath(); dyn.sum.forEach((v, i) => (i ? ctx.lineTo(x + i, Yg(v)) : ctx.moveTo(x, Yg(v)))); ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(sc, 0.12); ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = sc; ctx.lineWidth = 2.5; ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap = 'butt';
    ctx.restore();   // plot clip
    // ---- nodes on the dynamic band curves; the active band (largest |offset|) is bigger and gets the readout
    let act = -1, best = 0.8; offs.forEach((o, i) => { if (Math.abs(o) > best) { best = Math.abs(o); act = i; } });
    const nodes = bands.map((b, i) => ({ i, X: XF(b.f), Y: Yg(dyn.per[i][clamp(Math.round(XF(b.f) - x), 0, pw)]), b }));
    for (const n of nodes) { const s = n.i === act, e = Math.abs(offs[n.i]) / Math.max(0.01, bandDyn(n.b, depth).depth), R = s ? 7 : 5;
      ctx.strokeStyle = rgba(cols[n.i], 0.55 * e); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.X, n.Y, R + 3 + 6 * e, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = rgba(S.bg, 0.9); ctx.beginPath(); ctx.arc(n.X, n.Y, R + 1.8, 0, 7); ctx.fill(); ctx.fillStyle = cols[n.i]; ctx.beginPath(); ctx.arc(n.X, n.Y, R, 0, 7); ctx.fill();
      if (s) { ctx.strokeStyle = S.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(n.X, n.Y, R + 3.5, 0, 7); ctx.stroke(); ctx.lineWidth = 1; } }
    // ---- readout of the active band only: a glass pill with Hz / note, dB / Q, GR
    if (act >= 0) { const n = nodes[act], b = dynB[act], rows = [`${fmtHz(b.f)} · ${noteName(b.f)}`, `${b.g >= 0 ? '+' : '−'}${Math.abs(b.g).toFixed(1)} dB · GR ${Math.abs(offs[act]).toFixed(1)}`, `Q ${b.q.toFixed(2)}`],
        rh = Math.max(22, L.floorSize(ctx, 16) + 5), bw = 176, bh = 10 + rows.length * rh, avoid = L.avoid || [], hit = (a, q) => a[0] < q[0] + q[2] && q[0] < a[0] + a[2] && a[1] < q[1] + q[3] && q[1] < a[1] + a[3];
      const inPlot = (q) => q[0] >= x && q[1] >= y && q[0] + q[2] <= x + pw && q[1] + q[3] <= y + h, others = nodes.filter((o) => o !== n).map((o) => [o.X - 12, o.Y - 12, 24, 24]);
      // prefer the clear side of the 0 dB line (cuts: above it, boosts: below it), right of the node, then left
      const y0l = Yg(0), qy = n.Y >= y0l - 2 ? y0l - 8 - bh : y0l + 8; let q = null;
      for (const c of [[n.X + 16, qy, bw, bh], [n.X - 16 - bw, qy, bw, bh], [n.X + 16, n.Y - 16 - bh, bw, bh], [n.X - 16 - bw, n.Y + 16, bw, bh]]) if (inPlot(c) && !others.some((o) => hit(c, o)) && !avoid.some((o) => hit(c, o))) { q = c; break; }
      if (!q) q = [clamp(n.X - bw / 2, x, x + pw - bw), clamp(qy, y, y + h - bh), bw, bh];
      ctx.fillStyle = rgba(S.bg, 0.55); ctx.fillRect(q[0], q[1], bw, bh); ctx.strokeStyle = rgba(S.ink, 0.38); ctx.strokeRect(cr(q[0]), cr(q[1]), bw, bh);
      ctx.strokeStyle = rgba(S.ink, 0.12); ctx.beginPath(); ctx.moveTo(q[0] + 1, q[1] + 1.5); ctx.lineTo(q[0] + bw - 1, q[1] + 1.5); ctx.stroke();
      rows.forEach((s, i) => lbl(ctx, S, s, q[0] + 9, q[1] + 5 + rh / 2 + i * rh, { size: 15, a: i === 2 ? 0.7 : 1, maxW: bw - 16 })); }
    // ---- GR meter (the biggest reduction of any band, dB, scale = the EQ range) with a peak-hold tick of the last 0.8 s
    { const gx = x + pw + 42, gw = 5, gr = (tt) => { const ee = E.at(tt); let m = 0; for (const b of bands) m = Math.max(m, -dynOffset(b, ee, depth)); return m; };
      let pk = 0; for (let q = 0; q <= 100; q++) pk = Math.max(pk, gr(Math.max(0, t - q * 0.008)));
      ctx.fillStyle = rgba(S.ink, 0.07); ctx.fillRect(gx, y, gw, h); ctx.fillStyle = rgba(sc, 0.9); ctx.fillRect(gx, y, gw, h * clamp(gr(t) / rg)); ctx.fillStyle = sc; ctx.fillRect(gx - 1, y + h * clamp(pk / rg) - 1, gw + 2, 2); }
    // ---- axis: piano strip (one key per semitone, C keys longer, the active band's key lit), then the frequency ruler
    const py = y + h + 4, ph = 9;
    if (piano) { const litM = act >= 0 ? Math.round(12 * Math.log2(bands[act].f / 440) + 69) : -1;
      for (let mi = 15; mi <= 135; mi++) { const fq = 440 * 2 ** ((mi - 69) / 12), xa = XF(fq * 2 ** (-1 / 24)), xb = XF(fq * 2 ** (1 / 24)); if (xb < x || xa > x + pw) continue;
        const pc = ((mi % 12) + 12) % 12, white = WHITE[pc], lit = mi === litM, X0 = Math.max(x, xa), W = Math.min(x + pw, xb) - X0;
        ctx.fillStyle = lit ? S.hot : rgba(S.ink, white ? (pc === 0 ? 0.62 : 0.4) : 0.14); ctx.fillRect(X0 + 0.3, py, Math.max(0.5, W - 0.6), white ? ph + (pc === 0 ? 2 : 0) : ph - 4); } }
    let lastR = -1e9; for (const [s, fq] of [['20', 20], ['50', 50], ['100', 100], ['200', 200], ['500', 500], ['1k', 1000], ['2k', 2000], ['5k', 5000], ['10k', 10000], ['20k', 20000]]) {
      const X = XF(fq), wl = s.length * 0.62 * L.floorSize(ctx, 15) + 8; if (X - wl / 2 < lastR || X + wl / 2 > x0 + w0) continue; lbl(ctx, S, s, X, py + ph + 14, { size: 15, align: 'center', a: [100, 1000, 10000].includes(fq) ? 0.75 : 0.45 }); lastR = X + wl / 2; }
    ctx.restore();
    return { rg, act, offs, bands: dynB };
  }
  return { draw, bandsAt, noteName };
}
