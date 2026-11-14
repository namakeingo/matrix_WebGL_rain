// Matrix 3D Rain WebGL 2.0: Matrix-style digital rain as a real 3D scene, in WebGL 2.0 (with
// WebGPU beside it), asynchronous, its frames on requestAnimationFrame. The bundle's entry and the
// coordinator: it loads every module in its order (each registers its classes into the namespace
// M), keeps the settings and the simulation's clock, drives the effects through their lifecycle
// (engine/effect.ts), puts them together in each frame, and runs the frames (class Wallpaper). It
// never defines an effect itself.
// - The simulation's clock moves on by the real time, at most M.MAX_GAP a frame, and not while
//   Wallpaper Engine pauses the wallpaper or the page is hidden (each kept on its own): a pause is
//   never caught up, and no animation frame is asked for meanwhile, nor while nothing can be drawn
//   (a failure, a lost context, the effects being made). The rain's steps count in it by the step
//   clock (engine/clock.ts), this module's: its rate set by Speed, the rain told of a new one,
//   shared by the rain and the splashes.
// - A frame that throws is a failure: shown in the readout, the frames stopped.
// - Every setting's last value is kept and given again to the effects made after a lost context
//   is restored, and so are WebGPU's hashes.
// - A failure at start is shown in the readout whatever the settings say after it.
// - A frame makes no objects: the callbacks are made once, the effects driven by index.
// - The tests' API (window.Rain3D, debug/testapi.ts) only with window.Matrix3DTest (set by the
//   test pages).
// The same bundle runs on the page and in every worker, which part by where it runs:
// - in a worker, by its name: "render" the renderer (workers/render.ts), "bolt" the bolt's shapes
//   (workers/boltworker.ts), "scene" the scene's one-off work (workers/sceneworker.ts), "hdr" the
//   HDR output's presenter (workers/hdrworker.ts), "quality" the quality pool's worker
//   (workers/qualityworker.ts); a worker of
//   another name does nothing but load;
// - on a page with the wallpaper's canvas (#gl): as shipped, the page's side (platform/page.ts:
//   the renderer in a worker of its own, or on the page); with the tests' flag, the renderer on the
//   page, driven synchronously by the tests;
// - on a page without it (the unit tests' page), or in Node.js: the namespace only.
// Where the renderer runs and its messages: platform/page.ts, workers/render.ts,
// platform/renderlink.ts.
//
// Changelog:
// 2026-11-13: the water gets the waves as its wave hit's source (waveSource).
// 2026-11-12: Support.workers and Support.sceneWorker are set to "" when the first attempt of the bolt's or the scene's worker fails or is refused (no Worker), so the readout says "Workers: no".
// 2026-11-12: the drops, the splashes and the strikes' feet rest on the waves' live height where the waves are stepped (applyWaterState gives them waterWaves; the quality units' margin is the highest wave read back).
// 2026-11-12: the mirrored picture larger than the view (Reflection.MARGIN): the fog read through its pixels in drawMirrored, the water's margin, the quality inputs' mirrored frustum.
// 2026-11-04: TypeScript, bundled (dist/bundle.js); the platforms, the shell, the renderer's
//   worker and the tests' API in modules of their own; no scripts loaded (one bundle).
// 2026-11-11: the lightning's onFailure reports an error of its asynchronous answers as the wallpaper's failure.
import "./engine/core";
import "./platform/renderlink";
import "./engine/clock";
import "./engine/gl";
import "./engine/guard";
import "./engine/parallax";
import "./engine/camera";
import "./models/floor";
import "./models/rainlayout";
import "./models/rainwheel";
import "./models/skylight";
import "./models/strikebias";
import "./models/hdroutput";
import "./models/hdrpack";
import "./models/waterstate";
import "./models/watertone";
import "./models/ripplespeed";
import "./models/wavesteps";
import "./models/wavelift";
import "./models/wavehit";
import "./models/quality/tasks";
import "./models/quality/jobs";
import "./models/quality/unit";
import "./models/quality/rain";
import "./models/quality/splashes";
import "./models/quality/bolt";
import "./models/quality/fog";
import "./models/quality/waves";
import "./models/quality/lightning";
import "./models/textvisibility";
import "./models/quality/water";
import "./models/quality/waterbands";
import "./models/quality/rainreuse";
import "./models/splashlaunch";
import "./models/splashsim";
import "./models/splashtick";
import "./models/rainsimtick";
import "./workers/splashworker";
import "./engine/glyphs";
import "./models/boltshape";
import "./models/boltitems";
import "./models/flash";
import "./models/letters";
import "./models/oled";
import "./models/musicfollower";
import "./models/musicrain";
import "./models/musicidle";
import "./models/mouseparallax";
import "./models/spawnbox";
import "./models/glyphrelief";
import "./platform/workers";
import "./workers/sceneworker";
import "./workers/boltworker";
import "./workers/hdrworker";
import "./engine/hdrtask";
import "./platform/jobtask";
import "./models/strikeplan";
import "./workers/strikeplanworker";
import "./models/fogplan";
import "./workers/fogplanworker";
import "./models/boltlist";
import "./workers/boltlistworker";
import "./models/frame";
import "./workers/frameworker";
import "./workers/textlayoutworker";
import "./workers/simmusicworker";
import "./platform/steppedtask";
import "./workers/qualityworker";
import "./workers/musicworker";
import "./workers/parallaxworker";
import "./platform/threadedtask";
import "./platform/servetask";
import "./models/snapshot";
import "./engine/qualitypool";
import "./engine/qualityframe";
import "./engine/webgpu";
import "./engine/hdrreadback";
import "./engine/hdrbuffers";
import "./engine/hdrpresenter";
import "./engine/hdrcheck";
import "./engine/hdrpath";
import "./debug/readout";
import "./debug/audiogen";
import "./debug/debug";
import "./engine/effect";
import "./effects/fog";
import "./effects/lightning";
import "./effects/bolt";
import "./effects/waves";
import "./effects/rain";
import "./effects/splashes";
import "./effects/reflection";
import "./effects/water";
import "./effects/bloom";
import "./effects/exposure";
import "./effects/text";
import { M, testOptions } from "./engine/core";
import { SPEED_REFERENCE, SPEED_START, SPEED_TOP } from "./engine/constants";
import { createSupport } from "./platform/support";
import { inWorker, workerScope } from "./platform/scope";
import { PagePlatform, startShell } from "./platform/page";
import type { RenderPlatform } from "./platform/page";
import { serveWorker } from "./workers/render";
import { installTestApi } from "./debug/testapi";
import type { WallpaperControl, Readout } from "./platform/page";
import type { WallpaperProperties, GeneralProperties } from "./globals";
import type { Matrix3DNamespace } from "./engine/namespace";
import type { Effect, PropertyValue, SharedGlsl } from "./engine/effect";
import type { QualityReport, QualityJob, QualityShared } from "./models/quality/types";
import type { QualityPool, QualityPoolTask, QualityResults } from "./engine/qualitypool";
import type { QualityFrame, QualityHost } from "./engine/qualityframe";
import type { QualityStatics, QualityParams } from "./models/quality/jobs";
import { AIR } from "./materials/fog";
import type { Programs, ProgramSources, Quad } from "./engine/gl";
import type { GpuGuard } from "./engine/guard";
import type { Camera } from "./engine/camera";
import type { WaterStateOf } from "./models/waterstate";
import type { GlyphAtlas } from "./engine/glyphs";
import type { StepClock } from "./engine/clock";
import type { WebGPUSupport } from "./engine/webgpu";
import type { HdrPath } from "./engine/hdrpath";
import type { BoltTask } from "./workers/boltworker";
import type { SceneWorker, SceneTask } from "./workers/sceneworker";
import type { PerfMeter, FrameHealth, AudioRate, RatePacer } from "./debug/debug";
import type { SimMusicTask } from "./workers/simmusicworker";
import type { LayoutJob, LayoutOut } from "./workers/textlayoutworker";
import type { JobTask } from "./platform/jobtask";
import type { SteppedTask } from "./platform/steppedtask";
import type { RainSimPacket } from "./models/rainsimtick";
import type { StrikePlanInput, StrikePlanOutput } from "./models/strikeplan";
import type { FogPlanInput, FogPlanOutput } from "./models/fogplan";
import type { BoltListInput, BoltListOutput } from "./models/boltlist";
import type { FrameInput, FrameOutput } from "./models/frame";
import type { MusicTask, MusicWorkerSettings } from "./workers/musicworker";
import type { ParallaxTask } from "./workers/parallaxworker";
import type { ThreadedTask } from "./platform/threadedtask";
import type { ParallaxLimits } from "./models/mouseparallax";
import type { AudioLevelsReport, PerformanceReport, MusicReport, MusicFollowerReport, OledReport } from "./platform/support";
import type { Fog } from "./effects/fog";
import type { Waves } from "./effects/waves";
import type { Lightning } from "./effects/lightning";
import type { Splashes } from "./effects/splashes";
import type { Bolt } from "./effects/bolt";
import type { Rain } from "./effects/rain";
import type { Reflection } from "./effects/reflection";
import type { Water } from "./effects/water";
import type { Exposure } from "./effects/exposure";
import type { Bloom } from "./effects/bloom";
import type { Text } from "./effects/text";

// how long the first start waits for the scene's worker to give the script's hashes (ms; else
// they are worked out here)
// the readout's text is renewed this often (ms)
const READOUT_EVERY = 1000;
// the Music readout's renewal while it is shown (ms)
const MUSIC_READOUT_EVERY = 100;
// the most frame fences pending at once for the latency measurement (the oldest is let go beyond it)
const FINE_MOST = 8;
// Simulated music's arrays a second (as Wallpaper Engine sends its own)
const MUSIC_RATE = 30;

// what was found, for the readout and the tests (this thread's: platform/support.ts)
const Support = createSupport();

// the settings the coordinator keeps itself
interface OwnSettings {
  // the HDR setting (p108): the HDR output wanted
  hdr: boolean;
  debugMode: boolean;
  showSupport: boolean;
  frameCap: number;
  // the planes and the ripples (the water's state, models/waterstate.ts)
  collisionPlane: boolean;
  reflectionPlane: boolean;
  ripples: boolean;
  wallpaperFps: number;
  // (null: GlyphAtlas.DEFAULT_SYMBOLS)
  symbols: string | null;
  steadyStart: boolean;
  // (the tests': Steady start whatever Debug mode)
  steadyTest: boolean;
  speed: number;
  // (Debug mode's: the Music, Performance and OLED readouts, Simulated music's kind or "real",
  // the Nearness view, Freeze)
  musicReadout: boolean;
  oledReadout: boolean;
  musicSource: string;
  performance: boolean;
  nearness: boolean;
  freeze: boolean;
  // Debug mode's quality mode (p628): "off", "inline" or "workers" (engine/qualityframe.ts)
  qualityMode: string;
  // the music's (p301 to p313): what the music worker is given with each audio array, and Music rain responsiveness
  music: MusicWorkerSettings;
  musicResponsiveness: number;
  // the mouse parallax (p629 to p632): on, the mode ("rotation" or "translation"), Parallax amount and Parallax delay (0 to 1)
  parallax: { on: boolean; mode: string; amount: number; delay: number };
}

// a setting's setter: it takes the setting's own kind (project.json's: a number, a bool, a text),
// so its parameter is checked both ways (a method's)
type OwnSetter = { set(v: PropertyValue): void }["set"];

// the tests' values and views (M.TEST only)
export interface TestValues {
  fogDistance: number;
  reflection: string;
  viewScale: number;
  noWaterLight: boolean;
  marched: boolean;
  // (when the start's steps came, ms since the page began; each program's own compile, ms)
  timings: Record<string, number>;
  compileMs: Record<string, number> | null;
  // (the GPU's state at each frame forced for the frames' health: Rain3D.gpuBusy; null: the fence)
  gpuBusy: boolean | null;
  // (the scene's worker used in the tests: Rain3D.useWorkers)
  workers?: boolean;
}

// the parts a test asks to draw (none: everything): sky, water, rain, splashes, bolt, text (the
// clock and the message over no light), or one of the water's test views (Water.MODES),
// noWaterLight
export type Parts = Record<string, boolean | undefined>;

// no parts asked for: everything drawn
const ALL: Parts = {};

