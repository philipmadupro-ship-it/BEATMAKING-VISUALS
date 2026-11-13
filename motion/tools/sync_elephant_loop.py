"""Swap in an AI-generated elephant loop when one appears.
Looks for /home/user/u2c-motion/assets/elephant-loop/ (PNG/WebP frames with alpha, optional manifest.json
{"fps":24,"frames":[...],"bail":{"x":343,"y":197},"width":700}), copies it to film/assets/elephant-loop/ and writes
film/assets/elephant-loop.js. With no loop present it writes an empty manifest and the code-driven sprite is used."""
import json, os, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(ROOT, "assets", "elephant-loop"); dst = os.path.join(ROOT, "film", "assets", "elephant-loop")
man = {"fps": 24, "frames": []}
if os.path.isdir(src):
    mf = os.path.join(src, "manifest.json")
    if os.path.exists(mf): man.update(json.load(open(mf)))
    if not man["frames"]:
        man["frames"] = sorted(f for f in os.listdir(src) if f.lower().endswith((".png", ".webp")))
    os.makedirs(dst, exist_ok=True)
    for f in man["frames"]: shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
open(os.path.join(ROOT, "film", "assets", "elephant-loop.js"), "w").write("window.U2C_ELEPHANT_LOOP=" + json.dumps(man) + ";\n")
print("elephant loop:", len(man["frames"]), "frames" if man["frames"] else "(none: procedural pendulum sprite)")
