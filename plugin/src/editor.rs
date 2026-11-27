//! Embedded webview editor (wry). Loads the app from the plugin's own 127.0.0.1 server.

use nih_plug::prelude::*;
use raw_window_handle::{HandleError, HasWindowHandle, RawWindowHandle, WindowHandle};
use std::any::Any;
use std::sync::Arc;
use wry::{dpi::{LogicalPosition, LogicalSize}, Rect, WebView, WebViewBuilder};

pub const SIZE: (u32, u32) = (1280, 800);

pub struct WebEditor;

struct Parent(RawWindowHandle);
impl HasWindowHandle for Parent {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        Ok(unsafe { WindowHandle::borrow_raw(self.0) })
    }
}

fn raw(parent: ParentWindowHandle) -> RawWindowHandle {
    match parent {
        #[cfg(target_os = "linux")]
        ParentWindowHandle::X11Window(id) => RawWindowHandle::Xlib(raw_window_handle::XlibWindowHandle::new(id as std::ffi::c_ulong)),
        #[cfg(target_os = "macos")]
        ParentWindowHandle::AppKitHandle(p) => RawWindowHandle::AppKit(raw_window_handle::AppKitWindowHandle::new(std::ptr::NonNull::new(p).expect("nsview"))),
        #[cfg(target_os = "windows")]
        ParentWindowHandle::Win32Hwnd(p) => RawWindowHandle::Win32(raw_window_handle::Win32WindowHandle::new(std::num::NonZeroIsize::new(p as isize).expect("hwnd"))),
        #[allow(unreachable_patterns)]
        _ => panic!("unsupported parent window handle"),
    }
}

fn build(parent: &Parent) -> wry::Result<WebView> {
    let s = crate::server::servers();
    let url = format!("http://127.0.0.1:{}/index.html?daw=ws://127.0.0.1:{}", s.http_port, s.ws_port);
    WebViewBuilder::new()
        .with_url(url)
        .with_bounds(Rect { position: LogicalPosition::new(0, 0).into(), size: LogicalSize::new(SIZE.0, SIZE.1).into() })
        .build_as_child(parent)
}

struct Handle {
    #[cfg(target_os = "linux")]
    stop: Arc<std::sync::atomic::AtomicBool>,
    #[cfg(target_os = "linux")]
    thread: Option<std::thread::JoinHandle<()>>,
    #[cfg(not(target_os = "linux"))]
    _view: Option<WebView>,
}
// The webview is created, used and dropped on one thread (linux: its own GTK thread; elsewhere: the host UI thread).
unsafe impl Send for Handle {}

#[cfg(target_os = "linux")]
impl Drop for Handle {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Editor for WebEditor {
    fn spawn(&self, parent: ParentWindowHandle, _ctx: Arc<dyn GuiContext>) -> Box<dyn Any + Send> {
        let parent = Parent(raw(parent));
        #[cfg(target_os = "linux")]
        {
            // Hosts do not run a GTK main loop for us: own one on a dedicated thread.
            struct P(Parent);
            unsafe impl Send for P {}
            let p = P(parent);
            let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let s2 = stop.clone();
            let thread = std::thread::spawn(move || {
                let p = p;
                if gtk::init().is_err() {
                    nih_log!("U2C Studio: gtk init failed");
                    return;
                }
                let view = match build(&p.0) {
                    Ok(v) => v,
                    Err(e) => {
                        nih_log!("U2C Studio: webview failed: {e}");
                        return;
                    }
                };
                while !s2.load(std::sync::atomic::Ordering::Relaxed) {
                    while gtk::events_pending() {
                        gtk::main_iteration_do(false);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(8));
                }
                drop(view);
            });
            Box::new(Handle { stop, thread: Some(thread) })
        }
        #[cfg(not(target_os = "linux"))]
        {
            let view = build(&parent).map_err(|e| nih_log!("U2C Studio: webview failed: {e}")).ok();
            Box::new(Handle { _view: view })
        }
    }
    fn size(&self) -> (u32, u32) {
        SIZE
    }
    fn set_scale_factor(&self, _factor: f32) -> bool {
        true
    }
    fn param_value_changed(&self, _id: &str, _v: f32) {}
    fn param_modulation_changed(&self, _id: &str, _v: f32) {}
    fn param_values_changed(&self) {}
}
