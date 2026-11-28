// Audio drag and drop, anywhere in the window (FL: slices dragged from Edison / Slicex, or any sound file). Where it lands decides what it is:
//   the MPC panel  -> the next free pad          the Reference row of the DAW panel -> an average-spectrum reference
//   the voice lab / a lab-sound row -> that sound   anywhere else -> a short sound (<= 6 s) goes on a pad, a longer one is loaded as the beat
// Images and video are left to their own handlers.
import { addAudioReference } from '../bridge/reference.js';
export const SHORT_S = 6;
export const isAudio = (f) => !!f && (/^audio\//.test(f.type) || /\.(wav|mp3|flac|ogg|oga|m4a|aac|aif|aiff|opus)$/i.test(f.name || ''));
/** Pure routing: zone is 'mpc' | 'ref' | 'voice' | 'sfx:<id>' | 'main'. */
export function routeDrop(zone, seconds) {
  if (zone === 'mpc') return 'pad'; if (zone === 'ref') return 'ref'; if (zone === 'voice') return 'voice'; if (/^sfx:/.test(zone)) return 'sfx';
  return seconds <= SHORT_S ? 'pad' : 'beat';
}
export function zoneOf(el) {
  if (!el || !el.closest) return 'main';
  if (el.closest('#u2cMpc')) return 'mpc'; if (el.closest('#u2cDaw [data-ref]')) return 'ref';
  const row = el.closest('.sfx-row'); if (row) { const i = row.querySelector('input[type=file]'); const m = i && /^sfxFile-(.+)$/.exec(i.id); if (m) return 'sfx:' + m[1]; }
  if (el.closest('#voiceLab, #mediaVoice, #voiceFile')) return 'voice'; return 'main';
}
export function installDrop(app) {
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  const ctx = () => (app.clock && app.clock.ctx) || (app._dropCtx = app._dropCtx || new (window.AudioContext || window.webkitAudioContext)());
  async function handle(file, zone) {
    let buf = null; try { buf = await ctx().decodeAudioData(await file.arrayBuffer()); } catch (_) {}
    const route = buf ? routeDrop(zone, buf.duration) : (zone === 'main' ? 'beat' : routeDrop(zone, 0)), name = file.name.replace(/\.[a-z0-9]+$/i, '');
    if (route === 'pad' && app.mpc) await app.mpc.addSound(file, name);
    else if (route === 'ref' && buf) { await addAudioReference(name.slice(0, 24), Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), buf.sampleRate); window.dispatchEvent(new CustomEvent('u2c-refs')); }
    else if (route === 'voice' && app.media) await app.media.setVoice(file, file.name);
    else if (route === 'sfx' && app.media) await app.media.setSfx(zone.slice(4), file, file.name);
    else if (route === 'beat' && app.actions.loadFile) await app.actions.loadFile(file);
    window.dispatchEvent(new CustomEvent('u2c-dropped', { detail: { route, name, zone } }));
    return route;
  }
  window.addEventListener('drop', (e) => {
    const fs = [...(e.dataTransfer && e.dataTransfer.files || [])].filter(isAudio); if (!fs.length) return;
    e.preventDefault(); e.stopPropagation(); const zone = zoneOf(e.target);
    (async () => { let beat = false; for (const f of fs) { const z = zone === 'main' && beat ? 'mpc' : zone; if ((await handle(f, z)) === 'beat') beat = true; } })();
  }, true);
  app.dropAudio = { handle };
}
