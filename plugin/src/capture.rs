//! Native capture of the DAW window (macOS + Windows, via xcap), streamed to the web app as JPEG frames over the WebSocket.
//! The plugin lives inside the DAW process, so the host's own windows are captured without any extra permission on macOS;
//! if the OS reports it cannot capture, the Screen Recording permission is requested once and explained in the UI.

use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering::Relaxed};
use std::sync::{Arc, Mutex};

pub struct Capture {
    want: AtomicUsize,
    running: AtomicBool,
    fps: AtomicU32,
    width: AtomicU32,
    frame: Mutex<(u64, Vec<u8>)>,
    status: Mutex<(u64, String)>,
}

impl Capture {
    pub fn new() -> Self {
        Self { want: AtomicUsize::new(0), running: AtomicBool::new(false), fps: AtomicU32::new(20), width: AtomicU32::new(960), frame: Mutex::new((0, Vec::new())), status: Mutex::new((0, String::new())) }
    }
    pub fn configure(&self, fps: u32, width: u32) {
        self.fps.store(fps.clamp(5, 30), Relaxed);
        self.width.store(width.clamp(320, 1920), Relaxed);
    }
    /// A client wants frames: start the capture thread if it is not running.
    pub fn acquire(&self, me: Arc<Capture>) {
        self.want.fetch_add(1, Relaxed);
        if !self.running.swap(true, Relaxed) {
            std::thread::spawn(move || me.run());
        }
    }
    pub fn release(&self) {
        let _ = self.want.fetch_update(Relaxed, Relaxed, |n| Some(n.saturating_sub(1)));
    }
    pub fn frame_if_newer(&self, seq: u64) -> Option<(u64, Vec<u8>)> {
        let f = self.frame.lock().ok()?;
        if f.0 > seq && !f.1.is_empty() { Some((f.0, f.1.clone())) } else { None }
    }
    pub fn status_if_newer(&self, seq: u64) -> Option<(u64, String)> {
        let s = self.status.lock().ok()?;
        if s.0 > seq { Some((s.0, s.1.clone())) } else { None }
    }
    fn set_status(&self, msg: &str) {
        if let Ok(mut s) = self.status.lock() {
            if s.1 != msg {
                *s = (s.0 + 1, msg.to_string());
            }
        }
    }
    fn run(&self) {
        let mut win = imp::Finder::default();
        let mut asked = false;
        while self.want.load(Relaxed) > 0 {
            let t0 = std::time::Instant::now();
            match win.grab(self.width.load(Relaxed)) {
                Ok(jpg) => {
                    self.set_status("ok");
                    if let Ok(mut f) = self.frame.lock() {
                        *f = (f.0 + 1, jpg);
                    }
                }
                Err(e) => {
                    if !asked && imp::needs_permission() {
                        asked = true;
                        imp::request_permission();
                        self.set_status("permission: macOS asks once for Screen Recording. Allow it for your DAW in System Settings > Privacy & Security > Screen Recording, then restart the DAW.");
                    } else {
                        self.set_status(&format!("error: {e}"));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                }
            }
            let budget = std::time::Duration::from_millis(1000 / self.fps.load(Relaxed).max(1) as u64);
            if let Some(rest) = budget.checked_sub(t0.elapsed()) {
                std::thread::sleep(rest);
            }
        }
        if let Ok(mut f) = self.frame.lock() {
            f.1.clear();
        }
        self.running.store(false, Relaxed);
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod imp {
    use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ExtendedColorType};
    use std::time::{Duration, Instant};
    use xcap::Window;

    #[derive(Default)]
    pub struct Finder {
        win: Option<Window>,
        at: Option<Instant>,
    }

    impl Finder {
        /// The biggest visible window of this process (the DAW's main window), preferring not to pick our own plugin window.
        fn find(&mut self) -> Result<(), String> {
            if self.win.is_some() && self.at.map_or(false, |t| t.elapsed() < Duration::from_secs(2)) {
                return Ok(());
            }
            let pid = std::process::id();
            let mut best: Option<(u64, Window)> = None;
            for w in Window::all().map_err(|e| e.to_string())? {
                if w.pid().unwrap_or(0) != pid || w.is_minimized().unwrap_or(false) {
                    continue;
                }
                let (ww, hh) = (w.width().unwrap_or(0), w.height().unwrap_or(0));
                if ww < 400 || hh < 250 {
                    continue;
                }
                let ours = w.title().unwrap_or_default().contains("U2C");
                let area = ww as u64 * hh as u64 / if ours { 100 } else { 1 };
                if best.as_ref().map_or(true, |(a, _)| area > *a) {
                    best = Some((area, w));
                }
            }
            self.win = best.map(|(_, w)| w);
            self.at = Some(Instant::now());
            if self.win.is_some() { Ok(()) } else { Err("no DAW window found".into()) }
        }

        pub fn grab(&mut self, max_w: u32) -> Result<Vec<u8>, String> {
            self.find()?;
            let img = match self.win.as_ref().map(|w| w.capture_image()) {
                Some(Ok(i)) => i,
                Some(Err(e)) => {
                    self.win = None;
                    return Err(e.to_string());
                }
                None => return Err("no DAW window found".into()),
            };
            let (w, h) = img.dimensions();
            if w == 0 || h == 0 {
                return Err("empty capture".into());
            }
            let (nw, nh) = if w > max_w { (max_w, (h as u64 * max_w as u64 / w as u64).max(1) as u32) } else { (w, h) };
            let small = if nw != w { image::imageops::resize(&img, nw, nh, FilterType::Triangle) } else { img };
            let rgb: Vec<u8> = small.pixels().flat_map(|p| [p[0], p[1], p[2]]).collect();
            let mut out = b"JPG0".to_vec();
            JpegEncoder::new_with_quality(&mut out, 72).encode(&rgb, nw, nh, ExtendedColorType::Rgb8).map_err(|e| e.to_string())?;
            Ok(out)
        }
    }

    #[cfg(target_os = "macos")]
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }
    #[cfg(target_os = "macos")]
    pub fn needs_permission() -> bool {
        !unsafe { CGPreflightScreenCaptureAccess() }
    }
    #[cfg(target_os = "macos")]
    pub fn request_permission() {
        unsafe {
            CGRequestScreenCaptureAccess();
        }
    }
    #[cfg(not(target_os = "macos"))]
    pub fn needs_permission() -> bool {
        false
    }
    #[cfg(not(target_os = "macos"))]
    pub fn request_permission() {}
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
    #[derive(Default)]
    pub struct Finder;
    impl Finder {
        pub fn grab(&mut self, _max_w: u32) -> Result<Vec<u8>, String> {
            Err("window capture is available on macOS and Windows".into())
        }
    }
    pub fn needs_permission() -> bool {
        false
    }
    pub fn request_permission() {}
}
