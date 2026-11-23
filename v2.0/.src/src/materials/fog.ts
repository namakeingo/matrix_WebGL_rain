// The fog's physical parameters: the clouds' density and albedo, the air's scattering and extinction, the share
// of light scattered more than once and the phase function's asymmetry. Plain data: read by
// effects/fog.ts (its uniform block's density and colors, and Fog.GLSL's and Fog.MEDIUM_GLSL's
// constants, their text as before).
//
// Changelog:
// 2026-11-04: a module of src/materials/: DENSITY_FULL and the default fog colors (were in
//   effects/fog.js), AIR (was in Fog.GLSL), MULTIPLE and the phase function's g (were in
//   Fog.MEDIUM_GLSL) moved here, their values unchanged.
// 2026-11-20: AIR (0.003 per metre, white: about 1 km of visibility) replaced by AIR_SCATTER and AIR_EXTINCTION, the clear air's coefficients at the ground from the atmosphere model
//   (Atmosphere.airGround, white tone), luminance-weighted: about 1.7e-5 and 2.2e-5 per metre.
// 2026-11-22: the phase function's default forward weight 0.7 (was 0.5): the forward peak 31.67 / 4 pi (was 22.78 / 4 pi).
// 2026-11-21: the phase function (Feature U1, story U5): PHASE_G replaced by PHASE_FORWARD_G, PHASE_BACKWARD_G, PHASE_FORWARD_W (the mix of two Henyey-Greenstein lobes), phaseAt, phase, PHASE_MAX and phaseGlsl, registered as M.FogPhase.
// 2026-11-23: the calibrated defaults: MIST_HEIGHT 45 m (was 130), NOISE_CONTRAST 5 (stretch 60, was 10 and 120), COLOUR_CONTRAST 1.6 (the window 0.375, 0.625, was 1: 0.3, 0.7).
// 2026-11-22: the mist's defaults: strength halved (0.5 x 0.9 / 300 / (39 / 99)) and MIST_HEIGHT 130 m (was 3 m).
// 2026-11-22: the default NOISE_CONTRAST is 10, the top of the range (was 2; the stored stretch 120, was 24), chosen at the headed pair.
// 2026-11-22: NOISE_CONTRAST (default 2, test option noiseContrast in [1, 10]), NOISE_STRETCH_BASE, NOISE_STRETCH and noiseStretchText, registered in M.FogMist (Feature U2, story N2).
// 2026-11-21: the mist (Feature U1, story U4): MIST, MIST_HEIGHT, MIST_RATIO and mistDepth, the exponential height layer that replaces the old constant haze (registered as M.FogMist).

import { Atmosphere } from "../models/atmosphere";
import { M, testOptions } from "../engine/core";

// the clouds' density per metre at Fog intensity 100%, at their densest
export const DENSITY_FULL = 0.3;
// the clouds' albedo by default, the two fog colors (as the settings give them: sRGB, made linear
// by M.color), mixed by a noise of their own
export const MAIN_DEFAULT = "0.314 0.188 0.502";
export const SECONDARY_DEFAULT = "0.286 0.502 0.345";
// the clear air's scattering and extinction per metre at the ground: the atmosphere model's coefficients at the observer's height with the white Air tone, weighted by the Rec. 709
// luminance (0.2126, 0.7152, 0.0722) into one scalar each (the volume and the bakes hold a scalar transmittance), computed once. About 1.7e-5 and 2.2e-5 per metre: 0.65% of the light
// lost over the volume's 300 m. The Air tone's effect on the volume is under 1% over 300 m, so it is not applied here (it tints the distance haze beyond the volume instead).
const AIR_GROUND = Atmosphere.airGround();
const luminance = (v: ArrayLike<number>): number => 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
export const AIR_SCATTER = luminance(AIR_GROUND.scatter);
export const AIR_EXTINCTION = luminance(AIR_GROUND.extinction);
// light scattered more than once, as a share of the light around
export const MULTIPLE = 0.15;
// The phase function: the clouds' droplets scatter strongly forward, so the light scattered towards the eye is a MIX of two Henyey-Greenstein lobes, p(c) = w HG(c, gF) + (1 - w) HG(c, gB), c the cosine
// of the angle between the light's direction and the view's: a forward lobe (gF) of weight w and a weak backward lobe (gB). Each lobe integrates to 1 over the sphere, so the mix does too: the fog's overall
// brightness is unchanged except where the Orb or a strike is looked toward or away from. Weights: forward g 0.8, backward g -0.2, forward weight 0.7. PHASE_SINGLE_G is the old single lobe's g
// (0.2): forward weight 0 with the backward g = PHASE_SINGLE_G is exactly the old function, and the GLSL text of that case is the old text.
// (M.TEST only: the tests' options phaseMode "single" (weight 0, backward g PHASE_SINGLE_G), phaseWeight and phaseForwardG for the comparison of the weights; shipped, none is read)
export const PHASE_SINGLE_G = 0.2;
const PHASE_TEST = testOptions();
const PHASE_SINGLE = PHASE_TEST.phaseMode === "single";
export const PHASE_FORWARD_G = PHASE_TEST.phaseForwardG ?? 0.8;
export const PHASE_BACKWARD_G = PHASE_SINGLE ? PHASE_SINGLE_G : -0.2;
export const PHASE_FORWARD_W = PHASE_SINGLE ? 0 : PHASE_TEST.phaseWeight ?? 0.7;

