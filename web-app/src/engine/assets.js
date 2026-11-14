import LINKS from './links.js';
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load ' + src)); i.src = src; }); }
const json = async url => { try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } };
/**
 * Optional Higgsfield (or any) sprite loop: assets/elephant-anim/manifest.json = {fps, frames: ["0001.png", …],
 * bail?: {x, y} (frame pixels where the chain attaches), width?: number}. Missing or broken → null (the mesh warp is used).
 * Frames are scaled so their width matches elephant.png (or `width`), so the pendant keeps its size.
 */
export async function loadElephantAnim(base, ref) {
  const m = await json(base + 'elephant-anim/manifest.json');
  if (!m || !Array.isArray(m.frames) || !m.frames.length || !(m.fps > 0)) return null;
  try {
    const frames = await Promise.all(m.frames.map(f => loadImg(new URL(f, new URL(base + 'elephant-anim/', location.href)).href)));
    const fw = frames[0].width, scale = (m.width || ref.width) / fw, k = fw / ref.width;
    const bail = m.bail && isFinite(m.bail.x) && isFinite(m.bail.y) ? { x: +m.bail.x, y: +m.bail.y } : { x: 343 * k, y: 197 * k };
    return Object.freeze({ fps: +m.fps, frames, bail, scale });
  } catch (e) { console.warn('[u2c] elephant-anim: could not load frames, using the mesh warp', e && e.message); return null; }
}
export async function loadAssets(base = 'assets/') {
  const [atlas, edge, eleph, elephLimbs, warp] = await Promise.all([loadImg(base + 'u2c-links.png'), loadImg(base + 'u2c-links-edge.png'), loadImg(base + 'elephant.png'),
    loadImg(base + 'elephant-limbs.png').catch(() => null), json(base + 'elephant-warp.json')]);
  const elephAnim = await loadElephantAnim(base, eleph);
  if (elephAnim) console.info('[u2c] elephant sprite loop:', elephAnim.frames.length, 'frames @', elephAnim.fps, 'fps');
  return Object.freeze({ atlas, edge, eleph, elephLimbs, warp, elephAnim, links: LINKS });
}
