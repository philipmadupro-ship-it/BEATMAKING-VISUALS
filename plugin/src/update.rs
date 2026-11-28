//! Auto-update: keeps the served web app current (downloaded copy, embedded fallback) and tells the web UI when a
//! newer plugin build is published. All network work runs on background threads, never the audio thread.
//! Opt out with U2C_NO_UPDATE=1.

use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use u2c_updater as u;

/// Commit this plugin was built from ("dev" for local builds).
pub const BUILD: &str = env!("GIT_SHA");

static WEBROOT: RwLock<Option<PathBuf>> = RwLock::new(None);
static STATE: Mutex<State> = Mutex::new(State::new());

struct State {
    latest: String,
    available: bool,
    status: &'static str,
    msg: String,
    asset: Option<u::Asset>,
    webapp: String,
}

impl State {
    const fn new() -> Self {
        Self { latest: String::new(), available: false, status: "idle", msg: String::new(), asset: None, webapp: String::new() }
    }
}

fn st() -> std::sync::MutexGuard<'static, State> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

fn set_status(status: &'static str, msg: impl Into<String>) {
    let mut s = st();
    s.status = status;
    s.msg = msg.into();
}

/// Directory holding the downloaded web app to serve, if any.
pub fn webroot() -> Option<PathBuf> {
    WEBROOT.read().ok().and_then(|g| g.clone())
}

fn set_webroot(v: Option<(String, PathBuf)>) {
    if let Ok(mut g) = WEBROOT.write() {
        *g = v.as_ref().map(|(_, d)| d.clone());
    }
    st().webapp = v.map(|(v, _)| v).unwrap_or_else(|| "embedded".into());
}

/// Start the background checks (once per process).
pub fn start() {
    if cfg!(test) || std::env::var_os("U2C_NO_UPDATE").is_some() {
        return;
    }
    std::thread::spawn(|| {
        let cache = u::data_dir().join("webapp");
        let have = u::cached_webapp(&cache);
        let have_v = have.as_ref().map(|(v, _)| v.clone());
        set_webroot(have);
        match u::sync_webapp(&cache, have_v.as_deref(), BUILD) {
            Ok(u::WebSync::Updated(v, d)) => set_webroot(Some((v, d))),
            Ok(u::WebSync::Embedded) => set_webroot(None),
            Ok(u::WebSync::Current) => {}
            Err(_) => {} // offline or bad download: keep what is being served
        }
        if let Ok((latest, asset)) = u::latest_plugin() {
            let mut s = st();
            s.available = u::is_update(BUILD, &latest);
            s.latest = latest;
            s.asset = Some(asset);
        }
    });
}

fn json() -> String {
    let s = st();
    serde_json::json!({
        "current": BUILD, "latest": s.latest, "available": s.available,
        "status": s.status, "msg": s.msg, "webapp": s.webapp,
    })
    .to_string()
}

fn download_job(install: bool) {
    let asset = st().asset.clone();
    let Some(asset) = asset else { return set_status("error", "No update information yet") };
    set_status("downloading", "Downloading the update...");
    let dir = u::downloads_dir();
    let zip = match u::download_plugin(&asset, &dir) {
        Ok(z) => z,
        Err(e) => return set_status("error", e),
    };
    if !install {
        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("open").arg(&zip).spawn();
        return set_status("downloaded", format!("Saved to {}. Close your DAW, then run install-mac.command from it (or press Install update).", zip.display()));
    }
    set_status("installing", "Installing... approve the password prompt. Restart your DAW afterwards.");
    match u::install_zip(&zip) {
        Ok(m) => {
            st().available = false;
            set_status("installed", m)
        }
        Err(e) => set_status("error", e),
    }
}

/// `/__update.json` (GET) and `/__update/download`, `/__update/install` (POST, `guarded` = trusted caller). Returns (status, body).
pub fn http(post: bool, path: &str, guarded: bool) -> (u16, String) {
    match (post, path) {
        (false, "/__update.json") => (200, json()),
        (true, "/__update/download" | "/__update/install") if guarded => {
            if matches!(st().status, "downloading" | "installing") {
                return (200, json());
            }
            let install = path.ends_with("install");
            set_status(if install { "installing" } else { "downloading" }, "Starting...");
            std::thread::spawn(move || download_job(install));
            (200, json())
        }
        (true, _) if !guarded => (403, "{\"error\":\"forbidden\"}".into()),
        _ => (404, "{\"error\":\"not found\"}".into()),
    }
}

/// Injected into the served index.html: a small corner notice shown only when a newer plugin build exists.
pub const BANNER: &str = r#"<script>(function(){
var H={'X-U2C-Update':'1'},box,off=false;
function E(t,c){var e=document.createElement(t);if(c)e.style.cssText=c;return e}
function B(label,url){var b=E('button','margin:6px 6px 0 0;padding:3px 8px;background:#1b1b1f;color:#eee;border:1px solid #666;font:inherit;cursor:pointer');b.textContent=label;b.onclick=function(){fetch(url,{method:'POST',headers:H}).then(poll)};return b}
function draw(s){
 var busy=s.status=='downloading'||s.status=='installing',show=!off&&(s.available||s.status=='installed'||busy||s.status=='error'||s.status=='downloaded');
 if(!box){box=E('div','position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:300px;padding:10px 12px;background:#0b0b0d;color:#e8e8e8;border:1px solid #555;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace');document.body.appendChild(box)}
 box.style.display=show?'block':'none';if(!show)return;
 box.textContent='';
 var t=E('div','font-weight:600');t.textContent=s.status=='installed'?'Update installed':'Update available';box.appendChild(t);
 var m=E('div','opacity:.85;margin-top:4px');
 m.textContent=s.msg||'A newer U2C Studio plugin build is available ('+String(s.latest).slice(0,7)+'). Installing replaces the plug-in files; restart your DAW afterwards to load it.';box.appendChild(m);
 if(!busy&&s.status!='installed'){box.appendChild(B('Download','/__update/download'));box.appendChild(B('Install update','/__update/install'))}
 var x=B('Dismiss','');x.onclick=function(){off=true;box.style.display='none'};box.appendChild(x);
}
function poll(){fetch('/__update.json',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){draw(s);setTimeout(poll,s.status=='downloading'||s.status=='installing'?1500:30000)}).catch(function(){setTimeout(poll,60000)})}
function go(){setTimeout(poll,3000)}
if(document.body)go();else document.addEventListener('DOMContentLoaded',go);
})();</script>"#;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn state_json_and_guard() {
        let (c, b) = http(false, "/__update.json", false);
        assert_eq!(c, 200);
        let v: serde_json::Value = serde_json::from_str(&b).unwrap();
        assert!(v["current"].is_string() && v["available"].is_boolean());
        assert_eq!(http(true, "/__update/install", false).0, 403);
        assert_eq!(http(false, "/__update/install", true).0, 404);
    }
}