export class Wallpaper implements WallpaperControl {
  platform: RenderPlatform;
  settings: OwnSettings;
  ownSettings: Record<string, OwnSetter>;
  // every setting's last value (Wallpaper Engine's key: value)
  properties: Record<string, PropertyValue>;
  time: number;
  lastNow: number | null;
  paused: boolean;
  hidden: boolean;
  looping: boolean;
  failure: boolean;
  drawn: number;
  manual: boolean;
  nextFrame: number;
  nextReadout: number;
  sized: number[] | null;
  test: TestValues | null;
  views: string[];
  programs: Programs | null;
  step: number;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  effects: Effect[] | null;
  programsReady: boolean;
  generation: number;
  hashes: Uint32Array | null;
  // the bolt's workers task (the shapes made by Lightning until a worker is alive, and while none is: platform/threadedtask.ts); boltWorker is it while a worker is alive
  boltTask: BoltTask | null;
  // the scene's worker task (inline until its worker is made, inline again when it fails: platform/threadedtask.ts) and the worker now (null: none alive)
  sceneTask: SceneTask | null;
  // who worked out the script's hashes the last time (the tests read it)
  hashesBy: string;
  ownHashes: Uint32Array | null;
  onFrame: (now: number) => void;
  perf: PerfMeter | null;
  // Debug mode's frames' health (dropped, missed, stalls), and the last frame's fence (null: none)
  health: FrameHealth | null;
  frameFence: WebGLSync | null;
  // when the frame's fence was made, and how long it had been pending when the next frame found the GPU still busy (ms)
  frameFenceAt: number;
  // the fences of the frames still pending, with when each was made, polled by a message loop (finePump) until they pass: the
  // time each frame's GPU work took to finish is the health's latency (a poll on the animation frames alone would round every
  // latency up to a display refresh)
  fineFences: (WebGLSync | null)[];
  fineTimes: Float64Array;
  fineCount: number;
  finePumping: boolean;
  fineChannel: MessageChannel | null;
  fencePendingMs: number;
  audioLevels: AudioLevelsReport;
  audioRate: AudioRate | null;
  // the music's reactions: the worker's client (null until made), the newest audio array, how many came and how many were taken, when the newest came (ms), the scale the
  // rain follows and whether the music has been driving (so it is let go once)
  musicClient: MusicTask | null;
  // the mouse parallax: the worker's client (null until made), the cursor's last place (-1 to 1 across the window, y up; inside: it is in the window) and the limits of the
  // offsets for the window's size (worked out again when the size changes)
  parallaxClient: ParallaxTask | null;
  // the worker-backed tasks by name (the tests kill one's worker and read its log: the test API's killWorker and taskInfo)
  tasks: Record<string, ThreadedTask>;
  pointerX: number;
  pointerY: number;
  pointerInside: boolean;
  parallaxLimits: ParallaxLimits | null;
  parallaxSize: number;
  parallaxMoving: boolean;
  // the tests' hold (the test API's setParallax): the camera's offsets set by hand are not replaced by the parallax worker's replies until the cursor is driven again (parallaxTo)
  parallaxHold: boolean;
  // the spawn box's reach of the mouse parallax (followSpawnBox): the limits for the window's size, the reach for the setting, and what they were worked out for
  spawnLimits: ParallaxLimits | null = null;
  spawnReach: ParallaxLimits = { yaw: 0, pitch: 0, eyeX: 0, eyeY: 0 };
  spawnSize = 0;
  spawnOn = false;
  spawnMode = "";
  spawnAmount = -1;
  audioArray: Float32Array;
  audioSeq: number;
  audioSeen: number;
  audioNow: number;
  audioReal: number;
  musicScale: number;
  // each column's share of the settled rain's falls now (rising at Music rain responsiveness), what the rain is given
  musicShares: Float32Array;
  musicActive: boolean;
  musicDriven: boolean;
  musicTime: number;
  music: SimMusicTask | null;
  musicStart: number;
  musicPacer: RatePacer | null;
  musicArray: Float32Array;
  performanceReport: PerformanceReport;
  musicReport: MusicReport;
  // what the music's last reply said (the readout's follower), the best peak score since the readout last renewed, and the times of the music's strikes (a ring, ms)
  musicSaid: MusicFollowerReport;
  musicStrikes: Float64Array;
  musicStrikeAt: number;
  musicCounted: Int32Array;
  musicCountedAt: number;
  nextMusicReadout: number;
  oledReport: OledReport;
  frozenSince: number;
  nearFar: Float32Array;
  drawMirrored: () => void;
  drawNothing: () => void;
  // the water's state from the Collision plane, Reflection plane and Ripples settings (models/waterstate.ts)
  waterState!: WaterStateOf;
  // (made once begin() has run: the namespace, the readout, the guard, the GL context, WebGPU's
  // checks; and the effects and what they share, made again with every makeEffects())
  M!: Matrix3DNamespace;
  readout!: Readout;
  guard!: GpuGuard;
  gl!: WebGL2RenderingContext;
  webgpu!: WebGPUSupport;
  quad!: Quad;
  camera!: Camera;
  atlas!: GlyphAtlas;
  clock!: StepClock;
  fog!: Fog;
  waves!: Waves;
  lightning!: Lightning;
  splashes!: Splashes;
  bolt!: Bolt;
  rain!: Rain;
  reflection!: Reflection;
  water!: Water;
  exposure!: Exposure;
  // the HDR output (made with the effects; its GPU objects let go when they are made again)
  hdrPath: HdrPath | null = null;
  // the splashes' task (workers/splashworker.ts), made with each Splashes effect; whether the waves' advance was left to the end of the frame (the fork's answer comes before it)
  splashTask: SteppedTask<RainSimPacket> | null = null;
  wavesDeferred = false;
  // the clock's and the message's layout task (workers/textlayoutworker.ts)
  textLayoutTask: JobTask<LayoutJob, LayoutOut> | null = null;
  // the strikes' plan task (workers/strikeplanworker.ts)
  strikePlanTask: JobTask<StrikePlanInput, StrikePlanOutput> | null = null;
  // the fog's frame plan task (workers/fogplanworker.ts), asked by Fog.fork
  fogPlanTask: JobTask<FogPlanInput, FogPlanOutput> | null = null;
  // the bolt's piece lists task (workers/boltlistworker.ts), asked by Bolt.fork
  boltListTask: JobTask<BoltListInput, BoltListOutput> | null = null;
  frameTask: JobTask<FrameInput, FrameOutput> | null = null;
  frameAnswer: { input: FrameInput; output: FrameOutput } | null = null;
  // what the reflection's reuse reads: the settings changed so far, and the fog's builds so far (a stamp that changes with its volume)
  settingsStamp = 0;
  fogStamp = 0;
  strikeFrames = 0;
  bloom!: Bloom;
  text!: Text;
  // (the tests' frame costs: advanceFrame wrapped once, debug/testapi.ts)
  timedFrame?: boolean;
  // the quality controller (engine/qualityframe.ts): used only in the modes inline and workers; the pool (null until the mode workers
  // asks for it, and while it starts), what was last sent to it, and the frame in progress's timing and the time it moves to
  quality: QualityFrame;
  qualityPool: QualityPool | null = null;
  // the tests' switch of the level of detail (setLod), kept for the effects made again (a rebuild, a lost context): they start with it
  lodOn = true;
  qualityTask: QualityPoolTask | null = null;
  // the fog given the pool (once for each fog)
  shadeGiven: unknown = null;
  // the effects' job statics last given (by effect index), and the pool they were last sent to (a pool made later is sent them all)
  qualityStatics: Record<number, { kind: string; arrays: QualityStatics }> = {};
  qualitySentTo: QualityPool | null = null;
  qualityTime: number | null = null;
  qFrame: { now: number; interval: number; counting: boolean; busy: boolean; advanceMs: number } | null = null;
  qualityLevels: Record<number, Uint8Array> = {};
  // the frame's shared view the effects' job parameters are made from, and those parameters by effect index
  qualityShared!: QualityShared;
  qualityParams: Record<number, QualityParams> = {};

  // platform: PagePlatform or WorkerPlatform (where it runs: everything else the same)
  constructor(platform: RenderPlatform) {
    this.platform = platform;
    this.settings = {
      hdr: false,
      debugMode: false,
      showSupport: false,
      frameCap: 24,
      collisionPlane: true,
      reflectionPlane: true,
      ripples: true,
      wallpaperFps: 0,
      // (null: GlyphAtlas.DEFAULT_SYMBOLS)
      symbols: null,
      steadyStart: false,
      // (the tests': Steady start whatever Debug mode)
      steadyTest: false,
      speed: SPEED_START,
      // (Debug mode's: the Music and Performance readouts, Simulated music's kind or "real",
      // the Nearness view, Freeze)
      musicReadout: false,
      oledReadout: false,
      musicSource: "real",
      performance: false,
      nearness: false,
      freeze: false,
      qualityMode: "workers",
      // (project.json's defaults: React to music off, Music sensitivity 50 (a multiplier of 5), Music light intensity 50, Music rain responsiveness 2, Lightning music sensitivity 30, the weights 30, 70, 50, 50, 50, the
      // idle animation off at 3 s; the columns, the fall and the rain's scale are set from the rain with each array)
      music: { useMusic: false, useIdle: false, idleSeconds: 3, sensitivity: 0.3, loud: 0.3, sudden: 0.7, tempo: 0.5, energy: 0.5, brightness: 0.5, multiplier: 5, lightIntensity: 0.5, columns: 1, fall: 1, above: 0, rainScale: 1 },
      musicResponsiveness: 2,
      parallax: { on: true, mode: "translation", amount: 0.5, delay: 0.1 },
    };
    this.quality = new M.QualityFrame(this.qualityHost());
    this.ownSettings = this.ownTable();
    // every setting's last value (Wallpaper Engine's key: value)
    this.properties = {};
    this.time = 0;
    this.lastNow = null;
    this.paused = false;
    this.hidden = false;
    this.looping = false;
    this.failure = false;
    // the frames drawn on animation frames (a count, for the tests)
    this.drawn = 0;
    this.manual = false;
    this.nextFrame = 0;
    this.nextReadout = 0;
    this.sized = null;
    // (the tests' values and the water's test views: with window.Matrix3DTest only)
    this.test = M.TEST ? { fogDistance: 0, reflection: "", viewScale: 1, noWaterLight: false, marched: false, timings: {}, compileMs: null, gpuBusy: null } : null;
    this.views = [];
    this.programs = null;
    this.step = 0;
    this.canvas = platform.canvas;
    this.effects = null;
    this.programsReady = false;
    this.generation = 0;
    this.hashes = null;
    // (the bolt's shapes' worker: BoltWorker's client, null without one)
    this.boltTask = null;
    // (the scene's worker: SceneWorker's client, null without one; the promise of it; the
    // script's hashes, once worked out)
    this.sceneTask = null;
    this.hashesBy = "";
    this.ownHashes = null;
    this.onFrame = (now) => this.frame(now);
    // (Debug mode's readouts: the frames and their script's time; the audio's levels and arrays a
    // second; Simulated music's generator, its start, its last array's time and its array; the
    // readouts' parts, made once and filled in place; when Freeze began)
    this.perf = null;
    this.health = null;
    this.frameFence = null;
    this.frameFenceAt = 0;
    this.fencePendingMs = 0;
    this.fineFences = new Array<WebGLSync | null>(FINE_MOST).fill(null);
    this.fineTimes = new Float64Array(FINE_MOST);
    this.fineCount = 0;
    this.finePumping = false;
    this.fineChannel = null;
    this.audioLevels = { loudness: 0, left: 0, right: 0, bass: 0, mid: 0, treble: 0, peak: 0, peakBin: -1 };
    this.audioRate = null;
    this.musicClient = null;
    this.parallaxClient = null;
    this.tasks = {};
    this.pointerX = 0;
    this.pointerY = 0;
    this.pointerInside = false;
    this.parallaxLimits = null;
    this.parallaxSize = 0;
    this.parallaxMoving = false;
    this.parallaxHold = false;
    this.audioArray = new Float32Array(128);
    this.audioSeq = 0;
    this.audioSeen = 0;
    this.audioNow = 0;
    this.audioReal = 0;
    this.musicScale = 1;
    this.musicShares = new Float32Array(0);
    this.musicActive = false;
    this.musicDriven = false;
    this.musicTime = 0;
    this.music = null;
    this.musicStart = 0;
    this.musicPacer = null;
    this.musicArray = new Float32Array(128);
    this.performanceReport = { fps: 0, scriptMs: 0, gpuMs: null, timer: false, frozen: false, frozenFor: 0, limit: 0, frameCap: 0, wallpaperFps: 0, width: 0, height: 0, drops: 0, splashes: 0, strikes: 0, frames: null, quality: null };
    this.musicReport = { source: "real audio", rate: 0, levels: this.audioLevels, follower: null };
    this.musicSaid = { driven: false, loudness: 0, floor: 0, threshold: 0, scoreMost: 0, tempo: 0, tempoFactor: 1, energyFactor: 1, brightnessFactor: 1, strikes: 0, strikeWindow: 30, falling: 0, wanted: 0, target: 0, density: 0, densitySet: 0 };
    this.musicStrikes = new Float64Array(256);
    this.musicStrikeAt = 0;
    this.musicCounted = new Int32Array(2048);
    this.musicCountedAt = -Infinity;
    this.nextMusicReadout = 0;
    this.oledReport = { limit: 0, scene: { x: 0 }, clock: { x: 0, y: 0 }, message: { x: 0, y: 0 } };
    this.frozenSince = 0;
    this.nearFar = new Float32Array(2);
    this.drawNothing = () => undefined;
    this.drawMirrored = () => {
      // (the fog's volume read through the larger picture's pixels, and the view's again after)
      this.fog.readMargin(this.reflection.frame);
      this.rain.draw(this.step, true);
      this.splashes.draw(this.step, true);
      this.bolt.draw(true);
      this.fog.readMargin(null);
    };
  }

