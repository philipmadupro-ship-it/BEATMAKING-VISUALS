// Brand (ported from u2c-motion film/v8/brand.js): the U2C chain logo threading IN and running OUT link by link on
// the grid (never broken: the pieces never move, a ghost outline always stays), and the elephant pendant hanging from
// ITS OWN chain (mesh-rigged from the art, a pendulum phase-locked to the grid with spring-damped followers).
// Cue-driven: logo mode / cycle length / hero, pendant amplitude per beat (degrees), period in beats.
export function createBrand(L, assets) {
  const { D, BEAT, BAR, rgba, hash, hs, clamp, kickEnv, fidx } = L;
  const B = {};
  const A = { links: assets.links, rig: assets.rig, eleph: assets.eleph };

  function tinted(img, S, kind) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const col = kind === 'edge' ? S.sig1 : ({ NIGREDO: '#d6d6d6', ALBEDO: '#1a1917', CITRINITAS: '#d79a35', RUBEDO: '#c08cf5' })[S.name];
    if (col) {
      if (S.name === 'ALBEDO' && kind !== 'edge') {          // ink drawing on paper: solid ink with the metal texture multiplied in
        g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.25; g.drawImage(img, 0, 0); g.globalAlpha = 1;
        g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0);
      } else {
        g.globalCompositeOperation = kind === 'edge' ? 'source-in' : 'color'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0);
      }
    }
    return c;
  }
  function greyscale(img) {   // NIGREDO: luminance-only copy (Rec. 709 weights), alpha kept
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0); const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; const v = Math.min(255, y * 1.12); d[i] = d[i + 1] = d[i + 2] = v; }
    g.putImageData(im, 0, 0); return c;
  }
  // stage-tinted copies, cached per stage + accent colours (a handful at most)
  const TINT = new Map();
  B.art = (S) => {
    const key = [S.name, S.sig1, S.hot, !!S.grey].join('|'); let t = TINT.get(key);
    if (!t) { if (TINT.size > 6) TINT.delete(TINT.keys().next().value);
      t = { logo: tinted(assets.atlas, S, 'logo'), edge: tinted(assets.edge, S, 'edge'), lit: tinted(assets.edge, Object.assign({}, S, { sig1: S.hot }), 'edge'), eleph: S.grey ? (A.grey || (A.grey = greyscale(assets.eleph))) : assets.eleph };
      TINT.set(key, t); }
    return t;
  };
  // which rig quads carry pixels (skip empty ones)
  (function quads() {
    const rg = A.rig, n = rg.n, c = document.createElement('canvas'); c.width = rg.w; c.height = rg.h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(A.eleph, 0, 0);
    const px = g.getImageData(0, 0, rg.w, rg.h).data; A.quads = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const v0 = rg.verts[j * n + i], v1 = rg.verts[(j + 1) * n + i + 1]; let any = false;
      for (let yy = Math.floor(v0[1]); yy < Math.min(rg.h, v1[1]) && !any; yy += 3) for (let xx = Math.floor(v0[0]); xx < Math.min(rg.w, v1[0]); xx += 3) if (px[(yy * rg.w + xx) * 4 + 3] > 8) { any = true; break; }
      if (any) A.quads.push([j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i]);
    }
  })();

  // ---------------------------------------------------------------- LOGO
  // A cycle of C beats (v8: 8 = 2 bars). The clip opens half way through a cycle (OUT bar), so frame 0 shows the whole
  // logo running out. Letter k threads in during [k u, (k+1) u) (u = C/8), its links appearing in chain order in 8 crisp
  // steps, the newest link lit; it runs out over [C/2 + k u, C/2 + (k+1) u). Whole links only, no dither.
  const STEPS = 8;
  B.logoPhase = (t, C = 8, mode = 'cycle') => {
    if (mode === 'full' || mode === 'hero') return [[2, STEPS], [2, STEPS], [2, STEPS]];
    if (mode === 'off') return [[0, 0], [0, 0], [0, 0]];
    const u = C / 8, b = t / BEAT + C / 2, cb = ((b % C) + C) % C, out = [];
    const st = (x) => Math.min(STEPS, Math.floor(x * STEPS + 1e-6) + 1);
    for (let k = 0; k < 3; k++) {
      if (cb >= k * u && cb < (k + 1) * u) out.push([1, st((cb - k * u) / u)]);
      else if (cb >= (k + 1) * u && cb < C / 2 + k * u) out.push([2, STEPS]);
      else if (cb >= C / 2 + k * u && cb < C / 2 + (k + 1) * u) out.push([3, st((cb - C / 2 - k * u) / u)]);
      else out.push([0, 0]);
    }
    return out;
  };
  /** Scheduled link steps between beats b0 and b1 for a cycle of C beats (for the sync test). */
  B.logoEvents = (b0, b1, C = 8) => { const ev = [], u = C / 8; for (let c = Math.floor((b0 + C / 2) / C) - 1; c * C - C / 2 < b1; c++) for (let k = 0; k < 3; k++) for (const [ph, nm] of [[k * u, 'IN'], [C / 2 + k * u, 'OUT']]) for (let q = 0; q < STEPS; q++) { const b = c * C - C / 2 + ph + q * u / STEPS; if (b >= b0 - 1e-9 && b < b1) ev.push([b, `logo ${nm} ${'U2C'[k]} link step ${q + 1}`]); } return ev; };
  let LINKS = null;
  function buildLinks() {   // Voronoi of each letter's link anchors on a 3 px grid -> one Path2D per link (row runs merged)
    LINKS = [];
    for (let k = 0; k < 3; k++) {
      const an = A.links.anchors.filter((a) => a[0] === k), ps = A.links.pieces.filter((p) => p.k === k), cell = 3;
      const x0 = Math.min(...ps.map((p) => p.x)), y0 = Math.min(...ps.map((p) => p.y)), x1 = Math.max(...ps.map((p) => p.x + p.w)), y1 = Math.max(...ps.map((p) => p.y + p.h));
      const paths = an.map(() => new Path2D());
      for (let yy = y0; yy < y1; yy += cell) {
        let run = -1, rx = 0;
        for (let xx = x0; xx <= x1; xx += cell) {
          let best = -1;
          if (xx < x1) { let bd = 1e9; an.forEach((a, i) => { const d = (a[1] - xx - 1.5) ** 2 + (a[2] - yy - 1.5) ** 2; if (d < bd) { bd = d; best = i; } }); }
          if (best !== run) { if (run >= 0) paths[run].rect(rx, yy, xx - rx + 0.4, cell + 0.4); run = best; rx = xx; }
        }
      }
      const head = [new Path2D()], tail = [];
      for (let n = 1; n <= an.length; n++) { const p = new Path2D(head[n - 1]); p.addPath(paths[n - 1]); head.push(p); }
      for (let m = 0; m <= an.length; m++) { const p = new Path2D(); for (let i = m; i < an.length; i++) p.addPath(paths[i]); tail.push(p); }
      LINKS.push({ n: an.length, paths, head, tail, ps });
    }
  }
  B.logo = (ctx, S, r, t, o = {}) => {
    if (!LINKS) buildLinks();
    const art = B.art(S), [x, y, w, h] = r, LW = 887, LH = 647, sc = Math.min((w - 30) / LW, (h - 40) / LH) * (o.scale || 1);
    const kick = kickEnv[fidx(t)], punch = 1 + 0.012 * kick * (o.hero ? 2 : 1);
    ctx.save(); ctx.translate(x + w / 2, y + h / 2 - 8); ctx.scale(sc * punch, sc * punch); ctx.translate(-LW / 2, -LH / 2);
    const ph = B.logoPhase(t, o.cycle || 8, o.hero ? 'hero' : o.mode || 'cycle'), solid = [0, 0, 0];
    for (const p of A.links.pieces) { const m = ph[p.k][0]; ctx.globalAlpha = m === 2 ? 0.28 : 0.6; ctx.drawImage(art.edge, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); }
    ctx.globalAlpha = 1;
    // the runner (v9): while a letter is fully in, one lit link travels along U -> 2 -> C, one link per 16th note
    const total = LINKS.reduce((n, Lk) => n + Lk.n, 0), q16 = Math.floor(t / (BEAT / 4) + 1e-6);
    let rk = -1, ri = -1; if (o.runner !== false) { let gi = ((q16 % total) + total) % total; for (let k = 0; k < 3; k++) { if (gi < LINKS[k].n) { rk = k; ri = gi; break; } gi -= LINKS[k].n; } }
    const G = o.glow > 0 ? glowCtx() : null, draws = [];
    for (let k = 0; k < 3; k++) {
      const [mode, st] = ph[k], Lk = LINKS[k]; if (mode === 0) continue;
      const nIn = Math.ceil(Lk.n * st / STEPS), mOut = Math.ceil(Lk.n * st / STEPS);
      const clip = mode === 2 ? null : mode === 1 ? Lk.head[nIn] : Lk.tail[Math.min(Lk.n, mOut)];
      solid[k] = mode === 2 ? 1 : mode === 1 ? nIn / Lk.n : 1 - mOut / Lk.n;
      ctx.save(); if (clip) ctx.clip(clip);
      for (const p of Lk.ps) ctx.drawImage(art.logo, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h);
      ctx.restore();
      // the link being threaded (IN) or the next to leave (OUT) is lit; a hero moment lights the link on the beat; else the runner
      const lit = mode === 1 ? nIn - 1 : mode === 3 && mOut < Lk.n ? mOut : o.hero ? Math.floor(t / (BEAT / 2)) % Lk.n : mode === 2 && rk === k ? ri : -1;
      if (lit >= 0) { ctx.save(); ctx.clip(Lk.paths[lit]); for (const p of Lk.ps) ctx.drawImage(art.lit, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); ctx.restore(); }
      draws.push([Lk, clip, lit]);
    }
    if (G) drawGlow(ctx, S, art, draws, o.glow, o.bloom || 0);
    ctx.restore();
    return solid;
  };
  // GLOW (v9): the solid links (and, hotter, the lit link) at 1/4 resolution, blurred, added back over the logo.
  // Strength = glow x (rest + kick envelope + drop bloom); the kick envelope decays over 140 ms and the bloom over two
  // beats, so it breathes with the beat and never strobes. Stays grey in NIGREDO; ALBEDO (paper) gets an accent halo.
  const GP = 64, GS = 0.25; let GL = null;
  function glowCtx() { if (!GL) { const mk = () => { const c = document.createElement('canvas'); c.width = Math.ceil((887 + 2 * GP) * GS); c.height = Math.ceil((647 + 2 * GP) * GS); return c; }; GL = { a: mk(), b: mk(), c: mk() }; } return GL; }
  function drawGlow(ctx, S, art, draws, amt, bloom) {
    const g = GL.a.getContext('2d'), W0 = GL.a.width, H0 = GL.a.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W0, H0); g.setTransform(GS, 0, 0, GS, GP * GS, GP * GS);
    for (const [Lk, clip, lit] of draws) {
      g.save(); if (clip) g.clip(clip); for (const p of Lk.ps) g.drawImage(art.logo, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); g.restore();
      if (lit >= 0) for (let r = 0; r < 2; r++) { g.save(); g.clip(Lk.paths[lit]); for (const p of Lk.ps) g.drawImage(art.lit, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); g.restore(); }
    }
    const paper = S.name === 'ALBEDO';
    if (paper || !S.grey) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = paper ? S.hot : S.sig1; g.fillRect(0, 0, W0, H0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    const blur = (dst, r) => { const d = dst.getContext('2d'); d.setTransform(1, 0, 0, 1, 0, 0); d.clearRect(0, 0, W0, H0); d.filter = `blur(${r}px)`; d.drawImage(GL.a, 0, 0); d.filter = 'none'; return dst; };
    const put = (cv, a) => { ctx.save(); ctx.globalCompositeOperation = paper ? 'source-over' : 'lighter'; ctx.globalAlpha = clamp(a); ctx.drawImage(cv, -GP, -GP, cv.width / GS, cv.height / GS); ctx.restore(); };
    put(blur(GL.b, 2.2 + 1.2 * bloom), amt * (paper ? 0.35 : 0.55));
    if (bloom > 0.01) put(blur(GL.c, 7 + 5 * bloom), amt * bloom * (paper ? 0.25 : 0.5));
  }

  // ---------------------------------------------------------------- ELEPHANT on a CHAIN WAVE (v9)
  // The pendant hangs from a chain of N links held by a hand at the top. On every swing beat the hand PUSHES (an
  // expo-out move toward the side the pendant must reach next); the motion travels down the chain link by link as a
  // wave (each link is a critically damped follower of the link above, zeta 0.7, tuned so the whole chain delays the
  // swing by `wave` beats), and the pendant body is a damped pendulum stage (zeta `damp`) at the bottom: it arrives
  // last. Linear and time-invariant, so the phase is solved analytically: the body stage is tuned so that
  // hand push (beat m) -> body extreme (beat m + j·period/2, j = 1 or 2 by the wave length) exactly; a steady-state run measures any residual
  // (integration, harmonics) and shifts the push schedule by it (`P8.delta`, reported in frames) and scales the hand so
  // the body's extremes equal the cue amplitude. Fixed 1/240 s steps from a 4-bar pre-roll: deterministic and
  // already in steady state at frame 0 (seam-clean). Springs for the loops / legs chase the body angle.
  const rot = (p, c, a) => { const s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co]; };
  const P8 = { key: '' };
  const deg = Math.PI / 180, NBt = D.bars * 4;
  const bassRaw = (() => { const raw = [], FPSd = L.FPS, NFd = L.NF;
    for (let k = 0; k < NBt; k++) { let s = 0, n = 0; for (let f = Math.floor(k * BEAT * FPSd); f < Math.min(NFd, (k + 1) * BEAT * FPSd); f++) { s += L.F.bands[f][0] + L.F.bands[f][1]; n++; } raw.push(n ? s / n : 0); }
    const sm = raw.map((_, k) => { let s = 0, n = 0; for (let j = k - 2; j <= k + 1; j++) if (j >= 0 && j < NBt) { s += raw[j]; n++; } return s / n; });
    const p95 = sm.slice().sort((x, y) => x - y)[Math.floor(sm.length * 0.95)] || 1; return sm.map((v) => clamp(v / p95)); })();
  const ZL = 0.7, TAU = 0.12;                          // link damping; hand push time constant (fraction of a half period)
  const pushShape = (x) => (1 - Math.exp(-x / TAU)) / (1 - Math.exp(-1 / TAU));
  // second-order stage x'' = w^2 (in - x) - 2 z w x': phase lag + gain at r = w_drive / w_n
  const lag2 = (r, z) => Math.atan2(2 * z * r, 1 - r * r), gain2 = (r, z) => 1 / Math.hypot(1 - r * r, 2 * z * r);
  const rForLag = (phi, z) => { if (Math.abs(phi - Math.PI / 2) < 1e-6) return 1; const tn = Math.tan(phi), q = Math.sqrt(z * z + tn * tn); return tn > 0 ? (-z + q) / tn : (-z - q) / tn; };
  function design(period, N, wave, damp) {
    const HP = period / 2, w = Math.PI / (HP * BEAT);           // drive: one push per half period (HP beats)
    // fundamental of the steady hand profile (unit level, alternating): delay of its peak after the push, amplitude
    let re = 0, im = 0; const M = 512;
    for (let i = 0; i < 2 * M; i++) { const x = (i % M) / M, sgn = i < M ? 1 : -1, u = sgn * (-1 + 2 * pushShape(x)), ph = Math.PI * i / M; re += u * Math.cos(ph); im += u * Math.sin(ph); }
    re /= M; im /= M; const aH = Math.hypot(re, im), dH = Math.atan2(im, re) / Math.PI * HP;   // beats
    const phiL = Math.min(1.4, Math.PI * wave / HP / N), rL = rForLag(phiL, ZL);
    // the push at m*HP lands its body extreme j half periods later: the smallest j that leaves the body stage a lag in (0.1, 0.9) pi
    let j = 1, phiB = 0; for (; j < 6; j++) { phiB = Math.PI * (j * HP - dH - wave) / HP; if (phiB >= 0.1 * Math.PI) break; }
    phiB = Math.min(phiB, 0.9 * Math.PI);
    const rB = rForLag(phiB, damp);
    return { HP, w, aH, dH, N, j, wn: w / rL, wB: w / rB, damp, gain: aH * Math.pow(gain2(rL, ZL), N) * gain2(rB, damp) };
  }
  // levels(m): hand level reached by push m; delta(m): push m starts at (m + delta(m)) half periods (beats * HP)
  function simulate(P, levels, delta, t0, n, DT, keepAll) {
    const N = P.N, ang = new Float64Array(N + 1), vel = new Float64Array(N + 1), out = keepAll ? Array.from({ length: N + 2 }, () => new Float32Array(n + 1)) : null, body = new Float32Array(n + 1);
    const HPs = P.HP * BEAT, T0 = (m) => (m + delta(m)) * HPs;
    const hand = (t) => { let m = Math.floor(t / HPs); if (t < T0(m)) m--; else if (t >= T0(m + 1)) m++;
      const a = levels(m - 1), b = levels(m); return a + (b - a) * pushShape((t - T0(m)) / (T0(m + 1) - T0(m))); };
    const u0 = hand(t0); ang.fill(u0);
    for (let i = 0; i <= n; i++) {
      const t = t0 + i * DT, h = hand(t);
      for (let j = 0; j <= N; j++) {
        const inp = j === 0 ? h : ang[j - 1], wn = j === N ? P.wB : P.wn, z = j === N ? P.damp : ZL;
        vel[j] += (wn * wn * (inp - ang[j]) - 2 * z * wn * vel[j]) * DT; ang[j] += vel[j] * DT;
      }
      if (out) { out[0][i] = h; for (let j = 0; j <= N; j++) out[j + 1][i] = ang[j]; }
      body[i] = ang[N];
    }
    return { out, body };
  }
  // the body's extreme near landing time tb (search +-0.45 half period): sub-step time offset (s) and |value|
  function peakNear(body, t0, DT, tb, HPs) {
    const i0 = Math.round((tb - t0) / DT), R = Math.round(HPs * 0.45 / DT); let bi = i0, bv = -1;
    for (let i = Math.max(1, i0 - R); i <= Math.min(body.length - 2, i0 + R); i++) if (Math.abs(body[i]) > bv) { bv = Math.abs(body[i]); bi = i; }
    const y0 = Math.abs(body[bi - 1]), y1 = bv, y2 = Math.abs(body[bi + 1]), dd = y0 - 2 * y1 + y2, d = dd ? (y0 - y2) / (2 * dd) : 0;
    return { off: (bi + d - i0) * DT, v: y1 - 0.25 * (y0 - y2) * d };
  }
  /** Inputs: ampDeg(beatIndex) -> degrees, period (beats), react, chain {links, wave (beats), damp}. Re-simulates on change. */
  B.pendulum = (ampDeg, period = 2, react = 0.32, chain = {}) => {
    const N = Math.max(3, Math.min(24, Math.round(chain.links || 10))), wave = clamp(chain.wave == null ? 0.75 : chain.wave, 0.05, period / 2 - 0.1), damp = clamp(chain.damp == null ? 0.35 : chain.damp, 0.1, 0.9);
    const amp = []; for (let k = 0; k < NBt; k++) amp.push(ampDeg(k) * (1 - react / 2 + react * bassRaw[k]) * deg); amp.push(amp[amp.length - 1] || 0);
    const key = amp.map((v) => v.toFixed(5)).join(',') + '|' + [period, N, wave, damp].join(',');
    if (key === P8.key) return; P8.key = key; P8.amp = amp; P8.period = period;
    const P = design(period, N, wave, damp), DT = 1 / 240, HP = P.HP;
    // calibration 1: a steady alternating run (unit target) gives the common offset of the body peaks + their size
    const HPs = HP * BEAT, cal = (delta) => { const t0 = -8 * HPs, n = Math.ceil(16 * HPs / DT); const r = simulate(P, (m) => (((m % 2) + 2) % 2 ? -1 : 1) / P.gain, () => delta, t0, n, DT, false).body;
      let off = 0, pk = 0; for (let m = 2; m < 7; m++) { const q = peakNear(r, t0, DT, m * HPs, HPs); off += q.off; pk += q.v; } return { off: off / 5 / BEAT, pk: pk / 5 }; };
    let delta = 0; for (let it = 0; it < 3; it++) delta -= cal(delta).off;
    const gfix = 1 / (cal(delta).pk || 1);
    // calibration 2 (per push): the push m lands its extreme at (m + j) HP with the sign of that beat and the cue amplitude;
    // amplitude changes leave transients, so each push time and level is corrected from where its extreme actually lands.
    const t0 = -4 * BAR, n = Math.ceil((D.duration + 0.4 - t0) / DT), m0 = Math.floor(t0 / HPs) - 2, m1 = Math.ceil((D.duration + 0.4) / HPs) + 2;
    const tgt = (m) => { const land = (m + P.j) * HP, k = clamp(Math.round(Math.max(0, land)), 0, amp.length - 1); return ((((m + P.j) % 2) + 2) % 2 === 0 ? 1 : -1) * amp[k]; };
    const dl = new Float64Array(m1 - m0 + 1).fill(delta), lv = new Float64Array(m1 - m0 + 1);
    for (let m = m0; m <= m1; m++) lv[m - m0] = tgt(m) * gfix / P.gain;
    const idx = (m) => clamp(m - m0, 0, m1 - m0), levels = (m) => lv[idx(m)], dfun = (m) => dl[idx(m)];
    for (let it = 0; it < 4; it++) {
      const r = simulate(P, levels, dfun, t0, n, DT, false).body;
      for (let m = Math.max(m0, Math.floor(-2 * BAR / HPs)); m <= m1 - P.j; m++) { const tb = (m + P.j) * HPs; if (tb > D.duration + 0.2) break; const q = peakNear(r, t0, DT, tb, HPs), want = Math.abs(tgt(m));
        dl[m - m0] = clamp(dl[m - m0] - q.off / HPs * 0.8, delta - 0.35, delta + 0.35); if (q.v > 1e-6 && want > 1e-6) lv[m - m0] *= clamp(1 + 0.8 * (want / q.v - 1), 0.5, 2); }
    }
    const sim = simulate(P, levels, dfun, t0, n, DT, true);
    // loop / leg springs chase the body angle
    const SP = { H: [3.2, 0.55], TL: [1.55, 0.3], BL: [1.3, 0.32], LEG: [2.1, 0.36] }, st = {}, out = {}, body = sim.body, w0 = P.w;
    for (const k in SP) { st[k] = [body[0], 0]; out[k] = new Float32Array(n + 1); }
    for (let i = 0; i <= n; i++) { const th = body[i]; for (const k in SP) { const [r, z] = SP[k], w = r * w0, s = st[k]; s[1] += (w * w * (th - s[0]) - 2 * z * w * s[1]) * DT; s[0] += s[1] * DT; out[k][i] = s[0]; } }
    Object.assign(P8, { t0, DT, n, sp: out, links: sim.out, N, design: P, delta, gfix, wave, damp });
  };
  const ampAt = (b) => { const Am = P8.amp, k = Math.floor(b), u = b - k, a0 = Am[clamp(k, 0, Am.length - 1)], a1 = Am[clamp(k + 1, 0, Am.length - 1)]; return a0 + (a1 - a0) * (0.5 - 0.5 * Math.cos(Math.PI * u)); };
  const sample = (a, t) => { const x = (t - P8.t0) / P8.DT, i = clamp(Math.floor(x), 0, P8.n - 1), u = x - i; return a[i] + (a[i + 1] - a[i]) * u; };
  const spring = (k, t) => sample(P8.sp[k], t);
  /** Body angle (rad) at time t: the last stage of the chain wave. */
  B.theta = (t) => sample(P8.links[P8.N + 1], t);
  /** Hand angle (index 0) and every link angle (1..N) at t. */
  B.linkAngles = (t) => { const o = []; for (let j = 0; j <= P8.N; j++) o.push(sample(P8.links[j], t)); return o; };
  B.chainInfo = () => ({ links: P8.N, wave: P8.wave, damp: P8.damp, deltaBeats: P8.delta, deltaFrames: P8.delta * BEAT * L.FPS, linkHz: P8.design.wn / (2 * Math.PI), bodyHz: P8.design.wB / (2 * Math.PI), swingHz: P8.design.w / (2 * Math.PI), handLead: P8.design.dH });
  B.swing = (t) => ({ th: B.theta(t), amp: ampAt(t / BEAT), hang: spring('H', t), tl: spring('TL', t), bl: spring('BL', t), leg: spring('LEG', t) });
  /** Chain geometry: hand at (ax, ay) (+ its push / kick lift), N links of length len/N; returns joints + the pendant pivot. */
  B.chainGeom = (ax, ay, len, t) => {
    const a = B.linkAngles(t), N = P8.N, l = len / N, lift = 0.22 * l * kickEnv[fidx(t)];
    const hx = ax - 0.8 * len * Math.sin(a[0]), hy = ay - lift, pts = [[hx, hy]];
    for (let j = 1; j <= N; j++) { const p = pts[j - 1]; pts.push([p[0] - Math.sin(a[j]) * l, p[1] + Math.cos(a[j]) * l]); }
    return { pts, ang: a, l, end: pts[N] };
  };
  const METAL = { NIGREDO: ['#d6d6d6', '#5e5e5e'], ALBEDO: ['#1a1917', '#7d776b'], CITRINITAS: ['#d79a35', '#6e4433'], RUBEDO: ['#c08cf5', '#5a2d78'] };
  /** Draw the chain links (alternating face-on rings and edge-on bars, overlapping like real links). */
  B.drawChain = (ctx, S, g) => {
    const [hi, lo] = METAL[S.name] || METAL.NIGREDO, l = g.l, N = P8.N;
    for (let j = 1; j <= N; j++) {
      const p = g.pts[j - 1], q = g.pts[j], cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2, a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const face = j % 2 === 1, Lx = l * 1.32, Wy = face ? l * 0.62 : l * 0.2, lw = Math.max(1.5, l * 0.17);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      ctx.beginPath(); ctx.roundRect(-Lx / 2, -Wy / 2, Lx, Wy, Wy / 2);
      if (face) { ctx.lineWidth = lw + 2; ctx.strokeStyle = lo; ctx.stroke(); ctx.lineWidth = lw; ctx.strokeStyle = hi; ctx.stroke();
        ctx.lineWidth = Math.max(1, lw * 0.3); ctx.strokeStyle = rgba(S.grey ? '#ffffff' : hi, 0.55); ctx.beginPath(); ctx.moveTo(-Lx * 0.25, -Wy / 2 + lw * 0.1); ctx.lineTo(Lx * 0.2, -Wy / 2 + lw * 0.1); ctx.stroke(); }
      else { ctx.fillStyle = lo; ctx.fill(); ctx.lineWidth = Math.max(1, lw * 0.45); ctx.strokeStyle = hi; ctx.stroke(); }
      ctx.restore();
    }
  };
  B.tracePts = (ax, ay, size, t, len) => {
    const rg = A.rig, sc = size / rg.w, P = rg.pivot, sw = B.swing(t), g = B.chainGeom(ax, ay, len == null ? size * 0.32 : len, t), bc = rot([345, 316], P, sw.th);
    return { hand: g.pts[0], pivot: g.end, joints: g.pts, links: g.ang, body: [g.end[0] + (bc[0] - P[0]) * sc, g.end[1] + (bc[1] - P[1]) * sc], th: sw.th };
  };
  B.elephant = (ctx, S, ax, ay, size, t, lastLink) => {
    const rg = A.rig, sc = size / rg.w, P = rg.pivot, sw = B.swing(t), img = B.art(S).eleph;
    if (lastLink != null) sw.hang = lastLink;   // the top of the art's own hanger follows the last chain link
    ctx.save(); ctx.translate(ax, ay); ctx.scale(sc, sc); ctx.translate(-P[0], -P[1]);
    const sC = clamp((rg.cross[1] - P[1]) / (rg.bail[1] - P[1])), bowC = Math.sin(Math.PI * sC);
    const eTL = 0.55 * (sw.tl - sw.th), eBL = 0.45 * (sw.bl - sw.th), eLeg = 0.6 * (sw.leg - sw.th), bow = sw.hang - sw.th;
    const V = rg.verts.map(([vx, vy, wTL, wBL, , wH, s, wLeg]) => {
      let p = [vx, vy];
      if (wTL > 0) p = rot(p, rg.cross, eTL * wTL);
      if (wBL > 0) p = rot(p, rg.cross, eBL * wBL);
      if (wLeg > 0) p = rot(p, rg.hip, eLeg * wLeg);
      const bw = Math.min(1, wH * Math.sin(Math.PI * s) + (wTL + wBL) * bowC);
      return rot(p, P, sw.th + bow * bw);
    });
    for (const q of A.quads) for (const tri of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
      const s0 = rg.verts[tri[0]], s1 = rg.verts[tri[1]], s2 = rg.verts[tri[2]], d0 = V[tri[0]], d1 = V[tri[1]], d2 = V[tri[2]];
      const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
      const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den;
      const b_ = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den;
      const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den;
      const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den;
      const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b_ * s0[0] - d * s0[1];
      ctx.save();
      const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3, g = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 0.6, p[1] + dy / l * 0.6]; };
      const [e0, e1, e2] = [g(d0), g(d1), g(d2)];
      ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
      ctx.transform(a, b_, c, d, e, f);
      const bx0 = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0])) - 2), by0 = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1])) - 2);
      const bx1 = Math.min(rg.w, Math.ceil(Math.max(s0[0], s1[0], s2[0])) + 2), by1 = Math.min(rg.h, Math.ceil(Math.max(s0[1], s1[1], s2[1])) + 2);
      ctx.drawImage(img, bx0, by0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0);
      ctx.restore();
    }
    ctx.restore();
    return sw;
  };
  return B;
}
