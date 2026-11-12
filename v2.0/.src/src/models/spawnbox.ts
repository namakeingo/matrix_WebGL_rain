// SpawnBox: the space the rain and the lightning may spawn in, as a pure model (no GL, no page, no clock: importable in any thread).
// The box is limited on each side to what the camera sees or could see:
// - Mouse parallax off: the camera's view (nothing outside it is eligible).
// - Mouse parallax on: the view extended in every direction by the range the current setting reaches (MouseParallax.reach: Amount x REACH x the mode's limit: a yaw and a pitch in
//   "rotation", an eye shift in metres in "translation"; the limits themselves are the parallax's own and stay as they are).
// - Nothing is behind the eye (a distance ahead of 0 or less has no width), and the nearest distance is the rain's own rule (DISTANCE_SIZE over Font size Max), given in `near`.
// - The top follows the CURRENT pitch plus the pitch the parallax reaches, never the highest pitch of any setting (Camera.ceilingAt).
// The box is inside the world (Camera.SPAN, the width of the fog's grid, the water's grid, the shade bake and the parallax's limits: those stay the world's).
//
// A box is { slope, shift, span, planeEye, planePitch, halfFov, near, far, viewSlope, viewEye, viewTopSlope }: at a distance ahead z (m, along -z) its half width is
// min(span x z, slope x z + shift) (halfWidth), its top height planeEye + z x tan(planePitch + halfFov) (top).
// - slope: the largest x / z of the view's corner rays over the pitches pitch +- pitchReach and the yaws +- yawReach (the exact corner rays of the pitched and turned frustum,
//   the lateral component over the forward one: a pitched view is wider at its top rows); shift: the eye's x reach (metres, all distances).
// - planeEye, planePitch: the top as the plane the falls start from (a SpawnPlane of models/rainlayout.ts: eyeHeight + z x tan(pitch + halfFov)): the eye's height plus its y reach,
//   and the angle whose tangent is the largest rise per forward metre of the top corner rays over the same pitches and yaws.
// - viewSlope, viewEye, viewTopSlope: the plain view's (no reach): its half width over z, the eye's height and its top's rise over z, what the density is kept against.
// - make(params, into?): a box from { aspect, halfFov, pitch (the base tilt, radians), eyeHeight, yaw, pitchReach (radians), eyeX, eyeY (metres: the reach), near, far }.
// - halfWidth(box, z), widthAt(slope, shift, span, z), top(box, z): the half width at a distance (widthAt: from the numbers, no allocation), the top's height there.
// - densityFactor(box): the drops the pool needs per drop wanted in view, so that the drops per pixel in the view stay what they are: the rain's pool was the drops wanted over the
//   share of the world's width the view took (min(1, aspect x tan(halfFov) / SPAN)) falling from the world's ceiling; the box's share is the view's part of its width (the mean over
//   the distances the drops are at, weighted as they are: as many per square metre) and its fall starts at its top, so its factor is (the mean part of a fall the view held under the
//   world's ceiling) over (the box's share x the mean part it holds under the box's top).
// - sees(view, x, y, z): whether a place is within the view's width at its distance (the turned and pitched view's frustum sides, the eye where the parallax has it).
//
// Changelog:
// 2026-11-12: new.
import { M } from "../engine/core";

// the angle the corner rays are not followed past (a ray this near the side has no forward distance worth a box: the world's width is the limit)
const MOST_ANGLE = 1.4;
// a forward component under this is no forward component (the ray points sideways or back: the world's width)
const EPSILON = 1e-4;
// the distances the density's mean is taken at (as many per square metre: equal steps of the distance squared)
const SAMPLES = 32;

export interface BoxParams {
  aspect: number;
  halfFov: number;
  pitch: number;
  eyeHeight: number;
  yaw: number;
  pitchReach: number;
  eyeX: number;
  eyeY: number;
  near: number;
  far: number;
}

// the sides of a box: all the lateral limit needs (what the shader, the strikes' plan and the quality jobs are given)
export interface BoxLimits {
  slope: number;
  shift: number;
  span: number;
}

export interface SpawnBoxData extends BoxLimits {
  planeEye: number;
  planePitch: number;
  halfFov: number;
  near: number;
  far: number;
  viewSlope: number;
  viewEye: number;
  viewTopSlope: number;
}

// a view for `sees`: the eye's x and height, the tilt (the pitch with the rotation mode's shift), the yaw, the window's aspect and the half field of view
export interface SeenView {
  eyeX: number;
  eyeY: number;
  tilt: number;
  yaw: number;
  aspect: number;
  halfFov: number;
}

