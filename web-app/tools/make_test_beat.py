"""Musical 30 s test beat for demos and QA (PLAN-v5 items 6/7): 142 BPM trap sketch in F# minor.

Stems are synthesised with numpy (exact phase integration for the 808 slides), then ffmpeg does the bus: per-stem EQ,
stereo placement, glue compression and a true-peak limiter, and encodes demo/test-beat-142.wav (+ .mp3).
Kick, snare (+ clap layer), hats with 16th/32nd rolls and an open hat, an 808 with glides between notes, a detuned
chord pad (F#m - D - E - C#m), a short pluck lead. Arrangement (18 bars = 30.4 s): intro 2, verse 8, break 2, hook 6.
Run: python3 tools/make_test_beat.py
"""
import os, subprocess, tempfile
import numpy as np
from scipy.io import wavfile

SR = 48000; BPM = 142; SPB = 60 / BPM; BAR = 4 * SPB; BARS = 18; N = int(BARS * BAR * SR) + SR // 2
rng = np.random.default_rng(142)
t = np.arange(N) / SR
def buf(): return np.zeros(N)
def place(dst, x, at, gain=1.0):
    i = int(round(at * SR)); j = min(N, i + len(x));
    if i < N: dst[i:j] += gain * x[:j - i]
def env(n, a, d):
    k = np.arange(n) / SR; e = np.minimum(1, k / max(a, 1e-4)) * np.exp(-np.maximum(0, k - a) / d); return e
def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); s = 0.0
    # vectorised via lfilter would be faster; keep scipy-free here
    from scipy.signal import lfilter
    return lfilter([1 - a], [1, -a], x)

kick, snare, hats, bass, pad, lead = buf(), buf(), buf(), buf(), np.zeros((N, 2)), np.zeros((N, 2))
def kick_hit(v=1.0):
    n = int(.45 * SR); k = np.arange(n) / SR; f = 46 + 120 * np.exp(-k / .028); ph = 2 * np.pi * np.cumsum(f) / SR
    click = rng.standard_normal(n) * np.exp(-k / .003) * .25
    return v * (np.sin(ph) * np.exp(-k / .30) + click)
def snare_hit(v=1.0):
    n = int(.35 * SR); k = np.arange(n) / SR; nz = rng.standard_normal(n)
    body = np.sin(2 * np.pi * 185 * k) * np.exp(-k / .07) * .6
    clap = sum(np.roll(nz * np.exp(-k / .012), int(d * SR)) for d in (0, .009, .018)) * .35 + nz * np.exp(-k / .16) * .55
    return v * (body + clap)
def hat_hit(v=1.0, open_=False):
    n = int((.32 if open_ else .06) * SR); k = np.arange(n) / SR; nz = rng.standard_normal(n)
    return v * nz * np.exp(-k / (.12 if open_ else .018))
ROOTS = [46.25, 36.71, 41.20, 34.65]          # F#1, D1, E1, C#1
CHORDS = [[185.0, 220.0, 277.18], [146.83, 185.0, 220.0], [164.81, 207.65, 246.94], [138.59, 164.81, 207.65]]
LEAD = [554.37, 0, 659.26, 0, 554.37, 493.88, 0, 440.0, 0, 415.30, 440.0, 0, 369.99, 0, 0, 0]

