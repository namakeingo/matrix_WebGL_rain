// The fog volume's temporal accumulation (Feature U1, story U6): a prototype behind the test option fogAccum (M.TEST only: Fog.accum, the frames N of the average; 0 off, as shipped). The GL half of
// the pure model M.FogAccum (models/fogaccum.ts); the slices the plan owes this frame are built here instead of by Froxels.build:
// - each slice is gathered into a reduced picture (the columns of the full volume divided by `factor` each way, M.FogAccum.reduced), its sample moved inside the column and along the slice by the frame's
//   jitter (M.FogAccum.jitter; shaders/fog/fogaccum_volume.glsl), its sums so far the reduced chain's (two pictures swapped from slice to slice; a run that starts past slice 0 seeds the chain from the
//   held volume's slice before it: fogaccum_seed.glsl),
// - blended into the held volume: held = mix(held, fresh bilinear at the place the samples were taken, alpha) (fogaccum_blend.glsl, into a full-size picture), then written into the volume's layer
//   (fogaccum_store.glsl; a layer is never read while it is written),
// - the strikes' stacks are not touched (M.FogAccum.accumulates('strike') is false), and a change of the view, a setting or a gap in time builds the whole volume exactly as before (Fog.update), which
//   resets the average: every slice's weight is then 1 / N from the exact volume on.
// The held volume stays on its units (M.UNITS.fogDirect, fogMirror); the units of the sums (fogSum, fogSumMirror) carry the pictures of this build during it and the volume's own sums after it.
//
// Changelog:
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
import STORE_SOURCE from "../shaders/fog/fogaccum_store.glsl";

// the columns of the volume that a column of the fresh picture covers, each way (the tests change it: FogAccumulation.factor)
const REDUCE = 2;
const NAMES = ["fogAccumVolume", "fogAccumSeed", "fogAccumBlend", "fogAccumStore"];

// the programs (M.TEST only; the shipped programs are the fog's own)
export function fogAccumPrograms(): ProgramSources {
  const volume = fill(VOLUME_SOURCE, {
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
  return { fogAccumVolume: [M.FULL_VERTEX, volume], fogAccumSeed: [M.FULL_VERTEX, SEED_SOURCE], fogAccumBlend: [M.FULL_VERTEX, BLEND_SOURCE], fogAccumStore: [M.FULL_VERTEX, STORE_SOURCE] };
}

// the volume's pair of pictures as Froxels keeps them (the stack of the fog's own light, one)
interface Volumes {
  across: number;
  down: number;
  volumes: WebGLTexture[];
  sums: WebGLTexture[];
  slices: WebGLFramebuffer[];
}

export class FogAccumulation {
  effect: Fog;
  gl: WebGL2RenderingContext;
  slices: number;
  volume: ShaderProgram;
  seed: ShaderProgram;
  blend: ShaderProgram;
  store: ShaderProgram;
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

  // slices from..to blended (the first frame's blend of the run: the sums before `from` seeded from the held volume), as the guard's pass "fog volume"; held: per slice 1 where some column may hold
  // its direct slice, drops: the octaves dropped per slice (or null)
  build(light: Volumes, from: number, to: number, held: Uint8Array | null, drops: Uint8Array | null, n: number) {
    const gl = this.gl;
    this.make(light);
    const guard = this.effect.guard;
    const each = guard.size("fog volume", "slice");
    const ra = this.reducedAcross, rd = this.reducedDown;
    const sx = this.across / ra, sy = this.down / rd;
    const jx = this.jitter[0]! - 0.5, jy = this.jitter[1]! - 0.5;
    const lod = this.effect.lod ? 1 : 0;
    guard.begin("fog volume", "slice");
    let prev = 0;
    gl.viewport(0, 0, ra, rd);
    if (from > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.chainFramebuffers[prev]!);
      const u = this.seed.use();
      gl.uniform1i(u.uSlice, from - 1);
      gl.uniform4f(u.uMap, sx, sy, jx, jy);
      gl.uniform3f(u.uVolume, this.across, this.down, this.slices);
      this.effect.quad.drawFull();
    }
    for (let k = from; k < to; k++) {
      // the fresh slice at the reduced columns, from the chain's picture of the slice before
      gl.viewport(0, 0, ra, rd);
      this.bindSums(this.chain[prev]![0]!, this.chain[prev]![1]!);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.chainFramebuffers[1 - prev]!);
      const u = this.volume.use();
      gl.uniform1i(u.uSlice, k);
      gl.uniform1f(u.uCull, held !== null && held[k] === 1 ? 1 : 0);
      gl.uniform1f(u.uTail, lod);
      gl.uniform1f(u.uFar, lod);
      if (drops !== null) {
        gl.uniform1f(u.uDrop, drops[k]!);
      }
      gl.uniform4f(u.uAccum, sx - 1, sy - 1, jx, jy);
      gl.uniform1f(u.uAccumZ, this.jitter[2]!);
      this.effect.testValues(this.volume);
      this.effect.quad.drawFull();
      // the held slice moved towards it, into the blended picture
      gl.viewport(0, 0, this.across, this.down);
      this.bindSums(this.chain[1 - prev]![0]!, this.chain[1 - prev]![1]!);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blendFramebuffer);
      const b = this.blend.use();
      gl.uniform1i(b.uSlice, k);
      gl.uniform1f(b.uAlpha, FogAccum.alpha(this.counts[k]!, n));
      gl.uniform4f(b.uMap, 1 / sx, 1 / sy, jx, jy);
      gl.uniform4f(b.uSize, ra, rd, ra, rd);
      this.effect.quad.drawFull();
      this.counts[k] = Math.min(255, this.counts[k]! + 1);
      // and into the volume's layer
      this.bindSums(this.blended[0]!, this.blended[1]!);
      gl.bindFramebuffer(gl.FRAMEBUFFER, light.slices[k]!);
      this.store.use();
      this.effect.quad.drawFull();
      prev = 1 - prev;
      if ((k - from) % each === each - 1 || k === to - 1) {
        guard.piece();
      }
    }
    guard.end();
    this.bindSums(light.sums[0]!, light.sums[1]!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
