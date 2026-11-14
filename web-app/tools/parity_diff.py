"""Pixel diff stats between renders of one cue sheet (tools/parity.mjs + native stills):
  python3 tools/parity_diff.py <dir>   (expects web-code-t-*.png, web-app-t-*.png, native-t-*.png)
Per time and pair: mean |diff| (0-255), % pixels with max channel diff > 8, PSNR (dB). Writes <dir>/parity.txt + diff PNGs.
"""
import glob, os, sys
import numpy as np
from PIL import Image
d = sys.argv[1]; lines = []
for f in sorted(glob.glob(os.path.join(d, "native-t-*.png"))):
    t = f.split("native-t-")[1][:-4]; N = np.asarray(Image.open(f).convert("RGB"), np.float32)
    for tag in ("web-code", "web-app"):
        g = os.path.join(d, f"{tag}-t-{t}.png")
        if not os.path.exists(g): continue
        A = np.asarray(Image.open(g).convert("RGB"), np.float32); df = np.abs(A - N); mx = df.max(2)
        mse = (df ** 2).mean(); psnr = 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)
        lines.append(f"t={t}s  native vs {tag:8s}: mean |d| {df.mean():6.3f}  px>8 {100 * (mx > 8).mean():6.3f} %  max {mx.max():5.0f}  PSNR {psnr:6.2f} dB")
        Image.fromarray(np.clip(mx * 4, 0, 255).astype(np.uint8)).save(os.path.join(d, f"diff-{tag}-t-{t}.png"))
open(os.path.join(d, "parity.txt"), "w").write("\n".join(lines) + "\n"); print("\n".join(lines))
