//! U2C Send: a light per-track plugin. The audio thread only copies the block into a lock-free ring; a worker thread computes
//! RMS / peak, 8 band levels and drum-hit flags about 30 times a second and streams them to the U2C Studio instance (a localhost
//! WebSocket client of 127.0.0.1:17871..17886), where each send can be assigned to a visual target. No editor: the main app's
//! panel names and colours each send (by its id, kept in the plugin state so it survives project reloads).
use nih_plug::prelude::*;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, Ordering::{Acquire, Relaxed, Release}};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use u2c_dsp::{Bands8, HitDetector};

const RING: usize = 1 << 16;
const BASE_PORT: u16 = 17871;

#[derive(Params)]
struct SendParams {
    /// Stable id of this instance (random on first use, saved with the project).
    #[persist = "id"]
    id: Arc<Mutex<String>>,
}

/// Audio thread -> worker thread. Lock-free: samples are f32 bits in atomics.
struct Tap {
    ring: Vec<AtomicU32>,
    widx: AtomicU64,
    sr: AtomicU32,
    /// host sample position of the newest sample (i64::MIN = unknown), and the host's beat position
    host_end: AtomicI64,
    beats: AtomicU64,
    playing: AtomicBool,
    stop: AtomicBool,
}

pub struct U2cSend {
    params: Arc<SendParams>,
    tap: Arc<Tap>,
    started: bool,
    /// running sample counter used when the host gives no sample position
    counter: i64,
}

impl Default for U2cSend {
    fn default() -> Self {
        Self {
            params: Arc::new(SendParams { id: Arc::new(Mutex::new(String::new())) }),
            tap: Arc::new(Tap {
                ring: (0..RING).map(|_| AtomicU32::new(0)).collect(),
                widx: AtomicU64::new(0),
                sr: AtomicU32::new(44100),
                host_end: AtomicI64::new(i64::MIN),
                beats: AtomicU64::new(0),
                playing: AtomicBool::new(false),
                stop: AtomicBool::new(false),
            }),
            started: false,
            counter: 0,
        }
    }
}

impl Drop for U2cSend {
    fn drop(&mut self) {
        self.tap.stop.store(true, Release);
    }
}

fn new_id() -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(1) as u64;
    let a = Box::new(0u8);
    let mut x = t ^ ((&*a as *const u8 as u64) << 17) ^ (std::process::id() as u64).rotate_left(40);
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51afd7ed558ccd);
    x ^= x >> 33;
    format!("{:016x}", x)
}

impl Plugin for U2cSend {
    const NAME: &'static str = "U2C Send";
    const VENDOR: &'static str = "UCHE2CRAZYYY";
    const URL: &'static str = "https://github.com/philipmadupro-ship-it/beatmaking-visuals";
    const EMAIL: &'static str = "";
    const VERSION: &'static str = env!("CARGO_PKG_VERSION");
    const AUDIO_IO_LAYOUTS: &'static [AudioIOLayout] = &[AudioIOLayout {
        main_input_channels: NonZeroU32::new(2),
        main_output_channels: NonZeroU32::new(2),
        ..AudioIOLayout::const_default()
    }];
    const MIDI_INPUT: MidiConfig = MidiConfig::None;
    const SAMPLE_ACCURATE_AUTOMATION: bool = false;
    type SysExMessage = ();
    type BackgroundTask = ();

    fn params(&self) -> Arc<dyn Params> {
        self.params.clone()
    }

    fn initialize(&mut self, _l: &AudioIOLayout, cfg: &BufferConfig, _c: &mut impl InitContext<Self>) -> bool {
        self.tap.sr.store(cfg.sample_rate as u32, Relaxed);
        let id = {
            let mut g = self.params.id.lock().unwrap();
            if g.is_empty() {
                *g = new_id();
            }
            g.clone()
        };
        if !self.started {
            self.started = true;
            let tap = self.tap.clone();
            std::thread::spawn(move || worker(tap, id));
        }
        true
    }

    fn process(&mut self, buffer: &mut Buffer, _aux: &mut AuxiliaryBuffers, ctx: &mut impl ProcessContext<Self>) -> ProcessStatus {
        let n = buffer.samples();
        let t = ctx.transport();
        let tap = &self.tap;
        let mut w = tap.widx.load(Relaxed);
        for mut ch in buffer.iter_samples() {
            let l = ch.get_mut(0).map(|s| *s).unwrap_or(0.0);
            let r = ch.get_mut(1).map(|s| *s).unwrap_or(l);
            tap.ring[(w as usize) & (RING - 1)].store(((l + r) * 0.5).to_bits(), Relaxed);
            w += 1;
        }
        // host sample position of the end of this block; without one, a running counter (and "unknown" for the receiver)
        self.counter += n as i64;
        tap.host_end.store(t.pos_samples().map(|p| p + n as i64).unwrap_or(i64::MIN), Relaxed);
        tap.beats.store(t.pos_beats().unwrap_or(0.0).to_bits(), Relaxed);
        tap.playing.store(t.playing, Relaxed);
        tap.widx.store(w, Release);
        ProcessStatus::Normal
    }
}

