// Cue timeline: a multi-lane keyframe editor over musical time (canvas). One row per track: the default lanes
// (Camera, Meter/focus, Look, Stage, Logo, Pendant, Text, FX) plus any property track added from the registry.
// Ruler in bars/beats with the song sections under it, a loop region, the playhead; keys snap to bar / beat / 1/8 /
// 1/16. Click selects (Shift adds), drag moves (Alt: no snap), drag a clip's right edge to resize, drag a number key
// up/down to change its value, drag on empty lanes for a marquee, double-click a lane to add a key, wheel scrolls
// (Ctrl/Cmd + wheel zooms), the ruler scrubs frame-accurately. Phone: lanes collapse into one tap-to-select strip.
import { SNAPS, snapBeat, newId, defaultEase, beatsToBbt, laneOf } from '../cues/schema.js';

export const DEFAULT_ROWS = [
  ['camera.shot', 'Camera', 'camera'], ['focus.featured', 'Meter / focus', 'focus'], ['look', 'Look', 'look'], ['stage', 'Stage', 'stage'],
  ['logo.cycle', 'Logo · cycle', 'logo'], ['logo.hero', 'Logo · hero', 'logo'], ['pendant.amp', 'Pendant · amp', 'pendant'], ['text.cue', 'Text', 'text'],
  ['fx.flash', 'FX · flash', 'fx'], ['fx.glitch', 'FX · glitch', 'fx'],
];
const ABBR = { camera: 'CAM', focus: 'MTR', look: 'LOOK', stage: 'STG', logo: 'LOGO', pendant: 'PEND', text: 'TXT', fx: 'FX', custom: 'PROP' };
const FRAME = 1 / 30;

