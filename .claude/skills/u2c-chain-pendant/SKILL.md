---
name: u2c-chain-pendant
description: The U2C elephant pendant on its chain-wave (v9): N links held by a hand, beat-locked pushes travelling down the chain link by link, damped-pendulum body landing its extremes on the beats. Use when tuning, debugging or reviewing the pendant swing, the chain, its cue properties (pendant.*), or its motion-trace test. Not for the logo chain (u2c-logo-chain).
---
# U2C chain pendant (chain wave)

Code (single source): `/home/user/beatmaking-visuals/web-app/src/v8/brand.js` (`B.pendulum`, `B.chainGeom`, `B.drawChain`, `B.elephant`, `B.tracePts`), `film.js` (`pendantGeom`, `elephantBody`, `pendulum()`). Native uses the synced copy (`node tools/sync_web.mjs`), never edit `u2c-motion/film/v9/src`.

## Model (v11: rigid-link chain, position based dynamics)
Code: `src/v8/chainsim.js` (`buildChain`, pure, node-testable), used by `brand.js` (`B.pendulum` builds + caches, `B.chainGeom`, `B.drawChain`, `B.drawChainFx`, `B.glints`, `B.swing`), drawn by `film.js` `elephantBody`.
- **Physics**: nodes 0..N (hand, N link ends) + the pendant centre (mass 20 links, 9 link lengths below the last joint). Every link is an exact distance constraint (PBD, 14 sweeps x 2 substeps per 1/240 s step), gravity, velocity drag (gamma = 2 zeta w_n, `pendant.damp`), joint friction (`pendant.wave`). Stretch stays < 0.2 % of a link at the default (reported in `chainInfo().stretch`).
- **Determinism**: simulated once from a 4-bar pre-roll (steady at frame 0), cached by setup; renderFrame(t) is a lookup (`P8.links[j]`, 240 Hz, linear interpolation). Series: [0] hand x (link lengths), [1..N] link angles, [N+1] pendant angle.
- **Hand**: one push per half period at the beat (expo-out, tau = 0.3 of a half period) to alternating sides.
- **Beat lock** (three steps): (1) the pendulum's natural period is tuned (gravity scale g from a measured ring-down, r = T_natural / T_drive found by scan + bisection) until the steady-state fundamental puts the pushes on the beats themselves (default r = 3.3, hand push offset 0.0 to 0.3 frame, hand excursion ~0.5 link); (2) the sign flip and the phase `delta` that put the extremes on the grid; (3) a per-push pass (6-10 sims) corrects each push's start time and size from where its extreme actually lands (J = 1: push m lands its extreme at beat m+1; J = 0 is tried if J = 1 does not converge). Result: extremes <= 0.15 frame from the beats, amplitude within 2 % of the cue.
- **Secondary motion**: link roll (torsion, `P8.tw`, damped spring on each link's angular velocity, 2.6 Hz) turns the alternating face-on/edge-on links; pendant depth sway = roll of the body, drawn as a horizontal squash of the art about the pivot (`sw.yaw`, max 0.6 rad -> cos 0.83).
- **Look (v11b, art-matched)**: chunky flat-sided curb links like the drawn loops (ink outline, bevel on lit sides, hatching; glints = soft highlights clipped to the link, no lines; hand crosshair and arc ticks removed). Link j is face-on (ring) when j is odd, edge-on (bar) when even, plus roll; one light from the upper left (highlight offset toward it, cylinder gradient on bars), METAL ramps per stage (Nigredo pure grey). **Glints**: each kick onset launches a four-point spec star that runs down the links in 0.26 s and fades. **Motion blur**: ghosts at +-0.35 / 0.7 frame, alpha = link speed / 7 px (none under 0.6 px per 0.7 frame).
- **Cold build** ~4 s (scan), **warm rebuild** (amp edits) ~0.9 s. `TUNE`/`WARM` maps in chainsim.js.
References for the technique: Mueller et al. 2007, "Position Based Dynamics"; Macklin et al. 2019, "Small Steps in Physics Simulation" (substeps beat iterations); Ozcan-style chain / rope rigs and secondary-motion principles from Williams, The Animator's Survival Kit (follow-through, overlapping action). See `references/chain-wave-math.md` for the v9 linear-follower derivation (superseded, kept for the beat-lock idea).

## Parameters (cue paths, registry `pendant`)
| path | default | effect |
|---|---|---|
| `pendant.amp` | 4.6 deg (drop 9; RUBEDO 5 / 9.8) | body extreme amplitude per beat |
| `pendant.period` | 2 beats | extremes every period/2 |
| `pendant.react` | 0.32 | amp x (1 - r/2 + r*bass) |
| `pendant.links` | 10 (3..24) | N |
| `pendant.wave` | 0.75 | chain looseness: joint friction = 4 x (1.5 - wave) per s (low = stiff, high = slack and whippy) |
| `pendant.damp` | 0.35 | drag zeta on every node |
| `pendant.chain` | 0.3 | chain length as a fraction of the window's free height |
| `pendant.size/x/y` | 1 / 0 / 0 | art scale, hand offset |
Tuning: damp 0.25-0.5; keep links 8-14; changing links/period/damp triggers a cold re-tune (~4 s), amp keys only a warm one. Never key a sine or tween the angle.

## Tests
```
cd /home/user/u2c-motion   # or a copy synced with: node tools/sync_web.mjs --web <worktree>/web-app
node render.mjs --test pendant --stills 0 --trace --out out/v11/tests/pendant-trace          # model trace JSON
node render.mjs --test pendant --out out/v11/tests/pendant-4bars.mp4                        # 4-bar test video
.venv/bin/python tests/chain_wave_trace.py out/v11/tests/pendant-trace/trace-model.json --video out/v11/tests/pendant-4bars.mp4
```
PASS = lag (unwrapped over the swing period, 1 frame tolerance: the lower links hang from the heavy pendant and follow it) grows down the chain and the body is not ahead of the last link; body extremes <= 1 frame from the beats, alternating; smooth; hand push offset <= 2 frames; measured (video) band lag grows. `tests/pendant_trace.py` (centroid/pivot tracking of the video) is legacy: its fixed-pivot patch assumes a hand that does not move and already failed on v10 (1.97 frames); the model-level checks above and the web smoke row "pendant extremes within 1 frame" are the gate. Web stills: `node tools/chain-stills.mjs [audio] [stage] [startBeat] [out]` (8 consecutive frames; `LOGO=1` for the logo link steps).
v11 result (128 BPM, default cue): body extremes worst 0.15 frame, amplitude 4.5-4.6 deg for 4.6, default amp now 8.5 deg (drop 12), hand excursion ~1 link, model link lag top to bottom ~7 frames (xcorr), video band lag 2.6, stretch 0.002.

## Done checklist
- [ ] `chainsim.js`/`brand.js`/`film.js` edited in web-app, then `node tools/sync_web.mjs` (new files are picked up automatically).
- [ ] `chain_wave_trace.py` PASS (model + video), smoke pendant row PASS, strip reviewed (`tools/chain-stills.mjs`).
- [ ] Filmstrip: hand moves first, pendant last, no kink at the hanger, links alternate face-on/edge-on.