// the ray through the view's corner (u, v: the horizontal and vertical tangents) for a pitch p and a yaw psi: its x and its height over the forward distance (along -z); Infinity
// when it does not go forward
function cornerX(p: number, psi: number, u: number, v: number): number {
  const c = Math.cos(p);
  const s = Math.sin(p);
  const cy = Math.cos(psi);
  const sy = Math.sin(psi);
  const forward = c * cy - u * sy - v * s * cy;
  return forward > EPSILON ? Math.abs((c * sy + u * cy - v * s * sy) / forward) : Infinity;
}

function cornerRise(p: number, psi: number, u: number, v: number): number {
  const c = Math.cos(p);
  const s = Math.sin(p);
  const cy = Math.cos(psi);
  const sy = Math.sin(psi);
  const forward = c * cy - u * sy - v * s * cy;
  return forward > EPSILON ? (s + v * c) / forward : Infinity;
}

// the largest of the corner rays' x over z and rise over z for the pitches pitch +- reach and the yaws +- yaw
function slopes(pitch: number, pitchReach: number, yaw: number, tanH: number, tanV: number): { side: number; rise: number } {
  let side = 0;
  let rise = -Infinity;
  for (let a = -1; a <= 1; a += 2) {
    const p = pitch + a * pitchReach;
    for (let b = -1; b <= 1; b += 2) {
      const psi = b * yaw;
      for (let k = -1; k <= 1; k += 2) {
        const u = k * tanH;
        for (let l = -1; l <= 1; l += 2) {
          side = Math.max(side, cornerX(p, psi, u, l * tanV));
        }
        rise = Math.max(rise, cornerRise(p, psi, u, tanV));
      }
    }
  }
  return { side, rise };
}

function make(p: BoxParams, into?: SpawnBoxData): SpawnBoxData {
  const out = into || ({} as SpawnBoxData);
  const span = M.Camera.SPAN;
  const tanH = p.aspect * Math.tan(p.halfFov);
  const tanV = Math.tan(p.halfFov);
  const reach = slopes(p.pitch, Math.max(0, p.pitchReach), Math.max(0, p.yaw), tanH, tanV);
  const plain = slopes(p.pitch, 0, 0, tanH, tanV);
  out.slope = Math.min(span, reach.side);
  out.shift = Math.max(0, p.eyeX);
  out.span = span;
  out.planeEye = p.eyeHeight + Math.max(0, p.eyeY);
  out.planePitch = Math.min(Math.atan(reach.rise), MOST_ANGLE) - p.halfFov;
  out.halfFov = p.halfFov;
  out.near = p.near;
  out.far = p.far;
  out.viewSlope = Math.min(span, plain.side);
  out.viewEye = p.eyeHeight;
  out.viewTopSlope = plain.rise;
  return out;
}

// the half width of a box's sides at a distance ahead z (nothing at or behind the eye): no allocation, for the loops over drops
function widthAt(slope: number, shift: number, span: number, z: number): number {
  return z > 0 ? Math.min(span * z, slope * z + shift) : 0;
}

// the box's half width at a distance ahead z
function halfWidth(b: BoxLimits, z: number): number {
  return widthAt(b.slope, b.shift, b.span, z);
}

// the box's top at a distance ahead z
function top(b: SpawnBoxData, z: number): number {
  return b.planeEye + z * Math.tan(b.planePitch + b.halfFov);
}

// the drops in the pool per drop wanted in view (see the header), over the distances from near to far
function densityFactor(b: SpawnBoxData): number {
  const near2 = b.near * b.near;
  const range2 = b.far * b.far - near2;
  let share = 0;
  let fillBox = 0;
  let fillWorld = 0;
  for (let k = 0; k < SAMPLES; k++) {
    const d = Math.sqrt(near2 + (range2 * (k + 0.5)) / SAMPLES);
    const width = halfWidth(b, d);
    share += width > 0 ? Math.min(1, (b.viewSlope * d) / width) : 1;
    const view = b.viewEye + d * b.viewTopSlope;
    fillBox += Math.min(1, view / Math.max(top(b, d), 1e-6));
    fillWorld += Math.min(1, view / M.Camera.ceilingAt(d));
  }
  return fillWorld / SAMPLES / ((share / SAMPLES) * (fillBox / SAMPLES));
}

// whether a place is within the view's width at its distance: ahead of the eye and within the frustum's sides, whatever its height
function sees(v: SeenView, x: number, y: number, z: number): boolean {
  const c = Math.cos(v.tilt);
  const s = Math.sin(v.tilt);
  const cy = Math.cos(v.yaw);
  const sy = Math.sin(v.yaw);
  const rx = x - v.eyeX;
  const ry = y - v.eyeY;
  const along = rx * c * sy + ry * s - z * c * cy;
  const lateral = rx * cy + z * sy;
  return along > EPSILON && Math.abs(lateral) <= v.aspect * Math.tan(v.halfFov) * along;
}

export const SpawnBox = { MOST_ANGLE, SAMPLES, make, widthAt, halfWidth, top, densityFactor, sees };

M.SpawnBox = SpawnBox;
