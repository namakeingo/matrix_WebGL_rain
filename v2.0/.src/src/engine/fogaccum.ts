// The fog volume's temporal accumulation (Feature U1, story U6): the shipped build of the volume's slices (Fog.accum, the frames N of the average, M.FogAccum.FRAMES; M.TEST only: 0 builds exactly, the tests' control). The GL half of
// the pure model M.FogAccum (models/fogaccum.ts); the slices the plan owes this frame are built here instead of by Froxels.build:
// - each slice is gathered into a reduced picture (the columns of the full volume divided by `factor` each way, M.FogAccum.reduced), its sample moved inside the column and along the slice by the frame's
//   jitter (M.FogAccum.jitter; shaders/fog/fogaccum_volume.glsl), its sums so far the reduced chain's (two pictures swapped from slice to slice; a run that starts past slice 0 seeds the chain from the
//   held volume's slice before it: fogaccum_seed.glsl),
// - blended into the held volume: held = mix(held, fresh bilinear at the place the samples were taken, alpha) (fogaccum_blend.glsl, into a full-size picture), then written into the volume's layer
//   (fogaccum_store.glsl; a layer is never read while it is written),
// - the strikes' stacks are not touched (M.FogAccum.accumulates('strike') is false), and a change of the view, a setting or a gap in time builds the whole volume exactly as before (Fog.update), which
//   resets the average: every slice's weight is then 1 / N from the exact volume on.
// - with a job's output (the front volume's worker: upload, then build with fresh = true) the slices the plan owes are blended from the job's reduced pictures, each slice once per upload, skipped when already blended with it or
//   past the job's covered slices; the strikes' stacks are as before
// The held volume stays on its units (M.UNITS.fogDirect, fogMirror); the units of the sums (fogSum, fogSumMirror) carry the pictures of this build during it and the volume's own sums after it.
//
// Changelog:
// 2026-11-24: WARMED (the programs warm() draws once: the five this file draws); the job's texture array made at its real size and drawn once with the blendArray program and given one upload at the effect's warm-up when the front worker is on (the first accumulating
//   frame after a view change no longer pays the driver's first draw of the program on that array, nor the array's creation); firstDraw (M.TEST: the ms of the first draw of each program) and uploadStats (M.TEST: the upload calls' ms and bytes).
// 2026-11-24: upload(output, fresh, ranges?): one texSubImage3D for each range of slices (the layers of those slices, a view of the output); the generation and the jitter are the slice's (sliceGeneration, sliceJitter): a slice is blended
//   iff the data its layers hold has not been blended; dropFresh() and a new array drop every slice's data; uploadedLayers.
// 2026-11-23: warm(): the program fogAccumBlendArray drawn once over a one-pixel array.
// 2026-11-23: story P8a: the front volume's job (models/frontvolumejob.ts): upload(output, fresh) puts the whole output in ONE texSubImage3D into a 2D-array texture (layer 2 k direct, 2 k + 1 mirrored) and build(..., fresh) blends and stores each slice
//   owed once per upload generation from it with the program fogAccumBlendArray (no volume or seed draw); dropFresh() makes the next builds the GPU's; registered as M.FogAccumulation.
// 2026-11-23: story M7b: the program fogAccumBlendArray (shaders/fog/fogaccum_blend_array.glsl: the blend reading the base mist job's whole output from one texture array).
// 2026-11-22: the volume's text has `#define TEST_VIEWS` only under M.TEST (it was always there: the marched shade was compiled into both gathers; compile time).
// 2026-11-22: warm(): the four programs drawn once over one pixel at the effect's warm-up.
// 2026-11-22: shipped: always made with float pictures, no test option.
// 2026-11-21: new (Feature U1, story U6).
import { M } from "./core";
import { fill } from "./glsl";
import type { ProgramSources, ShaderProgram } from "./gl";
import { QualityFog } from "../models/quality/fog";
import { FogAccum } from "../models/fogaccum";
import type { Fog } from "../effects/fog";
import VOLUME_SOURCE from "../shaders/fog/fogaccum_volume.glsl";
import SEED_SOURCE from "../shaders/fog/fogaccum_seed.glsl";
import BLEND_SOURCE from "../shaders/fog/fogaccum_blend.glsl";
import BLEND_ARRAY_SOURCE from "../shaders/fog/fogaccum_blend_array.glsl";
import STORE_SOURCE from "../shaders/fog/fogaccum_store.glsl";
import { StallCause } from "../models/stallcause";

