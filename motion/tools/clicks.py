#!/usr/bin/env python3
"""v19 UI click track: a synthesized mouse click (press + softer release 55 ms later) at each time, stereo WAV, mixed low under the beat.
python3 tools/clicks.py --out clicks.wav --dur 30.7 --times 0.64,3.4,... [--gain-db -16] [--sr 48000]"""
import argparse, wave
import numpy as np
a = argparse.ArgumentParser(); a.add_argument('--out', required=True); a.add_argument('--dur', type=float, required=True); a.add_argument('--times', default='')
a.add_argument('--gain-db', type=float, default=-16); a.add_argument('--sr', type=int, default=48000); o = a.parse_args()
sr, n = o.sr, int(o.dur * o.sr) + 1; out = np.zeros(n, np.float64); rng = np.random.default_rng(7)
def click(level):
    m = int(0.012 * sr); t = np.arange(m) / sr
    noise = rng.standard_normal(m) * np.exp(-t / 0.0012); noise = np.diff(noise, prepend=0)          # bright tick (high-passed noise burst)
    body = np.sin(2 * np.pi * 3400 * t) * np.exp(-t / 0.0025) * 0.6 + np.sin(2 * np.pi * 1200 * t) * np.exp(-t / 0.004) * 0.3   # plastic body
    return level * (noise * 0.5 + body)
press, release = click(1.0), click(0.45)
for tt in [float(x) for x in o.times.split(',') if x.strip()]:
    for off, snd in ((0.0, press), (0.055, release)):
        i = int((tt + off) * sr)
        if 0 <= i < n: j = min(n, i + len(snd)); out[i:j] += snd[: j - i]
pk = np.max(np.abs(out)) or 1.0; out = out / pk * 10 ** (o.gain_db / 20)
st = np.stack([out * 0.97, out], axis=1); pcm = (np.clip(st, -1, 1) * 32767).astype('<i2')
with wave.open(o.out, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
print(o.out)
