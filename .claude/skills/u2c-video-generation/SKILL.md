---
name: u2c-video-generation
description: The full U2C beat-video generation pipeline used so far: U2C Studio web export, native HyperFrames render, live DAW-plugin recording, and optional AI assets (Higgsfield images/video, ElevenLabs voice). Use to choose a path and produce a U2C beat preview end to end. Details live in the linked u2c-* skills.
---
# U2C video generation

## Pick a path
| Need | Path | Skill |
|---|---|---|
| Polished 9:16/16:9 beat preview for delivery | Native render (`render.mjs --cues`) | u2c-render-qa |
| Quick edit, or a preview made in the browser | U2C Studio web export (same cue sheet) | u2c-cue-sheet |
| Live session or screen-style video from FL | DAW plugin Record (Reader or Animated) | u2c-daw-plugin |
| Extra footage, a cover or a voice tag | Higgsfield / ElevenLabs | below |

## Steps
1. **Beat in.** Use a WAV from the DAW or a file drop. Run the analysis (BPM, downbeat, key) and check the grid (u2c-beat-timing).
2. **Look.** Choose a stage palette (u2c-stage-palettes) and the window set. Build the camera plan from the cue sheet (u2c-camera-cuts).
3. **Elements.** Add the waveform (u2c-waveform), meters (u2c-meters), logo chain (u2c-logo-chain) and pendant (u2c-chain-pendant).
4. **Render.**
   - Native: `node render.mjs --cues sheet.json --beat X.wav --aspect 9:16 --len 30 --filmstrip`.
   - Plugin: Record at 1080p (or 4K) at 30/60 fps.
5. **QA.** Every event must land within 1 frame of the grid. Audio is −14 LUFS and ≤ −1 dBTP. Check the filmstrip, then the director-notes loop.

## AI assets (they cost credits)
- **Higgsfield** (images and video): estimate the cost first, run independent jobs as one batch, then `jobs_wait`. Never re-run a job to retry it.
- **ElevenLabs** (voice tags): take the voice_id from `creative_list_voices` only. Leave generations_count at its default and never repeat a call to retry. Voice IDs stay out of the public repo.
- Generated media stays out of git.

## Low-usage habits
Delegate builds to Sonnet/Haiku agents, use Python stdlib or Rust helpers, and run each test target once.
