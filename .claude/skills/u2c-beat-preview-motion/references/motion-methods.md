# Motion methods for code-rendered, audio-reactive U2C videos

Scope: base methods for pro-grade motion design with Claude (HyperFrames first, Remotion/Motion Canvas/GSAP as cross-checks).
Project rules (no fades, grid-locked, screenshot view) stay in `/root/.claude/skills/u2c-beat-preview-motion/SKILL.md`.
Source tags: [HF] local /root/.claude/skills/hyperframes (motion.md, sound.md, review.md); [RM] remotion.dev; [MC] motion-canvas.io;
[GS] gsap.com; [WEB] community/search results (treat numbers as starting points, verify by eye + test). [PHYS] standard mechanics (my derivation).

## 1. Toolchain and the Claude workflow
- **HyperFrames**: HTML/CSS/JS project; the renderer "asks the project for each exact frame", so motion must be a pure function of time
  (paused, seekable GSAP timelines; no rAF/clock/`onUpdate` layout) [hyperframes.heygen.com/introduction][HF]. Pre-compute physics/audio into
  arrays indexed by frame. Verify with `npx hyperframes check`, `snapshot --at t,.. / --range`, `keyframes --shot`, and assertions in
  `<name>.motion.json` (`appearsBy`, `before`, `staysInFrame`, `keepsMoving`) [HF motion.md]. Use `catalog` blocks before hand-building glitch/CRT/grain.
- **Remotion**: React; everything derives from `useCurrentFrame()`+`useVideoConfig()` [RM]. `spring({frame,fps,config:{damping,mass,stiffness,overshootClamping},delay,durationInFrames})`
  (defaults mass 1, damping 10, stiffness 100; raise damping to kill bounce; `durationInFrames` stretches to an exact length) [remotion.dev/docs/spring].
  `interpolate(frame,[in],[out],{extrapolateLeft/Right:'clamp',easing:Easing.bezier(...)|[per-segment array],posterize:n})`; `posterize` steps motion every n frames
  (good for "on the beat" ticks); multi-keyframe ranges for in-hold-out [remotion.dev/docs/interpolate]. `TransitionSeries`: transitions overlap and shorten total
  (40+60-30=70 f); a transition may not exceed adjacent scenes; no adjacent transitions; `Overlay` (flash/light-leak) is centred on the cut and does not change timing
  [remotion.dev/docs/transitions/transitionseries]. Audio: `useAudioData`/`useWindowedAudioData` (WAV only, windowed), `visualizeAudio({fps,frame,audioData,numberOfSamples})`
  returns spectrum per frame, `visualizeAudioWaveform` for waveforms [remotion.dev/docs/audio/visualization]. Remotion's docs do not cover smoothing/onsets: do that offline (section 4).
- **Motion Canvas**: generator timelines (`yield*`, `all()`, tweens with duration) and named `waitUntil('event')`/`useDuration('event')` time events draggable in an editor [MC quickstart, time-events].
  Best for voice-over-synced vector explainers; for beat work, create the events from the beat grid instead of dragging.
- **GSAP**: `power1-4`, `expo`, `back`, `elastic`, `bounce`, `circ`, `sine`, `steps`; `CustomEase`, `CustomBounce`, `CustomWiggle` are separate plugins [gsap.com/docs/v3/Eases]. Default is `power1.out`.
  Build on one paused master timeline; use absolute beat times (`tl.to(el,{..},beatToSec(n))`), not relative `+=` chains, so edits cannot drift.
- **Claude workflow that works** [WEB tella.com/blog/how-to-use-remotion-agent-skills-with-claude-code, remotion-dev/skills `remotion-best-practices`; HF story/storyboard/review.md]:
  1. Format first (res, fps, duration, BPM); name the skill explicitly. 2. Storyboard as a table (beat range | shot | hero | motion | audio driver) before code.
  3. Build shot by shot as modular components; keep preview running. 4. Render stills at exact beats (downbeat, mid-hold, landing frame, peak of each event)
  and *look at them*. 5. Render the cut; run automated QA (cuts-on-grid, palette, element budget). 6. Director notes pass: write "too fast / flat / noisy" notes as concrete
  parameter changes (HF table: "too fast" = 0.7x every move). 7. Iterate small prompts; never re-prompt the whole video.

