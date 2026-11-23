// The base mist's volume (Feature U3, story M2; units.ui.basemist.ts, the scene tests basemist*). The base mist is the fog's static layer: a noise-modulated exponential height layer (models/staticmist.ts) whose
// density never drifts, held in its own camera-fixed froxel volume that reaches BASE_FAR = 5 km along each column's ray (log slices, the front volume's law and columns) and replaces both the analytic mist
// inside 300 m and the closed form beyond it. fogAt (shaders/fog/fog.glsl) reads it with the front volume and combines them: front.rgb + front.a x base.rgb, a = the product of the transmittances.
//
// Pure parts (M.BaseMist; no GL, importable anywhere):
// - FAR, NEAR, SHARE (the base's share of the extinction, 0.5), HB (the height scale, M.FogMist.HEIGHT: 130 m), SLICES (144: the least that keeps the slice's thickness at the 300 m seam no more than the front
//   volume's, (FOG_FAR + NEAR) ln(1 + FOG_FAR / NEAR) / 96 = 17.89 m), LAYERS (the stacked texture's depth: the front's SLICES, then the base's)
// - layerOf(k): the layer of the shared textures that holds base slice k (FRONT_SLICES + k)
// - sliceStart(k), thickness(k), sliceOf(t): the slice law, NEAR (e^(k / SLICES ln(1 + FAR / NEAR)) - 1)
// - Schedule: the state machine of the builds: an exact build owed at the start, on 'settings' and 'size'; an accumulation from frame 0 on 'view' (restarting on a further 'view'), until M.StaticMist.converged; idle
//   (no draw) once converged; no other event (the time, the strikes) owes anything
// - combine(front, base), colourWeight(p, read, lod), albedo(w, main, second), gatherRay(...): the combination of the two volumes' reads and the CPU twin of the volume's texel
//
// The GL half (BaseMistVolume, owned by Fog like FogAccumulation): the base volume lives in the layers SLICES .. SLICES + BASE SLICES - 1 of the front volume's pair of textures (direct, mirror: every unit of the context
// is taken, so it has no unit of its own; Froxels gives the stack its layers and framebuffers). A frame's build is the slices 0 .. SLICES - 1 in order, each as THREE separate steps:
//   fresh(k)   produces the fresh slice k, at the reduced columns and jittered (the exact build: at the full columns, no jitter), and returns the pair of pictures holding it. This is the one function that
//              produces a frame's fresh slices; it is called for k = 0, 1, ... in order once a frame and the rest of the frame does not care how the slice was made (a later worker-computed slice would be
//              uploaded into the pair it returns); today it draws shaders/fog/basemist_volume.glsl from the pair of slice k - 1
//   blend      moves the held volume's layer towards the fresh slice by alpha (the shared fogAccum blend program), into a full-size picture
//   store      writes it into the volume's layer (the shared fogAccum store program); the exact build stores the fresh slice itself
// The exact build (start, settings, size) never accumulates; a view change accumulates (alpha M.StaticMist.viewAlpha(frame)) until converged and then draws nothing, a still view never draws; nothing here has a
// time input.
//
// Changelog:
// 2026-11-22: Feature U3, story M5: the build's plan (M.BaseLod: the slices each column needs, the flat slices), the slice draws past the largest count skipped, scissor rectangles in the exact build, audit, slicesNeeded, cullView, VOLUME_GLSL.
// 2026-11-22: new (Feature U3, story M2).
import { M } from "./core";
import { fill } from "./glsl";
import type { ProgramSources, ShaderProgram } from "./gl";
import type { Fog } from "../effects/fog";
import { QualityFog } from "../models/quality/fog";
import type { FogQualityView } from "../models/quality/fog";
import { BaseLod } from "../models/baselod";
import { StaticMist } from "../models/staticmist";
import { FogAccum } from "../models/fogaccum";
import { MIST_HEIGHT, AIR_EXTINCTION, COLOUR_LO, COLOUR_HI } from "../materials/fog";
import VOLUME_SOURCE from "../shaders/fog/basemist_volume.glsl";

