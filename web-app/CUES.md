# U2C cue sheet (`u2c-cues`, version 1)

A cue sheet describes a beat video over **musical time**. The studio's timeline edits it, the preview and the MP4
export render it, and the native renderer can read the same file (`--cues file.json`, see the end). One JSON document:

```json
{
  "format": "u2c-cues", "version": 1,
  "meta": { "beatsPerBar": 4, "ppq": 960, "bars": 16, "look": "exe", "aspect": "916", "preset": "default" },
  "base": { "look": "exe", "stage": "nigredo", "win.eq.accent": "#ffffff" },
  "tags": { "notes": { "spectrum": "808 lives here" } },
  "tracks": [
    { "path": "camera.shot", "kind": "shot", "lane": "camera", "keys": [
      { "at": "4.1.0", "v": "chains", "transition": "push", "dur": 1, "ease": "easeInOut" },
      { "at": "6.1.0", "v": "wide",   "transition": "push", "dur": 1, "ease": "easeInOut" } ] },
    { "path": "pendant.amp", "kind": "number", "lane": "pendant", "keys": [
      { "at": "1.1.0", "v": 4.6, "ease": "step" }, { "at": "2.1.0", "v": 9, "ease": "step" } ] },
    { "path": "text.cue", "kind": "clip", "lane": "text", "keys": [
      { "at": "9.1.0", "v": "{title} · {bpm} BPM", "dur": 4, "x": 0.5, "y": 0.45, "size": 72, "font": "mono", "color": "ink", "align": "center" } ] }
  ]
}
```

## Time
- `at` is `BAR.BEAT.TICK`, 1-based bar and beat, **960 ticks per beat**, counted from bar 1 of the video (the section
  start, always a downbeat). `"4.1.0"` = the downbeat of bar 4 = beat 12. A key may also give `"beat": 12.5` instead.
- Snapping in the editor: bar (4 beats), beat, 1/8 (240 ticks), 1/16 (120 ticks), off (1 tick).
- Seconds come from the analysed grid: `t = beat × 60 / BPM`. Frames are sampled at their centre, so an event on the
  grid lands on its nearest frame (the sync test checks every scheduled event is within 1 frame).

## Tracks and keys
Each track animates one **property path**. Keys carry `v` (the value) and, by kind:

| kind | value | interpolation | extra fields |
|---|---|---|---|
| `number` | number | the left key's `ease` to the next key | `ease` |
| `color` | `#rrggbb` | RGB, the left key's `ease` | `ease` |
| `enum`, `bool`, `text` | option / true,false / string | step (holds until the next key) | |
| `shot` | `wide` or a window id | the move LANDS on the key: it runs over the `dur` beats before it | `transition` (`push`, `cut`), `dur`, `ease` |
| `clip` | text, amount or `true` | active from `at` for `dur` beats | `dur` (+ text-cue fields) |
| `event` | `true` | instantaneous (one frame) | |

Eases: `step`, `linear`, `easeInOut` (power2.inOut), `expoOut`, `backOut`.
Before a track's first key the property has its **base** value (`base[path]`), else the look's default.
A track with `"mute": true` is ignored. `"auto": true` marks a track generated from the analysis: it is rebuilt when the
section, the look or the stage changes, until someone edits it.

## Property paths (the registry)
Every element of every look is addressable. The registry is generated from the look's element tree
(`src/v8/registry.js`), so a new window or tag becomes keyframeable without code changes. In the studio, Inspect lists
them per element with a ◆ to keyframe any of them.

