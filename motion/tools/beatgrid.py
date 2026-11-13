"""Full-track analysis of a beat: exact beat grid, downbeat / bar 1, key, song structure.

  .venv/bin/python tools/beatgrid.py audio/atelmansion-3c-fmin-128.wav  ->  audio/<name>.grid.json

Grid method (librosa, ISC):
 1. librosa.beat.beat_track gives a first tempo / beat estimate.
 2. Precise kick onsets: low-band (30-150 Hz) spectral flux at 1.33 ms hop, peak-picked.
 3. Each kick is assigned to its nearest 16th-note slot of the rough grid; a least-squares fit of
    onset time vs slot index gives the exact period and phase (robust: 2 passes, outliers > 20 ms dropped).
 4. Bar phase (which beat is "1"): the beat offset whose bar lines best catch kicks on 1 and the
    biggest bar-to-bar energy changes (sections start on a 1).
Key: CQT chroma vs Krumhansl-Kessler profiles, all 24 keys; F minor vs C minor margin reported.
Structure: per-bar loudness (K-weighted) + low-band energy, grouped in 4-bar phrases, labelled by energy.
"""
import json, os, sys
import numpy as np
import soundfile as sf
import librosa
from scipy.signal import butter, sosfilt, stft

path = sys.argv[1]
y, SR = sf.read(path, always_2d=True)
mono = y.mean(1)
dur = len(mono) / SR

# 1. rough tempo
y22 = librosa.resample(mono, orig_sr=SR, target_sr=22050)
tempo, beats = librosa.beat.beat_track(y=y22, sr=22050, units="time", tightness=200)
tempo = float(np.atleast_1d(tempo)[0])

# 2. onset envelope at 2.67 ms resolution (hop 128 @ 48 kHz)
HOP = 128
env = librosa.onset.onset_strength(y=mono.astype(np.float32), sr=SR, hop_length=HOP, n_fft=2048, aggregate=np.median)
tt = librosa.times_like(env, sr=SR, hop_length=HOP)
def grid_score(bpm, ph):
    g = np.arange(ph, tt[-1], 60.0 / bpm)
    return float(np.interp(g, tt, env).mean() / env.mean())

# 3. tempo: librosa's estimate and its metrical relatives (2/3, 3/2, 2x, 1/2), plus the integer BPMs around them;
#    keep the tempo whose beat grid lands on the strongest onsets (phase searched at 1 ms), then fine-tune +-0.1 BPM
cands = set()
for k in (1, 2 / 3, 3 / 2, 2, 0.5, 4 / 3, 3 / 4):
    c = tempo * k
    if 60 <= c <= 200: cands |= {round(c, 3), float(round(c)), float(round(c) - 1), float(round(c) + 1)}
import re as _re  # a BPM written in the filename is a candidate too (it still has to win on the audio)
for m_ in _re.findall(r"(?<!\d)(\d{2,3})(?!\d)", os.path.basename(path)):
    if 60 <= int(m_) <= 200: cands.add(float(m_))
scored = []
for c in sorted(cands):
    sc, ph = max((grid_score(c, ph), ph) for ph in np.arange(0, 60 / c, 0.001))
    scored.append((sc, c, ph))
scored.sort(reverse=True)
_, bpm, ph = scored[0]
# metrical level: a half-time winner (< 90 BPM) yields to its double when the double still lands on strong onsets
for sc2, c2, ph2 in scored:
    if bpm < 90 and abs(c2 - 2 * bpm) < 0.6 and sc2 >= 0.5 * scored[0][0]:
        bpm, ph = c2, ph2
        break
fine = max((grid_score(b, q), b, q) for b in np.arange(bpm - 0.1, bpm + 0.1001, 0.01) for q in np.arange(max(0, ph - 0.01), ph + 0.01, 0.0002))
_, bpm, ph = fine
if abs(bpm - round(bpm)) < 0.03: bpm = float(round(bpm))
p = 60.0 / bpm
# phase refine: the strongest onset within +-35 ms of each grid beat (parabolic peak), median offset
def local_peak(t0, win=0.025):
    i0, i1 = np.searchsorted(tt, t0 - win), np.searchsorted(tt, t0 + win)
    if i1 - i0 < 3: return None
    i = i0 + int(np.argmax(env[i0:i1]))
    if env[i] < 5 * np.median(env): return None
    if 0 < i < len(env) - 1:
        d = 0.5 * (env[i - 1] - env[i + 1]) / (env[i - 1] - 2 * env[i] + env[i + 1] + 1e-12)
    else: d = 0
    return float(tt[i] + d * (tt[1] - tt[0]))
