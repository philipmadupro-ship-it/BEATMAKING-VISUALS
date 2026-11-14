# Assets — how they are made and how to replace them

All brand art lives in `assets/`. Generated files are rebuilt by the scripts in `tools/` (Python 3 + numpy, scipy, Pillow).

| File | What it is | Made by |
|------|------------|---------|
| `u2c-chains-dark.jpg` | Source scan of the U2C chain logo (do not edit) | original art |
| `u2c-links.png` | Clean logo atlas at 2× the scan: metal texture in RGB, clean anti-aliased alpha | `python3 tools/extract_logo.py` |
| `u2c-links-edge.png` | Outline atlas (neon / ghost / rebuild draw-on) from the same clean mask | same |
| `u2c-links.json`, `src/engine/links.js` | Pieces (logo-unit bbox, atlas rect, letter `k`: 0 U, 1 2, 2 C), atlas `scale`, on-metal `anchors` | same |
| `elephant.png` | Elephant pendant sprite (700×662). Its own chain's bail knot is at (343, 197) | original art |
| `elephant-limbs.png`, `elephant-warp.json` | Limb mask + 17×17 mesh weights for the procedural warp (0 on the shield, rising on legs/trunk) | `python3 tools/elephant_mask.py` |
| `elephant-anim/manifest.json` | Optional sprite loop slot (empty by default) | you (see below) |

`python3 tools/extract_logo.py --debug <dir>` also writes `logo-labels.png` (every piece coloured by letter), `logo-clean.png`
and `logo-edge.png` so the letter grouping and the cutout can be checked at 2× zoom.

## Dropping in an animated elephant loop (Higgsfield or any image-to-video tool)

When `assets/elephant-anim/manifest.json` lists frames, the app draws those frames instead of the procedural mesh warp
(the chain, swing physics, palette duotone and loop-phase sync all still apply).

1. Generate a short **seamless loop** of the elephant (same pose and framing as `elephant.png`, transparent or keyed
   background, the bail knot on top of the head visible and still). 1–3 s at 12–24 fps is plenty. Keep it subtle:
   legs and trunk sway, shield body still.
2. Export it as PNG frames with alpha, e.g. `ffmpeg -i loop.mov -vf "fps=24,colorkey=0x00ff00:0.3:0.1" assets/elephant-anim/%04d.png`
   (or use a background-removal pass per frame).
3. Write the manifest:

```json
{
  "fps": 24,
  "frames": ["0001.png", "0002.png", "0003.png"],
  "bail": { "x": 343, "y": 197 },
  "width": 700
}
```

- `fps` (required) and `frames` (required, relative to the manifest) define the loop.
- `bail` (optional) is where the chain attaches, in frame pixels. Default: (343, 197) scaled by frame width / 700.
- `width` (optional) is the width the frames are drawn at in sprite units; default 700 (same size as `elephant.png`).

Timing is **loop-phase mapped**: inside an export loop the sprite plays a whole number of cycles per clip loop
(`round(clipLength / spriteLength)`, at least 1), so the last video frame flows into the first. Outside a loop it plays at
its own fps. Frames are cached per palette (duotone applied like the still sprite).

To go back to the procedural warp, set `"frames": []`.