  // the water's state worked out again from the settings, and given to what keeps it (the waves' impacts and steps)
  applyWaterState(): void {
    if (!this.M) {
      return;
    }
    const s = this.settings;
    this.waterState = this.M.WaterState.of(s.collisionPlane, s.reflectionPlane, s.ripples);
    if (this.waves) {
      this.waves.setState(this.waterState.impacts, this.waterState.wavesStepped);
    }
    // (the floor of the rain and of the bolts' feet: the water, or the bottom of the screen with the water off; the
    // strikes made again for it as for a new view: the camera's view is a new version)
    const kind = this.waterState.floor;
    if (this.rain && this.lightning && (this.rain.floorKind !== kind || this.lightning.floorKind !== kind)) {
      this.rain.setFloor(kind);
      this.lightning.setFloor(kind);
      this.camera.dirty = true;
    }
    if (this.water) {
      this.water.off = !this.waterState.waterDrawn;
    }
    // (the drops, the splashes and the strikes' feet rest on the waves' live height only where the waves are stepped: Collision plane and Ripples on)
    for (const effect of [this.rain, this.splashes, this.bolt]) {
      if (effect) {
        effect.waterWaves = this.waterState.wavesStepped;
      }
    }
  }

  // ---- settings (Wallpaper Engine's) ----

  // the wallpaper's own settings here; every other one goes to the effects that own it (each
  // effect's static properties())
  applyUserProperties(p: WallpaperProperties): void {
    for (const [key, { value }] of Object.entries(p)) {
      this.properties[key] = value;
      this.applyProperty(key, value);
    }
  }

  applyProperty(key: string, value: PropertyValue): void {
    this.settingsStamp++;
    const own = this.ownSettings;
    if (own[key]) {
      own[key](value);
    } else if (this.effects) {
      this.effects.forEach((effect) => effect.apply(key, value));
    }
  }

  // the wallpaper's own settings (made once)
  ownTable(): Record<string, OwnSetter> {
    const s = this.settings;
    return {
      p109_setting_HDR: (v: boolean) => {
        s.hdr = !!v;
      },
      p615_setting_DebugMode: (v: boolean) => {
        const frozen = this.frozen();
        s.debugMode = v;
        if (this.lightning) {
          this.lightning.setDebug(v);
        }
        if (this.splashes) {
          this.splashes.setDebug(v);
        }
        this.freezeChanged(frozen);
        this.showReadout();
        this.applySteady();
      },
      // (the music's settings: the worker is given them with each audio array)
      p301_setting_ReactToMusic: (v: boolean) => {
        s.music.useMusic = !!v;
      },
      p302_setting_MusicSensitivity: (v: number) => {
        s.music.multiplier = v / 10;
      },
      p303_setting_MusicLightIntensity: (v: number) => {
        s.music.lightIntensity = v / 100;
      },
      p304_setting_MusicRainResponsiveness: (v: number) => {
        s.musicResponsiveness = v;
      },
      // (the mouse parallax's settings: the worker is given them with each frame's message)
      p629_setting_MouseParallax: (v: boolean) => {
        s.parallax.on = !!v;
      },
      p630_setting_MouseParallaxMode: (v: string) => {
        s.parallax.mode = v === "rotation" ? "rotation" : "translation";
      },
      p631_setting_MouseParallaxAmount: (v: number) => {
        s.parallax.amount = v;
      },
      p632_setting_MouseParallaxDelay: (v: number) => {
        s.parallax.delay = v;
      },
      // (Advanced lightning tuning only shows the five weights' settings: the page's conditions read it, the code has nothing to do)
      p306_setting_AdvancedLightningTuning: () => {},
      p305_setting_MusicSensitivityLightning: (v: number) => {
        s.music.sensitivity = v / 100;
      },
      p307_setting_MusicStrengthLightning: (v: number) => {
        s.music.loud = v / 100;
      },
      p308_setting_MusicSuddennessLightning: (v: number) => {
        s.music.sudden = v / 100;
      },
      p309_setting_MusicTempoLightning: (v: number) => {
        s.music.tempo = v / 100;
      },
      p310_setting_MusicTimbreLightning: (v: number) => {
        s.music.brightness = v / 100;
      },
      p311_setting_MusicTrendLightning: (v: number) => {
        s.music.energy = v / 100;
      },
      p312_setting_MusicIdleAnimation: (v: boolean) => {
        s.music.useIdle = !!v;
      },
      p313_setting_MusicIdleTimeout: (v: number) => {
        s.music.idleSeconds = v;
      },
      p616_setting_DebugMusicReadout: (v: boolean) => {
        s.musicReadout = v;
        this.showReadout();
      },
      p625_setting_DebugOledReadout: (v: boolean) => {
        s.oledReadout = v;
        this.showReadout();
      },
      // (a simulated music from its start: made again when the kind changes)
      p617_setting_DebugMusicSource: (v: string) => {
        s.musicSource = v;
        this.stopSimulated();
        this.musicPacer = null;
      },
      p620_setting_DebugPerformance: (v: boolean) => {
        s.performance = v;
        this.resetHealth();
        this.showReadout();
      },
      p621_setting_DebugNearness: (v: boolean) => (s.nearness = v),
      p624_setting_DebugFreeze: (v: boolean) => {
        const frozen = this.frozen();
        s.freeze = v;
        this.freezeChanged(frozen);
      },
      p626_setting_DebugSteadyStart: (v: boolean) => {
        s.steadyStart = v;
        this.applySteady();
      },
      p627_setting_DebugSupport: (v: boolean) => {
        s.showSupport = v;
        this.showReadout();
      },
      // the quality computed for the Performance readout only (nothing is culled): off, inline on this thread, or in the pool
      p628_setting_DebugQualityMode: (v: string) => {
        // (Off, or Optimized: inline first, the pool replacing it as soon as its workers are alive, inline on a failure, the workers made again: a saved "workers" or "inline" is
        // Optimized; the tests choose the internal modes inline and workers with the values "test:inline" and "test:workers", which work in the render worker too, where M.TEST is not set)
        const mode = v === "off" ? "off" : v === "test:inline" ? "inline" : "workers";
        s.qualityMode = mode;
        this.quality.setMode(mode);
        if (mode === "off") {
          // (the effects back to full quality: the readout no longer shows a result that is not computed)
          (this.effects || []).forEach((effect) => (effect.qualityResult = undefined));
          this.stopQuality();
        } else if (mode === "workers") {
          this.startQuality();
        } else {
          this.stopQuality();
        }
      },
      p204_setting_CollisionPlane: (v: boolean) => {
        s.collisionPlane = v;
        this.applyWaterState();
      },
      p205_setting_ReflectionPlane: (v: boolean) => {
        s.reflectionPlane = v;
        this.applyWaterState();
      },
      p209_setting_Ripples: (v: boolean) => {
        s.ripples = v;
        this.applyWaterState();
      },
      p613_setting_FrameCap: (v: number) => {
        s.frameCap = v;
        this.resetHealth();
      },
      p101_setting_Symbols: (v: string) => {
        s.symbols = v;
        if (this.atlas) {
          this.atlas.build(v);
        }
      },
      // (the steps go on from where they are at the new rate)
      p120_setting_Speed: (v: number) => {
        s.speed = v;
        if (this.clock && this.effects) {
          this.clock.setRate(this.stepRate(), this.time);
          this.rain.rateChanged();
        }
      },
    };
  }

  // Debug mode's Freeze (matrix_web_rain's, a baseline for power measurements): nothing drawn,
  // nothing moved on, no time caught up afterwards; the readouts still renewed
  frozen() {
    return this.settings.debugMode && this.settings.freeze;
  }

  // Freeze begun or ended (was: before the change): no time caught up from before it
  freezeChanged(was: boolean) {
    const now = this.frozen();
    if (now !== was) {
      this.lastNow = null;
      this.frozenSince = performance.now();
    }
  }

  // Simulated music (a Debug mode setting): its generator while one is chosen, else none
  simulated() {
    const s = this.settings;
    if (!s.debugMode || s.musicSource === "real" || !this.M) {
      return null;
    }
    if (!this.music) {
      // (the generator's arrays as a SimMusicTask: made inline from the first tick, by its worker once that is made, inline again when it fails)
      this.music = new this.M.SimMusicTask(s.musicSource, { base: this.platform.base });
      this.music.start();
      this.tasks.simmusic = this.music as unknown as ThreadedTask;
      this.musicStart = performance.now();
      this.musicPacer = new this.M.RatePacer(MUSIC_RATE);
    }
    return this.music;
  }

  // the simulated music's task let go (the source changed)
  stopSimulated() {
    if (this.music) {
      this.music.stop();
    }
    this.music = null;
  }

  // Wallpaper Engine's audio array (128 values): its levels taken (the readout's), unless a
  // simulated music plays instead
  audio(array: ArrayLike<number>) {
    if (!this.M || this.simulated()) {
      return;
    }
    this.takeAudio(array, performance.now());
  }

  takeAudio(array: ArrayLike<number>, now: number): void {
    this.M.AudioLevels.of(array, this.audioLevels);
    this.audioRate!.add(now);
    // (kept for the music's reactions: the newest array a frame takes, as matrix_web_rain's frame does)
    if (this.audioArray.length !== array.length) {
      this.audioArray = new Float32Array(array.length);
    }
    this.audioArray.set(array);
    this.audioNow = now;
    this.audioReal = performance.now();
    this.audioSeq++;
  }

  // the cursor (the page's mouse events, normalised: -1 to 1 across the window, y up; inside false: it left the window), kept for the frame's follow
  pointer(x: number, y: number, inside: boolean): void {
    this.pointerX = x;
    this.pointerY = y;
    this.pointerInside = inside;
  }

  // the mouse parallax (the maths in the parallax worker: workers/parallaxworker.ts): each frame the cursor, the time and the settings go to the worker (a message only when
  // something changed or the view is still moving), and the newest reply sets the camera's offsets; with Mouse parallax off the offsets are 0 (the worker is told once)
  followParallax(): void {
    const client = this.parallaxClient;
    const camera = this.camera;
    if (!client || !camera || !this.M || this.parallaxHold) {
      return;
    }
    const p = this.settings.parallax;
    const size = camera.width * 65536 + camera.height;
    if (!this.parallaxLimits || size !== this.parallaxSize) {
      this.parallaxSize = size;
      this.parallaxLimits = this.M.MouseParallax.limitsFor({
        span: this.M.Camera.SPAN,
        aspect: camera.width / camera.height,
        halfFov: camera.halfFov(),
        near: this.M.Camera.nearestWater(),
        highestPitch: this.M.Camera.HIGHEST_PITCH,
      });
    }
    client.tick({ x: this.pointerX, y: this.pointerY, inside: this.pointerInside }, performance.now(), p, this.parallaxLimits);
    const reply = client.take();
    if (reply) {
      camera.setParallax(reply.yaw, reply.pitch, reply.eyeX, reply.eyeY);
      this.parallaxMoving = reply.moving;
    }
  }

  // the rain's spawn box (models/spawnbox.ts, shared by the strikes): its inputs given to the rain each frame, the camera's base tilt and eye's height (never the parallax's live
  // offsets) and the range the mouse parallax's setting reaches (MouseParallax.reach: none with the parallax off), worked out again only when the window or the setting changed
  followSpawnBox(): void {
    const camera = this.camera;
    const rain = this.rain;
    if (!camera || !rain || !this.M) {
      return;
    }
    const M = this.M;
    const p = this.settings.parallax;
    const size = camera.width * 65536 + camera.height;
    if (!this.spawnLimits || size !== this.spawnSize || p.on !== this.spawnOn || p.mode !== this.spawnMode || p.amount !== this.spawnAmount) {
      if (!this.spawnLimits || size !== this.spawnSize) {
        this.spawnLimits = M.MouseParallax.limitsFor({
          span: M.Camera.SPAN,
          aspect: camera.width / camera.height,
          halfFov: camera.halfFov(),
          near: M.Camera.nearestWater(),
          highestPitch: M.Camera.HIGHEST_PITCH,
        });
      }
      this.spawnSize = size;
      this.spawnOn = p.on;
      this.spawnMode = p.mode;
      this.spawnAmount = p.amount;
      this.spawnReach = p.on ? M.MouseParallax.reach(p.mode, p.amount, this.spawnLimits) : { yaw: 0, pitch: 0, eyeX: 0, eyeY: 0 };
    }
    rain.setSpawnBox(camera.pitch, camera.eyeHeight, this.spawnReach);
  }

