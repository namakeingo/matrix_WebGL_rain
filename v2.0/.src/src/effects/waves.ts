// The waves: the water's surface, simulated on the water in the world: every step the waves need,
// on a grid of 2048 x 1024 cells.
// - The grid lies on the water, fixed in the world (not on the view: a change of Plane height or
//   of the window keeps every wave where it is): across by x / Z over the world's width
//   (Camera.SPAN), down evenly by 1 / Z, from 0.9 of the nearest distance the camera sees the
//   water at to 1.5 times the furthest drops'. A cell is Z wide and Z^2 deep.
// - A step: a cell's speed (a step's displacement) takes its neighbours' difference over the
//   cells' sizes times the waves' way a step squared, its height its speed; both damped so the
//   waves lose 99% in Ripples duration, and more within EDGE cells of the grid's sides, where the
//   waves die out instead of coming back. The waves add up with no limit. A step goes as far as
//   keeps the nearest cells stable (0.8 of the most with the level of detail, 0.45 without: models/wavesteps.ts); at 0.25 m/s.
// - An impact (a drop landing: weight 1; a splash falling back: 0.35; a strike: 3) is a push of
//   the water's speed as wide in the world as its weight (a drop's 5 cm at Ripples intensity
//   100%), (1 - r^2 / 2) e^(-r^2 / 2): it sums to 0, so no water is added or taken away; where it
//   is smaller than a cell it is spread over one and as much weaker.
// - Heights and speeds in metres, in float pictures (RG32F, stepped back and forth); the
//   impacts added up into a picture of pushes (R16F: half floats blend everywhere), taken in the
//   frame's first step (then let go: invalidateFramebuffer); the highest wave (R32F, by blocks of
//   4 x 4, then blocks of those, to the highest of all), found again only after steps: the
//   blocks' and the highest of all tell the strikes' shadow rays over the water where to look at
//   the cells, and how far to go. The steps go to the GPU in pieces of as many as the GPU guard
//   sizes by their time (its kind "step"), and the highest waves found are a piece of their own.
// - The impacts waiting are written straight into a typed array (no allocation in a normal
//   frame). The queue has no limit: it starts with room for IMPACTS_MOST and, when full, the array
//   and the GPU buffer are made twice the size (rarely, never shrunk), so no impact is dropped
//   (dropped stays 0). The step draws them in batches of at most IMPACTS_BATCH instances into the
//   same additive picture, in the order they were added, one guard piece after each batch. The
//   grid's values reach the shaders once (the uniform block "Waves").
// - Calm: `calm` says the water is flat, so the reflection's mip chain and the water's glossy read
//   are not needed (Reflection.setCalm, src/index.ts). True at once when the grid is cleared (reset,
//   stepping stopped) and false at once when an impact is queued, stepping is switched on or the
//   heights are set. It turns true by itself only from the highest wave: after each step it is read
//   back without stalling (a pixel pack buffer of one pixel, a fence, getBufferSubData on a later
//   frame once clientWaitSync with a timeout of 0 says it has passed; one reading outstanding, at
//   most every readEvery seconds) into `highest` (metres, a few frames old). A reading counts only if
//   no impact was added since it was requested and none was waiting then (an epoch counted by every
//   change), and the water is calm after two such readings in a row under CALM_HEIGHT.
// - Its programs are drawn once when they are ready (the driver finishes a program at its first
//   draw): a step into the picture the next step overwrites, an impact off the grid.
// - Quality (models/quality/water.ts): the highest wave is looked for (the maxima's chain, its read-back) only when the view has a
//   water pixel: the glyphs' discard tests and the water's shadow marches are its only readers, and all read places on the water
//   plane, which only a downward ray sees. The steps themselves never stop. A frame that skips leaves the search pending
//   (`stepped` stays set), made at the first frame that needs it. The result is used only for the camera it was made for; the
//   wallpaper's own cameras always have water in view, so there it never skips.
// Its GLSL (Waves.GLSL): the heights at any place, the cells' size and the water's normal.
//
// - Quality (models/quality/waves.ts): the job is the coarse map of the water's blocks (kind "waves", a unit 8 x 8 blocks); the search is skipped
//   when no block is seen (every level 0: no pixel of the screen has its water point, or the fog hides all of it).
//
// - Fusion (models/quality/wavefuse.ts, shaders/waves/step_fused_fragment.glsl): with the level of detail on and `fuse` set (FUSE_ENABLED), a frame of at least
//   WaveFuse.FUSE_MIN_STEPS (8) steps takes them two to a draw (fewer steps: single draws, the fused draw being dearer there).
//
// Changelog:
// 2026-11-08: fusion on by default, only for frames of 8 steps or more (`fuseMin`, `fuseAnyLod` for the tests).
// 2026-11-08: two steps a draw (fused pairs first, an odd one single last), behind `fuse`; the guard's pieces counted in draws.
// 2026-11-07: the quality job is the block map (kind "waves", 2048 units of 8 x 8 blocks, the grid as its static array).
// 2026-11-06: the highest-wave search skipped for a view with no water (quality job "water").
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/waves.js).
// 2026-11-06: calm flag from the highest wave read back without stalling (highest, readings, readEvery).
// 2026-11-06: the impact queue grows when full (array and buffer doubled), none dropped; the
//             impacts drawn in batches of at most 65536 instances, a guard piece after each
// 2026-11-12: CALM_HEIGHT is WaveLift.CALM (one constant for the calm flag and the landings' lift).
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import GRID_SOURCE from "../shaders/waves/grid.glsl";
import IMPACT_VERTEX_SOURCE from "../shaders/waves/impact_vertex.glsl";
import IMPACT_FRAGMENT_SOURCE from "../shaders/waves/impact_fragment.glsl";
import STEP_FRAGMENT_SOURCE from "../shaders/waves/step_fragment.glsl";
import STEP_FUSED_SOURCE from "../shaders/waves/step_fused_fragment.glsl";
import MAX_FRAGMENT_SOURCE from "../shaders/waves/max_fragment.glsl";
import WAVES_SOURCE from "../shaders/waves/waves.glsl";
import { QualityWater } from "../models/quality/water";
import { QualityWaves } from "../models/quality/waves";
import { WaveSteps } from "../models/wavesteps";
import { WaveLift } from "../models/wavelift";
import { WaveMax } from "../models/quality/wavemax";
import { WaveFuse } from "../models/quality/wavefuse";
import type { EffectContext } from "../engine/effect";
import type { EffectQuality, QualityJob, QualityShared, QualityViewInputs } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";
import type { Programs, ProgramSources, ShaderProgram, RenderTarget, UniformBlock } from "../engine/gl";

