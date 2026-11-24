// The front volume's fresh reduced columns as a pure job (Feature P1, story P8a = Feature U2's story V6; units.ui.frontvolume.ts; no GL, no page, importable in any thread). The front volume's accumulating frame draws, for each
// slice the plan owes, the sums of light and optical depth along the columns' rays (shaders/fog/fogaccum_volume.glsl) at a reduced number of columns and the frame's jitter; the job computes the same pictures on the CPU for the
// whole chain of slices from slice 0 (the GPU seeds a run from its held volume, a read-back a worker cannot make), in a worker, so that the GPU only uploads, blends and stores them.
// - FACTOR 4 (the worker's default reduction of the columns: the GPU's chain is 2), SLICES 96, STALE_SECONDS (the front grid's age bound), PERIOD_SECONDS (the jobs' cadence in the steady state: the sweep, 1 / 6 s)
// - inputOf(noise | null, view, eye, params, factor, jitter, extra?): { noise, view, eye, params, factor, jitter, slices?, drop?, cull?, rows? }; view and eye as M.BaseMistJob.viewOf / eyeOf (the shader's columnRay's rays);
//   params { sigma, time, tail, tailScale, flat (uTailFlat), far (uFar), focal (cEye.w), columnWidth (fVolume.z), main, second, noiseVersion, noiseStretch?, light { version, grid (192 layers of the fog's shade texture as
//   RG16F halves, 128 x 64 x 192, index ((z 64 + y) 128 + x) 2 + c; null: the thread has the version), sky, moon, moonDir?, shaded } }; extra { slices: the slices covered (default 96), drop: the octaves dropped per slice
//   (uDrop), cull: the direct rays' water cut (directHeld), rows [from, to) of the reduced rows }
// - columns(input): Uint16Array of halves, slice-major (the base mist job's layout): out[(((k * 2 + m) * rows + (y - from)) * ra + x) * 4 + c], k < covered, m 0 the direct ray and 1 the mirrored one, c 0..2 the light and 3
//   the optical depth: the sums through the end of slice k for the reduced column ((x + jx) sx, (y + jy) sy), the medium taken at jz of the slice (M.QualityFogVolume.gather at t = jz); a direct ray cut at slice n holds
//   the sums of slice n - 1 from n on
// - slicesCovered(input), cutOf(input) (Uint16Array ra x rd: the slices a column's direct ray gathers; covered without `cull`), stepsOf(input) (the direct slice steps over the rows)
// - assemble(bands, ranges, input): the bands' outputs (rows [from, to) each) laid into one whole output
// - sliceCount(seconds, margin = 2): the slices the plan owes in `seconds` (96 / SWEEP_SECONDS a second) and the margin, 1 to 96; extents(from, count): the ranges [from, to) of the plan's cyclic order that cover `count` slices from `from`;
//   assembleParts(bands, bandRanges, input, extents): the bands laid into one array for each extent, those slices only
// - prepare({ stretch, version }), forget(); Shipper: ship(version, grid) -> grid | null; assembleGrid(front, base) -> the 192 layers; GridPolicy: the front grid's age rule
// The job keeps its own noise and grid by version (not M.BaseMistJob's: that grid has other layers); it never reads anything from the GPU.
//
// Changelog:
// 2026-11-24: sliceCount, extents and assembleParts: the upload and the assembly of what the frame blends only.
// 2026-11-23: new (Feature P1, story P8a).
import { M } from "../engine/core";
import { BaseMistJob } from "./basemistjob";
import type { BaseMistLight, BaseMistRayView } from "./basemistjob";
import { QualityFog } from "./quality/fog";
import { QualityFogVolume } from "./quality/fogvolume";
import { NoiseField } from "./noisefield";

export interface FrontVolumeParams {
  sigma: number;
  time: number;
  tail: number;
  tailScale: number;
  flat: number;
  far: boolean;
  focal: number;
  columnWidth: number;
  main: number[];
  second: number[];
  noiseVersion: number;
  noiseStretch?: number;
  light: BaseMistLight;
}

export interface FrontVolumeExtra {
  slices?: number;
  drop?: Uint8Array;
  cull?: boolean;
  rows?: number[];
}

export interface FrontVolumeInput extends FrontVolumeExtra {
  noise: Uint8Array | null;
  view: BaseMistRayView;
  eye: number[];
  params: FrontVolumeParams;
  factor: number;
  jitter: number[];
}

const SLICES = QualityFog.SLICES;
const FACTOR = 4;
const STALE_SECONDS = 4;
const PERIOD_SECONDS = QualityFog.SWEEP_SECONDS;
const GRID = [128, 64, 192];
const PLANE = 128 * 64 * 2;

