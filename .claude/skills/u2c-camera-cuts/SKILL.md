---
name: u2c-camera-cuts
description: Camera grammar for U2C beat videos: the wide bench shot, focus pushes/cuts to one window, where they land on the grid, how long they hold, and which window each section gets. Use when planning or editing camera.shot keys, the default sheet's focus plan, or reviewing cuts in a render.
---
# U2C camera + cuts

Code: `web-app/src/v8/film.js` (`framing`, `camera`, `attention`, `bracket`), `src/cues/generate.js` (default plan), `src/cues/schema.js` (`ev.shot`).

## Grammar
- **Wide** = the whole bench at zoom 1 (home shot; logo chain visible). **Focus** = one window, zoom `clamp(min(W/(w+80), H/(h+80)), 1.15, 2.2)`, centre clamped to the frame (+-30 px overscroll). Full-width windows (session, chains on exe 9:16) frame identically: push to half-width windows (eq, spectrum, elephant, loud...) for a visible change.
- Moves are only **push** (eased over `dur` beats BEFORE the key, `easeInOut` = power2.inOut, lands exactly ON the key) or **cut** (hard, on the key frame). Nothing else: no drift, no Ken Burns, no spin, no zoom on non-bar beats.
- A shot key lands on a **bar line** (`"N.1.0"`). 1/2-beat cuts only for 1 bar into a drop or a fill.
- Hold: quiet 2-4 bars, groove 1-2, drop 1 (inserts on beats allowed). First composition holds >= 2 bars. Last bar = first frame's composition (loop).
- Rhythm: wide -> push to ONE meter (1-2 bars) -> wide -> another; ~50-60 % logo-visible time.
- Section choice (default sheet): a section change within 1 bar of the push picks `SECTION_PUSH[look]` (v12 exe: drop -> `spectrum`, build -> `session` (waveform), break -> `stereo` (imager); lab/scope: drop -> chains, build -> spectrum, break -> elephant); else the look's rotation `FOCUS_PLAN` (v12 exe: session, spectrum, stereo, loud; no EQ window exists). exe has no logo/pendant window: the hero is a front layer and is hidden (hard) during a push to `loud` / `stereo`. Pushes at clip bars 3, 7, 11 (keys `4.1.0`, `8.1.0`, `12.1.0`), hold 2, never within 2 bars of the end.
- Attention bracket (`focus.featured` auto) hops per beat only while wide (z < 1.05).

## Edit
- Sheet: `camera.shot` track keys `{at, v: 'wide'|<window id>, transition: 'push'|'cut', dur, ease}`. Pair every focus key with a later `wide`.
- Presets: `default`, `calm` (no pushes), `drop` (cut to chains on each drop + push out), `tour` (meter every 2 bars).

## QA
```
cd /home/user/u2c-motion && .venv/bin/python tests/qa_video.py out/v9/<file>.mp4 --stage nigredo     # cuts within 1 frame of a beat, cuts/bar, no fades
.venv/bin/python tests/sync_test.py --cues <sheet.json>                                              # push start + landing events
```
## Done checklist
- [ ] Every shot key on a bar line; each focus paired with a wide.
- [ ] Holds respect the section table; <= 1 cut per bar outside drops.
- [ ] qa_video + sync PASS; the smoke row "camera push lands on its key" PASS.
