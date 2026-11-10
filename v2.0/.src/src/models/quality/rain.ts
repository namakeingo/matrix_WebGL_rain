// QualityRain: the rain's adapter for the quality model (models/quality/unit.ts), pure: no GL, no page, runs in any
// thread from typed arrays. For a range of drops at a step it works out each drop's places with the rain's own
// arithmetic (RainLayout.total / headY, the rain's x by fall, Floor.heightAt) and gives the quality model:
//   - a SPHERE around the drop's whole segment (the current fall's cells, from the head up its trail: the trail's
//     cells, at most as many as the head's rows from the fall's start), centred at the segment's middle, its radius
//     half the length plus the glyph's half diagonal, so it holds every cell: the drop is hidden only when all of it
//     is (frustum, water, occluders), whatever its size on the screen;
//   - a sphere for the last fall's trail still fading where it landed, while the head is within the trail's cells of
//     its fall's start (centred on its middle, from the floor up the trail's cells not yet faded), the drop hidden
//     only when both spheres are;
//   - ONE glyph-sized unit (radius = the cell's half diagonal) at the middle of the first segment not hidden: its
//     footprint, fog and blur give the level (a far drop's glyph is under a pixel: a lower level), at least 1 for a
//     drop not hidden. Level 0 is hidden.
// The model's fog term reads the distance to a unit's centre, while the segment's nearest point is a little nearer
// (by about the segment's length squared over twice the distance): the adapter gives it the fog's extinctions scaled
// by FOG_SLACK (under 1), which covers that difference, so a drop is never hidden by fog that its nearest cell is
// seen through. The range is processed in chunks of CHUNK drops over fixed scratch arrays, no allocation in the loop;
// each drop's level depends only on its own values and the frame's, so any split of a range gives the whole's levels.
// The mirrored view (the drops' mirror images drawn into the reflection picture, seen from the same camera with each cell's y
// mirrored about its floor: y' = 2 floor - y) has its own units: a job of 2 x `drops` units, units 0 .. drops-1 the drops'
// levels in the direct view, units drops .. 2 drops-1 the same drops' levels in the mirrored view (params.drops; without it every
// unit is direct). The mirror picture is read by the water at places that reflected rays reach, and its second attachment holds the
// distance of the nearest ink (where the rays land), written wherever a glyph's ink is, however faint its light: so the mirrored
// view hides a drop only when it draws nothing at all (outside the frustum), never by fog, footprint, blur, the water or the
// text's rectangles (the water reads the picture away from the pixel a rectangle covers).
// qualityRainJob has the signature of a quality pool's job (statics, params, from, to, out).
//
// Changelog:
// 2026-11-06: new.
// 2026-11-06: the pool's job kind "rain" registered.
// 2026-11-06: the mirrored view's levels (units drops .. 2 drops-1, params.drops): the frustum only.
// 2026-11-07: QualityRain.Lod: a trail's cell whose light is under LIGHT_CUT is not drawn (the rain's vertex shader, uLightCut).
// 2026-11-07: QualityRain.Lod.trailCells (the trail's instances by level, TRAIL_KEEP) and fogOnce (one fog read from FOG_ONCE_DISTANCE).
// 2026-11-06: the last fall's trail (remnant) at the previous fall's place across (remnantX), was the present fall's.
import { M } from "../../engine/core";
import { RainLayout } from "../rainlayout";
import { Floor } from "../floor";
import type { FloorView } from "../floor";
import { QualityUnit } from "./unit";
import { QualityJobs } from "./jobs";
import { QUALITY_LEVELS } from "./types";
import type { QualityInputs } from "./unit";

// drops processed at a time over the scratch arrays
const CHUNK = 256;
// the cell's half diagonal: the glyph's radius
const GLYPH_RADIUS = RainLayout.CELL * Math.SQRT1_2;
// the fog's extinctions as given to the model (the segment's nearest point is nearer than the sphere's centre)
const FOG_SLACK = 0.98;

// the static data: the layout's arrays (4 a drop: distance, speed, phase, rows) and the trail's cells it was laid out for
export interface RainQualityStatic {
  layout: ArrayLike<number>;
  trail: number;
}

// a frame's inputs for the quality model, without the units' arrays
export type QualityFrame = Omit<QualityInputs, "xs" | "ys" | "zs" | "radii">;

export interface RainQualityParams {
  // the drops' count when the job's units are the direct view's then the mirrored view's (absent: every unit is direct)
  drops?: number;
  step: number;
  floor: FloorView;
  inputs: QualityFrame;
}

