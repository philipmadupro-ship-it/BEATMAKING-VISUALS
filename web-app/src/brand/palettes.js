// U2C brand palettes: three families (Charcoal / Rust / Amethyst), each with variants derived only from the brand hexes,
// plus a "Custom" palette built from three user-picked colours (defaults = brand).
// Every template reads colours from these fields. Dark-surface templates use bg/bg2/dark (backgrounds) and main/hi/text
// (foreground); "paper" fields (paper/ink/pacc) are for print templates (HANDSET, EXE). `light` = light background.
import { mix } from '../util/draw.js';
const B = { char: '#161616', char2: '#232323', chain: '#c8c8c8', rust: '#6e4433', tan: '#c4a57a', ink: '#2a1710', am: '#1d1426', lilac: '#b79ad8', mag: '#e07ad0', ruby: '#e0475f', gold: '#f2c14e' };
const P = (o) => Object.freeze({ spark: o.main, chain: o.main, a2: o.hi, a3: o.hi, light: false, duo: null, ...o });
export const PALETTES = Object.freeze({
  charcoal: P({ id: 'charcoal', fam: 'charcoal', name: 'Charcoal', bg: B.char, bg2: B.char2, main: B.chain, hi: '#f0f0f0', a2: '#ffffff', a3: '#8a8a8a',
    text: '#e6e6e6', dim: '#5c5c5c', dark: B.char, paper: '#dcdcda', ink: B.char, pacc: '#5a5a5a', duo: [B.char, '#e2e2e2'] }),
  'charcoal-paper': P({ id: 'charcoal-paper', fam: 'charcoal', name: 'Paper', light: true, bg: '#e4e4e2', bg2: '#d6d6d4', main: B.char2, hi: B.char, a2: '#5a5a5a', a3: '#5a5a5a',
    text: B.char, dim: '#9a9a9a', dark: '#ecebe8', paper: '#f0efeb', ink: B.char, pacc: '#8a8a8a', duo: [B.char, '#f0efeb'] }),
  'charcoal-steel': P({ id: 'charcoal-steel', fam: 'charcoal', name: 'Steel', bg: mix(B.char2, B.chain, .18), bg2: mix(B.char2, B.chain, .1), main: '#e8e8e8', hi: '#ffffff', a2: '#ffffff', a3: B.chain,
    text: '#f0f0f0', dim: mix(B.char2, B.chain, .45), dark: mix(B.char, B.chain, .1), paper: B.chain, ink: B.char, pacc: B.char2, duo: [B.char2, '#f0f0f0'] }),
  rust: P({ id: 'rust', fam: 'rust', name: 'Rust', bg: B.rust, bg2: '#5c3829', main: B.tan, hi: '#e6d3b0', a2: B.ink, a3: '#e6d3b0',
    text: '#ecdcc0', dim: '#9a7458', dark: B.ink, paper: B.tan, ink: B.ink, pacc: B.rust, spark: B.tan, chain: B.ink, duo: [B.ink, '#d9bf95'] }),
  'rust-sepia': P({ id: 'rust-sepia', fam: 'rust', name: 'Sepia', light: true, bg: B.tan, bg2: mix(B.tan, '#e6d3b0', .5), main: B.ink, hi: B.rust, a2: B.rust, a3: B.rust,
    text: B.ink, dim: mix(B.tan, B.ink, .4), dark: mix(B.tan, '#e6d3b0', .35), paper: '#e6d3b0', ink: B.ink, pacc: B.rust, spark: B.rust, chain: B.ink, duo: [B.ink, '#e6d3b0'] }),
  'rust-burnt': P({ id: 'rust-burnt', fam: 'rust', name: 'Burnt', bg: B.ink, bg2: mix(B.ink, B.rust, .35), main: B.tan, hi: '#e6d3b0', a2: B.rust, a3: '#e6d3b0',
    text: '#ecdcc0', dim: mix(B.ink, B.tan, .35), dark: mix(B.ink, '#000000', .3), paper: B.ink, ink: B.tan, pacc: mix(B.rust, B.tan, .4), spark: B.tan, chain: B.tan, duo: [mix(B.ink, '#000000', .3), '#e6d3b0'] }),
  amethyst: P({ id: 'amethyst', fam: 'amethyst', name: 'Amethyst', bg: B.am, bg2: '#2a1d38', main: B.lilac, hi: '#eadcf8', a2: B.mag, a3: B.ruby,
    text: '#efe6fa', dim: '#6b5785', dark: B.am, paper: '#e9e1f2', ink: B.am, pacc: B.mag, spark: B.gold, chain: B.lilac, gold: B.gold }),
  'amethyst-lilac': P({ id: 'amethyst-lilac', fam: 'amethyst', name: 'Lilac', light: true, bg: '#e2d6f0', bg2: mix('#eadcf8', B.lilac, .45), main: B.am, hi: mix(B.am, B.mag, .35), a2: B.mag, a3: B.ruby,
    text: B.am, dim: mix('#eadcf8', B.am, .35), dark: '#eadcf8', paper: '#eadcf8', ink: B.am, pacc: B.mag, spark: B.gold, chain: B.am, gold: B.gold, duo: [B.am, '#eadcf8'] }),
  'amethyst-ruby': P({ id: 'amethyst-ruby', fam: 'amethyst', name: 'Ruby Night', bg: mix(B.am, '#000000', .25), bg2: mix(B.am, B.ruby, .16), main: B.ruby, hi: mix(B.ruby, '#ffffff', .45), a2: B.gold, a3: B.mag,
    text: '#f6dfe3', dim: mix(B.am, B.ruby, .45), dark: mix(B.am, '#000000', .35), paper: B.am, ink: B.ruby, pacc: B.gold, spark: B.gold, chain: B.ruby, gold: B.gold, duo: [mix(B.am, '#000000', .35), mix(B.ruby, '#ffffff', .3)] }),
});
export const FAMILIES = Object.freeze({ charcoal: ['charcoal', 'charcoal-paper', 'charcoal-steel'], rust: ['rust', 'rust-sepia', 'rust-burnt'], amethyst: ['amethyst', 'amethyst-lilac', 'amethyst-ruby'] });
export const PALETTE_ORDER = ['charcoal', 'rust', 'amethyst'];
export const DEFAULT_CUSTOM = Object.freeze({ bg: B.char, main: B.chain, accent: B.gold });
const lum = h => { const n = parseInt(h.slice(1), 16); return (.2126 * ((n >> 16) & 255) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255)) / 255; };
const hexOk = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
const customCache = new Map();
/** Palette from the Custom pickers. Cached by colour triple so atlas/elephant tint caches stay stable. */
export function customPalette(c = DEFAULT_CUSTOM) {
  const bg = hexOk(c.bg) ? c.bg.toLowerCase() : DEFAULT_CUSTOM.bg, main = hexOk(c.main) ? c.main.toLowerCase() : DEFAULT_CUSTOM.main, acc = hexOk(c.accent) ? c.accent.toLowerCase() : DEFAULT_CUSTOM.accent;
  const key = bg + main + acc; if (customCache.has(key)) return customCache.get(key);
  const light = lum(bg) > .55, dk = light ? main : bg, lt = light ? bg : main, edge = light ? '#000000' : '#ffffff';
  const p = P({ id: 'custom-' + key.replace(/#/g, ''), fam: 'custom', name: 'Custom', light, bg, bg2: mix(bg, main, .08), main, hi: mix(main, edge, .35), a2: acc, a3: acc,
    text: mix(main, edge, .45), dim: mix(bg, main, .4), dark: light ? mix(bg, '#ffffff', .25) : mix(bg, '#000000', .3), paper: lt, ink: dk, pacc: acc, spark: acc, chain: main, gold: acc, duo: [dk, mix(lt, '#ffffff', .1)] });
  if (customCache.size > 16) customCache.clear(); customCache.set(key, p); return p;
}
/** The palette a project renders with: a family/variant id, or 'custom'. */
export function resolvePalette(project) { return project.pal === 'custom' ? customPalette(project.custom) : (PALETTES[project.pal] || PALETTES.charcoal); }
// accent that reads on the background (Rust's a2 is dark ink, so fall back to its light tan)
export const accentOn = p => (p.id === 'rust' ? p.hi : p.a2);
export const hotOn = p => (p.id === 'charcoal' ? '#ffffff' : p.id === 'rust' ? p.hi : p.a3);
/** Additive glow only works on dark backgrounds. */
export const glowOp = p => (p.light ? 'source-over' : 'lighter');
