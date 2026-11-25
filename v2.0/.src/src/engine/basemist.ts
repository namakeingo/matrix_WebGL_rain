// The base mist's volume (Feature U3, story M2; units.ui.basemist.ts, the scene tests basemist*). The base mist is the fog's static layer: a noise-modulated exponential height layer (models/staticmist.ts) whose
// density never drifts, held in its own camera-fixed froxel volume that reaches BASE_FAR = 5 km along each column's ray (log slices, the front volume's law and columns) and replaces both the analytic mist
// inside 300 m and the closed form beyond it. fogAt (shaders/fog/fog.glsl) reads it with the front volume and combines them: front.rgb + front.a x base.rgb, a = the product of the transmittances.
//
// Pure parts (M.BaseMist; no GL, importable anywhere):
// - FAR, NEAR, SHARE (the base's share of the extinction, 0.5), HB (the height scale, M.FogMist.HEIGHT: 130 m), SLICES (144: the least that keeps the slice's thickness at the 300 m seam no more than the front
//   volume's, (FOG_FAR + NEAR) ln(1 + FOG_FAR / NEAR) / 96 = 17.89 m), LAYERS (the stacked texture's depth: the front's SLICES, then the base's)
// - layerOf(k): the layer of the shared textures that holds base slice k (FRONT_SLICES + k)
// - sliceStart(k), thickness(k), sliceOf(t): the slice law, NEAR (e^(k / SLICES ln(1 + FAR / NEAR)) - 1)
// - Schedule: the state machine of the builds: an exact build owed at the start, on 'settings' and 'size'; an accumulation from frame 0 on 'view' (restarting on a further 'view'), until M.StaticMist.converged; idle
//   (no draw) once converged; no other event (the time, the strikes) owes anything
// - combine(front, base), colourWeight(p, read, lod), albedo(w, main, second), gatherRay(...): the combination of the two volumes' reads and the CPU twin of the volume's texel
//
// The GL half (BaseMistVolume, owned by Fog like FogAccumulation): the base volume lives in the layers SLICES .. SLICES + BASE SLICES - 1 of the front volume's pair of textures (direct, mirror: every unit of the context
// is taken, so it has no unit of its own; Froxels gives the stack its layers and framebuffers). A frame's build is the slices 0 .. SLICES - 1 in order, each as THREE separate steps:
//   fresh(k)   produces the fresh slice k, at the reduced columns and jittered (the exact build: at the full columns, no jitter), and returns the pair of pictures holding it. This is the one function that
//              produces a frame's fresh slices; it is called for k = 0, 1, ... in order once a frame and the rest of the frame does not care how the slice was made (a later worker-computed slice would be
//              uploaded into the pair it returns); today it draws shaders/fog/basemist_volume.glsl from the pair of slice k - 1
//   blend      moves the held volume's layer towards the fresh slice by alpha (the shared fogAccum blend program), into a full-size picture
//   store      writes it into the volume's layer (the shared fogAccum store program); the exact build stores the fresh slice itself
// The exact build (start, settings, size) never accumulates; a view change accumulates (alpha M.StaticMist.viewAlpha(frame)) until converged and then draws nothing, a still view never draws; nothing here has a
// time input.
//
// Changelog:
// 2026-11-25: fresh.first (the job or band is the first applied of its accumulation, or of its rows): frame treats it as frame 0 whatever `index`: the retired slices are drawn at weight 1; a retired slice the output does not cover is not drawn at all (never blended from the last covered slice).
// 2026-11-25: the tests' diagnostic switches of the row bands (M.TEST only): noBandUpload (the band's sub-rectangle upload is skipped: the content is garbage), noBandBlend (no blend or store of a band's frame) and wholeBandUpload (the band's rows are written into a CPU copy of the class's whole array and the WHOLE array is uploaded:
//   a partial update against a full one), to tell which of the band's costs a later pass pays for.
// 2026-11-25: story B (M.BaseMistBands): frame(.., fresh) with fresh.band = { from, to, core, head } (and fresh.factors) applies ONE ROW BAND of a pass: the finest class's rows [from, to) are uploaded as one sub-rectangle texSubImage3D (the head band also the coarser classes whole), the blends
//   and the stores of every slice are scissored to the band's core rows in the volume's columns (y from floor(core0 sy) to floor(core1 sy), the last band to the top: the bands partition the rows), `index` is the PASS of those rows (pass 0 blends the retired slices at weight 1, a later pass none of them), lastBand = { pass, core, head }.
// 2026-11-25: baseLodRes default true (on by decision; the paired cost showed no change in the pass time: -0.03 ms change window, +0.09 ms base mist pass, floor 0.09 ms; the picture is within the off-against-off floors).
//   warm() makes the chains of the table's factors only with baseLodRes, and the job's class arrays only with the base worker option.
// 2026-11-24: story 2 of the base mist's resolution by distance (M.BaseLodRes): with baseLodRes (default true) the GPU's slice k is drawn on the chain of its own factor (the path's factor or the stride by distance, whichever is larger), the previous slice's picture read
//   through uPrev (bilinear between the lattice's nodes) when the lattice changed; a job's output with `factors` is uploaded by class (one texSubImage3D for each distinct factor, into that chain's array) and each blend reads its class's array; freshPixels counts the fresh draws' pixels, jobBytes the job bytes uploaded.
// 2026-11-24: story 1 of the base mist's resolution by distance: the flat slices (M.BaseLod.retired) are drawn in an accumulation's frame 0 with the blend weight 1 and not at all from frame 1 on (retireFlat, retiredSlices, retireFrom()); the cut layer
//   is written only when its counts changed or the volume's textures are not the ones it was written into (cutOnChange, cutUploads, M.BaseLod.cutChanged).
// 2026-11-23: story M7b: a job's output is uploaded WHOLE with ONE texSubImage3D into a 2D-array texture of the chain (layer 2 k direct, 2 k + 1 mirrored: the job's order) and the blend is the program fogAccumBlendArray (uLayer = 2 min(k, covered - 1); a job holds only the slices under the plan's largest count); perSlice (the tests' option) keeps the per-slice upload into the pair; the probe reads the array's layers.
// 2026-11-23: sliceSums(list): the tests' statistics, the direct volume's sums of the light and the optical depth over the cells the plan reads, by slice.
// 2026-11-23: the tests' hooks: frame(..., job, gpuFactor) runs the GPU's fresh pass at a given reduction (the hop-by-hop comparison with a job's output at the same factor); probe lists slices whose uploaded planes are read back into probed.
// 2026-11-23: frame(decision, index, base, fresh?) takes a job's output (M.BaseMistJob.columns, made ahead on a worker for the pose the view shows at the release frame) for an accumulating frame: each slice's direct and mirror plane is uploaded into the chain's pair k & 1 (texSubImage2D, RGBA, HALF_FLOAT) instead of the volume program's draw; the blend and the store are the same; an exact build ignores it. freshDraws counts the volume program's slice draws; geometry() gives the columns.
// 2026-11-23: the chains' textures and framebuffers have one delete route: made without effect.own, deleted by release() (the size change and Fog.destroy); BaseMist.Volume exports the class.
// 2026-11-23: cullView's inputs carry the fog's built lens (the volume's columns are built along its rays; the read is shifted by the lens delta, fLens), not the camera's.
// 2026-11-22: Feature U3, story M5: the build's plan (M.BaseLod: the slices each column needs, the flat slices), the slice draws past the largest count skipped, scissor rectangles in the exact build, audit, slicesNeeded, cullView, VOLUME_GLSL.
// 2026-11-22: new (Feature U3, story M2).
import { M } from "./core";
import { fill } from "./glsl";
import type { ProgramSources, ShaderProgram } from "./gl";
import type { Fog } from "../effects/fog";
import { QualityFog } from "../models/quality/fog";
import type { FogQualityView } from "../models/quality/fog";
import { BaseLod } from "../models/baselod";
import { StaticMist } from "../models/staticmist";
import { FogAccum } from "../models/fogaccum";
import { BaseLodRes } from "../models/baselodres";
import { MIST_HEIGHT, AIR_EXTINCTION, COLOUR_LO, COLOUR_HI } from "../materials/fog";
import VOLUME_SOURCE from "../shaders/fog/basemist_volume.glsl";
import { StallCause } from "../models/stallcause";

