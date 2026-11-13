"""Meter accuracy tests: our engine vs ffmpeg (ebur128, astats), pyloudnorm and numpy.

  .venv/bin/python tests/test_meters.py [extra.wav ...]   -> prints a table, exits 1 on any failure
"""
import os, re, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
import pyloudnorm
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import meters as M

SR = M.SR
rng = np.random.default_rng(7)
T = 12.0
n = int(T * SR)
t = np.arange(n) / SR


def pink(n):
    w = rng.standard_normal(n)
    f = np.fft.rfftfreq(n, 1 / SR); X = np.fft.rfft(w); X[1:] /= np.sqrt(f[1:]); X[0] = 0
    p = np.fft.irfft(X, n)
    return p / np.sqrt(np.mean(p ** 2))


def amp(dbfs): return 10 ** (dbfs / 20)


sine1k = amp(-18) * np.sin(2 * np.pi * 1000 * t)
pk = pink(n) * amp(-20)
dyn = pink(n) * amp(-20) * np.where((t % 4) < 2, 1.0, amp(-12))      # 2 s loud / 2 s quiet: real LRA
isp = amp(0) * np.sin(2 * np.pi * (SR / 4) * t + np.pi / 4) * 0.99    # inter-sample peak: samples at -3 dB of the true peak
SIGNALS = {
    "sine 1k -18 dBFS": np.stack([sine1k, sine1k], 1),
    "pink -20 dBFS rms": np.stack([pk, pink(n) * amp(-20)], 1),
    "pink dynamic (LRA)": np.stack([dyn, dyn], 1),
    "hard-left sine": np.stack([sine1k, np.zeros(n)], 1),
    "out-of-phase sine": np.stack([sine1k, -sine1k], 1),
    "inter-sample peak": np.stack([isp, isp], 1),
}


def ffmpeg_stats(x):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        sf.write(f.name, x.astype(np.float32), SR, subtype="FLOAT")
        e = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", f.name, "-af", "ebur128=peak=true,astats=measure_perchannel=none:measure_overall=Peak_level+RMS_level",
                            "-f", "null", "-"], capture_output=True, text=True).stderr
    os.unlink(f.name)
    s = e[e.rindex("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", s).group(1))
    LRA = float(re.search(r"LRA:\s+(-?[\d.]+) LU", s).group(1))
    TP = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", s).group(1))
    pkl = float(re.findall(r"Peak level dB: (-?[\d.]+|-inf)", e)[-1]); rms = float(re.findall(r"RMS level dB: (-?[\d.]+|-inf)", e)[-1])
    return dict(I=I, LRA=LRA, TP=TP, peak=pkl, rms=rms)


fails = []


def check(name, what, ours, ref, tol):
    ok = abs(ours - ref) <= tol
    print(f"  {'PASS' if ok else 'FAIL'}  {what:<26} ours {ours:8.2f}   ref {ref:8.2f}   tol ±{tol}")
    if not ok: fails.append(f"{name}: {what}")


def run(name, x):
    print(f"\n{name}")
    ref = ffmpeg_stats(x)
    L = M.Loudness(x)
    I = L.integrated()
    if np.isfinite(ref["I"]):
        check(name, "integrated LUFS vs ffmpeg", I, ref["I"], 0.1)
        check(name, "integrated vs pyloudnorm", I, pyloudnorm.Meter(SR).integrated_loudness(x), 0.1)
        check(name, "LRA vs ffmpeg (LU)", L.lra(), ref["LRA"], 0.6)
    tp = float(M.db(M.true_peak_trace(x).max()))
    if name == "inter-sample peak":   # analytic truth: the continuous sine peaks at 0.99 = -0.09 dBTP
        check(name, "true peak vs analytic (dBTP)", tp, float(M.db(0.99)), 0.2)
        print(f"        (info) ffmpeg ebur128 reads {ref['TP']:.2f} dBTP here: its 4x interpolator overshoots on fs/4")
    else:
        check(name, "true peak vs ffmpeg (dBTP)", tp, ref["TP"], 0.3)
    check(name, "sample peak vs astats", float(M.db(np.abs(x).max())), ref["peak"], 0.05)
    check(name, "RMS vs astats", M.rms_db(x.ravel()), ref["rms"], 0.05)
    return L


for name, x in SIGNALS.items():
    run(name, x)
    mono = x.mean(1)
    if name == "sine 1k -18 dBFS":
        P = M.power_spectrum(M.frame_at(mono, n // 2))
        lv = M.band_levels(P, M.OCT6_EDGES)
        i = int(np.argmax(lv))
        check(name, "1/6-oct peak band (Hz)", M.OCT6[i], 1000.0, 1.0)
        check(name, "1/6-oct band level (dBFS)", lv[i], -18.0, 0.3)
        check(name, "correlation", M.correlation(x[:, 0], x[:, 1]), 1.0, 0.001)
    if name == "pink -20 dBFS rms":
        P = np.mean([M.power_spectrum(M.frame_at(mono, c)) for c in range(M.NFFT, n - M.NFFT, M.NFFT // 2)], 0)
        rel, tilt = M.balance_vs_pink(P)
        check(name, "balance vs pink: max dev (dB)", float(np.abs(rel[1:-1]).max()), 0.0, 1.5)
        check(name, "spectral tilt vs pink (dB/oct)", tilt, 0.0, 0.3)
        check(name, "correlation (independent)", M.correlation(x[:, 0], x[:, 1]), 0.0, 0.05)
    if name == "out-of-phase sine":
        check(name, "correlation", M.correlation(x[:, 0], x[:, 1]), -1.0, 0.001)
    if name == "hard-left sine":
        check(name, "correlation (one side silent)", M.correlation(x[:, 0], x[:, 1]), 0.0, 0.001)

for path in sys.argv[1:]:
    x, sr = sf.read(path, always_2d=True)
    assert sr == SR
    run(os.path.basename(path), x)

print(f"\n{'ALL PASS' if not fails else 'FAILURES: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
