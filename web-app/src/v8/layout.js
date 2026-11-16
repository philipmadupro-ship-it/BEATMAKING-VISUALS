// Look tables of the v8 composition (u2c-motion film/v8/film.js): window layouts per look and aspect (world =
// the screen, the overview is zoom 1), windows that are already open at frame 0, the v8 focus plan, chrome names.
export const LOOKS = ['exe', 'lab', 'scope'];
export const LOOK_NAMES = { exe: 'EXE', lab: 'LAB', scope: 'SCOPE' };
export const LOOK_BLURB = { exe: 'liquid-glass plugin windows', lab: 'glass on faint graph paper', scope: 'glass rack · CRT screens' };
export const ASPECTS = { '916': { W: 1080, H: 1920, label: '9:16 · 1080×1920', platform: 'Reels / TikTok / Shorts' }, '169': { W: 1920, H: 1080, label: '16:9 · 1920×1080', platform: 'YouTube' } };
// v9: no clock.sys / bands.dat windows in any look; the freed space goes to the waveform (session), the logo and the
// bottom-row meters.
const V10_LAYOUT = {
  exe: { '916': { session: [24, 86, 1032, 400], chains: [24, 502, 1032, 400], elephant: [24, 918, 520, 620], eq: [560, 918, 496, 302], spectrum: [560, 1236, 496, 302],
    loud: [24, 1554, 340, 290], stereo: [380, 1554, 330, 290], spectro: [726, 1554, 330, 290] },
    '169': { session: [24, 76, 900, 330], chains: [24, 422, 900, 390], elephant: [940, 76, 480, 736], eq: [1436, 76, 460, 300], spectrum: [1436, 392, 460, 420],
    loud: [24, 828, 460, 220], stereo: [500, 828, 420, 220], spectro: [936, 828, 960, 220] } },
  lab: { '916': { chains: [24, 86, 1032, 500], session: [24, 602, 544, 300], elephant: [584, 602, 472, 640], spectrum: [24, 918, 544, 324],
    eq: [24, 1258, 544, 300], loud: [584, 1258, 472, 300], stereo: [24, 1574, 500, 270], spectro: [540, 1574, 516, 270] },
    '169': { chains: [24, 76, 900, 440], session: [24, 532, 900, 260], elephant: [940, 76, 480, 716], spectrum: [1436, 76, 460, 340], eq: [1436, 432, 460, 360],
    loud: [24, 808, 420, 240], stereo: [460, 808, 360, 240], spectro: [836, 808, 1060, 240] } },
  scope: { '916': { chains: [24, 86, 1032, 760], elephant: [24, 862, 470, 660], eq: [510, 862, 546, 322], spectrum: [510, 1200, 546, 322],
    loud: [24, 1538, 340, 306], stereo: [380, 1538, 330, 306], surface: [726, 1538, 330, 306] },
    '169': { chains: [24, 76, 1000, 640], elephant: [1040, 76, 400, 640], eq: [1456, 76, 440, 312], spectrum: [1456, 404, 440, 312],
    loud: [24, 732, 420, 316], stereo: [460, 732, 380, 316], surface: [856, 732, 584, 316], spectro: [1456, 732, 440, 316] } },
};
// v11 shell: more air. The v10 tables are mapped from their frame (x 24..W-24, y 86|76..bottom) into a frame with wider
// margins and a clear band for the HUD at the top and bottom, then every window is inset so neighbours sit ~30 px apart
// (the glass shadows need the gap). FRAME[aspect] = [x0, y0, x1, y1] of the window area; HUD_BAND = its top/bottom bands.
export const FRAME = { '916': [44, 116, 1036, 1812], '169': [44, 92, 1876, 1004] };
export const HUD_BAND = { '916': [0, 104, 1824, 1920], '169': [0, 82, 1012, 1080] };
const SRC_FRAME = { '916': [24, 86, 1056, 1844], '169': [24, 76, 1896, 1048] };
const GAP = 8;   // inset per side (+ the scaled 16 px v10 gutter = ~31 px between windows)
function airy(rects, aspect) {
  const [a0, b0, a1, b1] = SRC_FRAME[aspect], [x0, y0, x1, y1] = FRAME[aspect], sx = (x1 - x0) / (a1 - a0), sy = (y1 - y0) / (b1 - b0), out = {};
  for (const [id, [x, y, w, h]] of Object.entries(rects)) {
    const X = x0 + (x - a0) * sx, Y = y0 + (y - b0) * sy, W = w * sx, H = h * sy;
    out[id] = [Math.round(X + GAP), Math.round(Y + GAP), Math.round(W - 2 * GAP), Math.round(H - 2 * GAP)];
  }
  return out;
}
export const LAYOUT = Object.fromEntries(Object.entries(V10_LAYOUT).map(([look, A]) => [look, Object.fromEntries(Object.entries(A).map(([asp, R]) => [asp, airy(R, asp)]))]));

/** Every window id any look uses, in a stable order. */
export const WINDOW_IDS = ['chains', 'session', 'elephant', 'eq', 'spectrum', 'loud', 'stereo', 'spectro', 'surface'];
/** What a window shows (its content can be swapped per window in the cue sheet). */
export const CONTENT = { chains: 'logo', session: 'waveform', clock: 'clock', bands: 'bands', elephant: 'pendant', eq: 'eq', spectrum: 'spectrum', loud: 'loudness', stereo: 'stereo', spectro: 'spectrogram', surface: 'surface' };
export const CONTENT_KINDS = ['logo', 'waveform', 'clock', 'bands', 'pendant', 'eq', 'spectrum', 'loudness', 'stereo', 'spectrogram', 'surface', 'levels', 'ghost'];
export const WINDOW_LABELS = { chains: 'Logo (chains.dll)', session: 'Waveform (session.exe)', clock: 'Clock', bands: 'Bands', elephant: 'Pendant (elephant.sys)', eq: 'EQ', spectrum: 'Spectrum', loud: 'Loudness', stereo: 'Stereo', spectro: 'Spectrogram', surface: 'Surface 3D' };
/** Windows that are already open at frame 0 (the rest step in on the half beats of the build bar). */
export const FIRST_OPEN = { exe: ['chains', 'session', 'elephant'], lab: ['chains', 'session', 'elephant'], scope: ['chains', 'elephant', 'loud'] };
/** v8 focus plan (clip bar, window, hold bars). */
export const FOCUS_PLAN = { exe: [[3, 'chains', 2], [7, 'eq', 2], [11, 'elephant', 2]], lab: [[3, 'elephant', 2], [7, 'spectrum', 2], [11, 'chains', 1]], scope: [[3, 'eq', 2], [7, 'elephant', 2], [11, 'chains', 2]] };
/** Default open beat of a window in a look (-2 = already open at frame 0). */
export function openBeat(look, aspect, id) {
  const ids = Object.keys(LAYOUT[look][aspect]), first = FIRST_OPEN[look];
  if (first.includes(id)) return -2; const rest = ids.filter((x) => !first.includes(x)), i = rest.indexOf(id); return i < 0 ? -2 : 0.5 + i * 0.5;
}
