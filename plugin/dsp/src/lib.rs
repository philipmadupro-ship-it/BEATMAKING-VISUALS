//! Pure DSP for the U2C plugins (no audio-thread or I/O code here, so it is unit-testable offline).
//!  - `HitDetector`: band-split spectral flux (kick < 150 Hz, snare 150 Hz-4 kHz, hat > 6 kHz), adaptive thresholds.
//!  - `Meters`: BS.1770 K-weighted momentary / short-term LUFS, 4x oversampled true peak, RMS / peak L/R, correlation, width,
//!    calibrated 1/6-octave spectrum (61 bands, the web app's own bins: a full-scale sine = 0 dB).
//!  - `bands8`: 8 octave-ish band levels for U2C Send.
use std::f32::consts::PI;

// ------------------------------------------------------------------------------------------------ FFT
pub struct Fft {
    pub n: usize,
    cos: Vec<f32>,
    sin: Vec<f32>,
    rev: Vec<u32>,
    pub win: Vec<f32>,
    /// sum of the Hann window (amplitude calibration) and its equivalent noise bandwidth in bins
    pub wsum: f32,
    pub enbw: f32,
}

impl Fft {
    pub fn new(n: usize) -> Self {
        assert!(n.is_power_of_two());
        let bits = n.trailing_zeros();
        let rev = (0..n as u32).map(|i| i.reverse_bits() >> (32 - bits)).collect();
        let cos = (0..n / 2).map(|k| (2.0 * PI * k as f32 / n as f32).cos()).collect();
        let sin = (0..n / 2).map(|k| -(2.0 * PI * k as f32 / n as f32).sin()).collect();
        let win: Vec<f32> = (0..n).map(|i| 0.5 - 0.5 * (2.0 * PI * i as f32 / n as f32).cos()).collect();
        let wsum: f32 = win.iter().sum();
        let w2: f32 = win.iter().map(|w| w * w).sum();
        Self { n, cos, sin, rev, win, wsum, enbw: n as f32 * w2 / (wsum * wsum) }
    }
    /// In-place forward transform.
    pub fn run(&self, re: &mut [f32], im: &mut [f32]) {
        let n = self.n;
        for i in 0..n {
            let j = self.rev[i] as usize;
            if j > i {
                re.swap(i, j);
                im.swap(i, j);
            }
        }
        let mut len = 2;
        while len <= n {
            let (half, step) = (len / 2, n / len);
            for s in (0..n).step_by(len) {
                for k in 0..half {
                    let (c, sn) = (self.cos[k * step], self.sin[k * step]);
                    let (a, b) = (s + k, s + k + half);
                    let (tr, ti) = (re[b] * c - im[b] * sn, re[b] * sn + im[b] * c);
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
            len <<= 1;
        }
    }
    /// Amplitude spectrum (a full-scale sine on a bin centre reads 1.0) of the last `n` samples of `x`, Hann windowed.
    pub fn amp(&self, x: &[f32], re: &mut Vec<f32>, im: &mut Vec<f32>, out: &mut Vec<f32>) {
        let n = self.n;
        re.clear();
        re.extend(x[x.len() - n..].iter().zip(&self.win).map(|(a, w)| a * w));
        im.clear();
        im.resize(n, 0.0);
        self.run(re, im);
        out.clear();
        out.extend((0..=n / 2).map(|k| 2.0 * (re[k] * re[k] + im[k] * im[k]).sqrt() / self.wsum));
    }
}

// ------------------------------------------------------------------------------------------------ hits
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Hit {
    pub kick: f32,
    pub snare: f32,
    pub hat: f32,
    /// absolute index (samples since the detector started) of the estimated onset
    pub pos: u64,
}

const HN: usize = 2048;
const HOP: usize = 256;
const HIST: usize = 96;
/// The flux peak is reported this many samples after the attack's start (analysis-window latency per band), measured by the unit tests.
const ONSET_LAG: [u64; 3] = [222, 632, 461];

struct Band {
    lo: usize,
    hi: usize,
    hist: [f32; HIST],
    f1: f32,
    f2: f32,
    last: i64,
    refr: i64,
    floor: f32,
    k: f32,
}

pub struct HitDetector {
    sr: f32,
    fft: Fft,
    buf: Vec<f32>,
    total: u64,
    prev: Vec<f32>,
    cur: Vec<f32>,
    re: Vec<f32>,
    im: Vec<f32>,
    amp: Vec<f32>,
    bands: [Band; 3],
    frame: i64,
    since: usize,
    /// band power (sum of amp^2) of the last four frames per band, newest first
    pw: [[f32; 3]; 4],
}

impl HitDetector {
    pub fn new(sr: f32) -> Self {
        let bin = |hz: f32| ((hz * HN as f32 / sr).round() as usize).clamp(1, HN / 2 - 1);
        let ms = |m: f32| (m * 0.001 * sr / HOP as f32).round() as i64;
        let mk = |lo: f32, hi: f32, refr_ms: f32, floor: f32, k: f32| Band { lo: bin(lo), hi: bin(hi), hist: [0.0; HIST], f1: 0.0, f2: 0.0, last: -1000, refr: ms(refr_ms), floor, k };
        Self {
            sr,
            fft: Fft::new(HN),
            buf: Vec::with_capacity(HN * 2),
            total: 0,
            prev: vec![0.0; HN / 2 + 1],
            cur: vec![0.0; HN / 2 + 1],
            re: Vec::new(),
            im: Vec::new(),
            amp: Vec::new(),
            bands: [mk(30.0, 150.0, 90.0, 0.35, 1.5), mk(150.0, 4000.0, 70.0, 0.08, 1.5), mk(6000.0, (0.45 * sr).min(16000.0), 45.0, 0.06, 1.5)],
            frame: 0,
            since: 0,
            pw: [[0.0; 3]; 4],
        }
    }
    /// Feed mono samples (any block size). Hits found are appended to `out`.
    pub fn process(&mut self, x: &[f32], out: &mut Vec<Hit>) {
        for &s in x {
            self.buf.push(s);
            self.total += 1;
            self.since += 1;
            if self.buf.len() >= HN && self.since >= HOP {
                self.since = 0;
                self.step(out);
                if self.buf.len() > 4 * HN {
                    let cut = self.buf.len() - HN;
                    self.buf.drain(..cut);
                }
            }
        }
    }
    fn step(&mut self, out: &mut Vec<Hit>) {
        self.fft.amp(&self.buf, &mut self.re, &mut self.im, &mut self.amp);
        std::mem::swap(&mut self.prev, &mut self.cur);
        for (c, a) in self.cur.iter_mut().zip(&self.amp) {
            *c = (1.0 + 1000.0 * a).ln();
        }
        self.frame += 1;
        self.pw.rotate_right(1);
        for (bi, b) in self.bands.iter().enumerate() {
            self.pw[0][bi] = self.amp[b.lo..=b.hi].iter().map(|a| a * a).sum();
        }
        // power each band gained over the last frames: kick / snare / hat must each own the new energy (a snare's low-end
        // leakage is not a kick, a kick's click is not a snare, a snare's top is not a hat)
        let dp: Vec<f32> = (0..3).map(|i| (self.pw[0][i].max(self.pw[1][i]) - self.pw[3][i]).max(0.0)).collect();
        let owns = [dp[0] >= 0.25 * dp[1], dp[1] >= 0.5 * dp[0], dp[2] >= 0.3 * dp[1]];
        let mut h = Hit::default();
        let mut any = false;
        for (bi, b) in self.bands.iter_mut().enumerate() {
            // mean positive per-bin increase of the log-compressed magnitude in the band
            let mut f = 0.0;
            for k in b.lo..=b.hi {
                f += (self.cur[k] - self.prev[k]).max(0.0);
            }
            f /= (b.hi - b.lo + 1) as f32;
            // candidate is the previous frame (needs the next one to confirm a local maximum)
            let (cand, before, after) = (b.f1, b.f2, f);
            let (mean, std) = {
                let m = b.hist.iter().sum::<f32>() / HIST as f32;
                (m, (b.hist.iter().map(|v| (v - m) * (v - m)).sum::<f32>() / HIST as f32).sqrt())
            };
            let thr = mean + b.k * std;
            if cand > before && cand >= after && cand > thr && cand > b.floor && self.frame - b.last > b.refr && owns[bi] {
                let s = (cand / (2.5 * thr.max(b.floor))).clamp(0.25, 1.0);
                b.last = self.frame;
                match bi {
                    0 => h.kick = s,
                    1 => h.snare = s,
                    _ => h.hat = s,
                }
                any = true;
            }
            b.hist.rotate_left(1);
            b.hist[HIST - 1] = b.f1;
            b.f2 = b.f1;
            b.f1 = f;
        }
        if any {
            // the candidate frame ended one hop ago
            let lag = ONSET_LAG[if h.kick > 0.0 { 0 } else if h.snare > 0.0 { 1 } else { 2 }];
            h.pos = (self.total - HOP as u64).saturating_sub(lag);
            out.push(h);
        }
    }
    pub fn sample_rate(&self) -> f32 {
        self.sr
    }
}

// ------------------------------------------------------------------------------------------------ meters
#[derive(Clone, Copy, Default)]
struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
    z: [f64; 2],
}
impl Biquad {
    #[inline]
    fn run(&mut self, x: f64) -> f64 {
        let y = self.b[0] * x + self.z[0];
        self.z[0] = self.b[1] * x - self.a[0] * y + self.z[1];
        self.z[1] = self.b[2] * x - self.a[1] * y;
        y
    }
}

/// BS.1770 K-weighting (shelf + RLB high-pass), derived for any sample rate (exact at 48 kHz).
fn k_weight(sr: f64) -> [Biquad; 2] {
    let shelf = {
        let (f0, g, q) = (1681.974450955533_f64, 3.999843853973347_f64, 0.7071752369554196_f64);
        let k = (std::f64::consts::PI * f0 / sr).tan();
        let vh = 10f64.powf(g / 20.0);
        let vb = vh.powf(0.4996667741545416);
        let a0 = 1.0 + k / q + k * k;
        Biquad { b: [(vh + vb * k / q + k * k) / a0, 2.0 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0], a: [2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0], z: [0.0; 2] }
    };
    let hp = {
        let (f0, q) = (38.13547087602444_f64, 0.5003270373238773_f64);
        let k = (std::f64::consts::PI * f0 / sr).tan();
        let a0 = 1.0 + k / q + k * k;
        Biquad { b: [1.0, -2.0, 1.0], a: [2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0], z: [0.0; 2] }
    };
    [shelf, hp]
}

const TP_TAPS: usize = 16;
/// 4x polyphase windowed-sinc (Hann, 16 taps per phase) interpolator coefficients for phases 0..3 (BS.1770 Annex 2 style).
fn tp_coefs() -> [[f32; TP_TAPS]; 4] {
    let mut c = [[0f32; TP_TAPS]; 4];
    for (p, row) in c.iter_mut().enumerate() {
        for (t, v) in row.iter_mut().enumerate() {
            let d = p as f32 / 4.0 - (t as f32 - (TP_TAPS / 2 - 1) as f32);
            let sinc = if d.abs() < 1e-6 { 1.0 } else { (PI * d).sin() / (PI * d) };
            let w = if d.abs() < (TP_TAPS / 2) as f32 { 0.5 + 0.5 * (PI * d / (TP_TAPS / 2) as f32).cos() } else { 0.0 };
            *v = sinc * w;
        }
    }
    c
}

/// 61 one-sixth-octave bands centred on 1000 * 2^((i - 34) / 6) Hz (19.7 Hz .. 20.2 kHz): the web app's own spectrum bins.
pub const SPEC_BINS: usize = 61;
pub fn spec_center(i: usize) -> f32 {
    1000.0 * 2f32.powf((i as f32 - 34.0) / 6.0)
}
const SPEC_N: usize = 8192;
const SUB_HZ: usize = 100; // 10 ms sub-blocks

#[derive(Clone, Debug, Default)]
pub struct MeterFrame {
    pub momentary: f32,
    pub short: f32,
    pub tp_l: f32,
    pub tp_r: f32,
    pub peak_l: f32,
    pub peak_r: f32,
    pub rms_l: f32,
    pub rms_r: f32,
    pub corr: f32,
    pub width: f32,
    pub spec: Vec<f32>,
}

#[derive(Clone, Copy, Default)]
struct Sub {
    kl: f64,
    kr: f64,
    ll: f64,
    rr: f64,
    lr: f64,
    mm: f64,
    ss: f64,
}

pub struct Meters {
    sr: f32,
    kw: [[Biquad; 2]; 2],
    tpc: [[f32; TP_TAPS]; 4],
    hist: [[f32; TP_TAPS]; 2],
    sub_len: usize,
    subs: Vec<Sub>,
    cur: Sub,
    cur_n: usize,
    filled: usize,
    peak: [f32; 2],
    tp: [f32; 2],
    mono: Vec<f32>,
    fft: Fft,
    scratch: (Vec<f32>, Vec<f32>, Vec<f32>),
}

pub const LU_FLOOR: f32 = -120.0;
fn lk(ms: f64) -> f32 {
    if ms <= 1e-12 { LU_FLOOR } else { ((-0.691 + 10.0 * ms.log10()) as f32).max(LU_FLOOR) }
}
fn db(v: f32) -> f32 {
    (20.0 * v.max(1e-6).log10()).max(-120.0)
}

impl Meters {
    pub fn new(sr: f32) -> Self {
        let k = k_weight(sr as f64);
        Self {
            sr,
            kw: [k, k],
            tpc: tp_coefs(),
            hist: [[0.0; TP_TAPS]; 2],
            sub_len: (sr as usize / SUB_HZ).max(1),
            subs: vec![Sub::default(); 300],
            cur: Sub::default(),
            cur_n: 0,
            filled: 0,
            peak: [0.0; 2],
            tp: [0.0; 2],
            mono: Vec::with_capacity(SPEC_N * 3),
            fft: Fft::new(SPEC_N),
            scratch: (Vec::new(), Vec::new(), Vec::new()),
        }
    }
    pub fn sample_rate(&self) -> f32 {
        self.sr
    }
    pub fn push(&mut self, l: &[f32], r: &[f32]) {
        for i in 0..l.len().min(r.len()) {
            let (a, b) = (l[i], r[i]);
            self.peak[0] = self.peak[0].max(a.abs());
            self.peak[1] = self.peak[1].max(b.abs());
            for (ch, x) in [a, b].into_iter().enumerate() {
                let h = &mut self.hist[ch];
                h.copy_within(1.., 0);
                h[TP_TAPS - 1] = x;
                // interpolate between the samples at index 7 and 8 (centre of the 16 taps): phases 0..3
                for p in 0..4 {
                    let c = &self.tpc[p];
                    let mut y = 0.0;
                    for t in 0..TP_TAPS {
                        y += h[t] * c[t];
                    }
                    self.tp[ch] = self.tp[ch].max(y.abs());
                }
            }
            let mut k = |ch: usize, x: f32| {
                let s = self.kw[ch][0].run(x as f64);
                self.kw[ch][1].run(s)
            };
            let (kl, kr) = (k(0, a), k(1, b));
            let (a, b) = (a as f64, b as f64);
            let (m, s) = ((a + b) * 0.5, (a - b) * 0.5);
            let c = &mut self.cur;
            c.kl += kl * kl;
            c.kr += kr * kr;
            c.ll += a * a;
            c.rr += b * b;
            c.lr += a * b;
            c.mm += m * m;
            c.ss += s * s;
            self.mono.push(((a + b) * 0.5) as f32);
            self.cur_n += 1;
            if self.cur_n >= self.sub_len {
                let n = self.sub_len as f64;
                let mut s = self.cur;
                for v in [&mut s.kl, &mut s.kr, &mut s.ll, &mut s.rr, &mut s.lr, &mut s.mm, &mut s.ss] {
                    *v /= n;
                }
                self.subs.rotate_left(1);
                *self.subs.last_mut().unwrap() = s;
                self.filled = (self.filled + 1).min(self.subs.len());
                self.cur = Sub::default();
                self.cur_n = 0;
            }
        }
        if self.mono.len() > 3 * SPEC_N {
            let cut = self.mono.len() - SPEC_N;
            self.mono.drain(..cut);
        }
    }
    fn win(&self, n: usize) -> Sub {
        let n = n.min(self.filled).max(1);
        let mut s = Sub::default();
        for x in &self.subs[self.subs.len() - n..] {
            s.kl += x.kl;
            s.kr += x.kr;
            s.ll += x.ll;
            s.rr += x.rr;
            s.lr += x.lr;
            s.mm += x.mm;
            s.ss += x.ss;
        }
        for v in [&mut s.kl, &mut s.kr, &mut s.ll, &mut s.rr, &mut s.lr, &mut s.mm, &mut s.ss] {
            *v /= n as f64;
        }
        s
    }
    /// Values for the samples pushed since the last call (peaks), and the running windows (loudness, RMS, correlation, spectrum).
    pub fn frame(&mut self) -> MeterFrame {
        let m = self.win(SUB_HZ * 4 / 10);
        let s = self.win(300);
        let r3 = self.win(SUB_HZ * 3 / 10);
        let c2 = self.win(SUB_HZ * 2 / 10);
        let e = c2.ll.max(c2.rr);
        let corr = if e < 1e-10 || c2.ll.min(c2.rr) < e * 1e-6 { 0.0 } else { (c2.lr / (c2.ll * c2.rr).sqrt()).clamp(-1.0, 1.0) as f32 };
        let (mid, side) = (c2.mm.sqrt(), c2.ss.sqrt());
        let width = if side < 1e-9 { 0.0 } else { (side / mid.max(side * 0.25)).min(4.0) as f32 }; // side/mid RMS ratio, as the app (capped at 4)
        let f = MeterFrame {
            momentary: lk(m.kl + m.kr),
            short: lk(s.kl + s.kr),
            tp_l: self.tp[0],
            tp_r: self.tp[1],
            peak_l: self.peak[0],
            peak_r: self.peak[1],
            rms_l: r3.ll.sqrt() as f32,
            rms_r: r3.rr.sqrt() as f32,
            corr,
            width,
            spec: self.spectrum(),
        };
        self.peak = [0.0; 2];
        self.tp = [0.0; 2];
        f
    }
    /// Calibrated dBFS per 1/6-octave band (full-scale sine = 0 dB).
    fn spectrum(&mut self) -> Vec<f32> {
        if self.mono.len() < SPEC_N {
            return vec![-120.0; SPEC_BINS];
        }
        let (re, im, amp) = &mut self.scratch;
        self.fft.amp(&self.mono, re, im, amp);
        let hz = SPEC_N as f32 / self.sr; // bins per Hz
        let r = 2f32.powf(1.0 / 12.0);
        (0..SPEC_BINS)
            .map(|i| {
                let (lo, hi) = (spec_center(i) / r * hz, spec_center(i) * r * hz);
                let (a, b) = (lo.ceil() as usize, (hi.ceil() as usize).min(amp.len()));
                let p = if b > a {
                    amp[a..b].iter().map(|v| v * v).sum::<f32>()
                } else {
                    // narrower than one FFT bin: power density of the nearest bin scaled by the bin's width
                    let c = (((lo + hi) * 0.5).round() as usize).min(amp.len() - 1);
                    amp[c] * amp[c] * (hi - lo)
                };
                (10.0 * (p / self.fft.enbw).max(1e-12).log10()).max(-120.0)
            })
            .collect()
    }
}

impl MeterFrame {
    pub fn tp_db(&self) -> f32 {
        db(self.tp_l.max(self.tp_r))
    }
}

// ------------------------------------------------------------------------------------------------ send bands
pub const BAND_EDGES: [f32; 9] = [20.0, 60.0, 150.0, 400.0, 1000.0, 2500.0, 6000.0, 12000.0, 20000.0];

/// Amplitude (RMS-like, 0..1 for a full-scale tone) in 8 bands from the last 2048 mono samples.
pub struct Bands8 {
    fft: Fft,
    sr: f32,
    s: (Vec<f32>, Vec<f32>, Vec<f32>),
}
impl Bands8 {
    pub fn new(sr: f32) -> Self {
        Self { fft: Fft::new(HN), sr, s: (Vec::new(), Vec::new(), Vec::new()) }
    }
    pub fn run(&mut self, mono: &[f32]) -> [f32; 8] {
        let mut out = [0f32; 8];
        if mono.len() < HN {
            return out;
        }
        let (re, im, amp) = &mut self.s;
        self.fft.amp(mono, re, im, amp);
        let hz = HN as f32 / self.sr;
        for (i, o) in out.iter_mut().enumerate() {
            let (a, b) = (((BAND_EDGES[i] * hz).ceil() as usize).max(1), ((BAND_EDGES[i + 1] * hz).ceil() as usize).min(amp.len()));
            if b > a {
                *o = (amp[a..b].iter().map(|v| v * v).sum::<f32>() / self.fft.enbw).sqrt();
            }
        }
        out
    }
}

#[cfg(test)]
mod tests;
