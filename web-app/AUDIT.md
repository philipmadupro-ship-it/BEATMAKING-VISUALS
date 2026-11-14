# U2C Studio — A–Z audit (v5)

Every requirement in REQUIREMENTS.md was checked against the code and the running app. Evidence is either a code
location or a named check in `tests/smoke.mjs` / `tests/meters.mjs`. v5 runs: `node tests/meters.mjs` 40/40,
`node tests/smoke.mjs demo/test-beat-142.wav` all green (headless Chromium). Demo MP4s + filmstrips are in `demo/`.

## v5 plan (PLAN-v5.md)

| Item | Status | Evidence |
|------|--------|----------|
| 1 Scope cut | DONE | `src/templates/index.js` (U2C.EXE, LAB, SCOPE); 7 looks + their shots deleted; `src/state.js` migrateProject (deleted look → U2C.EXE, batch/params cleaned); smoke "v5 state migration", "grid: 3 looks in order" |
| 2 Logo | DONE | `tools/extract_logo.py` (local-contrast threshold, 4× supersample, speckle/hole cleanup, alpha blur, 2× atlas); per-pixel letter grouping from traced strokes (`--debug` writes `logo-labels.png`); `assets/u2c-links*.{png,json}`, `src/engine/links.js` |
| 3 Chain | DONE | `src/overlays/elephant.js` drawChainLinks/chainJoints: constant-pitch rigid links, alternating face-on ring / edge-on bar, interlock draw order, attached at the art's bail (343,197); smoke "rope physics" (deterministic, seam 2e-4) |
| 4 Elephant | DONE | `tools/elephant_mask.py` → `assets/elephant-limbs.png`, `elephant-warp.json`; 16×16 affine triangle warp, lagged spring + bass; snare glints; optional `assets/elephant-anim/manifest.json` sprite loop (README-ASSETS.md); smoke "elephant mesh warp" |
| 5 Meters | DONE | `tests/meters.mjs` vs ffmpeg ebur128/astats + numpy, 40/40; `src/analysis/truepeak.js`, `stereo.js`, calibrated spectrum in `dsp.js`, `src/engine/meters.js` pinkRel/eqBands, `kit.js` eqView |
| 6 Motion design | DONE | U2C.EXE 9:16 safe-area grid (8 px / 16 px gutters), dock removed, solid neon logo, LAB logo clears nodes, SCOPE readout grid + prominent elephant; filmstrips in `demo/` |
| 7 QA | DONE | `tools/make_test_beat.py` (30 s, 142 BPM), `tools/render-demos.mjs` (app export path), `demo/*.mp4`, `demo/*_filmstrip.png`; smoke + meters green |

**Status counts (v5):** all R1–R29 + V1–V4 DONE or FIXED except R3, R25 and V4 (PARTIAL, see notes).

## Requirements

