// Cue timeline: a multi-lane keyframe editor over musical time (canvas). One row per track: the default lanes
// (Camera, Meter/focus, Look, Stage, Logo, Pendant, Text, FX) plus any property track added from the registry, grouped
// per element (a group of 2+ lanes collapses into one summary row). Ruler in bars/beats, the song sections, a MARKER
// strip from the analysis (downbeats, beats, kick / snare / hat onsets, sections, the sheet's own markers), lanes with
// their own heights (compact, normal, expanded value graph), a minimap viewport bar at the bottom, the playhead.
// Keys snap to the grid (bar / beat / 1/8 / 1/16) and, with the magnet on, to markers, other keys, the playhead, the
// loop and bar lines (Alt: no snap). Number lanes draw the evaluated curve; bezier keys show handles when the lane is
// tall (or in the graph view of one property). Lane header: chevron (group), name, prev / add-remove / next key,
// target, solo, lock, mute. Phone: lanes collapse into one tap-to-select strip.
import { SNAPS, snapBeat, newId, defaultEase, beatsToBbt, laneOf, PPQ } from '../cues/schema.js';
import { markerList, DENSITY, DENSITY_LABEL, MARKER_PRI, MARKER_COLOR, anchorsFor } from '../cues/markers.js';
import { createSnapModel } from '../cues/snap.js';
import { quantiseKeys, gridTargets, ripple, stamp, attrsOf, applyAttrs, applyEasePreset, toBezier, presetFromSelection, BUILTIN_PRESETS } from '../cues/ops.js';
import { read, write } from '../state.js';

export const DEFAULT_ROWS = [
  ['intro.index', 'Intro · cards', 'stage'], ['intro.push', 'Intro · push', 'stage'],
  ['camera.shot', 'Camera', 'camera'], ['focus.featured', 'Meter / focus', 'focus'], ['look', 'Look', 'look'], ['stage', 'Stage', 'stage'],
  ['logo.cycle', 'Logo · cycle', 'logo'], ['logo.hero', 'Logo · hero', 'logo'], ['pendant.amp', 'Pendant · amp', 'pendant'], ['text.cue', 'Text', 'text'],
  ['fx.flash', 'FX · flash', 'fx'], ['fx.glitch', 'FX · glitch', 'fx'],
];
const GROUP_LABEL = { camera: 'Camera', focus: 'Meter', look: 'Look', stage: 'Stage · intro', logo: 'Logo', pendant: 'Pendant', text: 'Text', fx: 'FX' };
const FRAME = 1 / 30, SNAP_PX = 7, EXPANDED = 84, MIN_H = 14, MAX_H = 260, PRESET_KEY = 'u2c.keypresets';
const tick = (b) => Math.round(b * PPQ) / PPQ;

