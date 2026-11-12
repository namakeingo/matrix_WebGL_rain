// QualityUnit: the quality level of one unit (a drop, a splash, a strike piece, a grid block, a froxel slice),
// pure: no GL, no page, runs in any thread. A unit is a sphere (centre x, y, z, world radius). Four terms, each
// 0 to 1, none painted:
//   - the footprint: the unit's size on the screen in pixels (2 radius focal / distance). A unit of a pixel or less
//     has less quality (the detail finer than a pixel can go) but the term never goes under FOOTPRINT_MIN, which is
//     over INVISIBLE, so it never hides a unit;
//   - the transmittance of the fog along the path from the eye: never under what the GPU's medium gives (see
//     transmittance), so a unit is hidden only when it is surely invisible;
//   - the coverage not occluded: the frustum (the sphere against the 6 planes of the view-projection, widened by the
//     margin), the water's plane (a unit wholly under the drawn water), and the opaque rectangles of the text's mask
//     (screen pixels: the largest share of the unit's screen square that one rectangle covers);
//   - the blur (a circle of confusion factor, 1: none).
// A unit is hidden (level 0) when any term is under INVISIBLE; otherwise its level is ceil(QUALITY_LEVELS q), 1 to
// QUALITY_LEVELS, q the product of the four. process() runs a range of units from typed arrays with no allocation;
// each unit's level depends only on its own values and the inputs, so any split of a range gives the whole's result.
//
// Changelog:
// 2026-11-12: QualityInputs.mirror (the mirrored view's larger frustum).
// 2026-11-06: new.
import { M } from "../../engine/core";
import { INVISIBLE, QUALITY_LEVELS } from "./types";

// the footprint (pixels) from which a unit has all its detail, and the footprint term's floor
const FOOTPRINT_FULL_PX = 8;
const FOOTPRINT_MIN = 1 / QUALITY_LEVELS;
// hysteresis: a level changes only for a difference over the band, and by at most MAX_STEP a frame
const HYSTERESIS_BAND = 1;
const MAX_STEP = 4;
// the unit's screen square is widened by this many pixels, and by OCCLUDER_RELATIVE of its half size, before it is
// compared with the occluders: a unit is hidden by one only when it is wholly inside it, whatever the sphere's
// outline is, the sphere's projection being a little larger than the circle of radius r focal / depth
const OCCLUDER_PAD_PX = 1;
const OCCLUDER_RELATIVE = 0.01;
// the fog's density (shaders/fog/medium.glsl): sigma exp(-max(y, 0) / DENSITY_SCALE_HEIGHT) (DENSITY_FLOOR + 0.8 s), s from 0
// to 1, so never under DENSITY_FLOOR of the first factor
const DENSITY_FLOOR = 0.2;
const DENSITY_SCALE_HEIGHT = 4;
// the planes' slack: the view-projection is 32 bit, so a sphere touching a plane within its rounding is kept
const PLANE_SLACK = 1e-3;
const PLANE_SLACK_RELATIVE = 1e-6;

export interface QualityInputs {
  // the camera's view-projection, column-major (Camera.viewProjection)
  viewProjection: Float32Array;
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  // the focal length in pixels, and the screen's size in pixels
  focal: number;
  width: number;
  height: number;
  // the fog's clouds' density per metre at their densest (Fog.sigma()) and the air's extinction per metre
  sigma: number;
  air: number;
  // the water's surface height, and whether the water is drawn
  waterDrawn: boolean;
  waterY: number;
  // world metres added to every unit's radius for the frustum test (the glyph's side margins)
  margin: number;
  // the mirrored view's frustum when it is larger than the view's (the reflection's margin, models/reflectionframe.ts): the picture's view-projection and size, at the
  // view's focal length; absent: the mirrored view is the view's own
  mirror?: { viewProjection: Float32Array; width: number; height: number };
  // the blur term, 0 to 1 (1: no blur)
  blur: number;
  // the opaque rectangles in screen pixels, x0 y0 x1 y1 each, and how many
  occluders: Float32Array;
  occluderCount: number;
  // the units' centres and radii
  xs: Float32Array;
  ys: Float32Array;
  zs: Float32Array;
  radii: Float32Array;
}