// the stall probe's event counts of the texture uploads (models/stallcause.ts)
const E_UP_CALLS = StallCause.probe.event("uploadCalls");
const E_UP_BYTES = StallCause.probe.event("uploadBytes");

// the columns of the volume that a column of the fresh picture covers, each way (the tests change it: FogAccumulation.factor)
const REDUCE = 2;
const NAMES = ["fogAccumVolume", "fogAccumSeed", "fogAccumBlend", "fogAccumStore"];

// the programs (the fog's own, with them)
export function fogAccumPrograms(): ProgramSources {
  const volume = fill(VOLUME_SOURCE, {
    "TEST_VIEWS": M.TEST ? "#define TEST_VIEWS" : "",
    "M.Camera.GLSL": M.Camera.GLSL,
    "Fog.GLSL": M.Fog.GLSL,
    "Fog.MEDIUM_GLSL": M.Fog.MEDIUM_GLSL,
    "Fog.SHADE_GLSL": M.Fog.SHADE_GLSL,
    "Fog.TEST_GLSL": M.Fog.TEST_GLSL,
    "Fog.GATHER_GLSL": M.Fog.GATHER_GLSL,
    "CULL_BELOW": QualityFog.CULL_BELOW.toFixed(2),
    "CULL_RELATIVE": QualityFog.CULL_RELATIVE,
    "TAIL_T": QualityFog.TAIL_T.toExponential(6),
  });
  return { fogAccumVolume: [M.FULL_VERTEX, volume], fogAccumSeed: [M.FULL_VERTEX, SEED_SOURCE], fogAccumBlend: [M.FULL_VERTEX, BLEND_SOURCE], fogAccumBlendArray: [M.FULL_VERTEX, BLEND_ARRAY_SOURCE], fogAccumStore: [M.FULL_VERTEX, STORE_SOURCE] };
}

// the volume's pair of pictures as Froxels keeps them (the stack of the fog's own light, one)
interface Volumes {
  // the layers of the volume's textures (the seed reads the held volume by a z coordinate over them: the front volume's slices and, after them, the base mist's)
  layers: number;
  across: number;
  down: number;
  volumes: WebGLTexture[];
  sums: WebGLTexture[];
  slices: WebGLFramebuffer[];
}

export class FogAccumulation {
  // the programs warm() draws once (the driver finishes a program at its first draw): every program this class draws
  static readonly WARMED = ["fogAccumVolume", "fogAccumSeed", "fogAccumBlend", "fogAccumBlendArray", "fogAccumStore"];

