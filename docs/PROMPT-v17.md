<inputs>
Ask me for:
- **The beat:** a WAV or MP3. BPM, key, downbeat and sections are analysed, never typed.
- **Tags:** title, producer, and the metadata tags line.
- **Cover:** the beat's cover image (it replaces cover 0).
- **Stages:** one or more of Nigredo (black), White (Nigredo inverse), Albedo, Citrinitas, Rubedo.
- **Formats:** TikTok/Reels 9:16 and/or YouTube 16:9.
- **Length:** in bars (default 16 bars ≈ 30 s at 128 BPM).
- **Moments:** 8 to 12, in the order I want them, chosen from: cover-flow intro, hero (cover + U2C chain logo), 3-band waveform, spectrum, imager, levels, spectrogram, inserts, now-playing, detection scan, drop negative, metadata.
</inputs>

<direction>
**One player OS, never cut.** Every moment is the same U2C.PLAYER (desktop beat player, liquid-glass windows with stage-coloured traffic lights) and the camera travels inside it. The only cut is the intro match cut, from the cover-flow card onto the hero cover. Y2K lab-scan mood: 2000s gamey, mad scientist, surveillance UI.
- **Hero cover:** deep-fried (negative in Nigredo, thermal or night in colour stages).
- **Detection boxes:** static, in the stage colour.
- **Type:** Akira Expanded for titles and numbers, Synkopy for words. No mono font.
- **Colour:** one stage palette (Nigredo = pure greys and black). The only extra colours are the stage-coloured window buttons and the detection boxes.
- **Truth:** every meter is the beat's real audio:
  - 3-band waveform: lows (kick/808), mids (snare/vocals), highs (hats);
  - spectrum, spectrogram, imager, levels, insert values.
- **Motion:**
  - MD3 Emphasized (0.05, 0.7, 0.1, 1) going in and MD3 Standard (0.2, 0, 0, 1) on screen, 0 % overshoot (glass);
  - kick punch-in (1.4 % zoom, exponential);
  - panels open centre-out from the hero, one 32nd note per ring;
  - one drop bar plays as the full-frame negative.
- **Readability:** everything that must read sits inside the TikTok safe zone (y 208–1544, x < 960 under the button rail).
- **Loop:** the last frame is the first frame, so it loops.

Banned: bouncy easing, particle bursts, decorative text, the elephant, VOL / track lists / coordinates, mono fonts, fades, the 1-frame invert glitch, flashing or jumping labels, glows except the exponential kick glow, anything under the TikTok UI, anything that looks like a template.
</direction>

<structure>
BPM from the analysis, 16 bars, something happens on every beat; every event lands within 1 frame of the 32nd-note grid.
1. Cover-flow intro (2 bars): cards fan out on beat 1, step one card per beat onto the beat's cover, and push in.
2. Match cut onto the deep-fried hero; the panels open centre-out on 32nds.
3. Then the TikTok rhythm: one bar in on a panel, one bar wide. The order of panels comes from my moment list:
   - waveform (hats flicker in the front band);
   - spectrum;
   - imager (rim kicks);
   - levels (2×2 stats);
   - hero scan.
4. The first drop phrase bar after the intro plays as the negative.
5. The kick punch runs on every kick.
6. Final bar: the camera returns to the exact intro framing, so the last frame equals the first.
</structure>

<build>
1. **Determinism:** one deterministic renderFrame(t) for both the web app (U2C Studio) and the native HyperFrames renderer (render.mjs). Every value is computed from time and the cue sheet (u2c-cues v1): no timers, no state carried between frames.
2. **Springs:** closed-form step responses. A value that changes target many times is the sum of one spring per change, so it stays a pure function of time.
3. **Editable:** every moment, colour, label and switch is a keyframeable cue path, registered in registry.js and documented in CUES.md. Every text is a tag, editable in the web app.
4. **Audio:** analyse with the app's DSP (beat grid, 1 ms 6-band envelope, BS.1770 loudness, M/S). Start on a downbeat. Place kick-synced events by the measured onsets (L.kickT).
5. **Python first:** the whole loop is `tools/u2c.py` (sync · stills · beats · strip · crop · test · render · bright · stage). Use agents only for independent areas that are too big to do inline (Sonnet, worktrees), and always weigh the usage.
6. **One frame per beat first:** `u2c.py beats`. Fix anything off the grid, cramped, hard to read at phone size, or under the TikTok UI.
7. **Render:** native renders for each stage × format. `u2c.py bright` checks where the negative lands. Tests: meters 125/125 and smoke 42/42.
8. **Ship:** push to GitHub (public repo: no audio, no MP4s, no licensed fonts), republish the web app, send the MP4s.
</build>

<gotchas>
- **Canvas state:** every ctx.save() needs its restore. One leak clipped the white-stage invert to a single tile and hid the metadata card.
- **Narrow tiles:** text inside a narrow tile needs its own line, or the label and the value overlap.
- **Negative timing:** keep the drop negative off the intro, so it lands on a phrase after the lab opens.
- **Match cut:** for a wide hero cell, use a width-fit zoom (contain), never a fill, or the cut blurs to black.
- **Cover cache:** invalidate it when a new cover is uploaded.
- **Shell:** `%` breaks printf, and rm with a shell variable is refused.
- **Loop:** make the last frame identical to the first (camera, punch and panels included), or the loop stutters.
</gotchas>

<start>
Ask me for the inputs. Then, before you write any code, show me the moment list on the beat grid as a table: bar.beat → what happens → which window.
</start>
