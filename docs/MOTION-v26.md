# MOTION v26: the intro as the tail of the infinite zoom, plus the wide-in-wide camera rule

This pass changes three things: the intro (the pre-roll, from frame 0 up to the play click and the push into the lab), the loop's first frame, and one camera rule.
The v25 outro (the CLOSE PROJECT? dialog, then the infinite zoom into the hero cover that becomes frame 0) is not touched.
Every value is still a pure function of time, the cue sheet and the seed.

Numbers are at 128 BPM: 1 beat = 0.469 s, and the 9 s pre-roll = 19.2 beats.
"Comp" means composition seconds (0 = frame 0, 9 = the play click = beat 0). "Beat" means film beats (negative during the pre-roll).

---

## 1. The idea in plain words

The outro already falls *into* the hero cover, and the cover becomes frame 0. Before v26, that fall stopped dead at frame 0. For 9 s the camera was locked off, and then it lurched into the push.

**Now the fall never stops.**
- From frame 0, the camera keeps sinking into the same point: the centre of the beat cover, which is the point the outro zoom lands on.
- It moves very slowly at first, then gathers speed through the whole pre-roll.
- On the play click it hands its speed straight to the push on the drop, which carries it through the cover into the lab.

So across the loop, the camera moves in only one direction: inward. It goes lab → hero cover → frame 0 → (the slow fall) → the card's cover → lab → … That is the infinite zoom the user asked for. It is not a gimmick bolted onto the front: it is the same move as the ending, continued, so the loop reads as one endless fall.

**Why this is the best first image and the best loop:**
- **Frame 0 is a finished picture.** The cover sphere, the paused player and the readouts are all in place, so nothing is half-built. With `intro.coverFrame` on, the hook card is there too. Frame 0 is the platform thumbnail and the frame the loop lands on, so it must look like a poster, not like a page loading. Before v26 the player faded in between 0.5 and 2.1 s, so the thumbnail had no player.
- **It moves from the very first frame, but calmly.** A slow push from a still frame is the classic "Apple product film" opening: the viewer feels drawn in before anything happens. Starting at zero speed means the loop seam has no velocity step. The outro lands at speed 0, and the intro leaves at speed 0.
- **One move, physically motivated.** The camera behaves like a body falling into the cover. It is never cut, reversed or stopped, from the × click at the end, through the seam, through the pre-roll, to the drop. The only cut left in the film is the match cut through the cover into the lab, which the user likes ("on the drop it goes in").
- **The UI stays on the glass.** The hook dialog, the console lines, the cursor and the player bar are the app's chrome. They do not fall with the world. Only the content does: the sphere, the card and the readouts. This gives depth (two planes moving at different speeds) and keeps the player fully in frame. In 9:16 the player is 1016 px wide in a 1080 px frame, so ×1.16 would clip it.

---

## 2. The intro, moment by moment

| comp s | beat | what | motion |
| --- | --- | --- | --- |
| 0.00 | −19.2 | **frame 0**: cover sphere spinning, paused player in place, readouts, editorial ground | the fall starts at speed 0 |
| 0.25 | −18.7 | the hook dialog rises (soft spring, 0.9 s); its window title arrives with the glass | container |
| 0.60 → 1.73 | −17.9 → −15.5 | the hook types (25 chars/s): **readable by ~1.7 s with the sound off** | content |
| 1.4 / 3.9 / 7.3 | | the voice lines (tags `voice.ats`, unchanged) type as console lines | |
| 3.70 → 5.90 | −11.3 → −6.6 | the cursor presses the sphere and drags it up to the beat cover's ring | intro-world points, carried by the fall |
| 6.30 → 7.10 | −5.8 → −4.1 | the cursor picks the beat cover; it flies onto the card's cover square | |
| 7.10 → 7.32 | −4.1 → −3.6 | **the card's glass springs in around the landed cover**: caption plate, rim, scale 0.96 → 1, corners rounding with it; the sphere goes soft (DOF ramps 0 → 5 px on the same spring) | container before content |
| 7.10 → 7.90 | −4.1 → −2.4 | the card title and credit type | content |
| 8.25 | −1.6 | selection brackets step in (32nd steps) | |
| 9.00 | 0 | the cursor clicks play: the beat starts | the fall hands its speed to the push |
| 9.00 → 9.22 | 0 → 0.47 | the hook dialog and the console lines leave on the v25 spring: opacity 1 → 0, the hook grows 6 % as the camera passes it | |
| 9.00 → 10.875 | 0 → 4 | the push on the drop: exponential zoom through the cover, speed peaking at the cut | unchanged |
| 10.875 | 4 | match cut into the lab on the same cover; dolly out (spring, 3 beats); windows spring in centre-out (v25) | unchanged |

