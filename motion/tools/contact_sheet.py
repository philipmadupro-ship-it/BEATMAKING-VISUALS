"""Contact sheet: tile storyboard/<variant>/scene-N.png with scene names and times (brand mono type, charcoal)."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MONO = os.path.join(ROOT, "node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2")
def font(px):
    try: return ImageFont.truetype(MONO, px)
    except Exception: return ImageFont.load_default()
def sheet(variant, title, out=None, thumb_w=300):
    d = os.path.join(ROOT, "storyboard", variant)
    scenes = json.load(open(d + ".scenes.json"))
    ims = [Image.open(os.path.join(d, f"scene-{i + 1}.png")).convert("RGB") for i in range(len(scenes))]
    tw = thumb_w; th = round(ims[0].height * tw / ims[0].width)
    pad, head, cap = 24, 70, 54
    W = pad + len(ims) * (tw + pad); H = head + th + cap + pad
    S = Image.new("RGB", (W, H), "#161616"); g = ImageDraw.Draw(S)
    g.text((pad, 22), title, fill="#c8c8c8", font=font(22))
    for i, (im, (name, t)) in enumerate(zip(ims, scenes)):
        x = pad + i * (tw + pad)
        S.paste(im.resize((tw, th), Image.LANCZOS), (x, head))
        g.rectangle([x - 1, head - 1, x + tw, head + th], outline="#3a3a3a")
        g.text((x, head + th + 10), f"{i + 1:02d}  {t:05.2f}s", fill="#b79ad8", font=font(14))
        g.text((x, head + th + 30), name[:34], fill="#c8c8c8", font=font(13))
    out = out or os.path.join(d, "contact-sheet.png"); S.save(out); print(out)
if __name__ == "__main__":
    titles = {"A": "A · BOOT.SEQ · Charcoal + lilac", "B": "B · SIGNAL.PATH · Rust", "C": "C · AURORA.DECK · Amethyst"}
    for v in (sys.argv[1:] or ["A", "B", "C"]): sheet(v, titles.get(v, v))
