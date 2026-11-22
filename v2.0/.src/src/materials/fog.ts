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
// 2026-11-21: the phase function (Feature U1, story U5): PHASE_G replaced by PHASE_FORWARD_G, PHASE_BACKWARD_G, PHASE_FORWARD_W (the mix of two Henyey-Greenstein lobes), phaseAt, phase, PHASE_MAX and phaseGlsl, registered as M.FogPhase.
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
// brightness is unchanged except where the Orb or a strike is looked toward or away from. PROVISIONAL weights: forward g 0.8, backward g -0.2, forward weight 0.5. PHASE_SINGLE_G is the old single lobe's g
// (0.2): forward weight 0 with the backward g = PHASE_SINGLE_G is exactly the old function, and the GLSL text of that case is the old text.
// (M.TEST only: the tests' options phaseMode "single" (weight 0, backward g PHASE_SINGLE_G), phaseWeight and phaseForwardG for the comparison of the weights; shipped, none is read)
export const PHASE_SINGLE_G = 0.2;
const PHASE_TEST = testOptions();
const PHASE_SINGLE = PHASE_TEST.phaseMode === "single";
export const PHASE_FORWARD_G = PHASE_TEST.phaseForwardG ?? 0.8;
export const PHASE_BACKWARD_G = PHASE_SINGLE ? PHASE_SINGLE_G : -0.2;
export const PHASE_FORWARD_W = PHASE_SINGLE ? 0 : PHASE_TEST.phaseWeight ?? 0.5;

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
// (Fog intensity - 1) / 99 (the clouds' factor: Fog intensity 1 is the air alone). PROVISIONAL strength and height: MIST is chosen so that its optical depth over 300 m at the water at the default (Fog
// intensity 40: factor 39/99) is the old constant's 0.003 x 300 = 0.9; MIST_HEIGHT is the nearest of 3, 6 and 12 m to the pre-U1 picture by the identity numbers (3 m: mean difference 5.53 levels against 5.92 and 6.60; main_03 "The mist layer").
// (M.TEST only: the tests' options mistStrength and mistHeight scale MIST and replace MIST_HEIGHT for the headed comparison of strengths and heights; shipped, neither is read)
const TEST = testOptions();
export const MIST = (TEST.mistStrength ?? 1) * 0.9 / 300 / (39 / 99);
export const MIST_HEIGHT = TEST.mistHeight ?? 3;
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
M.FogMist = { DENSITY_FULL, MIST, HEIGHT: MIST_HEIGHT, RATIO: MIST_RATIO, depth: mistDepth };