export function createCueTimeline(app, cv) {
  const g = cv.getContext('2d'), st = { ppb: 24, scroll: 0, vscroll: 0, sel: new Set(), focusRow: 0, loop: null, playhead: 0, collapsed: false, hover: null };
  let W = 0, H = 0, dpr = 1, drag = null, dirty = true, colors = null, rows = [];
  const cues = app.cues, P = () => app.store.project, tr = () => app.store.session.track;
  const HEAD = () => (st.collapsed ? 58 : 176), RULER = 22, SECT = 14, ROW = () => (st.collapsed ? 64 : 27), TOP = RULER + SECT;
  const bars = () => { const t = tr(); return t ? Math.max(1, Math.round((P().outT - P().inT) / t.barDur)) : 16; };
  const totalBeats = () => bars() * 4, BEAT = () => (tr() ? tr().spb : 0.5);
  const snapGrid = () => SNAPS[P().timeline.snap] ?? 1;
  const xOf = (b) => HEAD() + (b - st.scroll) * st.ppb, bOf = (x) => (x - HEAD()) / st.ppb + st.scroll;
  const reg = () => app.registry();
  function css() { const s = getComputedStyle(document.documentElement), v = (n, d) => (s.getPropertyValue(n).trim() || d);
    colors = { fg: v('--fg', '#e6e6e6'), muted: v('--muted', '#8b8b8b'), line: v('--line', 'rgba(200,200,200,.1)'), line2: v('--line-2', 'rgba(200,200,200,.18)'), acc: v('--accent', '#e6e6e6'), bg: v('--bg-2', '#181818'), panel: v('--panel', '#1a1a1a'), onAcc: v('--on-accent', '#111'), lane: v('--lane', 'rgba(255,255,255,.025)') }; }
  // ---------------------------------------------------------------- rows
  function buildRows() {
    const sh = cues.sheet, R = reg().byPath, out = [], used = new Set();
    for (const [path, label, lane] of DEFAULT_ROWS) { const t = sh.tracks.find((x) => x.path === path); out.push({ path, label, lane, track: t || null, kind: (t && t.kind) || (R[path] && R[path].kind) || 'number' }); used.add(path); }
    for (const t of sh.tracks) if (!used.has(t.path)) { used.add(t.path); const p = R[t.path]; out.push({ path: t.path, label: p ? `${p.elementLabel} · ${p.label}` : t.path, lane: 'custom', track: t, kind: t.kind, custom: true }); }
    rows = out; return rows;
  }
  const rowY = (i) => TOP + i * ROW() - st.vscroll;
  const rowAt = (y) => (st.collapsed ? (y >= TOP ? 0 : -1) : Math.floor((y - TOP + st.vscroll) / ROW()));
  function ensureTrack(row) {
    if (row.track) return row.track;
    const p = reg().byPath[row.path], t = { id: newId('t'), path: row.path, kind: (p && p.kind) || row.kind, lane: laneOf(row.path), keys: [] };
    cues.sheet.tracks.push(t); row.track = t; return t;
  }
  const allKeys = () => { const o = []; for (const r of rows) if (r.track) for (const k of r.track.keys) o.push([r, k]); return o; };
  const findKey = (id) => { for (const r of rows) if (r.track) { const k = r.track.keys.find((x) => x.id === id); if (k) return [r, k]; } return null; };
  // ---------------------------------------------------------------- layout
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(200, r.width); H = Math.max(80, r.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); } dirty = true; }
  function fit() { st.ppb = Math.max(4, (W - HEAD() - 16) / totalBeats()); st.scroll = 0; dirty = true; }
  function zoomBy(f, atX = null) { const x = atX ?? (xOf(st.playhead) > HEAD() && xOf(st.playhead) < W ? xOf(st.playhead) : HEAD() + (W - HEAD()) / 2), b0 = bOf(x);
    st.ppb = Math.max(3, Math.min(480, st.ppb * f)); st.scroll = b0 - (x - HEAD()) / st.ppb; clampScroll(); dirty = true; }
  function clampScroll() { const vis = (W - HEAD()) / st.ppb; st.scroll = Math.max(-0.5, Math.min(st.scroll, Math.max(-0.5, totalBeats() - vis + 1))); const maxV = Math.max(0, rows.length * ROW() - (H - TOP)); st.vscroll = st.collapsed ? 0 : Math.max(0, Math.min(st.vscroll, maxV)); }
  // ---------------------------------------------------------------- drawing
  const valueText = (row, k) => { if (row.kind === 'clip' && row.path === 'text.cue') return String(k.v || '').slice(0, 40); if (row.kind === 'clip') return row.path === 'fx.glitch' ? `glitch ${Math.round((+k.v || 0) * 100)}%` : 'hero';
    if (row.kind === 'shot') return `${k.transition === 'cut' ? 'cut' : 'push'} → ${k.v}`; if (row.kind === 'number') return (+k.v).toFixed(+k.v % 1 ? 2 : 0); if (row.kind === 'bool') return k.v ? 'on' : 'off'; return String(k.v); };
  function diamond(x, y, r, fill, stroke) { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1; } }
  function drawRow(row, y, h, compact = false) {
    const t = row.track, C = colors, hx = HEAD(), sel = (k) => st.sel.has(k.id), mid = y + h / 2;
    if (!t || !t.keys.length) return;
    const K = t.keys, p = reg().byPath[row.path] || {}, mn = p.min ?? 0, mx = p.max ?? 1, vy = (v) => y + h - 4 - (h - 8) * Math.max(0, Math.min(1, (+v - mn) / ((mx - mn) || 1)));
    g.save(); g.beginPath(); g.rect(hx, y, W - hx, h); g.clip();
    g.font = `500 ${compact ? 9 : 11}px "JetBrains Mono", monospace`; g.textBaseline = 'middle';
    if (row.kind === 'number' && !compact) {   // automation curve
      g.strokeStyle = C.muted; g.lineWidth = 1.5; g.beginPath(); const def = p.default ?? K[0].v;
      g.moveTo(hx, vy(K[0].b > 0 ? def : K[0].v)); g.lineTo(xOf(K[0].b), vy(K[0].b > 0 ? def : K[0].v));
      for (let i = 0; i < K.length; i++) { const k = K[i], nx = K[i + 1], x0 = xOf(k.b), x1 = nx ? xOf(nx.b) : W; g.lineTo(x0, vy(k.v));
        if (nx && k.ease !== 'step') { const ev = cues.ev(); for (let x = x0; x <= x1; x += 3) g.lineTo(x, vy(ev.value(row.path, bOf(x), k.v))); g.lineTo(x1, vy(nx.v)); } else g.lineTo(x1, vy(k.v)); }
      g.stroke(); g.lineWidth = 1;
    }
    for (let i = 0; i < K.length; i++) { const k = K[i], nx = K[i + 1], x = xOf(k.b), s = sel(k);
      if (row.kind === 'clip') { const x1 = xOf(k.b + (k.dur ?? 1)); g.fillStyle = s ? C.acc : C.line2; g.fillRect(x, y + 3, Math.max(2, x1 - x), h - 6); g.fillStyle = s ? C.onAcc : C.fg; if (!compact && x1 - x > 24) g.fillText(valueText(row, k), x + 6, mid, x1 - x - 10);
        g.fillStyle = s ? C.onAcc : C.muted; g.fillRect(x1 - 3, y + 6, 2, h - 12); continue; }
      if (row.kind === 'event') { g.fillStyle = s ? C.acc : C.fg; g.fillRect(x - 1, y + 3, 2, h - 6); diamond(x, y + 7, 5, s ? C.acc : C.fg); continue; }
      if (row.kind === 'shot') { const push = k.transition !== 'cut', x0 = push ? xOf(k.b - (k.dur ?? 1)) : x, x1 = nx ? xOf(nx.b - (nx.transition !== 'cut' ? nx.dur ?? 1 : 0)) : W, wide = k.v === 'wide';
        if (push) { g.fillStyle = s ? C.acc : C.line2; g.beginPath(); g.moveTo(x0, y + h - 4); g.lineTo(x, y + 4); g.lineTo(x, y + h - 4); g.closePath(); g.fill(); }
        if (!wide) { g.fillStyle = s ? C.acc : C.line2; g.globalAlpha = s ? .35 : .9; g.fillRect(x, y + 4, Math.max(0, x1 - x), h - 8); g.globalAlpha = 1; }
        if (!compact) { g.fillStyle = wide ? C.muted : C.fg; g.fillText(wide ? 'wide' : k.v, x + 8, mid, Math.max(10, x1 - x - 12)); }
        diamond(x, mid, compact ? 4 : 6, s ? C.acc : C.fg, s ? C.fg : null); continue; }
      if (row.kind !== 'number') { const x1 = nx ? xOf(nx.b) : W; g.fillStyle = C.lane; g.fillRect(x, y + 4, x1 - x, h - 8); g.strokeStyle = C.line2; g.strokeRect(x + .5, y + 4.5, x1 - x - 1, h - 9);
        if (!compact) { g.fillStyle = C.fg; g.fillText(valueText(row, k), x + 10, mid, Math.max(10, x1 - x - 16)); } }
      diamond(x, row.kind === 'number' && !compact ? vy(k.v) : mid, compact ? 4 : 6, s ? C.acc : C.fg, s ? C.fg : null);
    }
    g.restore();
  }
  function draw() {
    if (!colors) css(); const C = colors, hx = HEAD(), tb = totalBeats(), bt = BEAT();
    buildRows(); clampScroll();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    // lanes
    const rh = ROW();
    if (st.collapsed) { g.fillStyle = C.lane; g.fillRect(hx, TOP, W - hx, rh); const sub = (rh - 8) / rows.length; rows.forEach((r, i) => drawRow(r, TOP + 4 + i * sub, sub, true)); }
    else rows.forEach((r, i) => { const y = rowY(i); if (y + rh < TOP || y > H) return; g.fillStyle = i === st.focusRow ? C.line : (i % 2 ? C.lane : 'transparent'); g.fillRect(hx, y, W - hx, rh); g.fillStyle = C.line; g.fillRect(hx, y + rh - 1, W - hx, 1); drawRow(r, y, rh); });
    // grid lines over the lanes
    const sg = snapGrid() || .25, step = st.ppb * sg < 6 ? (st.ppb < 6 ? 4 : 1) : sg;
    g.save(); g.beginPath(); g.rect(hx, TOP, W - hx, H - TOP); g.clip();
    for (let b = Math.max(0, Math.floor(st.scroll / step) * step); b <= tb; b += step) { const x = Math.round(xOf(b)) + .5; if (x > W) break; g.fillStyle = b % 4 === 0 ? C.line2 : C.line; g.fillRect(x, TOP, 1, H - TOP); }
    g.fillStyle = 'rgba(0,0,0,.35)'; const xe = xOf(tb); if (xe < W) g.fillRect(xe, TOP, W - xe, H - TOP);
    g.restore();
    // ruler + sections
    g.fillStyle = C.panel; g.fillRect(0, 0, W, TOP); g.fillStyle = C.line2; g.fillRect(0, TOP - 1, W, 1); g.fillRect(0, RULER, W, 1);
    g.save(); g.beginPath(); g.rect(hx, 0, W - hx, TOP); g.clip(); g.font = '500 10px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    const e = app.clip.current(), labels = e && e.ready ? e.labels : [];
    let s0 = 0; for (let k = 1; k <= labels.length; k++) if (k === labels.length || labels[k] !== labels[s0]) { const x0 = xOf(s0 * 4), x1 = xOf(k * 4); g.fillStyle = labels[s0] === 'drop' ? C.line2 : C.line; g.fillRect(x0 + 1, RULER + 2, x1 - x0 - 2, SECT - 4); g.fillStyle = labels[s0] === 'drop' ? C.fg : C.muted; g.fillText(labels[s0], x0 + 5, RULER + SECT / 2, x1 - x0 - 8); s0 = k; }
    const lbl = st.ppb * 4 < 26 ? (st.ppb * 4 < 12 ? 8 : 4) : 1;
    for (let b = Math.max(0, Math.floor(st.scroll)); b <= tb; b++) { const x = Math.round(xOf(b)) + .5; if (x > W) break; const bar = b % 4 === 0;
      if (!bar && st.ppb < 8) continue; g.fillStyle = bar ? C.fg : C.muted; g.fillRect(x, bar ? 3 : 14, 1, bar ? RULER - 3 : RULER - 14);
      if (bar && (b / 4) % lbl === 0) { g.fillStyle = C.fg; g.fillText(String(b / 4 + 1), x + 4, 9); } else if (!bar && st.ppb > 40) { g.fillStyle = C.muted; g.fillText(`.${b % 4 + 1}`, x + 3, 9); } }
    if (st.loop) { const a = xOf(st.loop.a), z = xOf(st.loop.b); g.fillStyle = C.acc; g.globalAlpha = .22; g.fillRect(a, 0, z - a, RULER); g.globalAlpha = 1; g.fillRect(a, 0, 2, RULER); g.fillRect(z - 2, 0, 2, RULER);
      g.globalAlpha = .06; g.fillRect(a, TOP, z - a, H - TOP); g.globalAlpha = 1; }
    g.restore();
    // headers
    g.fillStyle = C.panel; g.fillRect(0, TOP, hx, H - TOP); g.fillStyle = C.line2; g.fillRect(hx - 1, 0, 1, H);
    g.font = '500 11px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    if (st.collapsed) { g.fillStyle = C.fg; g.fillText('CUES', 10, TOP + 14); g.fillStyle = C.muted; g.font = '400 10px "JetBrains Mono", monospace'; g.fillText(`${allKeys().length} keys`, 10, TOP + 32); }
    else rows.forEach((r, i) => { const y = rowY(i); if (y + rh < TOP || y > H) return; g.save(); g.beginPath(); g.rect(0, Math.max(TOP, y), hx, rh); g.clip();
      g.fillStyle = i === st.focusRow ? C.line2 : 'transparent'; g.fillRect(0, y, hx, rh);
      if (i === st.focusRow) { g.fillStyle = C.acc; g.fillRect(0, y, 3, rh - 1); }
      g.fillStyle = r.track && r.track.mute ? C.muted : C.fg; g.font = '500 11px "JetBrains Mono", monospace'; g.fillText((r.custom ? r.label : r.label).toUpperCase(), 10, y + rh / 2, hx - (r.custom ? 58 : 40));
      g.fillStyle = r.track && r.track.mute ? C.acc : C.muted; g.font = '500 10px "JetBrains Mono", monospace'; g.fillText('M', hx - (r.custom ? 44 : 22), y + rh / 2);
      if (r.custom) { g.fillStyle = C.muted; g.fillText('×', hx - 20, y + rh / 2); }
      g.fillStyle = C.line; g.fillRect(0, y + rh - 1, hx, 1); g.restore(); });
    g.fillStyle = C.panel; g.fillRect(0, 0, hx, TOP); g.fillStyle = C.muted; g.font = '500 10px "JetBrains Mono", monospace'; g.fillText(st.collapsed ? 'BAR' : `BAR · SNAP ${P().timeline.snap.toUpperCase()}`, 10, RULER / 2); g.fillText(st.collapsed ? '' : 'SECTION', 10, RULER + SECT / 2);
    // marquee
    if (drag && drag.kind === 'marquee' && drag.moved) { const [x0, y0, x1, y1] = drag.box; g.strokeStyle = C.acc; g.setLineDash([4, 3]); g.strokeRect(Math.min(x0, x1) + .5, Math.min(y0, y1) + .5, Math.abs(x1 - x0), Math.abs(y1 - y0)); g.setLineDash([]); g.fillStyle = C.acc; g.globalAlpha = .08; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); g.globalAlpha = 1; }
    // playhead
    const px = Math.round(xOf(st.playhead)); if (px >= hx && px <= W) { g.fillStyle = C.acc; g.fillRect(px - .5, 0, 2, H); g.beginPath(); g.moveTo(px - 6, 0); g.lineTo(px + 7, 0); g.lineTo(px + .5, 8); g.fill(); }
    dirty = false;
  }
  // ---------------------------------------------------------------- hit testing
  function hit(x, y) {
    const hx = HEAD(); if (y < RULER) return { zone: 'ruler' }; if (y < TOP) return { zone: 'sect' };
    const ri = rowAt(y); if (x < hx) return { zone: 'head', ri };
    if (st.collapsed) { let best = null, bd = 18; for (const [r, k] of allKeys()) { const xs = [xOf(k.b)]; if (r.kind === 'clip') xs.push(xOf(k.b + (k.dur ?? 1)) - 4);
        for (const xx of xs) { const d = Math.abs(xx - x); if (d < bd) { bd = d; best = { zone: 'key', row: r, key: k, part: 'body', ri: rows.indexOf(r) }; } } } return best || { zone: 'lane', ri: 0 }; }
    const row = rows[ri]; if (!row) return { zone: 'empty' };
    const K = row.track ? row.track.keys : [], h = ROW(), y0 = rowY(ri);
    for (let i = K.length - 1; i >= 0; i--) { const k = K[i], x0 = xOf(k.b);
      if (row.kind === 'clip') { const x1 = xOf(k.b + (k.dur ?? 1)); if (x >= x1 - 6 && x <= x1 + 3) return { zone: 'key', row, key: k, part: 'end', ri }; if (x >= x0 - 3 && x < x1) return { zone: 'key', row, key: k, part: 'body', ri }; continue; }
      const p = reg().byPath[row.path] || {}, mn = p.min ?? 0, mx = p.max ?? 1, ky = row.kind === 'number' ? y0 + h - 4 - (h - 8) * Math.max(0, Math.min(1, (+k.v - mn) / ((mx - mn) || 1))) : y0 + h / 2;
      if (Math.abs(x - x0) <= 7 && Math.abs(y - ky) <= 9) return { zone: 'key', row, key: k, part: 'body', ri };
      if (row.kind === 'shot' && k.transition !== 'cut' && x >= xOf(k.b - (k.dur ?? 1)) && x < x0) return { zone: 'key', row, key: k, part: 'body', ri };
    }
    if (row.kind !== 'number' && row.kind !== 'event' && row.kind !== 'clip') { const b = bOf(x); let k = null; for (const q of K) if (q.b <= b) k = q; if (k && x - xOf(k.b) > 7) return { zone: 'key', row, key: k, part: 'seg', ri }; }
    return { zone: 'lane', ri, row };
  }
  // ---------------------------------------------------------------- editing helpers
  const curValue = (path, b, row) => { const p = reg().byPath[path] || {}; return cues.ev().value(path, b, p.default ?? (row.kind === 'bool' ? true : 0)); };
  function newKeyFor(row, b) {
    const p = reg().byPath[row.path] || {}, k = { id: newId(), b, ease: defaultEase(row.kind) };
    if (row.kind === 'shot') { const s = cues.ev().shot(b); Object.assign(k, { v: s.to === 'wide' ? (P().look === 'scope' ? 'eq' : 'chains') : 'wide', transition: 'push', dur: 1, ease: 'easeInOut' }); }
    else if (row.path === 'text.cue') Object.assign(k, { v: '{title}', dur: 4, x: 0.5, y: 0.5, size: 72, font: 'mono', color: 'ink', align: 'center' });
    else if (row.path === 'fx.glitch') Object.assign(k, { v: 0.3, dur: 1 });
    else if (row.kind === 'clip') Object.assign(k, { v: true, dur: 4 });
    else if (row.kind === 'event') k.v = true;
    else if (row.kind === 'bool') k.v = !curValue(row.path, b, row);
    else if (row.kind === 'enum') { const o = p.options || [], cur = curValue(row.path, b, row); k.v = o.length ? o[(o.indexOf(cur) + 1) % o.length] : cur; }
    else k.v = curValue(row.path, b, row);
    return k;
  }
  function addKeyAt(row, b) { cues.edit(() => { const t = ensureTrack(row), k = newKeyFor(row, b); t.auto = false; t.keys = t.keys.filter((q) => Math.abs(q.b - b) > 1e-6); t.keys.push(k); t.keys.sort((x, y) => x.b - y.b); st.sel = new Set([k.id]); }, 'add key'); app.inspector && app.inspector.show(); }
  const sortAll = () => { for (const t of cues.sheet.tracks) t.keys.sort((a, b) => a.b - b.b); };
  // ---------------------------------------------------------------- pointer
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const seekBeat = (b, snapGrid_) => { const bt = BEAT(); let bb = Math.max(0, Math.min(totalBeats(), b)); if (snapGrid_) bb = snapBeat(bb, snapGrid_); let t = bb * bt; t = Math.round(t / FRAME) * FRAME; app.actions.seek(P().inT + Math.min(t, totalBeats() * bt - FRAME)); };
  cv.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return; cv.focus({ preventScroll: true }); const [x, y] = pos(e), h = hit(x, y); cv.setPointerCapture(e.pointerId);
    if (h.zone === 'ruler' || h.zone === 'sect') { const b = bOf(x);
      if (st.loop && Math.abs(xOf(st.loop.a) - x) < 6) drag = { kind: 'loopA' }; else if (st.loop && Math.abs(xOf(st.loop.b) - x) < 6) drag = { kind: 'loopB' };
      else if (e.altKey) { const s = snapBeat(b, snapGrid() || .25); st.loop = { a: s, b: s }; drag = { kind: 'loopB' }; }
      else { drag = { kind: 'scrub' }; seekBeat(b, e.shiftKey ? snapGrid() : 0); } dirty = true; return; }
    if (h.zone === 'head') { if (h.ri >= 0 && h.ri < rows.length) { const r = rows[h.ri], hx = HEAD(); st.focusRow = h.ri;
        if (r.custom && x > hx - 28) { cues.edit((s) => { s.tracks = s.tracks.filter((t) => t !== r.track); }, 'remove track'); }
        else if (x > hx - (r.custom ? 52 : 30) && x < hx - (r.custom ? 32 : 10) && r.track) cues.edit(() => { r.track.mute = !r.track.mute; }, 'mute');
        app.inspector && app.inspector.showTrack(r.path); } dirty = true; return; }
    if (h.zone === 'key') {
      const id = h.key.id; st.focusRow = h.ri;
      if (e.shiftKey || e.metaKey || e.ctrlKey) { if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id); } else if (!st.sel.has(id)) st.sel = new Set([id]);
      const orig = new Map(); for (const sid of st.sel) { const f = findKey(sid); if (f) orig.set(sid, { b: f[1].b, dur: f[1].dur, v: f[1].v }); }
      drag = { kind: h.part === 'end' ? 'resize' : 'move', x0: x, y0: y, key: h.key, row: h.row, orig, moved: false, alt: e.altKey };
      app.inspector && app.inspector.show(); dirty = true; return; }
    if (h.zone === 'lane') { st.focusRow = Math.max(0, h.ri); drag = { kind: 'marquee', x0: x, y0: y, box: [x, y, x, y], moved: false, add: e.shiftKey, ri: h.ri }; dirty = true; }
  });
  cv.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e); if (!drag) { const h = hit(x, y); cv.style.cursor = h.zone === 'ruler' ? 'text' : h.zone === 'key' ? (h.part === 'end' ? 'ew-resize' : 'grab') : 'default'; return; }
    const grid = snapGrid();
    if (drag.kind === 'scrub') { seekBeat(bOf(x), e.shiftKey ? grid : 0); return; }
    if (drag.kind === 'loopA' || drag.kind === 'loopB') { const s = snapBeat(Math.max(0, Math.min(totalBeats(), bOf(x))), grid || .25); if (drag.kind === 'loopA') st.loop.a = s; else st.loop.b = s; if (st.loop.a > st.loop.b) { [st.loop.a, st.loop.b] = [st.loop.b, st.loop.a]; drag.kind = drag.kind === 'loopA' ? 'loopB' : 'loopA'; } dirty = true; return; }
    if (drag.kind === 'marquee') { drag.box[2] = x; drag.box[3] = y; drag.moved = drag.moved || Math.hypot(x - drag.x0, y - drag.y0) > 3; dirty = true; return; }
    if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < 3) return;
    if (!drag.moved) { drag.moved = true; cues.begin(); }
    const db = (x - drag.x0) / st.ppb, noSnap = e.altKey, ag = noSnap ? 0 : grid;
    cues.preview(() => {
      if (drag.kind === 'resize') { const o = drag.orig.get(drag.key.id), end = snapBeat(drag.key.b + (o.dur ?? 1) + db, ag); drag.key.dur = Math.max(ag || 1 / 16, end - drag.key.b); return; }
      const oa = drag.orig.get(drag.key.id), na = Math.max(0, snapBeat(oa.b + db, ag)), d = na - oa.b;
      for (const [sid, o] of drag.orig) { const f = findKey(sid); if (f) { f[1].b = Math.max(0, Math.round((o.b + d) * 960) / 960); if (f[0].track) f[0].track.auto = false; } }
      if (drag.row.kind === 'number' && !st.collapsed && Math.abs(y - drag.y0) > 2) { const p = reg().byPath[drag.row.path] || {}, mn = p.min ?? 0, mx = p.max ?? 1, step = p.step || 0.01, dv = -(y - drag.y0) / (ROW() - 8) * (mx - mn);
        drag.key.v = Math.max(mn, Math.min(mx, Math.round((drag.orig.get(drag.key.id).v + dv) / step) * step)); }
    });
    sortAll(); dirty = true;
  });
  const end = (e) => {
    if (!drag) return; const d = drag; drag = null;
    if (d.kind === 'marquee') { if (d.moved) { const [x0, y0, x1, y1] = d.box, bx0 = bOf(Math.min(x0, x1)), bx1 = bOf(Math.max(x0, x1)), r0 = rowAt(Math.min(y0, y1)), r1 = rowAt(Math.max(y0, y1)); if (!d.add) st.sel.clear();
        rows.forEach((r, i) => { if (!r.track || (!st.collapsed && (i < r0 || i > r1))) return; for (const k of r.track.keys) if (k.b >= bx0 - 1e-6 && k.b <= bx1 + 1e-6) st.sel.add(k.id); }); app.inspector && app.inspector.show(); }
      else { st.sel.clear(); const [x] = pos(e); seekBeat(bOf(x), snapGrid()); app.inspector && app.inspector.show(); } }
    if ((d.kind === 'move' || d.kind === 'resize') && d.moved) { sortAll(); cues.commit(d.kind === 'resize' ? 'resize clip' : 'move keys'); }
    if (d.kind === 'loopA' || d.kind === 'loopB') { if (st.loop.b - st.loop.a < 1e-6) st.loop = null; app.actions.loopChanged && app.actions.loopChanged(); }
    dirty = true;
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', () => { if (drag && drag.moved && drag.kind !== 'marquee') cues.cancel(); drag = null; dirty = true; });
  cv.addEventListener('dblclick', (e) => { const [x, y] = pos(e), h = hit(x, y); if (h.zone === 'lane' && h.row) addKeyAt(h.row, Math.max(0, snapBeat(bOf(x), snapGrid()))); else if (h.zone === 'key') app.inspector && app.inspector.focusValue(); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x] = pos(e);
    if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.002), x);
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || st.collapsed || rows.length * ROW() <= H - TOP) { st.scroll += (e.shiftKey ? e.deltaY : e.deltaX || e.deltaY) / st.ppb; clampScroll(); }
    else { st.vscroll += e.deltaY; clampScroll(); } dirty = true; }, { passive: false });
  new ResizeObserver(() => { const first = W === 0; resize(); if (first || !P().timeline.pxPerBeat) fit(); }).observe(cv);
  cues.subscribe(() => { dirty = true; for (const id of [...st.sel]) if (!findKey(id)) st.sel.delete(id); });
  // ---------------------------------------------------------------- commands (keyboard + toolbar)
  const selected = () => [...st.sel].map(findKey).filter(Boolean);
  const api = {
    get state() { return st; }, rows: () => buildRows(), selected, findKey, ensureTrack, addKeyAt, hit, xOf, bOf,
    markDirty() { dirty = true; }, recolor() { colors = null; dirty = true; },
    draw() { if (dirty) draw(); },
    setTime(tClip) { const b = tClip / BEAT(); if (Math.abs(b - st.playhead) > 1e-6) { st.playhead = b;
        if (app.clock.playing) { const x = xOf(b); if (x > W - 40 || x < HEAD()) { st.scroll = b - 2; clampScroll(); } } dirty = true; } },
    fit, zoomBy,
    setCollapsed(c) { st.collapsed = !!c; st.vscroll = 0; dirty = true; },
    select(ids) { st.sel = new Set(ids); dirty = true; app.inspector && app.inspector.show(); },
    clearSel() { st.sel.clear(); dirty = true; app.inspector && app.inspector.show(); },
    selectAll() { const r = rows[st.focusRow], scope = st.sel.size && r && r.track ? r.track.keys : allKeys().map(([, k]) => k); st.sel = new Set(scope.map((k) => k.id)); dirty = true; app.inspector && app.inspector.show(); },
    del() { if (!st.sel.size) return false; cues.edit((s) => { for (const t of s.tracks) { const n = t.keys.length; t.keys = t.keys.filter((k) => !st.sel.has(k.id)); if (t.keys.length !== n) t.auto = false; } }, 'delete keys'); st.sel.clear(); app.inspector && app.inspector.show(); return true; },
    nudge(dir, big) { if (!st.sel.size) return false; const g0 = snapGrid() || 0.25, d = dir * (big ? 4 : g0); cues.edit(() => { for (const [r, k] of selected()) { k.b = Math.max(0, Math.round((k.b + d) * 960) / 960); r.track.auto = false; } sortAll(); }, 'nudge'); return true; },
    nudgeValue(dir) { const ks = selected().filter(([r]) => r.kind === 'number'); if (!ks.length) return false; cues.edit(() => { for (const [r, k] of ks) { const p = reg().byPath[r.path] || {}; k.v = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, Math.round((+k.v + dir * (p.step || 0.1)) * 1e6) / 1e6)); r.track.auto = false; } }, 'value'); return true; },
    copy() { const ks = selected(); if (!ks.length) return false; const b0 = Math.min(...ks.map(([, k]) => k.b)); cues.clipboard.keys = ks.map(([r, k]) => ({ path: r.path, kind: r.kind, key: { ...k, b: k.b - b0 } })); return true; },
    paste() { const C = cues.clipboard.keys; if (!C.length) return false; const at = snapBeat(st.playhead, snapGrid()), ids = [];
      cues.edit(() => { for (const c of C) { const row = rows.find((r) => r.path === c.path) || { path: c.path, kind: c.kind, track: cues.sheet.tracks.find((t) => t.path === c.path) || null }; const t = ensureTrack(row), k = { ...c.key, id: newId(), b: at + c.key.b };
        t.keys = t.keys.filter((q) => Math.abs(q.b - k.b) > 1e-6); t.keys.push(k); t.auto = false; ids.push(k.id); } sortAll(); }, 'paste'); st.sel = new Set(ids); app.inspector && app.inspector.show(); return true; },
    duplicate() { if (!api.copy()) return false; const ks = selected(), span = Math.max(...ks.map(([, k]) => k.b + (k.dur ?? 0))) - Math.min(...ks.map(([, k]) => k.b)); const ph = st.playhead; st.playhead = Math.min(...ks.map(([, k]) => k.b)) + Math.max(snapGrid() || 1, span); api.paste(); st.playhead = ph; return true; },
    /** S: split the clip under the playhead (focused or selected) into two; on a step/number track add a key at the playhead. */
    split() { const b = snapBeat(st.playhead, snapGrid() || 1 / 16) || st.playhead; let done = false;
      cues.edit(() => { const cand = selected().length ? selected() : (rows[st.focusRow] && rows[st.focusRow].track ? rows[st.focusRow].track.keys.map((k) => [rows[st.focusRow], k]) : []);
        for (const [r, k] of cand) if (r.kind === 'clip' && k.b < b && b < k.b + (k.dur ?? 1)) { const nk = { ...k, id: newId(), b, dur: k.b + (k.dur ?? 1) - b }; k.dur = b - k.b; r.track.keys.push(nk); r.track.auto = false; done = true; }
        if (!done) { const r = rows[st.focusRow]; if (r && !['clip', 'event'].includes(r.kind)) { const t = ensureTrack(r); if (!t.keys.some((q) => Math.abs(q.b - b) < 1e-6)) { const k = { id: newId(), b, v: r.kind === 'shot' ? cues.ev().shot(b).to : curValue(r.path, b, r), ease: defaultEase(r.kind), ...(r.kind === 'shot' ? { transition: 'cut', dur: 1 } : {}) }; t.keys.push(k); t.auto = false; st.sel = new Set([k.id]); done = true; } } }
        sortAll(); }, 'split'); if (done) app.inspector && app.inspector.show(); return done; },
    setLoopIn() { const b = snapBeat(st.playhead, snapGrid() || .25); st.loop = { a: b, b: st.loop && st.loop.b > b ? st.loop.b : Math.min(totalBeats(), b + 16) }; dirty = true; app.actions.loopChanged && app.actions.loopChanged(); },
    setLoopOut() { const b = snapBeat(st.playhead, snapGrid() || .25); st.loop = { a: st.loop && st.loop.a < b ? st.loop.a : Math.max(0, b - 16), b }; dirty = true; app.actions.loopChanged && app.actions.loopChanged(); },
    clearLoop() { st.loop = null; dirty = true; app.actions.loopChanged && app.actions.loopChanged(); },
    focusRowOf(path) { buildRows(); const i = rows.findIndex((r) => r.path === path); if (i >= 0) { st.focusRow = i; const y = rowY(i); if (y < TOP || y + ROW() > H) { st.vscroll += y - TOP - ROW(); clampScroll(); } dirty = true; } return i; },
    bbt: (b) => beatsToBbt(b),
  };
  return api;
}
