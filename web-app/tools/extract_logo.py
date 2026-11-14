"""Re-extract the U2C chain logo from assets/u2c-chains-dark.jpg into a clean link atlas.

Pipeline (see PLAN-v5 item 2): denoise -> 4x supersample (bicubic) -> threshold -> drop speckles -> fill the small
holes inside the metal (never the link apertures) -> light closing -> slight blur on the alpha -> downsample to 2x.
Links are the connected components of the clean mask, grouped into letters U / 2 / C by hand-checked regions
(the U's right arm and the 2's first link overlap in x, and the 2's base runs into the C, so an x threshold is wrong).
Outputs: assets/u2c-links.png (texture + alpha), assets/u2c-links-edge.png (outline from the clean mask),
assets/u2c-links.json and src/engine/links.js. Run: python3 tools/extract_logo.py [--debug DIR]
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

SRC = 'assets/u2c-chains-dark.jpg'
SS = 4          # supersample factor for thresholding
OUT = 2         # atlas resolution = OUT x source pixels (logo units stay in source pixels)
CROP = (0, 165, 905, 860)   # logo area in the source (x0, y0, x1, y1)

# Letter strokes (source pixels), traced on the 2x zoom. Every mask pixel belongs to the letter whose stroke is
# nearest; this splits the places where letters touch (U right arm / 2 top-left link, 2 base / C lower run).
STROKES = [
    [(66, 262), (64, 450), (62, 600), (95, 700), (150, 745), (205, 690), (215, 560), (210, 400), (205, 285)],          # U
    [(222, 255), (300, 200), (400, 212), (455, 250), (470, 330), (440, 420), (390, 500), (330, 560), (300, 612),
     (380, 630), (470, 625), (535, 622)],                                                                                 # 2
    [(855, 470), (830, 340), (765, 290), (680, 295), (618, 340), (595, 420), (600, 530), (585, 610), (650, 660),
     (715, 735), (760, 800), (810, 790), (860, 700), (872, 600)],                                                         # C
]

def stroke_dist(xs, ys, pts):
    d = np.full(xs.shape, 1e9, np.float32)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        vx, vy = bx - ax, by - ay; L = vx * vx + vy * vy
        t = np.clip(((xs - ax) * vx + (ys - ay) * vy) / L, 0, 1)
        d = np.minimum(d, np.hypot(xs - ax - t * vx, ys - ay - t * vy))
    return d

def main(debug=None):
    full_src = np.asarray(Image.open(SRC).convert('L')).astype(np.float32)
    b0 = nd.gaussian_filter(full_src, 1.0)
    # local contrast normalisation: the paper behind the 2's top is much darker than behind the U/C, so a global
    # threshold loses those links. n = (img - local floor) / (local ceiling - local floor)
    sm = b0[::4, ::4]
    fl = nd.percentile_filter(sm, 25, size=13); ce = nd.gaussian_filter(nd.maximum_filter(sm, size=15), 3)
    up4 = lambda a: np.asarray(Image.fromarray(a.astype(np.float32)).resize((full_src.shape[1], full_src.shape[0]), Image.BILINEAR))
    fl, ce = up4(fl), up4(ce)
    nrm = np.clip((b0 - fl) / np.maximum(ce - fl, 25), 0, 1.2)
    x0c, y0c, x1c, y1c = CROP
    g = nrm[y0c:y1c, x0c:x1c]; base = g
    up = np.asarray(Image.fromarray(g).resize((g.shape[1] * SS, g.shape[0] * SS), Image.BICUBIC)).astype(np.float32)
    up = nd.gaussian_filter(up, SS * 0.5)
    m = up > 0.38
    m = nd.binary_opening(m, iterations=2)                 # kill 1-2 px grain on the edges
    lab, n = nd.label(m); sz = nd.sum(m, lab, range(1, n + 1))
    m = np.isin(lab, np.where(sz >= 260 * SS * SS)[0] + 1)     # drop speckles and paper wrinkles
    m = nd.binary_closing(m, structure=np.ones((3, 3)), iterations=SS)   # bridge hairline cracks in the rails
    holes = nd.binary_fill_holes(m) & ~m; hl, hn = nd.label(holes); hs = nd.sum(holes, hl, range(1, hn + 1))
    m |= np.isin(hl, np.where(hs < 160 * SS * SS)[0] + 1)      # fill pits/engraving holes, keep link apertures
    a = nd.gaussian_filter(m.astype(np.float32), SS * 0.5)      # smooth edge
    a = np.clip((a - 0.5) * 1.6 + 0.5, 0, 1)                    # keep it crisp: slight blur, not soft
    # downsample to OUT x
    H, W = g.shape[0] * OUT, g.shape[1] * OUT
    alpha = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)).astype(np.float32) / 255
    alpha[alpha < 0.04] = 0
    tex = np.asarray(Image.fromarray(base).resize((W, H), Image.LANCZOS)).astype(np.float32)
    # metal texture: stretch the link luminance, keep engraving marks as darker strokes (never holes)
    inside = alpha > 0.5
    lo, hi = np.percentile(tex[inside], [4, 98])
    tex = np.clip((tex - lo) / (hi - lo), 0, 1); tex = 0.42 + 0.58 * tex ** 0.85
    # clean edge (outline) from the mask: 1x-source ~1.6 px wide ring, inner apertures included
    mOut = alpha > 0.5
    er = nd.binary_erosion(mOut, iterations=3)
    ring = (mOut & ~er).astype(np.float32)
    ring = nd.gaussian_filter(ring, 0.7); ring = np.clip(ring * 1.6, 0, 1)
    # letter of every pixel = nearest letter stroke; links = components of the hard mask inside each letter
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    sx, sy = xx / OUT + CROP[0], yy / OUT + CROP[1]
    dists = np.stack([stroke_dist(sx, sy, st) for st in STROKES]); letter = np.argmin(dists, 0)
    # where the 2's base meets the C's lower run the strokes are too close for nearest-stroke: split at x = 548
    zone = (sy > 560) & (sy < 700) & (sx > 420) & (sx < 640)
    letter = np.where(zone, np.where((sx > 548) | ((sx > 510) & (sy > 646)), 2, 1), letter)
    soft = alpha > 0.02
    lab = np.zeros((H, W), np.int32); nl = 0; info = {}
    for k in range(3):
        lk, nk = nd.label(soft & (letter == k), structure=np.ones((3, 3)))
        szk = nd.sum(soft, lk, range(1, nk + 1))
        for i in range(nk):
            if szk[i] < 40 * OUT * OUT: continue          # sliver of another letter's link: merge below
            nl += 1; lab[lk == i + 1] = nl; info[nl] = k
    # leftover slivers join the nearest kept piece (so nothing is lost)
    if (soft & (lab == 0)).any():
        _, (iy, ix) = nd.distance_transform_edt(lab == 0, return_indices=True)
        fill = lab[iy, ix]; lab = np.where(soft & (lab == 0), fill, lab)
    full = lab; keep = list(info.keys())
    ys, xs = np.nonzero(alpha > 0)
    x0, y0 = xs.min(), ys.min(); x1 = x0 + -(-(xs.max() + 1 - x0) // OUT) * OUT; y1 = y0 + -(-(ys.max() + 1 - y0) // OUT) * OUT
    pieces = []
    for li in keep:
        sel = full == li
        if not sel.any(): continue
        py, px = np.nonzero(sel)
        bx = x0 + (px.min() - x0) // OUT * OUT; by = y0 + (py.min() - y0) // OUT * OUT   # whole logo units
        bw = -(-(px.max() + 1 - bx) // OUT) * OUT; bh = -(-(py.max() + 1 - by) // OUT) * OUT
        pieces.append(dict(li=li, k=info[li], bx=bx, by=by, bw=bw, bh=bh,
                           cx=px.mean(), cy=py.mean(), area=int(sel.sum())))
    # order along the letters: U top-left down and round, 2 from its top-left, C from top-right round to its tail
    def key(p):  # arc-length position of the link centre along its letter's stroke
        pts = STROKES[p['k']]; cx, cy = p['cx'] / OUT + CROP[0], p['cy'] / OUT + CROP[1]; best = (1e9, 0); acc = 0
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            vx, vy = bx - ax, by - ay; L = (vx * vx + vy * vy) ** .5; t = max(0, min(1, ((cx - ax) * vx + (cy - ay) * vy) / (L * L)))
            d = ((cx - ax - t * vx) ** 2 + (cy - ay - t * vy) ** 2) ** .5
            if d < best[0]: best = (d, acc + t * L)
            acc += L
        return (p['k'], best[1])
    pieces.sort(key=key)
    # pack atlas (shelf packer), 2 px gutter at OUT scale
    PADA = 36; aw = 2048; xcur = ycur = shelf = 0; place = []
    for p in sorted(pieces, key=lambda p: -p['bh']):
        w, h = p['bw'] + 2 * PADA, p['bh'] + 2 * PADA
        if xcur + w > aw: xcur = 0; ycur += shelf; shelf = 0
        place.append((p, xcur, ycur)); xcur += w; shelf = max(shelf, h)
    ah = ycur + shelf
    atlas = np.zeros((ah, aw, 4), np.float32); edge = np.zeros((ah, aw, 4), np.float32)
    for p, ax, ay in place:
        sl = (slice(p['by'], p['by'] + p['bh']), slice(p['bx'], p['bx'] + p['bw']))
        own = (full[sl] == p['li']).astype(np.float32)
        al = alpha[sl] * own; ri = ring[sl] * np.clip(own * 1.0, 0, 1)
        t = tex[sl]
        dst = (slice(ay + PADA, ay + PADA + p['bh']), slice(ax + PADA, ax + PADA + p['bw']))
        for c in range(3): atlas[dst + (c,)] = t
        atlas[dst + (3,)] = al
        for c in range(3): edge[dst + (c,)] = 1
        edge[dst + (3,)] = np.maximum(edge[dst + (3,)], ri)
        p['ax'], p['ay'] = ax + PADA, ay + PADA
    Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8), 'RGBA').save('assets/u2c-links.png', optimize=True)
    Image.fromarray((np.clip(edge, 0, 1) * 255).astype(np.uint8), 'RGBA').save('assets/u2c-links-edge.png', optimize=True)
    # logo space = source pixels relative to the alpha bbox; atlas pixels = OUT x logo units
    out = {'w': int((x1 - x0) // OUT), 'h': int((y1 - y0) // OUT), 'scale': OUT, 'atlas': 'assets/u2c-links.png', 'edge': 'assets/u2c-links-edge.png',
           'letters': ['U', '2', 'C'], 'pieces': []}
    for i, p in enumerate(pieces):
        out['pieces'].append({'order': i, 'k': p['k'], 'x': int((p['bx'] - x0) // OUT), 'y': int((p['by'] - y0) // OUT), 'w': int(p['bw'] // OUT), 'h': int(p['bh'] // OUT),
                              'ax': int(p['ax']), 'ay': int(p['ay']), 'aw': int(p['bw']), 'ah': int(p['bh']),
                              'cx': round((p['cx'] - x0) / OUT, 1), 'cy': round((p['cy'] - y0) / OUT, 1), 'area': round(p['area'] / OUT / OUT)})
    # anchors: points on the metal every ~48 logo units along each letter stroke (cable plugs, glints)
    hard = alpha > 0.6; my, mx = np.nonzero(hard)
    anchors = []
    for k, pts in enumerate(STROKES):
        for (ax_, ay_), (bx_, by_) in zip(pts, pts[1:]):
            L = ((bx_ - ax_) ** 2 + (by_ - ay_) ** 2) ** .5
            for j in range(max(1, int(L // 48))):
                t = j / max(1, int(L // 48)); qx = (ax_ + (bx_ - ax_) * t - CROP[0]) * OUT; qy = (ay_ + (by_ - ay_) * t - CROP[1]) * OUT
                d = (mx - qx) ** 2 + (my - qy) ** 2; i = int(np.argmin(d)); sel = (letter[my[i], mx[i]] == k)
                if d[i] < (30 * OUT) ** 2 and sel: anchors.append([k, round((mx[i] - x0) / OUT, 1), round((my[i] - y0) / OUT, 1)])
    out['anchors'] = anchors
    json.dump(out, open('assets/u2c-links.json', 'w'))
    open('src/engine/links.js', 'w').write('// Generated by tools/extract_logo.py from assets/u2c-links.json (clean link atlas at ' + str(OUT) + 'x: bbox in logo units,\n'
        '// atlas rect in atlas pixels, letter k: 0 U, 1 2, 2 C, order along the letters). Do not edit by hand.\nexport default ' + json.dumps(out, separators=(',', ':')) + ';\n')
    counts = [sum(1 for p in pieces if p['k'] == k) for k in range(3)]
    print('pieces', len(pieces), 'per letter U/2/C', counts, 'logo', out['w'], 'x', out['h'], 'atlas', aw, 'x', ah)
    if debug:
        # labelled preview at 1x logo units: letter colour per link, numbered
        prev = Image.new('RGB', (x1 - x0, y1 - y0), (20, 20, 20)); d = ImageDraw.Draw(prev)
        cols = [(224, 71, 95), (242, 193, 78), (183, 154, 216)]
        arr = np.asarray(prev).copy()
        for i, p in enumerate(pieces):
            sel = (full == p['li'])[y0:y1, x0:x1]
            shade = 0.6 + 0.4 * ((i * 7) % 5) / 4
            arr[sel] = (np.array(cols[p['k']]) * shade).astype(np.uint8)
        prev = Image.fromarray(arr); d = ImageDraw.Draw(prev)
        for i, p in enumerate(pieces): d.text((p['cx'] - x0, p['cy'] - y0), str(i), fill=(255, 255, 255))
        prev.save(debug + '/logo-labels.png')
        comp = Image.new('RGBA', (x1 - x0, y1 - y0), (30, 18, 44, 255))
        al = Image.fromarray((np.clip(alpha[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8))
        tx = Image.fromarray((np.clip(tex[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8)).convert('RGBA'); tx.putalpha(al)
        comp.alpha_composite(tx); comp.convert('RGB').save(debug + '/logo-clean.png')
        e = Image.fromarray((np.clip(ring[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8)); e.save(debug + '/logo-edge.png')

if __name__ == '__main__':
    main(sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == '--debug' else None)
