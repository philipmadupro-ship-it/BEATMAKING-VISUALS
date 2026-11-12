// Frame-exact offline export with Mediabunny (WebCodecs). Each frame is rendered from audio time t = in + i/fps.
export async function canOffline(mb, W, H, mbps) {
  if (!mb || typeof VideoEncoder === 'undefined') return null;
  try { const v = (await mb.canEncodeVideo('avc', { width: W, height: H, bitrate: mbps * 1e6 })) ? 'avc' : (await mb.canEncodeVideo('vp9', { width: W, height: H, bitrate: mbps * 1e6 })) ? 'vp9' : null;
    if (!v) return null; const container = v === 'avc' ? 'mp4' : 'webm';
    const a = container === 'mp4' && await mb.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, bitrate: 256e3 }) ? 'aac' : (await mb.canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000, bitrate: 192e3 })) ? 'opus' : null;
    return a ? { v, a, container } : null; } catch (e) { console.warn('[u2c] codec probe failed', e); return null; }
}
export async function exportOffline({ mb, codecs, W, H, fps, mbps, inT, outT, audio, draw, onProgress, isCancelled }) {
  const out = document.createElement('canvas'); out.width = W; out.height = H; const octx = out.getContext('2d');
  const output = new mb.Output({ format: codecs.container === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const vsrc = new mb.CanvasSource(out, { codec: codecs.v, bitrate: mbps * 1e6, keyFrameInterval: 2 });
  output.addVideoTrack(vsrc, { frameRate: fps });
  const asrc = new mb.AudioBufferSource({ codec: codecs.a, bitrate: codecs.a === 'aac' ? 256e3 : 192e3 }); output.addAudioTrack(asrc);
  await output.start();
  await asrc.add(audio);
  const frames = Math.max(1, Math.round((outT - inT) * fps)), t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (isCancelled()) { await output.cancel(); return null; }
    draw(inT + i / fps, octx);
    await vsrc.add(i / fps, 1 / fps);
    if (i % 3 === 0) onProgress(i / frames, (performance.now() - t0) / 1000);
  }
  await output.finalize(); onProgress(1, (performance.now() - t0) / 1000);
  const type = codecs.container === 'mp4' ? 'video/mp4' : 'video/webm';
  return { blob: new Blob([output.target.buffer], { type }), type, ext: codecs.container, codecs, seconds: (performance.now() - t0) / 1000 };
}
