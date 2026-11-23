// The front shade grid's temporal accumulation on the GPU (Feature U2, story V2; Fog.shadeAccum, default off): the GL half of the pure model M.ShadeAccumGpu (models/shadeaccumgpu.ts). It replaces the refresh by parts of the
// front grid (layers 0..95 of the shade texture) in the frames that are not an exact bake:
// - fresh: the reduced grid (RG16F 64 x 32 x 48, an eighth of the cells) baked as the exact bake bakes a cell, each node at the place the frame's jitter moves it to (shadeaccum_fresh.glsl),
// - blend: the held layer moved towards the fresh grid by alpha, the fresh grid read trilinearly at the cell's reduced coordinate (shadeaccum_blend.glsl), into a scratch grid (RG16F 128 x 64 x 96: a layer is never read
//   while it is written),
// - store: the scratch layers copied into the held grid's front layers (shadeaccum_store.glsl; the framebuffers of layers 0..95: the base layers 96..191 are never an attachment of any draw of this file).
// The exact bake is the effect's own (program fogShade over every draw: Fog.update). Texture units: all 32 are taken, so the pass borrows two: the fresh grid is bound on M.UNITS.work (its 3D target; the emitter's is the 2D
// one) and the scratch grid on M.UNITS.bloomFrom (its 3D target, the strikes' shadow grid's) for the pass, and bindStrikeInputs() puts the strikes' inputs back after it (both units are bound by their users before they
// read them); the held grid stays on M.UNITS.shade (bound again here: the blend reads it).
//
// Changelog:
// 2026-11-22: new (Feature U2, story V2).
import { M } from "./core";
import { fill } from "./glsl";
import type { ProgramSources, ShaderProgram, Uniforms } from "./gl";
import { ShadeAccumGpu } from "../models/shadeaccumgpu";
import type { Fog } from "../effects/fog";
import FRESH_SOURCE from "../shaders/fog/shadeaccum_fresh.glsl";
import BLEND_SOURCE from "../shaders/fog/shadeaccum_blend.glsl";
import STORE_SOURCE from "../shaders/fog/shadeaccum_store.glsl";
import STORE_LAYER_SOURCE from "../shaders/fog/shadeaccum_store_layer.glsl";
import LAYER_OUTPUT_SOURCE from "../shaders/fog/layer_output.glsl";
import LAYER_WRITE_SOURCE from "../shaders/fog/layer_write.glsl";

const NAMES = ["shadeAccumFresh", "shadeAccumBlend", "shadeAccumStore"];
const FULL = [128, 64, 96];

// the programs (the fog's own, with them); n: the layers of a draw (the draw buffers)
export function shadeAccumPrograms(n: number): ProgramSources {
  const [fx, fy, fz] = ShadeAccumGpu.FRESH as [number, number, number];
  const count = Array.from({ length: n }, (v, i) => i);
  const outputs = count.map((i) => fill(LAYER_OUTPUT_SOURCE, { "i": i })).join("\n");
  const writes = count.map((i) => fill(LAYER_WRITE_SOURCE, { "i": i })).join("\n");
  const sizes = { "FRESH_X": fx.toFixed(1), "FRESH_Y": fy.toFixed(1), "FRESH_Z": fz.toFixed(1), "n": n, "layerOutputs": outputs, "layerWrites": writes };
  const fresh = fill(FRESH_SOURCE, { ...sizes, "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": M.Fog.GLSL, "Fog.MEDIUM_GLSL": M.Fog.MEDIUM_GLSL });
  const blend = fill(BLEND_SOURCE, { ...sizes, "FULL_X": FULL[0]!.toFixed(1), "FULL_Y": FULL[1]!.toFixed(1), "FULL_Z": FULL[2]!.toFixed(1) });
  const stores = count.map((i) => fill(STORE_LAYER_SOURCE, { "i": i })).join("\n");
  const store = fill(STORE_SOURCE, { "layerOutputs": outputs, "stores": stores });
  return { shadeAccumFresh: [M.FULL_VERTEX, fresh], shadeAccumBlend: [M.FULL_VERTEX, blend], shadeAccumStore: [M.FULL_VERTEX, store] };
}

