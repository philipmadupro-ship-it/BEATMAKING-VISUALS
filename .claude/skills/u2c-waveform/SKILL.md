---
name: u2c-waveform
description: The Ableton-grade waveform (session.exe window) drawn from the actual beat audio: int16 min/max/RMS columns at ~2400 col/s, x4 LODs, one column per device pixel, grid, transient markers, and the waveform accuracy test vs numpy. Use when changing waveform data, drawing, zoom/span, or when asked to prove the waveform is the real audio.
---
# U2C waveform

## Data (both analyses produce the same thing)
- Native: `u2c-motion/tools/clipdata.py` -> `D.wave3 = {cps: SR/spc, n, spc, sr, b64}`; spc = round(SR/2400) samples per column (20 at 48 kHz); per column `[minL, maxL, rmsL, minR, maxR, rmsR]` x 32767 as little-endian int16, from the exact float32 samples written to `film/data/<id>.wav` (the mastered clip).
- Web: `web-app/src/analysis/clipdata.js` same layout (`wave3.data` Int16Array). `src/v8/data.js fromNative()` decodes the native base64.
- Legacy `wave2` (int8, 400 col/s) stays as a fallback only.

## Drawing (`web-app/src/v8/meters.js`, `WV` + `M.session`)
- LOD pyramid: level 0 = wave3; each level merges 4 columns (min of mins, max of maxs, RMS = sqrt(weighted mean of squares), never max of RMS).
- One column per DEVICE pixel (`ctx.getTransform()` scale, so camera pushes get more detail). LOD = coarsest with >= 4 source columns per pixel, else level 0.
- Per column: peak fill [min, max] (alpha 0.5 played / 0.32 unplayed), RMS body = [-rms, rms] clipped to [min, max] (solid), 1-px caps at both ends, coloured by tone (low/high ratio) in stage colours; unplayed dimmed.
- Behind: opaque-ish lane, bar lines (0.26), beat lines (0.12), 16th ticks at the lane foot; centre line. Transient markers at the MEASURED onset (`onsets[kind][i][0]`), flag + hairline; warp triangles on the ruler at the quantised onsets.
- Detail span = `meter.session.span` bars (default 2), playhead at 25 %. Window `session` is 1032x400 (exe 9:16).

## Accuracy test
```
cd /home/user/u2c-motion && .venv/bin/python tests/test_waveform_render.py [--t 6.0] [--stage nigredo]
```
Renders `--test waveform --stills T --wave-debug` (session meter alone), then per column: drawn min/max/rms vs numpy over the exact sample range `[s0, s1)` (<= 1 LSB int16) and the PNG's vertical extent vs numpy (<= 1.5 px, >= 98 % of columns; grid/marker/playhead columns skipped). Data check: `.venv/bin/python tests/test_wave.py film/data/<id>` (legacy wave2).
Reference: 2064 columns, LOD 0, 0.50 LSB, 99.6 % pixels within 1.5 px.

## Done checklist
- [ ] Data changed in BOTH clipdata.py and clipdata.js (same layout), `fromNative` updated.
- [ ] No interpolation between columns, no smoothing, RMS from mean squares.
- [ ] `test_waveform_render.py` PASS; web smoke PASS; synced to native.
