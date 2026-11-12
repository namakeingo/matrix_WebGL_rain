// The fog: one medium of 3D clouds in the world, gathered into a volume fixed to the camera's view
// (froxels: a column per few pixels of the screen, SLICES slices along each column's ray), which
// every pixel, character and splash reads at its own distance.
// - The clouds: value noise of three sizes (24, 10 and 4 m), drifting and swirling, their
//   billows the noise between 0.4 and 0.6, with a haze of a fifth between them; as dense as Fog
//   intensity sets it; thinning out within about 4 m above the water. The air itself scatters and
//   takes away light too (AIR per metre: about 1 km of visibility).
// - Their light, single scattering: the night sky's (SKY, the same radiance the sky is seen with)
//   and diffuse moonlight from above (MOON, from MOON_DIR: materials/sky.ts), each through the
//   clouds between, scattered by the clouds' albedo (the two fog colors, linear, mixed by a noise
//   of its own: albedoAt); a little more for light scattered more than once (MULTIPLE). The
//   medium's own parameters (DENSITY_FULL, AIR, MULTIPLE, PHASE_G, the default colors) are in
//   materials/fog.ts. The strikes' light
//   is scattered by the same albedo (the air's share of it white).
// - The clouds' shadow of the sky and the moon, baked: what gets to each place from them (8 m
//   towards them through the clouds, 4 places) in a grid fixed in the world (SHADE_ACROSS across
//   the world's width by x / distance, SHADE_UP up to SHADE_TOP by the height's square root: thin
//   near the water, where the medium changes fastest; SHADE_DEEP deep by the distance's logarithm
//   from SHADE_NEAR to FOG_FAR), its nodes on the grid's edges (the water is a node), read
//   trilinearly by the fog's light and by the light the water reflects diffusely. Above the grid
//   the medium is too thin to shade. Baked SHADE_RATE draws of layers a second (as many layers a
//   draw as the device writes at once: 8, or 4), by the time passed; each draw only over the
//   cells the view can read (its columns and rows scissored: viewBox), all of it again when the
//   view changes.
// - Each strike's shadows through the clouds, baked when it starts (the clouds hardly move while
//   it plays): what gets to each place of the same grid from each region of its emitter (Lightning:
//   the main channel merged; towards the region's nearest point, 4 places), one RGBA stack of
//   layers per strike's slot; read only by the bakes (on M.UNITS.bloomFrom, bound before them);
//   only over the cells the view can read, again for the playing strikes when the view changes.
// - The volume: for each column (the ray through its middle; the columns reach MARGIN of the
//   screen past each side, for reflected rays leaving the screen) and slice (from t(k / SLICES) to
//   t((k + 1) / SLICES), t(u) = SLICE_NEAR (e^(u ln(1 + FOG_FAR / SLICE_NEAR)) - 1): thin near
//   the eye, about 6% of the distance far away), the light gathered from the eye to the slice's
//   far end and what the medium lets through to there; each slice's medium taken at its middle,
//   its light weighted by (1 - e^(-σ dt)) / σ. Two volumes: along the eye's rays, and along their
//   mirror images below the water from where each meets still water (the reflection's). Built
//   slice by slice, two draws a slice (Froxels): the first reads the columns' sums so far and
//   writes the slice of both volumes, the second copies the slice into the sums. Each slice has a
//   framebuffer of its own, made once (nothing attached in a frame). (One draw writing a 3D
//   texture's layer and 2D textures at once wrote nothing through ANGLE's Direct3D 11, with no
//   error; and a draw never reads the picture it writes.)
// - The strikes' light, per unit of their light: a volume of its own, a stack of slices per slot
//   (its light's color: the clouds' albedo and the air's white share of what they scatter),
//   gathered once a strike from what the fog's volume lets through and the baked shadows: in the
//   frame after the one it starts in (its shadows baked there), before its light shows; in the
//   frame it starts in when it gives light at once; again when the view changes. Its flicker and
//   fade applied when it is read (fogAt: the slots' light in the uniform block, from setStrikes).
// - Refreshed by the time passed: VOLUME_RATE of the volume's slices a second (the first of a
//   frame's reading the sums of the slice before, from an earlier frame) and SHADE_RATE draws of
//   the shadow grid's layers (the clouds drift a few millimetres a frame): at 24 frames a second
//   a quarter of the volume and one draw a frame. The volume all at once after a gap in time of
//   more than REFRESH_GAP (a reset, or the tests' jumps), a change of a fog setting, of the view
//   or of the screen's size; the shadow grid (fixed in the world, baked over the view) after a
//   gap, a setting's change or a change of the view; a strike's shadows after a setting's change
//   or a change of the view too.
// - Reading it (fogAt): trilinear, between the columns and between the slices' ends; before the
//   first slice's end, a share of it. It can also give the strikes' share of the light alone
//   (the emitters' light it scatters, which blooms: see Bloom), the sky's and the moon's left out.
// - The strikes' programs are drawn once at the start, over one pixel (the driver finishes a
//   program when it is first used: about 0.25 s, otherwise at the first strike).
// - The noise: a 3D texture of 128^3 random values, smoothed (a box of 5 along each axis, twice)
//   and spread to the whole range again, wrapping round; made on the GPU once, slice by slice.
//   Read at the mipmap level of the part of the world a sample stands for (textureLod: the
//   implicit level comes from derivatives, undefined in branches that differ between pixels): a
//   froxel's size, a grid cell's, or the spacing of a shadow ray's places.
// - Without float pictures to draw into: no clouds and no volume; the air alone, worked out.
// - The slices and layers a piece of the GPU guard's are the guard's to size, by each pass's time.
// With M.TEST, `marched` makes every baked shadow marched instead (the tests compare the two).
// Its GLSL: Fog.GLSL (the uniform block, the light around and the volumes' reading: for anything
// seen through it; BOLT, the strikes' color), Fog.MEDIUM_GLSL (the medium itself, the grid's
// places, the shadows marched), Fog.SHADE_GLSL (the baked shadows read, and the clouds' light),
// Fog.GATHER_GLSL (a stretch of a ray's light), Fog.TEST_GLSL (the tests' `marched`), and, for
// the tests' views only, Fog.MARCH_GLSL (a march along a pixel's own ray).
//
// - What nothing reads is not gathered (models/quality/fog.ts, the quality job "fog": the quality modes only): with the
//   water drawn, a pixel below the horizon stops at the still water, the water reading the eye's volume at its hit and the
//   characters, splashes and bolt before the plane CULL_BELOW under it; a column's direct slices that start past that
//   distance along the rays of the column and its neighbours are held (the program's `uCull`, set per slice from the
//   job's levels: under QUALITY_LEVELS where some column holds the slice), the sums carried on unchanged. The strikes'
//   stacks hold the same direct slices. The mirrored volume and every column of the sky are gathered as always.
//
// - Level of detail (the quality modes, Effect.lod; models/quality/fog.ts): a column also holds a direct slice where its own ray's
//   transmittance bound is under TAIL_T (the dense tail: the program's `uTail`, the same test as the water's cut, `uCull`); slices
//   far from the eye are refreshed every N-th sweep (N from the view: the clouds' drift between two refreshes under a quarter of
//   the froxel), whole after any change of the view, a setting or a gap in time; and the gather reads the noise's octaves whose
//   period is within the froxel's footprint as their mean (`uFar`); by the slice's level (the largest transmittance bound over the columns,
//   `QualityFog.Lod`) the refresh period grows to 32 sweeps and more octaves are read as their mean (`uDrop`). With lod off none applies.
//
// Changelog:
// 2026-11-12: planInput: no grid framebuffers (no float render targets) gives 0 draws instead of reading their length (the frame threw with the extensions missing).
// 2026-11-12: readMargin: the volume's margin as the mirrored picture's pixels read it (the picture larger than the view).
// 2026-11-10: the frame's plan (uniform block values, the view decisions, the shade draws owed, the slices' periods and runs of slices built) is models/fogplan.ts's pure function, run here or asked of its worker in Fog.fork.
// 2026-11-07: level of detail by the slice's physical level (QualityFog.Lod): the refresh period (to 32 sweeps) and the octaves read as their mean (uDrop) by level.
// 2026-11-12: the moon's disc: the shade bake's moon channel the mean over the penumbra kernel (medium.glsl: moonThrough; the tests' count: setMoonKernel), the sky box's
//   skyIrradiance and the glyphs' glyphSkyMoonLight in Fog.GLSL, the disc's constants.
// 2026-11-07: level of detail: the dense tail, the refresh by distance and the far octaves (Effect.lod).
// 2026-11-06: the quality job "fog" (the slices are its units): slices past the water along a column's rays are held, not
//   gathered; SLICES, SLICE_NEAR and FOG_FAR owned by models/quality/fog.ts.
// 2026-11-05: the sky's and the moon's light settable (Sky and moon brightness, Sky tone, Moon tone):
//   SKY and MOON are SKY_BASE and MOON_BASE times the block's gains (models/skylight.ts), a change
//   restarting the whole volume.
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/fog.js); the medium's and the
//   sky's physical parameters moved to materials/fog.ts and materials/sky.ts, values unchanged.
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import type { ShaderProgram, UniformBlock, Uniforms, Programs, ProgramSources } from "../engine/gl";
import type { EffectContext, SharedGlsl } from "../engine/effect";
import type { Capabilities } from "../engine/namespace";
import { DENSITY_FULL, MAIN_DEFAULT, SECONDARY_DEFAULT, AIR, MULTIPLE, PHASE_G } from "../materials/fog";
import { SKY, MOON, MOON_DIR, MoonDisc } from "../materials/sky";
import { QualityFog } from "../models/quality/fog";
import { QualityFogShade } from "../models/quality/fogshade";
import { QualityStrikeShade } from "../models/quality/strikeshade";
import type { QualityPool } from "../engine/qualitypool";
import { QUALITY_LEVELS } from "../models/quality/types";
import type { EffectQuality, QualityJob, QualityShared } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";
import type { FogQualityView } from "../models/quality/fog";
import type { ParallaxOffsets } from "../models/mouseparallax";
import { FogPlan } from "../models/fogplan";
import { ReflectionFrame } from "../models/reflectionframe";
import type { ReflectionFrameOf } from "../models/reflectionframe";
import type { FogPlanInput, FogPlanOutput } from "../models/fogplan";
import type { JobTask } from "../platform/jobtask";
import SEED_FRAGMENT_SOURCE from "../shaders/fog/seed_fragment.glsl";
import BLUR_FRAGMENT_SOURCE from "../shaders/fog/blur_fragment.glsl";
import FINISH_FRAGMENT_SOURCE from "../shaders/fog/finish_fragment.glsl";
import FOG_SOURCE from "../shaders/fog/fog.glsl";
import MEDIUM_SOURCE from "../shaders/fog/medium.glsl";
import SHADE_SOURCE from "../shaders/fog/shade.glsl";
import TEST_SOURCE from "../shaders/fog/test.glsl";
import GATHER_SOURCE from "../shaders/fog/gather.glsl";
import SLICE_SOURCE from "../shaders/fog/slice.glsl";
import GRID_FRAGMENT_SOURCE from "../shaders/fog/grid_fragment.glsl";
import LAYER_OUTPUT_SOURCE from "../shaders/fog/layer_output.glsl";
import LAYER_WRITE_SOURCE from "../shaders/fog/layer_write.glsl";
import STRIKE_TERM_SOURCE from "../shaders/fog/strike_term.glsl";
import MOON_CONSTANT_SOURCE from "../shaders/fog/moon_constant.glsl";
import SHADE_FRAGMENT_SOURCE from "../shaders/fog/shade_fragment.glsl";
import STRIKE_SHADE_FRAGMENT_SOURCE from "../shaders/fog/strike_shade_fragment.glsl";
import VOLUME_FRAGMENT_SOURCE from "../shaders/fog/volume_fragment.glsl";
import STRIKES_FRAGMENT_SOURCE from "../shaders/fog/strikes_fragment.glsl";
import COPY_FRAGMENT_SOURCE from "../shaders/fog/copy_fragment.glsl";
import MARCH_SOURCE from "../shaders/fog/march.glsl";

