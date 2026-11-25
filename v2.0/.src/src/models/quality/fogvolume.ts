// The fog volume's CPU twin (Feature U2, story V5; units.ui.fogvolumetwin.ts): the front cloud's volume gather as a pure model, the formulas of shaders/fog/gather.glsl and fogaccum_volume.glsl (gatherAt, densityFar),
// medium.glsl (density's profile and window, albedoAt), shade.glsl (skyShade, fogLight) and the phase function. Pure, no GL, no page, importable in any thread (the workers will make a reduced set of the volume's
// columns with it: story V6). Covers: the front cloud's density (the two-scale profile x the window of the three drifting noise octaves, the expiry, the tail flat, the far octaves), the clouds' albedo, the in-scatter
// (the sky's ambient x the shade towards the sky, the Orb's x the shade towards it x the phase, and the multiple-scattering term), the air's extinction, and the sums along the chain of slices for the direct ray
// and, for a column that goes down, the mirrored ray from the water. Leaves out: the strikes' light (their own stacks), the base mist (its own volume: M.BaseMist.gatherRay), the marched shade, the column cull
// (directHeld: a cost rule) and the temporal accumulation (the fresh slice is the sample at t of the slice). The noise and the shade grid are INPUTS (samplers): the twin needs no texture.
// - sliceAt(u), lodOf(m), sliceLod(a, b, columnWidth, focal), columnRay(view, fx, fy): the slice law, the noise's level for a length, the slice's footprint and the ray through a column
// - shadeCoord(p), sample3(data, w, h, d, u), skyShade(p, front, base): the shade grid's mapping, its trilinear read (texel middles, clamped) and the shader's skyShade with marched false
// - albedoAt(read, p, lod, main, second), phaseHG(c), density(params, p, lod), fogLight(params, p, view, lod, sigma), gather(params, acc, d, a, b, mirrored, lod, t), column(params, d, k)
// The shader's printed literals are copied (SLICE_LOG and SHADE_LOG to six decimals, FOUR_PI to eight, AIR_EXTINCTION the full double): the twin equals the shader, not the exact constants.
//
// Changelog:
// 2026-11-23: new (Feature U2, story V5).
import { M } from "../../engine/core";
import { AIR_EXTINCTION, MULTIPLE, PHASE_FORWARD_G, PHASE_BACKWARD_G, PHASE_FORWARD_W, COLOUR_LO, COLOUR_HI } from "../../materials/fog";
import { QualityFog } from "./fog";
import { QualityFogShade } from "./fogshade";
import { StaticMist } from "../staticmist";

const SLICES = QualityFog.SLICES;
const NEAR = QualityFog.SLICE_NEAR;
// the shader's printed constants (Fog.GLSL: `SLICE_LOG = ${...toFixed(6)}`), six decimals: the slice boundaries differ from the exact law by at most (FOG_FAR + NEAR) x 5e-7 = 1.5e-4 m
const LOG = Number(Math.log(1 + QualityFog.FOG_FAR / NEAR).toFixed(6));
const NOISE = 128;
// the shader's literal (shaders/fog/fog.glsl: FOUR_PI)
const FOUR_PI = 12.5663706;
const TOP_MIP = QualityFog.TOP_MIP;
// the shade grid: 128 x 64 x 96 cells for each of the front's and the base mist's layers in one texture of 192; the front's z is 0 to FRONT, the base's BASE to 1
const SHADE = { TOP: QualityFogShade.TOP, NEAR: QualityFogShade.NEAR, FAR: QualityFogShade.FAR, CELLS: [QualityFogShade.ACROSS, QualityFogShade.UP, QualityFogShade.DEEP], LAYERS: 2 * QualityFogShade.DEEP, SPAN: QualityFogShade.SPAN, FRONT: 0.5, BASE: 0.5 };
const SHADE_LOG = Number(Math.log(SHADE.FAR / SHADE.NEAR).toFixed(6));
// the shader's two-decimal literals of the Orb's direction and irradiance
const MOON_DIR = [0.24, 0.91, -0.34];
const MOON_BASE = [0.3, 0.32, 0.36];

