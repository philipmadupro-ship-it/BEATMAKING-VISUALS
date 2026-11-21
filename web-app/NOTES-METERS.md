# Meters v2: sources and licences

All meter code (src/v8/meterlib.js, src/v8/meters.js, src/analysis/msspec.js, the additions to src/analysis/clipdata.js)
is written fresh. Other projects contributed ideas, documented behaviour and published numbers only; no code was copied,
and no product names, logos or trade dress appear on screen. Copyrighted reference screenshots were studied internally
and are not bundled or rendered.

| idea | source | licence |
|---|---|---|
| spectrogram LUT / alpha curve, density goniometer persistence, 1 dB segments | Aurora (Joe Croskey) | AGPL-3.0, ideas only |
| analyzer reactivity, pink compensation (not copied: nearest-bin display) | LSP plugins, lsp-dsp-units | LGPL-3.0, ideas only |
| RBJ shelves / bells, HP/LP slopes | x42 fil4 | GPL-2.0, ideas only |
| waveform peak/RMS reading | Audacity | GPL, ideas only |
| vectorscope modes (polar sample / level / Lissajous), correlation + balance, width per band and per frequency | iZotope Ozone Imager | proprietary freeware, behaviour only |
| analyzer settings (resolution, range, 4.5 dB/oct tilt), EQ display grammar | FabFilter Pro-Q | proprietary, behaviour only |
| dual scales, dynamic band display | TDR Nova | proprietary freeware |
| 4.5 dB/oct slope, correlation 500 ms / balance 3 s, K-modes | Voxengo SPAN | proprietary freeware |
| LUFS history, histogram, target excess | Youlean Loudness Meter 2 | proprietary freeware |
| crest factor readout, weighting modes | dpMeter (TBProAudio) | proprietary freeware |
| 2×2 hero readout, glowing single-hue lines, huge mono numbers | ghost by adieu sounds | proprietary freeware |
| meter scale table, peak/RMS/hold grammar, clip cells | Ableton Live 12, Logic Pro, FL Studio | proprietary; numbers measured from public screenshots |
| formulas | RBJ Audio EQ Cookbook, ITU-R BS.1770-4, EBU R128 / Tech 3341 / 3342, IEC 60268-18, K-system (Katz) | published standards |
