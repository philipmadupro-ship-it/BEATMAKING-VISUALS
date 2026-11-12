// Fallback: real-time capture with canvas.captureStream + MediaRecorder (used when WebCodecs encoding is unavailable).
export function recorderMime() {
  if (!window.MediaRecorder) return null;
  for (const [m, e] of [['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'], ['video/mp4', 'mp4'], ['video/webm;codecs=vp9,opus', 'webm'], ['video/webm', 'webm']]) if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext: e };
  return { mime: '', ext: 'webm' };
}
export async function exportRealtime({ ac, W, H, fps, mbps, inT, outT, audio, monitor, render, onProgress, isCancelled }) {
  const M = recorderMime(); if (!M || !HTMLCanvasElement.prototype.captureStream) throw new Error('This browser cannot record canvas video.');
  await ac.resume(); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'), draw = t => cx.drawImage(render(t), 0, 0, W, H); draw(inT);
  const vs = cv.captureStream(fps), dest = ac.createMediaStreamDestination(), s = ac.createBufferSource(); s.buffer = audio; s.connect(dest); if (monitor) s.connect(ac.destination);
  const stream = new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  let rec; try { rec = new MediaRecorder(stream, M.mime ? { mimeType: M.mime, videoBitsPerSecond: mbps * 1e6, audioBitsPerSecond: 256e3 } : {}); } catch (_) { rec = new MediaRecorder(stream); }
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); }; const done = new Promise(r => (rec.onstop = r));
  rec.start(500); const t0 = ac.currentTime + .08, dur = outT - inT; s.start(t0);
  await new Promise(res => { const step = () => { const t = inT + Math.max(0, ac.currentTime - t0); draw(Math.min(t, outT)); onProgress(Math.min(1, (t - inT) / dur)); if (t >= outT || isCancelled()) return res(); requestAnimationFrame(step); }; requestAnimationFrame(step); });
  try { s.stop(); } catch (_) {} rec.stop(); await done; vs.getTracks().forEach(t => t.stop()); s.disconnect(); dest.disconnect();
  if (isCancelled()) return null; const type = (rec.mimeType || M.mime || 'video/webm').split(';')[0];
  return { blob: new Blob(chunks, { type }), type, ext: type.includes('mp4') ? 'mp4' : 'webm', codecs: { v: 'MediaRecorder', a: '' } };
}
