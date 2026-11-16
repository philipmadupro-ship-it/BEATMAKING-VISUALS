// Brand (ported from u2c-motion film/v8/brand.js): the U2C chain logo threading IN and running OUT link by link on
// the grid (never broken: the pieces never move, a ghost outline always stays), and the elephant pendant hanging from
// ITS OWN chain (mesh-rigged from the art, a pendulum phase-locked to the grid with spring-damped followers).
// Cue-driven: logo mode / cycle length / hero, pendant amplitude per beat (degrees), period in beats.
import { buildChain } from './chainsim.js';
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
  // v12 dwell: a hero logo stays fully threaded for `dwell` beats between an IN and an OUT (period C + dwell, phase offset `off`
  // beats); B.cycleBeat maps the beat to the position inside the plain C-beat cycle, so every step stays on the grid.
  B.cycleBeat = (beat, C = 8, dwell = 0, off = 0) => {
    if (!(dwell > 0)) return (((beat + C / 2) % C) + C) % C;
    const P = C + dwell, p = (((beat + off) % P) + P) % P, u = C / 8;
    return p < C / 2 ? p : p < C / 2 + dwell ? C / 2 - u / 2 : p - dwell;
  };
  B.logoPhase = (t, C = 8, mode = 'cycle', dwell = 0, off = 0) => {
    if (mode === 'full' || mode === 'hero') return [[2, STEPS], [2, STEPS], [2, STEPS]];
    if (mode === 'off') return [[0, 0], [0, 0], [0, 0]];
    const u = C / 8, cb = B.cycleBeat(t / BEAT, C, dwell, off), out = [];
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
  B.logoEvents = (b0, b1, C = 8, dwell = 0, off = 0) => { const ev = [], u = C / 8, P = C + dwell; if (!(dwell > 0)) { off = C / 2; }
    for (let c = Math.floor((b0 + off) / P) - 1; c * P - off < b1; c++) for (let k = 0; k < 3; k++) for (const [ph, nm] of [[k * u, 'IN'], [C / 2 + dwell + k * u, 'OUT']]) for (let q = 0; q < STEPS; q++) { const b = c * P - off + ph + q * u / STEPS; if (b >= b0 - 1e-9 && b < b1) ev.push([b, `logo ${nm} ${'U2C'[k]} link step ${q + 1}`]); } return ev; };
  const SETTLE_T = 0.24, SETTLE_A = 16, SETTLE_W = 2 * Math.PI / 0.2, FALL_T = 0.22, FALL_G = 7000;   // settle duration (s), start height + angular rate (logo px), fall time and gravity (logo px / s^2)
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
    const ph = B.logoPhase(t, o.cycle || 8, o.hero ? 'hero' : o.mode || 'cycle', o.dwell || 0, o.off || 0), solid = [0, 0, 0];
    for (const p of A.links.pieces) { const m = ph[p.k][0]; ctx.globalAlpha = m === 2 ? 0.28 : 0.6; ctx.drawImage(art.edge, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); }
    ctx.globalAlpha = 1;
    // the runner (v9): while a letter is fully in, one lit link travels along U -> 2 -> C, one link per 16th note
    const total = LINKS.reduce((n, Lk) => n + Lk.n, 0), q16 = Math.floor(t / (BEAT / 4) + 1e-6);
    let rk = -1, ri = -1; if (o.runner !== false) { let gi = ((q16 % total) + total) % total; for (let k = 0; k < 3; k++) { if (gi < LINKS[k].n) { rk = k; ri = gi; break; } gi -= LINKS[k].n; } }
    const G = o.glow > 0 ? glowCtx() : null, draws = [];
    // v11 physics on the link steps: a link that threads IN lands with a damped-spring settle (it hangs above its place
    // for the first frame and drops onto it); a link that runs OUT falls under gravity with a little spin. Both start
    // exactly on the step (the grid is unchanged) and last well under a beat.
    const Cc = o.cycle || 8, uu = Cc / 8, cb0 = B.cycleBeat(t / BEAT, Cc, o.dwell || 0, o.off || 0), fx = !o.hero && (o.mode || 'cycle') === 'cycle';
    const linkFx = (k, Lk, mode, i, dx, dy, rotA) => {
      const an = A.links.anchors.filter((a) => a[0] === k)[i]; ctx.save(); ctx.translate(an[1] + dx, an[2] + dy); ctx.rotate(rotA); ctx.translate(-an[1], -an[2]); ctx.clip(Lk.paths[i]);
      for (const p of Lk.ps) ctx.drawImage(art.logo, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); ctx.restore();
    };
    for (let k = 0; k < 3; k++) {
      const [mode, st] = ph[k], Lk = LINKS[k]; const settle = [], fall = [];
      if (fx) for (let i = 0; i < Lk.n; i++) { const sti = Math.floor(i * STEPS / Lk.n) + 1, aIn = (cb0 - (k * uu + (sti - 1) * uu / STEPS)) * BEAT, aOut = (cb0 - (Cc / 2 + k * uu + (sti - 1) * uu / STEPS)) * BEAT;
        if ((mode === 1 || mode === 2) && aIn >= 0 && aIn < SETTLE_T) settle.push([i, aIn]); if ((mode === 3 || mode === 0) && aOut >= 0 && aOut < FALL_T) fall.push([i, aOut]); }
      for (const [i, a] of fall) { const dir = (i + k) % 2 ? 1 : -1; linkFx(k, Lk, mode, i, dir * 14 * a, 0.5 * FALL_G * a * a, dir * 2.2 * a * a); }
      if (mode === 0) continue;
      const nIn = Math.ceil(Lk.n * st / STEPS), mOut = Math.ceil(Lk.n * st / STEPS);
      let clip = mode === 2 ? null : mode === 1 ? Lk.head[nIn] : Lk.tail[Math.min(Lk.n, mOut)];
      if (settle.length) { clip = new Path2D(); const cnt = mode === 1 ? nIn : Lk.n; for (let i = 0; i < cnt; i++) if (!settle.some((e) => e[0] === i)) clip.addPath(Lk.paths[i]); }
      solid[k] = mode === 2 ? 1 : mode === 1 ? nIn / Lk.n : 1 - mOut / Lk.n;
      ctx.save(); if (clip) ctx.clip(clip);
      for (const p of Lk.ps) ctx.drawImage(art.logo, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h);
      ctx.restore();
      for (const [i, a] of settle) linkFx(k, Lk, mode, i, 0, -SETTLE_A * Math.exp(-0.4 * SETTLE_W * a) * Math.cos(SETTLE_W * Math.sqrt(1 - 0.16) * a), 0);
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

  // ---------------------------------------------------------------- ELEPHANT on a rigid-link chain (v11)
  // The pendant hangs from N rigid links held by a hand. chainsim.js simulates the chain (position based dynamics:
  // exact link lengths, gravity, drag, joint friction) at a fixed 1/240 s from a 4-bar pre-roll; the hand pushes on the
  // beat, the wave runs down the links and the pendant, which has mass and lags, lands its extremes on the beats
  // (a per-push pass corrects each push time and size from where its extreme really lands). renderFrame(t) only looks
  // the trajectory up. On top of the in-plane motion: link roll (torsion) and a depth sway of the pendant, glints and motion blur.
  const rot = (p, c, a) => { const s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co]; };
  const P8 = { key: '' };
  const deg = Math.PI / 180, NBt = D.bars * 4;
  const bassRaw = (() => { const raw = [], FPSd = L.FPS, NFd = L.NF;
    for (let k = 0; k < NBt; k++) { let s = 0, n = 0; for (let f = Math.floor(k * BEAT * FPSd); f < Math.min(NFd, (k + 1) * BEAT * FPSd); f++) { s += L.F.bands[f][0] + L.F.bands[f][1]; n++; } raw.push(n ? s / n : 0); }
    const sm = raw.map((_, k) => { let s = 0, n = 0; for (let j = k - 2; j <= k + 1; j++) if (j >= 0 && j < NBt) { s += raw[j]; n++; } return s / n; });
    const p95 = sm.slice().sort((x, y) => x - y)[Math.floor(sm.length * 0.95)] || 1; return sm.map((v) => clamp(v / p95)); })();
  /** Inputs: ampDeg(beatIndex) -> degrees, period (beats), react, chain {links, wave (looseness: low = stiff), damp}. Re-simulates on change. */
  B.pendulum = (ampDeg, period = 2, react = 0.32, chain = {}) => {
    const N = Math.max(3, Math.min(24, Math.round(chain.links || 10))), wave = clamp(chain.wave == null ? 0.75 : chain.wave, 0.05, 1.5), damp = clamp(chain.damp == null ? 0.35 : chain.damp, 0.1, 0.9);
    const amp = []; for (let k = 0; k < NBt; k++) amp.push(ampDeg(k) * (1 - react / 2 + react * bassRaw[k]) * deg); amp.push(amp[amp.length - 1] || 0);
    const key = amp.map((v) => v.toFixed(5)).join(',') + '|' + [period, N, wave, damp].join(',');
    if (key === P8.key) return; P8.key = key; P8.amp = amp; P8.period = period;
    const sim = buildChain({ N, period: Math.max(1, period), BEAT, duration: D.duration, damp, loose: 1.5 - wave, amp, dB: 9, zl: 0.3, mb: 20 });
    const { t0, DT, n, links } = sim, body = links[N + 1];
    // loop / leg springs chase the body angle
    const SP = { H: [3.2, 0.55], TL: [1.55, 0.3], BL: [1.3, 0.32], LEG: [2.1, 0.36] }, st = {}, out = {}, w0 = Math.PI / (period / 2 * BEAT);
    for (const k in SP) { st[k] = [body[0], 0]; out[k] = new Float32Array(n + 1); }
    for (let i = 0; i <= n; i++) { const th = body[i]; for (const k in SP) { const [r, z] = SP[k], w = r * w0, s = st[k]; s[1] += (w * w * (th - s[0]) - 2 * z * w * s[1]) * DT; s[0] += s[1] * DT; out[k][i] = s[0]; } }
    // torsion: each link's roll about its own axis is a damped spring driven by its angular velocity; the pendant's depth sway likewise
    const tw = [], wT = 2 * Math.PI * 2.6, zT = 0.22;
    for (let j = 1; j <= N + 1; j++) { const a = links[j], o = new Float32Array(n + 1); let x = 0, v = 0; const gain = j === N + 1 ? 0.55 : 0.28;
      for (let i = 1; i <= n; i++) { const om = (a[i] - a[i - 1]) / DT; v += (wT * wT * (gain * om - x) - 2 * zT * wT * v) * DT; x += v * DT; o[i] = x; } tw.push(o); }
    Object.assign(P8, { t0, DT, n, sp: out, links, tw, N, wave, damp, sim: sim.info, period });
  };
  const ampAt = (b) => { const Am = P8.amp, k = Math.floor(b), u = b - k, a0 = Am[clamp(k, 0, Am.length - 1)], a1 = Am[clamp(k + 1, 0, Am.length - 1)]; return a0 + (a1 - a0) * (0.5 - 0.5 * Math.cos(Math.PI * u)); };
  const sample = (a, t) => { const x = (t - P8.t0) / P8.DT, i = clamp(Math.floor(x), 0, P8.n - 1), u = x - i; return a[i] + (a[i + 1] - a[i]) * u; };
  const spring = (k, t) => sample(P8.sp[k], t);
  /** Body angle (rad) at time t: the pendant, last body of the chain. */
  B.theta = (t) => sample(P8.links[P8.N + 1], t);
  /** Hand offset (index 0, in link lengths) and every link angle (1..N) at t. */
  B.linkAngles = (t) => { const o = []; for (let j = 0; j <= P8.N; j++) o.push(sample(P8.links[j], t)); return o; };
  B.chainInfo = () => ({ links: P8.N, wave: P8.wave, damp: P8.damp, deltaBeats: 0, deltaFrames: 0, linkHz: 0, bodyHz: 1 / (P8.sim.Tn || 1), swingHz: 1 / (P8.period * BEAT), handLead: 0, ...P8.sim });
  B.swing = (t) => ({ th: B.theta(t), amp: ampAt(t / BEAT), hang: spring('H', t), tl: spring('TL', t), bl: spring('BL', t), leg: spring('LEG', t), yaw: clamp(sample(P8.tw[P8.N], t), -0.6, 0.6) });
  /** Chain geometry: hand at (ax, ay) (+ its push / kick lift), N links of length len/N; returns joints + the pendant pivot. */
  B.chainGeom = (ax, ay, len, t) => {
    const a = B.linkAngles(t), N = P8.N, l = len / N, lift = 0.22 * l * kickEnv[fidx(t)];
    const hx = ax + a[0] * l, hy = ay - lift, pts = [[hx, hy]];
    for (let j = 1; j <= N; j++) { const p = pts[j - 1]; pts.push([p[0] - Math.sin(a[j]) * l, p[1] + Math.cos(a[j]) * l]); }
    return { pts, ang: a, l, end: pts[N] };
  };
  const METAL = { NIGREDO: ['#e4e4e4', '#4a4a4a', '#8e8e8e'], ALBEDO: ['#2a2824', '#8a8478', '#4d4a42'], CITRINITAS: ['#e6ad4a', '#5b3827', '#a8703a'], RUBEDO: ['#d2a6fa', '#4a2268', '#8d54c0'] };
  // kick onsets (s) for the glints that run down the chain
  const KT = D.onsets.kick.map((k) => k[2]).sort((x, y) => x - y), GLINT_T = 0.26;
  /** Glints active at t: [{pos (link index, float), a}] - a spec flash that leaves the hand on each kick and runs down to the pendant. */
  B.glints = (t) => { const o = []; for (let i = KT.length - 1; i >= 0; i--) { const age = t - KT[i]; if (age < 0) continue; if (age > GLINT_T + 0.12) break; o.push({ pos: age / GLINT_T * (P8.N + 1) - 0.5, a: Math.exp(-Math.max(0, age - GLINT_T * 0.5) / 0.07) }); } return o; };
  const LIGHT = [-0.55, -0.835];   // direction TO the light (upper left)
  const INK = { NIGREDO: '#050505', ALBEDO: '#16140f', CITRINITAS: '#1d0f08', RUBEDO: '#12051c' };
  const rr = (ctx, x, y, w, h, r) => { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  /** Draw the links in the style of the pendant art (chunky flat-sided curb links, dark ink outline, bevel light on the lit
   *  sides, short hatching on the shade): alternating face-on rings and edge-on slabs that roll with the chain (tw = roll
   *  per link), lit from one source; glints (B.glints) are soft highlights on the lit edge, clipped to the link. */
  B.drawChain = (ctx, S, g, tw, gl, alpha = 1) => {
    const [hi, lo, md] = METAL[S.name] || METAL.NIGREDO, ink = INK[S.name] || INK.NIGREDO, l = g.l, N = P8.N, white = S.grey ? '#ffffff' : hi;
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round';
    for (let j = 1; j <= N; j++) {
      const p = g.pts[j - 1], q = g.pts[j], cx = (p[0] + q[0]) / 2, cy = (p[1] + q[1]) / 2, a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const roll = (j % 2 === 1 ? 0 : Math.PI / 2) + (tw ? tw[j - 1] * 3 : 0), f = Math.abs(Math.cos(roll)), face = f > 0.42;
      const Lx = l * 1.3, Wy = face ? l * 1.08 * (0.6 + 0.4 * f) : l * 0.42, bar = l * 0.31, ow = Math.max(1.3, l * 0.06), r = Math.min(Wy, Lx) * 0.2;
      let gi = 0; if (gl) for (const e of gl) gi = Math.max(gi, e.a * Math.exp(-((j - 0.5 - e.pos) ** 2) / 1.1));
      const lx = LIGHT[0] * Math.cos(a) + LIGHT[1] * Math.sin(a), ly = -LIGHT[0] * Math.sin(a) + LIGHT[1] * Math.cos(a);   // light in the link's frame
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
      const x0 = -Lx / 2, y0 = -Wy / 2;
      ctx.beginPath(); rr(ctx, x0, y0, Lx, Wy, r); if (face) rr(ctx, x0 + bar, y0 + bar, Lx - 2 * bar, Wy - 2 * bar, r * 0.5);
      ctx.save(); ctx.clip('evenodd');
      ctx.fillStyle = md; ctx.fillRect(x0, y0, Lx, Wy);
      const sy = ly < 0 ? 0 : Wy - bar * 0.55, sx = lx < 0 ? 0 : Lx - bar * 0.55;   // bevel strips on the sides that face the light
      ctx.fillStyle = hi; ctx.globalAlpha = alpha * 0.95; ctx.fillRect(x0, ly < 0 ? y0 : y0 + Wy - bar * 0.5, Lx, bar * 0.5); if (face) ctx.fillRect(lx < 0 ? x0 : x0 + Lx - bar * 0.5, y0, bar * 0.5, Wy);
      ctx.globalAlpha = alpha; ctx.fillStyle = lo; ctx.fillRect(x0, ly < 0 ? y0 + Wy - bar * 0.38 : y0, Lx, bar * 0.38); if (face) ctx.fillRect(lx < 0 ? x0 + Lx - bar * 0.38 : x0, y0, bar * 0.38, Wy);
      ctx.strokeStyle = rgba(ink, 0.55); ctx.lineWidth = Math.max(1, l * 0.035);   // hatching on the shade side
      ctx.beginPath(); const hy = ly < 0 ? y0 + Wy - bar * 0.38 : y0; for (let k = 0; k < 3; k++) { const hx = x0 + Lx * (0.2 + 0.25 * k); ctx.moveTo(hx, hy + (ly < 0 ? bar * 0.38 : 0)); ctx.lineTo(hx + bar * 0.35, hy + (ly < 0 ? 0 : bar * 0.38)); } ctx.stroke();
      void sy; void sx;
      if (gi > 0.04) {   // glint: a soft highlight on the lit edge (no lines), kept inside the link
        const gx = lx < 0 ? x0 + Lx * 0.28 : x0 + Lx * 0.72, gy = ly < 0 ? y0 + Wy * 0.22 : y0 + Wy * 0.78, R = l * (0.3 + 0.4 * gi), gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
        gr.addColorStop(0, rgba(white, 0.95 * gi)); gr.addColorStop(0.4, rgba(white, 0.4 * gi)); gr.addColorStop(1, rgba(white, 0));
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.fillRect(gx - R, gy - R, 2 * R, 2 * R); ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = ow; ctx.beginPath(); rr(ctx, x0, y0, Lx, Wy, r); ctx.stroke();
      if (face) { ctx.lineWidth = ow * 0.8; ctx.beginPath(); rr(ctx, x0 + bar, y0 + bar, Lx - 2 * bar, Wy - 2 * bar, r * 0.5); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
  };
  /** The whole chain at clip time t with motion blur: ghosts at +-0.35 / 0.7 of a frame, their strength scaling with the link speed. */
  B.drawChainFx = (ctx, S, ax, ay, len, t) => {
    const g = B.chainGeom(ax, ay, len, t), tw = P8.tw.slice(0, P8.N).map((a) => sample(a, t)), gl = B.glints(t), fr = 1 / L.FPS;
    let spd = 0; const g1 = B.chainGeom(ax, ay, len, t - 0.35 * fr), g2 = B.chainGeom(ax, ay, len, t + 0.35 * fr);
    for (let j = 1; j < g.pts.length; j++) spd = Math.max(spd, Math.hypot(g2.pts[j][0] - g1.pts[j][0], g2.pts[j][1] - g1.pts[j][1]));
    if (spd > 0.6) { const al = clamp(spd / 18, 0, 0.25); for (const d of [0.7, 0.35]) for (const sg of [-1, 1]) B.drawChain(ctx, S, B.chainGeom(ax, ay, len, t + sg * d * fr), tw, null, al * (d === 0.7 ? 0.5 : 0.8)); }
    B.drawChain(ctx, S, g, tw, gl, 1);
    return g;
  };
  B.tracePts = (ax, ay, size, t, len) => {
    const rg = A.rig, sc = size / rg.w, P = rg.pivot, sw = B.swing(t), g = B.chainGeom(ax, ay, len == null ? size * 0.32 : len, t), bc = rot([345, 316], P, sw.th);
    return { hand: g.pts[0], pivot: g.end, joints: g.pts, links: g.ang, body: [g.end[0] + (bc[0] - P[0]) * sc, g.end[1] + (bc[1] - P[1]) * sc], th: sw.th };
  };
  B.elephant = (ctx, S, ax, ay, size, t, lastLink) => {
    const rg = A.rig, sc = size / rg.w, P = rg.pivot, sw = B.swing(t), img = B.art(S).eleph;
    if (lastLink != null) sw.hang = lastLink;   // the top of the art's own hanger follows the last chain link
    ctx.save(); ctx.translate(ax, ay); ctx.scale(sc * Math.cos(sw.yaw || 0), sc); ctx.translate(-P[0], -P[1]);
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
