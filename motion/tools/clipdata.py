"""Build one render's audio + data: pick the section, master it, measure every frame.

  .venv/bin/python tools/clipdata.py --beat audio/x.wav --len 30 --id nigredo-916-30 [--start-bar N] [--fps 30]
    -> film/data/<id>.js (window.U2C_DATA), film/data/<id>.wav (mastered clip), prints a summary

Section choice: lengths are whole bars (128 BPM: 15 s = 8 bars, 30 s = 16, 60 s = 32). The clip starts on a downbeat
one bar before a drop (so the drop hits at bar 2 = 1.875 s), earliest drop that fits; otherwise the loudest
phrase-aligned window. Ends on a bar line, so the loop seam is bar-clean.
Master: static gain to -14 LUFS integrated; if that would push true peak above -1 dBTP, a 4x-oversampled limiter
holds -1.2 dBTP, then the gain is re-trimmed to land on -14.0 (two iterations).
"""
import argparse, base64, json, os, subprocess, sys
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, stft
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meters as M

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--beat", required=True); ap.add_argument("--len", type=float, default=30); ap.add_argument("--id", required=True)
ap.add_argument("--start-bar", type=int); ap.add_argument("--fps", type=int, default=30); ap.add_argument("--title")
ap.add_argument("--lufs", type=float, default=-14.0); ap.add_argument("--tp", type=float, default=-1.0)
a = ap.parse_args()
FPS = a.fps
gpath = os.path.splitext(a.beat)[0] + ".grid.json"
if not os.path.exists(gpath):
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "beatgrid.py"), a.beat], check=True)
G = json.load(open(gpath))
x, SR = sf.read(a.beat, always_2d=True)
if SR != M.SR:
    from scipy.signal import resample_poly
    x = resample_poly(x, M.SR, SR, axis=0); SR = M.SR
p = G["beat"]; BAR = 4 * p
nbars = max(1, int(round(a.len / BAR)))
bar_t = lambda b: G["bar1"] + (b - 1) * BAR         # song bar number (1-based) -> seconds
last_bar = int((G["duration"] - G["bar1"]) / BAR)    # number of whole bars in the file

# ---------------------------------------------------------------- section choice
phr = G["phrases"]
if a.start_bar:
    S = a.start_bar
else:
    S = None
    for q in phr:
        if q["label"] == "drop":
            s0 = max(1, q["bar"] - 1)
            if s0 + nbars - 1 <= last_bar:
                S = s0; break
    if S is None:
        rows = [r for r in G["bars"] if r["bar"] >= 1]
        best = max(range(1, last_bar - nbars + 2, 4), key=lambda b: np.mean([r["energy"] for r in rows if b <= r["bar"] < b + nbars]))
        S = best
t0 = bar_t(S); i0 = int(round(t0 * SR)); n = int(round(nbars * BAR * SR))
clip = x[i0:i0 + n].copy()
if len(clip) < n: clip = np.concatenate([clip, np.zeros((n - len(clip), 2))])
fade = int(0.005 * SR)                               # 5 ms click guard at the seams (audio only)
clip[:fade] *= np.linspace(0, 1, fade)[:, None]; clip[-fade:] *= np.linspace(1, 0, fade)[:, None]

# ---------------------------------------------------------------- master: -14 LUFS / -1 dBTP
def limiter4x(y, ceil_db):
    """Look-ahead peak limiter on the 4x oversampled signal (true-peak safe), 1.5 ms attack, 60 ms release."""
    from scipy.signal import resample_poly
    up = resample_poly(y, 4, 1, axis=0); c = 10 ** (ceil_db / 20)
    pk = np.abs(up).max(1)
    need = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    la = int(0.0015 * SR * 4)
    g = np.minimum.accumulate(np.lib.stride_tricks.sliding_window_view(np.concatenate([need, np.ones(la)]), la + 1).min(1)[::-1])[::-1] if False else None
    # running min over the look-ahead window, then smooth release
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * la + 1, origin=0)
    rel = np.exp(-1 / (0.06 * SR * 4)); out = np.empty_like(g); cur = 1.0
    for i, v in enumerate(g):
        cur = v if v < cur else v + (cur - v) * rel
        out[i] = cur
    return resample_poly(up * out[:, None], 1, 4, axis=0)

y = clip
for it in range(3):
    L = M.Loudness(y); I = L.integrated()
    y = y * 10 ** ((a.lufs - I) / 20)
    tp = float(M.db(M.true_peak_trace(y).max()))
    if tp > a.tp - 0.05:
        y = limiter4x(y, a.tp - 0.25)
    else:
        break
L = M.Loudness(y); I = L.integrated(); y = y * 10 ** ((a.lufs - I) / 20)
os.makedirs(os.path.join(ROOT, "film", "data"), exist_ok=True)
wav = os.path.join(ROOT, "film", "data", a.id + ".wav")
sf.write(wav, y.astype(np.float32), SR, subtype="FLOAT")

