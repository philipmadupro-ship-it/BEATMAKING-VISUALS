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

---

# v6: THE LABORATORY (brief: BRIEF-v6.md)

## Added this round, and why
| What | Licence | Why |
|---|---|---|
| **librosa 1.0.1** | ISC | Onset envelope, beat-track seed and CQT chroma for the key (`tools/beatgrid.py`). |
| **pyloudnorm** | MIT | An independent BS.1770 reference in `tests/test_meters.py`. |
| **HyperFrames skills** | Apache-2.0 | `hyperframes`, `hyperframes-registry`, `media-use`, used for the render contract, the registry search and seek-safe patterns. |
| **Registry components `hw-arrow`, `hw-boil`, `hw-underline`** | Apache-2.0 | Installed in `film/compositions/components/`. They are DOM/SVG, so their mechanics are ported into canvas in `film/v6/lab.js`: the seeded-hash "boil" re-posed on a quantised clock (ours re-poses on the 16th-note grid), stepped pen draw-on, and wobbled strokes. |
| **Caveat** | OFL | The handwriting face, shipped with those components. |

Not used: madmom (its models are non-commercial). Registry blocks like `typewriter`, `grain-overlay` and `waveform` lost to hand-built canvas versions: they animate DOM with CSS, while ours must be grid-stepped and audio-driven.

## 1. Analysis of ATELMANSION 3 (`audio/atelmansion-3c-fmin-128.grid.json`)
- **Tempo: 128.00 BPM, confirmed.**
  - librosa alone said 86.1 (a 2/3 metrical error).
  - We score candidates on how strongly grid beats land on onsets: 64 BPM scored 17.9× the mean, 128 scored 12.5×, 86 scored 2.1×. A half-time winner yields to its double.
  - The phase is refined sample-accurately on the on-beat high-band transient: 219 beats, residual RMS 3.9 ms, max 19.7 ms.
- **Bar 1 = 0.00025 s.** The file starts on a downbeat.
  - Sections start with a drop-out on the 1, for example beats 72-74 silent with a re-entry on the beat-4 pickup.
  - Downbeat scores per offset: 0 → 58.3, 3 → 34.2.
- **Key: F minor, by default.**
  - F is unambiguous as the tonic, but the mode is not: Krumhansl F major 0.710 vs F minor 0.653, against C minor 0.283.
  - So it is **not** C minor. Major vs minor is ambiguous, so we print F MIN per the brief and note it.
- **Structure (4-bar phrases):**
  - intro 1-16, groove 17-20, build 21-24
  - **drop A 25-36**, break 37-40, groove 41-44, build 45-48
  - **drop B 49-60**, outro 61-64.
- **Sections chosen:** every length starts on song bar 24 (one bar before drop A, so the drop hits at 1.875 s).
  - 15 s = bars 24-31
  - 30 s = bars 24-39 (ends in the break; loops back into the build bar)
  - 60 s = bars 24-55 (drop A → break → build → drop B).

## 2. The elephant's own chain
The separate hanging chain is gone. `tools/elephant_rig.py` paints soft masks on the art:
- the hanger loop: from the bail (343,197) up to the chain's top (346,6), which is the **pivot**
- the small top-left loop
- the long bottom-left loop, pinned where it passes behind the shield.

It samples them on a 26×26 vertex mesh. `film/v6/brand.js` rotates each vertex by weighted angles:
- rope pendulum θ about the pivot
- body lag about the bail
- loop sway φ1 / φ2 about the crossing.

It then draws the original art as ~900 textured triangles, so the chain bends while the art keeps its own pixels. The motion is on the grid:
- θ = A·cos(π·beat/2), so the extremes land on beats 1 and 3.
- The body lags ½ beat, the loops lag ¾ and 1 beat, and kicks add a jolt.
- The amplitude follows the section.
- RUBEDO swings over 2 bars (weight).

## 3. No fades, everything on the grid
Schedules are in beats (`L6.ev`, `steps()`). Nothing animates opacity:
- **Cards** open in 6 counted steps on 32nds: outline, outline, header, then content in thirds.
- **Text** types one character per 64th note.
- **Annotations** draw on in 4 pen steps on 16ths; the handwriting boils on 16ths.
- **Camera:** hard cuts on bar lines, glides from beat to beat.
- **The logo cycle runs for the whole video** on a 2-bar loop:
  - bar 1 (boot): OUT, so frame 0 shows the whole logo
  - the drop bar: IN, with U, 2 and C on beats 1, 2 and 3, each letter block-resolving in 4 steps on 16ths
  - then OUT on the next bar, and so on.
  - The ghost outline never leaves and the pieces never move.