// one Henyey-Greenstein lobe at cosine c
export function phaseLobe(c: number, g: number): number {
  return (1 - g * g) / Math.pow(1 + g * g - 2 * g * c, 1.5) / (4 * Math.PI);
}
// the mix at cosine c for weight w, forward g gF and backward g gB
export function phaseAt(c: number, w: number, gF: number, gB: number): number {
  return w * phaseLobe(c, gF) + (1 - w) * phaseLobe(c, gB);
}
// the phase function of the current constants
export function phase(c: number): number {
  return phaseAt(c, PHASE_FORWARD_W, PHASE_FORWARD_G, PHASE_BACKWARD_G);
}
// the mix's largest value: both lobes are convex in c, so the sum is largest at an end of [-1, 1] (the forward cosine 1 for any forward g over the backward g)
export const PHASE_MAX = Math.max(phase(1), phase(-1));
// a number as a GLSL float literal (an integer with its ".0"; the others as they print: 6 significant digits at most for the derived 1 - w)
const glslFloat = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(parseFloat(v.toPrecision(6))));
// the phase function's GLSL text (shaders/fog/medium.glsl's ${PHASE_GLSL}: `float phaseHG(float c)`, the one definition): at weight 0 the old function's own text with g = gB, else the two lobes
export function phaseGlsl(w: number, gF: number, gB: number): string {
  const lobe = "(1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) / FOUR_PI";
  if (w === 0) return `float phaseHG(float c) {\n  float g = ${glslFloat(gB)};\n  return ${lobe};\n}`;
  return `float phaseLobe(float c, float g) {\n  return ${lobe};\n}\nfloat phaseHG(float c) {\n  return ${glslFloat(w)} * phaseLobe(c, ${glslFloat(gF)}) + ${glslFloat(1 - w)} * phaseLobe(c, ${glslFloat(gB)});\n}`;
}

// The mist: an exponential height layer of white scattering (scatter = extinction, as the old constant haze was), extinction k e^(-y / MIST_HEIGHT) per metre at y metres above the water, k = MIST x
// (Fog intensity - 1) / 99 (the clouds' factor: Fog intensity 1 is the air alone). MIST is half the strength that made the optical depth over 300 m at the water at Fog intensity 40 (factor 39/99) the old constant's 0.003 x 300 = 0.9: that depth is 0.45; MIST_HEIGHT is 130 m (main_03 "The mist layer").
// (M.TEST only: the tests' options mistStrength and mistHeight scale MIST and replace MIST_HEIGHT for the headed comparison of strengths and heights; shipped, neither is read)
const TEST = testOptions();
export const MIST = (TEST.mistStrength ?? 1) * 0.5 * 0.9 / 300 / (39 / 99);
export const MIST_HEIGHT = TEST.mistHeight ?? 45;
// The mist scatters with the two fog colours like the clouds: in the volume with albedoAt (shaders/fog/medium.glsl: mix(main, secondary, smoothstep(0.3, 0.7, noise))), beyond 300 m, where there is no
// noise, with the same mix at this one fixed noise value: 0.5, the middle of the mix (smoothstep(0.3, 0.7, 0.5) = 0.5: the 50/50 tint of the two colours; models/mistalbedo.ts)
export const MIST_FAR_NOISE = 0.5;
// the mist's extinction as a multiple of the clouds' density scale: the bakes, which are given the clouds' sigma, get k = sigma x MIST_RATIO
export const MIST_RATIO = MIST / DENSITY_FULL;