// the stall probe's event counts of the texture uploads (models/stallcause.ts)
const E_UP_CALLS = StallCause.probe.event("uploadCalls");
const E_UP_BYTES = StallCause.probe.event("uploadBytes");
// the sections of a base mist frame (the stall probe: own time, what is inside a section is not counted twice)
const P = StallCause.probe;
const S_UPLOAD = P.section("base mist: job output upload (texSubImage3D)");
const S_PLAN = P.section("base mist: plan (cullView, BaseLod)");
const S_DRAWS = P.section("base mist: slice draws submitted (fresh, blend, store, guard pieces)");
const S_CUT = P.section("base mist: cut layer build and upload (texSubImage3D)");

const FAR = 5000;
const NEAR = QualityFog.SLICE_NEAR;
const SHARE = 0.5;
const HB = MIST_HEIGHT;
const SLICES = 144;
const FRONT_SLICES = QualityFog.SLICES;
const LAYERS = FRONT_SLICES + SLICES;
// the shared textures hold one more layer after the base's: each column's CUT (the number of base slices built there, >= 1), in the red channel
const TOTAL_LAYERS = LAYERS + 1;
const CUT_LAYER = LAYERS;
const LOG = Math.log(1 + FAR / NEAR);
const ALBEDO = { size: 40, offset: [0.37, 0.11, 0.53] };
// the columns of the volume that a column of the fresh picture covers, each way, in an accumulation frame
const REDUCE = 2;
// the factor of the job's own path (M.BaseMistJob.FACTOR): the classes of its output are made at warm-up
const JOB_FACTOR = 8;

const sliceStart = (k: number): number => NEAR * (Math.exp((k / SLICES) * LOG) - 1);
const thickness = (k: number): number => sliceStart(k + 1) - sliceStart(k);
const sliceOf = (t: number): number => (Math.log(1 + t / NEAR) / LOG) * SLICES;
// the layer of the shared textures that holds the base mist's slice k: the front's slices come first
const layerOf = (k: number): number => FRONT_SLICES + k;
// a read's base slice coordinate, clamped to the column's cut: the cells past the cut are never built
const clampSlice = (f: number, cut: number): number => Math.min(f, cut);
// the sums a read returns from a column's layers (layer(i) = the stored value of base slice i), by the fog read's convention: layer zi = max(f', 1) - 1 limited to 0..slices - 1, linear between layers, f' clamped to the cut
const readSums = (layer: (k: number) => number[], f: number, cut: number, slices = SLICES): number[] => {
  const zi = Math.min(Math.max(Math.max(clampSlice(f, cut), 1) - 1, 0), slices - 1);
  const z0 = Math.floor(zi), fz = zi - z0;
  const a = layer(z0), b = layer(Math.min(z0 + 1, slices - 1));
  return a.map((v, c) => v * (1 - fz) + b[c]! * fz);
};
// the cut layer's content: across * down texels of 4 floats, red = the column's slice count (row * across + column)
const cutLayer = (slices: ArrayLike<number>, across: number, down: number): Float32Array => {
  const out = new Float32Array(across * down * 4);
  for (let i = 0; i < across * down; i++) {
    out[i * 4] = Math.max(1, slices[i] ?? 1);
  }
  return out;
};
// the cut layer kept between builds: one array per size, refilled in place only when the counts change
class CutLayer {
  builds = 0;
  allocations = 0;
  changed = false;
  private data: Float32Array | null = null;
  private last: number[] = [];
  of(counts: ArrayLike<number>, across: number, down: number): Float32Array {
    const n = across * down;
    let data = this.data;
    if (data === null || data.length !== n * 4) {
      data = this.data = new Float32Array(n * 4);
      this.allocations++;
      this.last = [];
    }
    let same = this.builds > 0 && this.last.length === n;
    for (let i = 0; same && i < n; i++) {
      if (this.last[i] !== (counts[i] ?? 1)) {
        same = false;
      }
    }
    this.changed = !same;
    if (!same) {
      for (let i = 0; i < n; i++) {
        const c = counts[i] ?? 1;
        this.last[i] = c;
        data[i * 4] = Math.max(1, c);
      }
      this.builds++;
    }
    return data;
  }
}

interface Decision {
  draw: boolean;
  exact: boolean;
  alpha: number;
}

// a job's output for an accumulating frame: M.BaseMistJob.columns of the volume's columns at `factor` (the chain's reduction), jitter FogAccum.jitter(the frame's index)
export interface BaseMistFresh {
  factor: number;
  output: Uint16Array;
  // the factor of each slice's lattice (M.BaseLodRes.table): the output is then M.BaseMistJob.layoutOf's, by class
  factors?: Uint8Array;
  // a row band of a pass (M.BaseMistBands; with factors): the output is the band's layout (M.BaseLodRes.layoutOf's band); the band's rows of the finest class are uploaded and blended, its core rows are the ones scissored
  band?: { from: number; to: number; core: number[]; head: boolean };
  // this output is the first applied of its accumulation (of its rows, for a band): the retired slices are refreshed by it whatever its index
  first?: boolean;
}

// the builds' state machine
class Schedule {
  mode: string;
  frames: number;
  draws: number;

  constructor() {
    this.mode = "exact";
    this.frames = 0;
    this.draws = 0;
  }

  event(kind: string): void {
    if (kind === "settings" || kind === "size") {
      this.mode = "exact";
      this.frames = 0;
    } else if (kind === "view" && this.mode !== "exact") {
      this.mode = "accumulating";
      this.frames = 0;
    }
  }