  // the music's reactions (matrix_web_rain's, the maths in the music worker: workers/musicworker.ts): the newest audio array, if a frame has not taken it yet, goes to the
  // worker with the settings and the rain's size; the newest reply sets the rain's drops wanted (Music rain responsiveness: how fast the scale rises) and, on a peak while
  // the music drives, asks the lightning for a strike; while it drives the random strikes wait (the idle animation gives them back). React to music off lets it all go.
  followMusic(): void {
    const client = this.musicClient;
    const rain = this.rain;
    const lightning = this.lightning;
    const m = this.settings.music;
    if (rain) {
      rain.setMusicTilt(m.useMusic, this.settings.musicResponsiveness);
    }
    if (rain && lightning && m.useMusic && !this.musicActive) {
      // (React to music from the start: with no idle animation the music drives at once, and with no sound nothing falls and no strike comes until the first reply; with the
      // idle animation the settled rain plays until the first sound, as matrix_web_rain's)
      this.musicActive = true;
      this.musicDriven = !m.useIdle;
      if (!m.useIdle) {
        rain.setShares(new Float32Array(rain.musicColumns()));
        lightning.setByMusic(true);
      }
    }
    if (!client || !rain || !lightning) {
      return;
    }
    if (!m.useMusic) {
      if (this.musicActive) {
        this.musicActive = false;
        this.musicDriven = false;
        this.musicScale = 1;
        rain.setShares(null);
        rain.setMusicLight(null);
        lightning.setByMusic(false);
      }
      return;
    }
    // (every frame, as matrix_web_rain's: the array only when a new one came; the frame's time runs on from the last array's, whatever clock it was given in)
    const fresh = this.audioSeq !== this.audioSeen;
    this.audioSeen = this.audioSeq;
    m.columns = rain.musicColumns();
    m.fall = rain.averageFall();
    // (a column's share is the part of the settled rain's falls its chance gives, 1 at the top chance: the drops wanted already hold the settled rain's 1.06)
    m.above = 1;
    m.rainScale = 1;
    const now = fresh ? this.audioNow : this.audioNow + (performance.now() - this.audioReal);
    client.tick(fresh ? this.audioArray : null, now, m, lightning.enabled);
    const reply = client.take();
    if (!reply) {
      return;
    }
    this.musicActive = true;
    this.musicDriven = reply.driven;
    lightning.setByMusic(reply.driven);
    if (reply.driven && reply.peak) {
      lightning.musicAsked = true;
      this.musicStrikes[this.musicStrikeAt] = performance.now();
      this.musicStrikeAt = (this.musicStrikeAt + 1) % this.musicStrikes.length;
    }
    const said = this.musicSaid;
    said.driven = reply.driven;
    said.loudness = reply.loudness;
    said.floor = reply.floor;
    said.threshold = reply.threshold;
    said.scoreMost = Math.max(said.scoreMost, reply.score);
    said.tempo = reply.tempo;
    said.tempoFactor = reply.tempoFactor;
    said.energyFactor = reply.energyFactor;
    said.brightnessFactor = reply.brightnessFactor;
    this.musicScale = reply.driven ? reply.scale : 1;
    this.musicTime = now;
    rain.setMusicLight(reply.driven ? reply.light : null);
    if (!reply.driven || !reply.share) {
      // (the idle animation, or React to music off: the settled rain at once)
      rain.setShares(null);
      return;
    }
    // (the columns' shares follow the music at once: Music rain responsiveness is the height of the plane the drops spawn from, Rain.setMusicTilt)
    const target = reply.share;
    if (this.musicShares.length !== target.length) {
      this.musicShares = Float32Array.from(target);
    }
    const shares = this.musicShares;
    shares.set(target);
    rain.setShares(shares);
  }

  // what the music does now (the tests')
  musicState(): { scale: number; driven: boolean; active: boolean } {
    return { scale: this.musicScale, driven: this.musicDriven, active: this.musicActive };
  }

  // Simulated music's next array, MUSIC_RATE a second on any display (RatePacer), by the real time since it began
  simulateMusic(now: number) {
    const music = this.simulated();
    if (!music || !this.musicPacer || !this.musicPacer.due(now)) {
      return;
    }
    music.tick((now - this.musicStart) / 1000, now);
    // (with the worker the array asked for arrives with a later take)
    const made = music.take();
    if (made) {
      this.musicArray.set(made.array);
      this.takeAudio(this.musicArray, made.now);
    }
  }

  // the rain's steps a second at the Speed set
  stepRate() {
    return (this.M.Rain.STEP_RATE * (SPEED_TOP - SPEED_REFERENCE)) / (SPEED_TOP - this.settings.speed);
  }

  // Steady start (a Debug mode setting: only with Debug mode) for the rain's next start
  applySteady() {
    const s = this.settings;
    if (this.rain) {
      this.rain.steady = s.steadyTest || (s.debugMode && s.steadyStart);
    }
  }

  applyGeneralProperties(p: GeneralProperties): void {
    if (p.fps) {
      this.settings.wallpaperFps = p.fps;
      this.resetHealth();
    }
  }

  // Wallpaper Engine pauses the wallpaper (a full-screen program, the screen off): the clock
  // stops, and starts again from the next frame
  setPaused(paused: boolean) {
    this.paused = paused;
    this.quality.cancel();
    this.lastNow = null;
    this.loop();
  }

