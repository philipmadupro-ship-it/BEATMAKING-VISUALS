// Frame-exact offline export: our own WebCodecs VideoEncoder fed straight from the renderer's output canvas
// (new VideoFrame(canvas, {timestamp}) — no getImageData, no intermediate canvas), muxed by Mediabunny
// (EncodedVideoPacketSource + AudioBufferSource). The encoder is pipelined: frames are submitted without awaiting,
// the queue is kept <= 8 and we only yield to the event loop when it is full or every ~120 ms for the progress UI.
const AVC = ['avc1.640033', 'avc1.64002a', 'avc1.4d4033', 'avc1.42e033', 'avc1.42001f'], VP9 = ['vp09.00.41.08', 'vp09.00.31.08'];
async function pickConfig(W, H, fps, bitrate) {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const [kind, list] of [['avc', AVC], ['vp9', VP9]]) for (const hw of ['prefer-hardware', 'no-preference']) for (const codec of list) {
    const cfg = { codec, width: W, height: H, bitrate, framerate: fps, hardwareAcceleration: hw, latencyMode: 'quality', ...(kind === 'avc' ? { avc: { format: 'avc' } } : {}) };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return { kind, cfg: r.config || cfg, hw }; } catch (_) {}
  }
  return null;
}
export async function canOffline(mb, W, H, mbps, fps = 30) {
  if (!mb || typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
  try { const v = await pickConfig(W, H, fps, mbps * 1e6); if (!v) return null; const container = v.kind === 'avc' ? 'mp4' : 'webm';
    const a = container === 'mp4' && await mb.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, bitrate: 256e3 }) ? 'aac' : (await mb.canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000, bitrate: 192e3 })) ? 'opus' : null;
    return a ? { v: v.kind, a, container, cfg: v.cfg, hw: v.hw } : null; } catch (e) { console.warn('[u2c] codec probe failed', e); return null; }
}
const tick = () => new Promise(r => setTimeout(r, 0));
/** render(t) must draw the frame for time t and return the canvas holding it (2D or WebGL with preserveDrawingBuffer). */
export async function exportOffline({ mb, codecs, W, H, fps, mbps, inT, outT, audio, render, onProgress, isCancelled }) {
  const output = new mb.Output({ format: codecs.container === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const vsrc = new mb.EncodedVideoPacketSource(codecs.v); output.addVideoTrack(vsrc, { frameRate: fps });
  const asrc = new mb.AudioBufferSource({ codec: codecs.a, bitrate: codecs.a === 'aac' ? 256e3 : 192e3 }); output.addAudioTrack(asrc);
  await output.start();
  let failure = null, chain = Promise.resolve();
  const enc = new VideoEncoder({
    output: (chunk, meta) => { const pk = mb.EncodedPacket.fromEncodedChunk(chunk); chain = chain.then(() => vsrc.add(pk, meta)).catch(e => { failure = failure || e; }); },
    error: e => { failure = failure || e; },
  });
  enc.configure({ ...codecs.cfg, width: W, height: H, bitrate: mbps * 1e6, framerate: fps });
  const audioDone = asrc.add(audio).then(() => asrc.close());
  const frames = Math.max(1, Math.round((outT - inT) * fps)), t0 = performance.now(), dur = Math.round(1e6 / fps), gop = fps * 2;
  let lastYield = performance.now(), tRender = 0, tWait = 0;
  const drain = () => new Promise(r => { let done = false; const f = () => { if (!done) { done = true; r(); } }; enc.addEventListener('dequeue', f, { once: true }); setTimeout(f, 8); });
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    if (isCancelled()) { try { enc.close(); } catch (_) {} await output.cancel(); return null; }
    const r0 = performance.now(); const canvas = render(inT + i / fps); tRender += performance.now() - r0;
    const vf = new VideoFrame(canvas, { timestamp: i * dur, duration: dur, alpha: 'discard' });
    enc.encode(vf, { keyFrame: i % gop === 0 }); vf.close();
    const w0 = performance.now(); while (enc.encodeQueueSize > 8) await drain(); tWait += performance.now() - w0;
    const now = performance.now(); if (now - lastYield > 120) { lastYield = now; onProgress((i + 1) / frames, (now - t0) / 1000, i + 1); await tick(); }
  }
  await enc.flush(); enc.close(); await chain; if (failure) throw failure;
  vsrc.close(); await audioDone; await output.finalize();
  const seconds = (performance.now() - t0) / 1000; onProgress(1, seconds, frames);
  console.info(`[u2c] export ${W}x${H} ${frames} frames in ${seconds.toFixed(1)} s (${(frames / seconds).toFixed(1)} fps) · render ${(tRender / frames).toFixed(1)} ms/frame · waiting on encoder ${(tWait / frames).toFixed(1)} ms/frame · ${codecs.hw}`);
  const type = codecs.container === 'mp4' ? 'video/mp4' : 'video/webm';
  return { blob: new Blob([output.target.buffer], { type }), type, ext: codecs.container, codecs, seconds, frames, fps: frames / seconds };
}