  next(): Decision {
    if (this.mode === "exact") {
      this.mode = "idle";
      this.frames = 0;
      this.draws++;
      return { draw: true, exact: true, alpha: 1 };
    }
    if (this.mode === "accumulating") {
      const alpha = StaticMist.viewAlpha(this.frames);
      this.frames++;
      this.draws++;
      if (StaticMist.converged(this.frames)) {
        this.mode = "idle";
      }
      return { draw: true, exact: false, alpha };
    }
    return { draw: false, exact: false, alpha: 0 };
  }
}

// the two volumes' reads (rgb the light, a the transmittance) combined in the order of the ray, the front first
function combine(front: number[], base: number[]): number[] {
  const a = front[3]!;
  return [front[0]! + a * base[0]!, front[1]! + a * base[1]!, front[2]! + a * base[2]!, a * base[3]!];
}

const smooth = (lo: number, hi: number, x: number): number => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

// the colour patches' weight at p: the fog's albedoAt noise (size 40 m, its fixed offset) read at the lod shift
function colourWeight(p: number[], read: (q: number[], lod: number) => number, lod = 0): number {
  const o = ALBEDO.offset, s = ALBEDO.size;
  return smooth(COLOUR_LO, COLOUR_HI, read([p[0]! / s + o[0]!, p[1]! / s + o[1]!, p[2]! / s + o[2]!], Math.max(0, lod - Math.log2(s))));
}

function albedo(w: number, main: number[], second: number[]): number[] {
  return [0, 1, 2].map((c) => main[c]! * (1 - w) + second[c]! * w);
}

interface GatherParams {
  eyeY: number;
  hb: number;
  base: number;
  focal: number;
  main: number[];
  second: number[];
  light: number;
}

// the CPU twin of the volume's value at slice k: the light and the optical depth through the slices 0 .. k - 1 along the ray (az, slope) from the eye at height eyeY
function gatherRay(params: GatherParams, az: number, slope: number, k: number, read: (q: number[], lod: number) => number): { rgb: number[]; depth: number; a: number } {
  const ch = Math.sqrt(1 - slope * slope), cx = Math.cos(az) * ch, cz = Math.sin(az) * ch;
  let depth = 0;
  const rgb = [0, 0, 0];
  for (let j = 0; j < k; j++) {
    const t0 = sliceStart(j), t1 = sliceStart(j + 1), tm = 0.5 * (t0 + t1), dt = t1 - t0;
    const p = [tm * cx, params.eyeY + slope * tm, tm * cz];
    const c = StaticMist.coarsen(tm, params.focal);
    const n = StaticMist.baseNoise(p, read, c.lodShift);
    const density = StaticMist.baseDensity(p[1]!, params.hb, params.base, StaticMist.modulation(n, c.lodShift, c));
    const al = albedo(colourWeight(p, read, c.lodShift), params.main, params.second);
    const pass = Math.exp(-density * dt);
    for (let q = 0; q < 3; q++) {
      rgb[q]! += Math.exp(-depth) * (1 - pass) * al[q]! * params.light;
    }
    depth += density * dt;
  }
  return { rgb, depth, a: Math.exp(-depth) };
}

// the program: the fresh slice's shader with the text it includes
export function baseMistPrograms(): ProgramSources {
  const text = fill(VOLUME_SOURCE, {
    "M.Camera.GLSL": M.Camera.GLSL,
    "Fog.GLSL": M.Fog.GLSL,
    "Fog.MEDIUM_GLSL": M.Fog.MEDIUM_GLSL,
    "Fog.SHADE_GLSL": M.Fog.SHADE_GLSL,
    BASE_HB: HB.toFixed(1),
  });
  return { baseMistVolume: [M.FULL_VERTEX, text] };
}

// a pair of pictures (direct, mirror) at one size and their framebuffer
interface Pair {
  textures: WebGLTexture[];
  framebuffer: WebGLFramebuffer;
}

// the pictures of one reduction: the chain's two pairs (slice k in pair k & 1) at the reduced size
interface Chain {
  // the job's output as one texture array of 2 x SLICES layers (made at the first job-fed frame of the chain)
  array: WebGLTexture | null;
  factor: number;
  across: number;
  down: number;
  pairs: Pair[];
}

interface Stack {
  across: number;
  down: number;
  slices: WebGLFramebuffer[];
  volumes: WebGLTexture[];
  sums: WebGLTexture[];
}

export class BaseMistVolume {
  effect: Fog;
  gl: WebGL2RenderingContext;
  schedule: Schedule;
  volume: ShaderProgram;
  blend: ShaderProgram;
  blendArray: ShaderProgram;
  store: ShaderProgram;
  // the tests' option: a job's output is uploaded slice by slice into the chain's pair and blended by the per-slice blend (the earlier path, the reference of the one-upload path)
  perSlice: boolean;
  // the draws made (frames in which the volume was drawn) and the exact builds made, since the start
  drawFrames: number;
  exactBuilds: number;
  // the volume program's slice draws made since the start (the GPU's fresh pass: an upload of a job's output makes none)
  freshDraws: number;
  // the exact economies (story 1): retireFlat (default true; false is the earlier build) retires the flat slices after an accumulation's frame 0, cutOnChange (default true) writes the cut layer only when it changed; retiredSlices counts the slices
  // skipped as retired, cutUploads the texSubImage3D calls of the cut layer; cutCounts and cutVolumes are what the cut layer was last written from and into
  retireFlat: boolean;
  cutOnChange: boolean;
  // the resolution by distance (story 2; default true: on by decision, though it showed no gain in the pass time: change window all passes -0.03 ms, base mist pass +0.09 ms against a floor of 0.09 ms; false is every slice at the path's factor), the pixels of the fresh draws' viewports and the bytes of the job outputs uploaded, since the start
  baseLodRes: boolean;
  freshPixels: number;
  jobBytes: number;
  retiredSlices: number;
  // the row band applied last (story B): its pass, core rows and whether it was the head; null before one
  lastBand: { pass: number; core: number[]; head: boolean; epoch?: number } | null;
  // the tests' count: the retired slices blended at weight 1 by the bands of pass 0, by the band's first core row
  bandRetired: Record<number, number>;
  // the tests' diagnostic switches (M.TEST only; see the changelog)
  noBandUpload: boolean;
  noBandBlend: boolean;
  wholeBandUpload: boolean;
  private bandShadow: Map<number, Uint16Array>;
  cutUploads: number;
  // the cut layer's writes made though its counts and its textures were the ones last written (what cutOnChange saves: 0 with it on)
  cutRedundant: number;
  private cutCounts: Uint16Array | null;
  private cutVolumes: WebGLTexture[] | null;
  // the tests' probe: the slices whose uploaded pair is read back right after the upload (null: none), and what was read (the pair's direct and mirror pictures, RGBA floats, rows from the bottom)
  probe: number[] | null;
  probed: Map<number, { direct: Float32Array; mirror: Float32Array }>;
  // the last build's culling counts (Feature U3, story M5): the builds made, the slice draws issued (the largest column count), the cells the plan needs (the sum of the columns' slice counts), the uncut cells,
  // the columns with fewer than SLICES slices, the slices drawn flat; slicesNeeded: the columns' slice counts (index row x across + column), SLICES everywhere with the level of detail off
  audit: { builds: number; slices: number; cells: number; full: number; culledColumns: number; flatSlices: number };
  slicesNeeded: Uint16Array;
  private lastBase: number;
  // the plan made for a view (the key: the view's values), kept while they are the same: the accumulation's frames plan the same view
  private planKey: string;
  private planned: { slices: Uint16Array; levels: Uint8Array } | null;
  private chains: Chain[];
  // the table of factors made for a focal and a path factor, and the layout of a job's output by class (kept while the factors, the covered slices and the columns are the same)
  private tableFocal: number;
  private tableBase: number;
  private table: Uint8Array | null;
  private layoutFactors: Uint8Array;
  private layoutCovered: number;
  private layoutAcross: number;
  private layoutDown: number;
  private layout: ReturnType<typeof BaseLodRes.layoutOf> | null;
  private classOf: Uint8Array;
  private placeOf: Uint8Array;
  readonly cut = new CutLayer();
  private blended: Pair | null;
  private size: string;