// the grid on the water: its nearest and furthest distance (m), its half width as a bearing
// (x / distance), the waves' way a step (m), the steps a second
interface Grid {
  near: number;
  far: number;
  span: number;
  cdt: number;
  rate: number;
}

// an impact made (for the tests): its place on the water and its weight
interface Impact {
  x: number;
  z: number;
  weight: number;
}

const { ACROSS, DOWN, STABLE, STABLE_REF } = WaveSteps;
const IMPACT_SIZE = 0.05;
const IMPACT_PUSH = 0.4;
// the cells along each side where the waves die out (the most they lose a step there: WaveSteps.edgeLossFor)
const { EDGE } = WaveSteps;
// whether the waves fuse their steps two to a draw (shaders/waves/step_fused_fragment.glsl, models/quality/wavefuse.ts) with the level of detail on: exact, but a
// gain only where the step is bound by memory and not by arithmetic, which a frame of many steps is (WaveFuse.FUSE_MIN_STEPS): fewer steps stay single draws, so
// it is on as shipped (the effect's `fuse` is the switch)
const FUSE_ENABLED = true;
// the most steps a frame (the time over that is let go: only after a long pause)
const STEPS_MOST = 64;
// the room of the impact queue at the start (measured at Speed 99 and Density 10, 3840 wide: at
// most 659 a frame, landings and splashes); it doubles when full
const IMPACTS_MOST = 4096;
// the most instances in one impact draw
const IMPACTS_BATCH = 65536;
const LOG_MOST = 8192;
// the highest wave (m) under which the water counts as calm: a crest that low moves no reflection by a pixel
// (the threshold of the lift's gate too: models/wavelift.ts)
const CALM_HEIGHT = WaveLift.CALM;
// the seconds between two read-backs of the highest wave
const READ_EVERY = 0.25;

