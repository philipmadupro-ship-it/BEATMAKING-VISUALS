//! Localhost servers: HTTP (the embedded web app + /__daw.json) and WebSocket (transport + PCM pull).
//! Both bind 127.0.0.1 only. The WebSocket refuses non-local Origins (set U2C_DAW_ORIGINS="https://a,https://b" to allow more).

use include_dir::{include_dir, Dir};
use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::io::Write;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering::Relaxed};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tungstenite::{handshake::server::{ErrorResponse, Request, Response}, Message};

static SRC: Dir = include_dir!("$CARGO_MANIFEST_DIR/../web-app/src");
static ASSETS: Dir = include_dir!("$CARGO_MANIFEST_DIR/../web-app/assets");
static INDEX: &[u8] = include_bytes!("../../web-app/index.html");

pub const HTTP_PORT: u16 = 17870;
pub const WS_PORT: u16 = 17871;
const RING: usize = 1 << 17;
const MAX_PULL: usize = 32768;

use crate::analysis::Bus;
use crate::capture::Capture;

/// Audio-thread to server-thread state. Lock-free; f32/f64 travel as bits in atomics.
pub struct Shared {
    pub bpm: AtomicU64,
    /// Host PPQ at the start of the last block, and the ring index of that block's first sample.
    pub beats: AtomicU64,
    pub blk_widx: AtomicU64,
    pub playing: AtomicBool,
    pub rms: AtomicU32,
    pub peak: AtomicU32,
    pub sr: AtomicU32,
    pub widx: AtomicU64,
    /// Counts transport discontinuities (seek, loop wrap, start/stop, tempo change): the web clock restarts its estimate on each.
    pub jumps: AtomicU32,
    exp_beats: AtomicU64,
    pub tsn: AtomicU32,
    pub tsd: AtomicU32,
    /// Host loop range in beats (NaN bits = none).
    pub loop_a: AtomicU64,
    pub loop_b: AtomicU64,
    ring_l: Vec<AtomicU32>,
    ring_r: Vec<AtomicU32>,
    /// Events for the web clients (hits, ...): filled by the analysis worker.
    pub bus: Bus,
}

