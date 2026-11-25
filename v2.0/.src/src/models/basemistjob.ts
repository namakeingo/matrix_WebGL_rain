// The base mist's fresh reduced columns as a pure job (Feature P1, story P6 = Feature U3's story M7; units.ui.basemistworker.ts; no GL, no page, importable in any thread). The base volume's accumulating frame draws, for each of
// its 144 slices, the sums of light and optical depth along the columns' rays (shaders/fog/basemist_volume.glsl) at a reduced number of columns and the frame's jitter; the job computes the same picture on the CPU for the
// pose the view will show at the release frame, in a worker, so that the GPU only uploads, blends and stores it.
// - FACTOR 8 (the worker's default reduction of the columns: the GPU's own chain is 2), SLICES (M.BaseMist.SLICES)
// - packNoise(levels): the noise's levels 0..7 (0..1 floats) as bytes, concatenated; readerOf(packed): read(q, lod), the noise as the GPU reads it (trilinear, repeating, the two mip levels blended for a fraction)
// - viewOf(input, across, down, margin): the RayView (models/quality/fogvolume.ts) of a FrameInput (the pose is the input's four offsets: M.Frame.atPose); eyeOf(input): [eyeX, eyeHeight + eyeShift, 0]
// - reducedOf(across, down, factor): [ra, rd] (M.FogAccum.reduced); cutOf(counts, across, down, ra, rd): the slice count of each reduced column, the largest count of the full columns it covers (floor(x across / ra) to
//   ceil((x + 1) across / ra) - 1 each way), at least 1
// - inputOf(noise, view, eye, params, factor, jitter, cut?, rows?): { noise (null: the thread has the version), view, eye, params { hb, base, focal, main, second, noiseVersion, light { version, grid (null: the thread has the
//   version), sky, moon, moonDir?, shaded } }, factor, jitter [jx, jy, jz], cut?, rows? [from, to) of the reduced rows }
// - columns(input): Uint16Array of halves, slice-major: out[(((k * 2 + m) * rows + (y - from)) * ra + x) * 4 + c], m 0 the direct ray and 1 the mirrored one (from where a downward ray meets the water), c 0..2 the light and
//   3 the optical depth, the sums through the end of slice k at the column ((x + jx) sx, (y + jy) sy) (the shader's gl_FragCoord + the jitter - 0.5, times the columns one reduced column covers), the gather at jz of the slice;
//   a column with cut n holds, from slice n on, the values of slice n - 1 (what a read returns). The light is the GLSL's fogLight per unit albedo and density (shaders/fog/shade.glsl) over the fog's shade texture read back
//   (grid: RG16F halves, 128 x 64 x 192 texels, index ((z 64 + y) 128 + x) 2 + c, c 0 the sky's shade and 1 the Orb's): albedo x (sky shade.x + moon shade.y phaseHG(dot(moonDir, view)) + MULTIPLE (sky + moon / 4 pi)), the
//   shade of skyShade (the front's read, the air's constant from SHADE.TOP up, times the base's read when `shaded`); a version names a content, kept by the thread that runs the job
// - slicesCovered(cut): the largest count of the cut (at least 1), SLICES without a cut; columns(input) holds that many slices (over the rows asked), the columns' slices past their cut repeating their last
// - stepsOf(input): the slice steps of the direct rays (the sum of the cuts over the rows), the cost's unit
// - Shipper: ship(noiseVersion, noise, gridVersion, grid) -> { noise, grid }, each null when the worker has that version; it also keeps them in this thread (an inline run of an input that omitted them finds them); reset()
// - forget(): this thread's kept noise and grid cleared (a fresh worker's start); LightVersion: note(baseBakes, frontEpoch) -> an integer, the same while both counters are, larger when either rose
// - FRESH_SECONDS 0.25 and FrontSnapshot(epoch): the freshness policy of the front shade snapshot a change's jobs use: change(time) notes a view change (a warm-up at the start is one); usable(): the newest completed snapshot
//   was begun no earlier than the epoch before the change, or at or after it; due(): no read in flight and the snapshot not usable; begin(time) / complete() bracket a read; beganAt, reading
// - halfOf(v): the half-float bits of a float (round to nearest even), for the readback's conversion
//
// Changelog:
// 2026-11-25: coarseCache: the coarse classes of a row band made once for the bands of a pass (content-keyed, one entry, module state; forget() empties it).
// 2026-11-25: prepare({ stretch, version, grid?, gridVersion? }) keeps the noise once for a version and the grid it is given (the base mist's tasks are warmed with the grid, not sent it at their first job).
// 2026-11-25: story B: input.band (a row band of the factors path: the finest class's rows [from, to), the coarser classes whole and emitted by the head band only); layoutOf(.., band).
// 2026-11-25: story A: columns / columnsLod make no arrays in the loops (scratch Float64Arrays, M.StaticMist.baseNoiseXYZ, M.QualityFogVolume.columnRayInto), compute the rays of a lattice once and read no noise in a flat slice (amplitude 0: the modulation is exactly 1); columnsSlow keeps the earlier job as the reference of the tests and of the cost's comparison.
// 2026-11-24: input.factors (the factor of each slice's lattice: M.BaseLodRes): the slices' pictures on lattices of their own factor, the previous slice read bilinearly where the lattice changes, the output by class (layoutOf); cut, with factors,
//   is the full-resolution counts.
// 2026-11-23: prepare({ stretch, version }): the noise generated and kept before the first job (the warm handler of the base mist worker).
// 2026-11-23: story M7b: params.noiseStretch (the thread generates the noise it was not given: M.NoiseField), light.front (false: the front term is the air's value, the grid the base's 96 layers alone), slicesCovered(cut) and the output holding that many slices, the Shipper's noise optional.
// 2026-11-23: FrontSnapshot.epoch is public (the tests' live mode narrows it).
// 2026-11-23: FRESH_SECONDS and FrontSnapshot (the front shade snapshot's freshness: read at a change when older than 0.25 s).
// 2026-11-23: new (Feature P1, story P6 = M7).
import { M } from "../engine/core";
import { BaseMist } from "../engine/basemist";
import { StaticMist } from "./staticmist";
import { Frame } from "./frame";
import type { FrameInput } from "./frame";
import { FogAccum } from "./fogaccum";
import { QualityFogVolume } from "./quality/fogvolume";
import { NoiseField } from "./noisefield";
import { BaseLodRes } from "./baselodres";
import { COLOUR_LO, COLOUR_HI } from "../materials/fog";

export interface BaseMistRayView {
  width: number;
  height: number;
  focal: number;
  lensX: number;
  lensY: number;
  forward: number[];
  right: number[];
  up: number[];
  across: number;
  down: number;
  margin: number;
}

export interface BaseMistLight {
  version: number;
  grid?: Uint16Array | null;
  sky: number[];
  moon: number[];
  moonDir?: number[];
  shaded: boolean;
  // false: the front term of the shade is the air's value (the front grid is not read) and `grid` holds the base's 96 layers alone; default true (the 192 layers of the fog's shade texture)
  front?: boolean;
}

