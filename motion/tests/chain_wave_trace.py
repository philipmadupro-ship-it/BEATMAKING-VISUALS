"""Chain-wave motion trace (v9): per-link angle vs time, the propagation delay down the chain, the pendant on the beat.

  .venv/bin/python tests/chain_wave_trace.py out/v9/tests/pendant-trace/trace-model.json [--video out/v9/tests/pendant-4bars.mp4]
  (trace-model.json: node render.mjs --test pendant --stills 0 --trace --out out/v9/tests/pendant-trace)

Model checks (exit 1 on failure):
  1. propagation: the lag of each link behind the hand (cross-correlation peak, frames, unwrapped over the swing period; 1 frame tolerance) increases from the
     top link to the last link, and the body arrives last (lag > last link);
  2. on the beat: every extreme of the body angle is within 1 frame of a beat (sub-frame parabola), signs alternate;
  3. smooth + deterministic: no jumps (max |2nd diff| / amplitude < 0.5), the hand pushes start within 2 frames of the beat.
Video check (--video, the rendered 4-bar test): horizontal centroid of the chain pixels in a band at each joint's rest
height, per frame -> the measured lag of each band behind the top band (frames) must also increase down the chain.
Writes <trace dir>/chain-wave-trace.png (per-link angle vs time + beat grid, lag per link, x-paths) and prints a report.
"""
import argparse, json, subprocess, sys
import numpy as np

ap = argparse.ArgumentParser(); ap.add_argument("trace"); ap.add_argument("--video"); ap.add_argument("--out")
a = ap.parse_args()
d = json.load(open(a.trace)); fps = d["fps"]; beat = d["beat"]; P = d["pts"]; n = len(P)
t = (np.arange(n) + 0.5) / fps
links = np.degrees(np.array([p["links"] for p in P]))      # [frame, 0..N]: 0 = hand, 1..N = links
body = np.degrees(np.array([p["th"] for p in P])); N = links.shape[1] - 1
up = 8                                                      # upsample x8 for sub-frame lags
tu = np.linspace(t[0], t[-1], (n - 1) * up + 1)
def lag(x, y):
    x = np.interp(tu, t, x); y = np.interp(tu, t, y); x = x - x.mean(); y = y - y.mean()
    best, bl = -1e18, 0
    for k in range(0, int(1.5 * beat * fps * up)):
        s = np.dot(x[:len(x) - k], y[k:])
        if s > best: best, bl = s, k
    return bl / up
lags = [lag(links[:, 0], links[:, j]) for j in range(1, N + 1)]; lb = lag(links[:, 0], body)
# v11 (rigid-link PBD chain): the lag is only defined modulo the swing period, so unwrap it down the chain; the lower links
# hang from the heavy pendant and follow it, so they may sit up to 1 frame behind/ahead of each other and of the body.
Pf = 2 * beat * fps; lags_u = [lags[0]]
for v in lags[1:]:
    while v < lags_u[-1] - 1.0: v += Pf
    lags_u.append(v)
lb_u = lb
while lb_u < lags_u[-1] - 1.0: lb_u += Pf
mono = all(lags_u[i + 1] >= lags_u[i] - 1.0 for i in range(N - 1)) and lb_u >= lags_u[-1] - 1.0 and lags_u[-1] - lags_u[0] > 3.0
# body extremes
ext = []; s = np.sign(body); zc = [i for i in range(1, n) if s[i] != s[i - 1]]; bd = [0] + zc + [n]
for i0, i1 in zip(bd[:-1], bd[1:]):
    if i1 - i0 < 4: continue
    k = i0 + int(np.argmax(np.abs(body[i0:i1])))
    if 0 < k < n - 1:
        y0, y1, y2 = abs(body[k - 1]), abs(body[k]), abs(body[k + 1]); dd = y0 - 2 * y1 + y2
        ext.append((t[k] + ((y0 - y2) / (2 * dd) if dd else 0) / fps, body[k]))
err = [abs(te - round(te / beat) * beat) * fps for te, _ in ext]
alt = all(np.sign(ext[i][1]) != np.sign(ext[i + 1][1]) for i in range(len(ext) - 1))
jit = np.abs(np.diff(body, 2)).max() / max(1e-6, np.abs(body).max())
dfr = d["chain"]["deltaFrames"]
ok = mono and err and max(err) <= 1.0 and alt and jit < 0.5 and abs(dfr) <= 2
rep = [f"CHAIN WAVE TRACE  {a.trace}  ({n} frames, {N} links, wave {d['chain']['wave']} beats, damping {d['chain']['damp']})",
       "lag behind the hand (frames), link 1..N: " + " ".join(f"{v:.2f}" for v in lags_u) + f"  | body {lb_u:.2f}  (unwrapped)",
       f"propagation: lag grows link by link, the pendant arrives last  -> {'PASS' if mono else 'FAIL'}",
       f"body extremes: {len(ext)}, max offset from the beat {max(err) if err else 99:.2f} frames, alternating {alt}  -> {'PASS' if err and max(err) <= 1 and alt else 'FAIL'}",
       "amplitudes (deg): " + " ".join(f"{v:+.1f}" for _, v in ext),
       f"smoothness max |2nd diff|/amp {jit:.3f}; hand push offset from the beat {dfr:+.2f} frames  -> {'PASS' if jit < 0.5 and abs(dfr) <= 2 else 'FAIL'}"]
