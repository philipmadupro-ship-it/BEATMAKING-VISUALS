#!/usr/bin/env python3
"""Make the macOS .vst3 bundles look like a professional one (run after bundle-universal, before codesign):
Contents/Resources/moduleinfo.json (VST3 module info, so hosts scan faster), Contents/Resources/Icon.icns (if plugin/assets/Icon.icns exists)
and the version keys in Info.plist. Usage: bundle_mac.py [bundled-dir]   (stdlib only)"""
import json, plistlib, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGINS = [("U2C Studio", ROOT / "src" / "lib.rs"), ("U2C Send", ROOT / "send" / "src" / "lib.rs")]

def const(src, name):
    m = re.search(r'const %s: &\'static str = "([^"]*)"' % name, src)
    return m.group(1) if m else ""

def cid(src):
    m = re.search(r'VST3_CLASS_ID: \[u8; 16\] = \*b"([^"]{16})"', src)
    if not m:
        raise SystemExit("no VST3_CLASS_ID found")
    return m.group(1).encode().hex().upper()

def version():
    cargo = (ROOT / "Cargo.toml").read_text()
    base = re.search(r'^version = "([\d.]+)"', cargo, re.M).group(1)
    try:
        d = subprocess.check_output(["git", "show", "-s", "--format=%cd", "--date=format:%Y%m%d%H%M"], cwd=ROOT, text=True).strip()
    except Exception:
        d = "0"
    return base, f"{base}.{int(d)}" if d.isdigit() else base

def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "target" / "bundled")
    short, full = version()
    for name, rs in PLUGINS:
        b = out / f"{name}.vst3"
        if not b.exists():
            print("skip", b)
            continue
        src = rs.read_text()
        res = b / "Contents" / "Resources"
        res.mkdir(parents=True, exist_ok=True)
        info = {
            "Name": name, "Version": short,
            "Factory Info": {"Vendor": const(src, "VENDOR"), "URL": const(src, "URL"), "E-Mail": const(src, "EMAIL"), "Flags": {"Unicode": True, "Classes Discardable": False, "Component Non Discardable": False}},
            "Compatibility": [],
            "Classes": [{"CID": cid(src), "Category": "Audio Module Class", "Name": name, "Vendor": const(src, "VENDOR"), "Version": short,
                         "SDK Version": "VST 3.7.5", "Sub Categories": ["Fx", "Analyzer"], "Class Flags": 0, "Cardinality": 2147483647}],
        }
        (res / "moduleinfo.json").write_text(json.dumps(info, indent=2) + "\n")
        pl = b / "Contents" / "Info.plist"
        d = plistlib.loads(pl.read_bytes())
        d["CFBundleShortVersionString"], d["CFBundleVersion"] = short, full
        icon = ROOT / "assets" / "Icon.icns"
        if icon.exists():
            shutil.copy(icon, res / "Icon.icns")
            d["CFBundleIconFile"] = "Icon"
        pl.write_bytes(plistlib.dumps(d))
        print("bundled", b, full, "icon" if icon.exists() else "no icon")

if __name__ == "__main__":
    main()
