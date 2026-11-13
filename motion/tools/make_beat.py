"""Synthesise the 30 s U2C test beat (142 BPM, F# minor, stereo, 48 kHz).

Elements: kick, snare+clap, hats (8ths + triplet/32nd rolls, open hats), a sliding 808,
a detuned chord pad, a pluck top line with ping-pong delay.
numpy renders the dry stems; ffmpeg does the bus processing and mastering
(glue compressor, limiter, EBU R128 loudness) — see master() below.

Writes audio/stems/*.wav, audio/beat-30s-premaster.wav, audio/beat-30s.wav and
audio/events.json (ground-truth hit times, used only to score the onset detector).
Deterministic: fixed RNG seed.
"""
import json, os, subprocess, sys
import numpy as np
from scipy.signal import butter, sosfilt
import soundfile as sf

SR = 48000
BPM = 142.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
NBARS = 18
DUR = 30.0
N = int(DUR * SR)
rng = np.random.default_rng(142)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "audio")


def hz(m):  # midi -> Hz
    return 440.0 * 2 ** ((m - 69) / 12)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def place(buf, sig, t, gain=1.0, pan=0.0):
    """Add mono sig at time t (s) into stereo buf with constant-power pan (-1..1)."""
    i = int(round(t * SR))
    if i >= len(buf):
        return
    s = sig[: len(buf) - i] * gain
    a = (pan + 1) * np.pi / 4
    buf[i : i + len(s), 0] += s * np.cos(a)
    buf[i : i + len(s), 1] += s * np.sin(a)


# ---------------------------------------------------------------- one-shots
def kick():
    n = int(0.42 * SR); t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.22)
    click = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.004) * 0.35
    return np.tanh(1.6 * (body + click)) * 0.95


def snare():
    n = int(0.38 * SR); t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.5
    nz = bp(rng.standard_normal(n), 1200, 9000) * np.exp(-t / 0.13) * 0.9
    clap = np.zeros(n)
    for k, d in enumerate((0.0, 0.011, 0.022)):
        i = int(d * SR); m = n - i
        clap[i:] += bp(rng.standard_normal(m), 900, 4000) * np.exp(-np.arange(m) / SR / (0.012 if k < 2 else 0.11)) * 0.7
    return np.tanh(1.3 * (tone + nz + clap)) * 0.8


def hat(open_=False):
    n = int((0.32 if open_ else 0.06) * SR); t = np.arange(n) / SR
    # metallic: six detuned square waves (TR-808 style) + noise, high-passed
    m = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = hp(m * 0.25 + rng.standard_normal(n) * 0.6, 7000, 4)
    return x * np.exp(-t / (0.11 if open_ else 0.014)) * 0.35


def pluck(f, dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * k * t) / k ** 1.4 for k in range(1, 7))
    return lp(x, 3800) * np.exp(-t / 0.16) * (1 - np.exp(-t / 0.002)) * 0.32


# ---------------------------------------------------------------- arrangement
# Bars (0-based). Intro 0-1, drop 2, break 6, re-drop 7, switch 10-11, outro 16-17.
CHORDS = [  # F#m9 | Dmaj7 | Bm9 | C#m7 (i - VI - iv - v), voiced around C4
    [54, 57, 61, 64, 68], [50, 54, 57, 61, 64], [47, 50, 54, 57, 61], [49, 52, 56, 59, 64]]
BASS = [30, 38, 35, 37]          # 808 roots: F#1, D2, B1, C#2
MELODY = [  # (beat offset in bar, midi) — F# minor pentatonic hook, one bar per chord
    [(0, 73), (0.75, 76), (1.5, 78), (2.5, 76), (3.0, 73)],
    [(0, 74), (0.75, 73), (1.5, 69), (3.0, 71)],
    [(0, 71), (0.75, 73), (1.5, 74), (2.5, 73)],
    [(0, 73), (1.0, 68), (1.5, 71), (2.5, 69), (3.5, 68)]]

drums_on = lambda b: b not in (0, 1, 6) and b < 17
events = {"kick": [], "snare": [], "hat": [], "808": [], "chord": []}
stems = {k: np.zeros((N, 2)) for k in ("kick", "snare", "hats", "808", "pad", "pluck")}
K, S, H, HO = kick(), snare(), hat(), hat(True)

