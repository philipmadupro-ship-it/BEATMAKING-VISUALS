---
name: u2c-stage-palettes
description: The four alchemical stage palettes (Nigredo, Albedo, Citrinitas, Rubedo) as used by the U2C looks, their exact colours, the one-accent rule and the Nigredo grey test. Use when choosing/overriding stage colours (stage.* cue paths), adding any coloured element (glow, chain metal, meters), or QA-ing palette compliance.
---
# U2C stage palettes

Code: `web-app/src/v8/core.js STAGES` (+ `stageOf(id, overrides)`), cue paths `stage` and `stage.<bg|paper|card|ink|dim|rule|sig1|sig2|hot|stamp|tape>`.

| stage | ground (bg / paper / card) | ink / dim | accent `hot` (<= 2 % pixels, one element) | extra |
|---|---|---|---|---|
| NIGREDO | #030303 / #060606 / #0b0b0b | #f2f2f2 / #8a8a8a | #ffffff | **R=G=B everywhere**, art greyscaled (Rec.709 x1.12) |
| ALBEDO | #e4dccb / #ece5d5 / #f2ede2 | #1a1917 / #7d776b | iron-oxide #a8432e | paper: glow = accent halo, source-over |
| CITRINITAS | #24170d / #2c1d10 / #352313 | #ecd9b0 / #a58a5e | #e0475f (sig1 ochre #d79a35 carries the brand) | |
| RUBEDO | #1a0d22 / #21102c / #2a1438 | #f1e6f7 / #a98cbf | magenta heat #ff5cc8 (sig1 purple #a35cf0) | oxblood #7a1428 stamps only |
Chain metal (`brand.js METAL`): NIGREDO #d6d6d6/#5e5e5e, ALBEDO #1a1917/#7d776b, CITRINITAS #d79a35/#6e4433, RUBEDO #c08cf5/#5a2d78.

## Rules
- Per frame: one ground, one ink, one accent. New elements take colours from `S` only (never literals), except the tables above.
- Greys may tint toward the stage hue except in Nigredo. Additive glow in Nigredo must use grey sources (it does: tinted art is #d6d6d6).
- Anti-clichés: no stars, serpents, smoke, Latin, occult glyphs, gold gradients, lens flares.

## Grey test (Nigredo)
- Web: smoke row "NIGREDO is greys only (max |R-G|, |G-B|)" must read 0.
- Video: `cd /home/user/u2c-motion && .venv/bin/python tests/qa_video.py out/v9/<mp4> --stage nigredo` -> max(|R-G|,|G-B|) <= 2 on every pixel of frames every 0.5 s (decoded, codec rounding included); ink coverage median <= 15 %.
- Stills quick check: `python3 -c "from PIL import Image;import numpy as n;a=n.asarray(Image.open('f.png').convert('RGB')).astype(int);print(max(abs(a[...,0]-a[...,1]).max(),abs(a[...,1]-a[...,2]).max()))"`.

## Done checklist
- [ ] Colours from `S` / overrides only; accent on one element.
- [ ] Grey test PASS for Nigredo renders; palette ground+ink >= 80 % (qa_video).

## v14: `white` stage ("NIGREDO INVERSE")
Stage id `white` = the Nigredo palette (it keeps `name: 'NIGREDO'`, so every palette lookup is the Nigredo one) with `inverse: true`: film.render inverts the finished frame as the very last pass (`globalCompositeOperation = 'difference'`, white fill, after the HUD, intro, grain and flash), which is the look of the old 1-frame invert flash: white ground, dark ink, cover and elephant as photographic negatives. Greys only, so the grey test (R=G=B) applies to it exactly as to Nigredo (qa_video.py treats `white` like `nigredo`). Selectable in the studio stage picker, the `stage` cue and native `--stage white`; works in exe, lab, scope and player. An fx.flash key inside a white render flips that frame back to dark.
