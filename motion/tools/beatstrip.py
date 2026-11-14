"""Beat-exact filmstrip: frames picked by index on the beat grid (ffmpeg's fps filter resamples between frames).

  python3 tools/beatstrip.py <video> <out.png> [--every 0.5] [--from 0] [--cols 8] [--n 16] [--bpm 128] [--w 270]
Each tile is labelled with its bar.beat position.
"""
import argparse, subprocess
import numpy as np
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("out"); ap.add_argument("--every", type=float, default=0.5); ap.add_argument("--from_", "--from", type=float, default=0)
ap.add_argument("--cols", type=int, default=8); ap.add_argument("--n", type=int, default=16); ap.add_argument("--bpm", type=float, default=128); ap.add_argument("--fps", type=float, default=30); ap.add_argument("--w", type=int, default=270)
a = ap.parse_args()
w0, h0 = [int(v) for v in subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout.strip().split(",")]
beat = 60 / a.bpm
idx = [int(round((a.from_ + i * a.every) * beat * a.fps)) for i in range(a.n)]
sel = "+".join(f"eq(n\\,{i})" for i in idx)
th = int(a.w * h0 / w0)
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", a.video, "-vf", f"select='{sel}',scale={a.w}:{th}", "-vsync", "0", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, th, a.w, 3)
rows = (len(fr) + a.cols - 1) // a.cols; pad = 6
sheet = Image.new("RGB", (a.cols * (a.w + pad) + pad, rows * (th + pad) + pad), (22, 22, 22)); d = ImageDraw.Draw(sheet)
for k, f in enumerate(fr):
    x, y = pad + (k % a.cols) * (a.w + pad), pad + (k // a.cols) * (th + pad)
    sheet.paste(Image.fromarray(f), (x, y))
    b = a.from_ + k * a.every; d.rectangle([x, y, x + 120, y + 20], fill=(22, 22, 22)); d.text((x + 5, y + 4), f"bar {int(b // 4) + 1}.{b % 4 + 1:g}  f{idx[k]}", fill=(220, 220, 220))
sheet.save(a.out); print(a.out)
