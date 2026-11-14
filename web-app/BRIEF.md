# U2C Studio — Brief (single source of truth)
Owner: Uche2Crazy (U2C), producer. Purpose: upload a beat → auto-render branded, beat-reactive preview videos for IG Reels / TikTok / Shorts (9:16) and YouTube (16:9).

## Brand
- Palettes ONLY: Charcoal (#161616/#232323, chains #c8c8c8), Rust (#6e4433, tan #c4a57a, ink #2a1710), Amethyst (#1d1426, lilac #b79ad8, magenta #e07ad0, ruby #e0475f, gold #f2c14e). No new colours.
- Vibe: cyberpunk/futuristic via FX (scanlines, RGB split, glitch slices, HUD corners, mono labels, glow) + grunge print/grain + ✦ sparkle.
- UI chrome: DESIGN-TOKENS.md (Instrument Sans, JetBrains Mono, serif italic; 8px radius; hairlines).

## Signature motion
- U2C chain logo split into links: assemble on beats → pulse (kick jiggle, snare flash) → shatter on phrase (8/16 bars) → reassemble. GSAP timelines seeked by audio time. Neon-outline mode in LAB/EXE.
- Elephant mascot swings as pendulum from top edge; amplitude = low band, period locked to beat grid. Both overlays toggleable, draggable.

## Templates
Hero: LAB (wireframe node-graph), HANDSET (newsprint dithered phone collage), EXE (light OS-window, giant glitch type, waveform scanner, timecode). Plus extras from RESEARCH.md restyled cyberpunk. All kick-reactive.

## Stack
PixiJS 8 + pixi-filters (post-FX), GSAP 3 (motion + UI), wavesurfer.js 7 (timeline/regions), mediabunny (frame-exact offline MP4; MediaRecorder fallback), optional Meyda. Permissive licences only; in-app Credits.

## Architecture
ES modules: analysis (Web Worker → immutable Track), engine (clock, pure getFrameState), templates (plugin interface), overlays, fx, export, ui (store + autosave), brand. One renderFrame(t) pipeline. Playwright smoke tests.

## Features
1. Upload (mp3/wav/flac/m4a); auto BPM (editable), key, title, producer tag.
2. Grid of live previews of all templates on the user's track; hover to play.
3. Studio: 9:16/16:9, palette chips, Fit/safe area, transport, wavesurfer timeline with bar-snapped in/out, Look/Style/Text/FX/Export tabs.
4. One-click auto 15s/30s hook (most energetic section, starts on downbeat).
5. Producer profile remembered (title format, tag, handle).
6. Batch export: multiple templates in one go.
7. Platform safe-area overlays (IG/TikTok caption + side buttons; YouTube).
8. Fast first preview (partial analysis, then refine).
9. Keyboard shortcuts; live scrubbing; drag overlays on canvas.
10. No watermark; optional "@uche2crazy" handle.

## From TRENDS.md (research; numbers = defaults to test)
11. Default clip 15s (presets 7s loop/30s/60s/full); starts on downbeat, no fade-in, frame 0 fully drawn; biggest kick-synced hit (chain assemble + glitch) on beat 1 within 1-2s.
12. Loop-safe export: ends on bar boundary, end state == frame 0, ~20ms audio crossfade at seam.
13. 9:16 safe box x162-918 y288-1248 (hard), x108-972 y288-1440 (relaxed); keep text ≥672px above bottom.
14. Text presets (mono, toggle/drag): [FREE] A x B TYPE BEAT · "NAME" · 142 BPM · F# MIN · LEASE $29 — LINK IN BIO · PROD. @uche2crazy.
15. Caption/title builder: `[FREE] A x B Type Beat - "Name" | 142 BPM (Prod. U2C)` → IG/TikTok caption + hashtags, YT description (store link in first 2 lines), tags; export .txt with video.
16. YouTube: 1920x1080 full-length export + thumbnail generator 1280x720 (2-3 variants, keep bottom-right clear).
17. Export: H.264 30fps 10-12 Mbps, AAC 48kHz 256-320kbps; loudness normalise -14 LUFS / -1 dBTP (toggle -12/off), show measured.
18. Optional voice tag: user uploads their tag audio, repeat ~every 25s, slightly under mix; "tagged preview" vs "clean" export.
19. Extra templates: CHROME (3D chrome U2C wordmark, palette hues), KINETIC (BPM/key/name type on beat), SCOPE (scope/spectrum scanner), DAW (fake playlist/piano-roll from analysed track, "cooking up" caption).
20. Always-on subtle motion (slow zoom, grain, dust) + blurred-cover background option.
21. Batch: 7s/15s/30s set per template.

## v2 — user feedback (supersedes conflicting items above)
Templates KEEP: LAB, HANDSET, EXE, SCOPE (remove bottom waveform strip), PENDANT BLOOM (+2 new Bloom variants), CHAIN POSTER, SLICER.
Templates REMOVE: CHROME, KINETIC, DAW, METER DECK, TERRAIN.
Brand everywhere: U2C chains + elephant are integrated, prominent elements of EVERY template (not corner stickers).
Glitch: much subtler by default — tasteful accents, not hammering every kick.
Seamless loop: phrase-length loops, equal-power crossfade, loop-phase-deterministic visuals, seam check.
Export: significantly faster; draft mode.
Text: fully editable printed text (key, BPM, title, tag, price/CTA, custom lines) with style controls.
Colours: per-palette variants derived from brand hexes + custom accent, saved to profile.
Process: git baseline → review (bugs, architecture, design critique) → REVIEW.md → apply fixes + v2 changes.
