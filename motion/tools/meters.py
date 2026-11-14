"""U2C meter engine: measurement functions shared by the clip-data builder and the accuracy tests.

All levels are dBFS with a full-scale SINE = 0 dBFS (AES17 convention for peak; RMS reported unweighted, so a
full-scale sine reads -3.01 dB RMS, like ffmpeg astats). Loudness follows ITU-R BS.1770-4 / EBU R128 (+ EBU Tech 3342
for LRA). Sample rate: 48 kHz (other rates are resampled before measuring).
"""
import numpy as np
from scipy.signal import lfilter, resample_poly, butter, sosfilt, stft

SR = 48000
DB_FLOOR = -120.0


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-12))


def pdb(p):
    return 10 * np.log10(np.maximum(p, 1e-24))


# ---------------------------------------------------------------- BS.1770 K-weighting (48 kHz coefficients)
_B1, _A1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
_B2, _A2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]


def kweight(x):
    return lfilter(_B2, _A2, lfilter(_B1, _A1, x, axis=0), axis=0)


class Loudness:
    """Momentary (400 ms), short-term (3 s), integrated (gated) loudness, and LRA, for any end time."""

    def __init__(self, stereo):
        k = kweight(stereo)
        self.pw = (k ** 2).sum(1)                       # channel-summed power (L, R weights 1.0)
        self.c = np.concatenate([[0.0], np.cumsum(self.pw)])
        self.n = len(self.pw)
        # gating blocks: 400 ms, 75 % overlap (100 ms hop)
        blk, hop = int(0.4 * SR), int(0.1 * SR)
        self.blocks = np.array([[i + blk, self._mean(i, i + blk)] for i in range(0, self.n - blk + 1, hop)])
        # short-term blocks for LRA: 3 s window, 100 ms hop (EBU Tech 3342)
        st = int(3.0 * SR)
        self.st_blocks = np.array([[i + st, self._mean(i, i + st)] for i in range(0, self.n - st + 1, hop)])

    def _mean(self, a, b):
        a, b = max(0, a), min(self.n, b)
        return (self.c[b] - self.c[a]) / max(1, b - a)

    @staticmethod
    def lufs(p):
        return -0.691 + pdb(p)

    def momentary(self, i_end):
        return self.lufs(self._mean(i_end - int(0.4 * SR), i_end)) if i_end >= int(0.4 * SR) else -np.inf

    def short_term(self, i_end):
        return self.lufs(self._mean(i_end - int(3.0 * SR), i_end)) if i_end >= int(0.4 * SR) else -np.inf

    def integrated(self, i_end=None):
        i_end = self.n if i_end is None else i_end
        b = self.blocks[self.blocks[:, 0] <= i_end, 1] if len(self.blocks) else np.array([])
        b = b[self.lufs(b) > -70]
        if not len(b): return -np.inf
        rel = self.lufs(b.mean()) - 10
        g = b[self.lufs(b) > rel]
        return float(self.lufs(g.mean())) if len(g) else -np.inf

    def lra(self, i_end=None):
        i_end = self.n if i_end is None else i_end
        b = self.st_blocks[self.st_blocks[:, 0] <= i_end, 1] if len(self.st_blocks) else np.array([])
        L = self.lufs(b); L = L[L > -70]
        if len(L) < 2: return 0.0
        rel = self.lufs(np.mean(10 ** ((L + 0.691) / 10))) - 20
        L = L[L > rel]
        if len(L) < 2: return 0.0
        return float(np.percentile(L, 95) - np.percentile(L, 10))


def true_peak_trace(stereo):
    """4x oversampled absolute value (ITU BS.1770-4 Annex 2 style), per channel."""
    return np.abs(resample_poly(stereo, 4, 1, axis=0))


# ---------------------------------------------------------------- spectrum (1/6 octave), spectrogram
NFFT = 8192
WIN = np.hanning(NFFT)
S2 = float((WIN ** 2).sum())
FREQS = np.fft.rfftfreq(NFFT, 1 / SR)
OCT6 = 1000.0 * 2.0 ** (np.arange(-34, 27) / 6)            # 61 centres, 19.7 Hz .. 20.2 kHz
OCT6_EDGES = np.stack([OCT6 * 2 ** (-1 / 12), OCT6 * 2 ** (1 / 12)], 1)
OCT1 = np.array([31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000])


def power_spectrum(mono_frame):
    """One-sided power per bin, scaled so a sine of amplitude A sums to A^2 over its bins (0 dBFS sine -> 0 dB)."""
    X = np.fft.rfft(mono_frame * WIN)
    return (np.abs(X) ** 2) * 4.0 / (NFFT * S2)


def band_levels(P, edges):
    """Band power in dBFS (sine-referenced). Bands narrower than a bin take the interpolated bin density."""
    out = np.empty(len(edges))
    df = FREQS[1]
    for i, (lo, hi) in enumerate(edges):
        ix = np.where((FREQS >= lo) & (FREQS < hi))[0]
        if len(ix) >= 1:
            out[i] = pdb(P[ix].sum())
        else:
            out[i] = pdb(np.interp(np.sqrt(lo * hi), FREQS, P) * (hi - lo) / df)
    return out


def frame_at(x, c, n=NFFT):
    s0 = c - n // 2
    fr = np.zeros(n)
    lo, hi = max(0, s0), min(len(x), s0 + n)
    if hi > lo: fr[lo - s0:hi - s0] = x[lo:hi]
    return fr


SPEC_BINS = 128
SPEC_EDGES = 20.0 * 1000.0 ** (np.arange(SPEC_BINS + 1) / SPEC_BINS)


def spectrogram_column(P):
    e = np.stack([SPEC_EDGES[:-1], SPEC_EDGES[1:]], 1)
    return band_levels(P, e)


def balance_vs_pink(P):
    """Octave-band power relative to pink noise (pink = equal power per octave, so it reads flat), relative to the
    mean, plus the tilt in dB/oct (0 = pink, negative = darker than pink)."""
    e = np.stack([OCT1 / np.sqrt(2), OCT1 * np.sqrt(2)], 1)
    L = band_levels(P, e)
    rel = L - L.mean()
    tilt = float(np.polyfit(np.log2(OCT1 / 1000.0), L, 1)[0])
    return rel, tilt


# ---------------------------------------------------------------- stereo
def correlation(l, r):
    den = np.sqrt((l * l).sum() * (r * r).sum())
    return float((l * r).sum() / den) if den > 1e-12 else 0.0


def width(l, r):
    m, s = (l + r) / 2, (l - r) / 2
    pm = (m * m).mean()
    return float(np.sqrt((s * s).mean() / pm)) if pm > 1e-14 else 0.0


# ---------------------------------------------------------------- level ballistics
class PeakMeter:
    """Digital peak programme meter: instant attack, hold, then constant dB/s release (IEC 60268-18 style)."""

    def __init__(self, fps, hold=2.0, release_db_s=13.3, floor=-90.0):
        self.dt, self.hold, self.rel, self.floor = 1 / fps, hold, release_db_s, floor
        self.bar = floor; self.pk = floor; self.age = 0.0

    def step(self, level_db):
        level_db = max(self.floor, level_db)
        self.bar = level_db if level_db >= self.bar else max(level_db, self.bar - self.rel * self.dt)
        if level_db >= self.pk: self.pk, self.age = level_db, 0.0
        else:
            self.age += self.dt
            if self.age > self.hold: self.pk = max(self.bar, self.pk - 2 * self.rel * self.dt)
        return self.bar, self.pk


def rms_db(x):
    return float(db(np.sqrt(np.mean(x * x)))) if len(x) else DB_FLOOR
