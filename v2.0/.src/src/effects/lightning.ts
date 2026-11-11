// Lightning as a light: each strike's channel is a jagged line in 3D, from the top of the view
// at its distance down to the water (Lightning.ends: the whole bolt fitted to the screen at its
// distance, made again for a playing strike when the view changes): its shape (made by the
// shape function src/index.ts gives, BoltShape.start's in models/boltshape.ts: the way down and the
// way up to their meeting point, and the branches), made ahead of it.
// - Its light (the flash): an emitter never drawn, the main channel's whole shape (shape.main,
//   every piece of it) merged into one emitter (M.Flash.of, models/flash.ts: worked out in the
//   bolt's worker with the shape; the branches cast none): Flash.REGIONS regions along the path,
//   each a tree of merged nodes (a node the shape at its scale: its power, its centroid, a radius
//   round it; a leaf a short stretch of it as a line light), EMISSION a metre. Lightning sends
//   each strike's emitter to a texture (emitterTexture, src/index.ts gives it to the fog and the
//   water) when it starts; the bakes walk it (Lightning.EMITTER_GLSL: a node far enough as from
//   its centroid, a nearer one its children, a leaf its line light), once a strike: its shadows
//   through the clouds per region (the fog's grid), its light the fog and the air scatter (the
//   fog's strikes' light) and its light on the water (the water's grid); the frames read the
//   baked light (one lookup a froxel or a pixel), times its level now. Henyey-Greenstein (g 0.2)
//   by the angle from each region's light.
// - Its place: as the rain's drops, at a uniform density over the water (as many per square metre
//   everywhere: Rain.distanceAt), over the rain's distances (range: the rain's nearest and
//   furthest; NEAREST and FURTHEST without one), over the world's width; its top a place of its
//   own, drawn apart from the foot (ends): its distance by the same law, across within
//   TOP_INSIDE of the view. Its main channel's size
//   (mainSize) is Rain.DISTANCE_SIZE / the focal length in px: 1 px wide at 40 m, 40 / d px at d.
// - Its timing: random waits (an exponential distribution, Lightning frequency seconds on
//   average), at most M.STRIKES_MOST at once (a strike due while that many play is not made), each playing for a random time between Lightning
//   playing time Min and Max (all of it Max when Min is not below it): its whole animation. A
//   strike due that would have ended by now (after a jump in time) is not made.
// - Its shapes made ahead: the next AHEAD strikes planned (their times, places, playing times,
//   seeds and flickers), each one's shape started then and made a slice at a time, in order, at
//   most SHAPE_BUDGET_MS of script a frame (URGENT_MS more while a planned strike due within
//   URGENT seconds is not made yet); a strike due before its shape is made has it
//   finished in that frame (counted in rushed). A new view starts the planned shapes again; a
//   playing strike is made again for it at once. A strike made by strike() (Debug's Strike now,
//   the tests) is made at once. A new plan (the start, a setting changed) plans its first strike
//   LEAD_IN past its first wait, so the first shapes are made before they are due.
// - Its pacing: for the first MEET of it the leaders grow towards each other (no light yet); at
//   MEET they meet, its light starts and its foot strikes the water; over the rest its light
//   (the main channel's, drawn and cast) falls by a constant factor in each equal time from its
//   peak to the camera's black at its end (fade: BLACK_RADIANCE x F, the radiance the tone map
//   shows as black, Bolt's radiance being the level over F), exactly 0 there, times a flicker
//   between full and half light, a whole number of periods (3 to 6). Its branches fall the same
//   way to the same black by BRANCHES_END of it.
// - Two budgets: the light it casts (on the fog, the air and the water: light, levelsAt)
//   FLASH_PEAK at Lightning flash brightness 50 (BRIGHTNESS_PEAK), in proportion to it; the bolt drawn (boltAt's
//   levels, Bolt's radiance) BOLT_PEAK at Lightning brightness 50, in proportion to it, each
//   faded to the camera's black from its own peak. The light cast's color: Lightning flash hue, from VIOLET at 75
//   through M.BOLT at 80 to white at 99, interpolated in linear light and at M.BOLT's luminance
//   (Rec. 709), so only Lightning flash brightness changes how much light it casts.
// - Each strike keeps its slot while it plays (its light, its channel and its baked shadows are
//   the slot's); a new one takes a free slot, or the oldest strike's.
// - Its bolt is drawn by Bolt (effects/bolt.ts), from its shape and boltLevelsAt: before the
//   meeting its leaders and their branches, by their generations as every line (at the
//   branches' light at the meeting, casting none); from the meeting the main channel (its light)
//   and the branches falling to the black by BRANCHES_END, with a flicker of their
//   own (3 to 6 periods).
// - Its shapes made in a worker when src/index.ts gives one (useWorker: BoltWorker's client): each
//   planned strike asks it for its shape (its ends here, its shape from shapeSeed, F and the
//   view), kept when it comes if the strike still waits for it in the same view, else given back;
//   a strike due before its shape came has it made here at once (rushed); a playing strike made
//   again for a new view is asked of the worker too, its old shape drawn till the new one comes;
//   Debug mode's Strike now takes a spare strike whose shape the worker made ahead for Strike
//   distance and the view (keepSpare); a dropped plan's shapes are cancelled in the worker (by
//   their generation). strike() (the tests, Strike now without a spare) is made here at once.
//   Without a worker, the shapes are made here a slice at a time.
// - A strike's end: when it ends (its slot freed or taken by a new one), is dropped (due while
//   too many play, past, a new plan, a reset) or made again for a new view, its shape is destroyed
//   (end: its buffers back to the shapes' pools; its making if not made yet), and nothing of it is
//   used after.
// - Its uniform block: the slots' light each frame a strike plays (and once more when the last
//   ends), and the loops' counts; each slot's emitter sent to its rows of emitterTexture once,
//   when its strike starts.
// - Its foot makes an impact of weight IMPACT on the water, at the meeting.
// - Debug mode's Strike now: each change of it (either way, Debug mode and Lightning on; not the
//   first value given) starts one strike in the next advance, made at once apart from the plan,
//   its foot Strike distance metres ahead, inside 0.8 of the view's half width across.
// Its GLSL: Lightning.GLSL (the slots' light, the loops' counts), Lightning.EMITTER_GLSL (the
// walk of a strike's emitter: the bakes only) and Lightning.SCATTER_GLSL (a strike's light
// scattered at a place: after Fog.MEDIUM_GLSL, for the fog's bake).
//
// - Lightning front bias (frontBias, 0 to 100): the foot's and the top's distance draws raised by
//   M.StrikeBias.biasedUnit (strikes nearer the front); each strike keeps the bias it was planned
//   with (Strike.bias), so a strike made again for a new view keeps its ends. A change reaches the
//   strikes planned after it: the AHEAD already planned keep their place.
//
// Changelog:
// 2026-11-07: the quality job "lightning" (QualityLightning): a slot whose light is under what the fog and the water can show is sent as 0.
// 2026-11-05: the floor (floorKind, Lightning.ends): with the water off a bolt's foot is at the bottom of the screen at its distance.
// 2026-11-05: Lightning brightness and flash brightness both from the reference 50 (was 95), FLASH_PEAK 5x; Lightning front bias
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/lightning.js).
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import type { EffectContext } from "../engine/effect";
import type { Camera } from "../engine/camera";
import type { FloorKind } from "../models/floor";
import type { UniformBlock } from "../engine/gl";
import type { AnyShape, Making } from "../models/boltshape";
import type { FlashData, FlashSource } from "../models/flash";
import type { ItemsOptions } from "../models/boltitems";
import type { BoltPool, BoltSpec, WorkerShape } from "../workers/boltworker";
import type { JobTask } from "../platform/jobtask";
import type { Mulberry } from "../engine/core";
import type { StrikePlanInput, StrikePlanOutput } from "../models/strikeplan";
import { QualityLightning } from "../models/quality/lightning";
import type { QualityJob, QualityShared } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";
import LIGHTNING_SOURCE from "../shaders/lightning/lightning.glsl";
import EMITTER_SOURCE from "../shaders/lightning/emitter.glsl";
import SCATTER_SOURCE from "../shaders/lightning/scatter.glsl";