# ---------------------------------------------------------------- per-frame measurement
Lc, Rc = y[:, 0], y[:, 1]; mono = y.mean(1)
L = M.Loudness(y); TPt = M.true_peak_trace(y).max(1); TPc = np.maximum.accumulate(TPt)
NF = int(round(nbars * BAR * FPS)); dt = 1 / FPS
pmL, pmR = M.PeakMeter(FPS), M.PeakMeter(FPS)
fr = {k: [] for k in ("pkL", "pkR", "hlL", "hlR", "rmsL", "rmsR", "M", "S", "I", "LRA", "TP", "corr", "width", "bands", "bal", "tilt", "spec", "hold")}
BANDS = [(20, 60), (60, 150), (150, 500), (500, 2000), (2000, 6000), (6000, 20000)]
spec_s = np.full(len(M.OCT6), -100.0); hold = spec_s.copy(); hage = np.zeros(len(M.OCT6))
corr_s = 1.0; spectro = np.zeros((NF, M.SPEC_BINS), np.uint8); gonio = np.zeros((NF, 160), np.int8)
band_raw = []
for f in range(NF):
    c = int(round(f * dt * SR)); a0 = max(0, c - int(SR * dt)); seg = slice(a0, max(c, a0 + 1))
    bl, pl = pmL.step(float(M.db(np.abs(Lc[seg]).max()))); br, pr = pmR.step(float(M.db(np.abs(Rc[seg]).max())))
    fr["pkL"].append(round(bl, 1)); fr["pkR"].append(round(br, 1)); fr["hlL"].append(round(pl, 1)); fr["hlR"].append(round(pr, 1))
    r0 = max(0, c - int(0.3 * SR)); rs = slice(r0, max(c, r0 + 1))
    fr["rmsL"].append(round(M.rms_db(Lc[rs]), 1)); fr["rmsR"].append(round(M.rms_db(Rc[rs]), 1))
    mm, ss = L.momentary(c), L.short_term(c)
    fr["M"].append(round(mm, 1) if np.isfinite(mm) else -99); fr["S"].append(round(ss, 1) if np.isfinite(ss) else -99)
    ii = L.integrated(c); fr["I"].append(round(ii, 1) if np.isfinite(ii) else -99)
    fr["LRA"].append(round(L.lra(c), 1)); fr["TP"].append(round(float(M.db(TPc[min(len(TPc) - 1, 4 * c)])), 1) if c else -99)
    w0 = max(0, c - int(0.1 * SR)); ws = slice(w0, max(c, w0 + 32))
    corr_s += (M.correlation(Lc[ws], Rc[ws]) - corr_s) * (1 - np.exp(-dt / 0.3))
    fr["corr"].append(round(corr_s, 3)); fr["width"].append(round(M.width(Lc[ws], Rc[ws]), 3))
    P = M.power_spectrum(M.frame_at(mono, c))
    lv = M.band_levels(P, M.OCT6_EDGES)
    spec_s = np.where(lv > spec_s, lv, np.maximum(lv, spec_s - 24 * dt))
    up = spec_s >= hold; hage = np.where(up, 0, hage + dt)
    hold = np.where(up, spec_s, np.where(hage > 1.0, np.maximum(spec_s, hold - 12 * dt), hold))
    fr["spec"].append([int(round(v)) for v in np.clip(spec_s, -99, 0)]); fr["hold"].append([int(round(v)) for v in np.clip(hold, -99, 0)])
    col = M.spectrogram_column(P); spectro[f] = np.clip((col + 100) * 255 / 100, 0, 255).astype(np.uint8)
    rel, tilt = M.balance_vs_pink(P); fr["bal"].append([round(v, 1) for v in np.clip(rel, -24, 24)]); fr["tilt"].append(round(tilt, 2))
    band_raw.append([P[(M.FREQS >= lo) & (M.FREQS < hi)].sum() for lo, hi in BANDS])
    v0 = max(0, c - int(SR * dt)); idx = np.linspace(v0, max(c - 1, v0), 160).astype(int)
    sc = np.clip(np.round(((Lc[idx] - Rc[idx]) / np.sqrt(2)) * 127 / 0.8), -127, 127)
    gonio[f] = sc.astype(np.int8)
    # store M as the second half? keep both: S (x) in gonio, M (y) in gonio2
    if f == 0: gonio2 = np.zeros((NF, 160), np.int8)
    gonio2[f] = np.clip(np.round(((Lc[idx] + Rc[idx]) / np.sqrt(2)) * 127 / 0.8), -127, 127).astype(np.int8)
br_ = np.array(band_raw); br_ = np.sqrt(br_ / np.percentile(br_, 98, axis=0)[None, :])
fr["bands"] = np.round(np.clip(br_, 0, 1.5), 3).tolist()

