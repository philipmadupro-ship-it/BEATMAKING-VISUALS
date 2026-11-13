"""Offline audio analysis -> per-frame data for the composition.

1. Beat tracking + onset detection on the full 30 s beat (spectral flux per band).
2. Picks the best 15 s window (starts on a downbeat; strongest hit lands at 1-2 s; energy + contrast).
3. Cuts and loudness-normalises the clip with ffmpeg (two-pass loudnorm, -14 LUFS / -1 dBTP).
4. Measures the final clip per video frame (30 fps): peak/RMS L/R with hold, momentary / short-term /
   integrated LUFS (BS.1770 K-weighting + gating), true peak (4x), log spectrum + peak hold, band levels,
   EQ envelope vs pink, correlation + vectorscope points, band-coloured waveform overview, onsets, 808 pitch.
5. Writes film/assets/analysis.js (window.U2C_DATA) and film/assets/clip.wav; prints a validation report
   (LUFS vs ffmpeg ebur128, onsets vs the synth's ground-truth events).

Usage: .venv/bin/python tools/analyze.py [--src audio/beat-30s.wav] [--len 15] [--fps 30]
"""
import argparse, json, os, re, subprocess
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, lfilter, resample_poly, stft

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--src", default=os.path.join(ROOT, "audio", "beat-30s.wav"))
ap.add_argument("--len", type=float, default=15.0)
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--lufs", type=float, default=-14.0)
args = ap.parse_args()
FPS, CLIP = args.fps, args.len

x, SR = sf.read(args.src, always_2d=True)
mono = x.mean(1)


# ------------------------------------------------------------------ onset / beat analysis
def band_flux(sig, sr, lo, hi, hop=128, n=1024, log=True):
    """Half-wave rectified spectral flux in [lo, hi) Hz, time-corrected to the onset (not the frame centre)."""
    f, t, Z = stft(sig, sr, nperseg=n, noverlap=n - hop, boundary=None, padded=False)
    m = np.abs(Z[(f >= lo) & (f < hi)])
    if log: m = np.log1p(30 * m)
    fl = np.maximum(0, np.diff(m, axis=1)).sum(0)
    fl = np.concatenate([[0], fl])
    return t - n / 2 / sr + hop / sr, fl / (fl.max() + 1e-9)


def peaks(t, env, thr, min_gap, w=4):
    out = []
    for i in range(w, len(env) - w):
        if env[i] >= thr and env[i] == env[i - w : i + w + 1].max():
            if not out or t[i] - out[-1][0] >= min_gap:
                out.append((float(t[i]), float(env[i])))
    return out


# thresholds tuned once against the synth's ground-truth events (see report at the end)
tk, fk = band_flux(mono, SR, 30, 150, log=False)      # kick: linear low-band flux ignores the 808's slow swells
ts, fs_ = band_flux(mono, SR, 1000, 5000)              # snare/clap: mid-band noise burst
th, fh = band_flux(mono, SR, 7000, 16000, hop=64, n=512)
_, fall = band_flux(mono, SR, 30, 16000, hop=256, n=2048)
kicks = peaks(tk, fk, 0.5, 0.1)
snares = peaks(ts, fs_, 0.45, 0.2)
hats = [(t, s) for t, s in peaks(th, fh, 0.2, 0.035) if all(abs(t - k) > 0.025 for k, _ in snares)]

# tempo: autocorrelation of the full-band onset envelope in 60-200 BPM
hop_t = 256 / SR
ac = np.correlate(fall - fall.mean(), fall - fall.mean(), "full")[len(fall) - 1 :]
lags = np.arange(len(ac)) * hop_t
sel = (lags > 60 / 200) & (lags < 60 / 60)
cands = []
for i in np.where(sel)[0][1:-1]:
    if ac[i] > ac[i - 1] and ac[i] > ac[i + 1]:
        # parabolic refinement
        d = 0.5 * (ac[i - 1] - ac[i + 1]) / (ac[i - 1] - 2 * ac[i] + ac[i + 1])
        cands.append((ac[i], 60 / ((i + d) * hop_t)))
