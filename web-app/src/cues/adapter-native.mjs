// Adapter for the native renderer (u2c-motion render.mjs + film/v8/*): the spec of `--cues file.json` and the
// conversion of a cue sheet into what the native v8 film reads today. Pure ES module, no DOM, Node 18+.
//
//   import { readCuesFile, nativePlan, nativeArgs, cueScript } from '<web-app>/src/cues/adapter-native.mjs';
//   const sheet = readCuesFile(fs.readFileSync(args.cues, 'utf8'), { bars, look });   // throws with a clear message
//   Object.assign(args, nativeArgs(sheet, args));                                      // --look / --stage defaults
//   fs.writeFileSync('film/data/cues-<id>.js', cueScript(sheet, { bars, aspect }));    // window.U2C_CUES + plan
//
// Two ways for the native film to use it (see CUES.md, "Native CLI"):
//  1. Plan mode (works with film/v8/film.js as it is, a few lines changed): read window.U2C_CUES.plan for FOCUS,
//     the pendant amplitude per beat, the logo cycle length, flash beats, text cues and the merged tags.
//  2. Full mode: load the web app's own composition (src/v8/film.js + src/cues/schema.js, plain ES modules) in the
//     HyperFrames page and call film.render(ctx, t, { ev: createEvaluator(sheet) }): every property of the sheet applies.
import { parseSheet, validateSheet, createEvaluator, serializeSheet, mergeDeep } from './schema.js';

/** CLI spec of the flag, for render.mjs --help and docs. */
export const CLI_SPEC = {
  flag: '--cues <file.json>',
  help: 'cue sheet (u2c-cues v1, see web-app/CUES.md): look, stage, camera shots, featured meter, logo cycle / hero, pendant amplitude, tags, text cues, fx. ' +
    'Base look/stage become the defaults of --look/--stage (flags given explicitly win). Times are BAR.BEAT.TICK from bar 1 of the rendered section.',
  precedence: ['explicit CLI flag', 'cue sheet base / first key', 'tags.default.json + --tags'],
};

/** Parse + validate a cue sheet file (string or object). Unknown properties are kept with a warning. */
export function readCuesFile(text, { onWarn = (m) => console.warn('[cues] ' + m) } = {}) {
  const doc = typeof text === 'string' ? JSON.parse(text) : text; const sheet = parseSheet(doc);
  for (const w of validateSheet(doc)) onWarn(w);
  return sheet;
}
/** Defaults for the native CLI args from the sheet (explicit flags win). */
export function nativeArgs(sheet, args = {}) {
  const ev = createEvaluator(sheet), out = {};
  if (!args.look) out.look = ev.value('look', 0, sheet.base.look || 'exe');
  if (!args.stage) out.stage = ev.value('stage', 0, sheet.base.stage || 'nigredo');
  return out;
}
/**
 * The plan the native v8 film reads (plan mode). bars = clip bars of the render.
 *  focus   [[clipBar, windowId, holdBars]] like FOCUS in film/v8/film.js (pushes pairing a window shot with the next wide)
 *  shots   every camera key {beat, target, transition, durBeats, ease} (full detail)
 *  ampDeg  pendant amplitude per beat (degrees, before the bass factor), null when the sheet has no pendant track
 *  period  pendant period in beats; logoCycleBeats; flashBeats; featured [[beat, id]]; textCues; tags (merged overrides)
 */
export function nativePlan(sheet, { bars = 16 } = {}) {
  const ev = createEvaluator(sheet), cam = (ev.tracksOf('camera.shot')[0] || { keys: [] }).keys, focus = [];
  for (let i = 0; i < cam.length; i++) { const k = cam[i]; if (k.v === 'wide') continue; const nx = cam.slice(i + 1).find((q) => q.v === 'wide');
    focus.push([Math.round(k.b / 4), k.v, nx ? Math.max(1, Math.round((nx.b - k.b) / 4)) : Math.max(1, bars - 2 - Math.round(k.b / 4))]); }
  const hasAmp = ev.tracksOf('pendant.amp').length > 0;
  return {
    look: ev.value('look', 0, 'exe'), stage: ev.value('stage', 0, 'nigredo'), focus,
    shots: cam.map((k) => ({ beat: k.b, target: k.v, transition: k.transition || 'push', durBeats: k.dur ?? 1, ease: k.ease })),
    ampDeg: hasAmp ? Array.from({ length: bars * 4 + 1 }, (_, b) => ev.value('pendant.amp', b, 4.6)) : null,
    period: ev.value('pendant.period', 0, 2), logoCycleBeats: Math.round(ev.value('logo.cycle', 0, 2) * 4),
    heroBeats: ev.keysIn('logo.hero', 0, bars * 4).map((k) => [k.b, k.dur ?? 4]),
    flashBeats: ev.keysIn('fx.flash', 0, bars * 4).map((k) => k.b),
    featured: (ev.tracksOf('focus.featured')[0] || { keys: [] }).keys.map((k) => [k.b, k.v]),
    textCues: ev.keysIn('text.cue', 0, bars * 4).map(({ id, ...k }) => k),
    tags: sheet.tags || {},
  };
}
/** Classic-script payload for the HyperFrames page: window.U2C_CUES = {sheet, plan}. */
export function cueScript(sheet, opts = {}) { return 'window.U2C_CUES=' + JSON.stringify({ sheet: serializeSheet(sheet), plan: nativePlan(sheet, opts) }) + ';\n'; }
/** Tags for the native tags file: tags.default.json deep-merged with --tags and then the sheet's tags. */
export function mergedTags(defaults, cliTags, sheet) { return mergeDeep(mergeDeep(defaults, cliTags || {}), sheet.tags || {}); }
