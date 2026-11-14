# Chain wave: derivation and reference numbers

Stage transfer (2nd order, input in, output x): `H(r) = 1 / (1 - r^2 + 2 i z r)`, r = w_drive / w_n.
Lag `phi = atan2(2 z r, 1 - r^2)`, gain `1/hypot(1-r^2, 2 z r)`. Inverse for a wanted lag (rForLag):
`tan(phi) r^2 + 2 z r - tan(phi) = 0`, take the positive root (r > 1 when phi > 90 deg).

Drive: w = pi / (HP * BEAT), HP = period/2 beats. The hand profile's fundamental (DFT of one steady period of the
alternating expo-out pushes, TAU = 0.12) peaks dH ~ 0.61 HP after the push. Budget for push m landing at (m+j) HP:
`j*HP - dH = wave + bodyLag`. With wave 0.75, j = 2, bodyLag ~ 0.64 HP (phi ~ 115 deg, r_B ~ 1.17, body 0.91 Hz vs swing
1.07 Hz), links r ~ 0.17 (6.4 Hz).

Harmonics: links are zeta 0.7 (no resonant peak), so the square-ish hand's 3rd harmonic is attenuated; the body
(r_B ~ 1.17 at w, ~3.5 at 3w) removes it, so the pendant swings near-sinusoidally while the chain shows the push.

Calibration passes (all deterministic): (1) steady unit run: mean body-peak offset -> delta, 3 iterations; peak size ->
gfix. (2) Real schedule: per push, 4 iterations of `delta_m -= 0.8*offset/HPs` (clamped +-0.35 HP) and
`level_m *= 1 + 0.8*(want/got - 1)` (clamped 0.5..2).

Reference (atelmansion 128 BPM, 30 s, nigredo default sheet): deltaFrames +1.47, extremes max 0.28 frame (model) /
0.69 frame (web smoke at frame centres), amplitudes 5.0-5.3 deg calm, 9.8-10.5 deg drop (9 x bass factor).
