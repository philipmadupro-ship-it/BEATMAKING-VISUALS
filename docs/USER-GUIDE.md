# U2C Studio: quick guide

## Make a video in the web app
1. **Open the studio** and drop your beat (WAV/MP3). BPM, key, downbeat and sections are detected for you.
2. **Pick the look:** PLAYER is the current one. Pick a **stage**: Nigredo (black), White (Nigredo inverse), Albedo, Citrinitas or Rubedo.
3. **Upload your cover:** Export panel → Upload cover. It becomes the cover-flow card, the hero and the now-playing art.
4. **Edit:** every setting is in the **Inspector** (right). Every text is in **Tags**: title, producer, hook, CTAs, caption, hashtags, insert names, metadata. Use the **Layers** list (left) to show or hide windows. The **timeline** (bottom) holds the camera moves and keys.
5. **Export:** choose 30 s / 1 min / full beat and Seamless loop, then Render both formats (9:16 + 16:9).

## Main switches (Inspector)

| What | Path |
|---|---|
| Hook + 2 CTA pop-ups | `social.on`, `social.hookIdx`, `social.cta1.at` / `.len`, `social.cta2.at` / `.len` |
| Mouse layer | `cursor.on` |
| Seamless loop (rewind outro) | `outro.rewind` |
| Kick punch / drop negative | `fx.punch` / `fx.invert` |
| Deep-fried cover | `hero.fry` (negative, thermal, night, none) |
| Detection boxes | `scan.on`, `scan.always`, `scan.color` |
| MIDI map / logo ride | `roll.on`, `roll.mini`, `roll.span` / `hero.ride`, `hero.rideAmt` |
| Waveform band colours | `meter.session.low` / `mid` / `high` |
| Window buttons / focus bracket | `chrome.lights`, `chrome.lightsColor` / `focus.bracket` |

## Native renders (faster, with motion blur and click sounds)
```
python3 tools/u2c.py render -s nigredo            # one 9:16 + one 16:9 in parallel (about 6 min per video)
python3 tools/u2c.py render -s rubedo --hook 1    # hook variant 1
python3 tools/u2c.py render --len 15              # 15 s loop test
python3 tools/u2c.py review VIDEO.mp4             # key-moment strip + loop seam check
python3 tools/u2c.py test                         # meters + smoke tests
```
Renderer flags:
- `--preroll` 0.7 s: silent click-to-play opening.
- `--mblur` 3 sub-frames.
- `--clicks on|off`, `--click-db -16`.

## Posting
The caption, hashtags and hook lines are in Tags (`social.caption`, `social.hashtags`, `social.hooks`). Post 2 or 3 hook variants and compare 3-second retention in TikTok Studio.

## v21: working like a pro editor
- **Projects:** header → **Projects** (or Cmd/Ctrl+S to save). Save, Save as new, open, duplicate, rename, delete. Recent projects are on the home screen. **Export .u2cproj** to move a project (cue sheet, tags, settings, covers; tick *include audio* to carry the beat); **Import** opens it.
- **Meta tab:** every metadata field in one place: title, producer, BPM, key, date, tags, and the metadata card's format, duration and size (leave empty to use the file's values). **Every word on screen** searches all texts; edit them right there.
- **Cmd/Ctrl+K:** the command palette. Type a few letters to run any action, jump to any property or any word. **?** shows every keyboard shortcut.
- **Viewer:** Guides (action / title safe, thirds, centre), preview resolution (Full, 1/2, 1/4 for speed), **A/B** compare (Snap B, edit, drag the divider), frame step buttons, Loop I/O.
- **Timeline:** drag in the ruler to scrub with sound; the **Film** strip shows frames along the ruler; **Markers** tab (left) lists every marker; Alt+Cmd/Ctrl+V pastes copied keys into another lane.
- **Export queue:** add TikTok 30 s, Reels 15 s, Shorts 60 s, YouTube full; set the file name template; **Run queue** renders them one after another.
- **Layout:** drag the side panel edges to resize; the two panel buttons in the viewer bar hide or show the side panels.

