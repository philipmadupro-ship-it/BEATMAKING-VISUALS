// Third-party libraries, pinned to exact versions on jsDelivr. Every one is optional: if a CDN import
// fails, the app falls back to its own Canvas2D / hand-written paths.
const J = 'https://cdn.jsdelivr.net/npm/';
export const CDN = {
  gsap: J + 'gsap@3.15.0/index.js',
  customEase: J + 'gsap@3.15.0/CustomEase.js',
  ws: J + 'wavesurfer.js@7.12.12/dist/wavesurfer.esm.js',
  wsRegions: J + 'wavesurfer.js@7.12.12/dist/plugins/regions.esm.js',
  wsTimeline: J + 'wavesurfer.js@7.12.12/dist/plugins/timeline.esm.js',
  wsMinimap: J + 'wavesurfer.js@7.12.12/dist/plugins/minimap.esm.js',
  wsHover: J + 'wavesurfer.js@7.12.12/dist/plugins/hover.esm.js',
  mediabunny: J + 'mediabunny@1.62.1/dist/bundles/mediabunny.min.mjs',
};
export const CREDITS = [
  { name: 'GSAP 3.15.0', use: 'UI motion', licence: "GreenSock Standard 'no charge' licence", url: 'https://gsap.com/standard-license' },
  { name: 'wavesurfer.js 7.12.12', use: 'song overview, section region, hover', licence: 'BSD-3-Clause', url: 'https://github.com/katspaugh/wavesurfer.js' },
  { name: 'Mediabunny 1.62.1', use: 'frame-exact MP4 encoding (WebCodecs)', licence: 'MPL-2.0', url: 'https://github.com/Vanilagy/mediabunny' },
  { name: 'Instrument Sans, Instrument Serif, JetBrains Mono, Caveat', use: 'type', licence: 'SIL OFL 1.1', url: 'https://fonts.google.com' },
];
// every optional import gets a timeout: a CDN that stalls (no error, no response) must not block boot forever
const tryImport = async (url, ms = 12000) => { let to; try { return await Promise.race([import(url), new Promise((_, rej) => { to = setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s')), ms); })]); }
  catch (e) { console.warn('[u2c] optional library unavailable:', url, e && e.message); return null; } finally { clearTimeout(to); } };
export async function loadLibs() {
  const [gsapM, ce, ws, wsRegions, wsTimeline, wsMinimap, wsHover, mediabunny] = await Promise.all(
    [CDN.gsap, CDN.customEase, CDN.ws, CDN.wsRegions, CDN.wsTimeline, CDN.wsMinimap, CDN.wsHover, CDN.mediabunny].map(u => tryImport(u)));
  const gsap = gsapM && (gsapM.gsap || gsapM.default);
  if (gsap && ce && ce.CustomEase) { try { gsap.registerPlugin(ce.CustomEase); } catch (_) {} }
  return {
    gsap, CustomEase: ce && ce.CustomEase,
    WaveSurfer: ws && ws.default, Regions: wsRegions && wsRegions.default, Timeline: wsTimeline && wsTimeline.default,
    Minimap: wsMinimap && wsMinimap.default, Hover: wsHover && wsHover.default, mediabunny,
  };
}
