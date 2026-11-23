// The mist's albedo (Feature U1, story U4; units.ui.mistalbedo.ts). The mist scatters with the two fog colours like the clouds do. In the volume the albedo is albedoAt (shaders/fog/medium.glsl): the colours
// mixed by smoothstep(0.3, 0.7, noise) at the place. Beyond 300 m there is no noise: the mist takes the same mix at one fixed noise value, MIST_FAR_NOISE (materials/fog.ts), 0.5, the middle of the mix.
// Pure, no GL, no page.
// - weight(n): the mix's weight smoothstep(0.3, 0.7, n) (the shader's)
// - at(main, second, n): the clouds' albedo at the noise n, per channel mix(main, second, weight(n))
// - far(main, second): at(main, second, NOISE), the mist beyond 300 m's albedo
// - NOISE: MIST_FAR_NOISE
// - luminance(c): the Rec.709 luminance 0.2126 r + 0.7152 g + 0.0722 b of a linear colour
// - balanceScales(main, second): { a, b }, the factors the CPU multiplies the two colours by (Fog: the rgb written to the block's fMain and fSecond) so that both contribute the same luminance
//
// The balance of the two colours' prominence. A 50/50 mix of two colours of different luminance is dominated by the brighter one. With the luminances Lm and Ls of the LINEAR colours, a = (Lm + Ls) / (2 Lm) and
// b = (Lm + Ls) / (2 Ls): the albedo is mix(a main, b second, w) with the unbiased noise weight w, a Lm = b Ls = (Lm + Ls) / 2, so the two colours contribute EQUAL luminance at w = 0.5 and at every level of
// detail (the fog stays linear in w: the volume, the mips and the ray march agree), and the mean luminance (a Lm + b Ls) / 2 is the unbalanced (Lm + Ls) / 2. Fallbacks: both luminances under 1e-6: a = b = 1; one
// under 1e-6 alone: it is taken as 1e-6 (its factor goes to the clamp); a and b are clamped to [1/4, 4] (the balance is partial for a pair whose luminances differ by more than 7); luminances equal within 1e-9: exactly 1 and 1.
//
// Changelog:
// 2026-11-22: new (Feature U1, story U4).
// 2026-11-22: luminance and balanceScales (the balance of the two colours' prominence, by scaling the colours).

import { M } from "../engine/core";
import { MIST_FAR_NOISE } from "../materials/fog";

// the luminance below which a colour counts as black, the luminances' tolerance for equal, and the factors' clamp
const BLACK = 1e-6;
const EQUAL = 1e-9;
const SCALE_MIN = 0.25;
const SCALE_MAX = 4;

function weight(n: number): number {
  const t = Math.min(Math.max((n - 0.3) / 0.4, 0), 1);
  return t * t * (3 - 2 * t);
}

function at(main: number[], second: number[], n: number): number[] {
  const w = weight(n);
  return main.map((v, c) => v * (1 - w) + second[c]! * w);
}

function far(main: number[], second: number[]): number[] {
  return at(main, second, MIST_FAR_NOISE);
}

function luminance(c: ArrayLike<number>): number {
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function balanceScales(main: ArrayLike<number>, second: ArrayLike<number>): { a: number; b: number } {
  const lm = luminance(main);
  const ls = luminance(second);
  if ((lm < BLACK && ls < BLACK) || Math.abs(lm - ls) <= EQUAL) {
    return { a: 1, b: 1 };
  }
  const half = (lm + ls) / 2;
  const clamp = (v: number): number => Math.min(Math.max(v, SCALE_MIN), SCALE_MAX);
  return { a: clamp(half / Math.max(lm, BLACK)), b: clamp(half / Math.max(ls, BLACK)) };
}

export const MistAlbedo = { NOISE: MIST_FAR_NOISE, weight, at, far, luminance, balanceScales };

M.MistAlbedo = MistAlbedo;