# ---------------------------------------------------------------- onsets (on the clip), quantised to the 16th grid
def flux(lo, hi, n=1024, hop=128, log=True):
    ff, tt, Z = stft(mono, SR, nperseg=n, noverlap=n - hop, boundary=None, padded=False)
    m = np.abs(Z[(ff >= lo) & (ff < hi)])
    if log: m = np.log1p(30 * m)
    fl = np.concatenate([[0], np.maximum(0, np.diff(m, axis=1)).sum(0)])
    return tt - n / 2 / SR + hop / SR, fl / (fl.max() + 1e-12)

def peaks(t, e, thr, gap, w=4):
    out = []
    for i in range(w, len(e) - w):
        if e[i] >= thr and e[i] == e[i - w:i + w + 1].max() and (not out or t[i] - out[-1][0] >= gap):
            out.append((float(t[i]), float(e[i])))
    return out

q16 = p / 4
def quant(lst):
    return [[round(t, 4), round(s, 3), round(round(t / q16) * q16, 6)] for t, s in lst if 0 <= t < nbars * BAR]
ons = {"kick": quant(peaks(*flux(30, 120, log=False), 0.3, 0.2)),
       "snare": quant(peaks(*flux(1500, 5000), 0.4, 0.2)),
       "hat": quant(peaks(*flux(7000, 16000, n=512, hop=64), 0.35, 0.06))}

# ---------------------------------------------------------------- waveform (200 columns / s) + song overview
CPS = 200; cols = int(nbars * BAR * CPS); cw = len(y) / cols
lowm = sosfilt(butter(2, 200, "low", fs=SR, output="sos"), mono); him = sosfilt(butter(2, 3000, "high", fs=SR, output="sos"), mono)
wave = {"cps": CPS, "L": [], "R": [], "tone": []}
for i in range(cols):
    s_ = slice(int(i * cw), int((i + 1) * cw))
    for ch, arr in (("L", Lc), ("R", Rc)):
        v = arr[s_]; wave[ch].append([int(v.min() * 1000), int(v.max() * 1000), int(np.sqrt((v * v).mean()) * 1000)])
    tot = np.sqrt((mono[s_] ** 2).mean()) + 1e-9
    wave["tone"].append([int(100 * np.sqrt((lowm[s_] ** 2).mean()) / tot), int(100 * np.sqrt((him[s_] ** 2).mean()) / tot)])
OV = 1200; ow = len(x) / OV; xm = x.mean(1)
overview = [int(1000 * np.abs(xm[int(i * ow):int((i + 1) * ow)]).max()) for i in range(OV)]

# ---------------------------------------------------------------- reference loudness from ffmpeg (for the readout + report)
import re
e = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", wav, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
s_ = e[e.rindex("Summary:"):]
ff = {"I": float(re.search(r"I:\s+(-?[\d.]+) LUFS", s_).group(1)), "LRA": float(re.search(r"LRA:\s+(-?[\d.]+) LU", s_).group(1)),
      "TP": float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", s_).group(1))}

title = a.title or os.path.splitext(os.path.basename(a.beat))[0].split("-")[0].upper()
data = {
    "id": a.id, "fps": FPS, "frames": NF, "duration": round(nbars * BAR, 6), "bars": nbars, "bpm": G["bpm"], "beat": p,
    "key": G["key"], "keyNote": G["keyNote"], "title": title, "file": os.path.basename(a.beat),
    "song": {"duration": G["duration"], "startBar": S, "startTime": round(t0, 6), "bar1": G["bar1"],
             "phrases": [{"bar": q["bar"], "label": q["label"], "bars": q["bars"]} for q in phr], "overview": overview,
             "lastBar": last_bar},
    "frame": fr, "oct6": [round(v, 2) for v in M.OCT6], "oct1": M.OCT1.tolist(), "bandNames": ["SUB", "LOW", "LO-MID", "MID", "HI-MID", "AIR"],
    "spectroBins": M.SPEC_BINS, "spectro": base64.b64encode(spectro.tobytes()).decode(),
    "gonioN": 160, "gonioS": base64.b64encode(gonio.tobytes()).decode(), "gonioM": base64.b64encode(gonio2.tobytes()).decode(),
    "onsets": ons, "wave": wave,
    "summary": {"I": round(L.integrated(), 2), "LRA": round(L.lra(), 2), "TP": round(float(M.db(TPt.max())), 2), "ffmpeg": ff},
}
js = os.path.join(ROOT, "film", "data", a.id + ".js")
open(js, "w").write("window.U2C_DATA=" + json.dumps(data, separators=(",", ":")) + ";\n")
print(json.dumps({"id": a.id, "startBar": S, "start": round(t0, 3), "bars": nbars, "duration": data["duration"], "frames": NF,
                  "ours": data["summary"], "onsets": {k: len(v) for k, v in ons.items()}, "js_mb": round(os.path.getsize(js) / 1e6, 2)}))
