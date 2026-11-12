// The base class of every effect (effects/*.ts). src/index.ts drives them all the same way:
//   static programs(glsl, caps)  the effect's shaders ({ name: [vertex, fragment] }), compiled
//                                with every other effect's at once (glsl: the shared GLSL; caps:
//                                the device's capabilities, M.capabilities)
//   static properties()          the Wallpaper Engine settings it owns: { key: (effect, value) }
//   init(programs)               once its programs are ready: its samplers, its GPU work done once
//   resize(width, height)        the canvas's size changed (at the start of a frame)
//   reset()                      a clean start (no waves, splashes or strikes)
//   advance(time)                moves its simulation on to a time (seconds of simulation)
//   update(time)                 its values for this frame (uniform blocks, uploads), and any
//                                picture of its own made from them (the fog's volume), which may
//                                read only what the effects before it in the order have updated;
//                                it leaves no framebuffer bound (whatever draws next binds its
//                                own and sets its viewport)
//   destroy()                    deletes every GPU object it made, at once (MDN: delete objects
//                                eagerly, don't wait for the garbage collector)
//   quality()                    its quality for this frame (models/quality/types.ts): full quality
//                                until the quality pool gives it a result; it reads, never computes
//   setQuality(q)                the pool's hand-over of the frame's result (quality() returns it)
//   qualityJobs()                what the pool should process for it each frame: [] by default; an
//                                effect made of units overrides it, returning one QualityJob
//                                ({ effect: its index in the effects' order, units, minChunk })
//   qualityKind()                the pool's job kind its units run as (models/quality/jobs.ts: "rain", "units", ...); "" when it has no job
//   qualityStatics()             the job's static arrays (what the workers keep between frames), only when they changed since the last
//                                call, else null
//   qualityParams(shared)        the job's parameters for this frame (an object the effect keeps and fills in place), from the frame's
//                                shared view (QualityShared); the effect's index in the order is qualityIndex
//   static QUALITY_UNIT          the noun for its units in the Performance readout ("units" by default;
//                                an effect with its own noun sets it: rain "drops")
// An effect makes its GPU objects through the base class (createBuffer, createTexture,
// createFramebuffer, vertexArray, target, multisampleTarget, block), which keeps them for
// destroy(); its programs are kept by own() in init.
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/engine/ (was engine/effect.js).
// 2026-11-06: quality(), setQuality(), qualityJobs() and QUALITY_UNIT (the quality contract, default full quality).
// 2026-11-11: destroy() runs every remover and rethrows the first error after; apply() looks the setting up by own property only.
import { M } from "./core";
import type { RenderTarget, MultisampleTarget, UniformBlock, Quad, ProgramSources, Programs, InstanceAttribute, TargetOptions, MultisampleOptions, BlockName } from "./gl";
import type { Camera } from "./camera";
import type { GlyphAtlas } from "./glyphs";
import type { GpuGuard } from "./guard";
import type { StepClock } from "./clock";
import type { Capabilities } from "./namespace";
import type { EffectQuality, QualityJob, QualityShared } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";

// what src/index.ts gives every effect (makeEffects): the context, the quad every draw is made
// of, the camera, the characters' atlas, the GPU guard, the device's capabilities, the rain's
// seed and the rain's step clock
export interface EffectContext {
  gl: WebGL2RenderingContext;
  quad: Quad;
  camera: Camera;
  atlas: GlyphAtlas;
  guard: GpuGuard;
  caps: Capabilities;
  seed: number;
  clock: StepClock;
}

// the GLSL the effects share (src/index.ts makeEffects), given to every static programs()
export interface SharedGlsl {
  fog: string;
  medium: string;
  test: string;
  shade: string;
  lightning: string;
  emitter: string;
  scatter: string;
  march: string;
  waves: string;
  bloom: string;
}

// a Wallpaper Engine setting's value as an effect is given it (by its kind in project.json)
export type PropertyValue = number | boolean | string;

// (a method's signature: its parameters checked both ways, so each effect's setter takes its
// own class and its own setting's kind of value)
interface PropertySetterMethod {
  set(effect: Effect, value: PropertyValue): void;
}

// a setting's setter: (effect, value)
export type PropertySetter = PropertySetterMethod["set"];

// an effect's settings: { key: (effect, value) } (static properties())
export type PropertyTable = Record<string, PropertySetter>;

// the quality of an effect the pool has given no result: seen, full level, no units (nothing is
// culled or lowered). Shared by every effect, so it is frozen
const FULL_QUALITY: EffectQuality = Object.freeze({ visible: true, level: 40, units: 0, drawn: 0, meanLevel: 40, hidden: null, levels: null });

// each effect class's settings table (its static properties()), made once
const TABLES = new Map<typeof Effect, PropertyTable>();

