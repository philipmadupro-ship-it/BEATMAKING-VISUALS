# MOTION v25: window reveals and the infinite-zoom ending

Two moves changed in the player look. The beat-driven parts (kick punch, glow, meters, Matrix drift) are untouched.
Both moves are pure functions of time, the cue sheet and the seed, in `web-app/src/v8/film.js`.

Numbers below are at 128 BPM: 1 beat = 0.469 s, a 16th = 117 ms, a 32nd = 58.6 ms.
The example is a 30 s clip: 64 beats, with 9 s of pre-roll.

---

## 1. Window reveals after the intro push

### Before
Each panel opened in 6 counted steps (one per 16th, about 0.7 s):

1. a top hairline;
2. the outline;
3. the glass;
4. a content wipe in thirds.

The rings were 1/4 beat apart, so the dashboard took about 1.2 s to build. You could see every step: the panels popped instead of moving.

### Now (`reveal()`, `card()`)
Every panel runs on two springs, a container spring and then a content spring.

| what | curve | timing |
| --- | --- | --- |
| container: scale 0.96 → 1 about the panel centre, and opacity 0 → 1 | critically damped spring, ω = 30 rad/s | 99 % at 0.22 s |
| content: label, traffic lights and the live meter, opacity 0 → 1 | the same spring | starts one 32nd (58.6 ms) after the container |
| stagger, centre-out by distance from the hero | ring 1 starts one 16th after the cut, then +1 32nd per ring (capped at 4 rings) | starts at +117, +176, +234 and +293 ms |
| whole dashboard | | first start → last panel settled = 176 + 58.6 + 220 ≈ **455 ms** (< 500 ms) |

**Spring maths.** The critically damped step response is

x(τ) = 1 − (1 + ωτ)·e^(−ωτ)

It is normalised so that it lands exactly on 1 at τ = 6.64/ω, where it is already 99 %. That leaves no endless tail.

- The velocity is 0 at the start, so nothing jumps.
- There is no overshoot (ζ = 1): the glass never bounces. "Bouncy overshoot on glass" is banned.
- The motion is closed-form, so any frame can be rendered alone. This keeps the renderer deterministic and seekable.

**Why it reads better:**
- **Centre-out stagger.** The eye is already on the hero card, because the intro push ends on it. The motion then spreads outward from where you are looking, like a ripple, instead of starting somewhere random.
- **40–60 ms steps.** Below about 40 ms, the panels merge into a single "flash". Above about 80 ms, the stagger reads as a slow cascade you wait for. 58.6 ms is the 32nd note, so the stagger is on the beat grid, and the sync test keeps it there.
- **Container before content.** The frame establishes the space first, and then the data fills it. This is the order a real app loads in, so it feels believable rather than decorative.
- **Scale 0.96 → 1.** A 4 % scale is enough to feel like depth (the panel arrives from slightly behind), without the glass "zooming" at you.
- **Under 0.5 s in total.** The dashboard is complete while the camera's dolly-out from the cover is still settling (the dolly lasts 3 beats = 1.4 s). The reveal rides the camera move and never competes with it.

**Implementation note.** The meter bodies set their own `globalAlpha`, so an outer alpha would not hold. During a reveal, the container and the content are each drawn into an offscreen layer and composited with the spring opacity. The scale is applied in world space, so the result stays crisp. Once a panel has settled, it draws exactly as before, with no layer.

The `win.<id>.visible` keys use the same springs: the content leaves first, then the container. Other looks (exe, lab, scope) keep their stepped hard reveals, which is their style.

`schedule()` now lists `reveal <id> container (spring start)` and `reveal <id> content (spring start)`, both on the 32nd grid.

---

## 2. Infinite-zoom ending (loop)

### Before
1. The CLOSE PROJECT? dialog, and the × click.
2. A dolly into the hero cover (3 beats).
3. A **cut** to the intro's pushed-in card.
4. A zoom out (3 beats).
5. The card flies back into the sphere (2 beats).

That is three moves and a cut, and the zoom changed direction twice.

### Now (`outroZoom()`, `zoomState()`, `frame0()`, `portal()`)
The dialog and the × click stay exactly as before:
- the dialog runs 5.5 → 3 beats before RWB, where RWB = end − 6 beats;
- the × click lands 3 beats before RWB (beat 55 of 64).