// a drop's places at a step
export interface RainPlace {
  x: number;
  z: number;
  distance: number;
  // rows from the top of its fall, and the fall's number
  head: number;
  cycle: number;
  // the head cell's bottom, and the top of the trail's cells above it
  headY: number;
  topY: number;
  // the floor's height at its distance, and the top of the last fall's trail still fading there (NaN: none)
  floorY: number;
  remnantTopY: number;
  // the last fall's place across (its trail still fading where it landed is at the previous fall's x, not the present one)
  remnantX: number;
}

// the rain's place across in a fall (effects/rain.ts, Rain.x)
function xOf(i: number, cycle: number, distance: number): number {
  const across = M.hash(((Math.imul(i, 2654435761) ^ Math.imul(cycle, 40503)) + RainLayout.SEED) >>> 0) / 4294967296;
  return (across * 2 - 1) * distance * M.Camera.SPAN;
}

function place(stat: RainQualityStatic, params: RainQualityParams, i: number, into: RainPlace): RainPlace {
  const data = stat.layout;
  const rows = data[i * 4 + 3];
  const distance = data[i * 4];
  const total = RainLayout.total(data, i, params.step);
  const cycle = Math.floor(total / rows);
  const head = total - cycle * rows;
  const f = params.floor;
  const floorY = Floor.heightAt(f.kind, distance, f.eyeHeight, f.halfFov, f.pitch);
  const headY = RainLayout.headY(data, i, params.step, f);
  const cells = Math.min(stat.trail, head + 1);
  into.x = xOf(i, cycle, distance);
  into.z = -distance;
  into.distance = distance;
  into.head = head;
  into.cycle = cycle;
  into.headY = headY;
  into.topY = headY + cells * RainLayout.CELL;
  into.floorY = floorY;
  into.remnantTopY = head < stat.trail ? floorY + (stat.trail - head) * RainLayout.CELL : NaN;
  into.remnantX = head < stat.trail ? xOf(i, cycle - 1, distance) : NaN;
  return into;
}

// the scratch: the units given to the model, its levels, and each drop's middles
const SCRATCH_PLACE: RainPlace = { x: 0, z: 0, distance: 0, head: 0, cycle: 0, headY: 0, topY: 0, floorY: 0, remnantTopY: 0, remnantX: 0 };
const UNITS: QualityInputs = {
  viewProjection: new Float32Array(16),
  eyeX: 0,
  eyeY: 0,
  eyeZ: 0,
  focal: 1,
  width: 1,
  height: 1,
  sigma: 0,
  air: 0,
  waterDrawn: false,
  waterY: 0,
  margin: 0,
  blur: 1,
  occluders: new Float32Array(0),
  occluderCount: 0,
  xs: new Float32Array(CHUNK),
  ys: new Float32Array(CHUNK),
  zs: new Float32Array(CHUNK),
  radii: new Float32Array(CHUNK),
};
const LEVELS = new Uint8Array(CHUNK);
const BODY = new Uint8Array(CHUNK);
const REMNANT = new Uint8Array(CHUNK);
const MIDDLE_Y = new Float64Array(CHUNK);
const REMNANT_Y = new Float64Array(CHUNK);
const REMNANT_X = new Float64Array(CHUNK);
const PLACE_X = new Float64Array(CHUNK);
const PLACE_Z = new Float64Array(CHUNK);
const WITH_REMNANT = new Uint8Array(CHUNK);
const REMNANT_HALF = new Float64Array(CHUNK);
const LIST = new Int32Array(CHUNK);

