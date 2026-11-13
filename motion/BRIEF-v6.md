# BRIEF v6 — "THE LABORATORY" (U2C beat previews, native HyperFrames)
House/mode: UCHE2CRAZYYY (DR:CCCC Sound Group) — a producer as mad scientist; every video is an EXPERIMENT in progress.
Source beat: audio/atelmansion-3c-fmin-128.wav — "ATELMANSION 3", 128 BPM, F minor (filename says "C or F min": verify by analysis, default F MIN), 2:08, stereo 48k, −10.7 LUFS → master to −14 LUFS / −1 dBTP.

## Keep (user loved)
- Variant A opening: U2C logo + terminal typing boot, "as if it were an experiment".
- 16:9 version. The colour lines. The chain logo going IN and OUT (build ↔ dissolve) — it must ALWAYS be doing that, locked to the beat.

## Fix
1. NO FADES. Nothing fades in/out. Every appearance/disappearance is a hard step ON THE BEAT GRID (cut, step-reveal, wipe, typewriter, block-resolve) — quantized to beats/half-beats/bars.
2. BEAT SYNC EVERYWHERE: derive an exact beat grid (BPM 128 confirm, downbeat phase, bar 1) with librosa + onset refinement; every motion event (camera moves, window opens, waveform reveal, chain in/out, typing, counters, meter ballistics display ticks) is scheduled in beats, not seconds. Add an automated sync test: list every scheduled event time vs nearest grid time → max error ≤ 1 frame.
3. CHAIN: remove the separate hanging chain. The elephant's OWN chain (the loop already around it in the art) is the thing that swings/moves: animate that chain (segment it from the art → rig as links along a path, swing/sway on the grid). Elephant hangs from it.
4. Waveform = DAW-grade, Ableton Arrangement-view inspiration (not copy): detailed peak+RMS, stereo L/R lanes, bar/beat ruler with numbers, clip header bar, warp-marker style ticks on transients, zoomed detail lane + overview, playhead. Synced to the beat.
5. METERS go deeper — "Aurora"-grade engine, every value from the real audio, frame-accurate: spectrum (1/6-oct, peak hold), SPECTROGRAM (scrolling), L/R peak+RMS with proper ballistics, LUFS M/S/I + true peak + LRA, goniometer + correlation, EQ/spectral-balance vs pink, per-band energy, onset/kick/snare lanes, BPM/phase clock. Improve the meter engine code (accuracy tests vs ffmpeg ebur128/astats/numpy must pass).
6. UI direction: LESS minimalist, more DIY LAB — lab notebook, specimen tags, experiment/trial numbers (EXP-03 · TRIAL 128), handwritten-style annotations and arrows, graph-paper grids, tape/staples, stencil labels, measurement callouts, crossed-out readings, stamped dates. Still precise and legible; scientific-crazy-fool energy, not messy for its own sake.

## Palettes = the four stages (stage is a CONDITION, not only a colour — earlier residue stays visible)
- NIGREDO (black): current charcoal. Motion/texture: compression, obstruction, shallow depth, surfaces swallowing light; black built by texture (matte/gloss/grain), not flat.
- ALBEDO (beige, NEW): bone, limestone, dirty cream, plaster, ash-white, with black thread/ink residue kept. Motion: exposed construction, labelled layers, visible basting/grid, separation, evidence. Never sterile white.
- CITRINITAS (brown): current rust/tan, warm mineral: ochre, tobacco, beeswax, brass lines as structure. Motion: legibility, a coherent repeatable system, directional warmth.
- RUBEDO (purple, more vibrant than before): bruised/vibrant violet with magenta heat + oxblood accents; the elephant's own purple. Motion: embodiment, proximity, weight, resolved movement; keep traces of earlier stages.
Anti-clichés (all): no stars/serpents/smoke/Latin/occult symbols/gold gradients/lens flares; alchemy is internal logic, not decoration. Stage names may be used as palette names on screen.

## Formats
9:16 and 16:9; lengths 15 s / 30 s / 60 s (choose the best sections by energy/structure, start on a downbeat, loop-clean ends). Render all 4 stages for the 30 s 9:16 at least; 60 s for NIGREDO + RUBEDO in both aspects.
