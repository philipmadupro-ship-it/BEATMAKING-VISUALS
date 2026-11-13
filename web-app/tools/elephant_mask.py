"""Derive the elephant's warp weights from assets/elephant.png (PLAN-v5 item 4).

Body = the alpha opened with a ~22 px disc (the shield + head survive, thin parts do not), largest component.
Limbs = the remaining thin regions that hang BELOW the body (component centroid below the body centroid and top edge
under the body's upper third): the legs and the trunk. The chain loop on the left is thin too but sits beside/above
the body, so it stays rigid. Weight = smoothstep of the distance from the body (0 on the shield, rising to 1 at the
tips over ~110 px). Outputs assets/elephant-limbs.png (8-bit: the limb weight, 0 = rigid) and assets/elephant-warp.json
(17x17 vertex weights for a 16x16 mesh, smoothed so neighbouring vertices never jump). Run: python3 tools/elephant_mask.py
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage as nd

im = np.asarray(Image.open('assets/elephant.png')); H, W = im.shape[:2]
a = im[..., 3] > 40
dt = nd.distance_transform_edt(a)
body = nd.binary_dilation(dt > 22, iterations=22) & a
lab, n = nd.label(body); sz = nd.sum(body, lab, range(1, n + 1)); body = lab == (np.argmax(sz) + 1)
by, bx = np.nonzero(body); bcy = by.mean(); btop = by.min(); bh = by.max() - btop
rest = a & ~body; lab2, n2 = nd.label(rest)
d = nd.distance_transform_edt(~body)
limbs = np.zeros_like(a)
for i in range(1, n2 + 1):
    sel = lab2 == i; yy, xx = np.nonzero(sel)
    if len(yy) < 250: continue
    # below the body, and long enough to be a limb (reaches > 40 px away from the shield; rim slivers do not)
    if yy.mean() > bcy and yy.min() > btop + bh * .5 and d[sel].max() > 40: limbs |= sel
w = np.clip(d / 110.0, 0, 1); w = w * w * (3 - 2 * w)
wl = np.where(limbs, w, 0).astype(np.float32)
# limb image mask: the limb pixels plus a 3 px skirt into the body so the joint is covered by both layers
Image.fromarray((np.clip(wl > 0, 0, 1) * 255).astype(np.uint8)).save('assets/elephant-limbs.png', optimize=True)
# vertex weights: spread the limb weight into nearby background (so triangles straddling a limb edge move as one)
spread = nd.grey_dilation(wl, size=(31, 31)); spread = nd.gaussian_filter(spread, 10)
G = 16; vw = []
for j in range(G + 1):
    for i in range(G + 1):
        x = min(W - 1, round(i * (W - 1) / G)); y = min(H - 1, round(j * (H - 1) / G))
        v = float(spread[y, x]); vw.append(round(v if not body[max(0, y - 1):y + 2, max(0, x - 1):x + 2].any() else min(v, 0.04), 3))
out = {'w': W, 'h': H, 'grid': G, 'weights': vw, 'bodyCentroid': [round(float(bx.mean()), 1), round(float(bcy), 1)], 'bail': [343, 197],
       'glints': [[528, 152], [565, 205], [214, 236], [272, 492]]}
json.dump(out, open('assets/elephant-warp.json', 'w'))
print('limb px', int(limbs.sum()), 'nonzero vertices', sum(1 for v in vw if v > .01), '/', len(vw))
