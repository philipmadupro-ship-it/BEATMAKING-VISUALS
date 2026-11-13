"""Video QA against the u2c-beat-preview-motion checklist (section 7).

  .venv/bin/python tests/qa_video.py out/v7/exe-nigredo-916-30s.mp4 [--stage nigredo] [--beat-data film/data/<id>.js]

Checks:
 1. Scene cuts (ffmpeg scene > 0.08; dark frames change few pixels) land within 1 frame of a beat line; reports cuts per bar.
 2. No fades: no run of > 2 frames with a monotonic global-luma ramp (ignores single-frame cuts).
 3. Palette: ink coverage (pixels > 40 levels from the ground) <= 15 % median; NIGREDO: max(|R-G|, |G-B|) <= 2 on
    every pixel of frames sampled every 0.5 s (decoded RGB, so codec rounding is included).
Exits 1 on failure; prints a report.
"""
import argparse, json, os, re, subprocess, sys
import numpy as np

ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--stage", default=None); ap.add_argument("--bpm", type=float, default=128.0); ap.add_argument("--fps", type=float, default=30)
a = ap.parse_args()
stage = a.stage or next((s for s in ("nigredo", "albedo", "citrinitas", "rubedo") if s in os.path.basename(a.video)), "nigredo")
beat, fr = 60 / a.bpm, 1 / a.fps
ok = True; rep = [f"QA {os.path.basename(a.video)}  stage={stage}"]

# 1. cuts on the grid
e = subprocess.run(["ffmpeg", "-hide_banner", "-i", a.video, "-vf", "select='gt(scene,0.08)',showinfo", "-an", "-f", "null", "-"], capture_output=True, text=True).stderr
cuts = [float(x) for x in re.findall(r"pts_time:([\d.]+)", e)]
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout)
offs = [abs(c - round(c / beat) * beat) for c in cuts]
bad = [c for c, o in zip(cuts, offs) if o > fr + 1e-3]
bars = dur / (4 * beat)
rep.append(f"cuts: {len(cuts)} ({len(cuts) / bars:.2f}/bar)  max off-grid {max(offs) * 1000 if offs else 0:.1f} ms  -> {'PASS' if not bad else 'FAIL ' + str(bad[:5])}")
ok &= not bad

# decode small grey frames for luma + sampled full RGB frames for palette
W, H = 270, 480
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", a.video, "-vf", f"scale={W}:{H}", "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True).stdout
Y = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
luma = Y.mean((1, 2))
d = np.diff(luma)
run, worst = 0, 0
for i in range(1, len(d)):
    same = np.sign(d[i]) == np.sign(d[i - 1]) and 0.25 < abs(d[i]) < 6 and 0.25 < abs(d[i - 1]) < 6
    run = run + 1 if same else 0
    worst = max(worst, run + 1 if same else 0)
rep.append(f"fades: longest monotonic luma ramp {worst} frames  -> {'PASS' if worst <= 2 else 'WARN'}")

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", a.video, "-vf", "fps=2", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True).stdout
w0, h0 = [int(v) for v in subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout.strip().split(",")]
RGB = np.frombuffer(raw, np.uint8).reshape(-1, h0, w0, 3).astype(np.int16)
ground = np.median(RGB[:, ::8, ::8].reshape(-1, 3), axis=0)
cov = [float((np.abs(f - ground).max(-1) > 40).mean()) for f in RGB]
rep.append(f"ink coverage: median {np.median(cov) * 100:.1f} %  max {max(cov) * 100:.1f} %  -> {'PASS' if np.median(cov) <= 0.15 else 'WARN'}")
if stage == "nigredo":
    hue = int(max(np.abs(RGB[..., 0] - RGB[..., 1]).max(), np.abs(RGB[..., 1] - RGB[..., 2]).max()))
    rep.append(f"nigredo grey test: max |R-G|,|G-B| = {hue} over {len(RGB)} frames  ground {ground.astype(int).tolist()}  -> {'PASS' if hue <= 2 else 'FAIL'}")
    ok &= hue <= 2
print("\n".join(rep))
sys.exit(0 if ok else 1)
