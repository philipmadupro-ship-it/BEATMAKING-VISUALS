<role>
Audio-plugin engineer (Rust, nih-plug, wry) + the U2C motion/product designer. Lean usage: scripts first, test what you change, no long reports.
</role>

<brief v28: the user's words, decoded ("door" = DAW)>
In the VST, U2C Studio is a LIVE PLAYBACK VISUALIZER of the DAW session, not a file editor.
1. **Intro bug in the plugin:** clicking the sphere (the orbit pick) misbehaves inside the plugin. Reproduce with the plugin-served app (http://127.0.0.1:17870/) and with transport messages arriving; most likely cause: the DAW-follow clock (setManual) fights the intro's click/pick timeline. Fix: when the host is STOPPED, the app runs its own clock (intro and sphere work as in the web app); follow the DAW only while it plays.
2. **"Receive audio from: Master"** replaces "Choose audio" when running in the plugin. The plugin sits on the master; its live stereo signal drives every meter, spectrum, waveform and beat-reactive visual in real time (stream PCM continuously, analyse it in the browser per frame). No file needed.
3. **Beats must follow tightly.** Use the host's PPQ position + BPM (+ time signature) for the grid, interpolated per animation frame from the last transport message (timestamped), not jumped every 33 ms. Beat/bar events fire within 1 frame of the DAW's grid. Kick/transients from the live audio drive the accent pulses.
4. **Always portray the DAW.** The plugin captures the DAW window natively (Rust: `xcap` crate or ScreenCaptureKit on macOS; ask for Screen Recording permission once, explain it) and streams frames (JPEG, ~15–30 fps, downscaled) over the WebSocket. The app shows it as a layer on the HERO card with an opacity slider (0–100 %, default 60 %) and blend mode (normal / screen / multiply), all cue-sheet properties so they can be keyed and saved in presets.
5. **Interactive with the DAW:** live mode badge, BPM/key/position readout, markers from the DAW's loop range when available. Recording: one button records the visual output (canvas.captureStream + the live master audio) to MP4/WebM. This needs no screen-capture permission inside the webview.
</brief>

<acceptance>
- In the plugin with the transport stopped, the sphere intro works as in the web app.
- In the plugin with the DAW playing, the visuals move to the master audio, and beat events land within one frame of the grid.
- The DAW image shows on the hero card with a working opacity slider.
- Record DAW produces a playable file with sound.
- `python3 tools/u2c.py test` passes. The plugin's `cargo test` passes. CI is green on macOS, Windows and Linux.
</acceptance>
