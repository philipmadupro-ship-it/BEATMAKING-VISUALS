#!/usr/bin/env python3
"""u2c.py: one entry point for the U2C beat-video loop (cheap in tokens: every step prints one line, every review image is small).

  python3 tools/u2c.py sync                      # web-app -> native renderer
  python3 tools/u2c.py stills -t 3.7,12 [-l player] [-s nigredo,white] [-a 9:16,16:9]   # PNG stills + one contact sheet (TikTok safe zones on 9:16)
  python3 tools/u2c.py beats --bars 2:4 [--bpm 128]           # one still per beat (pre-render grid check)
  python3 tools/u2c.py strip VIDEO -t 3.3:4.3:0.15            # frames from an MP4 in one strip (transitions)
  python3 tools/u2c.py crop PNG x,y,w,h                       # zoom into a still (panel review)
  python3 tools/u2c.py render [-l player] [-s ...] [-a ...] [--len 30]   # final MP4s (sequential) -> out/v14 + deliver dir
  python3 tools/u2c.py test                      # web meters + smoke (prints pass counts + failures only)
  python3 tools/u2c.py stage FILE...             # copy web files into the artifact publish dir (keeps relative paths)
Paths come from env: U2C_WEB (web-app), U2C_NATIVE (HyperFrames project), U2C_OUT (review images), U2C_PUB (publish dir), U2C_DELIVER.
"""
import argparse, glob, os, shutil, subprocess, sys
HOME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.environ.get('U2C_WEB', os.path.join(HOME, 'web-app'))
NAT = os.environ.get('U2C_NATIVE', '/home/user/u2c-motion-v14')
OUT = os.environ.get('U2C_OUT', '/home/user/research/review')
PUB = os.environ.get('U2C_PUB', '')
DELIVER = os.environ.get('U2C_DELIVER', '/home/user/beatmaking-visuals/deliver-v14')
SAFE_916 = [(0, 0, 1080, 200), (0, 1548, 1080, 1920), (960, 1000, 1080, 1548)]   # TikTok/Reels header, caption + sound, button rail

def sh(cmd, cwd=None, quiet=True, timeout=None):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=cmd[0] != 'ffmpeg', timeout=timeout)
    if r.returncode and not quiet: print(str(r.stdout)[-800:], str(r.stderr)[-800:])
    return r

def sync(_=None):
    r = sh(['node', 'tools/sync_web.mjs', '--web', WEB], cwd=NAT); print((r.stdout.strip().splitlines() or ['sync failed'])[-1])

def tag(a): return a.replace(':', 'x')

def stills(a):
    from PIL import Image, ImageDraw
    sync(); os.makedirs(OUT, exist_ok=True); rows = []
    for st in a.s.split(','):
        for asp in a.a.split(','):
            d = os.path.join(OUT, f'{a.l}-{st}-{tag(asp)}')
            sh(['node', 'render.mjs', '--look', a.l, '--stage', st, '--aspect', asp, '--len', str(a.len), '--title', a.title, '--stills', a.t, '--out', d], cwd=NAT, quiet=False, timeout=900)
            fs = sorted([f for f in glob.glob(d + '/t-*.png') if '-crop' not in f], key=lambda f: float(f.split('t-')[1][:-4]))
            ims = []
            for f in fs:
                im = Image.open(f).convert('RGB')
                if asp == '9:16' and a.safe:
                    dr = ImageDraw.Draw(im, 'RGBA'); [dr.rectangle(r, fill=(255, 0, 0, 50)) for r in SAFE_916]
                ims.append(im.resize((270, 480) if asp == '9:16' else (640, 360)))
            rows.append(ims)
    W = max(sum(i.width for i in r) for r in rows); H = sum(max(i.height for i in r) for r in rows)
    sheet = Image.new('RGB', (W, H)); y = 0
    for r in rows:
        x = 0
        for i in r: sheet.paste(i, (x, y)); x += i.width
        y += max(i.height for i in r)
    p = os.path.join(OUT, f'sheet-{a.l}.jpg'); sheet.save(p, quality=82); print(p)

def beats(a):
    # one still per beat over a bar range (clip time 0 = bar 1 beat 1): the pre-render check from the v17 prompt
    b0, b1 = map(int, a.bars.split(':')); spb = 60.0 / a.bpm; a.t = ','.join(f'{(k + 0.02) * spb:.3f}' for k in range(b0 * 4, b1 * 4)); stills(a)