const NOISE = 128;
// the smoothed values' spread brought back to the whole range: 0.5 + (v - 0.5) * STRETCH
// (two boxes of 5 along each axis leave 0.0145 of the uniform values' 0.289)
const STRETCH = 12;
const BLUR_PASSES = 6;
// the furthest the fog is gathered along a ray (m)
const FOG_FAR = QualityFog.FOG_FAR;
// the volume: its slices along a ray, the distance scale of their spacing (m), the most columns
// (each at least TILE_LEAST pixels across), and how far past each side of the screen they reach
// (a share of it)
const SLICES = QualityFog.SLICES;
const SLICE_NEAR = QualityFog.SLICE_NEAR;
const COLUMNS_MOST = 28800;
const TILE_LEAST = 8;
const MARGIN = 0.1;
// the shadow grid (fixed in the world): its cells, its top (m: the densest medium there is
// 0.3 e^(-12) per metre) and its nearest distance (m)
const SHADE_ACROSS = 128;
const SHADE_UP = 64;
const SHADE_DEEP = 96;
const SHADE_TOP = 48;
const SHADE_NEAR = 0.5;
// the volume's slices and the shadow grid's draws refreshed a second (a quarter of the volume and
// one draw a frame at 24 frames a second); all of it after a gap in time of more than
// REFRESH_GAP (s)
const SHADE_RATE = 24;
const REFRESH_GAP = 0.5;
// the quality pool's id for the shade grid's static data (the noise's levels 3..7), apart from the jobs' effects' indices
const SHADE_EFFECT = 100;
// and the strikes' shadow grids' static data (the noise's levels 0..7)
const STRIKE_EFFECT = 101;
// a strike gathered before its light shows is gathered again after a change of the view while
// it may still play (s: the longest Lightning playing time)
const STRIKE_LONGEST = 5;
const SLOTS = M.STRIKES_MOST;
// the strikes' light stored per unit of light times STRIKE_SCALE (half floats keep faint light)
const STRIKE_SCALE = 64;
// a strike's bakes' stages, one a frame: the two halves of its shadows, its light on the water,
// the two halves of its light in the fog
const STAGES = 5;
// the tests' march along a pixel's own ray: its segments
const MARCH_SEGMENTS = 96;

// the texture units a pair of volumes and their sums stay on
interface FroxelUnits {
  direct: number;
  mirror: number;
  sum: number;
  sumMirror: number;
}

// the fog's programs drawn in the frames
interface FogPasses {
  shade: ShaderProgram;
  strikeShade: ShaderProgram;
  volume: ShaderProgram;
  strikes: ShaderProgram;
  copy: ShaderProgram;
  strikesCopy: ShaderProgram;
}

// the shadow grid's cells a draw of layers covers: [first column, columns, rows]
type ViewBox = [number, number, number];

// a pair of volumes along the camera's rays (direct and mirrored) and the columns' sums so far,
// built slice by slice: each slice gathered by one program into the volumes' layer, then copied
// by another into the sums. stacks: stacks of SLICES layers one after another (the strikes': a
// stack a slot), each built on its own
class Froxels {
  down: number;
  across: number;
  sums: WebGLTexture[];
  volumes: WebGLTexture[];
  slices: WebGLFramebuffer[];
  sumFramebuffer: WebGLFramebuffer;
  stacks: number;
  units: FroxelUnits;
  gl: WebGL2RenderingContext;
  effect: Fog;
  // units: { direct, mirror, sum, sumMirror }, the texture units they stay on
  constructor(effect: Fog, units: FroxelUnits, stacks = 1) {
    this.effect = effect;
    this.gl = effect.gl;
    this.units = units;
    this.stacks = stacks;
    this.sumFramebuffer = effect.createFramebuffer();
    // a framebuffer for each slice, the volumes' layers attached
    this.slices = [];
    this.volumes = [];
    this.sums = [];
    this.across = 0;
    this.down = 0;
  }

  resize(across: number, down: number) {
    const gl = this.gl;
    this.drop();
    this.across = across;
    this.down = down;
    this.volumes = [0, 1].map(() => Fog.texture3D(gl, gl.RGBA16F, 1, gl.LINEAR, gl.CLAMP_TO_EDGE, across, down, SLICES * this.stacks));
    this.sums = [0, 1].map(() => M.RenderTarget.storage(gl, gl.RGBA16F, across, down, gl.NEAREST));
    const both = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sumFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sums[0], 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.sums[1], 0);
    gl.drawBuffers(both);
    for (let k = 0; k < SLICES * this.stacks; k++) {
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.volumes[0], 0, k);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, this.volumes[1], 0, k);
      gl.drawBuffers(both);
      this.slices.push(framebuffer);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // (each on its own unit for good)
    const bind = (unit: number, target: GLenum, texture: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, texture);
    };
    bind(this.units.direct, gl.TEXTURE_3D, this.volumes[0]);
    bind(this.units.mirror, gl.TEXTURE_3D, this.volumes[1]);
    bind(this.units.sum, gl.TEXTURE_2D, this.sums[0]);
    bind(this.units.sumMirror, gl.TEXTURE_2D, this.sums[1]);
  }

  drop() {
    for (const texture of this.volumes.concat(this.sums)) {
      this.gl.deleteTexture(texture);
    }
    for (const framebuffer of this.slices) {
      this.gl.deleteFramebuffer(framebuffer);
    }
    this.volumes = [];
    this.sums = [];
    this.slices = [];
  }

  // slices from..to of a stack gathered (the sums of the slice before `from` copied first, when
  // there is one), as the guard's pass `name` (its slices a piece); the programs' other values
  // already set (the gather's uSlice is the slice in its stack)
  // held: per slice 1 where some column may hold its direct slice (the gather's uCull), or null
  build(name: string, gather: ShaderProgram, copy: ShaderProgram, from: number, to: number, stack = 0, held: Uint8Array | null = null, drops: Uint8Array | null = null) {
    const gl = this.gl;
    const guard = this.effect.guard;
    const each = guard.size(name, "slice");
    const offset = stack * SLICES;
    gl.viewport(0, 0, this.across, this.down);
    gl.uniform1i(copy.use().uOffset, offset);
    guard.begin(name, "slice");
    const lod = this.effect.lod ? 1 : 0;
    gl.uniform1f(gather.use().uTail, lod);
    gl.uniform1f(gather.use().uFar, lod);
    if (from > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sumFramebuffer);
      gl.uniform1i(copy.use().uSlice, from - 1);
      this.effect.quad.drawFull();
    }
    for (let k = from; k < to; k++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.slices[offset + k]);
      const u = gather.use();
      gl.uniform1i(u.uSlice, k);
      gl.uniform1f(u.uCull, held !== null && held[k] === 1 ? 1 : 0);
      if (drops !== null) {
        gl.uniform1f(u.uDrop, drops[k]);
      }
      this.effect.quad.drawFull();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sumFramebuffer);
      gl.uniform1i(copy.use().uSlice, k);
      this.effect.quad.drawFull();
      if ((k - from) % each === each - 1 || k === to - 1) {
        guard.piece();
      }
    }
    guard.end();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