export interface BaseMistParams {
  hb: number;
  base: number;
  focal: number;
  main: number[];
  second: number[];
  noiseVersion: number;
  // the noise's stretch (M.FogMist.NOISE_STRETCH): a thread given no noise generates it (M.NoiseField)
  noiseStretch?: number;
  light: BaseMistLight;
}

export interface BaseMistInput {
  noise: Uint8Array | null;
  view: BaseMistRayView;
  eye: number[];
  params: BaseMistParams;
  factor: number;
  jitter: number[];
  cut?: Uint16Array;
  rows?: number[];
  // the factor of each slice's lattice (absent: every slice at `factor`); the output is then laid out by class (layoutOf) and `cut` is the full-resolution counts
  factors?: Uint8Array;
  // a row band of the job (M.BaseMistBands): the finest class's lattice rows [from, to) (the guard rows included), and whether it is the head band, which also emits the coarser classes; only with factors; the output is the band's layout (M.BaseLodRes.layoutOf's band)
  band?: { from: number; to: number; head: boolean };
}

type Read = (q: number[], lod: number) => number;
type Read3 = (x: number, y: number, z: number, lod: number) => number;

const FACTOR = 8;
const SLICES = BaseMist.SLICES;
const LEVELS = 8;
const NOISE = 128;
// the shade texture: the front's layers, then the base's, 128 x 64 x 192 texels of two values
const GRID = [QualityFogVolume.SHADE.CELLS[0]!, QualityFogVolume.SHADE.CELLS[1]!, QualityFogVolume.SHADE.LAYERS];

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

// the half's bits of a float, rounded to nearest even
function halfOf(v: number): number {
  f32[0] = v;
  const x = u32[0]!, sign = (x >>> 16) & 0x8000, raw = (x >>> 23) & 0xff, m = x & 0x7fffff;
  if (raw === 0xff) {
    return sign | 0x7c00 | (m ? 0x200 : 0);
  }
  const e = raw - 127 + 15;
  if (e >= 31) {
    return sign | 0x7c00;
  }
  if (e <= 0) {
    if (e < -10) {
      return sign;
    }
    const mant = m | 0x800000, shift = 14 - e;
    let half = mant >>> shift;
    const rest = mant & ((1 << shift) - 1), mid = 1 << (shift - 1);
    if (rest > mid || (rest === mid && (half & 1))) {
      half++;
    }
    return sign | half;
  }
  let h = sign | (e << 10) | (m >>> 13);
  if (m & 0x1000 && (m & 0x0fff || h & 1)) {
    h++;
  }
  return h;
}

function packNoise(levels: ArrayLike<number>[]): Uint8Array {
  let total = 0;
  for (let l = 0; l < LEVELS; l++) {
    total += Math.pow(NOISE >> l, 3);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (let l = 0; l < LEVELS; l++) {
    const f = levels[l]!, n = Math.pow(NOISE >> l, 3);
    for (let i = 0; i < n; i++) {
      out[at + i] = Math.round(f[i]! * 255);
    }
    at += n;
  }
  return out;
}

// the noise as textureLod reads it (R8, LINEAR, REPEAT, the mip chain of the generator's own levels): level l is (128 >> l)^3 bytes, x fastest, then y, then z
function readerOf(packed: Uint8Array): Read {
  const start: number[] = [];
  let at = 0;
  for (let l = 0; l < LEVELS; l++) {
    start.push(at);
    at += Math.pow(NOISE >> l, 3);
  }
  const one = (q: number[], level: number): number => {
    const n = NOISE >> level, base = start[level]!, mask = n - 1;
    const x = (q[0]! - Math.floor(q[0]!)) * n - 0.5, y = (q[1]! - Math.floor(q[1]!)) * n - 0.5, z = (q[2]! - Math.floor(q[2]!)) * n - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), fx = x - x0, fy = y - y0, fz = z - z0;
    const xa = x0 & mask, xb = (x0 + 1) & mask, ya = (y0 & mask) * n, yb = ((y0 + 1) & mask) * n, za = (z0 & mask) * n * n, zb = ((z0 + 1) & mask) * n * n;
    const at8 = (i: number): number => packed[base + i]!;
    const c00 = at8(za + ya + xa) * (1 - fx) + at8(za + ya + xb) * fx;
    const c10 = at8(za + yb + xa) * (1 - fx) + at8(za + yb + xb) * fx;
    const c01 = at8(zb + ya + xa) * (1 - fx) + at8(zb + ya + xb) * fx;
    const c11 = at8(zb + yb + xa) * (1 - fx) + at8(zb + yb + xb) * fx;
    const c0 = c00 * (1 - fy) + c10 * fy, c1 = c01 * (1 - fy) + c11 * fy;
    return (c0 * (1 - fz) + c1 * fz) / 255;
  };
  return (q, lod) => {
    const lv = Math.min(Math.max(lod, 0), LEVELS - 1), a = Math.floor(lv), b = Math.min(a + 1, LEVELS - 1), t = lv - a;
    const va = one(q, a);
    return t === 0 ? va : va + (one(q, b) - va) * t;
  };
}

// readerOf's arithmetic with the position as three numbers (no array a read)
function readerOf3(packed: Uint8Array): Read3 {
  const start: number[] = [];
  let at = 0;
  for (let l = 0; l < LEVELS; l++) {
    start.push(at);
    at += Math.pow(NOISE >> l, 3);
  }
  const one = (qx: number, qy: number, qz: number, level: number): number => {
    const n = NOISE >> level, base = start[level]!, mask = n - 1;
    const x = (qx - Math.floor(qx)) * n - 0.5, y = (qy - Math.floor(qy)) * n - 0.5, z = (qz - Math.floor(qz)) * n - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), fx = x - x0, fy = y - y0, fz = z - z0;
    const xa = x0 & mask, xb = (x0 + 1) & mask, ya = (y0 & mask) * n, yb = ((y0 + 1) & mask) * n, za = (z0 & mask) * n * n, zb = ((z0 + 1) & mask) * n * n;
    const c00 = packed[base + za + ya + xa]! * (1 - fx) + packed[base + za + ya + xb]! * fx;
    const c10 = packed[base + za + yb + xa]! * (1 - fx) + packed[base + za + yb + xb]! * fx;
    const c01 = packed[base + zb + ya + xa]! * (1 - fx) + packed[base + zb + ya + xb]! * fx;
    const c11 = packed[base + zb + yb + xa]! * (1 - fx) + packed[base + zb + yb + xb]! * fx;
    const c0 = c00 * (1 - fy) + c10 * fy, c1 = c01 * (1 - fy) + c11 * fy;
    return (c0 * (1 - fz) + c1 * fz) / 255;
  };
  return (x, y, z, lod) => {
    const lv = Math.min(Math.max(lod, 0), LEVELS - 1), a = Math.floor(lv), b = Math.min(a + 1, LEVELS - 1), t = lv - a;
    const va = one(x, y, z, a);
    return t === 0 ? va : va + (one(x, y, z, b) - va) * t;
  };
}

