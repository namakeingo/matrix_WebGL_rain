// The quality model of the waves and the water's flat path, pure: no GL, no page, importable in any thread. The waves' own job is the
// water's "seen" rule (models/quality/water.ts): the highest-wave search is made only for a view that has water in it; the simulation
// itself never stops. No exact rule hides anything per block (the strikes' shadow rays read the blocks beyond the view); what lowers
// work per pixel is the water shader's flat path (shaders/water/fragment.glsl, flatWater), whose arithmetic this file states:
//
// - The shader's normal is the mean slope over a box of half sizes w (metres across x and along the distance, at least a cell each):
//   per axis the heights at the box's two sides differ by at most twice the highest wave H over the box, so |slope| <= H / w, and the
//   normal differs from straight up by at most eps = H * sqrt(1 / wx^2 + 1 / wz^2) (normalizing only shortens a difference).
// - H is the highest wave of all (the maxima's chain), or, when the box a cell more each way (bilinear reads) lies within 2 x 2
//   blocks of 4 x 4 cells (2 (w + c) <= 4 c per axis), the highest of the blocks its four corners are in.
// - The normal's error moves the mirrored read by at most 2 eps pixelsPerRadian pixels (a reflected ray turned by 2 eps, seen from
//   the eye from at least as far as it travelled) and the strikes' light on the water by eps times the light's sum: the pixel is flat
//   when that shift is under FLAT_PX pixels and the light's error under FLAT_STRIKE (HDR). With the tolerance 0 (LOD off) no pixel is.
//
// The waves' job (kind "waves") is the coarse map of the water's blocks (512 x 256 blocks of 4 x 4 cells), in units of 8 x 8 blocks (64 x 32:
// UNITS, row by row from the nearest), each a conservative bound over its blocks (see levelOfUnit; a whole map is a couple of thousand bounds,
// remade at any change of the view well inside the pool's late bound). A block's level is 0 where no pixel of the screen has its water point (the shader reads the PLANE point of a
// pixel's ray, no displacement: the block's quad on the plane, the frustum's four side planes) or where the fog's transmittance to its
// nearest point (an upper bound) is under CUT_T (the fog model's TAIL_T: radiance x exposure x tone slope x TAIL_T = 1/255), else
// ceil(40 footprint(cell pixels) transmittance). The level never gates the heights' reads: the strikes' shadow rays read blocks the
// view does not show. The shader (shaders/water/fragment.glsl) takes each pixel's own level from the same
// terms (its footprint on the water, its fog): no texture unit is free for the map.
// - The strike-shadow march: cut where the strike's light times the transmittance is under LIGHT_TOL / STRIKES_MOST (the light dropped:
//   under one level of 255 through exposure and tone, for up to STRIKES_MOST strikes), and its coarse steps lowered by the level's stride
//   (STRIDE_LEVELS: 1, 2, 4, 8): no sound light bound (a crest narrower than the stride can be missed), bounded by the tests on random
//   fields; it is behind the LOD switch.
// - The flat path's tolerance grows as the light falls: flatPx(T) = FLAT_PX / T, at most 1 pixel, so T x flatPx stays FLAT_PX.
//
// Changelog:
// 2026-11-07: the map in units of 8 x 8 blocks (2048 units, no kept map: a recompute is cheap).
// 2026-11-07: the block map job ("waves"), the shadow march's cut and stride, flatPx by transmittance.
// 2026-11-07: the flat path's bound (eps, the projection's pixels per radian, the limit).
// 2026-11-06: new (a stub).
import { M } from "../../engine/core";
import { INVISIBLE, QUALITY_LEVELS } from "./types";
import { QualityUnit } from "./unit";
import { QualityFog } from "./fog";
import { QualityJobs } from "./jobs";

// the most a flat pixel's mirrored read may shift (pixels), and the most strike light error (HDR, linear light)
const FLAT_PX = 0.05;
const FLAT_STRIKE = 2e-4;

// the most the normal of a box of half sizes (wx, wz) differs from up, for waves no higher than H
function epsilon(top: number, wx: number, wz: number): number {
  return top * Math.sqrt(1 / (wx * wx) + 1 / (wz * wz));
}

// the most pixels a view direction's change of one radian moves a place on the screen: the projection's focal terms (p00, p11: the
// first two rows' lengths of the view-projection) scaled by 1 + tan^2 at the screen's corner
function pixelsPerRadian(p00: number, p11: number, width: number, height: number): number {
  return 0.5 * Math.max(width * p00, height * p11) * (1 + 1 / (p00 * p00) + 1 / (p11 * p11));
}

