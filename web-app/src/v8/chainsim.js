// Chain simulation (v11): a rigid-link chain held by a hand, with a heavy pendant at the end. Position based dynamics
// (PBD, Mueller et al. 2007, "Position Based Dynamics"; small substeps as in Macklin et al. 2019, "Small Steps in
// Physics Simulation"): every link is an exact distance constraint, gravity + drag + joint friction give inertia, lag
// and secondary motion (the chain whips, the pendant lags the hand). Own code, no third-party source.
//
// Deterministic: fixed 1/240 s steps simulated once from a 4-bar pre-roll (t0 < 0, already steady at t = 0) and cached;
// renderFrame(t) only looks the trajectory up. The hand pushes on the beat (expo-out move to alternating sides); the
// pendant's own pendulum period is tuned (gravity scale, found by bisection) so the pendant arrives exactly one
// half period after each push; a per-push pass then corrects each push time / size from where its extreme really
// lands, so every extreme sits on a beat (<= 1 frame) at the cue amplitude. Units: link length 1, seconds.
const TUNE = new Map(), WARM = new Map(), T1C = new Map();
const DT = 1 / 240, SUB = 2, ITERS = 14, ZL = 0.3, MB = 20;     // step, substeps, solver sweeps, push time constant, pendant/link mass
const pushShape = (x) => (1 - Math.exp(-x / ZL)) / (1 - Math.exp(-1 / ZL));

/** One run. P: {N, dB, g, gamma, fr}; hand(t) -> x offset; returns per-step series (hand, link angles 1..N, bob angle) + max stretch. */
function run(P, hand, t0, n, keep) {
  const N = P.N, M = N + 2, x = new Float64Array(M), y = new Float64Array(M), px = new Float64Array(M), py = new Float64Array(M), vx = new Float64Array(M), vy = new Float64Array(M);
  const w = new Float64Array(M).fill(1); w[0] = 0; w[N + 1] = 1 / MB;
  const len = (i) => (i === N + 1 ? P.dB : 1), h = DT / SUB;
  let acc = 0; const h0 = hand(t0), st = Math.sin(P.tilt || 0), ct = Math.cos(P.tilt || 0); for (let i = 0; i < M; i++) { x[i] = h0 - st * acc; y[i] = ct * acc; acc += len(i + 1 < M ? i + 1 : i); }
  const out = keep ? Array.from({ length: N + 2 }, () => new Float32Array(n + 1)) : null, body = new Float32Array(n + 1);
  let stretch = 0;
  const ang = (i) => Math.atan2(-(x[i] - x[i - 1]), y[i] - y[i - 1]);
  for (let s = 0; s <= n; s++) {
    if (s > 0) for (let u = 0; u < SUB; u++) {
      const tt = t0 + (s - 1) * DT + (u + 1) * h, hx = hand(tt);
      vx[0] = (hx - x[0]) / h; vy[0] = 0; x[0] = px[0] = hx;
      for (let i = 1; i < M; i++) { vy[i] += P.g * h; const d = 1 - P.gamma * h; vx[i] *= d; vy[i] *= d; px[i] = x[i] + vx[i] * h; py[i] = y[i] + vy[i] * h; }
      py[0] = y[0];
      for (let k = 0; k < ITERS; k++) {
        const fw = k % 2 === 0;
        for (let q = 1; q < M; q++) {
          const i = fw ? q : M - q, a = i - 1, ww = w[a] + w[i]; let dx = px[i] - px[a], dy = py[i] - py[a]; const d = Math.hypot(dx, dy) || 1e-9, c = (d - len(i)) / (d * ww);
          dx *= c; dy *= c; px[i] -= w[i] * dx; py[i] -= w[i] * dy; if (a > 0) { px[a] += w[a] * dx; py[a] += w[a] * dy; }
        }
      }
      for (let i = 1; i < M; i++) { vx[i] = (px[i] - x[i]) / h; vy[i] = (py[i] - y[i]) / h; x[i] = px[i]; y[i] = py[i]; }
      // joint friction: relative velocity of a link's neighbours is damped (soft bending resistance)
      if (P.fr > 0) for (let i = 1; i <= N; i++) { const k = Math.min(0.5, P.fr * h); vx[i] -= k * (vx[i] - 0.5 * (vx[i - 1] + vx[i + 1])); vy[i] -= k * (vy[i] - 0.5 * (vy[i - 1] + vy[i + 1])); }
    }
    if (out) { out[0][s] = x[0]; for (let j = 1; j <= N + 1; j++) out[j][s] = ang(j); }
    body[s] = ang(N + 1);
    if (s % 8 === 0) for (let i = 1; i <= N; i++) stretch = Math.max(stretch, Math.abs(Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) - 1));
  }
  return { out, body, stretch };
}

