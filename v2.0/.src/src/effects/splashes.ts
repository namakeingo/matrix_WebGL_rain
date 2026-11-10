// Splashes: where a drop lands, 2 to 5 characters thrown up, each 30% to 70% of its drop's size,
// at most 60° from straight up in any way round (x and z), flying under gravity: exactly (worked
// out from their start, not stepped), so they fall back on the water where they would. Each, in
// its drop's colour (its landing's: Rain.colorOf), leaves a stamp a rain step where it is (the
// step clock's, shared with the rain), fading over its trail's steps (Trail length x
// TRAIL_PER_LENGTH, a third of the rain's cells), the newest a head as a drop's (Head
// brightness). Falling back, each makes an impact of weight IMPACT on the water (looked at once a
// frame: the waves take the impacts at their next step).
// The splashes in the air are kept in typed arrays (at most MOST, in the order they came; when
// there is no room, the oldest go first, all those a landing needs at once), with no object made
// for one; the script keeps them for their impacts (fall) and the tests only.
// Their stamps are placed on the GPU: each splash is sent once, when it is thrown up, into a ring
// of RING splashes in an unsigned integer texture (SPLASH_TEXELS texels a splash: its start, its
// speed, its size and its colour as float bits; its first stamp's step, its count of stamps and its
// glyph seed as unsigned integers; its first stamp's time after its start and the steps' rate
// then). The splashes of the ring's span (the oldest kept to the newest) are drawn as one instance
// per splash and trail step, from the quad's plain vertex array; the vertex shader works out the
// stamp's step (uStep - age), whether it was stamped (within its count from its first step, after
// the last jump uFrom, not past the last step moved on to uTo: differences of unsigned steps,
// small numbers at any step) and its place by the ballistic formula (Splashes.placeAt, with
// M.TEST, is the same rule in the script). A jump past what a frame can move (a reset, the tests')
// leaves no stamps from before it.
// A splash's stamps take the steps' rate it was thrown up at (a Speed change while it flies, at
// most about 0.22 s, does not move its later stamps' times).
// The ring's texture is read on the work unit (M.UNITS.work: bound before each use by whatever
// reads it), bound in each draw and unbound after.
// Each stamp's corners read the fog's volume (direct, or mirrored for its reflection, dimmed only
// by the water's Fresnel and the fog). Covered (covered, set each frame) by the bolt's line and
// characters in front of it, as the rain (GlyphAtlas.fragment's cover).
// Its program is warmed in the first frame of each pass (drawn direct and mirrored), as one
// instance of a slot with no stamps (nothing drawn): the driver finishes a program when it is
// first drawn, and the first splash comes only when a drop lands (otherwise that frame waits about
// half a second).
//
// Quality (models/quality/splashes.ts): each live splash is two units for the quality pool's job "splashes", its direct view (unit i)
// and its mirror image in the reflection (unit N + i); the job's params carry the splashes' records read from the ring (what the
// shader reads), the levels come back before the draw (setQuality). The direct and the mirrored draw each take only the splashes
// with a level over 0 in their view, as a list of ring slots (an instanced attribute with a divisor of the trail's steps: the
// vertex shader reads its slot from it instead of counting from the span's first), for the camera the levels were made for. A
// splash with no stamp drawn is level 0, so the dead slots of the span (splashes let go while an older one is kept) go too. Without
// a result (quality mode off, a late result, a changed camera) the draw is the whole span, as before.
//
// LOD (Effect.lod): in the direct view the vertex shader does not draw a stamp whose brightest light (its colour, the head's gain,
// the trail's fade and the fog) is under QualitySplashes.LOD_LIGHT_FLOOR; the mirrored pass keeps every stamp (its distance output
// is read by the water). With lod false the floor is 0 and the draw is as without it.
//
// Changelog:
// 2026-11-07: the listed draw instances only the ages whose light bound reaches the floor (directAges), and a quad under half a pixel
//   is a point in the direct view (uPointPx, uAges).
// 2026-11-07: LOD of the stamps in the direct view (uniforms uLodFloor, uHeadPeak).
// 2026-11-06: the quality job (two units a splash, direct and mirrored) and the draws of the listed splashes' slots.
// 2026-11-03: the stamps placed on the GPU from a ring of splashes sent once each (was: every
//   flying splash stamped by the script at each step, every live stamp uploaded each frame).
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/splashes.js).
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import VERTEX_SOURCE from "../shaders/splashes/vertex.glsl";
import { QualitySplashes } from "../models/quality/splashes";
import { QualityUnit } from "../models/quality/unit";
import { HEAD_GAIN } from "../materials/drops";
import type { QualityJob, EffectQuality, QualityShared } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";
import type { SplashQualityParams, SplashSphere } from "../models/quality/splashes";
import type { EffectContext, SharedGlsl } from "../engine/effect";
import type { Programs, ProgramSources, ShaderProgram } from "../engine/gl";
import type { StepClock } from "../engine/clock";
import type { GlyphAtlas } from "../engine/glyphs";

