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
    const col = kind === 'edge' ? S.sig1 : ({ NIGREDO: null, ALBEDO: '#1a1917', CITRINITAS: '#d79a35', RUBEDO: '#c08cf5' })[S.name];
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

  B.load = async (S) => {
    const [logo, edge, eleph] = await Promise.all([loadImg('assets/brand/u2c-links.png'), loadImg('assets/brand/u2c-links-edge.png'), loadImg('assets/brand/elephant.png')]);
    A.logo = tinted(logo, S, 'logo'); A.edge = tinted(edge, S, 'edge'); A.eleph = eleph; A.links = window.U2C_LINKS; A.rig = window.U2C_RIG;
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
  B.swing = (t, S) => {
    const b = t / BEAT, per = S.embodied ? 8 : 4;           // RUBEDO: heavier, two-bar swing
    // amplitude follows the section: drop bars swing full, others at 60 %; blended across each bar with a cosine
    const bar = Math.floor(t / BAR), lab = (i) => (L.labelAt(i) === 'drop' ? 1 : 0.6), u = (t % BAR) / BAR;
    const A0 = lab(bar), A1 = lab(bar + 1), amp = (S.swing * Math.PI / 180) * (A0 + (A1 - A0) * (0.5 - 0.5 * Math.cos(Math.PI * u)));
    const w = 2 * Math.PI / per;
    const th = amp * Math.cos(w * b);                          // extremes land on beats 1 and 3 (or bar 1 / bar 2 in RUBEDO)
    const beta = 0.35 * amp * Math.cos(w * (b - 0.5));         // body lags half a beat
    const jolt = 0.25 * amp * kickEnv[fidx(t)];
    const phi1 = 0.9 * amp * Math.cos(w * (b - 0.75)) + jolt, phi2 = 1.15 * amp * Math.cos(w * (b - 1.0)) - jolt;
    return { th, beta, phi1, phi2, amp };
  };
  // draw: anchor (ax, ay) is where the chain's top is pinned; size = rendered sprite width
  B.elephant = (ctx, S, ax, ay, size, t) => {
    const rg = A.rig, sc = size / rg.w, P = rg.pivot, sw = B.swing(t, S);
    ctx.save(); ctx.translate(ax, ay); ctx.scale(sc, sc); ctx.translate(-P[0], -P[1]);
    if (A.loop) {   // AI loop swapped in: rigid pendulum about the pivot
      const Lp = A.loop, im = Lp.imgs[Math.floor(t * Lp.fps) % Lp.imgs.length];
      ctx.translate(P[0], P[1]); ctx.rotate(sw.th); ctx.translate(-P[0], -P[1]); ctx.drawImage(im, 0, 0, rg.w, rg.h * im.height / im.width * rg.w / rg.w);
      ctx.restore(); return sw;
    }
    const V = rg.verts.map(([vx, vy, wTL, wBL, wBody]) => {
      let p = [vx, vy];
      p = rot(p, rg.cross, sw.phi1 * wTL); p = rot(p, rg.cross, sw.phi2 * wBL); p = rot(p, rg.bail, sw.beta * wBody); p = rot(p, P, sw.th);
      return p;
    });
    const img = A.eleph;
    for (const q of A.quads) for (const tri of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
      const s0 = rg.verts[tri[0]], s1 = rg.verts[tri[1]], s2 = rg.verts[tri[2]], d0 = V[tri[0]], d1 = V[tri[1]], d2 = V[tri[2]];
      // affine map source triangle -> destination triangle
      const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
      const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / den;
      const b_ = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / den;
      const c = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / den;
      const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / den;
      const e = d0[0] - a * s0[0] - c * s0[1], f = d0[1] - b_ * s0[0] - d * s0[1];
      ctx.save();
      // clip to the destination triangle, grown 0.6 px so neighbouring triangles overlap (no hairline seams)
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
