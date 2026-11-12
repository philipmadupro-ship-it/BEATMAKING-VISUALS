// Post-FX pass. With PixiJS + pixi-filters: the finished 2D frame is uploaded as a texture and run through an
// audio-driven filter chain on the GPU, rendered once per frame. Without them (or if WebGL fails): a Canvas2D RGB split.
// Defaults are deliberately subtle: FX amount 35 % is the "1x" reference; glitch slices are drawn by the renderer.
import { clamp, mk } from '../util/draw.js';
export function createPostFX(libs) {
  let R = null, stage = null, sprite = null, F = null, ok = false, failed = false;
  const sources = new WeakMap(); // canvas -> {tex, w, h}: one texture per source canvas, rebuilt only on resize
  const fb = { a: null, b: null };
  async function init() {
    if (ok || failed) return ok;
    try {
      const PIXI = libs.PIXI, f = libs.filters; if (!PIXI || !f) throw new Error('PixiJS not loaded');
      R = await PIXI.autoDetectRenderer({ preference: 'webgl', width: 64, height: 64, antialias: false, preserveDrawingBuffer: true, backgroundAlpha: 1, background: 0x000000, resolution: 1, autoDensity: false });
      stage = new PIXI.Container(); sprite = new PIXI.Sprite(); stage.addChild(sprite);
      F = { rgb: new f.RGBSplitFilter({ red: { x: 0, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 0, y: 0 } }),
        crt: new f.CRTFilter({ curvature: .6, lineWidth: 2, lineContrast: .1, noise: .05, noiseSize: 1.5, vignetting: .32, vignettingAlpha: .35, vignettingBlur: .3 }),
        bloom: new f.AdvancedBloomFilter({ threshold: .55, bloomScale: .6, brightness: 1, blur: 6, quality: 3 }),
        shock: new f.ShockwaveFilter({ center: { x: 0, y: 0 }, speed: 900, amplitude: 10, wavelength: 180, brightness: 1.05, radius: -1 }) };
      F.bloom.resolution = .5; // bloom is a soft glow: half-resolution blur passes cost a quarter and look the same
      ok = true;
    } catch (e) { console.warn('[u2c] WebGL post-FX unavailable, using Canvas2D fallback:', e && e.message); failed = true; ok = false; }
    return ok;
  }
  function texFor(canvas) {
    const w = canvas.width, h = canvas.height; let e = sources.get(canvas);
    if (e && (e.w !== w || e.h !== h)) { e.tex.destroy(true); e = null; }
    if (!e) { e = { tex: new libs.PIXI.Texture({ source: new libs.PIXI.CanvasSource({ resource: canvas }) }), w, h }; sources.set(canvas, e); }
    else e.tex.source.update();
    return e.tex;
  }
  /** RGB split in px: only as part of an opt-in glitch hit (never on plain kicks); <= ~3.5 px at 1080p. */
  function rgbPx(fs, P, ev, s) { const g = ev.gh ? ev.gh.e : 0; return g ? Math.min(14, 6 * P.fx.rgb * (P.fx.amount / .35) * g * Math.max(.3, P.fx.glitch)) * P.u * s : 0; }
  function gpu(canvas, fs, P, ev, s) {
    const fx = P.fx, w = canvas.width, h = canvas.height, flat = ev.tpl.surface === 'paper' || ev.pal.light, A = fx.amount / .35;
    if (R.width !== w || R.height !== h) R.resize(w, h);
    sprite.texture = texFor(canvas);
    const list = [], u = s * P.u, cx = ev.center.x * s, cy = ev.center.y * s;
    // optional shockwave (opt-in, default 0) on the phrase downbeat and on drops; never on kicks
    const sa = Math.min(ev.ph.impactAge, ev.dropAge);
    if (fx.shock > 0 && sa < .9) { F.shock.time = sa; F.shock.center = { x: cx, y: cy }; F.shock.speed = 1100 * u; F.shock.amplitude = 14 * u * fx.shock * A; F.shock.wavelength = 200 * u; list.push(F.shock); }
    const d = rgbPx(fs, P, ev, s);
    if (d > .4) { F.rgb.red = { x: -d, y: 0 }; F.rgb.green = { x: 0, y: 0 }; F.rgb.blue = { x: d, y: d * .3 }; list.push(F.rgb); }
    if (fx.bloom > 0 && !flat) { F.bloom.bloomScale = fx.bloom * A * (.25 + .8 * fs.lowSlow); F.bloom.threshold = .55; F.bloom.blur = 3 * u; F.bloom.brightness = 1; list.push(F.bloom); }
    if (fx.crt > 0) { const c = clamp(fx.crt * A, 0, 2); F.crt.lineWidth = Math.max(1, 3 * u); F.crt.lineContrast = (flat ? .03 : .07) * c; F.crt.noise = (flat ? .02 : .04) * c; F.crt.noiseSize = Math.max(1, 2 * u);
      F.crt.vignettingAlpha = (flat ? .15 : .3) * c; F.crt.curvature = .3 * c; F.crt.seed = (Math.floor(fs.lt * 30) % 997) / 997; F.crt.time = fs.lt * 2; list.push(F.crt); }
    sprite.filters = list.length ? list : null;
    R.render({ container: stage });
    return R.canvas;
  }
  function cpu(canvas, fs, P, ev, s) {
    const rgb = rgbPx(fs, P, ev, s); if (rgb < .75) return canvas;
    const c = canvas, w = c.width, h = c.height, ctx = c.getContext('2d');
    if (!fb.a || fb.a.width !== w || fb.a.height !== h) { fb.a = mk(w, h); fb.b = mk(w, h); }
    const ga = fb.a.getContext('2d'), gb = fb.b.getContext('2d'); ga.globalCompositeOperation = 'copy'; ga.drawImage(c, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'lighter';
    for (const [cc, dx] of [['#ff0000', -rgb], ['#0000ff', rgb]]) { gb.globalCompositeOperation = 'copy'; gb.drawImage(fb.a, 0, 0); gb.globalCompositeOperation = 'multiply'; gb.fillStyle = cc; gb.fillRect(0, 0, w, h); ctx.drawImage(fb.b, dx, cc === '#ff0000' ? 0 : rgb * .3); }
    ctx.restore(); return canvas;
  }
  return {
    init, get gpu() { return ok && !failed; }, get status() { return ok ? 'WebGL (PixiJS)' : failed ? 'Canvas2D fallback' : 'starting'; },
    /** apply(canvas2d, frameState, params, ev, scale) -> canvas holding the finished frame */
    apply(canvas, fs, P, ev, s) { if (!P.fx.on) return canvas; if (ok) { try { return gpu(canvas, fs, P, ev, s); } catch (e) { console.warn('[u2c] post-FX error, switching to Canvas2D', e); ok = false; failed = true; } } return cpu(canvas, fs, P, ev, s); },
  };
}
