// GlyphRelief: the glyphs' relief ("3D Symbols"), as a pure model (no GL, no page: importable in any thread). Each character is a flat quad facing the camera; with
// 3D Symbols on, its fragment shader reads the atlas as if the ink were raised from the quad, with no vertex added, no occlusion and no depth buffer:
// - the height field: the ink mask (0 to 1) times RELIEF, in the glyph's own uv units (it spans 1 across): RELIEF 0.2 is 1/5 of the glyph's size (6 mm on a 3 cm glyph);
// - the normal: from the height's central differences (the ink one step either side along u and along v); the true world's normal (up is y, the quad faces +z): tilted away
//   from a raised stroke, flat (0, 0, 1) for a flat mask. The glyph's uv has v running down the glyph, so the world's y is -v on a quad drawn as it is and +v on its mirror
//   image (drawn flipped in y under the water): the lighting normal is that of the glyph itself either way (the mirror image shows the same glyph);
// - the depth offset (parallax): the pixel of the quad's base plane looks along the view ray into the volume under the height field: the ray at height z over the base is at
//   the pixel's uv + w z, w = the tangent-space view's xy over its z (tangentView), and it meets the surface where RELIEF x ink(uv + w z) reaches z. The ray is stepped from
//   the top (z = RELIEF) down in STEPS equal steps to the base (STEPS + 1 samples; the base always meets), the crossing found by linear interpolation between the last two
//   samples. The offset is z x w, 0 at normal incidence (w = 0), growing with the angle's tangent, at most RELIEF x |w|.
// The shaders' GLSL twin is shaders/glyphs/relief.glsl (reliefAt), with these constants (RELIEF, STEPS) filled in; the GLSL is checked against these numbers by the scene test
// symbols3d.
//
// - RELIEF, STEPS, VIEW_MIN, SKIP_PX, NORMAL_FOOTPRINT: the constants (the shader's, filled in); height(ink): RELIEF x ink.
// - normal(left, right, before, after, step, into?): the unit normal [x, y, z] from the ink at u - step, u + step, v - step, v + step (a step in uv units: one texel of the level
//   read); no allocation when `into` is given.
// - tangentView(view, mirror, into?): the shift of the lookup in uv per unit of height, [x / z, -mirror y / z], from the unit view vector (from the glyph to the eye, in the world
//   where the quad faces +z); mirror: 1 for a quad drawn as it is, -1 for its mirror image (the uMirror of the shaders).
// - parallax(sample, u, v, wx, wy, into?): the uv [u', v'] the pixel at (u, v) looks up, and the height z it met, for the ink sampler `sample(u, v)`.
// - shiftPx(distance, size, focalPx, tangent): the offset in pixels at the most (the surface's top): RELIEF x the glyph's size on the screen (size x focalPx / distance) x tangent.
//
// Changelog:
// 2026-11-12: new.
import { M } from "../engine/core";

// the relief's height, in glyph sizes (the glyph spans 1 in uv): 1/5
const RELIEF = 0.2;
// the ray's steps from the top to the base (STEPS + 1 samples)
const STEPS = 4;
// the least z of the unit view vector the shift is worked out for (a ray flatter than 75 degrees from the quad's plane is taken as that one: the shift stays at most 4 RELIEF)
const VIEW_MIN = 0.25;
// the shader's thresholds: a shift under SKIP_PX pixels is not looked up (the pixel keeps its place), and a glyph under 4 pixels across (a footprint of more than
// NORMAL_FOOTPRINT of the glyph a pixel) gets no normal map
const SKIP_PX = 0.25;
const NORMAL_FOOTPRINT = 0.25;

function height(ink: number): number {
  return RELIEF * ink;
}

function normal(left: number, right: number, before: number, after: number, step: number, into?: number[]): number[] {
  const out = into || [0, 0, 0];
  const k = RELIEF / (2 * step);
  const x = -k * (right - left);
  const y = k * (after - before);
  const length = Math.sqrt(x * x + y * y + 1);
  out[0] = x / length;
  out[1] = y / length;
  out[2] = 1 / length;
  return out;
}

function tangentView(view: ArrayLike<number>, mirror: number, into?: number[]): number[] {
  const out = into || [0, 0];
  const z = Math.max(view[2], VIEW_MIN);
  out[0] = view[0] / z;
  out[1] = (-mirror * view[1]) / z;
  return out;
}

function parallax(sample: (u: number, v: number) => number, u: number, v: number, wx: number, wy: number, into?: number[]): number[] {
  const out = into || [0, 0, 0];
  let previousGap = 0;
  let previousZ = 0;
  let hit = 0;
  for (let k = 0; k <= STEPS; k++) {
    const z = RELIEF * (1 - k / STEPS);
    const gap = z - RELIEF * sample(u + wx * z, v + wy * z);
    if (gap <= 0) {
      hit = k === 0 ? z : previousZ + ((z - previousZ) * previousGap) / (previousGap - gap);
      break;
    }
    previousGap = gap;
    previousZ = z;
  }
  out[0] = u + wx * hit;
  out[1] = v + wy * hit;
  out[2] = hit;
  return out;
}

function shiftPx(distance: number, size: number, focalPx: number, tangent: number): number {
  return RELIEF * ((size * focalPx) / distance) * tangent;
}

export const GlyphRelief = { RELIEF, STEPS, VIEW_MIN, SKIP_PX, NORMAL_FOOTPRINT, height, normal, tangentView, parallax, shiftPx };

M.GlyphRelief = GlyphRelief;
