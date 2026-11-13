# Storyboards: three variants (15 s, 9:16, 142 BPM, 1 bar = 1.690 s)

The clip runs bars 1–9 (it ends 7/8 into bar 9):
- bar 1: intro (pad + hat build)
- **bar 2: drop** (1.690 s)
- bar 6: break, no kick, 808 octave dive (8.451 s)
- **bar 7: re-drop** (10.141 s)
- end card on the bar-8 snare (12.676 s).

Stills are in `storyboard/<variant>/scene-N.png`, rendered by the real engine (`node tools/stills.mjs storyboard`). Each variant has a contact sheet at `storyboard/<variant>/contact-sheet.png`.

## A · BOOT.SEQ (Charcoal + lilac): **chosen**
| # | Bars | Scene | Camera | Transition in |
|---|------|-------|--------|---------------|
| 1 | 1 | Cold boot: the mono boot log types, the ghost U2C outline sits in chains.dll | Tight on chains.dll (×1.45), creeps to ×1.52, sine | Frame 0 fully drawn |
| 2 | 2–3 | **Drop**: U, 2, C rebuild in pixel blocks on the first three kicks; session.exe and other windows draw on beat by beat | Wide on session + chains; tilts down 160 px across bar 3 | **Hard cut on bar 2** |
| 3 | 4–5 | Elephant.sys: the pendant swings (pendulum 1 bar, kick-pumped), sparkles on snares, cables feed it signal dots | Glide 1.1 s (power2.inOut) down to the elephant, then a slow push in to ×1.22 | Eased glide |
| 4 | 6 | **Break**: the logo dissolves letter by letter to its ghost; everything else dims 50 % | Close-up on the logo (×1.85) pulling out to ×1.72 | **Hard cut on bar 6** |
| 5 | 7–8 | **Re-drop**: the full desktop, U-2-C rebuild on the kicks, all meters live | Wide, then from half a bar a 0.7× push to ×1.12 drifting up toward logo and pendant | **Hard cut on bar 7** |
| 6 | 8.5–9 | End card `release.txt`: *Pendant*, 142 BPM · F# MIN, prod. @uche2crazy, FULL BEAT — LINK IN BIO; desktop dimmed 70 % | Push continues to ×1.16 (sine.out) | Border draw-on, lines on successive half-beats |

## B · SIGNAL.PATH (Rust)
Modelled on Security Factory's node graph. The camera rides the signal from window to window, and each node lights a mono chip (01 SOURCE … 06 SIGN).

| # | Bars | Scene | Camera | Transition |
|---|------|-------|--------|-----------|
| 1 | 1 | Source: playhead macro on session.exe; other nodes dark | ×1.9 on the session's left half, slow creep | Frame 0 |
| 2 | 2 | Signal reaches eq.vst ("02 SHAPE") | Fit eq.vst, gentle push | Hard cut on drop |
| 3 | 3 | spectrum.vst ("03 ANALYSE"), 808 marker | 0.75 s glide that lands on the bar | Glide |
| 4 | 4–5 | Meter row: LUFS, scope, surface ("04 MEASURE") | Glide, then a slow pan meter → surface | Glide |
| 5 | 6 | Break: dot climbs the cable into elephant.sys ("05 PENDANT"); logo dissolves offscreen | Glide up and push in ×1.38 | Glide that arrives on bar 6 |
| 6 | 7–8 | Re-drop on chains.dll ("06 SIGN"), logo rebuilds; then pull back to the whole lit graph | Fit chains, then 1.9 s pull to wide | Hard cut on bar 7 |
| 7 | 8.5–9 | End card | Slow push | Draw-on |

## C · AURORA.DECK (Amethyst)
Aurora-style meter deck. The hero is the folded-light 3D spectral waterfall (slow orbit), with the pendant hanging free over it from the top edge.

| # | Bars | Scene | Camera | Transition |
|---|------|-------|--------|-----------|
| 1 | 1 | Surface macro, low pad ridges | ×1.3 → ×1.4 on the surface | Frame 0 |
| 2 | 2–3 | Drop: the surface erupts, the logo rebuilds below it | Surface + chains, slow push | Hard cut on drop |
| 3 | 4 | Spectrum + spectrogram | 1 s glide | Glide on the bar |
| 4 | 5 | Scope · meters · EQ | 1 s glide | Glide on the bar |
| 5 | 6 | Break: push in on the pendant over the surface, logo dissolves | ×1.0 → ×1.25 | Hard cut on bar 6 |
| 6 | 7–8 | Full deck | Wide, slow push | Hard cut on bar 7 |
| 7 | 8.5–9 | End card | Push | Draw-on |

## Pick: A (BOOT.SEQ)
- **It has a story arc that maps one-to-one onto the music.** Silence boots the OS. The drop rebuilds the logo. The groove belongs to the mascot. The break takes the logo apart. The re-drop reveals the whole machine. The title comes last. Every hard cut sits on a structural bar (2, 6, 7), and the glides sit inside phrases.
- **Both brand heroes get a solo.** The elephant has a full 2-bar push-in. The logo has two lock-ins plus a close-up dissolve, which is the requirement that it "dissolves and rebuilds letter by letter and never breaks".
- **Charcoal + lilac is the calmest and most precise palette.** It reads as an instrument, and the purple elephant pops against it. Rust (B) muddies the purple pendant. In C, the amethyst-on-amethyst deck makes everything fight the elephant.
- **The weak points are fixable.** B is the most elegant concept (Security Factory's hand-offs), but four of its seven scenes are meter close-ups and the logo shows up late. C's 3D surface is the most "Aurora" image, but it dominates the frame and reads busy on a phone.

B and C stay fully renderable: `tools/render.sh B 916 out/b.mp4`.
