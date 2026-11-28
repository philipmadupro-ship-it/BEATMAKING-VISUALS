use super::*;

fn sine(sr: f32, hz: f32, amp: f32, secs: f32, phase: f32) -> Vec<f32> {
    (0..(sr * secs) as usize).map(|i| amp * (2.0 * PI * hz * i as f32 / sr + phase).sin()).collect()
}
fn db10(v: f32) -> f32 {
    10.0 * v.log10()
}

#[test]
fn loudness_of_a_20db_1khz_sine_is_20_lufs() {
    for sr in [44100.0, 48000.0, 96000.0] {
        let x = sine(sr, 1000.0, 0.1, 4.0, 0.0); // -20 dBFS peak, both channels
        let mut m = Meters::new(sr);
        for c in x.chunks(1024) {
            m.push(c, c);
        }
        let f = m.frame();
        assert!((f.momentary + 20.0).abs() < 0.5, "sr {sr}: momentary {}", f.momentary);
        assert!((f.short + 20.0).abs() < 0.5, "sr {sr}: short {}", f.short);
        assert!((f.rms_l - 0.1 / 2f32.sqrt()).abs() < 0.002, "rms {}", f.rms_l);
        assert!((f.peak_l - 0.1).abs() < 1e-3);
    }
}

#[test]
fn k_weighting_cuts_the_lows() {
    let (mut a, mut b) = (Meters::new(48000.0), Meters::new(48000.0));
    let (hi, lo) = (sine(48000.0, 1000.0, 0.1, 3.0, 0.0), sine(48000.0, 30.0, 0.1, 3.0, 0.0));
    a.push(&hi, &hi);
    b.push(&lo, &lo);
    let (fa, fb) = (a.frame(), b.frame());
    assert!(fb.short < fa.short - 3.0, "30 Hz {} vs 1 kHz {}", fb.short, fa.short);
}

#[test]
fn true_peak_sees_the_inter_sample_peak() {
    // fs/4 sine at 45 degrees: every sample is +-0.7071, the reconstructed wave peaks at 1.0 (0 dBTP)
    let x = sine(48000.0, 12000.0, 1.0, 0.2, PI / 4.0);
    let mut m = Meters::new(48000.0);
    m.push(&x, &x);
    let f = m.frame();
    assert!((db(f.peak_l) + 3.01).abs() < 0.05, "sample peak {}", db(f.peak_l));
    assert!(f.tp_db().abs() < 0.3, "true peak {} dBTP (want ~0)", f.tp_db());
    // a signal with no inter-sample excess: true peak ~ sample peak
    let y = sine(48000.0, 200.0, 0.5, 0.2, 0.3);
    let mut m = Meters::new(48000.0);
    m.push(&y, &y);
    let g = m.frame();
    assert!((g.tp_db() - db(g.peak_l)).abs() < 0.2, "{} vs {}", g.tp_db(), db(g.peak_l));
}

#[test]
fn correlation_and_width() {
    let x = sine(48000.0, 440.0, 0.5, 1.0, 0.0);
    let neg: Vec<f32> = x.iter().map(|v| -v).collect();
    let zero = vec![0.0; x.len()];
    let run = |l: &[f32], r: &[f32]| {
        let mut m = Meters::new(48000.0);
        m.push(l, r);
        m.frame()
    };
    let mono = run(&x, &x);
    assert!(mono.corr > 0.99 && mono.width < 0.01);   // side/mid ratio: 0 for mono
    let anti = run(&x, &neg);
    assert!(anti.corr < -0.99 && anti.width > 3.0);
    let one = run(&x, &zero);
    assert_eq!(one.corr, 0.0);
    assert!((one.width - 1.0).abs() < 0.01);
}

#[test]
fn spectrum_is_calibrated_to_dbfs() {
    let x = sine(48000.0, 1000.0, 0.5, 1.0, 0.0); // -6 dBFS
    let mut m = Meters::new(48000.0);
    m.push(&x, &x);
    let f = m.frame();
    assert_eq!(f.spec.len(), SPEC_BINS);
    let total = db10(f.spec.iter().map(|d| 10f32.powf(d / 10.0)).sum::<f32>());
    assert!((total + 6.0).abs() < 0.5, "total {total}");
    let (pk, v) = f.spec.iter().enumerate().fold((0, -999.0), |a, (i, &d)| if d > a.1 { (i, d) } else { a });
    let hz = spec_center(pk);
    assert!((hz - 1000.0).abs() < 100.0 && v > -9.5, "peak bin {pk} {hz} Hz {v} dB");
}

