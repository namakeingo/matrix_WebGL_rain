// The light around: the night sky's and the moon's. Plain data: read by effects/fog.ts (Fog.GLSL's
// constants, their text as before), which every shader seen through the fog or lit by the sky
// includes (the water's among them).
//
// Changelog:
// 2026-11-04: a module of src/materials/: SKY, MOON and MOON_DIR moved here (were in Fog.GLSL),
//   their values unchanged.

// the night sky's radiance, linear RGB (seen, and lighting the fog and the water)
export const SKY: readonly number[] = [0.004, 0.0035, 0.008];
// the moonlight's irradiance through the cloud cover, linear RGB, from MOON_DIR
export const MOON: readonly number[] = [0.3, 0.32, 0.36];
// the direction towards the moon (world space, y up, -z ahead; normalized where it is read)
export const MOON_DIR: readonly number[] = [0.24, 0.91, -0.34];
