---
name: u2c-beat-timing
description: Beat grid, downbeat and quantisation rules for U2C beat videos, plus the sync test (every visual event within 1 frame of the grid). Use when adding or moving ANY timed event (cut, push, reveal, link step, pendant extreme, flash, text cue), when a beat's grid/downbeat/BPM looks wrong, or before delivering a U2C render. Not for camera grammar (u2c-camera-cuts) or the pendant physics itself (u2c-chain-pendant).
---
# U2C beat timing

Paths: `WEB=/home/user/beatmaking-visuals/web-app`, `NAT=/home/user/u2c-motion` (branch v9).

## The grid (source of truth)
- Native: `$NAT/tools/beatgrid.py <wav>` -> `<wav>.grid.json` (librosa estimate, then least-squares fit of low-band kick onsets to 16th slots: exact period + phase; bar phase = the beat offset whose bar lines catch kicks + energy jumps). `tools/clipdata.py` cuts the section (default: 1 bar before the first drop that fits), masters it (-14 LUFS, <= -1 dBTP) and writes `film/data/<id>.js` (`beat` = seconds per beat, `song.startBar`, onsets `[t_raw, strength, t_quantised]`).
- Web: `src/analysis/` (grid-scored tempo, sample-accurate phase) -> `track.bpm/t0/spb`, same section rule (`applyHook`).
- Clip time `t = 0` is ALWAYS bar 1 beat 1 of the section. Schedule in **beats**: `t = beat * D.beat`. Never write seconds.

## Quantise every event
| Event | Grid | Where |
|---|---|---|
| shot change / push landing | bar line (push = the `dur` beats BEFORE the key, lands ON it) | `camera.shot` keys |
| window open / close | 6 steps on 32nds from the key | `win.<id>.visible` / `.open` |
| logo link steps | IN/OUT: `cycle/64` beats per step (32nds at 2 bars); runner: 16ths | `brand.js logoPhase`, `logoEvents` |
| pendant extreme | every `period/2` beats (period 2 -> every beat) | `brand.js B.pendulum` |
| 1-frame invert | the key's beat, exactly one frame | `fx.flash` |
| text typing | 1 char per 64th from the key, hard cut at the end | `text.cue` |
| meter display ticks | 1/2 beat | `meters.js tickF` |
Cue keys in the editor snap to bar / beat / 1/8 / 1/16; off-grid (`off`) is only for fixing an analysis error.

## Frame rule
Frames are sampled at their CENTRE (`t + 0.5/fps`, in `film.render`): an event at grid time g shows on frame `round(g*fps)`. Tolerance: **<= 1 frame** (33.3 ms at 30 fps) including the audio transient offset.

## Sync test (run before any delivery)
```
cd $NAT && .venv/bin/python tests/sync_test.py --title "ATELMANSION 3" [--cues sheet.json] [--stage nigredo --aspect 9:16 --len 30]
```
Dumps `U2C6.schedule()` (via `render.mjs --stills 0 --schedule`), checks each event's frame vs the nearest 32nd and each beat's on-beat transient (>1.5 kHz attack) vs the grid. PASS = max <= 1 frame. Report: `out/v9/sync-report-*.txt`. Web: `node $WEB/tests/smoke.mjs` sync rows (schedule, flash frame, pendant extremes, camera landing).

## Adding a new timed event
1. Compute it from beats (`T(b)`, `steps(t, b0, n, unit)` in `core.js`). No `Date.now`, no unseeded random, no tween with its own clock.
2. Add it to `film.js schedule()` with a label so the sync test sees it.
3. Run the sync test; fix the beat, not the tolerance.

## Done checklist
- [ ] No event scheduled in seconds; all from beats.
- [ ] New event listed in `schedule()`.
- [ ] `sync_test.py` PASS (<= 1 frame) and smoke sync rows PASS.
- [ ] Grid looks right on the waveform card (bar lines on kicks): `node render.mjs --test waveform --stills 2`.
