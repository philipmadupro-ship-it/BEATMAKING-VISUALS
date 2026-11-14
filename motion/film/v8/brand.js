/* Brand: the U2C chain logo cycling IN/OUT on the beat forever (never broken: pieces never move, a ghost
 * outline always stays), and the elephant hanging from ITS OWN chain (mesh-rigged from the art, swinging on the
 * grid). Exposes L6.B. */
(function () {
  'use strict';
  const L = window.L6, { D, BEAT, BAR, T, U, rgba, hash, hs, clamp, kickEnv, fidx } = L;
  const B = { ready: null };
  const A = {};
  const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('missing ' + src)); im.src = src; });

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
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
    g.drawImage(img, 0, 0); const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; const v = Math.min(255, y * 1.12); d[i] = d[i + 1] = d[i + 2] = v; }
    g.putImageData(im, 0, 0); return c;
  }
  B.load = async (S) => {
    const [logo, edge, eleph] = await Promise.all([loadImg('assets/brand/u2c-links.png'), loadImg('assets/brand/u2c-links-edge.png'), loadImg('assets/brand/elephant.png')]);
    A.logo = tinted(logo, S, 'logo'); A.edge = tinted(edge, S, 'edge'); A.lit = tinted(edge, Object.assign({}, S, { sig1: S.sig2 === S.ink ? S.hot : S.hot }), 'edge'); A.eleph = S.grey ? greyscale(eleph) : eleph; A.links = window.U2C_LINKS; A.rig = window.U2C_RIG;
    const Lp = window.U2C_ELEPHANT_LOOP;
    if (Lp && Lp.frames && Lp.frames.length) A.loop = { ...Lp, imgs: await Promise.all(Lp.frames.map((f) => loadImg('assets/elephant-loop/' + f))) };
    // which rig quads carry pixels (skip empty ones)
    const rg = A.rig, n = rg.n, c = document.createElement('canvas'); c.width = rg.w; c.height = rg.h; const g = c.getContext('2d'); g.drawImage(eleph, 0, 0);
    const px = g.getImageData(0, 0, rg.w, rg.h).data; A.quads = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const v0 = rg.verts[j * n + i], v1 = rg.verts[(j + 1) * n + i + 1];
      let any = false;
      for (let yy = Math.floor(v0[1]); yy < Math.min(rg.h, v1[1]) && !any; yy += 3) for (let xx = Math.floor(v0[0]); xx < Math.min(rg.w, v1[0]); xx += 3) if (px[(yy * rg.w + xx) * 4 + 3] > 8) { any = true; break; }
      if (any) A.quads.push([j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i]);
    }
  };

  // ---------------------------------------------------------------- LOGO: the chain threads IN and runs OUT, link by link
  // 2-bar cycle (bar 1 = boot: OUT, the drop bar: IN). Letter k threads in during beat k of the IN bar: its links
  // (the anchors traced along each letter's chain) appear in chain order in 8 crisp steps on 32nds, the newest link
  // lit; on the OUT bar the chain runs off in the same order. Whole links only: no dither, no pixel decay, the
  // pieces never move and a ghost outline always stays.
  const STEPS = 8;
  function logoPhase(t) {   // per letter: [mode, step] mode 0 = off, 1 = threading in, 2 = full, 3 = running out
    const b = t / BEAT + 4, cb = ((b % 8) + 8) % 8, out = [];
    for (let k = 0; k < 3; k++) {
      const st = (u) => Math.min(STEPS, Math.floor(u * STEPS + 1e-6) + 1);
      if (cb >= k && cb < k + 1) out.push([1, st(cb - k)]);
      else if (cb >= k + 1 && cb < 4 + k) out.push([2, STEPS]);
      else if (cb >= 4 + k && cb < 5 + k) out.push([3, st(cb - 4 - k)]);
      else out.push([0, 0]);
    }
    return out;
  }
  B.logoEvents = (bars) => { const ev = []; for (let b = 0; b < bars * 4; b++) { const cb = (b + 4) % 8; if (cb < 3) for (let q = 0; q < STEPS; q++) ev.push([b + q / STEPS, `logo IN ${'U2C'[cb]} link step ${q + 1}`]); else if (cb >= 4 && cb < 7) for (let q = 0; q < STEPS; q++) ev.push([b + q / STEPS, `logo OUT ${'U2C'[cb - 4]} link step ${q + 1}`]); } return ev; };
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
      // cumulative unions: first n links / links from m on
      const head = [new Path2D()], tail = [];
      for (let n = 1; n <= an.length; n++) { const p = new Path2D(head[n - 1]); p.addPath(paths[n - 1]); head.push(p); }
      for (let m = 0; m <= an.length; m++) { const p = new Path2D(); for (let i = m; i < an.length; i++) p.addPath(paths[i]); tail.push(p); }
      LINKS.push({ n: an.length, paths, head, tail, ps });
    }
  }
  B.logo = (ctx, S, r, t, o = {}) => {
    if (!LINKS) buildLinks();
    const [x, y, w, h] = r, LW = 887, LH = 647, sc = Math.min((w - 30) / LW, (h - 40) / LH);
    const kick = kickEnv[fidx(t)], punch = 1 + 0.012 * kick;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2 - 8); ctx.scale(sc * punch, sc * punch); ctx.translate(-LW / 2, -LH / 2);
    const ph = logoPhase(t), solid = [0, 0, 0];
    for (const p of A.links.pieces) { const m = ph[p.k][0]; ctx.globalAlpha = m === 2 ? 0.28 : 0.6; ctx.drawImage(A.edge, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); }
    ctx.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      const [mode, st] = ph[k], Lk = LINKS[k]; if (mode === 0) continue;
      const nIn = Math.ceil(Lk.n * st / STEPS), mOut = Math.ceil(Lk.n * st / STEPS);
      const clip = mode === 2 ? null : mode === 1 ? Lk.head[nIn] : Lk.tail[Math.min(Lk.n, mOut)];
      solid[k] = mode === 2 ? 1 : mode === 1 ? nIn / Lk.n : 1 - mOut / Lk.n;
      ctx.save(); if (clip) ctx.clip(clip);
      for (const p of Lk.ps) ctx.drawImage(A.logo, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h);
      ctx.restore();
      // the link being threaded (IN) or the next to leave (OUT) is lit
      const lit = mode === 1 ? nIn - 1 : mode === 3 && mOut < Lk.n ? mOut : -1;
      if (lit >= 0) { ctx.save(); ctx.clip(Lk.paths[lit]); for (const p of Lk.ps) ctx.drawImage(A.lit, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); ctx.restore(); }
    }
    ctx.restore();
    return solid;
  };

  // ---------------------------------------------------------------- ELEPHANT: a pendant held by the top of its own chain
  // Motion design first: the pendant is ONE rigid body hanging from ONE pivot (the hand point = top of its own chain
  // loop). Main motion = a clean pendulum arc about that pivot, phase-locked to the grid: theta = A(t) cos(pi * beat),
  // so one full swing (there and back) takes 2 beats and every beat lands on an extreme, easing through it like a real
  // pendulum. A(t) is set per beat from the section (drop = big) and the bass energy (smoothed over a bar), blended
  // across the beat with a cosine so the arc never jumps. Secondary motion is spring-damped followers of theta: the
  // chain loop between the pivot and the bail bows behind the body, the side loops and the legs trail (overlapping
  // action), and every downbeat adds a tiny settle. Deterministic: fixed 1/240 s springs from a 4-bar pre-roll.
  const rot = (p, c, a) => { const s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co]; };
  const P8 = {};
  const deg = Math.PI / 180;
  B.pendulum = (S) => {
    const NBt = D.bars * 4, FPSd = L.FPS, NFd = L.NF;
    // bass per beat (SUB + LOW band energy), smoothed over a bar, normalised by the clip's 95th percentile
    const raw = [];
    for (let k = 0; k < NBt; k++) { let s = 0, n = 0; for (let f = Math.floor(k * BEAT * FPSd); f < Math.min(NFd, (k + 1) * BEAT * FPSd); f++) { s += L.F.bands[f][0] + L.F.bands[f][1]; n++; } raw.push(n ? s / n : 0); }
    const sm = raw.map((_, k) => { let s = 0, n = 0; for (let j = k - 2; j <= k + 1; j++) if (j >= 0 && j < NBt) { s += raw[j]; n++; } return s / n; });
    const p95 = sm.slice().sort((x, y) => x - y)[Math.floor(sm.length * 0.95)] || 1;
    const sw = S.swingDeg || { drop: 10, calm: 5 };
    P8.amp = sm.map((v, k) => { const drop = L.labelAt(Math.floor(k / 4)) === 'drop'; return (drop ? sw.drop : sw.calm) * (0.84 + 0.32 * clamp(v / p95)) * deg; });
    P8.amp.push(P8.amp[P8.amp.length - 1]);
    // springs (critically shaped by zeta), all chasing the body angle
    const w0 = Math.PI / BEAT, DT = 1 / 240, t0 = -4 * BAR, n = Math.ceil((D.duration + 0.2 - t0) / DT);
    const SP = { H: [3.2, 0.55], TL: [1.55, 0.3], BL: [1.3, 0.32], LEG: [2.1, 0.36] };
    const st = {}, out = {};
    for (const k in SP) { st[k] = [B.theta(t0), 0]; out[k] = new Float32Array(n + 1); }
    for (let i = 0; i <= n; i++) {
      const th = B.theta(t0 + i * DT);
      for (const k in SP) { const [r, z] = SP[k], w = r * w0, s = st[k]; s[1] += (w * w * (th - s[0]) - 2 * z * w * s[1]) * DT; s[0] += s[1] * DT; out[k][i] = s[0]; }
    }
    P8.t0 = t0; P8.DT = DT; P8.n = n; P8.sp = out;
  };
  const ampAt = (b) => { const A = P8.amp, k = Math.floor(b), u = b - k, a0 = A[clamp(k, 0, A.length - 1)], a1 = A[clamp(k + 1, 0, A.length - 1)]; return a0 + (a1 - a0) * (0.5 - 0.5 * Math.cos(Math.PI * u)); };
  // the body angle: main arc + the downbeat settle (a small overshoot past the extreme that dies in ~1/4 beat)
  B.theta = (t) => {
    const b = t / BEAT, A = ampAt(b), main = A * Math.cos(Math.PI * b);
    const kd = Math.floor(b / 4) * 4, u = t - kd * BEAT;
    const settle = 0.07 * ampAt(kd) * Math.exp(-u / 0.085) * Math.sin(2 * Math.PI * u / (BEAT * 0.5)) * (1 - Math.exp(-u / 0.02));
    return main + settle;
  };
  const spring = (k, t) => { const x = (t - P8.t0) / P8.DT, i = clamp(Math.floor(x), 0, P8.n - 1), u = x - i, a = P8.sp[k]; return a[i] + (a[i + 1] - a[i]) * u; };
  B.swing = (t) => {
    const th = B.theta(t), b = t / BEAT;
    return { th, amp: ampAt(b), hang: spring('H', t), tl: spring('TL', t), bl: spring('BL', t), leg: spring('LEG', t) };
  };
  // screen-space trace points (for the motion-trace test): pivot and body centre, given the draw transform
  B.tracePts = (ax, ay, size, t) => { const rg = A.rig, sc = size / rg.w, P = rg.pivot, sw = B.swing(t), bc = rot([345, 316], P, sw.th); return { pivot: [ax, ay], body: [ax + (bc[0] - P[0]) * sc, ay + (bc[1] - P[1]) * sc], th: sw.th }; };
  // draw: anchor (ax, ay) is the pivot (top of the chain, the hand point); size = rendered sprite width
  B.elephant = (ctx, S, ax, ay, size, t) => {
    const rg = A.rig, sc = size / rg.w, P = rg.pivot, sw = B.swing(t);
    ctx.save(); ctx.translate(ax, ay); ctx.scale(sc, sc); ctx.translate(-P[0], -P[1]);
    if (A.loop) {   // AI loop swapped in: rigid pendulum about the pivot
      const Lp = A.loop, im = Lp.imgs[Math.floor(t * Lp.fps) % Lp.imgs.length];
      ctx.translate(P[0], P[1]); ctx.rotate(sw.th); ctx.translate(-P[0], -P[1]); ctx.drawImage(im, 0, 0, rg.w, rg.h * im.height / im.width);
      ctx.restore(); return sw;
    }
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
    const img = A.eleph;
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

  window.L6.B = B;
})();
