# v7 director notes, pass 2 (final). Renders out/v7/passes/*-pass2.mp4, copied to out/v7/<look>-<stage>-916-30s.mp4

Pass-1 fixes landed:
- Hero words fill about 60 % of the width.
- LAB has its own logic (patch-bay home with cables plugged into chain links and stepping signal dots; specimen-card meters).
- SCOPE labels name the shot.

QA (`tests/qa_video.py`) passed on all four videos:
- Every detected change sits on the 32nd-note grid within 1 frame. Shot cuts happen only on bar lines, at 0.3 to 0.9 per bar.
- No fade ramps longer than 2 frames.
- Ink coverage has a median of 3.8 to 5.3 %.
- NIGREDO is pure grey (max |R−G|, |G−B| = 0 on decoded frames, ground RGB 4/4/4).

Sync test (`tests/sync_test.py --look …`): max 0.5 frame on all four.

Checklist review, no further changes:
- The logo is home in 9 of 16 bars.
- One hero per frame, at most one secondary, 2 to 4 micro labels at 22 px or more.
- The accent is limited to the step tag, playhead or over-segments.
- The last bar mirrors the boot frame for a clean loop.

Known deviation: LAB keeps one handwritten (Caveat) note per frame as its lab-layer signature, which makes a third type face in that look only.
