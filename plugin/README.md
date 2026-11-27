# U2C Studio, DAW plugin (VST3 + CLAP, AU via clap-wrapper)

Rust plugin (nih-plug). Audio passes through untouched. The editor is the U2C Studio web app inside a webview.
The plugin runs two servers on 127.0.0.1 only: HTTP `17870` (the embedded web app, bundled into the binary) and WebSocket `17871`
(next free port if taken; the served page carries it in a `u2c-daw-ws` meta tag).

- Transport (BPM, play state, position in beats, RMS, peak) is pushed about 30 times per second.
- A ring buffer of the mono mix (about 2.7 s) is pulled by the web app as PCM: client sends `{"t":"pull"}`, server replies binary `[u32 sampleRate][u32 n][f32 mono x n]`, little endian.
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

1. Load the plugin on a track or the master bus (it taps what passes through it).
2. In the plugin window or a browser tab on `http://127.0.0.1:17870/`, click **Record DAW**, pick the DAW window or screen, play the project.
3. **Stop + save** downloads `u2c-daw-<time>.webm` (screen video + plugin audio).
4. Edit and export the video as usual in U2C Studio (MP4 export is the existing web export).

Limits:
- Screen capture (`getDisplayMedia`) is often blocked or missing in embedded webviews (WebKitGTK, WKWebView inside a host). If the button reports it, open the same URL in Chrome, Edge or Firefox: it records the same way. This is the main reason the browser connection exists.
- macOS: grant the browser (or host) Screen Recording permission in System Settings, Privacy and Security, then restart it.
- Recording is WebM (VP9/Opus), not MP4. Audio is the plugin's mono mix, sent in 50 ms pulls, so A/V sync is within roughly 100 ms; trim in the editor if needed.
- Plugin audio is whatever reaches the plugin; place it after the instruments you want in the video.
- Untested in a real DAW so far: built and unit-tested on Linux only (server, WebSocket, PCM, bundles load). The webview embed and host transport values still need a check in a host on each OS.