// The mist's optical depth along a straight path of length len from height y0 to y1 (both clamped at the water, 0): the integral of k e^(-y / H) along it is k len e^(-y0 / H) (1 - e^(-x)) / x, with
// x = (y1 - y0) / H (a path that dips under the water is taken with its ends at the water: the callers' paths stay above it). For |x| under 0.02 the series 1 - x/2 + x^2/6 - x^3/24 (error under 1.3e-9
// relative) replaces the quotient, which loses its digits as x goes to 0 (a level path is k len e^(-y / H)). The shaders' mistDepth (shaders/fog/fog.glsl) is this function.
export function mistDepth(k: number, y0: number, y1: number, len: number): number {
  const a = Math.max(y0, 0);
  const x = (Math.max(y1, 0) - a) / MIST_HEIGHT;
  const g = Math.abs(x) < 0.02 ? 1 - x * 0.5 + (x * x) / 6 - (x * x * x) / 24 : (1 - Math.exp(-x)) / x;
  return k * len * Math.exp(-a / MIST_HEIGHT) * g;
}

M.FogPhase = { FORWARD_G: PHASE_FORWARD_G, BACKWARD_G: PHASE_BACKWARD_G, FORWARD_W: PHASE_FORWARD_W, SINGLE_G: PHASE_SINGLE_G, MAX: PHASE_MAX, hg: phaseLobe, at: phaseAt, phase, glsl: phaseGlsl };
// The shared noise's contrast: the noise generator's finish pass (shaders/fog/finish_fragment.glsl) stores clamp(0.5 + (v - 0.5) x NOISE_STRETCH, 0, 1), NOISE_STRETCH = NOISE_STRETCH_BASE x NOISE_CONTRAST. The base 12 brings the
// smoothed values' spread back to the whole range (effects/fog.ts); the contrast C multiplies it about the middle, so the clouds' density, the two colours' patches and the shade bakes (all read the one texture) get more contrast
// together with about the same mean; C = 1 is the earlier noise bit for bit. (M.TEST only: the test option noiseContrast replaces the default 10, kept in [1, 10]; shipped, it is not read.)
export const NOISE_STRETCH_BASE = 12;
export const NOISE_CONTRAST = Math.min(Math.max(TEST.noiseContrast ?? 5, 1), 10);
export const NOISE_STRETCH = NOISE_STRETCH_BASE * NOISE_CONTRAST;
// the finish pass's stretch as a GLSL float literal: three decimals, so every contrast of a slider of steps of 0.01 prints exactly (one decimal would print 12 x 1.33 as 16.0)
export const noiseStretchText = (c: number): string => (NOISE_STRETCH_BASE * c).toFixed(3);
// The colour patches' contrast on its own (the headed pair's slider): the clouds' albedo mixes the two fog colours by smoothstep(COLOUR_LO, COLOUR_HI, the 40 m noise), the window (0.5 - 0.2 / c, 0.5 + 0.2 / c) for the
// contrast c in [0.25, 4]; c = 1 is today's window (0.3, 0.7) exactly. (M.TEST only: the test option colourContrast; shipped, it is not read.)
export const colourEdges = (c: number): number[] => {
  const k = Math.min(Math.max(c, 0.25), 4);
  return k === 1 ? [0.3, 0.7] : [0.5 - 0.2 / k, 0.5 + 0.2 / k];
};
export const COLOUR_CONTRAST = Math.min(Math.max(TEST.colourContrast ?? 1.6, 0.25), 4);
export const COLOUR_LO = colourEdges(COLOUR_CONTRAST)[0]!;
export const COLOUR_HI = colourEdges(COLOUR_CONTRAST)[1]!;
M.FogMist = { DENSITY_FULL, MIST, HEIGHT: MIST_HEIGHT, RATIO: MIST_RATIO, depth: mistDepth, NOISE_CONTRAST, NOISE_STRETCH_BASE, NOISE_STRETCH, noiseStretchText, COLOUR_CONTRAST, COLOUR_LO, COLOUR_HI, colourEdges };
