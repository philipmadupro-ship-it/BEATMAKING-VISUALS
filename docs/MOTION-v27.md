# MOTION v27: the intro is the outro played backwards

The user: "At the outro it's a zoom IN, and after it gets into the thing. I want the intro to ZOOM OUT and after it comes into the player: the exact contrary of the outro for the intro. After that make it continuous as well."

This pass changes the intro (frame 0 up to the play click), the loop seam and the last beat of the outro.
The v25 outro zoom keeps its curve, its fixed point and its cross-dissolve into frame 0.
The drop push, the match cut into the lab, the window reveals, the camera rule (wide → window → wide) and the full-beat `stop` ending are unchanged.
Every value is still a pure function of time, the cue sheet and the seed.

Numbers are at 128 BPM: 1 beat = 0.469 s; pre-roll PRE_S = 9 s = 19.2 beats; 30 s clip = 64 beats, so the composition is 39 s.
"Comp" = composition seconds (0 = frame 0, 9 = the play click = beat 0).

---

## 1. The idea in plain words

The outro falls **into** the beat cover. Now the intro comes back **out of** it.

- **The seam is the cover.** The last frame and frame 0 are the same picture: the beat cover filling the screen. The outro zooms into the lab's hero cover, the cover's picture dissolves into that full-bleed cover, and the zoom lands on it. Frame 0 is the intro world zoomed into the cover on the player's card (cover centre where it rests, the cover filling the frame with a 6 % overscan).
- **The intro is the same move in reverse.** From frame 0 the camera zooms out on the outro's own curve, mirrored in time. It starts at speed 0, reaches the outro's cruise speed, and settles. It reveals the card's rim and caption, the readouts, then the paused player rising into frame from below. At about 4.1 s the whole player screen is in place.
- **Then it keeps going (the "continuous" part).** The v26 slow fall into the cover is added on top of the zoom-out. So the camera never parks. It is thrown out of the cover, slows down, turns round at the player layout (z = 1 exactly, about 4.1 s) and starts falling back in. The fall gathers speed until the play click and hands its speed to the drop push, which carries it through the cover into the lab (match cut, unchanged).
- **The player docks on the glass at the turn.** The player bar rides the world while the camera zooms out, so it comes in from below as part of the picture. At the apex the camera speed is 0, so the bar can stay on the glass from there with no jolt. The slow fall afterwards only moves the content (card, readouts), as in v26. The drop push still carries the player off.

Across the loop the camera does one gesture: in (outro), out (intro), in (drop), with only one cut: the match cut through the cover on the drop. Every turn happens at speed 0 or with continuous speed.

### Why this is the best loop

- **It is literally a mirror.** Both halves use one function: the Tukey log-zoom (taper 0.3), over the same 9 beats, with the cover centre fixed on screen. The outro runs e(u). The intro runs 1 − e(u) = e(1 − u). The seam sits in the middle of the mirror, where both speeds are 0. Nothing has to "match": the two halves are the same function on either side of t = 0.
- **The seam is numerically invisible.** In the browser at 270 × 480, the difference between frame 0 and the last frame is **0.08** (v26: 2.8; threshold 6). The last frame is frame 0, drawn directly.
- **It tells the story the user described.** "We fell into the project" (outro), then "we come back out of the project into the player" (intro). Then "press play, dive back in" (drop). The loop reads as breathing in and out of the cover, not as a rewind.

### Why it is the best first image

- **Frame 0 is the cover art, full bleed.** It is the strongest picture the brand owns: the U2C elephant pendant, sharp (drawn from the source-resolution cover, not the 600 px card texture), with the brutalist frame counters on top. It is a finished poster with nothing half-built. With `intro.coverFrame` on, the hook card is on top of it as well: a real thumbnail.
- **It moves at once, but calmly.** Speed 0 at frame 0, rising on a half-cosine. The first 0.75 s pull back only from ×3.6 to ×3.3, so the poster holds while the hook rises at 0.25 s.
- **Sound-off viewers read the hook by 1.7 s.** The hook dialog is glass chrome: it is not zoomed, and it types from 0.6 s to 1.73 s.

### The sphere and the pick: decision

**The cover is on the card from frame 0, and the pick flight is gone.**
- The camera comes out of that cover, so the cover can never have been somewhere else. A pick that flies the cover onto the card after we have just seen it on the card would break physical continuity.
- The orbit sphere stays in the scene, spinning at one constant rate (about 0.18 rad/s, seeded direction). It sits behind the card in soft focus (DOF 5 px). Its beat-cover tile is missing: it is the one on the card. At the card's size the sphere is fully hidden behind it, so it costs nothing visually and keeps old sheets and the editor's tracks meaningful.
- The caption (title + credit) is printed, not typed, so every frame of the zoom-out shows a finished card. Typing on an empty plate while it flies in would look unfinished.
- The "pick" moment becomes a **choice click**. The cursor wakes at 5.7 s, glides onto the card and clicks it at 6.3 s. The selection brackets step in on 32nd notes, with the lock ding. Then it travels to play.