  // the page is hidden or shown again (on its own: Wallpaper Engine's pause is kept)
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.quality.cancel();
    this.lastNow = null;
    this.loop();
  }

  // the frames asked for again, unless paused, hidden, stopped, failed or not ready (then none is
  // asked for: made ready, the effects ask again)
  loop() {
    if (!this.looping && this.canDraw()) {
      this.looping = true;
      requestAnimationFrame(this.onFrame);
    }
  }

  canDraw() {
    return !this.paused && !this.hidden && !this.failure && this.programsReady && !!this.webgpu && !!this.guard && !this.guard.stopped;
  }

  // ---- start ----

  async begin() {
    const M = window.Matrix3D;
    this.M = M;
    this.mark("begin");
    // (a failure while starting: said in the readout, or on the page)
    try {
      this.readout = this.platform.readout(Support);
      this.guard = new M.GpuGuard();
      this.perf = new M.PerfMeter();
      this.health = new M.FrameHealth();
      this.audioRate = new M.AudioLevels.Rate();
      this.platform.watch(this);
    } catch (error) {
      this.fail(error);
      throw error;
    }
    // (a page's canvas or a worker's OffscreenCanvas: the same context)
    const gl = this.canvas.getContext("webgl2", { antialias: false, depth: false, powerPreference: "high-performance" }) as WebGL2RenderingContext | null;
    if (!gl) {
      Support.webgl2.error = "no WebGL 2.0 context";
      Support.done = true;
      this.failure = true;
      this.showReadout();
      throw new Error(Support.webgl2.error);
    }
    this.gl = gl;
    this.describeWebGL();
    this.canvas.addEventListener("webglcontextlost", (e) => this.contextLost(e));
    this.canvas.addEventListener("webglcontextrestored", () => this.makeEffects().catch((error) => this.fail(error)));
    // (the scene's one-off work in a Web Worker when one can be made, else here: the script's
    // hashes and their check, the rain's layouts, the characters)
    // (the tests may refuse a worker: window.Matrix3DTest { sceneWorker, boltWorker: "none" })
    const refused = (name: "sceneWorker" | "boltWorker" | "musicWorker" | "parallaxWorker" | "textLayoutWorker" | "strikePlanWorker" | "fogPlanWorker" | "boltListWorker" | "frameWorker" | "splashWorker") => testOptions()[name] || "";
    const scene = new M.SceneTask({
      base: this.platform.base,
      force: refused("sceneWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("sceneWorker");
        }
        // (no worker could be made, or one is refused: onChange is told only of a worker adopted or lost, so the support report says "none" here)
        if ((event.name === "refused" || event.name === "failed") && Support.sceneWorker === undefined) {
          Support.sceneWorker = "";
          this.showReadout();
        }
      },
      onChange: (client) => {
        Support.sceneWorker = client ? client.kind : "";
        this.giveWorker();
        this.showReadout();
      },
    });
    this.sceneTask = scene;
    this.tasks.scene = scene as unknown as ThreadedTask;
    this.mark("sceneReady");
    scene.start();
    // (the mouse parallax: a ParallaxTask, inline from the first moment, its worker made as soon as possible and taking over with the position, inline again when it fails,
    // tried again after 20 ms, 40 ...: platform/threadedtask.ts)
    const parallax = new M.ParallaxTask({
      base: this.platform.base,
      force: refused("parallaxWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("parallaxWorker");
        }
      },
    });
    this.parallaxClient = parallax;
    this.tasks.parallax = parallax as unknown as ThreadedTask;
    this.mark("parallaxReady");
    parallax.start();
    // (the bolt's shapes: a BoltTask, a worker in each slot of the pool as soon as it can be made; Lightning makes the shapes itself, a slice at a time, until one is alive and
    // whenever none is: its code compiled and its pools filled first, there)
    const bolt = new M.BoltTask({
      base: this.platform.base,
      force: refused("boltWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("boltWorker");
        }
        if (event.name === "refused" || event.name === "failed" || (event.name === "lost" && bolt.alive === 0)) {
          M.BoltShape.warm();
        }
        // (no worker could be made, or one is refused: onChange is told only of a worker adopted or lost, so the readout's Workers line says "no" here)
        if ((event.name === "refused" || event.name === "failed") && Support.workers === undefined) {
          Support.workers = bolt.kind;
          this.showReadout();
        }
      },
      onChange: () => {
        Support.workers = bolt.kind;
        this.showReadout();
      },
    });
    this.boltTask = bolt;
    this.tasks.bolt = bolt as unknown as ThreadedTask;
    this.mark("boltReady");
    bolt.start();
    // (the music's reactions: a MusicTask the same way, inline from the first moment, its worker taking over with the music's state)
    const music = new M.MusicTask({
      base: this.platform.base,
      force: refused("musicWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("musicWorker");
        }
      },
    });
    this.musicClient = music;
    this.tasks.music = music as unknown as ThreadedTask;
    this.mark("musicReady");
    music.start();
    // (the clock's and the message's layout: a JobTask over the pure layout job, asked in Text.fork and awaited by the frame; inline until its worker is made)
    const textLayout = new M.JobTask({
      fn: M.TextLayoutWorker.job,
      name: "textlayout",
      base: this.platform.base,
      force: refused("textLayoutWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("textLayoutWorker");
        }
      },
    });
    this.textLayoutTask = textLayout;
    // (the strikes' plan: a JobTask over models/strikeplan.ts, asked for the next strikes when Lightning's queue is short; inline until its worker is made)
    const strikePlan = new M.JobTask({
      fn: M.StrikePlan.plan,
      name: "strikeplan",
      base: this.platform.base,
      force: refused("strikePlanWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("strikePlanWorker");
        }
      },
    });
    this.strikePlanTask = strikePlan;
    this.tasks.strikeplan = strikePlan as unknown as ThreadedTask;
    strikePlan.start();
    // (the fog's frame plan: a JobTask over models/fogplan.ts, asked in Fog.fork with the frame's inputs and awaited by the draw; inline until its worker is made)
    const fogPlan = new M.JobTask({
      fn: M.FogPlan.plan,
      name: "fogplan",
      base: this.platform.base,
      force: refused("fogPlanWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("fogPlanWorker");
        }
      },
    });
    this.fogPlanTask = fogPlan;
    this.tasks.fogplan = fogPlan as unknown as ThreadedTask;
    fogPlan.start();
    // (the bolt's piece lists: a JobTask over models/boltlist.ts, asked in Bolt.fork with the frame's inputs and awaited by the draw; inline until its worker is made)
    const boltList = new M.JobTask({
      fn: M.BoltList.run,
      name: "boltlist",
      base: this.platform.base,
      force: refused("boltListWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("boltListWorker");
        }
      },
    });
    this.boltListTask = boltList;
    this.tasks.boltlist = boltList as unknown as ThreadedTask;
    boltList.start();
    // (the frame's camera numbers: a JobTask over models/frame.ts, asked after the frame's advance by the fork and awaited by its draw; inline until its worker is made)
    const frameJob = new M.JobTask({
      fn: M.Frame.compute,
      name: "frame",
      base: this.platform.base,
      force: refused("frameWorker"),
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("frameWorker");
        }
      },
    });
    this.frameTask = frameJob;
    this.tasks.frame = frameJob as unknown as ThreadedTask;
    frameJob.start();
    this.tasks.textlayout = textLayout as unknown as ThreadedTask;
    textLayout.start();
    if (M.TEST) {
      this.test!.timings.effects = Math.round(performance.now());
    }
    try {
      await this.makeEffects();
    } catch (error) {
      this.fail(error);
    }
    this.giveShadePool();
    if (M.TEST) {
      this.test!.timings.made = Math.round(performance.now());
    }
    // (WebGPU's start after the effects', as before: its panel's frames are the wallpaper's; it
    // checks its hashes against the script's, by the scene's worker when one is alive, else here)
    this.webgpu = new M.WebGPUSupport(
      Support.webgpu,
      this.guard,
      M.Rain.COUNT,
      M.Rain.SEED,
      (gpu) => this.compareHashes(gpu),
      (hashes: Uint32Array) => {
        // (the same values as the script's, checked: the drops not laid out again)
        this.hashes = hashes;
        Support.drops.source = "webgpu";
      },
      () => this.stopped(),
      this.platform.panel
    );
    // (the bolt's shapes made in a Web Worker when one can be made, else on the main thread)
    Support.threads = M.Workers.threads();
    if (M.TEST) {
      this.views = Object.keys(M.Water.MODES).filter((m) => m !== "scene");
    }
    this.showReadout();
    this.mark("loop");
    this.loop();
    await this.webgpu.start();
    if (M.TEST) {
      this.test!.timings.webgpu = Math.round(performance.now());
    }
    Support.done = true;
    if (this.boltTask) {
      this.boltTask.warm();
    }
    this.showReadout();
    if (!Support.webgl2.ok) {
      throw new Error(Support.webgl2.error);
    }
  }

  // whether the scene's worker is used (always as shipped; in the tests only when they ask:
  // their resets and steps are synchronous)
  // (the tests' timings: a moment recorded once, in ms since the page began: when a client exists, when its worker took over, the loop's start, the first advance)
  mark(name: string): void {
    if (this.test && this.test.timings[name] === undefined) {
      this.test.timings[name] = Math.round(performance.now());
    }
  }

  get boltWorker(): BoltTask | null {
    return this.boltTask && !this.boltTask.broken ? this.boltTask : null;
  }

  workersOn() {
    return !this.M.TEST || !!(this.test && this.test.workers);
  }

  // the scene's worker now (null: none alive, the work done inline)
  get sceneWorker(): SceneWorker | null {
    const client = this.sceneTask ? this.sceneTask.client() : null;
    return client && !client.broken ? client : null;
  }

  // the scene's worker given to the rain and the atlas (or taken away)
  giveWorker() {
    const client = this.workersOn() ? this.sceneWorker : null;
    if (this.rain) {
      this.rain.useWorker(client);
    }
    if (this.atlas) {
      this.atlas.useWorker(client);
    }
  }

  // a promise of the script's hashes: the worker's if one is alive now, else worked out here at once (inline first: the start does not wait for the worker)
  async scriptHashes() {
    const client = this.workersOn() ? this.sceneWorker : null;
    this.hashesBy = client ? "worker" : "inline";
    if (client) {
      try {
        return await client.hashes(this.M.Rain.COUNT, this.M.Rain.SEED);
      } catch (error) {
        // (worked out here)
      }
    }
    return this.M.Rain.scriptHashes();
  }

  // WebGPU's hashes against the script's ({ wrong, first, a, b }): in the worker (a copy sent),
  // else here
  compareHashes(gpu: Uint32Array) {
    const M = this.M;
    const here = () => M.RainLayout.compare(gpu, M.Rain.scriptHashes());
    const client = this.workersOn() ? this.sceneWorker : null;
    return client ? client.compare(gpu.slice()).catch(here) : here();
  }

  // a failure (at start, or a frame that threw): said in the readout, whatever Debug mode (also
  // when the scripts never loaded), until the effects are made again; no frames meanwhile
  // (it never throws: a readout that cannot be shown leaves the failure's text on the page, or
  // sent to it)
  fail(error: unknown) {
    this.quality.cancel();
    Support.webgl2.ok = false;
    Support.webgl2.error = String((error && (error as Error).message) || error);
    this.failure = true;
    try {
      if (this.readout) {
        this.showReadout();
        return;
      }
    } catch (shown) {
      Support.webgl2.error += ` (and the readout could not be shown: ${(shown && (shown as Error).message) || shown})`;
    }
    try {
      this.platform.failText(`Matrix 3D Rain WebGL 2.0 could not start: ${Support.webgl2.error}`);
    } catch (written) {
      // (no page to write on: nothing more can be said)
    }
  }

  contextLost(e: Event): void {
    this.generation++;
    this.quality.cancel();
    this.programsReady = false;
    this.frameFence = null;
    this.fineReset();
    this.effects = null;
    this.guard.lost(performance.now());
    if (this.guard.stopped) {
      this.stopped();
      return;
    }
    e.preventDefault();
  }

  // the guard stopped the wallpaper (a second lost WebGL context or WebGPU device within its
  // window): said in the readout, whatever Debug mode
  stopped() {
    Support.webgl2.ok = false;
    Support.webgl2.error = "stopped: the graphics driver was reset twice within 10 minutes";
    this.failure = true;
    this.showReadout();
  }

  describeWebGL() {
    const gl = this.gl;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    Object.assign(Support.webgl2, {
      ok: true,
      version: gl.getParameter(gl.VERSION),
      glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxSamples: gl.getParameter(gl.MAX_SAMPLES),
      floatTargets: !!gl.getExtension("EXT_color_buffer_float"),
      timerQueries: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"),
    });
  }

  // makes every effect and its GPU objects (after deleting the ones before), gives them every
  // setting, and waits for their programs: all compiled at once. A newer call (a lost context
  // meanwhile) makes an older one stop
  async makeEffects() {
    const M = this.M;
    const gl = this.gl;
    const generation = ++this.generation;
    this.quality.cancel();
    this.programsReady = false;
    this.frameFence = null;
    this.fineReset();
    // (the script's hashes, the first time: from the worker, while nothing is drawn)
    if (!this.hashes && !this.ownHashes) {
      const hashes = await this.scriptHashes();
      if (generation !== this.generation) {
        return;
      }
      this.ownHashes = hashes;
    }
    this.destroyEffects();
    const caps = M.capabilities(gl);
    this.guard.attach(gl);
    this.quad = new M.Quad(gl, this.guard);
    this.camera = new M.Camera(gl);
    this.atlas = new M.GlyphAtlas(gl);
    this.clock = new M.StepClock(this.stepRate());
    const context = { gl, quad: this.quad, camera: this.camera, atlas: this.atlas, guard: this.guard, caps, seed: M.Rain.SEED, clock: this.clock };
    this.fog = new M.Fog(context);
    this.waves = new M.Waves(context, M.Rain.FURTHEST);
    this.lightning = new M.Lightning(
      context,
      (slot) => {
        const started = this.lightning.slots[slot];
        this.fog.strikeAt(slot, started && started.uid !== undefined ? started.uid : -1);
      },
      (x, z, weight) => this.waves.add(x, z, weight),
      (top, foot, random, view) => M.BoltShape.start(top, foot, random, M.Lightning.mainSize(view), view),
      () => [this.rain.nearest(), this.rain.furthest()]
    );
    // (a planned strike's flash known: the fog bakes its shadow grid ahead in the workers when the level of detail is on)
    this.lightning.planTask = this.strikePlanTask;
    this.fog.planTask = this.fogPlanTask;
    this.lightning.onPlanned = (s) => this.fog.announceStrike(s.uid!, s.start, s.flash!);
    // (an unexpected error in the lightning's asynchronous answers: reported as a failure of the wallpaper, as a frame's error is)
    this.lightning.onFailure = (error) => this.fail(error);
    // (the bolt's items made in the worker with each shape: none asked before the bolt exists)
    this.lightning.itemsOptionsOf = (s) => (this.bolt ? this.bolt.itemsOptionsOf(s) : undefined);
    if (this.boltTask) {
      this.lightning.useWorker(this.boltTask);
    }
    this.splashes = new M.Splashes(context, (x, z, weight) => this.waves.add(x, z, weight));
    // (the splashes' frame as a stepped task: made inline from the first frame, its worker taking over as soon as it can; the fork of the quality mode workers gives it the frame's
    // payload and waits for its packet)
    this.splashTask = new M.SteppedTask({
      model: this.splashes.tick,
      name: "splash",
      base: this.platform.base,
      force: testOptions().splashWorker || "",
      lookahead: 0,
      checkpointEvery: M.SplashWorker.CHECKPOINT_EVERY,
      eventDelay: 1,
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("splashWorker");
        }
      },
    });
    this.splashes.task = this.splashTask;
    this.tasks.splash = this.splashTask as unknown as ThreadedTask;
    // (the same task as the rain's wheel's: the kill check's spec rainsim)
    this.tasks.rainsim = this.splashTask as unknown as ThreadedTask;
    this.splashTask.start();
    this.bolt = new M.Bolt(context);
    this.bolt.listTask = this.boltListTask;
    this.rain = new M.Rain(context, (drop, time) => {
      // (a landing makes its ring and its splashes only with the Collision plane: the waves take no impact without it)
      this.waves.add(drop.x, drop.z, M.Rain.IMPACT);
      if (this.waterState.splashes) {
        this.splashes.fromLanding(drop, time, M.Rain.CELL);
      }
    });
    // (the splashes' task steps the rain's wheel too, in its tick, with the landings' impacts and splashes made there: the rain gives it its part of each frame; the callback above
    // is the rain's own when it steps itself)
    this.rain.collides = () => !!this.waterState.splashes;
    this.rain.driver = this.splashes;
    this.rain.waveSource = this.waves;
    this.splashes.rain = this.rain;
    this.splashes.tick.wheel = this.rain.wheel;
    // (the strikes' feet and tops are drawn across the rain's spawn box; the box's inputs given before the first layout)
    this.lightning.boxOf = () => this.rain.wheel.box();
    this.followSpawnBox();
    this.reflection = new M.Reflection(context);
    this.water = new M.Water(context);
    this.water.waveSource = this.waves;
    this.applyWaterState();
    this.text = new M.Text(context);
    this.text.layoutTask = this.textLayoutTask;
    this.text.onStamp = (from, to, box, shift, ids) => this.rain.drawNewest(from, to, box, shift, ids);
    const ratio = (this.platform as { ratio?: number }).ratio;
    if (ratio) {
      this.text.scale = ratio;
    }
    // (the strikes' emitter, Lightning's, for the fog's and the water's bakes; the water's grid
    // of a strike's light baked when the fog has baked its shadows, with them still bound)
    this.fog.setEmitter(this.lightning.emitterTexture);
    this.water.setEmitter(this.lightning.emitterTexture);
    this.fog.onShaded = (slot) => {
      // (no water, no light on it to bake)
      if (this.waterState.waterDrawn) {
        this.water.bakeStrike(slot);
      }
    };
    this.water.ready = this.fog.ready;
    this.exposure = new M.Exposure(context);
    // (the HDR output: the bridge's buffers belong to this context; the setting kept)
    if (this.hdrPath) {
      this.hdrPath.release();
    } else {
      this.hdrPath = new M.HdrPath(
        {
          base: this.platform.base,
          canvas: this.platform.hdr || null,
          canvasId: "hdr",
          spare: this.platform.hdrSpare ? () => this.platform.hdrSpare!() : undefined,
          dropSpare: (id) => {
            if (this.platform.hdrDrop) {
              this.platform.hdrDrop(id);
            }
          },
          shown: (on, id) => {
            if (this.platform.hdrShown) {
              this.platform.hdrShown(on, id);
            }
          },
          lost: () => {
            this.guard.lost(performance.now());
            if (this.guard.stopped) {
              this.stopped();
            }
          },
          changed: () => this.showReadout(),
        },
        Support.hdrOutput
      );
    }
    this.bloom = new M.Bloom(context);
    // (in the order they move on and are updated: the rain's landings make splashes and waves;
    // the strikes' light goes into the fog's volume)
    this.effects = [this.lightning, this.fog, this.rain, this.splashes, this.bolt, this.waves, this.reflection, this.water, this.text, this.exposure, this.bloom];
    this.effects.forEach((effect, i) => {
      effect.qualityIndex = i;
      effect.lod = this.lodOn;
    });
    this.qualityStatics = {};
    this.qualitySentTo = null;
    this.qualityParams = {};
    this.giveWorker();
    this.atlas.build(this.settings.symbols === null ? M.GlyphAtlas.DEFAULT_SYMBOLS : this.settings.symbols);
    this.applySteady();
    for (const [key, value] of Object.entries(this.properties)) {
      this.applyProperty(key, value);
    }
    this.sized = null;
    this.applySize();
    this.rain.setHashes((this.hashes || this.ownHashes)!);
    Support.drops.source = this.hashes ? "webgpu" : "script";
    this.reset();
    // the GLSL the effects share: the fog's block and volume (for anything seen through it),
    // the medium itself, the strikes' light and its scattering, the waves (under which nothing
    // shows), and for the tests' views the fog marched along a ray
    const glsl: SharedGlsl = {
      fog: M.Fog.GLSL,
      medium: M.Fog.MEDIUM_GLSL,
      test: M.Fog.TEST_GLSL,
      shade: M.Fog.SHADE_GLSL,
      lightning: M.Lightning.GLSL,
      emitter: M.Lightning.EMITTER_GLSL,
      scatter: M.Lightning.SCATTER_GLSL,
      march: M.TEST ? M.Fog.MARCH_GLSL : "",
      waves: M.Waves.GLSL,
      bloom: M.Bloom.GLSL,
    };
    const sources: ProgramSources = Object.assign({}, ...this.effects.map((effect) => (effect.constructor as typeof Effect).programs(glsl, caps)));
    // (the tests: when the start's steps came, and with window.Matrix3DTest { compileEach } each
    // program compiled on its own first, its time kept: which one is slow)
    if (M.TEST) {
      this.test!.timings.compiling = Math.round(performance.now());
      if (testOptions().compileEach) {
        this.test!.compileMs = {};
        for (const [name, source] of Object.entries(sources)) {
          const start = performance.now();
          const one: Programs = await M.compilePrograms(gl, { [name]: source }).catch(() => ({}));
          this.test!.compileMs[name] = Math.round(performance.now() - start);
          Object.values(one).forEach((program) => program.destroy());
        }
      }
    }
    let programs;
    try {
      programs = await M.compilePrograms(gl, sources);
      if (M.TEST) {
        this.test!.timings.compiled = Math.round(performance.now());
      }
    } catch (error) {
      // (an older start's failure, once a newer one began, is not this one's)
      if (generation !== this.generation) {
        return;
      }
      throw error;
    }
    if (generation !== this.generation) {
      for (const program of Object.values(programs)) {
        program.destroy();
      }
      return;
    }
    this.effects.forEach((effect) => effect.init(programs));
    if (M.TEST) {
      this.programs = programs;
    }
    Support.webgl2.ok = true;
    Support.webgl2.error = "";
    this.failure = false;
    this.programsReady = true;
    this.showReadout();
    // a first frame while starting: the driver finishes the shaders when they are first used
    // (about 0.25 s at 792 x 603), not in a frame that is shown
    this.render();
    // (the frames, stopped while nothing could be drawn)
    this.loop();
  }

  // deletes every GPU object of the effects and of what they share
  destroyEffects() {
    if (this.splashTask) {
      this.splashTask.stop();
      this.splashTask = null;
    }
    for (const effect of this.effects || []) {
      effect.destroy();
    }
    for (const shared of [this.atlas, this.camera, this.quad]) {
      if (shared) {
        shared.destroy();
      }
    }
    this.guard.destroy();
    this.effects = null;
  }

  // ---- the canvas's size, in device pixels (the platform's: a ResizeObserver on the page,
  // the page's sizes in a worker; applied at the start of a frame, never in the observer) ----

  // packed: the HDR picture is packed into the canvas this frame (the bitmap path), which is then twice as wide
  applySize(packed = false) {
    const size = this.platform.size();
    const width = Math.max(1, size[0]);
    const height = Math.max(1, size[1]);
    const canvasWidth = packed ? 2 * width : width;
    if (this.canvas.width !== canvasWidth || this.canvas.height !== height) {
      this.canvas.width = canvasWidth;
      this.canvas.height = height;
    }
    if (!this.sized || this.sized[0] !== width || this.sized[1] !== height) {
      this.sized = [width, height];
      this.guard.unsettle();
      this.camera.resize(width, height);
      this.effects!.forEach((effect) => effect.resize(width, height));
    }
  }

  // ---- the simulation ----

  // the frame's advance of every effect. forked: the frame forks (the quality mode workers): the waves are advanced after the fork's answer (finishAdvance), when the splashes'
  // impacts are in
  advanceTo(time: number, forked = false) {
    this.mark("firstAdvance");
    this.wavesDeferred = false;
    this.followMusic();
    this.followParallax();
    this.followSpawnBox();
    for (let i = 0; i < this.effects!.length; i++) {
      if (forked && this.effects![i] === this.waves) {
        this.wavesDeferred = true;
        continue;
      }
      this.effects![i].advance(time);
    }
    this.time = time;
  }

  // the waves' advance left to after the fork's answer, made (the frame's draw calls it first)
  finishAdvance() {
    if (this.wavesDeferred) {
      this.wavesDeferred = false;
      this.waves.advance(this.time);
    }
  }

  reset() {
    this.time = 0;
    this.clock.reset();
    this.effects!.forEach((effect) => effect.reset());
  }

  // ---- a frame: the effects put together ----

  // the frame's camera numbers asked of the frame worker after the advance (the frame's fork: the offsets of this frame are set): the matrices and the block for the size the frame
  // will have (the platform's, as applySize reads it) and the clock's step; only when the camera will be dirty (a view changed or the size), since an unchanged camera makes nothing.
  // The answer goes to the camera (it uses it when its inputs are the frame's own then) and is kept for the step; nothing here changes what the frame computes, only who does.
  forkFrame(): Promise<void> | null {
    const task = this.frameTask;
    const camera = this.camera;
    if (!task || !camera) {
      return null;
    }
    const size = this.platform.size();
    const width = Math.max(1, size[0]);
    const height = Math.max(1, size[1]);
    if (!camera.dirty && width === camera.width && height === camera.height) {
      return null;
    }
    const input = camera.frameInput(width, height, this.clock, this.time);
    return task.ask(input).then((output) => {
      camera.offer({ input, output });
      this.frameAnswer = { input, output };
    });
  }

  // the clock's step for this frame: the fork's answer when its clock and time are the frame's, else the clock's own
  frameStep(): number {
    const answer = this.frameAnswer;
    this.frameAnswer = null;
    const clock = this.clock;
    if (answer && answer.input.time === this.time && answer.input.base === clock.base && answer.input.from === clock.from && answer.input.rate === clock.rate) {
      return answer.output.step;
    }
    return clock.stepAt(this.time);
  }

  // parts (for the tests): only these of sky, water, rain, splashes, or one of the water's test
  // views (Water.MODES), not tone mapped; all by default
  render(parts?: Parts): void {
    const gl = this.gl;
    if (!this.programsReady || gl.isContextLost()) {
      return;
    }
    const all = !parts;
    const p = parts || ALL;
    // (Debug mode's Nearness view: each pixel's real distance from the eye, as a grey)
    const nearView = all && this.settings.debugMode && this.settings.nearness;
    let nearFar = null;
    if (nearView) {
      nearFar = this.nearFar;
      nearFar[0] = this.rain.nearest();
      nearFar[1] = this.rain.furthest();
    }
    this.rain.nearness = this.splashes.nearness = this.water.nearness = nearFar;
    this.step = this.frameStep();
    // (the HDR output, decided before the canvas is sized: the bitmap path draws the picture into a canvas twice as
    // wide; only the normal scene, never the tests' views or the Nearness view)
    const hdrPath = this.hdrPath!;
    hdrPath.setWanted(this.settings.hdr);
    const toHdr = all && !nearView && hdrPath.active(Support.hdr);
    // (a frame not drawn as HDR (the Nearness view, the tests' views): the HDR canvas must not stay shown over the live one with its
    // last picture)
    if (!toHdr) {
      hdrPath.hide();
    }
    this.applySize(toHdr && hdrPath.packed);
    this.camera.update();
    // (each strike's light now and their color: the fog applies them to the strikes' light it
    // gathered)
    this.fog.setStrikes(this.lightning.levelsAt(this.time), this.lightning.color);
    // (the strikes' bolts: their shapes, growth and lights, in the flash's color)
    this.bolt.setStrikes(this.lightning.slots, this.lightning.boltLevelsAt(this.time));
    // (a strike alive: its shadow march reads the waves' blocks' maxima, so the highest-wave search runs every frame: models/quality/wavemax.ts)
    let strikeAlive = false;
    for (let k = 0; k < this.lightning.slots.length; k++) {
      strikeAlive = strikeAlive || !!this.lightning.slots[k];
    }
    this.waves.blocksNeeded = strikeAlive;
    for (let i = 0; i < this.effects!.length; i++) {
      this.effects![i].update(this.time);
    }
    // (calm waves: no mip chain of the reflection, and the water reads its point: set before the reflection is drawn)
    this.reflection.setCalm(this.waves.calm);
    this.water.glossOn = this.reflection.mips;
    // (with Characters lightning the bolt covers what lies behind it, when it is drawn: the
    // rain's, the splashes' and the water's mirrored sky where they are drawn, the scene's
    // picture after the water's pass)
    const covers = this.bolt.covers && (all || !!p.bolt) && !nearView;
    this.rain.covered = this.splashes.covered = this.water.covered = covers;
    if (covers) {
      this.bolt.bindCover();
    }
    // (the Nearness view shows the surfaces the rays meet: the water's own distance, no mirror)
    if (!nearView) {
      // (Reflection plane off: the picture only cleared, nothing mirrored; the draw buffers stay the same each frame)
      // (the inputs of the mirrored picture's reuse, models/quality/rainreuse.ts: strikes is 0 while no strike's light or bolt shows, else the
      // frame count, so a frame with a strike is never reused; the fog's stamp moves with each volume slice, shadow layer and strike slot built)
      const ri = this.reflection.reuse;
      const f = this.fog.refreshed;
      this.fogStamp += f.volumeBuilt + f.shadeLayers + f.strikeSlots;
      let lit = false;
      for (let k = 0; k < this.lightning.levels.length; k++) {
        lit = lit || this.lightning.levels[k] > 0;
      }
      for (let k = 0; k < this.lightning.bolt.length; k++) {
        lit = lit || this.lightning.bolt[k] > 0;
      }
      ri.step = this.step;
      ri.shift = this.text.shift.scene.x;
      ri.settings = this.settingsStamp;
      ri.covered = covers;
      ri.strikes = lit ? ++this.strikeFrames : 0;
      ri.fog = this.fogStamp;
      this.reflection.render(this.waterState.reflectionPass ? this.drawMirrored : this.drawNothing);
    }
    const mode = all || p.water ? "scene" : this.viewOf(p);
    this.exposure.begin(mode === "scene", all && this.bloom.wanted && !nearView);
    this.reflection.bind();
    if (mode) {
      if (this.test) {
        this.test.noWaterLight = !!p.noWaterLight;
      }
      // (the mirrored picture's margin, after the pass has made its frame)
      this.water.mirrorMargin[0] = this.reflection.frame.marginX;
      this.water.mirrorMargin[1] = this.reflection.frame.marginY;
      this.water.draw(mode, this.test);
    }
    if (covers && mode) {
      this.bolt.coverScene(mode === "scene");
    }
    this.reflection.done();
    this.exposure.beginGlyphs();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    // (the Nearness view: the nearest character's grey at each pixel, the largest)
    if (nearView) {
      gl.blendEquation(gl.MAX);
    }
    if (all || p.rain) {
      this.rain.draw(this.step, false);
    }
    if (all || p.splashes) {
      this.splashes.draw(this.step, false);
    }
    // (the bolt is light in the air, no surface: not in the Nearness view)
    if ((all || p.bolt) && !nearView) {
      this.bolt.draw(false);
    }
    if (nearView) {
      gl.blendEquation(gl.FUNC_ADD);
    }
    gl.disable(gl.BLEND);
    if (covers) {
      this.bolt.unbindCover();
    }
    // (the camera's bloom of the emitters' light, not in the tests' raw views)
    this.exposure.resolveGlyphs();
    // (the clock and the message over the scene, before the bloom: the text blooms)
    if ((all || p.text) && !nearView) {
      this.text.composite(this.exposure.scene, this.exposure.glyphs.resolved, this.rain.colorState);
    }
    this.exposure.shiftX = this.text.shift.scene.x;
    const bloom = all && !nearView ? this.bloom.render(this.exposure.glyphsTexture, this.exposure.reflectedTexture) : null;
    // (the HDR output: the tone map into the HDR picture, handed to WebGPU; every other frame, and every frame where
    // HDR is not used, the SDR path as before)
    this.exposure.hdr = toHdr;
    this.exposure.headroom = hdrPath.report.headroom;
    this.exposure.finish(!all, bloom, nearView);
    if (toHdr) {
      hdrPath.present(gl, this.exposure);
    }
    this.bloom.done();
    gl.bindVertexArray(null);
  }

  // the water's test view among the parts asked for (sky: the sky and fog alone; none: no water)
  viewOf(p: Parts): string | null {
    for (let i = 0; i < this.views.length; i++) {
      if (p[this.views[i]]) {
        return this.views[i];
      }
    }
    return p.sky ? "sky" : null;
  }

  // a frame's GPU work timed by the guard (for the tests: the drawing only)
  renderTimed(parts?: Parts): void {
    this.guard.beginFrame();
    this.render(parts);
    this.guard.endFrame();
  }

  // the simulation's time since the last frame (s): the real time, at most M.MAX_GAP, none while
  // paused or after a pause
  tick(now: number): number {
    if (this.paused || this.hidden) {
      this.lastNow = null;
      return 0;
    }
    const passed = this.lastNow === null ? 0 : Math.min((now - this.lastNow) / 1000, this.M.MAX_GAP);
    this.lastNow = now;
    return passed;
  }

  // frames on the browser's animation frames, at most Frame cap (or Wallpaper Engine's FPS, if
  // lower) a second, a frame drawn on the first animation frame it is due (up to 2 ms early),
  // none caught up after a delay; nothing drawn between them. A frame that throws is a failure
  // (fail): the frames stop
  frame(now: number) {
    if (!this.canDraw()) {
      this.looping = false;
      this.lastNow = null;
      return;
    }
    requestAnimationFrame(this.onFrame);
    if (this.manual) {
      this.lastNow = null;
      return;
    }
    // (Simulated music on every animation frame: its own rate, not the frames')
    this.simulateMusic(now);
    const s = this.settings;
    const interval = 1000 / (s.wallpaperFps > 0 ? Math.min(s.frameCap, s.wallpaperFps) : s.frameCap);
    // (the frames' health counted once the wallpaper has loaded, with the Performance readout)
    const counting = this.countsHealth();
    if (counting) {
      this.health!.animationFrame(now);
    } else {
      this.health!.gap();
    }
    if (now < this.nextFrame - 2) {
      return;
    }
    this.nextFrame = this.nextFrame + interval < now ? now + interval : this.nextFrame + interval;
    try {
      if (this.frozen()) {
        this.lastNow = null;
        this.health!.gap();
      } else {
        // (after a pause or the page hidden: no gap counted across it)
        if (this.lastNow === null) {
          this.health!.gap();
        }
        if (this.settings.qualityMode !== "off" && this.quality.mode === "workers" && this.quality.inFlight) {
          // (the previous frame's replies are still awaited: this animation frame draws nothing and the simulation's time is not moved on;
          // the frames' health counts the longer gap to the next drawn frame as missed frames)
          this.quality.frame();
        } else {
          const busy = counting ? this.gpuBusy() : false;
          const start = performance.now();
          if (this.settings.qualityMode === "off") {
            this.advanceFrame(this.tick(now));
            this.drawn++;
            const work = performance.now() - start;
            this.perf!.frame(now, work);
            if (counting) {
              this.health!.frame(now, interval, busy, work, busy ? this.fencePendingMs : 0);
              this.fenceFrame();
            }
          } else {
            // (the quality computed: the controller orders the frame; the draw, here or in its continuation, ends with the same bookkeeping)
            this.qFrame = { now, interval, counting, busy, advanceMs: 0 };
            this.qualityTime = this.time + this.tick(now);
            this.quality.frame();
          }
        }
      }
      if (now >= this.nextReadout) {
        this.nextReadout = now + READOUT_EVERY;
        this.renewReadouts(now);
        this.showReadout(true);
      }
      this.renewMusicReadout(now);
    } catch (error) {
      this.fail(error);
    }
  }

  // the frames' health counted: Debug mode's Performance readout on, and the wallpaper loaded (its
  // start done, WebGPU's included, and its programs ready: not while it starts or after a lost
  // context)
  countsHealth(): boolean {
    const s = this.settings;
    return s.debugMode && s.performance && Support.done && this.programsReady;
  }

  // the frames' health from 0 again (the Performance readout turned on, the frame rate's limit
  // changed)
  resetHealth(): void {
    if (this.health) {
      this.health.reset();
    }
  }

  // whether the GPU was still processing the frame before: its fence not yet passed (read without
  // waiting); the fence let go; fencePendingMs: how long it had been pending
  gpuBusy(): boolean {
    if (this.test && this.test.gpuBusy !== null) {
      return this.test.gpuBusy;
    }
    const fence = this.frameFence;
    if (!fence) {
      return false;
    }
    this.frameFence = null;
    const gl = this.gl;
    const status = gl.clientWaitSync(fence, 0, 0);
    gl.deleteSync(fence);
    this.fencePendingMs = performance.now() - this.frameFenceAt;
    return status === gl.TIMEOUT_EXPIRED;
  }

  // a fence after the frame's GPU work (the next frame reads it)
  fenceFrame(): void {
    const gl = this.gl;
    if (this.frameFence) {
      gl.deleteSync(this.frameFence);
    }
    this.frameFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.frameFenceAt = performance.now();
    this.fineAdd(gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), this.frameFenceAt);
  }

  // a frame's fence into the pending ones (the oldest let go, counted as the time it waited, when too many are pending), and the
  // message loop started if it is not running
  fineAdd(fence: WebGLSync | null, at: number): void {
    if (this.fineCount === FINE_MOST) {
      this.health!.latency(at, at - this.fineTimes[0]);
      if (this.fineFences[0]) {
        this.gl.deleteSync(this.fineFences[0]);
      }
      for (let i = 1; i < FINE_MOST; i++) {
        this.fineFences[i - 1] = this.fineFences[i];
        this.fineTimes[i - 1] = this.fineTimes[i];
      }
      this.fineCount--;
    }
    this.fineFences[this.fineCount] = fence;
    this.fineTimes[this.fineCount] = at;
    this.fineCount++;
    if (!this.finePumping) {
      if (!this.fineChannel) {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => this.finePump();
        this.fineChannel = channel;
      }
      this.finePumping = true;
      this.fineChannel.port2.postMessage(0);
    }
  }

  // reads the pending fences without waiting; each one that has passed gives the health its latency (the time since its frame);
  // the loop goes on while any is pending (a message task between reads, no timer: a timer's minimum delay would round the times)
  finePump(): void {
    const gl = this.gl;
    const now = performance.now();
    let kept = 0;
    for (let i = 0; i < this.fineCount; i++) {
      const fence = this.fineFences[i];
      if (!fence) {
        continue;
      }
      if (gl.clientWaitSync(fence, 0, 0) !== gl.TIMEOUT_EXPIRED) {
        this.health!.latency(now, now - this.fineTimes[i]);
        gl.deleteSync(fence);
      } else {
        this.fineFences[kept] = fence;
        this.fineTimes[kept] = this.fineTimes[i];
        kept++;
      }
    }
    for (let j = kept; j < this.fineCount; j++) {
      this.fineFences[j] = null;
    }
    this.fineCount = kept;
    if (kept > 0) {
      this.fineChannel!.port2.postMessage(0);
    } else {
      this.finePumping = false;
    }
  }

  // the pending fences forgotten (a lost context: they cannot be read or deleted)
  fineReset(): void {
    this.fineFences.fill(null);
    this.fineCount = 0;
  }

  // a frame's work: the simulation moved on by `passed` seconds, the scene drawn (the GPU guard
  // timing it), and the readout's panel; nothing while frozen
  advanceFrame(passed: number) {
    if (this.frozen()) {
      return;
    }
    this.guard.beginFrame();
    this.advanceTo(this.time + passed);
    this.render();
    this.guard.endFrame();
    if (this.readout.shown) {
      this.webgpu.drawPanel(this.time);
    }
  }

  // ---- the quality computed (Debug mode's quality mode; engine/qualityframe.ts, engine/qualitypool.ts) ----

  // the controller's host: this wallpaper's side of a frame in the modes inline and workers. advance moves the simulation to the
  // frame's time, jobs gives what the pool processes (and sends it the data that changed), inline runs a job here with the code the
  // workers run, draw is the draw with the frame's bookkeeping (the health sees the frame when it is drawn), apply gives each
  // effect its quality for the readout. Nothing is culled: the picture is what mode off draws.
  qualityHost(): QualityHost {
    return {
      pool: null,
      advance: () => {
        const start = performance.now();
        this.guard.beginFrame();
        // (the splashes' fall is left to the fork's task, and the waves' advance to the end of the fork: the splashes' impacts come in the fork's answer)
        const forks = this.splashes.task !== null && this.quality.forking();
        this.splashes.forking = forks;
        try {
          this.advanceTo(this.qualityTime!, forks);
        } finally {
          this.splashes.forking = false;
        }
        if (this.qFrame) {
          this.qFrame.advanceMs = performance.now() - start;
        }
      },
      jobs: () => {
        this.qualitySend();
        const jobs: QualityJob[] = [];
        for (const effect of this.effects!) {
          for (const job of effect.qualityJobs()) {
            jobs.push(job);
          }
        }
        return jobs;
      },
      params: () => this.qualityParamsOf(),
      inline: (jobs, params) => this.qualityInline(jobs, params),
      work: () => {
        // (nothing yet that can run without the quality and without changing a result)
      },
      fork: () => {
        const asked: Promise<void>[] = [];
        // (the strikes' light of the frame given to the fog as render gives it, so that Fog.fork plans with the values its update reads; idempotent)
        this.fog.setStrikes(this.lightning.levelsAt(this.time), this.lightning.color);
        // (this frame's strikes' growth and lights, for the effects' jobs: render sets the same values again from the same time)
        this.bolt.setStrikes(this.lightning.slots, this.lightning.boltLevelsAt(this.time));
        for (const effect of this.effects!) {
          const answer = effect.fork(this.time);
          if (answer) {
            asked.push(answer);
          }
        }
        return asked.length ? Promise.all(asked) : Promise.resolve();
      },
      // (the camera's matrices: the quality job's parameters read them, so they are asked and awaited before the jobs and the parameters are made)
      forkFirst: () => {
        const asked: Promise<void>[] = [];
        const splashes = this.splashes.forkFirst(this.time);
        if (splashes) {
          asked.push(splashes);
        }
        const camera = this.forkFrame();
        if (camera) {
          asked.push(camera);
        }
        return asked.length ? Promise.all(asked) : Promise.resolve();
      },
      draw: () => {
        const start = performance.now();
        this.finishAdvance();
        this.render();
        this.guard.endFrame();
        if (this.readout.shown) {
          this.webgpu.drawPanel(this.time);
        }
        const f = this.qFrame;
        if (f) {
          this.qFrame = null;
          this.drawn++;
          const work = f.advanceMs + (performance.now() - start);
          this.perf!.frame(f.now, work);
          if (f.counting) {
            this.health!.frame(f.now, f.interval, f.busy, work, f.busy ? this.fencePendingMs : 0);
            this.fenceFrame();
          }
        }
      },
      apply: (results) => {
        for (const key of Object.keys(results.levels)) {
          this.effects![+key].setQuality(this.M.QualityFrame.summarize(results.levels[+key]));
        }
      },
      fail: (error) => this.fail(error),
    };
  }

  // the tests' switch of the level of detail for every effect (Effect.lod): culling stays, detail goes to full
  setLod(on: boolean): void {
    this.lodOn = on;
    for (const effect of this.effects || []) {
      effect.lod = on;
    }
  }

  // the effects' job statics to the pool when they changed (an effect gives them only when they did: a layout swapped, a trail changed,
  // the effects made again), and all of them to a pool that did not have them yet
  qualitySend(): void {
    const pool = this.qualityPool;
    for (const effect of this.effects!) {
      const kind = effect.qualityKind();
      if (kind === "") {
        continue;
      }
      const arrays = effect.qualityStatics();
      if (arrays) {
        this.qualityStatics[effect.qualityIndex] = { kind, arrays };
        if (pool && this.qualitySentTo === pool) {
          pool.setStatic(effect.qualityIndex, arrays, kind);
        }
      }
    }
    if (pool && this.qualitySentTo !== pool) {
      for (const key of Object.keys(this.qualityStatics)) {
        const given = this.qualityStatics[+key];
        pool.setStatic(+key, given.arrays, given.kind);
      }
      this.qualitySentTo = pool;
    }
  }

  // the frame's parameters of every effect's job: the shared view filled in place (the camera's matrices up to date first, so the levels are
  // exact for the frame as it will be drawn), then each effect's own parameters from it
  qualityParamsOf(): Record<number, object> {
    const camera = this.camera;
    camera.update();
    let shared = this.qualityShared;
    if (!shared) {
      shared = this.qualityShared = {
        step: 0,
        time: 0,
        inputs: { viewProjection: camera.viewProjection, eyeX: 0, eyeY: 0, eyeZ: 0, focal: 1, width: 1, height: 1, sigma: 0, air: AIR, waterDrawn: true, waterY: this.M.Floor.WATER_Y, margin: 0, blur: 1, occluders: new Float32Array(0), occluderCount: 0 },
      };
    }
    shared.step = this.clock.stepAt(this.time);
    shared.time = this.time;
    const inputs = shared.inputs;
    inputs.viewProjection = camera.viewProjection;
    inputs.eyeX = camera.eyeX;
    inputs.eyeY = camera.eyeY();
    inputs.focal = camera.focal();
    inputs.width = camera.width;
    inputs.height = camera.height;
    inputs.sigma = this.fog.sigma();
    inputs.waterDrawn = this.waterState.waterDrawn;
    // (a drop, a splash or a foot lifted by a wave is at most the highest wave over the floor: every unit's radius grows by it, so the frustum test keeps every lifted one)
    inputs.margin = this.waterState.wavesStepped && this.waves ? this.waves.highest : 0;
    // (the mirrored view's frustum: the reflection's larger picture, for the units drawn in it)
    camera.setMirror(this.M.Reflection.MARGIN);
    camera.mirrorUpdate();
    inputs.mirror = camera.mirrorView;
    for (const effect of this.effects!) {
      if (effect.qualityKind() !== "") {
        this.qualityParams[effect.qualityIndex] = effect.qualityParams(shared);
      }
    }
    return this.qualityParams;
  }

  // a job run here, into arrays kept between frames
  qualityInline(jobs: QualityJob[], params: Record<number, object>): QualityResults {
    const levels: Record<number, Uint8Array> = {};
    for (const job of jobs) {
      let out = this.qualityLevels[job.effect];
      if (!out || out.length !== job.units) {
        out = this.qualityLevels[job.effect] = new Uint8Array(job.units);
      }
      const given = this.qualityStatics[job.effect];
      this.M.QualityJobs.run(given ? given.kind : "units", given ? given.arrays : {}, params[job.effect] as QualityParams, 0, job.units, out);
      levels[job.effect] = out;
    }
    return { frame: 0, levels };
  }

  // the pool, made once when the mode workers is first chosen (its workers start from the bundle: nested when this is the render
  // worker); the controller acts as inline until it is there
  startQuality(): void {
    if (this.qualityTask) {
      return;
    }
    const count = M.QualityTasks.workerCount(typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined);
    const task = new M.QualityPoolTask(count, {
      base: this.platform.base,
      force: typeof Worker !== "function" ? "none" : testOptions().qualityWorker || "",
      existing: this.qualityPool || undefined,
      observe: (event) => {
        if (event.name === "adopt") {
          this.mark("qualityPool");
          this.giveShadePool();
        }
      },
    });
    this.qualityTask = task;
    this.tasks.quality = task as unknown as ThreadedTask;
    // (the pool exists from the start with no worker: the controller acts inline until one is alive)
    this.qualityPool = task.pool;
    this.qualitySentTo = null;
    this.quality.host.pool = task.pool;
    task.start();
  }

  // the workers released (the pool kept, with the statics it has): the controller acts inline, the fog bakes on the GPU
  stopQuality(): void {
    const task = this.qualityTask;
    if (task) {
      task.stop(true);
      this.qualityTask = null;
    }
  }

  // the fog's shade grid baked by the pool's workers when the level of detail is on (effects/fog.ts): given once for each fog and pool
  giveShadePool(): void {
    const pool = this.qualityPool;
    if (this.fog && pool && this.shadeGiven !== this.fog) {
      this.shadeGiven = this.fog;
      this.fog.setShadePool(pool);
    }
  }

  // for the tests: the simulation moved on to a time and one frame drawn through the controller, as an animation frame's is (off:
  // at once; workers: after the pool's replies); resolves when drawn
  frameAt(seconds: number): Promise<void> {
    this.qFrame = null;
    this.qualityTime = seconds;
    if (this.quality.mode === "workers" && this.quality.inFlight) {
      return this.quality.last.then(() => this.frameAt(seconds));
    }
    this.quality.frame();
    return this.quality.last.then(() => undefined);
  }

  // for the tests: the controller's counts and the pool's workers alive
  qualityStats(): { mode: string; applied: number; skipped: number; late: number; workers: number } {
    return { mode: this.quality.mode, applied: this.quality.applied, skipped: this.quality.skipped, late: this.quality.late, workers: this.qualityPool ? this.qualityPool.alive : 0 };
  }

  // the effects' quality for the Performance readout (null while the effects are not made)
  qualityReport(): QualityReport | null {
    if (!this.effects) {
      return null;
    }
    const pool = this.settings.qualityMode === "workers" && this.qualityPool ? this.qualityPool.report() : undefined;
    return this.M.SupportReadout.assembleQuality(
      this.effects
        .filter((effect) => (effect.constructor as typeof Effect).IN_QUALITY)
        .map((effect) => ({ name: effect.constructor.name, unit: (effect.constructor as typeof Effect).QUALITY_UNIT, quality: effect.quality(), note: this.qualityNote(effect) })),
      pool,
    );
  }

  // what an effect did with the quality in the last frame, from its own counters (nothing before the pool has given a result)
  qualityNote(effect: Effect): string {
    // (the effects without a job say so, whatever the pool has given)
    if (effect === this.water) {
      return this.M.SupportReadout.noteOf(effect.constructor.name.toLowerCase(), {});
    }
    if (!effect.qualityResult) {
      return "";
    }
    const name = effect.constructor.name.toLowerCase();
    const c: Record<string, number> = {};
    if (effect === this.rain) {
      const rain = this.rain;
      c.direct = rain.listedDrops;
      c.reach = rain.reach;
      c.mirror = rain.dropListed ? rain.mirrorCount : -1;
    } else if (effect === this.splashes) {
      const s = this.splashes;
      c.direct = s.listCount[0];
      c.mirror = s.listCount[1];
      c.live = s.liveCount;
    } else if (effect === this.bolt) {
      c.listed = this.bolt.listTotal;
      c.mirror = this.bolt.mirrorListTotal;
    } else if (effect === this.fog) {
      const held = this.fog.heldNow;
      c.slices = held ? held.length : 0;
      c.held = 0;
      for (let k = 0; held && k < held.length; k++) {
        c.held += held[k];
      }
    } else if (effect === this.reflection) {
      c.skipped = this.reflection.skipped;
      c.reused = this.reflection.gate.reused;
      c.drawn = this.reflection.gate.drawn;
    } else if (effect === this.waves) {
      c.skipped = this.waves.skippedSearches;
    } else if (effect === this.lightning) {
      c.hidden = effect.qualityResult.units - effect.qualityResult.drawn;
    }
    return this.M.SupportReadout.noteOf(name, c);
  }

  // Debug mode's Performance and Music readouts' values, once a second: the frames a second and
  // their script's time since the last, the GPU's time a frame (the guard's passes measured in
  // the last frames), the frame rate's limit, the scene's size and counts; the audio's source,
  // arrays a second and levels
  renewReadouts(now: number): void {
    const s = this.settings;
    const p = this.performanceReport;
    const summary = this.perf!.summary(now);
    p.fps = summary.fps;
    p.scriptMs = summary.scriptMs;
    p.timer = !!Support.webgl2.timerQueries;
    p.gpuMs = p.timer ? this.M.PerfMeter.gpuOf(this.guard.recent()) : null;
    p.frozen = this.frozen();
    p.frozenFor = p.frozen ? Math.floor((performance.now() - this.frozenSince) / 1000) : 0;
    p.frameCap = s.frameCap;
    p.wallpaperFps = s.wallpaperFps;
    p.limit = s.wallpaperFps > 0 ? Math.min(s.frameCap, s.wallpaperFps) : s.frameCap;
    // (the scene's size: the canvas is twice as wide while the HDR bitmap path draws the packed picture into it)
    p.width = this.sized ? this.sized[0] : this.canvas.width;
    p.height = this.sized ? this.sized[1] : this.canvas.height;
    p.drops = this.rain ? this.rain.active : 0;
    p.splashes = this.splashes ? this.splashes.count : 0;
    p.strikes = this.lightning ? this.lightning.slots.filter(Boolean).length : 0;
    p.frames = this.countsHealth() ? this.health!.summary(now) : null;
    p.quality = this.qualityReport();
    p.mouse = {
      on: s.parallax.on,
      mode: s.parallax.mode,
      x: this.pointerX,
      y: this.pointerY,
      inside: this.pointerInside,
      yaw: this.camera.yaw,
      pitch: this.camera.pitchShift,
      eyeX: this.camera.eyeX,
      eyeY: this.camera.eyeShift,
      worker: !!this.parallaxClient && !this.parallaxClient.inline,
      moving: this.parallaxMoving,
    };
    const m = this.musicReport;
    m.source = this.simulated() ? `simulated ${s.musicSource}` : "real audio";
    m.rate = this.audioRate!.perSecond(performance.now());
    m.follower = this.musicFollowerReport(performance.now(), true);
    // (the OLED shifts, the text effect's: in place)
    const o = this.oledReport;
    if (this.text) {
      const shift = this.text.shift;
      o.limit = this.text.limit;
      o.scene.x = shift.scene.x;
      o.clock.x = shift.clock.x;
      o.clock.y = shift.clock.y;
      o.message.x = shift.message.x;
      o.message.y = shift.message.y;
    }
  }

  // the readout's follower: what the music's last reply said, the music strikes in the last strikeWindow seconds, and the rain it sets: its drop target (the drops wanted times the
  // mean share of the columns, from the newest reply), that as a Rain density, and the drops falling (counted four times a second); null: React to music off. The best peak score
  // starts again after each once-a-second renewal (`renew`)
  musicFollowerReport(now: number, renew: boolean): MusicFollowerReport | null {
    const rain = this.rain;
    if (!this.settings.music.useMusic || !this.musicActive || !rain) {
      return null;
    }
    const said = this.musicSaid;
    let strikes = 0;
    for (let i = 0; i < this.musicStrikes.length; i++) {
      if (this.musicStrikes[i]! > 0 && now - this.musicStrikes[i]! <= said.strikeWindow * 1000) {
        strikes++;
      }
    }
    said.strikes = strikes;
    said.wanted = rain.active;
    if (now - this.musicCountedAt >= 250) {
      this.musicCountedAt = now;
      let falling = 0;
      const columns = rain.showingColumns(Math.max(1, this.musicShares.length || rain.musicColumns()), this.musicCounted);
      for (let c = 0; c < Math.max(1, this.musicShares.length || rain.musicColumns()); c++) {
        falling += columns[c]!;
      }
      said.falling = falling;
    }
    let sum = 0;
    for (let c = 0; c < this.musicShares.length; c++) {
      sum += this.musicShares[c]!;
    }
    const share = this.musicShares.length > 0 && said.driven ? sum / this.musicShares.length : 1;
    said.target = Math.round(rain.active * share);
    said.density = rain.density * share;
    said.densitySet = rain.density;
    const out = Object.assign({}, said);
    if (renew) {
      said.scoreMost = 0;
    }
    return out;
  }

  // the Music readout in real time: its numbers and text renewed ten times a second while it is shown (the other readouts once a second)
  renewMusicReadout(now: number) {
    const s = this.settings;
    if (!s.debugMode || !s.musicReadout || now < this.nextMusicReadout) {
      return;
    }
    this.nextMusicReadout = now + MUSIC_READOUT_EVERY;
    this.musicReport.follower = this.musicFollowerReport(performance.now(), false);
    this.showReadout();
  }

  // the support readout (and its WebGPU panel): a Debug mode setting, shown only with Debug mode
  // (or after a failure at start); WebGPU's device kept only while it is shown. tick: the
  // once-a-second renewal (a worker's readout sends its report then only while it is shown)
  showReadout(tick?: boolean): void {
    if (this.readout) {
      const s = this.settings;
      const d = Support.debug;
      d.support = this.failure || s.showSupport;
      d.performance = s.debugMode && s.performance ? this.performanceReport : null;
      d.music = s.debugMode && s.musicReadout ? this.musicReport : null;
      d.oled = s.debugMode && s.oledReadout ? this.oledReport : null;
      this.readout.shown = this.failure || (s.debugMode && (s.showSupport || s.performance || s.musicReadout || s.oledReadout));
      this.readout.show(this.webgpu && this.webgpu.hasPanel, tick);
      if (this.webgpu) {
        this.webgpu.want(this.readout.shown);
      }
    }
  }
}

