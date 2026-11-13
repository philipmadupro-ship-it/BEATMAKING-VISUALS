# v7 director notes, pass 1 (against the u2c-beat-preview-motion QA checklist)
Renders: out/v7/passes/*-pass1.mp4. Filmstrips: out/v7/filmstrips/*-pass1-filmstrip.png. QA: tests/qa_video.py.

QA passed:
- No fade ramps longer than 2 frames.
- NIGREDO is pure grey, max |R−G|,|G−B| = 0.
- Ink coverage has a median of 3.6 to 5.3 %.
- Cuts land on bar lines (within ½ frame).
- Sync test max 0.5 frame.

1. **Hero words are too small.** CARVE, SPEC and M / S fill about 40 % of the width. Scale them to 60 % (the rule is 55 to 70 %) and land them with the per-letter decode on 16ths.
2. **LAB reads as EXE on graph paper.** Give LAB its own logic:
   - Home becomes a **patch bay**: the logo is the hero, with two small node windows (`in.wav` with live peaks, `out.lufs` with numeric cells). Hairline cables plug into anchor points on the chain links. One square signal dot steps along each cable on 16ths.
   - Meter shots become **specimen cards**: a stencil title, a specimen code, tape at two corners, and one handwritten note.
3. **SCOPE micro label.** "home // nigredo" is a code name. Replace it with `> u2c.exe // chain in` / `chain out`.
4. **QA tool.** The scene threshold of 0.3 misses cuts on dark frames. Use 0.08.
