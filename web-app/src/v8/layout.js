// Look tables of the v8 composition (u2c-motion film/v8/film.js): window layouts per look and aspect (world =
// the screen, the overview is zoom 1), windows that are already open at frame 0, the v8 focus plan, chrome names.
export const LOOKS = ['exe', 'lab', 'scope', 'player'];
export const LOOK_NAMES = { exe: 'EXE', lab: 'LAB', scope: 'SCOPE', player: 'PLAYER' };
export const LOOK_BLURB = { exe: 'liquid-glass plugin windows', lab: 'glass on faint graph paper', scope: 'glass rack · CRT screens', player: 'desktop beat player' };
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
  // v13: the middle compartment ('stage': cover card + centred logo + 16-step grid) sits between LEVELS and IMAGER (9:16) /
  // above them in the right column (16:9). The imager carries the static pendant mark where BAND WIDTH used to be.
  '916': { session: [32, 112, 1016, 366], stage: [334, 502, 412, 744], loud: [32, 502, 272, 744], stereo: [776, 502, 272, 744], spectro: [32, 1270, 1016, 200], spectrum: [32, 1494, 1016, 316] },
  '169': { session: [44, 92, 1100, 262], spectro: [44, 378, 1100, 190], spectrum: [44, 592, 1100, 412], stage: [1172, 92, 704, 306], loud: [1172, 420, 300, 584], stereo: [1496, 420, 380, 584] },
};
// v14 player look (U2C.PLAYER): final rects. 16:9 has a sidebar (SIDEBAR) and the top bar band (TOPBAR); 9:16 drops the sidebar, condenses the top bar and
// turns the now-playing card into a strip under it. Window ids: session (waveform), loud (levels), stage (hero: logo + static pendant mark + caption),
// stereo (imager), spectro, spectrum, now (now-playing), inserts (4 live tiles), meta (metadata).
const PLAYER = {
  // 16:9 (YouTube): time stack on top (waveform + spectrogram share the time axis), a taller hero row (levels | hero | imager), the spectrum
  // across the bottom; right column = now playing, inserts, metadata. 16 px gutters, every edge on the same 4 px grid.
  '169': { session: [268, 108, 1192, 200], spectro: [268, 320, 1192, 124], loud: [268, 456, 252, 340], stage: [532, 456, 568, 340], stereo: [1112, 456, 348, 340],
    spectrum: [268, 808, 1192, 248], now: [1476, 108, 420, 416], inserts: [1476, 540, 420, 186], meta: [1476, 742, 420, 314] },
  // 9:16 (TikTok / Reels): built on the platform safe zones (1080x1920): y < 200 = app header, y > 1548 = caption + sound, x > 960 = button rail
  // from y ~1000. Everything that must read sits in y 208..1544; the rows under the rail stop at x 960. The spectrogram + inserts live
  // under the caption (texture there, full reading on the camera pushes). Tabs-only top bar; the now-playing strip carries title + cover.
  '916': { now: [48, 272, 984, 104], session: [48, 388, 984, 280], stage: [48, 680, 984, 260], spectrum: [48, 952, 912, 300],
    loud: [48, 1264, 368, 280], stereo: [428, 1264, 532, 280], spectro: [48, 1560, 984, 150], inserts: [48, 1722, 984, 170] },
};
export const SIDEBAR = { '169': [24, 20, 220, 1036], '916': null };
export const TOPBAR = { '169': [268, 20, 1628, 76], '916': [48, 208, 984, 52] };
/** Hero = the U2C logo only (front layer, centred on its bbox in the stage card): width in px at scale 1. The centre is the stage rect's centre. */
export const HERO = { '916': { logoW: 384 }, '169': { logoW: 300 } };
/** v13 match-cut API: the cover card rect (world px, exe look) the cover-0 image fills (object-fit: cover, corner radius 22). */
export const COVER_RECT = { '916': EXE12['916'].stage, '169': EXE12['169'].stage };
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
export const LAYOUT = { exe: EXE12, player: PLAYER, ...Object.fromEntries(Object.entries(V10_LAYOUT).map(([look, A]) => [look, Object.fromEntries(Object.entries(A).map(([asp, R]) => [asp, airy(R, asp)]))])) };

/** Every window id any look uses, in a stable order. */
export const WINDOW_IDS = ['session', 'chains', 'elephant', 'spectrum', 'loud', 'stereo', 'spectro', 'surface', 'eq', 'stage', 'now', 'inserts', 'meta'];   // eq: legacy (v12 has no EQ window)
/** What a window shows (its content can be swapped per window in the cue sheet). */
export const CONTENT = { chains: 'logo', session: 'waveform', clock: 'clock', bands: 'bands', elephant: 'pendant', eq: 'eq', spectrum: 'spectrum', loud: 'loudness', stereo: 'stereo', spectro: 'spectrogram', surface: 'surface', stage: 'cover', now: 'now', inserts: 'inserts', meta: 'meta' };
export const CONTENT_KINDS = ['logo', 'waveform', 'clock', 'bands', 'pendant', 'eq', 'spectrum', 'loudness', 'stereo', 'spectrogram', 'surface', 'levels', 'ghost', 'cover', 'hero', 'now', 'inserts', 'meta'];
export const WINDOW_LABELS = { chains: 'Logo (chains.dll)', session: 'Waveform (session.exe)', clock: 'Clock', bands: 'Bands', elephant: 'Pendant (elephant.sys)', eq: 'EQ', spectrum: 'Spectrum', loud: 'Loudness', stereo: 'Imager', spectro: 'Spectrogram', surface: 'Surface 3D', stage: 'Cover + logo (stage)', now: 'Now playing', inserts: 'Inserts', meta: 'Metadata' };
/** Windows that are already open at frame 0 (the rest step in on the half beats of the build bar). */
export const FIRST_OPEN = { exe: ['session', 'stage', 'loud', 'stereo'], lab: ['chains', 'session', 'elephant'], scope: ['chains', 'elephant', 'loud'], player: ['session', 'loud', 'stage', 'stereo', 'spectro', 'spectrum', 'now', 'inserts', 'meta'] };
/** v8 focus plan (clip bar, window, hold bars). */
export const FOCUS_PLAN = { exe: [[3, 'session', 2], [7, 'spectrum', 2], [11, 'stereo', 2], [15, 'loud', 1]], lab: [[3, 'elephant', 2], [7, 'spectrum', 2], [11, 'chains', 1]], scope: [[3, 'spectrum', 2], [7, 'elephant', 2], [11, 'chains', 2]],
  // v14 player: pushes are motivated by the UI: the top tab switches on the beat (PLAYER > ANALYSIS > MIX > MASTER) and the camera goes to its panel
  player: [[3, 'spectrum', 2], [7, 'stereo', 2], [11, 'session', 2], [15, 'loud', 1]] };
/** v12: the window a section's push goes to (drop / build / break), per look; falls back to the plan rotation when the look lacks it. */
export const SECTION_PUSH = { exe: { drop: 'spectrum', build: 'session', break: 'stereo' }, lab: { drop: 'chains', build: 'spectrum', break: 'elephant' }, scope: { drop: 'chains', build: 'spectrum', break: 'elephant' }, player: { drop: 'spectrum', build: 'session', break: 'stereo' } };
/** Default open beat of a window in a look (-2 = already open at frame 0). */
export function openBeat(look, aspect, id) {
  const ids = Object.keys(LAYOUT[look][aspect]), first = FIRST_OPEN[look];
  if (first.includes(id)) return -2; const rest = ids.filter((x) => !first.includes(x)), i = rest.indexOf(id); return i < 0 ? -2 : 0.5 + i * 0.5;
}
