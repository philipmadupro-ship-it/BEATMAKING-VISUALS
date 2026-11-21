# Aurora visualisers: porting notes (ideas only)
Source: **Aurora by Joe Croskey**, joecroskey.com/Aurora. The source zip is at joecroskey.com/aurora/downloads/Aurora-0.1.0-source.zip, unpacked at `/home/user/research/aurora-src/src/aurora-meters/`.
**Licence: AGPL-3.0-or-later.** No Aurora code is copied here. These are descriptions of methods and default parameters, written for re-implementation in canvas/WebGL. If you ever paste Aurora code, the U2C renderer becomes AGPL. Don't. Credit: "Meter design ideas after Aurora by Joe Croskey (AGPL-3.0)".

U2C already computes the data offline (`tools/meters.py`, per frame). Port the *drawing* ideas and check the *ballistics* against these.

## Analysis core (Source/Analysis.cpp)
- Stereo FFT of 4096 samples with a Hann window and a **1024 hop**. The output is 2049 bins in dBFS, floored at −120.
- Coherent-gain normalisation: `power·sided²/(Σw)²`, so a bin-centred full-scale sine reads 0 dBFS. `sided` = 2 except at DC and Nyquist.
- Display bands (for colour, not measurement): 12 dB/oct Butterworth splits at 250 Hz and 4 kHz, giving low/mid/high energy fractions. Encoded as `(dB+60)/60`, clamped to 0..1.
- Waveform history: **1 ms buckets** (round(Fs/1000) samples), each holding the signed min/max per channel, the sum of squares (RMS), 3-band energy and a 65-bin amplitude-occupancy histogram (PCM density). Aggregate by summing these sufficient statistics, never by averaging RMS.
- LUFS: 400 ms momentary, 3 s short-term, gated integrated (−70 absolute, then −10 relative gate), using a histogram.

## Spectrum (PluginEditor::spectrum + SpectralProjection.h)
- **Log projection that keeps peaks.** For display cell *i* of N, take the log-normalised centre `x=(i+.5)/N` and span `1/N`. Map both edges to fractional bins with `f = fmin·(fmax/fmin)^x`, then take the **max of** the linearly interpolated dB at both edges and every whole bin between them. Narrow peaks survive, and the oversampled bass doesn't smear wide. Use N ≈ 1.5 × pixel width (128 to 1400).
- Defaults: floor −90, ceiling 0 dBFS, 20 Hz to 20 kHz. Grid lines every 10 dB (labels every 30 dB). Frequency lines at 50, 100, 200, 500, 1k, 2k, 5k and 10k, with the decades stronger (65% vs 22%).
- Drawing stack:
  1. A fill under the curve: a vertical gradient from the top (colour C at 25%) through the middle stop (colour B at 19%) to the floor (colour A at 2.5%).
  2. A **glow stroke**: 4 px, colour B at 10%.
  3. A **main stroke**: 1.3 px (default) with a vertical gradient from C·ink to B. Curved, rounded joins.
- **Trails instead of smoothing.** Keep the traces from the last **0.22 s**. Draw each at 0.8 px with alpha `0.17·(1 − age/0.22)`. That gives motion persistence without lag on the live line.
- Readouts: only three frequency labels (min, geometric mid, max) plus the `dBFS` unit, in 8 to 9 px mono. Minimal.
- Canvas port: precompute the per-frame dB arrays offline, draw with `Path2D`, and keep the trail as a ring buffer of the last k frames (k = round(0.22·fps)).

## Spectrogram
- An image cache of **256 rows**, with columns at about **20 per second**. Default window 12 s, scrolling right (newest on the right, or reversed). Each row uses the same peak-preserving projection over 1/256 of the log axis.
- Colour comes from a **256-entry LUT**. `v = (i/255)^contrast` (contrast 1.0, range 0.3 to 2.5), then:
  - `v < .18`: panel colour to stop A.
  - `.18 ≤ v < mid`: A to B (`mid = .18 + .68·paletteMiddle`, default .52).
  - otherwise: B to C.
  - Above v=.76, blend toward white by up to 18% (dark theme).
  - **alpha = v^0.56**, and alpha is 0 below v=.015. Quiet content dissolves into the panel instead of painting a coloured floor.
- Map dB to `(db − floor)/(ceiling − floor)` with floor −90 and ceiling 0. Because history is kept as dB, recolouring for a new stage only rebuilds the LUT.
- Grid: 100, 1k and 10k lines, 3 time divisions, and `12 s` / `now` labels.
- WebGL port: upload the dB history as a single-channel float texture (256 × cols) and the LUT as a 256×1 RGBA texture. The fragment shader samples the dB, normalises it, and looks it up. Scroll by offsetting u with a wrapped ring index.
- For U2C stages, the LUT is ground → ink → accent. **NIGREDO: a grey ramp only.**

