"""Sync test: every scheduled visual event vs the beat grid vs the audio.

  .venv/bin/python tests/sync_test.py [--stage nigredo] [--aspect 9:16] [--len 30] [--title "ATELMANSION 3"]

1. Dumps the composition's schedule (window.U2C6.schedule(): cuts, glides, card-open steps, logo IN/OUT steps,
   boot lines, annotations) via `node render.mjs --stills 0 --schedule`.
2. For each event: the frame it shows on (nearest frame: the engine samples at frame centres) vs the nearest 32nd-note grid time (error A).
3. The grid itself vs the audio: on every beat of the mastered clip, the sample-accurate attack of the on-beat
   transient (high band > 1.5 kHz, 50 % of local peak) vs the grid beat (error B).
4. Error = A + |B at that event's beat| (worst case). PASS if the max over all events <= 1 frame.
Writes out/v6/sync-report-<stage>-<aspect>-<len>.txt.
"""
import argparse, json, os, subprocess, sys
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("--stage", default="nigredo"); ap.add_argument("--look", default="exe"); ap.add_argument("--aspect", default="9:16"); ap.add_argument("--len", default="30")
ap.add_argument("--beat", default="audio/atelmansion-3c-fmin-128.wav"); ap.add_argument("--title", default=None)
a = ap.parse_args()
aspect = a.aspect.replace(":", "")
tmpdir = os.path.join(ROOT, "out", "v8", "stills", f"sync-{a.look}-{a.stage}-{aspect}-{a.len}")
cmd = ["node", "render.mjs", "--beat", a.beat, "--look", a.look, "--stage", a.stage, "--aspect", a.aspect, "--len", a.len, "--stills", "0", "--schedule", "--out", tmpdir]
if a.title: cmd += ["--title", a.title]
subprocess.run(cmd, cwd=ROOT, check=True, capture_output=True)
sch = json.load(open(os.path.join(tmpdir, "schedule.json")))
base = os.path.basename(a.beat).rsplit(".", 1)[0].lower()
did = f"{base}-{a.len}"
D = json.loads(open(os.path.join(ROOT, "film", "data", did + ".js")).read()[len("window.U2C_DATA="):].rstrip().rstrip(";"))
FPS, BEAT, dur = D["fps"], D["beat"], D["duration"]

# audio: attack of the on-beat transient at every grid beat of the mastered clip
y, SR = sf.read(os.path.join(ROOT, "film", "data", did + ".wav"), always_2d=True)
hp = sosfilt(butter(4, 1500, "high", fs=SR, output="sos"), y.mean(1))
env = np.convolve(np.abs(hp), np.ones(int(0.0003 * SR)) / int(0.0003 * SR), "same")
audio_err = {}
for k in range(int(dur / BEAT)):
    g = k * BEAT; i0, i1 = int((g - 0.02) * SR), int((g + 0.02) * SR)
    if i0 < 0 or i1 >= len(env): continue
    seg = env[i0:i1]
    if seg.max() < 4 * np.median(env[max(0, i0 - SR // 4):i1]): continue
    audio_err[k] = (i0 + int(np.argmax(seg >= 0.5 * seg.max()))) / SR - g
ae = np.array(list(audio_err.values()))

g32 = BEAT / 8
rows, worst = [], 0.0
for e in sch["schedule"]:
    t = e["t"]
    if t < 0 or t >= dur: continue
    grid_t = round(t / g32) * g32
    shown = np.floor(t * FPS + 0.5) / FPS          # the engine samples each frame at its centre: nearest frame
    errA = abs(shown - grid_t)
    kb = int(round(t / BEAT)); errB = abs(audio_err.get(kb, 0.0))
    err = errA + errB
    worst = max(worst, err)
    rows.append((t, e["what"], errA * 1000, errB * 1000, err * FPS))
ok = worst * FPS <= 1.0 + 1e-9
lines = [f"SYNC TEST  {a.look} {a.stage} {a.aspect} {a.len}s   events {len(rows)}   fps {FPS}   grid {60 / BEAT:.2f} BPM",
         f"audio on-beat transients vs grid: n={len(ae)}  mean {np.mean(np.abs(ae)) * 1000:.2f} ms  max {np.max(np.abs(ae)) * 1000:.2f} ms",
         f"max event error: {worst * 1000:.2f} ms = {worst * FPS:.3f} frames  ->  {'PASS' if ok else 'FAIL'} (limit 1 frame)", "",
         f"{'t (s)':>8}  {'frame-vs-grid ms':>16}  {'audio-vs-grid ms':>16}  {'total frames':>12}  event"]
lines += [f"{t:8.3f}  {a_:16.2f}  {b_:16.2f}  {f_:12.3f}  {w}" for t, w, a_, b_, f_ in rows]
rep = os.path.join(ROOT, "out", "v8", f"sync-report-{a.look}-{a.stage}-{aspect}-{a.len}.txt")
open(rep, "w").write("\n".join(lines) + "\n")
print("\n".join(lines[:3])); print("report:", rep)
sys.exit(0 if ok else 1)