| element | paths |
|---|---|
| scene | `look` (exe, lab, scope), `stage` (nigredo, albedo, citrinitas, rubedo) |
| camera | `camera.shot` (shot), `camera.zoom` (×), `camera.x`, `camera.y` (px pan) |
| featured meter | `focus.featured`: `auto` (v8: the bracket hops to the window each beat is about), `none`, or a window id |
| logo chain | `logo.mode` (cycle, full, off), `logo.cycle` (bars per IN/OUT cycle, v8: 2), `logo.hero` (clip: whole chain, link lit on the half beat), `logo.scale` |
| pendant | `pendant.amp` (degrees; θ = A·cos(π·beat·2/period) × (1 − r/2 + r·bass)), `pendant.period` (beats, 2 = an extreme on every beat), `pendant.react` (r, 0.32), `pendant.size`, `pendant.x`, `pendant.y` |
| windows | `win.<id>.x / .y / .w / .h` (px on the 1080×1920 or 1920×1080 frame), `.visible` (a key opens or closes it in 6 steps on 32nds), `.open` (beat it steps in; −2 = open at frame 0), `.content` (logo, waveform, clock, bands, pendant, eq, spectrum, loudness, stereo, spectrogram, surface), `.accent` |
| meters | `meter.spectrum.floor / .trail / .smooth / .hold`, `meter.spectro.window / .gamma`, `meter.eq.range / .tilt`, `meter.loud.target / .floor`, `meter.stereo.persist / .gain`, `meter.session.span`, `meter.scope.span / .amp`, `meter.surface.rows` |
| text | `text.cue` (clip): `v` text with `{vars}`, `x`, `y` (0..1), `size` (px), `font` (mono, sans, serif, hand, stencil), `color` (ink, hot, dim, #hex), `align`, `box`. Typed one character per 64th note, hard cut at the end. |
| tags | `tag.<path>` for every leaf of `src/v8/tags.js` (e.g. `tag.notes.spectrum`, `tag.boot.2`, `tag.result.cta`) as text tracks; the `tags` object deep-merges static overrides |
| overlays | `hud.on`, `boot.on`, `result.on`, `result.at` (beat), `bracket.on`, `wires.on`, `notes.on`, `furniture.on` |
| finish | `fx.grain`, `fx.vignette`, `fx.scan`, `fx.flash` (event: 1-frame invert), `fx.glitch` (clip, opt-in, default off: thin slices ≤ 80 ms on each beat), `ground.pattern` (auto, graph, dots, scan, none), `ground.gridA`, `stage.<colour>` (bg, paper, card, ink, dim, rule, sig1, sig2, hot, stamp, tape) |

Window ids per look: exe `session chains clock bands elephant eq spectrum loud stereo spectro`; lab `chains session
elephant spectrum eq loud stereo spectro clock`; scope `chains elephant eq spectrum loud stereo surface (spectro on 16:9)`.

Tag variables: `{title} {Title} {titleWord} {producer} {bpm} {bpm2} {key} {keyShort} {stage} {stageN} {look}
{experiment} {date} {lufs} {srcLufs} {lra} {tp} {bars}`, plus `{angle}` in the pendant note and `{tc} {bbt} {songBar}` in the HUD.

## The default sheet (from the analysis)
`src/cues/generate.js`: the v8 film. Wide by default; focus pushes land on the bar lines 3, 7, 11 … (one beat in,
`easeInOut`), hold 1-2 bars and push back out; the window follows the look's v8 rotation unless a section changes
there (drop → logo, build → EQ, break → pendant). Pendant amplitude by section (drop 9°, else 4.6°; RUBEDO 9.8° / 5°),
logo cycle 2 bars, a 1-frame invert on the first drop downbeat, glitch off. Presets: **Calm** (wide, gentle swing,
4-bar logo cycle, no bracket), **Drop-focused** (cut to the logo + hero on every drop, bigger swing, a flash per drop),
**Meter tour** (a different meter featured every 2 bars).

## Editor
Lanes: Camera, Meter / focus, Look, Stage, Logo (cycle, hero), Pendant, Text, FX (flash, glitch), then every property
track added from Inspect. Double-click a lane to add a key; click / Shift-click / drag a marquee to select; drag to move
(Alt: no snap), drag a clip's right edge to resize, drag a number key up or down to change it.
Keys: Space play/pause · J reverse shuttle (×2 per press) · K stop · L play · I / O loop in / out · S split · Delete ·
← → nudge by the grid (Shift: a bar) · ↑ ↓ value · Cmd/Ctrl+Z undo · Shift+Cmd/Ctrl+Z redo · Cmd+C / V / D / A ·
+ / − zoom · , / . one frame · Home / End. Autosaved per beat in localStorage; Import / Export JSON in the toolbar.

## Native CLI (`--cues file.json`)
`src/cues/adapter-native.mjs` is the bridge for `u2c-motion/render.mjs`. Proposed change to the CLI:

```
--cues <file.json>   cue sheet (this format). Base look/stage are the defaults of --look/--stage; explicit flags win.
```
1. `const sheet = readCuesFile(fs.readFileSync(args.cues, 'utf8'))` (validates, warns on unknown paths).
2. `Object.assign(args, nativeArgs(sheet, args))`, then `tags = mergedTags(tagsDefault, cliTags, sheet)`.
3. Write `cueScript(sheet, { bars, aspect })` next to the tags file and add it to `film/v8/template.html`
   (`window.U2C_CUES = { sheet, plan }`).
4. **Plan mode** (small change to `film/v8/film.js`): use `plan.focus` for `FOCUS`, `plan.ampDeg[k]` for the per-beat
   amplitude in `B.pendulum`, `plan.logoCycleBeats` in `logoPhase`, `plan.flashBeats` for the drop invert.
   **Full mode**: load `web-app/src/v8/film.js` and `src/cues/schema.js` as ES modules in the page and call
   `createFilm({ D, assets, aspect }).render(ctx, t, { ev: createEvaluator(parseSheet(U2C_CUES.sheet)) })`; the data
   shape `D` is the native `U2C_DATA` (the web app's `src/v8/data.js` produces the same shape from its own analysis).
Times stay musical, so one sheet fits any length: keys after the last bar are ignored.
