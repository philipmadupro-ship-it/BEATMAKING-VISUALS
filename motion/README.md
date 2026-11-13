# U2C motion: THE LABORATORY beat previews

Code → MP4 beat previews for UCHE2CRAZYYY. Every frame is drawn by code (HyperFrames + canvas + GSAP), locked to the beat grid of your track, with real meters measured from the audio.

## One command
```bash
node render.mjs --beat audio/atelmansion-3c-fmin-128.wav --look exe --stage rubedo --aspect 9:16 --len 30 --title "ATELMANSION 3"
```
| flag | values | default |
|---|---|---|
| `--beat` | any WAV (analysed once, cached as `<beat>.grid.json`) | the ATELMANSION 3 beat |
| `--look` | `exe` (clean OS windows) · `lab` (lab-notebook ground, specimen layer) · `scope` (one oscilloscope screen) | `exe` |
| `--tags` | a JSON file of text overrides (see below) | none |
| `--stage` | `nigredo` · `albedo` · `citrinitas` · `rubedo` | `nigredo` |
| `--aspect` | `9:16` · `16:9` | `9:16` |
| `--len` | seconds, rounded to whole bars (at 128 BPM: 15 = 8 bars, 30 = 16, 60 = 32) | `30` |
| `--start-bar` | force the section (song bar number) | one bar before the first drop that fits |
| `--title` | on-screen title | from the filename |
| `--out` | output path | `out/v7/<look>-<stage>-<916\|169>-<len>s.mp4` |
| `--filmstrip` | also write `out/v7/filmstrips/<name>-filmstrip.png` | off |
| `--stills 0,2.5,9` | PNG frames instead of a video (fast look) | off |
| `--rebuild` | re-run the audio analysis for this length | off |

**Output:** H.264 at 12 Mbps (14 Mbps cap), 30 fps, AAC 320k / 48 kHz. Audio is mastered to **-14 LUFS integrated, true peak ≤ -1 dBTP**. A 30 s render takes about 3 minutes on 4 CPU cores.

Everything in this repo: `tools/render_all_v6.sh`.

## What it does
1. **`tools/beatgrid.py` (full track, librosa)**
   - Finds the tempo and the exact beat grid.
   - Finds bar 1 (sections start with a drop-out on the 1, so energy drops on the 1 count fully).
   - Finds the key, and the song structure in 4-bar phrases (intro, groove, build, drop, break, outro).
2. **`tools/clipdata.py` (per render)**
   - Picks the section: it starts on a downbeat one bar before a drop and ends on a bar line, so the loop is clean.
   - Masters it to -14 LUFS / -1 dBTP.
   - Measures every frame with `tools/meters.py`:
     - peak / RMS with ballistics
     - LUFS M/S/I, LRA, true peak
     - 1/6-octave spectrum with peak hold
     - spectrogram, goniometer, correlation and width
     - balance vs pink, 6 band levels
     - kick / snare / hat onsets
     - DAW waveform data.
3. **`film/v6/*`.** The composition: lab cards, stages, the shot plan built from the song structure, and the camera keyed in beats. There are no fades; everything steps on the grid. The U2C logo chains IN and OUT forever, and the elephant swings on its own rigged chain.
4. **HyperFrames** renders the picture deterministically; **ffmpeg** muxes the master.

## Tests
```bash
.venv/bin/python tests/test_meters.py film/data/atelmansion-3c-fmin-128-30.wav   # meter accuracy vs ffmpeg / pyloudnorm / numpy
.venv/bin/python tests/sync_test.py --stage nigredo --aspect 9:16 --len 30           # every visual event vs grid vs audio, <= 1 frame
```

## Swapping in an animated elephant
Drop a seamless loop of PNG/WebP frames with alpha into `assets/elephant-loop/` (an optional `manifest.json` takes `{fps, frames, bail, width}`). The next render picks it up through `tools/sync_elephant_loop.py`. The loop is pendulum-swung about the chain's top. To return to the rigged sprite, empty the folder.

## Requirements
Node 22+, ffmpeg, Python venv (`.venv`: numpy, scipy, soundfile, librosa, pyloudnorm). HyperFrames renders through the system Chromium (`/usr/bin/google-chrome` → `/opt/pw-browsers/chromium`).

## Editing the on-screen text (tags)
Every word on screen comes from **`tags.default.json`**:
- window titles, the boot lines and the experiment / trial codes
- the specimen tag
- notes such as "808 lives here"
- stamps, the result-card lines, the big display words and the HUD.

To change any of it for one beat, write a small JSON file with only the keys you want to change and pass it with `--tags`. Your keys are deep-merged over the defaults:
```json
{ "title": "NIGHT SHIFT", "experiment": "EXP-07", "notes": { "spectrum": "sub sits at 41 Hz" },
  "result": { "cta": "free download → link in bio" }, "bigwords": ["NIGHT", "{bpm}", "SHIFT"] }
```
```bash
node render.mjs --beat audio/night.wav --tags tags/night-shift.json --look lab --stage albedo
```

**Variables.** Values may use `{vars}`, which are filled from the analysis:
- `{title}`, `{Title}`, `{titleWord}`
- `{bpm}`, `{bpm2}`, `{key}`, `{keyShort}`
- `{stage}`, `{stageN}`, `{look}`
- `{lufs}`, `{srcLufs}`, `{lra}`, `{tp}`, `{bars}`
- `{producer}`, `{experiment}`, `{date}`.

`date` defaults to `{today}`, which takes the beat file's date. Arrays (for example `boot` or `bigwords`) are replaced as a whole.

The renderer writes the merged result to `film/data/tags-*.js`. A web app can generate the same JSON.

## The three looks
- **exe:** the clean U2C.EXE grammar.
  - A true-black ground, one hero per frame (the logo, a meter or the pendant), dashed elbow connectors and a step tag (`1 CHAIN IN_`).
  - Two type voices: huge display and lowercase mono.
- **lab:** the same edit on lab-notebook graph paper, with the lab layer kept within the frame budget: one handwritten note, a specimen tag, a crossed-out reading and a stamp.
- **scope:** one oscilloscope screen is the hero of every frame. Its content changes on the bar: the logo wrapped by two live traces, the scope, spectrum, stereo, spectrogram, folded-light surface or EQ. Numeric cells sit below it.

All three cut **only on bar lines**:
- The logo is "home" for at least 50 % of the bars, with a meter or the pendant cut in between.
- Bar 1 is the boot. The second-to-last bar is the result card. The last bar mirrors the first frame, so the loop is clean.