// a splash's values kept a splash each (FIELDS), in arrays of MOST
type Field = "x0" | "z0" | "t0" | "vx" | "vy" | "vz" | "size" | "land" | "serial";

// a splash's record as the vertex shader reads it (Splashes.placeAt)
export interface SplashRecord {
  x0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  seed: number;
  first: number;
  count: number;
  offset: number;
  rate: number;
}

// a stamp of a splash at a step (Splashes.placeAt): whether it is drawn, its place, size and glyph
// seed
export interface SplashStamp {
  shown: boolean;
  x: number;
  y: number;
  z: number;
  size: number;
  glyph: number;
}

// a splash where it is at a time (Splashes.describe, for the tests)
export interface SplashState {
  x0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  landed: boolean;
  x: number;
  y: number;
  z: number;
}

// the place and colour a drop landed with (Rain.dropAt's description of it)
interface Landing {
  x: number;
  z: number;
  color: Float32Array | undefined;
}

const GRAVITY = 9.81;
// the Splash height's default target (m): the average height of a splash thrown straight up
const TARGET_HEIGHT = 0.15;
// the trail's steps at the default Trail length (15), and per Trail length
const TRAIL = 6;
const TRAIL_PER_LENGTH = TRAIL / 15;
const MOST = 4096;
// the ring of splashes on the GPU (the span drawn at most), its texture's width in texels, each
// splash's texels (16 values) and the splashes a row
const RING = 2 * MOST;
const ACROSS = 256;
const SPLASH_TEXELS = 4;
const PER_ROW = ACROSS / SPLASH_TEXELS;
const IMPACT = 0.35;
// the splashes' records of the quality job kept in blocks of this many splashes (the params are copied to the workers whole)
const BLOCK = 256;
const WHITE = Float32Array.of(1, 1, 1);
// a splash's values: where and when it starts, its speed, its size, when it falls back, its
// serial number (its slot in the ring: serial % RING)
const FIELDS: Field[] = ["x0", "z0", "t0", "vx", "vy", "vz", "size", "land", "serial"];