Sheets that still have a pick flight (`intro.pick` with two or more keys) keep the v26 intro exactly: the drag, pick, typing and cursor path, with no zoom-out.

---

## 2. Moment by moment (128 BPM, 30 s clip)

| comp s | beat | what | camera |
| --- | --- | --- | --- |
| **0.00** | −19.2 | **frame 0**: the beat cover full bleed (×3.60 about its centre), cursor at rest, brutalist frame; hook card too if `intro.coverFrame` | zoom-out starts, speed 0 |
| 0.05 / 0.25 | | stove, then the ambience and the ding; the hook dialog rises on its glass (v26) | |
| 0.60 → 1.73 | −17.9 → −15.5 | the hook types: **readable by 1.7 s** | ×3.32 at 0.75 s |
| 1.40 | −16.2 | voice 1 "EXPERIMENTATION Nº 01" (console line) | ×2.46 at 1.5 s (cruise: 0.44 ln/s, the outro's curve) |
| 1.5 → 2.3 | | the card's rim, caption plate and reflection come into frame | ×1.98 at 2 s |
| 3.0 | −12.8 | the paused player rises into frame from below (riding the world) | ×1.28 |
| 3.75 | −11.2 | the whole player screen is in; the readouts arrive at the top | ×1.02 |
| 3.90 | −10.9 | voice 2 "BY UCHE2CRAZY" | |
| **4.10** | −10.5 | **apex**: z = 1.000 exactly (the designed layout); the player docks on the glass | speed 0, turns round |
| 4.10 → 9.00 | −10.5 → 0 | the sphere orbits behind the card; the slow fall (v26) inward | ×1.03 at 6 s, ×1.10 at 9 s |
| 5.70 → 6.30 | −7.0 → −5.8 | the cursor wakes and glides onto the card; **click on the card** (ding); the selection brackets step in (4 × 32nd) | |
| 7.30 | −3.6 | voice 3 "INITIATING PLAYBACK" | |
| 8.28 → 8.94 | | the cursor glides to play | |
| **9.00** | 0 | **play click**: the beat starts; the hook and console lines leave on the v25 spring | the fall hands its speed to the push |
| 9.00 → 10.875 | 0 → 4 | the drop push through the cover (unchanged) | ln z = lerp(fall, ln z_max, push) |
| 10.875 | 4 | **match cut** into the lab on the same cover; dolly out; windows spring in (v25) | unchanged |
| … | | visits: wide → window → wide (v26) | |
| 33.6 → 34.8 | 52.5 → 55 | CLOSE PROJECT? types; the cursor clicks × | |
| **34.78 → 39.0** | 55 → 64 | **the outro zoom into the hero cover** (9 beats, Tukey); the cover dissolves into frame 0 between 5 % and 35 % of the move | speed 0 → cruise → 0 |
| **38.98** (last frame) | 63.97 | **= frame 0** (drawn directly) | speed 0 |

The 16:9 timing is the same. Frame 0 is ×5.31 (the cover band fills the wide frame), ×1.39 at 3 s, with the apex at 4.14 s.

Voice timing (`voice.ats` 1.4 / 3.9 / 7.3 s, `VOICE_ATS` / `VOICE_DURS`) is **unchanged**: no spoken moment moved. `PRE_S` is unchanged.

---

## 3. The mirror maths

### The outro (v25, one change)

ln z(u) = ln z_A + e(u) · ln(z_E / z_A), with e = tukey(u) and u = (t − (end − ZD)) / ZD. The position follows the fixed point of the start and end framings.

Change in v27: the move now ends **on the last frame**, not one beat before it. There is no more frozen hold.

- ZD = min(9 beats, PRE / 2) = 4.22 s at 128 BPM. At 128 BPM it still starts exactly on the × click (end − 9 beats = RWB − 3).
- The 9-beat window is 12 % longer than the v25 8-beat window, with the same curve and the same feel.
- The last frame (b ≥ end − 0.75 frame) is frame 0, drawn directly. Every earlier frame shows frame 0 through the portal.

### The intro

τ_c = comp seconds; u = τ_c / ZD.

    f(t)   = ln z0 · (1 − tukey(u)) + fall(t)        fall = v26: A · (τ − sin πτ / π), τ over [frame 0, the cut]
    ln Z(t) = f(t) − f(t_a)                          t_a = argmin f (golden-section search, deterministic)
    world:  ln z = lerp(ln Z, ln z_max, push)        (the drop push, unchanged)
    player: ln z_P = lerp(t < t_a ? ln Z : 0, ln z_max, push)

- z0 = 1.06 · max(c_x, W − c_x, c_y, H − c_y) / (cover / 2): the cover fills the frame with its centre where it rests. That is 3.65 in 9:16 and 5.36 in 16:9; after the apex offset, ×3.60 and ×5.31.
- **The mirror:** 1 − tukey(u) = tukey(1 − u). So the intro's zoom-out is the outro's progress curve run backwards, over the same ZD. Both speeds are 0 at the seam, and so are both accelerations (the Tukey taper is a half-cosine of speed).
- **The cover centre is fixed on screen** for the whole intro: the pivot is (c_x, c_y) until the push glides it to the frame centre (v13).
- **The depth differs.** The intro covers ln 3.6 = 1.28 (peak speed 0.44 ln/s in 9:16). The outro covers the lab cover's ln 7.1 = 1.96 (0.66 ln/s), because the lab's cover is smaller in frame than the card. Same curve, same duration, same speed profile, scaled by the depth of each world.
- **The turnaround.** fall′ > 0 and the zoom-out's speed decays to 0, so f′ crosses 0 once, with non-zero acceleration. That makes it a smooth ballistic turn, not a park. Subtracting f(t_a) puts the turn exactly on z = 1. The player docks there: the world speed is 0 at t_a, so the player's speed is continuous (0) across the dock.
- **Motion blur.** The radial streak now uses |Δ ln z| over 0.9 frame. The zoom-out blurs like the outro: the copies are the larger sub-frames it just left, so they only scale up, with no dark edge.

### The springs and the push

Unchanged (v25 / v26). At the play click, the push still picks up the fall's speed: d ln z/dt is continuous. At push = 1, ln z = ln z_max, so the match cut is pixel-identical.

---

## 4. Options and sheet keys

- **`intro.coverFrame`** (meaning kept): the hook card is fully there on frame 0, on top of the full-bleed cover. On, frame 0 is cover + hook: the best thumbnail for platforms that use frame 0. Off, frame 0 is the clean cover poster and the hook rises at 0.25 s. The loop closes either way (seam 0.08 both ways), because the outro's portal is frame 0 itself.
- **`intro.fall`** still scales the fall. 0 gives a pure zoom-out that parks on the player and then holds until the push.
- **The mirror is on** for the player look's sphere intro with a pre-roll whose `intro.pick` has no flight (one key ≥ 1 at frame 0). This is what the generator writes now. Old sheets with a pick flight keep the v26 intro.
- **Generator** (`cues/generate.js`):
  - `INTRO_S = { out: 4.22, press: 5.7, pick: 6.3 }` (`press` / `pick` also drive the Voice lab's markers);
  - `intro.yaw` is one linear spin to the cut;
  - `intro.pitch`, `intro.pick` and `intro.type` are single keys (0, 1, 1);
  - `intro.select` sits at `INTRO_S.pick`.
- **Native renderer** (`motion/render.mjs`, copied to `/home/user/u2c-motion-v14/render.mjs`):
  - the click list reads the card click from `intro.select` key 0 when `intro.pick` has no flight (the legacy press / release / pick otherwise);
  - the ding sits on that click;
  - there is no card-title typing or clink.
- **Web export** (`film.js`): `clickTimes()`, `typeEvents()` and `introMarks().pick` follow the same rule.

Also fixed: the player's "next" transport icon. A mid-line `//` comment in v26 had swallowed its draw call.

---

## 5. Checks

Stills (native): `/home/user/research/review-intro27/player-nigredo-9x16/` and `player-nigredo-16x9/`, with contact sheets `cs-9x16.jpg` and `cs-16x9.jpg`.

| still | what it shows |
| --- | --- |
| 0.00 | the full-bleed cover poster |
| 0.75 / 1.5 | the hook typing over the cover as it pulls back |
| 2.25 | the card's caption in |
| 3.0 | the player rising in |
| 3.75 / 4.5 | the player screen |
| 6.4 | the brackets after the card click |
| 9.6 | playing, hook gone, push |
| 10.4 / 11.2 | the match cut / lab |
| 14.8 | a waveform visit |
| 34.6 | CLOSE PROJECT? |
| 36 / 37.5 / 38.5 | the outro zoom with the cover dissolving into frame 0 |
| 38.97 | identical to frame 0 |

Loop seam (browser, 270 × 480, frame 0 against the last frame): **0.08** with `intro.coverFrame` off, **0.08** with it on (v26: 2.82 / 2.78; threshold 6).

Render (native, `u2c.py review`, delivered to `/home/user/beatmaking-visuals/deliver-v14/`):
- 9:16: last − first = **0.46**, against a median frame-to-frame change of 2.00 → **SEAMLESS** (v26: 2.08);
- 16:9: last − first = **0.35**, against a median of 1.78 → **SEAMLESS** (v26: 1.10).

Tests: meters 125/125, smoke 44/44, editor 43/43 (first run, no flakes). No test was changed.
