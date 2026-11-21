---
name: u2c-beat-preview-motion
description: Rules and QA checklist for making or reviewing UCHE2CRAZYYY (U2C) beat-preview videos (Reels 9:16 / 16:9, HyperFrames project /home/user/u2c-motion, "THE LABORATORY" lab-OS look, U2C chain logo, elephant pendant). Use when planning, building, editing or critiquing a U2C beat preview, its pacing/cuts, composition, meters (EQ, levels, spectrum, spectrogram, stereo, 3D surface), chain physics or the Nigredo/Albedo/Citrinitas/Rubedo stage palettes. Pairs with the hyperframes skill.
---

# U2C beat preview: motion rules

Target look: **clean lab OS**. Use vagosrose's restraint (a binary ground, one accent, one idea per frame, hairlines, 10:1 type contrast) inside the U2C lab world (logo chain, elephant, specimen tags, DAW meters).
The evidence is in `/home/user/research/STYLE-RESEARCH.md`. The long specs are `references/eq-display-spec.md`, `references/aurora-notes.md` and `references/meters-and-frames.md`.
Brief rules still win: **no fades**, and **every event sits on the beat grid** (BRIEF-v6.md).

## Route to the task skill first (v9)
This file is the umbrella (style rules + QA list). For any concrete task, load the focused skill and follow its procedure + done-checklist:
| task | skill |
|---|---|
| grid, downbeat, quantising any event, the sync test | `u2c-beat-timing` |
| elephant pendant, chain wave, pendant.* params, motion trace | `u2c-chain-pendant` |
| U2C logo break/thread, glow, runner, drop bloom | `u2c-logo-chain` |
| waveform (session.exe) data/drawing + accuracy test | `u2c-waveform` |
| any meter's math or drawing (EQ, imager, levels, spectrum...) | `u2c-meters` (+ /home/user/research/METERS-SPEC.md) |
| camera shots, pushes, cuts, holds | `u2c-camera-cuts` |
| stage colours, accent budget, Nigredo grey test | `u2c-stage-palettes` |
| cue sheets, property registry, new keyframeable props, web <-> native sheets | `u2c-cue-sheet` |
| rendering (web + native), filmstrips, QA gate, director notes | `u2c-render-qa` |
v9 facts: the native renderer (`/home/user/u2c-motion`, branch v9, `render.mjs --cues`) runs the web app's own look code (`web-app/src/v8`, synced by `node tools/sync_web.mjs`); edit looks only in the web app. Outputs go to `out/v9/`. No clock.sys / bands.dat windows in any look.

## 0. Before you build
- [ ] Get the grid from `tools/beatgrid.py` (BPM, downbeat phase, bar 1). Schedule everything in **beats**, never in seconds.
- [ ] Pick the section: start on a downbeat, ideally the bar before a drop. End on a bar line so it loops cleanly.
- [ ] Choose the stage (§6) and stick to its ground and its single accent.

## 1. Pacing
- [ ] **One visual change per beat at most**, and a **shot change only on a bar line** (every 1, 2 or 4 bars). Faster cutting (½-beat) is allowed only for 1 bar into a drop or a fill.
- [ ] Quiet sections (intro, break) get shot lengths of 2 to 4 bars. Grooves get 1 to 2 bars. Drops get 1 bar, with insert cuts on the beat.
- [ ] The structure drives the edit: the **drop downbeat** gets the biggest event (hard cut to a new composition plus the chain fully built). A build gets stepped reveals (1 element per beat).
- [ ] Hold the **first composition for at least 2 bars**, and make it readable in 1 s. Hook = logo, plus title, plus a live meter.
- [ ] The last bar mirrors the first frame (loop-clean).

## 2. Cut grammar
- [ ] Allowed transitions: **hard cut** (default); **whip/slide** (2 to 4 frames, with horizontal motion blur, landing on the beat); **step-reveal / typewriter / block-resolve / glyph-decode** (letters scramble, then lock on the beat); **wipe** quantised to ½ beat; a **1-frame invert or flash** on a snare at most once per 4 bars.
- [ ] Forbidden: opacity fades, crossfades, slow push-ins, Ken Burns drift, spins, bounce-in, and "everything moves at once".
- [ ] Cut on the **downbeat or the onset sample frame**, never in between. The incoming shot's first frame is already the finished composition (or step 1 of a reveal).
- [ ] Easing for the things that do move: `expo.out` / `power4.out` over at most ½ beat. The landing frame is exact (no overshoot) for UI, and has natural overshoot only for chain physics.