/** Signed phase (in half periods) and amplitude of the body's fundamental against the grid, over whole cycles. */
function fundamental(body, t0, HPs, from, cycles) {
  const w = Math.PI / HPs; let a = 0, b = 0, c = 0;
  for (let i = 0; i < body.length; i++) { const t = t0 + i * DT; if (t < from || t >= from + cycles * 2 * HPs) continue; a += body[i] * Math.cos(w * t); b += body[i] * Math.sin(w * t); c++; }
  return { phi: Math.atan2(b, a), amp: 2 * Math.hypot(a, b) / Math.max(1, c) };
}
function peakNear(body, t0, tb, HPs) {
  const i0 = Math.round((tb - t0) / DT), R = Math.round(HPs * 0.45 / DT); let bi = i0, bv = -1;
  for (let i = Math.max(1, i0 - R); i <= Math.min(body.length - 2, i0 + R); i++) if (Math.abs(body[i]) > bv) { bv = Math.abs(body[i]); bi = i; }
  const y0 = Math.abs(body[bi - 1]), y1 = bv, y2 = Math.abs(body[bi + 1]), dd = y0 - 2 * y1 + y2, d = dd ? (y0 - y2) / (2 * dd) : 0;
  return { off: (bi + d - i0) * DT, v: y1 - 0.25 * (y0 - y2) * d };
}

/**
 * opts: {N, period (beats), BEAT, duration (s), damp (zeta of the pendant), loose (joint friction 0..1.5), amp: rad per beat index (array), dB (pendant centre, links)}
 * Returns {t0, DT, n, links (N+2 Float32Array: hand x, link angles 1..N, pendant angle), info}.
 */