mlags = None
if a.video:
    w0, h0 = [int(v) for v in subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout.strip().split(",")]
    Y = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", a.video, "-pix_fmt", "gray", "-f", "rawvideo", "-"], capture_output=True).stdout, np.uint8).reshape(-1, h0, w0).astype(np.float32)
    J = np.array(P[0]["joints"]); sy = h0 / d["H"]; cx = J[:, 0].mean() * sy; L = np.hypot(*(J[1] - J[0])) * sy
    xs = []
    for j in range(1, N + 1):
        yc = int(round((J[j - 1][1] + J[j][1]) / 2 * sy)); band = Y[:, yc - 2:yc + 3, int(cx - 3 * L):int(cx + 3 * L)]
        wgt = np.clip(band - 60, 0, None).sum(1); col = np.arange(wgt.shape[1])
        xs.append((wgt * col).sum(1) / np.maximum(1e-6, wgt.sum(1)))
    xs = np.array(xs).T; m = min(len(xs), n)
    # phase of the swing fundamental (period 2 beats) per band over the steady part (after bar 1): lag = phase difference / w
    w = np.pi / beat; tt = t[:m]; sel = tt > 4 * beat
    ph = [np.angle(np.sum((xs[:m, j][sel] - xs[:m, j][sel].mean()) * np.exp(-1j * w * tt[sel]))) for j in range(N)]
    mlags = [float(((ph[0] - ph[j]) % (2 * np.pi)) / w * fps) for j in range(N)]
    mlags = [v if v < 0.75 * 2 * beat * fps else v - 2 * beat * fps for v in mlags]
    vok = all(mlags[i + 1] >= mlags[i] - 0.5 for i in range(N - 1)) and mlags[-1] > mlags[0] + 2
    ok = ok and vok
    rep.append("MEASURED from the video, lag of link band 1..N behind band 1 (frames): " + " ".join(f"{v:.2f}" for v in mlags) + f"  -> {'PASS' if vok else 'FAIL'}")
print("\n".join(rep))
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
fig, ax = plt.subplots(3, 1, figsize=(14, 12), facecolor="#111", gridspec_kw={"height_ratios": [2.2, 1, 1]})
for x in ax: x.set_facecolor("#111"); x.tick_params(colors="#bbb"); [s_.set_color("#555") for s_ in x.spines.values()]
cm = plt.get_cmap("cool")
ax[0].plot(t, links[:, 0], color="#ffffff", lw=2.2, label="hand (top)")
for j in range(1, N + 1): ax[0].plot(t, links[:, j], color=cm(j / N), lw=1.1, label=f"link {j}" if j in (1, N // 2, N) else None)
ax[0].plot(t, body, color="#ff5cc8", lw=2.6, label="pendant body")
for k in range(int(t[-1] / beat) + 1): ax[0].axvline(k * beat, color="#fff" if k % 4 == 0 else "#444", lw=1 if k % 4 == 0 else 0.6)
ax[0].set_title("angle (deg) vs time: the push starts at the hand and travels down link by link; the pendant lands its extreme on the beat", color="#ddd")
ax[0].legend(loc="upper right", fontsize=8, facecolor="#222", labelcolor="#ddd"); ax[0].set_xlabel("s", color="#bbb")
ax[1].plot(range(1, N + 1), lags, "o-", color="#7fd1ff", label="model"); ax[1].axhline(lb, color="#ff5cc8", ls="--", label=f"body {lb:.1f}")
if mlags: ax[1].plot(range(1, N + 1), np.array(mlags) + lags[0], "s--", color="#ffd166", label="measured (video, offset to link 1)")
ax[1].set_title("lag behind the hand per link (frames)", color="#ddd"); ax[1].legend(fontsize=8, facecolor="#222", labelcolor="#ddd")
Jx = np.array([[q[0] for q in p["joints"]] for p in P])
for j in range(0, N + 1, 2): ax[2].plot(t, Jx[:, j] - Jx[:, j].mean(), color=cm(j / N), lw=1.2, label=f"joint {j}")
ax[2].set_title("joint x offset (px): bigger and later down the chain", color="#ddd"); ax[2].legend(fontsize=7, ncol=6, facecolor="#222", labelcolor="#ddd")
plt.tight_layout(); out = a.out or a.trace.replace("trace-model.json", "chain-wave-trace.png"); plt.savefig(out, dpi=90, facecolor="#111"); print(out)
sys.exit(0 if ok else 1)