function viewOf(input: FrameInput, across: number, down: number, margin: number): BaseMistRayView {
  const a = Frame.axes(input.pitch + input.pitchShift, input.yaw);
  return { width: input.width, height: input.height, focal: input.height / 2 / Math.tan(input.halfFov), lensX: input.lensX, lensY: input.lensY, forward: a.forward, right: a.right, up: a.up, across, down, margin };
}

function eyeOf(input: FrameInput): number[] {
  return [input.eyeX, input.eyeHeight + input.eyeShift, 0];
}

function reducedOf(across: number, down: number, factor: number): number[] {
  return [FogAccum.reduced(across, factor), FogAccum.reduced(down, factor)];
}

function cutOf(counts: ArrayLike<number>, across: number, down: number, ra: number, rd: number): Uint16Array {
  const out = new Uint16Array(ra * rd);
  for (let y = 0; y < rd; y++) {
    const y0 = Math.floor((y * down) / rd), y1 = Math.min(down, Math.ceil(((y + 1) * down) / rd));
    for (let x = 0; x < ra; x++) {
      const x0 = Math.floor((x * across) / ra), x1 = Math.min(across, Math.ceil(((x + 1) * across) / ra));
      let most = 1;
      for (let cy = y0; cy < y1; cy++) {
        for (let cx = x0; cx < x1; cx++) {
          most = Math.max(most, counts[cy * across + cx]!);
        }
      }
      out[y * ra + x] = most;
    }
  }
  return out;
}

function inputOf(noise: Uint8Array | null, view: BaseMistRayView, eye: number[], params: BaseMistParams, factor: number, jitter: number[], cut?: Uint16Array, rows?: number[]): BaseMistInput {
  const input: BaseMistInput = { noise, view, eye, params, factor, jitter };
  if (cut) {
    input.cut = cut;
  }
  if (rows) {
    input.rows = rows;
  }
  return input;
}

// what this thread keeps: the noise's bytes and reader by version, the shade grid's halves (decoded when first used) by version
const kept: { noiseVersion: number; noise: Uint8Array | null; reader: Read | null; reader3: Read3 | null; gridVersion: number; raw: Uint16Array | null; grid: Float32Array | null } = { noiseVersion: -1, noise: null, reader: null, reader3: null, gridVersion: -1, raw: null, grid: null };

function keepNoise(version: number, bytes: Uint8Array): void {
  if (kept.noiseVersion !== version || kept.noise !== bytes) {
    kept.noiseVersion = version;
    kept.noise = bytes;
    kept.reader = readerOf(bytes);
    kept.reader3 = readerOf3(bytes);
  }
}

function keepGrid(version: number, halves: Uint16Array): void {
  if (kept.gridVersion !== version || (kept.raw !== halves && kept.grid === null)) {
    kept.gridVersion = version;
    kept.raw = halves;
    kept.grid = null;
  }
}

// the coarse classes of a ROW BAND job kept for the bands of a pass (story B follow-up): every band of a pass makes the same coarse classes (the classes but the band's own, which come last along the chain), so the first band to run makes them and keeps their output blocks and the
// previous-slice picture the band's first slice reads; the others take them. The key is the CONTENT of what they depend on (every ask arrives as a copy); one entry, the last. Module state: a worker's thread and the render thread's inline run each have their own, filled by the same function.
interface CoarseEntry {
  key: string;
  blocks: Uint16Array;
  prev0: Float64Array;
  prev1: Float64Array;
  pRa: number;
  pRd: number;
  pSx: number;
  pSy: number;
}
const coarseStore: (CoarseEntry | null)[] = [null];
const coarseCache = {
  enabled: true,
  builds: 0,
  hits: 0,
  entries: 0,
  reset(): void {
    coarseStore[0] = null;
    this.builds = 0;
    this.hits = 0;
    this.entries = 0;
  },
};

const a3 = (a: ArrayLike<number>): string => a[0] + "," + a[1] + "," + a[2];

// what the coarse classes of a band depend on, as a string: the view, eye, jitter, the params that reach a slice, the light, the factors, and the covered slices and cut counts (hashed)
function coarseKeyOf(input: BaseMistInput, covered: number): string {
  const v = input.view, P = input.params, L = P.light, cut = input.cut;
  let hash = 2166136261;
  if (cut) {
    for (let i = 0; i < cut.length; i++) {
      hash = Math.imul(hash ^ cut[i]!, 16777619);
    }
  }
  let factors = "";
  for (let k = 0; k < SLICES; k++) {
    factors += String.fromCharCode(input.factors![k]!);
  }
  return v.width + "," + v.height + "," + v.focal + "," + v.lensX + "," + v.lensY + "," + v.across + "," + v.down + "," + v.margin + "|" + a3(v.forward) + "|" + a3(v.right) + "|" + a3(v.up) + "|" + a3(input.eye) + "|" + a3(input.jitter) + "|" + P.hb + "," + P.base + "," + P.focal + "," + P.noiseVersion + "," + P.noiseStretch + "|" + a3(P.main) + "|" + a3(P.second) + "|" + L.version + "," + L.shaded + "," + L.front + "|" + a3(L.sky) + "|" + a3(L.moon) + "|" + (L.moonDir ? a3(L.moonDir) : "") + "|" + covered + "," + (cut ? cut.length : 0) + "," + hash + "|" + factors;
}

function forget(): void {
  coarseStore[0] = null;
  coarseCache.entries = 0;
  kept.noiseVersion = -1;
  kept.noise = null;
  kept.reader = null;
  kept.reader3 = null;
  kept.gridVersion = -1;
  kept.raw = null;
  kept.grid = null;
}

function halfValue(h: number): number {
  const e = (h >> 10) & 31, f = h & 1023, s = h & 0x8000 ? -1 : 1;
  return e === 0 ? s * f * Math.pow(2, -24) : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * Math.pow(2, e - 15);
}

function gridOf(): Float32Array {
  if (kept.grid === null) {
    const raw = kept.raw!, out = new Float32Array(raw.length);
    const table = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) {
      table[h] = halfValue(h);
    }
    for (let i = 0; i < raw.length; i++) {
      out[i] = table[raw[i]!]!;
    }
    kept.grid = out;
  }
  return kept.grid;
}

// the slices' constants: the footprint's coarsening at the slice's middle (the shader's uCoarse) and its boundaries
function sliceConstants(focal: number): { a: number[]; c: ReturnType<typeof StaticMist.coarsen>[] } {
  const a: number[] = [], c: ReturnType<typeof StaticMist.coarsen>[] = [];
  for (let k = 0; k <= SLICES; k++) {
    a.push(BaseMist.sliceStart(k));
  }
  for (let k = 0; k < SLICES; k++) {
    c.push(StaticMist.coarsen(0.5 * (a[k]! + a[k + 1]!), focal));
  }
  return { a, c };
}