  effect: Fog;
  gl: WebGL2RenderingContext;
  slices: number;
  volume: ShaderProgram;
  seed: ShaderProgram;
  blend: ShaderProgram;
  store: ShaderProgram;
  // the blend reading a job's output from one texture array (the base mist's program, owned by BaseMistVolume)
  blendArray: ShaderProgram;
  // the job's output: the 2D-array texture (made at the first upload and again when the reduced size changes), its size, the generation of the last upload (rising), whether the output is still for the held volume, the slices it
  // covers, the generation each slice was blended with, the jitter it was made with and the counters (the volume program's slice draws; texSubImage3D calls; blends from a job; owed slices skipped)
  array: WebGLTexture | null;
  arrayAcross: number;
  arrayDown: number;
  freshGeneration: number;
  freshValid: boolean;
  sliceGeneration: Uint32Array;
  sliceJitter: number[][];
  blendedGeneration: Uint32Array;
  uploadedLayers: number;
  // (the tests' timings: the ms of the first draw of each program, and of the upload's calls)
  firstDraw: Record<string, number>;
  uploadStats: { calls: number; ms: number; bytes: number; max: number; array: number };
  freshDraws: number;
  uploadCalls: number;
  blends: number;
  skipped: number;
  // the columns of the volume per column of the fresh picture, each way (the size is made again when it changes)
  factor: number;
  // the frames blended since the last reset (the jitter's index) and each slice's blends since it
  frames: number;
  counts: Uint8Array;
  // the frame's jitter
  jitter: number[];
  // the sizes of the pictures made: the volume's columns and the fresh picture's
  across: number;
  down: number;
  reducedAcross: number;
  reducedDown: number;
  // the reduced chain's two pairs of pictures (direct, mirror) and their framebuffers; the blended slice's pair
  chain: WebGLTexture[][];
  chainFramebuffers: WebGLFramebuffer[];
  blended: WebGLTexture[];
  blendFramebuffer: WebGLFramebuffer | null;
  made: boolean;

  constructor(effect: Fog, programs: Record<string, ShaderProgram>, slices: number) {
    this.effect = effect;
    this.gl = effect.gl;
    this.slices = slices;
    const [volume, seed, blend, store] = effect.ownPrograms(programs, NAMES);
    this.volume = volume!;
    this.seed = seed!;
    this.blend = blend!;
    this.store = store!;
    this.blendArray = programs.fogAccumBlendArray!;
    this.blendArray.samplers({ uHeld: M.UNITS.fogDirect, uHeldMirror: M.UNITS.fogMirror, uFreshArray: M.UNITS.fogSum });
    this.array = null;
    this.arrayAcross = 0;
    this.arrayDown = 0;
    this.freshGeneration = 0;
    this.freshValid = false;
    this.sliceGeneration = new Uint32Array(slices);
    this.sliceJitter = Array.from({ length: slices }, () => [0.5, 0.5, 0.5]);
    this.blendedGeneration = new Uint32Array(slices);
    this.uploadedLayers = 0;
    this.firstDraw = {};
    this.uploadStats = { calls: 0, ms: 0, bytes: 0, max: 0, array: 0 };
    this.freshDraws = 0;
    this.uploadCalls = 0;
    this.blends = 0;
    this.skipped = 0;
    volume!.samplers({ uNoise: M.UNITS.noise, uShade: M.UNITS.shade, uSumDirect: M.UNITS.fogSum, uSumMirror: M.UNITS.fogSumMirror });
    seed!.samplers({ uHeld: M.UNITS.fogDirect, uHeldMirror: M.UNITS.fogMirror });
    blend!.samplers({ uHeld: M.UNITS.fogDirect, uHeldMirror: M.UNITS.fogMirror, uFresh: M.UNITS.fogSum, uFreshMirror: M.UNITS.fogSumMirror });
    store!.samplers({ uBlended: M.UNITS.fogSum, uBlendedMirror: M.UNITS.fogSumMirror });
    this.factor = REDUCE;
    this.frames = 0;
    this.counts = new Uint8Array(slices);
    this.jitter = [0.5, 0.5, 0.5];
    this.across = 0;
    this.down = 0;
    this.reducedAcross = 0;
    this.reducedDown = 0;
    this.chain = [];
    this.chainFramebuffers = [];
    this.blended = [];
    this.blendFramebuffer = null;
    this.made = false;
  }

  // the average starts again from the exact volume: every slice's weight is 1 / n from now on
  reset(n: number) {
    this.frames = 0;
    this.counts.fill(Math.max(1, n));
  }