cands.sort(reverse=True)
bpm = cands[0][1]
# prefer the 120-160 octave a trap producer would label
while bpm < 115: bpm *= 2
while bpm > 170: bpm /= 2
bpm = round(bpm * 2) / 2  # 0.5 BPM grid (producers label integer BPM; keep half for safety)
beat = 60 / bpm
# downbeat phase: the bar offset whose grid best catches kicks on beat 1 and snares on beat 3 (half-time)
best = None
for ph in np.arange(0, 4 * beat, 0.005):
    sc = 0
    for t, s in kicks:
        r = ((t - ph) / beat) % 4
        sc += s * (1.0 if min(r, 4 - r) < 0.06 else 0)
    for t, s in snares:
        r = ((t - ph) / beat) % 4
        sc += s * (1.0 if abs(r - 2) < 0.06 else 0)
    if best is None or sc > best[0]:
        best = (sc, ph)
phase = best[1]
bars = [phase + i * 4 * beat for i in range(-1, 40) if 0 <= phase + i * 4 * beat < len(mono) / SR]
bars = [b for b in bars if b >= -1e-6]

# ------------------------------------------------------------------ choose the 15 s window
rms_env = np.sqrt(np.convolve(mono ** 2, np.ones(SR // 10) / (SR // 10), "same"))
cands = []
for b in bars:
    if b + CLIP > len(mono) / SR + 1e-6: break
    i0, i1 = int(b * SR), int((b + CLIP) * SR)
    energy = rms_env[i0:i1].mean()
    hit = max([s for t, s in kicks if 0.9 <= t - b <= 2.2] + [0])
    early = max([s for t, s in kicks if 0 <= t - b < 0.9] + [0])  # intro bar should breathe before the drop
    seg = rms_env[i0:i1]
    contrast = np.percentile(seg, 90) / (np.percentile(seg, 10) + 1e-6)
    score = energy / rms_env.max() + 0.8 * hit - 0.4 * early + 0.05 * min(contrast, 6)
    cands.append((score, b, energy, hit, early, contrast))
cands.sort(reverse=True)
start = cands[0][1]

# ------------------------------------------------------------------ cut + loudness normalise (two-pass)
AUD = os.path.join(ROOT, "audio")
raw = os.path.join(AUD, "clip-15s-raw.wav")
sf.write(raw, x[int(start * SR) : int(start * SR) + int(CLIP * SR)].astype(np.float32), SR, subtype="FLOAT")
p = subprocess.run(["ffmpeg", "-hide_banner", "-i", raw, "-af", f"loudnorm=I={args.lufs}:TP=-1:LRA=11:print_format=json",
                    "-f", "null", "-"], capture_output=True, text=True).stderr
m = json.loads(p[p.rindex("{") : p.rindex("}") + 1])
clip_path = os.path.join(AUD, "clip-15s.wav")
af = (f"loudnorm=I={args.lufs}:TP=-1:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
      f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,"
      f"afade=t=out:st={CLIP - 0.04}:d=0.04")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", af, "-ar", str(SR), "-c:a", "pcm_s24le", clip_path], check=True)
y, _ = sf.read(clip_path, always_2d=True)
y = y[: int(CLIP * SR)]
L, R = y[:, 0], y[:, 1]
# re-detect onsets on the final clip (normalisation relative to the clip, exact clip times)
_m = y.mean(1)
_t, _e = band_flux(_m, SR, 30, 150, log=False); kicks = [(t + start, s) for t, s in peaks(_t, _e, 0.5, 0.1)]
_t, _e = band_flux(_m, SR, 1000, 5000); snares = [(t + start, s) for t, s in peaks(_t, _e, 0.45, 0.2)]
_t, _e = band_flux(_m, SR, 7000, 16000, hop=64, n=512)
hats = [(t + start, s) for t, s in peaks(_t, _e, 0.2, 0.035) if all(abs(t + start - k) > 0.025 for k, _ in snares)]
M = 0.5 * (L + R)
NF = int(round(CLIP * FPS))
db = lambda v: 20 * np.log10(np.maximum(v, 1e-9))


# ------------------------------------------------------------------ BS.1770 loudness
def kweight(sig):
    # coefficients for 48 kHz from ITU-R BS.1770-4
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, sig))


assert SR == 48000, "K-weighting coefficients are for 48 kHz"
kL, kR = kweight(L), kweight(R)
pw = kL ** 2 + kR ** 2


def lufs_win(i_end, win):
    i0 = max(0, i_end - int(win * SR))
    if i_end - i0 < 10: return -70.0
    return -0.691 + 10 * np.log10(max(pw[i0:i_end].mean(), 1e-12))


# 400 ms blocks with 75 % overlap for gating
blk = int(0.4 * SR); step = int(0.1 * SR)
blocks = [(i + blk, -0.691 + 10 * np.log10(max(pw[i : i + blk].mean(), 1e-12))) for i in range(0, len(pw) - blk + 1, step)]


def integrated(i_end):
    bl = [l for e, l in blocks if e <= i_end and l > -70]
    if not bl: return -70.0
    rel = 10 * np.log10(np.mean([10 ** (l / 10) for l in bl])) - 10
    g = [l for l in bl if l > rel]
    return 10 * np.log10(np.mean([10 ** (l / 10) for l in g])) if g else -70.0


# true peak: 4x oversampled
tpL, tpR = np.abs(resample_poly(L, 4, 1)), np.abs(resample_poly(R, 4, 1))

# ------------------------------------------------------------------ per-frame features
NB = 96
fmin, fmax = 20.0, 20000.0
edges = fmin * (fmax / fmin) ** (np.arange(NB + 1) / NB)
NFFT = 8192
win = np.hanning(NFFT)
wsum = win.sum()
freqs = np.fft.rfftfreq(NFFT, 1 / SR)
bin_idx = [np.where((freqs >= edges[i]) & (freqs < edges[i + 1]))[0] for i in range(NB)]
centers = np.sqrt(edges[:-1] * edges[1:])
BANDS = {"sub": (20, 60), "low": (60, 150), "lowmid": (150, 500), "mid": (500, 2000), "high": (2000, 6000), "air": (6000, 20000)}
EQF = [40, 90, 250, 1000, 4000, 12000]

fr = {k: [] for k in ("pkL", "pkR", "rmsL", "rmsR", "lufsM", "lufsS", "lufsI", "tp", "corr", "width", "spec", "bands", "f0", "eq")}
vs = []
hold = {"L": [-90, 0], "R": [-90, 0]}
hlL, hlR = [], []
spec_s = np.full(NB, -100.0)
spec_hold = np.full(NB, -100.0); spec_hold_age = np.zeros(NB)
holds = []
eq_s = None
dt = 1 / FPS
for f in range(NF):
    t = f / FPS
    c = int(t * SR)
    a, b = max(0, c - SR // FPS), min(len(L), c + 1)
    a = min(a, b - 1)
    pL, pR = db(np.abs(L[a:b]).max()), db(np.abs(R[a:b]).max())
    for ch, pv, out in (("L", pL, hlL), ("R", pR, hlR)):
        hv, age = hold[ch]
        if pv >= hv: hv, age = pv, 0
        else:
            age += dt
            if age > 1.2: hv = max(pv, hv - 18 * dt)  # 1.2 s hold then 18 dB/s fall
        hold[ch] = [hv, age]; out.append(round(hv, 2))
    fr["pkL"].append(round(pL, 2)); fr["pkR"].append(round(pR, 2))
    r0 = max(0, c - int(0.3 * SR))
    seg = slice(r0, max(c, r0 + 1))
    fr["rmsL"].append(round(db(np.sqrt(np.mean(L[seg] ** 2))), 2)); fr["rmsR"].append(round(db(np.sqrt(np.mean(R[seg] ** 2))), 2))
    fr["lufsM"].append(round(lufs_win(c, 0.4), 2)); fr["lufsS"].append(round(lufs_win(c, 3.0), 2)); fr["lufsI"].append(round(integrated(c), 2))
    fr["tp"].append(round(db(max(tpL[: 4 * c + 1].max(), tpR[: 4 * c + 1].max())), 2))
    w0 = max(0, c - int(0.05 * SR)); sl = slice(w0, max(c, w0 + 16))
    l_, r_ = L[sl], R[sl]
    den = np.sqrt((l_ ** 2).sum() * (r_ ** 2).sum())
    fr["corr"].append(round(float((l_ * r_).sum() / den) if den > 1e-12 else 1.0, 3))
    mid, side = (l_ + r_) / 2, (l_ - r_) / 2
    fr["width"].append(round(float(np.sqrt((side ** 2).mean() / max((mid ** 2).mean(), 1e-12))), 3))
    # vectorscope: 192 points from the last 60 ms, rotated M/S, int8
    v0 = max(0, c - int(0.06 * SR)); idx = np.linspace(v0, max(c - 1, v0), 192).astype(int)
    pts = np.stack([(L[idx] - R[idx]) / np.sqrt(2), (L[idx] + R[idx]) / np.sqrt(2)], 1)
    vs.append(np.clip(np.round(pts * 127 / 0.9), -127, 127).astype(int).ravel().tolist())
    # spectrum (mono), calibrated so a full-scale sine reads 0 dBFS
    s0 = c - NFFT // 2
    frame = np.zeros(NFFT)
    lo, hi = max(0, s0), min(len(M), s0 + NFFT)
    if hi > lo: frame[lo - s0 : hi - s0] = M[lo:hi]
    mag = np.abs(np.fft.rfft(frame * win)) * 2 / wsum
    sp = np.array([db(mag[ix].max()) if len(ix) else -100 for ix in bin_idx])
    # fill empty low bins by interpolation
    for i in range(NB):
        if not len(bin_idx[i]):
            sp[i] = db(np.interp(centers[i], freqs, mag))
    # ballistics: instant attack, 24 dB/s release; peak hold 1 s then 12 dB/s
    spec_s = np.where(sp > spec_s, sp, np.maximum(sp, spec_s - 24 * dt))
    upd = spec_s >= spec_hold
    spec_hold_age = np.where(upd, 0, spec_hold_age + dt)
    spec_hold = np.where(upd, spec_s, np.where(spec_hold_age > 1.0, np.maximum(spec_s, spec_hold - 12 * dt), spec_hold))
    fr["spec"].append(np.round(spec_s, 1).tolist()); holds.append(np.round(spec_hold, 1).tolist())
    # band energies (linear power from the spectrum)
    pw_ = (mag ** 2)
    fr["bands"].append([float(pw_[(freqs >= lo_) & (freqs < hi_)].sum()) for lo_, hi_ in BANDS.values()])
    # 808 f0: strongest peak 28-120 Hz, parabolic interpolation
    sel_ = np.where((freqs >= 28) & (freqs <= 120))[0]
    k = sel_[np.argmax(mag[sel_])]
    d = 0.5 * (mag[k - 1] - mag[k + 1]) / (mag[k - 1] - 2 * mag[k] + mag[k + 1] + 1e-12)
    fr["f0"].append(round(float((k + d) * SR / NFFT), 2) if mag[k] > 0.01 else 0)
    # EQ envelope: 1/3-oct smoothed level at EQF relative to a pink (-3 dB/oct) reference through 1 kHz
    lv = []
    for fc in EQF:
        ix = (freqs >= fc / 2 ** (1 / 6)) & (freqs < fc * 2 ** (1 / 6))
        lv.append(10 * np.log10(max(pw_[ix].sum(), 1e-14)) + 3 * np.log2(fc / 1000))
    lv = np.array(lv)
    eq_s = lv if eq_s is None else eq_s + (lv - eq_s) * (1 - np.exp(-dt / 0.35))
    fr["eq"].append(np.round(eq_s - eq_s.mean(), 2).tolist())

bands = np.array(fr["bands"])
bands = np.sqrt(bands / np.percentile(bands, 98, axis=0)[None, :])  # amplitude-like, 0..~1
fr["bands"] = np.round(np.clip(bands, 0, 1.5), 3).tolist()

# waveform overview (Aurora-style band colouring): min/max per column + low/high ratio
COLS = 900
cw = len(L) // COLS
lowL = sosfilt(butter(2, 200, "low", fs=SR, output="sos"), M)
wave = {"L": [], "R": [], "tone": []}
for i in range(COLS):
    s = slice(i * cw, (i + 1) * cw)
    wave["L"].append([round(float(L[s].min()), 3), round(float(L[s].max()), 3)])
    wave["R"].append([round(float(R[s].min()), 3), round(float(R[s].max()), 3)])
    tot = np.sqrt((M[s] ** 2).mean()) + 1e-9
    wave["tone"].append(round(float(np.sqrt((lowL[s] ** 2).mean()) / tot), 3))  # 1 = all low end, 0 = bright

# onsets inside the clip (re-run on the clip so times are exact)
def clip_events(lst):
    return [[round(t - start, 3), round(s, 3)] for t, s in lst if 0 <= t - start < CLIP]

events_gt = json.load(open(os.path.join(AUD, "events.json")))["events"] if os.path.exists(os.path.join(AUD, "events.json")) else None

data = {
    "fps": FPS, "frames": NF, "duration": CLIP, "sr": SR, "srcStart": round(start, 4),
    "bpm": bpm, "beat": round(beat, 6), "key": "F# MIN",
    "firstDownbeat": round((phase - start) % (4 * beat), 4),
    "onsets": {"kick": clip_events(kicks), "snare": clip_events(snares), "hat": clip_events(hats)},
    "spectrum": {"bins": NB, "fmin": fmin, "fmax": fmax, "centers": np.round(centers, 1).tolist()},
    "bandNames": list(BANDS), "eqFreqs": EQF,
    "frame": fr, "specHold": holds, "peakHoldL": hlL, "peakHoldR": hlR, "vectorscope": vs, "wave": wave,
}
# summary numbers for readouts
loud = subprocess.run(["ffmpeg", "-hide_banner", "-i", clip_path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
I_ff = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", loud)[-1])
TP_ff = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", loud)[-1])
data["summary"] = {"lufsI": fr["lufsI"][-1], "truePeak": fr["tp"][-1], "ffmpegI": I_ff, "ffmpegTP": TP_ff}

out = os.path.join(ROOT, "film", "assets", "analysis.js")
with open(out, "w") as fh:
    fh.write("window.U2C_DATA=" + json.dumps(data, separators=(",", ":")) + ";\n")
subprocess.run(["cp", clip_path, os.path.join(ROOT, "film", "assets", "clip.wav")], check=True)

# ------------------------------------------------------------------ report
def score(det, gt, tol=0.035):
    gt = [g - start for g in gt if 0 <= g - start < CLIP]
    det = [d for d, _ in det]
    tp = sum(1 for g in gt if any(abs(g - d) <= tol for d in det))
    prec = sum(1 for d in det if any(abs(g - d) <= tol for g in gt)) / max(len(det), 1)
    return f"recall {tp}/{len(gt)}  precision {prec:.2f}"

print(f"tempo {bpm} BPM (true 142)  downbeat phase {phase:.3f}s  windows considered {len(cands)}")
for c in cands[:4]:
    print(f"  start {c[1]:6.3f}s score {c[0]:.3f} energy {c[2]:.3f} drop-hit {c[3]:.2f} early {c[4]:.2f}")
print(f"chosen window {start:.3f}-{start + CLIP:.3f}s  (bar {round(start / (4 * beat)) + 1} of the 30 s beat)")
print(f"loudness: ours I={fr['lufsI'][-1]} LUFS TP={fr['tp'][-1]} dBTP | ffmpeg I={I_ff} TP={TP_ff}")
if events_gt:
    print("kick ", score(data['onsets']['kick'], events_gt["kick"]))
    print("snare", score(data['onsets']['snare'], events_gt["snare"]))
    print("hat  ", score(data['onsets']['hat'], events_gt["hat"]))
print("wrote", out, f"{os.path.getsize(out) / 1e6:.1f} MB")
