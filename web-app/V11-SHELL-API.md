# v11 shell API (window chrome, layout, type, palette)

For the meter, EQ, waveform, chain and intro code. Source: `src/v8/core.js` (helpers `L`), `src/v8/layout.js`, `src/v8/film.js` (chrome).

## Content rect
Every window body is drawn by `BODY[kind](cr, t, k, S)` where `cr = [x, y, w, h]` is the **content rect**: the window rect inset by 20 px
(left/right/bottom) and 46 px at the top for the hairline label (20 px for `logo` and `pendant`, which carry no label). Scope look: the
recessed CRT screen inside the glass, inset a further 10 px. Draw only inside `cr`; `L.contentRect` / `L.winRect` (the full window) are
set before each body. Window rects: `LAYOUT[look][aspect][id]` (`layout.js`, already inset so neighbours sit ~30 px apart; the camera
framing uses them). `FRAME[aspect]` is the window area, `HUD_BAND[aspect]` the top/bottom bands the HUD lives in (nothing else goes there).

## Glass helpers (on L)
- `L.snap(ctx, slot, blurPx)`: copy the canvas as it is now into a blurred 1/8-size backdrop (slots `ground`, `frame`, `halo`). The film snaps `ground` right after the ground, so every window blurs the ground behind it.
- `L.glass(ctx, x, y, w, h, S, {r=22, backdrop='ground', tint=0.38, active, shadow=1, edge=1})`: liquid-glass window (shadow, backdrop blur, card tint, top light, inner highlight, hairline edge, optional accent rim). Returns its Path2D. Use it for the intro player and carousel cards too.
- `L.panel(ctx, x, y, w, h, S, {r=12, fill=1})`: flat glass sub-panel for readout cells.
- `L.rr(x, y, w, h, r)`: rounded-rect Path2D. `L.halation(ctx, amt)`: screened blur of the frame (film applies it on dark stages, cue `fx.halation`).
- `L.isLight(S)` (Albedo paper), `L.accent(S)` (= `S.hot`, the one accent).
Glass cues: `glass.radius`, `glass.tint`, `ground.pool`, `fx.halation`, `bracket.on` (accent rim on the hero window), `hud.on`, `result.on`, `result.at`.

## Type tokens (core.js)
`FONT = {display, ui, mono}` (canvas family lists), also on `L` as `DISPLAY`, `UI`, `MONO`. `text(ctx, str, x, y, {fam, w, size, ...})` takes `fam`.
- display: **Akira Expanded** (fallback Unbounded 800): title, end card, HUD title.
- ui: **Synkopy** (the user's "Sknopy"; fallback Space Grotesk): window labels, credit.
- mono: JetBrains Mono: every number (Hz, dB, LUFS, BPM, bar.beat).
Slots: `assets/fonts/fonts.css`. Drop `AkiraExpanded.otf|woff2` and `Synkopy.otf|woff2` into `assets/fonts/`; nothing else changes. Both are gitignored (public repo) and never committed. `loadFonts()` waits for every face (web `main.js`, native `boot.mjs`); `liveFonts()` says which voice is live. The native sync copies `assets/fonts/*` to `film/assets/fonts/`.

## Palette
Unchanged stage palettes (`stageOf`): Nigredo pure greys, Albedo beige, Citrinitas brown, Rubedo vibrant purple; one accent `S.hot`. Ground light pools use `S.ink`, so Nigredo stays grey.

## On-screen text
Only the title, credit and real readouts remain (`tags.js`: `hud.*`, `result.*`, window labels). Removed: boot terminal, handwritten notes, stamps, specimen tags, wires, tape, attention bracket, big words, CTA line. Window labels are plain names (`windows.*` tags).

## v13 stage (middle compartment) API, for the intro match-cut
- `layout.js COVER_RECT[aspect]` = `[x, y, w, h]` (world px, exe look): 9:16 `[334, 502, 412, 744]`, 16:9 `[1172, 92, 704, 306]`. The cover-0 image fills it **object-fit: cover** (square cover, scaled to `max(w, h)`, centred), clipped to a rounded rect, radius `glass.radius` (22). Overridable per cue sheet via `win.stage.x/y/w/h`.
- At runtime `L.coverRect` / `L.coverRadius` (film core `L`) hold the live rect (set each frame the stage card draws). The card is a normal glass window (`stage`, content kind `cover`), open at frame 0 of the lab (`FIRST_OPEN.exe`), so it is already there on the cut frame; the camera-shot id `stage` also works for pushes.
- The cover is `INTRO.coverCanvas(0, S)` (greys in Nigredo) with a 0.5 scrim, a bottom gradient and the step grid, so the match-cut should end on the same image slightly darker; cover kick pulse scale = 1 + 0.012 I (I = the logo-glow envelope).
- Logo: centred on its bbox at the card centre (`BR.logo(..., {at: {cx, cy, w}})`, `BR.logoBBox()`); `HERO[aspect].logoW` = 384 / 300.
- Static pendant mark: `L.pendantMark(ctx, S, cx, cy, d)` (exe only), drawn by the imager as a bare static mark (no ring, no frame; v13 correction 2) at `L.portholeRect = [cx, cy, R]`; no chain, no swing.

## v14 panels (levels / imager "player" variant, inserts)
Draw into the rects below at 1:1 world px. Every string goes through `text()`; Nigredo stays pure grey (stage palette only). All data is real.
- **Levels**: `M.levels(ctx, S, [x, y, w, h], t, k, { variant: 'player' })` (`opt.noReveal` as before). Target 16:9 about 330x360, 9:16 about 300x420. Tall segmented L / R bars with a signed dB scale (0 .. -60), a slim GR bar (hidden under 250 px wide), peak ticks, peak LED, the exponential kick glow, and four boxes PEAK / RMS / LUFS / DR (tick on the half beat). `levelview.playerStats(lv, t, win = 1.5)` = {peak, rms, dr}: PEAK = max sample peak, RMS = mean square of both channels, DR = PEAK - RMS (short-window PLR); LUFS = short-term `F.S`.
- **Imager**: `M.imager(ctx, S, [x, y, w, h], t, k, { variant: 'player' })`. Target 16:9 about 280x360, 9:16 about 300x420. Half-disc polar sample on top, then WIDTH (real S/M width, shown 0..200 %), CORR, BAL as slider rows with a value, then the 4 band widths (`D.ms.bandWidth`, splits 120 Hz / 1.2 kHz / 6 kHz) with their labels. Spare height is spread between the rows; no elephant mark in this variant.
- **Inserts**: `import { draw } from './inserts.js'; draw(ctx, [x, y, w, h], frame, { L, S })` where `frame = t * fps` (fractional) and `L` is the film core. One call draws all four glass tiles (4 equal tiles, gap about 1.8 % of w): 450x90 (16:9) / 1000x140 (9:16). Labels SPEC / GR / WIDTH / 3D (Synkopy). Tiles: gradient spectrum (`spectrumview.traceData`), GR history (4 beats, notch flashes on the kick), corr + width trace (auto-ranged, 2 beats), 3D wireframe surface from spectrum history inside a cube outline. `cubeStep(t, beat)` turns one 90 degree step per beat, held then eased over the last 45 % of the beat so it lands exactly on the beat. `L.panel` is used for the tile glass.
- Stills: `node tools/player-stills.mjs [stages] [audio]` (env `KICK`, `DPR`) -> `shots/player/panels_<stage>_<kick|between>.png`.
