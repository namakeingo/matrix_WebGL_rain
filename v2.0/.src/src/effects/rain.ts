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
// 2026-11-10: with a driver (the splashes' task: RainDriver) the steps are made in the task's tick (models/rainsimtick.ts, on a worker when there is one), the calls made to the wheel kept in
// order for it (RainCall), the layout's fields set together (installLayout), the colours set by setColor.
// 2026-11-10: the landings wheel and the state it keeps moved to a pure model (models/rainwheel.ts, RainWheel), which the rain delegates to: the view is copied to it before each call, the
//   state it keeps is read and set through the rain's own fields (accessors); the scene worker's layout protocol and the GL side stay here.
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
import type { RainWheel, DropState } from "../models/rainwheel";
import type { RainPart, RainCall, RainSimPacket } from "../models/rainsimtick";

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

// a drop at a step (RainWheel.dropAt): its head (rows from the top of its fall), rows, fall, whether it lands in this step and whether its fall shows, its place (x, z), its head's height, its colour
export type { DropState };

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
const DISTANCE_SIZE = M.RainWheel.DISTANCE_SIZE;
const FURTHEST = DISTANCE_SIZE;
// matrix_web_rain's drops for a density (its RainScale)
const RAIN_SCALE = M.RainWheel.RAIN_SCALE;
// the steps a second at the default Speed (70): STEP_RATE x (100 - 70) / (100 - Speed)
const STEP_RATE = 30;
const SEED = RL.SEED;
const IMPACT = 1;
// the width of a 16:9 view as a bearing (x / z): the colours' unit across the world
// whether two spawn planes are the same (null: the world's ceiling)
// (within MouseParallax.TOLERANCE: the view the mouse parallax moves does not lay the drops out again for a drift smaller than that)
const sameSpawn = (a: SpawnPlane | null, b: SpawnPlane | null): boolean => {
  if (a === b) {
    return true;
  }
  const tolerance = M.MouseParallax.TOLERANCE;
  return !!a && !!b && Math.abs(a.eyeHeight - b.eyeHeight) <= tolerance.eye && Math.abs(a.pitch - b.pitch) <= tolerance.pitch && a.halfFov === b.halfFov;
};
const WAVE_SCREEN = M.RainWheel.waveScreen();
// the state the wheel (models/rainwheel.ts) keeps, read and set through the rain's own fields
const WHEEL_FIELDS = [
  "life", "layout", "slots", "nextInSlot", "inWheel", "active", "reach", "dirtyFirst", "dirtyLast", "lastStep", "wanted", "inView", "shares", "woken", "wokenCount", "fillPart", "fillFor",
  "musicCredit", "meanFall", "meanFallFor", "musicLight", "musicShown", "musicDeficit", "musicFree", "musicShowing", "musicOut", "musicAt", "staticAt", "trail", "time", "steady", "height",
  "width", "density", "fontMax", "fontMin", "layoutDirty", "layoutFloor", "layoutPitch", "layoutEye", "tiltResponsiveness", "wavePerStep", "waveStep", "wavePhase", "waveWidth", "waveSpeed",
  "wave", "custom", "colors", "at", "landing", "wrongLandings",
] as const;
// the settings the render thread sets on the wheel through the rain's own fields: kept in order among the calls made to the wheel (RainCall "set") while a task keeps a copy of it
const RECORDED_SETS: Record<string, boolean> = { width: true, height: true, density: true, fontMin: true, fontMax: true, steady: true, custom: true, tiltResponsiveness: true };