for b in range(BARS):
    T0 = b * BAR; s16 = SPB / 4
    intro, brk = b < 2, b in (10, 11); full = not intro and not brk; hook = b >= 12
    # kick: 1, the "and" of 2, 3 (+ a pickup on bar 4 of each phrase)
    if full:
        for st in ([0, 6, 10] if b % 2 == 0 else [0, 6, 9, 14]): place(kick, kick_hit(1.0 if st == 0 else .85), T0 + st * s16)
    if brk and b == 11:
        for r in range(8): place(snare, snare_hit(.25 + .08 * r), T0 + (8 + r) * s16)  # build-up roll into the hook
        place(snare, snare_hit(1.0), T0 + 4 * s16); place(snare, snare_hit(1.0), T0 + 12 * s16)
        if b % 4 == 3: place(snare, snare_hit(.55), T0 + 15 * s16)
    # hats: 8ths everywhere, 16ths in the hook, rolls at phrase ends, open hat on the "and" of 4
    for st in range(16):
        on = st % 2 == 0 or hook or (b % 4 == 3 and st >= 12)
        if on: place(hats, hat_hit(.9 if st % 4 == 0 else .6), T0 + st * s16)
    if b % 4 == 3 and full:
        for r in range(4): place(hats, hat_hit(.45), T0 + 14 * s16 + r * s16 / 2)
    if full: place(hats, hat_hit(.5, True), T0 + 14 * s16)
    # 808: a hit with every kick (long decay), pitched to the bar's root; the last hit of each bar glides into the next root
    if full:
        steps = [0, 6, 10] if b % 2 == 0 else [0, 6, 9, 14]
        for idx, st in enumerate(steps):
            f0, f1 = ROOTS[b % 4], ROOTS[(b + 1) % 4]; last = idx == len(steps) - 1
            dur = ((16 - st) if last else (steps[idx + 1] - st)) * s16 + (.25 if last else .02); n = int(dur * SR); k = np.arange(n) / SR
            g = np.clip((k - .12) / .18, 0, 1) if last else np.zeros(n); f = f0 * (1 + .12 * np.exp(-k / .02)) + (f1 - f0) * (g * g * (3 - 2 * g))
            ph = 2 * np.pi * np.cumsum(f) / SR; e = np.minimum(1, k / .004) * np.exp(-k / .65) * np.minimum(1, (dur - k) / .01)
            place(bass, np.tanh(2.2 * np.sin(ph)) * e, T0 + st * s16)
    # pad: detuned saws per chord, whole bar, soft attack
    n = int(BAR * SR); k = np.arange(n) / SR; e = np.minimum(1, k / .25) * np.minimum(1, (BAR - k) / .15)
    for c, fq in enumerate(CHORDS[b % 4]):
        for ch, det in ((0, -0.006), (1, 0.006)):
            ph = (fq * (1 + det) * k) % 1.0; saw = 2 * ph - 1
            pad[int(T0 * SR):int(T0 * SR) + n, ch] += saw[:max(0, min(n, N - int(T0 * SR)))] * e[:max(0, min(n, N - int(T0 * SR)))] * .12
    # pluck lead in the hook
    if hook:
        for st, fq in enumerate(LEAD):
            if not fq: continue
            m = int(.3 * SR); kk = np.arange(m) / SR; pl = np.sign(np.sin(2 * np.pi * fq * kk)) * np.exp(-kk / .09) * .18
            pan = .35 if st % 2 else -.35
            i = int(round((T0 + st * s16) * SR)); j = min(N, i + m)
            lead[i:j, 0] += pl[:j - i] * (1 - pan) / 2 * 2; lead[i:j, 1] += pl[:j - i] * (1 + pan) / 2 * 2

pad[:, 0] = onepole_lp(pad[:, 0], 1400); pad[:, 1] = onepole_lp(pad[:, 1], 1400)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'demo')
os.makedirs(out, exist_ok=True)
with tempfile.TemporaryDirectory() as d:
    def w(name, x):
        x = np.atleast_2d(x.T).T if x.ndim == 1 else x
        wavfile.write(f'{d}/{name}.wav', SR, (x / max(1e-9, np.max(np.abs(x))) * .5).astype(np.float32))
    w('kick', kick); w('snare', snare); w('hats', hats); w('bass', bass); w('pad', pad); w('lead', lead)
    fc = ('[0]aformat=channel_layouts=mono,pan=stereo|c0=c0|c1=c0,volume=1.0[k];'
          '[1]aformat=channel_layouts=mono,highpass=f=180,pan=stereo|c0=0.95*c0|c1=1.0*c0,volume=0.62[s];'
          '[2]aformat=channel_layouts=mono,highpass=f=6500,pan=stereo|c0=0.75*c0|c1=1.0*c0,volume=0.32[h];'
          '[3]aformat=channel_layouts=mono,lowpass=f=900,pan=stereo|c0=c0|c1=c0,volume=0.8[b];'
          '[4]highpass=f=150,volume=0.55[p];[5]highpass=f=300,volume=0.5[l];'
          '[k][s][h][b][p][l]amix=inputs=6:normalize=0,acompressor=threshold=0.3:ratio=2:attack=15:release=150:makeup=1.3,'
          'alimiter=limit=0.89:level=false,atrim=0:30.4')
    wav = os.path.join(out, 'test-beat-142.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error'] + sum([['-i', f'{d}/{x}.wav'] for x in ('kick', 'snare', 'hats', 'bass', 'pad', 'lead')], []) +
                   ['-filter_complex', fc, '-ar', '48000', '-c:a', 'pcm_s16le', wav], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '256k', os.path.join(out, 'test-beat-142.mp3')], check=True)
print('wrote demo/test-beat-142.wav + .mp3')