impl Shared {
    fn new() -> Self {
        let ring = || (0..RING).map(|_| AtomicU32::new(0)).collect::<Vec<_>>();
        Self {
            bpm: AtomicU64::new(120f64.to_bits()),
            beats: AtomicU64::new(0),
            blk_widx: AtomicU64::new(0),
            playing: AtomicBool::new(false),
            rms: AtomicU32::new(0),
            peak: AtomicU32::new(0),
            sr: AtomicU32::new(44100),
            widx: AtomicU64::new(0),
            jumps: AtomicU32::new(0),
            exp_beats: AtomicU64::new(0),
            tsn: AtomicU32::new(4),
            tsd: AtomicU32::new(4),
            loop_a: AtomicU64::new(f64::NAN.to_bits()),
            loop_b: AtomicU64::new(f64::NAN.to_bits()),
            ring_l: ring(),
            ring_r: ring(),
            bus: Bus::new(),
        }
    }
    pub fn ring_len(&self) -> usize {
        RING
    }
    /// Copy samples [from, to) out of the ring.
    pub fn read_range(&self, from: u64, to: u64, l: &mut Vec<f32>, r: &mut Vec<f32>) {
        l.clear();
        r.clear();
        for i in from..to {
            l.push(f32::from_bits(self.ring_l[(i as usize) & (RING - 1)].load(Relaxed)));
            r.push(f32::from_bits(self.ring_r[(i as usize) & (RING - 1)].load(Relaxed)));
        }
    }
    /// Host PPQ of ring sample `idx` (valid for recent samples).
    pub fn beats_at(&self, idx: u64) -> f64 {
        let blk = f64::from_bits(self.beats.load(Relaxed));
        if !self.playing.load(Relaxed) {
            return blk;
        }
        let d = idx as f64 - self.blk_widx.load(Relaxed) as f64;
        blk + d / self.sr.load(Relaxed).max(1) as f64 * f64::from_bits(self.bpm.load(Relaxed)) / 60.0
    }
    /// Mark the start of an audio block of `n` samples: host PPQ of its first sample, play state (audio thread).
    #[inline]
    pub fn begin_block(&self, beats: Option<f64>, playing: bool, n: usize) {
        let (bpm, sr) = (f64::from_bits(self.bpm.load(Relaxed)), self.sr.load(Relaxed).max(1) as f64);
        let was = self.playing.swap(playing, Relaxed);
        if let Some(b) = beats {
            if was != playing || (b - f64::from_bits(self.exp_beats.load(Relaxed))).abs() > 0.05 {
                self.jumps.fetch_add(1, Relaxed);
            }
            self.beats.store(b.to_bits(), Relaxed);
            self.exp_beats.store((b + n as f64 / sr * bpm / 60.0).to_bits(), Relaxed);
        }
        self.blk_widx.store(self.widx.load(Relaxed), Relaxed);
    }
    /// Push one stereo sample (audio thread).
    #[inline]
    pub fn push(&self, l: f32, r: f32) {
        let w = self.widx.load(Relaxed);
        let i = (w as usize) & (RING - 1);
        self.ring_l[i].store(l.to_bits(), Relaxed);
        self.ring_r[i].store(r.to_bits(), Relaxed);
        self.widx.store(w + 1, Relaxed);
    }
    /// Samples [from, to) as: "PCM0" [u32 sr][u32 n][f64 index of the first sample][f32 L * n][f32 R * n], little-endian.
    pub fn pcm_since(&self, from: u64, to: u64) -> Vec<u8> {
        let n = (to - from) as usize;
        let mut out = Vec::with_capacity(20 + n * 8);
        out.extend_from_slice(b"PCM0");
        out.extend_from_slice(&self.sr.load(Relaxed).to_le_bytes());
        out.extend_from_slice(&(n as u32).to_le_bytes());
        out.extend_from_slice(&(from as f64).to_le_bytes());
        for ring in [&self.ring_l, &self.ring_r] {
            for i in from..to {
                out.extend_from_slice(&f32::from_bits(ring[(i as usize) & (RING - 1)].load(Relaxed)).to_le_bytes());
            }
        }
        out
    }
    /// Host PPQ for the newest sample in the ring (end of the last block).
    pub fn beats_now(&self) -> f64 {
        let blk = f64::from_bits(self.beats.load(Relaxed));
        if !self.playing.load(Relaxed) {
            return blk;
        }
        let (w, bw) = (self.widx.load(Relaxed), self.blk_widx.load(Relaxed));
        blk + w.saturating_sub(bw) as f64 / self.sr.load(Relaxed).max(1) as f64 * f64::from_bits(self.bpm.load(Relaxed)) / 60.0
    }
    fn transport_json(&self) -> String {
        let (la, lb) = (f64::from_bits(self.loop_a.load(Relaxed)), f64::from_bits(self.loop_b.load(Relaxed)));
        serde_json::json!({
            "t": "transport",
            "bpm": f64::from_bits(self.bpm.load(Relaxed)),
            "beats": self.beats_now(),
            "widx": self.widx.load(Relaxed),
            "jump": self.jumps.load(Relaxed),
            "playing": self.playing.load(Relaxed),
            "rms": f32::from_bits(self.rms.load(Relaxed)),
            "peak": f32::from_bits(self.peak.load(Relaxed)),
            "sr": self.sr.load(Relaxed),
            "ts": [self.tsn.load(Relaxed), self.tsd.load(Relaxed)],
            "loop": if la.is_finite() && lb.is_finite() { serde_json::json!([la, lb]) } else { serde_json::Value::Null },
        })
        .to_string()
    }
}