The intro moments keep their seconds (`INTRO_S`, minus the removed `playerIn`), so the voice timings, `VOICE_ATS` / `VOICE_DURS`, the click and SFX lists in `motion/render.mjs` (read from the sheet's own keys) and `intro.coverFrame` all still line up.

Only one timing changed:
- the hook's keyboard taps start at 0.6 s;
- only the hook body is typed, because the window title arrives with the glass.

This is updated in both `film.js typeEvents()` and `motion/render.mjs`.

---

## 3. The maths

### The fall (`intro.js fallLn()`)

τ = (t + PRE) / (PRE + T(IB)) runs from 0 at frame 0 to 1 at the cut (IB = the 4-beat push).

    ln z_fall(τ) = A · s(τ),   s(τ) = τ − sin(πτ)/π
    A = ln 1.18 (9:16),  ln 1.10 (16:9)   (cue path intro.fall scales A; 0 = locked-off camera)

The speed is s′(τ) = 1 − cos(πτ): a **half-cosine from 0**. This is the same curve as the rising third of the v25 outro's Tukey window. So:
- the speed and the acceleration are 0 at frame 0, which matches the outro landing, so the seam has no step in position, velocity or acceleration;
- the speed keeps rising all the way to the drop. A fall accelerates; it never cruises and stops.

The zoom about the cover centre (g.cx, coverCy) keeps that point fixed on screen. This is the same self-similar point as the outro, so the image grows about the exact pixel the outro zoomed into.

At the play click (τ = 0.83), z = ×1.116 (9:16) or ×1.065 (16:9). It is a slow, felt-more-than-seen drift: about 1.2 % of the frame per second.

### The handover to the push

    ln z = lerp(ln z_fall, ln z_max, push)

`intro.push` is the existing bezier, which leaves at speed 0. At the click:

d(ln z)/dt = (1 − push)·(ln z_fall)′ + push′·(ln z_max − ln z_fall) = (ln z_fall)′

So the velocity is **continuous**: the push picks up the fall at the speed the fall had reached. At push = 1, ln z = ln z_max exactly, so the match cut is still pixel-identical. The radial streak takes its dl from the same combined ln z, one frame apart.

### Two planes

The player bar is drawn with the push only:

k = e^(push · ln z_max) / z

It is applied about the same pivot. During the pre-roll the player is static on the glass. On the drop it flies off with the world, exactly as before.

The cursor's sphere waypoints (press, drag, pick) are intro-world points. They are mapped through the current fall camera, so the cursor stays on the tile it is dragging.

The play target `INTRO_HIT.play` is now stored in screen pixels.

### The springs (from v25, reused)

x(τ) = 1 − (1 + ωτ)·e^(−ωτ), with ω = 30 rad/s, normalised to land exactly on 1 at 0.22 s. It is critically damped, so there is no overshoot on glass. It drives:
- the card's container;
- the DOF ramp;
- the hook's and the console's exits at the play click.

---

## 4. Camera rule: wide → window → wide (`cues/generate.js`)

The user: "when you zoom, it always goes back to full screen before and after clicking a window, because if not it's too much."

Before v26, the generated camera travelled panel to panel (v17 "never-cut"), with occasional wide slots. Now **every visit is a round trip from the full desktop**:

| preset | push in (`dur`) | hold on the window | back to wide | wide before the next visit |
| --- | --- | --- | --- | --- |
| default / hero / tour (9:16) | 2 beats, landing on the bar | 2 beats | 2 beats | 2 beats |
| 16:9, full | 3 beats | 2 beats | 2 beats | 1 beat |
| calm | 4 beats | 4 beats | 4 beats | 4 beats (one visit every 4 bars) |

- The seeded order is unchanged: waveform, hero and rack first; the hero every other visit for hero / full / long clips; never the same window twice in a row. Only the travel changed.
- A "wide" slot in the cycle now adds no key, because the camera is already wide. It gives the long wide breaths, and the two CTAs still land on the first two.
- What still goes **in**:
  - the intro push and the match cut on the drop;
  - the final hero visit (from wide), the CLOSE PROJECT? dialog and the v25 infinite zoom.
- `film.js camera()` is unchanged. Its panel-to-panel dip is simply no longer generated, but it still serves hand-edited sheets.

---

## 5. Checks

Stills (native renderer):
- before: `/home/user/research/review-intro/before/`
- after: `/home/user/research/review-intro/after/` and `after2/`

| check | result |
| --- | --- |
| frame 0 | the player is in place |
| the hook | readable at 1.8 s |
| the card | its plate springs in at 7.15 s |
| the hook and captions at the push | gone at 9.3 s |
| window visits | 13.5 s wide → 14.8 s waveform → 16.2 / 16.9 s back to wide → 18.4 s hero → 19.6 s wide |
| outro | the portal now carries the player; 38.97 s = frame 0 |

Loop seam (browser, 270 × 480, frame 0 against the last frame):
- **2.82** with `intro.coverFrame` off (v25: 2.80);
- **2.78** with it on (v25: 2.76);
- the threshold is 6.
