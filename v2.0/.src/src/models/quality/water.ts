// QualityWater: whether the view has any water in it, pure: no GL, no page, runs in any thread from the view-projection alone.
// The water's pixels are the pixels whose ray from the eye points below the horizon (the shader's `d.y < 0`); the reflection's
// picture is read only at them, and the waves' highest wave (the maxima's chain) only by the glyphs' discard tests, which read
// the waves at places on the water plane, and by the water's own shadow marches. The eye is above the water, so a place on the
// water plane is always seen along a downward ray: a view with no downward ray has no water pixel and reads neither. The frustum
// is a pyramid, so its lowest ray is one of its four corner rays (the cross product of two neighbouring side planes); the view has
// water unless even that one points up by more than EPSILON (a slack, so a corner on the horizon counts as water). The level is
// QUALITY_LEVELS for a view with water and 0 without; every unit of the job has the same answer (the job has one unit).
//
// The wallpaper's own camera (Parallax: the horizon at most 95% down the screen) always has water in the lowest rows, so for
// its cameras the rule never hides anything; it hides for a camera that looks up past the bottom edge's horizon.
//
// The water's own visibility: even the nearest water (straight down, the eye's height away) with a fog transmittance under TAIL_T (the fog
// model's constant: its light is invisible by 1/255 through radiance, exposure and tone) means no water pixel shows, so level 0 (the
// mirrored picture's pass is skipped). Inputs without the eye or the fog count as clear air.
//
// The mirrored picture's resolution (reflectionShift): a read at 2^shift lower resolution (each texel the mean of its block, read at the
// block of the full texel's place) is off by at most readBound(shift, G) = 2 (2^shift - 1) G, G the largest step between two
// neighbouring texels (READ_GRADIENT: the radiance the fog model takes the brightest ink at). Times the transmittance it must stay under
// LIGHT_TOL (QualityWaves): that holds only for T of about 5e-6, under TAIL_T, where the water is already hidden. So the shift is 0 for
// every visible water and the picture's resolution is never lowered.
//
// Changelog:
// 2026-11-07: level 0 for a view whose nearest water the fog hides; readBound and reflectionShift (the resolution's bound).
// 2026-11-06: new.
import { M } from "../../engine/core";
import { QUALITY_LEVELS } from "./types";
import { QualityJobs } from "./jobs";
import { QualityFog } from "./fog";
import { QualityUnit } from "./unit";
import { QualityWaves } from "./waves";
import type { QualityViewInputs, EffectQuality } from "./types";

// the slack (the sine of the elevation) under which a corner ray on or just above the horizon still counts as water
const EPSILON = 1e-4;

// the side planes' normals (left, right, bottom, top) of a view-projection, column-major: the fourth row plus and minus the first and second
const NORMALS = new Float64Array(12);
const CORNER = new Float64Array(3);

function planes(vp: ArrayLike<number>): void {
  for (let k = 0; k < 4; k++) {
    const row = k >> 1;
    const sign = (k & 1) === 0 ? 1 : -1;
    NORMALS[k * 3] = vp[3] + sign * vp[row];
    NORMALS[k * 3 + 1] = vp[7] + sign * vp[4 + row];
    NORMALS[k * 3 + 2] = vp[11] + sign * vp[8 + row];
  }
  // (the order is left, right (row 0), bottom, top (row 1))
}

// the direction of the edge where side planes a and b meet, pointing into the view (away from the eye along the forward side); its y over its length
function cornerY(a: number, b: number, c: number, d: number): number {
  const ax = NORMALS[a * 3], ay = NORMALS[a * 3 + 1], az = NORMALS[a * 3 + 2];
  const bx = NORMALS[b * 3], by = NORMALS[b * 3 + 1], bz = NORMALS[b * 3 + 2];
  const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
  CORNER[0] = x;
  CORNER[1] = y;
  CORNER[2] = z;
  // the other two planes must hold the direction on their inside: flip it if they do not
  const inside = (x * (NORMALS[c * 3] + NORMALS[d * 3]) + y * (NORMALS[c * 3 + 1] + NORMALS[d * 3 + 1]) + z * (NORMALS[c * 3 + 2] + NORMALS[d * 3 + 2]));
  const length = Math.sqrt(x * x + y * y + z * z);
  return length > 0 ? ((inside >= 0 ? 1 : -1) * y) / length : 0;
}

// the lowest ray of the view's four corners: its y over its length (negative: points down)
function lowestRayY(vp: ArrayLike<number>): number {
  planes(vp);
  // planes: 0 left, 1 right, 2 bottom, 3 top
  const lowest = Math.min(cornerY(0, 2, 1, 3), cornerY(1, 2, 0, 3), cornerY(1, 3, 0, 2), cornerY(0, 3, 1, 2));
  return lowest;
}

// whether the view has any water pixel
function seen(vp: ArrayLike<number>): boolean {
  return lowestRayY(vp) < EPSILON;
}

// the radiance the mirrored picture's brightest ink is taken at, the most a read at 2^shift lower resolution is off by, and the largest
// shift (to 2: a quarter) whose error times the water's brightest transmittance stays under the light's tolerance
const READ_GRADIENT = QualityFog.TAIL_RADIANCE;
function readBound(shift: number, gradient: number): number {
  return 2 * ((1 << shift) - 1) * gradient;
}
function reflectionShift(transmittance: number): number {
  let shift = 0;
  while (shift < 2 && readBound(shift + 1, READ_GRADIENT) * transmittance <= QualityWaves.LIGHT_TOL) {
    shift++;
  }
  return shift;
}

// whether the nearest water's fog leaves any light: the eye's height away along the ray straight down
function fogged(inputs: Partial<QualityViewInputs>): boolean {
  const eyeY = inputs.eyeY;
  if (eyeY === undefined || !(eyeY > 0)) {
    return false;
  }
  return QualityUnit.transmittance(eyeY, inputs.sigma || 0, inputs.air || 0, eyeY) < QualityFog.TAIL_T;
}

// the pool's job: every unit of the range gets the view's answer
function process(params: { inputs: Pick<QualityViewInputs, "viewProjection"> & Partial<QualityViewInputs>; lod?: boolean }, from: number, to: number, out: Uint8Array): void {
  // (the fog's hiding is a level of detail: with the switch off only the view's own answer)
  const level = seen(params.inputs.viewProjection) && (params.lod === false || !fogged(params.inputs)) ? QUALITY_LEVELS : 0;
  for (let i = from; i < to; i++) {
    out[i] = level;
  }
}

// whether an effect skips its work for the frame: the result says nothing is seen, it has units (a result of the pool, not the full-quality
// default) and was made for the camera as it is now (its version, the camera not changed since)
function skips(q: Pick<EffectQuality, "visible" | "units"> | undefined, madeFor: number, version: number, dirty: boolean): boolean {
  return !!q && !q.visible && q.units > 0 && madeFor === version && !dirty;
}

export const QualityWater = { EPSILON, QUALITY_LEVELS, READ_GRADIENT, readBound, reflectionShift, lowestRayY, seen, process, skips };

QualityJobs.register("water", (statics, params, from, to, out) => {
  process(params as unknown as { inputs: Pick<QualityViewInputs, "viewProjection"> & Partial<QualityViewInputs>; lod?: boolean }, from, to, out);
});

// (the namespace's type does not list it: the tests and the effects read it through their import or this cast)
M.QualityWater = QualityWater;
