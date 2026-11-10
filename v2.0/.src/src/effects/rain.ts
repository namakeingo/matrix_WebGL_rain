// The rain: drops of characters at a uniform density in the world, falling in vertical lines.
// - The world, not the view, lays them out: a pool of COUNT drops between the nearest and the
//   furthest distance along the water (DISTANCE_SIZE m over Font size Max and over Font size Min:
//   16 and 1 give 2.5 and 40 m), over the world's width (Camera.SPAN, x / distance), as many per
//   square metre everywhere (so more of them further away, where the width is greater), each
//   falling from the world's ceiling at its distance (Camera.ceilingAt) to the water. Plane height
//   changes only what the camera sees of them.
// - How many fall (the target): matrix_web_rain's, the drops in view, RAIN_SCALE x Density x the
//   window's width in pixels x the average of 1 / font size over the sizes (its rainCount); the
//   pool's drops falling are that over the share of the world's width the view takes.
// - From a clean screen (the start, a change of the font sizes or of Trail length) each drop
//   wanted shows from the first time its head comes down past the top of the view: its fall now
//   if its head is above the view, else its next. Each drop's falls come at even times from a
//   random phase, so the heads coming into the view are the settled rain's from the first second,
//   at every distance (matrix_web_rain's fill at the settled rate, exactly), and the screen fills
//   gradually; no drop appears inside the view. More drops wanted (Density, a wider window) come
//   in the same way; fewer: the ones over finish their fall (or end at once if their head is not
//   in view yet) and their trails fade where they landed. Debug mode's Steady start (and any
//   jump in time: a reset, the tests') starts them as the settled rain, all of them at once.
// - A drop's life: the falls it shows (from its first, to before its last; and from a restart),
//   unsigned integers in a texture beside its layout, so the GPU draws only what lives.
// - A drop falls in a line of cells 3 cm high, a row a step (the step clock's steps, set by Speed:
//   STEP_RATE a second at its default; times its speed of 9 to 16 sixteenths of a cell: never
//   more than a row, so it never skips the row where it lands); then it starts again at a new
//   place across (new for every fall).
// - Its characters stay where it drew them and fade there, linearly over its trail's cells (Trail
//   length x TRAIL_PER_LENGTH): the trail of its last fall stays where it landed while it fades.
//   A change of the trail's cells lays the drops out again (their falls' rows are its ceiling's
//   and the trail's).
// - Its fall is worked out from the step alone, in 32-bit integers, the same in the script and on
//   the GPU (the rows fallen as (step / 16) x speed + (step % 16) x speed / 16, so they wrap only
//   after 2^32 rows: about 70 days at Speed 99, years at the default) (one instanced quad a character, its drop and its age from gl_InstanceID and the
//   chunk's first drop, its drop's data from a float texture of DROPS_ACROSS columns, read with
//   texelFetch).
// - Its landings (where its splashes and its ring start): each drop's next landing step worked
//   out exactly, kept in a wheel of steps (a ring of slots, each a list of drops linked through a
//   typed array: no allocation), so a step costs only its landings. Every step a frame moves makes
//   its landings (at Speed 99, about 38 a frame of 1/24 s); a jump past what a frame can move (a
//   reset, the tests') makes none and fills the wheel again from there. Each lands with an impact
//   of weight IMPACT.
// - Its colour (Custom colors 1 to 4, or the rainbow; still, or as a wave): matrix_web_rain's, by
//   where it is across the world instead of a column of the screen: its bearing x / z from the
//   eye's resting place (a world place, not the camera's: Plane height and a moving camera do not
//   move it), in widths of a 16:9 view (WAVE_SCREEN, matrix_web_rain's screen width), the wave's
//   phase that of the time its fall began (each fall keeps its colour: an emitter's), the wave
//   moving Wave speed / Wave width a second; Custom colors in matrix_web_rain's gradient (A to
//   A + B, then to B) of the colours as linear light (M.color), the rainbow hsl(hue, 100%, 50%)
//   as sRGB, made linear. The wave's phase when a fall began is the phase now less the steps since
//   (from the rows it has fallen in it: small numbers, exact for weeks), the phase now sent each
//   frame as its fraction. Worked out the same in the vertex shader and in the script (colorOf: a
//   landing's, which its splashes take). A change of the wave or of Speed re-bases the phase: the
//   falls in progress then take the new rate's colours.
// - Its layout (distance, speed, phase) comes from four hashes a drop: worked out by WebGPU's
//   compute shader where there is one (checked against the script's), else by the script (the
//   scene's worker's, else here).
// - Its layout and its restart are pure functions of their inputs (models/rainlayout.ts). A
//   setting that lays the drops out again (Trail length, the font sizes) has them made by the
//   scene's worker (useWorker) for a step ahead (the most steps a frame can move), the old layout
//   drawing and landing meanwhile; swapped in exactly at that step (each drop's next landing after
//   it, as a restart there), then the drops wanted again (retarget); a result too late for its
//   step is asked again, an older one (a newer asked since) dropped. Without a worker, and at a
//   reset or new hashes, made here at once.
// - Each character is dimmed by the fog in front of it: the fog's volume read at its corners
//   (its place on the screen and its distance).
// - Drawn mirrored below the water (uMirror -1), it is its reflection, seen from the same eye,
//   each cell mirrored about the water where its drop lands, read from the fog's mirrored volume;
//   dimmed only by the water's Fresnel and the fog, as on real water.
// - Covered (covered, set each frame): a character behind the bolt's line or its characters at its
//   pixel (further from the eye) lets through only what they leave (GlyphAtlas.fragment's cover);
//   mirrored, behind their mirror images.
// - Its settings that lay the drops out again (Trail length, the font sizes) are applied once, in
//   the next reset, step or frame: a slider dragged makes one layout, not one a value.
// - Its newest characters for the clock and the message (drawNewest): at each step of a span,
//   each drop's newest character whose cell on the screen meets a box, drawn opaque where the rain
//   draws it (the scene's shift across added), in its fall's colour at full light (no fog, not
//   whitened), with its ink as a second output; one instance a drop and step, a newer step's
//   depth nearer than any older one's, within a step the nearer drop's (the depth test keeps the
//   newest, then the nearest). Its colours' state each frame (colorState) for the text's colours
//   by column.
//
// Changelog:
// 2026-11-03: the layout and the restart as pure functions (M.RainLayout), made in the scene's
//   worker when a setting lays the drops out again, swapped in at a step ahead.
// 2026-11-07: the trail's instances drawn by the drop's level (the list's high bits, Lod.trailCells), one fog read per cell from Lod.FOG_ONCE_DISTANCE (uFogOnce).
// 2026-11-07: faint trail cells not drawn in the direct view (uLightCut, M.QualityRain.Lod), with Effect.lod.
// 2026-11-06: the mirrored draw takes only the drops its own levels say are in the frustum (mirrorList; the job's units are the
//   direct view's then the mirrored view's).
// 2026-11-06: qualityJobs() and qualityIndex (the quality pool's job for the drops).
// 2026-11-05: the floor (setFloor): with the water off the drops fall from the world's ceiling to the bottom of the
//   screen at their distance (models/floor.ts), their rows and head heights from it; uFloor in shaders/rain/cell.glsl.
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/rain.js).
// 2026-11-04: drawNewest (the newest characters for the clock and the message) and colorState;
//   the fall's colour in shaders/rain/color.glsl.
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import CELL_SOURCE from "../shaders/rain/cell.glsl";
import VERTEX_SOURCE from "../shaders/rain/vertex.glsl";
import COLOR_SOURCE from "../shaders/rain/color.glsl";
import NEWEST_VERTEX_SOURCE from "../shaders/rain/newest_vertex.glsl";
import NEWEST_FRAGMENT_SOURCE from "../shaders/rain/newest_fragment.glsl";
import type { EffectContext, SharedGlsl } from "../engine/effect";
import type { Programs, ProgramSources, ShaderProgram } from "../engine/gl";
import type { StepClock } from "../engine/clock";
import type { GlyphAtlas } from "../engine/glyphs";
import type { RainLayout, RestartResult, SpawnPlane } from "../models/rainlayout";
import type { FloorKind, FloorView } from "../models/floor";
import type { QualityJob, EffectQuality, QualityShared, QualityViewInputs } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";
import type { SceneWorker, RainResult } from "../workers/sceneworker";

// the rain's colours this frame (Rain.colorState): Custom colors 1 to 4 (linear light), whether
// they are used (else the rainbow), the wave (on, its width, its phase now as a fraction) and the
// colours' unit across the world (a 16:9 view's width as a bearing)
export interface RainColors {
  colors: Float32Array[];
  custom: boolean;
  wave: boolean;
  width: number;
  now: number;
  screen: number;
}

// a drop at a step (Rain.dropAt): its head (rows from the top of its fall), rows, fall, whether it
// lands in this step and whether its fall shows, its place (x, z), its head's height, its colour
export interface DropState {
  head: number;
  rows: number;
  cycle: number;
  landed: boolean;
  shown: boolean;
  x: number;
  z: number;
  headY: number;
  color: Float32Array;
}