type Sampler = (u: number[]) => number[];
interface Params {
  sigma: number;
  time: number;
  tail: number;
  tailScale: number;
  flat: number;
  far: boolean;
  drop: number;
  main: number[];
  second: number[];
  sky: number[];
  moon: number[];
  moonDir?: number[];
  front: Sampler;
  base: Sampler | null;
  read: (q: number[], level: number) => number;
  eye: number[];
  columnWidth: number;
  focal: number;
}
interface RayView {
  width: number;
  height: number;
  focal: number;
  lensX: number;
  lensY: number;
  forward: number[];
  right: number[];
  up: number[];
  across: number;
  down: number;
  margin: number;
}

const clamp = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);
const smooth = (lo: number, hi: number, x: number): number => {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};

const sliceAt = (u: number): number => NEAR * (Math.exp(u * LOG) - 1);
const lodOf = (m: number): number => Math.log2(Math.max(m * NOISE, 1e-6));
const sliceLod = (a: number, b: number, columnWidth: number, focal: number): number => lodOf(Math.max((0.5 * (a + b) * columnWidth) / focal, b - a));

// the ray through the middle of a column of the volume (fx, fy: the column + 0.5): the shader's columnRay and rayOf
function columnRay(view: RayView, fx: number, fy: number): number[] {
  const x = ((fx / view.across) * (1 + 2 * view.margin) - view.margin) * view.width;
  const y = ((fy / view.down) * (1 + 2 * view.margin) - view.margin) * view.height;
  const u = (x - view.width * 0.5 - view.lensX) / view.focal, v = (y - view.height * 0.5 - view.lensY) / view.focal;
  const d = [0, 1, 2].map((k) => view.forward[k]! + u * view.right[k]! + v * view.up[k]!);
  const n = Math.hypot(d[0]!, d[1]!, d[2]!);
  return [d[0]! / n, d[1]! / n, d[2]! / n];
}

// columnRay without allocations: the ray through the column's middle written to out[at .. at + 2] (the same arithmetic)
function columnRayInto(view: RayView, fx: number, fy: number, out: Float64Array, at: number): void {
  const x = ((fx / view.across) * (1 + 2 * view.margin) - view.margin) * view.width;
  const y = ((fy / view.down) * (1 + 2 * view.margin) - view.margin) * view.height;
  const u = (x - view.width * 0.5 - view.lensX) / view.focal, v = (y - view.height * 0.5 - view.lensY) / view.focal;
  const d0 = view.forward[0]! + u * view.right[0]! + v * view.up[0]!, d1 = view.forward[1]! + u * view.right[1]! + v * view.up[1]!, d2 = view.forward[2]! + u * view.right[2]! + v * view.up[2]!;
  const n = Math.hypot(d0, d1, d2);
  out[at] = d0 / n;
  out[at + 1] = d1 / n;
  out[at + 2] = d2 / n;
}

// the shade grid's coordinates of a place (the shader's shadeCoord): x across the world's width at the depth, the height's square root, the depth's logarithm, the texels' middles
function shadeCoord(p: number[]): number[] {
  const z = Math.max(-p[2]!, SHADE.NEAR);
  const g = [clamp(((p[0]! / z / SHADE.SPAN + 1) * 0.5), 0, 1), clamp(Math.sqrt(Math.max(p[1]!, 0) / SHADE.TOP), 0, 1), clamp(Math.log(z / SHADE.NEAR) / SHADE_LOG, 0, 1)];
  return g.map((v, k) => (v * (SHADE.CELLS[k]! - 1) + 0.5) / SHADE.CELLS[k]!);
}

