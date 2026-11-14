/* DIY LAB kit: graph paper, tape, staples, stencil labels, handwriting with grid-locked boil, wobbly arrows,
 * rubber stamps, crossed-out readings, dimension callouts, specimen tags, lab cards. No opacity animation:
 * everything appears in counted steps supplied by the caller. Exposes L6.lab. */
(function () {
  'use strict';
  const { rgba, mix, font, text, hs, hash, clamp, T, U, MONO, HAND, SANS } = window.L6;

  function graphPaper(ctx, x, y, w, h, S, minor = 10, major = 50, a = 1) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(S.rule, S.gridA * 0.55 * a); ctx.beginPath();
    for (let gx = Math.ceil(x / minor) * minor; gx <= x + w; gx += minor) if (gx % major) { ctx.moveTo(gx + 0.5, y); ctx.lineTo(gx + 0.5, y + h); }
    for (let gy = Math.ceil(y / minor) * minor; gy <= y + h; gy += minor) if (gy % major) { ctx.moveTo(x, gy + 0.5); ctx.lineTo(x + w, gy + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = rgba(S.rule, S.gridA * 1.6 * a); ctx.beginPath();
    for (let gx = Math.ceil(x / major) * major; gx <= x + w; gx += major) { ctx.moveTo(gx + 0.5, y); ctx.lineTo(gx + 0.5, y + h); }
    for (let gy = Math.ceil(y / major) * major; gy <= y + h; gy += major) { ctx.moveTo(x, gy + 0.5); ctx.lineTo(x + w, gy + 0.5); }
    ctx.stroke();
  }

  // masking tape: torn zig-zag ends, slight skew, fibre lines
  function tape(ctx, cx, cy, w, h, ang, S, seed) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    for (let i = 0; i <= 6; i++) ctx.lineTo(w / 2 + (i % 2 ? 3 : -1) + hs(seed + i, 1) * 1.5, -h / 2 + h * i / 6);
    ctx.lineTo(-w / 2, h / 2);
    for (let i = 6; i >= 0; i--) ctx.lineTo(-w / 2 + (i % 2 ? -3 : 1) + hs(seed + i, 2) * 1.5, -h / 2 + h * i / 6);
    ctx.closePath(); ctx.fillStyle = rgba(S.tape, S.tapeA); ctx.fill();
    ctx.strokeStyle = rgba(S.ink, 0.06); ctx.beginPath();
    for (let i = 1; i < 4; i++) { const yy = -h / 2 + h * i / 4 + hs(seed, i) * 2; ctx.moveTo(-w / 2, yy); ctx.lineTo(w / 2, yy); }
    ctx.stroke(); ctx.restore();
  }
  function staple(ctx, x, y, ang, S) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = rgba(S.ink, 0.75); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(9, -2); ctx.stroke();
    ctx.strokeStyle = rgba(S.bg, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, 1.5); ctx.lineTo(8, 1.5); ctx.stroke();
    ctx.restore(); ctx.lineWidth = 1;
  }

  // stencil caps: bold mono with bridges cut through every glyph (cached offscreen)
  const stCache = new Map();
  function stencil(ctx, str, x, y, size, col, align = 'left') {
    const key = str + '|' + size + '|' + col;
    let c = stCache.get(key);
    if (!c) {
      c = document.createElement('canvas'); const g = c.getContext('2d');
      font(g, size, MONO, 800); g.letterSpacing = (size * 0.12) + 'px';
      const w = Math.ceil(g.measureText(str).width) + 8; c.width = w; c.height = Math.ceil(size * 1.4);
      font(g, size, MONO, 800); g.letterSpacing = (size * 0.12) + 'px'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(str, 2, c.height / 2);
      // stencil bridges: a horizontal cut through every glyph with a closed counter (how real stencils hold the islands)
      g.globalCompositeOperation = 'destination-out';
      const cw = g.measureText('M').width / 1 + 0;
      let px = 2;
      for (const ch of str) {
        const w1 = g.measureText(ch).width;
        if ('ABDOPQR04689'.includes(ch)) g.fillRect(px + w1 * 0.08, c.height / 2 - size * 0.05, w1 * 0.7, size * 0.1);
        px += w1 + size * 0.12;
      }
      stCache.set(key, c);
    }
    const dx = align === 'right' ? x - c.width : align === 'center' ? x - c.width / 2 : x;
    ctx.drawImage(c, Math.round(dx), Math.round(y - c.height / 2));
    return c.width;
  }

  // handwriting: Caveat, re-posed every 16th note (boil locked to the grid)
  function hand(ctx, s, x, y, size, col, t, seed, rot = -0.03, align = 'left') {
    const k = Math.floor(t / T(U.s16));
    ctx.save(); ctx.translate(x + hs(seed, k) * 0.7, y + hs(seed + 3, k) * 0.7); ctx.rotate(rot + hs(seed + 7, k) * 0.012);
    const w = text(ctx, s, 0, 0, { size, fam: HAND, w: 700, col, align, base: 'alphabetic' });
    ctx.restore(); return w;
  }
  // wobbly hand arrow through pts; `n` of 4 pen segments visible (stepped draw-on); boil on the 16th grid
  function arrow(ctx, pts, col, t, seed, n = 4, width = 2.2, head = true) {
    if (n <= 0) return;
    const k = Math.floor(t / T(U.s16));
    const P = []; const N = 24;
    for (let i = 0; i <= N; i++) {
      const u = i / N, seg = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1))), lu = u * (pts.length - 1) - seg;
      const a = pts[seg], b = pts[seg + 1];
      // quadratic smoothing via midpoint bias
      P.push([a[0] + (b[0] - a[0]) * lu + hs(seed + i, k) * 1.2, a[1] + (b[1] - a[1]) * lu + hs(seed + i + 50, k) * 1.2]);
    }
    const upto = Math.round(N * n / 4);
    ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); for (let i = 0; i <= upto; i++) (i ? ctx.lineTo(P[i][0], P[i][1]) : ctx.moveTo(P[i][0], P[i][1])); ctx.stroke();
    if (head && n >= 4) {
      const [x2, y2] = P[N], [x1, y1] = P[N - 2], an = Math.atan2(y2 - y1, x2 - x1), L = 11;
      ctx.beginPath(); ctx.moveTo(x2 - Math.cos(an - 0.45) * L, y2 - Math.sin(an - 0.45) * L); ctx.lineTo(x2, y2); ctx.lineTo(x2 - Math.cos(an + 0.5) * L * 0.9, y2 - Math.sin(an + 0.5) * L * 0.9); ctx.stroke();
    }
    ctx.lineWidth = 1; ctx.lineCap = 'butt';
  }
  // circle a value by hand (stepped: 4 quarter arcs)
  function ring(ctx, cx, cy, rx, ry, col, t, seed, n = 4) {
    const k = Math.floor(t / T(U.s16)); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    const end = Math.PI * 2 * 1.08 * n / 4;
    for (let a = 0, i = 0; a <= end; a += 0.15, i++) { const r = 1 + hs(seed + i, k) * 0.04; const X = cx + Math.cos(a - 1) * rx * r, Y = cy + Math.sin(a - 1) * ry * r; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke(); ctx.lineWidth = 1;
  }
  // rubber stamp with distressed ink (cached)
  const stampCache = new Map();
  function stamp(ctx, lines, x, y, rot, col, size = 16) {
    const key = lines.join('/') + col + size;
    let c = stampCache.get(key);
    if (!c) {
      c = document.createElement('canvas'); const g = c.getContext('2d');
      font(g, size, MONO, 800); g.letterSpacing = '2px';
      const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 28, h = lines.length * size * 1.35 + 18;
      c.width = Math.ceil(w); c.height = Math.ceil(h);
      g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); g.lineWidth = 1; g.strokeRect(8, 8, w - 16, h - 16);
      font(g, size, MONO, 800); g.letterSpacing = '2px'; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, i) => g.fillText(l, w / 2, 9 + size * 0.7 + i * size * 1.35));
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < w * h / 26; i++) { const px = hash(i * 1.3 + size) * w, py = hash(i * 2.7 + 9) * h, r = hash(i * 5.1) * 1.6; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); }
      stampCache.set(key, c);
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = 0.88; ctx.drawImage(c, -c.width / 2, -c.height / 2); ctx.restore(); ctx.globalAlpha = 1;
  }
  // crossed-out reading: old value struck through twice, the measured value written next to it
  function crossed(ctx, old, x, y, S, size = 14) {
    const w = text(ctx, old, x, y, { size, col: rgba(S.dim, 1), w: 500 });
    ctx.strokeStyle = rgba(S.hot, 0.9); ctx.lineWidth = 1.6; ctx.beginPath();
    ctx.moveTo(x - 2, y + 2); ctx.lineTo(x + w + 2, y - 3); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + w + 2, y + 3); ctx.stroke(); ctx.lineWidth = 1;
    return w;
  }
  // dimension line with end ticks + label
  function dimension(ctx, x1, y1, x2, y2, label, S, t, seed) {
    ctx.strokeStyle = rgba(S.ink, 0.7); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const an = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(an) * 6, ny = Math.cos(an) * 6;
    ctx.beginPath(); ctx.moveTo(x1 - nx, y1 - ny); ctx.lineTo(x1 + nx, y1 + ny); ctx.moveTo(x2 - nx, y2 - ny); ctx.lineTo(x2 + nx, y2 + ny); ctx.stroke();
    hand(ctx, label, (x1 + x2) / 2 + nx * 2, (y1 + y2) / 2 + ny * 2, 20, rgba(S.hot, 1), t, seed, 0, 'center');
  }
  // specimen tag: punched card on a string
  function tag(ctx, x, y, w, lines, S, rot = 0.05) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const h = 18 + lines.length * 16;
    ctx.fillStyle = S.residue.includes('bone') || S.name === 'ALBEDO' ? '#ece5d5' : rgba(S.card, 1);
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(10, h); ctx.lineTo(0, h / 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(S.name === 'ALBEDO' || S.residue.includes('bone') ? '#1a1917' : S.ink, 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(12, h / 2, 3.5, 0, 7); ctx.stroke();
    const tc = S.name === 'ALBEDO' || S.residue.includes('bone') ? '#1a1917' : S.ink;
    lines.forEach((l, i) => text(ctx, l, 22, 13 + i * 16, { size: i ? 11 : 12, w: i ? 400 : 700, col: rgba(tc, i ? 0.75 : 1), ls: 1 }));
    ctx.restore();
  }
  // gloss / matte streaks for NIGREDO (black built by texture): a fixed diagonal sheen band clipped to the rect
  function gloss(ctx, x, y, w, h, S, seed) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x + w, y + h * 0.6);
    const o = 0.25 + hash(seed) * 0.4;
    g.addColorStop(Math.max(0, o - 0.08), 'rgba(255,255,255,0)'); g.addColorStop(o, 'rgba(255,255,255,0.035)'); g.addColorStop(Math.min(1, o + 0.08), 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  // basting stitches (ALBEDO exposed construction)
  function basting(ctx, x, y, w, h, S) {
    ctx.save(); ctx.strokeStyle = rgba('#1a1917', 0.55); ctx.setLineDash([9, 5, 2, 5]); ctx.lineWidth = 1.2;
    ctx.strokeRect(x - 7.5, y - 7.5, w + 15, h + 15); ctx.restore();
  }
  function cropMarks(ctx, x, y, w, h, col) {
    ctx.strokeStyle = col; ctx.beginPath();
    for (const [px, py, sx, sy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]]) {
      ctx.moveTo(px + sx * 6, py); ctx.lineTo(px + sx * 22, py); ctx.moveTo(px, py + sy * 6); ctx.lineTo(px, py + sy * 22);
    }
    ctx.stroke();
  }

  window.L6.lab = { graphPaper, tape, staple, stencil, hand, arrow, ring, stamp, crossed, dimension, tag, gloss, basting, cropMarks };
})();
