/* Frame assembly: camera (GSAP timeline, seeked by time), world (cables, windows), screen overlays.
 * Variant comes from the HyperFrames variable `variant` (or ?variant= for the stills tool); aspect from <html data-aspect>. */
(function () {
  'use strict';
  const U = window.U2C, { D, C, E, clamp, lerp, smooth, rgba, label, font, chrome, BAR, BEAT, HEX } = U;
  const { LAYOUTS, VARIANTS, TITLES } = U.V;
  const canvas = document.getElementById('stage'), ctx = canvas.getContext('2d');
  const ASPECT = document.documentElement.dataset.aspect || '916';
  let V, T, L, cam, camTL, ready = false, pending = 0;

  function variantId() {
    const qs = new URLSearchParams(location.search).get('variant');
    let v = null;
    try { v = window.__hyperframes && window.__hyperframes.getVariables && window.__hyperframes.getVariables().variant; } catch (e) { /* standalone */ }
    return (qs || v || document.documentElement.dataset.variant || 'A').toUpperCase();
  }

  // ---------------------------------------------------------------- camera
  function rectOf(key) {
    if (key.all) return [0, 0, L.W, L.H];
    const ids = key.union || [key.win];
    const rs = ids.map((id) => (id === 'pendant' ? L.pendant : L.win[id]));
    const x0 = Math.min(...rs.map((r) => r[0])), y0 = Math.min(...rs.map((r) => r[1]));
    const x1 = Math.max(...rs.map((r) => r[0] + r[2])), y1 = Math.max(...rs.map((r) => r[1] + r[3]));
    return [x0, y0, x1 - x0, y1 - y0];
  }
  function resolve(key) {
    const [x, y, w, h] = rectOf(key), p = key.pad || 0;
    const z = Math.min(L.W / (w + 2 * p), L.H / (h + 2 * p)) * (key.z || 1);
    return { x: x + w / 2 + (key.dx || 0), y: y + h / 2 + (key.dy || 0), z };
  }
  function buildCamera() {
    cam = { x: L.W / 2, y: L.H / 2, z: 1 };
    camTL = gsap.timeline({ paused: true });
    for (const k of V.cam) {
      const to = resolve(k);
      if (!k.d) camTL.set(cam, to, Math.max(0, k.t)); else camTL.to(cam, { ...to, duration: k.d, ease: k.ease || 'sine.inOut' }, Math.max(0, k.t));
    }
    camTL.seek(0);
  }

  // ---------------------------------------------------------------- window state
  function winState(id, t) {
    const o = V.open(id);
    const open = o == null ? 0 : o < 0 ? 1 : clamp((t - o) / 0.55);
    let dim = 0, focus = 0;
    if (V.active) { const a = V.active[id]; dim = a == null ? 0 : 1 - smooth((t - a) / 0.35); focus = a != null && t >= a && t - a < BAR * 1.0 ? 1 : 0; }
    const end = V.overlays.end; if (end && t >= end[0]) dim = Math.max(dim, 0.55 * smooth((t - end[0]) / 0.5));
    return { open, dim, focus };
  }

  // ---------------------------------------------------------------- world
  function drawWorld(t) {
    const f = U.fidx(t);
    // dotted grid (hairline desktop), very faint
    ctx.fillStyle = rgba(T.line, 0.07);
    for (let y = 0; y <= L.H; y += 40) for (let x = 0; x <= L.W; x += 40) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    // menubar
    const mb = 44;
    ctx.strokeStyle = rgba(T.line, 0.16); ctx.beginPath(); ctx.moveTo(0, mb + 0.5); ctx.lineTo(L.W, mb + 0.5); ctx.stroke();
    ctx.fillStyle = rgba(T.accent, 1); ctx.beginPath(); ctx.arc(28, mb / 2, 4, 0, 7); ctx.fill();
    font(ctx, 14, U.MONO, 700); ctx.letterSpacing = '1.5px'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = rgba(T.line, 0.95);
    ctx.fillText('U2C.EXE', 42, mb / 2 + 1); ctx.letterSpacing = '0px';
    ['FILE', 'EDIT', 'VIEW', 'WINDOW'].forEach((s, i) => label(ctx, T, s, 150 + i * 70, mb / 2 + 1, 0.4, 11));
    label(ctx, T, `${U.tc(t)}  ·  ${D.bpm} BPM  ·  ${D.key}  ·  ${V.name}`, L.W - 24, mb / 2 + 1, 0.6, 11, 'right');
    // cables (lit when both ends are open/active)
    U.drawCables(ctx, T, L, t, 1, (c) => {
      const a = winState(c[0], t), b = winState(c[2], t);
      return Math.min(a.open, b.open) * (1 - 0.7 * Math.max(a.dim, b.dim));
    });
    // windows
    for (const id of Object.keys(L.win)) {
      const st = winState(id, t), r = L.win[id];
      if (st.open <= 0) continue;
      const kickGlow = st.focus ? U.env.kick[f] : 0;
      chrome(ctx, T, r, TITLES[id][0], TITLES[id][1], { ...st, focus: Math.max(st.focus * 0.5, kickGlow) }, t);
      const opt = { logo: V.logo };
      if (id === 'surface' && V.layout === 'deck') { opt.yaw = -0.75 + 0.55 * t / D.duration; opt.scale = 0.62; opt.rows = 44; opt.oy = 0.72; }
      if (id === 'elephant') { opt.size = L.W > L.H ? 0.98 : 0.9; opt.rope = 0.26; }
      ctx.save(); ctx.beginPath(); ctx.rect(r[0] + 1, r[1] + 31, r[2] - 2, r[3] - 32); ctx.clip();
      C[id](ctx, T, r, t, st, opt);
      ctx.restore();
    }
    // free-hanging pendant (deck layout)
    if (L.pendant) {
      const p = L.pendant, st = { open: 1, dim: winState('surface', t).dim, focus: 0 };
      C.elephant(ctx, T, [p[0], 0, p[2], p[3]], t, st, { free: true, rope: 0.34, size: 0.95 });
    }
    // hop labels (variant B): Security-Factory style chips on the active node
    if (V.hops) {
      for (const [id, txt] of V.hops) {
        const a0 = V.active[id], r = L.win[id]; if (a0 == null) continue;
        const k = smooth((t - Math.max(0, a0)) / 0.3); if (k <= 0) continue;
        font(ctx, 13, U.MONO, 700); ctx.letterSpacing = '1.6px';
        const w = ctx.measureText(txt).width + 20, x = r[0] + r[2] - w - 8, y = r[1] - 14;
        ctx.fillStyle = rgba(T.bg, 0.95 * k); ctx.fillRect(x, y - 11, w, 22);
        ctx.strokeStyle = rgba(T.accent, k); ctx.strokeRect(x + 0.5, y - 10.5, w - 1, 21);
        ctx.fillStyle = rgba(T.accent, k); ctx.textAlign = 'left'; ctx.fillText(txt, x + 10, y + 1); ctx.letterSpacing = '0px';
      }
    }
  }

  // ---------------------------------------------------------------- screen overlays
  const BOOT = ['U2C.EXE  v1.42  —  cold boot', 'mount   chains.dll ............ ok', 'load    elephant.sys .......... ok',
    'attach  meter.exe   target −14 LUFS', `clock   ${D.bpm} BPM · ${D.key} · 4/4`, '> play  pendant.wav'];
  function bootLog(t, W, H) {
    const [t0, t1] = V.overlays.boot, k = clamp((t - t0) / (t1 - t0));
    const out = 1 - smooth((t - (t1 - 0.12)) / 0.12);
    if (out <= 0) return;
    const lh = W > H ? 26 : 30, x = W > H ? 80 : 110, y0 = H * (W > H ? 0.62 : 0.70);
    ctx.fillStyle = rgba(T.bg, 0.82 * out); ctx.fillRect(x - 24, y0 - 34, (W > H ? 620 : 720), BOOT.length * lh + 52);
    ctx.strokeStyle = rgba(T.line, 0.3 * out); ctx.strokeRect(x - 23.5, y0 - 33.5, (W > H ? 619 : 719), BOOT.length * lh + 51);
    BOOT.forEach((line, i) => {
      const lk = clamp(k * BOOT.length * 1.15 - i);
      if (lk <= 0) return;
      const s = line.slice(0, Math.ceil(line.length * lk));
      font(ctx, W > H ? 17 : 21, U.MONO, i === 0 || i === 5 ? 700 : 400); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(i === 5 ? T.accent : T.line, (i === 0 ? 1 : 0.8) * out);
      ctx.fillText(s, x, y0 + i * lh);
      if (lk < 1 || i === 5) { const cw = ctx.measureText(s).width; if (Math.floor(t * 4) % 2 === 0 || lk < 1) { ctx.fillRect(x + cw + 3, y0 + i * lh - 10, 11, 20); } }
    });
  }

  function endCard(t, W, H) {
    const [t0] = V.overlays.end, k = (t - t0); if (k < 0) return;
    const port = H > W, cw = port ? 760 : 820, ch = port ? 640 : 520, cx = W / 2, cy = port ? 880 : H / 2;
    const x = cx - cw / 2, y = cy - ch / 2;
    const o = clamp(k / 0.45), b = E.out(o);
    ctx.fillStyle = rgba(T.bg, 0.9 * b); ctx.fillRect(x, y, cw, ch);
    // border draws on
    ctx.strokeStyle = rgba(T.line, 0.55); ctx.lineWidth = 1; ctx.beginPath();
    const per = 2 * (cw + ch); let rem = per * b; const pts = [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch], [x, y]]; ctx.moveTo(x, y);
    for (let i = 1; i < 5 && rem > 0; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), q = Math.min(1, rem / d); ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], q), lerp(pts[i - 1][1], pts[i][1], q)); rem -= d; }
    ctx.stroke();
    const hk = smooth((k - 0.2) / 0.3);
    ctx.strokeStyle = rgba(T.line, 0.2 * hk); ctx.beginPath(); ctx.moveTo(x, y + 34.5); ctx.lineTo(x + cw, y + 34.5); ctx.stroke();
    ctx.fillStyle = rgba(T.accent, hk); ctx.fillRect(x + 14, y + 14, 7, 7);
    label(ctx, T, 'RELEASE.TXT', x + 30, y + 18, 0.85 * hk, 13);
    label(ctx, T, 'U2C.EXE / NEW BEAT', x + cw - 14, y + 18, 0.5 * hk, 12, 'right');
    // lines reveal on successive beats
    const line = (i) => E.out(clamp((k - 0.25 - i * BEAT * 0.5) / 0.35));
    const l0 = line(0), l1 = line(1), l2 = line(2), l3 = line(3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    font(ctx, port ? 176 : 150, U.SERIF, 400, 'italic'); ctx.fillStyle = rgba(T.line, l0);
    ctx.fillText('Pendant', cx, y + ch * 0.43 + (1 - l0) * 18);
    font(ctx, port ? 26 : 22, U.MONO, 500); ctx.letterSpacing = '4px'; ctx.fillStyle = rgba(T.line, 0.85 * l1);
    ctx.fillText(`${D.bpm} BPM  ·  ${D.key}  ·  4/4`, cx, y + ch * 0.56 + (1 - l1) * 12);
    ctx.letterSpacing = '0px';
    ctx.strokeStyle = rgba(T.line, 0.25 * l1); ctx.beginPath(); ctx.moveTo(cx - cw * 0.32 * l1, y + ch * 0.63); ctx.lineTo(cx + cw * 0.32 * l1, y + ch * 0.63); ctx.stroke();
    font(ctx, port ? 40 : 34, U.SANS, 600); ctx.letterSpacing = '-0.5px'; ctx.fillStyle = rgba(T.line, l2);
    ctx.fillText('prod. @uche2crazy', cx, y + ch * 0.74 + (1 - l2) * 12); ctx.letterSpacing = '0px';
    font(ctx, port ? 22 : 19, U.MONO, 500); ctx.letterSpacing = '3px'; ctx.fillStyle = rgba(T.accent, l3);
    ctx.fillText('FULL BEAT — LINK IN BIO', cx + 14, y + ch * 0.87 + (1 - l3) * 10); ctx.letterSpacing = '0px';
    U.star(ctx, cx - (port ? 196 : 176), y + ch * 0.87 - 8, 11 * l3, rgba(HEX.gold, l3));
    // integrated loudness stamp, measured
    label(ctx, T, `I ${U.fmtDb(D.summary.ffmpegI)} LUFS · TP ${U.fmtDb(D.summary.ffmpegTP)} dBTP`, x + 14, y + ch - 16, 0.45 * hk, 11);
    label(ctx, T, '✦ U2C', x + cw - 14, y + ch - 16, 0.6 * hk, 11, 'right');
  }

  function hud(t, W, H) {
    const port = H > W, m = port ? 54 : 36, top = port ? 150 : 36, bot = port ? H - 150 : H - 36, len = 22;
    ctx.strokeStyle = rgba(T.line, 0.35); ctx.lineWidth = 1;
    for (const [x, y, sx, sy] of [[m, top, 1, 1], [W - m, top, -1, 1], [m, bot, 1, -1], [W - m, bot, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x + sx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * len); ctx.stroke();
    }
    const kick = U.env.kick[U.fidx(t)];
    ctx.fillStyle = rgba(T.over, 0.75 + 0.25 * kick); ctx.beginPath(); ctx.arc(m + 8, top + 38, 4, 0, 7); ctx.fill();
    label(ctx, T, `REC ${U.tc(t)}`, m + 20, top + 38, 0.7, 13);
    label(ctx, T, `${V.name} · ${port ? '9:16' : '16:9'}`, W - m, top + 38, 0.55, 13, 'right');
    label(ctx, T, `BAR ${String(Math.floor(t / BAR) + 1).padStart(2, '0')}.${Math.floor((t % BAR) / BEAT) + 1}`, m, bot - 18, 0.55, 13);
    label(ctx, T, 'prod. @uche2crazy', W - m, bot - 18, 0.55, 13, 'right');
  }

  // ---------------------------------------------------------------- frame
  function renderAt(t) {
    if (!ready) { pending = t; return; }
    t = clamp(t, 0, D.duration - 1 / U.FPS);
    const W = canvas.width, H = canvas.height;
    camTL.seek(t, false);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
    const breath = 1 + 0.0035 * U.env.kick[U.fidx(t)];
    const z = cam.z * breath;
    ctx.setTransform(z, 0, 0, z, W / 2 - cam.x * z, H / 2 - cam.y * z);
    drawWorld(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    U.vignette(ctx, W, H, T, 0.55);
    if (V.overlays.boot && t < V.overlays.boot[1]) bootLog(t, W, H);
    if (V.overlays.end) endCard(t, W, H);
    hud(t, W, H);
    U.scanlines(ctx, W, H, 0.05);
    U.grain(ctx, W, H, t, 0.07);
  }

  // ---------------------------------------------------------------- boot
  const build = (async () => {
    const id = variantId(); V = VARIANTS[id] || VARIANTS.A; T = U.THEMES[V.theme];
    L = LAYOUTS[`${V.layout}-${ASPECT}`]; canvas.width = L.W; canvas.height = L.H;
    await U.loadAssets(T);
    buildCamera(); ready = true; renderAt(pending);
  })();
  window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {}; window.__hf.buildReady.u2c = build;
  window.addEventListener('hf-seek', (e) => renderAt(e.detail.time));
  window.U2C.renderAt = renderAt; window.U2C.ready = build;
  // the contract wants a registered paused timeline; the frame itself is drawn by hf-seek
  const tl = gsap.timeline({ paused: true }); tl.to({}, { duration: D.duration });
  window.__timelines = window.__timelines || {}; window.__timelines.main = tl;
})();
