"""Waveform accuracy test (v9, Ableton-grade session meter): the RENDERED columns vs numpy on the clip audio.

  .venv/bin/python tests/test_waveform_render.py [--t 6.0] [--len 30] [--stage nigredo]
Renders the waveform test card (node render.mjs --test waveform --stills T --wave-debug: the session meter alone,
1 column per device pixel), then for every column of both lanes:
  1. DATA: the column's min / max / rms (what was drawn) vs numpy over the exact clip-WAV sample range that column
     covers (s0..s1, reported by the renderer): within 1 LSB of int16 (+ float32 slack) -> 'the actual beat's waveform';
  2. PIXELS: in the PNG, the vertical extent of the waveform in that column vs the expected top / bottom from numpy
     (cy - max*sc, cy - min*sc): within 1.5 px, skipping the columns under grid lines / transient markers / labels;
  3. LOD: the detail window uses the finest LOD (>= 1 source column per pixel), the source is ~2400 col/s.
PASS needs 100 % of the data columns and >= 98 % of the checked pixel columns.
"""
import argparse, json, os, subprocess, sys
import numpy as np, soundfile as sf
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("--t", type=float, default=6.0); ap.add_argument("--len", default="30"); ap.add_argument("--stage", default="nigredo")
ap.add_argument("--beat", default="audio/atelmansion-3c-fmin-128.wav"); a = ap.parse_args()
out = os.path.join(ROOT, "out", "v9", "tests", "waveform"); os.makedirs(out, exist_ok=True)
subprocess.run(["node", "render.mjs", "--beat", a.beat, "--len", a.len, "--stage", a.stage, "--test", "waveform", "--stills", str(a.t), "--wave-debug", "--out", out], cwd=ROOT, check=True, capture_output=True)
dbg = json.load(open(os.path.join(out, "wave-debug.json"))); png = os.path.join(out, f"t-{a.t:.2f}.png")
base = os.path.basename(a.beat).rsplit(".", 1)[0].lower()
y, sr = sf.read(os.path.join(ROOT, "film", "data", f"{base}-{a.len}.wav"), always_2d=True, dtype="float32"); y = y.astype(np.float64)
Y = np.asarray(Image.open(png).convert("L"), np.float32)
lanes = {l["ch"]: l for l in dbg["lanes"]}; skip = np.array(sorted(set(round(v) for v in dbg["skip"])))
fails = []; derr = 0.0; nd = 0; pix_ok = pix_n = 0; worst_px = 0.0; lods = set()
for c in dbg["cols"]:
    s0, s1, ch = int(c["s0"]), int(c["s1"]), c["ch"]; v = y[s0:s1, ch]
    if len(v) == 0: continue
    ref = np.array([v.min(), v.max(), np.sqrt((v * v).mean())]); got = np.array([c["mn"], c["mx"], c["rms"]])
    derr = max(derr, float(np.abs(ref - got).max())); nd += 1; lods.add(c["lod"])
    X = int(round(c["X"]))
    if len(skip) and np.abs(skip - X).min() <= 2: continue
    L = lanes[ch]; top, bot = L["cy"] - ref[1] * L["sc"], L["cy"] - ref[0] * L["sc"]
    if X < dbg["x"] + 40 or X > dbg["x"] + dbg["w"] - 2: continue           # lane letter
    if dbg.get("playX") is not None and dbg["playX"] - 3 <= X <= dbg["playX"] + 120: continue   # playhead + its bar.beat label
    y0, y1 = int(L["top"] + 12), int(L["top"] + L["h"] - 10)          # below the transient flags, above the 16th ticks
    colv = Y[y0:y1, X]; bg = np.median(np.concatenate([Y[y0:y0 + 3, X], Y[y1 - 3:y1, X]]))
    on = np.nonzero(np.abs(colv - bg) > 18)[0]; yy = y0 + on; on = on[(np.abs(yy - L["cy"]) > 1) | ((yy >= top - 1.5) & (yy <= bot + 1.5))]   # the centre line
    if len(on) == 0: continue
    mtop, mbot = y0 + on[0], y0 + on[-1] + 1
    e = max(abs(mtop - top), abs(mbot - bot)); worst_px = max(worst_px, e); pix_n += 1; pix_ok += e <= 1.5
    if e > 1.5 and len(fails) < 12: fails.append((X, ch, round(top, 1), round(bot, 1), int(mtop), int(mbot)))
lsb = 1 / 32767; dok = derr <= 1.01 * lsb + 1e-6
pfrac = pix_ok / max(1, pix_n)
print(f"WAVEFORM (v9) t={a.t}s  {nd} columns ({dbg['nc']} px x 2 lanes), source {dbg['lod0cps']:.0f} col/s ({dbg['spc']} samples/col), LODs used {sorted(lods)}")
print(f"data vs numpy (min/max/rms over each column's samples): max error {derr / lsb:.2f} LSB (int16)  -> {'PASS' if dok else 'FAIL'}")
print(f"pixels vs numpy: {pix_ok}/{pix_n} columns within 1.5 px ({100 * pfrac:.1f} %), worst {worst_px:.1f} px  -> {'PASS' if pfrac >= 0.98 else 'FAIL'}")
print(png)
if fails: print('first misses (X, ch, top, bot expected, measured):', fails)
sys.exit(0 if dok and pfrac >= 0.98 and 0 in lods else 1)
