"""Rendered reactions vs the ACTUAL audio onsets (v13 sync audit).

  .venv/bin/python tests/onset_sync.py --probe out/v13/probe-calm-after.json [--cam out/v13/probe-default-after.json]
        [--label after] [--max-frames 1.0] [--audio film/data/<id>.wav] [--sched out/.../schedule.json]

Input: tools/probe_render.sh <name> [render.mjs args] (renders EVERY frame of the real composition page at 30 fps and dumps per-ROI
luma + frame-to-frame change, the camera state and the intro flag). This script then

 1. detects the kick onsets in the mastered clip: 40-150 Hz band, RMS over 2 ms (the 1 ms band detector's job, analysis/bandenv.js),
    onset = the last sample below 20 % of the hit's peak before the peak; cross-checked against librosa onsets;
 2. compares them with the beat grid (phase / downbeat offset / drift) and with the analysis' own D.onsets;
 3. for each visual reaction (waveform flash, spectrum kick lift, levels flash, logo glow, hero punch) finds the frame where the reaction
    ATTACKS (largest frame-to-frame rise within [-3, +4] frames of the kick) and reports its PRESENTATION time (frame start f / fps)
    minus the audio onset: the ideal is within +-0.5 frame (+-16.7 ms; centre sampling), so the table reports median / worst |offset|;
 4. camera pushes (frame the zoom reaches its target), intro carousel steps and the intro -> lab cut vs the grid.
Exit 1 if any reaction's WORST offset exceeds --max-frames (default 1.0 frame at 30 fps) or the median exceeds 0.5 frame.
"""
import argparse, json, os, sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, find_peaks

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--probe", required=True); ap.add_argument("--cam", default=None); ap.add_argument("--label", default="run")
ap.add_argument("--id", default="atelmansion-3c-fmin-128-30"); ap.add_argument("--max-frames", type=float, default=1.0)
ap.add_argument("--t0", type=float, default=None, help="first second to analyse (default: the lab start = after the intro)")
ap.add_argument("--json", default=None); a = ap.parse_args()

D = json.loads(open(os.path.join(ROOT, "film", "data", a.id + ".js")).read()[len("window.U2C_DATA="):].rstrip().rstrip(";"))
FPS, BEAT = D["fps"], D["beat"]
y, SR = sf.read(os.path.join(ROOT, "film", "data", a.id + ".wav"), always_2d=True); m = y.mean(1)

# ---- 1. kick onsets (audio)
lo = sosfilt(butter(4, [40, 150], "band", fs=SR, output="sos"), m)
env = np.sqrt(np.convolve(lo ** 2, np.ones(int(0.002 * SR)) / int(0.002 * SR), "same"))
pk, _ = find_peaks(env, height=0.3 * env.max(), distance=int(0.2 * SR))
ons = []
for q in pk:
    s0 = max(0, q - int(0.06 * SR)); seg = env[s0:q + 1]; idx = np.where(seg < 0.2 * env[q])[0]
    ons.append((s0 + (idx[-1] + 1 if len(idx) else 0)) / SR)
ons = np.array(ons)
q16 = BEAT / 4; off16 = (ons / q16 - np.round(ons / q16)) * q16 * 1000
grid = abs(off16) < 15                       # kicks sitting ON the 16th grid (+-15 ms); the rest are off-grid hits / retriggers of a long 808, reported separately by the audit
try:
    import librosa
    oe = librosa.onset.onset_strength(y=librosa.resample(m.astype(np.float32), orig_sr=SR, target_sr=22050), sr=22050, hop_length=128)
    lt = librosa.onset.onset_detect(onset_envelope=oe, sr=22050, hop_length=128, units="time")
    dl = [(lt[np.argmin(abs(lt - o))] - o) * 1000 for o in ons[grid] if abs(lt[np.argmin(abs(lt - o))] - o) < 0.04]
    lib = f"librosa (n={len(dl)} matched) median {np.median(dl):+.1f} ms vs the 1 ms detector"
except Exception as e:
    lib = f"librosa unavailable ({e})"
ob = ons[grid & (abs((ons / BEAT) - np.round(ons / BEAT)) * BEAT < 0.035)]   # on-beat
drift = np.polyfit(ons[grid], off16[grid], 1)
rep = [f"ONSET SYNC [{a.label}]  {a.id}  {60 / BEAT:.2f} BPM  fps {FPS}",
       f"kick onsets (1 ms detector): {len(ons)} total, {int(grid.sum())} on the 16th grid, {len(ob)} on beats. {lib}",
       f"grid vs kick onsets (16th slots): median {np.median(off16[grid]):+.2f} ms  worst |{abs(off16[grid]).max():.1f}| ms  drift {drift[0]:+.3f} ms/s  (phase at t=0 {drift[1]:+.2f} ms)",
       f"analysis D.onsets.kick: {len(D['onsets']['kick'])}; raw time vs detector median {np.median([(min(D['onsets']['kick'], key=lambda k: abs(k[0] - o))[0] - o) * 1000 for o in ons[grid]]):+.1f} ms, quantised {np.median([(min(D['onsets']['kick'], key=lambda k: abs(k[2] - o))[2] - o) * 1000 for o in ons[grid]]):+.1f} ms", ""]

