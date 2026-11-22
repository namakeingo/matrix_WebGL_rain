// The world-fixed fog volume's builder (engine/fogworldbuild.ts; Feature U1, story U8: a prototype behind the test option fogWorld, M.TEST only; models/fogworld.ts is its pure model, shaders/fog/world.glsl its read and
// shaders/fog/world_fragment.glsl its build). The fog's density and light gathered into two 3D textures fixed in the WORLD (the shadow grid's mapping: ACROSS x UP x DEEP cells of RGBA16F, A and B,
// BYTES each), built once for the still scene and refreshed by parts for the drift (WORLD_RATE layers a second, the layers in order), read by a march per pixel (fogAtWorld: STEPS steps of the
// volume's slice law, a trilinear read of both textures at each) instead of the camera-fixed volumes. A move of the view needs no regather: the camera-fixed volumes' build (Froxels.build) is not
// made, the textures hold the world; only the cells the view had never read are built (their shadow baked since) in a boosted sweep.
// - The option: the text is compiled in only with `Matrix3DTest.fogWorld` (the tests' `?fogWorld=1`); then `fog.world` (a run-time switch, false at the start) chooses: on, the uniform block's
//   fParams.z is 100 + STEPS (the reading text's branch) and the strikes' light is off (its gather reads the volume), the world textures are bound on the volumes' units (M.UNITS.fogDirect: A,
//   fogMirror: B), so every program that reads the fog reads the world grid with no change of its own. Without the option the text, the programs and the textures do not exist and `world` stays false.
// - The strikes' light and its volume are not part of the prototype (the plan's U8: the strikes' light stays as it is).
//
// Changelog:
// 2026-11-21: new (Feature U1, story U8).

import type { Fog } from "../effects/fog";
import type { Uniforms } from "./gl";
import { M, testOptions } from "./core";
import { fill } from "./glsl";
import { phaseGlsl, PHASE_FORWARD_W, PHASE_FORWARD_G, PHASE_BACKWARD_G } from "../materials/fog";
import { FogWorld } from "../models/fogworld";
import WORLD_SOURCE from "../shaders/fog/world.glsl";
import WORLD_FRAGMENT_SOURCE from "../shaders/fog/world_fragment.glsl";
import WORLD_BRANCH_SOURCE from "../shaders/fog/world_branch.glsl";

// where the world's reading text and its branch go in Fog.GLSL (shaders/fog/fog.glsl, whose text is not changed: the option inserts them): before fogAt's comment, and after its Distance-fog-off return
const TEXT_BEFORE = "// what the medium gives along the ray through a place of the screen, from the eye to the";
// (a fragment of the reading text, in shaders/fog/world_branch.glsl: the world branch, the first lines after the Distance-fog-off return, found by the condition it ends with)
const BRANCH_AFTER = "fParams.z < -0.5";
// layers refreshed a second at steady state (a sweep of DEEP layers in DEEP / WORLD_RATE seconds: the clouds drift 0.1 m/s) and a frame's layers while the cells a move of the view brought in are built
const WORLD_RATE = 24;
const BOOST = 16;
// fParams.z of the uniform block in world mode: WORLD_BASE + the march's steps
const WORLD_BASE = 100;

const enabled = (): boolean => M.TEST && testOptions().fogWorld === true;
// the march's steps: the model's, or the test option's (1 to 96)
const steps = (): number => Math.min(Math.max(Math.floor(testOptions().fogWorldSteps ?? FogWorld.STEPS), 1), 96);

// the world grid's reading text, with the phase function's own copy (the names world...: the medium's phaseHG is not in every program that reads the fog)
function worldText(): string {
  const phase = phaseGlsl(PHASE_FORWARD_W, PHASE_FORWARD_G, PHASE_BACKWARD_G).replace(/phaseLobe/g, "worldPhaseLobe").replace(/phaseHG/g, "worldPhaseHG");
  return fill(WORLD_SOURCE, {
    WORLD_CELLS: `${FogWorld.ACROSS}.0, ${FogWorld.UP}.0, ${FogWorld.DEEP}.0`,
    WORLD_TOP: FogWorld.TOP.toFixed(1),
    WORLD_NEAR: FogWorld.NEAR.toFixed(2),
    WORLD_LOG: Math.log(FogWorld.FAR / FogWorld.NEAR).toFixed(6),
    WORLD_SPAN: M.Camera.SPAN.toFixed(4),
    WORLD_PHASE: phase,
  });
}

