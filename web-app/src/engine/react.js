// Restraint rules for the composition layer (windows, logo, layout). One primary reactor per hit type; everything
// else ≤ 30 % of it. Data views (meters, spectra, lanes) may move freely and do not use these helpers.
//   kick  → logo breath 0.6-1 % (critically damped, no overshoot) + one cable dot
//   snare → hairline border brighten (≤ 15 %) on ONE active window
//   hats  → nothing in the composition layer
//   bass  → elephant impulse + EQ low node
// `react` (0-1, default .45 = "Balanced") scales all of it; 1x at .45.
export const PRESETS = { calm: .25, balanced: .45, punchy: .75 };
export const R = P => ((P && P.fx && P.fx.react != null) ? P.fx.react : .45) / .45;
/** Logo scale: 1 + 0.8 % × kick (composition envelope) × reactivity. */
export const kickBreath = (fs, P) => 1 + .008 * Math.min(1, fs.kickC) * Math.min(2.2, R(P));
/** Border brighten 0..0.15 for the window that is the snare's "active" one (rotates per snare), else 0. */
export function snareBorder(fs, P, idx, count) { if (fs.snareIdx < 0 || ((fs.snareIdx % count) + count) % count !== idx) return 0; return Math.min(.15, .15 * Math.min(1, fs.snareC) * R(P)); }
/** Which of `count` cables carries this kick's signal dot. */
export const kickCable = (fs, count) => (fs.kickIdx < 0 ? -1 : ((fs.kickIdx % count) + count) % count);
/** Secondary reaction amount (≤ 30 % of primary). */
export const secondary = (fs, P, v) => .3 * Math.min(1, v) * Math.min(2.2, R(P));
