---
name: u2c-chain-pendant
description: The U2C elephant pendant on its chain-wave (v9): N links held by a hand, beat-locked pushes travelling down the chain link by link, damped-pendulum body landing its extremes on the beats. Use when tuning, debugging or reviewing the pendant swing, the chain, its cue properties (pendant.*), or its motion-trace test. Not for the logo chain (u2c-logo-chain).
---
# U2C chain pendant (chain wave)

Code (single source): `/home/user/beatmaking-visuals/web-app/src/v8/brand.js` (`B.pendulum`, `B.chainGeom`, `B.drawChain`, `B.elephant`, `B.tracePts`), `film.js` (`pendantGeom`, `elephantBody`, `pendulum()`). Native uses the synced copy (`node tools/sync_web.mjs`), never edit `u2c-motion/film/v9/src`.

## Model (exact)
hand u(t) -> link 1 -> ... -> link N -> body. Each link: `x'' = wn^2 (in - x) - 2*0.7*wn*x'` (critically damped follower); body: same with zeta = `damp`. Fixed 1/240 s steps from a 4-bar pre-roll (steady at frame 0, deterministic).
- **Hand**: one push per half period (`period/2` beats) at the beat, expo-out (`1-exp(-x/0.12)`) to `level(m)`, alternating sign. Lateral hand shift `-0.8*len*sin(u)`, kick lift `0.22*l*kick`.
- **Link tuning**: per-link phase `pi*wave/HP/N` at the swing frequency -> wn (solved, `rForLag`). Whole chain delays the swing by `wave` beats.
- **Body tuning**: push m lands its extreme at `(m+j)*HP`; j = smallest giving the body lag in (0.1, 0.9)*pi; the body's `wB` is solved from the remaining phase.
- **Calibration**: steady run -> common offset `delta` (hand push timing, reported `chainInfo().deltaFrames`, ~1.5 frames) + gain; then 4 per-push passes correct each push time/level from where its extreme actually lands (amplitude steps leave no timing error). Body |extreme| = cue `pendant.amp` x bass factor.
Long derivation + numbers: `references/chain-wave-math.md`.

## Parameters (cue paths, registry `pendant`)
| path | default | effect |
|---|---|---|
| `pendant.amp` | 4.6 deg (drop 9; RUBEDO 5 / 9.8) | body extreme amplitude per beat |
| `pendant.period` | 2 beats | extremes every period/2 |
| `pendant.react` | 0.32 | amp x (1 - r/2 + r*bass) |
| `pendant.links` | 10 (3..24) | N |
| `pendant.wave` | 0.75 beats | link-to-link delay total (~0.95 frame/link at 128 BPM) |
| `pendant.damp` | 0.35 | body zeta (lower = more swing character) |
| `pendant.chain` | 0.3 | chain length as a fraction of the window's free height |
| `pendant.size/x/y` | 1 / 0 / 0 | art scale, hand offset |
Tuning rules: wave 0.5-1.0 (below 0.4 the wave is invisible, above 1.2 the chain S-curves too much); damp 0.25-0.5; keep links 8-14. Never key a sine or tween the angle.

## Tests
```
cd /home/user/u2c-motion
node render.mjs --test pendant --stills 0 --trace --out out/v9/tests/pendant-trace          # model trace JSON
node render.mjs --test pendant --out out/v9/tests/pendant-4bars.mp4                        # 4-bar test video
.venv/bin/python tests/chain_wave_trace.py out/v9/tests/pendant-trace/trace-model.json --video out/v9/tests/pendant-4bars.mp4
```
PASS = lag grows link by link and the body arrives last; body extremes <= 1 frame from the beats, alternating; smooth; hand push offset <= 2 frames; measured (video) band lag grows down the chain. Plot: `pendant-trace/chain-wave-trace.png`. Filmstrips: `tools/filmstrip.sh <mp4> <png> 8 2`; consecutive-frame strip shows the wave. Web smoke row "pendant extremes within 1 frame".
Reference result (v9, 128 BPM): lag/link 0.88..9.38 frames, body 17.9, extremes worst 0.28 frame.

## Done checklist
- [ ] Only `brand.js`/`film.js` in web-app edited, then `node tools/sync_web.mjs`.
- [ ] `chain_wave_trace.py` PASS (model + video), smoke pendant row PASS.
- [ ] Filmstrip: hand moves first, pendant last, no kink at the hanger.