// the earlier job (arrays in every gather), kept as the reference of the tests and of the cost's comparison
function columnsSlow(input: BaseMistInput): Uint16Array {
  if (input.factors) {
    return columnsLodSlow(input);
  }
  const P = input.params, L = P.light;
  if (input.noise) {
    keepNoise(P.noiseVersion, input.noise);
  } else if (kept.noiseVersion !== P.noiseVersion || kept.reader === null) {
    if (P.noiseStretch === undefined) {
      throw new Error("BaseMistJob: no noise of version " + P.noiseVersion + " kept and none given");
    }
    keepNoise(P.noiseVersion, NoiseField.bytes(P.noiseStretch));
  }
  if (L.grid) {
    keepGrid(L.version, L.grid);
  } else if (kept.gridVersion !== L.version || kept.raw === null) {
    throw new Error("BaseMistJob: no shade grid of version " + L.version + " kept and none given");
  }
  const read = kept.reader!, grid = gridOf(), front = L.front !== false, layers = front ? GRID[2]! : GRID[2]! / 2;
  const view = input.view, eye = input.eye, factor = input.factor, jitter = input.jitter, jz = jitter[2]!;
  const [ra, rd] = reducedOf(view.across, view.down, factor) as [number, number];
  const from = input.rows ? input.rows[0]! : 0, to = input.rows ? input.rows[1]! : rd, rows = to - from;
  const sx = view.across / ra, sy = view.down / rd;
  const covered = slicesCovered(input.cut ? input.cut.subarray(from * ra, to * ra) : undefined);
  const out = new Uint16Array(covered * 2 * rows * ra * 4);
  const { a, c } = sliceConstants(P.focal);
  const Q = QualityFogVolume;
  const air = Math.exp(-Q.AIR_EXTINCTION * 8);
  const read3 = (u: number[]): number[] => Q.sample3(grid as Float32Array, GRID[0]!, GRID[1]!, layers, u);
  // (the front dropped: the front term is the air's value and the base's layers alone are read at the base's own coordinate: the texture coordinate of the 192 layers' base half, 0.5 + c.z x 0.5, is c.z over the 96)
  const frontRead = front ? read3 : (): number[] => [air, air];
  const baseRead = !L.shaded ? null : front ? read3 : (u: number[]): number[] => read3([u[0]!, u[1]!, (u[2]! - Q.SHADE.BASE) / Q.SHADE.FRONT]);
  const dir = L.moonDir || Q.MOON_DIR, dirLength = Math.hypot(dir[0]!, dir[1]!, dir[2]!);
  const ambient = [0, 1, 2].map((q) => Q.MULTIPLE * (L.sky[q]! + L.moon[q]! / Q.FOUR_PI));
  const lit = (p: number[], v: number[]): number[] => {
    const shade = Q.skyShade(p, frontRead, baseRead), ph = Q.phaseHG((dir[0]! * v[0]! + dir[1]! * v[1]! + dir[2]! * v[2]!) / dirLength);
    return [0, 1, 2].map((q) => L.sky[q]! * shade[0]! + L.moon[q]! * shade[1]! * ph + ambient[q]!);
  };
  const gather = (acc: number[], d: number[], lo: number, hi: number, mirrored: boolean, co: ReturnType<typeof StaticMist.coarsen>): number[] => {
    const dt = hi - lo, t = lo + jz * dt;
    const p = [eye[0]! + t * d[0]!, eye[1]! + t * d[1]!, eye[2]! + t * d[2]!];
    if (mirrored) {
      p[1] = -p[1]!;
    }
    const n = StaticMist.baseNoise(p, read, co.lodShift);
    const density = StaticMist.baseDensity(p[1]!, P.hb, P.base, StaticMist.modulation(n, co.lodShift, co));
    if (density < 1e-9) {
      return acc;
    }
    const al = BaseMist.albedo(BaseMist.colourWeight(p, read, co.lodShift), P.main, P.second), pass = Math.exp(-density * dt);
    const light = lit(p, mirrored ? [d[0]!, -d[1]!, d[2]!] : d), w = Math.exp(-acc[3]!) * (1 - pass);
    return [acc[0]! + w * al[0]! * light[0]!, acc[1]! + w * al[1]! * light[1]!, acc[2]! + w * al[2]! * light[2]!, acc[3]! + density * dt];
  };
  const put = (k: number, m: number, y: number, x: number, v: number[]): void => {
    const at = (((k * 2 + m) * rows + (y - from)) * ra + x) * 4;
    out[at] = halfOf(v[0]!);
    out[at + 1] = halfOf(v[1]!);
    out[at + 2] = halfOf(v[2]!);
    out[at + 3] = halfOf(v[3]!);
  };
  for (let y = from; y < to; y++) {
    for (let x = 0; x < ra; x++) {
      const d = Q.columnRay(view, (x + jitter[0]!) * sx, (y + jitter[1]!) * sy);
      const cut = Math.min(covered, Math.max(1, input.cut ? input.cut[y * ra + x]! : SLICES));
      let direct = [0, 0, 0, 0], mirror = [0, 0, 0, 0];
      for (let k = 0; k < cut; k++) {
        direct = gather(direct, d, a[k]!, a[k + 1]!, false, c[k]!);
        if (d[1]! < 0) {
          const lo = Math.max(a[k]!, eye[1]! / -d[1]!);
          if (a[k + 1]! > lo) {
            mirror = gather(mirror, d, lo, a[k + 1]!, true, c[k]!);
          }
        }
        put(k, 0, y, x, direct);
        put(k, 1, y, x, mirror);
      }
      for (let k = cut; k < covered; k++) {
        const src = (((cut - 1) * 2) * rows + (y - from)) * ra * 4 + x * 4, dst = ((k * 2) * rows + (y - from)) * ra * 4 + x * 4, step = rows * ra * 4;
        for (let q = 0; q < 4; q++) {
          out[dst + q] = out[src + q]!;
          out[dst + step + q] = out[src + step + q]!;
        }
      }
    }
  }
  return out;
}