export class Splashes extends M.Effect {
  static GRAVITY: number;
  static RING: number;
  static placeAt: (rec: SplashRecord, step: number, from: number, to: number) => SplashStamp;
  static stampsOf: (clock: StepClock, t0: number, land: number, out?: Float64Array) => Float64Array;
  static vertex: (glsl: SharedGlsl) => string;
  describe!: (time: number) => SplashState[];
  land!: Float64Array;
  size!: Float64Array;
  vz!: Float64Array;
  vy!: Float64Array;
  vx!: Float64Array;
  t0!: Float64Array;
  z0!: Float64Array;
  x0!: Float64Array;
  serial!: Float64Array;
  program!: ShaderProgram;
  texture: WebGLTexture;
  warmed: boolean[];
  liveCount: number;
  firstSlot: number;
  span: number;
  from: number;
  lastStep: number;
  stamps: Float64Array<ArrayBuffer>;
  sent: number;
  nextSerial: number;
  ringFloats: Float32Array<ArrayBuffer>;
  ring: Uint32Array<ArrayBuffer>;
  random: () => number;
  seeds: Uint32Array<ArrayBuffer>;
  landed: Uint8Array<ArrayBuffer>;
  count: number;
  covered: boolean;
  viewScale: number;
  trail: number;
  head: number;
  targetHeight: number;
  onLand: (x: number, z: number, weight: number) => void;
  clock: StepClock;
  seed: number;
  atlas: GlyphAtlas;
  nearness: ArrayLike<number> | null;
  noSplashes: boolean;
  debug: boolean;
  // the quality's lists (setQuality): the ring slots of the splashes seen directly (the first MOST values) and mirrored (from MOST),
  // their counts, whether they are the frame's (listed) and the camera version they were made for; their GPU buffer and vertex array
  slotList: Uint32Array<ArrayBuffer>;
  listCount: Int32Array<ArrayBuffer>;
  // the stamp ages each view's listed draw instances (directAges), and the scratch of the cut
  listAges: Int32Array<ArrayBuffer>;
  ageCuts: Int32Array<ArrayBuffer>;
  sphere: SplashSphere;
  listed: boolean;
  listVersion: number;
  listBuffer!: WebGLBuffer;
  listArray!: WebGLVertexArrayObject;
  // the job's params object and its records' array (grown by whole blocks of splashes), and whether the statics were given
  qualityParamValues: SplashQualityParams | null;
  qualityData: Float64Array<ArrayBuffer> | null;
  qualitySent: boolean;
  // onLand(x, z, weight): one fell back (a stamp each step of context.clock, the rain's)
  constructor(context: EffectContext, onLand: (x: number, z: number, weight: number) => void) {
    super(context);
    const gl = this.gl;
    this.debug = false;
    this.noSplashes = false;
    // (Debug mode's Nearness view: the rain's nearest and furthest distances, null when off)
    this.nearness = null;
    this.atlas = context.atlas;
    this.seed = context.seed;
    this.clock = context.clock;
    this.onLand = onLand;
    this.head = M.GlyphAtlas.HEAD;
    this.trail = TRAIL;
    this.targetHeight = TARGET_HEIGHT;
    // (the tests' scale of the characters' light: with M.TEST only)
    this.viewScale = 1;
    // whether the bolt covers what lies behind it this frame (Characters lightning: set by src/index.ts)
    this.covered = false;
    this.count = 0;
    this.slotList = new Uint32Array(2 * MOST);
    this.listCount = new Int32Array(2);
    this.listAges = new Int32Array(2);
    this.ageCuts = new Int32Array(MOST);
    this.sphere = { kmin: 0, kmax: 0, cx: 0, cy: 0, cz: 0, r: 0, mx: 0, my: 0, mz: 0 };
    this.listed = false;
    this.listVersion = -1;
    this.qualityParamValues = null;
    this.qualityData = null;
    this.qualitySent = false;
    for (const field of FIELDS) {
      this[field] = new Float64Array(MOST);
    }
    this.landed = new Uint8Array(MOST);
    this.seeds = new Uint32Array(MOST);
    this.random = M.seededRandom(this.seed);
    // the ring as sent to the GPU (its values as floats and as unsigned integers), the next
    // serial number, and the serials sent so far
    this.ring = new Uint32Array(RING * SPLASH_TEXELS * 4);
    this.ringFloats = new Float32Array(this.ring.buffer);
    this.nextSerial = 0;
    this.sent = 0;
    // a splash's stamps (Splashes.stampsOf's first step, count, offset)
    this.stamps = new Float64Array(3);
    // the steps moved on to: the last, and the last jump's (no stamps up to it)
    this.lastStep = 0;
    this.from = 0;
    // the ring's span drawn this frame (splashes), its first slot, and its instances (span x
    // trail)
    this.span = 0;
    this.firstSlot = 0;
    this.liveCount = 0;
    // the passes (direct, mirrored) its program has been drawn in
    this.warmed = [false, false];
    this.texture = this.createTexture();
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32UI, ACROSS, RING / PER_ROW);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ACROSS, RING / PER_ROW, gl.RGBA_INTEGER, gl.UNSIGNED_INT, this.ring);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.reset();
  }

  static programs(glsl: SharedGlsl): ProgramSources {
    return { splash: [Splashes.vertex(glsl), M.GlyphAtlas.fragment(glsl, M.TEST, true, true)] };
  }

  static QUALITY_UNIT = "splashes";

  static properties() {
    return {
      p105_setting_HeadBrightness: (splashes: Splashes, v: number) => (splashes.head = v / 100),
      // (Splash height, mm: the target height of a splash thrown straight up)
      p207_setting_SplashHeight: (splashes: Splashes, v: number) => (splashes.targetHeight = v / 1000),
      p118_setting_TrailLength: (splashes: Splashes, v: number) => (splashes.trail = Math.max(1, Math.round(v * TRAIL_PER_LENGTH))),
      // (Debug mode's No splashes: no splash from a landing; its ring on the water is the rain's)
      p623_setting_DebugNoSplashes: (splashes: Splashes, v: boolean) => (splashes.noSplashes = v),
    };
  }

  // Debug mode on or off (No splashes works only with it)
  setDebug(on: boolean) {
    this.debug = on;
  }

  init(programs: Programs) {
    [this.program] = this.ownPrograms(programs, ["splash"]);
    this.program.samplers({
      uSplashes: M.UNITS.work,
      uAtlas: M.UNITS.atlas,
      uFogDirect: M.UNITS.fogDirect,
      uFogMirror: M.UNITS.fogMirror,
      uStrikeDirect: M.UNITS.strikeDirect,
      uStrikeMirror: M.UNITS.strikeMirror,
      uWaves: M.UNITS.waves,
      uWaveMax: M.UNITS.waveMax,
      uBoltCover: M.UNITS.boltCover,
      uBoltNear: M.UNITS.boltNear,
    });
    // (an integer attribute's own current value: the draw without the list reads it)
    this.gl.vertexAttribI4ui(M.ATTRIBUTES.aDrop, 0, 0, 0, 0);
    this.listBuffer = this.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.listBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, 2 * MOST * 4, this.gl.DYNAMIC_DRAW);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.listArray = this.vertexArray([{ buffer: this.listBuffer, attribute: "aDrop", size: 1, integer: true }]);
  }

  reset() {
    this.count = 0;
    this.random = M.seededRandom(this.seed);
    // (the slots sent before stay in the ring, out of the span)
    this.sent = this.nextSerial;
    this.lastStep = 0;
    this.from = 0;
    this.span = 0;
    this.liveCount = 0;
    this.listed = false;
  }

  // a drop landed (at its place, at a time, in its colour): 2 to 5 splashes of its size
  fromLanding(drop: Landing, time: number, size: number) {
    if (this.debug && this.noSplashes) {
      return;
    }
    this.spawn(drop.x, drop.z, 2 + Math.floor(this.random() * 4), size, time, drop.color);
  }

  // splash `from` copied to place `to`
  move(from: number, to: number) {
    for (const field of FIELDS) {
      this[field][to] = this[field][from];
    }
    this.landed[to] = this.landed[from];
    this.seeds[to] = this.seeds[from];
  }

  // the oldest `n` splashes let go (the others moved to the front, in their order)
  dropOldest(n: number) {
    for (const field of FIELDS) {
      this[field].copyWithin(0, n, this.count);
    }
    this.landed.copyWithin(0, n, this.count);
    this.seeds.copyWithin(0, n, this.count);
    this.count -= n;
  }

  // count splashes from a place of the water (x, z), at a time, in a colour (white if none) (the
  // oldest let go when there is no room, in the arrays or in the ring's span)
  spawn(x: number, z: number, count: number, size: number, time: number, color: Float32Array = WHITE) {
    count = Math.min(count, MOST);
    if (this.count + count > MOST) {
      this.dropOldest(this.count + count - MOST);
    }
    let over = 0;
    while (over < this.count && this.serial[over] < this.nextSerial + count - RING) {
      over++;
    }
    if (over > 0) {
      this.dropOldest(over);
    }
    for (let k = 0; k < count; k++) {
      const speed = M.SplashLaunch.speedFor(this.targetHeight, M.SplashLaunch.energyFactorOf(this.random()));
      const tilt = (Math.PI / 3) * Math.sqrt(this.random());
      const round = 2 * Math.PI * this.random();
      const v = M.SplashLaunch.velocity(speed, round, Math.PI / 2 - tilt);
      const vy = v.y;
      const i = this.count++;
      this.x0[i] = x;
      this.z0[i] = z;
      this.t0[i] = time;
      this.vx[i] = v.x;
      this.vy[i] = vy;
      this.vz[i] = v.z;
      this.size[i] = size * (0.3 + 0.4 * this.random());
      this.land[i] = time + (2 * vy) / GRAVITY;
      this.landed[i] = 0;
      this.seeds[i] = Math.floor(this.random() * 4294967296);
      this.serial[i] = this.nextSerial++;
      this.record(i, color);
    }
  }

  // splash i's values into its slot of the ring (sent to the GPU in the next update)
  record(i: number, color: ArrayLike<number>) {
    const st = Splashes.stampsOf(this.clock, this.t0[i], this.land[i], this.stamps);
    const o = (this.serial[i] % RING) * SPLASH_TEXELS * 4;
    const f = this.ringFloats;
    const u = this.ring;
    f[o] = this.x0[i];
    f[o + 1] = this.z0[i];
    f[o + 2] = this.size[i];
    f[o + 3] = st[2];
    f[o + 4] = this.vx[i];
    f[o + 5] = this.vy[i];
    f[o + 6] = this.vz[i];
    f[o + 7] = this.clock.rate;
    f[o + 8] = color[0];
    f[o + 9] = color[1];
    f[o + 10] = color[2];
    f[o + 11] = 0;
    u[o + 12] = st[0];
    u[o + 13] = st[1];
    u[o + 14] = this.seeds[i];
    u[o + 15] = 0;
  }

  // the splashes falling back on the water by a time, and the ones whose stamps are all gone
  // let go (the others kept in their order)
  fall(time: number) {
    let kept = 0;
    for (let i = 0; i < this.count; i++) {
      if (!this.landed[i] && time >= this.land[i]) {
        this.landed[i] = 1;
        const t = this.land[i] - this.t0[i];
        this.onLand(this.x0[i] + this.vx[i] * t, this.z0[i] + this.vz[i] * t, IMPACT);
      }
      if (!this.landed[i] || this.clock.at(time) < this.clock.at(this.land[i]) + this.trail) {
        if (kept !== i) {
          this.move(i, kept);
        }
        kept++;
      }
    }
    this.count = kept;
  }

  // the rain's steps since the last time (the stamps are the GPU's: only the step kept), then
  // the splashes fallen back; after a jump past what a frame can move (or back), no stamps from
  // before it
  advance(time: number) {
    // (a frame's lists are the quality's of that frame: gone as the simulation moves on to the next)
    this.listed = false;
    const step = this.clock.stepAt(time);
    if (step - this.lastStep > this.clock.most || step < this.lastStep) {
      this.lastStep = step;
      this.from = step;
    }
    this.lastStep = Math.max(this.lastStep, step);
    this.fall(time);
  }

  // the ring's slots from..to (not wrapping) sent, by whole rows
  sendSlots(from: number, to: number) {
    const gl = this.gl;
    const first = Math.floor(from / PER_ROW);
    const rows = Math.floor((to - 1) / PER_ROW) - first + 1;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, first, ACROSS, rows, gl.RGBA_INTEGER, gl.UNSIGNED_INT, this.ring, first * ACROSS * 4);
  }

  // the splashes thrown up since the last time sent to the ring (each once), and the span drawn
  update() {
    const gl = this.gl;
    const newest = this.nextSerial;
    const from = Math.max(this.sent, newest - RING);
    if (newest > from) {
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      const a = from % RING;
      const b = a + (newest - from);
      if (b <= RING) {
        this.sendSlots(a, b);
      } else {
        this.sendSlots(a, RING);
        this.sendSlots(0, b - RING);
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.sent = newest;
    }
    const oldest = this.count > 0 ? this.serial[0] : newest;
    this.span = newest - oldest;
    this.firstSlot = oldest % RING;
    this.liveCount = this.span * this.trail;
  }

  // the frame's quality: the splashes with a level over 0 in each view become that view's list of ring slots, in their order (levels
  // for another number of splashes than there are, or a camera changed since the job: no list)
  setQuality(q: EffectQuality) {
    super.setQuality(q);
    this.listed = false;
    const levels = q.levels;
    const n = this.count;
    if (!levels || levels.length !== 2 * n) {
      return;
    }
    const list = this.slotList;
    let direct = 0;
    let mirrored = 0;
    for (let i = 0; i < n; i++) {
      const slot = this.serial[i] % RING;
      if (levels[i] > 0) {
        list[direct++] = slot;
      }
      if (levels[n + i] > 0) {
        list[MOST + mirrored++] = slot;
      }
    }
    this.listCount[0] = direct;
    this.listCount[1] = mirrored;
    this.listAges[0] = this.directAges(levels, n, direct);
    this.listAges[1] = this.trail;
    // (the levels were worked out for the camera as it was when the job was made: a camera changed since is another view)
    this.listVersion = this.camera.dirty ? -1 : this.camera.version;
    this.listed = !this.camera.dirty;
  }

  // the ages the direct draw instances for each listed splash (the most any needs): a stamp is lit at most fade x peak x the fog
  // transmittance to the sphere's nearest point (the job's own bound, never under the real fog); ages whose bound is under the
  // floor are the stamps the shader drops. The trail whole when LOD is off or without the frame's parameters.
  directAges(levels: Uint8Array, n: number, listed: number): number {
    const p = this.qualityParamValues;
    const floor = QualitySplashes.lodFloor(this.lod, false, M.TEST ? this.viewScale : 1);
    if (!p || floor === 0 || p.count !== n) {
      return this.trail;
    }
    const f = p.inputs;
    const cuts = this.ageCuts;
    const s = this.sphere;
    const gain = 1 + HEAD_GAIN * this.head;
    const foggy = f.sigma > 0 || f.air > 0;
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (levels[i] === 0) {
        continue;
      }
      let cut = this.trail;
      if (QualitySplashes.sphereOf(p, i, s)) {
        const o = (this.serial[i] % RING) * SPLASH_TEXELS * 4;
        const c = this.ringFloats;
        const maxColor = Math.max(c[o + 8], c[o + 9], c[o + 10]);
        let T = 1;
        if (foggy) {
          const dx = s.cx - f.eyeX, dy = s.cy - f.eyeY, dz = s.cz - f.eyeZ;
          const nearest = Math.sqrt(dx * dx + dy * dy + dz * dz) - s.r;
          const top = s.cy + s.r;
          T = QualityUnit.transmittance(nearest > 0 ? nearest : 0, f.sigma, f.air, top > f.eyeY ? top : f.eyeY);
        }
        cut = QualitySplashes.ageCut(maxColor, gain, T, floor, this.trail);
      }
      cuts[k++] = cut;
    }
    return k === listed ? QualitySplashes.listedAges(cuts, k) : this.trail;
  }

  qualityKind(): string {
    return "splashes";
  }

  // the job's statics: nothing it reads (the records come in the params), given once so that the pool knows the kind
  qualityStatics(): QualityStatics | null {
    if (this.qualitySent) {
      return null;
    }
    this.qualitySent = true;
    return { unused: new Float32Array(1) };
  }

  // the frame's parameters: the steps the shader tests the stamps by, and each live splash's record as the ring holds it
  qualityParams(shared: QualityShared): QualityParams {
    const n = this.count;
    const stride = QualitySplashes.STRIDE;
    let data = this.qualityData;
    if (!data || data.length < n * stride) {
      data = this.qualityData = new Float64Array(Math.ceil(Math.max(n, 1) / BLOCK) * BLOCK * stride);
    }
    const F = QualitySplashes.FIELD;
    const ring = this.ring;
    const f = this.ringFloats;
    for (let i = 0; i < n; i++) {
      const o = (this.serial[i] % RING) * SPLASH_TEXELS * 4;
      const b = i * stride;
      data[b + F.x0] = f[o];
      data[b + F.z0] = f[o + 1];
      data[b + F.size] = f[o + 2];
      data[b + F.offset] = f[o + 3];
      data[b + F.vx] = f[o + 4];
      data[b + F.vy] = f[o + 5];
      data[b + F.vz] = f[o + 6];
      data[b + F.rate] = f[o + 7];
      data[b + F.first] = ring[o + 12];
      data[b + F.count] = ring[o + 13];
    }
    let p = this.qualityParamValues;
    if (!p) {
      p = this.qualityParamValues = { step: 0, from: 0, to: 0, trail: 1, count: 0, data, inputs: shared.inputs };
    }
    p.step = shared.step;
    p.from = this.from;
    p.to = this.lastStep;
    p.trail = this.trail;
    p.count = n;
    p.data = data;
    p.inputs = shared.inputs;
    return p as unknown as QualityParams;
  }

  // the quality pool's job: two units a splash (none without splashes)
  qualityJobs(): QualityJob[] {
    return this.count > 0 && this.qualityIndex >= 0 ? [{ effect: this.qualityIndex, units: 2 * this.count, minChunk: QualitySplashes.CHUNK }] : [];
  }

  draw(step: number, mirror: boolean) {
    const gl = this.gl;
    const pass = mirror ? 1 : 0;
    // (the lists: this view's slots of the splashes seen, for the camera the levels were made for; none then: the whole span)
    const listed = this.listed && this.camera.version === this.listVersion;
    const listCount = listed ? this.listCount[pass] : 0;
    const ages = listed ? this.listAges[pass] : this.trail;
    const useList = listCount > 0;
    if (useList && ages === 0 && this.warmed[pass]) {
      return;
    }
    if (!useList && this.warmed[pass] && (listed || this.liveCount === 0)) {
      return;
    }
    this.warmed[pass] = true;
    const u = this.program.use();
    gl.uniform1ui(u.uStep, step >>> 0);
    gl.uniform1ui(u.uFrom, this.from >>> 0);
    gl.uniform1ui(u.uTo, this.lastStep >>> 0);
    gl.uniform1i(u.uFirstSlot, this.firstSlot);
    gl.uniform1i(u.uGlyphs, this.atlas.count);
    gl.uniform1i(u.uTrail, this.trail);
    gl.uniform1i(u.uAges, useList ? ages : this.trail);
    gl.uniform1f(u.uPointPx, QualitySplashes.pointPx(this.lod, mirror));
    gl.uniform1f(u.uHead, this.head);
    gl.uniform1f(u.uHeadPeak, 1 + HEAD_GAIN * this.head);
    gl.uniform1f(u.uLodFloor, QualitySplashes.lodFloor(this.lod, mirror, M.TEST ? this.viewScale : 1));
    if (M.TEST) {
      gl.uniform1f(u.uViewScale, this.viewScale);
    }
    gl.uniform1f(u.uMirror, mirror ? -1 : 1);
    gl.uniform1i(u.uCovered, this.covered ? 1 : 0);
    M.GlyphAtlas.setNearness(gl, u, mirror ? null : this.nearness);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(u.uListed, useList ? 1 : 0);
    if (useList) {
      gl.bindVertexArray(this.listArray);
      gl.vertexAttribDivisor(M.ATTRIBUTES.aDrop, ages > 0 ? ages : 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.listBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, pass * MOST * 4, this.slotList, pass * MOST, listCount);
      gl.vertexAttribIPointer(M.ATTRIBUTES.aDrop, 1, gl.UNSIGNED_INT, 0, pass * MOST * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    } else {
      gl.bindVertexArray(this.quad.plain);
    }
    this.guard.begin(mirror ? "splashes mirrored" : "splashes", "stamps");
    // (none live, or none listed, the first time: one instance of a slot with no stamps, so nothing is drawn and
    // the program is warmed)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, useList ? listCount * ages : listed ? 1 : Math.max(1, this.liveCount));
    this.guard.piece();
    this.guard.end();
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}

// a splash's stamps, from its start t0 to its fall back at land, by a step clock's steps: [the
// first step whose time is at its start or after, as an unsigned integer; the steps stamped from
// it (those before its fall back); the first step's time after its start] (into `out`)
Splashes.stampsOf = (clock, t0, land, out = new Float64Array(3)) => {
  let first = Math.ceil(clock.at(t0));
  while (clock.timeOf(first - 1) >= t0) {
    first--;
  }
  while (clock.timeOf(first) < t0) {
    first++;
  }
  let end = Math.max(first, Math.ceil(clock.at(land)));
  while (end > first && clock.timeOf(end - 1) >= land) {
    end--;
  }
  while (clock.timeOf(end) < land) {
    end++;
  }
  out[0] = first >>> 0;
  out[1] = end - first;
  out[2] = clock.timeOf(first) - t0;
  return out;
};

if (M.TEST) {
  // the splashes with where they are at a time (for the tests)
  Splashes.prototype.describe = function (this: Splashes, time: number) {
    const out: SplashState[] = [];
    for (let i = 0; i < this.count; i++) {
      const t = Math.min(time, this.land[i]) - this.t0[i];
      out.push({
        x0: this.x0[i], z0: this.z0[i], vx: this.vx[i], vy: this.vy[i], vz: this.vz[i], size: this.size[i], landed: !!this.landed[i],
        x: this.x0[i] + this.vx[i] * t, y: Math.max(0, this.vy[i] * t - (GRAVITY * t * t) / 2), z: this.z0[i] + this.vz[i] * t,
      });
    }
    return out;
  };

  // the vertex shader's rule for a stamp, in the script (float32 as the GPU): a splash's record
  // ({ x0, z0, vx, vy, vz, size, seed, first, count, offset, rate }) at an unsigned step, after
  // the last jump `from`, by the last step moved on to `to`: whether it is drawn, its place, size
  // and glyph seed
  Splashes.placeAt = (rec, step, from, to) => {
    const f = Math.fround;
    const k = (step - rec.first) | 0;
    const shown = k >= 0 && k < rec.count && ((step - from) | 0) > 0 && ((to - step) | 0) >= 0;
    const t = f(f(k / f(rec.rate)) + f(rec.offset));
    const g = f(GRAVITY);
    return {
      shown,
      x: f(f(rec.x0) + f(f(rec.vx) * t)),
      y: Math.max(0, f(f(f(rec.vy) * t) - f(f(f(g * t) * t) / 2))),
      z: f(f(rec.z0) + f(f(rec.vz) * t)),
      size: f(rec.size),
      glyph: (rec.seed + Math.imul(step, 977)) >>> 0,
    };
  };
}

Splashes.GRAVITY = GRAVITY;
Splashes.RING = RING;

Splashes.vertex = (glsl) => fill(VERTEX_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "glsl.fog": glsl.fog, "M.GlyphAtlas.VERTEX_GLSL": M.GlyphAtlas.VERTEX_GLSL, "M.HASH_GLSL": M.HASH_GLSL, "GRAVITY.toFixed(2)": GRAVITY.toFixed(2), "RING": RING, "PER_ROW": PER_ROW, "SPLASH_TEXELS": SPLASH_TEXELS });

M.Splashes = Splashes;