// drops drop0 .. drop0+m-1 (m at most CHUNK) into out[out0 ..]; mirrored: seen in the mirror image (the units' y about the floor)
function processChunk(stat: RainQualityStatic, params: RainQualityParams, drop0: number, m: number, out: Uint8Array, out0: number, mirrored: boolean): void {
  const from = out0;
  const xs = UNITS.xs, ys = UNITS.ys, zs = UNITS.zs, radii = UNITS.radii;
  // pass 1: the segments' spheres
  for (let j = 0; j < m; j++) {
    const p = place(stat, params, drop0 + j, SCRATCH_PLACE);
    const half = (p.topY - p.headY) * 0.5;
    PLACE_X[j] = p.x;
    PLACE_Z[j] = p.z;
    MIDDLE_Y[j] = mirrored ? 2 * p.floorY - (p.headY + half) : p.headY + half;
    xs[j] = p.x;
    ys[j] = MIDDLE_Y[j];
    zs[j] = p.z;
    radii[j] = half + GLYPH_RADIUS;
    if (p.head < stat.trail) {
      WITH_REMNANT[j] = 1;
      REMNANT_Y[j] = p.floorY + (mirrored ? -1 : 1) * (p.remnantTopY - p.floorY) * 0.5;
      REMNANT_X[j] = p.remnantX;
      REMNANT_HALF[j] = (p.remnantTopY - p.floorY) * 0.5;
    } else {
      WITH_REMNANT[j] = 0;
    }
  }
  QualityUnit.process(UNITS, 0, m, BODY);
  // pass 2: the last falls' trails still fading (only the drops that have one)
  let count = 0;
  for (let j = 0; j < m; j++) {
    REMNANT[j] = 0;
    if (WITH_REMNANT[j] === 1) {
      xs[count] = REMNANT_X[j];
      ys[count] = REMNANT_Y[j];
      zs[count] = PLACE_Z[j];
      radii[count] = REMNANT_HALF[j] + GLYPH_RADIUS;
      LIST[count] = j;
      count++;
    }
  }
  if (count > 0) {
    QualityUnit.process(UNITS, 0, count, LEVELS);
    for (let k = 0; k < count; k++) REMNANT[LIST[k]] = LEVELS[k];
  }
  // pass 3: the glyph-sized unit at the middle of the first segment not hidden
  count = 0;
  for (let j = 0; j < m; j++) {
    if (BODY[j] > 0 || REMNANT[j] > 0) {
      xs[count] = BODY[j] > 0 ? PLACE_X[j] : REMNANT_X[j];
      ys[count] = BODY[j] > 0 ? MIDDLE_Y[j] : REMNANT_Y[j];
      zs[count] = PLACE_Z[j];
      radii[count] = GLYPH_RADIUS;
      LIST[count] = j;
      count++;
    } else {
      out[from + j] = 0;
    }
  }
  if (count > 0) {
    QualityUnit.process(UNITS, 0, count, LEVELS);
    for (let k = 0; k < count; k++) out[from + LIST[k]] = LEVELS[k] > 0 ? LEVELS[k] : 1;
  }
}
// the model's inputs for a view: the frame's for the direct view; for the mirrored view only the frustum counts (no fog, no
// blur, no water, no rectangles)
function setInputs(params: RainQualityParams, mirrored: boolean): void {
  const f = params.inputs;
  UNITS.viewProjection = f.viewProjection;
  UNITS.eyeX = f.eyeX;
  UNITS.eyeY = f.eyeY;
  UNITS.eyeZ = f.eyeZ;
  UNITS.focal = f.focal;
  UNITS.width = f.width;
  UNITS.height = f.height;
  UNITS.sigma = mirrored ? 0 : f.sigma * FOG_SLACK;
  UNITS.air = mirrored ? 0 : f.air * FOG_SLACK;
  UNITS.waterDrawn = mirrored ? false : f.waterDrawn;
  UNITS.waterY = f.waterY;
  UNITS.margin = f.margin;
  UNITS.blur = mirrored ? 1 : f.blur;
  UNITS.occluders = f.occluders;
  UNITS.occluderCount = mirrored ? 0 : f.occluderCount;
}

// the levels of units from..to-1 at the step into out (0: hidden): the drops' direct levels, and from params.drops on the
// mirrored view's of drop (unit - drops)
function process(stat: RainQualityStatic, params: RainQualityParams, from: number, to: number, out: Uint8Array): void {
  const n = params.drops === undefined ? Infinity : params.drops;
  const directEnd = Math.min(to, n);
  if (from < directEnd) {
    setInputs(params, false);
    for (let a = from; a < directEnd; a += CHUNK) {
      const b = Math.min(a + CHUNK, directEnd);
      processChunk(stat, params, a, b - a, out, a, false);
    }
  }
  const mirrorFrom = Math.max(from, n);
  if (mirrorFrom < to) {
    setInputs(params, true);
    for (let a = mirrorFrom; a < to; a += CHUNK) {
      const b = Math.min(a + CHUNK, to);
      processChunk(stat, params, a - n, b - a, out, a, true);
    }
  }
}

// a quality pool's job (models/quality/jobs.ts): the same, with the pool's argument order
export function qualityRainJob(statics: RainQualityStatic, params: RainQualityParams, from: number, to: number, out: Uint8Array): void {
  process(statics, params, from, to, out);
}

