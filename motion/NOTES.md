# U2C motion pipeline: notes

The pipeline is code → MP4. Each scene is HTML + canvas + GSAP, seeked frame by frame by HyperFrames in headless Chromium, so every render is deterministic. Audio is analysed offline and fed to the composition as data. ffmpeg masters and muxes the sound.

```
tools/make_beat.py        30 s test beat (numpy synth → ffmpeg bus/master)        → audio/beat-30s.wav
tools/analyze.py          onsets/tempo/window pick, -14 LUFS clip, per-frame data → film/assets/{clip.wav,analysis.js}
tools/sync_elephant_loop.py  swaps in assets/elephant-loop/ if it appears          → film/assets/elephant-loop.js
tools/stills.mjs          storyboard stills / any frame, straight from the engine  → storyboard/<v>/scene-N.png
tools/contact_sheet.py    contact sheet per variant                                → storyboard/<v>/contact-sheet.png
tools/render.sh V 916|169 out.mp4   HyperFrames render + ffmpeg AAC mux + loudness report
tools/filmstrip.sh        review filmstrips                                        → out/filmstrips/
tools/transcribe.py       faster-whisper word timestamps (for vocal tags later)
film/                     HyperFrames project: index.html (9:16), wide.html (16:9), src/{engine,variants,main}.js
```

## Step 0: install report
| Tool | Status | Notes |
|---|---|---|
| FFmpeg | **verified** | 6.1.1 with libx264, aac, ebur128 and loudnorm. HyperFrames notes that loudness numbers are only comparable on ffmpeg 8; ours match its own ebur128 meter. |
| HyperFrames | **installed** | npm `hyperframes@0.9.41` (heygen-com/hyperframes, Apache-2.0), local to the project. `doctor` passes. It renders through `/usr/bin/google-chrome`, a wrapper around the preinstalled `/opt/pw-browsers/chromium`; nothing was downloaded. Agent skills were installed with `npx hyperframes skills update`: hyperframes, hyperframes-cli, hyperframes-registry, media-use, reverse-any-video and style-sampling, in `~/.claude/skills` and `~/.agents/skills`. Telemetry is off via `HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1`. |
| Remotion | **installed + smoke-rendered** | `remotion/` holds remotion and @remotion/cli 4.0.543 + React 19. `src/index.jsx` renders through `--browser-executable` pointed at the preinstalled headless shell. **Licence:** free for individuals and for-profit companies with up to 3 employees, commercial use included, which fits a solo producer. A company licence is needed above 3 people. Remotion 5 changes the terms slightly (remotion-dev/remotion `LICENSE.md`). |
| Whisper | **installed + tested** | `faster-whisper 1.2.1` (CPU, int8) in `.venv`. Tested on whisper.cpp's 11 s `samples/jfk.wav`: the transcript was exact, with word timestamps, in about 2 s. `tools/transcribe.py` decodes with the system ffmpeg because the pip PyAV 19 rejects faster-whisper's `metadata_errors` argument. |
| video-use | **installed + smoke-tested** | browser-use/video-use (MIT), cloned to `/home/user/tools/video-use` and symlinked as the `~/.claude/skills/video-use` skill. Python deps (librosa, matplotlib, requests) are in `.venv`. `helpers/timeline_view.py` works on our render (`out/filmstrips/video-use-timeline-break.png`). Its transcription step needs an **ElevenLabs API key**, which we don't have, so it was not configured. On a clip under 1 s, timeline_view fails because of frame rounding. |
| 21st.dev | **not possible without a key** | The public registry route `npx shadcn@latest add https://21st.dev/r/<author>/<name>` now answers `403 {"error":"Authentication required"}`, even for `shadcn/card`. Component pages say installs need `?api_key=$API_KEY_21ST`. No key was asked for or invented. Our engine is canvas-drawn anyway: the window chrome, meters and buttons are hand-built in the brand. |
| DaVinci Resolve MCP | **documented only** | It needs the Resolve app on your Mac; see below. |
| "Tessaract" | **not installed** | This is **Tesseract by Mirage** (github.com/mirage-hq/Tesseract), a real Claude/Codex skills pack for video editing, motion and 3D. It is **not open source**: the repo's LICENSE is a proprietary Terms of Service with a mandatory arbitration and class-action waiver, and it drives a closed-source `tsrct` CLI binary. Installing it would accept those terms on your behalf, so I left that to you: `npx skills add mirage-hq/Tesseract`. |

