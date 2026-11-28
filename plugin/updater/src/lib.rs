//! Shared update logic for the U2C Studio plugin and the `u2c-update` CLI.
//! Everything here blocks: call it from a background thread, never the audio thread.
//!
//! Releases (rolling, public): tag `webapp-latest` holds `manifest.json` + `webapp.zip`;
//! tag `plugin-latest` holds `plugin-manifest.json` + one zip per OS.

use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const REPO: &str = "philipmadupro-ship-it/BEATMAKING-VISUALS";
const MAX_DOWNLOAD: u64 = 400 * 1024 * 1024;

pub fn release_url(tag: &str, file: &str) -> String {
    format!("https://github.com/{REPO}/releases/download/{tag}/{file}")
}

/// One downloadable file named by a manifest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asset {
    pub file: String,
    pub sha256: String,
}

/// Parse a manifest: `{"version", "file", "sha256"}` (web app), or with `key` the same object under `assets[key]` (plugin).
pub fn parse_manifest(json: &[u8], key: Option<&str>) -> Result<(String, Asset), String> {
    let v: Value = serde_json::from_slice(json).map_err(|e| format!("manifest: {e}"))?;
    let version = v["version"].as_str().filter(|s| !s.is_empty()).ok_or("manifest: no version")?.to_string();
    let a = match key {
        Some(k) => &v["assets"][k],
        None => &v,
    };
    let file = a["file"].as_str().ok_or("manifest: no file")?;
    let sha256 = a["sha256"].as_str().ok_or("manifest: no sha256")?.to_ascii_lowercase();
    if sha256.len() != 64 || !sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("manifest: bad sha256".into());
    }
    // The file name becomes a URL path segment and a local file name: plain names only.
    if file.is_empty() || !file.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_')) || file.starts_with('.') {
        return Err("manifest: bad file name".into());
    }
    Ok((version, Asset { file: file.to_string(), sha256 }))
}

pub fn sha256_hex(data: &[u8]) -> String {
    Sha256::digest(data).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn verify_sha256(data: &[u8], expect: &str) -> bool {
    sha256_hex(data) == expect.to_ascii_lowercase()
}

pub fn http_get(url: &str) -> Result<Vec<u8>, String> {
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(10)).timeout(Duration::from_secs(300)).user_agent("u2c-studio-updater").build();
    let resp = agent.get(url).call().map_err(|e| format!("GET {url}: {e}"))?;
    let mut buf = Vec::new();
    resp.into_reader().take(MAX_DOWNLOAD).read_to_end(&mut buf).map_err(|e| format!("read {url}: {e}"))?;
    Ok(buf)
}

/// Download `tag/asset.file` and check its sha256; nothing unverified is returned.
pub fn download_verified(tag: &str, asset: &Asset) -> Result<Vec<u8>, String> {
    let data = http_get(&release_url(tag, &asset.file))?;
    if !verify_sha256(&data, &asset.sha256) {
        return Err(format!("{}: sha256 mismatch, download discarded", asset.file));
    }
    Ok(data)
}

/// Unpack a zip into `dest`. Entries that escape `dest` (zip-slip) abort the whole unpack.
pub fn unpack_zip(data: &[u8], dest: &Path) -> Result<(), String> {
    let mut z = zip::ZipArchive::new(std::io::Cursor::new(data)).map_err(|e| format!("zip: {e}"))?;
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for i in 0..z.len() {
        let mut f = z.by_index(i).map_err(|e| format!("zip: {e}"))?;
        let rel = f.enclosed_name().ok_or_else(|| format!("zip: unsafe path {:?}", f.name()))?;
        let out = dest.join(rel);
        if f.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut w = std::fs::File::create(&out).map_err(|e| format!("{}: {e}", out.display()))?;
        std::io::copy(&mut f, &mut w).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        if let Some(mode) = f.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(mode & 0o777));
        }
    }
    Ok(())
}

fn home() -> PathBuf {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_else(std::env::temp_dir)
}