// The rain's level of detail. The glyph's own texture level needs no table: the atlas has a full mip chain, trilinear (the
// fragment shader's texture() reads the level from the quad's own screen footprint per pixel), so a far drop's glyph is already
// sampled at the level its footprint asks for. What a far drop still costs is its trail's cells: a cell's light is the trail's
// linear fade (1 - age / trail) times the fog's transmittance at it, and a cell under LIGHT_CUT (half of INVISIBLE, so the cut
// is a subset of what the model calls invisible, with the head's gain and the 8-bit rounding in hand) draws nothing a viewer
// can see. The head (age 0) is never cut: its light is whitened and gained. 0 turns the cut off (full detail).
const LIGHT_CUT = 0.5 / 255;

// a cell's light before ink and colour: its fade times the fog's transmittance
function cellLight(age: number, trail: number, fog: number): number {
  return (1 - age / trail) * fog;
}

// is the cell of this age cut at this cut level (the vertex shader's rule)
function cellCut(age: number, trail: number, fog: number, cut: number): boolean {
  return age > 0 && cellLight(age, trail, fog) < cut;
}

// how many of a trail's cells are kept (the head and every older cell not cut)
function visibleCells(trail: number, fog: number, cut: number): number {
  let n = 0;
  for (let age = 0; age < trail; age++) if (!cellCut(age, trail, fog, cut)) n++;
  return n;
}

// The level-driven trail. A cell whose quad is under a pixel lights a pixel only by the share of it the quad covers (a side of s pixels:
// s^2), so a cut cell's expected error is at most fade x fog x min(1, s^2). A drop's level L is ceil(40 q), q the product of the footprint
// term and terms at most 1, so the footprint term is at most L / 40: the glyph unit's pixels at most FOOTPRINT_FULL_PX L / 40, the quad's
// side CELL / (2 GLYPH_RADIUS) of that, its area that squared, widened by AREA_SLACK (the cells nearer the eye than the unit's centre
// are bigger: depth ratio about 1.3 at the nearest drop, squared). TRAIL_KEEP[level] is the fraction of the trail (by age) kept: the
// ages with (1 - age / trail) x min(1, area bound) >= LIGHT_CUT; level 0 keeps nothing, level 40 everything.
const AREA_SLACK = 2;
const TRAIL_KEEP = new Float64Array(QUALITY_LEVELS + 1);
for (let level = 1; level < QUALITY_LEVELS; level++) {
  const side = ((QualityUnit.FOOTPRINT_FULL_PX * level) / QUALITY_LEVELS) * RainLayout.CELL / (2 * GLYPH_RADIUS);
  const area = Math.min(1, AREA_SLACK * side * side);
  TRAIL_KEEP[level] = Math.max(0, 1 - LIGHT_CUT / area);
}
TRAIL_KEEP[QUALITY_LEVELS] = 1;

// the trail's instances (ages 0 .. n-1) drawn for a drop of a level: the head, and the ages within the table's fraction
function trailCells(level: number, trail: number): number {
  if (level <= 0) return 0;
  if (level >= QUALITY_LEVELS) return trail;
  // (the table's fraction is in age / trail: ages up to floor(keep trail), and one more for the rounding of the multiplication)
  const n = Math.floor(TRAIL_KEEP[level] * trail + 1e-9) + 1;
  return n < 1 ? 1 : n > trail ? trail : n;
}

// from this distance (metres) one fog read serves a glyph's four corners: the transmittance's change over the cell's half diagonal in
// depth is at most delta / (e d) of a light of at most 1, under half a level of 255 from about 4.2 m
const FOG_ONCE_DISTANCE = 4.5;
function fogOnce(distance: number): boolean {
  return distance >= FOG_ONCE_DISTANCE;
}

export const QualityRainLod = { LIGHT_CUT, AREA_SLACK, TRAIL_KEEP, FOG_ONCE_DISTANCE, cellLight, cellCut, visibleCells, trailCells, fogOnce };

export const QualityRain = { Lod: QualityRainLod, CHUNK, GLYPH_RADIUS, FOG_SLACK, place, process };

// the pool's kind "rain": the statics' arrays are Float32Arrays, so the trail's cells come as the one value of `trail`
QualityJobs.register("rain", (statics, params, from, to, out) => {
  process({ layout: statics.layout, trail: statics.trail[0] }, params as unknown as RainQualityParams, from, to, out);
});

M.QualityRain = QualityRain;