## v22: the simple controls
- **Inspect tab = controls by task:** Intro (sphere or flow intro, **New variation**, click-to-play, cursor, pop-ups), Camera (kick punch, zoom, background dim, seamless loop), Text (title, producer, hook, pop-ups, the 4 terminal lines, the outro dialog), Colours (stage, cover look, detection boxes, waveform bands), Export (format, length). Each shows its value and a one-line hint. **Advanced** opens every raw property.
- **Status strip** at the bottom: beat, BPM, key, section, format, stage, intro, export preset and the play position. Click an item to change it.
- **Timeline:** double-click a key to type its value (camera keys: pick the window by name); click a terminal or text clip to retype it; right-click for add / delete / ease; drag either edge of a clip. Wheel = lanes, Shift+wheel = time, Ctrl/Cmd+wheel = zoom.
- **First run:** a 3-step guide (load a beat → pick a look → export); *Got it* hides it for good.

## v23–v24: presets, voice lab, Premiere-style editing

- **Look presets**:
  - Lab (default)
  - Hero
  - Calm / YouTube
  - Rack tour
  - Full beat

  They are on the home screen and in the Look tab. All of them have the player, the orbit-sphere intro, the hero card and the rack. You can switch at any time, and every track you edited by hand stays. EXE, LAB and SCOPE are under *Legacy looks*.
- **Full beat**: pick *Full* length (or the Full beat preset). The video plays in the player to the end: CLOSE PROJECT?, the cursor clicks ×, and it stops (no loop back to the intro). Long videos visit the hero card every other move.
- **Shot order** (Look tab): drag the camera stops to reorder them. The times stay and the windows move. Or Alt-drag a camera clip onto another one in the timeline. Use *+ Stop at playhead* to add one and *Shuffle order* for a new order.
- **Voice lab** (left rail → Media):
  - Pick one of your ElevenLabs voices (your own voices come first; *AI 1 girl* is the default).
  - Set the experiment number and her three lines.
  - *Generate intro take* makes one take. It spends credits only on that click.
  - The take is split at its pauses and placed on the intro; a breath mid-line is merged automatically.
  - Outside claude.ai: *Copy prompt*, then *Load voice take*.
  - Under the voice: tag `voice.sub` sets the octave-down double (dB, or `off`), and tag `sfx.stove` turns the stove ignition on or off.
- **Cover presets** (Media): Halftone print, Night vision, Thermal, Negative, Clean, Stage colours. *Every sphere tile* puts the treatment on the whole sphere.
- **Markers** (left rail → Markers):
  - Each marker has a type: Note, Cue, Drop, Hit, CTA or Chapter, each with its own colour on the timeline.
  - ‹ › jump between markers.
  - ◎ adds a camera visit at the marker.
  - *Chapters* copies YouTube chapter lines (from Chapter markers, or from the sections when there are none).
- **+ Layer** (timeline): text, terminal line, CTA, camera stop, zoom key, negative, flash, cover key or marker at the playhead. Each item says what it does.
- **Workspaces** (top bar): Edit, Motion, Audio, Export rearrange the panels for the job.
- **Tooltips**: hover any control for half a second to see its name, what it does and its shortcut.
- **The preview is always visible**: when the monitor scrolls away (phone, long panels), a floating glass mini-preview follows you. Click it to jump back, drag it to a corner, × hides it.

## v25: Simple and Pro, presets, direct editing

- **Simple mode (default).** It works like CapCut / Clipchamp:
  - **Left:** Presets, Layers, Media, History.
  - **Centre:** the preview.
  - **Bottom:** a timeline with plain tracks (Intro, Camera, Text, Effects, plus whatever you moved).
  - **Right:** *Edit* (the thing you selected), *Look*, *Export*.

  Every panel starts with one line saying what it is for. The **Pro** switch (top bar) brings back every panel: Text / Meta / Beat tabs, Markers, raw properties, graph and cue-sheet tools.
- **Presets** (left → Presets):
  - Quick presets: Lab, Hero, Calm / YouTube, Rack tour, Full beat.
  - **Save as preset** keeps only what you changed: moved windows, options, words, edited tracks. Apply it on any beat: the video is rebuilt for that beat, with your changes on top.
  - ★ = *Use for new videos*.
  - ↻ update, ✎ rename, ⇩ export, *Import preset*.
- **Click a window on the preview.** It is boxed and a floating toolbar appears:
  - *Visit*: the camera goes there at the playhead.
  - *Edit*
  - *Reset* the position
  - *Hide*
  - *Save preset*

  Drag the window to move it; the preview updates live.
- **Edit-point preview:** while you drag a key or a camera move in the timeline, the monitor shows that exact frame ("EDIT POINT"). It goes back to the playhead when you let go.
- **Sliders:**
  - a tick marks the default value;
  - double-click resets it;
  - a bubble shows the value while you drag;
  - arrow keys step.