export class Waves extends M.Effect {
  static IMPACTS_MOST: number;
  static GLSL: string;
  setHeights!: (shape: ((x: number, z: number) => number) | null) => void;
  bench!: (name: string, fused: number, single: number) => void;
  read!: () => { width: number; height: number; data: Float32Array<ArrayBuffer> };
  maxProgram!: ShaderProgram;
  stepProgram!: ShaderProgram;
  fusedProgram!: ShaderProgram;
  // two steps to a draw when the level of detail is on (starts as FUSE_ENABLED; the tests set it), and the frame's draws (kept: no allocation in a frame)
  fuse: boolean;
  // for the tests: the fewest steps a frame must have to be fused (WaveFuse.FUSE_MIN_STEPS), and fusing also with the level of detail off
  fuseMin: number;
  fuseAnyLod: boolean;
  fusePlan: { fused: number; single: number };
  impactProgram!: ShaderProgram;
  static MAX_FRAGMENT: string;
  static STEP_FRAGMENT: string;
  static STEP_FUSED_FRAGMENT: string;
  static IMPACT_FRAGMENT: string;
  static IMPACT_VERTEX: string;
  grid: Grid;
  // the level of detail the grid's step was made for, and the edge loss a step at it
  tunedLod!: boolean;
  edgeLoss!: number;
  // (with M.TEST only: a stability constant the tests set for a run, whatever the level of detail; 0 or unset: none)
  stableOverride?: number;
  // (with M.TEST only: the clock the frame-rate smoothing and the read-back's pace use, in ms, set by the test before each frame, and the read-back's fence
  // finished before it is polled: runs from the same state give the same pictures whatever the machine's speed)
  realTime?: number;
  tunedOverride?: number;
  current: number;
  maxes: RenderTarget[];
  // the highest wave as the shaders read it with the level of detail on: the chain's result raised by the bound between two chains (models/quality/wavemax.ts),
  // one pixel drawn each frame; the waves' steps taken in all, the step count the last chain describes, the frames since it, the young impacts' ledger, the frames
  // a chain waits (from the smoothed frame rate), whether a strike's shadow march needs the blocks' maxima (set by the scene), the chains run (for the tests)
  bounded!: RenderTarget;
  stepCount: number;
  chainStep: number;
  framesSince: number;
  young: InstanceType<typeof WaveMax.Young>;
  refresh: number;
  smoothFrame: number;
  lastFrameAt: number;
  blocksNeeded: boolean;
  chains: number;
  impulse!: RenderTarget;
  states: RenderTarget[];
  impactArray: WebGLVertexArrayObject;
  impactBuffer: WebGLBuffer;
  impactData: Float32Array<ArrayBuffer>;
  ubo: UniformBlock;
  stepped: boolean;
  // whether impacts are taken (Collision plane) and the waves stepped (Collision plane and Ripples): see WaterState
  impactsOn: boolean;
  steppedOn: boolean;
  lastTime: number;
  time: number;
  logNext: number;
  log: Impact[];
  lastSteps: number;
  dropped: number;
  impactCount: number;
  noDamping: boolean;
  duration: number;
  // Ripples speed (10 to 300, 75 = 0.25 m/s): see models/ripplespeed.ts
  rippleSpeed: number;
  intensity: number;
  // the water is flat (see the header), the highest wave read back (m), how many readings have arrived, the seconds between
  // two requests
  calm: boolean;
  highest: number;
  readings: number;
  readEvery: number;
  // the read-back: its pixel pack buffer and fence, what it was requested at (the epoch, whether impacts were waiting),
  // the epoch counting every change that can make waves, the readings in a row that count as calm, whether the highest
  // wave changed since the last request, and when that was (ms)
  readBuffer: WebGLBuffer;
  readFence: WebGLSync | null;
  readArray: Float32Array<ArrayBuffer>;
  readEpoch: number;
  readValid: boolean;
  epoch: number;
  streak: number;
  dirty: boolean;
  lastRequest: number;
  furthest: number;
  // the searches left for a view with no water, the camera version the quality result was made for, whether the quality job's statics
  // were given, and the parameters object the job keeps
  skippedSearches: number;
  qualityFor: number;
  qualitySentGrid: Float32Array | null;
  qualityValues: { inputs: QualityViewInputs; lod: boolean } | null;
  // furthest: the furthest drops' distance
  constructor(context: EffectContext, furthest: number) {
    super(context);
    const gl = this.gl;
    this.skippedSearches = 0;
    this.fuse = FUSE_ENABLED;
    this.fuseMin = WaveFuse.FUSE_MIN_STEPS;
    this.fuseAnyLod = false;
    this.fusePlan = { fused: 0, single: 0 };
    this.stepCount = 0;
    this.chainStep = 0;
    this.framesSince = 0;
    this.young = new WaveMax.Young();
    this.refresh = 1;
    this.smoothFrame = 0;
    this.lastFrameAt = 0;
    this.blocksNeeded = true;
    this.chains = 0;
    this.qualityFor = -1;
    this.qualitySentGrid = null;
    this.qualityValues = null;
    this.furthest = furthest;
    this.impactsOn = true;
    this.steppedOn = true;
    this.intensity = 1;
    this.duration = 15;
    this.rippleSpeed = M.RippleSpeed.DEFAULT;
    this.noDamping = false;
    this.impactCount = 0;
    this.calm = true;
    this.highest = 0;
    this.readings = 0;
    this.readEvery = READ_EVERY;
    this.readFence = null;
    this.readArray = new Float32Array(4);
    this.readEpoch = 0;
    this.readValid = false;
    this.epoch = 0;
    this.streak = 0;
    this.dirty = false;
    this.lastRequest = 0;
    this.readBuffer = this.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.readBuffer);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.own(this, (waves) => {
      if (waves.readFence) {
        gl.deleteSync(waves.readFence);
        waves.readFence = null;
      }
    });
    // the impacts dropped: always 0, the queue grows instead (kept for the tests)
    this.dropped = 0;
    // the steps of the last frame that stepped (for the tests)
    this.lastSteps = 0;
    // (the impacts made, for the tests: a ring of the newest LOG_MOST)
    this.log = [];
    this.logNext = 0;
    this.time = 0;
    this.lastTime = 0;
    this.stepped = true;
    this.ubo = this.block("Waves", 8);
    this.impactData = new Float32Array(IMPACTS_MOST * 3);
    this.impactBuffer = this.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.impactBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.impactData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.impactArray = this.vertexArray([{ buffer: this.impactBuffer, attribute: "aImpact", size: 3 }]);
    const target = (format: GLenum, width: number, height: number) => {
      const t = this.target({ format });
      t.resize(width, height);
      return t;
    };
    if (this.caps.floats) {
      this.states = [target(gl.RG32F, ACROSS, DOWN), target(gl.RG32F, ACROSS, DOWN)];
      this.impulse = target(gl.R16F, ACROSS, DOWN);
      this.bounded = target(gl.R32F, 1, 1);
      this.maxes = [];
      let w = ACROSS;
      let h = DOWN;
      while (w > 1 || h > 1) {
        w = Math.max(1, Math.ceil(w / 4));
        h = Math.max(1, Math.ceil(h / 4));
        this.maxes.push(target(gl.R32F, w, h));
      }
    } else {
      // (no float pictures to draw into: still water)
      const flat = target(gl.RGBA8, 1, 1);
      this.states = [flat, flat];
      this.maxes = [flat];
      this.bounded = flat;
    }
    this.current = 0;
    this.grid = this.makeGrid();
    this.reset();
  }

  static programs(): ProgramSources {
    return {
      waveImpact: [Waves.IMPACT_VERTEX, Waves.IMPACT_FRAGMENT],
      waveStep: [M.FULL_VERTEX, Waves.STEP_FRAGMENT],
      waveStepFused: [M.FULL_VERTEX, Waves.STEP_FUSED_FRAGMENT],
      waveMax: [M.FULL_VERTEX, Waves.MAX_FRAGMENT],
    };
  }

  static QUALITY_UNIT = "blocks";

  // the frame's quality: the view's answer (a result of the pool's job) and the camera it was made for
  setQuality(q: EffectQuality) {
    super.setQuality(q);
    this.qualityFor = this.camera.dirty ? -1 : this.camera.version;
  }

  qualityKind(): string {
    return "waves";
  }

  // the job's static array: the grid (near, far, span, cells across and down), given again only when the grid changes
  qualityStatics(): QualityStatics | null {
    const g = this.grid;
    const sent = this.qualitySentGrid;
    if (sent && sent[0] === g.near && sent[1] === g.far && sent[2] === g.span) {
      return null;
    }
    const grid = QualityWaves.gridStatics(g);
    this.qualitySentGrid = grid;
    return { grid };
  }

  qualityParams(shared: QualityShared): QualityParams {
    let p = this.qualityValues;
    if (!p) {
      p = this.qualityValues = { inputs: shared.inputs, lod: this.lod };
    }
    p.inputs = shared.inputs;
    p.lod = this.lod;
    return p as unknown as QualityParams;
  }

  // the water's blocks, one unit each (the coarse map of the water's levels, units of 8 x 8 blocks: models/quality/waves.ts), in one chunk
  qualityJobs(): QualityJob[] {
    return this.qualityIndex >= 0 ? [{ effect: this.qualityIndex, units: QualityWaves.UNITS, minChunk: QualityWaves.UNITS }] : [];
  }

  static properties() {
    return {
      p210_setting_RippleIntensity: (waves: Waves, v: number) => (waves.intensity = v / 100),
      p213_setting_RippleSpeed: (waves: Waves, v: number) => (waves.rippleSpeed = v),
      p214_setting_RippleDuration: (waves: Waves, v: number) => (waves.duration = v),
    };
  }

  init(programs: Programs) {
    [this.impactProgram, this.stepProgram, this.fusedProgram, this.maxProgram] = this.ownPrograms(programs, ["waveImpact", "waveStep", "waveStepFused", "waveMax"]);
    this.stepProgram.samplers({ uState: M.UNITS.waves, uImpulse: M.UNITS.work });
    this.fusedProgram.samplers({ uState: M.UNITS.waves, uImpulse: M.UNITS.work });
    this.maxProgram.samplers({ uFrom: M.UNITS.work });
    this.uploadGrid();
    this.stepped = true;
    this.warm();
  }

  // its step and impact programs drawn once: the step over one pixel of the picture the next
  // step writes whole, an impact off the grid (nothing drawn)
  warm() {
    const gl = this.gl;
    if (!this.caps.floats) {
      return;
    }
    gl.disable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    this.states[1 - this.current].bind();
    const u = this.stepProgram.use();
    gl.uniform1i(u.uWithImpulse, 0);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.waves);
    gl.bindTexture(gl.TEXTURE_2D, this.states[this.current].texture);
    this.quad.drawFull();
    const f = this.fusedProgram.use();
    gl.uniform1i(f.uWithImpulse, 0);
    this.quad.drawFull();
    this.impulse.bind();
    const at = this.impactData.subarray(0, 3);
    at.fill(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.impactBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, at);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.impactProgram.use();
    gl.bindVertexArray(this.impactArray);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
    gl.bindVertexArray(null);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.bind();
  }

  get speed() {
    return M.RippleSpeed.speedFor(this.rippleSpeed);
  }

  // the steps a second: the grid's rate at Ripples speed 75, scaled with the setting
  get stepRate() {
    this.tune();
    return M.RippleSpeed.stepsPerSecond(this.rippleSpeed, this.grid.rate);
  }

  // the grid on the water (fixed in the world), and the steps a second
  makeGrid() {
    const near = 0.9 * M.Camera.nearestWater();
    const far = 1.5 * this.furthest;
    const span = M.Camera.SPAN;
    const stable = M.TEST && this.stableOverride ? this.stableOverride : this.lod ? STABLE : STABLE_REF;
    const cdt = WaveSteps.cdtFor(near, far, span, stable);
    this.tunedLod = this.lod;
    this.tunedOverride = this.stableOverride;
    this.edgeLoss = WaveSteps.edgeLossFor(near, far, span, stable);
    return { near, far, span, cdt, rate: WaveSteps.rateFor(cdt) };
  }

  // the step's way, its rate and the edge loss for the level of detail (STABLE with it, STABLE_REF, the earlier physics, without): made again, in place,
  // when the level changed; the waves' state goes on as it is (the same wave speed, only the steps' size changes)
  tune() {
    if (this.tunedLod === this.lod && this.tunedOverride === this.stableOverride) {
      return;
    }
    const g = this.grid;
    const stable = M.TEST && this.stableOverride ? this.stableOverride : this.lod ? STABLE : STABLE_REF;
    this.tunedOverride = this.stableOverride;
    g.cdt = WaveSteps.cdtFor(g.near, g.far, g.span, stable);
    g.rate = WaveSteps.rateFor(g.cdt);
    this.edgeLoss = WaveSteps.edgeLossFor(g.near, g.far, g.span, stable);
    this.tunedLod = this.lod;
  }

  // where a place of the water is on the grid, in cells (their middles at whole numbers)
  gridOf(x: number, z: number) {
    const g = this.grid;
    const distance = -z;
    return [((x / distance + g.span) / (2 * g.span)) * ACROSS - 0.5, ((1 / g.near - 1 / distance) / (1 / g.near - 1 / g.far)) * DOWN - 0.5];
  }

  // the middle of a cell in the world: [x, z]
  worldOf(i: number, j: number) {
    const g = this.grid;
    const u = (i + 0.5) / ACROSS;
    const v = (j + 0.5) / DOWN;
    const distance = 1 / (1 / g.near - v * (1 / g.near - 1 / g.far));
    return [(u * 2 - 1) * g.span * distance, -distance];
  }

  // a cell's area in the world (m^2)
  cellArea(i: number, j: number) {
    const g = this.grid;
    const distance = -this.worldOf(i, j)[1];
    return ((distance * 2 * g.span) / ACROSS) * ((distance * distance * (1 / g.near - 1 / g.far)) / DOWN);
  }

  add(x: number, z: number, weight: number) {
    if (!this.impactsOn || !this.steppedOn) {
      return;
    }
    if (M.TEST) {
      this.log[this.logNext % LOG_MOST] = { x, z, weight };
      this.logNext++;
    }
    if (this.intensity > 0) {
      this.calm = false;
      this.epoch++;
      if (this.impactCount * 3 >= this.impactData.length) {
        this.growImpacts();
      }
      const o = this.impactCount++ * 3;
      this.impactData[o] = x;
      this.impactData[o + 1] = z;
      this.impactData[o + 2] = weight;
    }
  }

  // the queue's room doubled (array and GPU buffer; the impacts waiting kept)
  growImpacts() {
    const gl = this.gl;
    const bigger = new Float32Array(this.impactData.length * 2);
    bigger.set(this.impactData);
    this.impactData = bigger;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.impactBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, bigger.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // the impacts made, oldest first (for the tests)
  impactLog() {
    const n = Math.min(this.logNext, LOG_MOST);
    return Array.from({ length: n }, (v, k) => this.log[(this.logNext - n + k) % LOG_MOST]);
  }

  // the highest wave (after steps)
  // (with the level of detail on the chain runs every refresh-th frame, every frame while a strike's march reads the blocks' maxima, and the shaders read
  // the bound; off, every frame and the shaders read the chain's result as before)
  update() {
    this.poll();
    this.tick();
    this.framesSince++;
    if (this.stepped) {
      if (QualityWater.skips(this.qualityResult, this.qualityFor, this.camera.version, this.camera.dirty)) {
        // (no water in view: nothing reads the highest wave; the search stays pending for the first frame that does)
        this.skippedSearches++;
      } else if (!this.lod || WaveMax.due(this.framesSince, this.refresh, this.blocksNeeded)) {
        this.stepped = false;
        this.findMax();
        this.chainStep = this.stepCount;
        this.framesSince = 0;
        this.chains++;
        this.dirty = true;
      }
    }
    if (this.lod) {
      this.drawBound();
    } else {
      this.bind();
    }
    this.request();
  }

  // the flag back to calm at once, as after the grid is cleared: nothing can be moving
  setCalm() {
    this.framesSince = 1e9;
    this.calm = true;
    this.highest = 0;
    this.epoch++;
    this.streak = 0;
  }

  // the waves are no longer known to be flat (heights set from outside)
  setMoving() {
    this.framesSince = 1e9;
    this.calm = false;
    this.epoch++;
    this.streak = 0;
  }

  // the highest wave asked for: the last picture of the maxima into the pixel pack buffer, a fence after it; at most one
  // outstanding, at most every readEvery seconds, and only when the maxima changed since the last request
  request() {
    const gl = this.gl;
    if (!this.dirty || this.readFence || !this.caps.floats || !this.maxProgram) {
      return;
    }
    const now = M.TEST && this.realTime !== undefined ? this.realTime : performance.now();
    if (now - this.lastRequest < this.readEvery * 1000) {
      return;
    }
    this.lastRequest = now;
    this.dirty = false;
    this.maxes[this.maxes.length - 1].bind();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.readBuffer);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.readFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this.readEpoch = this.epoch;
    this.readValid = this.impactCount === 0 && this.steppedOn;
  }

  // the reading, if its fence has passed (never waits): the highest wave; two readings in a row that were asked for with no
  // impact since or waiting, both under CALM_HEIGHT, make the water calm
  poll() {
    const gl = this.gl;
    if (!this.readFence) {
      return;
    }
    if (M.TEST && this.realTime !== undefined) {
      gl.finish();
    }
    const status = gl.clientWaitSync(this.readFence, 0, 0);
    if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) {
      if (status === gl.WAIT_FAILED) {
        gl.deleteSync(this.readFence);
        this.readFence = null;
      }
      return;
    }
    gl.deleteSync(this.readFence);
    this.readFence = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.readBuffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.readArray);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.highest = this.readArray[0];
    this.readings++;
    const counts = this.readValid && this.readEpoch === this.epoch && this.highest < CALM_HEIGHT;
    this.streak = counts ? this.streak + 1 : 0;
    if (this.streak >= 2 && this.impactCount === 0) {
      this.calm = true;
    }
  }

  uploadGrid() {
    const g = this.grid;
    const d = this.ubo.data;
    d[0] = g.near;
    d[1] = g.far;
    d[2] = g.span;
    d[3] = ACROSS;
    d[4] = DOWN;
    this.ubo.upload();
  }

  // moves the waves on to a time
  advance(time: number) {
    const passed = time - this.lastTime;
    this.lastTime = time;
    this.run(passed, false);
  }

  // moves the waves on by some seconds (at most STEPS_MOST steps, unless all)
  run(seconds: number, all: boolean) {
    const slice = M.RippleSpeed.stepsIn(this.time + Math.max(0, seconds), this.stepRate, STEPS_MOST, all);
    this.time = slice.left;
    this.step(slice.steps);
  }

  // the impacts waiting, into the picture of pushes, then steps (the pushes taken in the first)
  step(steps: number) {
    const gl = this.gl;
    this.lastSteps = steps;
    if (!this.steppedOn) {
      return;
    }
    const count = this.impactCount;
    if (!this.caps.floats || !this.stepProgram || steps <= 0) {
      if (steps > 0) {
        this.impactCount = 0;
      }
      return;
    }
    this.tune();
    const g = this.grid;
    if (this.lod) {
      this.feedLedger(count);
    }
    this.stepCount += steps;
    this.guard.begin("waves", "step");
    gl.disable(gl.BLEND);
    if (count > 0) {
      this.impulse.bind();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const u = this.impactProgram.use();
      gl.uniform1f(u.uSize, IMPACT_SIZE * this.intensity);
      gl.uniform1f(u.uPush, IMPACT_PUSH * g.cdt);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      // (batches in the order added, each sent to the start of the buffer and drawn into the same
      // additive picture; a guard piece after each when there is more than one)
      for (let from = 0; from < count; from += IMPACTS_BATCH) {
        const n = Math.min(IMPACTS_BATCH, count - from);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.impactBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.impactData, from * 3, n * 3);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindVertexArray(this.impactArray);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
        if (count > IMPACTS_BATCH) {
          this.guard.piece();
        }
      }
      gl.disable(gl.BLEND);
      this.impactCount = 0;
    }
    WaveFuse.planInto(steps, (this.lod || this.fuseAnyLod) && this.fuse, this.fusePlan, this.fuseMin);
    this.drawSteps(this.fusePlan.fused, this.fusePlan.single, count > 0);
    this.guard.end();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (count > 0) {
      this.impulse.invalidate();
    }
    this.stepped = true;
    this.bind();
  }

  // the steps as draws: `fused` fused draws (two steps each) first, then `single` single ones; the picture of pushes is taken in the first draw. The guard's
  // pieces are counted in draws
  drawSteps(fused: number, single: number, withPush: boolean) {
    const gl = this.gl;
    const g = this.grid;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.impulse.texture);
    const damp = this.noDamping ? 1 : M.RippleSpeed.dampPerStep(this.duration, this.stepRate);
    const loss = this.noDamping ? 0 : this.edgeLoss;
    const draws = fused + single;
    // (the draws sent to the GPU in pieces of as many as the guard's time for them allows)
    const per = this.guard.size("waves", "step");
    let u = this.stepProgram.use();
    for (let k = 0; k < draws; k++) {
      if (k === 0 || k === fused) {
        u = (k < fused ? this.fusedProgram : this.stepProgram).use();
        gl.uniform1f(u.uCdt, g.cdt);
        gl.uniform1f(u.uDamp, damp);
        gl.uniform1f(u.uEdgeLoss, loss);
      }
      const from = this.states[this.current];
      const to = this.states[1 - this.current];
      to.bind();
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.waves);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      gl.uniform1i(u.uWithImpulse, withPush && k === 0 ? 1 : 0);
      this.quad.drawFull();
      this.current = 1 - this.current;
      if (k % per === per - 1 || k === draws - 1) {
        this.guard.piece();
      }
    }
  }

  // the heights now, the highest wave of each block of 4 x 4 cells and of all, on their texture
  // units
  bind() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.waves);
    gl.bindTexture(gl.TEXTURE_2D, this.states[this.current].texture);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.waveBlocks);
    gl.bindTexture(gl.TEXTURE_2D, this.maxes[0].texture);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.waveMax);
    gl.bindTexture(gl.TEXTURE_2D, (this.lod ? this.bounded : this.maxes[this.maxes.length - 1]).texture);
  }

  // the impacts about to be applied (count in impactData) into the young ledger, at the step count before their first step: each one's peak height and
  // the steps it stays young from its size (0.05 x intensity x weight) and the grid's cell sizes at its distance
  feedLedger(count: number) {
    const g = this.grid;
    const data = this.impactData;
    const along = (2 * g.span) / ACROSS;
    const down = (1 / g.near - 1 / g.far) / DOWN;
    for (let k = 0; k < count; k++) {
      const z = -data[k * 3 + 1]!;
      if (!(z > 0)) {
        continue;
      }
      const size = IMPACT_SIZE * this.intensity * data[k * 3 + 2]!;
      const cellX = z * along;
      const cellZ = z * z * down;
      this.young.add(this.stepCount, WaveMax.peakOf(size, cellX, cellZ), WaveMax.youngSteps(g.cdt, size, cellX, cellZ));
    }
  }

  // the frame rate smoothed from the time between two updates, and so the frames between two chains
  tick() {
    const now = M.TEST && this.realTime !== undefined ? this.realTime : performance.now();
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (dt > 0 && dt < 250) {
      this.smoothFrame = this.smoothFrame > 0 ? this.smoothFrame + (dt - this.smoothFrame) * 0.1 : dt;
    }
    this.refresh = this.smoothFrame > 0 ? WaveMax.refreshEvery(1000 / this.smoothFrame, this.lod) : 1;
  }

  // the highest wave as the shaders read it with the level of detail on: the last chain's result plus the young impacts' peaks, times the growth since,
  // one pixel drawn (the same program as the chain's passes, its two terms set; the chain's own passes leave them at 0)
  drawBound() {
    const gl = this.gl;
    if (!this.caps.floats || !this.maxProgram) {
      return;
    }
    const u = this.maxProgram.use();
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.waveMax);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.maxes[this.maxes.length - 1].texture);
    this.bounded.bind();
    gl.uniform1i(u.uFirst, 0);
    gl.uniform1f(u.uAdd, this.young.sum(this.chainStep));
    gl.uniform1f(u.uGrow, WaveMax.growth(this.stepCount - this.chainStep) - 1);
    this.quad.drawFull();
    gl.uniform1f(u.uAdd, 0);
    gl.uniform1f(u.uGrow, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.bind();
  }

  // finds the highest wave
  findMax() {
    const gl = this.gl;
    if (!this.caps.floats || !this.maxProgram) {
      this.bind();
      return;
    }
    const u = this.maxProgram.use();
    let from = this.states[this.current].texture;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.waveMax);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.waveBlocks);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    this.guard.begin("waves highest", "step");
    for (let i = 0; i < this.maxes.length; i++) {
      gl.bindTexture(gl.TEXTURE_2D, from);
      this.maxes[i].bind();
      gl.uniform1i(u.uFirst, i === 0 ? 1 : 0);
      this.quad.drawFull();
      from = this.maxes[i].texture;
    }
    this.guard.piece();
    this.guard.end();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.bind();
  }

  // the rules of the water's state: impacts taken or not, the waves stepped or not; stepping stopped leaves the water calm
  // (the grid cleared and the impacts waiting dropped)
  setState(impacts: boolean, stepped: boolean) {
    this.impactsOn = impacts;
    if (this.steppedOn && !stepped) {
      this.impactCount = 0;
      this.clearGrid();
    } else if (!this.steppedOn && stepped) {
      this.setMoving();
    }
    this.steppedOn = stepped;
  }

  clearGrid() {
    const gl = this.gl;
    for (const t of this.caps.floats ? [this.states[0], this.states[1], this.impulse] : this.states) {
      t.bind();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.stepped = true;
    this.setCalm();
  }

  reset() {
    const gl = this.gl;
    this.time = 0;
    this.lastTime = 0;
    this.impactCount = 0;
    this.dropped = 0;
    this.log = [];
    this.logNext = 0;
    for (const t of this.caps.floats ? [this.states[0], this.states[1], this.impulse] : this.states) {
      t.bind();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.stepped = true;
    this.setCalm();
  }
}

if (M.TEST) {
  // for the tests: the heights and speeds (a blocking read: never in the frames)
  // for the tests: `fused` fused and `single` single draws with no push, a guard section of their own (named, kind "step"): the benchmark of ?test=wavefusebench
  Waves.prototype.bench = function (this: Waves, name: string, fused: number, single: number) {
    const gl = this.gl;
    this.guard.begin(name, "step");
    gl.disable(gl.BLEND);
    this.drawSteps(fused, single, false);
    this.guard.end();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.stepped = true;
    this.bind();
  };

  Waves.prototype.read = function (this: Waves) {
    const gl = this.gl;
    const data = new Float32Array(ACROSS * DOWN * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.states[this.current].framebuffer);
    gl.readPixels(0, 0, ACROSS, DOWN, gl.RGBA, gl.FLOAT, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { width: ACROSS, height: DOWN, data };
  };

  // for the tests: the heights set by a function of the place (x, z), still; null: flat
  Waves.prototype.setHeights = function (this: Waves, shape) {
    const gl = this.gl;
    const data = new Float32Array(ACROSS * DOWN * 2);
    if (shape) {
      for (let j = 0; j < DOWN; j++) {
        for (let i = 0; i < ACROSS; i++) {
          const [x, z] = this.worldOf(i, j);
          data[(j * ACROSS + i) * 2] = shape(x, z);
        }
      }
    }
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.waves);
    gl.bindTexture(gl.TEXTURE_2D, this.states[this.current].texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ACROSS, DOWN, gl.RG, gl.FLOAT, data);
    this.stepped = true;
    this.setMoving();
  };
}

const GRID_GLSL = GRID_SOURCE;

// an impact: a quad round its place on the grid, as far as its push reaches
Waves.IMPACT_VERTEX = fill(IMPACT_VERTEX_SOURCE, { "GRID_GLSL": GRID_GLSL });

// its push in a cell: (1 - r^2 / 2) e^(-r^2 / 2), which sums to 0 over the water
Waves.IMPACT_FRAGMENT = IMPACT_FRAGMENT_SOURCE;

Waves.STEP_FRAGMENT = fill(STEP_FRAGMENT_SOURCE, { "GRID_GLSL": GRID_GLSL, "EDGE.toFixed(1)": EDGE.toFixed(1) });

// two steps in one draw (the step's scheme at the cell and its four neighbours, then once more at the cell)
Waves.STEP_FUSED_FRAGMENT = fill(STEP_FUSED_SOURCE, { "GRID_GLSL": GRID_GLSL, "EDGE.toFixed(1)": EDGE.toFixed(1) });

// the highest wave (by its size) in each block of 4 x 4
Waves.MAX_FRAGMENT = MAX_FRAGMENT_SOURCE;

// the heights at any place (bilinear between the cells' middles, 0 off the grid), and the
// water's normal from the waves' real slopes
Waves.GLSL = fill(WAVES_SOURCE, { "GRID_GLSL": GRID_GLSL });

Waves.IMPACTS_MOST = IMPACTS_MOST;

M.Waves = Waves;