// the slices' pictures on lattices of their own factor (input.factors): slice k's lattice is reducedOf(across, down, factors[k]), the column (x, y) sampled at ((x + jx) sx, (y + jy) sy); the sums entering a slice at that position are the previous slice's
// picture there, copied when its lattice is the same and bilinear (M.BaseLodRes.bilinear) otherwise, 0 for slice 0; a column past its cut (the count of the cells it covers, from the full-resolution counts) keeps what enters. The output is M.BaseLodRes.layoutOf's
function columnsLodSlow(input: BaseMistInput): Uint16Array {
  const P = input.params, L = P.light;
  if (input.noise) {
    keepNoise(P.noiseVersion, input.noise);
  } else if (kept.noiseVersion !== P.noiseVersion || kept.reader === null) {
    if (P.noiseStretch === undefined) {
      throw new Error("BaseMistJob: no noise of version " + P.noiseVersion + " kept and none given");
    }
    keepNoise(P.noiseVersion, NoiseField.bytes(P.noiseStretch));
  }
  if (L.grid) {
    keepGrid(L.version, L.grid);
  } else if (kept.gridVersion !== L.version || kept.raw === null) {
    throw new Error("BaseMistJob: no shade grid of version " + L.version + " kept and none given");
  }
  const read = kept.reader!, grid = gridOf(), front = L.front !== false, layers = front ? GRID[2]! : GRID[2]! / 2;
  const view = input.view, eye = input.eye, jx = input.jitter[0]!, jy = input.jitter[1]!, jz = input.jitter[2]!, factors = input.factors!;
  const covered = slicesCovered(input.cut), lay = BaseLodRes.layoutOf(factors, covered, view.across, view.down);
  const out = new Uint16Array(lay.length);
  const { a, c } = sliceConstants(P.focal);
  const Q = QualityFogVolume;
  const air = Math.exp(-Q.AIR_EXTINCTION * 8);
  const read3 = (u: number[]): number[] => Q.sample3(grid as Float32Array, GRID[0]!, GRID[1]!, layers, u);
  const frontRead = front ? read3 : (): number[] => [air, air];
  const baseRead = !L.shaded ? null : front ? read3 : (u: number[]): number[] => read3([u[0]!, u[1]!, (u[2]! - Q.SHADE.BASE) / Q.SHADE.FRONT]);
  const dir = L.moonDir || Q.MOON_DIR, dirLength = Math.hypot(dir[0]!, dir[1]!, dir[2]!);
  const ambient = [0, 1, 2].map((q) => Q.MULTIPLE * (L.sky[q]! + L.moon[q]! / Q.FOUR_PI));
  const lit = (p: number[], v: number[]): number[] => {
    const shade = Q.skyShade(p, frontRead, baseRead), ph = Q.phaseHG((dir[0]! * v[0]! + dir[1]! * v[1]! + dir[2]! * v[2]!) / dirLength);
    return [0, 1, 2].map((q) => L.sky[q]! * shade[0]! + L.moon[q]! * shade[1]! * ph + ambient[q]!);
  };
  const gather = (acc: number[], d: number[], lo: number, hi: number, mirrored: boolean, co: ReturnType<typeof StaticMist.coarsen>): number[] => {
    const dt = hi - lo, t = lo + jz * dt;
    const p = [eye[0]! + t * d[0]!, eye[1]! + t * d[1]!, eye[2]! + t * d[2]!];
    if (mirrored) {
      p[1] = -p[1]!;
    }
    const n = StaticMist.baseNoise(p, read, co.lodShift);
    const density = StaticMist.baseDensity(p[1]!, P.hb, P.base, StaticMist.modulation(n, co.lodShift, co));
    if (density < 1e-9) {
      return acc;
    }
    const al = BaseMist.albedo(BaseMist.colourWeight(p, read, co.lodShift), P.main, P.second), pass = Math.exp(-density * dt);
    const light = lit(p, mirrored ? [d[0]!, -d[1]!, d[2]!] : d), w = Math.exp(-acc[3]!) * (1 - pass);
    return [acc[0]! + w * al[0]! * light[0]!, acc[1]! + w * al[1]! * light[1]!, acc[2]! + w * al[2]! * light[2]!, acc[3]! + density * dt];
  };
  let most = 0;
  for (const cl of lay.classes) {
    most = Math.max(most, cl.ra * cl.rd * 4);
  }
  let prev = [new Float64Array(most), new Float64Array(most)], cur = [new Float64Array(most), new Float64Array(most)], pRa = 0, pRd = 0, pSx = 1, pSy = 1;
  const cuts = new Map<number, Uint16Array>(), where = new Map<number, { cls: number; j: number }>();
  lay.classes.forEach((cl, ci) => cl.slices.forEach((k, j) => where.set(k, { cls: ci, j })));
  for (let k = 0; k < covered; k++) {
    const f = factors[k]!, at = where.get(k)!, cl = lay.classes[at.cls]!, ra = cl.ra, rd = cl.rd, sx = view.across / ra, sy = view.down / rd;
    let cut = cuts.get(f);
    if (!cut && input.cut) {
      cut = cutOf(input.cut, view.across, view.down, ra, rd);
      cuts.set(f, cut);
    }
    const same = k > 0 && pRa === ra && pRd === rd;
    for (let y = 0; y < rd; y++) {
      for (let x = 0; x < ra; x++) {
        const X = (x + jx) * sx, Y = (y + jy) * sy, d = Q.columnRay(view, X, Y), node = (y * ra + x) * 4;
        const start: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0]];
        if (k > 0) {
          for (let m = 0; m < 2; m++) {
            for (let q = 0; q < 4; q++) {
              start[m]![q] = same ? prev[m]![node + q]! : BaseLodRes.bilinear(prev[m]!, pRa, pRd, pSx, pSy, jx, jy, X, Y, q);
            }
          }
        }
        let direct = start[0]!, mirror = start[1]!;
        if (!cut || k < Math.max(1, cut[y * ra + x]!)) {
          direct = gather(direct, d, a[k]!, a[k + 1]!, false, c[k]!);
          if (d[1]! < 0) {
            const lo = Math.max(a[k]!, eye[1]! / -d[1]!);
            if (a[k + 1]! > lo) {
              mirror = gather(mirror, d, lo, a[k + 1]!, true, c[k]!);
            }
          }
        }
        for (let q = 0; q < 4; q++) {
          cur[0]![node + q] = direct[q]!;
          cur[1]![node + q] = mirror[q]!;
          out[cl.offset + ((at.j * 2) * rd + y) * ra * 4 + x * 4 + q] = halfOf(direct[q]!);
          out[cl.offset + ((at.j * 2 + 1) * rd + y) * ra * 4 + x * 4 + q] = halfOf(mirror[q]!);
        }
      }
    }
    [prev, cur] = [cur, prev];
    pRa = ra;
    pRd = rd;
    pSx = sx;
    pSy = sy;
  }
  return out;
}

// ---- the job without allocations (story A): the same values as columnsSlow / columnsLodSlow, within the half's rounding, in typed scratch arrays ----

const SHADE_LOG = Number(Math.log(QualityFogVolume.SHADE.FAR / QualityFogVolume.SHADE.NEAR).toFixed(6));
const clampTo = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);
const smoothStep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

// the noise and the grid kept for the input (as the slow job does at its start)
function keepFor(input: BaseMistInput): void {
  const P = input.params, L = P.light;
  if (input.noise) {
    keepNoise(P.noiseVersion, input.noise);
  } else if (kept.noiseVersion !== P.noiseVersion || kept.reader === null) {
    if (P.noiseStretch === undefined) {
      throw new Error("BaseMistJob: no noise of version " + P.noiseVersion + " kept and none given");
    }
    keepNoise(P.noiseVersion, NoiseField.bytes(P.noiseStretch));
  }
  if (L.grid) {
    keepGrid(L.version, L.grid);
  } else if (kept.gridVersion !== L.version || kept.raw === null) {
    throw new Error("BaseMistJob: no shade grid of version " + L.version + " kept and none given");
  }
}