pub struct Servers {
    pub shared: Arc<Shared>,
    pub http_port: u16,
    pub ws_port: u16,
}

static SERVERS: OnceLock<Servers> = OnceLock::new();

/// Start (once per process) and return the servers. All plugin instances in a host share them; the last one to process audio wins the tap.
pub fn servers() -> &'static Servers {
    SERVERS.get_or_init(|| {
        let shared = Arc::new(Shared::new());
        let cap = Arc::new(Capture::new());
        let ws_l = bind(WS_PORT);
        let http = bind_http(HTTP_PORT);
        let ws_port = ws_l.local_addr().map(|a| a.port()).unwrap_or(WS_PORT);
        let http_port = http.server_addr().to_ip().map(|a| a.port()).unwrap_or(HTTP_PORT);
        let (sh, cp) = (shared.clone(), cap.clone());
        std::thread::spawn(move || {
            for s in ws_l.incoming().flatten() {
                let (sh, cp) = (sh.clone(), cp.clone());
                std::thread::spawn(move || {
                    let _ = client(s, sh, cp);
                });
            }
        });
        std::thread::spawn(move || {
            for rq in http.incoming_requests() {
                respond(rq, ws_port);
            }
        });
        crate::analysis::start(shared.clone());
        crate::update::start();
        Servers { shared, http_port, ws_port }
    })
}

fn bind(base: u16) -> TcpListener {
    for p in base..base + 16 {
        if let Ok(l) = TcpListener::bind(("127.0.0.1", p)) {
            return l;
        }
    }
    TcpListener::bind(("127.0.0.1", 0)).expect("bind 127.0.0.1")
}

fn bind_http(base: u16) -> tiny_http::Server {
    for p in base..base + 16 {
        if let Ok(s) = tiny_http::Server::http(("127.0.0.1", p)) {
            return s;
        }
    }
    tiny_http::Server::http(("127.0.0.1", 0)).expect("bind http")
}

fn mime(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// Files the app may load: index.html, src/..., assets/... Served from the downloaded web app when one is
/// installed (and has the file), otherwise from the copy embedded in this build.
fn lookup(path: &str) -> Option<Vec<u8>> {
    let p = path.trim_start_matches('/');
    let rel = if p.is_empty() { "index.html" } else { p };
    if rel.contains("..") || rel.contains('\\') || rel.starts_with('/') {
        return None;
    }
    let ok = rel == "index.html" || rel.starts_with("src/") || rel.starts_with("assets/");
    if !ok {
        return None;
    }
    if let Some(root) = crate::update::webroot() {
        if let Ok(b) = std::fs::read(root.join(rel)) {
            return Some(b);
        }
    }
    if rel == "index.html" {
        return Some(INDEX.to_vec());
    }
    if let Some(r) = rel.strip_prefix("src/") {
        return SRC.get_file(r).map(|f| f.contents().to_vec());
    }
    rel.strip_prefix("assets/").and_then(|r| ASSETS.get_file(r)).map(|f| f.contents().to_vec())
}

fn respond(rq: tiny_http::Request, ws_port: u16) {
    let path = rq.url().split('?').next().unwrap_or("/").to_string();
    let hdr = |k: &str, v: &str| tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap();
    if path == "/__daw.json" {
        let body = format!("{{\"ws\":{}}}", ws_port);
        let _ = rq.respond(tiny_http::Response::from_string(body).with_header(hdr("Content-Type", "application/json")).with_header(hdr("Cache-Control", "no-store")));
        return;
    }
    if path.starts_with("/__update") {
        // State-changing calls need our custom header (a cross-site page cannot send it without a preflight, which we never grant)
        // and a local Origin.
        let h = |name: &str| rq.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.to_string());
        let guarded = h("x-u2c-update").is_some() && h("origin").map(|o| o != "null" && origin_ok(&o)).unwrap_or(true);
        let (code, body) = crate::update::http(*rq.method() == tiny_http::Method::Post, &path, guarded);
        let _ = rq.respond(tiny_http::Response::from_string(body).with_status_code(code).with_header(hdr("Content-Type", "application/json")).with_header(hdr("Cache-Control", "no-store")));
        return;
    }
    match lookup(&path) {
        Some(b) => {
            let is_index = matches!(path.trim_start_matches('/'), "" | "index.html");
            let b = if is_index {
                String::from_utf8_lossy(&b).replacen("</head>", &format!("<meta name=\"u2c-daw-ws\" content=\"{ws_port}\">{}</head>", crate::update::BANNER), 1).into_bytes()
            } else {
                b
            };
            let _ = rq.respond(tiny_http::Response::from_data(b).with_header(hdr("Content-Type", mime(&path))).with_header(hdr("Cache-Control", "no-store")));
        }
        None => {
            let _ = rq.respond(tiny_http::Response::from_string("not found").with_status_code(404));
        }
    }
}

