# v8 director notes, pass 2 (final). Renders out/v8/<look>-<stage>-916-30s.mp4, filmstrips out/v8/filmstrips/*-beatstrip.png
Pass-1 fixes landed: frame 0 is a lab at work (logo, session, clock, bands and the swinging pendant from frame 0); the
clock stamp sits on the dial; the EQ bubble parks opposite its node; focus pushes stay inside the bench.

Pass-2 notes, applied before the final renders:
1. **Boot terminal** covered the pendant. It now parks over the column whose meters are still stepping in
   (exe/scope: eq + spectrum, lab: spectrum + eq). The full title types out: `> load EXP-03 "ATELMANSION 3"`.
2. **Scope beam** read as a zigzag (1 beat at 2.5 ms columns). Timebase now 11.7 ms/div (1/4 beat) with the min/max
   envelope linearly interpolated and a centre beam: the 808 reads as a clean wave behind the chain.
3. **Spectrogram** bar numbers collided with "now": numbers stop 80 px short of the edge.

Against v6 (out/v6/filmstrips/nigredo-916-30s-filmstrip.png): same density (9-10 live windows, tags, notes, stamps,
crossed readings), plus window chrome, wires with signal dots, an attention bracket stepping on the beat, a pro EQ,
a Kollide loudness gauge, a sample-accurate session, a CRT look and a true-grey NIGREDO. Every label >= 22 px at
1080 w. Three focus pushes per 30 s instead of a camera move every bar.

QA (tests/qa_video.py) on all five: changes on the 32nd grid; NIGREDO grey max |R-G|,|G-B| = 0. "Fade" warnings
(4-6 frame luma ramps) are the 1-beat focus pushes and the chain threading in link by link on 32nds, not fades.
Ink coverage 12-18 % median (above the minimalist 15 % budget on exe on purpose: v8 must be as rich as v6).
Sync test: max 0.5 frame on all five. Pendant trace: extremes within 0.96 frame of every beat.
