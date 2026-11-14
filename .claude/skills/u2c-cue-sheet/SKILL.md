---
name: u2c-cue-sheet
description: U2C cue sheets (u2c-cues v1 JSON): editing and generating them, the BAR.BEAT.TICK time format, track kinds, the property registry, adding a new keyframeable property, and moving a sheet between U2C Studio (web) and the native renderer (--cues). Use for any change to what a U2C video does over time, or to a sheet file.
---
# U2C cue sheet

Spec: `web-app/CUES.md`. Code: `src/cues/schema.js` (parse/serialize/evaluator), `generate.js` (default + presets), `store.js` (undo/autosave), `adapter-native.mjs` (CLI bridge), `src/v8/registry.js` (property registry).

## Format essentials
`{format:"u2c-cues", version:1, meta:{bars, look, aspect, preset, ppq:960}, base:{path:value}, tags:{...}, tracks:[{path, kind, lane, auto, mute, keys:[{at:"BAR.BEAT.TICK", v, ease, dur, transition, ...}]}]}`.
- Time: 1-based bar.beat, 960 ticks/beat, from bar 1 of the section; `"4.1.0"` = beat 12. Keys may use `"beat": 12.5`.
- Kinds: number/color (interpolate with the LEFT key's ease), enum/bool/text (step), shot (move lands ON the key, runs `dur` beats before), clip (active `dur` beats), event (one frame).
- Eases: step, linear, easeInOut, expoOut, backOut. Before the first key: `base[path]`, else the look default.
- `auto:true` tracks are regenerated on section/look/stage change until edited.

## Generate / edit
- Default: `generateSheet({bars, labels: clipBarLabels(D), look, stage, aspect, preset})` (web Studio and native both call it; native when no `--cues`). Presets: default, calm, drop, tour.
- Studio: lanes + Inspect (◆ keyframes any registry path); Export / Import JSON in the toolbar.
- By hand: edit JSON, validate with `node -e "import('/home/user/beatmaking-visuals/web-app/src/cues/adapter-native.mjs').then(m=>m.readCuesFile(require('fs').readFileSync('s.json','utf8')))"` (prints warnings for unknown paths).

## Native
`cd /home/user/u2c-motion && node render.mjs --cues sheet.json [--look/--stage override] [--stills t,..|--filmstrip]`. The sheet's base look/stage become defaults; explicit flags win (their tracks are replaced by one key). Tags: DEFAULT_TAGS <- sheet.tags <- {title, date} (<- --tags).

## Add a keyframeable property (registry)
1. Read it in the look code through `V('<path>', default)` (film.js) or `L.meter(kind, key, def)` (meters) at the current beat. Never cache it across frames.
2. Register it in `registry.js buildRegistry` (element group, `num/en/bool/col`, min/max/step/unit) or `METER_PROPS`. Windows, meters and tags register automatically from `LAYOUT`/`CONTENT`/`tags.js`.
3. Document the path in `CUES.md` (table) and, if it creates timed events, add them to `film.js schedule()`.
4. `node tools/sync_web.mjs` in u2c-motion. Full path list: `references/property-registry.md`.

## Tests
`node web-app/tests/smoke.mjs` (round trip, registry count, editor ops) · `tests/sync_test.py --cues sheet.json` · parity: `node web-app/tools/parity.mjs <dir>` + native stills + `tools/parity_diff.py <dir>` (same code + data must be bit-identical).

## Done checklist
- [ ] Sheet validates with no unknown-path warnings; times on the grid.
- [ ] New property: read via V(), registered, documented, synced.
- [ ] Smoke + sync PASS; parity 0 diff for code changes.