- The engine samples each frame at its centre, so every event lands on its nearest frame.

## 4–5. Waveform, meters, accuracy
- **session.exe (Arrangement-inspired):**
  - clip header bar
  - a whole-song overview with section labels, the clip bracket and the playhead
  - a bar/beat ruler with song bar numbers
  - warp-marker ticks on the quantised kick and snare transients
  - a 4-bar detail window with L/R lanes drawn as peak (light) + RMS (solid), coloured by spectral tone
  - KICK / SNR / HAT lanes and the playhead with bars.beats.16ths.
- **Meters:**
  - 1/6-oct spectrum (61 bands) with 1 s peak hold
  - a 4 s scrolling spectrogram (128 log bins)
  - L/R peak (13.3 dB/s release, 2 s hold) and 300 ms RMS bars
  - LUFS M/S/I + LRA + true peak
  - a goniometer with 3-frame persistence + correlation + width
  - octave balance vs pink + tilt
  - 6 band levels, onset counters
  - a BPM/phase clock whose hand steps on 16ths.
- **`tests/test_meters.py`: all pass.** It uses six synthetic signals plus the real clip:
  - integrated LUFS within 0.04 LU of ffmpeg ebur128 and pyloudnorm
  - LRA within 0.13 LU of ffmpeg
  - true peak within 0.05 dB of ffmpeg
  - sample peak and RMS exact vs astats
  - 1/6-oct sine peak at 1000 Hz / -18.00 dBFS
  - correlation +1 / −1 / 0, pink balance within 0.4 dB, tilt within 0.04 dB/oct.
  - On an fs/4 inter-sample-peak test ffmpeg reads +0.50 dBTP while the analytic truth is −0.09; ours reads +0.03.

## 6. Stages (a condition, not a recolour; earlier residue stays)
- **NIGREDO** (charcoal):
  - compression: one-bar shots, shallow 3 % pushes, a tighter camera
  - obstruction: black tape bars over the spectrogram / balance / gonio
  - surfaces swallowing light: 72 % vignette
  - black built by texture: grain plus gloss sheen bands.
- **ALBEDO** (bone, limestone, cream, ash; new hexes):
  - exposed construction: basting stitches around every card, crop marks, layer labels (L1 FRAME / L2 SIGNAL / L3 INK)
  - a wider camera that shows the build
  - the logo as black ink, with black thread residue.
- **CITRINITAS** (tobacco, ochre, beeswax, brass, tan):
  - a legible system: brass header rules, numbered index tabs on every card
  - directional warmth: a warm light from the left, and every push pans left to right
  - residue: ink lines and bone specimen tags.
- **RUBEDO** (bruised violet + magenta heat + oxblood tape):
  - embodiment and proximity: closer camera, shots swapped toward the body
  - weight: a 7.5° swing over 2 bars
  - resolved moves: power3.out landings on the beat
  - all residues: ink, bone tags, brass rules.
- **Anti-clichés:** no stars, serpents, smoke, Latin, occult symbols, gold gradients or flares. The elephant art's own sparkles are untouched.

## 7. Renders (`tools/render_all_v6.sh`)
In `out/v6/`:
- `{nigredo,albedo,citrinitas,rubedo}-916-30s.mp4`
- `{nigredo,rubedo}-{916,169}-60s.mp4`
- `nigredo-916-15s.mp4`.

Filmstrips are in `out/v6/filmstrips/`. The CLI is documented in README.md.