const MOST = M.STRIKES_MOST;
// the peak level per Lightning brightness 50 (BRIGHTNESS_PEAK) of PEAK_SCALE's levels: the bolt's
// is what 5 / 95 of it gives, the light cast's 5 times what 50 / 95 of it gives
const PEAK_SCALE = 60;
const BOLT_PEAK = (PEAK_SCALE * 5) / 95;
const FLASH_PEAK = (PEAK_SCALE * 50 * 5) / 95;
// the most of the view's half width the top is placed in (at its own distance)
const TOP_INSIDE = 0.9;
// the emitter's regions (one baked shadow each, a component of a vec4) and its texture's rows a
// slot (Flash.TEXELS_ACROSS texels a row)
const GROUPS = M.Flash.REGIONS;
const EMITTER_ROWS = M.Flash.ROWS;
const IMPACT = 3;
// strikes are placed between these distances along the water without the rain's range
const NEAREST = 6;
const FURTHEST = 35;
// the radiance the tone map shows as black: half an 8-bit step in sRGB (0.5 / 255, 1.5e-4 in
// linear light) through the ACES fit (about 0.214 x near 0) at exposure 1
const BLACK_RADIANCE = 7e-4;
// the share of a strike before its leaders meet, and by which its branches have faded
const MEET = 0.25;
const BRANCHES_END = 0.5;
// the strikes planned ahead, and the most script time a frame their shapes take (ms)
const AHEAD = 10;
const SHAPE_BUDGET_MS = 2;
// a planned strike due within URGENT seconds without its shape: the budget URGENT_MS more
const URGENT = 1;
const URGENT_MS = 0.4;
// a new plan's first wait starts this long after it (s): the first planned shapes get their
// time to be made (a slice a frame, or in the worker) before the first is due; from a plan
// starting at once, a strike due within a few frames had its whole shape made in its frame
const LEAD_IN = 1.5;
// the Lightning brightness (the bolt's) and Lightning flash brightness (the light cast) that
// give BOLT_PEAK and FLASH_PEAK (the settings run 1 to 100: at 100 the bolt is 2x, the light cast 2x BRIGHTNESS_PEAK's)
const BRIGHTNESS_PEAK = 50;
// the flash's color at Lightning flash hue 75 (then rescaled to M.BOLT's luminance), at
// 80 (M.BOLT) and at 99 (white)
const VIOLET = [0.75, 0.55, 1.0];
const COLOR_LOW = 75;
const COLOR_MIDDLE = 80;
const COLOR_HIGH = 99;
// (each slot's light is a component of one vec4, and so is each group's shadow; the fog's
// strikes' light holds a slot a color channel, 3)
if (MOST > 3 || GROUPS > 4) {
  throw new Error("Lightning: at most 3 strikes (the fog's strikes' light: rgb) and 4 regions an emitter (a vec4)");
}
// the block's floats: its light (lInfo, lLight), the loops' counts (lCounts)
const HEADER = 12;

// a strike's shape: made here (a making's) or in the bolt's worker (from its flat form, with its
// flash and items made there)
export type StrikeShape = AnyShape & { flat?: Float64Array };

// a strike's top and foot (ends)
export interface StrikeEnds {
  top: number[];
  foot: number[];
}

// a strike (planOf): its start, playing time and seed, its shape (or its making), the view's
// version it was made for, its flickers, its foot's place, whether its leaders met; once its
// shape is made, its main channel's size F and its flash (from flashFrom); its ends; asked: the
// token of a shape asked of the worker; refit: the view a playing strike's new shape is asked
// for; distance: Debug's spare strike's Strike distance
export interface Strike {
  start: number;
  duration: number;
  seed: number;
  shape: StrikeShape | null;
  making: Making | null;
  version: number;
  periods: number;
  branchPeriods: number;
  x: number;
  z: number;
  met: boolean;
  asked?: object | null;
  F?: number;
  flash?: Float32Array<ArrayBuffer>;
  flashFrom?: StrikeShape | null;
  top?: number[];
  foot?: number[];
  refit?: { version: number } | null;
  distance?: number;
  // the Lightning front bias the strike was planned with: its ends are drawn with it again when it
  // is made again for a new view
  bias?: number;
  // the strike's number (planOf) and the flash last announced for it (onPlanned)
  uid?: number;
  plannedFor?: Float32Array | null;
}

// the tests' record of the last advance's work (ms and slices; the slowest slice's making)
interface FrameInfo {
  planMs: number;
  stepMs: number;
  slices: number;
  slowest: number;
  phase: string;
  placeMs: number;
  steps: number;
  sliceMs?: number;
  jag?: Making["jag"];
  boost?: Making["boost"];
  strike?: Strike | null;
  sliceIndex?: number;
}

// a strike's shape seen through the camera, started (src/index.ts: BoltShape.start with its F)
type StartShape = (top: number[], foot: number[], random: () => number, view: Camera) => Making;