// a renderer given its platform (the test prelude's trace, window.Matrix3DTrace set before the bundle loads, is handed the renderer to read its state per frame; nothing else reads it)
const make = (platform: RenderPlatform) => {
  const wallpaper = new Wallpaper(platform);
  if (window.Matrix3DTrace) {
    window.Matrix3DTrace.wallpaper = wallpaper;
  }
  return wallpaper;
};

// the tests: the renderer on the page, driven synchronously (script: the bundle's URL)
const startTests = (script: string) => {
  Support.renderer = "page";
  Support.rendererWhy = "the tests";
  const wallpaper = new Wallpaper(new PagePlatform(script, document.getElementById("gl") as HTMLCanvasElement, document.getElementById("gpu") as HTMLCanvasElement, document.getElementById("support") as HTMLElement, true));
  window.wallpaperPropertyListener = {
    applyUserProperties: (p) => wallpaper.applyUserProperties(p),
    applyGeneralProperties: (p) => wallpaper.applyGeneralProperties(p),
    setPaused: (paused) => wallpaper.setPaused(paused),
  };
  if (typeof window.wallpaperRegisterAudioListener === "function") {
    window.wallpaperRegisterAudioListener((array) => wallpaper.audio(array));
  }
  window.Support = Support;
  const ready = new Promise<void>((resolve, reject) => {
    const go = () => wallpaper.begin().then(resolve, reject);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", go);
    } else {
      go();
    }
  });
  // (an unhandled rejection otherwise: the failure is shown in the readout)
  ready.catch(() => {});
  if (M.TEST) {
    installTestApi(wallpaper, ready);
  }
};