# phase refine, sample-accurate: on every beat the high band (> 1.5 kHz) has a transient (hat/clap/click layer).
# Its attack time = first sample where the 0.3 ms envelope crosses 50 % of its local peak within +-30 ms.
hpx = sosfilt(butter(4, 1500, "high", fs=SR, output="sos"), mono)
envx = np.convolve(np.abs(hpx), np.ones(int(0.0003 * SR)) / int(0.0003 * SR), "same")
def attack(t0, win=0.03):
    i0, i1 = int((t0 - win) * SR), int((t0 + win) * SR)
    if i0 < 0 or i1 >= len(envx): return None
    seg = envx[i0:i1]; pk = seg.max()
    if pk < 4 * np.median(envx[max(0, i0 - SR // 4):i1]): return None
    j = int(np.argmax(seg >= 0.5 * pk))
    return (i0 + j) / SR
grid = np.arange(ph % p, dur - 0.05, p)
offs = [a_ - g for g in grid if (a_ := attack(g)) is not None]
med = float(np.median(offs))
grid = grid + med
offs2 = [a_ - g for g in grid if (a_ := attack(g, 0.02)) is not None]
med2 = float(np.median(offs2))
phase0 = float(grid[0] + med2)
res = np.array(offs2) - med2
fit_rms, n_fit = float(np.sqrt(np.mean(res ** 2))), len(offs2)
beat0 = phase0 % p
kicks = [(g + o, 1.0) for g, o in zip(grid, offs2)]  # on-beat transients (used for bar phase and the grid check)

# 4. downbeat: bar-line offset (0..3 beats)
nb = int((dur - beat0) / p) + 1
beat_times = beat0 + np.arange(nb) * p
kweight_sos = [butter(2, 38, "high", fs=SR, output="sos"), None]
lowE = sosfilt(butter(2, 150, "low", fs=SR, output="sos"), mono) ** 2
allE = mono ** 2
def seg_db(sig, a, b):
    i0, i1 = int(max(0, a) * SR), int(min(dur, b) * SR)
    return 10 * np.log10(sig[i0:i1].mean() + 1e-12) if i1 > i0 else -120
kick_set = np.array([t for t, s in kicks])
scores = []
# Per-beat energy; big beat-to-beat changes mark section boundaries. In this style sections START with a drop-out
# on the "1" and often re-enter on a beat-4 pickup, so energy DROPS count fully and RISES count half. The track's
# first sounding beat (DAW exports start on bar 1) is worth a 10 dB bonus.
beatE = np.array([seg_db(allE, b, b + p) for b in beat_times])
dE = np.diff(beatE)
thr = np.percentile(np.abs(dE), 95)
first_sound = int(np.argmax(beatE > -50))
for off in range(4):
    sc = 0.0
    for i, d in enumerate(dE):
        bi = i + 1
        if abs(d) >= thr and bi % 4 == off: sc += abs(d) * (1.0 if d < 0 else 0.5)
    sc += 10.0 if first_sound % 4 == off else 0.0
    k1 = sum(np.min(np.abs(kick_set - b)) < 0.03 for b in beat_times[off::4]) / len(beat_times[off::4])
    scores.append((sc, off, round(k1, 3), round(sc, 2)))
scores.sort(reverse=True)
off = scores[0][1]
bar0 = beat_times[off]           # first downbeat in the file
bars = bar0 + np.arange(int((dur - bar0) / (4 * p)) + 1) * 4 * p
# bar 1 = first downbeat where the music has started (energy above -50 dB)
start_idx = next(i for i, b in enumerate(bars) if seg_db(allE, b, b + 4 * p) > -50)

# grid check vs ALL kick onsets (strong ones): error to nearest 16th
ks = np.array([t for t, s in kicks])
g16 = beat0 + np.round((ks - beat0) / p) * p
err_ms = np.abs(ks - g16) * 1000

# key (Krumhansl-Kessler)
chroma = librosa.feature.chroma_cqt(y=y22, sr=22050).mean(1)
maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
mnr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
keys = []
for i in range(12):
    keys.append((float(np.corrcoef(np.roll(maj, i), chroma)[0, 1]), f"{NAMES[i]} MAJ"))
    keys.append((float(np.corrcoef(np.roll(mnr, i), chroma)[0, 1]), f"{NAMES[i]} MIN"))
keys.sort(reverse=True)
kd = dict((n, s) for s, n in keys)
margin = kd["F MIN"] - kd["C MIN"]
key = keys[0][1]
key_note = ""
if key not in ("F MIN", "C MIN") or abs(margin) < 0.05:
    key_note = f"ambiguous (top {keys[0][1]} {keys[0][0]:.3f}; F MIN {kd['F MIN']:.3f} vs C MIN {kd['C MIN']:.3f}) -> default F MIN"
    key = "F MIN"

# structure: per-bar loudness + low end, 4-bar phrases
K = sosfilt(butter(2, 100, "high", fs=SR, output="sos"), mono)
bar_rows = []
for i, b in enumerate(bars):
    if b + 4 * p > dur + 0.01: break
    bar_rows.append({"bar": i - start_idx + 1, "t": round(float(b), 4), "db": round(seg_db(allE, b, b + 4 * p), 2),
                     "low": round(seg_db(lowE, b, b + 4 * p), 2),
                     "kicks": int(sum(1 for t in ks if b <= t < b + 4 * p))})
dbs = np.array([r["db"] for r in bar_rows]); lows = np.array([r["low"] for r in bar_rows])
hi = np.percentile(dbs, 70)
for r in bar_rows:
    r["energy"] = round(float(np.clip((r["db"] - (dbs.max() - 18)) / 18, 0, 1)), 3)
# group into 4-bar phrases aligned to bar 1 and label
phr = []
first = [r for r in bar_rows if r["bar"] >= 1]
for j in range(0, len(first), 4):
    g = first[j:j + 4]
    e = float(np.mean([r["energy"] for r in g])); lo = float(np.mean([r["low"] for r in g])); kk = sum(r["kicks"] for r in g)
    phr.append({"bar": g[0]["bar"], "t": g[0]["t"], "bars": len(g), "energy": round(e, 3), "low": round(lo, 2), "kicks": kk})
# label by energy relative to the loudest phrase: drop >= 0.93, mid 0.8-0.93 (build before a drop, else groove),
# low: intro before the first drop, outro after the last, break in between
emax = max(q["energy"] for q in phr) or 1
drops = [i for i, q in enumerate(phr) if q["energy"] >= 0.93 * emax]
for i, q in enumerate(phr):
    e = q["energy"] / emax
    if e >= 0.93: lab = "drop"
    elif e >= 0.8: lab = "build" if (i + 1) in drops else "groove"
    elif drops and i < drops[0]: lab = "intro"
    elif drops and i > drops[-1]: lab = "outro"
    else: lab = "break"
    q["label"] = lab
out = {
    "file": os.path.basename(path), "duration": round(dur, 4), "sr": SR,
    "bpm": round(bpm, 4), "beat": p, "tempoCandidates": [[round(c, 3), round(sc, 2)] for sc, c, _ in scored[:5]], "beat0": round(float(beat0), 6),
    "bar1": round(float(bars[start_idx]), 6), "downbeatOffsetBeats": int(off), "downbeatScores": [[o, sc] for _, o, _k, sc in scores],
    "librosaTempo": round(tempo, 3), "fit": {"kicks": n_fit, "rmsMs": round(fit_rms * 1000, 3)},
    "onsetVsGridMs": {"n": int(len(err_ms)), "max": round(float(err_ms.max()), 2), "p95": round(float(np.percentile(err_ms, 95)), 2), "mean": round(float(err_ms.mean()), 2)},
    "key": key, "keyNote": key_note, "keyTop": [[n, round(s, 3)] for s, n in keys[:4]], "keyFvsC": round(margin, 4),
    "bars": bar_rows, "phrases": phr,
}
dst = os.path.join(os.path.dirname(os.path.abspath(path)), os.path.splitext(os.path.basename(path))[0] + ".grid.json")
json.dump(out, open(dst, "w"), indent=1)
print(f"BPM {out['bpm']} (librosa {tempo:.2f}); beat0 {beat0:.4f}s; bar1 {out['bar1']:.4f}s (offset {off}); fit rms {fit_rms*1000:.2f} ms over {n_fit} kicks")
print(f"on-beat onsets vs grid: max {err_ms.max():.2f} ms, p95 {np.percentile(err_ms,95):.2f} ms (n={len(err_ms)})")
print(f"key {key} {key_note} top={out['keyTop']}")
print("phrases:", " ".join(f"{q['bar']}:{q['label']}({q['energy']})" for q in phr))
print("wrote", dst)