  constructor(effect: Fog, programs: Record<string, ShaderProgram>, blend: ShaderProgram, store: ShaderProgram) {
    this.effect = effect;
    this.gl = effect.gl;
    this.schedule = new Schedule();
    const owned = effect.ownPrograms(programs, ["baseMistVolume", "fogAccumBlendArray"]);
    this.volume = owned[0]!;
    this.volume.samplers({ uNoise: M.UNITS.noise, uShade: M.UNITS.shade, uSumDirect: M.UNITS.fogSum, uSumMirror: M.UNITS.fogSumMirror });
    this.blendArray = owned[1]!;
    this.blendArray.samplers({ uHeld: M.UNITS.fogDirect, uHeldMirror: M.UNITS.fogMirror, uFreshArray: M.UNITS.fogSum });
    this.perSlice = false;
    this.blend = blend;
    this.store = store;
    this.drawFrames = 0;
    this.exactBuilds = 0;
    this.freshDraws = 0;
    this.retireFlat = true;
    this.cutOnChange = true;
    this.baseLodRes = true;
    this.freshPixels = 0;
    this.jobBytes = 0;
    this.retiredSlices = 0;
    this.lastBand = null;
    this.bandRetired = {};
    this.noBandUpload = false;
    this.noBandBlend = false;
    this.wholeBandUpload = false;
    this.bandShadow = new Map();
    this.cutUploads = 0;
    this.cutRedundant = 0;
    this.cutCounts = null;
    this.cutVolumes = null;
    this.probe = null;
    this.probed = new Map();
    this.audit = { builds: 0, slices: 0, cells: 0, full: 0, culledColumns: 0, flatSlices: 0 };
    this.slicesNeeded = new Uint16Array(0);
    this.lastBase = 0;
    this.planKey = "";
    this.planned = null;
    this.chains = [];
    this.tableFocal = 0;
    this.tableBase = 0;
    this.table = null;
    this.layoutFactors = new Uint8Array(SLICES);
    this.layoutCovered = 0;
    this.layoutAcross = 0;
    this.layoutDown = 0;
    this.layout = null;
    this.classOf = new Uint8Array(SLICES);
    this.placeOf = new Uint8Array(SLICES);
    this.blended = null;
    this.size = "";
  }

  // the first slice an accumulation's frames from 1 on do not draw (the flat slices are retired): SLICES without the economy or the level of detail
  retireFrom(): number {
    return this.retireFlat && this.effect.baseLodActive() ? BaseLod.firstFlat(this.focal) : SLICES;
  }

  get converged(): boolean {
    return this.schedule.mode === "idle";
  }

  get mode(): string {
    return this.schedule.mode;
  }

  get frames(): number {
    return this.schedule.frames;
  }

  // the volume's footprint in cells (M.StaticMist.coarsen's focal): the camera's focal length in the volume's columns' widths
  get focal(): number {
    const tile = this.effect.columns[2] || 1;
    return this.effect.camera.focal() / tile;
  }

  // an exact build owed (a settings or size change, the tests' rebuildExact)
  rebuildExact(): void {
    this.schedule.event("settings");
  }

  private stack(): Stack {
    return this.effect.light as unknown as Stack;
  }

  private pair(width: number, height: number, filter: GLenum): Pair {
    const gl = this.gl;
    // (made here and deleted by release() alone: not registered with the effect, whose destroy() would delete them a second time)
    const textures = [0, 1].map(() => M.RenderTarget.storage(gl, gl.RGBA16F, width, height, filter));
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[0]!, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, textures[1]!, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    return { textures, framebuffer };
  }