// the trilinear read of a two-channel grid (w x h x d texels, index ((z h + y) w + x) 2 + c) at texture coordinates u (0 to 1 each way): the texels' middles at (i + 0.5) / n, clamped at the edges
function sample3(data: Float32Array, w: number, h: number, d: number, u: number[]): number[] {
  const dims = [w, h, d], i0: number[] = [], i1: number[] = [], f: number[] = [];
  for (let k = 0; k < 3; k++) {
    const x = u[k]! * dims[k]! - 0.5, lo = Math.floor(x);
    f.push(x - lo);
    i0.push(clamp(lo, 0, dims[k]! - 1));
    i1.push(clamp(lo + 1, 0, dims[k]! - 1));
  }
  const out = [0, 0];
  for (let corner = 0; corner < 8; corner++) {
    const dx = corner & 1, dy = (corner >> 1) & 1, dz = corner >> 2;
    const weight = (dx ? f[0]! : 1 - f[0]!) * (dy ? f[1]! : 1 - f[1]!) * (dz ? f[2]! : 1 - f[2]!);
    const o = ((((dz ? i1[2]! : i0[2]!) * h + (dy ? i1[1]! : i0[1]!)) * w) + (dx ? i1[0]! : i0[0]!)) * 2;
    out[0] = out[0]! + weight * data[o]!;
    out[1] = out[1]! + weight * data[o + 1]!;
  }
  return out;
}

// what gets to p from the sky (x) and the Orb (y): the front grid's read (the air's alone from the grid's top up) times the base mist's grid's where it is there
function skyShade(p: number[], front: Sampler, base: Sampler | null): number[] {
  const c = shadeCoord(p);
  let shade = front([c[0]!, c[1]!, c[2]! * SHADE.FRONT]);
  if (p[1]! >= SHADE.TOP) {
    const air = Math.exp(-AIR_EXTINCTION * 8);
    shade = [air, air];
  }
  if (base) {
    const b = base([c[0]!, c[1]!, SHADE.BASE + c[2]! * SHADE.FRONT]);
    shade = [shade[0]! * b[0]!, shade[1]! * b[1]!];
  }
  return shade;
}

// the clouds' albedo at p: the two fog colours mixed by the 40 m noise at its fixed offset
function albedoAt(read: (q: number[], level: number) => number, p: number[], lod: number, main: number[], second: number[]): number[] {
  const w = smooth(COLOUR_LO, COLOUR_HI, read([p[0]! / 40 + 0.37, p[1]! / 40 + 0.11, p[2]! / 40 + 0.53], Math.max(0, lod - Math.log2(40))));
  return [0, 1, 2].map((k) => main[k]! + (second[k]! - main[k]!) * w);
}

// the phase function as the shader's phaseHG writes it: the two lobes' text with the literal FOUR_PI (12.5663706: 3.2e-9 relative from 4 pi), the weights and g of M.FogPhase
const phaseHG = (c: number): number => {
  const lobe = (g: number): number => (1 - g * g) / Math.pow(1 + g * g - 2 * g * c, 1.5) / FOUR_PI;
  return PHASE_FORWARD_W * lobe(PHASE_FORWARD_G) + (1 - PHASE_FORWARD_W) * lobe(PHASE_BACKWARD_G);
};

// the front's density at p (the shader's densityFar): the profile's scale cut under 1e-5, the mean window under the tail flat, else the window of the three drifting octaves, the far ones flat (0.5)
function density(params: Params, p: number[], lod: number): number {
  const scale = params.sigma * StaticMist.frontProfile(p[1]!, params.tailScale, params.tail);
  if (scale < StaticMist.EXPIRY) return 0;
  if (scale < params.flat) return scale * StaticMist.FLAT_WINDOW;
  const t = params.time;
  const octave = (size: number, off: number[], rank: number): number => {
    const level = lod - Math.log2(size);
    return params.far && (rank < params.drop || level >= TOP_MIP - 1e-3) ? 0.5 : params.read([p[0]! / size + off[0]!, p[1]! / size + off[1]!, p[2]! / size + off[2]!], Math.max(0, level));
  };
  const n = 0.55 * octave(24, [t * 0.004, 0, t * 0.0016], 2) + 0.3 * octave(10, [-t * 0.0052, t * 0.0012, 0.31], 1) + 0.15 * octave(4, [0.17, -t * 0.0024, t * 0.008], 0);
  return scale * (0.8 * smooth(0.4, 0.6, n));
}

