// Frame sizes, platform safe areas and the chain phrase phase (shared by overlays, FX and loop-safe export).
export const ASPECTS = Object.freeze({
  '916': { W: 1080, H: 1920, label: '9:16 · 1080×1920', platform: 'Reels / TikTok / Shorts' },
  '169': { W: 1920, H: 1080, label: '16:9 · 1920×1080', platform: 'YouTube' },
});
// TRENDS.md §3: hard text box x162-918 y288-1248, relaxed x108-972 y288-1440 (approximate, check in app).
export const SAFE = Object.freeze({
  '916': { hard: { x0: 162, x1: 918, y0: 288, y1: 1248 }, relaxed: { x0: 108, x1: 972, y0: 288, y1: 1440 },
    zones: [ { x: 0, y: 0, w: 1080, h: 288, label: 'status + top bar' }, { x: 0, y: 1248, w: 1080, h: 672, label: 'caption · CTA · audio' }, { x: 918, y: 1000, w: 162, h: 248, label: 'like/share' } ] },
  '169': { hard: { x0: 96, x1: 1824, y0: 80, y1: 900 }, relaxed: { x0: 64, x1: 1856, y0: 54, y1: 960 },
    zones: [ { x: 0, y: 960, w: 1920, h: 120, label: 'player controls' }, { x: 1632, y: 860, w: 288, h: 100, label: 'duration badge' } ] },
});
export function cycleBeats(project, track) {
  const c = project.chains.cycle; const clipBeats = Math.max(4, Math.round((project.outT - project.inT) / track.spb));
  if (c !== 'auto') return Math.max(8, (+c || 8) * 4);
  let n = Math.max(1, Math.round(clipBeats / 32)); while (n > 1 && clipBeats % n) n--;
  return Math.max(8, clipBeats / n);
}
export function makeParams(project, track) {
  const A = ASPECTS[project.aspect], W = A.W, H = A.H;
  return { W, H, u: Math.min(W, H) / 1080, V: H > W, aspect: project.aspect, safe: SAFE[project.aspect], text: project.text, inT: project.inT, outT: project.outT,
    anchorBeat: Math.round((project.inT - track.t0) / track.spb), cycleBeats: cycleBeats(project, track), chains: project.chains, eleph: project.eleph,
    finish: project.finish, fx: project.fx, pal: project.pal, tpl: project.tpl, loop: project.export && project.export.loopSafe === false ? null : { a: project.inT, b: project.outT } };
}
/**
 * Phrase position for the logo cycle. The logo is whole for most of the phrase; in the last D beats it dissolves
 * letter by letter (U → 2 → C) and in the first R beats of the next phrase it rebuilds letter by letter.
 * D = 4 beats for 8-bar cycles, 3 for 4-bar, 2 for 2-bar; R = 2 (1.5 for 2-bar). Readable >= ~80 % of the time.
 */
export function phrase(fs, P) {
  const b = fs.beat - P.anchorBeat, C = P.cycleBeats, k = Math.floor(b / C), lb = b - k * C, D = C >= 32 ? 4 : C >= 16 ? 3 : 2, R = C >= 16 ? 2 : 1.5;
  const ph = { b, k, lb, C, D, R, impactAge: lb * fs.spb, endIn: (C - lb) * fs.spb, tt: 6, shatterQ: 0, flyQ: 0 };
  ph.vis = (letterState(ph, 0).fill + letterState(ph, 1).fill + letterState(ph, 2).fill) / 3;
  return ph;
}
const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** {mode, outline 0..1, fill 0..1} for letter i (0 U, 1 2, 2 C). */
export function letterState(ph, i) {
  const { lb, C, D, R } = ph;
  if (lb < R * 1.25) { const s0 = i * R / 4; return { mode: 'rebuild', outline: ease((lb - s0) / (R * .45)), fill: ease((lb - s0 - R * .25) / (R * .5)) }; }
  if (lb >= C - D) { const d0 = C - D + i * D / 4, q = ease((lb - d0) / (D / 2)); return { mode: 'dissolve', outline: 1 - q, fill: 1 - q }; }
  return { mode: 'full', outline: 1, fill: 1 };
}
/** Whole-phrase clip (2/4/8/16/32 bars) nearest to `sec`, as a bar count. */
export function phraseBars(track, sec) { const want = sec / track.barDur; let best = 2; for (const n of [2, 4, 8, 16, 32, 64]) if (n <= track.bars.length && Math.abs(Math.log(n / want)) < Math.abs(Math.log(best / want))) best = n; return Math.min(best, Math.max(1, track.bars.length)); }