// the largest normal error a flat pixel may have: the mirror's shift and the strikes' light (their sum times the brightest channel of
// the bolt's tint) both within their tolerances; px 0 gives 0 (never flat)
function limit(px: number, perRadian: number, strikeLight: number): number {
  return Math.min(px / (2 * perRadian), FLAT_STRIKE / Math.max(strikeLight, 1e-6));
}

// whether a box (half sizes wx, wz; cell sizes cx, cz there) is flat for waves no higher than top (all) or local (the corner blocks'
// highest; Infinity where the box is not within 2 x 2 blocks)
function isFlat(top: number, local: number, wx: number, wz: number, lim: number): boolean {
  if (!(lim > 0)) {
    return false;
  }
  return epsilon(top, wx, wz) < lim || epsilon(local, wx, wz) < lim;
}

// whether the box a cell more each way lies within 2 x 2 blocks of 4 x 4 cells (so its four corners' blocks hold every cell it reads)
function withinBlocks(wx: number, wz: number, cx: number, cz: number): boolean {
  return 2 * (wx + cx) <= 4 * cx && 2 * (wz + cz) <= 4 * cz;
}

// the blocks of the waves' grid (2048 x 1024 cells in blocks of 4 x 4), the tables' entries (levels 0 to 40) and the most strikes at once
const BLOCKS_ACROSS = 512;
const BLOCKS_DOWN = 256;
const BLOCKS = BLOCKS_ACROSS * BLOCKS_DOWN;
const TABLE_SIZE = 41;
const STRIKES_MOST = 4;
const CELLS_ACROSS = 2048;
const CELLS_DOWN = 1024;
const STEPS_MOST = 128;
// the HDR light error one strike's dropped march may make (INVISIBLE through the exposure's largest gain and the tone curve's steepest
// slope), shared by at most STRIKES_MOST strikes, and the fog model's transmittance under which the water's light is invisible
const LIGHT_TOL = INVISIBLE / (QualityFog.TAIL_EXPOSURE * QualityFog.TAIL_SLOPE);
const CUT_T = QualityFog.TAIL_T;
// the levels from which the shadow march's coarse steps are all (stride 1), every second, every fourth one; below the last, every eighth
const STRIDE_LEVELS = [35, 25, 13];

// the march's stride for a level: 1, 2, 4 or 8; level 0 as level 1
function shadowStride(level: number): number {
  return level >= STRIDE_LEVELS[0]! ? 1 : level >= STRIDE_LEVELS[1]! ? 2 : level >= STRIDE_LEVELS[2]! ? 4 : 8;
}

// the coarse steps of a shadow march over `span` cells of the grid: the shader's min(span / 2 + 2, 128), lowered by the level's stride
// (never under 2) with the LOD on
function shadowSteps(span: number, level: number, lod: boolean): number {
  const full = Math.min(Math.floor(span / 2) + 2, STEPS_MOST);
  if (!lod) {
    return full;
  }
  const steps = Math.ceil(full / shadowStride(level));
  const least = full < 2 ? full : 2;
  return steps < least ? least : steps;
}

// whether a strike's light (HDR, as the water scatters it) times the fog's transmittance there is too faint to march
function shadowCut(peak: number, transmittance: number): boolean {
  return peak * transmittance < LIGHT_TOL / STRIKES_MOST;
}

// the mirrored read's shift (pixels) a flat pixel may have where the light is `transmittance` of what it was
function flatPx(transmittance: number): number {
  const t = transmittance > FLAT_PX ? transmittance : FLAT_PX;
  const px = FLAT_PX / t;
  return px < 1 ? px : 1;
}

interface WavesGrid {
  near: number;
  far: number;
  span: number;
}
interface WavesView {
  viewProjection: ArrayLike<number>;
  eyeY: number;
  focal: number;
  width: number;
  height: number;
  sigma: number;
  air: number;
  waterDrawn: boolean;
}

// the water's place at a corner (cx, cy: 0 or 1, or between) of block (bx, by): [x, distance]; the grid's rows are even in 1 / distance
// from near to far, its columns even in x / distance across 2 span
// (the corner is written into CORNER_X and CORNER_Z, nothing allocated: a map asks for tens of thousands)
let CORNER_X = 0;
let CORNER_Z = 0;
function cornerAt(grid: WavesGrid, bx: number, by: number, cx: number, cy: number): void {
  const ux = (4 * (bx + cx)) / CELLS_ACROSS;
  const uy = (4 * (by + cy)) / CELLS_DOWN;
  CORNER_Z = 1 / (1 / grid.near - uy * (1 / grid.near - 1 / grid.far));
  CORNER_X = CORNER_Z * (2 * ux - 1) * grid.span;
}
function blockCorner(grid: WavesGrid, bx: number, by: number, cx: number, cy: number): number[] {
  cornerAt(grid, bx, by, cx, cy);
  return [CORNER_X, CORNER_Z];
}

