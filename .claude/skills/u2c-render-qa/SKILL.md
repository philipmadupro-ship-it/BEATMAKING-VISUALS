---
name: u2c-render-qa
description: How to render U2C beat videos (U2C Studio web export and the native HyperFrames CLI, one cue sheet for both), make filmstrips and stills, run the automated QA tests, and run the director-notes loop. Use for any render, re-render, delivery or review of a U2C beat preview.
---
# U2C render + QA

`NAT=/home/user/u2c-motion` (branch v9), `WEB=/home/user/beatmaking-visuals/web-app`. Python: `$NAT/.venv/bin/python`.

## 0. Sync first (single source of the look)
`cd $NAT && node tools/sync_web.mjs` copies `$WEB/src/v8`, `src/cues/{schema,generate,adapter-native}`, brand assets into `film/v9/` (+ `SYNCED.json`). render.mjs warns if out of sync (`--check`). Never edit `film/v9/src`.

## 1. Native (delivery)
```
cd $NAT
node render.mjs --cues sheet.json --beat audio/<beat>.wav --title "TITLE" --aspect 9:16 --len 30 --filmstrip
#   -> out/v9/<look>-<stage>-<916|169>-<len>s.mp4 (+ out/v9/filmstrips/*-filmstrip.png), AAC 320k/48k, -14 LUFS, <= -1 dBTP
node render.mjs ... --stills 2,8,14 --out <dir>          # PNG frames (fast review)
node render.mjs --test pendant|waveform ...              # element test cards (4 bars)
node render.mjs --engine v8 ...                          # the frozen v8 film
```
No `--cues` = the studio's default sheet generated from the analysis (`--preset calm|drop|tour`). A 30 s 9:16 takes ~10-20 min (software GL): run in the background, log to `out/v9/render-*.log`.

## 2. Web (U2C Studio)
Export tab -> Export MP4 (offline WebCodecs). Batch: `python3 -m http.server 8765` in `$WEB`, then `node tools/render-demos.mjs <wav> exe:916`. Export the sheet (toolbar Export JSON or `u2c.cues.toJSON()`) to render natively.

## 3. Parity (one sheet, both renderers)
```
node $WEB/tools/parity.mjs $NAT/out/v9/parity            # exports the default sheet + web frames (web-code on native data, web-app own analysis)
cd $NAT && node render.mjs --cues out/v9/parity/cues-web-default.json --title "ATELMANSION 3" --date PARITY --stills 1,5,9.5,14,22,28 --out out/v9/parity/native
(cd out/v9/parity && for f in native/t-*.png; do mv $f native-$(basename $f); done; ../../../.venv/bin/python $WEB/tools/parity_diff.py .)
```
Expect native vs web-code: 0 diff (bit-identical). web-app differs only by its own analysis (key, levels).

## 4. QA gate (all must PASS)
| test | command |
|---|---|
| sync <= 1 frame | `$PY tests/sync_test.py --title "T" [--cues s.json]` |
| cuts on beats, no fades, palette, grey | `$PY tests/qa_video.py out/v9/<mp4> --stage <stage>` |
| chain wave | `u2c-chain-pendant` tests |
| waveform vs numpy | `$PY tests/test_waveform_render.py` |
| meters | `node $WEB/tests/meters.mjs`, `$PY tests/test_meters.py` |
| web app | `node $WEB/tests/smoke.mjs` (NOEXPORT=1 skips the MP4 export) |
| duration / loudness | `ffprobe` duration = bars*4*beat; render log prints I / TP |
Filmstrip any MP4: `tools/filmstrip.sh <mp4> <png> 8 2`; consecutive frames: ffmpeg `select='between(n,A,B)',tile=8x2`.

## 5. Director-notes loop
1. Render stills at downbeat / landing / peak per shot (`--stills`), and the filmstrip.
2. Write `review/v9-director-notes-passN.md`: each note = observation -> PARAMETER change (cue path + value, or code constant), never vague taste.
3. Apply as sheet edits (preferred) or code in `$WEB/src/v8` + sync; re-render stills only for the changed shots; rerun section 4.
4. Stop when a pass has no notes above "polish". Details: `references/director-loop.md`.

## Done checklist
- [ ] Synced; render from a sheet file kept next to the MP4 (`out/v9/cues-*.json`).
- [ ] All QA rows PASS (paste the summary lines in the delivery note).
- [ ] Filmstrip looked at; no half-built element on a cut frame.
