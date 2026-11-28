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
const MIDI_RING: usize = 1024;

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
    /// Latest packet per U2C Send instance (id -> (received, packet, has new data)); the worker publishes them as one `sends` list.
    /// MIDI note ring (audio thread writes, the worker reads): two words per event, see `midi_push`.
    midi: Vec<AtomicU64>,
    midi_w: AtomicU64,
    midi_host: Vec<std::sync::atomic::AtomicI64>,
    pub sends: std::sync::Mutex<std::collections::HashMap<String, (Instant, serde_json::Value, bool)>>,
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
            sends: Default::default(),
            midi: (0..MIDI_RING * 2).map(|_| AtomicU64::new(0)).collect(),
            midi_w: AtomicU64::new(0),
            midi_host: (0..MIDI_RING).map(|_| std::sync::atomic::AtomicI64::new(-1)).collect(),
        }
    }
    /// Audio thread: record a note event. `pos` = ring index of the event's sample (blk_widx + timing), `host` = host sample position or -1.
    pub fn midi_push(&self, on: bool, channel: u8, note: u8, vel: f32, pos: u64, host: i64) {
        let w = self.midi_w.load(Relaxed);
        let i = (w as usize % MIDI_RING) * 2;
        let meta = ((on as u64) << 40) | ((channel as u64) << 32) | ((note as u64) << 24) | (((vel.clamp(0.0, 1.0) * 1000.0) as u64) << 8);
        self.midi[i].store(meta, Relaxed);
        self.midi[i + 1].store(pos, Relaxed);
        self.midi_host[(w as usize) % MIDI_RING].store(host, Relaxed);
        self.midi_w.store(w + 1, std::sync::atomic::Ordering::Release);
    }
    /// Worker: events after `cursor` (cursor moves to the head). Events overwritten while the worker was away are skipped.
    pub fn midi_drain(&self, cursor: &mut u64) -> Vec<(bool, u8, u8, f32, u64, i64)> {
        let w = self.midi_w.load(std::sync::atomic::Ordering::Acquire);
        if w.saturating_sub(*cursor) > MIDI_RING as u64 {
            *cursor = w - MIDI_RING as u64 / 2;
        }
        let mut out = Vec::new();
        while *cursor < w {
            let i = (*cursor as usize % MIDI_RING) * 2;
            let (meta, pos) = (self.midi[i].load(Relaxed), self.midi[i + 1].load(Relaxed));
            out.push((meta >> 40 & 1 == 1, (meta >> 32) as u8, (meta >> 24) as u8, ((meta >> 8) & 0xffff) as f32 / 1000.0, pos, self.midi_host[*cursor as usize % MIDI_RING].load(Relaxed)));
            *cursor += 1;
        }
        out
    }
    pub fn midi_head(&self) -> u64 {
        self.midi_w.load(std::sync::atomic::Ordering::Acquire)
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

/// `{t:"recordings", list:[{name, path, size, age}]}`: the 10 newest files in the recordings folder.
fn recordings_json() -> String {
    let mut v: Vec<(std::time::SystemTime, String, u64)> = std::fs::read_dir(out_dir())
        .map(|d| d.flatten().filter_map(|e| { let m = e.metadata().ok()?; if !m.is_file() { return None; } Some((m.modified().ok()?, e.file_name().to_string_lossy().into_owned(), m.len())) }).collect())
        .unwrap_or_default();
    v.sort_by(|a, b| b.0.cmp(&a.0));
    let now = std::time::SystemTime::now();
    let list: Vec<serde_json::Value> = v.into_iter().take(10).map(|(t, n, sz)| {
        serde_json::json!({"name": n, "path": out_dir().join(&n).to_string_lossy(), "size": sz, "age": now.duration_since(t).map(|d| d.as_secs()).unwrap_or(0)})
    }).collect();
    serde_json::json!({"t": "recordings", "list": list}).to_string()
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
    let mut is_send = false;   // a U2C Send plugin talking to us: it only gets what it sends, no transport / event stream
    let mut save: Option<(std::fs::File, std::path::PathBuf)> = None;
    loop {
        if !is_send && last.elapsed() >= Duration::from_millis(16) {
            last = Instant::now();
            ws.send(Message::Text(sh.transport_json()))?;
        }
        if !is_send {
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
                    "send" => {
                        is_send = true;
                        let id = v["id"].as_str().unwrap_or("").chars().filter(|c| c.is_ascii_alphanumeric()).take(32).collect::<String>();
                        if !id.is_empty() && t.len() < 2048 {
                            let mut pk = v.clone();
                            pk["id"] = id.clone().into();
                            pk["rx"] = sh.widx.load(Relaxed).into();   // our own ring index when it arrived: the web app places it like a hit
                            if let Ok(mut m) = sh.sends.lock() {
                                // hit flags accumulate until the next `sends` publication, so none is lost between two of them
                                if let Some((_, old, fresh)) = m.get(&id) {
                                    if *fresh {
                                        for k in ["kick", "snare", "hat"] {
                                            let a = old[k].as_f64().unwrap_or(0.0).max(pk[k].as_f64().unwrap_or(0.0));
                                            pk[k] = a.into();
                                        }
                                    }
                                }
                                if m.len() < 32 || m.contains_key(&id) {
                                    m.insert(id, (Instant::now(), pk, true));
                                }
                            }
                        }
                    }
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
                    "reveal" => {
                        // Show a recording in Finder / Explorer. Only files inside the recordings folder (by name) can be revealed.
                        let p = out_dir().join(safe_name(v["name"].as_str().unwrap_or("")));
                        if p.is_file() {
                            #[cfg(target_os = "macos")] let _ = std::process::Command::new("open").arg("-R").arg(&p).spawn();
                            #[cfg(target_os = "windows")] let _ = std::process::Command::new("explorer").arg(format!("/select,{}", p.display())).spawn();
                            #[cfg(target_os = "linux")] let _ = std::process::Command::new("xdg-open").arg(out_dir()).spawn();
                        }
                    }
                    "recordings" => {
                        ws.send(Message::Text(recordings_json().into()))?;
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
                        ws.send(Message::Text(recordings_json().into()))?;
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
    /// The tests share one process-wide server and audio ring: run the ones that write audio one at a time.
    static AUDIO: std::sync::Mutex<()> = std::sync::Mutex::new(());
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
        let _g = AUDIO.lock().unwrap_or_else(|e| e.into_inner());
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
        let _g = AUDIO.lock().unwrap_or_else(|e| e.into_inner());
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

    #[test]
    fn worker_streams_meters_over_the_websocket() {
        let _g = AUDIO.lock().unwrap_or_else(|e| e.into_inner());
        let s = servers();
        let (mut ws, _) = tungstenite::connect(format!("ws://127.0.0.1:{}", s.ws_port)).unwrap();
        if let tungstenite::stream::MaybeTlsStream::Plain(st) = ws.get_ref() { st.set_read_timeout(Some(Duration::from_secs(10))).ok(); }
        let sr = s.shared.sr.load(Relaxed) as f32;
        s.shared.begin_block(Some(0.0), true, 1000);
        let t0 = std::time::Instant::now();
        let mut got = None;
        std::thread::scope(|sc| {
            sc.spawn(|| {
                let mut n = 0usize;
                while t0.elapsed() < Duration::from_secs(9) && n < 20 {
                    for i in 0..(0.25 * sr) as usize { let v = 0.1 * (2.0 * std::f32::consts::PI * 1000.0 * (n * (0.25 * sr) as usize + i) as f32 / sr).sin(); s.shared.push(v, v); }
                    n += 1;
                    std::thread::sleep(Duration::from_millis(100));
                }
            });
            while t0.elapsed() < Duration::from_secs(9) {
                if let Ok(Message::Text(t)) = ws.read() {
                    if t.contains("\"t\":\"meters\"") {
                        let v: serde_json::Value = serde_json::from_str(&t).unwrap();
                        if (v["momentary"].as_f64().unwrap() + 20.0).abs() < 1.0 { got = Some(v); break; }
                    }
                }
            }
        });
        let v = got.expect("a meters event near -20 LUFS");
        assert!((v["peakL"].as_f64().unwrap() + 20.0).abs() < 1.0 && v["spec"].as_array().unwrap().len() == 61 && v["corr"].as_f64().unwrap() > 0.99);
    }

    #[test]
    fn sends_are_listed_and_forwarded() {
        let _g = AUDIO.lock().unwrap_or_else(|e| e.into_inner());
        let s = servers();
        let (mut web, _) = tungstenite::connect(format!("ws://127.0.0.1:{}", s.ws_port)).unwrap();
        if let tungstenite::stream::MaybeTlsStream::Plain(st) = web.get_ref() { st.set_read_timeout(Some(Duration::from_secs(5))).ok(); }
        let (mut snd, _) = tungstenite::connect(format!("ws://127.0.0.1:{}", s.ws_port)).unwrap();
        let pk = serde_json::json!({"t": "send", "id": "ab12cd34", "name": "Send ab12", "rms": 0.2, "peak": 0.5, "bands": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], "kick": 0.9, "snare": 0, "hat": 0, "pos": 12345});
        snd.send(Message::Text(pk.to_string())).unwrap();
        let t0 = std::time::Instant::now();
        let mut got = None;
        while t0.elapsed() < Duration::from_secs(5) {
            if let Ok(Message::Text(t)) = web.read() {
                if t.contains("\"t\":\"sends\"") && t.contains("ab12cd34") { got = Some(t); break; }
            }
        }
        let v: serde_json::Value = serde_json::from_str(&got.expect("a sends list")).unwrap();
        let e = &v["list"][0];
        assert!(e["id"] == "ab12cd34" && e["kick"].as_f64().unwrap() > 0.8 && e["bands"].as_array().unwrap().len() == 8 && e["rx"].is_number(), "{e}");
    }

    #[test]
    fn midi_notes_reach_the_websocket() {
        let _g = AUDIO.lock().unwrap_or_else(|e| e.into_inner());
        let s = servers();
        let (mut ws, _) = tungstenite::connect(format!("ws://127.0.0.1:{}", s.ws_port)).unwrap();
        if let tungstenite::stream::MaybeTlsStream::Plain(st) = ws.get_ref() { st.set_read_timeout(Some(Duration::from_secs(5))).ok(); }
        std::thread::sleep(Duration::from_millis(100));
        s.shared.midi_push(true, 2, 60, 0.8, s.shared.widx.load(Relaxed), 48000);
        s.shared.midi_push(false, 2, 60, 0.0, s.shared.widx.load(Relaxed) + 100, -1);
        let t0 = std::time::Instant::now();
        let mut got = Vec::new();
        while t0.elapsed() < Duration::from_secs(5) && got.len() < 2 {
            if let Ok(Message::Text(t)) = ws.read() {
                if t.contains("\"t\":\"midi\"") { got.push(serde_json::from_str::<serde_json::Value>(&t).unwrap()); }
            }
        }
        assert_eq!(got.len(), 2);
        assert!(got[0]["on"] == true && got[0]["note"] == 60 && got[0]["ch"] == 2 && (got[0]["vel"].as_f64().unwrap() - 0.8).abs() < 0.01 && got[0]["host"] == 48000);
        assert!(got[1]["on"] == false && got[1]["host"].is_null());
    }
}