type Read = (q: number[], lod: number) => number;
const kept: { noiseVersion: number; reader: Read | null; gridVersion: number; raw: Uint16Array | null; grid: Float32Array | null } = { noiseVersion: -1, reader: null, gridVersion: -1, raw: null, grid: null };

function keepNoise(version: number, bytes: Uint8Array): void {
  kept.noiseVersion = version;
  kept.reader = BaseMistJob.readerOf(bytes);
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
  kept.reader = null;
  kept.gridVersion = -1;
  kept.raw = null;
  kept.grid = null;
}

function halfValue(h: number): number {
  const e = (h >> 10) & 31, f = h & 1023, s = h & 0x8000 ? -1 : 1;
  return e === 0 ? s * f * Math.pow(2, -24) : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * Math.pow(2, e - 15);
}

let table: Float32Array | null = null;
function gridOf(): Float32Array {
  if (kept.grid === null) {
    if (table === null) {
      table = new Float32Array(65536);
      for (let h = 0; h < 65536; h++) {
        table[h] = halfValue(h);
      }
    }
    const raw = kept.raw!, out = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      out[i] = table[raw[i]!]!;
    }
    kept.grid = out;
  }
  return kept.grid;
}

function inputOf(noise: Uint8Array | null, view: BaseMistRayView, eye: number[], params: FrontVolumeParams, factor: number, jitter: number[], extra?: FrontVolumeExtra): FrontVolumeInput {
  const input: FrontVolumeInput = { noise, view, eye, params, factor, jitter };
  if (extra) {
    if (extra.slices !== undefined) {
      input.slices = extra.slices;
    }
    if (extra.drop) {
      input.drop = extra.drop;
    }
    if (extra.cull) {
      input.cull = extra.cull;
    }
    if (extra.rows) {
      input.rows = extra.rows;
    }
  }
  return input;
}

function slicesCovered(input: FrontVolumeInput): number {
  return input.slices === undefined ? SLICES : Math.min(SLICES, Math.max(1, Math.floor(input.slices)));
}

// the slices a column's direct ray gathers (fogaccum_volume.glsl directHeld with uCull 1): the water's distance over the column and its eight neighbours a reduced column apart, held from the first slice that starts past it
function cutOf(input: FrontVolumeInput): Uint16Array {
  const V = input.view, [ra, rd] = BaseMistJob.reducedOf(V.across, V.down, input.factor) as [number, number], covered = slicesCovered(input), out = new Uint16Array(ra * rd).fill(covered);
  if (!input.cull) {
    return out;
  }
  const sx = V.across / ra, sy = V.down / rd, below = QualityFog.CULL_BELOW, relative = QualityFog.CULL_RELATIVE, starts: number[] = [];
  for (let k = 0; k < covered; k++) {
    starts.push(QualityFogVolume.sliceAt(k / SLICES));
  }
  const under = (cx: number, cy: number): number => {
    const dy = QualityFogVolume.columnRay(V, cx, cy)[1]!;
    return dy < -1e-6 ? (input.eye[1]! + below) / -dy : 1e30;
  };
  for (let y = 0; y < rd; y++) {
    for (let x = 0; x < ra; x++) {
      const fx = (x + input.jitter[0]!) * sx, fy = (y + input.jitter[1]!) * sy;
      let far = under(fx, fy);
      if (far >= 1e29) {
        continue;
      }
      for (let i = 0; i < 9; i++) {
        far = Math.max(far, under(fx + sx * ((i % 3) - 1), fy + sy * (Math.floor(i / 3) - 1)));
      }
      const limit = far * (1 + relative);
      for (let k = 0; k < covered; k++) {
        if (starts[k]! > limit) {
          out[y * ra + x] = k;
          break;
        }
      }
    }
  }
  return out;
}

function stepsOf(input: FrontVolumeInput): number {
  const [ra, rd] = BaseMistJob.reducedOf(input.view.across, input.view.down, input.factor) as [number, number];
  const from = input.rows ? input.rows[0]! : 0, to = input.rows ? input.rows[1]! : rd, cut = cutOf(input);
  let sum = 0;
  for (let y = from; y < to; y++) {
    for (let x = 0; x < ra; x++) {
      sum += cut[y * ra + x]!;
    }
  }
  return sum;
}