const FAR = 5000;
const NEAR = QualityFog.SLICE_NEAR;
const SHARE = 0.5;
const HB = MIST_HEIGHT;
const SLICES = 144;
const FRONT_SLICES = QualityFog.SLICES;
const LAYERS = FRONT_SLICES + SLICES;
// the shared textures hold one more layer after the base's: each column's CUT (the number of base slices built there, >= 1), in the red channel
const TOTAL_LAYERS = LAYERS + 1;
const CUT_LAYER = LAYERS;
const LOG = Math.log(1 + FAR / NEAR);
const ALBEDO = { size: 40, offset: [0.37, 0.11, 0.53] };
// the columns of the volume that a column of the fresh picture covers, each way, in an accumulation frame
const REDUCE = 2;

const sliceStart = (k: number): number => NEAR * (Math.exp((k / SLICES) * LOG) - 1);
const thickness = (k: number): number => sliceStart(k + 1) - sliceStart(k);
const sliceOf = (t: number): number => (Math.log(1 + t / NEAR) / LOG) * SLICES;
// the layer of the shared textures that holds the base mist's slice k: the front's slices come first
const layerOf = (k: number): number => FRONT_SLICES + k;
// a read's base slice coordinate, clamped to the column's cut: the cells past the cut are never built
const clampSlice = (f: number, cut: number): number => Math.min(f, cut);
// the sums a read returns from a column's layers (layer(i) = the stored value of base slice i), by the fog read's convention: layer zi = max(f', 1) - 1 limited to 0..slices - 1, linear between layers, f' clamped to the cut
const readSums = (layer: (k: number) => number[], f: number, cut: number, slices = SLICES): number[] => {
  const zi = Math.min(Math.max(Math.max(clampSlice(f, cut), 1) - 1, 0), slices - 1);
  const z0 = Math.floor(zi), fz = zi - z0;
  const a = layer(z0), b = layer(Math.min(z0 + 1, slices - 1));
  return a.map((v, c) => v * (1 - fz) + b[c]! * fz);
};
// the cut layer's content: across * down texels of 4 floats, red = the column's slice count (row * across + column)
const cutLayer = (slices: ArrayLike<number>, across: number, down: number): Float32Array => {
  const out = new Float32Array(across * down * 4);
  for (let i = 0; i < across * down; i++) {
    out[i * 4] = Math.max(1, slices[i] ?? 1);
  }
  return out;
};

interface Decision {
  draw: boolean;
  exact: boolean;
  alpha: number;
}

// the builds' state machine
class Schedule {
  mode: string;
  frames: number;
  draws: number;

  constructor() {
    this.mode = "exact";
    this.frames = 0;
    this.draws = 0;
  }

  event(kind: string): void {
    if (kind === "settings" || kind === "size") {
      this.mode = "exact";
      this.frames = 0;
    } else if (kind === "view" && this.mode !== "exact") {
      this.mode = "accumulating";
      this.frames = 0;
    }
  }

  next(): Decision {
    if (this.mode === "exact") {
      this.mode = "idle";
      this.frames = 0;
      this.draws++;
      return { draw: true, exact: true, alpha: 1 };
    }
    if (this.mode === "accumulating") {
      const alpha = StaticMist.viewAlpha(this.frames);
      this.frames++;
      this.draws++;
      if (StaticMist.converged(this.frames)) {
        this.mode = "idle";
      }
      return { draw: true, exact: false, alpha };
    }
    return { draw: false, exact: false, alpha: 0 };
  }
}

// the two volumes' reads (rgb the light, a the transmittance) combined in the order of the ray, the front first
function combine(front: number[], base: number[]): number[] {
  const a = front[3]!;
  return [front[0]! + a * base[0]!, front[1]! + a * base[1]!, front[2]! + a * base[2]!, a * base[3]!];
}

const smooth = (lo: number, hi: number, x: number): number => {
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
};

// the colour patches' weight at p: the fog's albedoAt noise (size 40 m, its fixed offset) read at the lod shift
function colourWeight(p: number[], read: (q: number[], lod: number) => number, lod = 0): number {
  const o = ALBEDO.offset, s = ALBEDO.size;
  return smooth(COLOUR_LO, COLOUR_HI, read([p[0]! / s + o[0]!, p[1]! / s + o[1]!, p[2]! / s + o[2]!], Math.max(0, lod - Math.log2(s))));
}

function albedo(w: number, main: number[], second: number[]): number[] {
  return [0, 1, 2].map((c) => main[c]! * (1 - w) + second[c]! * w);
}

interface GatherParams {
  eyeY: number;
  hb: number;
  base: number;
  focal: number;
  main: number[];
  second: number[];
  light: number;
}

