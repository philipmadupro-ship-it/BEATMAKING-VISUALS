# U2C Studio, DAW plugin (VST3 + CLAP, AU via clap-wrapper)

Rust plugin (nih-plug). Audio passes through untouched. The editor is the U2C Studio web app inside a webview.
The plugin runs two servers on 127.0.0.1 only: HTTP `17870` (the embedded web app, bundled into the binary) and WebSocket `17871`
(next free port if taken; the served page carries it in a `u2c-daw-ws` meta tag).

- Transport `{bpm, beats (host PPQ of the newest sample), widx, playing, ts:[n,d], loop:[a,b]|null, rms, peak, sr}` is pushed about 60 times per second. The app interpolates the PPQ every animation frame, so beats land within a frame of the DAW grid.
- A stereo ring (about 3 s) is pulled as PCM: `{"t":"pull"}` -> binary `"PCM0" [u32 sr][u32 n][f64 first sample index][f32 L x n][f32 R x n]`, little endian.
- **Receive audio from: Master** (home screen, replaces "Choose audio"): the live master is written into a 4-bar window by host PPQ and analysed like a file; a looping DAW is exact from the second pass, a linear one trails by the analysis time (about 1.5 s).
- **DAW image**: `{"t":"cap","on":true}` starts a capture thread (xcap, macOS and Windows) that sends the DAW's biggest window as `"JPG0"`+JPEG (about 20 fps, 960 px wide) to the hero card (cue props `video.on/opacity/blend/target`, opacity 60 % and blend normal by default). Inside the DAW process its own windows need no permission; if macOS refuses, it asks for Screen Recording once and the app says what to allow.
- **Record DAW** records the studio canvas (`captureStream`) with the live master audio and has the plugin write the file to `~/Movies/U2C Studio` (webviews cannot download). No screen-capture permission is involved.
- The preview follows the DAW playhead (tick "follow" in the DAW box, bottom right). Export stays the existing web export.
- The same web app in a normal browser: open `http://127.0.0.1:17870/` while the plugin is loaded. It connects to the same WebSocket. Or `?daw=ws://127.0.0.1:17871` on any copy of the app.
- Only one plugin instance feeds the tap at a time (the last one that processes audio).
- The WebSocket rejects non-local `Origin`s. To allow a hosted copy: `U2C_DAW_ORIGINS="https://your.host"` in the DAW's environment.

## Build

```
cd plugin
cargo xtask bundle u2c_studio --release     # -> target/bundled/U2C Studio.vst3 and .clap
cargo test --release
```
Linux needs: `libwebkit2gtk-4.1-dev libgtk-3-dev libxcb-icccm4-dev libxcb-dri2-0-dev libxcb-randr0-dev libxcb-shape0-dev libgl-dev libx11-xcb-dev libxcursor-dev libasound2-dev libxdo-dev`.
CI (`.github/workflows/plugin.yml`) builds Linux, macOS and Windows and uploads artifacts. No binaries are committed.

## Install

- **Windows**: copy `U2C Studio.vst3` to `C:\Program Files\Common Files\VST3\` (CLAP: `C:\Program Files\Common Files\CLAP\`). Needs the WebView2 runtime (preinstalled on Windows 11; otherwise Microsoft's Evergreen installer).
- **macOS**: copy to `~/Library/Audio/Plug-Ins/VST3/`, `.../CLAP/`, and the `.component` to `~/Library/Audio/Plug-Ins/Components/`. Unsigned builds: `xattr -dr com.apple.quarantine "U2C Studio.*"`.
- **Linux**: copy to `~/.vst3/` and `~/.clap/`. Needs WebKitGTK 4.1 and an X11 host (Wayland-native hosts are not supported by the embed).

## AU (macOS)

nih-plug has no AU. Use [clap-wrapper](https://github.com/free-audio/clap-wrapper) to wrap the CLAP as AUv2:

```
git clone https://github.com/free-audio/clap-wrapper
cargo xtask bundle u2c_studio --release
cmake -S au -B build-au -DCLAP_WRAPPER_DIR=$PWD/../clap-wrapper -DU2C_CLAP="$PWD/target/bundled/U2C Studio.clap"
cmake --build build-au --config Release
```
`au/CMakeLists.txt` and the CI step were written from the clap-wrapper docs and are NOT yet verified on a Mac (CI step is `continue-on-error`). Validate with `auval -v aufx U2Cs U2Cz`.

## Record the DAW screen with the plugin audio

1. Load the plugin on the master bus.
2. Press **Receive audio from: Master**, then **Record DAW**, then play the project.
3. **Stop + save** writes `u2c-daw-<time>.mp4` (or `.webm`) to `~/Movies/U2C Studio` (`~/Videos/U2C Studio` elsewhere).

Limits:
- Recording is the studio preview canvas (display size), not an offscreen full-size render; A/V sync is within roughly 100 ms. Use the web export for final quality.
- Bars are 4 beats in the app; the host time signature is shown but does not change the grid.
- Plugin audio is whatever reaches the plugin; place it after the instruments you want in the video.
- Window capture is compiled for macOS/Windows only by CI; it needs a check in a real host (which window is picked, permission flow).
