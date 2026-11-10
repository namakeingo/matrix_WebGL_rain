// The lightning's physical parameters: the light the strikes cast and the look of the lines
// drawn (their profile across and their tint). Plain data: read by core.ts (M.BOLT),
// models/boltitems.ts and effects/bolt.ts (on their classes as before: BoltItems.BELL_*,
// Bolt.BELL_SPREAD, Bolt.TINT).
//
// Changelog:
// 2026-11-04: the bell's constants (BELL_SPREAD, BELL_PX, BELL_LEAST, BELL_END, were in
//   models/boltitems.ts) and TINT (was in effects/bolt.ts) moved here, their values unchanged.

// The lightning's light: its colour at the default Lightning flash hue (80), linear light, the
// one the strikes cast and the fog scatters (Lightning.colorOf goes from violet through it to
// white).
export const BOLT: number[] = [0.85, 0.9, 1.0];

// The bell across a line (Bolt's shaders, BoltItems.BAND_PER_SIZE): exp(-g(r)) at r pixels from
// it, g a Gaussian's out to where its slope reaches 1 / the tail's spread, then on straight; half
// its light at half the size.
// the tail's spread: this share of the line's size
export const BELL_SPREAD = 0.15;
// the tail's least spread (px)
export const BELL_PX = 1.0;
// the Gaussian's least sigma on thin lines (px)
export const BELL_LEAST = 0.3;
// the bell cut from BELL_END - 2 to BELL_END of g
export const BELL_END = 13;

// With Characters lightning, the line's colour under the white characters: slightly blue, linear
// (0.7, 0.8, 1.0) scaled to white's luminance (Rec. 709), so its light a metre (as luminance)
// stays its share; as the strike fades its red leaves the tone map's white before the
// characters do, and they are seen sooner
export const TINT: Float32Array<ArrayBuffer> = (() => {
  const c = [0.7, 0.8, 1.0];
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return Float32Array.from(c, (v) => v / y);
})();