// the build's state for one fog effect
interface Builder {
  on: boolean;
  textures: WebGLTexture[];
  framebuffers: WebGLFramebuffer[];
  program: { use(): Uniforms };
  // the next layer to build, the layers owed by the clock, the layers still to build in a boosted sweep, the time of the last frame
  next: number;
  credit: number;
  sweep: number;
  last: number;
  // all the layers owed in the next frame
  all: boolean;
  // layers built in the last frame (for the tests)
  built: number;
}
const builders = new WeakMap<Fog, Builder>();

function texture(effect: Fog): WebGLTexture {
  return Fog3D(effect.gl);
}
// an RGBA16F 3D texture of the grid's size, linear, clamped (as Fog.texture3D, which this file cannot import: effects/fog.ts imports this one)
function Fog3D(gl: WebGL2RenderingContext): WebGLTexture {
  gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA16F, FogWorld.ACROSS, FogWorld.UP, FogWorld.DEEP);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
    gl.texParameteri(gl.TEXTURE_3D, axis, gl.CLAMP_TO_EDGE);
  }
  gl.bindTexture(gl.TEXTURE_3D, null);
  return t;
}

// the textures on the volumes' units
function bind(effect: Fog, a: WebGLTexture, b: WebGLTexture) {
  const gl = effect.gl;
  gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogDirect);
  gl.bindTexture(gl.TEXTURE_3D, a);
  gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogMirror);
  gl.bindTexture(gl.TEXTURE_3D, b);
}

