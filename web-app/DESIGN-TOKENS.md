# UI design tokens (design-mirror of kollidelabs.com/noteframe + studio screenshots, U2C colours)
Mirrored = layout/type/spacing/shape only. Colours = U2C brand palettes (NOT Kollide's).

Typography
  --sans: "Instrument Sans" (Google Fonts), ui-sans-serif, system-ui   — UI + headings, weight 600, tight tracking (-0.05em on big type)
  --mono: "JetBrains Mono" (Google Fonts), ui-monospace               — all labels, timecodes, counts, meta ("9:16 · 1080×1920 · 30 fps")
  --serif: "Iowan Old Style", Palatino, Georgia                       — italic accents (bpm/key lines on posters)
  scale: 11 / 12 / 13 / 15 / 17 / 24 / 48 / 92px; mono labels 11-12px, uppercase, letter-spacing .12em
Spacing:  --pad: clamp(18px,4vw,56px); 4/8/12/16/24/32px; panel gutters 16px
Shape:    --radius: 8px (chips, buttons, cards); 4px tiny tags; hairline 1px borders rgba(fg,.10/.18); no shadows; selected = 1px accent border + faint accent tint
Motion:   --ease: cubic-bezier(.2,.7,.2,1); 160ms UI transitions
Layout (studio): top bar 56px (brand dot · "U2C / studio" · project title · saved status · Export CTA right)
  | canvas stage (dark, centred, meta line top-left, Fit/100%/Safe area/Fullscreen top-right)
  | right panel 440px with icon tabs (Beat/Video/Look/Style/Words/Post), search, category chips with counts, 3-col card grid with count badge + name + category in mono
  bottom: VARIANT chips row (dual-dot colour swatch + name) → transport (square play btn accent, timecode in mono 24px, "bar 0.4" pill, in/out/len readout) → timeline (bar ruler numbers, lanes, waveform, handles) → legend row in mono 11px with coloured squares
Colours: Charcoal / Rust / Amethyst only (from brief). UI chrome uses Charcoal; accent = palette's main colour.