for b in range(NBARS):
    t0 = b * BAR
    ch = b % 4
    # --- kick pattern (16th grid); variation every 4th bar
    if drums_on(b):
        pat = [0, 0.75, 2.5] if b % 4 != 3 else [0, 0.75, 1.75, 2.5, 3.25]
        for s in pat:
            place(stems["kick"], K, t0 + s * BEAT, 1.0); events["kick"].append(t0 + s * BEAT)
        # half-time snare on beat 3 (+ ghost on 4th bar)
        place(stems["snare"], S, t0 + 2 * BEAT, 0.9); events["snare"].append(t0 + 2 * BEAT)
        if b % 4 == 3:
            place(stems["snare"], S, t0 + 3.75 * BEAT, 0.35)
    # --- hats: 8ths, with rolls; intro bar 1 builds, break keeps hats filtered
    if b >= 1 and b < 17:
        for e in range(8):
            s = e * 0.5
            roll = (b % 2 == 1 and e == 6) or (b % 4 == 3 and e in (3, 7))
            if roll:  # 1/16 triplets or 1/32 roll
                sub = 3 if b % 4 != 3 else 4
                for r in range(sub):
                    tt = t0 + (s + r * 0.5 / sub) * BEAT
                    place(stems["hats"], H, tt, 0.55 + 0.15 * r, pan=0.25 - 0.15 * r); events["hat"].append(tt)
            else:
                g = 0.75 if e % 2 == 0 else 0.5
                if b == 1: g *= 0.35 + 0.65 * e / 7  # build-up
                place(stems["hats"], H, t0 + s * BEAT, g, pan=0.18); events["hat"].append(t0 + s * BEAT)
        if drums_on(b) and b % 2 == 0:
            place(stems["hats"], HO, t0 + 3.5 * BEAT, 0.45, pan=-0.3)
    # --- 808: hits with the kick, glides into the next root; long slide in the break
    if b >= 2 and b < 17:
        f0, f1 = hz(BASS[ch]), hz(BASS[(ch + 1) % 4])
        hits = [0, 2.5] if b != 6 else [0]
        for j, s in enumerate(hits):
            start = t0 + s * BEAT
            dur = (BAR - s * BEAT) if j == len(hits) - 1 else (hits[j + 1] - s) * BEAT
            n = int(dur * SR); tt = np.arange(n) / SR
            f = np.full(n, f0)
            if j == len(hits) - 1:  # slide into next bar's root over the last 1/8 (break: a whole-bar octave dive)
                if b == 6:
                    f = f0 * 2 ** (1 - 1.0 * np.clip(tt / (dur * 0.85), 0, 1))  # one octave above, dives home
                    f = np.where(tt > dur * 0.85, f0 + (f1 - f0) * np.clip((tt - dur * 0.85) / (dur * 0.15), 0, 1), f)
                else:
                    g0 = dur - 0.5 * BEAT
                    f = np.where(tt > g0, f0 + (f1 - f0) * np.clip((tt - g0) / (0.35 * BEAT), 0, 1), f0)
            ph = 2 * np.pi * np.cumsum(f) / SR
            env = np.minimum(1, tt / 0.004) * np.exp(-tt / (1.4 if b == 6 else 0.6))
            x = np.tanh(2.2 * np.sin(ph) * env) * 0.75
            x[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))
            place(stems["808"], x, start, 0.95); events["808"].append(start)
    # --- pad: detuned saws, stereo spread, slow swell (all bars, filtered darker in intro)
    n = int(BAR * SR) + int(0.3 * SR); tt = np.arange(n) / SR
    L = np.zeros(n); R = np.zeros(n)
    for m in CHORDS[ch]:
        for d, side in ((-7, 0), (0, 0), (7, 1), (-3, 1), (4, 0)):
            f = hz(m) * 2 ** (d / 1200)
            saw = 2 * ((f * tt + rng.random()) % 1) - 1
            (L if side == 0 else R)[:] += saw
            if d == 0: R[:] += saw * 0.6
    env = np.minimum(1, tt / 0.35) * np.minimum(1, np.maximum(0, (n / SR - tt) / 0.3))
    cut = 900 if b < 2 else (1400 if b != 6 else 2400)
    pad = np.stack([lp(L, cut, 2), lp(R, cut, 2)], 1) * env[:, None] * 0.045
    i = int(t0 * SR); m_ = min(n, N - i)
    if m_ > 0:
        stems["pad"][i : i + m_] += pad[:m_]
    events["chord"].append(t0)
    # --- pluck hook from the drop on (not in break), ping-pong 3/16 delay
    if b >= 2 and b != 6 and b < 17:
        for s, m in MELODY[ch]:
            tt0 = t0 + s * BEAT
            p = pluck(hz(m))
            place(stems["pluck"], p, tt0, 1.0, pan=-0.1)
            for k in range(1, 4):
                place(stems["pluck"], lp(p, 2500), tt0 + k * 0.75 * BEAT, 0.42 ** k, pan=(0.7 if k % 2 else -0.7))

# stem levels + simple sidechain duck of pad/808 under the kick
kenv = np.zeros(N)
for t in events["kick"]:
    i = int(t * SR); n = min(int(0.25 * SR), N - i)
    kenv[i : i + n] = np.maximum(kenv[i : i + n], np.exp(-np.arange(n) / SR / 0.09))
duck = 1 - 0.45 * kenv
for k in ("pad", "pluck"):
    stems[k] *= duck[:, None]
stems["808"] *= (1 - 0.25 * kenv)[:, None]
mix_gain = {"kick": 0.9, "snare": 0.78, "hats": 1.1, "808": 0.48, "pad": 0.8, "pluck": 0.7}

os.makedirs(os.path.join(OUT, "stems"), exist_ok=True)
mix = np.zeros((N, 2))
for k, x in stems.items():
    sf.write(os.path.join(OUT, "stems", f"{k}.wav"), (x * mix_gain[k]).astype(np.float32), SR, subtype="FLOAT")
    mix += x * mix_gain[k]
mix *= 0.5 / np.max(np.abs(mix))
pre = os.path.join(OUT, "beat-30s-premaster.wav")
sf.write(pre, mix.astype(np.float32), SR, subtype="FLOAT")
for k in events:
    events[k] = sorted(round(v, 4) for v in events[k])
json.dump({"bpm": BPM, "bar": BAR, "key": "F# minor", "events": events}, open(os.path.join(OUT, "events.json"), "w"), indent=1)

# ---------------------------------------------------------------- master with ffmpeg
# glue comp -> gentle tilt EQ -> limiter; loudness to -14 LUFS happens on the final clip export.
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", pre, "-af",
                "acompressor=threshold=-18dB:ratio=2:attack=15:release=120:makeup=2,"
                "equalizer=f=60:t=q:w=0.8:g=1.5,equalizer=f=9000:t=q:w=0.7:g=1.0,"
                "alimiter=limit=0.89:attack=3:release=60:level=disabled",
                "-ar", str(SR), "-c:a", "pcm_s24le", os.path.join(OUT, "beat-30s.wav")], check=True)
print("ok", {k: len(v) for k, v in events.items()})
