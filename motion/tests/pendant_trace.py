"""Motion trace of the pendant test render (node render.mjs --test pendant): measured from the decoded frames.

  .venv/bin/python tests/pendant_trace.py out/v8/tests/pendant-4bars.mp4 [--out out/v8/tests/pendant-trace.png]

Per frame it segments the pendant (pixels brighter than the ground, below the HUD), and measures
  - the pivot: the top-most pendant pixels (the top of its own chain loop, the hand point)
  - the body centre: the pendant's alpha centroid
  - the swing angle: atan2 of centroid - pivot.
Checks (exit 1 on failure): pivot moves <= 2 px; every turn-around (extreme) of the angle is within 1 frame of a beat;
the signs alternate beat to beat (one full swing per 2 beats); the angle has no jitter (second difference small vs
amplitude). Writes a plot: x/y paths of the pivot and body centre, angle vs time with the beat grid, and a filmstrip.
"""
import argparse, subprocess, sys, json, math
import numpy as np

ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--out", default=None); ap.add_argument("--bpm", type=float, default=128.0); ap.add_argument("--fps", type=float, default=30)
a = ap.parse_args()
out = a.out or a.video.replace(".mp4", "-trace.png")
w0, h0 = [int(v) for v in subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout.strip().split(",")]
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", a.video, "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True).stdout
Y = np.frombuffer(raw, np.uint8).reshape(-1, h0, w0)
n = len(Y); beat = 60 / a.bpm; t = (np.arange(n) + 0.5) / a.fps
top0 = int(h0 * 0.12)                 # below the HUD text
piv, cen = [], []
# pivot = the hang point (top of its own chain loop). The rotation centre does not move, so a patch centred on it
# matches itself in every frame (the patch only rotates about its own centre): normalised cross-correlation,
# +-24 px search, sub-pixel by parabola.
PX, PY = w0 * 0.5 - 0.0057 * w0 * 0.8, h0 * 0.18 + 5; R0 = 11; SR = 16
tpl = Y[0, int(PY) - R0:int(PY) + R0, int(PX) - R0:int(PX) + R0].astype(np.float32); tpl = (tpl - tpl.mean()) / (tpl.std() + 1e-6)
for f in Y:
    m = f[top0:] > 40
    ys, xs = np.nonzero(m)
    ys = ys + top0
    best = (-9, 0, 0); sc = np.full((2 * SR + 1, 2 * SR + 1), -9.0)
    for dy in range(-SR, SR + 1):
        for dx in range(-SR, SR + 1):
            p = f[int(PY) - R0 + dy:int(PY) + R0 + dy, int(PX) - R0 + dx:int(PX) + R0 + dx].astype(np.float32)
            p = (p - p.mean()) / (p.std() + 1e-6); sc[dy + SR, dx + SR] = (p * tpl).mean()
    j, i = np.unravel_index(np.argmax(sc), sc.shape)
    piv.append((PX + i - SR, PY + j - SR))
    cen.append((xs.mean(), ys.mean()))
piv = np.array(piv); cen = np.array(cen)
ang = np.degrees(np.arctan2(-(cen[:, 0] - piv[:, 0].mean()), cen[:, 1] - piv[:, 1].mean()))
ang -= np.median(ang)
# extremes: local maxima of |angle| between zero crossings
ext = []
sgn = np.sign(ang)
zc = [i for i in range(1, n) if sgn[i] != sgn[i - 1]]
bounds = [0] + zc + [n]
for i0, i1 in zip(bounds[:-1], bounds[1:]):
    if i1 - i0 < 4: continue
    seg = np.abs(ang[i0:i1]); k = i0 + int(np.argmax(seg))
    if 0 < k < n - 1:
        # sub-frame peak by parabola
        y0, y1, y2 = abs(ang[k - 1]), abs(ang[k]), abs(ang[k + 1]); d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2)) if (y0 - 2 * y1 + y2) != 0 else 0
        ext.append((t[k] + d / a.fps, ang[k]))