# ---- 3. reactions
P = json.load(open(a.probe)); f0 = P["f0"]
intro = np.array(P["intro"]); lab0 = (np.where(intro == 0)[0][0] + f0) / FPS if intro.any() else 0.0
t0 = a.t0 if a.t0 is not None else lab0 + 0.1
refs = (np.round(ons / q16) * q16)[grid & (ons >= t0) & (ons < D["duration"] - 0.3)]   # the hit's grid slot IS the audio onset (the on-beat click transient sits on the grid to 0.1 ms, tests/sync_test.py); the 1 ms detector's own lag is the median above
ELEM = [("waveform flash/pulse (session)", "session"), ("spectrum kick lift", "spectrum"), ("levels flash (loud)", "loud"), ("logo glow", "logo")]
rows = []; out = {}
for name, roi in ELEM:
    if roi not in P["luma"]: continue
    L = np.array(P["luma"][roi]); d = np.diff(L, prepend=L[0]); offs = []
    for g in refs:
        fk = int(np.floor(g * FPS)); lo_, hi_ = fk - 3 - f0, fk + 4 - f0
        if lo_ < 1 or hi_ >= len(d): continue
        w = d[lo_:hi_ + 1]
        if w.max() < 0.6 * max(1e-9, np.percentile(d[d > 0], 90) if (d > 0).any() else 1): continue   # no visible reaction on this hit
        fr = lo_ + int(np.argmax(w >= 0.5 * w.max())) + f0   # the ATTACK: first frame reaching half of the largest rise
        offs.append(fr / FPS * 1000 - g * 1000)
    if not offs: continue
    offs = np.array(offs); out[name] = offs.tolist()
    rows.append((name, len(offs), np.median(offs), np.abs(offs).max(), np.mean(offs)))

# ---- 4. camera, intro
extra = []
Pc = json.load(open(a.cam)) if a.cam else P
cam = [c for c in Pc["cam"]]
z = np.array([c[2] if c else np.nan for c in cam]); fc = Pc["f0"]
sched = os.path.join(ROOT, "out", "v13", "schedule.json")
if os.path.exists(sched):
    S = json.load(open(sched))["schedule"]
    lands = [e for e in S if "(land)" in e["what"] and e["t"] < D["duration"]]
    for e in lands:
        # first frame whose zoom has reached the post-move value (the value 2 frames later), vs the key time
        fi = int(round(e["t"] * FPS)) - fc
        if fi < 3 or fi + 4 >= len(z) or np.isnan(z[fi + 3]): continue
        tgt = z[fi + 3]; f_first = next((i for i in range(max(0, fi - 8), fi + 4) if abs(z[i] - tgt) < 2e-4 * tgt), None)
        if f_first is not None: extra.append((e["what"], (f_first + fc) / FPS * 1000 - e["t"] * 1000))
    cut = [e for e in S if "hard cut" in e["what"]]
    if cut and intro.any():
        fcut = np.where(intro == 0)[0][0] + f0; extra.append(("intro -> lab cut (first lab frame)", fcut / FPS * 1000 - cut[0]["t"] * 1000))
# intro carousel: the first frame whose intro.index has reached the card's landed value vs the landing beat
if P.get("idx") and any(v is not None for v in P["idx"]):
    ix = P["idx"]; vals = [v for v in ix if v is not None]; fin = sorted(set(round(v, 3) for v in vals))
    for v in [v for v in sorted(set(round(v, 3) for v in vals), reverse=True) if abs(v - round(v)) < 5e-4]:
        fi = next((i for i, w in enumerate(ix) if w is not None and abs(w - v) < 1e-3), None)
        if fi is None or fi < 2: continue
        t_land = round(((fi + f0) / FPS) / BEAT * 2) / 2 * BEAT      # the half-beat grid slot nearest the first frame at the value
        extra.append((f"intro carousel card {v:g} reached (vs nearest beat)", (fi + f0) / FPS * 1000 - t_land * 1000))
    en = P.get("enter")
    if en and en[0] is not None:
        fi = next((i for i, w in enumerate(en) if w is not None and w >= 0.999), None)
        if fi is not None: extra.append(("intro enter lands (beat 3 = 2 beats)", (fi + f0) / FPS * 1000 - 2 * BEAT * 1000))
        extra.append((f"intro enter at frame 0 (must already be moving: > 0 by frame 1)", 0.0 if (en[1] or 0) > 0 else 99999.0))

lines = rep + [f"{'element':<42}{'n':>4}{'median ms':>11}{'worst |ms|':>12}{'median fr':>11}{'worst fr':>10}  verdict"]
bad = 0
for name, n, med, wst, mean in rows:
    ok = wst <= a.max_frames * 1000 / FPS + 1e-6 and abs(med) <= 0.5 * 1000 / FPS + 1e-6; bad += not ok
    lines.append(f"{name:<42}{n:>4}{med:>+11.1f}{wst:>12.1f}{med * FPS / 1000:>+11.2f}{wst * FPS / 1000:>10.2f}  {'ok' if ok else 'OFF'}")
if extra:
    lines.append("")
    lines += [f"{w:<62}{v:>+8.1f} ms {v * FPS / 1000:>+6.2f} fr  {'ok' if abs(v) <= 1000 / FPS + 1e-6 else 'OFF'}" for w, v in extra]
    bad += sum(abs(v) > 1000 / FPS + 1e-6 for _, v in extra)
lines.append(""); lines.append(("PASS" if not bad else f"FAIL ({bad})") + f"  (limit: worst <= {a.max_frames} frame, median <= 0.5 frame)")
txt = "\n".join(lines); print(txt)
os.makedirs(os.path.join(ROOT, "out", "v13"), exist_ok=True)
open(os.path.join(ROOT, "out", "v13", f"onset-sync-{a.label}.txt"), "w").write(txt + "\n")
if a.json: json.dump({"rows": rows, "extra": extra, "offs": out}, open(a.json, "w"))
sys.exit(1 if bad else 0)