## 8. Director passes
- `review/v6-director-notes-pass1.md` covered: boot crop, repeated framings, new drop angles, break glide.
- `review/v6-director-notes-pass2.md` covered: terminal placement, balance framing, the elephant body push-in.
- Pass renders: `out/v6/passes/nigredo-916-30s-pass{1,2}.mp4` with filmstrips. The fixes apply to every stage and length through the shared plan logic.
- After pass 2, the 16:9 check fixed the boot (terminal beside the logo) and the loudness card layout.
- `review/v6-director-notes-pass3-60s.md` covered the 60 s loop of calm framings. Every plan now enforces no repeated framing within 8 bars, and all four 60 s files were re-rendered.
- **Sync test** (`tests/sync_test.py`) over all 8 deliverable configurations: every scheduled event (cuts, glides, card-open steps, logo IN/OUT steps, boot lines, annotations; 168-480 events per video) lands within **0.5 frame** of its 32nd-note grid time. The mastered clips' on-beat transients sit within 0.10 ms of the grid. Reports: `out/v6/sync-report-*.txt`.

## v6 caveats
- **Key mode.** The analysis says the tonic is F; the mode leans major (0.71 vs 0.65), and C minor is clearly out (0.28). The screen shows F MIN per the brief.
- **Hats.** The kick lane counts some 808 attacks (72 kicks detected over 64 beats). Hat detection is denser than the real hats. These lanes are display-only; visual triggers use the grid.
- **AI elephant loop.** If one is swapped in, it swings rigidly: the rig deformation needs the still art.
- **Albedo and Citrinitas** use new hexes (bone, limestone, ochre, brass, …), as the brief allows per stage. **Rubedo** adds a vibrant violet, magenta heat and oxblood.

---

# v7: professional pass (skill: u2c-beat-preview-motion; research: /home/user/research/STYLE-RESEARCH.md)
1. **NIGREDO** is black, white and greys only:
   - ground #050505
   - the elephant and the logo are greyscaled (Rec.709 luma)
   - tested on decoded frames: max |R−G|, |G−B| = 0.
2. **Chain physics** (`film/v6/brand.js`). A held-in-hand pendant:
   - A kinematic hand flicks on every beat (downbeat 1.0, beat 3 0.7, beats 2/4 0.45, alternating direction).
   - That drives a verlet rope through the elephant's own chain (8 segments, gravity, damping, 12 constraint iterations) to a heavy body hung below the bail.
   - The two side loops are lagging secondary pendulums. A ±8° twist comes from the rope-to-body bend.
   - Gravity is auto-calibrated so the free period is 2 beats.
   - Fixed 1/240 s step, with a 16-bar pre-roll so frame 0 is in steady state. Deterministic.
   - The art's pixels are skinned onto the rope and body by mesh.
3. **Pacing and composition** (`film/v7/compose.js`). Static "screenshot" compositions cut only on bar lines:
   - The logo is home (at least 50 % of bars); one meter or the pendant cuts in between.
   - Boot is bar 1, the result card is the second-to-last bar, and the last bar mirrors the boot (loop-clean).
   - No camera zooms.
4. **Meters:**
   - **EQ:** an original Pro-Q-spirit display: 3 bands, filled areas, a 3 px summed curve, numbered nodes, a hover bubble, dual dB rulers, a 30 kHz axis and a piano strip. Gains are automation steps on the beat.
   - **balance.vst** has been removed.
   - **Loudness:** redone as a Kollide-style instrument: an 84-tick 270° gauge, M/I sub-gauges and numeric cells; display ticks every ½ beat.
   - **Waveform:** sample-accurate, 400 columns/s, with 1 px columns.
   - **Spectrum, spectrogram and stereo** follow the Aurora methods: a peak-keeping projection, a 0.22 s trail, glow, a LUT with alpha v^0.56, and a density goniometer with 0.42 s persistence.
   - **Meter design ideas after Aurora by Joe Croskey (AGPL-3.0). Only the methods and parameters were re-implemented; no Aurora code is used.**
5. **Looks:** `--look exe | lab | scope`, each with its own composition logic (see README).
6. **Tags:** all on-screen text comes from `tags.default.json`, plus per-beat overrides via `--tags` (see README).
7. **Deliverables:** `out/v7/{exe,lab,scope}-nigredo-916-30s.mp4` and `out/v7/exe-rubedo-916-30s.mp4`. Filmstrips are in `out/v7/filmstrips/`; notes in `review/v7-director-notes-pass{1,2}.md`.

**Caveats:**
- The 15 s / 60 s / 16:9 cuts were not re-rendered in v7. The CLI makes them in one command each.
- The v6 renders in `out/v6/` use the older camera engine.