impl ClapPlugin for U2cSend {
    const CLAP_ID: &'static str = "com.uche2crazyyy.u2c-send";
    const CLAP_DESCRIPTION: Option<&'static str> = Some("Sends this track's level, bands and drum hits to U2C Studio");
    const CLAP_MANUAL_URL: Option<&'static str> = None;
    const CLAP_SUPPORT_URL: Option<&'static str> = None;
    const CLAP_FEATURES: &'static [ClapFeature] = &[ClapFeature::AudioEffect, ClapFeature::Analyzer, ClapFeature::Stereo, ClapFeature::Utility];
}

impl Vst3Plugin for U2cSend {
    const VST3_CLASS_ID: [u8; 16] = *b"U2CSendPlugin001";
    const VST3_SUBCATEGORIES: &'static [Vst3SubCategory] = &[Vst3SubCategory::Fx, Vst3SubCategory::Analyzer];
}

nih_export_clap!(U2cSend);
nih_export_vst3!(U2cSend);

fn connect() -> Option<tungstenite::WebSocket<std::net::TcpStream>> {
    for p in BASE_PORT..BASE_PORT + 16 {
        if let Ok(s) = std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127, 0, 0, 1], p)), Duration::from_millis(150)) {
            let _ = s.set_nodelay(true);
            let _ = s.set_read_timeout(Some(Duration::from_millis(2)));
            if let Ok((ws, _)) = tungstenite::client(format!("ws://127.0.0.1:{p}/"), s) {
                return Some(ws);
            }
        }
    }
    None
}

/// Analysis + network, off the audio thread.
fn worker(tap: Arc<Tap>, id: String) {
    let name = format!("Send {}", &id[..4.min(id.len())]);
    let (mut cur, mut sr) = (tap.widx.load(Acquire), 0u32);
    let (mut det, mut bands): (Option<HitDetector>, Option<Bands8>) = (None, None);
    let (mut mono, mut tail, mut hits): (Vec<f32>, Vec<f32>, Vec<u2c_dsp::Hit>) = (Vec::new(), Vec::new(), Vec::new());
    let mut ws: Option<tungstenite::WebSocket<std::net::TcpStream>> = None;
    let mut last_try = Instant::now() - Duration::from_secs(5);
    let mut acc = [0f32; 3];
    let mut last_emit = Instant::now();
    while !tap.stop.load(Acquire) {
        std::thread::sleep(Duration::from_millis(4));
        let w = tap.widx.load(Acquire);
        let s = tap.sr.load(Relaxed).max(8000);
        if det.is_none() || s != sr || w.saturating_sub(cur) > (RING / 2) as u64 {
            sr = s;
            cur = w;
            det = Some(HitDetector::new(s as f32));
            bands = Some(Bands8::new(s as f32));
            tail.clear();
            continue;
        }
        if w > cur {
            mono.clear();
            mono.extend((cur..w).map(|i| f32::from_bits(tap.ring[(i as usize) & (RING - 1)].load(Relaxed))));
            hits.clear();
            det.as_mut().unwrap().process(&mono, &mut hits);
            for h in &hits {
                acc[0] = acc[0].max(h.kick);
                acc[1] = acc[1].max(h.snare);
                acc[2] = acc[2].max(h.hat);
            }
            tail.extend_from_slice(&mono);
            if tail.len() > 4096 {
                let cut = tail.len() - 2048;
                tail.drain(..cut);
            }
            cur = w;
            if last_emit.elapsed() >= Duration::from_millis(33) && !mono.is_empty() {
                last_emit = Instant::now();
                let (mut sum, mut pk) = (0f32, 0f32);
                for v in &mono {
                    sum += v * v;
                    pk = pk.max(v.abs());
                }
                let rms = (sum / mono.len() as f32).sqrt();
                let b = bands.as_mut().unwrap().run(&tail);
                let he = tap.host_end.load(Relaxed);
                let msg = serde_json::json!({
                    "t": "send", "id": id, "name": name, "sr": s,
                    "pos": if he == i64::MIN { serde_json::Value::Null } else { he.into() },
                    "beats": f64::from_bits(tap.beats.load(Relaxed)), "playing": tap.playing.load(Relaxed),
                    "rms": r4(rms), "peak": r4(pk), "bands": b.iter().map(|v| r4(*v)).collect::<Vec<_>>(),
                    "kick": r4(acc[0]), "snare": r4(acc[1]), "hat": r4(acc[2]),
                });
                acc = [0.0; 3];
                if ws.is_none() && last_try.elapsed() > Duration::from_secs(1) {
                    last_try = Instant::now();
                    ws = connect();
                }
                if let Some(c) = ws.as_mut() {
                    if c.send(tungstenite::Message::Text(msg.to_string())).is_err() {
                        ws = None;
                    } else {
                        // drain whatever the server pushes so its socket never backs up
                        loop {
                            match c.read() {
                                Ok(tungstenite::Message::Close(_)) => { ws = None; break; }
                                Ok(_) => {}
                                Err(tungstenite::Error::Io(e)) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => break,
                                Err(_) => { ws = None; break; }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn r4(v: f32) -> f64 {
    (v as f64 * 10000.0).round() / 10000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ids_are_unique_and_hex() {
        let (a, b) = (new_id(), new_id());
        assert_ne!(a, b);
        assert_eq!(a.len(), 16);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