const RL = M.RainLayout;
// the pool (the most drops that can fall, whatever the settings and the window)
const COUNT = RL.COUNT;
// the listed drops' value: the drop in the low CELLS_SHIFT bits, the trail's instances drawn above them
const CELLS_SHIFT = 20;
const DROPS_ACROSS = 256;
const CELL = RL.CELL;
// the trail's cells at the default Trail length (15), and per Trail length
const TRAIL = 18;
const TRAIL_PER_LENGTH = TRAIL / 15;
// a font size's distance: DISTANCE_SIZE / size (m)
const DISTANCE_SIZE = 40;
const FURTHEST = DISTANCE_SIZE;
// matrix_web_rain's drops for a density (its RainScale)
const RAIN_SCALE = 1.06;
// the steps a second at the default Speed (70): STEP_RATE x (100 - 70) / (100 - Speed)
const STEP_RATE = 30;
const SEED = RL.SEED;
const IMPACT = 1;
// no fall (a life's bound)
const NONE = RL.NONE;
// the width of a 16:9 view as a bearing (x / z): the colours' unit across the world
// React to music: the seconds between scans of the drops, the most falls begun in a scan, the cycles tried for a column, and the seconds between the workers' layouts
// whether two spawn planes are the same (null: the world's ceiling)
// (within MouseParallax.TOLERANCE: the view the mouse parallax moves does not lay the drops out again for a drift smaller than that)
const sameSpawn = (a: SpawnPlane | null, b: SpawnPlane | null): boolean => {
  if (a === b) {
    return true;
  }
  const tolerance = M.MouseParallax.TOLERANCE;
  return !!a && !!b && Math.abs(a.eyeHeight - b.eyeHeight) <= tolerance.eye && Math.abs(a.pitch - b.pitch) <= tolerance.pitch && a.halfFov === b.halfFov;
};
const MUSIC_SCAN = 0.25;
const MUSIC_MOST = 4000;
const MUSIC_CYCLES = 48;
const MUSIC_STATIC = 5;
const WAVE_SCREEN = 2 * (16 / 9) * Math.tan(M.Camera.halfFov());
// the colours' defaults (project.json's Color 1 to 4, as linear light)
const DEFAULT_COLORS = [
  "0.62745098 0.37254902 1",
  "0.57254902 1 0.69019608",
  "0.4745098 0.94117647 1",
  "0.62745098 0.37254902 1",
];
// the script's hashes, worked out once
let SCRIPT_HASHES: Uint32Array<ArrayBuffer>|null = null;

export class Rain extends M.Effect {
  static IMPACT: number;
  static FURTHEST: number;
  static STEP_RATE: number;
  static RAIN_SCALE: number;
  static restartOf: typeof RainLayout.restartOf;
  landings!: (step: number) => number[];
  program!: ShaderProgram;
  newest!: ShaderProgram;
  colorState: RainColors;
  wrongLandings: number;
  // the floor the drops fall to (models/floor.ts) as set, and the one (and the pitch, for the screen's) the layout
  // in use was made for
  floorKind: FloorKind;
  layoutFloor: FloorKind;
  layoutPitch: number;
  // the eye's height the layout (its spawn plane, its screen floor) was made for, with the mouse parallax's shift of it
  layoutEye: number;
  // React to music: the falls start from the top of the view (the spawn plane), and Music rain responsiveness (the rate of the falls the music asks for)
  tiltOn: boolean;
  tiltResponsiveness: number;
  layoutSpawn: SpawnPlane | null;
  ready: RainResult | null;
  pending: { generation: number; at: number } | null;
  layGeneration: number;
  worker: SceneWorker | null;
  at: Partial<DropState>;
  landing: Partial<DropState>;
  inWheel: Uint8Array;
  nextInSlot: Int32Array;
  slots: Int32Array;
  inView: number;
  wanted: number;
  // React to music (models/musicrain.ts): each column's share of the settled rain's falls (the columns across the window, from the left; null: the settled rain)
  shares: Float32Array | null;
  // the drops whose phase was changed to begin a fall now (React to music: spawnByMusic): the quality's levels, worked out by the workers from the layout they were
  // sent, do not know their new phase, so they are always drawn; the count, and the times of the last scan and of the last refresh of the workers' layout (s)
  woken: Uint8Array;
  // the part of its drops the normal rain has in the view at a time (the rest are above it, waiting), and what it was worked out for
  fillPart: number;
  fillFor: string;
  // the falls the music may begin: the credit (falls) and the time of the last scan
  musicCredit: number;
  meanFall: number;
  meanFallFor: Float32Array | null;
  // the drops' light emittance across the window (React to music: 128 bins, the worker's reply; null: none)
  musicLight: Float32Array | null;
  musicShown: Int32Array;
  musicDeficit: Float32Array;
  musicFree: Int32Array;
  musicShowing: Int32Array;
  musicOut: Int32Array;
  wokenCount: number;
  musicAt: number;
  staticAt: number;
  reach: number;
  active: number;
  dirtyLast: number;
  dirtyFirst: number;
  life: Uint32Array;
  lastStep: number;
  // the drops the quality says are seen this frame (setQuality), for the direct draw: their indices, how many, and the buffer and vertex
  // array that feed them to the vertex shader (one value for each trail's instances); listedDrops is how many the last direct draw
  // took from the list (-1: all of them, no list)
  dropList: Uint32Array;
  dropCount: number;
  // the same for the mirrored draw (the drops whose mirror images the mirrored levels keep), and how many
  mirrorList: Uint32Array;
  mirrorCount: number;
  dropListed: boolean;
  // what qualityStatics last gave, and the parameters object qualityParams keeps
  sentLayout: Float32Array | null;
  sentTrail: number;
  qualityParamValues: { drops: number; step: number; floor: { kind: string; eyeHeight: number; pitch: number; halfFov: number }; inputs: QualityViewInputs } | null;
  listVersion: number;
  listBuffer!: WebGLBuffer;
  listArray!: WebGLVertexArrayObject;
  listedDrops: number;
  lifeTexture: WebGLTexture | null;
  texture: WebGLTexture | null;
  headOnly: boolean;
  onlyDrop: number;
  layout: Float32Array | null;
  hashes: Uint32Array | null;
  covered: boolean;
  viewScale: number;
  time: number;
  steady: boolean;
  height: number;
  width: number;
  density: number;
  fontMax: number;
  fontMin: number;
  nextTrail: number;
  trail: number;
  head: number;
  layoutDirty: boolean;
  relay: boolean;
  wavePerStep: number;
  waveStep: number;
  wavePhase: number;
  // the rain's index in the effects' order (the quality job's effect number: set by the coordinator)
  waveWidth: number;
  waveSpeed: number;
  wave: boolean;
  custom: boolean;
  colors: Float32Array[];
  onLand: (drop: DropState, time: number) => void;
  clock: StepClock;
  atlas: GlyphAtlas;
  nearness: ArrayLike<number> | null;
  static layout: typeof RainLayout.layout;
  static distanceAt: typeof RainLayout.distanceAt;
  static vertex: (glsl: SharedGlsl, test: boolean) => string;
  static newestVertex: (test: boolean) => string;
  static newestFragment: (test: boolean) => string;
  static SEED: number;
  static COUNT: number;
  static CELL: number;
  static DISTANCE_SIZE: number;
  // onLand(drop, time): a drop lands (dropAt's description of it, valid during the call only)
  constructor(context: EffectContext, onLand: (drop: DropState, time: number) => void) {
    super(context);
    // (Debug mode's Nearness view: the rain's nearest and furthest distances, null when off)
    this.nearness = null;
    this.atlas = context.atlas;
    this.clock = context.clock;
    this.onLand = onLand;
    // Custom colors 1 to 4 (else the rainbow), the wave (its speed and width in widths of a
    // 16:9 view: a second, a cycle) and its phase at a step (phase at waveStep, and per step)
    this.colors = DEFAULT_COLORS.map((c) => M.color(c));
    this.custom = true;
    this.wave = true;
    this.waveSpeed = 0.1;
    this.waveWidth = 1.5;
    this.wavePhase = 0;
    this.waveStep = 0;
    this.wavePerStep = 0;
    // a new layout owed (a setting that lays the drops out again), and the layout's upload owed
    this.relay = false;
    this.floorKind = "water";
    this.layoutFloor = "water";
    this.layoutPitch = 0;
    this.layoutEye = 0;
    this.tiltOn = false;
    this.tiltResponsiveness = 2;
    this.layoutSpawn = null;
    this.layoutDirty = false;
    this.head = M.GlyphAtlas.HEAD;
    // the trail's cells drawn (the layout's), and the ones set (laid out in the next layout)
    this.trail = TRAIL;
    this.nextTrail = TRAIL;
    this.fontMin = 1;
    this.fontMax = 16;
    this.density = 5;
    this.width = 800;
    this.height = 600;
    // Steady start (src/index.ts: with Debug mode): at a reset all of them at once, as settled
    this.steady = false;
    // the last time moved on to (a Speed set then goes on from its step)
    this.time = 0;
    // (the tests' scale of the characters' light: with M.TEST only)
    this.viewScale = 1;
    // whether the bolt covers what lies behind it this frame (Characters lightning: set by src/index.ts)
    this.covered = false;
    this.hashes = null;
    this.layout = null;
    this.onlyDrop = -1;
    this.headOnly = false;
    this.texture = null;
    this.lifeTexture = null;
    this.lastStep = 0;
    // each drop's life (its first fall shown, the fall it ends before, a fall it shows again
    // from; NONE: none), and the drops whose layout or life changed since the last upload
    this.life = new Uint32Array(COUNT * 4);
    this.dirtyFirst = COUNT;
    this.dirtyLast = -1;
    // the drops counted as falling (the first `active` of the pool), the ones drawn (the first
    // `reach`: those ending still fade there), the drops wanted, and the ones wanted in view
    this.active = 0;
    this.reach = 0;
    this.dropList = new Uint32Array(COUNT);
    this.dropCount = 0;
    this.mirrorList = new Uint32Array(COUNT);
    this.mirrorCount = 0;
    this.dropListed = false;
    this.sentLayout = null;
    this.sentTrail = 0;
    this.qualityParamValues = null;
    this.listVersion = -1;
    this.listedDrops = -1;
    this.wanted = 0;
    this.inView = 0;
    this.shares = null;
    this.woken = new Uint8Array(COUNT);
    this.fillPart = 1;
    this.fillFor = "";
    this.musicCredit = 0;
    this.meanFall = 1;
    this.meanFallFor = null;
    this.musicLight = null;
    this.musicShown = new Int32Array(0);
    this.musicDeficit = new Float32Array(0);
    this.musicFree = new Int32Array(COUNT);
    this.musicShowing = new Int32Array(COUNT);
    this.musicOut = new Int32Array(COUNT);
    this.wokenCount = 0;
    this.musicAt = -Infinity;
    this.staticAt = 0;
    // the wheel: each slot's first drop (-1: none), each drop's next in its slot, whether it is
    // in the wheel
    this.slots = new Int32Array(1);
    this.nextInSlot = new Int32Array(COUNT);
    this.inWheel = new Uint8Array(COUNT);
    this.landing = {};
    this.at = {};
    // the scene's worker (null: the layouts made here), the last layout asked of it (its
    // generation), the one waiting ({ generation, at: its step }) and its result once there
    this.worker = null;
    this.layGeneration = 0;
    this.pending = null;
    this.ready = null;
    // (the tests': landings taken from the wheel that were none, with M.TEST)
    this.wrongLandings = 0;
    // (the colours' state this frame, filled in place by update)
    this.colorState = { colors: this.colors, custom: this.custom, wave: this.wave, width: this.waveWidth, now: 0, screen: WAVE_SCREEN };
  }