// the march of one column's slice, in scratch arrays: step(d, at, k, S) takes the sums entering slice k in S (8 values: direct r g b depth, mirrored r g b depth) and leaves the sums after it; d[at .. at + 2] is the column's ray
function marcherOf(input: BaseMistInput): { step(d: Float64Array, at: number, k: number, S: Float64Array): void } {
  keepFor(input);
  const P = input.params, L = P.light, Q = QualityFogVolume, SH = Q.SHADE, read3 = kept.reader3!, grid = gridOf(), front = L.front !== false, layers = front ? GRID[2]! : GRID[2]! / 2;
  const eye0 = input.eye[0]!, eye1 = input.eye[1]!, eye2 = input.eye[2]!, jz = input.jitter[2]!, hb = P.hb, strength = P.base, shaded = L.shaded;
  const { a, c } = sliceConstants(P.focal);
  const air = Math.exp(-Q.AIR_EXTINCTION * 8);
  const dir = L.moonDir || Q.MOON_DIR, dir0 = dir[0]!, dir1 = dir[1]!, dir2 = dir[2]!, dirLength = Math.hypot(dir0, dir1, dir2);
  const sky0 = L.sky[0]!, sky1 = L.sky[1]!, sky2 = L.sky[2]!, moon0 = L.moon[0]!, moon1 = L.moon[1]!, moon2 = L.moon[2]!;
  const amb0 = Q.MULTIPLE * (sky0 + moon0 / Q.FOUR_PI), amb1 = Q.MULTIPLE * (sky1 + moon1 / Q.FOUR_PI), amb2 = Q.MULTIPLE * (sky2 + moon2 / Q.FOUR_PI);
  const main0 = P.main[0]!, main1 = P.main[1]!, main2 = P.main[2]!, sec0 = P.second[0]!, sec1 = P.second[1]!, sec2 = P.second[2]!;
  const album = BaseMist.ALBEDO, albedoLog = Math.log2(album.size);
  // the slices' coarsening: amplitude 0 is flat (the modulation is exactly 1: the noise is not read), the lod shift, the window's narrowing and mean
  const amplitude = new Float64Array(SLICES), lod = new Float64Array(SLICES), narrow = new Float64Array(SLICES), mean = new Float64Array(SLICES);
  for (let k = 0; k < SLICES; k++) {
    const co = c[k]!;
    amplitude[k] = co.amplitude;
    lod[k] = co.lodShift;
    narrow[k] = co.cutoffNarrow;
    mean[k] = StaticMist.windowMean(co.lodShift, co.cutoffNarrow);
  }
  const sh = new Float64Array(2);
  // the trilinear read of the shade grid at the texture coordinates (u0, u1, u2) into sh (M.QualityFogVolume.sample3's arithmetic)
  const sample = (u0: number, u1: number, u2: number): void => {
    const w = GRID[0]!, h = GRID[1]!;
    const x = u0 * w - 0.5, y = u1 * h - 0.5, z = u2 * layers - 0.5, xl = Math.floor(x), yl = Math.floor(y), zl = Math.floor(z);
    const fx = x - xl, fy = y - yl, fz = z - zl;
    const x0 = clampTo(xl, 0, w - 1), x1 = clampTo(xl + 1, 0, w - 1), y0 = clampTo(yl, 0, h - 1), y1 = clampTo(yl + 1, 0, h - 1), z0 = clampTo(zl, 0, layers - 1), z1 = clampTo(zl + 1, 0, layers - 1);
    let o0 = 0, o1 = 0;
    for (let corner = 0; corner < 8; corner++) {
      const dx = corner & 1, dy = (corner >> 1) & 1, dz = corner >> 2;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      const o = ((((dz ? z1 : z0) * h + (dy ? y1 : y0)) * w) + (dx ? x1 : x0)) * 2;
      o0 = o0 + weight * grid[o]!;
      o1 = o1 + weight * grid[o + 1]!;
    }
    sh[0] = o0;
    sh[1] = o1;
  };
  // one slice's gather into S at offset s (0 direct, 4 mirrored): the medium taken at jz of the slice from lo to hi along the ray (d0, d1, d2)
  const gather = (S: Float64Array, s: number, mirrored: boolean, lo: number, hi: number, k: number, d0: number, d1: number, d2: number): void => {
    const dt = hi - lo, t = lo + jz * dt;
    const p0 = eye0 + t * d0, p2 = eye2 + t * d2;
    let p1 = eye1 + t * d1;
    if (mirrored) {
      p1 = -p1;
    }
    let m = 1;
    if (amplitude[k]! !== 0) {
      const n = StaticMist.baseNoiseXYZ(p0, p1, p2, read3, lod[k]!), nr = narrow[k]!;
      m = 1 + amplitude[k]! * (smoothStep(0.4 - 0.1 * nr, 0.6 - 0.2 * nr, n) / mean[k]! - 1);
    }
    const density = strength * Math.exp(-Math.max(p1, 0) / hb) * m;
    if (density < 1e-9) {
      return;
    }
    const w = smoothStep(COLOUR_LO, COLOUR_HI, read3(p0 / album.size + album.offset[0]!, p1 / album.size + album.offset[1]!, p2 / album.size + album.offset[2]!, Math.max(0, lod[k]! - albedoLog)));
    const al0 = main0 * (1 - w) + sec0 * w, al1 = main1 * (1 - w) + sec1 * w, al2 = main2 * (1 - w) + sec2 * w;
    const pass = Math.exp(-density * dt);
    // the sky's and the Orb's shade at the place (M.QualityFogVolume.skyShade)
    const z = Math.max(-p2, SH.NEAR);
    const c0 = (clampTo((p0 / z / SH.SPAN + 1) * 0.5, 0, 1) * (SH.CELLS[0]! - 1) + 0.5) / SH.CELLS[0]!, c1 = (clampTo(Math.sqrt(Math.max(p1, 0) / SH.TOP), 0, 1) * (SH.CELLS[1]! - 1) + 0.5) / SH.CELLS[1]!, c2 = (clampTo(Math.log(z / SH.NEAR) / SHADE_LOG, 0, 1) * (SH.CELLS[2]! - 1) + 0.5) / SH.CELLS[2]!;
    let s0 = air, s1 = air;
    if (front) {
      sample(c0, c1, c2 * SH.FRONT);
      s0 = sh[0]!;
      s1 = sh[1]!;
    }
    if (p1 >= SH.TOP) {
      s0 = air;
      s1 = air;
    }
    if (shaded) {
      if (front) {
        sample(c0, c1, SH.BASE + c2 * SH.FRONT);
      } else {
        sample(c0, c1, (SH.BASE + c2 * SH.FRONT - SH.BASE) / SH.FRONT);
      }
      s0 = s0 * sh[0]!;
      s1 = s1 * sh[1]!;
    }
    const v1 = mirrored ? -d1 : d1;
    const ph = Q.phaseHG((dir0 * d0 + dir1 * v1 + dir2 * d2) / dirLength);
    const wgt = Math.exp(-S[s + 3]!) * (1 - pass);
    S[s] = S[s]! + wgt * al0 * (sky0 * s0 + moon0 * s1 * ph + amb0);
    S[s + 1] = S[s + 1]! + wgt * al1 * (sky1 * s0 + moon1 * s1 * ph + amb1);
    S[s + 2] = S[s + 2]! + wgt * al2 * (sky2 * s0 + moon2 * s1 * ph + amb2);
    S[s + 3] = S[s + 3]! + density * dt;
  };
  return {
    step(d: Float64Array, at: number, k: number, S: Float64Array): void {
      const d0 = d[at]!, d1 = d[at + 1]!, d2 = d[at + 2]!;
      gather(S, 0, false, a[k]!, a[k + 1]!, k, d0, d1, d2);
      if (d1 < 0) {
        const lo = Math.max(a[k]!, eye1 / -d1);
        if (a[k + 1]! > lo) {
          gather(S, 4, true, lo, a[k + 1]!, k, d0, d1, d2);
        }
      }
    },
  };
}