// the CPU twin of the volume's value at slice k: the light and the optical depth through the slices 0 .. k - 1 along the ray (az, slope) from the eye at height eyeY
function gatherRay(params: GatherParams, az: number, slope: number, k: number, read: (q: number[], lod: number) => number): { rgb: number[]; depth: number; a: number } {
  const ch = Math.sqrt(1 - slope * slope), cx = Math.cos(az) * ch, cz = Math.sin(az) * ch;
  let depth = 0;
  const rgb = [0, 0, 0];
  for (let j = 0; j < k; j++) {
    const t0 = sliceStart(j), t1 = sliceStart(j + 1), tm = 0.5 * (t0 + t1), dt = t1 - t0;
    const p = [tm * cx, params.eyeY + slope * tm, tm * cz];
    const c = StaticMist.coarsen(tm, params.focal);
    const n = StaticMist.baseNoise(p, read, c.lodShift);
    const density = StaticMist.baseDensity(p[1]!, params.hb, params.base, StaticMist.modulation(n, c.lodShift, c));
    const al = albedo(colourWeight(p, read, c.lodShift), params.main, params.second);
    const pass = Math.exp(-density * dt);
    for (let q = 0; q < 3; q++) {
      rgb[q]! += Math.exp(-depth) * (1 - pass) * al[q]! * params.light;
    }
    depth += density * dt;
  }
  return { rgb, depth, a: Math.exp(-depth) };
}

// the program: the fresh slice's shader with the text it includes
export function baseMistPrograms(): ProgramSources {
  const text = fill(VOLUME_SOURCE, {
    "M.Camera.GLSL": M.Camera.GLSL,
    "Fog.GLSL": M.Fog.GLSL,
    "Fog.MEDIUM_GLSL": M.Fog.MEDIUM_GLSL,
    "Fog.SHADE_GLSL": M.Fog.SHADE_GLSL,
    BASE_HB: HB.toFixed(1),
  });
  return { baseMistVolume: [M.FULL_VERTEX, text] };
}

// a pair of pictures (direct, mirror) at one size and their framebuffer
interface Pair {
  textures: WebGLTexture[];
  framebuffer: WebGLFramebuffer;
}

// the pictures of one reduction: the chain's two pairs (slice k in pair k & 1) at the reduced size
interface Chain {
  factor: number;
  across: number;
  down: number;
  pairs: Pair[];
}

interface Stack {
  across: number;
  down: number;
  slices: WebGLFramebuffer[];
  volumes: WebGLTexture[];
  sums: WebGLTexture[];
}

export class BaseMistVolume {
  effect: Fog;
  gl: WebGL2RenderingContext;
  schedule: Schedule;
  volume: ShaderProgram;
  blend: ShaderProgram;
  store: ShaderProgram;
  // the draws made (frames in which the volume was drawn) and the exact builds made, since the start
  drawFrames: number;
  exactBuilds: number;
  // the last build's culling counts (Feature U3, story M5): the builds made, the slice draws issued (the largest column count), the cells the plan needs (the sum of the columns' slice counts), the uncut cells,
  // the columns with fewer than SLICES slices, the slices drawn flat; slicesNeeded: the columns' slice counts (index row x across + column), SLICES everywhere with the level of detail off
  audit: { builds: number; slices: number; cells: number; full: number; culledColumns: number; flatSlices: number };
  slicesNeeded: Uint16Array;
  private lastBase: number;
  // the plan made for a view (the key: the view's values), kept while they are the same: the accumulation's frames plan the same view
  private planKey: string;
  private planned: { slices: Uint16Array; levels: Uint8Array } | null;
  private chains: Chain[];
  private blended: Pair | null;
  private size: string;

  constructor(effect: Fog, programs: Record<string, ShaderProgram>, blend: ShaderProgram, store: ShaderProgram) {
    this.effect = effect;
    this.gl = effect.gl;
    this.schedule = new Schedule();
    this.volume = effect.ownPrograms(programs, ["baseMistVolume"])[0]!;
    this.volume.samplers({ uNoise: M.UNITS.noise, uShade: M.UNITS.shade, uSumDirect: M.UNITS.fogSum, uSumMirror: M.UNITS.fogSumMirror });
    this.blend = blend;
    this.store = store;
    this.drawFrames = 0;
    this.exactBuilds = 0;
    this.audit = { builds: 0, slices: 0, cells: 0, full: 0, culledColumns: 0, flatSlices: 0 };
    this.slicesNeeded = new Uint16Array(0);
    this.lastBase = 0;
    this.planKey = "";
    this.planned = null;
    this.chains = [];
    this.blended = null;
    this.size = "";
  }

