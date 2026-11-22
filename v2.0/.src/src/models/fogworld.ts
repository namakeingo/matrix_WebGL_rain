// The world-fixed fog volume's pure model (Feature U1, story U8: a prototype behind the test option fogWorld; units.ui.fogworld.ts). The fog's density and light gathered into a grid fixed in the WORLD
// (the camera does not enter it), with the shadow grid's mapping (shaders/fog/medium.glsl shadeCoord and shadePlace: x / distance across the world's width, the height's square root, the distance's
// logarithm), read by a march per pixel along the ray with the volume's slice law (QualityFog.sliceStart: the start of slice k of n is SLICE_NEAR (exp(k / n SLICE_LOG) - 1)). A cell holds the
// medium's per-unit-length extinction and scattered light, not cumulative sums, so a camera move needs no regather.
// - coord(x, y, z): the grid's node coordinates of a world place (fractional, 0 to cells - 1, clamped to the grid); place(i, j, k): the world place of a node; texCoord: the texture coordinates
//   (the texels' middles).
// - sliceAt(u), steps(n, tMax): the march's distances along the ray; march(field, origin, dir, tMax, n): the CPU reference of shaders/fog/world.glsl's march, front to back, each step's medium
//   taken at its middle, its in-scatter integrated exactly over the step (constant extinction and source): L += T s (1 - e^-tau) / sigma, T *= e^-tau.
// - Two RGBA16F textures of ACROSS x UP x DEEP cells (BYTES each): A (rgb the scattered light per metre without the moon's phase function, a the extinction per metre) and B (rgb the moon's
//   scattered light per metre before the phase function, a unused).
//
// Changelog:
// 2026-11-21: new (Feature U1, story U8).

import { M } from "../engine/core";
import { QualityFog } from "./quality/fog";

// the shadow grid's layout (effects/fog.ts SHADE_ACROSS, SHADE_UP, SHADE_DEEP, SHADE_TOP, SHADE_NEAR)
const ACROSS = 128;
const UP = 64;
const DEEP = 96;
const TOP = 48;
const NEAR = 0.5;
const FAR = QualityFog.FOG_FAR;
// the march's distances: the volume's law over 0 to FAR
const SLICE_NEAR = QualityFog.SLICE_NEAR;
const SLICE_LOG = QualityFog.SLICE_LOG;
// bytes of one texture (RGBA16F: 8 bytes a cell) and the number of them
const BYTES = ACROSS * UP * DEEP * 8;
const TEXTURES = 2;
// the march's default number of steps
const STEPS = 32;
// the texture grid's logarithm of distance
const GRID_LOG = Math.log(FAR / NEAR);
const CELLS = [ACROSS, UP, DEEP];

const span = (): number => M.Camera.SPAN;

// the grid's node coordinates of the world place (x, y, z): the shadow grid's shadeCoord, in nodes (0 to cells - 1)
function coord(x: number, y: number, z: number): number[] {
  const d = Math.max(-z, NEAR);
  const g = [(x / d / span() + 1) * 0.5, Math.sqrt(Math.max(y, 0) / TOP), Math.log(d / NEAR) / GRID_LOG];
  return g.map((v, a) => Math.min(Math.max(v, 0), 1) * (CELLS[a]! - 1));
}

// the world place of node (i, j, k): the shadow grid's shadePlace
function place(i: number, j: number, k: number): number[] {
  const gx = i / (ACROSS - 1), gy = j / (UP - 1), gz = k / (DEEP - 1);
  const z = NEAR * Math.exp(gz * GRID_LOG);
  return [(gx * 2 - 1) * span() * z, gy * gy * TOP, -z];
}

// the texture coordinates of a world place (a node's middle of its texel)
function texCoord(x: number, y: number, z: number): number[] {
  const c = coord(x, y, z);
  return c.map((v, a) => (v + 0.5) / CELLS[a]!);
}

// the distance along the ray at the fraction u of the march (the volume's slice law: shaders/fog/fog.glsl sliceAt)
function sliceAt(u: number): number {
  return SLICE_NEAR * (Math.exp(u * SLICE_LOG) - 1);
}

// the n steps of the sequence over 0 to tMax: the starts (n + 1), the middles and the widths
function steps(n: number, tMax = FAR): { start: Float64Array; mid: Float64Array; width: Float64Array } {
  const start = new Float64Array(n + 1), mid = new Float64Array(n), width = new Float64Array(n);
  for (let i = 0; i <= n; i++) {
    start[i] = (sliceAt(i / n) * tMax) / FAR;
  }
  for (let i = 0; i < n; i++) {
    mid[i] = 0.5 * (start[i]! + start[i + 1]!);
    width[i] = start[i + 1]! - start[i]!;
  }
  return { start, mid, width };
}

// the march of a medium along o + t d from 0 to tMax in n steps: what it lets through and the light it adds (front to back)
function march(field: (p: number[]) => { extinction: number; source: number }, origin: number[], dir: number[], tMax: number, n: number): { transmittance: number; light: number } {
  const s = steps(n, tMax);
  let transmittance = 1, light = 0;
  for (let i = 0; i < n; i++) {
    const t = s.mid[i]!, w = s.width[i]!;
    const f = field([origin[0]! + dir[0]! * t, origin[1]! + dir[1]! * t, origin[2]! + dir[2]! * t]);
    const tau = f.extinction * w;
    // (the step's own integral of the source e^-(sigma x) over its width, exact for a constant medium; the extinction's limit 0: the source over the width)
    light += f.extinction > 1e-12 ? (transmittance * f.source * (1 - Math.exp(-tau))) / f.extinction : transmittance * f.source * w;
    transmittance *= Math.exp(-tau);
  }
  return { transmittance, light };
}

export const FogWorld = {
  ACROSS, UP, DEEP, TOP, NEAR, FAR, BYTES, TEXTURES, STEPS,
  get SPAN() { return span(); },
  coord, place, texCoord, sliceAt, steps, march,
};

M.FogWorld = FogWorld;