/// Per-user data folder: ~/Library/Application Support/U2C Studio (macOS), %APPDATA%\U2C Studio, ~/.local/share/U2C Studio.
pub fn data_dir() -> PathBuf {
    if cfg!(target_os = "macos") {
        home().join("Library/Application Support/U2C Studio")
    } else if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| home().join("AppData/Roaming")).join("U2C Studio")
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/share")).join("U2C Studio")
    }
}

pub fn downloads_dir() -> PathBuf {
    home().join("Downloads")
}

pub fn platform_key() -> &'static str {
    if cfg!(target_os = "macos") { "macos" } else if cfg!(target_os = "windows") { "windows" } else { "linux" }
}

/// True when `latest` is a release this build is not: a `dev` build never claims an update.
pub fn is_update(current: &str, latest: &str) -> bool {
    current != "dev" && !current.is_empty() && !latest.is_empty() && current != latest
}

// ---- web app cache -------------------------------------------------------------------------------------------

/// The cached web app to serve, if one is installed and intact: `<cache>/<version>` named by `<cache>/current`.
pub fn cached_webapp(cache: &Path) -> Option<(String, PathBuf)> {
    let v = std::fs::read_to_string(cache.join("current")).ok()?.trim().to_string();
    if v.is_empty() || !v.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return None;
    }
    let dir = cache.join(&v);
    dir.join("index.html").is_file().then_some((v, dir))
}

pub enum WebSync {
    /// Already on the published version.
    Current,
    /// The published version is the one embedded in this build: the cache was cleared, serve the embedded copy.
    Embedded,
    Updated(String, PathBuf),
}

/// Fetch the manifest; when it names a version other than `have`, download `webapp.zip`, verify it, unpack it
/// beside the cache and flip `current`. `embedded` is the version baked into this build.
pub fn sync_webapp(cache: &Path, have: Option<&str>, embedded: &str) -> Result<WebSync, String> {
    let (version, asset) = parse_manifest(&http_get(&release_url("webapp-latest", "manifest.json"))?, None)?;
    if !version.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return Err("manifest: bad version".into());
    }
    if version == embedded {
        let had = cache.join("current").exists();
        let _ = std::fs::remove_file(cache.join("current"));
        return Ok(if had { WebSync::Embedded } else { WebSync::Current });
    }
    if have == Some(version.as_str()) {
        return Ok(WebSync::Current);
    }
    let data = download_verified("webapp-latest", &asset)?;
    install_webapp(cache, &version, &data).map(|(v, d)| WebSync::Updated(v, d))
}

pub fn install_webapp(cache: &Path, version: &str, zip: &[u8]) -> Result<(String, PathBuf), String> {
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    let tmp = cache.join(format!("{version}.tmp"));
    let _ = std::fs::remove_dir_all(&tmp);
    unpack_zip(zip, &tmp)?;
    if !tmp.join("index.html").is_file() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err("webapp.zip has no index.html".into());
    }
    let dir = cache.join(version);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::rename(&tmp, &dir).map_err(|e| e.to_string())?;
    std::fs::write(cache.join("current.tmp"), version).and_then(|_| std::fs::rename(cache.join("current.tmp"), cache.join("current"))).map_err(|e| e.to_string())?;
    // Keep this one and the previous; older folders go.
    if let Ok(rd) = std::fs::read_dir(cache) {
        let mut old: Vec<_> = rd.flatten().filter(|e| e.path().is_dir() && e.file_name() != version).collect();
        old.sort_by_key(|e| std::cmp::Reverse(e.metadata().and_then(|m| m.modified()).ok()));
        for e in old.into_iter().skip(1) {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
    Ok((version.to_string(), dir))
}

// ---- plugin binaries -----------------------------------------------------------------------------------------

/// Latest published plugin build for this OS: (version = commit sha, zip asset).
pub fn latest_plugin() -> Result<(String, Asset), String> {
    parse_manifest(&http_get(&release_url("plugin-latest", "plugin-manifest.json"))?, Some(platform_key()))
}

/// Download this OS's plugin zip into `dir` (sha256-verified) and return its path.
pub fn download_plugin(asset: &Asset, dir: &Path) -> Result<PathBuf, String> {
    let data = download_verified("plugin-latest", asset)?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let p = dir.join(&asset.file);
    std::fs::write(&p, data).map_err(|e| format!("{}: {e}", p.display()))?;
    Ok(p)
}

fn bundles_in(root: &Path, out: &mut Vec<PathBuf>, depth: u8) {
    let Ok(rd) = std::fs::read_dir(root) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
        if matches!(ext, "vst3" | "clap" | "component") {
            out.push(p);
        } else if p.is_dir() && depth > 0 {
            bundles_in(&p, out, depth - 1);
        }
    }
}