export class Fog extends M.Effect {
  static STAGES: number;
  static MARCH_GLSL: string;
  static GATHER_GLSL: string;
  static TEST_GLSL: string;
  static SHADE_GLSL: string;
  static MEDIUM_GLSL: string;
  static GLSL: string;
  static COPY_FRAGMENT: string;
  static FINISH_FRAGMENT: string;
  static BLUR_FRAGMENT: string;
  static SEED_FRAGMENT: string;
  static shadeFragment: (n: number) => string;
  static strikeShadeFragment: (glsl: SharedGlsl, n: number) => string;
  static volumeFragment: (test: boolean) => string;
  static strikesFragment: (glsl: SharedGlsl, test: boolean) => string;
  onShaded: ((slot: number) => void) | null;
  emitter: WebGLTexture | null;
  // (made only with float pictures: caps.floats)
  strikeDraws!: WebGLFramebuffer[][];
  shadeDraws!: WebGLFramebuffer[];
  strikeShade!: WebGLTexture;
  shade!: WebGLTexture;
  strikeLight!: Froxels;
  light!: Froxels;
  refreshed: { shadeLayers: number; volumeSlices: number; volumeBuilt: number; sliceFrom: number; strikeSlots: number; };
  marched: boolean;
  // the tests' count of the moon kernel's directions the GPU's bake takes (0: MoonDisc.KERNEL, as shipped)
  moonKernel: number;
  warmed: boolean;
  stale: boolean;
  boxes: ViewBox[];
  shadeCredit: number;
  shadePart: number;
  // the shade grid baked by the quality workers (Effect.lod on, with the pool: models/quality/fogshade.ts): the pool, the schedule (null until the noise's
  // levels went out), whether this frame is on that path, the version of the view the jobs are for, each draw's job number, layers still owed, box and
  // the slab its layers arrive in (and its view, when whole)
  shadePool: QualityPool | null;
  shadeSched: InstanceType<typeof QualityFogShade.Schedule> | null;
  shadeCpu: boolean;
  shadeVersion: number;
  shadeJob: Int32Array;
  shadePending: Int32Array;
  shadeBox: Int32Array;
  shadeSlab: Uint16Array[];
  shadeSlabView: (Uint16Array | null)[];
  // the strikes' shadow grids baked ahead by the workers (Effect.lod on, with the pool: models/quality/strikeshade.ts): the schedule (null until the noise's
  // levels 0..7 went out), the shadow points of each planned strike by its number, the staging sets of a strike's draws (its slabs, boxes, the strike
  // they are for, the slot that took them, the upload plan), each slot's strike number, whether its first stage is still to ask for the CPU's grid, and
  // whether its stages upload it
  strikeSched: InstanceType<typeof QualityStrikeShade.Schedule> | null;
  strikePoints: Map<number, Float32Array>;
  strikeSets: { uid: number; slot: number; slabs: Uint16Array[]; box: Int32Array; plan: { from: number; to: number }[] }[];
  strikeUid: Int32Array;
  strikeTry: Uint8Array;
  strikeCpu: Uint8Array;
  sliceCredit: number;
  sliceNext: number;
  cameraVersion: number;
  // the camera's base version and parallax offsets the volume and the shade were last built for (the view moved: a base change, or the offsets past MouseParallax.TOLERANCE)
  baseSeen: number;
  builtFor: ParallaxOffsets;
  lastTime: number;
  gatheredAt: Float64Array;
  // the quality job's result: the slices some column holds (1), whether any, the camera version it was made for, and what
  // the frame's builds use (null: gather everything); the job's view object and whether its statics went out
  held: Uint8Array;
  heldAny: boolean;
  heldVersion: number;
  heldNow: Uint8Array | null;
  // the slices' refresh periods in sweeps (every[k]; the view they were made for: version and columns), the sweeps done, and the
  // view the periods are taken from
  every: Uint8Array;
  // per slice: how many of the noise's octaves (finest first) the gather reads as their mean (QualityFog.Lod.levelOctaves; the volume's uDrop)
  drop: Uint8Array;
  everyVersion: number;
  everyAcross: number;
  sweep: number;
  // the plan task (src/index.ts gives it; null: the plan is made inline) and the answer its fork got for the frame: the input it was asked with and the plan
  planTask: JobTask<FogPlanInput, FogPlanOutput> | null;
  answer: { input: FogPlanInput; output: FogPlanOutput } | null;
  qualityView: FogQualityView | null;
  sentBounds: boolean;
  ready: Uint8Array;
  stage: Uint8Array;
  boltColor: Float32Array;
  levels: Float32Array;
  layers: number;
  columns: number[];
  passes: FogPasses | null;
  noise: WebGLTexture | null;
  ubo: UniformBlock;
  colorSecondary: Float32Array;
  colorMain: Float32Array;
  intensity: number;
  // Distance fog (p215): off removes every aspect of the fog: no volume or bake is drawn, and every reader finds the air clear (fParams.z -1)
  on: boolean;
  // the sky's and the moon's gains per channel (linear), as the uniform block holds them
  skyGain: Float32Array;
  moonGain: Float32Array;
  // the settings behind them
  skyMoonBrightness: number;
  skyTone: string;
  moonTone: string;
  constructor(context: EffectContext) {
    super(context);
    const gl = this.gl;
    this.intensity = 0.1;
    this.on = true;
    this.skyMoonBrightness = M.SkyLight.DEFAULT_BRIGHTNESS;
    this.skyTone = M.SkyLight.DEFAULT_SKY_TONE;
    this.moonTone = M.SkyLight.DEFAULT_MOON_TONE;
    this.skyGain = new Float32Array(3);
    this.moonGain = new Float32Array(3);
    this.setLight();
    this.colorMain = M.color(MAIN_DEFAULT);
    this.colorSecondary = M.color(SECONDARY_DEFAULT);
    // (std140: the density's scale, the time, whether the volume is there, whether the strikes'
    // light is; the two colors; the volume's columns across and down, a column's width in
    // pixels, its margin; each slot's light over STRIKE_SCALE; the strikes' color; the sky's and
    // the moon's gains)
    this.ubo = this.block("Fog", 32);
    this.noise = null;
    this.passes = null;
    this.columns = [0, 0, 0];
    // the layers a bake draws at once
    this.layers = this.caps.drawBuffers;
    // each slot's light now (setStrikes); each slot's bakes' stage (0: none waiting; 1 and 2 the
    // halves of its shadows, 3 its light on the water, 4 and 5 the halves of its light in the fog:
    // one stage a frame, so no frame bakes a whole strike), whether its bakes are done (its light
    // shown: the water reads it too, src/index.ts), and when its light in the fog was last gathered
    this.levels = new Float32Array(SLOTS);
    this.boltColor = Float32Array.from(M.BOLT);
    this.stage = new Uint8Array(SLOTS);
    this.ready = new Uint8Array(SLOTS);
    this.gatheredAt = new Float64Array(SLOTS).fill(-Infinity);
    this.held = new Uint8Array(SLICES);
    this.heldAny = false;
    this.heldVersion = -1;
    this.heldNow = null;
    this.every = new Uint8Array(SLICES).fill(1);
    this.drop = new Uint8Array(SLICES);
    this.everyVersion = -1;
    this.everyAcross = -1;
    this.sweep = 0;
    this.planTask = null;
    this.answer = null;
    this.qualityView = null;
    this.sentBounds = false;
    // the last refresh: its time, the view's version, where the next starts and the work owed
    // by the time passed (slices, draws); all of it next (stale)
    this.lastTime = 0;
    this.cameraVersion = -1;
    this.baseSeen = -1;
    this.builtFor = { yaw: 0, pitchShift: 0, eyeX: 0, eyeShift: 0 };
    this.sliceNext = 0;
    this.sliceCredit = 0;
    this.shadePart = 0;
    this.shadeCredit = 0;
    this.shadePool = null;
    this.shadeSched = null;
    this.shadeCpu = false;
    this.shadeVersion = 0;
    this.shadeJob = new Int32Array(0);
    this.shadePending = new Int32Array(0);
    this.shadeBox = new Int32Array(0);
    this.shadeSlab = [];
    this.shadeSlabView = [];
    this.strikeSched = null;
    this.strikePoints = new Map();
    this.strikeSets = [];
    this.strikeUid = new Int32Array(SLOTS).fill(-1);
    this.strikeTry = new Uint8Array(SLOTS);
    this.strikeCpu = new Uint8Array(SLOTS);
    // the shadow grid's cells the view reads, per draw of layers: [first column, columns, rows]
    this.boxes = [];
    this.stale = true;
    this.warmed = false;
    // (the tests: every shadow marched; what the last frame refreshed)
    this.marched = false;
    this.moonKernel = 0;
    this.refreshed = { shadeLayers: 0, volumeSlices: 0, volumeBuilt: 0, sliceFrom: 0, strikeSlots: 0 };
    if (this.caps.floats) {
      this.light = new Froxels(this, { direct: M.UNITS.fogDirect, mirror: M.UNITS.fogMirror, sum: M.UNITS.fogSum, sumMirror: M.UNITS.fogSumMirror });
      this.strikeLight = new Froxels(this, { direct: M.UNITS.strikeDirect, mirror: M.UNITS.strikeMirror, sum: M.UNITS.strikeSum, sumMirror: M.UNITS.strikeSumMirror }, SLOTS);
      this.shade = this.own(Fog.texture3D(gl, gl.RG16F, 1, gl.LINEAR, gl.CLAMP_TO_EDGE, SHADE_ACROSS, SHADE_UP, SHADE_DEEP), (t: WebGLTexture) => gl.deleteTexture(t));
      this.strikeShade = this.own(Fog.texture3D(gl, gl.RGBA16F, 1, gl.LINEAR, gl.CLAMP_TO_EDGE, SHADE_ACROSS, SHADE_UP, SHADE_DEEP * SLOTS), (t: WebGLTexture) => gl.deleteTexture(t));
      // (the grids' framebuffers, made once: each with `layers` layers attached; the sky's, then
      // each slot's)
      this.shadeDraws = this.layerFramebuffers(this.shade, 0);
      this.strikeDraws = [];
      for (let slot = 0; slot < SLOTS; slot++) {
        this.strikeDraws.push(this.layerFramebuffers(this.strikeShade, slot * SHADE_DEEP));
      }
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.shade);
      gl.bindTexture(gl.TEXTURE_3D, this.shade);
    }
    // the strikes' emitter (Lightning's emitterTexture, given by src/index.ts: setEmitter), and
    // what is told when a slot's shadows were baked (src/index.ts: the water bakes its light then, with
    // the emitter and these shadows still bound)
    this.emitter = null;
    this.onShaded = null;
  }

  // the strikes' emitter's texture (Lightning.emitterTexture)
  setEmitter(texture: WebGLTexture | null) {
    this.emitter = texture;
  }

  // the strikes' bakes' inputs bound: the emitter on M.UNITS.work, the strikes' shadow grid on
  // M.UNITS.bloomFrom (both units shared: bound before each bake that reads them; Bloom binds
  // its own input there before each of its passes)
  bindStrikeInputs() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.emitter);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_3D, this.strikeShade);
  }

  // framebuffers for SHADE_DEEP layers of a grid from `offset` on, `layers` a framebuffer
  layerFramebuffers(texture: WebGLTexture, offset: number) {
    const gl = this.gl;
    const outputs: GLenum[] = [];
    for (let i = 0; i < this.layers; i++) {
      outputs.push(gl.COLOR_ATTACHMENT0 + i);
    }
    const framebuffers: WebGLFramebuffer[] = [];
    for (let k = 0; k < SHADE_DEEP; k += this.layers) {
      const framebuffer = this.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      for (let i = 0; i < this.layers; i++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, outputs[i], texture, 0, offset + k + i);
      }
      gl.drawBuffers(outputs);
      framebuffers.push(framebuffer);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return framebuffers;
  }

  static QUALITY_UNIT = "slices";

  // the frame's quality: the slices some column of the volume holds (level under the full one); the levels are for the camera
  // as it was when the job was made, and used only while it is the same version
  setQuality(q: EffectQuality) {
    super.setQuality(q);
    const levels = q.levels;
    let any = false;
    if (levels && levels.length === SLICES) {
      for (let k = 0; k < SLICES; k++) {
        const holds = levels[k] < QUALITY_LEVELS ? 1 : 0;
        this.held[k] = holds;
        any = any || holds === 1;
      }
    }
    this.heldAny = any;
    this.heldVersion = this.camera.dirty ? -1 : this.camera.version;
  }

  qualityKind(): string {
    return "fog";
  }

  // the slices' starts, once (the job reads them)
  qualityStatics(): QualityStatics | null {
    if (this.sentBounds) {
      return null;
    }
    this.sentBounds = true;
    return { bounds: QualityFog.bounds() };
  }

  // the view the slices are held for: the camera, the water, the volume's columns
  qualityParams(shared: QualityShared): QualityParams {
    let p = this.qualityView;
    if (!p) {
      p = this.qualityView = { inputs: shared.inputs, pitch: 0, margin: MARGIN, across: 0, down: 0 };
    }
    p.inputs = shared.inputs;
    p.pitch = this.camera.tilt();
    p.across = this.columns[0];
    p.down = this.columns[1];
    return p as unknown as QualityParams;
  }

  // the job: the volume's slices (made only with a volume to hold: float pictures and the columns)
  qualityJobs(): QualityJob[] {
    return this.caps.floats && this.on && this.columns[0] > 0 && this.qualityIndex >= 0 ? [{ effect: this.qualityIndex, units: SLICES, minChunk: SLICES }] : [];
  }

  static properties() {
    return {
      p215_setting_DistanceFog: (fog: Fog, v: boolean) => {
        fog.on = !!v;
        fog.stale = true;
      },
      p218_setting_FogIntensity: (fog: Fog, v: number) => {
        fog.intensity = v / 100;
        fog.stale = true;
      },
      p216_setting_FogColorMain: (fog: Fog, v: string) => {
        fog.colorMain = M.color(v);
        fog.stale = true;
      },
      p217_setting_FogColorSecondary: (fog: Fog, v: string) => {
        fog.colorSecondary = M.color(v);
        fog.stale = true;
      },
      p201_setting_SkyMoonBrightness: (fog: Fog, v: number) => {
        fog.skyMoonBrightness = v;
        fog.setLight();
      },
      p202_setting_SkyTone: (fog: Fog, v: string) => {
        fog.skyTone = v;
        fog.setLight();
      },
      p203_setting_MoonTone: (fog: Fog, v: string) => {
        fog.moonTone = v;
        fog.setLight();
      },
    };
  }

  // the sky's and the moon's gains from their settings (the volume is gathered again in the next
  // update: the light it holds changed)
  setLight() {
    const g = M.SkyLight.gains({ brightness: this.skyMoonBrightness, skyTone: this.skyTone, moonTone: this.moonTone });
    this.skyGain.set(g.sky);
    this.moonGain.set(g.moon);
    this.stale = true;
  }

  // the medium's density per metre at its densest (none without float pictures for its noise)
  sigma() {
    return this.caps.floats ? this.intensity * DENSITY_FULL : 0;
  }

  static programs(glsl: SharedGlsl, caps: Capabilities): ProgramSources {
    return {
      noiseSeed: [M.FULL_VERTEX, Fog.SEED_FRAGMENT],
      noiseBlur: [M.FULL_VERTEX, Fog.BLUR_FRAGMENT],
      noiseFinish: [M.FULL_VERTEX, Fog.FINISH_FRAGMENT],
      fogShade: [M.FULL_VERTEX, Fog.shadeFragment(caps.drawBuffers)],
      fogStrikeShade: [M.FULL_VERTEX, Fog.strikeShadeFragment(glsl, caps.drawBuffers)],
      fogVolume: [M.FULL_VERTEX, Fog.volumeFragment(M.TEST)],
      fogStrikes: [M.FULL_VERTEX, Fog.strikesFragment(glsl, M.TEST)],
      fogCopy: [M.FULL_VERTEX, Fog.COPY_FRAGMENT],
      fogStrikesCopy: [M.FULL_VERTEX, Fog.COPY_FRAGMENT],
    };
  }

  // makes the noise (once a context)
  init(programs: Programs) {
    const gl = this.gl;
    const names = ["noiseSeed", "noiseBlur", "noiseFinish", "fogShade", "fogStrikeShade", "fogVolume", "fogStrikes", "fogCopy", "fogStrikesCopy"];
    const [seed, blur, finish, shade, strikeShade, volume, strikes, copy, strikesCopy] = this.ownPrograms(programs, names);
    this.passes = { shade, strikeShade, volume, strikes, copy, strikesCopy };
    shade.samplers({ uNoise: M.UNITS.noise });
    strikeShade.samplers({ uNoise: M.UNITS.noise, uEmitter: M.UNITS.work });
    volume.samplers({ uNoise: M.UNITS.noise, uShade: M.UNITS.shade, uSumDirect: M.UNITS.fogSum, uSumMirror: M.UNITS.fogSumMirror });
    strikes.samplers({
      uNoise: M.UNITS.noise,
      uStrikeShade: M.UNITS.bloomFrom,
      uEmitter: M.UNITS.work,
      uFogDirect: M.UNITS.fogDirect,
      uFogMirror: M.UNITS.fogMirror,
      uSumDirect: M.UNITS.strikeSum,
      uSumMirror: M.UNITS.strikeSumMirror,
    });
    copy.samplers({ uFrom: M.UNITS.fogDirect, uFromMirror: M.UNITS.fogMirror });
    strikesCopy.samplers({ uFrom: M.UNITS.strikeDirect, uFromMirror: M.UNITS.strikeMirror });
    this.noise = this.own(Fog.texture3D(gl, gl.R8, Math.log2(NOISE) + 1, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT, NOISE), (t: WebGLTexture) => gl.deleteTexture(t));
    if (this.caps.floats) {
      const work = [0, 1].map(() => Fog.texture3D(gl, gl.R16F, 1, gl.NEAREST, gl.REPEAT, NOISE));
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, NOISE, NOISE);
      gl.disable(gl.BLEND);
      const slices = (program: ShaderProgram, target: WebGLTexture | null, set: (u: Uniforms) => void) => {
        const u = program.use();
        for (let layer = 0; layer < NOISE; layer++) {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target, 0, layer);
          gl.uniform1i(u.uLayer, layer);
          set(u);
          this.quad.drawFull();
          if (layer % 16 === 15) {
            this.guard.piece();
          }
        }
      };
      slices(seed, work[0], () => {});
      let from = 0;
      blur.samplers({ uFrom: M.UNITS.work });
      for (let pass = 0; pass < BLUR_PASSES; pass++) {
        gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
        gl.bindTexture(gl.TEXTURE_3D, work[from]);
        slices(blur, work[1 - from], (u: Uniforms) => gl.uniform1i(u.uAxis, pass % 3));
        from = 1 - from;
      }
      finish.samplers({ uFrom: M.UNITS.work });
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
      gl.bindTexture(gl.TEXTURE_3D, work[from]);
      slices(finish, this.noise, () => {});
      gl.bindTexture(gl.TEXTURE_3D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      work.forEach((t) => gl.deleteTexture(t));
    }
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.noise);
    gl.bindTexture(gl.TEXTURE_3D, this.noise);
    gl.generateMipmap(gl.TEXTURE_3D);
    this.stale = true;
    this.shadeStart();
  }

  // the quality pool, once it is there: the shade grid's baking in its workers can start (with the noise made)
  setShadePool(pool: QualityPool): void {
    this.shadePool = pool;
    this.shadeStart();
    this.strikeStart();
  }

  // the noise's levels 0..7 read back from the GPU's own mip chain once (255 readPixels), sent to the workers as the strikes' static data, the staging sets and
  // the schedule made
  strikeStart(): void {
    const pool = this.shadePool;
    if (!pool || this.strikeSched || !this.passes || !this.noise || !this.caps.floats) {
      return;
    }
    const Q = QualityStrikeShade;
    if (Q.SPAN !== M.Camera.SPAN || Q.ACROSS !== SHADE_ACROSS || Q.UP !== SHADE_UP || Q.DEEP !== SHADE_DEEP || Q.TOP !== SHADE_TOP || Q.NEAR !== SHADE_NEAR || Q.FAR !== FOG_FAR || Q.GROUPS !== M.Flash.REGIONS || Q.POINTS !== M.Flash.SHADOW_POINTS) {
      return;
    }
    const gl = this.gl;
    const levels: Uint8Array[] = [];
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    let complete = true;
    for (let level = Q.MIP_FROM; level <= Q.MIP_LAST && complete; level++) {
      const n = NOISE >> level;
      const bytes = new Uint8Array(n * n * n);
      const row = new Uint8Array(n * n * 4);
      for (let z = 0; z < n; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.noise, level, z);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          complete = false;
          break;
        }
        gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, row);
        for (let i = 0; i < n * n; i++) {
          bytes[z * n * n + i] = row[i * 4];
        }
      }
      levels.push(bytes);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    if (!complete) {
      return;
    }
    pool.setStatic(STRIKE_EFFECT, { noise: Q.packMips(levels) as unknown as Float32Array }, "strikeshade");
    const draws = this.shadeDraws.length;
    this.strikeSets = [];
    for (let k = 0; k < Q.MOST_HELD; k++) {
      this.strikeSets.push({ uid: -1, slot: -1, slabs: Array.from({ length: draws }, () => new Uint16Array(this.layers * SHADE_UP * SHADE_ACROSS * 4)), box: new Int32Array(draws * 3), plan: [] });
    }
    this.strikeSched = new Q.Schedule(draws);
  }

  // a planned strike's flash is known (Lightning's onPlanned): its shadow points kept and its bake scheduled (Effect.lod on only)
  announceStrike(uid: number, start: number, flash: Float32Array): void {
    if (!this.lod || !this.strikeSched) {
      return;
    }
    if (this.strikePoints.size > 32) {
      this.strikePoints.forEach((v, key) => {
        if (this.strikeSched!.find(key) < 0) {
          this.strikePoints.delete(key);
        }
      });
    }
    this.strikePoints.set(uid, QualityStrikeShade.pointsOf(flash));
    this.strikeSched.announce(uid, start, this.camera.baseVersion);
  }

  // the jobs the strikes' schedule posted this frame: one message a draw, to the reserved bake worker as urgent (ahead of the sky shade's layers)
  postStrikes(): void {
    const sched = this.strikeSched!;
    const pool = this.shadePool!;
    const sigma = this.sigma();
    const version = this.camera.baseVersion;
    for (let i = 0; i < sched.postCount; i++) {
      const uid = sched.postId[i];
      const part = sched.postPart[i];
      const time = sched.postTime[i];
      let set = this.strikeSets.find((x) => x.uid === uid);
      if (!set) {
        set = this.strikeSets.find((x) => x.uid < 0);
        if (!set) {
          continue;
        }
        set.uid = uid;
        set.slot = -1;
      }
      const box = this.boxes[part];
      const points = this.strikePoints.get(uid);
      if (!box || !points) {
        continue;
      }
      set.box[part * 3] = box[0];
      set.box[part * 3 + 1] = box[1];
      set.box[part * 3 + 2] = box[2];
      const message = { params: { sigma, time, points }, layerFrom: part * this.layers, layerTo: (part + 1) * this.layers, x0: box[0], nx: box[1], rows: box[2] };
      pool.bake(STRIKE_EFFECT, message, (reply) => this.strikeReply(uid, part, version, time, reply));
    }
  }

  // a draw's reply: into its slab, kept by the schedule when it is still the one wanted
  strikeReply(uid: number, part: number, version: number, time: number, reply: Record<string, unknown>): void {
    const data = reply.data as Uint16Array | undefined;
    const sched = this.strikeSched;
    const set = this.strikeSets.find((x) => x.uid === uid);
    if (!data || !sched || !set || version !== this.camera.baseVersion) {
      return;
    }
    if (sched.reply(uid, part, version, time)) {
      set.slabs[part].set(data);
    }
  }

  // the staging sets of strikes the schedule no longer holds (and no slot took) given back
  releaseStrikes(): void {
    const sched = this.strikeSched!;
    for (const set of this.strikeSets) {
      if (set.uid >= 0 && set.slot < 0 && !sched.has(set.uid)) {
        set.uid = -1;
      }
    }
  }

  // a slot's CPU grid given up (its stages bake on the GPU)
  strikeDrop(slot: number): void {
    this.strikeTry[slot] = 0;
    this.strikeCpu[slot] = 0;
    for (const set of this.strikeSets) {
      if (set.slot === slot) {
        set.slot = -1;
        set.uid = -1;
      }
    }
  }

  // the slot's strike asks for its CPU grid at its first stage: its upload plan made when the grid is whole and valid (else the stages bake on the GPU)
  strikeClaim(slot: number, time: number): void {
    this.strikeTry[slot] = 0;
    this.strikeCpu[slot] = 0;
    const uid = this.strikeUid[slot];
    const sched = this.strikeSched;
    if (!this.lod || !sched || uid < 0) {
      return;
    }
    const set = this.strikeSets.find((x) => x.uid === uid && x.slot < 0);
    if (sched.begin(uid, time, this.camera.baseVersion) && set) {
      set.slot = slot;
      set.plan = QualityStrikeShade.uploadPlan(Array.from({ length: this.boxes.length }, (v, k) => [set.box[k * 3], set.box[k * 3 + 1], set.box[k * 3 + 2]]), this.layers, QualityStrikeShade.UPLOAD_FRAMES);
      this.strikeCpu[slot] = 1;
    } else if (set) {
      set.uid = -1;
    }
  }

  // a stage of the CPU grid's upload: its draws' layers into the slot's layers of the strikes' grid, over the box they were baked for
  uploadStrike(slot: number, stage: number): void {
    const gl = this.gl;
    const set = this.strikeSets.find((x) => x.slot === slot)!;
    const range = set.plan[stage - 1];
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_3D, this.strikeShade);
    for (let k = range.from; k < range.to; k++) {
      const nx = set.box[k * 3 + 1];
      const rows = set.box[k * 3 + 2];
      gl.texSubImage3D(gl.TEXTURE_3D, 0, set.box[k * 3], 0, slot * SHADE_DEEP + k * this.layers, nx, rows, this.layers, gl.RGBA, gl.HALF_FLOAT, set.slabs[k].subarray(0, this.layers * rows * nx * 4));
    }
    if (stage === QualityStrikeShade.UPLOAD_FRAMES) {
      set.slot = -1;
      set.uid = -1;
      this.strikeCpu[slot] = 0;
    }
  }

  // the noise's levels 3..7 read back from the GPU's own mip chain once (31 readPixels), sent to the workers as the shade's static data, and the schedule made
  shadeStart(): void {
    const pool = this.shadePool;
    if (!pool || this.shadeSched || !this.passes || !this.noise || !this.caps.floats) {
      return;
    }
    const Q = QualityFogShade;
    // (the model's constants are the shader's: another camera span or grid and the CPU's grid would differ)
    if (Q.SPAN !== M.Camera.SPAN || Q.ACROSS !== SHADE_ACROSS || Q.UP !== SHADE_UP || Q.DEEP !== SHADE_DEEP || Q.TOP !== SHADE_TOP || Q.NEAR !== SHADE_NEAR || Q.FAR !== FOG_FAR) {
      return;
    }
    const gl = this.gl;
    const levels: Uint8Array[] = [];
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    let complete = true;
    for (let level = Q.MIP_FROM; level <= Q.MIP_LAST && complete; level++) {
      const n = NOISE >> level;
      const bytes = new Uint8Array(n * n * n);
      const row = new Uint8Array(n * n * 4);
      for (let z = 0; z < n; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.noise, level, z);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          complete = false;
          break;
        }
        gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, row);
        for (let i = 0; i < n * n; i++) {
          bytes[z * n * n + i] = row[i * 4];
        }
      }
      levels.push(bytes);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    if (!complete) {
      return;
    }
    pool.setStatic(SHADE_EFFECT, { noise: Q.packMips(levels) }, "fogshade");
    const draws = this.shadeDraws.length;
    this.shadeJob = new Int32Array(draws);
    this.shadePending = new Int32Array(draws);
    this.shadeBox = new Int32Array(draws * 3);
    this.shadeSlab = Array.from({ length: draws }, () => new Uint16Array(this.layers * SHADE_UP * SHADE_ACROSS * 2));
    this.shadeSlabView = new Array(draws).fill(null);
    this.shadeSched = new Q.Schedule(draws, SHADE_RATE);
  }

  // the jobs the schedule posted this frame: for each draw, one message a layer to the workers (a layer is a few ms of a worker: no message holds one
  // for long), the slab filled as they come
  postShade(): void {
    // (the tests' kernel is not the workers': the GPU bakes every draw)
    if (this.moonKernel !== 0) {
      return;
    }
    const sched = this.shadeSched!;
    const pool = this.shadePool!;
    const sigma = this.sigma();
    const version = this.shadeVersion;
    for (let i = 0; i < sched.postCount; i++) {
      const k = sched.postDraw[i];
      const time = sched.postTime[i];
      const box = this.boxes[k];
      const job = ++this.shadeJob[k];
      this.shadePending[k] = this.layers;
      this.shadeSlabView[k] = null;
      this.shadeBox[k * 3] = box[0];
      this.shadeBox[k * 3 + 1] = box[1];
      this.shadeBox[k * 3 + 2] = box[2];
      const first = k * this.layers;
      for (let l = 0; l < this.layers; l++) {
        const message = { params: { sigma, time }, layerFrom: first + l, layerTo: first + l + 1, x0: box[0], nx: box[1], rows: box[2] };
        const sent = pool.bake(SHADE_EFFECT, message, (reply) => this.shadeReply(k, job, version, time, reply), true);
        if (!sent) {
          // (no worker: the draw stays a job nobody answers, and the GPU bakes it at its turn)
          break;
        }
      }
    }
  }

  // a layer's reply: into the draw's slab; the draw's last one makes its reply whole, kept by the schedule when it is still the one wanted
  shadeReply(k: number, job: number, version: number, time: number, reply: Record<string, unknown>): void {
    const data = reply.data as Uint16Array | undefined;
    if (!data || job !== this.shadeJob[k] || version !== this.shadeVersion || !this.shadeSched) {
      return;
    }
    const nx = this.shadeBox[k * 3 + 1];
    const rows = this.shadeBox[k * 3 + 2];
    this.shadeSlab[k].set(data, ((reply.layerFrom as number) - k * this.layers) * rows * nx * 2);
    if (--this.shadePending[k] === 0) {
      this.shadeSlabView[k] = this.shadeSlab[k].subarray(0, this.layers * rows * nx * 2);
      this.shadeSched.reply(k, version, time);
    }
  }

  // draw k's layers from its worker's reply into the grid, over the box the reply was baked for
  uploadShade(k: number): void {
    const gl = this.gl;
    const data = this.shadeSlabView[k]!;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_3D, this.shade);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, this.shadeBox[k * 3], 0, k * this.layers, this.shadeBox[k * 3 + 1], this.shadeBox[k * 3 + 2], this.layers, gl.RG, gl.HALF_FLOAT, data);
    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  // a 3D texture (wrap: how it is read past its sides)
  static texture3D(gl: WebGL2RenderingContext, format: GLenum, levels: number, filter: GLenum, wrap: GLenum, width: number, height = width, depth = width): WebGLTexture {
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texStorage3D(gl.TEXTURE_3D, levels, format, width, height, depth);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
    for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, axis, wrap);
    }
    gl.bindTexture(gl.TEXTURE_3D, null);
    return texture;
  }

  // the volumes' columns for the screen's size and its margins: made again only when their
  // number changes
  resize(width: number, height: number) {
    if (!this.caps.floats) {
      return;
    }
    const wide = width * (1 + 2 * MARGIN);
    const high = height * (1 + 2 * MARGIN);
    const tile = Math.max(TILE_LEAST, Math.ceil(Math.sqrt((wide * high) / COLUMNS_MOST)));
    const across = Math.ceil(wide / tile);
    const down = Math.ceil(high / tile);
    if (across !== this.columns[0] || down !== this.columns[1]) {
      this.light.resize(across, down);
      this.strikeLight.resize(across, down);
      this.stale = true;
    }
    this.columns = [across, down, wide / across];
  }

  destroy() {
    if (this.light) {
      this.light.drop();
      this.strikeLight.drop();
    }
    super.destroy();
  }

  // a strike started in a slot: its bakes from the next update, one stage a frame (STAGES), its
  // light shown once they are done
  strikeAt(slot: number, uid = -1) {
    this.strikeDrop(slot);
    this.strikeUid[slot] = uid;
    this.strikeTry[slot] = uid >= 0 ? 1 : 0;
    this.stage[slot] = 1;
    this.ready[slot] = 0;
  }

  // whether a slot's light shows in this frame: its bakes done, or done in this frame (its last
  // stage, the frame's active slot)
  shows(slot: number) {
    return this.ready[slot] === 1 || (this.stage[slot] === STAGES && this.activeSlot() === slot);
  }

  // the slot whose bakes go on this frame: the first waiting (-1: none)
  activeSlot() {
    for (let slot = 0; slot < SLOTS; slot++) {
      if (this.stage[slot] > 0) {
        return slot;
      }
    }
    return -1;
  }

  // a clean start: no strike's bakes waiting, none shown
  reset() {
    for (let slot = 0; slot < SLOTS; slot++) {
      this.strikeDrop(slot);
    }
    this.strikeSets.forEach((set) => (set.uid = set.slot = -1));
    this.stage.fill(0);
    this.ready.fill(0);
    this.gatheredAt.fill(-Infinity);
  }

  // each slot's light now (0: none), and the strikes' color (applied when the fog is read: the
  // strikes' light gathered has none)
  setStrikes(levels: ArrayLike<number>, color: ArrayLike<number>) {
    this.levels.set(levels);
    this.boltColor.set(color);
  }

  // all of it refreshed in the next update
  refreshAll() {
    this.stale = true;
  }

  // (the tests: the kernel of the moon's penumbra the shade bake takes, 1 to MoonDisc.KERNEL_MAX, 0 for the shipped one; the whole grid baked again on the GPU)
  setMoonKernel(n: number) {
    this.moonKernel = M.TEST ? Math.min(Math.max(Math.floor(n), 0), MoonDisc.KERNEL_MAX) : 0;
    this.refreshAll();
  }

  // the volume's margin (the uniform block's fVolume.w) for the pixels of the mirrored picture, which is larger than the view (models/reflectionframe.ts fogMargin), or the view's own
  // with null; the block's other values are the frame's
  readMargin(frame: ReflectionFrameOf | null) {
    this.ubo.data[15] = frame ? ReflectionFrame.fogMargin(MARGIN, frame) : MARGIN;
    this.ubo.upload();
  }

  // its values for this frame, and its pictures refreshed (after the camera's values)
  update(time: number) {
    const gl = this.gl;
    // the frame's plan (models/fogplan.ts): the answer its fork asked of the worker when it is for exactly these values, else the function run here
    const input = this.planInput(time, false);
    const answered = this.answer;
    this.answer = null;
    const plan = answered && FogPlan.same(answered.input, input) ? answered.output : FogPlan.plan(input);
    const built = input.built;
    this.ubo.data.set(plan.ubo);
    this.ubo.upload();
    if (!built) {
      return;
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    if (!this.warmed) {
      this.warm();
    }
    // (the plan's decisions: a setting's change, a gap in time, the view moved (its base changed, or the mouse parallax's offsets drifted past the tolerance of the view the volume
    // and the shade were built for; a smaller drift only goes on with the slices' own refresh, which reads the view as it is then), the shade grid baked by the workers or by the
    // GPU alone (a change of that path is a whole new bake, as a setting's change is))
    const settings = plan.settings;
    const jump = plan.jump;
    const camera = this.camera;
    const moved = plan.moved;
    const cpu = plan.cpu;
    this.shadeCpu = cpu;
    const view = plan.view;
    this.stale = false;
    this.lastTime = time;
    this.cameraVersion = this.camera.version;
    if (moved) {
      this.baseSeen = camera.baseVersion;
      this.builtFor.yaw = camera.yaw;
      this.builtFor.pitchShift = camera.pitchShift;
      this.builtFor.eyeX = camera.eyeX;
      this.builtFor.eyeShift = camera.eyeShift;
    }
    if (moved || this.boxes.length === 0) {
      this.boxes = this.viewBoxes();
    }
    // (built: the passes are made)
    const passes = this.passes!;
    // (the slices the job's levels say some column holds: only for the view they were made for)
    this.heldNow = this.heldAny && this.heldVersion === this.camera.version && !this.camera.dirty ? this.held : null;
    // the clouds' shadow of the sky and the moon (fixed in the world, baked over the view): the
    // draws of its layers the time passed owes, all of them after a gap, a setting's change or a
    // change of the view
    let owed: number;
    if (cpu) {
      // Effect.lod on with the workers: the draws the schedule owes, uploaded from their worker's reply when it is whole and current, baked by the GPU
      // (runs of draws in one bake) when it is not; all of them on the GPU after a change of the view, a setting or a gap; the jobs for their next turn posted
      const sched = this.shadeSched!;
      if (view) {
        this.shadeVersion++;
      }
      sched.frame(time, view, this.shadeVersion);
      owed = sched.owedCount;
      for (let i = 0; i < owed; ) {
        const k = sched.drawOf[i];
        if (sched.uploaded[i]) {
          this.uploadShade(k);
          i++;
          continue;
        }
        let j = i + 1;
        while (j < owed && !sched.uploaded[j] && sched.drawOf[j] === sched.drawOf[j - 1] + 1) {
          j++;
        }
        this.bake("fog shade", passes.shade, this.shadeDraws, k, sched.drawOf[j - 1] + 1, -1);
        i = j;
      }
      this.postShade();
      // (the earlier path's state, when it takes over again: from draw 0 with no credit)
      this.shadeCredit = plan.shadeCredit;
      this.shadePart = plan.shadePart;
    } else {
      // (the runs of draws the plan owes)
      owed = plan.owed;
      for (let i = 0; i < plan.shadeBakes.length; i += 2) {
        this.bake("fog shade", passes.shade, this.shadeDraws, plan.shadeBakes[i], plan.shadeBakes[i + 1], -1);
      }
      this.shadeCredit = plan.shadeCredit;
      this.shadePart = plan.shadePart;
    }
    // the strikes' grids baked ahead: the schedule's view of the frame (a setting's change drops them all), its jobs posted
    if (this.strikeSched && this.lod) {
      if (settings) {
        this.strikeSched.settingsChanged();
      }
      this.strikeSched.frame(time, this.camera.baseVersion);
      this.postStrikes();
      this.releaseStrikes();
    }
    // after a setting's or the view's change, the strikes playing or gathered lately (their light
    // kept shown meanwhile): their bakes from the first stage again; after a gap in time only
    // those not baking already (the grids are fixed in the world)
    for (let slot = 0; slot < SLOTS; slot++) {
      const recent = time - this.gatheredAt[slot] < STRIKE_LONGEST && time >= this.gatheredAt[slot];
      const again = settings || moved ? this.levels[slot] > 0 || recent || this.stage[slot] > 0 : jump && this.stage[slot] === 0 && (this.levels[slot] > 0 || recent);
      if (again) {
        this.strikeDrop(slot);
        this.stage[slot] = 1;
      }
    }
    // (one slot's stage a frame, the first waiting: no frame bakes two strikes' stages)
    const active = this.activeSlot();
    // (stages 1 and 2: the halves of its shadows' draws; stage 3: its light on the water, from
    // them: src/index.ts)
    if (active >= 0) {
      const draws = this.strikeDraws[active].length;
      const half = Math.ceil(draws / 2);
      const stage = this.stage[active];
      if (stage === 1 && this.strikeTry[active]) {
        this.strikeClaim(active, time);
      }
      if ((stage === 1 || stage === 2) && this.strikeCpu[active]) {
        this.uploadStrike(active, stage);
      } else if (stage === 1 || stage === 2) {
        this.bindStrikeInputs();
        this.bake("strike shade", passes.strikeShade, this.strikeDraws[active], stage === 1 ? 0 : half, stage === 1 ? half : draws, active);
      } else if (stage === 3 && this.onShaded) {
        this.bindStrikeInputs();
        this.onShaded(active);
      }
    }
    // the fog's volume: the slices the time passed owes (from where the last frame stopped), all
    // of them when the view changed
    // (the plan's slices: the periods made again when the view's numbers changed, the runs of slices due built, a sweep done counted)
    const slices = plan.slices;
    const sliceFrom = plan.sliceFrom;
    this.sliceCredit = plan.sliceCredit;
    this.every.set(plan.every);
    this.drop.set(plan.drop);
    this.everyVersion = plan.everyVersion;
    this.everyAcross = plan.everyAcross;
    this.testValues(passes.volume);
    for (let i = 0; i < plan.runs.length; i += 2) {
      this.light.build("fog volume", passes.volume, passes.copy, plan.runs[i], plan.runs[i + 1], 0, this.heldNow, this.lod ? this.drop : null);
    }
    const drawn = plan.drawn;
    this.sweep = plan.sweep;
    this.sliceNext = plan.sliceNext;
    // (stages 4 and 5: its light in the fog, a half of its slices each; then done)
    let gatheredNow = 0;
    if (active >= 0) {
      const stage = this.stage[active];
      if (stage === STAGES - 1) {
        this.gatherStrike(active, 0, SLICES / 2);
      } else if (stage === STAGES) {
        this.gatherStrike(active, SLICES / 2, SLICES);
        this.gatheredAt[active] = time;
        this.ready[active] = 1;
        gatheredNow++;
      }
      this.stage[active] = stage < STAGES ? stage + 1 : 0;
    }
    this.refreshed.shadeLayers = owed * this.layers;
    this.refreshed.volumeSlices = slices;
    this.refreshed.volumeBuilt = drawn;
    this.refreshed.sliceFrom = sliceFrom;
    this.refreshed.strikeSlots = gatheredNow;
  }

  // the frame's values and the state the plan (models/fogplan.ts) works from; `copy`: the arrays and objects copied, for an input kept to be compared (the fork's)
  planInput(time: number, copy: boolean): FogPlanInput {
    const c = this.camera;
    const built = this.caps.floats && this.on && this.columns[0] > 0 && !!this.passes;
    const strike: number[] = [];
    let shining = false;
    for (let slot = 0; slot < SLOTS; slot++) {
      const shown = this.shows(slot);
      shining = shining || (this.levels[slot] > 0 && shown);
      strike.push(shown ? this.levels[slot] : 0);
    }
    const arrays = <T extends ArrayLike<number>>(a: T): T => (copy ? ((a as unknown as { slice(): T }).slice()) : a);
    const offsets = (o: ParallaxOffsets): ParallaxOffsets => ({ yaw: o.yaw, pitchShift: o.pitchShift, eyeX: o.eyeX, eyeShift: o.eyeShift });
    return {
      time,
      lastTime: this.lastTime,
      stale: this.stale,
      built,
      sigma: this.sigma(),
      on: this.on,
      shining,
      colorMain: arrays(this.colorMain),
      colorSecondary: arrays(this.colorSecondary),
      columns: this.columns.slice(),
      margin: MARGIN,
      strike,
      strikeScale: STRIKE_SCALE,
      boltColor: arrays(this.boltColor),
      // (the tests' march's segments, given at run time: a loop of a constant count is unrolled by Direct3D's compiler through ANGLE)
      marchSegments: MARCH_SEGMENTS,
      skyGain: arrays(this.skyGain),
      moonGain: arrays(this.moonGain),
      lod: this.lod,
      hasSched: this.shadeSched !== null,
      shadeCpu: this.shadeCpu,
      baseChanged: c.baseVersion !== this.baseSeen,
      offsets: offsets(c),
      builtFor: offsets(this.builtFor),
      gap: REFRESH_GAP,
      // (the grids' framebuffers exist only with float pictures: none, the plan is not built)
      draws: this.shadeDraws ? this.shadeDraws.length : 0,
      shadeRate: SHADE_RATE,
      shadeCredit: this.shadeCredit,
      shadePart: this.shadePart,
      sliceCredit: this.sliceCredit,
      sliceNext: this.sliceNext,
      sweep: this.sweep,
      every: arrays(this.every),
      drop: arrays(this.drop),
      everyVersion: this.everyVersion,
      everyAcross: this.everyAcross,
      cameraVersion: c.version,
      eyeY: c.eyeY(),
      focal: c.focal(),
      width: c.width,
      height: c.height,
      tilt: c.tilt(),
      air: AIR,
      waterDrawn: false,
    };
  }

  // the frame's plan asked of its worker with the frame's exact values (after the frame's advance, before the draw: Effect.fork), the draw waiting for the answer; update takes it when
  // the values it gathers then are the same (the camera's size, a setting or a strike's light changed in between: it plans here instead)
  fork(time: number): Promise<void> | null {
    const task = this.planTask;
    if (!task) {
      return null;
    }
    const input = this.planInput(time, true);
    return task.ask(input).then((output) => {
      this.answer = { input, output };
    });
  }

  // the shadow grid's cells the view can read, for each draw of `layers` layers: the columns of
  // x / distance and the rows of heights the camera's rays reach there (the volume's margin past
  // each side included, the mirrored rays' heights too, a node more each way for the trilinear
  // reading), as [first column, columns, rows]
  viewBoxes() {
    const c = this.camera;
    const tan = Math.tan(c.halfFov());
    const across = ((c.width / c.height) * tan) * (1 + 2 * MARGIN);
    const up = tan * (1 + 2 * MARGIN);
    const slant = Math.max(0.1, Math.cos(c.tilt()) - up * Math.abs(Math.sin(c.tilt())));
    const wide = across / slant;
    const column = (g: number) => ((g / M.Camera.SPAN + 1) / 2) * (SHADE_ACROSS - 1);
    const first = Math.max(0, Math.floor(column(-wide)) - 1);
    const last = Math.min(SHADE_ACROSS - 1, Math.ceil(column(wide)) + 1);
    const reach = Math.max(Math.tan(c.tilt() + Math.atan(up)), Math.tan(Math.atan(up) - c.tilt()), 0);
    const boxes: ViewBox[] = [];
    for (let k = 0; k < SHADE_DEEP; k += this.layers) {
      const deepest = Math.min(SHADE_DEEP - 1, k + this.layers);
      const z = SHADE_NEAR * Math.exp((deepest / (SHADE_DEEP - 1)) * Math.log(FOG_FAR / SHADE_NEAR));
      const top = c.eyeY() + z * reach;
      const rows = Math.min(SHADE_UP, Math.ceil(Math.sqrt(Math.min(1, top / SHADE_TOP)) * (SHADE_UP - 1)) + 2);
      boxes.push([first, last - first + 1, rows]);
    }
    return boxes;
  }

  // a slot's light gathered into its stack of the strikes' light, its slices from..to (a later
  // part goes on from the sums of the slice before, read from the stack)
  gatherStrike(slot: number, from: number, to: number) {
    // (only once the passes are made: update's built)
    const passes = this.passes!;
    this.bindStrikeInputs();
    this.testValues(passes.strikes);
    this.gl.uniform1i(passes.strikes.use().uSlot, slot);
    this.strikeLight.build("strike light", passes.strikes, passes.strikesCopy, from, to, slot, this.heldNow);
  }

  // the strikes' programs drawn once, over one pixel (into slot 0's shadows and light, both made
  // again when a strike comes)
  warm() {
    const gl = this.gl;
    this.warmed = true;
    this.heldNow = null;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    this.bindStrikeInputs();
    this.bake("strike shade", this.passes!.strikeShade, this.strikeDraws[0], 0, 1, 0, false);
    this.gatherStrike(0, 0, 1);
    gl.disable(gl.SCISSOR_TEST);
  }

  // (the tests' value on a program: every shadow marched)
  testValues(program: ShaderProgram) {
    if (M.TEST) {
      this.gl.uniform1i(program.use().uMarched, this.marched ? 1 : 0);
    }
  }

  // draws from..to of a grid's framebuffers baked (`layers` layers each), as the guard's pass
  // `name` (its slices a piece: layers here); slot: the strike's (-1: the sky's shadow); inView:
  // each draw scissored to the cells the view reads (viewBoxes; false: the scissor as it is)
  bake(name: string, program: ShaderProgram, framebuffers: WebGLFramebuffer[], from: number, to: number, slot: number, inView = true) {
    const gl = this.gl;
    const each = Math.max(1, Math.floor(this.guard.size(name, "slice") / this.layers));
    gl.viewport(0, 0, SHADE_ACROSS, SHADE_UP);
    const u = program.use();
    gl.uniform1i(u.uLayers, this.layers);
    if (slot >= 0) {
      gl.uniform1i(u.uSlot, slot);
    } else if (M.TEST) {
      gl.uniform1i(u.uMoonKernel, this.moonKernel);
    }
    if (inView) {
      gl.enable(gl.SCISSOR_TEST);
    }
    this.guard.begin(name, "slice");
    for (let k = from; k < to; k++) {
      if (inView) {
        const box = this.boxes[k];
        gl.scissor(box[0], 0, box[1], box[2]);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[k]);
      gl.uniform1i(u.uLayer, k * this.layers);
      this.quad.drawFull();
      if ((k - from) % each === each - 1 || k === to - 1) {
        this.guard.piece();
      }
    }
    this.guard.end();
    if (inView) {
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

// one random value a voxel
Fog.SEED_FRAGMENT = fill(SEED_FRAGMENT_SOURCE, { "M.HASH_GLSL": M.HASH_GLSL, "NOISE": NOISE, "NOISE * NOISE": NOISE * NOISE });

// a box of 5 along one axis, wrapping round
Fog.BLUR_FRAGMENT = fill(BLUR_FRAGMENT_SOURCE, { "NOISE": NOISE });

Fog.FINISH_FRAGMENT = fill(FINISH_FRAGMENT_SOURCE, { "STRETCH.toFixed(1)": STRETCH.toFixed(1) });

// the uniform block, the light around (the sky's and the moon's, and the strikes' color), and
// the volumes read at a place of the screen and a distance (after Camera.GLSL)
Fog.GLSL = fill(FOG_SOURCE, { "FOG_FAR.toFixed(1)": FOG_FAR.toFixed(1), "AIR": AIR, 'SKY.join(", ")': SKY.join(", "), 'MOON.map((v) => v.toFixed(2)).join(", ")': MOON.map((v) => v.toFixed(2)).join(", "), 'MOON_DIR.map((v) => v.toFixed(2)).join(", ")': MOON_DIR.map((v) => v.toFixed(2)).join(", "), "MOON_RADIUS.toFixed(6)": MoonDisc.RADIUS.toFixed(6), "MOON_SOLID_ANGLE.toExponential(6)": MoonDisc.SOLID_ANGLE.toExponential(6), "SLICES.toFixed(1)": SLICES.toFixed(1), "SLICE_NEAR.toFixed(1)": SLICE_NEAR.toFixed(1), "Math.log(1 + FOG_FAR / SLICE_NEAR).toFixed(6)": Math.log(1 + FOG_FAR / SLICE_NEAR).toFixed(6), "STRIKE_SCALE.toFixed(1)": STRIKE_SCALE.toFixed(1), "SLOTS": SLOTS, "strikeTerms": Array.from({ length: SLOTS }, (v, k) => fill(STRIKE_TERM_SOURCE, { "s": "xyzw"[k], "k": k })).join("\n") });

// the moon kernel's directions as GLSL constants (MOON_K0 ...: MoonDisc.directions over the disc round MOON_DIR, nine decimals), the centre first
function moonKernelConstants(): string {
  const d = MoonDisc.directions(MOON_DIR, MoonDisc.RADIUS, MoonDisc.KERNEL_MAX);
  const lines: string[] = [];
  for (let k = 0; k < MoonDisc.KERNEL_MAX; k++) {
    lines.push(fill(MOON_CONSTANT_SOURCE, { "k": k, "x": d[3 * k].toFixed(9), "y": d[3 * k + 1].toFixed(9), "z": d[3 * k + 2].toFixed(9) }));
  }
  return lines.join("\n");
}

// the medium: its density, what it lets through between two places, the shadow grid's places,
// and the clouds' shadow of the sky and the moon marched. lod: log2 of the noise's texels at a
// size of 1 m that a sample stands for (lodOf: of a length)
Fog.MEDIUM_GLSL = fill(MEDIUM_SOURCE, { "MULTIPLE": MULTIPLE, "PHASE_G": PHASE_G, "SHADE_TOP.toFixed(1)": SHADE_TOP.toFixed(1), "SHADE_NEAR.toFixed(2)": SHADE_NEAR.toFixed(2), "Math.log(FOG_FAR / SHADE_NEAR).toFixed(6)": Math.log(FOG_FAR / SHADE_NEAR).toFixed(6), "SHADE_ACROSS": SHADE_ACROSS, "SHADE_UP": SHADE_UP, "SHADE_DEEP": SHADE_DEEP, "M.Camera.SPAN.toFixed(4)": M.Camera.SPAN.toFixed(4), "SLOTS": SLOTS, "NOISE.toFixed(1)": NOISE.toFixed(1), "MOON_KERNEL": MoonDisc.KERNEL, "MOON_KERNEL_MAX": MoonDisc.KERNEL_MAX, "moonKernelConstants": moonKernelConstants() });

// the baked shadows read, and the clouds' light (after MEDIUM_GLSL). marched: the shadows
// marched, not baked
Fog.SHADE_GLSL = SHADE_SOURCE;

// the tests' value: every shadow marched (none in the wallpaper)
Fog.TEST_GLSL = TEST_SOURCE;

// a stretch of a ray (o + t d, a to b) added to what was gathered so far (acc: light, what is
// let through), its medium taken at its middle (mirrored: the place mirrored in the water)
Fog.GATHER_GLSL = fill(GATHER_SOURCE, { "QualityFog.TOP_MIP.toFixed(1)": QualityFog.TOP_MIP.toFixed(1) });

// the slices' bounds and the level for a column's slice
const SLICE_GLSL = fill(SLICE_SOURCE, { "CULL_BELOW.toFixed(2)": QualityFog.CULL_BELOW.toFixed(2), "CULL_RELATIVE": QualityFog.CULL_RELATIVE, "QualityFog.TAIL_T.toExponential(6)": QualityFog.TAIL_T.toExponential(6) });

// layers uLayer to uLayer + n - 1 of a grid: each output a layer's cell, value(p) its value
const gridFragment = (n: number, head: string, value: string) => fill(GRID_FRAGMENT_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": Fog.GLSL, "Fog.MEDIUM_GLSL": Fog.MEDIUM_GLSL, "head": head, "layerOutputs": Array.from({ length: n }, (v, i) => fill(LAYER_OUTPUT_SOURCE, { "i": i })).join("\n"), "value": value, "n": n, "layerWrites": Array.from({ length: n }, (v, i) => fill(LAYER_WRITE_SOURCE, { "i": i })).join("\n") });

// cells of the shadow grid: what gets to each from the sky and the moon (marched, 4 places over
// 8 m); n layers a draw
Fog.shadeFragment = (n) => gridFragment(n, "", SHADE_FRAGMENT_SOURCE);

// cells of the shadow grid: what gets to each from each region of strike slot uSlot's emitter
// (towards the region's nearest point, 4 places); n layers a draw
Fog.strikeShadeFragment = (glsl, n) => gridFragment(n, fill(STRIKE_SHADE_FRAGMENT_SOURCE, { "glsl.lightning": glsl.lightning, "glsl.emitter": glsl.emitter }), "groups(p)");

// a slice of both of the fog's volumes: each column's sums so far (from the slice before) on to
// this slice's far end
Fog.volumeFragment = (test) => fill(VOLUME_FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": Fog.GLSL, "Fog.MEDIUM_GLSL": Fog.MEDIUM_GLSL, "Fog.SHADE_GLSL": Fog.SHADE_GLSL, "Fog.TEST_GLSL": Fog.TEST_GLSL, "Fog.GATHER_GLSL": Fog.GATHER_GLSL, "SLICE_GLSL": SLICE_GLSL });

// a slice of strike slot uSlot's light (per unit of its light, times STRIKE_SCALE, in its color:
// into its stack of slices): each column's light so far on to this slice's far end, its light
// scattered in the slice (at its middle: by the clouds' albedo and the air's white) times what
// the fog's volume lets through to its start, times what the slice's medium takes away
Fog.strikesFragment = (glsl, test) => fill(STRIKES_FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": Fog.GLSL, "Fog.MEDIUM_GLSL": Fog.MEDIUM_GLSL, "Fog.SHADE_GLSL": Fog.SHADE_GLSL, "Fog.TEST_GLSL": Fog.TEST_GLSL, "glsl.lightning": glsl.lightning, "glsl.emitter": glsl.emitter, "glsl.scatter": glsl.scatter, "SLICE_GLSL": SLICE_GLSL });

// a slice of both volumes copied into the columns' sums (uOffset: the first layer of its stack)
Fog.COPY_FRAGMENT = COPY_FRAGMENT_SOURCE;

// (the tests' views only) the fog's light and what it lets through along o + t d from t0 to
// t1, marched along the ray itself, every shadow marched: 96 segments, further apart further
// away, one place in each at jitter (after SHADE_GLSL); the sky's and the moon's light only
// (the strikes' is compared marched in the volume itself: Rain3D.marched), so the water's
// program has the strikes' light in one place
Fog.MARCH_GLSL = fill(MARCH_SOURCE, { "M.HASH_GLSL": M.HASH_GLSL });

Fog.STAGES = STAGES;
M.Fog = Fog;
