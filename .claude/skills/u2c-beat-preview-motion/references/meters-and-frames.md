# Non-EQ meters: "frames" styling (after Kollide noteframe) plus vagosrose panels
Sources: the user's screenshots `/home/user/u2c-visualizer/refs/ref-lab-nodes.webp`, `ref-exe.webp` and `ref-handset.webp` (the Kollide "Master", "Cutter", "Exe" and "Lab nodes" looks), and vagosrose Shorts covers (`/home/user/research/vagosrose-analysis/`). The styling here is our own interpretation. Do not reproduce Kollide's looks one-to-one.

## Panel anatomy (applies to every meter)
- Ground: the stage ground. Frame: a 1 px hairline at 22 to 30% ink, with square corners (or 2 px radius at most).
- **Header strip:** a 2 px rule across the panel at the top, then a wide-tracked (letter-spacing about 0.18 em) bold mono line, `BEAT · F MIN · 128`. A tiny `×` or square glyph sits at the right. A mono micro "file name" sits above the rule (`atelmansion_3.wav`).
- **Numeric cells:** a row of 4 equal boxes with 1 px hairlines and 6 px gaps. Each has a label top-left (micro mono, 50% ink, lowercase) and a value bottom-right (mono, 100% ink, tabular figures). Example: `peak −1.0 · lufs −14.0 · lra 6.2 · bpm 128.0`.
- **Accent rule:** the stage accent appears only for the **over-threshold segments, the playhead, rec/armed and the one highlighted value**. At most one accent area per panel.
- Buttons and toggles (decorative): outlined hairline pills with a ▪ glyph and a micro label. One of them may be accent-filled (REC).

## Meter types
1. **Segmented arc gauge (LUFS-S or a level).**
   - A 270° arc of radial ticks, 2 px wide each, about 72 to 96 ticks. A lit tick is 100% ink and an unlit one 18%. Ticks over the target (−14 LUFS +1) are lit in the accent.
   - An inner thin ring and a big central readout (`−14.2`) in mono, at about 18% of the gauge diameter, with the unit below in micro.
   - Two small sub-gauges (M and I, or L and R) sit below the main one at about 22% of its size.
   - Ticks light **per display tick on the ½ beat**. Values come from the measured ballistic meter.
2. **Waveform strip ("Cutter").**
   - Played region at 90% ink, unplayed region at 35% ink.
   - A **single 2 px accent playhead**. Bar numbers sit on a ruler above it, and segment tabs (intro, groove, drop) sit as hairline boxes, the active one filled with ink.
   - Under it there is an onset lane (kick, snare and hat as 1 px dashes) and a small RMS line graph.
3. **Horizontal bar meters (band energy).** 4 to 6 rows, each with a label left, a bar (6 px tall), and a value right. One bar (the loudest band right now) is drawn in the accent.
4. **Odometer / counter** (`000128`, bar:beat `017.3`). Hairline digit boxes. Digits change by a **hard step** on the beat (no roll), with an optional 2-frame vertical slide.
5. **Clock:** a big mono `00:00.00`, as in the Exe look, ticking frame-accurately. Put it in the bottom third.

## vagosrose-style window (for DAW/plugin screenshots)
- A window with a 1 px frame and a solid ink title bar (or an inverted one) holding a mono lowercase filename (`u2c_lab.exe`, `chain_rig.vst`), plus tiny window-control squares on the right.
- Contents are greyscale. The waveform is plain peaks. A single accent selection rectangle marks the region being "processed".
- It connects to the hero word by a **dashed 1 px connector** (dash 4 / gap 3) with 5 px square terminals, routed at right angles with 6 px corner radii.
- A step tag: an accent square holding a number (`1`), next to a hairline box with an UPPERCASE condensed instruction (`PITCH DOWN FORMANT_`, `CHAIN IN_`). The trailing underscore can blink on the beat (a hard on/off).

## Budget per meter shot
One panel (at full width), one hero word at most, one connector, 2 to 4 micro labels, and one accent area. Static composition. Hold it for 1 to 2 bars, then cut back to the logo chain.