/// Install the plugin bundles from a downloaded zip. macOS: /Library/Audio/Plug-Ins through the system
/// admin prompt; Windows: Common Files; Linux: ~/.vst3 and ~/.clap. The DAW must be restarted to load them.
pub fn install_zip(zip_path: &Path) -> Result<String, String> {
    let data = std::fs::read(zip_path).map_err(|e| format!("{}: {e}", zip_path.display()))?;
    let stage = data_dir().join("install-stage");
    let _ = std::fs::remove_dir_all(&stage);
    unpack_zip(&data, &stage)?;
    let mut bundles = Vec::new();
    bundles_in(&stage, &mut bundles, 2);
    if bundles.is_empty() {
        return Err("no plug-in bundles in the zip".into());
    }
    let r = install_bundles(&bundles);
    let _ = std::fs::remove_dir_all(&stage);
    r
}

fn dest_for(bundle: &Path) -> PathBuf {
    let ext = bundle.extension().and_then(|s| s.to_str()).unwrap_or("");
    let (mac, win, lin) = match ext {
        "vst3" => ("/Library/Audio/Plug-Ins/VST3", "VST3", ".vst3"),
        "clap" => ("/Library/Audio/Plug-Ins/CLAP", "CLAP", ".clap"),
        _ => ("/Library/Audio/Plug-Ins/Components", "", ""),
    };
    if cfg!(target_os = "macos") {
        PathBuf::from(mac)
    } else if cfg!(target_os = "windows") {
        let base = std::env::var_os("CommonProgramFiles").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Program Files\Common Files"));
        base.join(win)
    } else {
        home().join(lin)
    }
}

#[cfg(target_os = "macos")]
fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

#[cfg(target_os = "macos")]
fn install_bundles(bundles: &[PathBuf]) -> Result<String, String> {
    let mut sh = String::from("set -e; ");
    for b in bundles {
        let dir = dest_for(b);
        let name = b.file_name().and_then(|s| s.to_str()).ok_or("bad bundle name")?;
        let target = dir.join(name);
        sh += &format!(
            "mkdir -p {d}; rm -rf {t}; cp -R {s} {d}/; xattr -dr com.apple.quarantine {t} 2>/dev/null || true; ",
            d = sh_quote(&dir.to_string_lossy()),
            t = sh_quote(&target.to_string_lossy()),
            s = sh_quote(&b.to_string_lossy())
        );
    }
    sh += "killall -9 AudioComponentRegistrar 2>/dev/null || true";
    let out = if std::env::var("USER").as_deref() == Ok("root") {
        std::process::Command::new("/bin/sh").arg("-c").arg(&sh).output()
    } else {
        let script = format!("do shell script \"{}\" with administrator privileges", sh.replace('\\', "\\\\").replace('"', "\\\""));
        std::process::Command::new("osascript").arg("-e").arg(script).output()
    }
    .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok("Installed. Restart your DAW to load the new version.".into())
    } else {
        Err(format!("install failed: {}", String::from_utf8_lossy(&out.stderr).trim()))
    }
}