// the 6 frustum planes (normalised a, b, c, d each), set by setup()
const PLANES = new Float64Array(24);

// the frustum planes of a view-projection: its fourth row plus and minus each of the other three
function setup(vp: Float32Array): void {
  for (let k = 0; k < 6; k++) {
    const row = k >> 1, sign = (k & 1) === 0 ? 1 : -1;
    const a = vp[3] + sign * vp[row], b = vp[7] + sign * vp[4 + row], c = vp[11] + sign * vp[8 + row], d = vp[15] + sign * vp[12 + row];
    const inv = 1 / Math.sqrt(a * a + b * b + c * c);
    PLANES[k * 4] = a * inv;
    PLANES[k * 4 + 1] = b * inv;
    PLANES[k * 4 + 2] = c * inv;
    PLANES[k * 4 + 3] = d * inv;
  }
}

function footprint(pixels: number): number {
  const t = pixels / FOOTPRINT_FULL_PX;
  return t >= 1 ? 1 : t > FOOTPRINT_MIN ? t : FOOTPRINT_MIN;
}

// the light left over a path of `distance` metres: the extinction is the air's plus the clouds' at their lowest
// density on it (the density's floor, at the path's highest point yHigh, where the clouds are thinnest: the path is
// a straight line, so its highest point is an end). The GPU's extinction is never lower at any point of the path,
// so this is never under what the GPU's medium lets through
function transmittance(distance: number, sigma: number, air: number, yHigh: number): number {
  const y = yHigh > 0 ? yHigh : 0;
  return Math.exp(-(air + DENSITY_FLOOR * sigma * Math.exp(-y / DENSITY_SCALE_HEIGHT)) * distance);
}

function levelOf(q: number): number {
  const level = Math.ceil(QUALITY_LEVELS * q);
  return level < 1 ? 1 : level > QUALITY_LEVELS ? QUALITY_LEVELS : level;
}