export class ShadeAccumulation {
  effect: Fog;
  gl: WebGL2RenderingContext;
  // the layers of a draw
  layers: number;
  fresh: ShaderProgram;
  blend: ShaderProgram;
  store: ShaderProgram;
  // the reduced grid's texture and the scratch grid, and their framebuffers (`layers` layers each)
  freshTexture: WebGLTexture;
  scratchTexture: WebGLTexture;
  freshDraws: WebGLFramebuffer[];
  scratchDraws: WebGLFramebuffer[];

  constructor(effect: Fog, programs: Record<string, ShaderProgram>, layers: number) {
    this.effect = effect;
    this.gl = effect.gl;
    this.layers = layers;
    const [fresh, blend, store] = effect.ownPrograms(programs, NAMES);
    this.fresh = fresh!;
    this.blend = blend!;
    this.store = store!;
    fresh!.samplers({ uNoise: M.UNITS.noise });
    blend!.samplers({ uHeld: M.UNITS.shade, uFresh: M.UNITS.work });
    store!.samplers({ uBlended: M.UNITS.bloomFrom });
    const [fx, fy, fz] = ShadeAccumGpu.FRESH as [number, number, number];
    this.freshTexture = this.make(fx, fy, fz);
    this.scratchTexture = this.make(FULL[0]!, FULL[1]!, FULL[2]!);
    this.freshDraws = this.framebuffers(this.freshTexture, fz);
    this.scratchDraws = this.framebuffers(this.scratchTexture, FULL[2]!);
  }