#[cfg(not(target_os = "macos"))]
fn install_bundles(bundles: &[PathBuf]) -> Result<String, String> {
    fn copy_all(src: &Path, dst: &Path) -> std::io::Result<()> {
        if src.is_dir() {
            std::fs::create_dir_all(dst)?;
            for e in std::fs::read_dir(src)? {
                let e = e?;
                copy_all(&e.path(), &dst.join(e.file_name()))?;
            }
            Ok(())
        } else {
            std::fs::copy(src, dst).map(|_| ())
        }
    }
    for b in bundles {
        if b.extension().and_then(|s| s.to_str()) == Some("component") {
            continue;
        }
        let dir = dest_for(b);
        let target = dir.join(b.file_name().ok_or("bad bundle name")?);
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        if target.is_dir() {
            std::fs::remove_dir_all(&target).map_err(|e| format!("{}: {e} (close the DAW first)", target.display()))?;
        } else if target.exists() {
            std::fs::remove_file(&target).map_err(|e| format!("{}: {e} (close the DAW first)", target.display()))?;
        }
        copy_all(b, &target).map_err(|e| format!("{}: {e} (close the DAW first{})", target.display(), if cfg!(windows) { ", run as administrator" } else { "" }))?;
    }
    Ok("Installed. Restart your DAW to load the new version.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn zip_of(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (n, d) in files {
            w.start_file(*n, zip::write::SimpleFileOptions::default()).unwrap();
            w.write_all(d).unwrap();
        }
        w.finish().unwrap().into_inner()
    }

    fn tmp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("u2c-upd-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        p
    }

    #[test]
    fn manifest_parse_and_verify() {
        let z = zip_of(&[("index.html", b"<html></html>")]);
        let h = sha256_hex(&z);
        let m = format!("{{\"version\":\"abc123\",\"file\":\"webapp.zip\",\"sha256\":\"{}\"}}", h.to_uppercase());
        let (v, a) = parse_manifest(m.as_bytes(), None).unwrap();
        assert_eq!((v.as_str(), a.file.as_str()), ("abc123", "webapp.zip"));
        assert!(verify_sha256(&z, &a.sha256));
        let mut bad = z.clone();
        bad[10] ^= 1;
        assert!(!verify_sha256(&bad, &a.sha256));
        let pm = format!("{{\"version\":\"v\",\"assets\":{{\"macos\":{{\"file\":\"U2C-Studio-mac.zip\",\"sha256\":\"{h}\"}}}}}}");
        assert!(parse_manifest(pm.as_bytes(), Some("macos")).is_ok());
        assert!(parse_manifest(pm.as_bytes(), Some("linux")).is_err());
        assert!(parse_manifest(b"{\"version\":\"v\",\"file\":\"../x\",\"sha256\":\"00\"}", None).is_err());
        assert!(parse_manifest(format!("{{\"version\":\"v\",\"file\":\"../x.zip\",\"sha256\":\"{h}\"}}").as_bytes(), None).is_err());
    }

    #[test]
    fn webapp_install_and_cache() {
        let cache = tmp("cache");
        let z = zip_of(&[("index.html", b"hi"), ("src/a.js", b"1")]);
        let (v, dir) = install_webapp(&cache, "aaa111", &z).unwrap();
        assert_eq!(v, "aaa111");
        assert_eq!(std::fs::read(dir.join("src/a.js")).unwrap(), b"1");
        assert_eq!(cached_webapp(&cache).unwrap().0, "aaa111");
        install_webapp(&cache, "bbb222", &z).unwrap();
        install_webapp(&cache, "ccc333", &z).unwrap();
        assert_eq!(cached_webapp(&cache).unwrap().0, "ccc333");
        assert!(cache.join("bbb222").is_dir() && !cache.join("aaa111").exists());
        assert!(install_webapp(&cache, "ddd444", &zip_of(&[("other.txt", b"x")])).is_err());
        assert_eq!(cached_webapp(&cache).unwrap().0, "ccc333");
        let _ = std::fs::remove_dir_all(&cache);
    }

    #[test]
    fn zip_slip_rejected() {
        let d = tmp("slip");
        assert!(unpack_zip(&zip_of(&[("../evil.txt", b"x")]), &d).is_err());
        assert!(!d.parent().unwrap().join("evil.txt").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn update_rule() {
        assert!(is_update("abc", "def"));
        assert!(!is_update("abc", "abc"));
        assert!(!is_update("dev", "def"));
    }
}