  // the pictures for the volume's columns (made again when the columns or the factor changed)
  make(v: Volumes) {
    const ra = FogAccum.reduced(v.across, this.factor), rd = FogAccum.reduced(v.down, this.factor);
    if (this.made && v.across === this.across && v.down === this.down && ra === this.reducedAcross && rd === this.reducedDown) {
      return;
    }
    const gl = this.gl;
    if (this.made) {
      this.dropFresh();
    }
    this.release();
    this.across = v.across;
    this.down = v.down;
    this.reducedAcross = ra;
    this.reducedDown = rd;
    const target = (width: number, height: number, filter: GLenum) => [0, 1].map(() => this.effect.own(M.RenderTarget.storage(gl, gl.RGBA16F, width, height, filter), (t: WebGLTexture) => gl.deleteTexture(t)));
    const frame = (textures: WebGLTexture[]) => {
      const framebuffer = this.effect.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[0]!, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, textures[1]!, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      return framebuffer;
    };
    this.chain = [target(ra, rd, gl.LINEAR), target(ra, rd, gl.LINEAR)];
    this.chainFramebuffers = this.chain.map(frame);
    this.blended = target(v.across, v.down, gl.NEAREST);
    this.blendFramebuffer = frame(this.blended);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.made = true;
  }

  release() {
    const gl = this.gl;
    for (const t of this.chain.flat().concat(this.blended)) {
      gl.deleteTexture(t);
    }
    for (const f of this.chainFramebuffers.concat(this.blendFramebuffer ? [this.blendFramebuffer] : [])) {
      gl.deleteFramebuffer(f);
    }
    this.chain = [];
    this.chainFramebuffers = [];
    this.blended = [];
    this.blendFramebuffer = null;
    this.made = false;
  }

  // the job's texture array deleted (the effect's destroy)
  releaseFresh() {
    this.freshValid = false;
    if (this.array !== null) {
      this.gl.deleteTexture(this.array);
      this.array = null;
    }
  }

  // one full-screen draw of the program just made current (the first of each program timed under M.TEST: the driver's compile shows there)
  private draw(name: string): void {
    if (M.TEST && !(name in this.firstDraw)) {
      const t0 = performance.now();
      this.effect.quad.drawFull();
      this.firstDraw[name] = Math.round((performance.now() - t0) * 100) / 100;
      return;
    }
    this.effect.quad.drawFull();
  }