export class Effect {
  // the noun for an effect's units in the Performance readout
  static QUALITY_UNIT = "units";
  // whether the class takes part in the quality pool (its job, its line of the readout): false for the picture's post-processing (bloom,
  // exposure) and the UI (the text)
  static IN_QUALITY = true;
  owned: (() => void)[];
  caps: Capabilities;
  guard: GpuGuard;
  camera: Camera;
  quad: Quad;
  gl: WebGL2RenderingContext;
  // (no initializer: the field is not written until the pool gives a result)
  qualityResult: EffectQuality | undefined;
  // the effect's per-frame job asked of its worker with the frame's exact inputs (after the frame's advance, before its draw), a promise of its answer being taken in (null: none; the
  // effect then does the work inline in update, as it always did). Called by the wallpaper's fork() in the quality mode workers only.
  fork(_time: number): Promise<void> | null {
    return null;
  }
  // its place in the effects' order (set by makeEffects: -1 until then), the index of its job in the pool
  qualityIndex: number;
  // whether the levels lower the effect's detail (level of detail below what the camera can see); false: every unit not hidden is drawn at full
  // detail, as with level 40 (the tests switch it to compare a frame with and without: Wallpaper.setLod); culling does not depend on it
  lod: boolean;
  // context: what the effects share (gl, quad, camera, atlas, guard, caps, seed)
  constructor(context: EffectContext) {
    this.gl = context.gl;
    this.quad = context.quad;
    this.camera = context.camera;
    this.guard = context.guard;
    this.caps = context.caps;
    this.owned = [];
    this.qualityIndex = -1;
    this.lod = true;
  }

  static programs(glsl: SharedGlsl, caps: Capabilities): ProgramSources {
    return {};
  }

  static properties(): PropertyTable {
    return {};
  }

  init(programs: Programs) {}

  resize(width: number, height: number) {}

  reset() {}

  advance(time: number) {}

  update(time: number) {}

  // the quality of this frame: the pool's last result, else full quality
  quality(): EffectQuality {
    return this.qualityResult || FULL_QUALITY;
  }

  // the pool's result for the frame
  setQuality(q: EffectQuality) {
    this.qualityResult = q;
  }

  // what the pool processes for this effect each frame (none: it has no units)
  qualityJobs(): QualityJob[] {
    return [];
  }

  // the pool's job kind its units run as; "" when it has none
  qualityKind(): string {
    return "";
  }

  // the job's static arrays when they changed since the last call (the workers keep them), else null
  qualityStatics(): QualityStatics | null {
    return null;
  }

  // the job's parameters for this frame, filled in place into an object the effect keeps
  qualityParams(shared: QualityShared): QualityParams {
    return {};
  }

  // applies a setting if it owns it
  apply(key: string, value: PropertyValue) {
    let table = TABLES.get(this.constructor as typeof Effect);
    if (!table) {
      table = (this.constructor as typeof Effect).properties();
      TABLES.set(this.constructor as typeof Effect, table);
    }
    const set = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
    if (set) {
      set(this, value);
    }
  }

  // keeps something to delete (with its deleting function), and gives it back
  own<T>(object: T, remove: (object: T) => void): T {
    if (object) {
      this.owned.push(() => remove(object));
    }
    return object;
  }

  // keeps its programs (from compilePrograms) to delete
  ownPrograms(programs: Programs, names: string[]) {
    return names.map((name: string) => this.own(programs[name], (p) => p.destroy()));
  }

  createBuffer(): WebGLBuffer {
    return this.own(this.gl.createBuffer(), (b) => this.gl.deleteBuffer(b));
  }

  createTexture(): WebGLTexture {
    return this.own(this.gl.createTexture(), (t) => this.gl.deleteTexture(t));
  }

  createFramebuffer(): WebGLFramebuffer {
    return this.own(this.gl.createFramebuffer(), (f) => this.gl.deleteFramebuffer(f));
  }

  vertexArray(instances: readonly InstanceAttribute[]): WebGLVertexArrayObject {
    return this.own(this.quad.vertexArray(instances), (v) => this.gl.deleteVertexArray(v));
  }

  target(options: TargetOptions): RenderTarget {
    return this.own(new M.RenderTarget(this.gl, options), (t) => t.destroy());
  }

  multisampleTarget(options: MultisampleOptions): MultisampleTarget {
    return this.own(new M.MultisampleTarget(this.gl, options), (t) => t.destroy());
  }

  block(name: BlockName, floats: number): UniformBlock {
    return this.own(new M.UniformBlock(this.gl, name, floats), (b) => b.destroy());
  }

  destroy() {
    let first: unknown;
    let failed = false;
    for (const remove of this.owned.splice(0)) {
      try {
        remove();
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    if (failed) {
      throw first;
    }
  }
}

M.Effect = Effect;
