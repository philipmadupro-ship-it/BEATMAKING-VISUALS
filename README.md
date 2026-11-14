# BEATMAKING-VISUALS — U2C beat-preview visuals

Two projects for UCHE2CRAZYYY (U2C) beat previews (Reels 9:16 / YouTube 16:9):

- **`web-app/`** — U2C Studio, a browser app: upload a beat → beat-reactive templates (U2C.EXE, LAB, SCOPE) → export MP4. Plain ES modules, open `index.html` via any static server. Tests: `tests/smoke.mjs`, `tests/meters.mjs`.
- **`motion/`** — native code→MP4 motion-design pipeline (HyperFrames + GSAP, librosa analysis). One command per render:
  `node render.mjs --beat <file.wav> --look exe|lab|scope --stage nigredo|albedo|citrinitas|rubedo --aspect 9:16|16:9 --len 15|30|60 --title "NAME" [--tags my.json]`
  See `motion/README.md` and `motion/NOTES.md`.

Not in the repo (public repo): beat audio and rendered MP4s. Put your beat in `motion/audio/` locally.
