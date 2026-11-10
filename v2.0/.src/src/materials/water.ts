// The water's physical parameters: its reflectance (Fresnel's, head-on), its albedo and the share
// of light it scatters back diffusely. Plain data: read by effects/water.ts (Water.fragment's
// constants, their text as before).
//
// Changelog:
// 2026-11-04: a module of src/materials/: the reflectance head-on, WATER_ALBEDO and WATER_DIFFUSE
//   moved here (were in Water.fragment's shader), their values unchanged.

// the reflectance head-on (Schlick's F0: water's, index of refraction 1.33)
export const WATER_F0 = 0.02;
// the water's albedo, linear RGB
export const WATER_ALBEDO: readonly number[] = [0.03, 0.04, 0.06];
// the share of a strike's light it scatters back (Lambert, 1 / pi)
export const WATER_DIFFUSE = 0.15;