  // the hashes worked out by the script (WebGPU's must be the same)
  static scriptHashes() {
    if (!SCRIPT_HASHES) {
      SCRIPT_HASHES = RL.hashes(COUNT, SEED);
    }
    return SCRIPT_HASHES;
  }

  static programs(glsl: SharedGlsl): ProgramSources {
    return {
      rain: [Rain.vertex(glsl, M.TEST), M.GlyphAtlas.fragment(glsl, M.TEST, true, true)],
      rainNewest: [Rain.newestVertex(M.TEST), Rain.newestFragment(M.TEST)],
    };
  }

  static QUALITY_UNIT = "drops";

  static properties() {
    return {
      p102_setting_FontSizeMin: (rain: Rain, v: number) => rain.setFonts(v, rain.fontMax),
      p103_setting_FontSizeMax: (rain: Rain, v: number) => rain.setFonts(rain.fontMin, v),
      p104_setting_RainDensity: (rain: Rain, v: number) => {
        rain.density = v;
        rain.retarget();
      },
      p105_setting_HeadBrightness: (rain: Rain, v: number) => (rain.head = v / 100),
      p109_setting_CustomColors: (rain: Rain, v: boolean) => (rain.custom = v),
      p110_setting_Color1: (rain: Rain, v: string) => (rain.colors[0] = M.color(v)),
      p111_setting_Color2: (rain: Rain, v: string) => (rain.colors[1] = M.color(v)),
      p112_setting_Color3: (rain: Rain, v: string) => (rain.colors[2] = M.color(v)),
      p113_setting_Color4: (rain: Rain, v: string) => (rain.colors[3] = M.color(v)),
      p114_setting_ColorWave: (rain: Rain, v: boolean) => rain.setWave(v, rain.waveSpeed, rain.waveWidth),
      p115_setting_WaveSpeed: (rain: Rain, v: number) => rain.setWave(rain.wave, v / 100, rain.waveWidth),
      p116_setting_WaveWidth: (rain: Rain, v: number) => rain.setWave(rain.wave, rain.waveSpeed, v / 100),
      p118_setting_TrailLength: (rain: Rain, v: number) => rain.setTrail(Math.max(1, Math.round(v * TRAIL_PER_LENGTH))),
    };
  }

