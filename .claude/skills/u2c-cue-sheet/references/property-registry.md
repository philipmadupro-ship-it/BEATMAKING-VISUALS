# Property paths (v9)
scene: `look` (exe, lab, scope), `stage` (nigredo, albedo, citrinitas, rubedo)
camera: `camera.shot` (shot: wide | window id), `camera.zoom`, `camera.x`, `camera.y`; `focus.featured` (auto, none, window id)
logo: `logo.mode` (cycle, full, off), `logo.cycle` (bars), `logo.hero` (clip), `logo.scale`, **v9** `logo.glow` (0..2), `logo.bloom` (0..2), `logo.runner` (bool)
pendant: `pendant.amp` (deg), `pendant.period` (beats), `pendant.react`, `pendant.size`, `pendant.x`, `pendant.y`, **v9** `pendant.links` (3..24), `pendant.wave` (beats), `pendant.damp` (zeta), `pendant.chain` (0..0.6)
windows (`win.<id>.`): x, y, w, h, visible, open, content (logo, waveform, pendant, eq, spectrum, loudness, stereo, spectrogram, surface; clock/bands kinds still render but no look places them), accent
window ids v9: exe `session chains elephant eq spectrum loud stereo spectro`; lab `chains session elephant spectrum eq loud stereo spectro`; scope `chains elephant eq spectrum loud stereo surface (+spectro 16:9)`
meters: `meter.spectrum.floor/trail/smooth/hold`, `meter.spectro.window/gamma`, `meter.eq.range/tilt`, `meter.loud.target/floor`, `meter.stereo.persist/gain`, `meter.session.span`, `meter.scope.span/amp`, `meter.surface.rows`
text: `text.cue` (clip: v, x, y, size, font, color, align, box) · tags: `tag.<leaf>` · overlays: `hud.on boot.on result.on result.at bracket.on wires.on notes.on furniture.on`
finish: `fx.grain fx.vignette fx.scan fx.flash (event) fx.glitch (clip)`, `ground.pattern ground.gridA`, `stage.<colour>`
