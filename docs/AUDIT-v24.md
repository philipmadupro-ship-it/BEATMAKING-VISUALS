# U2C audit v24 — where we are, what's wrong, what's next

Audited on the v23.3 branch (PR #3) against the user's brief: Premiere-like editor, every look built on the player, a calm and believable
intro, ElevenLabs inside the web app, full-beat YouTube versions, stills before video. Each finding has its evidence and a severity:
**P0** = broken or blocks work, **P1** = hurts quality or speed noticeably, **P2** = polish / debt.

## 1. Findings

### Video (native render + the shared film engine)
| # | Finding | Evidence | Sev |
|---|---|---|---|
| V1 | Loops are seamless in both formats; the intro, the hero, CTAs and the outro land where they should | `u2c.py review`: seam 0.93 / 0.77 → SEAMLESS; 12-moment stills, 9:16 + 16:9 | ok |
| V2 | The stove was mixed too quietly by the renderer (−47 dB RMS); the shipped MP4s were fixed by a remix afterwards, and the renderer now uses +6 dB | loudness profile 0–1 s | fixed |
| V3 | **The voice phrase count must match the lines.** A new take with a stray breath or an extra pause splits into 4 phrases, and the last line drops | `placeVoice` / `voice.py` split at ≥ 0.2 s pauses | P1 |
| V4 | The pre-roll (9.0 s) and the voice timings are still literals in render.mjs, not imported from `PRE_S` / `VOICE_ATS` | render.mjs lines 55, 122, 205 | P1 |
| V5 | **Native renders take ~16 min for the two 30 s formats; a full beat (3 min) would take ~1.5 h** | render log timestamps | P1 |
| V6 | The web export has only synthesised twins of the lab SFX (stove, room). The native render uses the ElevenLabs samples, so the two exports sound different | labaudio.js vs render.mjs `smp()` | P1 |
| V7 | The frame-0 thumbnail has no text (the hook rises at 0.25 s). That is fine for a looping feed, but YouTube / TikTok cover frames are chosen from frame 0 by default | review strip, frame 0 | P2 |
| V8 | Colour stages (Albedo, Citrinitas, Rubedo, White) have not been re-checked since v22. The v23 Akira matrix and stove are only validated on Nigredo | no stills since v22 | P2 (deferred by user) |

### Web app (U2C Studio)
| # | Finding | Evidence | Sev |
|---|---|---|---|
| W1 | **First-visit stalls**: building the film for an aspect the first time (switching 9:16 ↔ 16:9) blocks for 3.5–9 s; the first lab frame builds caches for ~0.35 s. After that the median frame is 3–6 ms and p90 45–83 ms | perf + cache profile per flag | P1 |
| W2 | Canvas readbacks without `willReadFrequently` (Chrome warns; slower Review / halftone) | console warnings in the perf probe | P2 |
| W3 | 14 visible buttons are smaller than 24 × 24 px (WCAG 2.5.8 target size) | perf probe DOM scan | P2 |
| W4 | The Voice lab cannot be exercised outside claude.ai (it needs the ElevenLabs connector); the fallback path (copy the prompt, load the take) is tested | voicelab.js | P1 (verify live) |
| W5 | **The timeline has no clip-level editing for camera shots:** you cannot drag a shot's start edge to change the move length, and there is no razor on the camera lane. Alt-drag swap and the shot list cover reordering only | cuetimeline.js | P1 |
| W6 | There is no visible undo history panel (Premiere's History); undo works but is blind | — | P2 |
| W7 | Workspaces switch panes but do not remember custom panel sizes per workspace | addlayer.js / workspace.js | P2 |
| W8 | The phone layout works (floating preview, bottom-sheet inspector), but the timeline is cramped below 400 px | phone screenshots | P2 |
| W9 | The user guide stops at v22; there is nothing on presets, the voice lab, the shot list, markers / chapters or workspaces | docs/USER-GUIDE.md | P2 |

### Pipeline, tests, repo
| # | Finding | Evidence | Sev |
|---|---|---|---|
| T1 | `u2c.py review` crashed on MP4s whose audio is longer than the video, and its moment marks still assumed the 0.7 s pre-roll | traceback `/tmp/u2c_r.png` | fixed |
| T2 | `tests/editor.mjs` (42 UI checks) is not part of `u2c.py test` | tools/u2c.py | P1 |
| T3 | The repo pack is 102 MB, mostly old renders, filmstrips and storyboard PNGs under `motion/` (75 files). New renders could land there too | `git count-objects`, `git ls-files motion/out` | P2 |
| T4 | No licensed fonts, audio or MP4s are tracked (Akira / Synkopy are gitignored; the fonts in git are OFL) | `git ls-files` scan | ok |
| T5 | Store integration (uche-beatstore-g-a) is blocked on push access | STORE-INTEGRATION.md | blocked |

## 2. Plan

### Phase 1 — quick wins (this session)
1. **W1 warm-up:** after a clip is ready and the user has been idle for 1.5 s, draw the key moments once into a tiny offscreen surface, so the caches are built before the user scrubs there. *Not fixed:* the aspect switch itself; Phase 3 moves the film build into a worker.
2. **W2:** `willReadFrequently` on every canvas that is read back.
3. **W3:** a 24 px minimum on icon buttons and marker buttons.
4. **V4:** render.mjs imports `PRE_S` and `VOICE_ATS` from the shared modules (one source of truth).
5. **T2:** `u2c.py test` also runs `tests/editor.mjs`.
6. **T3:** ignore `motion/out/` and new filmstrips going forward (no history rewrite).
7. **V3:** the voice split takes the N longest phrases in time order when a take has more pauses than lines, and merges the closest gap when it has fewer. Same rule in voice.py and labaudio.js.
8. **W9:** a v23 section in the user guide.

### Phase 2 — editor depth (next)
- **W5:** camera clips with a draggable move-length edge (`dur`) and a razor (S) on the camera lane.
- **W6:** a History panel (the undo stack, click to jump).
- **W7:** workspaces remember panel sizes.
- **V6:** the web export can use recorded SFX: drop your stove / ambience / clink files in Media. They are stored in the page's asset store and used instead of the synth twins.

### Phase 3 — speed and scale
- **W1 (rest):** build the film data (per aspect) in a Web Worker / at idle in slices, so switching 9:16 ↔ 16:9 never blocks the UI.
- **V5:** native renders in parallel chunks (split the timeline into N segments, render them concurrently, concat with the audio). A full beat should take about the time of a 30 s clip × chunks / cores.
- **V7:** a "cover frame" option: frame 0 shows the hook card, for platforms that take frame 0 as the thumbnail.

### Phase 4 — when the user says go
- **V8:** colour stages, stills first.
- **T5:** store integration, once push access to uche-beatstore-g-a is granted.

## 3. Progress
- **Phase 1:** done (commit de5d18b).
- **Phase 2:** done.
  - **W5:** drag a camera move's start edge to set its length (one undo step, keeps the landing). S at the playhead already cuts the camera lane.
  - **W6:** History panel (left rail → History); click any step to jump there.
  - **W7:** each workspace remembers its panel widths and dock height.
  - **V6:** Media → Lab sounds (stove, lab ambience, glass clink) replace the synth twins in the web export, at the native render's levels.
  - Tests: smoke 44/44 (+ move length / History), editor 42/42.
  - Also: the warm-up now treats seeks / playback as activity, so it never stalls a scrub.
- **Next:** Phase 3 (chunked parallel native renders; film build off the UI thread).