  init(programs: Programs) {
    [this.program] = this.ownPrograms(programs, ["rain"]);
    this.program.samplers({
      uDrops: M.UNITS.drops,
      uLife: M.UNITS.dropLife,
      uAtlas: M.UNITS.atlas,
      uWaves: M.UNITS.waves,
      uWaveMax: M.UNITS.waveMax,
      uFogDirect: M.UNITS.fogDirect,
      uFogMirror: M.UNITS.fogMirror,
      uStrikeDirect: M.UNITS.strikeDirect,
      uStrikeMirror: M.UNITS.strikeMirror,
      uBoltCover: M.UNITS.boltCover,
      uBoltNear: M.UNITS.boltNear,
    });
    [this.newest] = this.ownPrograms(programs, ["rainNewest"]);
    // (an integer attribute's own current value: a draw without the list reads it, and a float one there would make the draw an error)
    this.gl.vertexAttribI4ui(M.ATTRIBUTES.aDrop, 0, 0, 0, 0);
    this.listBuffer = this.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.listBuffer);
    // (two lists: the direct draw's, then the mirrored draw's)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, COUNT * 8, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.listArray = this.vertexArray([{ buffer: this.listBuffer, attribute: "aDrop", size: 1, integer: true }]);
    this.newest.samplers({ uDrops: M.UNITS.drops, uLife: M.UNITS.dropLife, uAtlas: M.UNITS.atlas });
  }

  // ---- the drops' places ----

  // the nearest and the furthest distance (Font size Max and Min, Min at most Max)
  nearest() {
    return DISTANCE_SIZE / this.fontMax;
  }

  furthest() {
    return DISTANCE_SIZE / Math.min(this.fontMin, this.fontMax);
  }

  // the layout from the hashes (the first is not used: the place across is new each fall), made
  // here at once; the same hashes again change nothing
  setHashes(hashes: Uint32Array) {
    if (this.hashes && this.hashes.length === hashes.length && this.hashes.every((v, i) => v === hashes[i])) {
      return;
    }
    this.hashes = hashes;
    this.relay = false;
    this.drop();
    this.lay();
    this.restart();
  }

  // the scene's worker for the layouts (null: made here)
  useWorker(client: SceneWorker | null) {
    this.worker = client;
    if (!client) {
      this.relay = this.relay || !!this.pending;
      this.drop();
    }
  }

  // the layout waiting for (or come from) the worker dropped
  drop() {
    this.layGeneration++;
    this.pending = null;
    this.ready = null;
  }

  // the trail's cells (the drops laid out again for them, from a clean screen: in the next
  // reset, step or frame)
  setTrail(cells: number) {
    if (cells !== this.nextTrail) {
      this.nextTrail = cells;
      this.relay = true;
    }
  }

  // the font sizes (the drops laid out again between their distances, from a clean screen: in
  // the next reset, step or frame)
  setFonts(min: number, max: number) {
    if (min !== this.fontMin || max !== this.fontMax) {
      this.fontMin = min;
      this.fontMax = max;
      this.relay = true;
    }
  }

  // the floor the drops fall to: the water (y = 0) or the bottom of the screen at each drop's distance (the
  // water off): the drops laid out again for it (in the next reset, step or frame)
  setFloor(kind: FloorKind) {
    if (kind !== this.floorKind) {
      this.floorKind = kind;
      this.relay = true;
    }
  }

  // the floor the next layout is made for (the water's: none to give), by the camera's view now
  floorView(): FloorView | undefined {
    const camera = this.camera;
    return this.floorKind === "screen" ? { kind: "screen", eyeHeight: camera.eyeY(), pitch: camera.tilt(), halfFov: camera.halfFov() } : undefined;
  }

  // the frame's quality: the levels are the direct view's for the drops 0 .. n-1 and the mirrored view's for the units n .. 2n-1
  // (n = half their number). The drops seen (level over 0) become the direct draw's list, in order, and the drops whose mirror
  // images are in the frustum the mirrored draw's; a drop past n (one still fading after it was taken off the wanted ones) is always
  // drawn in both. The levels are exact for the frame (the pool works on the frame's own step and view), so what is left out would
  // draw nothing. The readout's quality is the direct view's (n units).
  setQuality(q: EffectQuality) {
    super.setQuality(q);
    const levels = q.levels;
    if (!levels) {
      this.dropListed = false;
      return;
    }
    const n = levels.length >> 1;
    const list = this.dropList;
    const mirrored = this.mirrorList;
    let count = 0;
    let mirrorCount = 0;
    let drawn = 0;
    let sum = 0;
    let top = 0;
    for (let i = 0; i < this.reach; i++) {
      if (i >= n) {
        list[count++] = i;
        mirrored[mirrorCount++] = i;
        continue;
      }
      const level = levels[i];
      if (this.woken[i] && level === 0) {
        list[count++] = i;
        drawn++;
      } else if (level > 0) {
        // (with LOD on, the trail's instances drawn for the level ride in the list's high bits, 0: all of them)
        list[count++] = this.lod ? i | (M.QualityRain.Lod.trailCells(level, this.trail) << CELLS_SHIFT) : i;
        drawn++;
        sum += level;
        if (level > top) {
          top = level;
        }
      }
      if (levels[n + i] > 0 || this.woken[i]) {
        mirrored[mirrorCount++] = i;
      }
    }
    q.units = n;
    q.drawn = drawn;
    q.level = top;
    q.meanLevel = drawn > 0 ? sum / drawn : 0;
    q.visible = drawn > 0;
    this.dropCount = count;
    this.mirrorCount = mirrorCount;
    // (the levels were worked out for the camera as it was when the job was made: a camera changed since (dirty), or by the time of the
    // draw (its version), is another view, and the lists are not used)
    this.listVersion = this.camera.dirty ? -1 : this.camera.version;
    this.dropListed = !this.camera.dirty;
  }

  qualityKind(): string {
    return "rain";
  }

  // the job's statics (the layout and the trail's cells) when the layout swapped or the trail changed since the last call
  qualityStatics(): QualityStatics | null {
    if (!this.layout || (this.layout === this.sentLayout && this.trail === this.sentTrail)) {
      return null;
    }
    this.sentLayout = this.layout;
    this.sentTrail = this.trail;
    return { layout: this.layout, trail: new Float32Array([this.trail]) };
  }

  // the frame's parameters: the step, the floor the layout was made for, and the shared inputs
  qualityParams(shared: QualityShared): QualityParams {
    let p = this.qualityParamValues;
    if (!p) {
      p = this.qualityParamValues = { drops: 0, step: 0, floor: { kind: "water", eyeHeight: 0, pitch: 0, halfFov: 0 }, inputs: shared.inputs };
    }
    const camera = this.camera;
    p.drops = this.qualityDrops();
    p.step = shared.step;
    p.floor.kind = this.layoutFloor;
    p.floor.eyeHeight = this.layoutEye;
    p.floor.pitch = this.layoutPitch;
    p.floor.halfFov = camera.halfFov();
    p.inputs = shared.inputs;
    return p as unknown as QualityParams;
  }

  // the drops the job covers (the wanted ones; none before the first layout)
  qualityDrops(): number {
    return this.layout ? Math.min(this.wanted, this.layout.length >> 2) : 0;
  }

  // the quality pool's job: the drops wanted twice, the direct view's levels then the mirrored view's, in chunks of QualityRain.CHUNK
  qualityJobs(): QualityJob[] {
    const units = this.qualityDrops() * 2;
    return units > 0 && this.qualityIndex >= 0 ? [{ effect: this.qualityIndex, units, minChunk: M.QualityRain.CHUNK }] : [];
  }

  // the height of the floor at a distance for the layout in use
  floorAt(distance: number) {
    const camera = this.camera;
    return this.layoutFloor === "screen" ? M.Floor.heightAt("screen", distance, this.layoutEye, camera.halfFov(), this.layoutPitch) : 0;
  }

  // React to music on: the falls start from the top of the view (not turned: 0 distance from it at the front and at the back), and Music rain responsiveness sets the rate of the
  // falls the music asks for (musicRate: 1 is the steady rate of the normal rain, every step halves the time to the steady state)
  setMusicTilt(on: boolean, responsiveness: number) {
    this.tiltOn = on;
    this.tiltResponsiveness = responsiveness;
  }

  // the plane the falls start from now: the world's ceiling (null), or with React to music the top of the view, raised at the nearest distance by a part of the box's height there
  spawnNow(): SpawnPlane | null {
    if (!this.tiltOn) {
      return null;
    }
    const camera = this.camera;
    return { eyeHeight: camera.eyeY(), pitch: camera.tilt(), halfFov: camera.halfFov() };
  }

  // the layout owed (one for any number of settings changed since): asked of the worker, or
  // made here (also with `now`: a reset's, whatever was waiting)
  applyLayout(now = false) {
    // (the screen's floor depends on the pitch and the eye's height: a view that moved past the tolerance lays the drops out again)
    if (this.floorKind === "screen" && this.layout && !this.pending && this.viewDrifted()) {
      this.relay = true;
    }
    // (the spawn plane turned for the music, or the view it is the top of changed: the drops laid out again)
    if (this.layout && !this.pending && !sameSpawn(this.spawnNow(), this.layoutSpawn)) {
      this.relay = true;
    }
    if (now && this.pending) {
      this.relay = true;
      this.drop();
    }
    if (!this.relay || !this.hashes) {
      return;
    }
    this.relay = false;
    if (this.worker && !now) {
      this.ask();
    } else {
      this.lay();
      this.restart();
    }
  }

  // the layout and a restart asked of the worker for a step ahead (the most a frame can move)
  ask() {
    const generation = ++this.layGeneration;
    const at = this.lastStep + this.clock.most;
    const camera = this.camera;
    this.pending = { generation, at };
    this.ready = null;
    const params = {
      generation,
      near: this.nearest(),
      far: this.furthest(),
      trail: this.nextTrail,
      wanted: this.targets()[1],
      steady: this.steady,
      spawn: this.spawnNow(),
      lastStep: at,
      eyeHeight: camera.eyeY(),
      pitch: camera.tilt(),
      halfFov: camera.halfFov(),
      floor: this.floorKind,
    };
    this.worker!.rain(params).then(
      (result) => {
        if (result && this.pending && result.generation === this.pending.generation) {
          this.ready = result;
        }
      },
      () => {
        // (the worker failed: made here from now on)
        if (this.pending && this.pending.generation === generation) {
          this.useWorker(null);
        }
      }
    );
  }

  // the worker's layout and restart in place, at its step (the drops wanted then again)
  swap() {
    const r = this.ready!;
    this.pending = null;
    this.ready = null;
    this.trail = r.trail;
    this.layout = r.layout;
    this.layoutFloor = r.floor;
    this.layoutPitch = r.pitch;
    this.layoutEye = r.eyeHeight;
    this.layoutSpawn = r.spawn;
    this.layoutDirty = true;
    this.adopt(r);
    this.retarget();
  }

  // each drop's distance, speed, phase and rows (its ceiling's and its trail's), and the wheel's
  // size (RainLayout.layout)
  lay() {
    this.trail = this.nextTrail;
    const spawn = this.spawnNow();
    const r = RL.layout({ hashes: this.hashes!, near: this.nearest(), far: this.furthest(), trail: this.trail, spawn: spawn || undefined, floor: this.floorView() });
    this.layoutSpawn = spawn;
    this.layout = r.layout;
    this.layoutFloor = this.floorKind;
    this.layoutPitch = this.camera.tilt();
    this.layoutEye = this.camera.eyeY();
    this.layoutDirty = true;
    this.slots = new Int32Array(r.slots);
  }

  // a restart's lives and wheel taken (all the lives to upload)
  adopt(r: RestartResult) {
    this.life = r.life;
    this.slots = r.slots;
    this.nextInSlot = r.nextInSlot;
    this.inWheel = r.inWheel;
    this.active = r.active;
    this.reach = r.reach;
    this.dirtyFirst = 0;
    this.dirtyLast = COUNT - 1;
    // (a new layout: the phases changed for the music are gone with the old one; the music's shares decide the first falls too)
    this.woken.fill(0);
    this.wokenCount = 0;
    this.gateFirst(0, this.active, this.steady);
  }

  // the first fall of drops from..to-1 that has not come into the view yet (a clean start: none has) is shown or not by the music's shares, as every later one is (nothing
  // falls at the start in silence); a fall in the view is left to finish, unless the rain was settled at once (`now`: a jump in time, Steady start: the falls in progress are
  // shown or not by the shares too)
  gateFirst(from: number, to: number, now = false) {
    if (!this.shares) {
      return;
    }
    for (let i = from; i < to; i++) {
      const first = this.life[i * 4];
      if (first === NONE) {
        continue;
      }
      const d = this.dropAt(i, this.lastStep, this.at);
      if (now) {
        // (and the next fall: a drop landing in this very step has no landing left to decide it)
        this.gate(i, d.cycle);
        this.gate(i, d.cycle + 1);
      } else if (first > d.cycle || (first === d.cycle && d.headY > this.topAt(-d.z))) {
        this.gate(i, first);
      }
    }
  }

  // ---- the colours ----

  // the steps' rate changed (Speed, src/index.ts's): the wave goes on from where it is at the new rate
  rateChanged() {
    this.setWave(this.wave, this.waveSpeed, this.waveWidth);
  }

  // the wave: on or off, its speed and width; its phase going on from where it is (a step of the
  // rain's), at the steps' rate now
  setWave(on: boolean, speed: number, width: number) {
    const step = this.clock.stepAt(this.time);
    this.wavePhase = this.phaseAt(step);
    this.waveStep = step;
    this.wave = on;
    this.waveSpeed = speed;
    this.waveWidth = width;
    this.wavePerStep = on ? speed / width / this.clock.rate : 0;
  }

  phaseAt(step: number) {
    return this.wavePhase + (step - this.waveStep) * this.wavePerStep;
  }

  // the steps since drop i's fall began, at a step, from the rows it has fallen in it: exactly
  // step - ceil(16 (rows to the fall's start) / speed), in small numbers only (with step = 16 q
  // + r, the q's cancel): r - ceil((16 floor(r speed / 16) - 16 rowsSince) / speed), as the shader
  stepsSince(i: number, step: number, rowsSince: number) {
    const speed = this.layout![i * 4 + 1];
    const r = step % 16;
    return r - Math.ceil((16 * Math.floor((r * speed) / 16) - 16 * rowsSince) / speed);
  }

  // the wave's phase when a fall began, at a step: the phase now (its fraction, as the shader
  // gets it) less the steps since
  fallPhase(i: number, step: number, rowsSince: number) {
    const now = this.phaseAt(step);
    return now - Math.floor(now) - this.stepsSince(i, step, rowsSince) * this.wavePerStep;
  }

  // drop i's colour in its fall at a step (d: dropAt's description of it then), into a colour
  // given
  colorOf<T extends Float32Array | number[]>(i: number, d: Pick<DropState, "x" | "z" | "head">, step: number, into: T) {
    const distance = -d.z;
    const position = d.x / distance / WAVE_SCREEN + 0.5;
    const wave = (((position / this.waveWidth - this.fallPhase(i, step, d.head)) % 1) + 1) % 1;
    if (this.custom) {
      const c = this.colors;
      const at = this.wave ? wave : Math.min(1, Math.max(0, position));
      const n = this.wave ? 5 : 4;
      const segments = 2 * (n - 1);
      const segment = Math.min(Math.floor(at * segments), segments - 1);
      const amount = at * segments - segment;
      const a = c[Math.floor(segment / 2) % 4];
      const b = c[(Math.floor(segment / 2) + 1) % 4];
      for (let k = 0; k < 3; k++) {
        into[k] = Math.min(1, Math.max(0, segment % 2 === 0 ? a[k] + b[k] * amount : b[k] + a[k] * (1 - amount)));
      }
    } else {
      const hue = (((this.wave ? wave : position) * 360 + 347) % 360 + 360) % 360;
      const offsets = [0, 4, 2];
      for (let k = 0; k < 3; k++) {
        const v = (hue / 60 + offsets[k]) % 6;
        into[k] = M.linear(Math.min(1, Math.max(0, Math.abs(v - 3) - 1)));
      }
    }
    return into;
  }

  // ---- how many ----

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.retarget();
  }

  // the drops wanted in view (matrix_web_rain's rainCount x RAIN_SCALE) and in the pool (over
  // the share of the world's width in view)
  targets() {
    const min = Math.min(this.fontMin, this.fontMax);
    const max = this.fontMax;
    const perPixel = max > min ? (1 / min - 1 / max) / Math.log(max / min) : 1 / max;
    const inView = RAIN_SCALE * Math.max(1, Math.round(this.density * this.width * perPixel));
    const share = Math.min(1, ((this.width / this.height) * Math.tan(M.Camera.halfFov())) / M.Camera.SPAN);
    return [inView, Math.min(COUNT, Math.round(inView / share))];
  }

  // the columns' shares of the falls (null: the settled rain's): each fall is shown or not by its column's share, decided as it begins (gate), so a fall in progress is
  // never cut short and the drops come round to the music as their falls end
  setShares(shares: Float32Array | null) {
    const first = !this.shares && !!shares;
    this.shares = shares;
    if (first) {
      // (the music takes the rain over: the falls not in the view yet are gated; with Steady start, whose falls are all in progress, all of them)
      this.gateFirst(0, this.active, this.steady);
    }
  }

  // the drops' light emittance across the window (the multiple of their light by bin, left to right; null: none)
  setMusicLight(light: Float32Array | null) {
    this.musicLight = light;
  }

  // the column across the window of a place (x, distance): the world's space seen from the front, in the window's width
  columnOf(x: number, distance: number, columns: number) {
    // (the place's bearing from the eye, less the view's turn: with the parallax's yaw and eye offset the columns follow the view)
    const camera = this.camera;
    const bearing = (x - camera.eyeX) / distance - (camera.yaw === 0 ? 0 : Math.tan(camera.yaw));
    const position = bearing / (2 * (this.width / this.height) * Math.tan(M.Camera.halfFov())) + 0.5;
    return Math.min(columns - 1, Math.max(0, Math.floor(position * columns)));
  }

  // ---- React to music: the falls begun and ended by column ----

  // the falling drops by column (the columns across the window, from the left): how many of the drops wanted show their fall now, in each (into a given array)
  showingColumns(columns: number, into?: Int32Array) {
    const out = into && into.length >= columns ? into : new Int32Array(columns);
    out.fill(0, 0, columns);
    if (!this.layout) {
      return out;
    }
    for (let i = 0; i < this.active; i++) {
      const cycle = this.cycleAt(i, this.lastStep);
      if (this.life[i * 4] !== NONE && this.shows(i, cycle)) {
        out[this.columnOf(this.x(i, cycle, this.layout[i * 4]), this.layout[i * 4], columns)]++;
      }
    }
    return out;
  }

  // the part of the drops wanted the music keeps falling, for as many in the view as the normal rain has at a time: a drop falls from the world's ceiling (the top of the highest view), and is in the view only from the
  // top of the view down, so on average the part of its cycle that is the view's (the rows of a fall from the top of the view over the rows of a fall from the ceiling, the trail's cells included, at its distance, over every 8th drop wanted);
  // the music's falls start from the top of the view, so every one of them is in the view: to show as many as the normal rain does the music's shares are taken times this part
  musicFillPart() {
    const data = this.layout;
    const camera = this.camera;
    if (!data) {
      return 1;
    }
    const key = camera.eyeY() + "," + camera.tilt() + "," + this.trail + "," + this.active + "," + data.length + "," + this.nearest() + "," + this.furthest();
    if (this.fillFor !== key) {
      const tan = Math.tan(camera.tilt() + camera.halfFov());
      let sum = 0;
      let n = 0;
      for (let i = 0; i < this.active; i += 8) {
        const d = data[i * 4]!;
        // (a fall of the music is the rows from the top of the view down, a fall of the normal rain the rows from the ceiling, each with the trail's cells: starting falls at the same
        // rate, the music has as many falling as the normal rain has, times the first's rows over the second's)
        sum += Math.min(1, ((camera.eyeY() + d * tan) / CELL + this.trail) / (M.Camera.ceilingAt(d) / CELL + this.trail));
        n++;
      }
      this.fillPart = n > 0 ? sum / n : 1;
      this.fillFor = key;
    }
    return this.fillPart;
  }

  // the average time a drop takes to fall (s), over every 16th of the drops wanted: its rows over its speed in steps (a speed of s sixteenths of a row a step), at the step rate
  meanFallSeconds() {
    const data = this.layout;
    if (!data) {
      return 1;
    }
    if (this.meanFallFor !== data) {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < COUNT; i += 16) {
        sum += (data[i * 4 + 3]! * 16) / data[i * 4 + 1]!;
        n++;
      }
      const steps = sum / Math.max(1, n);
      this.meanFall = Math.max(0.1, this.clock.timeOf(this.lastStep + Math.ceil(steps)) - this.clock.timeOf(this.lastStep));
      this.meanFallFor = data;
    }
    return this.meanFall;
  }

  // the falls the music asks for a second in all (the drops coming round by themselves begin the first part of them, the scan the rest): the settled rain's rate (every drop begins a fall once in the time of a fall) for the density the music sets at this moment (the
  // drops wanted times the mean share of the columns), as matrix_web_rain's drops come in at the new rain's settled rate and not all at once, times Music rain responsiveness's
  // factor (1: that rate exactly; each step halves the time given to reach the steady state: 2 ^ (responsiveness - 1))
  musicRate() {
    const shares = this.shares;
    if (!shares || shares.length === 0) {
      return 0;
    }
    let sum = 0;
    for (let c = 0; c < shares.length; c++) {
      sum += shares[c]!;
    }
    return (this.active * this.musicFillPart() * (sum / shares.length) * M.MusicRain.rateFactor(this.tiltResponsiveness)) / this.meanFallSeconds();
  }

  // a scan of the drops (about 4 a second while the music drives) against the columns' shares: a column with fewer falling drops than its share of the drops wanted gets
  // new falls at once, begun at the top of their fall now by drops that are not falling (their phase changed to start a fall now, in a cycle whose place across is in the
  // column: the drop's falls are at places by a hash of the drop and the fall); when no drop is free for them, falls are ended (despawned) in the columns with more
  // falling drops than their share, the farthest first and, among those, the oldest (the furthest down its fall)
  spawnByMusic(time: number) {
    const shares = this.shares;
    if (!shares || !this.layout || this.pending || this.active === 0 || time - this.musicAt < MUSIC_SCAN) {
      return;
    }
    // (the falls begun by it are no more than the settled rain's rate allows: the credit of the time since the last scan, carried over)
    const since = this.musicAt === -Infinity ? 0 : Math.min(1, Math.max(0, time - this.musicAt));
    // (the drops coming round by themselves, each fall accepted by its column's share as the one before lands, already begin falls at the steady rate (1 times the rate of the density
    // the music sets, the normal rain's steady rate for it): the falls begun here are the rest of the rate Music rain responsiveness asks for, (factor - 1) times that)
    const factor = M.MusicRain.rateFactor(this.tiltResponsiveness);
    this.musicCredit = Math.min(this.musicCredit + this.musicRate() * (1 - 1 / factor) * since, MUSIC_MOST);
    this.musicAt = time;
    if (this.musicCredit < 1) {
      return;
    }
    const step = this.lastStep;
    const columns = shares.length;
    const active = this.active;
    const data = this.layout;
    const shown = this.musicShown.length >= columns ? this.musicShown : (this.musicShown = new Int32Array(columns));
    const deficit = this.musicDeficit.length >= columns ? this.musicDeficit : (this.musicDeficit = new Float32Array(columns));
    shown.fill(0, 0, columns);
    const free = this.musicFree;
    const showing = this.musicShowing;
    let freeCount = 0;
    let showingCount = 0;
    for (let i = 0; i < active; i++) {
      if (this.life[i * 4] === NONE) {
        continue;
      }
      const cycle = this.cycleAt(i, step);
      if (this.shows(i, cycle)) {
        shown[this.columnOf(this.x(i, cycle, data[i * 4]), data[i * 4], columns)]++;
        showing[showingCount++] = i;
      } else {
        free[freeCount++] = i;
      }
    }
    let owed = 0;
    let total = 0;
    let wanted = 0;
    const per = active / columns;
    const fill = this.musicFillPart();
    for (let c = 0; c < columns; c++) {
      deficit[c] = Math.floor(shares[c]! * fill * per - shown[c]!);
      if (deficit[c]! > 0) {
        owed += deficit[c]!;
      }
      total += shown[c]!;
      wanted += shares[c]! * fill * per;
    }
    // (the falls begun never take the whole past what the columns' shares call for in all: each column filled up to its own share alone would leave the whole above it by the
    // columns' chance fluctuations)
    owed = Math.min(owed, Math.floor(wanted - total));
    if (owed <= 0) {
      return;
    }
    owed = Math.min(owed, Math.floor(this.musicCredit));
    // (no drop free for the falls owed: the oldest and farthest of those falling in the columns with more than their share end)
    if (freeCount < owed) {
      const out = this.musicOut;
      let n = 0;
      for (let k = 0; k < showingCount; k++) {
        const i = showing[k]!;
        const cycle = this.cycleAt(i, step);
        const c = this.columnOf(this.x(i, cycle, data[i * 4]), data[i * 4], columns);
        if (shown[c]! > shares[c]! * fill * per + 1) {
          out[n++] = i;
        }
      }
      const key = (i: number) => data[i * 4] * 1e6 + (this.total(i, step) % data[i * 4 + 3]);
      const picked = out.subarray(0, n).sort((a, b) => key(b) - key(a));
      for (let k = 0; k < picked.length && freeCount < owed; k++) {
        const i = picked[k]!;
        const cycle = this.cycleAt(i, step);
        const c = this.columnOf(this.x(i, cycle, data[i * 4]), data[i * 4], columns);
        if (shown[c]! > shares[c]! * fill * per + 1) {
          shown[c]!--;
          this.despawn(i, cycle);
          free[freeCount++] = i;
        }
      }
    }
    // (the drops free begin falls, each in a column that is owed one: the first cycle of the next MUSIC_CYCLES that is placed in one)
    const mask = this.slots.length - 1;
    let woke = 0;
    const start = freeCount > 0 ? Math.floor(time * 1000) % freeCount : 0;
    for (let k = 0; k < freeCount && woke < owed; k++) {
      const i = free[(start + k) % freeCount]!;
      const distance = data[i * 4];
      const rows = data[i * 4 + 3];
      const t = this.total(i, step);
      const base = (t - data[i * 4 + 2]) >>> 0;
      const r0 = (rows - (base % rows)) % rows;
      for (let j = 0; j < MUSIC_CYCLES; j++) {
        const phase = r0 + j * rows;
        if (base + phase >= 4294967296) {
          break;
        }
        const cycle = (base + phase) / rows;
        const c = this.columnOf(this.x(i, cycle, distance), distance, columns);
        if (deficit[c]! >= 1) {
          deficit[c]!--;
          this.wake(i, step, phase, cycle, mask);
          woke++;
          this.musicCredit--;
          break;
        }
      }
    }
    // (the workers' layout is sent again now and then, with the new phases: the drops woken are then known to them)
    if (this.wokenCount > 0 && time - this.staticAt > MUSIC_STATIC) {
      this.staticAt = time;
      this.layout = Float32Array.from(this.layout);
      this.layoutDirty = true;
      this.woken.fill(0);
      this.wokenCount = 0;
    }
  }

  // drop i's fall now ends (its place in this fall in its column is more than the music calls for): it shows no more of it, its next falls as before
  despawn(i: number, cycle: number) {
    const life = this.life;
    this.setLife(i, life[i * 4], life[i * 4 + 1] === NONE ? cycle : Math.min(life[i * 4 + 1], cycle), cycle + 1);
  }

  // drop i begins a fall at the top now: its phase changed so that its head is at the first row in a step now (the fall `cycle` of its new phase), its landing moved, its
  // fall shown from there
  wake(i: number, step: number, phase: number, cycle: number, mask: number) {
    if (this.inWheel[i]) {
      // (out of the slot its landing was in)
      const old = this.nextLanding(i, step) & mask;
      let at = this.slots[old]!;
      if (at === i) {
        this.slots[old] = this.nextInSlot[i]!;
      } else {
        while (at >= 0 && this.nextInSlot[at] !== i) {
          at = this.nextInSlot[at]!;
        }
        if (at >= 0) {
          this.nextInSlot[at] = this.nextInSlot[i]!;
        }
      }
      this.inWheel[i] = 0;
    }
    this.layout![i * 4 + 2] = phase;
    this.layoutDirty = true;
    if (!this.woken[i]) {
      this.woken[i] = 1;
      this.wokenCount++;
    }
    this.setLife(i, cycle, NONE, NONE);
    this.schedule(i, this.nextLanding(i, step));
  }

  // drop i's fall `next` begins when the fall before landed: shown or not by the share of the column it falls in (a hash of the drop and the fall under the share),
  // by its life's falls shown ([first, end) and from again)
  gate(i: number, next: number) {
    const shares = this.shares;
    if (!shares || i >= this.active) {
      return;
    }
    const distance = this.layout![i * 4];
    const share = shares[this.columnOf(this.x(i, next, distance), distance, shares.length)]! * this.musicFillPart();
    const accepted = M.hash(((Math.imul(i, 2246822519) ^ Math.imul(next, 3266489917)) + SEED) >>> 0) / 4294967296 < share;
    const shown = this.shows(i, next);
    const life = this.life;
    if (accepted) {
      if (!shown) {
        this.setLife(i, next, NONE, NONE);
      }
    } else if (shown) {
      this.setLife(i, life[i * 4], life[i * 4 + 1] === NONE ? next : life[i * 4 + 1], next + 1);
    } else if (life[i * 4 + 2] !== NONE && life[i * 4 + 2] < next + 1) {
      this.setLife(i, life[i * 4], life[i * 4 + 1], next + 1);
    }
  }

  // the screen's columns of Font size Max (the music's chance is by column)
  musicColumns() {
    return Math.max(1, Math.ceil(this.width / this.fontMax));
  }

  // the rows a drop falls on average (from the world's ceiling at its distance to the water, over the distances the drops are at, in cells)
  averageFall() {
    const near = this.nearest();
    const far = this.furthest();
    let sum = 0;
    const n = 16;
    for (let k = 0; k < n; k++) {
      sum += M.Camera.ceilingAt(near + ((far - near) * (k + 0.5)) / n) / CELL;
    }
    return Math.max(1, sum / n);
  }

  // the drops wanted again: more come in (start), fewer finish their fall
  retarget() {
    [this.inView, this.wanted] = this.targets();
    if (!this.layout) {
      return;
    }
    const step = this.lastStep;
    for (let i = this.active; i < this.wanted; i++) {
      this.start(i, step);
    }
    for (let i = this.wanted; i < this.active; i++) {
      this.finish(i, step);
    }
    const before = this.active;
    this.active = this.wanted;
    this.reach = Math.max(this.reach, this.active);
    this.gateFirst(before, this.active);
  }

  // ---- each drop's life ----

  setLife(i: number, first: number, end: number, again: number) {
    this.life[i * 4] = first;
    this.life[i * 4 + 1] = end;
    this.life[i * 4 + 2] = again;
    this.dirty(i);
  }

  dirty(i: number) {
    this.dirtyFirst = Math.min(this.dirtyFirst, i);
    this.dirtyLast = Math.max(this.dirtyLast, i);
  }

  // does drop i show its fall f?
  shows(i: number, f: number) {
    const life = this.life;
    return (f >= life[i * 4] && f < life[i * 4 + 1]) || f >= life[i * 4 + 2];
  }

  // will it show any fall after f?
  showsAfter(i: number, f: number) {
    return f + 1 < this.life[i * 4 + 1] || this.life[i * 4 + 2] !== NONE;
  }

  // a clean screen (none falling: they come in), or with Steady start the settled rain
  // (RainLayout.restartOf, into the arrays it has)
  restart() {
    if (!this.layout) {
      return;
    }
    [this.inView, this.wanted] = this.targets();
    const camera = this.camera;
    const params = {
      layout: this.layout,
      slots: this.slots.length,
      wanted: this.wanted,
      steady: this.steady,
      lastStep: this.lastStep,
      eyeHeight: camera.eyeY(),
      pitch: camera.tilt(),
      halfFov: camera.halfFov(),
      floor: this.layoutFloor,
    };
    this.adopt(RL.restartOf(params, this));
  }

  // the settled rain at once (after a jump in time: as if it had filled meanwhile)
  settle() {
    const steady = this.steady;
    this.steady = true;
    this.restart();
    this.steady = steady;
  }

  // whether the view now (the eye's height and the pitch with the mouse parallax's shifts) is past the tolerance from the one the drops were laid out for
  viewDrifted(): boolean {
    const tolerance = M.MouseParallax.TOLERANCE;
    return Math.abs(this.camera.tilt() - this.layoutPitch) > tolerance.pitch || Math.abs(this.camera.eyeY() - this.layoutEye) > tolerance.eye;
  }

  // the height of the top of the view at a distance (the view now, with the mouse parallax's shifts)
  topAt(distance: number) {
    const camera = this.camera;
    return camera.eyeY() + distance * Math.tan(camera.tilt() + camera.halfFov());
  }

  // the first of drop i's falls whose head comes down past the top of the view from a step on:
  // the fall now if its head is above the view, else the next
  firstFrom(i: number, step: number) {
    const d = this.dropAt(i, step, this.at);
    return d.headY > this.topAt(-d.z) ? d.cycle : d.cycle + 1;
  }

  // drop i comes in at a step: from the first of its falls coming down into the view (one
  // still fading from its end goes on, or shows again from there); scheduled in the wheel
  start(i: number, step: number) {
    const first = this.firstFrom(i, step);
    if (this.life[i * 4] !== NONE && i < this.reach) {
      if (this.cycleAt(i, step) < this.life[i * 4 + 1]) {
        this.setLife(i, this.life[i * 4], NONE, NONE);
      } else {
        this.setLife(i, this.life[i * 4], this.life[i * 4 + 1], first);
      }
    } else {
      this.setLife(i, first, NONE, NONE);
    }
    if (!this.inWheel[i]) {
      this.schedule(i, this.nextLanding(i, step));
    }
  }

  // drop i ends: its fall now finishes (or, its head not in view yet, ends at once), its trail
  // fading where it lands
  finish(i: number, step: number) {
    const d = this.dropAt(i, step, this.at);
    const end = d.headY > this.topAt(-d.z) ? d.cycle : d.cycle + 1;
    this.setLife(i, this.life[i * 4], Math.max(this.life[i * 4], end), NONE);
  }

  // the drops that ended and faded let go
  fade(step: number) {
    while (this.reach > this.active) {
      const j = this.reach - 1;
      if (this.life[j * 4] !== NONE) {
        const d = this.dropAt(j, step, this.at);
        const end = this.life[j * 4 + 1];
        if (this.life[j * 4 + 2] !== NONE || !(d.cycle > end || (d.cycle === end && d.head >= this.trail))) {
          break;
        }
        this.setLife(j, NONE, 0, NONE);
      }
      this.reach--;
    }
  }

  // the layout (when laid out) and the lives changed since the last time (their rows), uploaded
  upload() {
    const gl = this.gl;
    const rows = COUNT / DROPS_ACROSS;
    if (!this.texture) {
      this.texture = this.createTexture();
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.drops);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, DROPS_ACROSS, rows);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.lifeTexture = this.createTexture();
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.dropLife);
      gl.bindTexture(gl.TEXTURE_2D, this.lifeTexture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32UI, DROPS_ACROSS, rows);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    if (this.layoutDirty) {
      this.layoutDirty = false;
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.drops);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DROPS_ACROSS, rows, gl.RGBA, gl.FLOAT, this.layout);
    }
    if (this.dirtyLast < this.dirtyFirst) {
      return;
    }
    const first = Math.floor(this.dirtyFirst / DROPS_ACROSS);
    const count = Math.floor(this.dirtyLast / DROPS_ACROSS) - first + 1;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.dropLife);
    gl.bindTexture(gl.TEXTURE_2D, this.lifeTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, first, DROPS_ACROSS, count, gl.RGBA_INTEGER, gl.UNSIGNED_INT, this.life, first * DROPS_ACROSS * 4);
    this.dirtyFirst = COUNT;
    this.dirtyLast = -1;
  }

  // the layout owed and the uploads; the frame's uniforms set once (both passes draw with them:
  // only uMirror and uFirstDrop are set per pass and chunk)
  update(time: number) {
    this.applyLayout();
    if (!this.layout || !this.program) {
      return;
    }
    this.upload();
    const gl = this.gl;
    const u = this.program.use();
    gl.uniform1ui(u.uStep, this.clock.stepAt(time) >>> 0);
    gl.uniform1i(u.uGlyphs, this.atlas.count);
    gl.uniform1i(u.uTrail, this.trail);
    if (M.TEST) {
      gl.uniform1i(u.uOnlyDrop, this.onlyDrop);
      gl.uniform1i(u.uHeadOnly, this.headOnly ? 1 : 0);
      gl.uniform1f(u.uViewScale, this.viewScale);
    }
    gl.uniform3fv(u.uColor1, this.colors[0]);
    gl.uniform3fv(u.uColor2, this.colors[1]);
    gl.uniform3fv(u.uColor3, this.colors[2]);
    gl.uniform3fv(u.uColor4, this.colors[3]);
    // (React to music: the light multiple by bearing across the window, the window's width at distance 1; 0: none)
    const light = this.musicLight;
    if (light) {
      gl.uniform4fv(u.uMusicLight, light);
    }
    gl.uniform1f(u.uMusicSpan, light ? 2 * (this.width / this.height) * Math.tan(M.Camera.halfFov()) : 0);
    gl.uniform1i(u.uCustom, this.custom ? 1 : 0);
    gl.uniform1i(u.uWave, this.wave ? 1 : 0);
    gl.uniform1f(u.uWaveWidth, this.waveWidth);
    const now = this.phaseAt(this.clock.stepAt(time));
    gl.uniform1f(u.uWaveNow, now - Math.floor(now));
    gl.uniform1f(u.uWavePerStep, this.wavePerStep);
    gl.uniform1f(u.uHead, this.head);
    gl.uniform1f(u.uFloor, this.layoutFloor === "screen" ? 1 : 0);
    // (the newest characters' program: the frame's values; drawNewest sets each step's)
    const n = this.newest.use();
    gl.uniform1i(n.uGlyphs, this.atlas.count);
    gl.uniform1f(n.uFloor, this.layoutFloor === "screen" ? 1 : 0);
    gl.uniform3fv(n.uColor1, this.colors[0]);
    gl.uniform3fv(n.uColor2, this.colors[1]);
    gl.uniform3fv(n.uColor3, this.colors[2]);
    gl.uniform3fv(n.uColor4, this.colors[3]);
    gl.uniform1i(n.uCustom, this.custom ? 1 : 0);
    gl.uniform1i(n.uWave, this.wave ? 1 : 0);
    gl.uniform1f(n.uWaveWidth, this.waveWidth);
    gl.uniform1f(n.uWavePerStep, this.wavePerStep);
    gl.uniform1f(n.uFar, this.furthest() * 1.01);
    const c = this.colorState;
    c.colors = this.colors;
    c.custom = this.custom;
    c.wave = this.wave;
    c.width = this.waveWidth;
    c.now = now - Math.floor(now);
  }

  // the newest characters of steps from..to (each drop's character at its head, one instance a
  // drop a step) whose cells on the screen meet the box (x0, y0, x1, y1: device pixels from the
  // top left; shift: the scene's shift across, device pixels), into the framebuffer bound with
  // its depth test on (the caller's); ids: the tests' view of each stamp as its id (M.TEST only)
  // An empty box (x0 > x1) draws one instance whatever the drops (its program warmed: no cell
  // meets the box, nothing is drawn), even before the drops are laid out
  drawNewest(from: number, to: number, box: Float32Array, shift: number, ids: boolean) {
    const gl = this.gl;
    if (!this.newest || to < from) {
      return;
    }
    const empty = box[0] > box[2];
    if (!empty && (this.reach === 0 || !this.layout)) {
      return;
    }
    const u = this.newest.use();
    gl.uniform4fv(u.uBox, box);
    if (empty) {
      gl.uniform1i(u.uFirstDrop, 0);
      gl.bindVertexArray(this.quad.plain);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
      return;
    }
    gl.uniform1f(u.uShift, shift);
    gl.uniform1f(u.uRanks, to - from + 1);
    if (M.TEST) {
      gl.uniform1i(u.uIds, ids ? 1 : 0);
    }
    gl.bindVertexArray(this.quad.plain);
    // in chunks of the guard's drops, each sent to the GPU on its own (see GpuGuard)
    const chunk = this.guard.size("rain newest", "chunk");
    this.guard.begin("rain newest", "chunk");
    for (let s = from; s <= to; s++) {
      const phase = this.phaseAt(s);
      gl.uniform1ui(u.uStep, s >>> 0);
      gl.uniform1f(u.uWaveNow, phase - Math.floor(phase));
      gl.uniform1f(u.uRank, to - s);
      for (let first = 0; first < this.reach; first += chunk) {
        gl.uniform1i(u.uFirstDrop, first);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.min(chunk, this.reach - first));
        this.guard.piece();
      }
    }
    this.guard.end();
  }

  // ---- a drop's fall ----

  // how far drop i has fallen at a step, counted in rows since the start (in 32 bits, as the
  // shader: (step / 16) x speed + (step % 16) x speed / 16, exactly step x speed / 16)
  total(i: number, step: number) {
    return RL.total(this.layout!, i, step);
  }

  cycleAt(i: number, step: number) {
    return Math.floor(this.total(i, step) / this.layout![i * 4 + 3]);
  }

  // a drop's place across in a fall: new for every fall
  x(i: number, cycle: number, distance: number) {
    const across = M.hash(((Math.imul(i, 2654435761) ^ Math.imul(cycle, 40503)) + SEED) >>> 0) / 4294967296;
    return (across * 2 - 1) * distance * M.Camera.SPAN;
  }

  // its falls finished by a step (a fall finishes when its head reaches its lowest row)
  falls(i: number, step: number) {
    return RL.falls(this.layout!, i, step);
  }

  landed(i: number, step: number) {
    return RL.landed(this.layout!, i, step);
  }

  // the first step after `after` in which drop i lands
  nextLanding(i: number, after: number) {
    return RL.nextLanding(this.layout!, i, after);
  }

  schedule(i: number, step: number) {
    const slot = step & (this.slots.length - 1);
    this.nextInSlot[i] = this.slots[slot];
    this.slots[slot] = i;
    this.inWheel[i] = 1;
  }

  // drop i at a step: its head (rows from the top of its fall), rows, fall, place (x, z), its
  // head's height, whether it lands in this step (its head reaches its lowest row) and whether
  // its fall shows; into an object given, or a new one
  dropAt(i: number, step: number, into: Partial<DropState> = {}): DropState {
    const rows = this.layout![i * 4 + 3];
    const distance = this.layout![i * 4];
    const total = this.total(i, step);
    const cycle = Math.floor(total / rows);
    const head = total - cycle * rows;
    into.head = head;
    into.rows = rows;
    into.cycle = cycle;
    into.landed = this.landed(i, step);
    into.shown = this.shows(i, cycle);
    into.x = this.x(i, cycle, distance);
    into.z = -distance;
    into.headY = (rows - 1 - head) * CELL + this.floorAt(distance);
    into.color = into.color || new Float32Array(3);
    return into as DropState;
  }

  reset() {
    this.applyLayout(true);
    this.time = 0;
    // (the music's scans and credit start again with the time)
    this.musicAt = -Infinity;
    this.musicCredit = 0;
    this.lastStep = 0;
    this.wavePhase = 0;
    this.waveStep = 0;
    this.restart();
  }

  // the steps since the last time, each with its landings and the drops that ended let go; after
  // a jump past what a frame can move (or back), the settled rain from there
  advance(time: number) {
    // (a frame's list is the quality's of that frame: gone as the simulation moves on to the next)
    this.dropListed = false;
    this.applyLayout();
    this.time = time;
    const step = this.clock.stepAt(time);
    if (!this.layout) {
      return;
    }
    if (step - this.lastStep > this.clock.most || step < this.lastStep) {
      this.lastStep = step;
      this.settle();
    }
    // (the worker's layout for this very step, before its steps)
    if (this.ready && this.ready.at === this.lastStep) {
      this.swap();
    }
    let mask = this.slots.length - 1;
    for (let s = this.lastStep + 1; s <= step; s++) {
      let i = this.slots[s & mask];
      this.slots[s & mask] = -1;
      while (i >= 0) {
        const next = this.nextInSlot[i];
        this.inWheel[i] = 0;
        const d = this.dropAt(i, s, this.landing);
        if (M.TEST && !d.landed) {
          this.wrongLandings++;
        }
        if (d.shown) {
          this.colorOf(i, d, s, d.color);
          this.onLand(d, this.clock.timeOf(s));
        }
        this.gate(i, d.cycle + 1);
        if (this.showsAfter(i, d.cycle)) {
          this.schedule(i, this.nextLanding(i, s));
        }
        i = next;
      }
      this.fade(s);
      if (this.ready && this.ready.at === s) {
        this.lastStep = s;
        this.swap();
        mask = this.slots.length - 1;
      }
    }
    this.lastStep = Math.max(this.lastStep, step);
    this.spawnByMusic(time);
    // (a layout asked for a step now past: asked again)
    if (this.pending && this.pending.at < this.lastStep) {
      this.drop();
      this.relay = true;
    }
  }

  // the direct draw of the listed drops only: the list sent once to the start of its buffer, each chunk of the guard's size drawn
  // from its own place in it (the attribute's offset: one value for each uTrail instances), sent on its own
  drawListed(u: ReturnType<ShaderProgram["use"]>, name: string, chunk: number, list: Uint32Array, count: number, base: number) {
    const gl = this.gl;
    if (count === 0) {
      return;
    }
    gl.uniform1i(u.uListed, 1);
    gl.bindVertexArray(this.listArray);
    gl.vertexAttribDivisor(M.ATTRIBUTES.aDrop, this.trail);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.listBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, base, list, 0, count);
    this.guard.begin(name, "chunk");
    for (let first = 0; first < count; first += chunk) {
      gl.vertexAttribIPointer(M.ATTRIBUTES.aDrop, 1, gl.UNSIGNED_INT, 0, base + first * 4);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.min(chunk, count - first) * this.trail);
      this.guard.piece();
    }
    this.guard.end();
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.uniform1i(u.uListed, 0);
  }

  // draws the drops' characters at the frame's step (update's; mirrored: their reflection, with
  // their ink's distance as a second output)
  draw(step: number, mirror: boolean) {
    const gl = this.gl;
    if (this.reach === 0) {
      return;
    }
    const u = this.program.use();
    gl.uniform1f(u.uMirror, mirror ? -1 : 1);
    // (the cut of faint trail cells is the direct view's: the mirrored picture's distance is written wherever ink is, however faint)
    gl.uniform1f(u.uFogOnce, this.lod && !mirror ? M.QualityRain.Lod.FOG_ONCE_DISTANCE : 0);
    gl.uniform1f(u.uLightCut, this.lod && !mirror ? M.QualityRain.Lod.LIGHT_CUT : 0);
    gl.uniform1i(u.uCovered, this.covered ? 1 : 0);
    M.GlyphAtlas.setNearness(gl, u, mirror ? null : this.nearness);
    const name = mirror ? "rain mirrored" : "rain";
    const chunk = this.guard.size(name, "chunk");
    if (this.dropListed && this.camera.version === this.listVersion) {
      if (mirror) {
        this.drawListed(u, name, chunk, this.mirrorList, this.mirrorCount, COUNT * 4);
      } else {
        this.listedDrops = this.dropCount;
        this.drawListed(u, name, chunk, this.dropList, this.dropCount, 0);
      }
      return;
    }
    gl.uniform1i(u.uListed, 0);
    if (!mirror) {
      this.listedDrops = -1;
    }
    gl.bindVertexArray(this.quad.plain);
    // in chunks of the guard's drops, each sent to the GPU on its own (see GpuGuard)
    this.guard.begin(name, "chunk");
    for (let first = 0; first < this.reach; first += chunk) {
      gl.uniform1i(u.uFirstDrop, first);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.min(chunk, this.reach - first) * this.trail);
      this.guard.piece();
    }
    this.guard.end();
  }
}

