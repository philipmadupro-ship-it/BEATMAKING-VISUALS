//! Localhost servers: HTTP (the embedded web app + /__daw.json) and WebSocket (transport + PCM pull).
//! Both bind 127.0.0.1 only. The WebSocket refuses non-local Origins (set U2C_DAW_ORIGINS="https://a,https://b" to allow more).

use include_dir::{include_dir, Dir};
use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
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

/// Audio-thread to server-thread state. Lock-free; f32/f64 travel as bits in atomics.
pub struct Shared {
    pub bpm: AtomicU64,
    pub beats: AtomicU64,
    pub playing: AtomicBool,
    pub rms: AtomicU32,
    pub peak: AtomicU32,
    pub sr: AtomicU32,
    pub widx: AtomicU64,
    ring: Vec<AtomicU32>,
}

impl Shared {
    fn new() -> Self {
        Self {
            bpm: AtomicU64::new(120f64.to_bits()),
            beats: AtomicU64::new(0),
            playing: AtomicBool::new(false),
            rms: AtomicU32::new(0),
            peak: AtomicU32::new(0),
            sr: AtomicU32::new(44100),
            widx: AtomicU64::new(0),
            ring: (0..RING).map(|_| AtomicU32::new(0)).collect(),
        }
    }
    /// Push one mono sample (audio thread).
    #[inline]
    pub fn push(&self, s: f32) {
        let w = self.widx.load(Relaxed);
        self.ring[(w as usize) & (RING - 1)].store(s.to_bits(), Relaxed);
        self.widx.store(w + 1, Relaxed);
    }
    /// Copy samples [from, to) as little-endian bytes, preceded by the [sr][n] header.
    pub fn pcm_since(&self, from: u64, to: u64) -> Vec<u8> {
        let n = (to - from) as usize;
        let mut out = Vec::with_capacity(8 + n * 4);
        out.extend_from_slice(&self.sr.load(Relaxed).to_le_bytes());
        out.extend_from_slice(&(n as u32).to_le_bytes());
        for i in from..to {
            out.extend_from_slice(&f32::from_bits(self.ring[(i as usize) & (RING - 1)].load(Relaxed)).to_le_bytes());
        }
        out
    }
    fn transport_json(&self) -> String {
        serde_json::json!({
            "t": "transport",
            "bpm": f64::from_bits(self.bpm.load(Relaxed)),
            "beats": f64::from_bits(self.beats.load(Relaxed)),
            "playing": self.playing.load(Relaxed),
            "rms": f32::from_bits(self.rms.load(Relaxed)),
            "peak": f32::from_bits(self.peak.load(Relaxed)),
            "sr": self.sr.load(Relaxed),
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
        let ws_l = bind(WS_PORT);
        let http = bind_http(HTTP_PORT);
        let ws_port = ws_l.local_addr().map(|a| a.port()).unwrap_or(WS_PORT);
        let http_port = http.server_addr().to_ip().map(|a| a.port()).unwrap_or(HTTP_PORT);
        let sh = shared.clone();
        std::thread::spawn(move || {
            for s in ws_l.incoming().flatten() {
                let sh = sh.clone();
                std::thread::spawn(move || {
                    let _ = client(s, sh);
                });
            }
        });
        std::thread::spawn(move || {
            for rq in http.incoming_requests() {
                respond(rq, ws_port);
            }
        });
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

fn lookup(path: &str) -> Option<&'static [u8]> {
    let p = path.trim_start_matches('/');
    if p.is_empty() || p == "index.html" {
        return Some(INDEX);
    }
    if p.contains("..") {
        return None;
    }
    if let Some(r) = p.strip_prefix("src/") {
        return SRC.get_file(r).map(|f| f.contents());
    }
    if let Some(r) = p.strip_prefix("assets/") {
        return ASSETS.get_file(r).map(|f| f.contents());
    }
    None
}

fn respond(rq: tiny_http::Request, ws_port: u16) {
    let path = rq.url().split('?').next().unwrap_or("/").to_string();
    let hdr = |k: &str, v: &str| tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap();
    if path == "/__daw.json" {
        let body = format!("{{\"ws\":{}}}", ws_port);
        let _ = rq.respond(tiny_http::Response::from_string(body).with_header(hdr("Content-Type", "application/json")).with_header(hdr("Cache-Control", "no-store")));
        return;
    }
    match lookup(&path) {
        Some(b) => {
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

fn client(stream: TcpStream, sh: Arc<Shared>) -> Result<(), Box<dyn std::error::Error>> {
    let mut ws = tungstenite::accept_hdr(stream, |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        match req.headers().get("origin").and_then(|v| v.to_str().ok()) {
            Some(o) if !origin_ok(o) => Err(ErrorResponse::new(Some("origin not allowed".into()))),
            _ => Ok(resp),
        }
    })
    .map_err(|e| e.to_string())?;
    ws.get_ref().set_read_timeout(Some(Duration::from_millis(20)))?;
    ws.get_ref().set_nodelay(true)?;
    let mut cursor: Option<u64> = None;
    let mut last = Instant::now() - Duration::from_secs(1);
    loop {
        if last.elapsed() >= Duration::from_millis(33) {
            last = Instant::now();
            ws.send(Message::Text(sh.transport_json()))?;
        }
        match ws.read() {
            Ok(Message::Text(t)) => {
                if t.contains("\"pull\"") {
                    let w = sh.widx.load(Relaxed);
                    let mut c = cursor.unwrap_or(w);
                    if w.saturating_sub(c) > (RING as u64) / 2 {
                        c = w.saturating_sub(MAX_PULL as u64);
                    }
                    let to = (c + MAX_PULL as u64).min(w);
                    ws.send(Message::Binary(sh.pcm_since(c, to)))?;
                    cursor = Some(to);
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
    fn serves_app_and_ws_streams() {
        let s = servers();
        s.shared.bpm.store(133f64.to_bits(), Relaxed);
        for i in 0..1000 {
            s.shared.push(i as f32 / 1000.0);
        }
        let idx = lookup("/index.html").unwrap();
        assert!(idx.len() > 1000);
        assert!(lookup("/src/bridge/daw.js").is_some());
        let (mut ws, _) = tungstenite::connect(format!("ws://127.0.0.1:{}", s.ws_port)).unwrap();
        let m = ws.read().unwrap();
        assert!(m.to_text().unwrap().contains("\"bpm\":133"));
        ws.send(Message::Text("{\"t\":\"pull\"}".into())).unwrap();
        loop {
            if let Message::Binary(b) = ws.read().unwrap() {
                assert!(b.len() >= 8);
                break;
            }
        }
    }
}