function columns(input: FrontVolumeInput): Uint16Array {
  const P = input.params, L = P.light;
  if (input.noise) {
    keepNoise(P.noiseVersion, input.noise);
  } else if (kept.noiseVersion !== P.noiseVersion || kept.reader === null) {
    if (P.noiseStretch === undefined) {
      throw new Error("FrontVolumeJob: no noise of version " + P.noiseVersion + " kept and none given");
    }
    keepNoise(P.noiseVersion, NoiseField.bytes(P.noiseStretch));
  }
  if (L.grid) {
    keepGrid(L.version, L.grid);
  } else if (kept.gridVersion !== L.version || kept.raw === null) {
    throw new Error("FrontVolumeJob: no shade grid of version " + L.version + " kept and none given");
  }
  const Q = QualityFogVolume, grid = gridOf(), view = input.view, eye = input.eye, jz = input.jitter[2]!;
  const [ra, rd] = BaseMistJob.reducedOf(view.across, view.down, input.factor) as [number, number];
  const from = input.rows ? input.rows[0]! : 0, to = input.rows ? input.rows[1]! : rd, rows = to - from;
  const sx = view.across / ra, sy = view.down / rd, covered = slicesCovered(input), cut = cutOf(input);
  const out = new Uint16Array(covered * 2 * rows * ra * 4);
  const read3 = (u: number[]): number[] => Q.sample3(grid, GRID[0]!, GRID[1]!, GRID[2]!, u);
  const tp = { sigma: P.sigma, time: P.time, tail: P.tail, tailScale: P.tailScale, flat: P.flat, far: P.far, drop: 0, main: P.main, second: P.second, sky: L.sky, moon: L.moon, moonDir: L.moonDir, front: read3, base: L.shaded ? read3 : null, read: kept.reader!, eye, columnWidth: P.columnWidth, focal: P.focal };
  const a: number[] = [], lod: number[] = [];
  for (let k = 0; k <= covered; k++) {
    a.push(Q.sliceAt(k / SLICES));
  }
  for (let k = 0; k < covered; k++) {
    lod.push(Q.sliceLod(a[k]!, a[k + 1]!, P.columnWidth, P.focal));
  }
  const put = (k: number, m: number, y: number, x: number, v: number[]): void => {
    const at = (((k * 2 + m) * rows + (y - from)) * ra + x) * 4;
    out[at] = BaseMistJob.halfOf(v[0]!);
    out[at + 1] = BaseMistJob.halfOf(v[1]!);
    out[at + 2] = BaseMistJob.halfOf(v[2]!);
    out[at + 3] = BaseMistJob.halfOf(v[3]!);
  };
  for (let y = from; y < to; y++) {
    for (let x = 0; x < ra; x++) {
      const d = Q.columnRay(view, (x + input.jitter[0]!) * sx, (y + input.jitter[1]!) * sy), c = cut[y * ra + x]!;
      let direct = [0, 0, 0, 0], mirror = [0, 0, 0, 0];
      for (let k = 0; k < covered; k++) {
        tp.drop = input.drop ? input.drop[k]! : 0;
        if (k < c) {
          direct = Q.gather(tp, direct, d, a[k]!, a[k + 1]!, false, lod[k]!, jz);
        }
        if (d[1]! < 0) {
          const lo = Math.max(a[k]!, eye[1]! / -d[1]!);
          if (a[k + 1]! > lo) {
            mirror = Q.gather(tp, mirror, d, lo, a[k + 1]!, true, lod[k]!, jz);
          }
        }
        put(k, 0, y, x, direct);
        put(k, 1, y, x, mirror);
      }
    }
  }
  return out;
}

// the bands' outputs (each the rows ranges[i] = [from, to)) laid into one whole output of the input's layout
function assemble(bands: Uint16Array[], ranges: number[][], input: FrontVolumeInput): Uint16Array {
  const [ra, rd] = BaseMistJob.reducedOf(input.view.across, input.view.down, input.factor) as [number, number], covered = slicesCovered(input);
  const out = new Uint16Array(covered * 2 * rd * ra * 4);
  bands.forEach((band, i) => {
    const from = ranges[i]![0]!, rows = ranges[i]![1]! - from;
    for (let km = 0; km < covered * 2; km++) {
      out.set(band.subarray(km * rows * ra * 4, (km + 1) * rows * ra * 4), (km * rd + from) * ra * 4);
    }
  });
  return out;
}

// the slices the plan owes in `seconds`: its rate is one sweep (SLICES) in SWEEP_SECONDS; the margin covers the frame's rounding; at least 1, at most all
function sliceCount(seconds: number, margin = 2): number {
  const rate = SLICES / QualityFog.SWEEP_SECONDS;
  return Math.min(SLICES, Math.max(1, Math.ceil(rate * Math.max(0, seconds) - 1e-9) + margin));
}