def strip(a):
    from PIL import Image
    t0, t1, dt = map(float, a.t.split(':')); ts = []; t = t0
    while t <= t1 + 1e-9: ts.append(round(t, 3)); t += dt
    ims = []
    for t in ts:
        sh(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', a.video, '-frames:v', '1', '/tmp/u2c_f.png'])
        im = Image.open('/tmp/u2c_f.png').convert('RGB'); s = 200 / max(im.size); ims.append(im.resize((int(im.width * s), int(im.height * s))))
    sheet = Image.new('RGB', (sum(i.width for i in ims), max(i.height for i in ims))); x = 0
    for i in ims: sheet.paste(i, (x, 0)); x += i.width
    os.makedirs(OUT, exist_ok=True); p = os.path.join(OUT, 'strip-' + os.path.basename(a.video).replace('.mp4', '.jpg')); sheet.save(p, quality=80); print(p)

def crop(a):
    from PIL import Image
    x, y, w, h = map(int, a.box.split(',')); p = a.png.replace('.png', f'-crop{x}_{y}.png'); Image.open(a.png).crop((x, y, x + w, y + h)).save(p); print(p)

def render(a):
    sync(); od = os.path.join(NAT, 'out', 'v14'); os.makedirs(od, exist_ok=True); os.makedirs(DELIVER, exist_ok=True)
    for st in a.s.split(','):
        for asp in a.a.split(','):
            f = os.path.join(od, f'{a.l}-{st}-{tag(asp)}.mp4')
            r = sh(['node', 'render.mjs', '--look', a.l, '--stage', st, '--aspect', asp, '--len', str(a.len), '--title', a.title, '--intro', 'on', '--out', f], cwd=NAT)
            ok = os.path.exists(f) and r.returncode == 0
            if ok: shutil.copy(f, DELIVER)
            print(('ok  ' if ok else 'FAIL') + ' ' + f)

def test(_=None):
    env = dict(os.environ, NOEXPORT='1', CDN_CACHE='/tmp/cdncache')
    for t in ('tests/meters.mjs', 'tests/smoke.mjs'):
        r = subprocess.run(['node', t], cwd=WEB, env=env, capture_output=True, text=True, timeout=900)
        for ln in (r.stdout + r.stderr).splitlines():
            if ln.startswith('FAIL') or 'passed' in ln: print(t, ln)

def bright(a):
    import numpy as np
    raw = sh(['ffmpeg', '-v', 'error', '-i', a.video, '-vf', 'scale=36:64,format=gray', '-f', 'rawvideo', '-']).stdout
    v = np.frombuffer(raw.encode('latin1') if isinstance(raw, str) else raw, np.uint8).reshape(-1, 64, 36).mean(axis=(1, 2)); hi = np.where(v > v.mean() * 2)[0]
    print(f'{os.path.basename(a.video)}: {len(v)} frames, mean {v.mean():.0f}, negative/bright frames', f'{hi[0]/30:.2f}-{hi[-1]/30:.2f}s ({len(hi)})' if len(hi) else 'none')

def stage(a):
    if not PUB: sys.exit('set U2C_PUB')
    for f in a.files:
        rel = os.path.relpath(os.path.abspath(f), WEB); d = os.path.join(PUB, rel); os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy2(f, d); print(rel)

p = argparse.ArgumentParser(); sp = p.add_subparsers(dest='cmd', required=True)
sp.add_parser('sync').set_defaults(fn=sync); sp.add_parser('test').set_defaults(fn=test)
for name, fn in (('stills', stills), ('render', render)):
    q = sp.add_parser(name); q.set_defaults(fn=fn); q.add_argument('-l', default='player'); q.add_argument('-s', default='nigredo'); q.add_argument('-a', default='9:16,16:9')
    q.add_argument('--len', type=int, default=30); q.add_argument('--title', default='ATELMANSION 3')
    if name == 'stills': q.add_argument('-t', default='12'); q.add_argument('--safe', type=int, default=1)
q = sp.add_parser('beats'); q.set_defaults(fn=beats); q.add_argument('-l', default='player'); q.add_argument('-s', default='nigredo'); q.add_argument('-a', default='9:16')
q.add_argument('--bars', default='0:4'); q.add_argument('--bpm', type=float, default=128); q.add_argument('--len', type=int, default=30); q.add_argument('--title', default='ATELMANSION 3'); q.add_argument('--safe', type=int, default=0)
q = sp.add_parser('strip'); q.set_defaults(fn=strip); q.add_argument('video'); q.add_argument('-t', default='3.3:4.3:0.15')
q = sp.add_parser('crop'); q.set_defaults(fn=crop); q.add_argument('png'); q.add_argument('box')
q = sp.add_parser('bright'); q.set_defaults(fn=bright); q.add_argument('video')
q = sp.add_parser('stage'); q.set_defaults(fn=stage); q.add_argument('files', nargs='+')
a = p.parse_args(); a.fn(a)