if (M.TEST) {
  // the drops whose shown fall lands in a step (every drop drawn looked at: for the tests)
  Rain.prototype.landings = function (this: Rain, step: number) {
    const out: number[] = [];
    for (let i = 0; i < this.reach; i++) {
      if (this.landed(i, step) && this.shows(i, this.cycleAt(i, step))) {
        out.push(i);
      }
    }
    return out;
  };
}

// the distance of a unit (0 to 1) between near and far, as many per square metre (the
// distance's density grows with it): the drops', and the strikes'
Rain.distanceAt = RL.distanceAt;
// (the pure functions, models/rainlayout.ts)
Rain.layout = RL.layout;
Rain.restartOf = RL.restartOf;
Rain.COUNT = COUNT;
Rain.CELL = CELL;
Rain.RAIN_SCALE = RAIN_SCALE;
Rain.STEP_RATE = STEP_RATE;
Rain.SEED = SEED;
Rain.FURTHEST = FURTHEST;
Rain.IMPACT = IMPACT;
Rain.DISTANCE_SIZE = DISTANCE_SIZE;

// a drop's cells: its layout (from uDrops) and its life (from uLife), and at a step the cell it
// drew age steps ago (in this fall, or in the last one: its trail where it landed), whether its
// fall shows, and its place across in a fall (new for every fall); after M.HASH_GLSL
const CELL_GLSL = fill(CELL_SOURCE, { "CELL.toFixed(4)": CELL.toFixed(4), "SEED": SEED, "M.Camera.SPAN.toFixed(4)": M.Camera.SPAN.toFixed(4), "DROPS_ACROSS": DROPS_ACROSS });

// (test: with the tests' uniforms, only one drop or only the heads drawn)
Rain.vertex = (glsl, test) => fill(VERTEX_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "M.Camera.GLSL": M.Camera.GLSL, "glsl.fog": glsl.fog, "M.GlyphAtlas.VERTEX_GLSL": M.GlyphAtlas.VERTEX_GLSL, "M.HASH_GLSL": M.HASH_GLSL, "CELL_GLSL": CELL_GLSL, "WAVE_SCREEN.toFixed(6)": WAVE_SCREEN.toFixed(6), "COLOR_GLSL": COLOR_SOURCE });
// (the newest characters' shaders: drawNewest)
Rain.newestVertex = (test) => fill(NEWEST_VERTEX_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "M.Camera.GLSL": M.Camera.GLSL, "M.HASH_GLSL": M.HASH_GLSL, "CELL_GLSL": CELL_GLSL, "WAVE_SCREEN.toFixed(6)": WAVE_SCREEN.toFixed(6), "COLOR_GLSL": COLOR_SOURCE });
Rain.newestFragment = (test) => fill(NEWEST_FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "" });

M.Rain = Rain;
