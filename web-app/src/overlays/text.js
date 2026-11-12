// Printed text: one editable model (project.text.lines) for every line any template prints.
// Each line: {on, text, font: sans|mono|serif, size, pos: auto|top|centre|bottom|free, x, y, case, color}.
// Templates read lines through lineText()/lineFont()/lineColor(). A template "owns" a line (draws it inside its own
// design) only while that line's position is "auto"; any other position hands it to this overlay, which stacks
// top/centre/bottom lines inside the platform safe box and places free (dragged) lines where they were dropped.
import { rgba, mix, FONT_MONO, FONT_SANS, FONT_SERIF } from '../util/draw.js';
import { LINE_IDS } from '../state.js';
import { accentOn } from '../brand/palettes.js';
export const KEYS_24 = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].flatMap(n => [n + ' maj', n + ' min']);
const BASE = { title: 64, bpm: 30, key: 30, tag: 34, handle: 26, cta: 28, c1: 28, c2: 28, c3: 28 };
const caseOf = (s, c) => (c === 'upper' ? s.toUpperCase() : c === 'lower' ? s.toLowerCase() : c === 'title' ? s.replace(/\b\w/g, m => m.toUpperCase()) : s);
export function rawLine(P, id) { const L = P.text.lines || {}; return L[id] || null; }
/** Resolved, cased text for a line, or '' when the line is off/empty. Tokens: {bpm} {key} {title} {handle}. */
export function lineText(P, id, fs, opt = {}) {
  const l = rawLine(P, id); if (!l || (!l.on && !opt.ignoreOn)) return '';
  const L = P.text.lines, bpm = fs ? Math.round(fs.bpm) : '';
  const s = String(l.text || '').replace(/\{bpm\}/gi, bpm).replace(/\{key\}/gi, (L.key && L.key.text) || '').replace(/\{title\}/gi, (L.title && L.title.text) || '').replace(/\{handle\}/gi, (L.handle && L.handle.text) || '');
  return caseOf(s.trim(), opt.case || l.case);
}
export function lineFont(P, id, px, weight) {
  const l = rawLine(P, id) || {}, f = l.font || 'mono', sz = px * (l.size || 1);
  return f === 'serif' ? `italic 400 ${sz}px ${FONT_SERIF}` : f === 'sans' ? `${weight || 600} ${sz}px ${FONT_SANS}` : `${weight || 500} ${sz}px ${FONT_MONO}`;
}
/** Font for a line, shrunk so `s` fits in maxW (basePx is before the line's own size factor). */
export function fitLine(ctx, P, id, s, maxW, basePx, weight) { let f = lineFont(P, id, basePx, weight); ctx.font = f; const w = ctx.measureText(s).width; if (w > maxW) { f = lineFont(P, id, basePx * maxW / w, weight); } return f; }
export function lineColor(P, id, pal, paper) {
  const c = (rawLine(P, id) || {}).color || 'main';
  if (paper) return { main: pal.ink, hi: pal.ink, accent: pal.pacc, text: pal.ink, dim: mix(pal.ink, pal.paper, .45) }[c] || pal.ink;
  return { main: pal.main, hi: pal.hi, accent: accentOn(pal), text: pal.text, dim: pal.dim }[c] || pal.main;
}
/** True when the template draws this line itself. */
export function owns(P, tpl, id) { const l = rawLine(P, id); return !!(l && (tpl.owns || []).includes(id) && (l.pos || 'auto') === 'auto'); }
function items(ctx, P, fs, tpl) {
  const u = P.u, out = [];
  for (const id of LINE_IDS) { const l = rawLine(P, id); if (!l || !l.on || owns(P, tpl, id)) continue; const s = lineText(P, id, fs); if (!s) continue;
    const px = BASE[id] * u, f = lineFont(P, id, px, id === 'title' ? 700 : 500); ctx.font = f; const w = ctx.measureText(s).width, sz = px * (l.size || 1);
    let pos = l.pos || 'auto'; if (pos === 'auto') pos = tpl.textPos || 'bottom';
    out.push({ id, s, f, w, h: sz * 1.35, sz, pos, l, mono: (l.font || 'mono') === 'mono' }); }
  return out;
}
/** Bounds of every overlay line (for hit-testing / dragging), in frame pixels. */
export function textBoxes(ctx, P, fs, tpl) {
  const it = items(ctx, P, fs, tpl), sb = P.V ? P.safe.hard : P.safe.relaxed, u = P.u, gap = 10 * u, boxes = [];
  const stack = (list, y0, dir) => { let y = y0; const seq = dir < 0 ? [...list].reverse() : list;
    for (const o of seq) { const h = o.h + (o.mono ? 8 * u : 0), w = o.w + (o.mono ? 28 * u : 0); if (dir < 0) y -= h; boxes.push({ ...o, x: P.W / 2 - w / 2, y, bw: w, bh: h }); if (dir > 0) y += h + gap; else y -= gap; } };
  const by = k => it.filter(o => o.pos === k);
  stack(by('top'), sb.y0 + 20 * u, 1);
  const c = by('centre'), ch = c.reduce((a, o) => a + o.h + (o.mono ? 8 * u : 0) + gap, -gap); stack(c, P.H / 2 - ch / 2, 1);
  stack(by('bottom'), sb.y1 - 10 * u, -1);
  for (const o of by('free')) { const w = o.w + (o.mono ? 28 * u : 0), h = o.h + (o.mono ? 8 * u : 0); boxes.push({ ...o, x: o.l.x * P.W - w / 2, y: o.l.y * P.H - h / 2, bw: w, bh: h }); }
  return boxes;
}
export const textOverlay = {
  id: 'text', name: 'Printed text',
  draw(ctx, fs, P, pal, assets, tpl) {
    const paper = tpl.surface === 'paper', plate = paper ? pal.paper : pal.dark, u = P.u;
    for (const b of textBoxes(ctx, P, fs, tpl)) {
      const col = lineColor(P, b.id, pal, paper);
      if (b.mono) { ctx.fillStyle = rgba(plate, .72); ctx.fillRect(b.x, b.y, b.bw, b.bh); ctx.fillStyle = col; ctx.fillRect(b.x, b.y, 4 * u, b.bh); }
      else { ctx.shadowColor = rgba(plate, .8); ctx.shadowBlur = 18 * u; }
      ctx.font = b.f; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.s, b.x + b.bw / 2, b.y + b.bh / 2 + 1);
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    }
  },
};
