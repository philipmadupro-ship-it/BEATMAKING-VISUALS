//! Worker thread: reads the audio ring (the audio thread only copies samples into it), runs the drum-hit detector, and
//! publishes small JSON events on the bus that every WebSocket client drains. No analysis ever runs on the audio thread.
use crate::server::Shared;
use std::collections::VecDeque;
use std::sync::atomic::Ordering::Relaxed;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use u2c_dsp::{Hit, HitDetector, MeterFrame, Meters};

/// Ordered event log with per-client cursors. Latest-wins is not needed for these small events; the log is bounded.
pub struct Bus {
    inner: Mutex<(u64, VecDeque<(u64, Arc<str>)>)>,
}
impl Bus {
    pub fn new() -> Self {
        Self { inner: Mutex::new((0, VecDeque::new())) }
    }
    pub fn push(&self, s: String) {
        if let Ok(mut g) = self.inner.lock() {
            g.0 += 1;
            let n = g.0;
            g.1.push_back((n, s.into()));
            while g.1.len() > 512 {
                g.1.pop_front();
            }
        }
    }
    pub fn head(&self) -> u64 {
        self.inner.lock().map(|g| g.0).unwrap_or(0)
    }
    /// Events newer than `cursor`, and the new cursor.
    pub fn since(&self, cursor: u64) -> (u64, Vec<Arc<str>>) {
        match self.inner.lock() {
            Ok(g) => (g.0, g.1.iter().filter(|(n, _)| *n > cursor).map(|(_, s)| s.clone()).collect()),
            Err(_) => (cursor, Vec::new()),
        }
    }
}

pub fn hit_json(sh: &Shared, h: &Hit, base: u64) -> String {
    let pos = base + h.pos;
    serde_json::json!({"t": "hits", "kick": round(h.kick), "snare": round(h.snare), "hat": round(h.hat), "pos": pos, "beats": sh.beats_at(pos)}).to_string()
}
fn dbv(v: f32) -> f64 {
    ((20.0 * (v.max(1e-6) as f64).log10()).max(-120.0) * 10.0).round() / 10.0
}
/// One meters block (about 30 per second): BS.1770 loudness, true peak, peak / RMS L/R in dBFS, correlation, width and the
/// 61-band 1/6-octave spectrum (dBFS). `pos` is the ring index of the newest sample the block covers.
pub fn meters_json(sh: &Shared, f: &MeterFrame, pos: u64) -> String {
    let r1 = |v: f32| (v as f64 * 10.0).round() / 10.0;
    serde_json::json!({
        "t": "meters", "pos": pos, "beats": sh.beats_at(pos),
        "momentary": r1(f.momentary), "short": r1(f.short), "tp": r1(f.tp_db()), "tpL": dbv(f.tp_l), "tpR": dbv(f.tp_r),
        "peakL": dbv(f.peak_l), "peakR": dbv(f.peak_r), "rmsL": dbv(f.rms_l), "rmsR": dbv(f.rms_r),
        "corr": (f.corr as f64 * 1000.0).round() / 1000.0, "width": (f.width as f64 * 1000.0).round() / 1000.0,
        "spec": f.spec.iter().map(|v| r1(*v)).collect::<Vec<_>>(),
    })
    .to_string()
}
/// The connected U2C Send instances as one `{t:'sends', list}` event. Stale ones (no packet for 1.5 s) are dropped; hit flags are
/// consumed once published. None when there is nothing to say (no sends now and none before).
pub fn sends_json(sh: &Shared, had: &mut bool) -> Option<String> {
    let mut m = sh.sends.lock().ok()?;
    m.retain(|_, (at, _, _)| at.elapsed() < Duration::from_millis(1500));
    if m.is_empty() && !*had {
        return None;
    }
    *had = !m.is_empty();
    let list: Vec<serde_json::Value> = m
        .values_mut()
        .map(|(_, v, fresh)| {
            let out = v.clone();
            if *fresh {
                for k in ["kick", "snare", "hat"] {
                    v[k] = 0.0.into();
                }
                *fresh = false;
            }
            out
        })
        .collect();
    Some(serde_json::json!({"t": "sends", "list": list}).to_string())
}
pub fn round(v: f32) -> f64 {
    (v as f64 * 1000.0).round() / 1000.0
}

pub fn start(sh: Arc<Shared>) {
    std::thread::spawn(move || {
        let (mut cur, mut sr, mut base) = (sh.widx.load(Relaxed), 0u32, 0u64);
        let mut det: Option<HitDetector> = None;
        let mut meters: Option<Meters> = None;
        let mut midi_cursor = sh.midi_head();
        let (mut last_sends, mut had_sends) = (std::time::Instant::now(), false);
        let (mut last_emit, mut was_playing) = (std::time::Instant::now(), false);
        let (mut l, mut r, mut mono, mut hits) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
        loop {
            std::thread::sleep(Duration::from_millis(4));
            if last_sends.elapsed() >= Duration::from_millis(33) {
                last_sends = std::time::Instant::now();
                if let Some(j) = sends_json(&sh, &mut had_sends) {
                    sh.bus.push(j);
                }
            }
            for (on, ch, note, vel, pos, host) in sh.midi_drain(&mut midi_cursor) {
                sh.bus.push(serde_json::json!({"t": "midi", "on": on, "ch": ch, "note": note, "vel": vel, "pos": pos, "beats": sh.beats_at(pos),
                    "host": if host < 0 { serde_json::Value::Null } else { host.into() }}).to_string());
            }
            let w = sh.widx.load(Relaxed);
            let s = sh.sr.load(Relaxed).max(8000);
            if w.saturating_sub(cur) > sh.ring_len() as u64 / 2 || s != sr || det.is_none() {
                // fell behind (or first run / sample rate change): restart on the newest samples
                cur = w;
                sr = s;
                base = w;
                det = Some(HitDetector::new(s as f32));
                meters = Some(Meters::new(s as f32));
                continue;
            }
            if w <= cur {
                continue;
            }
            sh.read_range(cur, w, &mut l, &mut r);
            // loudness windows restart when the transport (re)starts, so the previous song position does not leak in
            let pl = sh.playing.load(Relaxed);
            if pl && !was_playing {
                meters = Some(Meters::new(s as f32));
            }
            was_playing = pl;
            if let Some(m) = meters.as_mut() {
                m.push(&l, &r);
                if last_emit.elapsed() >= Duration::from_millis(33) {
                    last_emit = std::time::Instant::now();
                    let f = m.frame();
                    sh.bus.push(meters_json(&sh, &f, w));
                }
            }
            mono.clear();
            mono.extend(l.iter().zip(&r).map(|(a, b)| 0.5 * (a + b)));
            hits.clear();
            det.as_mut().unwrap().process(&mono, &mut hits);
            for h in &hits {
                sh.bus.push(hit_json(&sh, h, base));
            }
            cur = w;
        }
    });
}
