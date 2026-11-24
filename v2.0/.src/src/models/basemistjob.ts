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
}

type Read = (q: number[], lod: number) => number;

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
const kept: { noiseVersion: number; noise: Uint8Array | null; reader: Read | null; gridVersion: number; raw: Uint16Array | null; grid: Float32Array | null } = { noiseVersion: -1, noise: null, reader: null, gridVersion: -1, raw: null, grid: null };

function keepNoise(version: number, bytes: Uint8Array): void {
  if (kept.noiseVersion !== version || kept.noise !== bytes) {
    kept.noiseVersion = version;
    kept.noise = bytes;
    kept.reader = readerOf(bytes);
  }
}

function keepGrid(version: number, halves: Uint16Array): void {
  if (kept.gridVersion !== version || (kept.raw !== halves && kept.grid === null)) {
    kept.gridVersion = version;
    kept.raw = halves;
    kept.grid = null;
  }
}

function forget(): void {
  kept.noiseVersion = -1;
  kept.noise = null;
  kept.reader = null;
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

function columns(input: BaseMistInput): Uint16Array {
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
function prepare(input: { stretch: number; version: number }): void {
  keepNoise(input.version, NoiseField.bytes(input.stretch));
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

export const BaseMistJob = { prepare, FACTOR, FRESH_SECONDS, FrontSnapshot, slicesCovered, SLICES, packNoise, readerOf, viewOf, eyeOf, reducedOf, cutOf, inputOf, columns, stepsOf, Shipper, LightVersion, forget, halfOf };

M.BaseMistJob = BaseMistJob;
