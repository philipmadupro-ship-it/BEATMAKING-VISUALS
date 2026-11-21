# BEATMAKING-VISUALS — U2C beat-preview visuals

Two projects for UCHE2CRAZYYY (U2C) beat previews (Reels 9:16 / YouTube 16:9):

- **`web-app/`** — U2C Studio, a browser beat-video editor: upload a beat → the v8 lab looks (EXE, LAB, SCOPE × NIGREDO / ALBEDO / CITRINITAS / RUBEDO) locked to its grid → a keyframe timeline (cue sheet, `web-app/CUES.md`) to decide what happens when → export MP4. Plain ES modules, open `index.html` via any static server. Tests: `node tests/smoke.mjs [beat.wav]`, `node tests/meters.mjs`.
- **`motion/`** — native code→MP4 motion-design pipeline (HyperFrames + GSAP, librosa analysis). One command per render:
  `node render.mjs --beat <file.wav> --look exe|lab|scope --stage nigredo|albedo|citrinitas|rubedo --aspect 9:16|16:9 --len 15|30|60 --title "NAME" [--tags my.json]`
  See `motion/README.md` and `motion/NOTES.md`. A cue sheet from the studio can drive it too: `web-app/src/cues/adapter-native.mjs` (`--cues file.json`, spec in `web-app/CUES.md`).

Not in the repo (public repo): beat audio and rendered MP4s. Put your beat in `motion/audio/` locally.
