// The fog's physical parameters: the clouds' density and albedo, the air's scattering, the share
// of light scattered more than once and the phase function's asymmetry. Plain data: read by
// effects/fog.ts (its uniform block's density and colors, and Fog.GLSL's and Fog.MEDIUM_GLSL's
// constants, their text as before).
//
// Changelog:
// 2026-11-04: a module of src/materials/: DENSITY_FULL and the default fog colors (were in
//   effects/fog.js), AIR (was in Fog.GLSL), MULTIPLE and the phase function's g (were in
//   Fog.MEDIUM_GLSL) moved here, their values unchanged.

// the clouds' density per metre at Fog intensity 100%, at their densest
export const DENSITY_FULL = 0.3;
// the clouds' albedo by default, the two fog colors (as the settings give them: sRGB, made linear
// by M.color), mixed by a noise of their own
export const MAIN_DEFAULT = "0.314 0.188 0.502";
export const SECONDARY_DEFAULT = "0.286 0.502 0.345";
// the air's scattering and extinction per metre (about 1 km of visibility)
export const AIR = 0.003;
// light scattered more than once, as a share of the light around
export const MULTIPLE = 0.15;
// the Henyey-Greenstein phase function's asymmetry g (forward scattering)
export const PHASE_G = 0.2;
