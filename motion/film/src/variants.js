/* Layouts (world rects per aspect) and the three storyboard variants: palettes, window choreography,
 * logo dissolve/rebuild events, camera keys (in bars), overlays. Times are clip seconds. */
(function () {
  'use strict';
  const { BAR, BEAT, D } = window.U2C;
  const B = (n) => (n - 1) * BAR;                       // start of bar n (1-based) in the 15 s clip
  const K = D.onsets.kick.map((o) => o[0]);              // detected kicks
  const kickAfter = (t, n = 0) => K.filter((k) => k >= t - 0.02)[n];

  const LAYOUTS = {
    'desktop-916': { W: 1080, H: 1920, win: {
      session: [40, 76, 1000, 380], chains: [40, 486, 1000, 430],
      eq: [40, 946, 488, 290], spectrum: [40, 1266, 488, 290], elephant: [558, 946, 482, 610],
      meter: [40, 1586, 320, 290], phase: [380, 1586, 320, 290], surface: [720, 1586, 320, 290] },
      cables: [['session', 'b', 'chains', 't', 'kick'], ['chains', 'b', 'eq', 't', 'snare'], ['chains', 'b', 'elephant', 't', 'kick'],
        ['eq', 'b', 'spectrum', 't', 'hat'], ['spectrum', 'b', 'meter', 't', 'kick'], ['elephant', 'b', 'surface', 't', 'snare'],
        ['meter', 'r', 'phase', 'l', 'hat'], ['phase', 'r', 'surface', 'l', 'kick']] },
    'desktop-169': { W: 1920, H: 1080, win: {
      session: [32, 64, 920, 300], chains: [32, 390, 920, 360], eq: [32, 776, 450, 272], spectrum: [502, 776, 450, 272],
      elephant: [978, 64, 450, 686], meter: [1452, 64, 436, 380], phase: [1452, 470, 436, 280], surface: [978, 776, 910, 272] },
      cables: [['session', 'b', 'chains', 't', 'kick'], ['session', 'r', 'elephant', 'l', 'kick'], ['chains', 'b', 'eq', 't', 'snare'],
        ['chains', 'b', 'spectrum', 't', 'hat'], ['elephant', 'r', 'meter', 'l', 'kick'], ['meter', 'b', 'phase', 't', 'hat'],
        ['elephant', 'b', 'surface', 't', 'snare'], ['spectrum', 'r', 'surface', 'l', 'kick']] },
    'deck-916': { W: 1080, H: 1920, win: {
      surface: [40, 76, 1000, 640], chains: [40, 736, 1000, 330], spectrum: [40, 1086, 488, 280], spectro: [552, 1086, 488, 280],
      phase: [40, 1386, 320, 300], meter: [380, 1386, 320, 300], eq: [720, 1386, 320, 300], session: [40, 1706, 1000, 180] },
      pendant: [650, 44, 360, 620],
      cables: [['surface', 'b', 'chains', 't', 'kick'], ['chains', 'b', 'spectrum', 't', 'snare'], ['chains', 'b', 'spectro', 't', 'hat'],
        ['spectrum', 'b', 'phase', 't', 'kick'], ['spectro', 'b', 'eq', 't', 'snare'], ['phase', 'r', 'meter', 'l', 'hat'],
        ['meter', 'r', 'eq', 'l', 'kick'], ['meter', 'b', 'session', 't', 'kick']] },
    'deck-169': { W: 1920, H: 1080, win: {
      surface: [32, 60, 1120, 640], chains: [1172, 60, 716, 400], spectrum: [1172, 480, 348, 300], spectro: [1540, 480, 348, 300],
      phase: [32, 720, 360, 330], meter: [412, 720, 360, 330], eq: [792, 720, 360, 330], session: [1172, 800, 716, 250] },
      pendant: [740, 30, 380, 640],
      cables: [['surface', 'r', 'chains', 'l', 'kick'], ['chains', 'b', 'spectrum', 't', 'snare'], ['chains', 'b', 'spectro', 't', 'hat'],
        ['surface', 'b', 'meter', 't', 'kick'], ['phase', 'r', 'meter', 'l', 'hat'], ['meter', 'r', 'eq', 'l', 'snare'], ['spectrum', 'b', 'session', 't', 'kick']] },
  };

  const TITLES = { session: ['session.exe', 'pendant.wav'], chains: ['chains.dll', 'U2C'], eq: ['eq.vst', 'dB'], spectrum: ['spectrum.vst', 'dBFS'],
    spectro: ['spectro.vst', 'Hz'], elephant: ['elephant.sys', 'swing'], meter: ['meter.exe', 'LUFS'], phase: ['phase.scope', 'M/S'], surface: ['surface.gl', '3D'] };

  // logo choreography: rebuild U → 2 → C on the drop's first three kicks; dissolve letter by letter in the break; rebuild on re-drop
  const DROP = B(2), BREAK = B(6), REDROP = B(7), END = B(8) + 2 * BEAT; // end card lands on the bar-8 snare
  const rebuildOnKicks = (t) => [0, 1, 2].map((k) => [kickAfter(t, k), k, 'rebuild', 0.42]);
  const dissolveSeq = (t) => [0, 1, 2].map((k) => [t + k * BEAT, k, 'dissolve', 0.7]);

  // camera key: {t, d (0 = hard cut), ease, win | union, pad, z (multiplier), dx, dy (world px)}
  const VARIANTS = {
    A: {
      name: 'BOOT.SEQ', theme: 'charcoal', layout: 'desktop', blurb: 'OS boots, logo rebuilds on the drop, push in on the elephant, full-desktop finale.',
      open: (id) => ({ chains: -1, session: DROP, eq: DROP + BEAT, spectrum: DROP + 2 * BEAT, elephant: DROP + 3 * BEAT, meter: B(3),
        phase: B(3) + BEAT, surface: B(3) + 2 * BEAT })[id],
      logo: [...rebuildOnKicks(DROP), ...dissolveSeq(BREAK), ...rebuildOnKicks(REDROP)],
      cam: [
        { t: 0, d: 0, win: 'chains', pad: 10, z: 1.22 }, { t: 0, d: DROP, ease: 'sine.inOut', win: 'chains', pad: 10, z: 1.32 },
        { t: DROP, d: 0, union: ['session', 'chains'], pad: 24 }, { t: DROP, d: B(4) - DROP, ease: 'sine.inOut', union: ['session', 'chains'], pad: 24, z: 1.04 },
        { t: B(4), d: 1.1, ease: 'power2.inOut', win: 'elephant', pad: 40 }, { t: B(4) + 1.1, d: BREAK - B(4) - 1.1, ease: 'sine.inOut', win: 'elephant', pad: 40, z: 1.32, dy: 40 },
        { t: BREAK, d: 0, win: 'chains', pad: 16, z: 1.06 }, { t: BREAK, d: BAR, ease: 'sine.inOut', win: 'chains', pad: 16, z: 0.98 },
        { t: REDROP, d: 0, all: true, pad: 0 }, { t: REDROP, d: 15 - REDROP, ease: 'sine.inOut', all: true, pad: 0, z: 1.05 } ],
      overlays: { boot: [0, DROP], end: [END, 15] },
      dim: (id, t) => 0,
    },
    B: {
      name: 'SIGNAL.PATH', theme: 'rust', layout: 'desktop', blurb: 'Camera rides the signal dot along the cables, window to window; pull back to the whole graph.',
      open: () => -1,
      active: { session: -1, eq: DROP, spectrum: B(3), meter: B(4), phase: B(4) + BEAT, surface: B(4) + 2 * BEAT, elephant: BREAK, chains: REDROP },
      hops: [['session', '01 SOURCE'], ['eq', '02 SHAPE'], ['spectrum', '03 ANALYSE'], ['meter', '04 MEASURE'], ['elephant', '05 PENDANT'], ['chains', '06 SIGN']],
      logo: [[-1, 0, 'rebuild', 0.01], [-1, 1, 'rebuild', 0.01], [-1, 2, 'rebuild', 0.01], ...dissolveSeq(BREAK), ...rebuildOnKicks(REDROP)],
      cam: [
        { t: 0, d: 0, win: 'session', pad: 0, z: 1.75, dx: -250 }, { t: 0, d: DROP, ease: 'sine.inOut', win: 'session', pad: 0, z: 1.9, dx: -220 },
        { t: DROP, d: 0, win: 'eq', pad: 24, dx: -40 }, { t: DROP + 0.6, d: B(3) - DROP - 0.6, ease: 'sine.inOut', win: 'eq', pad: 24, z: 1.08 },
        { t: B(3) - 0.75, d: 0.75, ease: 'power2.inOut', win: 'spectrum', pad: 24 },
        { t: B(4) - 0.75, d: 0.75, ease: 'power2.inOut', win: 'meter', pad: 30, z: 1.0 },
        { t: B(4), d: BREAK - B(4) - 0.85, ease: 'sine.inOut', win: 'surface', pad: 30, z: 1.0 },
        { t: BREAK - 0.85, d: 0.85, ease: 'power2.inOut', win: 'elephant', pad: 40 }, { t: BREAK, d: BAR, ease: 'sine.inOut', win: 'elephant', pad: 40, z: 1.38, dy: 50 },
        { t: REDROP, d: 0, win: 'chains', pad: 20 }, { t: REDROP + BAR * 0.5, d: BAR * 1.1, ease: 'power2.inOut', all: true, pad: 0, z: 0.98 },
        { t: REDROP + BAR * 1.6, d: 15 - REDROP - BAR * 1.6, ease: 'sine.inOut', all: true, pad: 0, z: 1.02 } ],
      overlays: { end: [END, 15] },
    },
    C: {
      name: 'AURORA.DECK', theme: 'amethyst', layout: 'deck', blurb: 'Meter deck with a folded-light 3D spectral surface as hero; pendant hangs over it.',
      open: () => -1,
      logo: [...rebuildOnKicks(DROP), ...dissolveSeq(BREAK), ...rebuildOnKicks(REDROP)],
      cam: [
        { t: 0, d: 0, win: 'surface', pad: 0, z: 1.3, dy: 40 }, { t: 0, d: DROP, ease: 'sine.inOut', win: 'surface', pad: 0, z: 1.4, dy: 40 },
        { t: DROP, d: 0, union: ['surface', 'chains'], pad: 20 }, { t: DROP, d: B(4) - DROP, ease: 'sine.inOut', union: ['surface', 'chains'], pad: 20, z: 1.05 },
        { t: B(4), d: 1.0, ease: 'power2.inOut', union: ['spectrum', 'spectro'], pad: 24 },
        { t: B(5), d: 1.0, ease: 'power2.inOut', union: ['phase', 'meter', 'eq'], pad: 24 },
        { t: BREAK, d: 0, win: 'pendant', pad: 30, z: 1.0 }, { t: BREAK, d: BAR, ease: 'sine.inOut', win: 'pendant', pad: 30, z: 1.25, dy: 60 },
        { t: REDROP, d: 0, all: true, pad: 0 }, { t: REDROP, d: 15 - REDROP, ease: 'sine.inOut', all: true, pad: 0, z: 1.05 } ],
      overlays: { end: [END, 15] },
    },
  };

  // representative still per storyboard scene (scene list mirrors STORYBOARDS.md)
  const SCENES = {
    A: [['Boot · ghost logo', 0.9], ['Drop · U-2-C rebuild', DROP + 0.9], ['Push in on the elephant', B(5) + 0.6], ['Break · letters dissolve', BREAK + 1.2], ['Re-drop · full desktop', REDROP + 0.9], ['End card', 14.3]],
    B: [['Source · playhead macro', 1.0], ['Signal to EQ', DROP + 1.2], ['Analyse · spectrum', B(3) + 0.9], ['Measure · meter row', B(4) + 1.6], ['Pendant push-in', BREAK + 1.2], ['Pull back · graph', REDROP + 2.4], ['End card', 14.3]],
    C: [['Surface macro', 1.0], ['Drop · surface erupts', DROP + 1.3], ['Spectrum + spectrogram', B(4) + 1.2], ['Scope · meters · EQ', B(5) + 1.3], ['Break · pendant', BREAK + 1.1], ['Full deck', REDROP + 1.2], ['End card', 14.3]],
  };

  window.U2C.V = { LAYOUTS, VARIANTS, TITLES, SCENES, B, DROP, BREAK, REDROP, END };
})();
