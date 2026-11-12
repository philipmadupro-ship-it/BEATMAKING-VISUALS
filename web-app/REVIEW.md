# U2C Studio v1 — Review

Scope: everything in `src/` at the v1 baseline (fbf7b7d), plus screenshots from the Playwright smoke run
(`tests/smoke.mjs`, headless Chromium + SwiftShader WebGL, CDN served from the local cache).
Severity: **H** = wrong output / leak / user-visible failure, **M** = noticeable drift, waste or fragility, **L** = polish.
Status column: ✔ fixed in v2, — left as is (reason given).

## A. Correctness

| # | Sev | Where | Finding | Status |
|---|-----|-------|---------|--------|
| A1 | H | `fx/postfx.js` gpu() | Texture is rebuilt with `tex.destroy(false)` whenever the source canvas changes (grid cards, look thumbnails, studio, export all alternate). `false` keeps the `CanvasSource` alive, so every switch leaks a GPU texture; `thumbs()` alone leaks 12 per call. | ✔ one cached `CanvasSource` per canvas (WeakMap), sources destroyed on resize |
| A2 | H | `main.js` load() | Race: loading a file while the demo (or a previous file) is still analysing lets the older analysis resolve last and overwrite the newer track; the clock already holds the new buffer, so visuals and audio come from different songs. | ✔ load token; stale quick/full results ignored |
| A3 | H | `ui/exporter.js` | Every export result and thumbnail creates an object URL that is never revoked (each MP4 is several MB). | ✔ URLs tracked and revoked when a result/thumbnail is replaced or the list is trimmed |
| A4 | M | `engine/clock.js` | Playback time ignores `outputLatency`/`baseLatency`, so visuals lead the audio by the device latency (≈10–40 ms wired, 150 ms+ Bluetooth). | ✔ latency subtracted from the audio clock |
| A5 | M | `ui/studio.js` frame() | Preview looping restarts the source from rAF after `t >= outT`: up to a frame + 30 ms scheduling gap at every seam, audible click, and the seam the user hears is not the exported one. | ✔ looping `AudioBufferSourceNode` on the same crossfaded loop buffer the export uses |
| A6 | M | `export/audio.js` | Loop crossfade is 20 ms linear (not equal-power), fades only the tail and ignores the beat; seam bumps are audible on sustained material. | ✔ equal-power ~1 beat crossfade with the pre-roll |
| A7 | M | templates + `render.js` | Several motions run on absolute time (`fs.t * .12` rotations, `Math.sin(fs.t)`, CD spin per 16 beats, kick/snare envelopes from pre-roll hits), so the last frame of a loop does not flow into frame 0. | ✔ loop-phase helpers in frameState (`lp`, `cyc()`), periodic hit lists, feature crossfade at the seam |
| A8 | M | `lib/cdn.js` | A CDN import that stalls (no error, no response) blocks boot forever; there is no timeout. | ✔ 12 s timeout per optional import |
| A9 | M | `export/offline.js` | Export path copies every frame twice (WebGL canvas → 2D `out` canvas → `CanvasSource` VideoFrame) and awaits each `add()`, so the GPU/encoder never overlap. | ✔ rewritten (see §E) |
| A10 | M | `ui/exporter.js` batch | Each batch job re-slices, resamples and loudness-measures the same audio from scratch. | ✔ prepared audio cached per (in, out, options) |
| A11 | M | `analysis/index.js` | `w.onerror` is reassigned per job and drops the worker for all later jobs; a worker error for one job silently re-runs analysis on the main thread while the old listener stays attached. | ✔ listener removed on every path; error falls back once |
| A12 | L | `export/recorder.js` | Fallback recorder never disconnects its BufferSource / MediaStreamDestination. | ✔ disconnected in `finally` |
| A13 | L | `util/draw.js` cached() | Cache clears everything at 140 entries, including the expensive dithered HANDSET sprites (re-dither stalls a frame mid-export). | ✔ LRU-style eviction of the oldest entry only |
| A14 | L | `postfx.js` | Glitch slices regenerate by temporarily replacing `Math.random` globally. Deterministic but hostile to other code. | ✔ glitch slices now drawn deterministically in 2D, GlitchFilter removed |
| A15 | L | `main.js` setPaletteVars | Amethyst UI dark `#5a3d78` is not a brand colour. | ✔ derived from palette data |

## B. Architecture

