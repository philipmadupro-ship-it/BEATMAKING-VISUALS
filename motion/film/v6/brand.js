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
    A.logo = tinted(logo, S, 'logo'); A.edge = tinted(edge, S, 'edge'); A.eleph = S.grey ? greyscale(eleph) : eleph; A.links = window.U2C_LINKS; A.rig = window.U2C_RIG;
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

  // ---------------------------------------------------------------- LOGO: 2-bar cycle, letters step IN on beats 1-2-3, OUT on beats 5-6-7
  // each letter resolves in 4 block-steps on 16ths; returns solid amount 0, .25, .5, .75, 1 per letter
  function logoState(t) {
    const b = t / BEAT + 4, cb = ((b % 8) + 8) % 8, s = [0, 0, 0];   // bar 1 (boot) chains OUT, the drop bar chains IN
    for (let k = 0; k < 3; k++) {
      const q = (u) => Math.min(4, Math.floor(u * 4 + 1e-6) + 1) / 4;
      if (cb >= k && cb < k + 1) s[k] = q(cb - k);
      else if (cb >= k + 1 && cb < 4 + k) s[k] = 1;
      else if (cb >= 4 + k && cb < 5 + k) s[k] = 1 - q(cb - 4 - k);
      else s[k] = 0;
    }
    return s;
  }
  B.logoEvents = (bars) => { const ev = []; for (let b = 0; b < bars * 4; b++) { const cb = (b + 4) % 8; if (cb < 3) for (let q = 0; q < 4; q++) ev.push([b + q / 4, `logo IN ${'U2C'[cb]} step ${q + 1}`]); else if (cb >= 4 && cb < 7) for (let q = 0; q < 4; q++) ev.push([b + q / 4, `logo OUT ${'U2C'[cb - 4]} step ${q + 1}`]); } return ev; };
  const maskCache = new Map();
  function mask(k, s) {
    const key = k + ':' + s; if (maskCache.has(key)) return maskCache.get(key);
    const ps = A.links.pieces.filter((p) => p.k === k), cell = 10;
    const x0 = Math.min(...ps.map((p) => p.x)), y0 = Math.min(...ps.map((p) => p.y)), x1 = Math.max(...ps.map((p) => p.x + p.w)), y1 = Math.max(...ps.map((p) => p.y + p.h));
    const solid = new Path2D(), edge = [];
    for (let yy = y0; yy < y1; yy += cell) for (let xx = x0; xx < x1; xx += cell) {
      const n = 0.5 * hash(xx * 0.37 + k * 31 + yy * 0.53) + 0.5 * (1 - (yy - y0) / (y1 - y0));  // bottom-up chain-in, block noise
      if (n < s - 1e-6) solid.rect(xx, yy, cell + 0.5, cell + 0.5); else if (n < s + 0.07) edge.push([xx, yy]);
    }
    const o = { solid, edge, ps }; maskCache.set(key, o); return o;
  }
  B.logo = (ctx, S, r, t) => {
    const [x, y, w, h] = r, LW = 887, LH = 647, sc = Math.min((w - 30) / LW, (h - 40) / LH);
    const kick = kickEnv[fidx(t)], punch = 1 + 0.01 * kick;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2 - 8); ctx.scale(sc * punch, sc * punch); ctx.translate(-LW / 2, -LH / 2);
    const s = logoState(t);
    for (const p of A.links.pieces) { ctx.globalAlpha = s[p.k] >= 1 ? 0.3 : 0.62; ctx.drawImage(A.edge, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h); }
    ctx.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      if (s[k] <= 0) continue;
      const m = mask(k, s[k]);
      ctx.save(); if (s[k] < 1) ctx.clip(m.solid);
      for (const p of m.ps) ctx.drawImage(A.logo, p.ax, p.ay, p.aw, p.ah, p.x, p.y, p.w, p.h);
      ctx.restore();
      if (s[k] < 1) { ctx.fillStyle = S.sig2; for (const [ex, ey] of m.edge) if (m.ps.some((p) => ex + 5 >= p.x && ex + 5 <= p.x + p.w && ey + 5 >= p.y && ey + 5 <= p.y + p.h)) ctx.fillRect(ex + 1, ey + 1, 8, 8); }
    }
    ctx.restore();
    return s;
  };

  // ---------------------------------------------------------------- ELEPHANT on its own chain
  const rot = (p, c, a) => { const s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co]; };
  // ---------------------------------------------------------------- PENDANT PHYSICS (held in a hand)
  // A kinematic "hand" holds the top of the elephant's own chain. The chain is a verlet rope (gravity, damping,
  // length constraints) down to the bail; the body is a heavy particle rigidly hung below the bail; the two side
  // loops are lagging secondary pendulums hung from the rope at the crossing. The hand flicks ON THE BEAT
  // (downbeat strongest, beat 3 medium, 2 and 4 light), alternating direction, so the swing phase-locks to the tempo.
  // Gravity is calibrated so the free pendulum's natural period = 2 beats. Fixed 1/240 s step, simulated once from
  // a 16-bar pre-roll (steady state at frame 0), sampled per frame. Units: art pixels.
  const SIM = {};
  B.simulate = (S) => {
    const rg = A.rig, P0 = rg.pivot, BL = rg.bail, N = 8, DT = 1 / 240;
    const seg = Math.hypot(BL[0] - P0[0], BL[1] - P0[1]) / N, bodyL = 183, loopTL = 110, loopBL = 230;
    const heavy = S.embodied, damp = heavy ? 0.42 : 0.55, mBody = heavy ? 18 : 12;
    const kc = Math.round(N * (rg.cross[1] - P0[1]) / (BL[1] - P0[1]));     // rope index nearest the crossing
    const amp = { 0: 1.0, 1: 0.45, 2: 0.7, 3: 0.45 }, A0 = heavy ? 26 : 20;
    const handX = (t) => {   // sum of beat flicks: smooth 0 -> peak -> 0 bumps (0.16 s), alternating sign each beat
      const k0 = Math.floor(t / BEAT); let x = 0;
      for (let k = k0 - 1; k <= k0; k++) { const u = (t - k * BEAT) / 0.16; if (u < 0 || u > 1) continue; x += (k % 2 === 0 ? 1 : -1) * amp[((k % 4) + 4) % 4] * A0 * Math.sin(Math.PI * u) ** 2; }
      return x;
    };
    const handY = (t) => { const u = (t % BEAT) / 0.12; return u < 1 ? -3 * Math.sin(Math.PI * u) : 0; };   // a small lift on every beat
    function run(g, t0, t1, forced, record, kick0) {
      const n = N + 1, x = [], px = [];
      for (let i = 0; i < n; i++) { const p = [P0[0] + (BL[0] - P0[0]) * i / N, P0[1] + (BL[1] - P0[1]) * i / N]; x.push(p); px.push(p.slice()); }
      const C = [BL[0], BL[1] + bodyL], pC = C.slice();
      if (kick0) { for (let i = 1; i < n; i++) { x[i][0] += kick0 * i / N; px[i][0] += kick0 * i / N; } C[0] += kick0 * 1.6; pC[0] += kick0 * 1.6; }
      let lt = 0, lv = 0, bt = 0, bv = 0;             // loop sway angles (secondary, about the crossing)
      let prevA = 0, prevAv = 0;
      const out = [];
      const steps = Math.round((t1 - t0) / DT);
      for (let s = 0; s <= steps; s++) {
        const t = t0 + s * DT;
        const hx = forced ? handX(t) : 0, hy = forced ? handY(t) : 0;
        // integrate
        for (let i = 1; i < n; i++) { const vx = (x[i][0] - px[i][0]) * (1 - damp * DT), vy = (x[i][1] - px[i][1]) * (1 - damp * DT); px[i] = x[i].slice(); x[i][0] += vx; x[i][1] += vy + g * DT * DT; }
        { const vx = (C[0] - pC[0]) * (1 - damp * DT), vy = (C[1] - pC[1]) * (1 - damp * DT); pC[0] = C[0]; pC[1] = C[1]; C[0] += vx; C[1] += vy + g * DT * DT; }
        x[0] = [P0[0] + hx, P0[1] + hy]; px[0] = x[0].slice();
        // constraints (mass-weighted), 12 iterations
        for (let it = 0; it < 12; it++) {
          for (let i = 0; i < N; i++) {
            const a = x[i], b = x[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-9, e = (d - seg) / d;
            if (i === 0) { b[0] -= dx * e; b[1] -= dy * e; } else { a[0] += dx * e * 0.5; a[1] += dy * e * 0.5; b[0] -= dx * e * 0.5; b[1] -= dy * e * 0.5; }
          }
          const b = x[N], dx = C[0] - b[0], dy = C[1] - b[1], d = Math.hypot(dx, dy) || 1e-9, e = (d - bodyL) / d;
          b[0] += dx * e * (mBody / (1 + mBody)); b[1] += dy * e * (mBody / (1 + mBody)); C[0] -= dx * e * (1 / (1 + mBody)); C[1] -= dy * e * (1 / (1 + mBody));
        }
        // secondary loops: angular springs driven by the rope's angular acceleration at the crossing
        const xc = x[kc], xp = x[Math.max(0, kc - 1)], ang = Math.atan2(xc[0] - xp[0], xc[1] - xp[1]);
        const av = (ang - prevA) / DT, aa = (av - prevAv) / DT; prevA = ang; prevAv = av;
        const wl = 2 * Math.PI / (BEAT * 0.9), wb = 2 * Math.PI / (BEAT * 1.4);
        lv += (-wl * wl * lt - 3.0 * lv - 0.9 * aa) * DT; lt += lv * DT;
        bv += (-wb * wb * bt - 2.2 * bv - 1.2 * aa) * DT; bt += bv * DT;
        if (record) { const f = Math.round(t * L.FPS * 1e6) / 1e6; if (Math.abs(f - Math.round(f)) < 1e-6 && t >= 0) out[Math.round(f)] = { rope: x.map((p) => p.slice()), C: C.slice(), lt, bt, hand: [hx, hy] }; }
        else if (s % 4 === 0) out.push(C[0] - x[0][0]);
      }
      return out;
    }
    // calibrate gravity: natural period of the free compound pendulum = 2 beats
    const target = 2 * BEAT; let g = 4 * Math.PI * Math.PI * (seg * N + bodyL) / (target * target);
    for (let it = 0; it < 4; it++) {
      const tr = run(g, 0, 6 * target, false, false, 18), zc = [];
      for (let i = 1; i < tr.length; i++) if ((tr[i - 1] < 0) !== (tr[i] < 0)) zc.push(i * 4 * DT);
      if (zc.length < 3) break;
      const Tm = 2 * (zc[zc.length - 1] - zc[0]) / (zc.length - 1);
      g *= (Tm / target) ** 2;
    }
    SIM.g = g;
    SIM.frames = run(g, -16 * BAR, D.duration + 0.1, true, true, 0);   // 16-bar pre-roll: steady state at frame 0
    SIM.rest = { seg, N, kc, bodyL };
  };
  const sinA = (a, o) => [o[0] * Math.cos(a) - o[1] * Math.sin(a), o[0] * Math.sin(a) + o[1] * Math.cos(a)];
  B.pose = (t) => { const f = Math.max(0, Math.min(L.NF - 1, Math.floor(t * L.FPS + 1e-6))); return SIM.frames[f] || SIM.frames[SIM.frames.length - 1]; };
  B.swing = (t) => {   // readouts: body angle (deg), rope angle, hand offset
    const p = B.pose(t), b = p.rope[p.rope.length - 1];
    return { th: Math.atan2(p.C[0] - b[0], p.C[1] - b[1]), rope: Math.atan2(p.rope[1][0] - p.rope[0][0], p.rope[1][1] - p.rope[0][1]), hand: p.hand, amp: 0.2 };
  };
  // draw: (ax, ay) = where the hand holds the chain on screen; size = rendered sprite width
  B.elephant = (ctx, S, ax, ay, size, t) => {
    const rg = A.rig, sc = size / rg.w, P = rg.pivot, pose = B.pose(t), R = pose.rope, N = R.length - 1;
    const bodyAng = -Math.atan2(pose.C[0] - R[N][0], pose.C[1] - R[N][1]);
    ctx.save(); ctx.translate(ax, ay); ctx.scale(sc, sc); ctx.translate(-P[0], -P[1]);
    if (A.loop) {
      const Lp = A.loop, im = Lp.imgs[Math.floor(t * Lp.fps) % Lp.imgs.length];
      ctx.translate(R[N][0], R[N][1]); ctx.rotate(bodyAng); ctx.translate(-rg.bail[0], -rg.bail[1]); ctx.drawImage(im, 0, 0, rg.w, rg.w * im.height / im.width);
      ctx.restore(); return B.swing(t);
    }
    const ropeAt = (u) => { const q = Math.max(0, Math.min(N - 1e-6, u * N)), i = Math.floor(q), k = q - i, a = R[i], b = R[i + 1];
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], ang: -Math.atan2(b[0] - a[0], b[1] - a[1]) }; };
    const P0 = rg.pivot, BL = rg.bail, restAng = -Math.atan2(BL[0] - P0[0], BL[1] - P0[1]);
    const uc = (rg.cross[1] - P0[1]) / (BL[1] - P0[1]), X = ropeAt(uc), restX = [P0[0] + (BL[0] - P0[0]) * uc, P0[1] + (BL[1] - P0[1]) * uc];
    const oc = sinA(X.ang - restAng, [rg.cross[0] - restX[0], rg.cross[1] - restX[1]]), anc = [X.p[0] + oc[0], X.p[1] + oc[1]];   // the crossing rides the rope
    const V = rg.verts.map(([vx, vy, wTL, wBL, wBody]) => {
      const wR = Math.max(0, 1 - wTL - wBL - wBody);
      // body: rigid about the simulated bail
      const ob = sinA(bodyAng, [vx - BL[0], vy - BL[1]]), pB = [R[N][0] + ob[0], R[N][1] + ob[1]];
      // rope (hanger loop): skinned to the rope point at the same height, rotated with the local tangent
      const u = Math.max(0, Math.min(1, (vy - P0[1]) / (BL[1] - P0[1]))), rp = ropeAt(u), r0 = [P0[0] + (BL[0] - P0[0]) * u, P0[1] + (BL[1] - P0[1]) * u];
      const orp = sinA(rp.ang - restAng, [vx - r0[0], vy - r0[1]]), pR = [rp.p[0] + orp[0], rp.p[1] + orp[1]];
      // loops: hung from the crossing, rope tangent + their own lagging sway
      const oT = sinA(X.ang - restAng + pose.lt, [vx - rg.cross[0], vy - rg.cross[1]]), pT = [anc[0] + oT[0], anc[1] + oT[1]];
      const oL = sinA(X.ang - restAng + pose.bt, [vx - rg.cross[0], vy - rg.cross[1]]), pL = [anc[0] + oL[0], anc[1] + oL[1]];
      const ws = wBody + wR + wTL + wBL || 1;
      return [(pB[0] * wBody + pR[0] * wR + pT[0] * wTL + pL[0] * wBL) / ws, (pB[1] * wBody + pR[1] * wR + pT[1] * wTL + pL[1] * wBL) / ws];
    });
    drawMesh(ctx, rg, V);
    ctx.restore();
    // the hand's grip point on screen (for the pin / tape)
    return { ...B.swing(t), grip: [ax + (R[0][0] - P[0]) * sc, ay + (R[0][1] - P[1]) * sc] };
  };
  function drawMesh(ctx, rg, V) {
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
      const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3, gr = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 0.6, p[1] + dy / l * 0.6]; };
      const [e0, e1, e2] = [gr(d0), gr(d1), gr(d2)];
      ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]); ctx.closePath(); ctx.clip();
      ctx.transform(a, b_, c, d, e, f);
      const bx0 = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0])) - 2), by0 = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1])) - 2);
      const bx1 = Math.min(rg.w, Math.ceil(Math.max(s0[0], s1[0], s2[0])) + 2), by1 = Math.min(rg.h, Math.ceil(Math.max(s0[1], s1[1], s2[1])) + 2);
      ctx.drawImage(img, bx0, by0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0);
      ctx.restore();
    }
  }

  window.L6.B = B;
})();