function columns(input: BaseMistInput): Uint16Array {
  if (input.factors) {
    return columnsLod(input);
  }
  const march = marcherOf(input), view = input.view, factor = input.factor, jitter = input.jitter;
  const [ra, rd] = reducedOf(view.across, view.down, factor) as [number, number];
  const from = input.rows ? input.rows[0]! : 0, to = input.rows ? input.rows[1]! : rd, rows = to - from;
  const sx = view.across / ra, sy = view.down / rd;
  const covered = slicesCovered(input.cut ? input.cut.subarray(from * ra, to * ra) : undefined);
  const out = new Uint16Array(covered * 2 * rows * ra * 4);
  const S = new Float64Array(8), d = new Float64Array(3), step = rows * ra * 4;
  for (let y = from; y < to; y++) {
    for (let x = 0; x < ra; x++) {
      QualityFogVolume.columnRayInto(view, (x + jitter[0]!) * sx, (y + jitter[1]!) * sy, d, 0);
      const cut = Math.min(covered, Math.max(1, input.cut ? input.cut[y * ra + x]! : SLICES));
      S.fill(0);
      for (let k = 0; k < cut; k++) {
        march.step(d, 0, k, S);
        const at = (((k * 2) * rows + (y - from)) * ra + x) * 4;
        for (let q = 0; q < 4; q++) {
          out[at + q] = halfOf(S[q]!);
          out[at + step + q] = halfOf(S[4 + q]!);
        }
      }
      for (let k = cut; k < covered; k++) {
        const src = (((cut - 1) * 2) * rows + (y - from)) * ra * 4 + x * 4, dst = ((k * 2) * rows + (y - from)) * ra * 4 + x * 4;
        for (let q = 0; q < 4; q++) {
          out[dst + q] = out[src + q]!;
          out[dst + step + q] = out[src + step + q]!;
        }
      }
    }
  }
  return out;
}

// the slices' pictures on lattices of their own factor (input.factors): slice k's lattice is reducedOf(across, down, factors[k]), the column (x, y) sampled at ((x + jx) sx, (y + jy) sy); the sums entering a slice at that position are the previous slice's
// picture there, copied when its lattice is the same and bilinear (M.BaseLodRes.bilinear) otherwise, 0 for slice 0; a column past its cut (the count of the cells it covers, from the full-resolution counts) keeps what enters. The output is M.BaseLodRes.layoutOf's.
// The rays of each lattice are computed once.
function columnsLod(input: BaseMistInput): Uint16Array {
  const march = marcherOf(input), view = input.view, jx = input.jitter[0]!, jy = input.jitter[1]!, factors = input.factors!, band = input.band;
  const covered = slicesCovered(input.cut), all = BaseLodRes.layoutOf(factors, covered, view.across, view.down), lay = band ? BaseLodRes.layoutOf(factors, covered, view.across, view.down, band) : all;
  const out = new Uint16Array(lay.length);
  let most = 0;
  for (const cl of all.classes) {
    most = Math.max(most, cl.ra * cl.rd * 4);
  }
  // (a row band: the finest class's rows [from, to) only, when no slice of a coarser class follows a slice of the finest, as the table never has; else its whole lattice is made and only the band's rows are written)
  const finestFactor = BaseLodRes.bandFactorOf(factors), emitOf = new Map<number, { offset: number; rd: number }>();
  lay.classes.forEach((c) => emitOf.set(c.factor, c));
  let monotone = true, seenFinest = false;
  for (let k = 0; k < covered; k++) {
    if (factors[k] === finestFactor) {
      seenFinest = true;
    } else if (seenFinest) {
      monotone = false;
    }
  }
  let prev0 = new Float64Array(most), prev1 = new Float64Array(most), cur0 = new Float64Array(most), cur1 = new Float64Array(most), pRa = 0, pRd = 0, pSx = 1, pSy = 1;
  const cuts = new Map<number, Uint16Array>(), rays = new Map<number, Float64Array>(), where = new Uint8Array(SLICES * 2), S = new Float64Array(8);
  all.classes.forEach((cl, ci) => cl.slices.forEach((k, j) => {
    where[k * 2] = ci;
    where[k * 2 + 1] = j;
  }));
  // (a row band's coarse classes: from the cache when its key matches, else made into coarseBuf and kept; the head band's output takes them from there)
  const firstBand = band !== undefined && all.classes.length > 1 && all.classes[0]!.factor === finestFactor ? all.classes[0]!.slices[0]! : 0;
  const coarseBase = all.classes.length > 1 ? all.classes[1]!.offset : 0;
  let building = false, k0 = 0, coarseBuf: Uint16Array | null = null, coarseKey = "";
  if (coarseCache.enabled && band !== undefined && monotone && firstBand > 0) {
    coarseKey = coarseKeyOf(input, covered);
    const held = coarseStore[0];
    if (held && held.key === coarseKey) {
      coarseCache.hits++;
      prev0.set(held.prev0);
      prev1.set(held.prev1);
      pRa = held.pRa;
      pRd = held.pRd;
      pSx = held.pSx;
      pSy = held.pSy;
      if (band.head) {
        out.set(held.blocks, lay.classes[1]!.offset);
      }
      k0 = firstBand;
    } else {
      coarseCache.builds++;
      building = true;
      coarseBuf = new Uint16Array(all.length - coarseBase);
    }
  }
  for (let k = k0; k < covered; k++) {
    const f = factors[k]!, ci = where[k * 2]!, j = where[k * 2 + 1]!, cl = all.classes[ci]!, ra = cl.ra, rd = cl.rd, sx = view.across / ra, sy = view.down / rd;
    const isBand = band !== undefined && f === finestFactor, rowsOnly = isBand && monotone, y0 = rowsOnly ? band!.from : 0, y1 = rowsOnly ? band!.to : rd;
    // (the class's output block: the band's own for the finest class, the coarse ones only for the head band)
    const toBuf = building && ci > 0, emit = toBuf ? null : emitOf.get(f) || null, rowsOut = toBuf ? rd : emit ? emit.rd : 0, firstOut = isBand ? band!.from : 0;
    let cut = cuts.get(f);
    if (!cut && input.cut) {
      cut = cutOf(input.cut, view.across, view.down, ra, rd);
      cuts.set(f, cut);
    }
    let ray = rays.get(f);
    if (!ray) {
      ray = new Float64Array(ra * rd * 3);
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < ra; x++) {
          QualityFogVolume.columnRayInto(view, (x + jx) * sx, (y + jy) * sy, ray, (y * ra + x) * 3);
        }
      }
      rays.set(f, ray);
    }
    const same = k > 0 && pRa === ra && pRd === rd;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < ra; x++) {
        const node = (y * ra + x) * 4;
        if (k === 0) {
          S.fill(0);
        } else if (same) {
          for (let q = 0; q < 4; q++) {
            S[q] = prev0[node + q]!;
            S[4 + q] = prev1[node + q]!;
          }
        } else {
          const X = (x + jx) * sx, Y = (y + jy) * sy;
          for (let q = 0; q < 4; q++) {
            S[q] = BaseLodRes.bilinear(prev0, pRa, pRd, pSx, pSy, jx, jy, X, Y, q);
            S[4 + q] = BaseLodRes.bilinear(prev1, pRa, pRd, pSx, pSy, jx, jy, X, Y, q);
          }
        }
        if (!cut || k < Math.max(1, cut[y * ra + x]!)) {
          march.step(ray, (y * ra + x) * 3, k, S);
        }
        for (let q = 0; q < 4; q++) {
          cur0[node + q] = S[q]!;
          cur1[node + q] = S[4 + q]!;
        }
        if ((toBuf || emit) && y >= firstOut && y < firstOut + rowsOut) {
          const target = toBuf ? coarseBuf! : out, base = toBuf ? cl.offset - coarseBase : emit!.offset;
          const at0 = base + ((j * 2) * rowsOut + (y - firstOut)) * ra * 4 + x * 4, at1 = base + ((j * 2 + 1) * rowsOut + (y - firstOut)) * ra * 4 + x * 4;
          for (let q = 0; q < 4; q++) {
            target[at0 + q] = halfOf(S[q]!);
            target[at1 + q] = halfOf(S[4 + q]!);
          }
        }
      }
    }
    const t0 = prev0, t1 = prev1;
    prev0 = cur0;
    prev1 = cur1;
    cur0 = t0;
    cur1 = t1;
    pRa = ra;
    pRd = rd;
    pSx = sx;
    pSy = sy;
    if (building && k === firstBand - 1) {
      // (the last coarse slice made: its picture and the blocks are kept for the other bands of the pass, and the head band's output takes the blocks)
      coarseStore[0] = { key: coarseKey, blocks: coarseBuf!, prev0: prev0.slice(), prev1: prev1.slice(), pRa: pRa, pRd: pRd, pSx: pSx, pSy: pSy };
      coarseCache.entries = 1;
      if (band!.head) {
        out.set(coarseBuf!, lay.classes[1]!.offset);
      }
    }
  }
  return out;
}

