import LINKS from './links.js';
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load ' + src)); i.src = src; }); }
export async function loadAssets(base = 'assets/') {
  const [atlas, edge, eleph] = await Promise.all([loadImg(base + 'u2c-links.png'), loadImg(base + 'u2c-links-edge.png'), loadImg(base + 'elephant.png')]);
  return Object.freeze({ atlas, edge, eleph, links: LINKS });
}