### DaVinci Resolve MCP on your Mac (samuelgursky/davinci-resolve-mcp, MIT)
1. Install DaVinci Resolve **Studio**. On the free edition (21.1+) external Python scripting moved to Studio, and the repo ships an in-app bridge as a workaround. Open Resolve.
2. Go to Preferences → General → **External scripting using: Local**.
3. Make sure Resolve can find Python 3: either `/usr/local/bin/python3` exists (python.org installer), or run `launchctl setenv PYTHON3HOME "$(python3 -c 'import sys;print(sys.prefix)')"`. Resolve ignores Homebrew's `python3.13`-only layout.
4. Run `git clone https://github.com/samuelgursky/davinci-resolve-mcp && cd davinci-resolve-mcp && python install.py`. It creates a venv, detects the Resolve paths and writes the MCP config for Claude Code (`.mcp.json`) and Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`).
5. Restart Claude Code with Resolve running, then ask it to "list Resolve projects". A typical workflow: import `out/u2c-preview-916.mp4`, add markers, run grades and deliver from Resolve.

## Engine choice: HyperFrames
- **It is HTML + GSAP rendered by seeking a paused timeline.** That is exactly how a motion designer wants to work, and any canvas renderer drops in through `hf-seek`. Our whole frame is a pure function `renderAt(t)` in Canvas 2D (window chrome, meters, logo, pendulum), with GSAP timelines and eases for the camera.
- **It is deterministic and agent-friendly.** It has a contract and a linter, plus `--variables` (one composition, three variants), `-c` for a second aspect, audio muxing, and `snapshot`, `inspect` and `audio` tools. The skills ship with it.
- **Apache-2.0, no seat limits.** Remotion is free for a solo producer, but its licence flips once the business grows past 3 people, and its React model adds nothing for a canvas-drawn piece. It stays installed for React-component work.
- Speed: a 15 s 1080×1920 delivery render takes about 60 s on 4 CPU cores with software GL.

## References (step 1)
whatships.com was fetched. Only titles are listed, so I pulled the posters, picked by eye, and contact-stripped the two picks (`research/`):
- **Factory, "Security Factory"** (0:14): copy the pacing (one idea per 2–3 s, a held 2 s end card), the pixel-block logo resolve, the hairline map, signal-dot hand-offs between nodes, and small mono chips.
- **Filip Wojda, "Interactions"** (0:49): copy borders and rules that **draw on** instead of fading, calm holds on big type, and eased glides with no whip pans.

Also used: **Aurora** (Joe Croskey) as the meter bar (panel grammar, Integrated LUFS as the hero number, polar scope + correlation slider, folded-light surface), and the Kollide frames in `refs/`.

## Decisions
- **Beat:** a numpy synth with an ffmpeg master. Pure ffmpeg `aevalsrc` can't do a sliding 808 or detuned pads with sensible effort. The 30 s source masters to about -12.7 LUFS. The 15 s clip is normalised to -14.0 LUFS integrated / -3.5 dBTP (two-pass, linear).
- **15 s pick:** `analyze.py` scored every downbeat-aligned window on energy, the strongest kick at 0.9–2.2 s into the window, a penalty for kicks in the first bar, and contrast. Bar 2 won: 1.690 s.
- **Data, not decoration:** every readout is measured from the clip, and our integrated LUFS matches ffmpeg ebur128 to 0.04 LU. The EQ nodes sit at the measured band levels relative to pink noise. The 808 marker reads the real f0, so the break dive shows up.
- **Logo:** the 8 atlas pieces never move. Each letter resolves through a 9-unit block mask: a bottom-up sweep mixed with seeded noise, with lilac "frontier" blocks on the leading edge. The edge atlas stays as a ghost (at least 22 % alpha), so the logo is never gone and never broken.
- **Elephant:** a deterministic integration from t = 0, rope period = 1 bar. Kicks pump the swing in its direction of travel, soft-capped at about 8.5°. A secondary sway (0.62 s natural period) lags the rope's acceleration, plus a chain of alternating face-on and edge-on links. If `assets/elephant-loop/` appears, run `python3 tools/sync_elephant_loop.py`: the frames replace the sprite, and the chain and swing stay. Manifest format as in u2c-visualizer `README-ASSETS.md`.
- **Restraint:** no glitch. Kicks give a 0.35 % camera breath, a 1.2 % logo punch and signal dots. Snares give gold ✦ glints and a ghost-edge lift.
- **Delivery:** HyperFrames renders the picture (H.264, 30 fps, 12 Mbps target with a 14 Mbps cap). `render.sh` re-muxes the exact -14 LUFS master as AAC 320 kbps / 48 kHz with `+faststart`. Measured: **I -14.1 LUFS, peak -2.4 dBFS**, both aspects.

## Review passes (step 6)
- `out/filmstrips/pass0-a-draft.png` → `review/director-notes-pass1.md` (6 notes: tighter open, tilt on bar 3, slow the elephant push to 0.7×, hard-cut close-up for the break, end-card push, HUD cleanup) → `pass1-a.png`.
- → `review/director-notes-pass2.md` (4 notes: push in after the re-drop, faster window opens, raise the end card so the pendant hangs whole, slightly more swing) → `pass2-a.png` = **final** `out/u2c-preview-916.mp4`.
- 16:9: landscape camera overrides (`w:` keys) keep the 9:16 choreography → `out/u2c-preview-169.mp4`, `out/filmstrips/final-a-169.png`.

## Caveats
- The beat is a synthetic test track. Swap in a real beat by replacing `audio/beat-30s.wav` and re-running `analyze.py` and `render.sh`.
- The onset thresholds were tuned against the synth's ground truth, so check them on real mixes. Hat precision is 0.71.
- Storyboard stills show the pre-review camera. The final A differs: see the review notes.
- The 16:9 cut got one targeted pass, not two.