From that click, **one continuous exponential zoom** goes into the hero cover:

| beats (30 s clip) | seconds (composition) | what |
| --- | --- | --- |
| 52.5 → 55 | 33.6 → 34.8 | CLOSE PROJECT? types out; the cursor clicks × |
| 55 → 55.5 | 34.8 → 35.0 | the dialog shrinks away while the zoom starts at zero speed |
| 55 → 63 (8 beats) | 34.8 → 38.5 (3.75 s) | the zoom into the cover; the cover cross-dissolves to frame 0 between 5 % and 35 % of the move |
| 63 → 64 | 38.5 → 39.0 | frame 0, drawn directly, with the sphere already spinning |

**The portal.**
- The frame-0 image (the intro sphere at frame-0 time, plus the cover-frame hook card when `intro.coverFrame` is on) is rendered offscreen at full resolution.
- It is drawn into the cover as a rect with the screen's aspect ratio, contain-fitted and centred. The rest of the card goes to the ground colour, with a soft edge that shrinks to 0 as the zoom lands.
- The camera's end framing makes that rect fill the screen exactly, so the cover **is** frame 0 when the zoom lands.
- Portal size: 146 × 260 inside the 984 × 260 card in 9:16, which is a ×7.1 zoom. In 16:9 it is 568 × 320, a ×1.5 zoom.

**Zoom maths.**
- Scale is exponential: z(u) = z_A · (z_E / z_A)^e(u), which is the same as ln z = ln z_A + e(u) · ln(z_E / z_A).
- The camera position follows the **fixed point** of the start and end framings, as in the v23 one-form camera: w = (1/z − 1/z_A)/(1/z_E − 1/z_A). The cover centre (the self-similar point) therefore stays put on screen while everything scales around it.
- The progress e(u) is the integral of a **Tukey window** (taper 0.3):
  - the speed in log-scale rises on a half-cosine over the first 30 %;
  - it is constant over the middle 40 %;
  - it falls on a half-cosine over the last 30 %;
  - speed and acceleration are continuous and are 0 at both ends;
  - the peak speed is only 1.43 × the mean. Smootherstep's peak is 1.875 × the mean, which makes a lurch in the middle.
- A radial motion blur uses the intro's `streak()` about the fixed point. Its strength is d(ln z) per frame, so it follows the speed curve.
- The halation fades with the zoom (frame 0 has none), so there is no brightness pop at the handover.

**Why an exponential zoom.** Perceived zoom speed is the rate of change of *ratio*, not of size. A screen that doubles every second feels like a constant speed. A linear scale ramp from ×1 to ×7 feels like it accelerates violently at the start and crawls at the end, because the first +1 is a ×2 and the last +1 is a ×1.17. With ln z linear in time, every frame shows the same relative growth: the classic "infinite zoom" or Droste feel. The eased ends (zero speed in and out) make it start from a still frame and land on a still frame. That last still frame is frame 0, which is what makes the loop invisible.

**Why it replaces the cut.** One direction of travel, one move, no cut. The viewer falls into the cover, and the cover is where the video started. The loop becomes a story beat ("we went back into the project") rather than a rewind.

**Loop seam.**
- During the zoom and the hold, the sphere inside the portal spins at its frame-0 yaw speed, offset so that it reaches the frame-0 angle at the seam. The last frame is one frame of spin before frame 0, so the motion carries straight across the loop instead of freezing.
- The cursor glides back to its rest point as before.
- The editorial ground is drawn at composition time 0 (drift offset 0).
- Measured in the browser at 270 × 480, frame 0 against the last frame: **2.80** with `intro.coverFrame` off, **2.76** with it on. The threshold is 6; it was 1.9 when the old ending held an exact duplicate of frame 0.

**Unchanged:**
- The full-beat `stop` ending (STOPB, which has no rewind).
- The old `outro.mode = rewind` path, which keeps its mirror dolly.
- `intro.coverFrame`: the hook card is part of the portal image, so it is visible inside the cover during the zoom and fully there on the last frame.
- Click and SFX timings: the × click and the dialog sounds in `motion/render.mjs` have not moved.