// what the rain asks of the task that runs its steps (the splashes: effects/splashes.ts, src/index.ts gives it): whether it does (a task exists), whether the calls made to the wheel are
// to be kept for it, and the rain's part of the frame given to it
export interface RainDriver {
  drives(): boolean;
  recording(): boolean;
  rainStep(part: RainPart): void;
}

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
  // the landings wheel and the state of the drops (models/rainwheel.ts): the fields below declared without a value are the wheel's, read and set here
  wheel: RainWheel;
  // the task that runs the wheel's steps (null: the rain steps its own wheel), whether the landings make splashes (the collision plane: src/index.ts), the calls made to the wheel since
  // the last frame while the task keeps a copy of it, and the scene worker's layout the frame's part carries (taken by the task: its answer says whether it was swapped in)
  driver: RainDriver | null;
  collides: (() => boolean) | null;
  calls: RainCall[];
  callSeq: number;
  partReady: RainResult | null;
  declare life: RainWheel["life"];
  declare layout: RainWheel["layout"];
  declare slots: RainWheel["slots"];
  declare nextInSlot: RainWheel["nextInSlot"];
  declare inWheel: RainWheel["inWheel"];
  declare active: number;
  declare reach: number;
  declare dirtyFirst: number;
  declare dirtyLast: number;
  declare lastStep: number;
  declare wanted: number;
  declare inView: number;
  // React to music (models/musicrain.ts): each column's share of the settled rain's falls (the columns across the window, from the left; null: the settled rain)
  declare shares: Float32Array | null;
  // the drops whose phase was changed to begin a fall now (React to music: spawnByMusic): the quality's levels, worked out by the workers from the layout they were
  // sent, do not know their new phase, so they are always drawn; the count
  declare woken: Uint8Array;
  declare wokenCount: number;
  // the part of its drops the normal rain has in the view at a time (the rest are above it, waiting), and what it was worked out for
  declare fillPart: number;
  declare fillFor: string;
  // the falls the music may begin: the credit (falls) and the time of the last scan; the times of the last scan and of the last refresh of the workers' layout (s)
  declare musicCredit: number;
  declare meanFall: number;
  declare meanFallFor: Float32Array | null;
  // the drops' light emittance across the window (React to music: 128 bins, the worker's reply; null: none)
  declare musicLight: Float32Array | null;
  declare musicShown: Int32Array;
  declare musicDeficit: Float32Array;
  declare musicFree: Int32Array;
  declare musicShowing: Int32Array;
  declare musicOut: Int32Array;
  declare musicAt: number;
  declare staticAt: number;
  // the trail's cells drawn (the layout's), the last time moved on to, Steady start, the window, the settings
  declare trail: number;
  declare time: number;
  declare steady: boolean;
  declare height: number;
  declare width: number;
  declare density: number;
  declare fontMax: number;
  declare fontMin: number;
  declare layoutDirty: boolean;
  // the floor, the pitch and the eye's height the layout in use was made for, with the mouse parallax's shift of it
  declare layoutFloor: FloorKind;
  declare layoutPitch: number;
  declare layoutEye: number;
  declare tiltResponsiveness: number;
  declare wavePerStep: number;
  declare waveStep: number;
  declare wavePhase: number;
  declare waveWidth: number;
  declare waveSpeed: number;
  declare wave: boolean;
  declare custom: boolean;
  declare colors: Float32Array[];
  declare at: Partial<DropState>;
  declare landing: Partial<DropState>;
  // (the tests': landings taken from the wheel that were none, with M.TEST)
  declare wrongLandings: number;
  // the floor the drops fall to (models/floor.ts) as set
  floorKind: FloorKind;
  // React to music: the falls start from the top of the view (the spawn plane)
  tiltOn: boolean;
  layoutSpawn: SpawnPlane | null;
  ready: RainResult | null;
  pending: { generation: number; at: number } | null;
  layGeneration: number;
  worker: SceneWorker | null;
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
  hashes: Uint32Array | null;
  covered: boolean;
  viewScale: number;
  nextTrail: number;
  head: number;
  relay: boolean;
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
    // (the wheel reports a landing to the field as it is when it lands: it may be replaced)
    this.wheel = new M.RainWheel(this.clock, (drop, time) => this.onLand(drop, time));
    this.driver = null;
    this.collides = null;
    this.calls = [];
    this.callSeq = 0;
    this.partReady = null;
    // a new layout owed (a setting that lays the drops out again), and the layout's upload owed
    this.relay = false;
    this.floorKind = "water";
    this.tiltOn = false;
    this.layoutSpawn = null;
    this.head = M.GlyphAtlas.HEAD;
    // the trail's cells set (laid out in the next layout)
    this.nextTrail = TRAIL;
    // the trail's cells at the start (the wheel's: a layout is made for them)
    this.trail = TRAIL;
    // Steady start (src/index.ts: with Debug mode): at a reset all of them at once, as settled
    this.steady = false;
    // (the tests' scale of the characters' light: with M.TEST only)
    this.viewScale = 1;
    // whether the bolt covers what lies behind it this frame (Characters lightning: set by src/index.ts)
    this.covered = false;
    this.hashes = null;
    this.onlyDrop = -1;
    this.headOnly = false;
    this.texture = null;
    this.lifeTexture = null;
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
    // the scene's worker (null: the layouts made here), the last layout asked of it (its
    // generation), the one waiting ({ generation, at: its step }) and its result once there
    this.worker = null;
    this.layGeneration = 0;
    this.pending = null;
    this.ready = null;
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
      p110_setting_Color1: (rain: Rain, v: string) => rain.setColor(0, M.color(v)),
      p111_setting_Color2: (rain: Rain, v: string) => rain.setColor(1, M.color(v)),
      p112_setting_Color3: (rain: Rain, v: string) => rain.setColor(2, M.color(v)),
      p113_setting_Color4: (rain: Rain, v: string) => rain.setColor(3, M.color(v)),
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
    const trail = this.nextTrail;
    const spawn = this.spawnNow();
    const r = RL.layout({ hashes: this.hashes!, near: this.nearest(), far: this.furthest(), trail, spawn: spawn || undefined, floor: this.floorView() });
    this.layoutSpawn = spawn;
    this.installLayout(r.layout, trail, this.floorKind, this.camera.tilt(), this.camera.eyeY(), r.slots);
  }

  // ---- the wheel (models/rainwheel.ts): what the rain asks of it ----

  // the camera's view copied to the wheel (the calls that read it), and the wheel
  sync(): RainWheel {
    const camera = this.camera;
    const view = this.wheel.view;
    view.eyeX = camera.eyeX;
    view.eyeY = camera.eyeY();
    view.tilt = camera.tilt();
    view.halfFov = camera.halfFov();
    view.yaw = camera.yaw;
    return this.wheel;
  }

  // the nearest and the furthest distance (Font size Max and Min, Min at most Max)
  nearest() {
    return this.wheel.nearest();
  }

  furthest() {
    return this.wheel.furthest();
  }

  // a call made to the wheel kept for the task that runs its steps (while it keeps a copy of the wheel: a worker alive, a frame that forks), with the view the wheel has now: the task
  // runs the same call on its wheel at the same place among the steps. A setting set through the rain's field is kept the same way (recordSet)
  rec(name: string, args: unknown[], view = true) {
    const d = this.driver;
    if (!d || !d.recording()) {
      return;
    }
    const v = this.wheel.view;
    // (this wheel runs the call itself, right after: its sequence number is the last it has had)
    const q = ++this.callSeq;
    this.wheel.appliedSeq = q;
    this.calls.push({ n: name, v: view ? [v.eyeX, v.eyeY, v.tilt, v.halfFov, v.yaw] : null, a: args, q });
  }

  recordSet(key: string, value: unknown) {
    this.rec("set", [key, value], false);
  }

  // Custom color 1 to 4 (linear light)
  setColor(i: number, color: Float32Array) {
    this.rec("color", [i, color.slice()], false);
    this.colors[i] = color;
  }

  // the layout and what it was made for set in the wheel (the trail's cells, the floor, the pitch and the eye's height; a new wheel's number of slots when given)
  installLayout(layout: Float32Array, trail: number, floor: FloorKind, pitch: number, eye: number, slots: number | null) {
    this.rec("installLayout", [layout.slice(), trail, floor, pitch, eye, slots], false);
    this.wheel.installLayout(layout, trail, floor, pitch, eye, slots);
  }

  // a restart's lives and wheel taken (all the lives to upload)
  adopt(r: RestartResult) {
    const wheel = this.sync();
    this.rec("adopt", [{ life: r.life.slice(), slots: r.slots.slice(), nextInSlot: r.nextInSlot.slice(), inWheel: r.inWheel.slice(), active: r.active, reach: r.reach }]);
    wheel.adopt(r);
  }

  gateFirst(from: number, to: number, now = false) {
    const wheel = this.sync();
    this.rec("gateFirst", [from, to, now]);
    wheel.gateFirst(from, to, now);
  }

  // the steps' rate changed (Speed, src/index.ts's): the wave goes on from where it is at the new rate
  rateChanged() {
    this.rec("rateChanged", []);
    this.wheel.rateChanged();
  }

  // the wave: on or off, its speed and width; its phase going on from where it is (a step of the rain's), at the steps' rate now
  setWave(on: boolean, speed: number, width: number) {
    this.rec("setWave", [on, speed, width]);
    this.wheel.setWave(on, speed, width);
  }

  phaseAt(step: number) {
    return this.wheel.phaseAt(step);
  }

  stepsSince(i: number, step: number, rowsSince: number) {
    return this.wheel.stepsSince(i, step, rowsSince);
  }

  fallPhase(i: number, step: number, rowsSince: number) {
    return this.wheel.fallPhase(i, step, rowsSince);
  }

  // drop i's colour in its fall at a step (d: dropAt's description of it then), into a colour given
  colorOf<T extends Float32Array | number[]>(i: number, d: Pick<DropState, "x" | "z" | "head">, step: number, into: T) {
    return this.wheel.colorOf(i, d, step, into);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.retarget();
  }

  // the drops wanted in view (matrix_web_rain's rainCount x RAIN_SCALE) and in the pool (over the share of the world's width in view)
  targets() {
    return this.wheel.targets();
  }

  // the columns' shares of the falls (null: the settled rain's)
  setShares(shares: Float32Array | null) {
    const wheel = this.sync();
    this.rec("setShares", [shares ? shares.slice() : null]);
    wheel.setShares(shares);
  }

  // the drops' light emittance across the window (the multiple of their light by bin, left to right; null: none)
  setMusicLight(light: Float32Array | null) {
    this.rec("setMusicLight", [light ? light.slice() : null]);
    this.wheel.setMusicLight(light);
  }

  columnOf(x: number, distance: number, columns: number) {
    return this.sync().columnOf(x, distance, columns);
  }

  showingColumns(columns: number, into?: Int32Array) {
    return this.sync().showingColumns(columns, into);
  }

  musicFillPart() {
    return this.sync().musicFillPart();
  }

  meanFallSeconds() {
    return this.wheel.meanFallSeconds();
  }

  musicRate() {
    return this.sync().musicRate();
  }

  // a scan of the drops against the columns' shares (not while a layout is waited for)
  spawnByMusic(time: number) {
    const wheel = this.sync();
    this.rec("spawnByMusic", [time, !!this.pending]);
    wheel.layoutPending = !!this.pending;
    wheel.spawnByMusic(time);
  }

  despawn(i: number, cycle: number) {
    this.rec("despawn", [i, cycle]);
    this.wheel.despawn(i, cycle);
  }

  wake(i: number, step: number, phase: number, cycle: number, mask: number) {
    this.rec("wake", [i, step, phase, cycle, mask]);
    this.wheel.wake(i, step, phase, cycle, mask);
  }

  gate(i: number, next: number) {
    const wheel = this.sync();
    this.rec("gate", [i, next]);
    wheel.gate(i, next);
  }

  // the screen's columns of Font size Max (the music's chance is by column)
  musicColumns() {
    return this.wheel.musicColumns();
  }

  // the rows a drop falls on average (from the world's ceiling to the water, over the distances the drops are at, in cells)
  averageFall() {
    return this.wheel.averageFall();
  }

  // the drops wanted again: more come in (start), fewer finish their fall
  retarget() {
    const wheel = this.sync();
    this.rec("retarget", []);
    wheel.retarget();
  }

  setLife(i: number, first: number, end: number, again: number) {
    this.rec("setLife", [i, first, end, again]);
    this.wheel.setLife(i, first, end, again);
  }

  dirty(i: number) {
    this.rec("dirty", [i]);
    this.wheel.dirty(i);
  }

  // does drop i show its fall f?
  shows(i: number, f: number) {
    return this.wheel.shows(i, f);
  }

  // will it show any fall after f?
  showsAfter(i: number, f: number) {
    return this.wheel.showsAfter(i, f);
  }

  // a clean screen (none falling: they come in), or with Steady start the settled rain
  restart() {
    const wheel = this.sync();
    this.rec("restart", []);
    wheel.restart();
  }

  // the settled rain at once (after a jump in time: as if it had filled meanwhile)
  settle() {
    const wheel = this.sync();
    this.rec("settle", []);
    wheel.settle();
  }

  // the height of the top of the view at a distance (the view now, with the mouse parallax's shifts)
  topAt(distance: number) {
    return this.sync().topAt(distance);
  }

  firstFrom(i: number, step: number) {
    return this.sync().firstFrom(i, step);
  }

  start(i: number, step: number) {
    const wheel = this.sync();
    this.rec("start", [i, step]);
    wheel.start(i, step);
  }

  finish(i: number, step: number) {
    const wheel = this.sync();
    this.rec("finish", [i, step]);
    wheel.finish(i, step);
  }

  // the drops that ended and faded let go
  fade(step: number) {
    const wheel = this.sync();
    this.rec("fade", [step]);
    wheel.fade(step);
  }

  // the height of the floor at a distance for the layout in use
  floorAt(distance: number) {
    return this.sync().floorAt(distance);
  }

  total(i: number, step: number) {
    return this.wheel.total(i, step);
  }

  cycleAt(i: number, step: number) {
    return this.wheel.cycleAt(i, step);
  }

  // a drop's place across in a fall: new for every fall
  x(i: number, cycle: number, distance: number) {
    return this.wheel.x(i, cycle, distance);
  }

  // its falls finished by a step (a fall finishes when its head reaches its lowest row)
  falls(i: number, step: number) {
    return this.wheel.falls(i, step);
  }

  landed(i: number, step: number) {
    return this.wheel.landed(i, step);
  }

  // the first step after `after` in which drop i lands
  nextLanding(i: number, after: number) {
    return this.wheel.nextLanding(i, after);
  }

  schedule(i: number, step: number) {
    this.rec("schedule", [i, step]);
    this.wheel.schedule(i, step);
  }

  // drop i at a step: its head, rows, fall, place (x, z), its head's height, whether it lands in this step and whether its fall shows; into an object given, or a new one
  dropAt(i: number, step: number, into: Partial<DropState> = {}): DropState {
    return this.sync().dropAt(i, step, into);
  }

  reset() {
    this.applyLayout(true);
    const wheel = this.sync();
    this.rec("resetTime", []);
    wheel.resetTime();
  }

  // ---- the task that runs the wheel's steps (the splashes': effects/splashes.ts, models/rainsimtick.ts) ----

  // the rain's part of the frame the task is given: the view, the time, whether a layout is pending, the scene worker's layout when its step is within the frame's steps (a copy: the
  // task keeps it to run the frame again; the original is the render thread's own to install, packetIn), the landings' flags; the calls come with the task's payload (takeCalls)
  makePart(time: number): RainPart {
    const wheel = this.sync();
    const v = wheel.view;
    const step = this.clock.stepAt(time);
    const ready = this.ready && this.ready.at <= step ? this.ready : null;
    this.partReady = ready;
    return {
      calls: [],
      before: this.calls.length,
      view: { eyeX: v.eyeX, eyeY: v.eyeY, tilt: v.tilt, halfFov: v.halfFov, yaw: v.yaw },
      time,
      layoutPending: !!this.pending,
      swap: ready ? M.RainSimTick.cloneSwap(ready) : null,
      impact: IMPACT,
      collide: this.collides ? this.collides() : false,
      size: CELL,
    };
  }

  // the calls kept for the task (taken)
  takeCalls(): RainCall[] {
    const calls = this.calls;
    this.calls = [];
    return calls;
  }

  // the task's packet of the frame taken in: the wheel's state a worker kept (applied), the layout swapped in at its step (the render thread's own side of it: the layout's spawn plane,
  // nothing pending), a layout asked for a step now past asked again
  packetIn(packet: RainSimPacket) {
    const out = packet.rain;
    if (!out) {
      return;
    }
    const ready = this.partReady;
    M.RainSimTick.applyRain(this.wheel, out, out.swapped ? ready : null);
    if (out.swapped && ready) {
      this.pending = null;
      this.ready = null;
      this.partReady = null;
      this.layoutSpawn = ready.spawn;
    }
    if (this.pending && this.pending.at < this.lastStep) {
      this.drop();
      this.relay = true;
    }
  }

  // the steps since the last time, each with its landings and the drops that ended let go; after a jump past what a frame can move (or back), the settled rain from there
  advance(time: number) {
    // (a frame's list is the quality's of that frame: gone as the simulation moves on to the next)
    this.dropListed = false;
    this.applyLayout();
    this.time = time;
    // (a task runs the steps in its tick: the frame's part is given to it)
    const driver = this.driver;
    if (driver && driver.drives()) {
      driver.rainStep(this.makePart(time));
      return;
    }
    const step = this.clock.stepAt(time);
    if (!this.layout) {
      return;
    }
    const wheel = this.sync();
    if (step - wheel.lastStep > this.clock.most || step < wheel.lastStep) {
      wheel.lastStep = step;
      wheel.settle();
    }
    // (the worker's layout for this very step, before its steps)
    if (this.ready && this.ready.at === wheel.lastStep) {
      this.swap();
    }
    for (let s = wheel.lastStep + 1; s <= step; s++) {
      wheel.runStep(s);
      if (this.ready && this.ready.at === s) {
        wheel.lastStep = s;
        this.swap();
      }
    }
    wheel.lastStep = Math.max(wheel.lastStep, step);
    this.spawnByMusic(time);
    // (a layout asked for a step now past: asked again)
    if (this.pending && this.pending.at < wheel.lastStep) {
      this.drop();
      this.relay = true;
    }
  }

  // whether the view now (the eye's height and the pitch with the mouse parallax's shifts) is past the tolerance from the one the drops were laid out for
  viewDrifted(): boolean {
    const tolerance = M.MouseParallax.TOLERANCE;
    return Math.abs(this.camera.tilt() - this.layoutPitch) > tolerance.pitch || Math.abs(this.camera.eyeY() - this.layoutEye) > tolerance.eye;
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

// the wheel's state read and set through the rain's own fields
for (const key of WHEEL_FIELDS) {
  Object.defineProperty(Rain.prototype, key, {
    get(this: Rain) {
      return (this.wheel as unknown as Record<string, unknown>)[key];
    },
    set(this: Rain, value: unknown) {
      if (RECORDED_SETS[key]) {
        this.recordSet(key, value);
      }
      (this.wheel as unknown as Record<string, unknown>)[key] = value;
    },
    configurable: true,
  });
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
