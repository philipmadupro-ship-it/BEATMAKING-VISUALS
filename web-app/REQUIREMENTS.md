# U2C Studio — every requirement from the conversation (A–Z audit list)
Status per line must be filled in AUDIT.md as DONE / FIXED / PARTIAL(reason) / NOT DONE(reason), with evidence (file:line or screenshot).

## Core
R1  Upload a beat → app auto-generates multiple template videos matching the waveform. 9:16 Reels/TikTok/Shorts + 16:9 YouTube.
R2  Workflow like Kollide noteframe + Flowstage: upload → grid of live variants on YOUR track → pick → tweak → export.
R3  Quick-access website (published claude.ai artifact). Works at phone width.
R4  Brand colours only: Charcoal / Rust / Amethyst + derived variants (Paper, Steel, Sepia, Burnt, Lilac, Ruby Night) + Custom pickers saved to profile. No Kollide/ice-cyan colours.
R5  UI chrome mirrors Kollide design language (DESIGN-TOKENS.md: Instrument Sans, JetBrains Mono, serif italic, 8px radius, hairlines, studio layout).

## Brand motion
R6  U2C chain logo animates with the beat, appears then disappears: dissolves gently letter by letter (U→2→C), rebuilds letter by letter, NEVER breaks/shatters, never fully gone (ghost outline), readable ≥75%.
R7  Elephant pendant swings (verlet rope, deterministic, ~6° default, "Elephant swing" slider), present in every template.
R8  Logo + elephant prominent and integrated in EVERY template, not corner stickers.

## Looks
R9  Hero U2C.EXE: cyberpunk OS of .exe windows, the most precise/realistic (see v4 items). Default + first.
R10 LAB like Kollide frames (nested windows, node graph, cables, mini windows with live waveform/meters).
R11 (v5) Looks = U2C.EXE, LAB, SCOPE only. All others removed.
R12 Cyberpunk/futuristic via subtle FX (scanlines, grain, HUD, mono labels, glow). NO glitch on kicks (glitch default 0, opt-in slider + kicks/bars/phrases select). Clean motion design instead (spring punch, border pulses, cable signals, counters).
R13 No text overlaps (collision-aware auto layout) in any template/aspect.

## Stack & engineering
R14 Open-source libs (permissive only) + in-app Credits: PixiJS + pixi-filters, GSAP, wavesurfer.js (regions/timeline/minimap/hover), mediabunny (+MediaRecorder fallback). No Remotion/AGPL/GPL.
R15 Architecture: ES modules; analysis in Web Worker → immutable Track; pure getFrameState; single renderFrame(t) pipeline; template plugin interface; store + autosave; Playwright smoke tests; git history.
R16 Fast export: VideoFrame from canvas, prefer-hardware, pipelined encode, draft 720p, fps/ETA readout.

## Features
R17 BPM auto-detect (editable), key (editable, 24-key picker), title, producer tag; producer profile remembered.
R18 Editable printed text: title, BPM, key, tag, @handle, price/CTA, 3 custom lines; font/size/position/case/colour.
R19 Auto 15s hook (default) starting on downbeat, strongest hit on beat 1 in first 1–2s; presets 7s loop/15/30/60/full.
R20 Seamless loop: phrase-snapped, 1-beat equal-power crossfade, loop-phase-deterministic visuals, Seam check button.
R21 Platform safe-area overlays (IG/TikTok/Shorts/YouTube) with the TRENDS.md numbers.
R22 Text presets: [FREE] A x B TYPE BEAT · "NAME" · BPM · KEY · LEASE $ — LINK IN BIO · PROD. @uche2crazy.
R23 Caption/title builder (IG/TikTok caption + hashtags, YT title/description/tags) → .txt export.
R24 YouTube 16:9 full-length export + thumbnail generator 1280×720 (2–3 variants).
R25 Export: H.264 MP4 30fps 10–12 Mbps, AAC 48k (Opus fallback), -14 LUFS / -1 dBTP normalise (toggle), measured values shown. No watermark.
R26 Optional voice tag upload, repeated ~25s, tagged vs clean export.
R27 Batch export: several templates and 7/15/30s sets in one go.
R28 Grid hover-to-hear, keyboard shortcuts (space, ←/→, I/O, 1-9), live scrubbing, drag overlays on canvas.
R29 Fast first preview (partial analysis then refine).

## Skills the user asked to be used (run them for real, record findings in AUDIT.md)
S1 design-mirror (done: DESIGN-TOKENS.md) — re-check UI matches.
S2 /code-review   S3 /anthropic-skills:improve-codebase-architecture   S4 /design:design-critique   S5 /design:user-research (producer persona → priorities)
S6 anthropic-skills:redesign-existing-projects + design-taste-frontend (final polish pass, as promised)
S7 design:accessibility-review on the studio UI (contrast, focus, keyboard).

## v4 (latest request)
V1 Elephant much bigger in U2C.EXE (elephant.sys window becomes a large window; elephant fills it; rope swing visible).
V2 Better beat reactivity everywhere (see prompt).
V3 Pro-grade meters & DAW realism in U2C.EXE (EQ curves, log spectrum, LUFS, peak hold, correlation, etc.).
V4 Respect all inspiration (Kollide frames LAB/EXE/Handset refs in refs/): the OS should feel real and precise.
