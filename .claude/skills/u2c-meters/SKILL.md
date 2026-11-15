---
name: u2c-meters
description: Accuracy contract for every U2C meter (levels, LUFS, true peak, spectrum, spectrogram, EQ, stereo/imager, loudness, surface) and where the build spec lives. Use before changing any meter's math or drawing, or when a meter value is questioned. The full redesign spec is /home/user/research/METERS-SPEC.md (being written by the meters builder).
---
# U2C meters: accuracy contract

**Spec (authoritative for the redesign): `/home/user/research/METERS-SPEC.md`** (Imager, EQ, Meters, Waveform; another agent is writing it, read it first and follow it over this file where they differ). Waveform: see `u2c-waveform`.

## Contract (every meter, every frame)
1. Values come from the real audio of the mastered clip (`clipdata.py` / `analysis/clipdata.js`), frame-accurate (`fidx(t)`), never invented, never animated toward a target with its own clock.
2. Tolerances vs references (ffmpeg ebur128/astats, pyloudnorm, numpy): sample peak / RMS +-0.5 dB, integrated LUFS +-0.5 LU, true peak +-0.5 dB, correlation +1 / 0 / -1 on mono / independent / inverted, silence reads the floor, clip LED only on clipped files, 1 kHz sine peaks in the 1 kHz band.
3. Ballistics real (attack/release ms from dt); DISPLAY ticks (numbers, peak-hold resets) step on 1/2 beats (`tickF`).
4. Scales printed (dB rulers, Hz ticks) match the drawing; L is left, R is right (see METERS-SPEC section 0 item 3 for the known goniometer mirror bug).
5. A meter on screen is the hero of its shot; borrowed imagery greyscale; accent only for overs / playhead / rec.
6. Nigredo: R=G=B (`u2c-stage-palettes`).

## v11 modules (meters agent)
- `src/v8/levelview.js` levels: L/R peak + RMS bars (meterlib.levelAt ballistics), peak-hold tick, peak LED (flashes on a block >= -3 dBFS, 140 ms decay: `ledAt`) and latched clip LED, a hanging GR bar from `meterlib.grCurve` (feed-forward bus compressor, Giannoulis/Massberg/Reiss JAES 2012 formulas, run on the clip's 1 ms blocks, so it dips on every kick; cue keys `meter.levels.grThresh/grRatio/grRelease/grDet`), momentary + short-term LUFS bars (F.M / F.S), 6-band power bars. Numerals are live every frame.
- `src/v8/imagerview.js` Ozone-style vectorscope: polar sample (dots, persistence), polar level (smoothed petals, held outline), Lissajous (diamond, |x|+|y| = full scale, dot trail), vertical correlation bar with a square marker, L..R balance line, 4-band width (120 Hz / 1.2 kHz / 6 kHz from msspec). Real M/S data only.
- `src/v8/waveview.js` waveform: LODs unchanged (accuracy test applies), playhead fixed at the centre, 3-band colour from the tone map (greys in Nigredo), kick/snare onsets flagged, overview strip. `meter.session.look` = envelope (12 ms peak hold, film default) or exact (one true min/max column per pixel; `--wave-debug` always renders exact, that is what test_waveform_render.py checks).
- Tests added: `tests/meters.mjs` section "v11 gain-reduction meter" (GR dips >= 2 dB in the frame of every kick of a synthetic 128 BPM train, recovers within the beat, LED flashes and clears, static curve values).
- Ideas only (no code copied): vstgui VU/knob idioms (BSD-3), Ozone Imager look (refs/ozone-*.png).

## Tests
```
cd /home/user/beatmaking-visuals/web-app && node tests/meters.mjs          # 54 checks, app code vs ffmpeg + numpy
cd /home/user/u2c-motion && .venv/bin/python tests/test_meters.py         # native engine vs ffmpeg/pyloudnorm/numpy
```
## Done checklist
- [ ] METERS-SPEC.md read; change matches it.
- [ ] Both meter tests PASS; a new meter adds its own reference check to `tests/meters.mjs`.
- [ ] Meter props registered in `registry.js METER_PROPS` (keyframeable as `meter.<kind>.<key>`).