fn origin_ok(origin: &str) -> bool {
    let host = origin.split("://").nth(1).unwrap_or(origin).split('/').next().unwrap_or("");
    let host = host.rsplit_once(':').map(|(h, _)| h).unwrap_or(host);
    if matches!(host, "127.0.0.1" | "localhost" | "[::1]") || origin == "null" {
        return true;
    }
    std::env::var("U2C_DAW_ORIGINS").map(|v| v.split(',').any(|o| o.trim() == origin)).unwrap_or(false)
}

/// Folder for saved recordings (the webview cannot download files itself): ~/Movies/U2C Studio (macOS), ~/Videos/U2C Studio.
fn out_dir() -> std::path::PathBuf {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir);
    home.join(if cfg!(target_os = "macos") { "Movies" } else { "Videos" }).join("U2C Studio")
}

fn safe_name(n: &str) -> String {
    let n: String = n.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')).take(80).collect();
    if n.is_empty() || n.starts_with('.') { "u2c-recording.webm".into() } else { n }
}

/// Releases this client's claim on the window capture when it disconnects.
struct CapGuard(Option<Arc<Capture>>);
impl Drop for CapGuard {
    fn drop(&mut self) {
        if let Some(c) = self.0.take() {
            c.release();
        }
    }
}

fn client(stream: TcpStream, sh: Arc<Shared>, cap: Arc<Capture>) -> Result<(), Box<dyn std::error::Error>> {
    let mut ws = tungstenite::accept_hdr(stream, |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        match req.headers().get("origin").and_then(|v| v.to_str().ok()) {
            Some(o) if !origin_ok(o) => Err(ErrorResponse::new(Some("origin not allowed".into()))),
            _ => Ok(resp),
        }
    })
    .map_err(|e| e.to_string())?;
    ws.get_ref().set_read_timeout(Some(Duration::from_millis(10)))?;
    ws.get_ref().set_nodelay(true)?;
    let mut cursor: Option<u64> = None;
    let mut last = Instant::now() - Duration::from_secs(1);
    let (mut frame_seq, mut status_seq) = (0u64, 0u64);
    let mut guard = CapGuard(None);
    let mut bus_cursor = sh.bus.head();
    let mut save: Option<(std::fs::File, std::path::PathBuf)> = None;
    loop {
        if last.elapsed() >= Duration::from_millis(16) {
            last = Instant::now();
            ws.send(Message::Text(sh.transport_json()))?;
        }
        {
            let (c, evs) = sh.bus.since(bus_cursor);
            bus_cursor = c;
            for e in evs {
                ws.send(Message::Text(e.to_string()))?;
            }
        }
        if guard.0.is_some() {
            if let Some((seq, f)) = cap.frame_if_newer(frame_seq) {
                frame_seq = seq;
                ws.send(Message::Binary(f))?;
            }
            if let Some((seq, st)) = cap.status_if_newer(status_seq) {
                status_seq = seq;
                ws.send(Message::Text(serde_json::json!({"t": "cap_status", "msg": st}).to_string()))?;
            }
        }
        match ws.read() {
            Ok(Message::Text(t)) => {
                let v: serde_json::Value = serde_json::from_str(&t).unwrap_or(serde_json::Value::Null);
                match v["t"].as_str().unwrap_or("") {
                    "open_browser" => {
                        // Embedded webviews are sandboxed in places: open the same app in the system browser.
                        let url = "http://127.0.0.1:17870/?daw=ws://127.0.0.1:17871&record=1";
                        #[cfg(target_os = "macos")] let _ = std::process::Command::new("open").arg(url).spawn();
                        #[cfg(target_os = "windows")] let _ = std::process::Command::new("cmd").args(["/C", "start", "", url]).spawn();
                        #[cfg(target_os = "linux")] let _ = std::process::Command::new("xdg-open").arg(url).spawn();
                    }
                    "pull" => {
                        let w = sh.widx.load(Relaxed);
                        let mut c = cursor.unwrap_or(w);
                        if w.saturating_sub(c) > (RING as u64) / 2 {
                            c = w.saturating_sub(MAX_PULL as u64);
                        }
                        let to = (c + MAX_PULL as u64).min(w);
                        ws.send(Message::Binary(sh.pcm_since(c, to)))?;
                        cursor = Some(to);
                    }
                    "windows" => {
                        ws.send(Message::Text(format!("{{\"t\":\"windows\",\"list\":{}}}", crate::capture::list_windows_json()).into()))?;
                    }
                    "pick_window" => {
                        let id = v["id"].as_u64().map(|x| x as u32).filter(|x| *x != 0);
                        if let Ok(mut p) = cap.pick.lock() { *p = id; }
                    }
                    "cap" => {
                        if v["on"].as_bool().unwrap_or(false) {
                            cap.configure(v["fps"].as_u64().unwrap_or(20) as u32, v["w"].as_u64().unwrap_or(960) as u32);
                            if guard.0.is_none() {
                                cap.acquire(cap.clone());
                                guard.0 = Some(cap.clone());
                                frame_seq = 0;
                                status_seq = 0;
                            }
                        } else if let Some(c) = guard.0.take() {
                            c.release();
                        }
                    }
                    "save_begin" => {
                        let dir = out_dir();
                        let _ = std::fs::create_dir_all(&dir);
                        let path = dir.join(safe_name(v["name"].as_str().unwrap_or("")));
                        save = std::fs::File::create(&path).ok().map(|f| (f, path));
                    }
                    "save_end" => {
                        let msg = match save.take() {
                            Some((mut f, p)) => {
                                let _ = f.flush();
                                serde_json::json!({"t": "saved", "path": p.to_string_lossy()})
                            }
                            None => serde_json::json!({"t": "saved", "path": null}),
                        };
                        ws.send(Message::Text(msg.to_string()))?;
                    }
                    _ => {}
                }
            }
            Ok(Message::Binary(b)) => {
                if let Some((f, _)) = save.as_mut() {
                    let _ = f.write_all(&b);
                }
            }
            Ok(Message::Close(_)) => return Ok(()),
            Ok(_) => {}
            Err(tungstenite::Error::Io(e)) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(e) => return Err(e.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn origins() {
        assert!(origin_ok("http://127.0.0.1:17870"));
        assert!(origin_ok("http://localhost:8000"));
        assert!(!origin_ok("https://evil.example"));
    }
    #[test]
    fn names() {
        assert_eq!(safe_name("../../x y.mp4"), "u2c-recording.webm");
        assert_eq!(safe_name("u2c daw.mp4"), "u2cdaw.mp4");
    }
    #[test]
    fn serves_app_and_ws_streams() {
        let s = servers();
        s.shared.bpm.store(133f64.to_bits(), Relaxed);
        s.shared.begin_block(Some(8.0), true, 1000);
        for i in 0..1000 {
            s.shared.push(i as f32 / 1000.0, -(i as f32) / 1000.0);
        }
        // 1000 samples at 44.1 kHz, 133 BPM past beat 8
        let want = 8.0 + 1000.0 / 44100.0 * 133.0 / 60.0;
        assert!((s.shared.beats_now() - want).abs() < 1e-9);
        assert!(s.shared.jumps.load(Relaxed) >= 1);
        let j = s.shared.jumps.load(Relaxed);
        s.shared.begin_block(Some(8.0 + 1000.0 / 44100.0 * 133.0 / 60.0), true, 1000);   // contiguous: no jump
        assert_eq!(s.shared.jumps.load(Relaxed), j);
        s.shared.begin_block(Some(2.0), true, 1000);   // seek
        assert_eq!(s.shared.jumps.load(Relaxed), j + 1);
        s.shared.begin_block(Some(8.0), true, 1000);
        let idx = lookup("/index.html").unwrap();
        assert!(idx.len() > 1000);
        assert!(lookup("/src/bridge/daw.js").is_some());
        let (mut ws, _) = tungstenite::connect(format!("ws://127.0.0.1:{}", s.ws_port)).unwrap();
        let m = ws.read().unwrap();
        let t = m.to_text().unwrap();
        assert!(t.contains("\"bpm\":133") && t.contains("\"ts\":[4,4]"));
        ws.send(Message::Text("{\"t\":\"pull\"}".into())).unwrap();
        loop {
            if let Message::Binary(b) = ws.read().unwrap() {
                assert_eq!(&b[..4], b"PCM0");
                let n = u32::from_le_bytes(b[8..12].try_into().unwrap()) as usize;
                assert_eq!(b.len(), 20 + n * 8);
                break;
            }
        }
    }
    #[test]
    fn worker_streams_hits_over_the_websocket() {
        let s = servers();
        let (mut ws, _) = tungstenite::connect(format!("ws://127.0.0.1:{}", s.ws_port)).unwrap();
        // feed a synthetic kick (sweep 135 -> 45 Hz) after half a second of near-silence, as the audio thread would
        let sr = s.shared.sr.load(Relaxed) as f32;
        let feed = |n: usize, f: &dyn Fn(usize) -> f32| for i in 0..n { let v = f(i); s.shared.push(v, v); };
        let t0 = std::time::Instant::now();
        let mut got = None;
        std::thread::scope(|sc| {
            sc.spawn(|| {
                for round in 0..40 {
                    feed((0.5 * sr) as usize, &|i| 1e-4 * ((i * 7919 % 97) as f32 / 48.0 - 1.0));
                                        feed((0.3 * sr) as usize, &|i| { let t = i as f32 / sr; let ph = 2.0 * std::f32::consts::PI * (45.0 * t + 3.0 * (1.0 - (-t * 30.0).exp())); 0.9 * ph.sin() * (-t / 0.12).exp() });
                    std::thread::sleep(Duration::from_millis(150));
                    if round > 0 && t0.elapsed() > Duration::from_secs(8) { break; }
                }
            });
            if let tungstenite::stream::MaybeTlsStream::Plain(st) = ws.get_ref() { st.set_read_timeout(Some(Duration::from_secs(10))).ok(); }
            while t0.elapsed() < Duration::from_secs(9) {
                if let Ok(Message::Text(t)) = ws.read() {
                    if t.contains("\"t\":\"hits\"") { got = Some(t); break; }
                }
            }
        });
        let t = got.expect("a hits event");
        let v: serde_json::Value = serde_json::from_str(&t).unwrap();
        assert!(v["kick"].as_f64().unwrap() > 0.0 && v["pos"].as_u64().is_some() && v["beats"].is_number(), "{t}");
    }
}
