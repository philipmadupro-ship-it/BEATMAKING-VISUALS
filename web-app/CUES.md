# U2C cue sheet (`u2c-cues`, version 1)

A cue sheet describes a beat video over **musical time**. The studio's timeline edits it, the preview and the MP4
export render it, and the native renderer can read the same file (`--cues file.json`, see the end). One JSON document:

```json
{
  "format": "u2c-cues", "version": 1,
  "meta": { "beatsPerBar": 4, "ppq": 960, "bars": 16, "look": "exe", "aspect": "916", "preset": "default" },
  "base": { "look": "exe", "stage": "nigredo", "win.eq.accent": "#ffffff" },
  "tags": { "hud": { "right": "{bpm} BPM · {key}" } },
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

### Interpolation types and bezier handles (optional, added in the same version 1)
A `number`, `color` or `shot` key may carry `ty` (the segment from this key to the next):

| `ty` | curve | glyph in the editor |
|---|---|---|
| `hold` | step (holds until the next key) | square |
| `linear` | straight line | diamond |
| `bezier` | cubic through this key's `ob` and the next key's `ib` | circle |
| `auto` | monotone curve through the neighbours (Fritsch-Carlson; flat at the ends, never overshoots) | circle with a dot |

Handles live in the segment's unit square, like CSS `cubic-bezier()`: `ob: [x1, y1]` with x1 in 0..1, `ib: [x2 - 1, y2 - 1]`
with x in -1..0 (stored on the key the segment arrives at). y is a fraction of the value change and may overshoot
(`backOut`-like). x is clamped, so the curve is a function of time; the evaluator solves x(t) = u with Newton steps and
falls back to bisection. A shot key's bezier shapes its own push (`ob` and `ib` both on the key). Keys without `ty`
evaluate exactly as before from `ease`; a key that has `ty` still writes the nearest named `ease`
(hold → `step`, linear → `linear`, bezier/auto → a close named ease), so a reader that only knows `ease` (the native
plan mode) renders a close approximation. Ease presets in the editor: Hold, Linear, Ease in-out, Ease in, Ease out,
Expo out, Back out, Hit (fast in, slow out), Snap (late, hard), Auto bezier; named ones keep the exact v1 curve.

### Lane flags and markers (optional)
Tracks may carry `lock` (not editable in the timeline), `solo` (while any track is soloed, only soloed tracks evaluate:
preview AND export), `target` (track targeting) and `h` (lane height in px). Only flags that are set are written.
The sheet may carry `markers: [{ "at": "3.1.0", "label": "drop", "kind": "cue" }]` (`kind`: cue, drop, hit, note).
Analysis markers (downbeats, beats, kick / snare / hat onsets quantised to the 16th grid, section starts) are derived
from the analysis at load and are not stored. **Migration on load**: `parseSheet` drops invalid `ty`, clamps handle x
ranges, ignores unknown fields, sorts markers; a sheet without any of these fields is a plain v1 sheet.
Before a track's first key the property has its **base** value (`base[path]`), else the look's default.
A track with `"mute": true` is ignored. `"auto": true` marks a track generated from the analysis: it is rebuilt when the
section, the look or the stage changes, until someone edits it.

## Property paths (the registry)
Every element of every look is addressable. The registry is generated from the look's element tree
(`src/v8/registry.js`), so a new window or tag becomes keyframeable without code changes. In the studio, Inspect lists
them per element with a ◆ to keyframe any of them.

| element | paths |
|---|---|
| scene | `look` (exe, lab, scope, player), `stage` (nigredo, albedo, citrinitas, rubedo, white) |
| camera | `camera.shot` (shot), `camera.zoom` (×), `camera.x`, `camera.y` (px pan) |
| featured meter | `focus.featured`: `auto` (v8: the bracket hops to the window each beat is about), `none`, or a window id |
| logo chain | `logo.mode` (cycle, full, off), `logo.cycle` (bars per IN/OUT cycle, v8: 2), `logo.hero` (clip: whole chain, link lit on the half beat), `logo.scale`, v9: `logo.glow` (×, pulses on kicks), `logo.bloom` (×, on drop phrase downbeats), `logo.runner` (lit link stepping on 16ths) |
| pendant (v11 rigid-link chain, PBD) | `pendant.amp` (degrees at the body's extremes, × (1 − r/2 + r·bass)), `pendant.period` (beats, 2 = an extreme on every beat), `pendant.react` (r, 0.32), `pendant.links` (10), `pendant.wave` (chain looseness = 1.5 - friction; joint friction 4 x (1.5 - wave) per s, 0.75), `pendant.damp` (pendulum drag ζ, 0.35), `pendant.chain` (chain length, 0.3 of the window), `pendant.size`, `pendant.x`, `pendant.y` |
| windows | `win.<id>.x / .y / .w / .h` (px on the 1080×1920 or 1920×1080 frame), `.visible` (a key opens or closes it in 6 steps on 32nds), `.open` (beat it steps in; −2 = open at frame 0), `.content` (logo, waveform, pendant, eq, spectrum, loudness, stereo, spectrogram, surface, levels, ghost), `.accent` |
| meters | `meter.spectrum.floor` (72) `/ .top` (-6) `/ .hold` (v12 analyser; `.mode/.trail/.smooth` are legacy, ignored), `meter.spectro.mode` (ms, m) `/ .range / .window / .gamma`, `meter.eq.*`, `meter.stereo.*`, `meter.levels.*`, `meter.loud.*`, `meter.ghost.history`, `meter.session.span` (bars, 2; the playhead is fixed at the centre) `/ .look` (envelope = 12 ms peak hold, the film default; exact = one true min/max column per device pixel, what tests/test_waveform_render.py checks), `meter.scope.span / .amp`, `meter.surface.rows` (details below) |
| imager | `meter.stereo.mode` (sample = polar sample, default; level = polar level; lissajous), `.range` (dB from the rim to the centre of the log radius, 40), `.persist` (s, 0.42), `.smoothing` (polar-level fill release, dB/s, 12), `.hold` (polar-level outline hold, s, 0.5), `.gain` |
| EQ | `meter.eq.range` (EQ scale ± dB; 0 = auto from the curve: 3/6/12/30), `.anRange` (analyzer range 60/90/120 dB), `.mode` (pre-post, pre, off), `.tilt` (dB/oct about 1 kHz, 4.5), `.smoothing` (analyzer release, dB/s, 20), `.hold` (analyzer peak hold, s; 0 = off), `.strength` (match EQ %, 50) |
| level meters | `meter.levels.mode` (peak-rms = peak + 300 ms RMS; k20 / k14 / k12 = K-system, 600 ms RMS + 3.01 dB), `.scale` (live = the measured Live 12 table, linear), `.range` (dB, linear scale), `.smoothing` (peak release, dB/s, 20; 11.8 = IEC slow), `.hold` (s, 1.5), `.style` (auto, gradient, segment), `.grThresh` (gain-reduction threshold dB; 0 = auto: 6 dB below the level the loudest 2 % of 1 ms blocks exceed), `.grRatio` (4), `.grRelease` (ms, 120; attack 1 ms), `.grDet` (peak, rms). The GR bar is a feed-forward bus compressor run on the clip's own envelope (meterlib.grCurve, Giannoulis et al. 2012), so it dips on every kick |
| EQ dynamics (v11) | `meter.eq.depth` (dB the lowest band ducks at full detector, 5; bands 60-150 Hz 60 %, higher bands 45 %), `.attack` (detector attack ms, 4), `.release` (ms, 140), `.sens` (dB jump above the band's own 90 ms level = full, 10), `.ghost` (gain-reduction ghost trail s, 0.14), `.regions` (band regions on/off), `.piano` (piano strip on/off). The detector is analysis/bandenv.js (`D.be`, 1 ms, 6 bands); native data without it falls back to the per-frame band levels. |
| level meters | `meter.levels.mode` (peak-rms = peak + 300 ms RMS; k20 / k14 / k12 = K-system, 600 ms RMS + 3.01 dB), `.scale` (live = the measured Live 12 table, linear), `.range` (dB, linear scale), `.smoothing` (peak release, dB/s, 20; 11.8 = IEC slow), `.hold` (s, 1.5), `.style` (auto, gradient, segment) |
| loudness | `meter.loud.layout` (history, gauge), `.focus` (ghost = the camera's focus shot on this window shows the ghost readout; meter), `.target` (LUFS), `.floor` (history range), `.scale` (linear, compressed), `.window` (s of history; 0 = the whole clip) |
| text | `text.cue` (clip): `v` text with `{vars}`, `x`, `y` (0..1), `size` (px), `font` (mono, sans, serif, hand, stencil), `color` (ink, hot, dim, #hex), `align`, `box`. Typed one character per 64th note, hard cut at the end. |
| tags | `tag.<path>` for every leaf of `src/v8/tags.js` (e.g. `tag.hud.right`, `tag.windows.eq`, `tag.result.meta`) as text tracks; the `tags` object deep-merges static overrides |
| video layer (v19) | `video.on` (bool, off), `video.target` (hero = the player hero cell after the cover and before the MIDI map; full = the whole frame over the windows; waveform = the waveform window; on exe / lab / scope `hero` falls back to `full`), `video.blend` (screen, multiply, overlay, difference, lighten, darken, luminosity, soft-light; drawn with `globalCompositeOperation` inside save / restore), `video.opacity` (0..1, 0.8), `video.offset` (seconds: video time = clip time + offset; read by the UI, which seeks the source), `video.fit` (cover, contain), `video.desat` (0..1; defaults to 1 on the grey stages so Nigredo stays grey). The video is session-only: uploaded in the studio (Export tab), never leaves the browser, not part of the sheet file. The preview keeps an HTMLVideoElement on the clock; the offline export seeks it to t + offset and waits for `seeked` before every frame. |
| overlays | `hud.on`, `result.on`, `result.at` (beat), `bracket.on` (accent rim on the hero window) |
| glass (v11) | `glass.radius` (px), `glass.tint` (0..0.9), `ground.pool` (light pools, 0..2), `fx.halation` (dark stages, 0..0.6) |
| finish | `fx.grain`, `fx.vignette`, `fx.scan`, `fx.flash` (event: 1-frame invert), `fx.glitch` (clip, opt-in, default off: thin slices ≤ 80 ms on each beat), `ground.pattern` (auto, graph, dots, scan, none), `ground.gridA`, `stage.<colour>` (bg, paper, card, ink, dim, rule, sig1, sig2, hot, stamp, tape) |

Meter keys step (enum / bool) or interpolate (numbers) like any other track: e.g. a key `meter.stereo.mode = level` on a
bar line switches the vectorscope to polar level on that downbeat, `meter.levels.mode = k14` turns the strip into a K-14
meter. The match-EQ bands themselves are not keys: they are fitted per song section from the audio and change only on the
section's first bar line (4-frame ease). Window content kinds now include `levels` (DAW strip meter) and `ghost` (hero
readout); the DAW level strip also sits inside the loudness window (v10: the bands window is gone).

Window ids per look (v12: **no EQ window in any look**; the `eq` content kind and every `meter.eq.*` key stay registered (hidden in the
inspector, `registry.byPath` still has them) so old sheets load; a sheet that sets `win.<id>.content = eq` still draws it):
exe `session loud stereo spectro spectrum` (stereo = the imager) + the **hero** (logo + pendant, a front layer, not a window);
lab `chains session elephant spectrum loud stereo spectro`; scope `chains elephant spectrum loud stereo surface spectro`.
Exe 9:16 (1080x1920): session 1016x366 at (32,112) · loud 494x596 (32,502) · stereo 494x596 (554,502) · spectro 1016x250 (32,1122) · spectrum 1016x414 (32,1396).

Hero (exe only, v12; `film.js` heroGeom): the logo is centred (bbox-exact) at `layout.js HERO[aspect]` (9:16 cx 540, cy 614, 392 px wide) and the pendant's chain
hangs from the bottom of the U (logo px 132,588), so the chain-sim hand follows the logo (incl. its kick punch). Keys: `hero.on`, `hero.scale`
(logo + chain + pendant), `hero.x / hero.y` (px), `hero.shadow` (×), `hero.vignette` (× dark pool under the hero), `logo.hold` (bars the hero logo stays fully threaded between an IN and an OUT, default 10), `glass.back` (meter windows pushed back: darker glass, softer edge light, more
backdrop blur; 0 = v11 look). `pendant.chain / .size / .x / .y` still scale the chain, the pendant and the hand offset. The hero is drawn over the windows
with a soft shadow; during a push to `loud` / `stereo` it is hidden (hard) so the pushed meter is clear. Swing extremes are unchanged (anchor-only change).


Tag variables: `{title} {Title} {titleWord} {producer} {bpm} {bpm2} {key} {keyShort} {stage} {stageN} {look}
{experiment} {date} {lufs} {srcLufs} {lra} {tp} {bars}`, plus `{angle}` in the pendant note and `{tc} {bbt} {songBar}` in the HUD.

### Intro (v11, lane `intro`, `src/v8/intro.js`)
The first `intro.length` bars (default 2 = 8 beats) are a liquid-glass player + cover-flow carousel that ends in a hard cut into the lab; the lab then builds after the cut (default window open beats and the boot terminal shift by the intro length). Clip length is unchanged. Covers: `assets/covers/cover-0..4.jpg` (cover-0 is the beat's own; Nigredo = pure grey, other stages = luminance mapped through the stage ramp). Text: tags `intro.title`, `intro.credit`, `intro.cards[0..4]`.
| path | kind | meaning |
|---|---|---|
| `intro.on` | bool | optional (default true); false = start in the lab (native `--intro off`) |
| `intro.length` | number (bars) | optional (default 2), read at beat 0 |
| `intro.index` | number (cards) | carousel position; default keys: start on cover-4, 4 eased snaps of 0.5 beat landing ON beats 3..6, one direction, ending on cover-0 |
| `intro.select` | bool | optional: corner brackets step in (4 x 32nd) around the chosen card; without a key they start where `intro.push` starts (beat 6) |
| `intro.push` | number 0..1 | exponential push-in on the chosen cover (default: bezier 0 to 1 over beats 6 to 8, fills the frame, cut at beat 8) |
| `intro.zoom` | number | max zoom (0 = exactly the framing at which the lab's cover card fills the frame, `coverTarget()` in intro.js: `L.coverRect` or the compartment centre rect) |
| `intro.enter` | number 0..1 | v13 start: linear keys 0 to 1 over beats 0-2; the cards fan out of one stack (land on beat 2) and the player rises (lands on beat 3) |
| `intro.open` | number (beats) | v13: after the cut the lab camera starts on the cover and dollies out to the wide shot over this many beats (default 2; 0 = none); both halves of the zoom carry streak copies |
| `intro.player.scale` / `.opacity` | number | player pose (static 1 / 1: no fades by default) |

## The default sheet (from the analysis)
`src/cues/generate.js`: the v8 film. Wide by default; focus pushes land on the bar lines 3, 7, 11 … (one beat in,
`easeInOut`), hold 1-2 bars and push back out; the window follows the look's v8 rotation unless a section changes
there (v12, `SECTION_PUSH` in layout.js; exe: drop → spectrum, build → waveform, break → imager; lab/scope: drop → logo, build → spectrum, break → pendant; no EQ pushes). The exe rotation is waveform, spectrum, imager, levels. Pendant amplitude by section (drop 9°, else 4.6°; RUBEDO 9.8° / 5°),
logo cycle 2 bars, a 1-frame invert on the first drop downbeat, glitch off. Presets: **Calm** (wide, gentle swing,
4-bar logo cycle, no bracket), **Drop-focused** (cut to the logo + hero on every drop, bigger swing, a flash per drop),
**Meter tour** (a different meter featured every 2 bars).

## Editor
Lanes: Camera, Meter / focus, Look, Stage, Logo (cycle, hero), Pendant, Text, FX (flash, glitch), then every property
track added from Inspect, grouped per element (a group of two or more lanes folds into one summary row with the chevron).
Double-click a lane to add a key; click / Shift-click / drag a marquee to select; drag to move, drag a clip's right
edge to resize, drag a number key up or down to change it.

- **Markers**: a strip under the sections: downbeats, beats, kicks (triangles, size = strength), snares (squares), hats,
  section starts and the sheet's own markers (flags). Click the strip to jump to a marker; click its header to cycle the
  density (Fewer, More, All, Off). M adds a marker at the playhead; a selected marker is edited in the inspector.
- **Snapping**: the Snap buttons set the grid; the magnet (N) also pulls to markers, other keys, the playhead, the loop
  and bar lines within 7 px (marker > key > playhead/loop > bar). A dashed line shows the snap point. Alt drags free.
- **Lanes**: header = chevron, name, ‹ ◆ › (previous key, add / remove a key at the playhead, next key), target (square),
  solo S, lock (padlock, hatched lane), mute M. G or a double-click on the name toggles a tall lane; drag a lane's bottom
  edge or Alt+wheel on its header to size it. Compact lanes (toolbar) shrink rows to 16 px; on a laptop the editor goes
  compact automatically and folds the groups you never opened, so every lane is on screen.
- **Curves**: number lanes draw the evaluated curve (the playback evaluator, sampled every 2 px); tall lanes fill under
  it and show bezier handles for selected keys (drag; the opposite handle follows unless Alt). E opens the graph view:
  the focused number lane fills the timeline. B cycles hold → linear → bezier → auto.
- **Pattern tools** (inspector, with keys selected): Quantise to markers or the grid with a strength (Q / Shift+Q),
  Stamp the selection on every beat, offbeat, bar, 2 bars, section, kick, snare or marker (in the loop, else the whole
  video), Paste attributes (Shift+Cmd+V: the copied key's interpolation and handles), Save as a key preset. With nothing
  selected the inspector is the Effect Controls: element groups, ◆ / ‹ › per property, scrubby labels (drag sideways,
  Shift ×10), a mini key strip per animated property aligned with the timeline, key presets (at the playhead or stamped).
- **Ripple**: R inserts a bar at the playhead's bar, Shift+R deletes it (keys inside are removed); later keys and the
  sheet markers move by 4 beats. **Targeting**: the square in a lane header (Shift-click: all / none) or T; with nothing
  selected, ] [, ;, Q, R and single-lane paste act on the targeted lanes.
- **Zoom**: + / − (Ctrl+wheel), Z zoom to the selection (else the loop), Shift+Z the loop, \ fit; the minimap bar at the
  bottom shows the whole video: drag the viewport to pan, its edges to zoom.

Keys: Space play/pause · J reverse shuttle (×2 per press) · K stop · L play · I / O loop in / out · S split · Delete ·
← → nudge by the grid (Shift: a bar) · ↑ ↓ value · [ ] previous / next key (Alt: any lane) · Shift+[ ] previous / next
marker · ; key at the playhead · M marker · Q / Shift+Q quantise · B interpolation · G lane height · E graph · Z / Shift+Z
zoom · \ fit · N magnet · R / Shift+R ripple a bar · T target · Cmd/Ctrl+Z undo · Shift+Cmd/Ctrl+Z redo ·
Cmd+C / V / D / A · Shift+Cmd+V paste attributes · + / − zoom · , / . one frame · Home / End.
Autosaved per beat in localStorage; Import / Export JSON in the toolbar.

## Native CLI (`--cues file.json`): implemented (v9)
One cue sheet drives both renderers, with ONE copy of the look code. `u2c-motion` (branch v9) renders the web app's
own composition: `node tools/sync_web.mjs` copies `src/v8/*`, `src/cues/{schema,generate,adapter-native}` and the brand
assets into `film/v9/` (+ `SYNCED.json`, sha256 per file; `render.mjs` warns when out of sync). `film/v9/template.html`
registers the HyperFrames timeline, `film/v9/boot.mjs` imports `createFilm` and draws `film.render(ctx, t, {ev, tags})`
on every `hf-seek`, with the native analysis adapted by `src/v8/data.js fromNative()`.
v10 (meters v2): the sync also copies `src/analysis/{meterstreams,msspec,dsp,stereo,truepeak}.js` + `src/export/audio.js`;
`tools/meterdata.mjs <id>` (run by `render.mjs` when the data file lacks them) computes the scope / polar-level / level /
M-S streams from the mastered clip WAV with `meterstreams.js` (the same code the web analysis runs) and stores them,
base64 per typed array, as `meters` in `film/data/<id>.js`; `clipdata.py` adds `frame.bandDb` and writes the
goniometer side as (r − l)/√2 (+S = right).

```
node render.mjs --cues sheet.json [--beat x.wav --title T --aspect 9:16 --len 30] [--stills t,..] [--filmstrip]
node render.mjs                         # no --cues: generateSheet() default from the analysis (same as the studio)
node render.mjs --test pendant|waveform # element test cards; --engine v8 renders the frozen v8 film
```
The sheet's base/first look and stage are the defaults of `--look/--stage`; explicit flags win (their tracks become
one key). Tags: `tags.js` defaults <- `sheet.tags` <- `{title, date}` (`--title`, `--date`) <- `--tags`.
Parity: `node tools/parity.mjs <dir>` exports the studio's default sheet and renders frames with this code; native
stills of the same sheet differ by 0 (bit-identical, same browser build) when fed the same analysis
(`tools/parity_diff.py`). Frames from the studio's own in-browser analysis differ only where the analyses differ.

### v13 compose (stage compartment, logo glow, imager)
- Window `stage` (exe): `win.stage.*` rect/open/visible; content `cover`. New keys: `cover.pulse` (x, cover kick scale + brightness lift, default 1), `cover.dim` (x, scrim, 1; v13 default scrim 0.74 / floor 0.82 so the logo reads, the intro push darkens into the same `coverScrim()`), `stepgrid.on` (bool, default OFF: the cover fills the panel; v13 correction), `stepgrid.glow` (x, 1), `logo.decay` (s, glow decay time constant, default 0.17).
- Logo glow: strength = `logo.glow` x (0.35 + 0.8 I); I jumps to the kick's strength on the kick's own frame and decays exponentially (`logo.decay`), never a hard off; the bloom radius (blur) follows I. The logo punch scale uses the same I.
- 16-step grid (bottom of the stage card): the step of the current 16th lights (crisp hot outline), kick steps (filled dot) brightest, snare steps (ring dot) next, from the onset analysis of the bar; each lit step decays over ~120 ms.
- Hero = the U2C logo only, centred on its bbox in the stage card (`hero.x/y` offsets, `hero.scale`). The pendant is no longer in the hero (`pendant.*` still drives the pendant test card and the lab/scope elephant windows).
- Imager (stereo): BAND WIDTH and WIDTH removed; a static pendant mark in a ring + thin inner ring fills the freed space (exe).

### v14 player look + white stage
- `look: player` (U2C.PLAYER): windows `session` (waveform), `loud`, `stage` (hero: logo + STATIC pendant mark + caption), `stereo`, `spectro`, `spectrum`, `now` (now-playing: real song time, duration from the file, pause icon pulses on the beat), `inserts` (4 live tiles), `meta` (format / sample rate / bit depth / size from the wav, duration, date, tags, barcode from the title). 16:9 adds a sidebar; 9:16 drops it (condensed top bar, `now` is a strip). The top tab (PLAYER > ANALYSIS > MIX > MASTER) follows the camera.shot target on the beat the push starts (spectrum/spectro = ANALYSIS, loud/stereo = MIX, session = MASTER, wide = PLAYER).
- Tags (all editable): `player.nav[]`, `player.vol`, `player.tracks[]`, `player.mark`, `player.coords[]`, `player.tabs[]`, `player.sub`, `player.info`, `player.pill`, `player.now.title|sub`, `player.caption[]`, `player.meta.labels[]`, `player.meta.tags` (default "EXPERIMENTAL, TRAP"), `windows.inserts|meta`.
- `fx.flash` is now OFF by default in every look (generated sheets carry no flash keys); the track and the 1-frame invert stay keyframeable.
- `stage: white` ("NIGREDO INVERSE"): the Nigredo palette, then the whole finished frame (HUD, intro included) is inverted as the last pass (`difference` with white, the same op as fx.flash). Greys only (R=G=B), works in every look; native `--stage white`.

- `hero.caption` (player look, bool, default false): the title / prod. / vol. caption inside the hero cell. Off by default: the title is already in the top bar and the now-playing card.
- `glass.bezel` (player look, 0..2, default 1): the double-bezel inner core hairline + top light inside every card.
- `meter.session.spikes` / `meter.session.kickflash` (bool, default false): the bright transient columns and the played-side kick flash on the waveform (off: they flickered while scrolling).
- `hero.cover` (player, bool, default true): the darkened cover-0 behind the hero logo; the intro match-cut lands on it at width-fit zoom.
- `hero.elephant` (player, bool, default false): the elephant mark under the logo (removed in v14.2).
- `player.cover` (player, 0..4, default 0): which cover the hero / now playing use; the studio's **Upload cover** replaces cover 0 for the session.
- `player.tabs169` (player, bool, default false): the top tabs on 16:9. 9:16 shows the tabs from tag `player.tabs` (default: PLAYER only).
- Tags `player.inserts` (slot names), `player.meta.labels`, `player.meta.tags`, `player.nav`, `player.sub`, `player.now.*`: every player text is editable in Tags.
- Player waveform default `meter.session.span` = 1 bar (more detail).
- `fx.invert` (clip): the whole frame inverted while the clip runs (player: the first drop bar).
- `fx.punch` (0..0.06, player default 0.014): camera zoom per kick.
- `meter.session.style` (smooth|blocks, player default blocks): the cut-box waveform.
- `meter.session.low|mid|high` (colours): the waveform's 3 band boxes (LOW 20-150 Hz kick/808, MID 150 Hz-2 kHz snare/vocals, HIGH 2-20 kHz hats). Defaults follow the stage (greys in Nigredo).
- `chrome.lights` / `chrome.lightsColor` / `chrome.glyphs` (player default on): macOS traffic lights on every window (not the now-playing card), true colours even on the white stage and in the negative.
- Player 9:16 camera: in on a panel 1 bar, wide 1 bar, every 2 bars from bar 3 (spectrum, waveform, imager, levels, hero), half-beat ease-out pushes.
- `hero.fry` (player: none|negative|thermal|night; Nigredo default negative, colour stages thermal): deep-fried cover.
- `scan.on` / `scan.color` (#39ff6a): detection boxes on the hero (tag `player.detect`), re-acquire each downbeat, flash on kicks.
- Traffic lights now in stage colours (Nigredo black).
- Detection boxes v16.1: stage colours (`scan.color` black in Nigredo / hot in colour stages, `scan.text`), static, no % (`scan.conf` off).
- Player intro cut: panels open centre-out from the hero, one 32nd note per ring (motion-design skill: dashboard-load choreography).
- Eases `emphasized` (MD3 0.05,0.7,0.1,1) and `standard` (0.2,0,0,1) for camera keys; the 9:16 pushes use them.
- v17 player camera: never-cut travel panel to panel every 2 bars (MD3 emphasized, 1 beat, lands on the bar), one wide breath per cycle; last 2 bars push into the hero and `camera.zoom` dives into it on the final bar (loop into the intro).
- v17 `fx.punch` uses a closed-form critically damped spring per on-grid kick (peak at 40 ms, no overshoot).
- Player: `result.on` off (no end card).
- v17 `spring` ease (closed-form critically damped step response, lands at u = 1) for the player camera travel.
- `focus.bracket` (player): a stage-colour bracket travels between panels with the camera; leading edges on a faster spring (w 13) than trailing (w 7).
- Player window labels/buttons appear only once the glass is mostly open (container before text).
- v17.1 `outro.rewind` (player, default on): the beats before the last bar dolly into the hero (mirror of the opening dolly), then the last bar plays the intro backwards (cubic ease-out) into frame 0 = seamless loop.
- Intro cover-flow opens on the beat's cover: index 0 -> 1 -> 2 -> 1 -> 0 (snaps land on beats 3-6), push ends on cover 0.
- Native render: `--mblur N` (default 3 sub-frames) `--shutter 0.5` (180 deg) = motion blur; stills are unblurred.
- v17.2 pacing (player): intro push ease-in softened (bezier ob 0.42), intro.open 3 beats, panels build over 6 sixteenths with 16th-note rings, camera travels 2 beats, logo cycle 4 bars, rewind 2 bars (sine in-out).
- Native: adaptive motion blur (2 extra sub-frames only when the camera/intro moves); u2c.py render runs 9:16 + 16:9 in parallel.
- v18 `social.on` (player): HOOK dialog on frame 0 with a loading bar over the intro, CTA 1 at `social.cta1.at` (beat 32) and CTA 2 at `social.cta2.at` (beats from the end), Y2K system dialogs; texts in tags `social.*`.
- v18 `cursor.on`: Y2K arrow cursor glides to each camera target and clicks on the beat the travel starts.
- v18 `roll.on` / `roll.mini` / `roll.span` / `roll.playhead` / `roll.color`: MIDI map on the hero (melodic peaks as dot trails, ink bars at the playhead, onset circles, next-bar mini-rolls).
- v19 mouse layer (`cursor.on`, screen space): pre-roll on the paused player (native `--preroll`, default 0.7 s for the player, audio delayed by it), the cursor clicks PLAY, clicks the chosen card (push), clicks each panel before the camera travels, closes each CTA with its x, clicks the hero before the outro, and returns to rest (last frame = frame 0). Minimum-jerk curved paths, press + ring.
- v19 `hero.ride` / `hero.rideAmt`: the hero logo rides the melody (MIDI-map strongest note), +-7 percent of the cell.
- v19.1: phone legibility floor 25 px (player 9:16); detection boxes only while the camera is on the hero (`scan.always` to keep them); the camera cycle has wide breaths and the 2 CTAs land on them (social.cta*.at/len set by the generator); frame 0 already 40 percent fanned (bigger thumbnail); tags social.caption / hashtags / hooks for posting.
- v19.2: 16:9 camera moves 3 beats (calmer YouTube pacing); `hero.fry` = stage (posterized through the stage's own ramp) is the default for Albedo / Citrinitas (thermal stays Rubedo).
- v19.3 player intro: silent pre-roll browse (negative beats: intro.index 2 -> 1 -> 0 on cursor clicks, intro.enter, intro.select at -1.25), then the cursor clicks play at beat 0 and the push runs over bar 1 (intro.length 1); native `--preroll` default 1.9 s; the rewind outro runs back through the browse to the first frame.
- v19.3 `focus.window` / `focus.dim`: the clicked panel comes to the front (3 percent bigger), the rest dims behind it.
- v19.3 player logo threads in/out every 4 bars (`logo.hold` 0); MIDI map notes must persist over 3+ frames (no drum / noise ghosts); the now-playing player sits at the bottom (9:16 above the caption zone, 16:9 right column bottom).

## v20 editor (U2C Studio)
- **Media bin** (left rail → Media): 5 cover slots. Slot 0 is the beat cover: the hero, now playing, the card the cursor chooses, and the loop's last frame. Slots 1-4 are the browse covers. You can drop many images at once, drag one slot onto another to swap, × resets a slot, and covers persist in IndexedDB. Video layer and beat are also replaceable by drop. API: `u2c.media.{setCover, resetCover, swap, addFiles, list}`.
- **Blur** (viewer bar): the preview runs the export's motion blur (shared `createBlur` in `engine/render.js`) on the export frame grid.
- **Review** (Export tab): key moments rendered as the MP4 will have them (pre-roll, blur), checks (loop seam vs frame 0, covers, length, blur, intro, clicks, video layer, long text) and every word in the video as live, undoable fields.
- Fix: switching look / stage also updates the sheet base, and the film reads look / stage at beat 0 during the pre-roll. Before this fix, a web Player export opened its intro without the hook, cursor and play icon.

## v21 motion (PROMPT-v21)
- **Seeded variation** (`generate.js`): seed = hash of the title, or `meta.seed`; native `--seed N`.
  - `intro.browse`: +1 = cards come from the left, −1 = from the right, 0 = the cursor clicks the beat cover directly.
  - The window order is a seeded shuffle. The first three visits are always hero + rack + one other, and there are two wide breaths per 16 bars for the CTAs.
- **Arrival:** after the push, the lab settles on a closed-form spring (w 7, launch v0 6) and is then still. The kick punch waits one bar.
- **Outro** (`outro.mode` dialog | rewind):
  1. The JOIN / CREATE PROJECT dialog (tags `social.outro.*`) pops on the hero, and the cursor clicks its × at E−9.
  2. The camera dollies into the cover and cuts to the intro.
  3. One decelerating zoom out (3 beats).
  4. The cover-flow and fan glide back to their frame-0 state (2 beats), the hook dialog springs back, the player is paused, and the last frame equals frame 0.
- **Terminal words:** `term.line` clips (number = `social.terminal[n]`, or text) type in one character per 1/64, hold, and delete backwards. `term.on` switches them.
- **Hero:** `hero.bands` puts three Edison-style filled waveforms (low / mid / high band envelopes, current bar, no labels) in the right column. The right detection boxes are dropped while it is on.
- **Imager:** `meter.stereo.orbit` turns the disc into a full-circle vectorscope (orbit), smaller, with both halves.
- **Rack:** SCOPE (raw L/R oscilloscope, half a beat, auto-gain) replaces FILTER. WIDTH stays.
- **v21.1 references:**
  - SUBJECT dossier metadata with a phosphor glow: ruled rows, small keys and big values, a live signal box. The 9:16 strip shows 6 fields in 3 columns, and the dossier replaces the 9:16 spectrogram strip; it is visited and lifted like the rack.
  - `hero.halftone` prints the hero cover as a 45° halftone.
  - `ground.editorial` adds big soft words plus registration lines, crosshairs and FIG notes behind the glass (tags `ground.words` / `ground.notes`).
