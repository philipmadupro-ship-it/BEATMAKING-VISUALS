// FL colour map: FL Studio's spectrogram gradient (black, purple, red, orange, yellow, white) sampled to 64 stops (RGB hex, dark to bright).
// sampleBmp() reads such a gradient from a 24-bit BMP (FL's 512x1 Spectrum.bmp) so a user's own map can replace the table.
export const FL_STOPS_HEX = '00000101000000000001000101000102000102000103010203000303000303000304010404010405010505010505010505010606010706000707010807010807010908010909010909010a09010a0a010c0b010c0b010d0b010d0d010d0e010f1001111202131402141602161a02171d03181f031923031a2803192e031a3403193c04194403184c04175303155b03146304136a03117105107807107e0a10840e108812108e1810941d109824109d2a10a33210aa3b11b04411b44b12b85113';
export const FL_STOPS = Array.from({ length: 64 }, (_, i) => [0, 2, 4].map((k) => parseInt(FL_STOPS_HEX.slice(i * 6 + k, i * 6 + k + 2), 16)));
/** n RGB stops from the pixels of a 24-bit bottom-up or top-down BMP (first row; each stop = the pixel at the centre of its slice). */
export function sampleBmp(buf, n = 64) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  if (u[0] !== 0x42 || u[1] !== 0x4d) throw new Error('not a BMP');
  const off = dv.getUint32(10, true), w = dv.getInt32(18, true), bpp = dv.getUint16(28, true);
  if (bpp !== 24 && bpp !== 32) throw new Error('need a 24 or 32-bit BMP');
  const B = bpp / 8, out = [];
  for (let i = 0; i < n; i++) { const x = Math.min(w - 1, Math.floor((i + 0.5) / n * w)), p = off + x * B; out.push([u[p + 2], u[p + 1], u[p]]); }
  return out;
}
/** 256-entry RGBA ramp (v = normalised dB) through the stops, alpha = v^gam like the stage ramps. */
export function flLUT(gam = 0.56, stops = FL_STOPS) {
  const LUT = [], m = stops.length - 1;
  for (let i = 0; i < 256; i++) { const v = i / 255, p = v * m, a = Math.floor(p), b = Math.min(m, a + 1), u = p - a;
    LUT.push([...stops[a].map((c, j) => Math.round(c + (stops[b][j] - c) * u)), v < 0.015 ? 0 : 255 * Math.pow(v, gam)]); }
  return LUT;
}
/** Colour of a 0..1 position (for line / fill tones). */
export function flAt(v, stops = FL_STOPS) { const p = Math.max(0, Math.min(1, v)) * (stops.length - 1), a = Math.floor(p), b = Math.min(stops.length - 1, a + 1), u = p - a; return stops[a].map((c, j) => c + (stops[b][j] - c) * u); }
