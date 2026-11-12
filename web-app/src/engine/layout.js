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
    finish: project.finish, fx: project.fx, pal: project.pal, tpl: project.tpl };
}
// Transition timeline position tt in [0,6]: [0,2.5) shatter, [2.5,4) fly-in landing on the downbeat, [4,6) impact, 6 = hold.
export function phrase(fs, P) {
  const b = fs.beat - P.anchorBeat, C = P.cycleBeats, k = Math.floor(b / C), lb = b - k * C;
  const tt = lb >= C - 4 ? lb - (C - 4) : lb < 2 ? lb + 4 : 6;
  return { b, k, lb, C, tt, impactAge: tt >= 4 && tt < 6 ? (tt - 4) * fs.spb : 99, shatterQ: tt < 2.5 ? tt / 2.5 : 0, flyQ: tt >= 2.5 && tt < 4 ? (tt - 2.5) / 1.5 : 0 };
}