// the screen's pixel of a place of the water (x, distance z) by the view-projection: false (nothing written) behind the eye
const PX = new Float64Array(2);
function project(vp: ArrayLike<number>, width: number, height: number, x: number, z: number): boolean {
  const cw = vp[3]! * x + vp[11]! * -z + vp[15]!;
  if (!(cw > 0)) {
    return false;
  }
  PX[0] = (((vp[0]! * x + vp[8]! * -z + vp[12]!) / cw) * 0.5 + 0.5) * width;
  PX[1] = (((vp[1]! * x + vp[9]! * -z + vp[13]!) / cw) * 0.5 + 0.5) * height;
  return true;
}

// the size of a cell of the block on the screen, pixels: the larger side of the block's projected quad over 4 (the larger, so that detail
// is lowered only where even the larger side is small); 1e9 (full detail) when a corner is behind the eye
const QX = new Float64Array(4);
const QY = new Float64Array(4);
function blockCellPixels(grid: WavesGrid, view: WavesView, bx: number, by: number): number {
  for (let k = 0; k < 4; k++) {
    cornerAt(grid, bx, by, k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0);
    if (!project(view.viewProjection, view.width, view.height, CORNER_X, CORNER_Z)) {
      return 1e9;
    }
    QX[k] = PX[0]!;
    QY[k] = PX[1]!;
  }
  let edge = 0;
  for (let k = 0; k < 4; k++) {
    const dx = QX[k]! - QX[(k + 1) & 3]!, dy = QY[k]! - QY[(k + 1) & 3]!;
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l > edge) {
      edge = l;
    }
  }
  return edge / 4;
}

// an upper bound of the fog's transmittance to the block: the distance to its nearest point (exact: in distance z and bearing r = x / z the
// squared distance is z^2 (1 + r^2) + eyeY^2, least at the near edge and the bearing nearest 0)
function blockTransmittance(grid: WavesGrid, view: WavesView, bx: number, by: number, span = 1): number {
  cornerAt(grid, bx, by, 0, 0);
  const az = CORNER_Z, r0 = CORNER_X / CORNER_Z;
  cornerAt(grid, bx, by, span, 0);
  const r1 = CORNER_X / CORNER_Z;
  const r = r0 > 0 ? r0 : r1 < 0 ? r1 : 0;
  const dz = az * Math.sqrt(1 + r * r), eye = view.eyeY || 0;
  const d = Math.sqrt(dz * dz + eye * eye);
  return QualityUnit.transmittance(d, view.sigma || 0, view.air || 0, view.eyeY || 0);
}

// the frustum's four side planes of a view-projection, normalised, on the water plane y = 0: (a, c, d) for a x + c z + d at (x, 0, z)
const PLANES = new Float64Array(12);
function setPlanes(vp: ArrayLike<number>): void {
  for (let k = 0; k < 4; k++) {
    const row = k >> 1, sign = (k & 1) === 0 ? 1 : -1;
    const a = vp[3]! + sign * vp[row]!, b = vp[7]! + sign * vp[4 + row]!, c = vp[11]! + sign * vp[8 + row]!, d = vp[15]! + sign * vp[12 + row]!;
    const n = Math.sqrt(a * a + b * b + c * c);
    const inv = n > 0 ? 1 / n : 0;
    PLANES[k * 3] = a * inv;
    PLANES[k * 3 + 1] = c * inv;
    PLANES[k * 3 + 2] = d * inv;
  }
}

// whether the block's quad may hold a pixel's water point: false only when the quad lies wholly outside one of the side planes (the
// planes' slack covers the 32 bit matrix); the world's z is minus the distance
function inView(grid: WavesGrid, bx: number, by: number, span = 1): boolean {
  for (let k = 0; k < 4; k++) {
    let outside = true;
    for (let v = 0; v < 4 && outside; v++) {
      cornerAt(grid, bx, by, v === 1 || v === 2 ? span : 0, v >= 2 ? span : 0);
      const dist = PLANES[k * 3]! * CORNER_X - PLANES[k * 3 + 1]! * CORNER_Z + PLANES[k * 3 + 2]!;
      if (dist >= -(1e-3 + 1e-6 * (Math.abs(CORNER_X) + CORNER_Z))) {
        outside = false;
      }
    }
    if (outside) {
      return false;
    }
  }
  return true;
}