  // the pictures of a reduction of the volume's columns (made again when the columns changed)
  private chain(factor: number): Chain {
    const s = this.stack();
    const key = `${s.across}x${s.down}`;
    if (key !== this.size) {
      this.release();
      this.size = key;
    }
    let chain = this.chains.find((c) => c.factor === factor);
    if (!chain) {
      const across = FogAccum.reduced(s.across, factor), down = FogAccum.reduced(s.down, factor);
      chain = { array: null, factor, across, down, pairs: [this.pair(across, down, this.gl.LINEAR), this.pair(across, down, this.gl.LINEAR)] };
      this.chains.push(chain);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
    if (!this.blended) {
      this.blended = this.pair(s.across, s.down, this.gl.NEAREST);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
    return chain;
  }

  // the chain of a factor already made by chain() in this frame (no string made: a lookup a slice); made if absent
  private chainOf(factor: number): Chain {
    for (const c of this.chains) {
      if (c.factor === factor) {
        return c;
      }
    }
    return this.chain(factor);
  }

  // the texture array of a chain (2 x SLICES layers of the chain's size), made if absent
  private ensureArray(chain: Chain): WebGLTexture {
    const gl = this.gl;
    if (chain.array === null) {
      chain.array = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, chain.array);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA16F, chain.across, chain.down, 2 * SLICES);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    return chain.array;
  }

  // the pictures let go (the columns changed, or the effect is destroyed)
  release(): void {
    const gl = this.gl;
    for (const p of this.chains.flatMap((c) => c.pairs).concat(this.blended ? [this.blended] : [])) {
      p.textures.forEach((t) => gl.deleteTexture(t));
      gl.deleteFramebuffer(p.framebuffer);
    }
    for (const c of this.chains) {
      if (c.array) {
        gl.deleteTexture(c.array);
      }
    }
    this.chains = [];
    this.layout = null;
    this.layoutCovered = 0;
    this.blended = null;
    this.size = "";
    // (the cut layer is written again into whatever textures the next build has: a size change makes new ones, and the effect's destroy ends the volume)
    this.cutCounts = null;
    this.cutVolumes = null;
  }

  private bindSums(pair: WebGLTexture[]): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    gl.bindTexture(gl.TEXTURE_2D, pair[0]!);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSumMirror);
    gl.bindTexture(gl.TEXTURE_2D, pair[1]!);
  }

  // the view and focal the build's plan is made from (M.BaseLod): the camera, the water, the volume's columns, the base's strength in inputs.mist
  cullView(base: number = this.lastBase): { view: FogQualityView; focal: number } {
    const e = this.effect, c = e.camera, s = this.stack();
    const view: FogQualityView = {
      inputs: { eyeY: c.eyeY(), focal: c.focal(), width: c.width, height: c.height, lensX: e.builtLens.x, lensY: e.builtLens.y, waterDrawn: e.waterDrawn, sigma: 0, air: AIR_EXTINCTION, mist: base },
      pitch: c.tilt(),
      margin: e.ubo.data[15]!,
      across: s.across,
      down: s.down,
    };
    return { view, focal: this.focal };
  }

  // this slice's coarsening constants (M.StaticMist.coarsen at the slice's middle, the window's mean at that lod and narrowing); a flat slice (M.BaseLod.level 0) has the amplitude 0: the shader skips the noise
  private coarse(k: number, focal: number, flat = false): number[] {
    const tm = 0.5 * (sliceStart(k) + sliceStart(k + 1));
    const c = StaticMist.coarsen(tm, focal);
    return [c.lodShift, flat ? 0 : c.amplitude, c.cutoffNarrow, 1 / StaticMist.windowMean(c.lodShift, c.cutoffNarrow)];
  }

  // THE SEAM: the fresh slice k of this frame, at the chain's reduction and jittered; returns the pair of pictures that holds it (slice k of the chain is in pair k & 1, read from pair (k + 1) & 1). Called for
  // k = 0 .. SLICES - 1 in order, once a frame, with the frame's `begin` made; a slice produced elsewhere would be uploaded into the pair returned here and nothing else of the frame changes
  // `prev`: the previous slice's picture when it is not in this chain's other pair (the slice before is on another chain): its textures and lattice; read through uPrev, bilinear when the lattice is not this one's
  fresh(chain: Chain, k: number, jitter: number[], base: number, focal: number, flat = false, prev?: Chain): WebGLTexture[] {
    const gl = this.gl;
    const s = this.stack();
    const sx = s.across / chain.across, sy = s.down / chain.down;
    gl.viewport(0, 0, chain.across, chain.down);
    this.freshPixels += chain.across * chain.down;
    const from = prev && prev !== chain ? prev : null;
    if (k > 0) {
      this.bindSums(from ? from.pairs[(k + 1) & 1]!.textures : chain.pairs[(k + 1) & 1]!.textures);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, chain.pairs[k & 1]!.framebuffer);
    const u = this.volume.use();
    gl.uniform1i(u.uSlice, k);
    gl.uniform4f(u.uAccum, sx - 1, sy - 1, jitter[0]! - 0.5, jitter[1]! - 0.5);
    gl.uniform1f(u.uAccumZ, jitter[2]!);
    if (from && (from.across !== chain.across || from.down !== chain.down)) {
      gl.uniform4f(u.uPrev, s.across / from.across, s.down / from.down, from.across, from.down);
    } else {
      gl.uniform4f(u.uPrev, 1, 1, 0, 0);
    }
    const c = this.coarse(k, focal, flat);
    gl.uniform4f(u.uCoarse, c[0]!, c[1]!, c[2]!, c[3]!);
    gl.uniform1f(u.uBase, base);
    this.effect.quad.drawFull();
    this.freshDraws++;
    return chain.pairs[k & 1]!.textures;
  }

  // the volume's columns across and down (the job's view)
  geometry(): { across: number; down: number } {
    const s = this.stack();
    return { across: s.across, down: s.down };
  }

  // THE SEAM, the job's way, per slice (the tests' reference path): slice k's two planes of a job's output uploaded into the pair the GPU's fresh pass would have drawn into (a slice past the output's is its last); returns that pair's textures
  private upload(chain: Chain, k: number, output: Uint16Array): WebGLTexture[] {
    const gl = this.gl;
    const plane = chain.across * chain.down * 4, pair = chain.pairs[k & 1]!, covered = Math.floor(output.length / (2 * plane)), j = Math.min(k, covered - 1);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    for (let m = 0; m < 2; m++) {
      gl.bindTexture(gl.TEXTURE_2D, pair.textures[m]!);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, chain.across, chain.down, gl.RGBA, gl.HALF_FLOAT, output.subarray((j * 2 + m) * plane, (j * 2 + m + 1) * plane));
    }
    if (this.probe !== null && this.probe.indexOf(k) >= 0) {
      this.probed.set(k, this.readPair(chain, pair));
    }
    return pair.textures;
  }

  // a job's whole output in ONE upload: the chain's texture array (2 x SLICES layers of the chain's size, made at the first use) takes the covered slices' layers (2 k direct, 2 k + 1 mirrored: the job's order); returns the slices covered
  private uploadArray(chain: Chain, output: Uint16Array): number {
    const gl = this.gl;
    const plane = chain.across * chain.down * 4, layers = Math.floor(output.length / plane);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    if (chain.array === null) {
      chain.array = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, chain.array);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA16F, chain.across, chain.down, 2 * SLICES);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, chain.array);
    }
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, chain.across, chain.down, layers, gl.RGBA, gl.HALF_FLOAT, output);
    StallCause.probe.count(E_UP_CALLS);
    StallCause.probe.count(E_UP_BYTES, output.byteLength);
    this.jobBytes += output.byteLength;
    const covered = Math.floor(layers / 2);
    if (this.probe !== null) {
      for (const k of this.probe) {
        if (k < covered) {
          this.probed.set(k, this.readLayers(chain, k));
        }
      }
    }
    return covered;
  }

  // the slices a job's output of this length covers, given each slice's factor (the output is the covered slices' planes, two a slice, by class: its length is the sum of their lattices)
  private coveredOf(length: number, factors: Uint8Array, band?: { from: number; to: number; head: boolean }): number {
    const s = this.stack();
    if (band) {
      // (a row band's output: the finest class of the covered slices holds the band's rows, the coarser classes are there for the head band only; the covered slices are the first whose layout is this long)
      const finest = BaseLodRes.bandFactorOf(factors);
      for (let covered = 1; covered <= SLICES; covered++) {
        let size = 0;
        for (let k = 0; k < covered; k++) {
          const f = factors[k]!, ra = FogAccum.reduced(s.across, f);
          size += f === finest ? 8 * ra * (band.to - band.from) : band.head ? 8 * ra * FogAccum.reduced(s.down, f) : 0;
        }
        if (size >= length) {
          return covered;
        }
      }
      return SLICES;
    }
    let at = 0;
    for (let k = 0; k < SLICES; k++) {
      const f = factors[k]!;
      at += 8 * FogAccum.reduced(s.across, f) * FogAccum.reduced(s.down, f);
      if (at >= length) {
        return k + 1;
      }
    }
    return SLICES;
  }

  // M.BaseMistJob.layoutOf of the factors for the covered slices and the volume's columns, with each slice's class and place in it; kept while they are the same (a job's output is made each frame, its layout seldom)
  private layoutFor(factors: Uint8Array, covered: number): NonNullable<BaseMistVolume["layout"]> {
    const s = this.stack();
    let same = this.layout !== null && this.layoutCovered === covered && this.layoutAcross === s.across && this.layoutDown === s.down;
    for (let k = 0; same && k < SLICES; k++) {
      same = factors[k] === this.layoutFactors[k];
    }
    if (!same) {
      const lay = BaseLodRes.layoutOf(factors, covered, s.across, s.down);
      this.layoutFactors.set(factors);
      this.layoutCovered = covered;
      this.layoutAcross = s.across;
      this.layoutDown = s.down;
      this.layout = lay;
      lay.classes.forEach((cl, ci) => cl.slices.forEach((k, j) => {
        this.classOf[k] = ci;
        this.placeOf[k] = j;
      }));
    }
    return this.layout!;
  }

  // the table of factors for a focal and a path's factor (M.BaseLodRes.table), kept while they are the same
  private tableFor(focal: number, base: number): Uint8Array {
    if (this.table === null || this.tableFocal !== focal || this.tableBase !== base) {
      this.table = BaseLodRes.table(focal, base);
      this.tableFocal = focal;
      this.tableBase = base;
    }
    return this.table;
  }

  // a job's output by class (the output's layout with factors): ONE texSubImage3D for each class, into that class's chain's array (layer 2 j direct, 2 j + 1 mirrored, j the slice's place in the class); returns the slices covered
  private uploadClasses(output: Uint16Array, factors: Uint8Array, band?: { from: number; to: number; head: boolean }): number {
    const s = this.stack(), gl = this.gl, covered = this.coveredOf(output.length, factors, band), lay = this.layoutFor(factors, covered);
    // (a row band: the output's own layout, the finest class's rows only, uploaded as a sub-rectangle at the band's first row; the head band's coarser classes whole)
    const sent = band ? BaseLodRes.layoutOf(factors, covered, s.across, s.down, band) : lay;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    const bandFactor = BaseLodRes.bandFactorOf(factors);
    sent.classes.forEach((cl) => {
      const chain = this.chainOf(cl.factor);
      this.ensureArray(chain);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, chain.array);
      const part = output.subarray(cl.offset, cl.offset + cl.length), isBand = band !== undefined && cl.factor === bandFactor;
      if (M.TEST && isBand && this.noBandUpload) {
        return;
      }
      if (M.TEST && isBand && this.wholeBandUpload) {
        // (the band's rows into the CPU copy of the whole class array, and the whole array uploaded: layer-major, so the copy holds up to SLICES slices)
        const whole = lay.classes.find((c) => c.factor === cl.factor)!, need = 2 * SLICES * whole.rd * whole.ra * 4;
        let shadow = this.bandShadow.get(cl.factor);
        if (!shadow || shadow.length !== need) {
          shadow = new Uint16Array(need);
          this.bandShadow.set(cl.factor, shadow);
        }
        for (let j = 0; j < cl.slices.length; j++) {
          for (let m = 0; m < 2; m++) {
            for (let y = 0; y < cl.rd; y++) {
              shadow.set(output.subarray(cl.offset + (((j * 2 + m) * cl.rd + y) * cl.ra) * 4, cl.offset + (((j * 2 + m) * cl.rd + y + 1) * cl.ra) * 4), (((j * 2 + m) * whole.rd + band!.from + y) * whole.ra) * 4);
            }
          }
        }
        const all = shadow.subarray(0, 2 * whole.slices.length * whole.rd * whole.ra * 4);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, whole.ra, whole.rd, 2 * whole.slices.length, gl.RGBA, gl.HALF_FLOAT, all);
        StallCause.probe.count(E_UP_CALLS);
        StallCause.probe.count(E_UP_BYTES, all.byteLength);
        return;
      }
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, band && cl.factor === bandFactor ? band.from : 0, 0, cl.ra, cl.rd, 2 * cl.slices.length, gl.RGBA, gl.HALF_FLOAT, part);
      StallCause.probe.count(E_UP_CALLS);
      StallCause.probe.count(E_UP_BYTES, part.byteLength);
    });
    this.jobBytes += output.byteLength;
    if (this.probe !== null) {
      for (const k of this.probe) {
        if (k < covered) {
          this.probed.set(k, this.readLayers(this.chainOf(lay.classes[this.classOf[k]!]!.factor), this.placeOf[k]!));
        }
      }
    }
    return covered;
  }

  // slice k's two layers of the chain's array read back (the tests' probe)
  private readLayers(chain: Chain, k: number): { direct: Float32Array; mirror: Float32Array } {
    const gl = this.gl;
    const framebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const buffer = gl.getParameter(gl.READ_BUFFER) as GLenum;
    const scratch = gl.createFramebuffer();
    const out = { direct: new Float32Array(chain.across * chain.down * 4), mirror: new Float32Array(chain.across * chain.down * 4) };
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scratch);
    gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, chain.array, 0, 2 * k);
    gl.readPixels(0, 0, chain.across, chain.down, gl.RGBA, gl.FLOAT, out.direct);
    gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, chain.array, 0, 2 * k + 1);
    gl.readPixels(0, 0, chain.across, chain.down, gl.RGBA, gl.FLOAT, out.mirror);
    gl.readBuffer(buffer);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    gl.deleteFramebuffer(scratch);
    return out;
  }

  // the tests' statistics: for each slice of the list, the sums of the direct volume's light (rgb) and optical depth over the cells whose column's plan count is above the slice (the cells a read can reach), and their number
  sliceSums(list: number[]): { slice: number; rgb: number; a: number; n: number }[] {
    const gl = this.gl, s = this.stack();
    const framebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const buffer = gl.getParameter(gl.READ_BUFFER) as GLenum;
    const data = new Float32Array(s.across * s.down * 4), counts = this.slicesNeeded, planned = counts.length === s.across * s.down;
    const out: { slice: number; rgb: number; a: number; n: number }[] = [];
    for (const k of list) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.slices[layerOf(k)]!);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0, 0, s.across, s.down, gl.RGBA, gl.FLOAT, data);
      let rgb = 0, a = 0, n = 0;
      for (let i = 0; i < s.across * s.down; i++) {
        if (planned && counts[i]! <= k) {
          continue;
        }
        rgb += data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]!;
        a += data[i * 4 + 3]!;
        n++;
      }
      out.push({ slice: k, rgb, a, n });
    }
    gl.readBuffer(buffer);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    return out;
  }

  // a pair's two pictures read back (the tests' probe)
  private readPair(chain: Chain, pair: Pair): { direct: Float32Array; mirror: Float32Array } {
    const gl = this.gl;
    const framebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const buffer = gl.getParameter(gl.READ_BUFFER) as GLenum;
    const out = { direct: new Float32Array(chain.across * chain.down * 4), mirror: new Float32Array(chain.across * chain.down * 4) };
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pair.framebuffer);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, chain.across, chain.down, gl.RGBA, gl.FLOAT, out.direct);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, chain.across, chain.down, gl.RGBA, gl.FLOAT, out.mirror);
    gl.readBuffer(buffer);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
    return out;
  }

  // one frame's build as the schedule decided it: every slice produced, blended (an accumulation) or not (the exact build), and stored into the volume's layers
  frame(decision: Decision, frameIndex: number, base: number, job?: BaseMistFresh, gpuFactor?: number): void {
    const gl = this.gl;
    const s = this.stack();
    const exact = decision.exact;
    // (a job's output feeds an accumulating frame only: the exact build is the GPU's)
    const made = !exact && job ? job : null;
    const chain = this.chain(exact ? 1 : made ? made.factor : gpuFactor || REDUCE);
    // (a job's output: all of it in one upload, the blend reading the array, or by class when it has the factors of each slice; or, the tests' reference, slice by slice)
    const byClass = made !== null && made.factors !== undefined && !this.perSlice;
    P.push();
    const covered = byClass ? this.uploadClasses(made!.output, made!.factors!, made!.band) : made && !this.perSlice ? this.uploadArray(chain, made.output) : 0;
    P.pop(S_UPLOAD);
    const jitter = exact ? [0.5, 0.5, 0.5] : FogAccum.jitter(frameIndex);
    const focal = this.focal;
    const guard = this.effect.guard;
    const each = guard.size("base mist", "slice");
    // the plan (M.BaseLod): the slices each column needs, and the flat levels; the level of detail off is the whole build. The slices past the largest count are not drawn; the exact build also keeps each slice's
    // draws to the rectangle of the columns that need it (the accumulation's reduced pictures are read between columns, so it draws whole slices)
    P.push();
    const active = this.effect.baseLodActive();
    const cv = this.cullView(base);
    this.lastBase = base;
    const i = cv.view.inputs, key = [active, i.eyeY, i.focal, i.width, i.height, i.lensX, i.lensY, i.waterDrawn, i.mist, cv.view.pitch, cv.view.margin, cv.view.across, cv.view.down, cv.focal].join(",");
    if (key !== this.planKey || !this.planned) {
      this.planned = BaseLod.plan(active, cv.view, cv.focal);
      this.planKey = key;
    }
    const plan = this.planned;
    this.slicesNeeded = plan.slices;
    P.pop(S_PLAN);
    // (the GPU's slices by distance: each slice on the chain of its own factor)
    const table = !exact && active && this.baseLodRes && !made ? this.tableFor(focal, chain.factor) : null;
    const lay = byClass ? this.layout! : null;
    // (a row band: the volume's rows its core rows of the finest lattice cover; the bands of a pass partition them: from floor(core0 sy) to floor(core1 sy), the last to the top)
    const band = byClass ? made!.band : undefined, rows0 = band && made!.factors ? FogAccum.reduced(s.down, BaseLodRes.bandFactorOf(made!.factors)) : 1;
    const bandY0 = band ? Math.floor((band.core[0]! * s.down) / rows0) : 0, bandY1 = band ? (band.core[1]! >= rows0 ? s.down : Math.floor((band.core[1]! * s.down) / rows0)) : 0;
    let before: Chain | undefined;
    let most = 0, cells = 0, culled = 0, flat = 0;
    for (let c = 0; c < plan.slices.length; c++) {
      const n = plan.slices[c]!;
      cells += n;
      if (n > most) most = n;
      if (n < SLICES) culled++;
    }
    for (let k = 0; k < SLICES; k++) if (active && plan.levels[k] === 0) flat++;
    // the flat slices (the density the closed form, the sums smooth in the ray's direction) are exact after one frame: the accumulation's frame 0 blends them with the weight 1 (the held layers are the old view's), the frames from 1 on draw none of them
    const retire = !exact && active && this.retireFlat, firstFlat = retire ? BaseLod.firstFlat(focal) : SLICES;
    // (the accumulation's first update of these cells, the frame 0 or a job flagged first: the retired slices are drawn at weight 1; a later one draws none of them)
    const firstUpdate = frameIndex === 0 || (made !== null && made.first === true);
    const limit = retire && !firstUpdate ? Math.min(most, firstFlat) : most;
    // (the tests' switch noBandBlend: a band's frame draws no blend and no store)
    const drawLimit = M.TEST && this.noBandBlend && band ? 0 : limit;
    this.retiredSlices += most - limit;
    const alphaOf = (k: number): number => (retire && firstUpdate && k >= firstFlat ? 1 : decision.alpha);
    // (the tests' split timing: the draws of every `split`-th slice timed one by one, named by kind and slice, and no pass of the whole build)
    const split = M.TEST ? this.effect.timeSplit : 0;
    const time = (kind: string, k: number): boolean => {
      if (split > 0 && k % split === 0) {
        guard.begin("base mist " + kind + " " + k, "slice");
        return true;
      }
      return false;
    };
    if (split === 0) {
      guard.begin("base mist", "slice");
    }
    // the exact build draws each slice only over the columns that need it (the scissor); every build draws the prefix of the largest count and writes the cut layer: a read clamps to the column's cut
    const boxes = exact && active ? this.boxes(plan.slices, s.across, s.down) : null;
    if (boxes) {
      gl.enable(gl.SCISSOR_TEST);
    }
    if (band) {
      gl.enable(gl.SCISSOR_TEST);
    }
    P.push();
    for (let k = 0; k < drawLimit; k++) {
      // (a retired slice the job's output does not cover is left as it is: blending it would copy the last covered slice, which has far less optical depth)
      if (retire && firstUpdate && made !== null && !this.perSlice && k >= firstFlat && k >= covered) {
        continue;
      }
      if (boxes) {
        gl.scissor(boxes[k * 4]!, boxes[k * 4 + 1]!, boxes[k * 4 + 2]! - boxes[k * 4]!, boxes[k * 4 + 3]! - boxes[k * 4 + 1]!);
      } else if (band) {
        gl.scissor(0, bandY0, s.across, bandY1 - bandY0);
      }
      const kk = Math.min(k, covered - 1), cls = lay ? lay.classes[this.classOf[kk]!]! : null;
      const ch = cls ? this.chainOf(cls.factor) : table ? this.chainOf(table[k]!) : chain;
      const sx = s.across / ch.across, sy = s.down / ch.down;
      const timedFresh = time("fresh", k);
      const fresh = made ? (this.perSlice ? this.upload(chain, k, made.output) : this.blended!.textures) : this.fresh(ch, k, jitter, base, focal, active && plan.levels[k] === 0, before);
      before = ch;
      if (timedFresh) {
        guard.end();
      }
      gl.viewport(0, 0, s.across, s.down);
      if (exact) {
        this.bindSums(fresh);
      } else if (made && !this.perSlice) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blended!.framebuffer);
        const timedBlend = time("blend", k);
        const b = this.blendArray.use();
        gl.uniform1i(b.uSlice, layerOf(k));
        if (cls) {
          // (a row band that is not the head reads the coarse classes' arrays the head band filled: made here if no upload has yet, so a read never meets a missing texture)
          this.ensureArray(ch);
          gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, ch.array);
        }
        gl.uniform1i(b.uLayer, cls ? 2 * this.placeOf[kk]! : 2 * Math.min(k, covered - 1));
        gl.uniform1f(b.uAlpha, alphaOf(k));
        gl.uniform4f(b.uMap, 1 / sx, 1 / sy, jitter[0]! - 0.5, jitter[1]! - 0.5);
        gl.uniform4f(b.uSize, ch.across, ch.down, ch.across, ch.down);
        this.effect.quad.drawFull();
        if (timedBlend) {
          guard.end();
        }
        this.bindSums(this.blended!.textures);
      } else {
        this.bindSums(fresh);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blended!.framebuffer);
        const timedBlend = time("blend", k);
        const b = this.blend.use();
        gl.uniform1i(b.uSlice, layerOf(k));
        gl.uniform1f(b.uAlpha, alphaOf(k));
        gl.uniform4f(b.uMap, 1 / sx, 1 / sy, jitter[0]! - 0.5, jitter[1]! - 0.5);
        gl.uniform4f(b.uSize, ch.across, ch.down, ch.across, ch.down);
        this.effect.quad.drawFull();
        if (timedBlend) {
          guard.end();
        }
        this.bindSums(this.blended!.textures);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.slices[layerOf(k)]!);
      if (band) {
        gl.scissor(0, bandY0, s.across, bandY1 - bandY0);
      }
      const timedStore = time("store", k);
      this.store.use();
      this.effect.quad.drawFull();
      if (timedStore) {
        guard.end();
      }
      if (k % each === each - 1 || k === limit - 1) {
        guard.piece();
      }
    }
    P.pop(S_DRAWS);
    if (boxes || band) {
      gl.disable(gl.SCISSOR_TEST);
    }
    if (band) {
      this.lastBand = { pass: frameIndex, core: band.core.slice(), head: band.head };
      if (retire && firstUpdate) {
        this.bandRetired[band.core[0]!] = (this.bandRetired[band.core[0]!] || 0) + Math.max(0, limit - firstFlat);
      }
    }
    guard.end();
    P.push();
    this.writeCut(plan.slices, s);
    P.pop(S_CUT);
    this.drawFrames++;
    if (exact) {
      this.exactBuilds++;
    }
    this.audit = { builds: this.exactBuilds, slices: most, cells, full: plan.slices.length * SLICES, culledColumns: culled, flatSlices: flat };
    this.bindSums(s.sums);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // the rectangles (x0, y0, x1, y1 per slice, columns, scissor padded by one) of the columns that need slice k: the bounding box of the columns whose count is above k
  private boxes(counts: Uint16Array, across: number, down: number): Int32Array {
    const out = new Int32Array(SLICES * 4);
    const x0 = new Int32Array(SLICES).fill(across), y0 = new Int32Array(SLICES).fill(down), x1 = new Int32Array(SLICES), y1 = new Int32Array(SLICES);
    for (let r = 0; r < down; r++) {
      for (let c = 0; c < across; c++) {
        const n = Math.min(SLICES, counts[r * across + c]!);
        if (n < 1) continue;
        const k = n - 1;
        if (c < x0[k]!) x0[k] = c;
        if (c + 1 > x1[k]!) x1[k] = c + 1;
        if (r < y0[k]!) y0[k] = r;
        if (r + 1 > y1[k]!) y1[k] = r + 1;
      }
    }
    for (let k = SLICES - 2; k >= 0; k--) {
      if (x0[k + 1]! < x0[k]!) x0[k] = x0[k + 1]!;
      if (y0[k + 1]! < y0[k]!) y0[k] = y0[k + 1]!;
      if (x1[k + 1]! > x1[k]!) x1[k] = x1[k + 1]!;
      if (y1[k + 1]! > y1[k]!) y1[k] = y1[k + 1]!;
    }
    for (let k = 0; k < SLICES; k++) {
      out[k * 4] = Math.max(0, x0[k]! - 1);
      out[k * 4 + 1] = Math.max(0, y0[k]! - 1);
      out[k * 4 + 2] = Math.min(across, x1[k]! + 1);
      out[k * 4 + 3] = Math.min(down, y1[k]! + 1);
    }
    return out;
  }

  // the cut layer of the shared textures (both attachments' textures): each column's built slice count in red, written on every build
  private writeCut(counts: Uint16Array, s: Stack): void {
    // (written only when the counts changed or the textures are not the ones it was written into: an accumulation's frames share one plan)
    if (this.cutOnChange && this.cutVolumes !== null && !BaseLod.cutChanged(this.cutCounts, counts) && this.cutVolumes.length === s.volumes.length && this.cutVolumes.every((v, n) => v === s.volumes[n])) {
      return;
    }
    if (this.cutVolumes !== null && !BaseLod.cutChanged(this.cutCounts, counts) && this.cutVolumes.length === s.volumes.length && this.cutVolumes.every((v, n) => v === s.volumes[n])) {
      this.cutRedundant++;
    }
    this.cutCounts = counts.slice();
    this.cutVolumes = s.volumes.slice();
    const gl = this.gl;
    const data = this.cut.of(counts, s.across, s.down);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    for (const volume of s.volumes) {
      gl.bindTexture(gl.TEXTURE_3D, volume);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, CUT_LAYER, s.across, s.down, 1, gl.RGBA, gl.FLOAT, data);
      this.cutUploads++;
      StallCause.probe.count(E_UP_CALLS);
      StallCause.probe.count(E_UP_BYTES, data.byteLength);
    }
    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  // the program drawn once over one pixel (the driver finishes a program at its first draw), into the chain's picture: the volume is as it was
  warm(): void {
    const gl = this.gl;
    const chain = this.chain(REDUCE);
    // (the chains of the factors by distance, and the arrays of the job's classes: made now, not at the first frame that uses them)
    if (this.baseLodRes) {
      for (const f of this.tableFor(this.focal, REDUCE)) {
        this.chainOf(f);
      }
      if (this.effect.baseWorker) {
        for (const f of BaseLodRes.table(this.focal, JOB_FACTOR)) {
          this.ensureArray(this.chainOf(f));
        }
      }
    }
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    this.fresh(chain, 1, [0.5, 0.5, 0.5], 0, this.focal);
    gl.disable(gl.SCISSOR_TEST);
    this.bindSums(this.stack().sums);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

export const BaseMist = { Volume: BaseMistVolume, FAR, NEAR, SHARE, HB, SLICES, LAYERS, TOTAL_LAYERS, CUT_LAYER, clampSlice, readSums, cutLayer, CutLayer, FRONT_SLICES, LOG, ALBEDO, sliceStart, thickness, sliceOf, layerOf, Schedule, combine, colourWeight, albedo, gatherRay, VOLUME_GLSL: VOLUME_SOURCE };

M.BaseMist = BaseMist;