// the frustum, the water and the occluders: 0 when outside, under the water or wholly inside one rectangle, else
// the share of the unit's screen square no rectangle covers (the planes set by setup())
function coverageOf(x: number, y: number, z: number, r: number, v: QualityInputs): number {
  const reach = r + v.margin;
  for (let k = 0; k < 6; k++) {
    const o = k * 4;
    const dist = PLANES[o] * x + PLANES[o + 1] * y + PLANES[o + 2] * z + PLANES[o + 3];
    if (dist < -(reach + PLANE_SLACK + PLANE_SLACK_RELATIVE * Math.abs(dist))) return 0;
  }
  if (v.waterDrawn && y + r < v.waterY) return 0;
  const count = v.occluderCount;
  if (count === 0) return 1;
  const vp = v.viewProjection;
  const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  // (a centre at or behind the eye's plane has no screen square: nothing is taken as covering it)
  if (!(w > 1e-6)) return 1;
  const px = ((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w + 1) * 0.5 * v.width;
  const py = (1 - (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w) * 0.5 * v.height;
  const half = (r * v.focal) / w * (1 + OCCLUDER_RELATIVE) + OCCLUDER_PAD_PX;
  const x0 = px - half, x1 = px + half, y0 = py - half, y1 = py + half;
  const area = 4 * half * half;
  const rects = v.occluders;
  let covered = 0;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const ox = Math.min(x1, rects[o + 2]) - Math.max(x0, rects[o]);
    const oy = Math.min(y1, rects[o + 3]) - Math.max(y0, rects[o + 1]);
    if (ox > 0 && oy > 0) {
      const share = (ox * oy) / area;
      if (share > covered) covered = share;
    }
  }
  return 1 - covered;
}

function levelWith(x: number, y: number, z: number, r: number, v: QualityInputs): number {
  const cover = coverageOf(x, y, z, r, v);
  if (cover < INVISIBLE) return 0;
  const blur = v.blur;
  if (blur < INVISIBLE) return 0;
  const dx = x - v.eyeX, dy = y - v.eyeY, dz = z - v.eyeZ;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let fog = 1;
  if (v.sigma > 0 || v.air > 0) {
    fog = transmittance(distance, v.sigma, v.air, y > v.eyeY ? y : v.eyeY);
    if (fog < INVISIBLE) return 0;
  }
  const pixels = distance > 1e-6 ? (2 * r * v.focal) / distance : 1e9;
  return levelOf(footprint(pixels) * fog * cover * blur);
}

function coverage(x: number, y: number, z: number, radius: number, inputs: QualityInputs): number {
  setup(inputs.viewProjection);
  return coverageOf(x, y, z, radius, inputs);
}

function unit(x: number, y: number, z: number, radius: number, inputs: QualityInputs): number {
  setup(inputs.viewProjection);
  return levelWith(x, y, z, radius, inputs);
}

// the level a unit shows this frame: a unit that becomes hidden is hidden at once and one that shows takes its level
// at once; otherwise the level moves only for a change over the band, by at most MAX_STEP toward the new one
function hysteresis(last: number, next: number): number {
  if (next === 0) return 0;
  if (last === 0) return next;
  const diff = next - last;
  if (diff <= HYSTERESIS_BAND && diff >= -HYSTERESIS_BAND) return last;
  return diff > 0 ? last + (diff < MAX_STEP ? diff : MAX_STEP) : last - (-diff < MAX_STEP ? -diff : MAX_STEP);
}

// a table of QUALITY_LEVELS + 1 values for the levels from the anchors [level, value] (levels 1 to QUALITY_LEVELS - 1
// in any order, values 0 to 1): entry 0 is 0 (hidden), the last 1 (full), linear between the anchors, never falling
function levelTable(anchors: Array<[number, number]>): Float64Array {
  const table = new Float64Array(QUALITY_LEVELS + 1);
  const points = anchors
    .filter((a) => a[0] > 0 && a[0] < QUALITY_LEVELS)
    .sort((a, b) => a[0] - b[0]);
  let level = 0, value = 0;
  const to = (nextLevel: number, nextValue: number) => {
    const v1 = Math.min(1, Math.max(value, nextValue));
    for (let l = level + 1; l <= nextLevel; l++) table[l] = value + ((v1 - value) * (l - level)) / (nextLevel - level);
    level = nextLevel;
    value = v1;
  };
  for (const a of points) {
    if (a[0] > level) to(a[0], a[1]);
  }
  to(QUALITY_LEVELS, 1);
  return table;
}

// the levels of the units from..to-1 into outLevels (0 hidden), nothing allocated
function process(inputs: QualityInputs, from: number, to: number, outLevels: Uint8Array): void {
  setup(inputs.viewProjection);
  const xs = inputs.xs, ys = inputs.ys, zs = inputs.zs, radii = inputs.radii;
  for (let i = from; i < to; i++) outLevels[i] = levelWith(xs[i], ys[i], zs[i], radii[i], inputs);
}

export const QualityUnit = {
  INVISIBLE,
  QUALITY_LEVELS,
  FOOTPRINT_FULL_PX,
  FOOTPRINT_MIN,
  HYSTERESIS_BAND,
  MAX_STEP,
  OCCLUDER_PAD_PX,
  DENSITY_FLOOR,
  DENSITY_SCALE_HEIGHT,
  footprint,
  transmittance,
  coverage,
  levelOf,
  unit,
  hysteresis,
  levelTable,
  process,
};

M.QualityUnit = QualityUnit;