export function createCueTimeline(app, cv) {
  const g = cv.getContext('2d'), st = { ppb: 24, scroll: 0, vscroll: 0, sel: new Set(), focusRow: 0, loop: null, playhead: 0, collapsed: false, hover: null, guide: null, graph: null, selMarker: null, compactNow: false };
  let W = 0, H = 0, dpr = 1, drag = null, dirty = true, colors = null, rows = [], marks = [], marksKey = '', snap = null;
  const curveCache = new Map();
  const cues = app.cues, P = () => app.store.project, TL = () => P().timeline, tr = () => app.store.session.track;
  const HEAD = () => (st.collapsed ? 58 : 176), RULER = 22, SECT = 14, MARK = 13, TOP = RULER + SECT + MARK, MINI = () => (st.collapsed ? 0 : 12);
  const BASE = () => (st.compactNow ? st.compactH || 16 : 23), PHONE_ROW = 64, HALF_FRAME = () => FRAME / BEAT() / 2 + 1e-4;
  const bars = () => { const t = tr(); return t ? Math.max(1, Math.round((P().outT - P().inT) / t.barDur)) : 16; };
  const totalBeats = () => bars() * 4, BEAT = () => (tr() ? tr().spb : 0.5);
  const snapGrid = () => SNAPS[TL().snap] ?? 1;
  const xOf = (b) => HEAD() + (b - st.scroll) * st.ppb, bOf = (x) => (x - HEAD()) / st.ppb + st.scroll;
  const reg = () => app.registry();
  const setTL = (o) => app.store.set({ project: { timeline: o } });
  function css() { const s = getComputedStyle(document.documentElement), v = (n, d) => (s.getPropertyValue(n).trim() || d);
    colors = { fg: v('--fg', '#e6e6e6'), muted: v('--muted', '#8b8b8b'), line: v('--line', 'rgba(200,200,200,.1)'), line2: v('--line-2', 'rgba(200,200,200,.18)'), acc: v('--accent', '#e6e6e6'), bg: v('--bg-2', '#181818'), panel: v('--panel', '#1a1a1a'), onAcc: v('--on-accent', '#111'), lane: v('--lane', 'rgba(255,255,255,.025)') }; }
  // ---------------------------------------------------------------- rows (groups, heights, prefix-sum layout)
  function buildRows() {
    const sh = cues.sheet, R = reg().byPath, base = [], used = new Set();
    for (const [path, label, lane] of DEFAULT_ROWS) { const t = sh.tracks.find((x) => x.path === path); base.push({ path, label, lane, group: lane, track: t || null, kind: (t && t.kind) || (R[path] && R[path].kind) || 'number' }); used.add(path); }
    for (const t of sh.tracks) if (!used.has(t.path)) { used.add(t.path); const p = R[t.path], ln = laneOf(t.path), grp = ln !== 'custom' ? ln : (p && p.element) || t.path.split('.').slice(0, 2).join('.');
      const row = { path: t.path, label: p ? `${p.elementLabel} · ${p.label}` : t.path, lane: 'custom', group: grp, groupLabel: p ? p.elementLabel : grp, track: t, kind: t.kind, custom: true };
      let at = -1; base.forEach((r, i) => { if (r.group === grp) at = i; }); if (at >= 0) base.splice(at + 1, 0, row); else base.push(row); }
    const size = {}; for (const r of base) size[r.group] = (size[r.group] || 0) + 1;
    const avail = Math.max(40, H - TOP - MINI()), pref = TL().compact, sum = (h) => base.reduce((s, r) => s + (r.track && r.track.h ? r.track.h : h), 0);
    st.compactNow = pref === true || (pref == null && sum(23) > avail);
    // laptop fit: still overflowing in compact -> groups the user never opened fold into summary rows
    const closed = { ...(TL().closed || {}) }; if (st.compactNow && pref !== false && sum(BASE()) > avail && !st.collapsed) for (const g of Object.keys(size)) if (size[g] >= 2 && closed[g] == null) closed[g] = true;
    st.autoClosed = closed; let out = [];
    for (const r of base) { r.gsize = size[r.group]; r.gfirst = !out.some((q) => q.group === r.group) && !(out.length && out[out.length - 1].summary && out[out.length - 1].group === r.group);
      if (size[r.group] >= 2 && closed[r.group]) { if (r.gfirst) out.push({ summary: true, group: r.group, path: '#' + r.group, label: `${GROUP_LABEL[r.group] || r.groupLabel || r.group} (${size[r.group]})`, kind: 'summary', members: base.filter((q) => q.group === r.group), gsize: size[r.group], gfirst: true, track: null }); continue; }
      out.push(r); }
    if (st.graph) { const r = out.find((q) => q.path === st.graph); if (r && r.kind === 'number') { r.graph = true; out = [r]; } else st.graph = null; }
    st.compactH = 16; if (st.compactNow && !st.graph) { const fixed = out.reduce((s, r) => s + (r.track && r.track.h ? r.track.h : 0), 0), n = out.filter((r) => !(r.track && r.track.h)).length; if (n) st.compactH = Math.max(14, Math.min(16, Math.floor((avail - fixed) / n))); }
    let y = 0; for (const r of out) { r.h = st.graph ? avail : r.track && r.track.h ? r.track.h : BASE(); r.y = y; y += r.h; }
    rows = out; return rows;
  }
  const totalH = () => (rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h : 0);
  const rowY = (i) => TOP + rows[i].y - st.vscroll;
  const rowH = (i) => (st.collapsed ? PHONE_ROW : rows[i] ? rows[i].h : BASE());
  const rowAt = (y) => { if (st.collapsed) return y >= TOP ? 0 : -1; const yy = y - TOP + st.vscroll; if (yy < 0) return -1; let lo = 0, hi = rows.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1, r = rows[m]; if (yy < r.y) hi = m - 1; else if (yy >= r.y + r.h) lo = m + 1; else return m; } return rows.length; };
  function ensureTrack(row) {
    if (row.track) return row.track;
    const p = reg().byPath[row.path], t = { id: newId('t'), path: row.path, kind: (p && p.kind) || row.kind, lane: laneOf(row.path), keys: [] };
    cues.sheet.tracks.push(t); row.track = t; return t;
  }
  const rowsWithKeys = () => { const o = []; for (const r of rows) if (r.summary) o.push(...r.members); else o.push(r); return o; };
  const allKeys = () => { buildRows(); const o = []; for (const r of rowsWithKeys()) if (r.track) for (const k of r.track.keys) o.push([r, k]); return o; };
  const findKey = (id) => { buildRows(); for (const r of rowsWithKeys()) if (r.track) { const k = r.track.keys.find((x) => x.id === id); if (k) return [r, k]; } return null; };
  const rowIdx = (r) => rows.findIndex((q) => q.path === r.path);   // rows are rebuilt every draw: find by path
  const locked = (r) => !!(r && r.track && r.track.lock);
  // ---------------------------------------------------------------- markers + snap points
  const density = () => TL().density || 'fewer';
  function markers() { const e = app.clip.current(), k = [e && e.ready ? e.key : '', cues.version, density()].join('|'); if (k !== marksKey) { marksKey = k; marks = markerList(e, cues.sheet, density()); } return marks; }
  function buildSnap(exclude = new Set()) {
    const pts = []; for (const m of markers()) pts.push({ b: m.b, kind: 'marker', pri: m.kind === 'beat' ? 1 : MARKER_PRI[m.kind] >= 5 ? 5 : 4, label: m.label || m.kind });
    for (const r of rowsWithKeys()) if (r.track) for (const k of r.track.keys) if (!exclude.has(k.id)) { pts.push({ b: k.b, kind: 'key' }); if (r.kind === 'clip') pts.push({ b: k.b + (k.dur ?? 1), kind: 'key' }); }
    pts.push({ b: st.playhead, kind: 'playhead' }); if (st.loop) pts.push({ b: st.loop.a, kind: 'loop' }, { b: st.loop.b, kind: 'loop' });
    for (let b = 0; b <= totalBeats(); b += 4) pts.push({ b, kind: 'bar' });
    return createSnapModel(pts);
  }
  /** Snap a beat: magnet (objects within 7 px, priority marker > key > playhead/loop > bar) then the grid. */
  function snapTo(b, { alt = false, grid = snapGrid(), model = snap } = {}) {
    st.guide = null; if (alt) return Math.max(0, tick(b));
    if (TL().magnet !== false && model) { const s = model.closest(b, SNAP_PX / st.ppb); if (s) { st.guide = s; return Math.max(0, tick(s.b)); } }
    return Math.max(0, snapBeat(b, grid));
  }
  // ---------------------------------------------------------------- layout
  function resize() { const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(200, r.width); H = Math.max(80, r.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); } dirty = true; }
  function fit() { st.ppb = Math.max(4, (W - HEAD() - 16) / totalBeats()); st.scroll = 0; dirty = true; }
  function zoomBy(f, atX = null) { const x = atX ?? (xOf(st.playhead) > HEAD() && xOf(st.playhead) < W ? xOf(st.playhead) : HEAD() + (W - HEAD()) / 2), b0 = bOf(x);
    st.ppb = Math.max(3, Math.min(480, st.ppb * f)); st.scroll = b0 - (x - HEAD()) / st.ppb; clampScroll(); dirty = true; }
  function zoomRange(b0, b1) { const span = Math.max(0.5, b1 - b0), pad = span * 0.1; st.ppb = Math.max(3, Math.min(480, (W - HEAD() - 16) / (span + 2 * pad))); st.scroll = b0 - pad; clampScroll(); dirty = true; }
  function clampScroll() { const vis = (W - HEAD()) / st.ppb; st.scroll = Math.max(-0.5, Math.min(st.scroll, Math.max(-0.5, totalBeats() - vis + 1))); const maxV = Math.max(0, totalH() - (H - TOP - MINI())); st.vscroll = st.collapsed ? 0 : Math.max(0, Math.min(st.vscroll, maxV)); }
  // ---------------------------------------------------------------- value mapping (number lanes)
  function vrange(row) {
    const p = reg().byPath[row.path] || {}, K = row.track ? row.track.keys : []; let mn = p.min ?? 0, mx = p.max ?? 1;
    if ((row.h >= 40 || row.graph) && K.length) { let a = Infinity, z = -Infinity; for (const k of K) { a = Math.min(a, +k.v); z = Math.max(z, +k.v); } const d = cues.sheet.base[row.path] ?? p.default; if (Number.isFinite(+d)) { a = Math.min(a, +d); z = Math.max(z, +d); }
      const pad = Math.max((z - a) * 0.22, Math.abs(z) * 0.02, p.step || 0.01); mn = a - pad; mx = z + pad; }
    return [mn, mx];
  }
  const vyOf = (row, y, h) => { const [mn, mx] = vrange(row), pad = h >= 40 ? 10 : 4; return (v) => y + h - pad - (h - 2 * pad) * Math.max(-0.4, Math.min(1.4, (+v - mn) / ((mx - mn) || 1))); };
  const valAt = (row, y, h, py) => { const [mn, mx] = vrange(row), pad = h >= 40 ? 10 : 4; return mn + (y + h - pad - py) / (h - 2 * pad) * (mx - mn); };
  // ---------------------------------------------------------------- drawing
  const valueText = (row, k) => { if (row.kind === 'clip' && row.path === 'text.cue') return String(k.v || '').slice(0, 40); if (row.kind === 'clip' && row.path === 'term.line') { const v = k.v, T = cues.tags('').social || {}; return String(typeof v === 'number' || /^\d+$/.test(String(v)) ? (T.terminal || [])[+v] ?? '' : v).slice(0, 40); }
    if (row.kind === 'clip') return row.path === 'fx.glitch' ? `glitch ${Math.round((+k.v || 0) * 100)}%` : 'hero';
    if (row.kind === 'shot') return `${k.transition === 'cut' ? 'cut' : 'push'} → ${k.v}`; if (row.kind === 'number') return (+k.v).toFixed(+k.v % 1 ? 2 : 0); if (row.kind === 'bool') return k.v ? 'on' : 'off'; return String(k.v); };
  /** Key glyph by interpolation: diamond = linear / named ease, circle = bezier, circle + dot = auto, square = hold. */
  const shapeOf = (row, k) => (row.kind === 'number' || row.kind === 'color' || row.kind === 'shot' ? (k.ty === 'bezier' ? 'circle' : k.ty === 'auto' ? 'auto' : k.ty === 'hold' || (!k.ty && k.ease === 'step') ? 'square' : 'diamond') : 'diamond');
  function glyph(x, y, r, shape, fill, stroke) {
    g.beginPath(); if (shape === 'circle' || shape === 'auto') g.arc(x, y, r * 0.85, 0, Math.PI * 2); else if (shape === 'square') g.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5); else { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
    g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1; }
    if (shape === 'auto') { g.fillStyle = colors.bg; g.beginPath(); g.arc(x, y, r * 0.3, 0, Math.PI * 2); g.fill(); }
  }
  function curvePath(row, h) {
    const t = row.track, ev = cues.ev(), hx = HEAD(), x0 = Math.max(hx, xOf(0)), x1 = Math.min(W, xOf(totalBeats())), key = [cues.version, st.ppb, st.scroll, h, W, row.graph ? 1 : 0].join('|'), c = curveCache.get(t);
    if (c && c.key === key) return c; const p = reg().byPath[row.path] || {}, def = cues.sheet.base[row.path] ?? p.default ?? t.keys[0].v, vy = vyOf(row, 0, h), line = new Path2D(), area = new Path2D();
    let first = true; area.moveTo(x0, h);
    for (let x = x0; x <= x1 + 1.9; x += 2) { const xx = Math.min(x, x1), y = vy(ev.trackValue(t, bOf(xx), def)); if (first) { line.moveTo(xx, y); first = false; } else line.lineTo(xx, y); area.lineTo(xx, y); }
    area.lineTo(x1, h); area.closePath(); const o = { key, line, area }; curveCache.set(t, o); return o;
  }
  function handlePoints(row, i, y, h) {   // screen points of key i's in / out handles (bezier segments only)
    const K = row.track.keys, k = K[i], nx = K[i + 1], pv = K[i - 1], vy = vyOf(row, y, h), o = {};
    if (k.ty === 'bezier' && nx) { const ob = k.ob || [1 / 3, 1 / 3]; o.out = [xOf(k.b + ob[0] * (nx.b - k.b)), vy(+k.v + ob[1] * (+nx.v - +k.v))]; }
    if (pv && pv.ty === 'bezier') { const ib = k.ib || [-1 / 3, -1 / 3]; o.in = [xOf(k.b + ib[0] * (k.b - pv.b)), vy(+k.v + ib[1] * (+k.v - +pv.v))]; }
    return o;
  }
  function drawRow(row, y, h, compact = false) {
    const t = row.track, C = colors, hx = HEAD(), sel = (k) => st.sel.has(k.id), mid = y + h / 2, tall = !compact && h >= 40;
    if (row.summary) { g.save(); g.beginPath(); g.rect(hx, y, W - hx, h); g.clip(); for (const m of row.members) if (m.track) for (const k of m.track.keys) { const x = xOf(k.b); if (x < hx - 8 || x > W + 8) continue; if (m.kind === 'clip') { g.fillStyle = sel(k) ? C.acc : C.line2; g.fillRect(x, y + h - 6, Math.max(2, xOf(k.b + (k.dur ?? 1)) - x), 3); }
      glyph(x, mid - 1, 4, 'diamond', sel(k) ? C.acc : C.muted); } g.restore(); return; }
    if (!t || !t.keys.length) return;
    const K = t.keys, p = reg().byPath[row.path] || {}, vy = vyOf(row, y, h), small = h < 20;
    g.save(); g.beginPath(); g.rect(hx, y, W - hx, h); g.clip();
    g.font = `500 ${compact || small ? 9 : 11}px "JetBrains Mono", monospace`; g.textBaseline = 'middle';
    if (row.kind === 'number' && !compact) {   // the evaluated curve (same evaluator as playback)
      const c = curvePath(row, h), focus = rows[st.focusRow] === row; g.translate(0, y);
      if (tall) { g.fillStyle = C.acc; g.globalAlpha = 0.07; g.fill(c.area); g.globalAlpha = 1; }
      g.strokeStyle = focus || tall ? C.acc : C.muted; g.globalAlpha = focus || tall ? 0.9 : 1; g.lineWidth = tall ? 2 : 1.5; g.stroke(c.line); g.globalAlpha = 1; g.lineWidth = 1; g.translate(0, -y);
      if (tall) { const [mn, mx] = vrange(row), d = mx - mn < 3 ? 2 : 0; g.fillStyle = C.muted; g.font = '400 9px "JetBrains Mono", monospace'; g.textAlign = 'right'; g.fillText(mx.toFixed(d), W - 8, y + 7); g.fillText(mn.toFixed(d), W - 8, y + h - 6); g.textAlign = 'left'; g.font = `500 11px "JetBrains Mono", monospace`; }
    }
    if (row.kind === 'color' && !compact) { const ev = cues.ev(), x0 = Math.max(hx, xOf(K[0].b)), x1 = Math.min(W, xOf(totalBeats())); for (let x = x0; x < x1; x += 4) { g.fillStyle = ev.trackValue(t, bOf(x), K[0].v); g.fillRect(x, y + h - 6, 4, 3); } }
    for (let i = 0; i < K.length; i++) { const k = K[i], nx = K[i + 1], x = xOf(k.b), s = sel(k);
      if (x > W + 400 || (nx && xOf(nx.b) < hx - 400 && row.kind !== 'shot' && row.kind !== 'clip')) continue;
      if (row.kind === 'clip') { const x1 = xOf(k.b + (k.dur ?? 1)); g.fillStyle = s ? C.acc : C.line2; g.fillRect(x, y + 3, Math.max(2, x1 - x), h - 6); g.fillStyle = s ? C.onAcc : C.fg; if (!compact && !small && x1 - x > 24) g.fillText(valueText(row, k), x + 6, mid, x1 - x - 10);
        g.fillStyle = s ? C.onAcc : C.muted; g.fillRect(x1 - 3, y + Math.min(6, h / 4), 2, h - 2 * Math.min(6, h / 4)); continue; }
      if (row.kind === 'event') { g.fillStyle = s ? C.acc : C.fg; g.fillRect(x - 1, y + 3, 2, h - 6); glyph(x, y + Math.min(7, h / 2), small ? 4 : 5, 'diamond', s ? C.acc : C.fg); continue; }
      if (row.kind === 'shot') { const push = k.transition !== 'cut', x0 = push ? xOf(k.b - (k.dur ?? 1)) : x, x1 = nx ? xOf(nx.b - (nx.transition !== 'cut' ? nx.dur ?? 1 : 0)) : W, wide = k.v === 'wide';
        if (push) { g.fillStyle = s ? C.acc : C.line2; g.beginPath(); g.moveTo(x0, y + h - 4); g.lineTo(x, y + 4); g.lineTo(x, y + h - 4); g.closePath(); g.fill(); }
        if (!wide) { g.fillStyle = s ? C.acc : C.line2; g.globalAlpha = s ? .35 : .9; g.fillRect(x, y + 4, Math.max(0, x1 - x), h - 8); g.globalAlpha = 1; }
        if (!compact) { g.fillStyle = wide ? C.muted : C.fg; g.fillText(wide ? 'wide' : k.v, x + 8, mid, Math.max(10, x1 - x - 12)); }
        glyph(x, mid, compact || small ? 4 : 6, shapeOf(row, k), s ? C.acc : C.fg, s ? C.fg : null); continue; }
      if (row.kind !== 'number') { const x1 = nx ? xOf(nx.b) : W; g.fillStyle = C.lane; g.fillRect(x, y + 3, x1 - x, h - 6); g.strokeStyle = C.line2; g.strokeRect(x + .5, y + 3.5, x1 - x - 1, h - 7);
        if (!compact) { g.fillStyle = C.fg; g.fillText(valueText(row, k), x + 10, mid, Math.max(10, x1 - x - 16)); } }
      const ky = row.kind === 'number' && !compact ? vy(k.v) : mid;
      if (row.kind === 'number' && !compact && !small) { const lab = valueText(row, k) + (p.unit && p.unit.length <= 3 ? p.unit : ''); g.fillStyle = s ? C.acc : C.fg; g.fillText(lab, x + 9, Math.max(y + 7, Math.min(y + h - 7, ky - 7)), 60); }
      if (row.kind === 'number' && tall && s) { const hp = handlePoints(row, i, y, h); g.strokeStyle = C.acc; g.lineWidth = 1;
        for (const q of [hp.in, hp.out]) if (q) { g.beginPath(); g.moveTo(x, ky); g.lineTo(q[0], q[1]); g.stroke(); g.fillStyle = C.bg; g.beginPath(); g.arc(q[0], q[1], 3.5, 0, Math.PI * 2); g.fill(); g.stroke(); } }
      glyph(x, ky, compact || small ? 4 : 6, shapeOf(row, k), s ? C.acc : C.fg, s ? C.fg : null);
    }
    g.restore();
  }
  function hatch(x, y, w, h) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = colors.line2; g.lineWidth = 1; g.beginPath(); for (let i = x - h; i < x + w; i += 8) { g.moveTo(i, y + h); g.lineTo(i + h, y); } g.stroke(); g.restore(); }
  function drawMarkers(hx) {
    const C = colors, y0 = RULER + SECT, M = markers(); g.save(); g.beginPath(); g.rect(hx, y0, W - hx, MARK); g.clip();
    for (const m of [...M.filter((q) => !q.user), ...M.filter((q) => q.user)]) { const x = Math.round(xOf(m.b)) + .5; if (x < hx - 40 || x > W + 2) continue;
      if (m.user) { if (m.label && st.ppb > 6) { g.font = '500 9px "JetBrains Mono", monospace'; const tw = Math.min(80, g.measureText(m.label).width); g.fillStyle = C.panel; g.fillRect(x + 7, y0 + 1, tw + 4, MARK - 2); }
        g.fillStyle = m.id === st.selMarker ? C.fg : (MARKER_COLOR[m.kind] || C.acc); g.beginPath(); g.moveTo(x - .5, y0 + 1); g.lineTo(x + 6, y0 + 1); g.lineTo(x + 6, y0 + 6); g.lineTo(x + 1.5, y0 + 9); g.lineTo(x - .5, y0 + MARK); g.closePath(); g.fill();
        if (m.label && st.ppb > 6) { g.font = '500 9px "JetBrains Mono", monospace'; g.fillText(m.label, x + 9, y0 + MARK / 2, 80); } continue; }
      if (m.kind === 'section') { g.fillStyle = C.fg; g.fillRect(x - .5, y0, 2, MARK); continue; }
      if (m.kind === 'downbeat') { g.fillStyle = C.line2; g.fillRect(x - .5, y0 + 2, 1, MARK - 3); continue; }
      if (m.kind === 'beat') { g.fillStyle = C.line2; g.fillRect(x - .5, y0 + MARK - 4, 1, 3); continue; }
      if (m.kind === 'kick') { const r = 2.5 + 2 * m.s; g.fillStyle = C.fg; g.globalAlpha = .45 + .55 * m.s; g.beginPath(); g.moveTo(x - r, y0 + 2); g.lineTo(x + r, y0 + 2); g.lineTo(x, y0 + 2 + r * 1.6); g.closePath(); g.fill(); g.globalAlpha = 1; continue; }
      if (m.kind === 'snare') { g.strokeStyle = C.fg; g.globalAlpha = .45 + .55 * m.s; g.strokeRect(x - 2.5, y0 + MARK - 7, 5, 5); g.globalAlpha = 1; continue; }
      if (m.kind === 'hat') { g.fillStyle = C.muted; g.fillRect(x - .5, y0 + MARK - 3, 1, 2); } }
    g.restore();
  }
  function drawMini(hx) {
    const C = colors, y0 = H - MINI(), w = W - hx, tb = totalBeats(), mx = (b) => hx + b / tb * w; g.fillStyle = C.panel; g.fillRect(0, y0, W, MINI()); g.fillStyle = C.line2; g.fillRect(0, y0, W, 1);
    const e = app.clip.current(), L = e && e.ready ? e.labels : []; L.forEach((l, i) => { if (l === 'drop') { g.fillStyle = C.line; g.fillRect(mx(i * 4), y0 + 1, w / tb * 4, MINI() - 1); } });
    g.fillStyle = C.muted; for (const [, k] of allKeys()) g.fillRect(Math.round(mx(k.b)), y0 + 4, 1, MINI() - 7);
    const vis = (W - hx) / st.ppb, a = mx(Math.max(0, st.scroll)), z = mx(Math.min(tb, st.scroll + vis)); g.strokeStyle = C.acc; g.lineWidth = 1; g.strokeRect(a + .5, y0 + 1.5, Math.max(6, z - a) - 1, MINI() - 3); g.fillStyle = C.acc; g.globalAlpha = .1; g.fillRect(a, y0 + 1, Math.max(6, z - a), MINI() - 2); g.globalAlpha = 1;
    g.fillRect(mx(st.playhead), y0 + 1, 1, MINI() - 1); g.fillStyle = C.muted; g.font = '500 9px "JetBrains Mono", monospace'; g.textBaseline = 'middle'; g.fillText(`${Math.round(vis / 4 * 10) / 10} / ${bars()} bars`, 10, y0 + MINI() / 2 + 1);
  }
  /** Header buttons per row, right to left. */
  const headBtns = (r) => (r.summary ? [] : r.custom ? ['x', 'M', 'L', 'S', 'T'] : ['M', 'L', 'S', 'T']);
  const BTN = 14, navX = (r) => (r.h >= 40 ? HEAD() - 10 - 3 * BTN - 5 : HEAD() - 12 - headBtns(r).length * BTN - 40), navY = (r, y) => (r.h >= 40 ? y + 33 : y + Math.min(r.h, 23) / 2);
  function drawHead(r, i, y, h) {
    const C = colors, hx = HEAD(), t = r.track, focus = i === st.focusRow, hover = st.hover === i, mid = y + Math.min(h, 23) / 2;
    g.save(); g.beginPath(); g.rect(0, Math.max(TOP, y), hx, h); g.clip();
    g.fillStyle = focus ? C.line2 : 'transparent'; g.fillRect(0, y, hx, h); if (focus) { g.fillStyle = C.acc; g.fillRect(0, y, 3, h - 1); }
    if (t && t.target) { g.fillStyle = C.acc; g.globalAlpha = .14; g.fillRect(3, y, hx - 3, h - 1); g.globalAlpha = 1; }
    if (r.gsize >= 2 && (r.gfirst || r.summary)) { g.strokeStyle = C.muted; g.lineWidth = 1.5; g.beginPath(); if (r.summary) { g.moveTo(7, mid - 4); g.lineTo(11, mid); g.lineTo(7, mid + 4); } else { g.moveTo(5, mid - 2); g.lineTo(9, mid + 2); g.lineTo(13, mid - 2); } g.stroke(); g.lineWidth = 1; }
    else if (r.gsize >= 2) { g.fillStyle = C.line2; g.fillRect(9, y, 1, h); }
    const btns = headBtns(r), labW = hx - 18 - btns.length * BTN - 6, fs = h < 20 ? 10 : 11;
    g.fillStyle = t && (t.mute || (cues.ev().soloing && !t.solo)) ? C.muted : C.fg; g.font = `500 ${fs}px "JetBrains Mono", monospace`; g.textBaseline = 'middle'; g.fillText(r.label.toUpperCase(), 18, mid, labW);
    if (h >= 40 && r.kind === 'number') { const p = reg().byPath[r.path] || {}, v = cues.ev().trackValue && t && t.keys.length ? cues.ev().trackValue(t, st.playhead, cues.sheet.base[r.path] ?? p.default) : (cues.sheet.base[r.path] ?? p.default); g.fillStyle = C.muted; g.font = '400 10px "JetBrains Mono", monospace'; if (Number.isFinite(+v)) g.fillText(`${(+v).toFixed(2)}${p.unit && p.unit.length <= 3 ? p.unit : ''}`, 18, y + 33, labW); }
    btns.forEach((b, j) => { const cx = hx - 10 - j * BTN, on = b === 'M' ? t && t.mute : b === 'L' ? t && t.lock : b === 'S' ? t && t.solo : b === 'T' ? t && t.target : false;
      g.fillStyle = on ? C.acc : C.muted; g.font = '500 10px "JetBrains Mono", monospace'; g.textAlign = 'center';
      if (b === 'L') { g.strokeStyle = on ? C.acc : C.muted; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, mid - 2, 2.5, Math.PI, 0); g.stroke(); g.lineWidth = 1; on ? g.fillRect(cx - 3.5, mid - 1.5, 7, 5.5) : g.strokeRect(cx - 3, mid - 1, 6, 5); }
      else if (b === 'T') { if (on) g.fillRect(cx - 3.5, mid - 3.5, 7, 7); else { g.strokeStyle = C.muted; g.strokeRect(cx - 3, mid - 3, 6, 6); } }
      else g.fillText(b === 'x' ? '×' : b, cx, mid);
      g.textAlign = 'left'; });
    if ((focus || hover) && !r.summary && h >= 16) {   // ‹ ◆ ›: previous key, add / remove at the playhead, next key
      const x0 = navX(r), ny = navY(r, y), onKey = t && t.keys.some((k) => Math.abs(k.b - st.playhead) < HALF_FRAME());
      if (h < 40) { g.fillStyle = C.panel; g.fillRect(x0 - 4, y + 1, 44, Math.min(h, 23) - 2); } g.fillStyle = C.muted; g.font = '500 11px "JetBrains Mono", monospace'; g.textAlign = 'center';
      g.fillText('‹', x0 + 5, ny); g.fillText('›', x0 + 33, ny); g.textAlign = 'left'; glyph(x0 + 19, ny, 4.5, 'diamond', onKey ? C.acc : 'transparent', onKey ? null : C.muted); }
    g.fillStyle = C.line; g.fillRect(0, y + h - 1, hx, 1); g.restore();
  }
  function draw() {
    if (!colors) css(); const C = colors, hx = HEAD(), tb = totalBeats();
    buildRows(); clampScroll();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const LB = H - MINI();   // lane area bottom
    if (st.collapsed) { g.fillStyle = C.lane; g.fillRect(hx, TOP, W - hx, PHONE_ROW); const all = rowsWithKeys(), sub = (PHONE_ROW - 8) / all.length; all.forEach((r, i) => drawRow(r, TOP + 4 + i * sub, sub, true)); }
    else { g.save(); g.beginPath(); g.rect(0, TOP, W, LB - TOP); g.clip();
      rows.forEach((r, i) => { const y = rowY(i), rh = r.h; if (y + rh < TOP || y > LB) return; g.fillStyle = i === st.focusRow ? C.line : (i % 2 ? C.lane : 'transparent'); g.fillRect(hx, y, W - hx, rh); g.fillStyle = C.line; g.fillRect(hx, y + rh - 1, W - hx, 1);
        drawRow(r, y, rh); if (locked(r)) hatch(hx, y, W - hx, rh - 1); });
      g.restore(); }
    // grid lines over the lanes
    const sg = snapGrid() || .25, step = st.ppb * sg < 6 ? (st.ppb < 6 ? 4 : 1) : sg;
    g.save(); g.beginPath(); g.rect(hx, TOP, W - hx, LB - TOP); g.clip();
    for (let b = Math.max(0, Math.floor(st.scroll / step) * step); b <= tb; b += step) { const x = Math.round(xOf(b)) + .5; if (x > W) break; g.fillStyle = b % 4 === 0 ? C.line2 : C.line; g.fillRect(x, TOP, 1, LB - TOP); }
    g.fillStyle = 'rgba(0,0,0,.35)'; const xe = xOf(tb); if (xe < W) g.fillRect(xe, TOP, W - xe, LB - TOP);
    if (st.guide) { const x = Math.round(xOf(st.guide.b)) + .5; g.strokeStyle = C.acc; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, LB); g.stroke(); g.setLineDash([]); }
    g.restore();
    // ruler + sections + markers
    g.fillStyle = C.panel; g.fillRect(0, 0, W, TOP); g.fillStyle = C.line2; g.fillRect(0, TOP - 1, W, 1); g.fillRect(0, RULER, W, 1); g.fillStyle = C.line; g.fillRect(0, RULER + SECT, W, 1);
    g.save(); g.beginPath(); g.rect(hx, 0, W - hx, TOP); g.clip(); g.font = '500 10px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    const e = app.clip.current(), labels = e && e.ready ? e.labels : [];
    let s0 = 0; for (let k = 1; k <= labels.length; k++) if (k === labels.length || labels[k] !== labels[s0]) { const x0 = xOf(s0 * 4), x1 = xOf(k * 4); g.fillStyle = labels[s0] === 'drop' ? C.line2 : C.line; g.fillRect(x0 + 1, RULER + 2, x1 - x0 - 2, SECT - 4); g.fillStyle = labels[s0] === 'drop' ? C.fg : C.muted; g.fillText(labels[s0], x0 + 5, RULER + SECT / 2, x1 - x0 - 8); s0 = k; }
    const lbl = st.ppb * 4 < 26 ? (st.ppb * 4 < 12 ? 8 : 4) : 1;
    for (let b = Math.max(0, Math.floor(st.scroll)); b <= tb; b++) { const x = Math.round(xOf(b)) + .5; if (x > W) break; const bar = b % 4 === 0;
      if (!bar && st.ppb < 8) continue; g.fillStyle = bar ? C.fg : C.muted; g.fillRect(x, bar ? 3 : 14, 1, bar ? RULER - 3 : RULER - 14);
      if (bar && (b / 4) % lbl === 0) { g.fillStyle = C.fg; g.fillText(String(b / 4 + 1), x + 4, 9); } else if (!bar && st.ppb > 40) { g.fillStyle = C.muted; g.fillText(`.${b % 4 + 1}`, x + 3, 9); } }
    if (st.loop) { const a = xOf(st.loop.a), z = xOf(st.loop.b); g.fillStyle = C.acc; g.globalAlpha = .22; g.fillRect(a, 0, z - a, RULER); g.globalAlpha = 1; g.fillRect(a, 0, 2, RULER); g.fillRect(z - 2, 0, 2, RULER);
      g.globalAlpha = .06; g.fillRect(a, TOP, z - a, LB - TOP); g.globalAlpha = 1; }
    g.restore();
    drawMarkers(hx);
    // headers
    g.fillStyle = C.panel; g.fillRect(0, TOP, hx, LB - TOP); g.fillStyle = C.line2; g.fillRect(hx - 1, 0, 1, LB);
    g.font = '500 11px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    if (st.collapsed) { g.fillStyle = C.fg; g.fillText('CUES', 10, TOP + 14); g.fillStyle = C.muted; g.font = '400 10px "JetBrains Mono", monospace'; g.fillText(`${allKeys().length} keys`, 10, TOP + 32); }
    else { g.save(); g.beginPath(); g.rect(0, TOP, hx, LB - TOP); g.clip(); rows.forEach((r, i) => { const y = rowY(i); if (y + r.h < TOP || y > LB) return; drawHead(r, i, y, r.h); }); g.restore(); }
    g.fillStyle = C.panel; g.fillRect(0, 0, hx, TOP); g.fillStyle = C.muted; g.font = '500 10px "JetBrains Mono", monospace';
    g.fillText(st.collapsed ? 'BAR' : `BAR · SNAP ${TL().snap.toUpperCase()}${TL().magnet !== false ? ' · MAG' : ''}`, 10, RULER / 2); g.fillText(st.collapsed ? '' : 'SECTION', 10, RULER + SECT / 2);
    g.fillStyle = density() === 'off' ? C.muted : C.fg; g.fillText(st.collapsed ? 'MKR' : `MARKERS · ${DENSITY_LABEL[density()].toUpperCase()} ▾`, 10, RULER + SECT + MARK / 2);
    g.fillStyle = C.line2; g.fillRect(0, RULER, hx, 1); g.fillStyle = C.line; g.fillRect(0, RULER + SECT, hx, 1); g.fillStyle = C.line2; g.fillRect(0, TOP - 1, hx, 1);
    // vertical scroll affordance
    const total = totalH(), view = LB - TOP; if (!st.collapsed && total > view + 1) { const th = Math.max(18, view * view / total), ty = TOP + (view - th) * st.vscroll / (total - view); g.fillStyle = C.line2; g.fillRect(W - 4, TOP, 4, view); g.fillStyle = C.muted; g.fillRect(W - 4, ty, 4, th);
      if (st.vscroll < total - view - 1) { const hidden = rows.filter((r) => TOP + r.y - st.vscroll + r.h / 2 > LB).length; if (hidden) { g.fillStyle = C.acc; g.font = '500 10px "JetBrains Mono", monospace'; g.textAlign = 'right'; g.fillText(`+${hidden} ↓`, hx - 10, RULER + SECT / 2); g.textAlign = 'left'; } } }
    if (!st.collapsed) drawMini(hx);
    // marquee
    if (drag && drag.kind === 'marquee' && drag.moved) { const [x0, y0, x1, y1] = drag.box; g.strokeStyle = C.acc; g.setLineDash([4, 3]); g.strokeRect(Math.min(x0, x1) + .5, Math.min(y0, y1) + .5, Math.abs(x1 - x0), Math.abs(y1 - y0)); g.setLineDash([]); g.fillStyle = C.acc; g.globalAlpha = .08; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); g.globalAlpha = 1; }
    // playhead
    const px = Math.round(xOf(st.playhead)); if (px >= hx && px <= W) { g.fillStyle = C.acc; g.fillRect(px - .5, 0, 2, LB); g.beginPath(); g.moveTo(px - 6, 0); g.lineTo(px + 7, 0); g.lineTo(px + .5, 8); g.fill(); }
    if (st.graph) { g.fillStyle = C.acc; g.font = '500 10px "JetBrains Mono", monospace'; g.textAlign = 'right'; g.fillText('GRAPH · E closes', W - 12, TOP + 10); g.textAlign = 'left'; }
    dirty = false;
  }
  // ---------------------------------------------------------------- hit testing
  function hit(x, y) {
    const hx = HEAD(); if (y < RULER) return { zone: 'ruler' }; if (y < RULER + SECT) return { zone: 'sect' }; if (y < TOP) return { zone: x < hx ? 'markhead' : 'mark' };
    if (!st.collapsed && y >= H - MINI()) return { zone: x < hx ? 'empty' : 'mini' };
    const ri = rowAt(y); if (x < hx) return headHit(x, y, ri);
    if (st.collapsed) { let best = null, bd = 18; for (const [r, k] of allKeys()) { const xs = [xOf(k.b)]; if (r.kind === 'clip') xs.push(xOf(k.b + (k.dur ?? 1)) - 4);
        for (const xx of xs) { const d = Math.abs(xx - x); if (d < bd) { bd = d; best = { zone: 'key', row: r, key: k, part: 'body', ri: 0 }; } } } return best || { zone: 'lane', ri: 0 }; }
    const row = rows[ri]; if (!row) return { zone: 'empty' };
    const h = row.h, y0 = rowY(ri), mid = y0 + h / 2;
    if (locked(row)) return { zone: 'lane', ri, row, locked: true };
    if (row.summary) { let best = null, bd = 7; for (const m of row.members) if (m.track && !locked(m)) for (const k of m.track.keys) { const d = Math.abs(xOf(k.b) - x); if (d < bd) { bd = d; best = { zone: 'key', row: m, key: k, part: 'body', ri }; } } return best || { zone: 'lane', ri, row }; }
    const K = row.track ? row.track.keys : [];
    if (row.kind === 'number' && h >= 40) for (let i = 0; i < K.length; i++) if (st.sel.has(K[i].id)) { const hp = handlePoints(row, i, y0, h); for (const side of ['out', 'in']) if (hp[side] && Math.hypot(hp[side][0] - x, hp[side][1] - y) <= 6) return { zone: 'handle', row, key: K[i], idx: i, side, ri }; }
    const vy = vyOf(row, y0, h);
    for (let i = K.length - 1; i >= 0; i--) { const k = K[i], x0 = xOf(k.b);
      if (row.kind === 'clip') { const x1 = xOf(k.b + (k.dur ?? 1)); if (x >= x1 - 6 && x <= x1 + 3) return { zone: 'key', row, key: k, part: 'end', ri }; if (x1 - x0 > 16 && x >= x0 - 3 && x <= x0 + 5) return { zone: 'key', row, key: k, part: 'start', ri }; if (x >= x0 - 3 && x < x1) return { zone: 'key', row, key: k, part: 'body', ri }; continue; }
      const ky = row.kind === 'number' ? vy(k.v) : mid;
      if (Math.abs(x - x0) <= 7 && Math.abs(y - ky) <= Math.max(7, Math.min(9, h / 2))) return { zone: 'key', row, key: k, part: 'body', ri };
      if (row.kind === 'shot' && k.transition !== 'cut' && Math.abs(x - xOf(k.b - (k.dur ?? 1))) <= 4 && x0 - xOf(k.b - (k.dur ?? 1)) > 10) return { zone: 'key', row, key: k, part: 'moveLen', ri };   // v24: drag the start edge = the move length
      if (row.kind === 'shot' && k.transition !== 'cut' && x >= xOf(k.b - (k.dur ?? 1)) && x < x0) return { zone: 'key', row, key: k, part: 'body', ri };
    }
    if (row.kind !== 'number' && row.kind !== 'event' && row.kind !== 'clip') { const b = bOf(x); let k = null; for (const q of K) if (q.b <= b) k = q; if (k && x - xOf(k.b) > 7) return { zone: 'key', row, key: k, part: 'seg', ri }; }
    return { zone: 'lane', ri, row };
  }
  function headHit(x, y, ri) {
    const r = rows[ri]; if (!r) return { zone: 'head', ri: -1 }; const hx = HEAD(), y0 = rowY(ri), h = r.h, top = y0 + Math.min(h, 23);
    if (!r.summary && y > y0 + h - 4 && h >= 14) return { zone: 'head', ri, part: 'resize' };
    if (r.gsize >= 2 && (r.gfirst || r.summary) && x < 16 && y < top) return { zone: 'head', ri, part: 'chevron' };
    if (y < top) { const btns = headBtns(r); for (let j = 0; j < btns.length; j++) { const cx = hx - 10 - j * BTN; if (Math.abs(x - cx) <= BTN / 2) return { zone: 'head', ri, part: btns[j] }; }
    }
    if (!r.summary && Math.abs(y - navY(r, y0)) < 9) { const x0 = navX(r); if (x >= x0 - 4 && x < x0 + 12) return { zone: 'head', ri, part: 'prev' }; if (x >= x0 + 12 && x < x0 + 27) return { zone: 'head', ri, part: 'kf' }; if (x >= x0 + 27 && x < x0 + 40) return { zone: 'head', ri, part: 'next' }; }
    return { zone: 'head', ri, part: 'label' };
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
  function addKeyAt(row, b) { if (locked(row)) return; cues.edit(() => { const t = ensureTrack(row), k = newKeyFor(row, b); t.auto = false; t.keys = t.keys.filter((q) => Math.abs(q.b - b) > 1e-6); t.keys.push(k); t.keys.sort((x, y) => x.b - y.b); st.sel = new Set([k.id]); }, 'add key'); app.inspector && app.inspector.show(); }
  const sortAll = () => { for (const t of cues.sheet.tracks) t.keys.sort((a, b) => a.b - b.b); };
  const targeted = () => rowsWithKeys().filter((r) => r.track && r.track.target);
  /** Lanes a selection-free command acts on: targeted lanes, else the focused lane. */
  const scopeRows = () => { const t = targeted(); if (t.length) return t; const r = rows[st.focusRow]; return r ? (r.summary ? r.members : [r]) : []; };
  const viewTouch = (fn) => cues.touch(fn, 'view');
  // ---------------------------------------------------------------- pointer
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const seekBeat = (b, snapGrid_) => { const bt = BEAT(); let bb = Math.max(0, Math.min(totalBeats(), b)); if (snapGrid_) bb = snapBeat(bb, snapGrid_); let t = bb * bt; t = Math.min(Math.round(t / FRAME) * FRAME, totalBeats() * bt - FRAME); app.actions.seek(P().inT + t); st.playhead = t / bt; dirty = true; };
  function headClick(h, e, x) {
    const r = rows[h.ri]; if (!r) return; st.focusRow = h.ri; const part = h.part;
    if (part === 'chevron') { api.toggleGroup(r.group); return; }
    if (part === 'resize') { drag = { kind: 'laneH', row: r, y0: pos(e)[1], h0: r.h }; return; }
    if (part === 'x' && r.custom) { cues.edit((s) => { s.tracks = s.tracks.filter((t) => t !== r.track); }, 'remove track'); return; }
    if (part === 'M' && r.track) { cues.edit(() => { r.track.mute = !r.track.mute; }, 'mute'); return; }
    if (part === 'S') { cues.edit(() => { const t = ensureTrack(r); t.solo = !t.solo; }, 'solo'); return; }
    if (part === 'L') { cues.edit(() => { const t = ensureTrack(r); t.lock = !t.lock; if (t.lock) for (const k of t.keys) st.sel.delete(k.id); }, 'lock'); app.inspector && app.inspector.show(); return; }
    if (part === 'T') { if (e.shiftKey) { const any = targeted().length > 0; viewTouch(() => { for (const q of rowsWithKeys()) { if (any) { if (q.track) q.track.target = false; } else ensureTrack(q).target = true; } }); }
      else viewTouch(() => { const t = ensureTrack(r); t.target = !t.target; }); return; }
    if (part === 'prev' || part === 'next') { api.navKey(part === 'next' ? 1 : -1, [r]); return; }
    if (part === 'kf') { api.toggleKey([r]); return; }
    app.inspector && app.inspector.showTrack(r.path);
  }
  cv.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return; cv.focus({ preventScroll: true }); const [x, y] = pos(e), h = hit(x, y); cv.setPointerCapture(e.pointerId); st.guide = null;
    if (h.zone === 'markhead') { const i = DENSITY.indexOf(density()); setTL({ density: DENSITY[(i + 1) % DENSITY.length] }); dirty = true; return; }
    if (h.zone === 'mark') { const M = markers(); let best = null, bd = 8; for (const m of M) { const d = Math.abs(xOf(m.b) - x) - (m.user ? 2 : 0) - MARKER_PRI[m.kind] * 0.2; if (d < bd) { bd = d; best = m; } }
      st.selMarker = best && best.user ? best.id : null; if (best) seekBeat(best.b); else seekBeat(bOf(x), snapGrid()); if (st.selMarker) { st.sel.clear(); app.inspector && app.inspector.show(); } dirty = true; return; }
    if (h.zone === 'mini') { const hx = HEAD(), tb = totalBeats(), w = W - hx, vis = (W - hx) / st.ppb, b = (x - hx) / w * tb, a = st.scroll, z = st.scroll + vis, xa = hx + a / tb * w, xz = hx + z / tb * w;
      if (Math.abs(x - xa) < 5) drag = { kind: 'miniA', z }; else if (Math.abs(x - xz) < 5) drag = { kind: 'miniB', a }; else { if (b < a || b > z) { st.scroll = b - vis / 2; clampScroll(); } drag = { kind: 'miniPan', x0: x, s0: st.scroll }; } dirty = true; return; }
    if (h.zone === 'ruler' || h.zone === 'sect') { const b = bOf(x);
      if (st.loop && Math.abs(xOf(st.loop.a) - x) < 6) drag = { kind: 'loopA' }; else if (st.loop && Math.abs(xOf(st.loop.b) - x) < 6) drag = { kind: 'loopB' };
      else if (e.altKey) { const s = snapBeat(b, snapGrid() || .25); st.loop = { a: s, b: s }; drag = { kind: 'loopB' }; }
      else { drag = { kind: 'scrub' }; seekBeat(b, e.shiftKey ? snapGrid() : 0); } if (drag.kind !== 'scrub') snap = buildSnap(); dirty = true; return; }
    if (h.zone === 'head') { if (h.ri >= 0 && h.ri < rows.length) headClick(h, e, x); dirty = true; return; }
    if (h.zone === 'handle') { cues.begin(); drag = { kind: 'handle', row: h.row, idx: h.idx, side: h.side, moved: true, alt: e.altKey }; st.focusRow = h.ri; dirty = true; return; }
    if (h.zone === 'key') {
      const id = h.key.id; st.focusRow = h.ri; st.selMarker = null;
      if (e.shiftKey || e.metaKey || e.ctrlKey) { if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id); } else if (!st.sel.has(id)) st.sel = new Set([id]);
      const orig = new Map(); for (const sid of st.sel) { const f = findKey(sid); if (f) orig.set(sid, { b: f[1].b, dur: f[1].dur, v: f[1].v }); }
      drag = { kind: h.part === 'end' ? 'resize' : h.part === 'start' ? 'resizeL' : h.part === 'moveLen' ? 'moveLen' : 'move', x0: x, y0: y, key: h.key, row: h.row, orig, moved: false, alt: e.altKey };
      app.inspector && app.inspector.show(); dirty = true; return; }
    if (h.zone === 'lane') { st.focusRow = Math.max(0, h.ri); st.selMarker = null; drag = { kind: 'marquee', x0: x, y0: y, box: [x, y, x, y], moved: false, add: e.shiftKey, ri: h.ri }; dirty = true; }
  });
  cv.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e);
    if (!drag) { const h = hit(x, y), hov = h.zone === 'head' ? h.ri : -1; if (hov !== st.hover) { st.hover = hov; dirty = true; }
      cv.style.cursor = h.zone === 'ruler' ? 'text' : h.zone === 'mark' || h.zone === 'markhead' || h.zone === 'mini' ? 'pointer' : h.zone === 'handle' ? 'move' : h.zone === 'key' ? (h.part === 'end' || h.part === 'start' || h.part === 'moveLen' ? 'ew-resize' : 'grab') : h.zone === 'head' ? (h.part === 'resize' ? 'ns-resize' : h.part === 'label' ? 'default' : 'pointer') : 'default'; return; }
    const grid = snapGrid();
    if (drag.kind === 'scrub') { const b = bOf(x); if (TL().magnet !== false && !e.altKey && e.shiftKey) { const s = buildSnap().closest(b, SNAP_PX / st.ppb); seekBeat(s ? s.b : b, s ? 0 : grid); } else seekBeat(b, e.shiftKey ? grid : 0); return; }
    if (drag.kind === 'laneH') { const nh = Math.max(MIN_H, Math.min(MAX_H, Math.round(drag.h0 + y - drag.y0))); viewTouch(() => { ensureTrack(drag.row).h = nh; }); return; }
    if (drag.kind === 'miniPan' || drag.kind === 'miniA' || drag.kind === 'miniB') { const hx = HEAD(), tb = totalBeats(), b = (x - hx) / (W - hx) * tb;
      if (drag.kind === 'miniPan') st.scroll = drag.s0 + (x - drag.x0) / (W - hx) * tb; else if (drag.kind === 'miniA') { const a = Math.min(b, drag.z - 1); st.ppb = Math.max(3, Math.min(480, (W - hx) / (drag.z - a))); st.scroll = a; } else { const z = Math.max(b, drag.a + 1); st.ppb = Math.max(3, Math.min(480, (W - hx) / (z - drag.a))); st.scroll = drag.a; }
      clampScroll(); dirty = true; return; }
    if (drag.kind === 'loopA' || drag.kind === 'loopB') { const s = Math.min(totalBeats(), snapTo(bOf(x), { alt: e.altKey, grid: grid || .25 })); if (drag.kind === 'loopA') st.loop.a = s; else st.loop.b = s; if (st.loop.a > st.loop.b) { [st.loop.a, st.loop.b] = [st.loop.b, st.loop.a]; drag.kind = drag.kind === 'loopA' ? 'loopB' : 'loopA'; } dirty = true; return; }
    if (drag.kind === 'marquee') { drag.box[2] = x; drag.box[3] = y; drag.moved = drag.moved || Math.hypot(x - drag.x0, y - drag.y0) > 3; dirty = true; return; }
    if (drag.kind === 'handle') { const ri = rowIdx(drag.row), r = rows[ri] || drag.row, K = r.track.keys, i = drag.idx, k = K[i], y0 = rowY(ri), v = valAt(r, y0, r.h, y), b = bOf(x);
      cues.preview(() => { r.track.auto = false;
        if (drag.side === 'out') { const nx = K[i + 1], L = nx.b - k.b, dv = +nx.v - +k.v, hx_ = Math.max(0, Math.min(1, (b - k.b) / L)), hy = Math.abs(dv) > 1e-9 ? (v - +k.v) / dv : 0; k.ty = 'bezier'; k.ob = [Math.round(hx_ * 1e4) / 1e4, Math.round(hy * 1e4) / 1e4];
          const pv = K[i - 1]; if (!e.altKey && pv && pv.ty === 'bezier' && k.ib) { const Lp = k.b - pv.b, dvp = +k.v - +pv.v, slope = hx_ > 1e-6 ? hy * dv / (hx_ * L) : 0; if (Math.abs(dvp) > 1e-9) k.ib = [k.ib[0], Math.round(slope * k.ib[0] * Lp / dvp * 1e4) / 1e4]; } }
        else { const pv = K[i - 1], L = k.b - pv.b, dv = +k.v - +pv.v, hx_ = Math.max(-1, Math.min(0, (b - k.b) / L)), hy = Math.abs(dv) > 1e-9 ? (v - +k.v) / dv : 0; k.ib = [Math.round(hx_ * 1e4) / 1e4, Math.round(hy * 1e4) / 1e4];
          const nx = K[i + 1]; if (!e.altKey && nx && k.ty === 'bezier' && k.ob) { const Ln = nx.b - k.b, dvn = +nx.v - +k.v, slope = hx_ < -1e-6 ? hy * dv / (hx_ * L) : 0; if (Math.abs(dvn) > 1e-9) k.ob = [k.ob[0], Math.round(slope * k.ob[0] * Ln / dvn * 1e4) / 1e4]; } } });
      dirty = true; return; }
    if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) < 3) return;
    if (!drag.moved) { drag.moved = true; cues.begin(); snap = buildSnap(new Set(st.sel)); }
    const db = (x - drag.x0) / st.ppb;
    cues.preview(() => {
      if (drag.kind === 'moveLen') { const o = drag.orig.get(drag.key.id), st0 = snapTo(drag.key.b - (o.dur ?? 1) + db, { alt: e.altKey }); drag.key.dur = Math.max(0.25, Math.min(16, Math.round((drag.key.b - st0) * 960) / 960)); const f = findKey(drag.key.id); if (f && f[0].track) f[0].track.auto = false; return; }
      if (drag.kind === 'resize') { const o = drag.orig.get(drag.key.id), end = snapTo(drag.key.b + (o.dur ?? 1) + db, { alt: e.altKey }); drag.key.dur = Math.max(grid || 1 / 16, end - drag.key.b); return; }
      // v22: the clip's start edge (trim in): the end stays put
      if (drag.kind === 'resizeL') { const o = drag.orig.get(drag.key.id), endB = o.b + (o.dur ?? 1), nb = Math.max(0, Math.min(endB - (grid || 1 / 16), snapTo(o.b + db, { alt: e.altKey }))); drag.key.b = tick(nb); drag.key.dur = endB - drag.key.b; if (drag.row.track) drag.row.track.auto = false; return; }
      const oa = drag.orig.get(drag.key.id), na = snapTo(oa.b + db, { alt: e.altKey }), d = na - oa.b;
      for (const [sid, o] of drag.orig) { const f = findKey(sid); if (f) { f[1].b = Math.max(0, tick(o.b + d)); if (f[0].track) f[0].track.auto = false; } }
      if (drag.row.kind === 'number' && !st.collapsed && Math.abs(y - drag.y0) > 2) { const p = reg().byPath[drag.row.path] || {}, ri = rowIdx(drag.row), rh = rowH(ri), [mn, mx] = vrange(drag.row), step = p.step || 0.01, dv = -(y - drag.y0) / (rh - (rh >= 40 ? 20 : 8)) * (mx - mn);
        drag.key.v = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, Math.round((drag.orig.get(drag.key.id).v + dv) / step) * step)); }
    });
    sortAll(); dirty = true;
  });
  const end = (e) => {
    if (!drag) return; const d = drag; drag = null; st.guide = null;
    if (d.kind === 'marquee') { if (d.moved) { const [x0, y0, x1, y1] = d.box, bx0 = bOf(Math.min(x0, x1)), bx1 = bOf(Math.max(x0, x1)), r0 = rowAt(Math.min(y0, y1)), r1 = rowAt(Math.max(y0, y1)); if (!d.add) st.sel.clear();
        rows.forEach((r, i) => { if (!st.collapsed && (i < r0 || i > r1)) return; for (const q of r.summary ? r.members : [r]) if (q.track && !locked(q)) for (const k of q.track.keys) if (k.b >= bx0 - 1e-6 && k.b <= bx1 + 1e-6) st.sel.add(k.id); }); app.inspector && app.inspector.show(); }
      else { st.sel.clear(); const [x] = pos(e); seekBeat(bOf(x), snapGrid()); app.inspector && app.inspector.show(); } }
    // v23.3 (Premiere-style reorder): Alt-drag a camera shot onto another shot SWAPS their windows; the times stay on the grid
    if (d.kind === 'move' && d.moved && d.alt && d.row && d.row.path === 'camera.shot' && d.key && d.orig.size === 1) { const f = findKey(d.key.id), tr = f && f[0].track, drop = d.key.b, o = d.orig.get(d.key.id);
      const tgt = tr ? tr.keys.filter((k) => k !== d.key).reduce((best, k) => (Math.abs(k.b - drop) < (best ? Math.abs(best.b - drop) : 2.01) ? k : best), null) : null;
      d.key.b = o.b; if (tgt) { const v = tgt.v; tgt.v = d.key.v; d.key.v = v; tr.auto = false; } sortAll(); if (tgt) cues.commit('swap shots'); else cues.cancel(); dirty = true; return; }
    if ((d.kind === 'move' || d.kind === 'resize' || d.kind === 'resizeL' || d.kind === 'moveLen') && d.moved) { sortAll(); cues.commit(d.kind === 'move' ? 'move keys' : d.kind === 'moveLen' ? 'camera move length' : 'resize clip'); }
    if (d.kind === 'handle') { cues.commit('bezier handle'); app.inspector && app.inspector.show(); }
    if (d.kind === 'loopA' || d.kind === 'loopB') { if (st.loop.b - st.loop.a < 1e-6) st.loop = null; app.actions.loopChanged && app.actions.loopChanged(); }
    dirty = true;
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', () => { if (drag && (drag.moved || drag.kind === 'handle') && drag.kind !== 'marquee') cues.cancel(); drag = null; st.guide = null; dirty = true; });
  cv.addEventListener('pointerleave', () => { if (st.hover !== -1 && !drag) { st.hover = -1; dirty = true; } });
  cv.addEventListener('dblclick', (e) => { const [x, y] = pos(e), h = hit(x, y);
    if (h.zone === 'lane' && h.row && !h.row.summary && !h.locked) addKeyAt(h.row, Math.max(0, snapBeat(bOf(x), snapGrid())));
    else if (h.zone === 'key') { if (app.tlEdit) app.tlEdit.inline(h.row, h.key); else app.inspector && app.inspector.focusValue(); }
    else if (h.zone === 'head' && h.part === 'label' && rows[h.ri]) api.toggleLaneHeight(rows[h.ri]); dirty = true; });
  cv.addEventListener('wheel', (e) => { const [x, y] = pos(e);
    const horiz = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY), lanesFit = st.collapsed || totalH() <= H - TOP - MINI();
    if (!(e.ctrlKey || e.metaKey) && !horiz && !(e.altKey && x < HEAD()) && lanesFit) return;   // v22: vertical wheel = lanes; when they all fit, the page / panel scrolls
    e.preventDefault();
    if (e.altKey && x < HEAD() && !st.collapsed) { const ri = rowAt(y), r = rows[ri]; if (r && !r.summary) { const nh = Math.max(MIN_H, Math.min(MAX_H, Math.round(r.h - e.deltaY * 0.25))); viewTouch(() => { ensureTrack(r).h = nh; }); } }
    else if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.002), x);
    else if (horiz) { st.scroll += (e.shiftKey ? e.deltaY : e.deltaX || e.deltaY) / st.ppb; clampScroll(); }
    else { st.vscroll += e.deltaY; clampScroll(); } dirty = true; }, { passive: false });
  new ResizeObserver(() => { const first = W === 0; resize(); if (first || !P().timeline.pxPerBeat) fit(); }).observe(cv);
  cues.subscribe(() => { dirty = true; for (const id of [...st.sel]) if (!findKey(id)) st.sel.delete(id); if (st.selMarker && !(cues.sheet.markers || []).some((m) => m.id === st.selMarker)) st.selMarker = null; });
  app.store.subscribe((s, keys) => { if (keys.includes('project.timeline')) dirty = true; });
  // ---------------------------------------------------------------- commands (keyboard + toolbar + inspector)
  const selected = () => [...st.sel].map(findKey).filter(Boolean);
  const editable = (list) => list.filter(([r]) => !locked(r));
  const userPresets = () => { const p = read(PRESET_KEY); return Array.isArray(p) ? p : []; };
  const api = {
    get state() { return st; }, rows: () => buildRows(), selected, findKey, ensureTrack, addKeyAt, hit, xOf, bOf, markers: () => markers(),
    markDirty() { dirty = true; }, recolor() { colors = null; dirty = true; },
    draw() { if (dirty) draw(); },
    setTime(tClip) { const b = tClip / BEAT(); if (Math.abs(b - st.playhead) > 1e-6) { st.playhead = b;
        if (app.clock.playing) { const x = xOf(b); if (x > W - 40 || x < HEAD()) { st.scroll = b - 2; clampScroll(); } } dirty = true; } },
    fit, zoomBy,
    setCollapsed(c) { st.collapsed = !!c; st.vscroll = 0; dirty = true; },
    select(ids) { st.sel = new Set(ids); st.selMarker = null; dirty = true; app.inspector && app.inspector.show(); },
    clearSel() { st.sel.clear(); st.selMarker = null; dirty = true; app.inspector && app.inspector.show(); },
    selectAll() { const r = rows[st.focusRow], scope = st.sel.size && r && r.track ? r.track.keys : allKeys().filter(([q]) => !locked(q)).map(([, k]) => k); st.sel = new Set(scope.map((k) => k.id)); dirty = true; app.inspector && app.inspector.show(); },
    del() { if (st.selMarker) { const id = st.selMarker; cues.edit((s) => { s.markers = (s.markers || []).filter((m) => m.id !== id); }, 'delete marker'); st.selMarker = null; app.inspector && app.inspector.show(); return true; }
      if (!st.sel.size) return false; cues.edit((s) => { for (const t of s.tracks) { if (t.lock) continue; const n = t.keys.length; t.keys = t.keys.filter((k) => !st.sel.has(k.id)); if (t.keys.length !== n) t.auto = false; } }, 'delete keys'); st.sel.clear(); app.inspector && app.inspector.show(); return true; },
    nudge(dir, big) { const ks = editable(selected()); if (!ks.length) return false; const g0 = snapGrid() || 0.25, d = dir * (big ? 4 : g0); cues.edit(() => { for (const [r, k] of ks) { k.b = Math.max(0, tick(k.b + d)); r.track.auto = false; } sortAll(); }, 'nudge'); return true; },
    nudgeValue(dir) { const ks = editable(selected()).filter(([r]) => r.kind === 'number'); if (!ks.length) return false; cues.edit(() => { for (const [r, k] of ks) { const p = reg().byPath[r.path] || {}; k.v = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, Math.round((+k.v + dir * (p.step || 0.1)) * 1e6) / 1e6)); r.track.auto = false; } }, 'value'); return true; },
    copy() { const ks = selected(); if (!ks.length) return false; const b0 = Math.min(...ks.map(([, k]) => k.b)); cues.clipboard.keys = ks.map(([r, k]) => ({ path: r.path, kind: r.kind, key: { ...k, b: k.b - b0 } })); return true; },
    /** Paste at the playhead. A single-lane clipboard pastes into the targeted lane when exactly one lane of that kind is targeted. */
    paste() { const C = cues.clipboard.keys; if (!C.length) return false; const at = snapBeat(st.playhead, snapGrid()), ids = [], paths = new Set(C.map((c) => c.path)), tg = targeted().filter((r) => r.kind === C[0].kind && !locked(r));
      const dest = paths.size === 1 && tg.length === 1 ? tg[0].path : null;
      cues.edit(() => { for (const c of C) { const path = dest || c.path, row = rowsWithKeys().find((r) => r.path === path) || { path, kind: c.kind, track: cues.sheet.tracks.find((t) => t.path === path) || null }; if (locked(row)) continue; const t = ensureTrack(row), k = { ...JSON.parse(JSON.stringify(c.key)), id: newId(), b: tick(at + c.key.b) };
        t.keys = t.keys.filter((q) => Math.abs(q.b - k.b) > 1e-6); t.keys.push(k); t.auto = false; ids.push(k.id); } sortAll(); }, 'paste'); st.sel = new Set(ids); app.inspector && app.inspector.show(); return true; },
    /** Paste attributes: the clipboard's first key's interpolation (ease, type, handles) onto the selected keys. */
    pasteAttributes() { const C = cues.clipboard.keys, ks = editable(selected()); if (!C.length || !ks.length) return false; const a = attrsOf(C[0].key);
      cues.edit(() => { for (const [r, k] of ks) { if (!['number', 'color', 'shot'].includes(r.kind)) continue; applyAttrs(k, a); r.track.auto = false; if (a.ty === 'bezier') { const K = r.track.keys, nx = K[K.indexOf(k) + 1], src = C[1] && C[1].path === C[0].path ? C[1].key : null; if (nx && src && src.ib) nx.ib = [...src.ib]; } } }, 'paste attributes'); return true; },
    duplicate() { if (!api.copy()) return false; const ks = selected(), span = Math.max(...ks.map(([, k]) => k.b + (k.dur ?? 0))) - Math.min(...ks.map(([, k]) => k.b)); const ph = st.playhead; st.playhead = Math.min(...ks.map(([, k]) => k.b)) + Math.max(snapGrid() || 1, span); api.paste(); st.playhead = ph; return true; },
    /** S: split the clip under the playhead (focused or selected) into two; on a step/number track add a key at the playhead. */
    split() { const b = snapBeat(st.playhead, snapGrid() || 1 / 16) || st.playhead; let done = false; const fr = rows[st.focusRow];
      cues.edit(() => { const cand = selected().length ? editable(selected()) : (fr && fr.track && !locked(fr) ? fr.track.keys.map((k) => [fr, k]) : []);
        for (const [r, k] of cand) if (r.kind === 'clip' && k.b < b && b < k.b + (k.dur ?? 1)) { const nk = { ...k, id: newId(), b, dur: k.b + (k.dur ?? 1) - b }; k.dur = b - k.b; r.track.keys.push(nk); r.track.auto = false; done = true; }
        if (!done) { const r = fr; if (r && !r.summary && !locked(r) && !['clip', 'event'].includes(r.kind)) { const t = ensureTrack(r); if (!t.keys.some((q) => Math.abs(q.b - b) < 1e-6)) { const k = { id: newId(), b, v: r.kind === 'shot' ? cues.ev().shot(b).to : curValue(r.path, b, r), ease: defaultEase(r.kind), ...(r.kind === 'shot' ? { transition: 'cut', dur: 1 } : {}) }; t.keys.push(k); t.auto = false; st.sel = new Set([k.id]); done = true; } } }
        sortAll(); }, 'split'); if (done) app.inspector && app.inspector.show(); return done; },
    setLoopIn() { const b = snapBeat(st.playhead, snapGrid() || .25); st.loop = { a: b, b: st.loop && st.loop.b > b ? st.loop.b : Math.min(totalBeats(), b + 16) }; dirty = true; app.actions.loopChanged && app.actions.loopChanged(); },
    setLoopOut() { const b = snapBeat(st.playhead, snapGrid() || .25); st.loop = { a: st.loop && st.loop.a < b ? st.loop.a : Math.max(0, b - 16), b }; dirty = true; app.actions.loopChanged && app.actions.loopChanged(); },
    clearLoop() { st.loop = null; dirty = true; app.actions.loopChanged && app.actions.loopChanged(); },
    focusRowOf(path) { buildRows(); let i = rows.findIndex((r) => r.path === path); if (i < 0) { const r = rows.find((q) => q.summary && q.members.some((m) => m.path === path)); if (r) { setTL({ closed: { [r.group]: false } }); buildRows(); i = rows.findIndex((q) => q.path === path); } }
      if (i >= 0) { st.focusRow = i; const y = rowY(i), LB = H - MINI(); if (y < TOP || y + rows[i].h > LB) st.vscroll += y < TOP ? y - TOP : y + rows[i].h - LB; resize(); clampScroll(); dirty = true; } return i; },
    bbt: (b) => beatsToBbt(b),
    /** Canvas point of a beat on a track's lane (scrolls the lane into view): for tests and tooling. */
    pointOf(path, b) { const i = api.focusRowOf(path); draw(); return { x: xOf(b), y: st.collapsed ? TOP + PHONE_ROW / 2 : rowY(i) + rowH(i) / 2 }; },
    /** Canvas point of a key (its glyph; number keys sit at their value) and of its bezier handles. */
    keyPoint(id) { const f = findKey(id); if (!f) return null; const [r, k] = f, i = api.focusRowOf(r.path); draw(); const y0 = rowY(i), h = rows[i].h, K = r.track.keys;
      return { x: xOf(k.b), y: r.kind === 'number' && !st.collapsed ? vyOf(rows[i], y0, h)(k.v) : y0 + h / 2, handles: r.kind === 'number' && h >= 40 ? handlePoints(rows[i], K.indexOf(k), y0, h) : {} }; },
    /** Canvas point of a header button of a lane ('M', 'L', 'S', 'T', 'prev', 'kf', 'next', 'chevron', 'resize', 'label'). */
    headPoint(path, part) { const i = api.focusRowOf(path); draw(); const r = rows[i], y0 = rowY(i), mid = y0 + Math.min(r.h, 23) / 2, hx = HEAD(), btns = headBtns(r), j = btns.indexOf(part), x0 = navX(r), nav = ['prev', 'kf', 'next'].includes(part);
      const x = j >= 0 ? hx - 10 - j * BTN : part === 'prev' ? x0 + 5 : part === 'kf' ? x0 + 19 : part === 'next' ? x0 + 33 : part === 'chevron' ? 9 : 40; return { x, y: part === 'resize' ? y0 + r.h - 2 : nav ? navY(r, y0) : mid }; },
    /** Visible beat range of the lanes (the inspector's mini key strips follow it). */
    view: () => ({ a: st.scroll, z: st.scroll + (W - HEAD()) / st.ppb, total: totalBeats() }),
    /** Canvas y of a value on a number lane (as drawn now). */
    valueY(path, v) { const i = api.focusRowOf(path); draw(); return vyOf(rows[i], rowY(i), rows[i].h)(v); },
    lanesFit: () => { buildRows(); return totalH() <= H - TOP - MINI() + 0.5; },
    markerY: () => RULER + SECT + MARK / 2, miniY: () => H - MINI() / 2,
    // ---- 1. key navigation
    /** [ / ]: jump to the previous / next key on the given lanes (default: targeted lanes, else the focused lane; all = every lane) and select it. */
    navKey(dir, lanes = null, all = false) { buildRows(); const L = all ? rowsWithKeys() : lanes || scopeRows(); let best = null;
      for (const r of L) if (r.track) for (const k of r.track.keys) { const d = (k.b - st.playhead) * dir; if (d > HALF_FRAME() && (!best || d < best.d)) best = { d, k, r }; }
      if (!best) return false; seekBeat(best.k.b); const ids = []; for (const r of L) if (r.track) for (const k of r.track.keys) if (Math.abs(k.b - best.k.b) < 1e-6) ids.push(k.id);
      st.sel = new Set(ids); const ri = rowIdx(best.r); if (ri >= 0) st.focusRow = ri; const x = xOf(best.k.b); if (x < HEAD() || x > W - 20) { st.scroll = best.k.b - (W - HEAD()) / st.ppb / 2; clampScroll(); }
      dirty = true; app.inspector && app.inspector.show(); return true; },
    /** Shift+[ / ]: previous / next marker (any visible kind except plain beats). */
    navMarker(dir) { const M = markers().filter((m) => m.kind !== 'beat' && m.kind !== 'hat'); let best = null; for (const m of M) { const d = (m.b - st.playhead) * dir; if (d > HALF_FRAME() && (!best || d < best.d)) best = { d, m }; }
      if (!best) return false; seekBeat(best.m.b); return true; },
    /** ◆ / ; : add a key at the playhead on the lanes, or remove it when one is there. */
    toggleKey(lanes = null) { const L = (lanes || scopeRows()).filter((r) => !r.summary && !locked(r)); if (!L.length) return false; const b = snapBeat(st.playhead, snapGrid() || 1 / 16); let ids = [];
      cues.edit(() => { for (const r of L) { const t = ensureTrack(r), here = t.keys.filter((k) => Math.abs(k.b - b) < 1e-6); if (here.length) t.keys = t.keys.filter((k) => !here.includes(k)); else { const k = newKeyFor(r, b); t.keys.push(k); ids.push(k.id); } t.auto = false; t.keys.sort((x, y) => x.b - y.b); } }, 'key at playhead');
      st.sel = new Set(ids); app.inspector && app.inspector.show(); return true; },
    // ---- 3. markers
    addMarker(label = null) { const b = snapBeat(st.playhead, snapGrid() || 1 / 16), m = { id: newId('m'), b, label: label ?? `M${((cues.sheet.markers || []).length + 1)}`, kind: 'cue' };
      cues.edit((s) => { s.markers = (s.markers || []).filter((q) => Math.abs(q.b - b) > 1e-6); s.markers.push(m); s.markers.sort((a, c) => a.b - c.b); }, 'add marker'); st.selMarker = m.id; st.sel.clear(); app.inspector && app.inspector.show(); return m; },
    setDensity(d) { setTL({ density: d }); dirty = true; },
    // ---- 6. quantise
    /** Q: selected keys (else the keys of the targeted / focused lanes, inside the loop if set) to the nearest marker or grid line. */
    quantise(to = 'markers', strength = 1) { let ks = editable(selected()); if (!ks.length) { const [a, z] = st.loop ? [st.loop.a, st.loop.b] : [0, totalBeats()]; ks = []; for (const r of scopeRows()) if (r.track && !locked(r)) for (const k of r.track.keys) if (k.b >= a - 1e-9 && k.b < z) ks.push([r, k]); }
      if (!ks.length) return 0; const T = to === 'grid' ? gridTargets(snapGrid() || 0.25, totalBeats()) : markers().filter((m) => m.kind !== 'hat').map((m) => m.b); let n = 0;
      cues.edit(() => { n = quantiseKeys(ks.map(([, k]) => k), T, { strength, window: to === 'grid' ? (snapGrid() || 0.25) / 2 : 1 }); for (const [r] of ks) r.track.auto = false; sortAll(); }, 'quantise'); return n; },
    // ---- 7. interpolation
    setInterp(id) { const ks = editable(selected()).filter(([r]) => ['number', 'color', 'shot'].includes(r.kind)); if (!ks.length) return false;
      cues.edit(() => { for (const [r, k] of ks) { const K = r.track.keys, nx = r.kind === 'shot' ? k : K[K.indexOf(k) + 1]; if (id === 'bezier') { if (r.kind === 'shot') { k.ty = 'bezier'; k.ob = k.ob || [0.45, 0]; k.ib = k.ib || [-0.45, 0]; } else toBezier(k, nx); } else applyEasePreset(k, r.kind === 'shot' ? k : nx, id); r.track.auto = false; } }, 'interpolation'); return true; },
    /** B: cycle hold -> linear -> bezier -> auto on the selection. */
    cycleInterp() { const s = editable(selected()).find(([r]) => ['number', 'color', 'shot'].includes(r.kind)); if (!s) return false; const k = s[1], cur = k.ty || (k.ease === 'step' ? 'hold' : k.ease === 'linear' ? 'linear' : 'bezier'), order = ['hold', 'linear', 'bezier', 'auto']; return api.setInterp(order[(order.indexOf(cur) + 1) % order.length]); },
    /** Ease strength 0..1 on bezier keys: symmetric handle length (x) keeping each handle's y. */
    setEaseStrength(sx) { const ks = editable(selected()).filter(([r, k]) => k.ty === 'bezier'); if (!ks.length) return false;
      cues.edit(() => { for (const [r, k] of ks) { const K = r.track.keys, nx = r.kind === 'shot' ? k : K[K.indexOf(k) + 1]; k.ob = [sx, (k.ob || [0, 0])[1]]; if (nx) nx.ib = [-sx, (nx.ib || [0, 0])[1]]; r.track.auto = false; } }, 'ease strength'); return true; },
    // ---- 4. lanes
    toggleLaneHeight(r = rows[st.focusRow]) { if (!r || r.summary) return false; const big = r.h >= 40; viewTouch(() => { const t = ensureTrack(r); if (big) delete t.h; else t.h = EXPANDED; }); return true; },
    setLaneHeight(path, h) { const r = rowsWithKeys().find((q) => q.path === path); if (!r) return false; viewTouch(() => { const t = ensureTrack(r); if (h) t.h = Math.max(MIN_H, Math.min(MAX_H, h)); else delete t.h; }); return true; },
    toggleGroup(group) { setTL({ closed: { [group]: !(st.autoClosed || TL().closed || {})[group] } }); dirty = true; },
    collapseAll(c = true) { const o = {}; for (const r of rowsWithKeys()) if (r.gsize >= 2) o[r.group] = c; setTL({ closed: o }); dirty = true; },
    setCompact(c) { setTL({ compact: c }); st.vscroll = 0; dirty = true; },
    get compact() { return st.compactNow; },
    /** E: the graph editor: the focused number lane fills the timeline, with its handles. */
    toggleGraph(path = null) { if (st.graph) { st.graph = null; dirty = true; return false; } const r = path ? rowsWithKeys().find((q) => q.path === path) : rows[st.focusRow]; if (!r || r.kind !== 'number' || !r.track) return false; st.graph = r.path; st.vscroll = 0; st.focusRow = 0; dirty = true; return true; },
    // ---- 8. zoom
    zoomToSelection() { const ks = selected(); if (!ks.length) { if (st.loop) zoomRange(st.loop.a, st.loop.b); else fit(); return; } zoomRange(Math.min(...ks.map(([, k]) => k.b - (k.transition === 'push' ? k.dur ?? 1 : 0))), Math.max(...ks.map(([r, k]) => k.b + (r.kind === 'clip' ? k.dur ?? 1 : 0)))); },
    zoomToLoop() { if (st.loop) zoomRange(st.loop.a, st.loop.b); else fit(); },
    // ---- 9. presets + stamp
    presets: () => [...BUILTIN_PRESETS, ...userPresets()],
    savePreset(name) { const ks = selected(); if (!ks.length) return null; const p = presetFromSelection(ks, name || `Preset ${userPresets().length + 1}`); write(PRESET_KEY, [...userPresets(), p]); return p; },
    deletePreset(id) { write(PRESET_KEY, userPresets().filter((p) => p.id !== id)); },
    /** Stamp a pattern (a preset id, or the clipboard / selection) on every anchor (beat, bar, 2bar, offbeat, section, kick, snare, marker) in the loop or the whole video. */
    stamp(source = 'selection', rule = 'beat', where = null) { let pat;
      if (source === 'selection') { const ks = selected(); if (!ks.length) return 0; const b0 = Math.min(...ks.map(([, k]) => k.b)); pat = ks.map(([r, k]) => { const { id, ...key } = JSON.parse(JSON.stringify(k)); key.b = k.b - b0; return { path: r.path, kind: r.kind, key }; }); }
      else { const p = api.presets().find((q) => q.id === source); if (!p) return 0; pat = p.keys; }
      const [a, z] = where || (st.loop ? [st.loop.a, st.loop.b] : [0, totalBeats()]), anchors = anchorsFor(rule, app.clip.current(), cues.sheet, a, z, density()); if (!anchors.length) return 0;
      let ids = []; cues.edit(() => { const trackOf = (path, kind) => { const row = rowsWithKeys().find((r) => r.path === path) || { path, kind, track: cues.sheet.tracks.find((t) => t.path === path) || null }; return locked(row) ? null : ensureTrack(row); };
        ids = stamp(pat, anchors, trackOf, z); sortAll(); }, 'stamp'); st.sel = new Set(ids); app.inspector && app.inspector.show(); return ids.length; },
    applyPreset(id) { return api.stamp(id, 'beat', [snapBeat(st.playhead, snapGrid() || 1 / 16), snapBeat(st.playhead, snapGrid() || 1 / 16) + 1e-6]); },
    // ---- 11. ripple
    /** R / Shift+R: insert / delete one bar at the playhead's bar on the targeted lanes (else every unlocked lane); later keys and markers shift. */
    rippleBar(dir = 1) { const at = Math.floor(st.playhead / 4 + 1e-6) * 4, tg = targeted(), T = (tg.length ? tg.map((r) => r.track) : cues.sheet.tracks).filter((t) => !t.lock);
      cues.edit((s) => { ripple(s, at, dir * 4, T); }, dir > 0 ? 'insert bar' : 'delete bar'); return at; },
    // ---- 12. targeting
    setTarget(path, on) { const r = rowsWithKeys().find((q) => q.path === path); if (!r) return; viewTouch(() => { ensureTrack(r).target = on; }); },
    targeted: () => targeted().map((r) => r.path),
  };
  return api;
}