  // an RG16F grid, linearly filtered (the fresh grid is read between its nodes), clamped at its edges
  private make(width: number, height: number, depth: number): WebGLTexture {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    const texture = this.effect.own(gl.createTexture()!, (t: WebGLTexture) => gl.deleteTexture(t));
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RG16F, width, height, depth);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, axis, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_3D, null);
    return texture;
  }

  // the framebuffers of a grid's `depth` layers, `layers` a framebuffer
  private framebuffers(texture: WebGLTexture, depth: number): WebGLFramebuffer[] {
    const gl = this.gl;
    const outputs: GLenum[] = [];
    for (let i = 0; i < this.layers; i++) {
      outputs.push(gl.COLOR_ATTACHMENT0 + i);
    }
    const out: WebGLFramebuffer[] = [];
    for (let k = 0; k < depth; k += this.layers) {
      const framebuffer = this.effect.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      for (let i = 0; i < this.layers; i++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, outputs[i]!, texture, 0, Math.min(depth - 1, k + i));
      }
      gl.drawBuffers(outputs);
      out.push(framebuffer);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  // the pass's inputs bound: the fresh grid on the work unit, the scratch grid on the bloomFrom unit, the held grid on the shade unit
  private bind() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_3D, this.freshTexture);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_3D, this.scratchTexture);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.shade);
    gl.bindTexture(gl.TEXTURE_3D, this.effect.shade);
  }

  // what the units held before the pass put back: the work unit's 3D target empty, the strikes' inputs (the emitter, the strikes' shadow grid) bound again
  private restore() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_3D, null);
    this.effect.bindStrikeInputs();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // the programs drawn once over one pixel (the driver finishes a program at its first draw): the fresh and the blend into their own grids, the store into the fresh grid's first layers (never the held grid), so the held grid is as it was
  warm() {
    const gl = this.gl;
    this.bind();
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    const [fx, fy] = ShadeAccumGpu.FRESH as [number, number, number];
    gl.viewport(0, 0, fx, fy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.freshDraws[0]!);
    const f = this.fresh.use();
    gl.uniform1i(f.uLayers, 1);
    gl.uniform1i(f.uLayer, 0);
    gl.uniform3f(f.uJit, 0.5, 0.5, 0.5);
    if (M.TEST) {
      gl.uniform1i(f.uMoonKernel, this.effect.moonKernel);
    }
    this.effect.quad.drawFull();
    gl.viewport(0, 0, FULL[0]!, FULL[1]!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scratchDraws[0]!);
    const b = this.blend.use();
    gl.uniform1i(b.uLayers, 1);
    gl.uniform1i(b.uLayer, 0);
    gl.uniform1f(b.uAlpha, 0);
    gl.uniform3f(b.uJit, 0.5, 0.5, 0.5);
    this.effect.quad.drawFull();
    gl.viewport(0, 0, fx, fy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.freshDraws[0]!);
    const s = this.store.use();
    gl.uniform1i(s.uLayer, 0);
    this.effect.quad.drawFull();
    gl.disable(gl.SCISSOR_TEST);
    this.restore();
  }

  // one accumulating frame: the reduced bake at the jitter (M.FogAccum.jitter's sample), blended into the held front layers at alpha; each heavy draw in the guard's pieces
  accumulate(jitter: number[], alpha: number, fresh?: Uint16Array) {
    const gl = this.gl;
    const guard = this.effect.guard;
    const layers = this.layers;
    const [fx, fy] = ShadeAccumGpu.FRESH as [number, number, number];
    this.bind();
    gl.disable(gl.SCISSOR_TEST);
    let u: Uniforms;
    if (fresh) {
      // the reduced grid the quality workers baked (workers/shadeaccumworker.ts), uploaded as it is (the half pairs of the fresh texture's layout)
      const [, , fz] = ShadeAccumGpu.FRESH as [number, number, number];
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, fx, fy, fz, gl.RG, gl.HALF_FLOAT, fresh);
    } else {
      // the reduced grid
      gl.viewport(0, 0, fx, fy);
      u = this.fresh.use();
      gl.uniform1i(u.uLayers, layers);
      gl.uniform3f(u.uJit, jitter[0]!, jitter[1]!, jitter[2]!);
      if (M.TEST) {
        gl.uniform1i(u.uMoonKernel, this.effect.moonKernel);
      }
      this.pass("shade fresh", this.freshDraws, u);
    }
    // the held layers moved towards it, into the scratch grid
    gl.viewport(0, 0, FULL[0]!, FULL[1]!);
    u = this.blend.use();
    gl.uniform1i(u.uLayers, layers);
    gl.uniform1f(u.uAlpha, alpha);
    gl.uniform3f(u.uJit, jitter[0]!, jitter[1]!, jitter[2]!);
    this.pass("shade blend", this.scratchDraws, u);
    // and into the held grid's front layers
    u = this.store.use();
    const plan = ShadeAccumGpu.storePlan(layers);
    const each = Math.max(1, Math.floor(guard.size("shade store", "slice") / layers));
    guard.begin("shade store", "slice");
    plan.forEach((draw, k) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.effect.shadeDraws[draw.from / layers]!);
      gl.uniform1i(u.uLayer, draw.from);
      this.effect.quad.drawFull();
      if (k % each === each - 1 || k === plan.length - 1) {
        guard.piece();
      }
    });
    guard.end();
    this.restore();
  }

  // the draws of a grid's framebuffers (the program in use, its viewport set), as the guard's pass `name`
  private pass(name: string, draws: WebGLFramebuffer[], u: Uniforms) {
    const gl = this.gl;
    const guard = this.effect.guard;
    const each = Math.max(1, Math.floor(guard.size(name, "slice") / this.layers));
    guard.begin(name, "slice");
    draws.forEach((framebuffer, k) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.uniform1i(u.uLayer, k * this.layers);
      this.effect.quad.drawFull();
      if (k % each === each - 1 || k === draws.length - 1) {
        guard.piece();
      }
    });
    guard.end();
  }
}
