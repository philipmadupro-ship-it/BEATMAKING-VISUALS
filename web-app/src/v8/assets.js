// Brand assets of the v8 looks: link atlas + edge atlas (the U2C chain logo), the elephant pendant art and its mesh
// rig (u2c-motion tools/elephant_rig.py), the link anchors (v8/links.js). Relative paths (artifact-safe).
import LINKS from './links.js';
const img = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load ' + src)); i.src = src; });
export async function loadAssets(base = 'assets/') {
  const [atlas, edge, eleph, rig] = await Promise.all([img(base + 'u2c-links.png'), img(base + 'u2c-links-edge.png'), img(base + 'elephant.png'), fetch(base + 'elephant-rig.json').then((r) => r.json())]);
  return Object.freeze({ atlas, edge, eleph, rig, links: LINKS });
}
