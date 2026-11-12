// Third-party libraries, pinned to exact versions on jsDelivr. Every one is optional: if a CDN import
// fails, the app falls back to its own Canvas2D / hand-written paths.
const J = 'https://cdn.jsdelivr.net/npm/';
export const CDN = {
  pixi: J + 'pixi.js@8.22.0/dist/pixi.min.mjs',            // also mapped as bare "pixi.js" in the import map
  filters: J + 'pixi-filters@6.1.5/dist/pixi-filters.mjs',
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
  { name: 'PixiJS 8.22.0', use: 'WebGL post-FX renderer', licence: 'MIT', url: 'https://github.com/pixijs/pixijs' },
  { name: 'pixi-filters 6.1.5', use: 'RGB split, glitch, CRT, bloom, shockwave, zoom blur, twist', licence: 'MIT', url: 'https://github.com/pixijs/filters' },
  { name: 'GSAP 3.15.0', use: 'chain timelines, pendulum, UI motion', licence: "GreenSock Standard 'no charge' licence", url: 'https://gsap.com/standard-license' },
  { name: 'wavesurfer.js 7.12.12', use: 'timeline, regions, minimap, hover', licence: 'BSD-3-Clause', url: 'https://github.com/katspaugh/wavesurfer.js' },
  { name: 'Mediabunny 1.62.1', use: 'frame-exact MP4 encoding (WebCodecs)', licence: 'MPL-2.0', url: 'https://github.com/Vanilagy/mediabunny' },
  { name: 'Instrument Sans, Instrument Serif, JetBrains Mono, Anton', use: 'type', licence: 'SIL OFL 1.1', url: 'https://fonts.google.com' },
];
const tryImport = async url => { try { return await import(url); } catch (e) { console.warn('[u2c] optional library unavailable:', url, e && e.message); return null; } };
export async function loadLibs() {
  const [pixi, filters, gsapM, ce, ws, wsRegions, wsTimeline, wsMinimap, wsHover, mediabunny] = await Promise.all(
    [CDN.pixi, CDN.filters, CDN.gsap, CDN.customEase, CDN.ws, CDN.wsRegions, CDN.wsTimeline, CDN.wsMinimap, CDN.wsHover, CDN.mediabunny].map(tryImport));
  const gsap = gsapM && (gsapM.gsap || gsapM.default);
  if (gsap && ce && ce.CustomEase) { try { gsap.registerPlugin(ce.CustomEase); } catch (_) {} }
  return {
    PIXI: pixi, filters, gsap, CustomEase: ce && ce.CustomEase,
    WaveSurfer: ws && ws.default, Regions: wsRegions && wsRegions.default, Timeline: wsTimeline && wsTimeline.default,
    Minimap: wsMinimap && wsMinimap.default, Hover: wsHover && wsHover.default, mediabunny,
  };
}