  get converged(): boolean {
    return this.schedule.mode === "idle";
  }

  get mode(): string {
    return this.schedule.mode;
  }

  get frames(): number {
    return this.schedule.frames;
  }

  // the volume's footprint in cells (M.StaticMist.coarsen's focal): the camera's focal length in the volume's columns' widths
  get focal(): number {
    const tile = this.effect.columns[2] || 1;
    return this.effect.camera.focal() / tile;
  }

  // an exact build owed (a settings or size change, the tests' rebuildExact)
  rebuildExact(): void {
    this.schedule.event("settings");
  }

  private stack(): Stack {
    return this.effect.light as unknown as Stack;
  }

  private pair(width: number, height: number, filter: GLenum): Pair {
    const gl = this.gl;
    const textures = [0, 1].map(() => this.effect.own(M.RenderTarget.storage(gl, gl.RGBA16F, width, height, filter), (t: WebGLTexture) => gl.deleteTexture(t)));
    const framebuffer = this.effect.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[0]!, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, textures[1]!, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    return { textures, framebuffer };
  }

  // the pictures of a reduction of the volume's columns (made again when the columns changed)
  private chain(factor: number): Chain {
    const s = this.stack();
    const key = `${s.across}x${s.down}`;
    if (key !== this.size) {
      this.release();
      this.size = key;
    }
    let chain = this.chains.find((c) => c.factor === factor);
    if (!chain) {
      const across = FogAccum.reduced(s.across, factor), down = FogAccum.reduced(s.down, factor);
      chain = { factor, across, down, pairs: [this.pair(across, down, this.gl.LINEAR), this.pair(across, down, this.gl.LINEAR)] };
      this.chains.push(chain);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
    if (!this.blended) {
      this.blended = this.pair(s.across, s.down, this.gl.NEAREST);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
    return chain;
  }

  // the pictures let go (the columns changed, or the effect is destroyed)
  release(): void {
    const gl = this.gl;
    for (const p of this.chains.flatMap((c) => c.pairs).concat(this.blended ? [this.blended] : [])) {
      p.textures.forEach((t) => gl.deleteTexture(t));
      gl.deleteFramebuffer(p.framebuffer);
    }
    this.chains = [];
    this.blended = null;
    this.size = "";
  }

  private bindSums(pair: WebGLTexture[]): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    gl.bindTexture(gl.TEXTURE_2D, pair[0]!);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSumMirror);
    gl.bindTexture(gl.TEXTURE_2D, pair[1]!);
  }

  // the view and focal the build's plan is made from (M.BaseLod): the camera, the water, the volume's columns, the base's strength in inputs.mist
  cullView(base: number = this.lastBase): { view: FogQualityView; focal: number } {
    const e = this.effect, c = e.camera, s = this.stack();
    const view: FogQualityView = {
      inputs: { eyeY: c.eyeY(), focal: c.focal(), width: c.width, height: c.height, lensX: c.lens.x, lensY: c.lens.y, waterDrawn: e.waterDrawn, sigma: 0, air: AIR_EXTINCTION, mist: base },
      pitch: c.tilt(),
      margin: e.ubo.data[15]!,
      across: s.across,
      down: s.down,
    };
    return { view, focal: this.focal };
  }

  // this slice's coarsening constants (M.StaticMist.coarsen at the slice's middle, the window's mean at that lod and narrowing); a flat slice (M.BaseLod.level 0) has the amplitude 0: the shader skips the noise
  private coarse(k: number, focal: number, flat = false): number[] {
    const tm = 0.5 * (sliceStart(k) + sliceStart(k + 1));
    const c = StaticMist.coarsen(tm, focal);
    return [c.lodShift, flat ? 0 : c.amplitude, c.cutoffNarrow, 1 / StaticMist.windowMean(c.lodShift, c.cutoffNarrow)];
  }

