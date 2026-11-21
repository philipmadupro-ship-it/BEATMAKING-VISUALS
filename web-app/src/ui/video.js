// Video layer (session only: the file never leaves the browser). An uploaded screen recording lives in a muted
// HTMLVideoElement published as app.assets.videoLayer = {src, w, h}; the film (v8/film.js videoDraw) blends it in.
//   live preview: sync(t) keeps the element on the clock (plays with it, seeks on drift, seeks while paused)
//   offline export: seek(t, project) puts it exactly on t + video.offset and awaits `seeked` before each frame
const $ = (s) => document.querySelector(s);
export function createVideoLayer(app) {
  let el = null, url = '';
  const ev = () => app.cues.ev(), P = () => app.store.project;
  const spb = () => (app.store.session.track ? app.store.session.track.spb : 0.5);
  const offsetAt = (clipT) => +ev().value('video.offset', clipT / spb(), 0) || 0;
  const target = (clipT) => { const d = el.duration || 0, v = clipT + offsetAt(clipT); return Math.max(0, Math.min(Math.max(0, d - 0.001), v)); };
  function info(txt) { $('#vidInfo').textContent = txt; $('#vidClear').hidden = !el; }
  function clear() { if (el) { el.pause(); el.removeAttribute('src'); el.load(); } if (url) URL.revokeObjectURL(url); url = ''; el = null; globalThis.u2cVideoLayer = null; info('a DAW screen recording blends into the film'); app.studio.markDirty(); }
  async function load(file) {
    clear(); url = URL.createObjectURL(file); const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('cannot decode')); });
    el = v; el.addEventListener('seeked', () => app.studio.markDirty()); globalThis.u2cVideoLayer = { src: v, w: v.videoWidth, h: v.videoHeight };
    app.actions.setProp('video.on', true); $('#vidOn').checked = true; info(`${file.name} · ${v.videoWidth}×${v.videoHeight} · ${v.duration.toFixed(1)} s`); app.studio.markDirty();
  }
  $('#vidFile').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await load(f); } catch (err) { clear(); info('could not decode that video (' + err.message + ')'); } });
  $('#vidClear').addEventListener('click', clear);
  $('#vidOn').addEventListener('change', (e) => { app.actions.setProp('video.on', e.target.checked); app.studio.markDirty(); });
  app.cues.subscribe(() => { const o = $('#vidOn'); if (o && document.activeElement !== o) o.checked = !!ev().value('video.on', app.cuetl ? app.cuetl.state.playhead : 0, false); });
  return {
    get loaded() { return !!el; },
    /** Live preview: follow the clock (t = absolute audio time). */
    sync(t) { if (!el) return; const want = target(t - P().inT), playing = app.clock.playing;
      if (playing) { if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want; if (el.paused) el.play().catch(() => {}); }
      else { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - want) > 0.008 && !el.seeking) el.currentTime = want; } },
    /** Offline export: exactly on frame time t (absolute), resolved once the frame is decoded. */
    async seek(t, project) { if (!el) return; const want = Math.max(0, Math.min(Math.max(0, (el.duration || 0) - 0.001), (t - project.inT) + offsetAt(t - project.inT))); el.pause();
      if (Math.abs(el.currentTime - want) < 1e-4 && el.readyState >= 2) return;
      await new Promise((res) => { const done = () => { el.removeEventListener('seeked', done); clearTimeout(to); res(); }, to = setTimeout(done, 2000); el.addEventListener('seeked', done); el.currentTime = want; });
      if (el.requestVideoFrameCallback && el.readyState < 3) await new Promise((r) => { const to2 = setTimeout(r, 120); el.requestVideoFrameCallback(() => { clearTimeout(to2); r(); }); }); },
    /** Real-time fallback recorder: best effort, no waiting. */
    nudge(t, project) { if (el) { el.pause(); el.currentTime = target(t - project.inT); } },
  };
}
