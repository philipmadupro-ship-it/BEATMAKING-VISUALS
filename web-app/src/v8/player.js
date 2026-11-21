// v14 "U2C.PLAYER" look: the desktop beat-player shell (sidebar, top bar, now-playing card, metadata card, barcode, hero caption).
// Pure drawing helpers; every string is a tag (L.tag 'player.*', editable in the studio) or real data (BPM, key, the real song time and
// duration, the wav's sample rate / bit depth / size, the date). Nothing here tweens opacity: states are steps on the grid.
// createPlayer(L, {tag, V}) -> { sidebar, topbar, now, meta, barcode, heroCaption, crosses, icon }
import { coverScrim } from './intro.js';

export const TABS = ['PLAYER', 'ANALYSIS', 'MIX', 'MASTER'];
/** Which top tab a camera target belongs to (the tab switches on the beat the push starts; wide = PLAYER). */
export const TAB_OF = { spectrum: 1, spectro: 1, loud: 2, stereo: 2, session: 3 };

export function createPlayer(L, { tag, V }) {
  const { rgba, text, rr = L.rr, clamp, DISPLAY, UI, hash, BEAT, D, fidx } = L, TAU = Math.PI * 2;
  const mmss = (s) => { s = Math.max(0, Math.floor(s + 1e-6)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const stroke = (c, col, w = 1.6) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; };
  // ---------------------------------------------------------------- icons (24 box centred on cx, cy; s = size in px)
  function icon(c, name, cx, cy, s, col, fill = false) {
    const k = s / 24; c.save(); c.translate(cx, cy); c.scale(k, k); stroke(c, col, 1.7 / Math.max(0.6, k * 0.75)); c.fillStyle = col; c.beginPath();
    const ln = (...p) => { c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); };
    switch (name) {
      case 'play': ln(-6, -8, 7, 0, -6, 8); c.closePath(); fill ? c.fill() : c.stroke(); break;
      case 'pause': c.rect(-6, -8, 4.5, 16); c.rect(2, -8, 4.5, 16); c.fill(); break;
      case 'next': ln(-8, -8, 3, 0, -8, 8); c.closePath(); c.fill(); c.rect(5, -8, 3, 16); c.fill(); break;
      case 'prev': ln(8, -8, -3, 0, 8, 8); c.closePath(); c.fill(); c.rect(-8, -8, 3, 16); c.fill(); break;
      case 'shuffle': ln(-9, 5, -4, 5, 4, -5, 9, -5); ln(-9, -5, -4, -5, -1, -1.5); ln(1, 1.5, 4, 5, 9, 5); ln(6, -8, 9, -5, 6, -2); ln(6, 2, 9, 5, 6, 8); c.stroke(); break;
      case 'repeat': ln(-9, 0, -9, -4, -5, -6, 6, -6); ln(3, -9, 6, -6, 3, -3); ln(9, 0, 9, 4, 5, 6, -6, 6); ln(-3, 3, -6, 6, -3, 9); c.stroke(); break;
      case 'heart': c.moveTo(0, 8); c.bezierCurveTo(-13, -1, -8, -11, 0, -5); c.bezierCurveTo(8, -11, 13, -1, 0, 8); c.stroke(); break;
      case 'dots': c.fill(); for (const y of [-6, 0, 6]) { c.beginPath(); c.arc(0, y, 1.6, 0, TAU); c.fill(); } break;
      case 'expand': ln(-3, -9, 9, -9, 9, 3); ln(3, 9, -9, 9, -9, -3); c.stroke(); break;
      case 'link': c.arc(-4, 0, 5, 0.6 * Math.PI, 1.9 * Math.PI); c.stroke(); c.beginPath(); c.arc(4, 0, 5, 1.6 * Math.PI, 2.9 * Math.PI); c.stroke(); break;
      case 'cross': ln(-7, 0, 7, 0); ln(0, -7, 0, 7); c.stroke(); break;
      case 'target': c.arc(0, 0, 6.5, 0, TAU); c.moveTo(0, -10); c.lineTo(0, -3); c.moveTo(0, 3); c.lineTo(0, 10); c.moveTo(-10, 0); c.lineTo(-3, 0); c.moveTo(3, 0); c.lineTo(10, 0); c.stroke(); break;
      case 'bars': c.fill(); for (const [x, h0] of [[-7.5, 5], [-2.5, 11], [2.5, 8], [7.5, 14]]) c.fillRect(x - 1.4, -h0 / 2, 2.8, h0); break;
      case 'library': c.rect(-8, -7, 16, 14); c.stroke(); c.beginPath(); ln(-8, -3, 8, -3); c.stroke(); break;
      case 'tools': c.arc(0, 0, 4.5, 0, TAU); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; c.moveTo(Math.cos(a) * 6.5, Math.sin(a) * 6.5); c.lineTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5); } c.stroke(); break;
      case 'projects': c.rect(-8, -8, 7, 7); c.rect(1, -8, 7, 7); c.rect(-8, 1, 7, 7); c.rect(1, 1, 7, 7); c.stroke(); break;
      case 'archive': c.rect(-8, -8, 16, 5); c.rect(-6, -3, 12, 11); c.stroke(); c.beginPath(); ln(-2.5, 1, 2.5, 1); c.stroke(); break;
      case 'meta': c.fill(); for (const y of [-6, 0, 6]) { c.fillRect(-8, y - 1.2, 3, 2.4); c.fillRect(-3, y - 1.2, 11, 2.4); } break;
      default: break;
    }
    c.restore();
  }
  const navIcon = ['play', 'library', 'bars', 'tools', 'projects', 'archive'];

  // ---------------------------------------------------------------- sidebar (16:9 only)
  /** rect = [x, y, w, h] of the sidebar glass (already drawn by the caller); beat = kick envelope 0..1 (the active dot ticks on it). */
  function sidebar(c, S, rect, t, o) {
    const [x, y, w, h] = rect, ink = S.ink, dim = rgba(ink, 0.5), P = 22, nav = tag('player.nav') || [], tracks = tag('player.tracks') || [];
    o.logo([x + w / 2, y + 62], w - 70);
    let yy = y + 150; const rowH = 52;
    nav.forEach((n, i) => {
      const act = i === 0, cy = yy + i * rowH;
      if (act) { c.strokeStyle = rgba(ink, 0.7); c.lineWidth = 1.2; c.stroke(rr(x + 14, cy - 22, w - 28, 44, 10)); c.fillStyle = rgba(ink, 0.06); c.fill(rr(x + 14, cy - 22, w - 28, 44, 10)); }
      icon(c, navIcon[i % navIcon.length], x + P + 14, cy, 22, act ? ink : dim);
      text(c, String(n).toUpperCase(), x + P + 36, cy, { size: 22, fam: UI, w: act ? 600 : 500, ls: 1.2, col: act ? ink : dim, maxW: w - P - 50 });
    });
    yy += nav.length * rowH + 10; if (String(tag('player.vol') || '') || tracks.length) { c.fillStyle = rgba(ink, 0.18); c.fillRect(x + P, yy, w - 2 * P, 1); }
    if (String(tag('player.vol') || '')) text(c, String(tag('player.vol')).toUpperCase(), x + P, yy + 34, { size: 22, fam: UI, w: 500, ls: 2, col: dim });
    tracks.forEach((n, i) => {
      const cy = yy + 80 + i * 40, act = i === 0, r = act ? 4 + 2.4 * o.pulse : 3;
      c.beginPath(); c.arc(x + P + 6, cy, r, 0, TAU); c.fillStyle = act ? rgba(ink, 0.95) : rgba(ink, 0.35); c.fill();
      text(c, String(n).toUpperCase(), x + P + 22, cy, { size: 22, fam: UI, w: act ? 600 : 500, col: act ? ink : rgba(ink, 0.5), maxW: w - P - 32 });
    });
    // bottom: U2C® mark with the coordinates
    const cd = tag('player.coords') || [], by = y + h - 28 - 24 * cd.length;
    icon(c, 'bars', x + P + 10, by - 44, 22, ink);
    text(c, String(tag('player.mark')), x + P + 30, by - 44, { size: 22, fam: DISPLAY, w: 800, col: ink, maxW: w - P - 40 });
    cd.forEach((s, i) => text(c, String(s), x + P, by + i * 26, { size: 22, fam: UI, w: 500, col: dim, maxW: w - 2 * P }));
  }

  // ---------------------------------------------------------------- top bar
  /** o.port: condensed 9:16. tab = active tab index. rect = the bar band. */
  function topbar(c, S, rect, t, o) {
    const [x, y, w, h] = rect, ink = S.ink, dim = rgba(ink, 0.55), title = String(tag('title')).toUpperCase(), tabs = tag('player.tabs') || TABS;
    const sub = tag('player.sub'), info = tag('player.info'), pill = String(tag('player.pill'));
    if (o.port) return topbarPort(c, S, rect, tabs, pill, o);
    const ts = 40; const tw = text(c, title, x, y + (o.port ? 30 : 28), { size: ts, fam: DISPLAY, w: 800, col: ink, ls: 0.5, maxW: o.port ? w * 0.56 : 520 });
    text(c, String(sub).toUpperCase(), x + 2, y + (o.port ? 74 : 68), { size: 22, fam: UI, w: 500, ls: 2, col: dim, maxW: o.port ? w * 0.56 : 520 });
    // pill + bpm / key
    c.font = `800 22px ${DISPLAY}`; const pw = 96, ph = 38, px = x + w - pw, py = y + (o.port ? 10 : 10);
    c.strokeStyle = rgba(ink, 0.75); c.lineWidth = 1.4; c.stroke(rr(px, py, pw, ph, ph / 2)); c.fillStyle = rgba(ink, 0.05); c.fill(rr(px, py, pw, ph, ph / 2));
    text(c, pill, px + pw / 2, py + ph / 2 + 1, { size: 22, fam: DISPLAY, w: 800, col: ink, align: 'center', maxW: pw - 22 });
    text(c, String(info).toUpperCase(), px - 24, py + ph / 2 + 1, { size: 22, fam: UI, w: 500, ls: 1.4, col: dim, align: 'right', maxW: o.port ? 300 : 360 });
    // tabs (16:9: off by default, player.tabs169)
    if (!o.tabs) return;
    const ty = o.port ? y + h - 20 : y + 29, gap = o.port ? 40 : 32, widths = tabs.map((s) => { c.font = `500 22px ${UI}`; c.letterSpacing = '1.2px'; const m = c.measureText(String(s).toUpperCase()).width; c.letterSpacing = '0px'; return m; });
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (tabs.length - 1) + 56;
    let tx = o.port ? x + (w - totalW) / 2 + 28 : x + 500;
    tabs.forEach((s, i) => {
      const act = i === o.tab, tw2 = widths[i];
      if (act) { c.strokeStyle = rgba(ink, 0.8); c.lineWidth = 1.3; c.stroke(rr(tx - 18, ty - 20, tw2 + 36, 40, 8)); text(c, '[', tx - 11, ty, { size: 22, fam: UI, col: dim }); text(c, ']', tx + tw2 + 11, ty, { size: 22, fam: UI, col: dim, align: 'right' }); }
      text(c, String(s).toUpperCase(), tx, ty, { size: 22, fam: UI, w: act ? 600 : 500, ls: 1.2, col: act ? ink : rgba(ink, 0.5) });
      tx += tw2 + gap;
    });
  }


  // 9:16: one row, tabs left (the camera follows the active one), the U2C pill right. Title + cover are in the now-playing strip below.
  function topbarPort(c, S, rect, tabs, pill, o) {
    const [x, y, w, h] = rect, ink = S.ink, cy = y + h / 2; let tx = x + 18;
    tabs.forEach((s, i) => { const act = i === o.tab, lab = String(s).toUpperCase(); c.font = `500 22px ${UI}`; const tw = c.measureText(lab).width + lab.length * 1.2;
      if (act) { c.fillStyle = rgba(ink, 0.08); c.fill(rr(tx - 16, cy - 20, tw + 32, 40, 20)); c.strokeStyle = rgba(ink, 0.7); c.lineWidth = 1.2; c.stroke(rr(tx - 16, cy - 20, tw + 32, 40, 20)); }
      text(c, lab, tx, cy + 1, { size: 22, fam: UI, w: act ? 600 : 500, ls: 1.2, col: act ? ink : rgba(ink, 0.45) }); tx += tw + 44; });
    const pw = 96, ph = 38, px = x + w - pw, py = cy - ph / 2;
    c.strokeStyle = rgba(ink, 0.75); c.lineWidth = 1.4; c.stroke(rr(px, py, pw, ph, ph / 2));
    text(c, pill, px + pw / 2, cy + 1, { size: 22, fam: DISPLAY, w: 800, col: ink, align: 'center', maxW: pw - 22 });
  }
  // ---------------------------------------------------------------- now playing (cover card; compact strip when wide and short)
  /** Draws into the window rect r = [x, y, w, h]. o = {cover (canvas), I (kick env 0..1), t, onCover(rect, rad) callback to publish the match-cut rect}. */
  function now(c, S, r, t, o) {
    const [x, y, w, h] = r, ink = S.ink, dim = rgba(ink, 0.55), compact = w > 700 && h < 220, P = 20;
    const elapsed = (D.song.startTime || 0) + t, total = D.song.duration || D.duration, frac = clamp(elapsed / total);
    const beatE = Math.exp(-(((t / BEAT) % 1) * BEAT) / 0.16);   // the pause icon pulses on the beat
    const title = String(tag('player.now.title')).toUpperCase(), sub = String(tag('player.now.sub')).toUpperCase();
    let cx0, cy0, cw, ch, rad = 14;
    if (compact) { ch = h - 2 * P; cw = ch; cx0 = x + P; cy0 = y + P; } else { cx0 = x + P; cy0 = y + P; cw = w - 2 * P; ch = Math.round(cw * 0.5); }
    const draw = (ix, iy, iw, ih, rd, zoom = 1, fx = 0.5, fy = 0.5) => {
      c.save(); c.clip(rr(ix, iy, iw, ih, rd));
      if (o.cover) { const sc = Math.max(iw, ih) / o.cover.width * zoom; c.drawImage(o.cover, ix + iw / 2 - o.cover.width * sc * fx, iy + ih / 2 - o.cover.height * sc * fy, o.cover.width * sc, o.cover.height * sc); }
      else { c.fillStyle = S.card; c.fillRect(ix, iy, iw, ih); }
      coverScrim(c, S, ix, iy, iw, ih, { dim: 0.7 * o.dim, light: L.isLight(S) }); c.restore();
      c.strokeStyle = rgba(ink, 0.3); c.lineWidth = 1.1; c.stroke(rr(ix + 0.5, iy + 0.5, iw - 1, ih - 1, rd));
    };
    draw(cx0, cy0, cw, ch, rad); if (o.onCover) o.onCover([cx0, cy0, cw, ch], rad);
    if (!compact) icon(c, 'expand', cx0 + cw - 24, cy0 + 24, 20, rgba(ink, 0.8));
    // text block
    const tx = compact ? cx0 + cw + 18 : x + P, ty = compact ? y + 34 : cy0 + ch + 34, aw = compact ? w - (tx - x) - 340 : w - 2 * P - 80;
    text(c, title, tx, ty, { size: compact ? 30 : 32, fam: DISPLAY, w: 800, col: ink, maxW: Math.max(160, aw) });
    text(c, sub, tx, ty + (compact ? 32 : 36), { size: 22, fam: UI, w: 500, ls: 1.2, col: dim, maxW: compact ? aw : w - 2 * P });
    if (!compact) { icon(c, 'heart', x + w - P - 48, ty - 2, 24, ink); icon(c, 'dots', x + w - P - 10, ty - 2, 22, ink); }
    // progress bar (real song position) + times
    const bx = compact ? tx : x + P, bw = compact ? Math.max(200, w - (tx - x) - P - 280) : w - 2 * P, by = compact ? y + h - 24 : ty + 68;
    c.fillStyle = rgba(ink, 0.2); c.fill(rr(bx, by - 2, bw, 4, 2)); c.fillStyle = rgba(ink, 0.95); c.fill(rr(bx, by - 2, Math.max(4, bw * frac), 4, 2));
    c.beginPath(); c.arc(bx + bw * frac, by, 6.5, 0, TAU); c.fillStyle = '#fff'; c.fillStyle = rgba(ink, 1); c.fill();
    if (!compact) { text(c, mmss(elapsed), bx, by + 28, { size: 22, col: dim }); text(c, mmss(total), bx + bw, by + 28, { size: 22, col: dim, align: 'right' }); }
    else { text(c, mmss(elapsed), bx + bw + 14, by, { size: 22, col: dim }); }
    // transport
    const trY = compact ? y + h / 2 + 4 : by + 72, trX = compact ? x + w - P - 120 : x + w / 2, sp = compact ? 54 : 76;
    if (compact) { icon(c, 'prev', trX - sp, trY, 22, ink); icon(c, 'next', trX + sp, trY, 22, ink); }
    else { icon(c, 'shuffle', trX - 2 * sp, trY, 24, dim); icon(c, 'prev', trX - sp, trY, 24, ink); icon(c, 'next', trX + sp, trY, 24, ink); icon(c, 'repeat', trX + 2 * sp, trY, 24, dim); }
    const pr = compact ? 26 : 32, ps = 1 + 0.07 * beatE;   // pause pill: outline + two bars, a subtle pulse
    c.save(); c.translate(trX, trY); c.scale(ps, ps); c.strokeStyle = rgba(ink, 0.85); c.lineWidth = 1.6; c.stroke(rr(-pr * 1.55, -pr * 0.78, pr * 3.1, pr * 1.56, pr * 0.78)); c.fillStyle = rgba(ink, 0.06); c.fill(rr(-pr * 1.55, -pr * 0.78, pr * 3.1, pr * 1.56, pr * 0.78)); c.restore();
    icon(c, 'pause', trX, trY, compact ? 22 : 26, ink);
  }

  // ---------------------------------------------------------------- barcode (deterministic from a string)
  function barcode(c, S, x, y, w, h, str, col) {
    let seed = 7; for (const ch of String(str)) seed = (seed * 131 + ch.charCodeAt(0)) % 100003;
    const mods = []; let total = 0;   // alternating bar / space widths in modules (1..3), 8-module guards at both ends
    for (let i = 0; i < 72; i++) { const m = 1 + Math.floor(hash(seed * 0.37 + i * 3.17) * 3); mods.push(m); total += m; }
    const u = w / total; let X = x; c.fillStyle = col;
    mods.forEach((m, i) => { if (i % 2 === 0) c.fillRect(Math.round(X), y, Math.max(1, Math.round(m * u) - (m * u > 2.4 ? 1 : 0)), h); X += m * u; });
  }

  // ---------------------------------------------------------------- metadata
  function meta(c, S, cr, t, o) {
    // v21 DOSSIER (user ref "SUBJECT A-34"): a file card for the beat. A SUBJECT header, ruled rows (keys Synkopy, values Akira), STATUS, and a live
    // signal box (the low-band envelope as a wave over a grid + a grid of real band levels in dB), drawn twice: a soft phosphor glow pass under a crisp pass.
    // Tall cell = one column; wide cell (9:16 strip) = signal box left, rows in two columns right. Tags: player.meta.labels / tags / status.
    const [x, y, w, h] = cr, ink = S.ink, fi = D.fileInfo || {}, sr = fi.sr || (D.wave3 && D.wave3.sr) || 48000, sub = (q) => (L.sub ? L.sub(q) : q);
    const fmt = fi.bits ? `WAV ${fi.bits}-BIT · ${+(sr / 1000).toFixed(1)} KHZ` : `WAV · ${+(sr / 1000).toFixed(1)} KHZ`, size = fi.bytes ? `${(fi.bytes / 1048576).toFixed(1)} MB` : '—';
    const lab = tag('player.meta.labels') || ['FORMAT', 'DURATION', 'SIZE', 'DATE', 'TAGS'];
    const valOf = { FORMAT: fmt, DURATION: mmss(D.song.duration || D.duration), SIZE: size, DATE: String(tag('date')).toUpperCase(), TAGS: String(tag('player.meta.tags')).toUpperCase(), BPM: sub('{bpm}'), KEY: sub('{key}'), STATUS: String(tag('player.meta.status') || 'UNSTABLE').toUpperCase(), NAME: String(tag('title') || D.title || '').toUpperCase() };
    const wide = w > 2.4 * h, rows = (h < 420 ? ['NAME', 'BPM', 'KEY', 'DURATION', 'FORMAT', 'STATUS'].filter((q) => lab.map((l) => String(l).toUpperCase()).includes(q) || q === 'NAME') : lab.map((l) => String(l).toUpperCase())).map((l) => [l, valOf[l] ?? '']);   // the 9:16 strip keeps the six that matter
    const f = Math.max(0, fidx(Math.max(0, t))), fz = wide ? 17 : 18;
    const draw = (glow) => {
      c.save(); if (glow) { c.shadowColor = rgba(ink, 0.9); c.shadowBlur = 10; c.globalAlpha = 0.55; }
      // header
      const hy = y + 14; if (!wide) text(c, String(tag('player.meta.subject') || 'SUBJECT').toUpperCase() + ' · ' + valOf.NAME, x, hy, { size: wide ? 18 : 18, fam: DISPLAY, w: 800, col: ink, maxW: w * 0.68 });
      if (!wide && w > 560) text(c, 'FILE ' + String(1 + Math.floor(hash(D.title.length * 7.1) * 89)).padStart(2, '0'), x + w, hy, { size: 14, fam: UI, w: 600, col: rgba(ink, 0.6), align: 'right', ls: 1.4 });
      if (!wide) { c.fillStyle = rgba(ink, 0.55); c.fillRect(x, hy + 14, w, 1.2); }
      const top = wide ? y + 6 : hy + 24, sigW = wide ? Math.round(w * 0.34) : w, sigH = wide ? y + h - top - 4 : Math.max(64, Math.round(h * 0.3));
      const sx = x, sy = wide ? top : y + h - sigH - 2, rx = wide ? x + sigW + 16 : x, rw = wide ? w - sigW - 16 : w, ry = top, rh = wide ? y + h - top - 4 : sy - top - 12;   // 8-pt rhythm: 12 px gap above the signal box
      // rows
      const cols = wide ? 3 : 1, per = Math.ceil(rows.length / cols), rH = rh / per, cw = (rw - (cols - 1) * 16) / cols;
      rows.forEach(([k, v], i) => { const col2 = Math.floor(i / per), r = i % per, xx = rx + col2 * (cw + 16), yy = ry + r * rH + rH / 2;
        if (!glow) text(c, k, xx + 2, yy, { size: wide ? Math.round(fz * 0.72) : 14, fam: UI, w: 500, col: rgba(ink, 0.62), ls: 1.6, maxW: cw * 0.36 });   // keys: 14 px, crisp (no glow), >= 3:1   // big / small contrast: small dim keys, big values
        text(c, v, xx + cw - 2, yy, { size: wide ? Math.round(fz * 1.2) : 18, fam: DISPLAY, w: 800, col: ink, align: 'right', maxW: cw * 0.62 });
        if (!glow) { c.fillStyle = rgba(ink, 0.18); c.fillRect(xx, Math.round(ry + (r + 1) * rH) - 0.5, cw, 1); } });   // subtle dividers
      // signal box: grid + the low band as a smooth wave + a number grid of real band levels
      c.strokeStyle = rgba(ink, 0.5); c.lineWidth = 1; c.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(sigW) - 1, Math.round(sigH) - 1);
      const gh = sigH * (wide ? 0.96 : 0.6); c.fillStyle = rgba(ink, 0.14); for (let q = 1; q < 8; q++) c.fillRect(Math.round(sx + sigW * q / 8), sy + 2, 1, gh); for (let q = 1; q < 4; q++) c.fillRect(sx + 2, Math.round(sy + gh * q / 4), sigW - 4, 1);
      const FB = L.F && L.F.bands; c.beginPath(); const NW = Math.max(24, Math.round(sigW / 3));
      for (let k = 0; k < NW; k++) { const ff = Math.max(0, f - (NW - 1 - k) * 2), v = FB ? FB[Math.min(FB.length - 1, ff)][0] : 0.5, yy = sy + gh * 0.5 - (clamp(v) - 0.5) * gh * 0.8, xx = sx + 4 + (sigW - 8) * k / (NW - 1); if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy); }
      c.strokeStyle = ink; c.lineWidth = 1.6; c.stroke();
      if (FB && !wide) { const b6 = FB[Math.min(FB.length - 1, f)], ny = sy + gh + 6, nh = sigH - gh - 8, nr = 1, nc = 4;
        for (let q = 0; q < nr * nc; q++) { const bi = [0, 2, 3, 5][q % nc], back = Math.floor(q / nc) * 8, v = FB[Math.max(0, f - back)][bi], db = (20 * Math.log10(Math.max(1e-4, v))).toFixed(1);
          text(c, db, sx + 6 + (sigW - 12) * (q % nc + 0.5) / nc, ny + nh * (Math.floor(q / nc) + 0.5) / nr, { size: 12, fam: DISPLAY, w: 700, col: rgba(ink, 0.75), align: 'center', maxW: (sigW - 12) / nc - 2 }); } void b6; }
      c.restore();
    };
    draw(true); draw(false);
  }


  // ---------------------------------------------------------------- hero extras: caption block + registration crosses
  function heroCaption(c, S, x, y, align = 'left', maxW = 200) {
    const lines = tag('player.caption') || [], ink = S.ink;
    lines.forEach((s, i) => text(c, String(s).toUpperCase(), x, y + i * 25, { size: 22, fam: i === 0 ? DISPLAY : UI, w: i === 0 ? 800 : 500, col: i === 0 ? ink : rgba(ink, 0.6), align, maxW }));
  }
  function crosses(c, S, pts, s = 20) { for (const [px, py] of pts) icon(c, 'cross', px, py, s, rgba(S.ink, 0.55)); }
  return { sidebar, topbar, now, meta, barcode, heroCaption, crosses, icon, mmss };
}