export class Lightning extends M.Effect {
  static SCATTER_GLSL: string;
  static EMITTER_GLSL: string;
  // the readout's noun for its units
  static QUALITY_UNIT = "strikes";
  static GLSL: string;
  static EMITTER_ROWS: number;
  static GROUPS: number;
  static BRIGHTNESS_PEAK: number;
  static FLASH_PEAK: number;
  static BOLT_PEAK: number;
  static BRANCHES_END: number;
  static MEET: number;
  static FURTHEST: number;
  static BLACK_RADIANCE: number;
  static NEAREST: number;
  static SHAPE_BUDGET_MS: number;
  static AHEAD: number;
  static IMPACT: number;
  // (src/index.ts: the options the bolt's items are made with in the worker, Bolt's)
  itemsOptionsOf?: (s: Strike) => ItemsOptions | undefined;
  frameInfo!: FrameInfo | null;
  strikeAsked!: boolean;
  // the music drives the strikes (React to music, no idle animation): none at random, one on each peak the music asks (musicAsked: the next planned strike now)
  byMusic!: boolean;
  musicAsked!: boolean;
  strikeDistance!: number;
  noFlash!: boolean;
  strikeNowLast!: boolean | undefined;
  debug!: boolean;
  sent!: boolean;
  bolt!: Float32Array<ArrayBuffer>;
  levels!: Float32Array<ArrayBuffer>;
  spare!: Strike | null;
  generation!: number;
  fromWorker!: number;
  worker!: BoltPool | null;
  past!: number;
  skipped!: number;
  flashDue!: Uint8Array<ArrayBuffer>;
  rushed!: number;
  planned!: number;
  queue!: Strike[];
  random!: () => number;
  // the generator behind `random` (its state in the open: handed to the plan's worker with each request), the plan's task (src/index.ts gives it: workers/strikeplanworker.ts), the
  // request not answered yet (its id; 0: none) with the generation, the generator's state and the front bias it was asked for
  rng!: Mulberry;
  planTask: JobTask<StrikePlanInput, StrikePlanOutput> | null = null;
  planAsked = 0;
  planFor: { generation: number; rng: number; frontBias: number } | null = null;
  planInput: StrikePlanInput | null = null;
  wait!: () => number;
  slots!: (Strike | null)[];
  // the quality job: whether its dummy static array was sent, and the frame's parameters (the slots' light now), kept
  qualitySent!: boolean;
  qualityLevels!: { levels: Float32Array<ArrayBuffer> };
  color!: Float32Array<ArrayBuffer>;
  flashBrightness!: number;
  brightness!: number;
  frontBias!: number;
  // the floor the bolts' feet stand on (models/floor.ts): the water, or the bottom of the screen at their distance
  floorKind!: FloorKind;
  longest!: number;
  shortest!: number;
  frequency!: number;
  enabled!: boolean;
  emitterTexture: WebGLTexture;
  ubo: UniformBlock;
  seed: number;
  range: (() => number[]) | undefined;
  startShape: StartShape;
  onMeet: (x: number, z: number, weight: number) => void;
  onStart: (slot: number) => void;
  // onPlanned(strike): a planned strike's flash is known (its shape came from the worker), once for each flash: the fog bakes its shadows ahead from it
  onPlanned: ((s: Strike) => void) | null;
  uids: number;
  // onStart(slot): a strike started in a slot (or was made again for a new view); onMeet(x, z,
  // weight): its leaders met, its foot struck the water there; startShape(top, foot, random,
  // view): a strike's shape seen through the camera, started (BoltShape.start with its F:
  // step(budget) gives it once made)
  // range(): the nearest and the furthest distance strikes are placed at (the rain's)
  constructor(context: EffectContext, onStart: (slot: number) => void, onMeet: (x: number, z: number, weight: number) => void, startShape: StartShape, range?: () => number[]) {
    super(context);
    this.onStart = onStart;
    this.onPlanned = null;
    this.uids = 0;
    this.onMeet = onMeet;
    this.startShape = startShape;
    this.range = range;
    this.seed = context.seed + 1;
    this.initState();
    // (std140: whether any slot gives light, each slot's light, the loops' counts)
    this.ubo = this.block("Lightning", HEADER);
    // each slot's emitter (RGBA32F, its rows a slot), sent when its strike starts; bound on
    // M.UNITS.work by the bakes that read it (src/index.ts gives it to the fog and the water)
    const gl = this.gl;
    this.emitterTexture = this.createTexture();
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.emitterTexture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, M.Flash.TEXELS_ACROSS, EMITTER_ROWS * MOST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // its state but its GPU objects (with seed set): its settings' defaults, its slots, its plan
  initState() {
    this.qualitySent = false;
    this.enabled = true;
    this.frequency = 20;
    // each strike's playing time (s): Min and Max
    this.shortest = 0.25;
    this.longest = 0.5;
    this.brightness = BRIGHTNESS_PEAK;
    this.flashBrightness = BRIGHTNESS_PEAK;
    // Lightning front bias (0 to 100): strikes planned after a change are drawn nearer the front
    this.frontBias = 0;
    this.floorKind = "water";
    this.color = Lightning.colorOf(COLOR_MIDDLE);
    this.slots = new Array(MOST).fill(null);
    this.wait = () => -Math.log(1 - this.random()) * this.frequency;
    this.rng = new M.Mulberry(this.seed);
    this.random = () => this.rng.next();
    // the strikes planned, in order (time, place, playing time, seed, flickers, its shape's
    // making), the time of the last planned (-1: none yet), and the strikes whose shape was
    // finished in the frame they were due
    this.queue = [];
    this.planned = -1;
    this.rushed = 0;
    // the slots whose channel waits to be sent
    this.flashDue = new Uint8Array(MOST);
    // (strikes due but not made: that many playing, or over by then)
    this.skipped = 0;
    this.past = 0;
    // (the bolt's shapes' worker, if any, and the shapes that came from it)
    this.worker = this.worker || null;
    this.fromWorker = 0;
    // (the plan's generation, cancelled in the worker when the plan is dropped; Debug's Strike
    // now's spare strike, its shape made ahead in the worker)
    this.generation = 1;
    this.spare = null;
    // each slot's light now (levels), its bolt's growth and lights (bolt: grown, the main
    // channel's, the branches'), and whether the block holds any light
    this.levels = new Float32Array(MOST);
    this.bolt = new Float32Array(MOST * 3);
    this.sent = true;
    // Debug mode's Strike now: whether Debug mode is on, Strike now's last value (undefined:
    // none given yet), Strike distance (m), and a strike asked for the next advance
    this.debug = false;
    this.strikeNowLast = undefined;
    this.noFlash = false;
    this.strikeDistance = 20;
    this.strikeAsked = false;
    this.byMusic = false;
    this.musicAsked = false;
    // (the tests: the last advance's work, ms and slices)
    this.frameInfo = M.TEST ? { planMs: 0, stepMs: 0, slices: 0, slowest: 0, phase: "", placeMs: 0, steps: 0 } : null;
  }
  // Debug mode on or off (Strike now works only with it)
  setDebug(on: boolean) {
    this.debug = on;
  }

  // the music takes the strikes over (none at random), or gives them back: a new random wait
  setByMusic(on: boolean) {
    if (this.byMusic && !on) {
      this.musicAsked = false;
      this.replan();
    }
    this.byMusic = on;
  }

  static properties() {
    return {
      p120_setting_Lightning: (lightning: Lightning, v: boolean) => {
        lightning.enabled = v;
        lightning.strikeAsked = lightning.strikeAsked && v;
        lightning.replan();
      },
      // (a toggle, either way, asks for a strike now, with Debug mode and Lightning on; the
      // first value given only kept)
      p618_setting_DebugStrikeNow: (lightning: Lightning, v: boolean) => {
        if (lightning.strikeNowLast !== undefined && v !== lightning.strikeNowLast && lightning.debug && lightning.enabled) {
          lightning.strikeAsked = true;
        }
        lightning.strikeNowLast = v;
      },
      p619_setting_DebugStrikeDistance: (lightning: Lightning, v: number) => (lightning.strikeDistance = v),
      p126_setting_LightningFrequency: (lightning: Lightning, v: number) => {
        lightning.frequency = v;
        lightning.replan();
      },
      p121_setting_LightningPlayTimeMin: (lightning: Lightning, v: number) => (lightning.shortest = v / 1000),
      p122_setting_LightningPlayTimeMax: (lightning: Lightning, v: number) => (lightning.longest = v / 1000),
      p123_setting_LightningBrightness: (lightning: Lightning, v: number) => (lightning.brightness = v),
      p124_setting_LightningFlashBrightness: (lightning: Lightning, v: number) => (lightning.flashBrightness = v),
      p128_setting_LightningFrontBias: (lightning: Lightning, v: number) => (lightning.frontBias = v),
      p125_setting_LightningFlashHue: (lightning: Lightning, v: number) => (lightning.color = Lightning.colorOf(v)),
      // (Debug mode's No lightning flash: the light the strikes cast off, levelsAt 0; their bolts
      // drawn and their impacts made)
      p622_setting_DebugNoFlash: (lightning: Lightning, v: boolean) => (lightning.noFlash = v),
    };
  }

  // the flash's color at a Lightning flash hue (75 to 99), at M.BOLT's luminance
  static colorOf(intensity: number) {
    const white = [1, 1, 1];
    const mix = (a: number[], b: number[], f: number) => a.map((c: number, i: number) => c + (b[i] - c) * f);
    const v = Math.min(COLOR_HIGH, Math.max(COLOR_LOW, intensity));
    const c = v <= COLOR_MIDDLE
      ? mix(VIOLET, M.BOLT, (v - COLOR_LOW) / (COLOR_MIDDLE - COLOR_LOW))
      : mix(M.BOLT, white, (v - COLOR_MIDDLE) / (COLOR_HIGH - COLOR_MIDDLE));
    const luminance = (k: number[]) => 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
    const scale = luminance(M.BOLT) / luminance(c);
    return Float32Array.from(c, (k) => k * scale);
  }

  // a new strike's playing time (s)
  playTime() {
    return this.shortest < this.longest ? this.shortest + (this.longest - this.shortest) * this.random() : this.longest;
  }

  // a new plan (after a setting changed): the planned strikes dropped, a new wait from now
  replan() {
    this.dropPlan();
    this.planned = -1;
  }

  // the planned strikes dropped: their shapes destroyed, those asked of the worker cancelled
  dropPlan() {
    for (const s of this.queue) {
      Lightning.end(s);
    }
    this.queue.length = 0;
    if (this.worker && !this.worker.broken) {
      this.worker.cancel(this.generation);
    }
    this.generation++;
  }

  // a strike ended or dropped: its shape destroyed (its buffers back to the shapes' pools), or
  // its making if its shape is not made yet; nothing of it used after
  static end(s: Strike) {
    if (s.shape && s.shape.destroy) {
      s.shape.destroy();
    } else if (s.making && s.making.destroy) {
      s.making.destroy();
    }
    s.shape = null;
    s.making = null;
    // (a shape asked of the worker and not come yet: given back when it comes)
    s.asked = null;
  }

  // a strike's shape's own random numbers, apart from its ends' (its seed's): a worker makes
  // the shape from this seed, its ends and the view alone
  static shapeSeed(seed: number) {
    return (seed + 0x9e3779b9) >>> 0;
  }

  // the bolt's shapes made in a worker from now (BoltWorker's client; null: on the main thread):
  // a planned strike asks it for its shape, made here at once only if due before it comes
  useWorker(client: BoltPool | null) {
    this.worker = client || null;
    if (this.spare) {
      Lightning.end(this.spare);
      this.spare = null;
    }
    for (const s of this.queue) {
      if (!s.shape) {
        Lightning.end(s);
        this.begin(s);
      }
    }
  }

  // a strike's shape asked of the worker (its generation, and when it is wanted: soonest made
  // first): done(shape) when it comes if wanted() still says so, else given back; null when
  // cancelled; fallback() when the worker failed
  request(s: Strike, ends: StrikeEnds, generation: number, at: number, wanted: () => boolean, done: (shape: WorkerShape) => void, fallback: () => void) {
    const view = this.camera;
    const token = {};
    s.asked = token;
    const spec: BoltSpec = {
      seed: Lightning.shapeSeed(s.seed), top: ends.top, foot: ends.foot, F: Lightning.mainSize(view),
      view: { width: view.width, height: view.height, eyeHeight: view.eyeHeight, fieldOfView: view.fieldOfView, pitch: view.pitch },
      // (the bolt's items built in the worker with the shape, for this view: src/index.ts gives
      // the options, Bolt's)
      items: this.itemsOptionsOf ? this.itemsOptionsOf(s) : undefined,
    };
    this.worker!.make(spec, { generation, at }).then(
      (shape: WorkerShape | null) => {
        if (!shape) {
          if (s.asked === token) {
            s.asked = null;
          }
          return;
        }
        if (s.asked !== token || !wanted()) {
          shape.destroy!();
          return;
        }
        s.asked = null;
        this.fromWorker++;
        done(shape);
      },
      () => {
        if (s.asked === token) {
          s.asked = null;
          fallback();
        }
      }
    );
  }

  // a shape from the worker given to its strike, its flash worked out there with it
  static take(s: Strike, shape: StrikeShape) {
    s.shape = shape;
    if (shape.flash) {
      s.flash = shape.flash as Float32Array<ArrayBuffer>;
      s.flashFrom = shape;
    }
  }

  // a planned strike's shape asked of the worker: kept when it comes, if the strike still waits
  // for it in the same view; else given back; the worker failed, made here a slice at a time
  ask(s: Strike, ends: StrikeEnds) {
    const version = this.camera.baseVersion;
    this.request(s, ends, this.generation, s.start, () => !s.shape && s.version === version && this.camera.baseVersion === version, (shape: WorkerShape) => Lightning.take(s, shape), () => {
      s.making = this.startShape(ends.top, ends.foot, M.seededRandom(Lightning.shapeSeed(s.seed)), this.camera);
    });
  }

  // a playing strike's shape for the new view asked of the worker (its old one drawn meanwhile):
  // a new object in its slot when it comes (what was made from it is made again), if the
  // strike still plays there in that view; the worker failed, made here at once
  refit(s: Strike) {
    const version = this.camera.baseVersion;
    const again: Strike = Object.assign({}, s, { shape: null, making: null, asked: null, refit: null, flashFrom: null, version });
    const ends = Lightning.ends(again.x, again.z, this.camera, M.seededRandom(again.seed), this.range ? this.range() : null, again.bias, this.floorKind);
    again.top = ends.top;
    again.foot = ends.foot;
    s.refit = { version };
    const swap = () => {
      const k = this.slots.indexOf(s);
      again.met = s.met;
      again.F = again.shape!.F;
      if (again.flashFrom !== again.shape) {
        again.flash = Lightning.flashOf(again.shape!).floats;
        again.flashFrom = again.shape;
      }
      Lightning.end(s);
      this.slots[k] = again;
      this.flashDue[k] = 1;
      this.onStart(k);
    };
    this.request(again, ends, 0, s.start, () => this.slots.indexOf(s) >= 0 && this.camera.baseVersion === version, (shape: WorkerShape) => {
      Lightning.take(again, shape);
      swap();
    }, () => {
      if (this.slots.indexOf(s) >= 0) {
        this.fit(again);
        swap();
      }
    });
  }

  // Debug mode's spare strike: its place (Strike distance ahead, inside the view across), seed
  // and flickers drawn, its shape made ahead in the worker; made again when Strike distance or
  // the view changes, so Strike now starts it in the next frame
  keepSpare() {
    const d = this.strikeDistance;
    const version = this.camera.baseVersion;
    if (this.spare && (this.spare.distance !== d || this.spare.version !== version)) {
      Lightning.end(this.spare);
      this.spare = null;
    }
    if (this.spare) {
      return;
    }
    const view = this.camera;
    const along = -view.eyeHeight * Math.sin(view.pitch) + d * Math.cos(view.pitch);
    const half = 0.8 * (view.width / view.height) * Math.tan(view.halfFov()) * along;
    this.settlePlan();
    const s = this.planOf((this.random() * 2 - 1) * half, -d, 0);
    const ends = Lightning.ends(s.x, s.z, view, M.seededRandom(s.seed), this.range ? this.range() : null, s.bias, this.floorKind);
    s.distance = d;
    s.version = version;
    s.top = ends.top;
    s.foot = ends.foot;
    this.spare = s;
    this.request(s, ends, 0, Infinity, () => this.spare === s && this.camera.baseVersion === version, (shape: WorkerShape) => Lightning.take(s, shape), () => {});
  }

  // the floor the feet stand on, from now: the strikes are fitted again to the new floor with the view (src/index.ts
  // makes the camera's view a new version when it changes)
  setFloor(kind: FloorKind) {
    this.floorKind = kind;
  }

  // a strike's top and foot, for a foot at x, z on the water: the top a place of its own, drawn
  // apart from the foot: its distance as a strike's foot's (as many per square metre:
  // Rain.distanceAt over range, [nearest, furthest], else NEAREST to FURTHEST), across anywhere
  // within TOP_INSIDE of the view's half width at that distance, at the top of the view there
  // (the bolt fitted from the water at the foot's distance to the top of the screen at the
  // top's); the distance's draw biased toward the front by bias (Lightning front bias, 0 to 100:
  // StrikeBias.biasedUnit, the draw unchanged at 0)
  static ends(x: number, z: number, view: Camera, random: () => number, range: number[] | null, bias = 0, floor: FloorKind = "water"): StrikeEnds {
    const distance = M.Rain.distanceAt(M.StrikeBias.biasedUnit(random(), bias), range ? range[0] : NEAREST, range ? range[1] : FURTHEST);
    const across = random() * 2 - 1;
    const tz = -distance;
    const ty = view.topAt(distance);
    const along = (ty - view.eyeHeight) * Math.sin(view.pitch) - tz * Math.cos(view.pitch);
    const half = TOP_INSIDE * (view.width / view.height) * Math.tan(view.halfFov()) * along;
    return { top: [across * half, ty, tz], foot: [x, M.Floor.heightAt(floor, -z, view.eyeHeight, view.halfFov(), view.pitch), z] };
  }

  // a strike's shape for the camera's view now, from its own random numbers (the same strike
  // made again for another view)
  fit(s: Strike) {
    this.begin(s, true);
    s.shape = s.making!.step(Infinity);
    s.F = s.shape!.F;
    s.flash = Lightning.flashOf(s.shape!).floats;
    s.flashFrom = s.shape;
    s.making = null;
  }

  // a strike's shape started for the camera's view now, from its own random numbers (its ends'
  // from its seed, its shape's from shapeSeed): asked of the worker when there is one (not when
  // it is wanted at once), else made here a slice at a time
  begin(s: Strike, atOnce = false) {
    const ends = Lightning.ends(s.x, s.z, this.camera, M.seededRandom(s.seed), this.range ? this.range() : null, s.bias, this.floorKind);
    s.shape = null;
    s.making = null;
    s.version = this.camera.baseVersion;
    s.top = ends.top;
    s.foot = ends.foot;
    if (this.worker && !this.worker.broken && !atOnce) {
      this.ask(s, ends);
    } else {
      s.making = this.startShape(ends.top, ends.foot, M.seededRandom(Lightning.shapeSeed(s.seed)), this.camera);
    }
  }

  // a strike at x, z, at a time: its playing time, seed and flickers drawn
  planOf(x: number, z: number, time: number): Strike {
    this.settlePlan();
    return {
      start: time,
      duration: this.playTime(),
      seed: Math.floor(this.random() * 4294967296),
      shape: null,
      making: null,
      version: -1,
      periods: 3 + Math.floor(this.random() * 4),
      branchPeriods: 3 + Math.floor(this.random() * 4),
      x,
      z,
      met: false,
      bias: this.frontBias,
      uid: ++this.uids,
    };
  }

  // the next strikes planned, AHEAD of them, each one's shape started (one that would be over
  // by now, after a jump in time, not made)
  plan(time: number) {
    if (this.planned < 0) {
      this.planned = time + LEAD_IN;
    }
    if (this.planTask) {
      this.planByTask(time);
      return;
    }
    const longest = Math.max(this.shortest, this.longest);
    while (this.queue.length < AHEAD) {
      this.planned += this.wait();
      // (as many per square metre: the distance's density grows with it)
      const range = this.range ? this.range() : null;
      const distance = M.Rain.distanceAt(M.StrikeBias.biasedUnit(this.random(), this.frontBias), range ? range[0] : NEAREST, range ? range[1] : FURTHEST);
      const s = this.planOf((this.random() * 2 - 1) * distance * M.Camera.SPAN, -distance, this.planned);
      if (s.start + longest < time) {
        this.past++;
        continue;
      }
      this.begin(s);
      this.queue.push(s);
    }
  }

  // the plan by its task (models/strikeplan.ts): the strikes still wanted asked for (the answer is there at once when the task is inline, later with a worker), the strikes of an
  // answer taken in; an answer for a plan since dropped (a new generation), or made from a generator that others drew from since, is dropped and asked for again
  planByTask(time: number) {
    const task = this.planTask!;
    this.takePlan();
    if (this.planAsked === 0 && this.queue.length < AHEAD) {
      const range = this.range ? this.range() : null;
      this.planFor = { generation: this.generation, rng: this.rng.a, frontBias: this.frontBias };
      this.planInput = {
        rng: this.rng.a,
        planned: this.planned,
        time,
        count: AHEAD - this.queue.length,
        frequency: this.frequency,
        shortest: this.shortest,
        longest: this.longest,
        frontBias: this.frontBias,
        range,
        nearest: NEAREST,
        furthest: FURTHEST,
        span: M.Camera.SPAN,
      };
      this.planAsked = task.request(this.planInput);
      this.takePlan();
    }
  }

  // a plan asked of the worker and not answered, made here now: the draws of the generator must come in the order they always did (the plan's before any strike made outside it:
  // a strike on demand, the spare), and the function is pure, so its output is the one the worker will give (that answer, when it comes, is dropped)
  settlePlan() {
    if (this.planTask && this.planAsked !== 0 && this.planInput && this.planFor) {
      const asked = this.planFor;
      const input = this.planInput;
      this.planAsked = 0;
      this.planFor = null;
      this.planInput = null;
      if (asked.generation === this.generation && asked.rng === this.rng.a) {
        this.applyPlan(M.StrikePlan.plan(input), asked.frontBias);
      }
    }
  }

  // the strikes of a plan taken in: the generator, the time of the last planned and the count past as they are after it, each strike's shape started, the strikes queued
  applyPlan(out: StrikePlanOutput, frontBias: number) {
    this.rng.a = out.rng;
    this.planned = out.planned;
    this.past += out.past;
    for (const p of out.strikes) {
      const s: Strike = {
        start: p.start,
        duration: p.duration,
        seed: p.seed,
        shape: null,
        making: null,
        version: -1,
        periods: p.periods,
        branchPeriods: p.branchPeriods,
        x: p.x,
        z: p.z,
        met: false,
        bias: frontBias,
        uid: ++this.uids,
      };
      this.begin(s);
      this.queue.push(s);
    }
  }

  takePlan() {
    const task = this.planTask!;
    const answer = task.take();
    if (answer && answer.id === this.planAsked && this.planFor) {
      const asked = this.planFor;
      this.planAsked = 0;
      this.planFor = null;
      this.planInput = null;
      if (asked.generation === this.generation && asked.rng === this.rng.a) {
        this.applyPlan(answer.output, asked.frontBias);
      }
    } else if (this.planAsked !== 0 && !answer && task.pending().indexOf(this.planAsked) < 0) {
      // (the worker lost with the request in flight: asked again)
      this.planAsked = 0;
      this.planFor = null;
      this.planInput = null;
    }
  }

  // a strike whose channel reaches the water at x, z, starting at a time, made at once
  strike(x: number, z: number, time: number) {
    const s = this.planOf(x, z, time);
    this.fit(s);
    return this.place(s);
  }

  // a strike made, in a free slot or the oldest strike's (its foot strikes the water at its
  // meeting, in advance)
  place(s: Strike) {
    s.F = s.shape!.F;
    if (s.flashFrom !== s.shape) {
      s.flash = Lightning.flashOf(s.shape!).floats;
      s.flashFrom = s.shape;
    }
    s.making = null;
    let slot = this.slots.indexOf(null);
    if (slot < 0) {
      slot = 0;
      for (let i = 1; i < MOST; i++) {
        if (this.slots[i]!.start < this.slots[slot]!.start) {
          slot = i;
        }
      }
    }
    if (this.slots[slot]) {
      Lightning.end(this.slots[slot]!);
    }
    this.slots[slot] = s;
    this.flashDue[slot] = 1;
    this.onStart(slot);
    return s;
  }

  // a shape's flash, its merged emitter: M.Flash.of (models/flash.ts, which a worker loads too)
  static flashOf(shape: FlashSource): FlashData {
    return M.Flash.of(shape);
  }

  // the fade over u (0 to 1): down from 1 by a constant factor in each equal time to black (a
  // share of the peak) at its end, exactly 0 there
  static fade(u: number, black: number) {
    return u < 1 ? Math.pow(Math.min(1, black), u) : 0;
  }

  // the main channel's size (m) for a view: DISTANCE_SIZE / the focal length (1 px at 40 m)
  static mainSize(view: { focal: () => number; }) {
    return M.Rain.DISTANCE_SIZE / view.focal();
  }

  // a strike's black as a share of a peak level: BLACK_RADIANCE x its main channel's size (F,
  // kept on the strike when its shape is made)
  static blackOf(s: Strike, peak: number) {
    const F = s.F !== undefined ? s.F : s.shape ? s.shape.F : 0;
    return peak > 0 ? (BLACK_RADIANCE * F) / peak : 1;
  }

  static flicker(s: number, periods: number) {
    return 0.75 + 0.25 * Math.cos(2 * Math.PI * periods * s);
  }

  // a strike's main channel at a time from a peak: none before its meeting, then its fade and
  // flicker (u from 0 at the meeting to 1 at its end)
  static channelAt(s: Strike, time: number, full: number) {
    const at = (time - s.start) / s.duration;
    if (at < MEET || at > 1) {
      return 0;
    }
    const u = (at - MEET) / (1 - MEET);
    return full * Lightning.fade(u, Lightning.blackOf(s, full)) * Lightning.flicker(u, s.periods);
  }

  // a strike's light cast at a time (Lightning flash brightness)
  light(s: Strike, time: number) {
    return Lightning.channelAt(s, time, (FLASH_PEAK * this.flashBrightness) / BRIGHTNESS_PEAK);
  }

  // a strike's bolt at a time (Lightning brightness): its growth (0 at its start, 1 at its
  // leaders' meeting), the main channel's light (from the meeting), the leaders' and branches'
  // (before the meeting: full; then falling to the black at BRANCHES_END, with their own
  // flicker); none outside it
  boltAt(s: Strike, time: number, into: Float32Array<ArrayBuffer>, o: number) {
    const at = (time - s.start) / s.duration;
    const full = (BOLT_PEAK * this.brightness) / BRIGHTNESS_PEAK;
    if (at < 0 || at > 1) {
      into[o] = into[o + 1] = into[o + 2] = 0;
    } else if (at < MEET) {
      into[o] = at / MEET;
      into[o + 1] = 0;
      into[o + 2] = full;
    } else {
      const u = (at - MEET) / (BRANCHES_END - MEET);
      into[o] = 1;
      into[o + 1] = Lightning.channelAt(s, time, full);
      into[o + 2] = full * Lightning.fade(u, Lightning.blackOf(s, full)) * Lightning.flicker(u, s.branchPeriods);
    }
  }

  // each slot's bolt at a time (boltAt, 3 values a slot), into bolt
  boltLevelsAt(time: number) {
    for (let k = 0; k < MOST; k++) {
      const s = this.slots[k];
      if (s) {
        this.boltAt(s, time, this.bolt, k * 3);
      } else {
        this.bolt[k * 3] = this.bolt[k * 3 + 1] = this.bolt[k * 3 + 2] = 0;
      }
    }
    return this.bolt;
  }

  // each slot's light at a time (0: none), into levels
  levelsAt(time: number) {
    const off = this.debug && this.noFlash;
    for (let k = 0; k < MOST; k++) {
      const s = this.slots[k];
      const light = s && !off ? this.light(s, time) : 0;
      // (a light under what the fog and the water can show: not sent, QualityLightning)
      this.levels[k] = QualityLightning.visible(light) ? light : 0;
    }
    return this.levels;
  }

  // ---- the quality job (models/quality/lightning.ts): the slots, hidden while their light is under what can show ----
  qualityKind(): string {
    return "lightning";
  }

  // one dummy array, given once, so the pool keeps the job's kind
  qualityStatics(): QualityStatics | null {
    if (this.qualitySent) {
      return null;
    }
    this.qualitySent = true;
    return { none: new Float32Array(1) };
  }

  // the slots' light at the frame's time (levelsAt's, culled)
  qualityParams(shared: QualityShared): QualityParams {
    let p = this.qualityLevels;
    if (!p) {
      p = this.qualityLevels = { levels: new Float32Array(MOST) };
    }
    p.levels.set(this.levelsAt(shared.time));
    return p as unknown as QualityParams;
  }

  // the slots as one task: 3 units stay on the render thread
  qualityJobs(): QualityJob[] {
    return this.qualityIndex >= 0 ? [{ effect: this.qualityIndex, units: MOST, minChunk: MOST }] : [];
  }

  // the strikes whose leaders meet strike the water, the strikes that ended go, and new ones come
  // when their time has come; a playing strike made for another view is made again for this one
  // (a new object in its slot, so what was made from it is made again; its channel sent, its
  // shadows baked again)
  advance(time: number) {
    let playing = 0;
    for (let i = 0; i < MOST; i++) {
      if (this.slots[i] && this.slots[i]!.version !== this.camera.baseVersion && time <= this.slots[i]!.start + this.slots[i]!.duration) {
        if (this.worker && !this.worker.broken) {
          // (asked of the worker once for this view, the old shape drawn till it comes)
          if (!this.slots[i]!.refit || this.slots[i]!.refit!.version !== this.camera.baseVersion) {
            this.refit(this.slots[i]!);
          }
        } else {
          const again = Object.assign({}, this.slots[i]);
          this.fit(again);
          Lightning.end(this.slots[i]!);
          this.slots[i] = again;
          this.flashDue[i] = 1;
          this.onStart(i);
        }
      }
      const s = this.slots[i];
      if (s && !s.met && time >= s.start + MEET * s.duration) {
        s.met = true;
        this.onMeet(s.x, s.z, IMPACT);
      }
      if (s && time > s.start + s.duration) {
        Lightning.end(s);
        this.slots[i] = null;
      } else if (s) {
        playing++;
      }
    }
    if (!this.enabled) {
      return;
    }
    const info = this.frameInfo;
    const t0 = info ? performance.now() : 0;
    if (info) {
      info.steps = info.slices = info.slowest = info.sliceMs = 0;
      info.phase = "";
      info.jag = null;
      info.strike = null;
      info.sliceIndex = 0;
    }
    this.plan(time);
    const queue = this.queue;
    // (the planned shapes, in order, a slice at a time within the budget; started again for a
    // new view)
    // (the first step of a frame always, a next one only if its slowest slice lately fits)
    const started = performance.now();
    let stepped = false;
    // (a planned strike due within URGENT seconds and not made yet: the margin of the budget too)
    const budget = queue.length && !queue[0].shape && queue[0].start - time < URGENT ? SHAPE_BUDGET_MS + URGENT_MS : SHAPE_BUDGET_MS;
    for (let k = 0; k < queue.length; k++) {
      const s = queue[k];
      if (s.version !== this.camera.baseVersion) {
        Lightning.end(s);
        this.begin(s);
      }
      const left = budget - (performance.now() - started);
      if (!s.shape && s.making && left > 0 && (!stepped || left > (s.making.slow || 0))) {
        s.shape = s.making.step(left);
        stepped = true;
        if (info) {
          info.steps++;
          info.slices += s.making.slices;
          info.sliceMs = (info.sliceMs || 0) + (s.making.sliceMs || 0);
          if (s.making.slowest > info.slowest) {
            info.slowest = s.making.slowest;
            info.phase = s.making.phase;
            info.jag = s.making.phase === "jag" ? s.making.jag : null;
            info.boost = s.making.boost;
            info.strike = s;
            info.sliceIndex = s.making.slowestIndex;
          }
        }
      }
    }
    if (this.onPlanned) {
      for (let k = 0; k < queue.length; k++) {
        const s = queue[k];
        if (s.shape && s.flash && s.flashFrom === s.shape && s.plannedFor !== s.flash && s.version === this.camera.baseVersion) {
          s.plannedFor = s.flash;
          this.onPlanned(s);
        }
      }
    }
    const t1 = info ? performance.now() : 0;
    // (the strikes due: made, their shapes finished now if not yet made)
    const longest = Math.max(this.shortest, this.longest);
    while (!this.byMusic && queue.length && time >= queue[0].start) {
      const s = queue.shift()!;
      if (s.start + longest < time) {
        this.past++;
        Lightning.end(s);
      } else if (playing < MOST) {
        if (!s.shape) {
          // (due before its shape came from the worker, or was made here: made now)
          if (!s.making) {
            s.asked = null;
            s.making = this.startShape(s.top!, s.foot!, M.seededRandom(Lightning.shapeSeed(s.seed)), this.camera);
          }
          s.shape = s.making.step(Infinity);
          this.rushed++;
        }
        this.place(s);
        playing++;
      } else {
        this.skipped++;
        Lightning.end(s);
      }
    }
    // (a peak of the music: the next planned strike, its shape made now if it is not yet, starts now)
    if (this.musicAsked) {
      this.musicAsked = false;
      if (this.enabled && this.byMusic && queue.length && playing < MOST) {
        const s = queue.shift()!;
        if (s.version !== this.camera.baseVersion) {
          Lightning.end(s);
          this.begin(s);
        }
        if (!s.shape) {
          if (!s.making) {
            s.asked = null;
            s.making = this.startShape(s.top!, s.foot!, M.seededRandom(Lightning.shapeSeed(s.seed)), this.camera);
          }
          s.shape = s.making.step(Infinity);
          this.rushed++;
        }
        s.start = time;
        this.place(s);
      }
    }
    // (Debug mode's Strike now: one strike at Strike distance ahead, inside the view across,
    // made at once, apart from the plan)
    // (with a worker: the spare strike's shape made ahead for Strike distance and the view)
    if (this.debug && this.worker && !this.worker.broken) {
      this.keepSpare();
    }
    if (this.strikeAsked) {
      this.strikeAsked = false;
      if (this.spare && this.spare.shape && this.spare.distance === this.strikeDistance && this.spare.version === this.camera.baseVersion) {
        const s = this.spare;
        this.spare = null;
        s.start = time;
        this.place(s);
      } else {
        const view = this.camera;
        const d = this.strikeDistance;
        const along = -view.eyeHeight * Math.sin(view.pitch) + d * Math.cos(view.pitch);
        const half = 0.8 * (view.width / view.height) * Math.tan(view.halfFov()) * along;
        this.settlePlan();
        this.strike((this.random() * 2 - 1) * half, -d, time);
      }
    }
    const t2 = info ? performance.now() : 0;
    this.plan(time);
    if (info) {
      const t3 = performance.now();
      info.stepMs = t1 - t0;
      info.placeMs = t2 - t1;
      info.planMs = t3 - t2;
    }
  }

  // the uniform block: the slots' light each frame a slot plays (and once more when the last one
  // ends); a new strike's emitter sent to its rows of emitterTexture once
  update(time: number) {
    const gl = this.gl;
    const d = this.ubo.data;
    let playing = false;
    let due = false;
    for (let k = 0; k < MOST; k++) {
      playing = playing || !!this.slots[k];
      due = due || (!!this.slots[k] && this.flashDue[k] === 1);
    }
    if (!playing && !this.sent && !due) {
      return;
    }
    if (due) {
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
      gl.bindTexture(gl.TEXTURE_2D, this.emitterTexture);
      for (let k = 0; k < MOST; k++) {
        const s = this.slots[k];
        if (s && this.flashDue[k]) {
          this.flashDue[k] = 0;
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, k * EMITTER_ROWS, M.Flash.TEXELS_ACROSS, EMITTER_ROWS, gl.RGBA, gl.FLOAT, s.flash!);
        }
      }
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo.buffer);
    this.sent = playing;
    let any = false;
    // (Debug mode's No lightning flash: no light cast)
    const off = this.debug && this.noFlash;
    for (let k = 0; k < 4; k++) {
      const s = k < MOST && !off ? this.slots[k] : null;
      const light = s ? this.light(s, time) : 0;
      const level = QualityLightning.visible(light) ? light : 0;
      d[4 + k] = level;
      any = any || level > 0;
    }
    d[0] = any ? MOST : 0;
    d[1] = d[2] = d[3] = 0;
    // (the loops' counts, given at run time: a loop of a constant count is unrolled by Direct3D's
    // compiler through ANGLE, nested ones into seconds of compiling; the regions, the most nodes
    // a region's walk visits, its shadow points a region, the rays a slice of the strikes' light
    // is gathered along)
    d[8] = GROUPS;
    d[9] = M.Flash.VISITS_MOST / M.Flash.REGIONS;
    d[10] = M.Flash.SHADOW_POINTS;
    d[11] = 2;
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, d, 0, HEADER);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  }

  reset() {
    for (const s of this.slots) {
      if (s) {
        Lightning.end(s);
      }
    }
    if (this.spare) {
      Lightning.end(this.spare);
      this.spare = null;
    }
    this.dropPlan();
    this.slots.fill(null);
    this.planned = -1;
    this.rushed = 0;
    this.rng = new M.Mulberry(this.seed);
    this.random = () => this.rng.next();
    this.sent = true;
    this.flashDue.fill(0);
    this.skipped = 0;
    this.past = 0;
  }

  // its strikes' shapes given back to the shapes' pools, then its GPU objects deleted
  destroy() {
    for (const s of this.slots || []) {
      if (s) {
        Lightning.end(s);
      }
    }
    for (const s of this.queue || []) {
      Lightning.end(s);
    }
    if (this.spare) {
      Lightning.end(this.spare);
      this.spare = null;
    }
    super.destroy();
  }
}

