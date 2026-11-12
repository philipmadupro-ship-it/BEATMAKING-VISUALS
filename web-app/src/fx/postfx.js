// Post-FX pass. With PixiJS + pixi-filters: the finished 2D frame is uploaded as a texture and run through an
// audio-driven filter chain on the GPU. Without them (or if WebGL fails): a Canvas2D RGB split + glitch slices.
import { clamp, hash, mk } from '../util/draw.js';
function seeded(seed) { let s = (seed * 4294967296) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
export function createPostFX(libs) {
  let R = null, stage = null, sprite = null, tex = null, texCanvas = null, texW = 0, texH = 0, F = null, ok = false, failed = false, lastGlitch = -2;
  const fb = { a: null, b: null };
  async function init() {
    if (ok || failed) return ok;
    try {
      const PIXI = libs.PIXI, f = libs.filters; if (!PIXI || !f) throw new Error('PixiJS not loaded');
      R = await PIXI.autoDetectRenderer({ preference: 'webgl', width: 64, height: 64, antialias: false, preserveDrawingBuffer: true, backgroundAlpha: 1, background: 0x000000, resolution: 1, autoDensity: false });
      stage = new PIXI.Container(); sprite = new PIXI.Sprite(); stage.addChild(sprite);
      F = { rgb: new f.RGBSplitFilter({ red: { x: 0, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 0, y: 0 } }),
        glitch: new f.GlitchFilter({ slices: 8, offset: 40, fillMode: 2, average: false, seed: .5 }),
        crt: new f.CRTFilter({ curvature: 1, lineWidth: 2, lineContrast: .2, noise: .1, noiseSize: 1.5, vignetting: .32, vignettingAlpha: .6, vignettingBlur: .3 }),
        bloom: new f.AdvancedBloomFilter({ threshold: .55, bloomScale: .8, brightness: 1, blur: 6, quality: 4 }),
        shock: new f.ShockwaveFilter({ center: { x: 0, y: 0 }, speed: 900, amplitude: 20, wavelength: 180, brightness: 1.1, radius: -1 }),
        zoom: new f.ZoomBlurFilter({ strength: 0, center: { x: 0, y: 0 }, innerRadius: 60 }),
        twist: new f.TwistFilter({ radius: 300, angle: 0, offset: { x: 0, y: 0 }, padding: 0 }) };
      ok = true;
    } catch (e) { console.warn('[u2c] WebGL post-FX unavailable, using Canvas2D fallback:', e && e.message); failed = true; ok = false; }
    return ok;
  }
  function gpu(canvas, fs, P, ev, s) {
    const fx = P.fx, w = canvas.width, h = canvas.height, paper = ev.tpl.surface === 'paper', boost = ev.tpl.glitchBoost || 1;
    if (R.width !== w || R.height !== h) R.resize(w, h);
    if (texCanvas !== canvas || texW !== w || texH !== h) { if (tex) tex.destroy(false); tex = new libs.PIXI.Texture({ source: new libs.PIXI.CanvasSource({ resource: canvas }) }); texCanvas = canvas; texW = w; texH = h; sprite.texture = tex; }
    else tex.source.update();
    const list = [], u = s * P.u, cx = ev.center.x * s, cy = ev.center.y * s;
    // twist + zoom blur while the chains shatter / fly back in
    const sh = fx.shatter * clamp(boost, .5, 1.5);
    if (sh > 0 && ev.ph.shatterQ > 0) { F.zoom.strength = .16 * sh * Math.sin(Math.PI * ev.ph.shatterQ); F.zoom.center = { x: cx, y: cy }; F.zoom.innerRadius = 40 * u; list.push(F.zoom); }
    if (sh > 0 && ev.ph.flyQ > 0) { F.twist.angle = 2.4 * sh * Math.sin(Math.PI * ev.ph.flyQ) * (1 - ev.ph.flyQ); F.twist.radius = ev.radius * s; F.twist.offset = { x: cx, y: cy }; list.push(F.twist); }
    // shockwave on the phrase downbeat (chains slam) and on detected drops
    const sa = Math.min(ev.ph.impactAge, ev.dropAge);
    if (fx.shock > 0 && sa < 1.1) { F.shock.time = sa; F.shock.center = { x: cx, y: cy }; F.shock.speed = 1100 * u; F.shock.amplitude = 26 * u * fx.shock; F.shock.wavelength = 200 * u; list.push(F.shock); }
    // glitch slices on kicks (deterministic: slices are regenerated from the kick index)
    if (fx.glitch > 0 && (fs.kickAge < .12 && fs.kick > .3 || ev.ph.impactAge < .15)) {
      const seed = hash(fs.kickIdx, 77); if (lastGlitch !== fs.kickIdx) { const r = Math.random; Math.random = seeded(seed); try { F.glitch.slices = 6 + Math.floor(seed * 8); F.glitch.refresh(); } finally { Math.random = r; } lastGlitch = fs.kickIdx; }
      F.glitch.offset = 70 * u * fx.glitch * boost * Math.max(fs.kick, ev.ph.impactAge < .15 ? 1 : 0); F.glitch.seed = seed; list.push(F.glitch); }
    const d = fx.rgb * boost * (1.5 + 16 * fs.snare + 7 * (fs.kickAge < .2 ? fs.kick : 0)) * u;
    if (d > .5) { F.rgb.red = { x: -d, y: 0 }; F.rgb.green = { x: 0, y: 0 }; F.rgb.blue = { x: d, y: d * .35 }; list.push(F.rgb); }
    if (fx.bloom > 0 && !paper) { F.bloom.bloomScale = fx.bloom * (.35 + 1.1 * fs.lowSlow); F.bloom.threshold = .5; F.bloom.blur = 7 * u; F.bloom.brightness = 1; list.push(F.bloom); }
    if (fx.crt > 0) { F.crt.lineWidth = Math.max(1, 3 * u); F.crt.lineContrast = (paper ? .1 : .22) * fx.crt; F.crt.noise = (paper ? .08 : .14) * fx.crt; F.crt.noiseSize = Math.max(1, 2 * u);
      F.crt.vignettingAlpha = .55 * fx.crt; F.crt.curvature = 1.5 * fx.crt; F.crt.seed = hash(Math.floor(fs.t * 30), 5); F.crt.time = fs.t * 2; list.push(F.crt); }
    sprite.filters = list.length ? list : null;
    R.render({ container: stage });
    return R.canvas;
  }
  function cpu(canvas, fs, P, ev, s) {
    const g = P.fx.glitch * (ev.tpl.glitchBoost || 1), r = P.fx.rgb * (ev.tpl.glitchBoost || 1); if (g <= 0 && r <= 0) return canvas;
    const c = canvas, w = c.width, h = c.height, ctx = c.getContext('2d');
    const hit = Math.max(fs.kick * (fs.kickAge < .2 ? 1 : .25), fs.snare * .6), rgb = r * (1.5 + 16 * hit) * s * P.u;
    const slices = (fs.kickAge < .11 && fs.kick > .35 || ev.ph.impactAge < .12) && g > .05; if (rgb < .75 && !slices) return canvas;
    if (!fb.a || fb.a.width !== w || fb.a.height !== h) { fb.a = mk(w, h); fb.b = mk(w, h); }
    const ga = fb.a.getContext('2d'), gb = fb.b.getContext('2d'); ga.globalCompositeOperation = 'copy'; ga.drawImage(c, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (rgb >= .75) { const dy = (hash(fs.kickIdx, 9) - .5) * rgb * .4; ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'lighter';
      for (const [cc, dx] of [['#ff0000', -rgb], ['#0000ff', rgb]]) { gb.globalCompositeOperation = 'copy'; gb.drawImage(fb.a, 0, 0); gb.globalCompositeOperation = 'multiply'; gb.fillStyle = cc; gb.fillRect(0, 0, w, h); ctx.drawImage(fb.b, dx, cc === '#ff0000' ? 0 : dy); }
      ctx.globalCompositeOperation = 'source-over'; }
    if (slices) { const n = 3 + Math.floor(hash(fs.kickIdx, 1) * 5); for (let j = 0; j < n; j++) { const y = hash(fs.kickIdx, 20 + j) * h, hh = (.008 + .05 * hash(fs.kickIdx, 40 + j)) * h, dx = (hash(fs.kickIdx, 60 + j) - .5) * .16 * w * g * Math.max(fs.kick, .6); ctx.drawImage(fb.a, 0, y, w, hh, dx, y, w, hh); } }
    ctx.restore(); return canvas;
  }
  return {
    init, get gpu() { return ok && !failed; }, get status() { return ok ? 'WebGL (PixiJS)' : failed ? 'Canvas2D fallback' : 'starting'; },
    /** apply(canvas2d, frameState, params, ev, scale) -> canvas holding the finished frame */
    apply(canvas, fs, P, ev, s) { if (!P.fx.on) return canvas; if (ok) { try { return gpu(canvas, fs, P, ev, s); } catch (e) { console.warn('[u2c] post-FX error, switching to Canvas2D', e); ok = false; failed = true; } } return cpu(canvas, fs, P, ev, s); },
  };
}
