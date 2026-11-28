---
name: u2c-daw-plugin
description: The U2C Studio DAW plugin (Rust, nih-plug VST3/CLAP, wry webview) that visualises the live session and records it to video. Use when building, changing, testing or shipping the plugin, its WebSocket bridge, DAW-window capture, live Record, Reader/Animated modes, auto-update or the Mac bundle. Not for offline beat-preview renders (u2c-render-qa).
---
# U2C DAW plugin

Branch `vst-plugin`. Crates: `plugin` (main), `plugin/dsp`, `plugin/send` (U2C Send), `plugin/updater`.
Install on the Master in FL Studio (macOS: use the VST3; the AU does not load in FL).

## Architecture
- HTTP `127.0.0.1:17870` serves the embedded web app (fallback); cached updates live in `~/Library/Application Support/U2C Studio/webapp/<sha>`.
- WebSocket `127.0.0.1:17871` carries:
  - JSON for transport, meters (`fl` = peak/RMS/hold/clip, no gain reduction), hits, MIDI and sends;
  - PCM pull, DAW-window JPEG frames, and the `windows`, `pick_window`, `recordings` and `reveal` messages.
- Audio thread: writes only to a lock-free ring. All analysis runs on a worker thread, with DSP in `plugin/dsp` (block peak map and 3-pole Niemitalo smoothing).
- Web bridge `web-app/src/bridge/daw.js`:
  - follows the DAW clock only while it plays, and extrapolates the playhead from bpm and timestamp;
  - coalesces messages to one per frame;
  - finds the key with `pickKey()` (Krumhansl profiles, 24 s of PCM, minor preferred, confidence shown, manual override).

## Presentation
- **Reader** (default): a still page; only the readings and the playhead move, and no animation loops run.
- **Animated: …** turns the motion props back on. The Live setup card appears on first open.
- The DAW panel fades after 2.5 s idle. H toggles it, Esc closes Preview, and Preview and recording hide the overlays.
- The Layer preview panel (`ui/layerpreview.js`) shows 160 px crops at 5 fps, is DOM-only and never appears in renders.

## Record
- Records offscreen with `app.renderFrame`, then `captureStream`, then MediaRecorder (mp4/avc1 when available).
- Sizes: 1080x1920 / 1920x1080 at 16 Mbps, or 4K at 48 Mbps; 30 or 60 fps.
- Output goes to `~/Movies/U2C Studio`, the last 10 are listed, and Show in Finder runs `open -R`.
- The DAW window is a layer (hero, background or corner; opacity and blend) and is drawn into the recording.

## Build and ship
- Run `python3 tools/u2c.py test`. The only known failure is the font-404 console check.
- CI (`.github/workflows/plugin.yml`, macos-15):
  - `cargo xtask bundle-universal`, then `plugin/tools/bundle_mac.py` (moduleinfo.json, Icon.icns, version keys);
  - then `codesign -s -` and `codesign --verify --deep --strict`.
- Mac zip: take the CI artifact `u2c-studio-macOS` and add `plugin/install-mac.command`. The installer uses sudo, removes quarantine and installs U2C Send too.
- Poll CI with `gh api "repos/philipmadupro-ship-it/BEATMAKING-VISUALS/actions/runs?branch=vst-plugin&per_page=1"`.
- Low disk: run `cargo clean`.

## Rules
- The repo is public, so never commit:
  - audio or MP4s;
  - fonts (Akira, Synkopy);
  - binaries;
  - FL `references.txt` or any other third-party data.
- Keep crates light. Helpers are Python stdlib or Rust only.
