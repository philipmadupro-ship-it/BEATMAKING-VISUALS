// Look tables of the v8 composition (u2c-motion film/v8/film.js): window layouts per look and aspect (world =
// the screen, the overview is zoom 1), windows that are already open at frame 0, the v8 focus plan, chrome names.
export const LOOKS = ['exe', 'lab', 'scope'];
export const LOOK_NAMES = { exe: 'EXE', lab: 'LAB', scope: 'SCOPE' };
export const LOOK_BLURB = { exe: 'liquid-glass plugin windows', lab: 'glass on faint graph paper', scope: 'glass rack · CRT screens' };
export const ASPECTS = { '916': { W: 1080, H: 1920, label: '9:16 · 1080×1920', platform: 'Reels / TikTok / Shorts' }, '169': { W: 1920, H: 1080, label: '16:9 · 1920×1080', platform: 'YouTube' } };
// v9: no clock.sys / bands.dat windows in any look; the freed space goes to the waveform (session), the logo and the
// bottom-row meters.
// v12: no EQ window in any look (the spectrum takes its place). exe is a FINAL table (EXE12, below); lab and scope are
// still v10-source rects mapped through airy(). The spectrum is the largest analyser, the imager and levels are bigger,
// the spectrogram is a long strip, the waveform is bigger. v10 EQ ids stay in WINDOW_IDS / CONTENT so old sheets load.
const V10_LAYOUT = {
  lab: { '916': { chains: [24, 86, 1032, 440], session: [24, 542, 520, 300], elephant: [560, 542, 496, 640], spectrum: [24, 858, 520, 324],
    loud: [24, 1198, 496, 416], stereo: [536, 1198, 520, 416], spectro: [24, 1630, 1032, 214] },
    '169': { chains: [24, 76, 760, 380], session: [24, 472, 760, 396], elephant: [800, 76, 360, 792], spectrum: [1176, 76, 720, 340],
    loud: [1592, 432, 304, 436], stereo: [1176, 432, 400, 436], spectro: [24, 884, 1872, 164] } },
  scope: { '916': { chains: [24, 86, 1032, 480], elephant: [24, 582, 380, 600], spectrum: [420, 582, 636, 290], loud: [420, 888, 636, 294],
    stereo: [24, 1198, 500, 380], surface: [540, 1198, 516, 380], spectro: [24, 1594, 1032, 250] },
    '169': { chains: [24, 76, 820, 330], elephant: [860, 76, 330, 736], spectrum: [1206, 76, 690, 350], loud: [1206, 442, 690, 370],
    stereo: [24, 422, 400, 390], surface: [440, 422, 404, 390], spectro: [24, 828, 1872, 220] } },
};
// exe (U2C.EXE) v12: final rects. Back layer = the meter windows (slightly smaller, dimmer glass); the hero (logo +
// pendant) is a front layer (HERO below) drawn by film.js, so it has no window of its own.
const EXE12 = {
  '916': { session: [32, 112, 1016, 366], loud: [32, 502, 290, 744], stereo: [748, 502, 300, 744], spectro: [32, 1270, 1016, 200], spectrum: [32, 1494, 1016, 316] },
  '169': { session: [44, 92, 1100, 262], spectro: [44, 378, 1100, 190], spectrum: [44, 592, 1100, 412], loud: [1172, 620, 340, 384], stereo: [1528, 620, 348, 384] },
};
/** Hero (front layer) geometry per aspect: logo centre (cx, cy), logo width, chain length, pendant width (px at scale 1). */
export const HERO = { '916': { cx: 530, cy: 672, logoW: 480, chain: 150, eleph: 340 }, '169': { cx: 1524, cy: 228, logoW: 360, chain: 85, eleph: 255 } };
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
export const LAYOUT = { exe: EXE12, ...Object.fromEntries(Object.entries(V10_LAYOUT).map(([look, A]) => [look, Object.fromEntries(Object.entries(A).map(([asp, R]) => [asp, airy(R, asp)]))])) };

/** Every window id any look uses, in a stable order. */
export const WINDOW_IDS = ['session', 'chains', 'elephant', 'spectrum', 'loud', 'stereo', 'spectro', 'surface', 'eq'];   // eq: legacy (v12 has no EQ window)
/** What a window shows (its content can be swapped per window in the cue sheet). */
export const CONTENT = { chains: 'logo', session: 'waveform', clock: 'clock', bands: 'bands', elephant: 'pendant', eq: 'eq', spectrum: 'spectrum', loud: 'loudness', stereo: 'stereo', spectro: 'spectrogram', surface: 'surface' };
export const CONTENT_KINDS = ['logo', 'waveform', 'clock', 'bands', 'pendant', 'eq', 'spectrum', 'loudness', 'stereo', 'spectrogram', 'surface', 'levels', 'ghost'];
export const WINDOW_LABELS = { chains: 'Logo (chains.dll)', session: 'Waveform (session.exe)', clock: 'Clock', bands: 'Bands', elephant: 'Pendant (elephant.sys)', eq: 'EQ', spectrum: 'Spectrum', loud: 'Loudness', stereo: 'Imager', spectro: 'Spectrogram', surface: 'Surface 3D' };
/** Windows that are already open at frame 0 (the rest step in on the half beats of the build bar). */
export const FIRST_OPEN = { exe: ['session', 'loud', 'stereo'], lab: ['chains', 'session', 'elephant'], scope: ['chains', 'elephant', 'loud'] };
/** v8 focus plan (clip bar, window, hold bars). */
export const FOCUS_PLAN = { exe: [[3, 'session', 2], [7, 'spectrum', 2], [11, 'stereo', 2], [15, 'loud', 1]], lab: [[3, 'elephant', 2], [7, 'spectrum', 2], [11, 'chains', 1]], scope: [[3, 'spectrum', 2], [7, 'elephant', 2], [11, 'chains', 2]] };
/** v12: the window a section's push goes to (drop / build / break), per look; falls back to the plan rotation when the look lacks it. */
export const SECTION_PUSH = { exe: { drop: 'spectrum', build: 'session', break: 'stereo' }, lab: { drop: 'chains', build: 'spectrum', break: 'elephant' }, scope: { drop: 'chains', build: 'spectrum', break: 'elephant' } };
/** Default open beat of a window in a look (-2 = already open at frame 0). */
export function openBeat(look, aspect, id) {
  const ids = Object.keys(LAYOUT[look][aspect]), first = FIRST_OPEN[look];
  if (first.includes(id)) return -2; const rest = ids.filter((x) => !first.includes(x)), i = rest.indexOf(id); return i < 0 ? -2 : 0.5 + i * 0.5;
}