function slicesCovered(cut: ArrayLike<number> | undefined): number {
  if (!cut) {
    return SLICES;
  }
  let most = 1;
  for (let i = 0; i < cut.length; i++) {
    if (cut[i]! > most) {
      most = cut[i]!;
    }
  }
  return Math.min(SLICES, most);
}

// the noise generated and kept for a version (a worker's warm message: the first job then finds it)
// the warm message: the noise generated and kept (once for a version), and, when given, the shade grid kept for its version, so the first job a worker is asked meets neither a noise to make nor a grid to be sent
function prepare(input: { stretch: number; version: number; grid?: Uint16Array; gridVersion?: number }): void {
  if (kept.noiseVersion !== input.version || kept.noise === null) {
    keepNoise(input.version, NoiseField.bytes(input.stretch));
  }
  if (input.grid && input.gridVersion !== undefined) {
    keepGrid(input.gridVersion, input.grid);
  }
}

function stepsOf(input: BaseMistInput): number {
  const [ra, rd] = reducedOf(input.view.across, input.view.down, input.factor) as [number, number];
  const from = input.rows ? input.rows[0]! : 0, to = input.rows ? input.rows[1]! : rd;
  let sum = 0;
  for (let y = from; y < to; y++) {
    for (let x = 0; x < ra; x++) {
      sum += Math.min(SLICES, Math.max(1, input.cut ? input.cut[y * ra + x]! : SLICES));
    }
  }
  return sum;
}

// what the worker has been sent: the versions of its noise and grid
class Shipper {
  private noiseVersion = -1;
  private gridVersion = -1;

  ship(noiseVersion: number, noise: Uint8Array | null, gridVersion: number, grid: Uint16Array): { noise: Uint8Array | null; grid: Uint16Array | null } {
    if (noise !== null) {
      keepNoise(noiseVersion, noise);
    }
    keepGrid(gridVersion, grid);
    const sendNoise = this.noiseVersion !== noiseVersion, sendGrid = this.gridVersion !== gridVersion;
    this.noiseVersion = noiseVersion;
    this.gridVersion = gridVersion;
    return { noise: sendNoise && noise !== null ? noise : null, grid: sendGrid ? grid : null };
  }

  reset(): void {
    this.noiseVersion = -1;
    this.gridVersion = -1;
  }
}

// the freshness of the front shade snapshot the jobs of a change use: the front grid drifts with the clouds, so a snapshot is usable for a change only when it was begun within `epoch` before the change or after it
const FRESH_SECONDS = 0.25;

class FrontSnapshot {
  beganAt: number | null = null;
  reading = false;
  epoch: number;
  private startedAt = 0;
  private changeAt: number | null = null;

  constructor(epoch: number = FRESH_SECONDS) {
    this.epoch = epoch;
  }

  change(time: number): void {
    this.changeAt = time;
  }

  usable(): boolean {
    return this.beganAt !== null && this.changeAt !== null && (this.beganAt >= this.changeAt || this.changeAt - this.beganAt <= this.epoch);
  }

  due(): boolean {
    return !this.reading && this.changeAt !== null && !this.usable();
  }

  begin(time: number): void {
    this.reading = true;
    this.startedAt = time;
  }

  complete(): void {
    this.reading = false;
    this.beganAt = this.startedAt;
  }
}

// the version of the shade grid read back: the base grid's bake count and the front's epoch (a rise of either is a new version)
class LightVersion {
  private bakes = -1;
  private epoch = -1;
  private version = 0;

  note(baseBakes: number, frontEpoch: number): number {
    if (baseBakes !== this.bakes || frontEpoch !== this.epoch) {
      this.bakes = baseBakes;
      this.epoch = frontEpoch;
      this.version++;
    }
    return this.version;
  }
}

export const BaseMistJob = { layoutOf: BaseLodRes.layoutOf, prepare, FACTOR, FRESH_SECONDS, FrontSnapshot, slicesCovered, SLICES, packNoise, readerOf, viewOf, eyeOf, reducedOf, cutOf, inputOf, columns, columnsSlow, coarseCache, stepsOf, Shipper, LightVersion, forget, halfOf };

M.BaseMistJob = BaseMistJob;