if (inWorker()) {
  const name = workerScope().name;
  if (name === "render") {
    serveWorker(Support, make);
  } else if (name === "bolt") {
    M.BoltWorker.serve();
  } else if (name === "scene") {
    M.SceneWorker.serve();
  } else if (name === "hdr") {
    M.HdrWorker.serve();
  } else if (name === "quality") {
    M.QualityWorker.serve();
  } else if (name === "music") {
    M.MusicWorker.serve();
  } else if (name === "parallax") {
    M.ParallaxWorker.serve();
  } else if (name === "strikeplan") {
    M.StrikePlanWorker.serve();
  } else if (name === "fogplan") {
    M.FogPlanWorker.serve();
  } else if (name === "boltlist") {
    M.BoltListWorker.serve();
  } else if (name === "frame") {
    M.FrameWorker.serve();
  } else if (name === "splash") {
    M.SplashWorker.serve();
  } else if (name === "simmusic") {
    M.SimMusicWorker.serve();
  } else if (name === "textlayout") {
    M.TextLayoutWorker.serve();
  }
} else if (document.getElementById("gl")) {
  // (the bundle's URL: its workers are made from it; read while it runs, as it loads)
  const script = (document.currentScript as HTMLScriptElement | null)?.src || "";
  if (M.TEST) {
    startTests(script);
  } else {
    startShell(Support, script, make);
  }
}
