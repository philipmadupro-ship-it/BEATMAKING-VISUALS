#!/usr/bin/env node
// Meters v2 streams for the native renderer: reads the mastered clip WAV (film/data/<id>.wav, float32, written by
// clipdata.py) and adds `meters` (scope / polar / lv / ms, base64 typed arrays) to film/data/<id>.js, computed by the
// web app's own analysis code (film/v9/src/analysis/meterstreams.js, synced by tools/sync_web.mjs), so the native and
// web meters read the same numbers. The v8 composition decodes them in data.js fromNative.
//   node tools/meterdata.mjs <id>
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const id = process.argv[2]; if (!id) { console.error('usage: node tools/meterdata.mjs <id>'); process.exit(2); }
const { meterStreams, packStreams } = await import(path.join(ROOT, 'film/v9/src/analysis/meterstreams.js'));
const js = path.join(ROOT, 'film/data', id + '.js'), wav = path.join(ROOT, 'film/data', id + '.wav');
const D = JSON.parse(fs.readFileSync(js, 'utf8').replace(/^window\.U2C_DATA=/, '').replace(/;\s*$/, ''));
// minimal RIFF reader: float32 (format 3, or EXTENSIBLE) or int16 PCM, interleaved stereo
const buf = fs.readFileSync(wav); let p = 12, fmt = null, data = null;
while (p + 8 <= buf.length) { const ck = buf.toString('ascii', p, p + 4), sz = buf.readUInt32LE(p + 4);
  if (ck === 'fmt ') fmt = { tag: buf.readUInt16LE(p + 8), ch: buf.readUInt16LE(p + 10), sr: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
  if (ck === 'data') data = [p + 8, Math.min(sz, buf.length - p - 8)];
  p += 8 + sz + (sz & 1); }
if (!fmt || !data) throw new Error('not a WAV: ' + wav);
const nCh = fmt.ch, bps = fmt.bits / 8, n = Math.floor(data[1] / (bps * nCh)), L = new Float32Array(n), R = new Float32Array(n);
const rd = fmt.bits === 32 ? (o) => buf.readFloatLE(o) : fmt.bits === 16 ? (o) => buf.readInt16LE(o) / 32768 : null;
if (!rd) throw new Error('unsupported WAV sample format ' + fmt.bits + ' bit');
for (let i = 0; i < n; i++) { const o = data[0] + i * bps * nCh; L[i] = rd(o); R[i] = nCh > 1 ? rd(o + bps) : L[i]; }
const t0 = Date.now(), BAR = 4 * D.beat;
D.meters = packStreams(meterStreams({ L, R, sr: fmt.sr, NF: D.frames, fps: D.fps, bars: D.bars, barLen: Math.round(BAR * fmt.sr) }));
fs.writeFileSync(js, 'window.U2C_DATA=' + JSON.stringify(D) + ';\n');
console.log(`meterdata: ${id} · ${n} samples @ ${fmt.sr} Hz · ${((Date.now() - t0) / 1000).toFixed(1)} s · ${(fs.statSync(js).size / 1e6).toFixed(1)} MB`);