// ---- drum hits
struct Rng(u32);
impl Rng {
    fn next(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.0 >> 8) as f32 / 8388608.0 - 1.0
    }
}
fn kick(sr: f32, n: usize) -> Vec<f32> {
    let mut ph = 0.0;
    (0..n).map(|i| {
        let t = i as f32 / sr;
        ph += 2.0 * PI * (45.0 + 90.0 * (-t * 30.0).exp()) / sr;
        0.9 * ph.sin() * (-t / 0.12).exp()
    }).collect()
}
fn snare(sr: f32, n: usize, r: &mut Rng) -> Vec<f32> {
    let (mut hp, mut lp, mut prev) = (0.0f32, 0.0f32, 0.0f32);
    (0..n).map(|i| {
        let t = i as f32 / sr;
        let w = r.next();
        hp = 0.95 * (hp + w - prev); prev = w;   // ~1-pole high-pass
        lp += 0.35 * (hp - lp);                    // ~1-pole low-pass
        (0.9 * lp * (-t / 0.07).exp() + 0.3 * (2.0 * PI * 210.0 * t).sin() * (-t / 0.05).exp()) * 0.9
    }).collect()
}
fn hat(sr: f32, n: usize) -> Vec<f32> {
    let f = [7300.0, 8200.0, 9100.0, 10700.0, 12400.0, 13300.0];
    (0..n).map(|i| {
        let t = i as f32 / sr;
        f.iter().enumerate().map(|(k, h)| 0.06 * (2.0 * PI * h * t + k as f32).sin()).sum::<f32>() * (-t / 0.03).exp()
    }).collect()
}

fn pattern(sr: f32) -> (Vec<f32>, Vec<(char, usize)>) {
    let seq = "KHSHKKSH KHSHKKSH".replace(' ', "");
    let (mut r, step) = (Rng(7), (0.25 * sr) as usize);
    let lead = (0.5 * sr) as usize;
    let mut out = vec![0f32; lead + seq.len() * step + sr as usize];
    for (i, c) in seq.chars().enumerate() {
        let at = lead + i * step;
        let s = match c { 'K' => kick(sr, (0.4 * sr) as usize), 'S' => snare(sr, (0.3 * sr) as usize, &mut r), _ => hat(sr, (0.1 * sr) as usize) };
        for (j, v) in s.iter().enumerate() { out[at + j] += v; }
    }
    // a pinch of noise floor (-80 dBFS) so silence is not digital zero
    for v in out.iter_mut() { *v += 1e-4 * r.next(); }
    let truth = seq.chars().enumerate().map(|(i, c)| (c, lead + i * step)).collect();
    (out, truth)
}

#[test]
fn drums_are_classified_and_timed() {
    for sr in [44100.0f32, 48000.0] {
        let (x, truth) = pattern(sr);
        let mut d = HitDetector::new(sr);
        let mut hits = Vec::new();
        for c in x.chunks(512) { d.process(c, &mut hits); }
        for (name, sel) in [('K', 0), ('S', 1), ('H', 2)] {
            let want: Vec<usize> = truth.iter().filter(|(c, _)| *c == name).map(|(_, p)| *p).collect();
            let got: Vec<u64> = hits.iter().filter(|h| [h.kick, h.snare, h.hat][sel] > 0.0).map(|h| h.pos).collect();
            assert_eq!(got.len(), want.len(), "sr {sr} {name}: want {want:?} got {got:?}");
            for (g, w) in got.iter().zip(&want) {
                let err = (*g as f32 - *w as f32) / sr * 1000.0;
                assert!(err.abs() < 12.0, "sr {sr} {name}: onset error {err} ms ({g} vs {w})");
            }
        }
    }
}

#[test]
fn silence_and_a_steady_tone_give_no_hits() {
    let mut d = HitDetector::new(48000.0);
    let mut hits = Vec::new();
    d.process(&vec![0.0; 48000], &mut hits);
    d.process(&sine(48000.0, 440.0, 0.3, 2.0, 0.0), &mut hits);
    // only the very first onset of the tone may register (once)
    assert!(hits.len() <= 1, "{hits:?}");
}

#[test]
fn bands_follow_the_tone() {
    let mut b = Bands8::new(48000.0);
    let x = sine(48000.0, 100.0, 0.5, 0.2, 0.0);
    let o = b.run(&x);
    assert!(o[1] > 0.4 && o[1] < 0.55, "{o:?}");
    assert!(o[5] < 0.01 && o[7] < 0.01);
}

#[test]
#[ignore]
fn dump() {
    let sr = 44100.0;
    let (x, truth) = pattern(sr);
    let mut d = HitDetector::new(sr);
    let mut hits = Vec::new();
    for c in x.chunks(512) { d.process(c, &mut hits); }
    println!("truth {:?}", truth);
    for h in &hits { println!("{:?} -> {:.1} ms", h, h.pos as f32 / sr * 1000.0); }
}