// the slice ranges [from, to) of `count` slices from `from` on in the plan's cyclic order (from modulo SLICES, count at least 1; all of them from slice 0 when count reaches SLICES)
function extents(from: number, count: number): number[][] {
  const start = ((Math.floor(from) % SLICES) + SLICES) % SLICES, n = Math.max(1, Math.floor(count));
  if (n >= SLICES) {
    return [[0, SLICES]];
  }
  const end = start + n;
  return end <= SLICES ? [[start, end]] : [[start, SLICES], [0, end - SLICES]];
}

// the bands' outputs (each the rows bandRanges[i] of the reduced picture) laid into one array for each extent: the slices [from, to) in the job's layout, nothing else allocated
function assembleParts(bands: Uint16Array[], bandRanges: number[][], input: FrontVolumeInput, parts: number[][]): Uint16Array[] {
  const [ra, rd] = BaseMistJob.reducedOf(input.view.across, input.view.down, input.factor) as [number, number];
  return parts.map((e) => {
    const from = e[0]!, layers = (e[1]! - from) * 2, out = new Uint16Array(layers * rd * ra * 4);
    bands.forEach((band, i) => {
      const row = bandRanges[i]![0]!, rows = bandRanges[i]![1]! - row;
      for (let l = 0; l < layers; l++) {
        const km = from * 2 + l;
        out.set(band.subarray(km * rows * ra * 4, (km + 1) * rows * ra * 4), (l * rd + row) * ra * 4);
      }
    });
    return out;
  });
}

// the noise generated and kept for a version (a worker's warm message: the first job then finds it)
function prepare(input: { stretch: number; version: number }): void {
  keepNoise(input.version, NoiseField.bytes(input.stretch));
}

// what the worker has been sent: the version of its grid
class Shipper {
  private version = -1;

  ship(version: number, grid: Uint16Array): Uint16Array | null {
    keepGrid(version, grid);
    const send = this.version !== version;
    this.version = version;
    return send ? grid : null;
  }

  reset(): void {
    this.version = -1;
  }
}

// the 192 layers of the fog's shade texture: the front's 96 baked here, then the base's 96
function assembleGrid(front: Uint16Array, base: Uint16Array): Uint16Array {
  const out = new Uint16Array(192 * PLANE);
  out.set(front.subarray(0, 96 * PLANE), 0);
  out.set(base.subarray(0, 96 * PLANE), 96 * PLANE);
  return out;
}

// the front grid's age rule under the clouds' continuous drift: a grid baked for time t is used while no older than `stale`; a new bake begins at half of it (so that one that takes less than half is in time), and any event of
// the front's own settings or the base's strength makes the grid in use unusable at once (a bake begun before the event completes unusable)
class GridPolicy {
  version = 0;
  bakedFor: number | null = null;
  reading = false;
  private have = false;
  private gridVersion = -1;
  private pendingFor = 0;
  private pendingVersion = 0;
  private stale: number;

  constructor(stale: number = STALE_SECONDS) {
    this.stale = stale;
  }

  event(kind: string): number {
    if (kind === "start" || kind === "sigma" || kind === "tail" || kind === "tailscale" || kind === "strength" || kind === "moon" || kind === "size") {
      this.version++;
    }
    return this.version;
  }

  age(time: number): number | null {
    return this.bakedFor === null ? null : time - this.bakedFor;
  }

  usable(time: number): boolean {
    return this.have && this.gridVersion === this.version && time - this.bakedFor! <= this.stale + 1e-9;
  }

  due(time: number): boolean {
    return !this.reading && (!this.have || this.gridVersion !== this.version || time - this.bakedFor! >= this.stale / 2 - 1e-9);
  }

  begin(time: number): void {
    this.reading = true;
    this.pendingFor = time;
    this.pendingVersion = this.version;
  }

  complete(): boolean {
    this.reading = false;
    if (this.pendingVersion !== this.version) {
      return false;
    }
    this.have = true;
    this.gridVersion = this.pendingVersion;
    this.bakedFor = this.pendingFor;
    return true;
  }
}

export const FrontVolumeJob = { SLICES, FACTOR, STALE_SECONDS, PERIOD_SECONDS, inputOf, columns, slicesCovered, cutOf, stepsOf, assemble, sliceCount, extents, assembleParts, prepare, forget, Shipper, assembleGrid, GridPolicy };

M.FrontVolumeJob = FrontVolumeJob;