## 2. Motion principles applied to HUD/UI graphics
**Easing by role** [HF motion.md; WEB UI-animation guides]
| Role | Curve | Notes |
|---|---|---|
| Arrival / snap-in | `expo.out`, `power4.out` (long tail) | landing takes longer than leaving; exact landing, no overshoot for UI |
| Camera move, colour flood, panel swap | `power2.inOut` | eases both ways |
| Exit / zoom-through / accelerate away | `power3.in` | exits 40-50% shorter than entrances |
| Rotation, progress, scrolling data | linear | only where constant speed is the point |
| Physical/organic (chain, pendant, needle) | simulated spring or pendulum | never an ease; damping ratio 0.7-0.85 premium, 0.4-0.6 playful, <0.3 cartoon |
Position/size may overshoot; **opacity and colour never bounce**. Same `power2.out` 0.5 s on everything = "generated" look.
**Timing hierarchy**: hero event 0.3-0.6 s; secondary 0.15-0.3 s; micro (labels, ticks) 1-4 frames. Duration scales with distance and importance. Stagger: letters 1 frame, words 60-120 ms, list items 40-80 ms.
Overlap: start the next element when the previous is 30-50% done (full sequence = robotic, all at once = cheap) [HF].
**Anticipation**: 2-4 frames of counter-move (or a 1-frame dark/dim "dip") before a hard hit, e.g. a meter needle backs off 3% before a drop slam; for cut-on-beat the
anticipation lives in the *previous* beat so the impact frame lands exactly on the downbeat. **Follow-through/overlap**: parts settle at different times (frame, then label, then connector, 2-3 frames apart) [WEB].
**Staging**: one hero per frame, everything else subordinate (also the skill's element budget); a landed title is dead still, motion moves to the next element [HF].
**Arcs**: pointer/needle/pendulum paths are arcs; UI slides stay orthogonal (right-angle connectors) but whips may carry a slight curve. **Secondary action**: a hit on the hero triggers
a small reaction in one other element (a label tick, a LED, a grain pulse), at <=30% of the hero's amplitude and 1-3 frames later.
**Avoid** (looks generated) [HF]: breathing/pulsing loops as filler, creeping scale after landing, bounce on UI, same entrance for every scene, fade-and-slide-up everywhere.
**Camera language for UI** (screenshot view allows only stepped moves): wide establishing shot (whole lab OS, 1-2 bars, everything legible in 1 s) -> push-in to ONE window
(stepped scale 1.0 -> 1.6-2.2 on a bar line, 0.3-0.5 s `power2.inOut` or hard punch-in with 6-12 px blur peaking at the fastest frame) -> hold while that window "acts" ->
return (hard cut back or mirrored `power3.in` move). Cut at the fastest frame of a move; match direction and speed across the seam [HF]. Transitions with a cause: zoom-through a button,
object-becomes-world, whip 0.13-0.3 s, colour flood 0.4 s, dip cut (-40% for 3 frames); 3-5 kinds per film, at most a third of seams are hard cuts (HF default; U2C brief makes hard cut the default).
**Cut-on-beat rules**: compute beat frame from index `round(i*fps*60/BPM)` (never accumulate a rounded beat: 2 frames drift per 32 beats at 128 BPM/30 fps) [HF];
shot change on bar lines, layout change on bar, element events on beats/half-beats; cut on the onset *frame* (the frame where energy first rises), not 1-2 frames after; the incoming shot's
first frame is finished. For the drop: bar before = pull-back/quiet (anticipation), drop downbeat = hardest cut + biggest meter slam, then 1 beat of hold (hold 0.3-0.75 s before payoff) [HF].
Rhythm: contrast speeds (montage 0.13-0.8 s cuts vs a hold of several seconds) [HF].

## 3. Audio-reactive mapping
**Pipeline**: offline analysis (librosa/numpy/ffmpeg) -> JSON per-frame arrays + onset list -> deterministic render reads arrays by frame index. Never analyse live in the page. Analysis hop <= 1 frame (at 30 fps ~ 33 ms; use hop 512 @ 44.1k ~ 11.6 ms then resample).
**Features -> parameters**
| Feature | How | Drives |
|---|---|---|
| Onset strength / spectral flux | half-wave-rectified flux, peak-pick with local-mean threshold, backtrack each onset to the nearest earlier energy minimum so hits are not late (librosa onset docs, Web-Onset) | triggers: impulses, cuts, flashes, step-ticks (events, not continuous) |
| Per-band envelope (sub 20-60, bass 60-200, low-mid, mid, high) | band energy in dB -> normalise by per-track percentile (5-95) -> asymmetric one-pole follower | meter bars, glow, chain impulse amplitude |
| RMS / LUFS-short | 300 ms-ish window | slow global energy: grain, bloom, background density; section detection |
| Spectral centroid / flatness | smoothed heavily (>=150 ms) | colour temperature inside the stage palette, hi-hat shimmer |
| Beat phase `phi=(t/beat) mod 1` | from the grid, not from audio | anticipation ramps, decay `exp(-k*phi)` after each beat, pendulum pumping, scanline/clock motion |
**Envelope follower (attack/release)**: `y += (x>y ? a_att : a_rel)*(x-y)`, `a = 1-exp(-dt/tau)`. Starting points: attack 5-20 ms (kick) to 50 ms (default, FastLED), release 120-300 ms (200 ms default);
peak-hold lines hold 0.5-1 s then fall 12-20 dB/s; meters keep real ballistics but numerals tick on beat/half-beat. Add a silence gate. Since release is time-based, compute `a` from dt so fps changes do not change feel.
**Avoid jitter**: (1) normalise to a perceptual range (dB, then 0-1 clamp) not linear amplitude; (2) asymmetric smoothing, never symmetric moving average on a hit (it delays the attack);
(3) hysteresis/Schmitt thresholds for on/off states (on at 0.6, off at 0.45); (4) minimum re-trigger gap (>= 1/8 beat); (5) median-of-3 pre-filter on noisy bands; (6) quantise *displayed numbers*
(posterize) but not geometry; (7) use per-pixel scale limits: a reactor should move <= 2-6% of its size so it reads as pulse not shake; (8) never map to rotation/position of text (use bars, glow, ticks).
**Hierarchy**: ONE primary reactor per shot (the hero meter or the chain impulse, large amplitude, fast attack); 1-2 secondary reactors (glow, label tick, background grain) at <=30% amplitude with slower release;
everything else is *static or beat-grid driven*. If everything pumps to the kick nothing is the kick.
**Anticipation by pre-computed onsets** (the unfair advantage of offline render): look ahead `n` frames in the onset list and start the counter-move/dim/suck-in `2-4` frames before the hit;
pre-build envelopes with a *negative-latency* attack (start rising `t_attack` before the onset) so the visual peak, not the visual start, coincides with the transient. Snap onsets to the beat grid if within 1/16 beat (the grid is the truth for cuts, the audio for continuous values).
**Sound design for sync** [HF sound.md]: put SFX/whoosh 1-2 frames *before* the visual impact; check the mixed track with the muted-watch test.

## 4. Pendulum / chain / pendant done well
**Maths** [PHYS]: `theta'' = -(g/L) sin(theta) - c*theta' + u(t)`; small-angle period `T=2*pi*sqrt(L/g)`, large-angle `T ~ T0(1+theta0^2/16)` (theta0 in rad; 30 deg adds ~1.7%, 60 deg ~7%).
Extended body (elephant on a bail) is a physical pendulum: `T=2*pi*sqrt(I/(m*g*d))`, d = pivot-to-centre-of-mass. Integrate with semi-implicit Euler/Verlet at fixed substeps (e.g. 240 Hz), seeded.
Visual gravity can be fudged: pick `L` or `g` so that `T = 2 beats` (`L = g*(T/2pi)^2`; 128 BPM -> T 0.9375 s -> 0.218 m at real g). Then **the extremes of the swing (turn-around points) fall on every beat**
(half period = 1 beat) and the bottom crossings on the off-beats; the eye reads the stop as the "hit". Alternatively T = 4 beats (1 bar) for a slow, heavy sway with extremes on beats 1 and 3.
**Driving it on the beat**: a swing is pumped by a push in the direction of motion near the bottom (max speed) = half-beat offsets. Practical recipe: on each kick, add angular velocity
`dtheta += s * sign(-theta)` (toward the centre/next swing) with `s` scaled by the kick band envelope; bigger on the downbeat; cap amplitude (<= 25-35 deg); low damping (0.985/frame) so it carries.
Verify numerically: sample the sim, assert turn-around frames are within 1 frame of the beat grid (add to tests). If drift: nudge `L` by a few percent, not the impulse timing.
**Chain = overlapping action made physical** [WEB Animation Mentor, School of Motion]: *drag* (each link lags its parent) and *follow-through* (links keep moving after the base stops), with successive breaking of joints.
Hand-animated equivalent: offset each link's rotation curve by 1-3 frames per link and reduce amplitude ~5-10% per link, peak the tail a few frames after the base stops. Preferred here: PBD/Verlet chain
(8-14 links, fixed lengths, per-link angle limit ~35 deg, small per-link damping, heavier pendant mass at the end so the tail whips with authority).
**Making the pendant look natural**: (a) pendant is a rigid body with its own angle that lags the last link by 1-2 frames and may twist +-8 deg about the vertical (secondary action); (b) its centre of mass sits below the pivot, so it
rotates *with* the swing but hangs back on direction change (overshoot then settle: follow-through); (c) tiny noise on the anchor (0.2-0.5 px, seeded, low-passed) prevents mechanical perfection but must not be audible as jitter;
(d) a shadow/rim-light that tracks angle sells weight (light-side highlight shifts with theta); (e) motion blur on the fast part of the swing (HyperFrames `data-motion-blur="on"`, or a blur proportional to angular speed, peaking at the bottom);
(f) never a keyframed sine, never a constant-amplitude swing: amplitude should grow on the kick and decay between, so energy tracks the music.
**Pro workflow equivalents**: AE Duik/SpringyFX or expression-based drag; Blender/Maya FK chain with offset peaks. We replicate with the deterministic sim and bake angles to a per-frame JSON that HyperFrames reads.

## 5. Checklist to apply on every U2C shot
- [ ] Beat table written; each event has a beat index, role (hero/secondary/micro), curve from section 2.
- [ ] Anticipation frames placed in the previous beat for every hit >= 20% amplitude.
- [ ] Primary reactor identified; secondaries <= 30% amplitude; envelopes use attack/release from dt.
- [ ] Pendant extremes land on beats (test), amplitude follows kick envelope, caps respected.
- [ ] Stills at downbeat/landing/peak inspected; muted watch and 0.25x watch done.

## Sources
- HyperFrames docs https://hyperframes.heygen.com/introduction ; local /root/.claude/skills/hyperframes/references/{motion,sound,review,storyboard}.md
- Remotion: https://www.remotion.dev/docs/audio/visualization , /docs/spring , /docs/interpolate , /docs/transitions/transitionseries
- Motion Canvas: https://motion-canvas.io/docs/quickstart , /docs/time-events ; https://github.com/motion-canvas/motion-canvas
- GSAP eases: https://gsap.com/docs/v3/Eases/
- Claude+Remotion workflow: https://www.tella.com/blog/how-to-use-remotion-agent-skills-with-claude-code ; https://github.com/remotion-dev/skills
- Audio features: https://librosa.org/doc/dev/api/onset.html ; https://github.com/Keavon/Web-Onset ; https://fastled.io/docs/df/d68/classfl_1_1audio_1_1_spectral_flux_detector.html ; https://apatero.com/blog/audio-reactive-video-generation-complete-guide-2025
- UI principles: https://help.figma.com/hc/en-us/articles/41238219562007 ; https://blog.marvelapp.com/disneys-motion-principles-in-designing-interface-animations/ ; https://www.motiontheagency.com/blog/principles-of-ui-animation
- Chains/overlap: https://www.animationmentor.com/?p=4645 ; https://schoolofmotion.com/blog/follow-through-tutorial ; https://aescripts.com/learn/create-a-dynamic-rope-in-after-effects-using-springy-fx-duik