errs = [abs(te - round(te / beat) * beat) * a.fps for te, _ in ext]
alt = all(np.sign(ext[i][1]) != np.sign(ext[i + 1][1]) for i in range(len(ext) - 1))
beats_hit = sorted(set(int(round(te / beat)) for te, _ in ext))
jit = np.abs(np.diff(ang, 2)).max() / max(1e-6, np.abs(ang).max())
pmove = float(np.hypot(*(piv - piv.mean(0)).T).max())
ok = pmove <= 4.0 and errs and max(errs) <= 1.0 and alt and jit < 0.5
rep = [f"PENDANT TRACE {a.video}  frames {n}",
       f"pivot (top of its own chain): max drift {pmove:.2f} px (patch tracking; 0 px in the model)  -> {'PASS' if pmove <= 4.0 else 'FAIL'}",
       f"extremes: {len(ext)} (beats {beats_hit[0] if beats_hit else '-'}..{beats_hit[-1] if beats_hit else '-'}), max offset from the beat {max(errs) if errs else 99:.2f} frames  -> {'PASS' if errs and max(errs) <= 1 else 'FAIL'}",
       f"alternating sides beat to beat (one full swing per 2 beats): {'PASS' if alt else 'FAIL'}",
       "amplitudes per beat (deg): " + " ".join(f"{v:+.1f}" for _, v in ext),
       f"smoothness: max |2nd diff| / amplitude = {jit:.3f}  -> {'PASS' if jit < 0.5 else 'FAIL'}"]
print("\n".join(rep))
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
fig = plt.figure(figsize=(14, 9), facecolor="#111")
gs = fig.add_gridspec(2, 2, width_ratios=[1, 2.2])
ax0 = fig.add_subplot(gs[:, 0]); ax1 = fig.add_subplot(gs[0, 1]); ax2 = fig.add_subplot(gs[1, 1])
for ax in (ax0, ax1, ax2): ax.set_facecolor("#111"); ax.tick_params(colors="#bbb"); [s.set_color("#555") for s in ax.spines.values()]
fr = Y[int(round(0 * a.fps))]
ax0.imshow(fr, cmap="gray", vmin=0, vmax=255); ax0.plot(cen[:, 0], cen[:, 1], color="#ff5cc8", lw=1.5, label="body centre path"); ax0.plot(piv[:, 0], piv[:, 1], "o", color="#7fd1ff", ms=3, label="pivot (all frames)")
bi = [int(round(k * beat * a.fps)) for k in range(int(n / (beat * a.fps)) + 1) if int(round(k * beat * a.fps)) < n]
ax0.plot(cen[bi, 0], cen[bi, 1], "s", color="#fff", ms=5, label="on each beat"); ax0.legend(loc="lower left", fontsize=8); ax0.set_title("paths over 4 bars", color="#ddd"); ax0.axis("off")
ax1.plot(t, ang, color="#ff5cc8", lw=1.6)
for k in range(int(t[-1] / beat) + 1): ax1.axvline(k * beat, color="#fff" if k % 4 == 0 else "#555", lw=1.2 if k % 4 == 0 else 0.7)
for te, v in ext: ax1.plot(te, v, "o", color="#7fd1ff", ms=4)
ax1.set_ylabel("swing angle (deg)", color="#ddd"); ax1.set_title("measured swing angle vs the beat grid (white = downbeats); dots = extremes", color="#ddd")
ax2.plot(t, cen[:, 0] - cen[:, 0].mean(), color="#ff5cc8", label="body centre x (px)"); ax2.plot(t, piv[:, 0] - piv[:, 0].mean(), color="#7fd1ff", label="pivot x (px)"); ax2.plot(t, piv[:, 1] - piv[:, 1].mean(), color="#7fd1ff", ls=":", label="pivot y (px)")
for k in range(int(t[-1] / beat) + 1): ax2.axvline(k * beat, color="#fff" if k % 4 == 0 else "#444", lw=0.7)
ax2.legend(fontsize=8, loc="upper right"); ax2.set_xlabel("seconds", color="#ddd")
fig.text(0.01, 0.005, " | ".join(rep[1:4]), color="#ddd", fontsize=8)
fig.tight_layout(); fig.savefig(out, dpi=90, facecolor="#111")
print("plot:", out)
sys.exit(0 if ok else 1)
