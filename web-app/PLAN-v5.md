# v5 plan — "final product" pass (graphic + motion designer)
Scope: ONLY U2C.EXE (hero), LAB, SCOPE. Delete all other templates.

1 Scope cut: remove handset, exe, bloom, orbit, halo, poster, slicer (+ dead code, tests, UI refs). Grid = 3 looks × aspects.
2 LOGO PERFECT: re-extract the U2C chain logo from assets/u2c-chains-dark.jpg at full res (clean alpha, anti-aliased edges, no specks, no missing links), verify letter grouping U/2/C is exactly right, crisp at 1080p and 4K. Dissolve/rebuild letter-by-letter stays; never breaks.
3 CHAIN PHYSICS PERFECT: hanging chain drawn as real interlocking links (alternate 90° link orientation, shading, rotation follows the verlet segment), length-conserving, no stretching/jitter, attaches to the elephant's own chain loop; gentle beat-driven swing (default ~6°), deterministic, seam-clean.
4 ELEPHANT ANIMATION: procedural secondary motion now (mesh-warp the sprite: legs/trunk lag and sway from rope angular velocity + bass; sparkle glints on snares; body rigid). Add a loader for an optional Higgsfield sprite-sequence loop (assets/elephant-anim/manifest.json + frames) that replaces the warp when present (Higgsfield video blocked on free plan; slot ready).
5 METERS RESPECT THE AUDIO (measurable): validate against ffmpeg/numpy with stereo test signals — 1 kHz sine at −18 dBFS, pink noise, hard-left, out-of-phase, silence, clipped. Assert: peak/RMS within ±0.5 dB, LUFS (ebur128) ±0.5 LU, true peak ±0.5 dB, spectrum peak bin at correct frequency, correlation +1/0/−1, silence = −inf/floor, clip LED only on clip. EQ window = measured spectral envelope vs pink reference (nodes at real band levels), not decorative.
6 MOTION DESIGN: calm, precise Kollide-frames OS; keep v4.1 restraint; refine typography, spacing, hairlines; window choreography; every animation curve eased.
7 QA: render a demo MP4 of each look (9:16, 15s) from a musical test beat, filmstrip review, iterate until professional. Smoke + accuracy tests green.
