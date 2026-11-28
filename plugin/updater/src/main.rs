//! u2c-update: standalone plugin updater.
//!   u2c-update            check, download the newest build for this OS, install it
//!   u2c-update check      only report whether a newer build exists
//!   u2c-update install <zip>   install a zip you already have (no network)
//! Close your DAW first; restart it afterwards.

use u2c_updater as u;

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("install") => {
            let zip = args.get(1).ok_or("usage: u2c-update install <zip>")?;
            println!("{}", u::install_zip(std::path::Path::new(zip))?);
        }
        Some("check") => {
            let (latest, _) = u::latest_plugin()?;
            println!("latest published build: {latest}");
        }
        None => {
            let (latest, asset) = u::latest_plugin()?;
            println!("latest build {latest}; downloading {} ...", asset.file);
            let zip = u::download_plugin(&asset, &u::downloads_dir())?;
            println!("verified, saved to {}", zip.display());
            println!("{}", u::install_zip(&zip)?);
        }
        Some(_) => return Err("usage: u2c-update [check | install <zip>]".into()),
    }
    Ok(())
}

fn main() {
    if let Err(e) = run() {
        eprintln!("u2c-update: {e}");
        std::process::exit(1);
    }
}
