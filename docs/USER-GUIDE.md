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
