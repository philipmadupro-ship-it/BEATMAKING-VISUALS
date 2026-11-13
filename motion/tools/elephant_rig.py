"""Rig the elephant's OWN chain from the art (no extra chain).

The sprite (700x662) is a pendant hanging from its own chain: a right "hanger" loop runs from the bail on the head
(343,197) up to the top of the chain (346,6), which is the pivot; from the crossing (~215,110) a small top-left loop
and a long bottom-left loop hang off it. We paint soft region masks for those parts, then sample them on a 26x26
vertex mesh. The JS rig rotates every vertex by per-part angles (pendulum about the pivot, body lag about the bail,
loop sway about the crossing) and draws the sprite as textured triangles, so the chain bends and swings while the
art stays the original pixels.

  python3 tools/elephant_rig.py  ->  film/assets/brand/elephant-rig.js (+ --debug PNG of the weights)
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 700, 662
PIVOT = (346, 6); BAIL = (343, 197); CROSS = (214, 112)

def poly_mask(pts, blur):
    m = Image.new("L", (W, H), 0); ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(blur)), np.float32) / 255

# region outlines traced on the 2x gridded zoom of the art (art pixel coordinates)
top_left = [(0, 40), (60, 5), (150, 0), (215, 30), (232, 95), (226, 150), (180, 196), (90, 200), (0, 170)]
bottom_left = [(196, 128), (236, 150), (232, 230), (200, 262), (178, 330), (186, 420), (232, 438), (240, 520),
               (196, 562), (120, 566), (60, 520), (40, 440), (44, 340), (90, 260), (150, 190)]
hanger = [(214, 60), (270, 10), (346, 0), (420, 20), (440, 90), (430, 160), (392, 205), (350, 215), (320, 200),
          (300, 150), (250, 110)]
wTL = poly_mask(top_left, 10)
wBL = poly_mask(bottom_left, 12)
wH = poly_mask(hanger, 10)
# the bottom loop runs behind the shield at its lower end: pin that end to the body so the link never detaches
yy, xx = np.mgrid[0:H, 0:W]
pin = np.clip((np.hypot(xx - 226, yy - 452) - 30) / 70, 0, 1)
wBL *= pin
# hanger weight grows from 0 at the pivot to 1 at the bail (it carries the body's lag)
wH *= np.clip((yy - PIVOT[1]) / (BAIL[1] - PIVOT[1]), 0, 1)

N = 26
xs = np.linspace(0, W, N); ys = np.linspace(0, H, N)
verts = []
for y in ys:
    for x in xs:
        xi, yi = int(min(W - 1, x)), int(min(H - 1, y))
        body = float(np.clip(1 - wTL[yi, xi] - wBL[yi, xi] - (1 - wH[yi, xi]) * (np.asarray(poly_mask(hanger, 10))[yi, xi]), 0, 1))
        verts.append([round(float(x), 2), round(float(y), 2), round(float(wTL[yi, xi]), 3), round(float(wBL[yi, xi]), 3), round(body, 3)])
rig = {"w": W, "h": H, "n": N, "pivot": PIVOT, "bail": BAIL, "cross": CROSS, "verts": verts}
out = os.path.join(ROOT, "film", "assets", "brand", "elephant-rig.js")
open(out, "w").write("window.U2C_RIG=" + json.dumps(rig, separators=(",", ":")) + ";\n")
print("wrote", out)
if "--debug" in sys.argv:
    art = Image.open(os.path.join(ROOT, "film", "assets", "brand", "elephant.png")).convert("RGBA")
    ov = np.zeros((H, W, 4), np.uint8)
    ov[..., 0] = (wTL * 255).astype(np.uint8); ov[..., 1] = (wBL * 255).astype(np.uint8); ov[..., 2] = (wH * 255).astype(np.uint8); ov[..., 3] = 140
    bg = Image.new("RGBA", (W, H), (255, 255, 255, 255)); bg.alpha_composite(art); bg.alpha_composite(Image.fromarray(ov))
    d = ImageDraw.Draw(bg)
    for p_, c in ((PIVOT, "red"), (BAIL, "blue"), (CROSS, "green")): d.ellipse([p_[0] - 6, p_[1] - 6, p_[0] + 6, p_[1] + 6], outline=c, width=3)
    bg.save(sys.argv[sys.argv.index("--debug") + 1])