if (M.TEST) {
  // (the tests: the strikes playing)
  Object.defineProperty(Lightning.prototype, "strikes", {
    get(this: Lightning) {
      return this.slots.filter(Boolean);
    },
  });
}

Lightning.IMPACT = IMPACT;
Lightning.AHEAD = AHEAD;
Lightning.SHAPE_BUDGET_MS = SHAPE_BUDGET_MS;
Lightning.NEAREST = NEAREST;
Lightning.BLACK_RADIANCE = BLACK_RADIANCE;
Lightning.FURTHEST = FURTHEST;
Lightning.MEET = MEET;
Lightning.BRANCHES_END = BRANCHES_END;
Lightning.BOLT_PEAK = BOLT_PEAK;
Lightning.FLASH_PEAK = FLASH_PEAK;
Lightning.BRIGHTNESS_PEAK = BRIGHTNESS_PEAK;
Lightning.GROUPS = GROUPS;
Lightning.EMITTER_ROWS = EMITTER_ROWS;

// the strikes' slots: their light, and the loops' counts (after Fog.GLSL: BOLT, their color)
Lightning.GLSL = fill(LIGHTNING_SOURCE, { "GROUPS": GROUPS, "MOST": MOST });

// a strike's emitter walked from a place (the bakes only; after Lightning.GLSL): uEmitter its
// texture (Flash's layout, EMITTER_ROWS rows a slot); the same walk as Flash.lightAt
Lightning.EMITTER_GLSL = fill(EMITTER_SOURCE, { "M.Flash.TEXELS_ACROSS": M.Flash.TEXELS_ACROSS, "EMITTER_ROWS": EMITTER_ROWS, "M.Flash.REGIONS": M.Flash.REGIONS, "M.Flash.NODE_TEXELS": M.Flash.NODE_TEXELS, "M.Flash.NODE_BASE": M.Flash.NODE_BASE, "M.Flash.SHADOW_POINTS": M.Flash.SHADOW_POINTS, "M.Flash.VISITS_MOST / M.Flash.REGIONS": M.Flash.VISITS_MOST / M.Flash.REGIONS, "M.Flash.STACK": M.Flash.STACK, "M.Flash.THETA.toFixed(4)": M.Flash.THETA.toFixed(4), "M.Flash.NEAREST.toFixed(4)": M.Flash.NEAREST.toFixed(4) });

// a strike's light scattered towards the eye at p (seen along view), per unit of its light and
// of the medium's extinction there: each region's light through the clouds between (towards its
// nearest point: the baked shadow, or marched with 3 places), scattered by the angle from its
// light (needs Fog.SHADE_GLSL: through, phaseHG, strikeShadeAt, AIR; Lightning.EMITTER_GLSL)
Lightning.SCATTER_GLSL = SCATTER_SOURCE;

M.Lightning = Lightning;