export function buildChain(o) {
  const N = o.N, HP = o.period / 2, HPs = HP * o.BEAT, Tdrive = o.period * o.BEAT, dB = o.dB || 9;
  // natural period of the chain + pendant at g = 1 (ring-down from a small tilt; T scales as 1/sqrt(g))
  const T1 = T1C.get(N + ',' + dB) ?? (() => { const r = run({ N, dB, g: 1, gamma: 0, fr: 0, tilt: 0.05 }, () => 0, 0, 30000, false).body, z = []; let armed = false;
    for (let i = 0; i < r.length - 1; i++) { if (r[i] < -0.01) armed = true; if (armed && r[i] <= 0 && r[i + 1] > 0) { z.push(i + -r[i] / (r[i + 1] - r[i])); armed = false; } }
    return z.length > 1 ? (z[z.length - 1] - z[0]) / (z.length - 1) * DT : 25; })();
  T1C.set(N + ',' + dB, T1);
  const params = (r) => { const Tn = r * Tdrive, wn = 2 * Math.PI / Tn; return { N, dB, g: (T1 / Tn) ** 2, gamma: 2 * o.damp * wn, fr: o.loose * 4, Tn }; };
  // steady alternating run (unit hand, delta pushes shifted) -> phase of the body fundamental + amplitude per unit hand
  const steady = (P, delta, flip) => {
    const t0 = -6 * HPs, n = Math.ceil(14 * HPs / DT), T0 = (m) => (m + delta) * HPs;
    const hand = (t) => { let m = Math.floor(t / HPs - delta); const a = flip * ((((m - 1) % 2) + 2) % 2 === 0 ? 1 : -1), b = flip * (((m % 2) + 2) % 2 === 0 ? 1 : -1); return a + (b - a) * pushShape((t - T0(m)) / HPs); };
    const r = run(P, hand, t0, n, false); const f = fundamental(r.body, t0, HPs, t0 + 6 * HPs, 4); let pk = 0; for (let m = 7; m < 13; m++) pk += peakNear(r.body, t0, t0 + m * HPs, HPs).v; return { ...f, pk: pk / 6, stretch: r.stretch };
  };
  // delta (half periods) that puts the body extremes on the grid (even beats positive), and the flip that goes with it
  const solve = (P) => { let delta = 0, flip = 1, f;
    for (let it = 0; it < 4; it++) { f = steady(P, delta, flip); delta += -f.phi / Math.PI; delta = ((delta + 1) % 2 + 2) % 2 - 1; if (Math.abs(f.phi) < 1e-3) break; }
    // fold into (-0.5, 0.5] with a sign flip (a whole push later is the same pattern with the opposite sign)
    if (delta > 0.5) { delta -= 1; flip = -1; } else if (delta <= -0.5) { delta += 1; flip = -1; }
    for (let it = 0; it < 3; it++) { f = steady(P, delta, flip); let e = -f.phi / Math.PI; e = ((e + 1) % 2 + 2) % 2 - 1; if (Math.abs(e) < 2e-3) break; delta += e; }
    return { delta, flip, amp: f.amp, pk: f.pk, stretch: f.stretch }; };
  // tune the pendant's natural period so the pushes land on the beats themselves (delta ~ 0): scan r, refine by bisection (cached per setup)
  const ckey = [N, o.period, o.BEAT, o.damp, o.loose, dB].join(','); let best = TUNE.get(ckey) || null; const cached = !!best;
  if (!best) { const cand = o.cand || [0.4, 0.75, 1.05, 1.4, 1.8, 2.4, 3.2, 4.5];
  for (const r of cand) { const P = params(r), s = solve(P); if (o.debug) console.log("scan", r, s.delta.toFixed(3), s.flip, s.amp.toFixed(4)); if (!best || Math.abs(s.delta) < Math.abs(best.s.delta)) best = { r, P, s }; }
  const bi = cand.indexOf(best.r); let lo = cand[Math.max(0, bi - 1)], hi = cand[Math.min(cand.length - 1, bi + 1)];
  for (let it = 0; it < 5; it++) { const mid = [lo + (hi - lo) / 3, lo + 2 * (hi - lo) / 3]; for (const r of mid) { const P = params(r), s = solve(P); if (Math.abs(s.delta) < Math.abs(best.s.delta)) best = { r, P, s }; } const k = mid.indexOf(best.r); if (k === 0) hi = mid[1]; else if (k === 1) lo = mid[0]; else { lo = mid[0]; hi = mid[1]; } }
  TUNE.set(ckey, best); }
  const P = best.P, flip = best.s.flip; let delta = best.s.delta; const perUnit = best.s.pk || 0.05;
  // per-push calibration over the whole clip
  const amp = o.amp, tgtAmp = (m) => amp[Math.max(0, Math.min(amp.length - 1, Math.round(Math.max(0, m * HP))))] || 0;
  const t0 = -4 * 4 * o.BEAT, end = o.duration + 0.4, n = Math.ceil((end - t0) / DT), m0 = Math.floor(t0 / HPs) - 2, m1 = Math.ceil(end / HPs) + 2;
  const sgn = (m) => flip * (((m % 2) + 2) % 2 === 0 ? 1 : -1), idx = (m) => Math.max(0, Math.min(m1 - m0, m - m0));
  const dl = new Float64Array(m1 - m0 + 1), lv = new Float64Array(m1 - m0 + 1), T0 = (m) => (m + dl[idx(m)]) * HPs;
  const hand = (t) => { let m = Math.floor(t / HPs); while (t < T0(m)) m--; while (t >= T0(m + 1)) m++; const a = lv[idx(m - 1)], b = lv[idx(m)]; return a + (b - a) * pushShape((t - T0(m)) / (T0(m + 1) - T0(m))); };
  // push m lands its extreme at beat (m + J) half periods (J = 0: pushes start just before the beat they land on; 1: a half period earlier)
  const calib = (J, its, cont) => {
    if (cont) { /* keep dl, lv */ } else { if (wm) dl.set(wm.dl); else dl.fill(delta); for (let m = m0; m <= m1; m++) lv[m - m0] = sgn(m) * tgtAmp(m + J) / perUnit; } let err = 0;
    for (let it = 0; it < its; it++) {
      const r = run(P, hand, t0, n, false).body; err = 0;
      for (let m = Math.max(m0, Math.floor(-2 * 4 * o.BEAT / HPs)); m <= m1 - J; m++) { const tb = (m + J) * HPs; if (tb > o.duration + 0.2) break;
        const q = peakNear(r, t0, tb, HPs), want = Math.abs(tgtAmp(m + J)); if (tb > 0) err = Math.max(err, Math.abs(q.off) / DT / 8 * 8 * DT * 30);
        dl[m - m0] = Math.max(delta - 0.35, Math.min(delta + 0.35, dl[m - m0] - q.off / HPs * 0.5)); if (q.v > 1e-6 && want > 1e-6) lv[m - m0] *= Math.max(0.5, Math.min(2, 1 + 0.5 * (want / q.v - 1))); }
      if (o.debug) console.log('J', J, 'it', it, 'worst off (frames @30)', err.toFixed(3));
    }
    return err;
  };
  const wkey = ckey + '|' + m0 + '|' + m1, wm = WARM.get(wkey);
  let J = wm ? wm.J : -delta >= 0.15 ? 0 : 1;
  if (wm) calib(J, 4); else { const e = calib(J, 5); if (e > 0.6) { const J2 = 1 - J, e2 = calib(J2, 5); if (e2 < e) { J = J2; calib(J, 5); } else calib(J, 7); } else calib(J, 3, true); }
  WARM.set(wkey, { J, dl: Float64Array.from(dl) });
  const sim = run(P, hand, t0, n, true);
  let hmax = 0; for (let i = 0; i < sim.out[0].length; i++) hmax = Math.max(hmax, Math.abs(sim.out[0][i]));
  return { t0, DT, n, links: sim.out, info: { r: best.r, Tn: P.Tn ?? best.r * Tdrive, g: P.g, delta, flip, handMax: hmax, stretch: sim.stretch, T1 } };
}
export const CHAIN_DT = DT;
