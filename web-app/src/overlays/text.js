// Text-overlay presets (TRENDS.md §4): mono label lines inside the platform safe box, toggleable and draggable.
import { mono, rgba } from '../util/draw.js';
export const TEXT_PRESETS = { auto: 'Auto', off: 'Off', minimal: 'Minimal', typebeat: 'Type beat', lease: 'Lease / CTA' };
export function presetLines(P, fs, tpl) {
  const T = P.text; let pr = T.preset; if (pr === 'auto') pr = tpl.ownText ? 'off' : 'minimal'; if (pr === 'off') return [];
  const bpm = Math.round(fs.bpm), key = (T.key || '').toUpperCase(), name = (T.title || '').toUpperCase(), L = [];
  if (pr === 'typebeat') L.push({ s: `[FREE] ${T.artistA} x ${T.artistB} TYPE BEAT`.toUpperCase(), k: 'top' });
  if (T.showTitle && name) L.push({ s: `"${name}"`, k: 'name' });
  if (T.showBpm) L.push({ s: `${bpm} BPM · ${key}`, k: 'chip' });
  if (pr === 'lease' || pr === 'typebeat') L.push({ s: `LEASE ${T.price} — ${T.link}`.toUpperCase(), k: 'cta' });
  if (T.showTag && pr !== 'typebeat') L.push({ s: T.tag.toUpperCase(), k: 'tag' });
  if (pr === 'typebeat') L.push({ s: `PROD. ${T.handle}`.toUpperCase(), k: 'tag' });
  return L;
}
function layout(ctx, P, lines) {
  const u = P.u, out = []; let h = 0, w = 0;
  for (const l of lines) { const px = (l.k === 'name' ? 52 : 26) * u, f = mono(px, l.k === 'name' ? 700 : 500); ctx.font = f; const lw = ctx.measureText(l.s).width + 24 * u; out.push({ ...l, f, px, lw, lh: px * 1.55 }); h += px * 1.55 + 8 * u; w = Math.max(w, lw); }
  return { out, w, h };
}
export function textBounds(ctx, P, fs, tpl) { const lines = presetLines(P, fs, tpl); if (!lines.length) return null; const { w, h } = layout(ctx, P, lines); return { x: P.text.tx * P.W, y: P.text.ty * P.H - h, w, h }; }
export const textOverlay = {
  id: 'text', name: 'Text preset',
  draw(ctx, fs, P, pal, assets, tpl) {
    const lines = presetLines(P, fs, tpl); if (!lines.length) return; const u = P.u, { out, h } = layout(ctx, P, lines);
    const paper = tpl.surface === 'paper', chip = paper ? pal.ink : pal.dark, fg = paper ? pal.paper : pal.text, acc = paper ? pal.pacc : pal.main;
    let y = P.text.ty * P.H - h; const x = P.text.tx * P.W;
    for (const l of out) { ctx.fillStyle = rgba(chip, l.k === 'name' ? .82 : .7); ctx.fillRect(x, y, l.lw, l.lh);
      if (l.k === 'cta') { ctx.fillStyle = acc; ctx.fillRect(x, y, 6 * u, l.lh); }
      ctx.font = l.f; ctx.fillStyle = l.k === 'top' ? acc : fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(l.s, x + 12 * u, y + l.lh / 2 + 1); y += l.lh + 8 * u; }
  },
};