  // THE SEAM: the fresh slice k of this frame, at the chain's reduction and jittered; returns the pair of pictures that holds it (slice k of the chain is in pair k & 1, read from pair (k + 1) & 1). Called for
  // k = 0 .. SLICES - 1 in order, once a frame, with the frame's `begin` made; a slice produced elsewhere would be uploaded into the pair returned here and nothing else of the frame changes
  fresh(chain: Chain, k: number, jitter: number[], base: number, focal: number, flat = false): WebGLTexture[] {
    const gl = this.gl;
    const s = this.stack();
    const sx = s.across / chain.across, sy = s.down / chain.down;
    gl.viewport(0, 0, chain.across, chain.down);
    if (k > 0) {
      this.bindSums(chain.pairs[(k + 1) & 1]!.textures);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, chain.pairs[k & 1]!.framebuffer);
    const u = this.volume.use();
    gl.uniform1i(u.uSlice, k);
    gl.uniform4f(u.uAccum, sx - 1, sy - 1, jitter[0]! - 0.5, jitter[1]! - 0.5);
    gl.uniform1f(u.uAccumZ, jitter[2]!);
    const c = this.coarse(k, focal, flat);
    gl.uniform4f(u.uCoarse, c[0]!, c[1]!, c[2]!, c[3]!);
    gl.uniform1f(u.uBase, base);
    this.effect.quad.drawFull();
    return chain.pairs[k & 1]!.textures;
  }

  // one frame's build as the schedule decided it: every slice produced, blended (an accumulation) or not (the exact build), and stored into the volume's layers
  frame(decision: Decision, frameIndex: number, base: number): void {
    const gl = this.gl;
    const s = this.stack();
    const exact = decision.exact;
    const chain = this.chain(exact ? 1 : REDUCE);
    const jitter = exact ? [0.5, 0.5, 0.5] : FogAccum.jitter(frameIndex);
    const focal = this.focal;
    const guard = this.effect.guard;
    const each = guard.size("base mist", "slice");
    const sx = s.across / chain.across, sy = s.down / chain.down;
    // the plan (M.BaseLod): the slices each column needs, and the flat levels; the level of detail off is the whole build. The slices past the largest count are not drawn; the exact build also keeps each slice's
    // draws to the rectangle of the columns that need it (the accumulation's reduced pictures are read between columns, so it draws whole slices)
    const active = this.effect.baseLodActive();
    const cv = this.cullView(base);
    this.lastBase = base;
    const i = cv.view.inputs, key = [active, i.eyeY, i.focal, i.width, i.height, i.lensX, i.lensY, i.waterDrawn, i.mist, cv.view.pitch, cv.view.margin, cv.view.across, cv.view.down, cv.focal].join(",");
    if (key !== this.planKey || !this.planned) {
      this.planned = BaseLod.plan(active, cv.view, cv.focal);
      this.planKey = key;
    }
    const plan = this.planned;
    this.slicesNeeded = plan.slices;
    let most = 0, cells = 0, culled = 0, flat = 0;
    for (let c = 0; c < plan.slices.length; c++) {
      const n = plan.slices[c]!;
      cells += n;
      if (n > most) most = n;
      if (n < SLICES) culled++;
    }
    for (let k = 0; k < SLICES; k++) if (active && plan.levels[k] === 0) flat++;
    // (the tests' split timing: the draws of every `split`-th slice timed one by one, named by kind and slice, and no pass of the whole build)
    const split = M.TEST ? this.effect.timeSplit : 0;
    const time = (kind: string, k: number): boolean => {
      if (split > 0 && k % split === 0) {
        guard.begin("base mist " + kind + " " + k, "slice");
        return true;
      }
      return false;
    };
    if (split === 0) {
      guard.begin("base mist", "slice");
    }
    // the exact build draws each slice only over the columns that need it (the scissor); every build draws the prefix of the largest count and writes the cut layer: a read clamps to the column's cut
    const boxes = exact && active ? this.boxes(plan.slices, s.across, s.down) : null;
    if (boxes) {
      gl.enable(gl.SCISSOR_TEST);
    }
    for (let k = 0; k < most; k++) {
      if (boxes) {
        gl.scissor(boxes[k * 4]!, boxes[k * 4 + 1]!, boxes[k * 4 + 2]! - boxes[k * 4]!, boxes[k * 4 + 3]! - boxes[k * 4 + 1]!);
      }
      const timedFresh = time("fresh", k);
      const fresh = this.fresh(chain, k, jitter, base, focal, active && plan.levels[k] === 0);
      if (timedFresh) {
        guard.end();
      }
      gl.viewport(0, 0, s.across, s.down);
      if (exact) {
        this.bindSums(fresh);
      } else {
        this.bindSums(fresh);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blended!.framebuffer);
        const timedBlend = time("blend", k);
        const b = this.blend.use();
        gl.uniform1i(b.uSlice, layerOf(k));
        gl.uniform1f(b.uAlpha, decision.alpha);
        gl.uniform4f(b.uMap, 1 / sx, 1 / sy, jitter[0]! - 0.5, jitter[1]! - 0.5);
        gl.uniform4f(b.uSize, chain.across, chain.down, chain.across, chain.down);
        this.effect.quad.drawFull();
        if (timedBlend) {
          guard.end();
        }
        this.bindSums(this.blended!.textures);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, s.slices[layerOf(k)]!);
      const timedStore = time("store", k);
      this.store.use();
      this.effect.quad.drawFull();
      if (timedStore) {
        guard.end();
      }
      if (k % each === each - 1 || k === most - 1) {
        guard.piece();
      }
    }
    if (boxes) {
      gl.disable(gl.SCISSOR_TEST);
    }
    guard.end();
    this.writeCut(plan.slices, s);
    this.drawFrames++;
    if (exact) {
      this.exactBuilds++;
    }
    this.audit = { builds: this.exactBuilds, slices: most, cells, full: plan.slices.length * SLICES, culledColumns: culled, flatSlices: flat };
    this.bindSums(s.sums);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // the rectangles (x0, y0, x1, y1 per slice, columns, scissor padded by one) of the columns that need slice k: the bounding box of the columns whose count is above k
  private boxes(counts: Uint16Array, across: number, down: number): Int32Array {
    const out = new Int32Array(SLICES * 4);
    const x0 = new Int32Array(SLICES).fill(across), y0 = new Int32Array(SLICES).fill(down), x1 = new Int32Array(SLICES), y1 = new Int32Array(SLICES);
    for (let r = 0; r < down; r++) {
      for (let c = 0; c < across; c++) {
        const n = Math.min(SLICES, counts[r * across + c]!);
        if (n < 1) continue;
        const k = n - 1;
        if (c < x0[k]!) x0[k] = c;
        if (c + 1 > x1[k]!) x1[k] = c + 1;
        if (r < y0[k]!) y0[k] = r;
        if (r + 1 > y1[k]!) y1[k] = r + 1;
      }
    }
    for (let k = SLICES - 2; k >= 0; k--) {
      if (x0[k + 1]! < x0[k]!) x0[k] = x0[k + 1]!;
      if (y0[k + 1]! < y0[k]!) y0[k] = y0[k + 1]!;
      if (x1[k + 1]! > x1[k]!) x1[k] = x1[k + 1]!;
      if (y1[k + 1]! > y1[k]!) y1[k] = y1[k + 1]!;
    }
    for (let k = 0; k < SLICES; k++) {
      out[k * 4] = Math.max(0, x0[k]! - 1);
      out[k * 4 + 1] = Math.max(0, y0[k]! - 1);
      out[k * 4 + 2] = Math.min(across, x1[k]! + 1);
      out[k * 4 + 3] = Math.min(down, y1[k]! + 1);
    }
    return out;
  }

