# U2C EQ display: an original spec in the Pro-Q spirit
Grammar studied from FabFilter's public Pro-Q 4 help (eqdisplay, analyzer, pianodisplay). **Do not copy** FabFilter's logo, name, exact colours, knob art or panel layout. This spec is our own and takes its colours from the stage palette.

## Layers (back to front)
1. **Panel.** The stage ground. A 1 px hairline frame at 25% ink. A header row in mono micro: `EQ · EXP-03 · TRIAL 128` on the left and `F MIN · 128 BPM` on the right.
2. **Grid.**
   - Vertical lines at 20, 50, 100, 200, 500, 1k, 2k, 5k, 10k and 20k Hz. The lines at 100, 1k and 10k use 18% ink; the others use 7%.
   - Horizontal lines every 6 dB (12 dB in ±30 mode). The 0 dB line uses 30% ink.
   - The log x-axis spans **20 Hz to 30 kHz**, so filters can sit above 20 k.
3. **Analyzer** (behind the curves).
   - Post-EQ spectrum: a fill from 14% ink at the curve to 0% at the floor, plus a 1 px line at 45% ink.
   - Pre-EQ spectrum: a 1 px line at 20% ink, no fill.
   - Measurement: FFT 4096 (8192 for the bass detail shot). **Tilt +4.5 dB/oct about 1 kHz.** Range 90 dB (ruler 0 to −90).
   - Ballistics: attack is instant, release about 20 dB/s, peak-preserving log projection (see aurora-notes).
   - Optional "freeze" max trace: a 1 px dotted line at 30% ink.
4. **Band areas.** Each band's own response is drawn from the 0 dB line. The fill is the band colour at 10% (the **selected band gets 22%**), with a 1 px band-colour edge at 60%.
5. **Summed curve.** The **thickest line on screen**: 3 px at 1080 w (2.5 px at 720), in the stage **ink-hot** colour, with a 6 px under-glow at 12%. Rounded joins. This curve is the identity of the display.
6. **Band nodes.**
   - Circles 14 px wide (18 px when selected), with a 2 px ring in the band colour and a filled centre. The band number (1 to 8) sits inside in 9 px mono, cut out of the fill.
   - A dynamic band adds a short vertical bracket above and below the node showing its dynamic range. The bracket moves with the real gain reduction.
7. **Hover bubble** (one at a time, on the selected node).
   - A rounded 3 px rect at 92% ground with a 1 px ink hairline, offset 16 px above and right of the node, joined to it by a 1 px leader.
   - Three mono rows: `F 63.0 Hz · B1 −12c`, `G +4.5 dB`, `Q 1.20`. HP/LP bands also show slope (`24 dB/oct`).
   - Optionally, mini icon cells for bypass, solo and shape (hairline squares).
8. **Note strip** (piano). A 22 px strip under the ruler, A0 (27.5 Hz) to C8 (4186 Hz), mapped to the **same log x** as the plot.
   - White keys are drawn as a 1 px tick lattice and black keys as filled 60%-height blocks at 30% ink. C octave labels (C1 to C7) are in micro mono.
   - Each band's key is lit in its band colour. The cursor key is lit in the accent.
9. **Rulers.**
   - Left dB ruler (EQ scale, ±3, 6, 12 or 30) uses ink-hot numerals.
   - Right dB ruler (analyzer, 0 to −90) uses 45% ink numerals. The two scales are told apart by tone, not by a second hue.
   - The bottom frequency ruler reads `20 50 100 200 500 1k 2k 5k 10k 20k`.

## Band colours
- Eight bands with hues **derived from the stage**. Use **at most 3 bands visible per shot** for cleanliness.
  - NIGREDO: greys only. Separate bands by **value and dash**: B1 #ffffff solid, B2 #bdbdbd solid, B3 #8a8a8a, B4 #ffffff dashed, and so on.
  - ALBEDO: ink, oxide, ash, umber.
  - CITRINITAS: ochre, brass, cream, tobacco.
  - RUBEDO: purple #a35cf0, magenta #ff5cc8, lilac #c79bf0, oxblood #7a1428.
- **Collision or over** state: a 6 px glow in the stage accent along the overlapping region (the idea comes from the red-glow collision display). Use it at most once per shot.

## Motion (beat-locked)
- Curves never morph freely. Gain and frequency changes are **automation steps on the beat**, and each step eases over 3 to 4 frames (`power3.out`).
- A dynamic band's node and bracket follow the measured band envelope (attack 5 ms, release 120 ms, values from the real audio).
- Bubble: it appears on a beat with a typewriter effect (one row per 16th) and is removed on the beat with a hard cut. No fades.
- "Spectrum grab" moment (optional, once per video): the bands drop to 30%, the analyzer freezes for 1 beat, and the white post line is highlighted. Then cut.

## Hero framing
- In 16:9, the EQ fills 86% of the width. In 9:16, it fills the full width at 38 to 45% of the frame height, centred at y = 46%. Micro labels go above, and one big word ("EQ'D" / "CARVE") goes below if needed.
- It is a static "screenshot" shot with no camera move. It lasts 1 to 2 bars.
