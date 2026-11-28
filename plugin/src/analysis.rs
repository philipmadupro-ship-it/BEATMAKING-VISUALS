//! Worker thread: reads the audio ring (the audio thread only copies samples into it), runs the drum-hit detector, and
//! publishes small JSON events on the bus that every WebSocket client drains. No analysis ever runs on the audio thread.
use crate::server::Shared;
use std::collections::VecDeque;
use std::sync::atomic::Ordering::Relaxed;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use u2c_dsp::{Hit, HitDetector};

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
pub fn round(v: f32) -> f64 {
    (v as f64 * 1000.0).round() / 1000.0
}

pub fn start(sh: Arc<Shared>) {
    std::thread::spawn(move || {
        let (mut cur, mut sr, mut base) = (sh.widx.load(Relaxed), 0u32, 0u64);
        let mut det: Option<HitDetector> = None;
        let (mut l, mut r, mut mono, mut hits) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
        loop {
            std::thread::sleep(Duration::from_millis(4));
            let w = sh.widx.load(Relaxed);
            let s = sh.sr.load(Relaxed).max(8000);
            if w.saturating_sub(cur) > sh.ring_len() as u64 / 2 || s != sr || det.is_none() {
                // fell behind (or first run / sample rate change): restart on the newest samples
                cur = w;
                sr = s;
                base = w;
                det = Some(HitDetector::new(s as f32));
                continue;
            }
            if w <= cur {
                continue;
            }
            sh.read_range(cur, w, &mut l, &mut r);
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
