// The namespace every module of the wallpaper puts its classes in (window.Matrix3D, which the
// tests read), and the pure helpers all of them share: the integer hash (the same in JavaScript,
// GLSL and WGSL, so the GPU and the script work out the same numbers), seeded random numbers,
// colours, the device's capabilities (looked up once). M.TEST (window.Matrix3DTest, set by the
// test pages before the wallpaper loads) compiles the shaders' test views and keeps the test
// logs; never set in the wallpaper itself. This module is the only one that reads
// window.Matrix3DTest (testOptions: the tests' options, when they give an object). The bundle
// registers itself whole by its name (Matrix3DFactory("bundle", body): webpack.config.ts), so a
// worker can be made from that body's text (platform/workers.ts).
import HASH_SOURCE from "../shaders/core/hash.glsl";
import HASH_WGSL from "../shaders/core/hash.wgsl";
import { MAX_GAP, STRIKES_MOST, UNITS } from "./constants";
import { BOLT } from "../materials/bolt";
import type { Matrix3DNamespace, Matrix3DTestOptions, Capabilities } from "./namespace";

export type { Matrix3DNamespace, Capabilities } from "./namespace";

// (filled by every module as it loads: the bundle loads them in their order, src/index.ts)
export const M: Matrix3DNamespace = (window.Matrix3D = window.Matrix3D || ({} as Matrix3DNamespace));

M.TEST = !!window.Matrix3DTest;

// the tests' options (window.Matrix3DTest as an object: { compileEach, sceneWorker, boltWorker,
// ... }), or none; only with M.TEST
export const testOptions = (): Matrix3DTestOptions => {
  const t = M.TEST ? window.Matrix3DTest : undefined;
  return typeof t === "object" && t ? t : {};
};

// a 32-bit integer hash (PCG)
M.hash = (v: number): number => {
  const s = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
};

M.HASH_GLSL = HASH_SOURCE;

M.HASH_WGSL = HASH_WGSL;

M.MAX_GAP = MAX_GAP;

M.STRIKES_MOST = STRIKES_MOST;

// a strike's light's color at the default Lightning flash hue (80; Lightning.colorOf)
M.BOLT = BOLT;

// an sRGB value (0 to 1) as linear light
M.linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// a Wallpaper Engine color ("r g b", 0 to 1, sRGB) as linear light [r, g, b] (a typed array:
// sent to uniforms as it is)
M.color = (value: string): Float32Array => Float32Array.from(value.split(" ").slice(0, 3), (c) => M.linear(parseFloat(c)));

// random numbers from a seed (mulberry32), so the tests can repeat them
M.seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// what the device can do, looked up once a context: float pictures to draw into (and so the
// waves, the fog's noise and the HDR picture), one blend equation per attachment, and the
// pictures one draw can write (8, or WebGL 2.0's least, 4)
M.capabilities = (gl: WebGL2RenderingContext): Capabilities => ({
  floats: !!gl.getExtension("EXT_color_buffer_float"),
  drawBuffersIndexed: gl.getExtension("OES_draw_buffers_indexed"),
  drawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS) >= 8 ? 8 : 4,
});

// the texture units (engine/constants.ts)
M.UNITS = UNITS;
