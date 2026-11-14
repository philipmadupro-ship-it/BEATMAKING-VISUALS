"""Sample-accurate waveform test: the 400 columns/s min/max/rms (int8) shipped to the renderer vs numpy on the WAV.

  .venv/bin/python tests/test_wave.py film/data/atelmansion-3c-fmin-128-30   (reads <id>.js and <id>.wav)
Pass: every column's min/max within 1 LSB (1/127) of the true per-column sample extremes, rms within 1 LSB.
"""
import base64, json, sys
import numpy as np, soundfile as sf
base = sys.argv[1] if len(sys.argv) > 1 else "film/data/atelmansion-3c-fmin-128-30"
D = json.loads(open(base + ".js").read().replace("window.U2C_DATA=", "").rstrip().rstrip(";"))
x, sr = sf.read(base + ".wav", always_2d=True)
w2 = np.frombuffer(base64.b64decode(D["wave2"]["b64"]), np.int8).reshape(-1, 6).astype(int)
n = D["wave2"]["n"]; cw = len(x) / n; worst = 0
for i in range(n):
    s = slice(int(i * cw), max(int(i * cw) + 1, int((i + 1) * cw)))
    for j in range(2):
        v = x[s, j]; ref = np.clip(np.round([v.min() * 127, v.max() * 127, np.sqrt((v * v).mean()) * 127]), -127, 127)
        worst = max(worst, int(np.abs(ref - w2[i, j * 3:j * 3 + 3]).max()))
ok = worst <= 1
print(f"WAVEFORM {n} columns ({D['wave2']['cps']}/s, {cw:.0f} samples each): max error {worst} LSB  -> {'PASS' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
