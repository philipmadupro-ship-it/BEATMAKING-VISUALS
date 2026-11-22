#!/usr/bin/env python3
"""sfx.py: lab / computer sound effects for the U2C video, synthesised (deterministic, no samples, no licences), placed on the timeline.

  python3 tools/sfx.py --events events.json --dur 34 --out sfx.wav [--gain-db -14]

events.json = [{"t": 0.0, "kind": "swell"}, {"t": 1.0, "kind": "type", "n": 32, "dt": 0.0195}, ...] (composition seconds)
kinds:
  swell  power-up at the start: a low hum + a rising filtered tone (1.2 s)
  bleep  pop-up notification: two short sine blips (lab terminal)
  type   keyboard ticks for typed text: n soft clicks, dt apart, slightly varied (seeded)
  chirp  data burst (terminal line appears): fast FM chatter (0.25 s)
  whir   servo / drag: a filtered motor sweep for "dur" seconds
  lock   target lock (the cover is picked): rising triple blip
  boot   playback engages: a short downward sweep + thump
"""
import argparse, json, wave
import numpy as np
SR = 48000

def env(n, a, r):
    e = np.ones(n); ka, kr = int(a * SR), int(r * SR)
    if ka: e[:ka] = np.linspace(0, 1, ka)
    if kr: e[-kr:] *= np.linspace(1, 0, kr)
    return e

def tone(f, d, a=0.004, r=0.03, kind='sin'):
    t = np.arange(int(d * SR)) / SR; ph = 2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape) if np.ndim(f) else np.full(t.shape, f)) / SR
    w = np.sin(ph) if kind == 'sin' else np.sign(np.sin(ph)) * 0.5
    return w * env(len(t), a, r)

def kinds(ev, rng):
    k = ev['kind']
    if k == 'swell':
        d = 1.2; t = np.arange(int(d * SR)) / SR
        hum = 0.35 * np.sin(2 * np.pi * 55 * t) + 0.15 * np.sin(2 * np.pi * 110 * t)
        rise = 0.25 * tone(np.linspace(180, 1400, len(t)), d, 0.6, 0.25)
        return (hum * env(len(t), 0.5, 0.4) + rise) * 0.8
    if k == 'bleep':
        return np.concatenate([tone(1320, 0.06), np.zeros(int(0.04 * SR)), tone(1760, 0.08)]) * 0.5
    if k == 'type':
        n, dt = int(ev.get('n', 10)), float(ev.get('dt', 0.02)); out = np.zeros(int((n * dt + 0.05) * SR))
        for i in range(n):
            m = int(0.012 * SR); nz = rng.standard_normal(m) * np.exp(-np.arange(m) / (0.0018 * SR)); f = 2600 + rng.uniform(-500, 500)
            click = (nz * 0.6 + np.sin(2 * np.pi * f * np.arange(m) / SR) * np.exp(-np.arange(m) / (0.002 * SR)) * 0.4) * rng.uniform(0.6, 1.0)
            i0 = int(i * dt * SR); out[i0:i0 + m] += click
        return out * 0.32
    if k == 'chirp':
        d = 0.25; t = np.arange(int(d * SR)) / SR; f = 1800 + 900 * np.sign(np.sin(2 * np.pi * 37 * t)) + 300 * np.sin(2 * np.pi * 11 * t)
        return tone(f, d, 0.002, 0.04, 'sq') * 0.22
    if k == 'whir':
        d = float(ev.get('dur', 0.9)); t = np.arange(int(d * SR)) / SR; f = np.linspace(140, 320, len(t)) + 12 * np.sin(2 * np.pi * 23 * t)
        w = tone(f, d, 0.08, 0.15, 'sq'); nz = rng.standard_normal(len(t)); nz = np.convolve(nz, np.ones(24) / 24, 'same')
        return (w * 0.18 + nz * 0.25) * env(len(t), 0.1, 0.2)
    if k == 'lock':
        return np.concatenate([tone(880, 0.05), np.zeros(int(0.03 * SR)), tone(1175, 0.05), np.zeros(int(0.03 * SR)), tone(1568, 0.09)]) * 0.45
    if k == 'boot':
        d = 0.35; s = tone(np.linspace(1600, 200, int(d * SR)), d, 0.002, 0.1) * 0.35; th = tone(60, 0.18, 0.002, 0.15) * 0.6
        out = np.zeros(int(d * SR)); out[:len(th)] += th; return out + s
    return np.zeros(1)

def main():
    p = argparse.ArgumentParser(); p.add_argument('--events', required=True); p.add_argument('--dur', type=float, required=True); p.add_argument('--out', required=True); p.add_argument('--gain-db', type=float, default=-14)
    a = p.parse_args(); evs = json.load(open(a.events)); rng = np.random.default_rng(7)
    mix = np.zeros(int(a.dur * SR) + SR)
    for ev in evs:
        s = kinds(ev, rng); i0 = int(max(0, ev['t']) * SR); i1 = min(len(mix), i0 + len(s)); mix[i0:i1] += s[:i1 - i0]
    mix = mix[:int(a.dur * SR)] * 10 ** (a.gain_db / 20); mix = np.clip(mix, -0.98, 0.98)
    st = np.stack([mix, mix], 1); st[:, 1] = np.roll(mix, int(0.0007 * SR))   # a hair of width
    with wave.open(a.out, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes())
    print(f'sfx: {len(evs)} events -> {a.out}')

if __name__ == '__main__':
    main()