export const FogWorldBuild = {
  WORLD_BASE, WORLD_RATE, BOOST,
  enabled,

  // Fog.GLSL with the world's reading text and its branch inserted at their anchors (the text byte for byte as it was without the option)
  inject(text: string): string {
    if (!enabled()) {
      return text;
    }
    if (text.split(TEXT_BEFORE).length !== 2 || text.split(BRANCH_AFTER).length !== 2) {
      throw new Error("the fog's text has lost the anchors of the world grid's reading text");
    }
    // (the reading text before fogAt's comment, the branch after the end of the line of the Distance-fog-off return)
    const withText = text.replace(TEXT_BEFORE, () => worldText() + "\n" + TEXT_BEFORE);
    const cut = withText.indexOf("\n", withText.indexOf(BRANCH_AFTER)) + 1;
    return withText.slice(0, cut) + WORLD_BRANCH_SOURCE + withText.slice(cut);
  },

  // the programs to compile: the grid's build, only with the option
  programs(fog: { GLSL: string; MEDIUM_GLSL: string; SHADE_GLSL: string; TEST_GLSL: string }): Record<string, [string, string]> {
    if (!enabled()) {
      return {};
    }
    const fragment = fill(WORLD_FRAGMENT_SOURCE, { "TEST_VIEWS": M.TEST ? "#define TEST_VIEWS" : "", "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": fog.GLSL, "Fog.MEDIUM_GLSL": fog.MEDIUM_GLSL, "Fog.SHADE_GLSL": fog.SHADE_GLSL, "Fog.TEST_GLSL": fog.TEST_GLSL });
    return { fogWorld: [M.FULL_VERTEX, fragment] };
  },

  // the effect's switch `world` (a boolean property: false at the start, settable at run time with the option, inert without it), and with the option the textures, their layers' framebuffers and
  // the program made (once a context, after the noise's and the shadow grid's units are bound: Fog.init)
  init(effect: Fog, programs: Record<string, { use(): Uniforms; samplers(u: Record<string, number>): void; destroy(): void }>) {
    builders.delete(effect);
    const make = enabled() && effect.caps.floats;
    Object.defineProperty(effect, "world", {
      configurable: true,
      enumerable: true,
      get: () => !!builders.get(effect)?.on,
      set: (value: boolean) => {
        const b = builders.get(effect);
        if (!b || b.on === !!value) {
          return;
        }
        b.on = !!value;
        b.all = true;
        b.next = 0;
        b.credit = 0;
        b.sweep = 0;
        if (!b.on && effect.light && effect.light.volumes.length === 2) {
          // (the camera-fixed volumes back on their units, the whole of them made again)
          bind(effect, effect.light.volumes[0]!, effect.light.volumes[1]!);
        }
        effect.refreshAll();
      },
    });
    if (!make) {
      return;
    }
    const gl = effect.gl;
    const program = effect.ownPrograms(programs as never, ["fogWorld"])[0] as unknown as { use(): Uniforms; samplers(u: Record<string, number>): void };
    program.samplers({ uNoise: M.UNITS.noise, uShade: M.UNITS.shade });
    const textures = [0, 1].map(() => effect.own(texture(effect), (t: WebGLTexture) => gl.deleteTexture(t)));
    const both = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
    const framebuffers: WebGLFramebuffer[] = [];
    for (let k = 0; k < FogWorld.DEEP; k++) {
      const framebuffer = effect.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, textures[0]!, 0, k);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, textures[1]!, 0, k);
      gl.drawBuffers(both);
      framebuffers.push(framebuffer);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    builders.set(effect, { on: testOptions().fogWorldOn === true, textures, framebuffers, program, next: 0, credit: 0, sweep: 0, last: 0, all: true, built: 0 });
  },

  // whether the world grid is the fog now (the camera-fixed volumes are not built)
  active(effect: Fog): boolean {
    return !!builders.get(effect)?.on;
  },

  // the uniform block's values in world mode: the volume is there with STEPS steps of the march, the strikes' light is off (before the block is uploaded)
  patch(effect: Fog, data: Float32Array) {
    const b = builders.get(effect);
    if (b && b.on && data[2]! > 0.5) {
      data[2] = WORLD_BASE + steps();
      data[3] = 0;
    }
  },

  // the frame's refresh (after the shadow grid's: the light read from it): the textures on the units, the layers the clock owes built (all at a setting's change, a gap in time or a switch), a
  // boosted sweep from the first layer when the view moved (the cells it brought in), in order from where the last stopped
  frame(effect: Fog, time: number, moved: boolean, settings: boolean, jump: boolean) {
    const b = builders.get(effect);
    if (!b || !b.on) {
      return;
    }
    const gl = effect.gl;
    bind(effect, b.textures[0]!, b.textures[1]!);
    const dt = Math.max(time - b.last, 0);
    b.last = time;
    if (settings || jump) {
      b.all = true;
    }
    if (moved && !b.all) {
      b.sweep = FogWorld.DEEP;
      b.next = 0;
    }
    let due: number;
    if (b.all) {
      due = FogWorld.DEEP;
      b.next = 0;
      b.all = false;
      b.sweep = 0;
      b.credit = 0;
    } else {
      b.credit += dt * WORLD_RATE;
      due = Math.min(Math.floor(b.credit), FogWorld.DEEP);
      b.credit -= due;
      if (b.sweep > 0) {
        const more = Math.min(BOOST, b.sweep);
        b.sweep -= more;
        due = Math.max(due, more);
      }
    }
    b.built = due;
    if (due <= 0) {
      return;
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, FogWorld.ACROSS, FogWorld.UP);
    effect.testValues(b.program as never);
    const u = b.program.use();
    for (let i = 0; i < due; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffers[b.next]!);
      gl.uniform1i(u.uLayer, b.next);
      effect.quad.drawFull();
      b.next = (b.next + 1) % FogWorld.DEEP;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  },

  // the layers built in the last frame (the tests)
  built(effect: Fog): number {
    return builders.get(effect)?.built ?? 0;
  },
};