## 3. Composition: "screenshot view"
- [ ] **Static, full-screen, designed compositions.** Each shot is a still you could screenshot and post. Energy comes from cutting between them and from snapping elements in, **not from zooming the camera**.
- [ ] At most **one slow camera move per video** (if any), and only a stepped move (push to the next bar's framing on the downbeat). No continuous drift.
- [ ] **Logo chain = the beat centre.** It is the home shot, centred and big, and it builds and dissolves on the grid forever. The edit goes home → **insert cut to one meter** (1 to 2 bars) → home → another meter. That is roughly 50 to 60% logo screen time and 40 to 50% meters.
- [ ] Per frame: **1 hero** (the logo, one big word, or one meter), **at most 1 secondary window**, **2 to 4 micro labels**, **1 or 2 connectors**, and **at most 1 accent element**. About 8 objects at most. Ink coverage around 5 to 15%.
- [ ] Margins: at least 12% of the width at the sides. On 9:16, keep the content inside y 15 to 78% (clear of the Reels UI). Align everything to a 12-column / 8 px baseline grid. Connectors run at right angles.
- [ ] **v11 shell (supersedes the v6 lab layer and the two-voices rule):** windows are liquid glass (`L.glass`: blurred ground, tint, top light, hairline edge, shadow), no title bars or buttons, one hairline UI label, generous air. Three voices: **display** Akira Expanded (fallback Unbounded 800) for title/end card, **UI** Synkopy (fallback Space Grotesk) for labels and credit, **mono** JetBrains Mono for every number. Brand fonts are gitignored slots in `web-app/assets/fonts/` (never commit). Specimen tags, stamps, handwritten notes, boot terminal, wires, tape, trial/grid-locked text, big words and "808 lives here"-style captions are **gone**; only real readouts (Hz, dB, LUFS, BPM, key, bar.beat) and the title/credit are text. HUD = four quiet margin readouts, off from the first frame of a push until wide again. API: `web-app/V11-SHELL-API.md`.
- [ ] Depth through optics: defocus on secondary layers, faint bloom on light-on-dark, global grain and a 1 px chromatic fringe. Keep it subtle and global, applied the same way to every element.

## 4. Meters (all values measured from the real audio, frame-accurate)
- [ ] **EQ display:** use the original Pro-Q-spirit spec in `references/eq-display-spec.md`: a thick summed curve, numbered band nodes, a filled selected band, a tilted analyzer behind, a dual dB ruler, a note strip and a hover bubble. Copy no FabFilter logos or trade dress.
- [ ] **Spectrum / spectrogram / stereo / levels / 3D surface:** at "Aurora grade" (`references/aurora-notes.md`). That means the peak-preserving log projection, the 0.22 s trail, the LUT spectrogram with alpha `v^0.56`, the density goniometer with 0.42 s persistence, and 1 dB segments with peak and hold lines.
- [ ] **Other meters (levels, LUFS, BPM, odometer, waveform):** in the Kollide-frames styling (`references/meters-and-frames.md`): a hairline-framed panel, a header `BEAT · F MIN · 128`, numeric cells (label top-left, value bottom-right, mono), segmented arc gauges, and the accent **only** for overs, the playhead and rec.
- [ ] A meter on screen is **the hero of its shot**. Show it full-width as a "screenshot", not as a thumbnail among six others. Show at most 2 meters per shot.
- [ ] Ballistics are the real ones (attack and release in ms), but **display ticks** (number updates, peak-hold resets) step on the beat or ½-beat.
- [ ] Borrowed DAW or plugin imagery is greyscale. Colour belongs to the stage accent.

## 5. Natural chain physics (logo chain and elephant pendant)
- [ ] v9 implementation = the **chain wave** (`u2c-chain-pendant`): N links (default 10) as damped followers, the hand pushes on every swing beat, the push travels link by link (~1 frame/link), the damped-pendulum body arrives last with its extremes on the beats. Never keyframe a sine.
- [ ] Natural period: tune the pendant so its swing period is about **2 beats** (at 128 BPM: 0.94 s, `L ≈ g·(T/2π)² ≈ 0.22 m` scale-equivalent). That way the free swing phase-locks with the impulses.
- [ ] The elephant hangs from the last link and inherits its angle with a 1 to 2 frame lag (inertia). It may twist ±8° about the vertical axis.
- [ ] Simulate deterministically at a fixed timestep (for example 240 Hz substeps for the 30 fps render) from a seeded initial state, so renders are reproducible.
- [ ] Chain build and dissolve (logo IN and OUT) happens **link by link on the grid** (1 link per ½ beat or 16th), never as an opacity fade.

## 6. Stage palettes (ground / ink / accent); the stage is a condition
| Stage | Ground | Ink & greys | Accent (≤2% of pixels, one element) |
|---|---|---|---|
| **NIGREDO** | **true black `#000000`–`#060606`** (current `#0e0e0e` is too lifted for this rule) | white `#f5f5f5` plus neutral greys only | **none, or pure white `#ffffff`**. Strictly **no hue**: R=G=B everywhere, checked by test |
| **ALBEDO** | beige / bone `#e4dccb` to `#ece5d5` (never pure white) | ink `#1a1917`, ash greys | iron-oxide `#a8432e` |
| **CITRINITAS** | brown `#24170d` to `#352313` | tan / cream `#ecd9b0`, `#c4a57a` | ochre or brass `#d79a35` |
| **RUBEDO** | deep violet `#1a0d22` | lilac ink `#f1e6f7` | **vibrant purple `#a35cf0`** with magenta heat `#ff5cc8` (oxblood `#7a1428` for stamps only) |
- [ ] Per frame: one ground, one ink, and one accent. Greys may be tinted toward the stage hue (except in Nigredo).
- [ ] Anti-clichés: no stars, serpents, smoke, Latin, occult symbols, gold gradients or lens flares.

## 7. QA checklist (run before delivery)
- [ ] `tests/sync_test.py` passes: every event is within **1 frame** of the grid.
- [ ] Scene cuts are on the grid: `ffmpeg -i out.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep pts_time` gives cut times, and each is within 1 frame of a bar or beat line. Count the **cuts per bar**: about 1 or less outside drops.
- [ ] No fades: no frame-to-frame global luma ramp longer than 2 frames, except whips.
- [ ] Palette: k-means over frames sampled every 0.5 s. The ground plus ink make up at least 80% of pixels, and the accent is at most 2%. **Nigredo: max(|R−G|,|G−B|) ≤ 2 on every pixel.**
- [ ] Element budget is respected on every shot (§3). Ink coverage stays at or below 15%, except for the breath frames.
- [ ] Safe zones: nothing important outside x 12–88% and y 15–78% on 9:16.
- [ ] Type: two families only. Hero 55 to 70% width. Micro labels are at least 22 px at 1080 w, so they stay readable.
- [ ] The logo appears in at least 50% of bars, and the chain is never static for more than 1 bar.
- [ ] Meters match `tests/test_meters.py` (LUFS, true peak, spectrum vs numpy/ffmpeg).
- [ ] Audio: −14 LUFS integrated and ≤ −1 dBTP. The loop point is clean (the last frame matches the first frame's composition).
- [ ] Watch it once muted: is every cut still motivated by the visible meters? Watch it once at 0.25×: no stray frames, no half-built element on a cut frame.

## 8. Motion methods (details: `references/motion-methods.md`)
- [ ] Workflow: format + BPM -> beat-table storyboard -> shot-by-shot build -> stills at downbeat/landing/peak -> render -> automated QA -> director notes as parameter changes.
- [ ] Ease by role: arrivals `expo.out`/`power4.out`, camera/flood `power2.inOut`, exits `power3.in` (40-50% shorter); physical things are simulated, never eased; opacity/colour never bounce.
- [ ] Camera language (stepped only): wide establishing -> push to ONE window on a bar line -> hold while it acts -> return on a bar line; cut at the onset frame, anticipation in the previous beat.
- [ ] Audio: offline features to per-frame JSON; attack 5-50 ms / release 120-300 ms from dt; hysteresis + min re-trigger gap; one primary reactor, secondaries <=30%; look-ahead onsets for anticipation.
- [ ] Pendant: T = 2 beats so swing turn-arounds land on beats (test it); kick-scaled impulses, amplitude cap, 1-2 frame lag, blur on the fast part.

## Intro (v11)
Beats 0-8: liquid-glass player (transport, now-playing pill with cover thumb, title, credit, scrub bar = real audio position, band levels), cover-flow of 5 glass cards (perspective strips, reflections, kick pulse) stepping one card per beat, landing on cover-0 at beat 6, selection brackets, hard exponential push-in, hard cut to the lab at beat 8. No fades. Code: web-app/src/v8/intro.js (hook in film.js render()).