// a block's level with the planes set
function levelOfBlock(grid: WavesGrid, view: WavesView, bx: number, by: number, lod = true): number {
  if (!inView(grid, bx, by)) {
    return 0;
  }
  // (the level of detail off: the frustum's culling only, a seen block at full)
  if (!lod) {
    return QUALITY_LEVELS;
  }
  const t = blockTransmittance(grid, view, bx, by);
  if (t < CUT_T) {
    return 0;
  }
  return QualityUnit.levelOf(QualityUnit.footprint(blockCellPixels(grid, view, bx, by)) * t);
}

function blockLevel(grid: WavesGrid, view: WavesView, bx: number, by: number): number {
  setPlanes(view.viewProjection);
  return levelOfBlock(grid, view, bx, by);
}

// whether two views are the same for the map: the matrix, the eye's height, the focal length, the screen, the clouds, the air, the water
function sameView(a: WavesView, b: WavesView): boolean {
  if (a.eyeY !== b.eyeY || a.focal !== b.focal || a.width !== b.width || a.height !== b.height || a.sigma !== b.sigma || a.air !== b.air || a.waterDrawn !== b.waterDrawn) {
    return false;
  }
  for (let i = 0; i < 16; i++) {
    if (a.viewProjection[i] !== b.viewProjection[i]) {
      return false;
    }
  }
  return true;
}

// the grid's static numbers: near, far, span, its cells across and down
function gridStatics(grid: WavesGrid): Float32Array {
  return Float32Array.of(grid.near, grid.far, grid.span, CELLS_ACROSS, CELLS_DOWN);
}

// the map's units: a unit is SUPER x SUPER blocks (64 x 32 units), so a whole map is a couple of thousand bounds and any change of the view
// remakes it in a small part of the pool's late bound. A unit's level bounds its blocks': it is 0 only when every block in it is (its quad
// outside one frustum plane holds every block's quad outside it; the fog's transmittance to its nearest point is at least each block's),
// and otherwise from the footprint of its largest cell (the corner blocks' and the near edge's middle block's) times that transmittance.
const SUPER = 8;
const UNITS_ACROSS = BLOCKS_ACROSS / SUPER;
const UNITS_DOWN = BLOCKS_DOWN / SUPER;
const UNITS = UNITS_ACROSS * UNITS_DOWN;
const LAST = SUPER - 1;
const MIDDLE = SUPER >> 1;

// a unit's level with the planes set
function levelOfUnit(grid: WavesGrid, view: WavesView, sx: number, sy: number, lod: boolean): number {
  const bx = sx * SUPER, by = sy * SUPER;
  if (!inView(grid, bx, by, SUPER)) {
    return 0;
  }
  if (!lod) {
    return QUALITY_LEVELS;
  }
  const t = blockTransmittance(grid, view, bx, by, SUPER);
  if (t < CUT_T) {
    return 0;
  }
  let px = blockCellPixels(grid, view, bx, by);
  const more = (x: number, y: number) => {
    const v = blockCellPixels(grid, view, x, y);
    if (v > px) {
      px = v;
    }
  };
  more(bx + LAST, by);
  more(bx, by + LAST);
  more(bx + LAST, by + LAST);
  more(bx + MIDDLE, by);
  return QualityUnit.levelOf(QualityUnit.footprint(px) * t);
}

function superLevel(grid: WavesGrid, view: WavesView, sx: number, sy: number): number {
  setPlanes(view.viewProjection);
  return levelOfUnit(grid, view, sx, sy, true);
}

function process(statics: Record<string, Float32Array>, params: { inputs: WavesView; lod?: boolean }, from: number, to: number, out: Uint8Array): void {
  const g = statics.grid!;
  const view = params.inputs;
  const grid: WavesGrid = { near: g[0]!, far: g[1]!, span: g[2]! };
  const lod = params.lod !== false;
  setPlanes(view.viewProjection);
  for (let i = from; i < to; i++) {
    out[i] = levelOfUnit(grid, view, i % UNITS_ACROSS, (i / UNITS_ACROSS) | 0, lod);
  }
}

export const QualityWaves = { FLAT_PX, FLAT_STRIKE, epsilon, pixelsPerRadian, limit, isFlat, withinBlocks, BLOCKS_ACROSS, BLOCKS_DOWN, BLOCKS, SUPER, UNITS_ACROSS, UNITS_DOWN, UNITS, superLevel, TABLE_SIZE, STRIKES_MOST, LIGHT_TOL, CUT_T, STRIDE_LEVELS, shadowStride, shadowSteps, shadowCut, flatPx, blockCorner, blockCellPixels, blockTransmittance, blockLevel, sameView, gridStatics, process };

QualityJobs.register("waves", (statics, params, from, to, out) => {
  process(statics, params as unknown as { inputs: WavesView; lod?: boolean }, from, to, out);
});

// (the namespace's type does not list it: the tests read it through a cast)
M.QualityWaves = QualityWaves;