  // the cut layer of the shared textures (both attachments' textures): each column's built slice count in red, written on every build
  private writeCut(counts: Uint16Array, s: Stack): void {
    const gl = this.gl;
    const data = cutLayer(counts, s.across, s.down);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.fogSum);
    for (const volume of s.volumes) {
      gl.bindTexture(gl.TEXTURE_3D, volume);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, CUT_LAYER, s.across, s.down, 1, gl.RGBA, gl.FLOAT, data);
    }
    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  // the program drawn once over one pixel (the driver finishes a program at its first draw), into the chain's picture: the volume is as it was
  warm(): void {
    const gl = this.gl;
    const chain = this.chain(REDUCE);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    this.fresh(chain, 1, [0.5, 0.5, 0.5], 0, this.focal);
    gl.disable(gl.SCISSOR_TEST);
    this.bindSums(this.stack().sums);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

export const BaseMist = { FAR, NEAR, SHARE, HB, SLICES, LAYERS, TOTAL_LAYERS, CUT_LAYER, clampSlice, readSums, cutLayer, FRONT_SLICES, LOG, ALBEDO, sliceStart, thickness, sliceOf, layerOf, Schedule, combine, colourWeight, albedo, gatherRay, VOLUME_GLSL: VOLUME_SOURCE };

M.BaseMist = BaseMist;