| ID | Status | Evidence | Notes |
|----|--------|----------|-------|
| R1 | DONE | `src/ui/grid.js` (live grid), smoke "grid: 3 looks", "template * 916/169" | Upload → 3 looks rendered on the track in 9:16 and 16:9; export from any look. |
| R2 | DONE | `src/main.js` openStudio, `src/ui/studio.js` | Upload → grid of live variants → studio (tweak) → export, Kollide noteframe flow. |
| R3 | PARTIAL | smoke "phone width: no horizontal scroll" | Works at 390 px. Publishing as a claude.ai artifact is left to the owner (instruction: don't publish). |
| R4 | DONE | `src/brand/palettes.js:7`, `shots/variants-916.png`, `shots/variants-169.png` | 3 families × 3 variants + Custom pickers saved in the profile (`src/state.js` save). No Kollide colours. |
| R5 | DONE | `index.html` tokens, `src/styles.css`, DESIGN-TOKENS.md | Instrument Sans / JetBrains Mono / serif italic, 8 px radius, hairlines, studio layout. Deviation: tab names are Beat/Look/Style/FX/Text/Export (tokens list Video/Words/Post), kept for clarity. |
| R6 | DONE | `src/engine/layout.js:38` letterState, `src/overlays/chains.js` drawChains (ghost outline) | Dissolve U→2→C with dither + scanline wipe, rebuild by draw-on outline then fill, never shatters, 25 % outline ghost, readable ≈ 80 %. `shots/u2cexe-turnover-916.png`. |
| R7 | DONE | `src/overlays/elephant.js:47` ropeNodes, smoke "rope physics" | Verlet rope, deterministic, 6.3° max at default, "Elephant swing" slider, out→in drift 6e-4. |
| R8 | DONE | every template's defaults + `shots/*-916.png` | Logo and elephant are part of every composition (windows, charms, slices, rings). |
| R9 | FIXED NOW | `src/templates/u2cexe.js`, `src/templates/kit.js` (pro meters), `shots/u2cexe-phrase-*.png` | Default + first. v4: eq.vst, spectrum.vst, meter.exe, phase.scope, transport.lanes, events.log, large elephant.sys. |
| R10 | FIXED NOW | `src/templates/lab.js` | Nested lab.patch window; node windows reuse the shared kit (wave, LUFS meter, scope, spectrum, EQ, goniometer). |
| R11 | DONE (v5) | `src/templates/index.js`, smoke "grid: 3 looks in order (U2C.EXE, LAB, SCOPE)" | Looks = U2C.EXE, LAB, SCOPE only. HANDSET, EXE, BLOOM, ORBIT, HALO, POSTER, SLICER deleted with their code, shots and UI/test references; saved projects pointing at them migrate to U2C.EXE. |
| R12 | DONE | `src/state.js:15` (glitch 0, shock 0), `src/fx/postfx.js`, smoke "glitch: off by default" | Kick reactions are spring punch, border pulses, cable dots, meters, counters. |
| R13 | DONE | `src/overlays/text.js` reservedRects/textBoxes, smoke "R13 no text overlaps" | 0.0 % text/reserved overlap across 3 looks × 2 aspects; U2C.EXE 9:16 keeps title/BPM/key inside the hard safe box. |
| R14 | DONE | `src/lib/cdn.js:16` CREDITS | PixiJS, pixi-filters, GSAP, wavesurfer (regions/timeline/minimap/hover), mediabunny + MediaRecorder fallback. No AGPL/GPL. |
| R15 | DONE | worker `src/analysis/analysis.worker.js:3`, `src/engine/frame.js:53`, `src/engine/render.js:32`, `src/state.js:39` | Stereo metering features run on the main thread (streaming, no big temporaries); see caveats. |
| R16 | DONE | `src/export/offline.js:9,22`, `src/ui/exporter.js:29` | VideoFrame from canvas, prefer-hardware, queue ≤ 8, draft 720p, fps/ETA. Headless: 2.2 → 4.5 fps. |
| R17 | FIXED NOW | smoke "R17 BPM editable", 24-key picker `src/overlays/text.js:11` | BPM edit was untested; verified. Profile remembers text lines + custom colours. |
| R18 | DONE | `src/ui/panels.js` Text panel, smoke "text panel" | 9 lines, font/size/position/case/colour. |
| R19 | DONE | `src/main.js` hook, `src/engine/layout.js:45` phraseBars, smoke "R19 hook presets" | 7/15/30 → 4/8/16 bars on a downbeat; the bar weighting prefers a strong beat 1. |
| R20 | DONE | `src/export/audio.js:25` loopBuffer, `src/ui/seam.js`, smoke "exported loop seam" | Seam 1.9 % vs ordinary frame-to-frame max 2.0 %. |
| R21 | FIXED NOW | `src/engine/layout.js:7` SAFE, smoke "R21 safe-area overlay" | Untested before; verified. |
| R22 | FIXED NOW | `src/ui/panels.js` presets, smoke "R22 text presets" | v2 had replaced the preset menu with editable lines; one-click Type beat / Lease / Minimal presets added back. |
| R23 | DONE | `src/export/captions.js:4`, smoke "caption builder" | Title, IG/TikTok caption + hashtags, YT description, tags, .txt save. |
| R24 | DONE | `src/ui/exporter.js:67`, smoke "youtube thumbnails" | 16:9 full length button + 3 thumbnails 1280×720. |
| R25 | PARTIAL | smoke "export", "ffprobe", "R25 loudness measured" | H.264 MP4 30 fps 11 Mbps, −14 LUFS / −1 dBTP normalise with measured values; no watermark. Headless Chromium has no AAC encoder, so the test file uses the Opus fallback; real Chrome/Edge pick AAC. |
| R26 | FIXED NOW | `src/export/audio.js` voice tag, smoke "R26 voice tag" | Never tested before; upload + mix verified (tagged ≠ clean). |
| R27 | FIXED NOW | `src/ui/exporter.js:45`, smoke "R27 batch export" | Never tested before; 2 looks × 7 s draft batch verified. |
| R28 | FIXED NOW | smoke "grid hover-to-hear", "keyboard shortcuts", "drag overlays", "timeline region drag" | All four were untested; all verified. |
| R29 | DONE | `src/analysis/index.js:14` onQuick, smoke "R29 fast first preview" | Quick pass shown first, then refined. |
| V1 | FIXED NOW | `src/templates/u2cexe.js` LAYOUT, smoke "V1 elephant size" | elephant.sys = 39 % width (9:16), full-height side column (16:9); live ANGLE / TENSION / LINKS readout + angle gauge. |
| V2 | FIXED NOW | `src/engine/frame.js:27` envAR + adaptive + followers, smoke "V2 kick sync ±1 frame" | Kick 5/120 ms, snare 5/180 ms, hat 2/60 ms AR envelopes with 1-frame anticipation; adaptive strengths; bass/mid/high followers; sidechain duck; bar accents. Max kick envelope within ±1 frame of all 31 onsets. |
| V3 | DONE (v5: measured) | `tests/meters.mjs` 40/40 | Peak/RMS within 0.05 dB of astats/numpy, LUFS-I within 0.05 LU of ebur128, true peak (4× oversampled) within 0.02 dB, spectrum peak in the 1 kHz bin, correlation +1/0/−1, silence at the floor, clip LED only on clipping; eq.vst = 1 s spectral envelope vs pink with nodes at real band levels. |
| V4 | PARTIAL | `refs/`, `shots/u2cexe-phrase-*.png`, `shots/lab-*.png` | Original art in the spirit of the Kollide LAB/EXE frames, U2C colours. The 9:16 U2C.EXE leaves the top 136 px as a menu bar + gap (platform status-bar zone); print looks were removed in v5; the 9:16 grid now keeps key text inside the safe box. |

## Skills run (S1–S7) — key findings and what was fixed

| Skill | Key findings | Fixed |
|-------|--------------|-------|
| S1 design-mirror re-check | Tokens, fonts, radius, hairlines and studio layout still match DESIGN-TOKENS.md; tab labels differ. | Kept, documented (R5). |
| S2 code-review (src/) | Meters ignored loop + showed source not exported levels; peak/hold windows too short for their release rates; per-frame specHold recomputation; inflated inter-sample estimate; big temporaries in stereo analysis; fake LUFS/TP in small meters; duplicated ring geometry; dead kit code; test flag in DOM. | All fixed except main-thread stereo pass (now streaming, still main thread). Meters show post-normalisation levels; lanes are loop-periodic. |
| S3 improve-codebase-architecture | 5 candidates (report: scratchpad `architecture-review.html`): Loop time module (Strong), template layout(P) module (Strong), store-driven UI refresh, Panel kit interface, Export job module. | First step of the top pick: frameState exposes `wrapT`, lanes use it; templates' reserved rects now derive from their draw geometry (orbit, halo, U2C.EXE `rects`). |
| S4 design-critique | Preview blurry at Fit (meters illegible); timeline DROP labels collide with the bar ruler; variant row repeats the family name; developer FX badge in the UI. | 2× preview resolution, compact mono marker labels, "Original" chip, quiet GPU/CPU badge. |
| S5 user-research (producer persona) | Top 5: (1) upload → postable clip in minutes, (2) brand visible in the first second, (3) correct printed BPM/key/title/price, (4) platform-correct (safe areas, seamless loop, −14 LUFS), (5) looks pro, not gimmicky. | 1 ✓ (15 s hook default, one Export, draft); 2 partial (frame 0 is the phrase rebuild: logo ghost + U drawing on, elephant visible); 3 ✓ (+ one-click presets); 4 ✓; 5 ✓ (no kick glitch, pro meters). |
| S6 redesign-existing-projects + design-taste-frontend | Missing favicon/meta description/skip link; en dash in UI copy; no pressed feedback. Serif use is brand-mandated (tokens), dashboards are outside the taste skill's scope. | Favicon, description, skip link, hyphen, `:active` 1 px press (off under reduced motion). |
| S7 accessibility-review | Hint text 2.9:1 (fail); tabs without aria-controls / tabpanel roles / arrow keys; no `lang`; 1 px focus ring. All controls named; focus order logical; canvas has a keyboard alternative (Style sliders). Selected-chip contrast flags were false positives (translucent tint). | Hint text 4.7:1 dark / 4.6:1 light, ARIA tabs with roving tabindex + ←/→/Home/End, `lang="en"`, 2 px focus ring. |

## Remaining caveats
- Demo clips use the app's 15 s hook preset, which snaps to an 8-bar phrase: 13.5 s at 142 BPM.
- Headless Chromium has no AAC encoder: the app exports Opus there; `tools/render-demos.mjs` re-encodes only the audio
  track to AAC (video stream copied). Real Chrome/Edge export AAC directly.
- Key detection reports the relative major on the test beat (A maj for F# min); the demos set the printed key by hand.
- The elephant sprite loop slot is empty (no Higgsfield video on the free plan); the procedural mesh warp is used.
- Export speed numbers are headless SwiftShader (software GL + software H.264); a real GPU is several times faster.
- Stereo metering analysis runs once per file on the main thread (streaming, ~0.1 s per minute of audio).
- AAC is unavailable in headless Chromium, so test exports carry Opus.
- Meters read audio before the in point on frame 0 (that is the audio crossfaded into the loop tail, so the seam stays continuous).