- **One pipeline?** Yes: grid, studio, thumbnails and export all call `renderFrame(t, surface, project, track)` →
  template → overlays → finish → post-FX. Good. Weak spots: the export copies the result into a second canvas
  (`opt.target`) and HANDSET/EXE/LAB/POSTER bypass the text overlay and hard-code their own strings (title, BPM, key, tag).
  ✔ v2: templates read printed text from one `text.lines` model (`overlays/text.js` → `lineText()`), export reads frames
  straight from the renderer's output canvas.
- **Templates pure functions of frameState?** Mostly. Exceptions: `poster.js` prints `new Date().getFullYear()` (not
  deterministic), `bloom.js` and `handset.js` use absolute time for motion, overlays mutate module-level GSAP
  timelines (acceptable: they are *seeked*, never played). ✔ removed `Date`, motion moved to loop phase.
- **Duplicated state?** `text.title`/`key` are copied into every grid card's project (`grid.refreshText` hand-lists 14
  fields and silently misses new ones); the profile is written from a hand-picked subset of `text`. ✔ grid now copies
  the whole `text` object; profile stores the whole text model + custom colours.
- The FX defaults were stored in the autosaved project, so changing defaults never reached returning users.
  ✔ project key bumped to v2 (profile kept and migrated).

## C. Design critique (from `shots/`, v1)

**All templates.** RGB split is always on (1.5 px floor + 16× snare gain) and glitch slices fire on every kick at
70 px offset × 1.35 boost: on LAB the type is doubled in three colours and unreadable (worst case in `lab-916.png`).
CRT curvature + vignette darken the corners on light templates. The U2C chains sit as a small corner sticker
(scale .2–.36) and are mid-shatter in about a third of all frames; the elephant is a tiny pendant at the top edge on 9/12
looks. Brand is the weakest element in every frame — the opposite of the brief.

| Template | Kept? | Critique → v2 action |
|----------|-------|----------------------|
| LAB | ✔ | Strong wireframe identity, but node graph is generic and the bottom 30 % of 9:16 is empty. → chains become the central node cluster with cables plugging into links; elephant swings inside a MONITOR node window. |
| HANDSET | ✔ | Best print texture; logo is a tiny sticker, title line mixes title + handle at one size. → big chains as phone charm on a lanyard + on the phone screen, elephant sticker in the collage, text from the Text panel. |
| EXE | ✔ | Giant type is the hero but shows the beat title, not the brand; "U2C" only appears every few bars. → chains are the giant title assembling link by link, elephant is the app icon and swings in the window. |
| SCOPE | ✔ | Clear, but three equal boxes compete and the bottom spectrum strip reads as filler. → strip removed; trace bends around the chain silhouette, elephant swings above. |
| PENDANT BLOOM | ✔ | The one look where the elephant is the hero; works. Chains too small at the bottom. → chains enlarged under the halo. |
| CHAIN POSTER | ✔ | Good grunge; the chains are smaller than the title band. → chains are the hero (≈90 % width), title band thinner. |
| SLICER | ✔ | Elephant halftone grid is striking; logo absent from the grid. → slices cut through a live composite of chains + elephant. |
| CHROME, KINETIC, DAW, METER DECK, TERRAIN | ✗ | Removed per v2 feedback (files, registry, batch list). |

**UI.** Palette chips are the only colour control; FX tab has six sliders with no master; no way to set the key except free text;
no way to check the loop seam; export has no speed feedback. ✔ All addressed in v2 (variants + custom colours, master FX + glitch,
key picker, Seam check, fps/ETA readout, Draft toggle).

## D. Glitch/FX defaults (v1 → v2)

v1: glitch .5 × boost 1.35 on every kick (offset 70 px), RGB 1.5–25 px, shockwave on every phrase **and** drop at 26 px amplitude.
v2: master FX 35 %, glitch 30 % only on strong kicks (top 25 % onset strength) or bar 1 of a phrase (select: kicks / bars / phrases),
≤ 80 ms ease-out, 3–4 thin slices, RGB ≤ 3.5 px @1080p with fast decay, subtle CRT, shockwave on phrase/drop only.

## E. Export speed

v1 path: render 2D → upload → Pixi → `drawImage` into a 2D canvas → Mediabunny `CanvasSource` (another copy) → `await` per frame.
v2 path: render 2D → Pixi once → `new VideoFrame(glCanvas, {timestamp})` → own `VideoEncoder` (`prefer-hardware`, falls back to
`no-preference`) → `EncodedVideoPacketSource`; queue kept ≤ 8, yields only when the queue is full or every ~120 ms for the UI.
Numbers are in the final report / commit message (headless SwiftShader, so absolute fps are far below a real GPU).