## Stereo (goniometer / M-S density)
- Plot each sample pair as **M/S axes** (rotate L/R by 45°, M up). Scale it `0.46/normal·(n−1)·gain`, where `normal` = max(0.075, envelope) when auto-gain is on.
- **Bilinear additive splats** into a density grid (each point spreads to 4 cells). This keeps repeated-point density, which one path would flatten.
- Persistence: trace weight `exp(−age/(0.31·T))·(1 − age/T)`, with **T = 0.42 s**.
- Pixel alpha `1 − exp(−(d + 0.085·Σ4-neighbours)·0.85·brightness)`. The colour lerps from low to high by `d·0.32`.
- Labels: M at the top, S at the right, L and R on the diagonals, all in tiny mono at 48 to 60%.
- **Correlation bar** below: a hairline from −1 to +1 with 5 ticks, a 2.2 px fill from 0 to the value, and a 7 px ring-dot marker. Labels −1 / 0 / +1.

## Levels panel
- Two bars (L, R) up to 42 px wide, floor −60 dBFS, in **1 dB segments** with a 0.65 px gap.
  - Segments below the RMS are 94% opaque. Segments between the RMS and the peak are 36% (RMS-over-peak in one bar).
  - Segments at or above the **warning, −3 dBFS**, use the clip colour.
- There is a 1.3 px peak line. The hold line is 1.1 px and extends 2 px past the bar; it turns the warning colour when ≥ 0. A small clip lamp (2.5 px) sits above each bar.
- Ticks every 6 dB, with labels every 12 dB. Below the bars: `L` / `R` and the peak value in 12 px mono.
- Loudness block: the **integrated LUFS big** (25 px compact, larger in full), the unit `LUFS` small, and `M −x.x` / `S −x.x` in a footer row.
- Ballistics: Aurora uses sample peak plus a 50 ms RMS and a persistent hold. U2C's offline meters already do IEC-style ballistics. Keep those, and only borrow this **visual hierarchy**.

## Waveform (Silk / Prism / Trace)
- A signed sample-peak envelope (exact min/max per 1 ms bucket), an RMS body inside it, and **PCM density** shading from the amplitude histogram, so busy regions look denser.
- Band colouring: apricot lows, mint mids and violet highs, mixed by the band energy fractions (Prism). Or map RMS through the 3-stop palette.
- Fixed amplitude scales (1×, 2×, 4×), never normalised per channel. Red edge marks show **actual full-scale samples**.
- Time windows of 1, 3, 6, 12 or 24 s. A Scope mode uses a zero-crossing trigger with 8% hysteresis on the louder channel, showing 768 samples.

## Reactivity (VisualReactivity.h): drives the 3D scene, not the meters
- Convert the band controls back to linear: `10^(enc·3 − 3)`.
- An adaptive reference per band follows the signal with a **0.6 s rise and 2 s fall**. The global reference uses 0.35 s / 2.5 s.
- Output per band: `gate · clamp(0.62·(amp/ref)^0.75·(0.3 + 0.7·sqrt(amp/total)))`, smoothed with **18 ms attack and 160 ms release**. A sustained tone settles near 0.62.
- Onset: a rise of 1 to 10 dB in any band (smoothstep) weighted by sqrt(band share), with 180 ms exponential decay.
- Quiet gate: closed below −58 dBFS and fully open at −46. Outputs release to 0 after 250 ms with no data.
- **U2C adaptation:** compute these offline per frame. Then **quantise the onset events to the grid** (snap an onset to the nearest 16th if it is within 1 frame of it), so the scene pulses exactly on the beat.

## 3D "Folded Light" surface (VisualSurface.cpp + SceneMaterial.h)
- Geometry: a grid sheet with uv in [0,1]², `x=(u−.5)·3.35` and `y=(v−.5)·1.95`.
  - `z = .23·sin(2x + .24φ) + .17·cos(3.2y − .17φ) + b·.36·sin(3.1y + .7x) + w·.09`, where `b` = the spectrum band sampled at u (128 bands, (dB+85)/85, smoothed with `1−exp(−12·dt)`) times gain, and `w` = the waveform sample at u.
  - Then `y += .18·sin(1.5x + .12φ)`. Rotate X by .63 rad and Z by −.22 rad, and scale by .9.
- **Phase φ** advances by `dt·speed·(.48·low + .38·mid + .20·high)`. The surface flows faster when the music is busier and stops in silence. **U2C:** integrate φ offline. Then, on beats, add a small impulse to φ instead of using the raw speed, so the folds "step" with the kick.
- Shading ("laminae"):
  - Contour `= 5v + .38·sin(1.5u + .07φ) + density·(3.8 + .5·drive)`.
  - Fine engraved lines at `112v` and cross lines at `46u`. Relief `.025·sin(2π·contour)`.
  - Palette position `.5 + .34·sin(.72·contour + x)` maps into the 3-stop palette.
  - Floating-point bloom on top.
- Canvas/WebGL port: one fullscreen pass with a 256×128 grid mesh (or a raymarch-free vertex grid in three.js). Upload the 128 bands and 128 wave samples as a uniform array or a 1D texture. Keep the stage palette as 3 uniforms. For NIGREDO, use the grey stops only, with the bloom tinted neutral.
- Use it as a **breath / hero shot** (1 to 2 bars, static camera, the surface itself moving). Never as a busy background behind UI.
