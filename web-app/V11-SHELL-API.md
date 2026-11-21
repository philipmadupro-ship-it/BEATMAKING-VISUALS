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

## v14 player look (shell API)
- Look `player` (`layout.js`): `LAYOUT.player[aspect]` rects (16:9 and 9:16), `SIDEBAR[aspect]` (null in 9:16), `TOPBAR[aspect]`. Window ids: `session`, `loud`, `stage` (kind `hero`), `stereo`, `spectro`, `spectrum`, `now`, `inserts`, `meta`. Drawing helpers live in `src/v8/player.js` (`createPlayer(L, {tag, V})`: sidebar, topbar, now, meta, barcode, heroCaption, icon); the composition is in `film.js` (`playerShell`, `playerHero`, `playerNow`, `playerInserts`).
- **Panels API (for the panels agent)**: the shell calls, with the usual content rect `cr = [x, y, w, h]`:
  - `M.loud(ctx, S, cr, t, k)` (window `loud`, cr 300x~320 in 16:9, 250x~350 in 9:16) and `M.stereo(ctx, S, cr, t, k)` (window `stereo`): the levels / imager variants. `L.look === 'player'` (set every frame) tells them to draw the 4-box / WIDTH-CORR-BAL-band% variant; other looks unchanged.
  - **`M.inserts(ctx, S, cr, t, k)`**: the 4 live tiles (mini spectrum, GR history, width/corr trace, cube that steps once per beat), drawn inside `cr` (16:9 about 380x72, 9:16 about 976x120). Until `M.inserts` exists the shell draws 4 empty glass tiles (`L.panel`). Put it in `meters.js` (or an `inserts.js` imported there); no film.js change is needed.
- Match cut: `L.coverRect` / `L.coverRadius` = the cover image rect inside the now-playing card (set every frame, also on intro frames), radius 14; the intro target follows it.
- Static elephant: `BR.elephantMark` under the U (no chain, no swing); logo thread + glow unchanged (`glowAt`, `logo.decay`).