// the light the medium scatters towards the eye at p (seen along view): sigma x albedo x (single + MULTIPLE (sky + Orb / 4 pi))
function fogLight(params: Params, p: number[], view: number[], lod: number, sigma: number): number[] {
  const albedo = albedoAt(params.read, p, lod, params.main, params.second);
  const dir = params.moonDir || MOON_DIR, n = Math.hypot(dir[0]!, dir[1]!, dir[2]!);
  const cosine = (dir[0]! * view[0]! + dir[1]! * view[1]! + dir[2]! * view[2]!) / n;
  const shade = skyShade(p, params.front, params.base), ph = phaseHG(cosine);
  return [0, 1, 2].map((k) => sigma * albedo[k]! * (params.sky[k]! * shade[0]! + params.moon[k]! * shade[1]! * ph + MULTIPLE * (params.sky[k]! + params.moon[k]! / FOUR_PI)));
}

// the shader's gatherAt: the medium taken at t of the slice a..b along the ray d from the eye (mirrored: the place and the view flipped in y); acc = [r, g, b, optical depth so far]
function gather(params: Params, acc: number[], d: number[], a: number, b: number, mirrored: boolean, lod: number, t = 0.5): number[] {
  const dt = b - a, at = a + t * dt;
  const p = [params.eye[0]! + at * d[0]!, params.eye[1]! + at * d[1]!, params.eye[2]! + at * d[2]!];
  if (mirrored) p[1] = -p[1]!;
  const view = mirrored ? [d[0]!, -d[1]!, d[2]!] : d;
  const sigma = density(params, p, lod), extinction = sigma + AIR_EXTINCTION;
  const source = sigma > 1e-6 ? fogLight(params, p, view, lod, sigma) : [0, 0, 0];
  const pass = Math.exp(-extinction * dt), lit = (Math.exp(-acc[3]!) * (1 - pass)) / extinction;
  return [acc[0]! + lit * source[0]!, acc[1]! + lit * source[1]!, acc[2]! + lit * source[2]!, acc[3]! + extinction * dt];
}

// the sums after the slices 0 .. k (the volume's layer k): the direct ray through every slice, the mirrored ray (a ray that goes down only) from where it meets the water
function column(params: Params, d: number[], k: number): { direct: number[]; mirror: number[] } {
  let direct = [0, 0, 0, 0], mirror = [0, 0, 0, 0];
  for (let j = 0; j <= k; j++) {
    const a = sliceAt(j / SLICES), b = sliceAt((j + 1) / SLICES), lod = sliceLod(a, b, params.columnWidth, params.focal);
    direct = gather(params, direct, d, a, b, false, lod);
    if (d[1]! < 0) {
      const from = Math.max(a, params.eye[1]! / -d[1]!);
      if (b > from) mirror = gather(params, mirror, d, from, b, true, lod);
    }
  }
  return { direct, mirror };
}

export const QualityFogVolume = { SLICES, NEAR, LOG, NOISE, MULTIPLE, FOUR_PI, AIR_EXTINCTION, TOP_MIP, SHADE, MOON_DIR, MOON_BASE, sliceAt, lodOf, sliceLod, columnRay, columnRayInto, shadeCoord, sample3, skyShade, albedoAt, phaseHG, density, fogLight, gather, column };

M.QualityFogVolume = QualityFogVolume;
