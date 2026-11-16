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


## EQ (v11): src/v8/eqview.js
- Pro-MB / Pro-Q style dynamic multiband view. `meters.js` only wires `M8.eq = EV.draw`; the module draws inside its rect, no opaque backdrop (glass windows).
- Static bands = per-section match fit (meterlib.fitMatch; bands closer than 1/2 oct merge, a 70 Hz kick band is added if none < 150 Hz). Dynamic gain = g + dir * depth * env, env = band detector -> `dynEnvelope(D, {attack, release, sens})`.
- Detector = `analysis/bandenv.js` (`D.be`: 6 bands, 4th-order band-pass on L+R/2, energy through a per-band one-pole 12/6/3/1.5/1/1 ms, read every 1 ms, Uint8 dB = q/2-120). A TRANSIENT measure: level minus its own 90 ms follower, `sens` dB = 1, so a sustained 808 does not hold the duck. The 1 ms blocks of the first version rippled with the 50 Hz period (idle env 0.6): never go back to block mean-square for the low bands. The per-frame bands (8192 window centred on the frame) smear a kick by +-85 ms and cannot land on the beat.
- Real beat: the LO band crosses half its kick peak 7-34 ms after the quantised kick time (kick audio + 12 ms smoothing), so within one frame at 30 fps.
- Drawing order: grid, band regions, analyzer PRE (1/6-oct, cubic on log f, tilt 4.5 dB/oct about 1 kHz) and POST = PRE x dynamic curve, peak-hold dots, band bodies and the static-to-dynamic GR area, static sum (dashed), ghost trail (last `ghost` s of the dynamic sum), dynamic sum, nodes on the dynamic band curves, readout for the active band only (|offset| > 0.8 dB), GR meter with 0.8 s peak hold, piano strip + Hz ruler. Auto range 3/6/12/18/30 dB is computed from the WORST case (all bands at full detector) so the scale never jumps on a kick.
- Tests (tests/meters.mjs section 10): synthetic kicks (GR >= 80 % of depth, >= 50 % within 1 frame, recovers before the next, r >= 0.9 vs the detector) and the real beat (GR rises on strong kicks, detector onset within 1.5 frames). `grAt`, `dynEnvelope`, `bandDyn`, `dynOffset` are exported for them.
- Native: eqview.js is picked up by sync_web.mjs (it copies src/v8/*.js); bandenv.js must be added to its analysis FILES list and tools/meterdata.mjs re-run to write `meters.be` (not done in the v11-eq worktree; the view falls back to frame-rate band levels until then).