  // the job's texture array at a size (made at the first use and when the size changes: its slices' data is then gone); whether it was made
  private ensureArray(ra: number, rd: number): boolean {
    const gl = this.gl;
    if (this.array !== null && ra === this.arrayAcross && rd === this.arrayDown) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.array);
      return false;
    }
    const t0 = M.TEST ? performance.now() : 0;
    if (this.array !== null) {
      gl.deleteTexture(this.array);
    }
    this.array = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.array);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA16F, ra, rd, 2 * this.slices);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.arrayAcross = ra;
    this.arrayDown = rd;
    this.sliceGeneration.fill(0);
    if (M.TEST) {
      this.uploadStats.array += performance.now() - t0;
    }
    return true;
  }

  // a job's output taken in: for each range [from, to) of slices (all the covered ones without ranges) ONE texSubImage3D of the layers of those slices (2 k direct, 2 k + 1 mirrored: a view of the output, whose first slice is
  // fresh.first, 0 for a whole output) into the texture array of the reduced size (the volume's columns divided by the job's factor); the slices of the ranges take the generation of the upload and its jitter (each slice is blended once
  // per generation, with its own jitter); the generation of the upload
  upload(output: Uint16Array, fresh: { factor: number; covered: number; jitter: number[]; first?: number }, ranges?: number[][]): number {
    const gl = this.gl, columns = this.effect.columns, ra = FogAccum.reduced(columns[0]!, fresh.factor), rd = FogAccum.reduced(columns[1]!, fresh.factor);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    this.ensureArray(ra, rd);
    const generation = ++this.freshGeneration, plane = ra * rd * 4, first = fresh.first || 0;
    for (const range of ranges || [[0, fresh.covered]]) {
      const from = range[0]!, to = Math.min(range[1]!, fresh.covered);
      if (to <= from) {
        continue;
      }
      const callStart = M.TEST ? performance.now() : 0;
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 2 * from, ra, rd, 2 * (to - from), gl.RGBA, gl.HALF_FLOAT, from === first && 2 * (to - from) * plane === output.length ? output : output.subarray((from - first) * 2 * plane, (to - first) * 2 * plane));
      if (M.TEST) {
        const took = performance.now() - callStart, stats = this.uploadStats;
        stats.calls++;
        stats.ms += took;
        stats.bytes += 2 * (to - from) * plane * 2;
        stats.max = Math.max(stats.max, took);
      }
      this.uploadCalls++;
      StallCause.probe.count(E_UP_CALLS);
      StallCause.probe.count(E_UP_BYTES, 2 * (to - from) * plane * 2);
      this.uploadedLayers += 2 * (to - from);
      for (let k = from; k < to; k++) {
        this.sliceGeneration[k] = generation;
        this.sliceJitter[k] = fresh.jitter.slice();
      }
    }
    this.freshValid = true;
    return generation;
  }

  // the output taken in is for another view, setting or size: the builds are the GPU's again until the next upload
  dropFresh(): void {
    this.freshValid = false;
    this.sliceGeneration.fill(0);
  }

  // the frame's jitter, taken before its builds
  begin() {
    this.jitter = FogAccum.jitter(this.frames);
    this.frames++;
  }

  private bindSums(a: WebGLTexture, b: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    gl.bindTexture(gl.TEXTURE_2D, a);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSumMirror);
    gl.bindTexture(gl.TEXTURE_2D, b);
  }

  // the four programs drawn once over one pixel (the driver finishes a program at its first draw: a stall of 100 to 250 ms in the first frame that accumulates, which follows the first exact build): every
  // draw goes to the chain's or the blended picture, never to the held volume (the store writes the chain's first picture, not a layer), so the volume is as it was
  warm(light: Volumes) {
    const gl = this.gl;
    this.make(light);
    const ra = this.reducedAcross, rd = this.reducedDown;
    const sx = this.across / ra, sy = this.down / rd;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    gl.viewport(0, 0, ra, rd);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.chainFramebuffers[0]!);
    const s = this.seed.use();
    gl.uniform1i(s.uSlice, 0);
    gl.uniform4f(s.uMap, sx, sy, 0, 0);
    gl.uniform3f(s.uVolume, this.across, this.down, light.layers);
    this.draw("seed");
    this.bindSums(this.chain[0]![0]!, this.chain[0]![1]!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.chainFramebuffers[1]!);
    const u = this.volume.use();
    gl.uniform1i(u.uSlice, 1);
    gl.uniform1f(u.uCull, 0);
    gl.uniform1f(u.uTail, 0);
    gl.uniform1f(u.uFar, 0);
    gl.uniform1f(u.uTailFlat, 0);
    gl.uniform4f(u.uAccum, sx - 1, sy - 1, 0, 0);
    gl.uniform1f(u.uAccumZ, 0.5);
    this.effect.testValues(this.volume);
    this.draw("volume");
    gl.viewport(0, 0, this.across, this.down);
    this.bindSums(this.chain[1]![0]!, this.chain[1]![1]!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blendFramebuffer);
    const b = this.blend.use();
    gl.uniform1i(b.uSlice, 1);
    gl.uniform1f(b.uAlpha, 1);
    gl.uniform4f(b.uMap, 1 / sx, 1 / sy, 0, 0);
    gl.uniform4f(b.uSize, ra, rd, ra, rd);
    this.draw("blend");
    this.bindSums(this.blended[0]!, this.blended[1]!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.chainFramebuffers[0]!);
    this.store.use();
    this.draw("store");
    // (the job's blend: over a one-pixel array of two layers, into the blended picture)
    const array = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, array);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA16F, 1, 1, 2);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blendFramebuffer);
    gl.viewport(0, 0, this.across, this.down);
    const a = this.blendArray.use();
    gl.uniform1i(a.uSlice, 1);
    gl.uniform1i(a.uLayer, 0);
    gl.uniform1f(a.uAlpha, 1);
    gl.uniform4f(a.uMap, 1 / sx, 1 / sy, 0, 0);
    gl.uniform4f(a.uSize, 1, 1, 1, 1);
    this.draw("blendArray");
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    gl.deleteTexture(array);
    // (the job's array at its real size, drawn once and given one upload, when the front worker is on: its first use is then not the first accumulating frame after a view change)
    const fx = this.effect as unknown as { frontWorker?: boolean; frontFactorNow?: () => number; columns: number[] };
    if (fx.frontWorker && typeof fx.frontFactorNow === "function") {
      const ra2 = FogAccum.reduced(fx.columns[0]!, fx.frontFactorNow()), rd2 = FogAccum.reduced(fx.columns[1]!, fx.frontFactorNow());
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
      this.ensureArray(ra2, rd2);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, ra2, rd2, 2, gl.RGBA, gl.HALF_FLOAT, new Uint16Array(ra2 * rd2 * 8));
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blendFramebuffer);
      gl.viewport(0, 0, this.across, this.down);
      const w = this.blendArray.use();
      gl.uniform1i(w.uSlice, 1);
      gl.uniform1i(w.uLayer, 0);
      gl.uniform1f(w.uAlpha, 1);
      gl.uniform4f(w.uMap, 1 / sx, 1 / sy, 0, 0);
      gl.uniform4f(w.uSize, ra2, rd2, ra2, rd2);
      this.draw("blendArray");
    }
    gl.disable(gl.SCISSOR_TEST);
    this.bindSums(light.sums[0]!, light.sums[1]!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // slices from..to blended (the first frame's blend of the run: the sums before `from` seeded from the held volume), as the guard's pass "fog volume"; held: per slice 1 where some column may hold
  // its direct slice, drops: the octaves dropped per slice (or null)
  build(light: Volumes, from: number, to: number, held: Uint8Array | null, drops: Uint8Array | null, n: number, fresh = false) {
    const gl = this.gl;
    this.make(light);
    if (fresh && this.freshValid && this.array !== null) {
      this.buildFromJob(light, from, to, n);
      return;
    }
    const guard = this.effect.guard;
    const each = guard.size("fog volume", "slice");
    const ra = this.reducedAcross, rd = this.reducedDown;
    const sx = this.across / ra, sy = this.down / rd;
    const jx = this.jitter[0]! - 0.5, jy = this.jitter[1]! - 0.5;
    const lod = this.effect.lod ? 1 : 0;
    // (the tests' split timing: the draws of every `split`-th slice timed one by one, named by kind and slice, and no pass of the whole build)
    const split = M.TEST ? this.effect.timeSplit : 0;
    const time = (kind: string, k: number): boolean => {
      if (split > 0 && k % split === 0) {
        guard.begin("fog accum " + kind + " " + k, "slice");
        return true;
      }
      return false;
    };
    if (split === 0) {
      guard.begin("fog volume", "slice");
    }
    let prev = 0;
    gl.viewport(0, 0, ra, rd);
    if (from > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.chainFramebuffers[prev]!);
      const u = this.seed.use();
      gl.uniform1i(u.uSlice, from - 1);
      gl.uniform4f(u.uMap, sx, sy, jx, jy);
      gl.uniform3f(u.uVolume, this.across, this.down, light.layers);
      this.draw("seed");
    }
    for (let k = from; k < to; k++) {
      // the fresh slice at the reduced columns, from the chain's picture of the slice before
      gl.viewport(0, 0, ra, rd);
      this.bindSums(this.chain[prev]![0]!, this.chain[prev]![1]!);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.chainFramebuffers[1 - prev]!);
      const timedFresh = time("fresh", k);
      const u = this.volume.use();
      this.freshDraws++;
      gl.uniform1i(u.uSlice, k);
      gl.uniform1f(u.uCull, held !== null && held[k] === 1 ? 1 : 0);
      gl.uniform1f(u.uTail, lod);
      gl.uniform1f(u.uFar, lod);
      gl.uniform1f(u.uTailFlat, this.effect.frontFlatNow());
      if (drops !== null) {
        gl.uniform1f(u.uDrop, drops[k]!);
      }
      gl.uniform4f(u.uAccum, sx - 1, sy - 1, jx, jy);
      gl.uniform1f(u.uAccumZ, this.jitter[2]!);
      this.effect.testValues(this.volume);
      this.draw("volume");
      if (timedFresh) {
        guard.end();
      }
      // the held slice moved towards it, into the blended picture
      gl.viewport(0, 0, this.across, this.down);
      this.bindSums(this.chain[1 - prev]![0]!, this.chain[1 - prev]![1]!);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blendFramebuffer);
      const timedBlend = time("blend", k);
      const b = this.blend.use();
      gl.uniform1i(b.uSlice, k);
      gl.uniform1f(b.uAlpha, FogAccum.alpha(this.counts[k]!, n));
      gl.uniform4f(b.uMap, 1 / sx, 1 / sy, jx, jy);
      gl.uniform4f(b.uSize, ra, rd, ra, rd);
      this.draw("blend");
      if (timedBlend) {
        guard.end();
      }
      this.counts[k] = Math.min(255, this.counts[k]! + 1);
      // and into the volume's layer
      this.bindSums(this.blended[0]!, this.blended[1]!);
      gl.bindFramebuffer(gl.FRAMEBUFFER, light.slices[k]!);
      const timedStore = time("store", k);
      this.store.use();
      this.draw("store");
      if (timedStore) {
        guard.end();
      }
      prev = 1 - prev;
      if ((k - from) % each === each - 1 || k === to - 1) {
        guard.piece();
      }
    }
    guard.end();
    this.bindSums(light.sums[0]!, light.sums[1]!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // slices from..to blended from the job's output: each slice not yet blended with this generation and covered by the job is blended by fogAccumBlendArray (the fresh picture read from the array at the place its samples were
  // taken) and stored; the others are skipped (no draw). No volume or seed draw: the reduced chain is not used.
  private buildFromJob(light: Volumes, from: number, to: number, n: number) {
    const gl = this.gl, guard = this.effect.guard, each = guard.size("fog volume", "slice");
    const ra = this.arrayAcross, rd = this.arrayDown, sx = this.across / ra, sy = this.down / rd;
    guard.begin("fog volume", "slice");
    gl.viewport(0, 0, this.across, this.down);
    let done = 0;
    for (let k = from; k < to; k++) {
      const generation = this.sliceGeneration[k]!;
      if (generation === 0 || this.blendedGeneration[k] === generation) {
        this.skipped++;
        continue;
      }
      const jx = this.sliceJitter[k]![0]! - 0.5, jy = this.sliceJitter[k]![1]! - 0.5;
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.array);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blendFramebuffer);
      const b = this.blendArray.use();
      gl.uniform1i(b.uSlice, k);
      gl.uniform1i(b.uLayer, 2 * k);
      gl.uniform1f(b.uAlpha, FogAccum.alpha(this.counts[k]!, n));
      gl.uniform4f(b.uMap, 1 / sx, 1 / sy, jx, jy);
      gl.uniform4f(b.uSize, ra, rd, ra, rd);
      this.draw("blendArray");
      this.counts[k] = Math.min(255, this.counts[k]! + 1);
      this.blendedGeneration[k] = generation;
      this.bindSums(this.blended[0]!, this.blended[1]!);
      gl.bindFramebuffer(gl.FRAMEBUFFER, light.slices[k]!);
      this.store.use();
      this.draw("store");
      this.blends++;
      if (++done % each === 0) {
        guard.piece();
      }
    }
    guard.end();
    this.bindSums(light.sums[0]!, light.sums[1]!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

M.FogAccumulation = FogAccumulation;
