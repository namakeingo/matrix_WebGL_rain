// The atmosphere (M.Atmosphere), pure: ONE light (the Orb) and an Earth-like atmosphere turn the Orb's light into (1) the SEEN sky, a radiance per view direction
// (a table of EL x AZ directions), and (2) the sky's LIGHT on surfaces (nine spherical-harmonic coefficients, and the mean radiance of the upper hemisphere for the
// fog's isotropic term). No GL, no page, no random number: the same input gives the same tables.
//
// Physics (SI metres, linear RGB at the wavelengths 680, 550 and 440 nm): the planet's radius 6,360,000 m, the air's top at 6,460,000 m, the observer
// `observerHeight` (default 2 m) above the surface (the water) with no ground albedo (the ground below sends back no light).
//  - Rayleigh: scattering beta_R = (5.802e-6, 13.558e-6, 33.1e-6) /m at sea level, density exp(-h / 8000), phase 3 / (16 pi) (1 + c^2)
//  - Mie: scattering 3.996e-6, absorption 4.44e-6 (extinction 8.436e-6), density exp(-h / 1200), Cornette-Shanks phase, g = 0.8
//  - ozone: absorption (0.650e-6, 1.881e-6, 0.085e-6), density a tent: 0 at 10 km, 1 at 25 km, 0 at 40 km
//
// The algorithm of `build` (the sample counts are the constants below):
//  1. The Orb's direction is normalised and put in the plane z = 0 (its horizontal part along +x): only its elevation matters, the table is symmetric about the
//     Orb's vertical plane (azimuth from the Orb's side, 0, to the far side, pi). The irradiance given is the one AT THE GROUND (what the scene uses); the
//     transmittance from the observer towards the Orb (TG_STEPS steps) divides it to give the irradiance at the top of the air, E_top (the Orb below the horizon
//     gives 0: no light). The tables are computed for a unit E_top and multiplied by E_top per channel at the end: linear in the irradiance, exactly.
//  2. Multiple scattering (Hillaire 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique"): at MS_ALTITUDES altitudes from the observer's
//     up to the top (spaced as a square), MS_DIRECTIONS directions of a Fibonacci sphere, each ray MS_STEPS steps long (spaced as a square, to the top of the air or
//     to the ground), give per channel f_ms = the mean over the directions of the integral of T sigma_s ds (the share of a unit isotropic radiance that scatters
//     again) and L_2 = the mean over the directions of the integral of T sigma_s (1 / 4 pi) T_orb ds (the radiance the first-order scattering brings to the point
//     under an isotropic phase). The multiple-scattering radiance a point sends is Psi = L_2 / (1 - f_ms) (the geometric series of orders), the source
//     sigma_s(h) Psi(h). The table is over altitude only, for the local Orb direction of the observer (the Orb's elevation as seen from the observer): the Orb's
//     angle at the point changes slowly along a view ray and is not followed (a deviation from Hillaire's altitude x Orb-angle table).
//  3. The seen sky at each node (a direction at elevation elevationAt(i), azimuth azimuthAt(j)): the single-scattering integral along the view ray, SKY_STEPS
//     steps spaced as a square (finer near the observer where the air is dense), the Orb's transmittance from every sample by an inner integral of ORB_STEPS steps
//     (0 where the Orb's ray meets the planet), the phases above, plus the multiple-scattering source Psi at the sample's altitude. The zenith's row is one
//     direction: computed once.
//  4. The sky's light: the upper hemisphere's radiance (the sky below the horizon is 0) is projected on the real spherical harmonics of order 2 on a grid of
//     PROJ_AZ x PROJ_EL midpoints (azimuth round the full circle, elevation in equal angles, weighted by the solid angle, the radiance read by skyAt as the shaders
//     do), and each band is multiplied by the cosine kernel's A_l / pi (1, 2 / 3, 1 / 4): the coefficients give the irradiance over pi (the light of a unit-albedo
//     surface) at a normal n as sum c_lm Y_lm(n). The ambient is the mean of the same grid's radiance (by solid angle).
// A flat sky (uniformSky) is given its coefficients in closed form: c_00 = L 0.282095 2 pi, c_1,-1 (the y term) = 2 / 3 L 0.488603 pi, the rest 0.
//
// - Atmosphere.EL, Atmosphere.AZ: the table's size (16 x 12)
// - Atmosphere.elevationAt(i), azimuthAt(j): the directions of the nodes
// - Atmosphere.build({ orbDir, orbIrradiance, observerHeight?, tone? }): { sky, sh, ambient }; tone (linear rgb, default [1, 1, 1], the Air tone) multiplies the Rayleigh and Mie
//   scattering coefficients per channel (the absorption is unchanged): white is Earth's air and gives the tables of no tone bit for bit, a channel's tables depend on its own tone only,
//   a tone of 0 gives no scattering: the tables are exactly 0
// - Atmosphere.multipleShare(p, dir): per channel (radiance - single-scattering radiance) / single-scattering radiance in the direction dir, 0 without light
// - Atmosphere.skyAt(t, dir, orbDir): the CPU twin of the table's lookup (the picture is made from it) (bilinear in sqrt(el / (pi / 2)) (EL - 1) and az / pi (AZ - 1); below the horizon, the horizon row)
// - Atmosphere.SKY_W, SKY_H, skyUv(dir, orbDir), skyTexture(t, orbDir), skyRead(texture, uv): the table resampled as the picture the shader reads (below), and the CPU model of its filtered read
// - Atmosphere.diffuseAt(t, n), shBasis(n), uniformSky(L)
// - Atmosphere.airGround(tone?, height = 2): { scatter, extinction } per channel per metre at the observer's height (the tone as build applies it; a black tone: scatter 0, the Mie absorption's extinction)
// - Atmosphere.aerial(orbDir, orbIrradiance, tone, dir, t) and aerialFor(p, steps?): the exact transmittance and in-scatter of the air over the first t metres along dir (dir.y clamped to 0), the march of `build`
// - Atmosphere.aerialSource(p), aerialAnalytic(tone, source, sky, dir, t), airColumn(tone, mu): the closed form and its inputs (bounds in units.ui.aerial.ts and main_03)
// - Atmosphere.picture(p, tables), aerialRead(picture, cosAz, t), AERIAL_W, AERIAL_H, AERIAL_FROM, AERIAL_TO, PICTURE_H: the water programs' picture (the seen sky, then the aerial span's table, tabulated
//   from the form for the rays at the horizon) and the CPU model of the shader's read of it (see below)
//
// Changelog:
// 2026-11-19: new (prototype P0 of the atmosphere).
// 2026-11-20: multipleShare (the multiple scattering's share of the sky, for the model's validation against a reference).
// 2026-11-20: SKY_W, SKY_H, skyUv, skyTexture, skyRead: the seen sky as a 256 x 128 octahedral picture (Feature S1, story A3: the water's compile time).
// 2026-11-20: AtmosphereInput.tone, the Air tone (Feature S1, story A5): per-channel scale of the scattering coefficients.
// 2026-11-20: picture and aerialRead: the aerial span's table under the seen sky's rows, and its CPU read (Feature U1, story U3).
// 2026-11-20: airState and march shared by build and the aerial functions (build's tables unchanged bit for bit); airGround, aerial, aerialFor, aerialSource, aerialAnalytic, airColumn (Feature U1, story U1).
import { M } from "../engine/core";

export interface AtmosphereInput {
  orbDir: ArrayLike<number>;
  orbIrradiance: ArrayLike<number>;
  observerHeight?: number;
  // the Air tone (linear rgb, default [1, 1, 1]): the per-channel multiplier of the Rayleigh and Mie scattering coefficients (the absorption is unchanged); white is Earth's air
  tone?: ArrayLike<number>;
}
export interface AtmosphereTables {
  sky: Float32Array;
  sh: Float32Array;
  ambient: Float32Array;
}

const EL = 16;
const AZ = 12;
const HALF_PI = Math.PI / 2;

const OBSERVER_HEIGHT = 2;
const PLANET = 6360000;
const TOP = 6460000;
const TOP_HEIGHT = TOP - PLANET;
const BR0 = 5.802e-6, BR1 = 13.558e-6, BR2 = 33.1e-6;
const BMS = 3.996e-6;
const BME = 8.436e-6;
const BO0 = 0.650e-6, BO1 = 1.881e-6, BO2 = 0.085e-6;
const BMA = 4.44e-6;
const HR = 8000;
const HM = 1200;
const MIE_G = 0.8;
const MIE_K = (3 / (8 * Math.PI)) * ((1 - MIE_G * MIE_G) / (2 + MIE_G * MIE_G));
const RAY_K = 3 / (16 * Math.PI);
const INV_4PI = 1 / (4 * Math.PI);

const SKY_STEPS = 40;
const ORB_STEPS = 32;
const TG_STEPS = 64;
const MS_ALTITUDES = 12;
const MS_DIRECTIONS = 32;
const MS_STEPS = 12;
const MS_ORB_STEPS = 12;
const PROJ_AZ = 48;
const PROJ_EL = 24;

function ozone(h: number): number {
  return h <= 10000 || h >= 40000 ? 0 : h < 25000 ? (h - 10000) / 15000 : (40000 - h) / 15000;
}

// the air's coefficients per channel for an Air tone: the Rayleigh scattering, the Mie scattering, the Mie extinction (its scattering and its absorption) and the ozone's absorption.
// A tone of 1 keeps the literal coefficients, so white gives the tables of no tone bit for bit; a negative or missing tone channel is 0 or 1 (missing: 1)
interface Coefficients { br: number[]; bms: number[]; bme: number[]; bo: number[] }
function coefficients(tone: ArrayLike<number> | undefined): Coefficients {
  const t = [0, 1, 2].map((c) => (tone && typeof tone[c] == "number" && isFinite(tone[c]!) ? Math.max(tone[c]!, 0) : 1));
  return {
    br: [BR0 * t[0]!, BR1 * t[1]!, BR2 * t[2]!],
    bms: [BMS * t[0]!, BMS * t[1]!, BMS * t[2]!],
    bme: t.map((x) => (x === 1 ? BME : BMS * x + BMA)),
    bo: [BO0, BO1, BO2],
  };
}

// the transmittance (rgb) from p along the unit o to the top of the air, `n` steps spaced as a square; 0 where the ray meets the planet. Written into `out`.
function towardsOrb(px: number, py: number, pz: number, ox: number, oy: number, oz: number, n: number, out: Float64Array, air: Coefficients): void {
  const b = px * ox + py * oy + pz * oz;
  const r2 = px * px + py * py + pz * pz;
  const disc = b * b - (r2 - PLANET * PLANET);
  if (disc >= 0 && -b - Math.sqrt(disc) > 0) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    return;
  }
  const len = -b + Math.sqrt(b * b - (r2 - TOP * TOP));
  let sr = 0, sm = 0, so = 0;
  const n2 = n * n;
  for (let k = 0; k < n; k++) {
    const um = (k + 0.5) / n;
    const s = len * um * um;
    const ds = (len * (2 * k + 1)) / n2;
    const qx = px + ox * s, qy = py + oy * s, qz = pz + oz * s;
    const h = Math.sqrt(qx * qx + qy * qy + qz * qz) - PLANET;
    sr += Math.exp(-h / HR) * ds;
    sm += Math.exp(-h / HM) * ds;
    so += ozone(h) * ds;
  }
  out[0] = Math.exp(-(air.br[0]! * sr + air.bme[0]! * sm + air.bo[0]! * so));
  out[1] = Math.exp(-(air.br[1]! * sr + air.bme[1]! * sm + air.bo[1]! * so));
  out[2] = Math.exp(-(air.br[2]! * sr + air.bme[2]! * sm + air.bo[2]! * so));
}

const TSUN = new Float64Array(3);

// the multiple-scattering radiance Psi (rgb, per unit irradiance at the top of the air) at the altitudes of the table: [altitude][channel]
function multipleScattering(h0: number, ox: number, oy: number, air: Coefficients): Float64Array {
  const out = new Float64Array(MS_ALTITUDES * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let a = 0; a < MS_ALTITUDES; a++) {
    const u = a / (MS_ALTITUDES - 1);
    const h = h0 + (TOP_HEIGHT - h0) * u * u;
    const px = 0, py = PLANET + h, pz = 0;
    const f = [0, 0, 0], l2 = [0, 0, 0];
    for (let d = 0; d < MS_DIRECTIONS; d++) {
      const vy = 1 - (2 * (d + 0.5)) / MS_DIRECTIONS;
      const rr = Math.sqrt(1 - vy * vy);
      const phi = d * golden;
      const vx = rr * Math.cos(phi), vz = rr * Math.sin(phi);
      const b = py * vy;
      const r2 = py * py;
      const disc = b * b - (r2 - PLANET * PLANET);
      let len: number;
      if (disc >= 0 && -b - Math.sqrt(disc) > 0) len = -b - Math.sqrt(disc);
      else len = -b + Math.sqrt(b * b - (r2 - TOP * TOP));
      let sr = 0, sm = 0, so = 0;
      const n2 = MS_STEPS * MS_STEPS;
      for (let k = 0; k < MS_STEPS; k++) {
        const um = (k + 0.5) / MS_STEPS;
        const s = len * um * um;
        const ds = (len * (2 * k + 1)) / n2;
        const qx = px + vx * s, qy = py + vy * s, qz = pz + vz * s;
        const hh = Math.sqrt(qx * qx + qy * qy + qz * qz) - PLANET;
        const dr = Math.exp(-hh / HR), dm = Math.exp(-hh / HM), dz = ozone(hh);
        const hr = dr * ds, hm = dm * ds, hz = dz * ds;
        // the view transmittance to the middle of the step
        const t0 = Math.exp(-(air.br[0]! * (sr + hr / 2) + air.bme[0]! * (sm + hm / 2) + air.bo[0]! * (so + hz / 2)));
        const t1 = Math.exp(-(air.br[1]! * (sr + hr / 2) + air.bme[1]! * (sm + hm / 2) + air.bo[1]! * (so + hz / 2)));
        const t2 = Math.exp(-(air.br[2]! * (sr + hr / 2) + air.bme[2]! * (sm + hm / 2) + air.bo[2]! * (so + hz / 2)));
        towardsOrb(qx, qy, qz, ox, oy, 0, MS_ORB_STEPS, TSUN, air);
        const s0 = air.br[0]! * dr + air.bms[0]! * dm, s1 = air.br[1]! * dr + air.bms[1]! * dm, s2 = air.br[2]! * dr + air.bms[2]! * dm;
        f[0]! += t0 * s0 * ds; f[1]! += t1 * s1 * ds; f[2]! += t2 * s2 * ds;
        l2[0]! += t0 * s0 * TSUN[0]! * INV_4PI * ds;
        l2[1]! += t1 * s1 * TSUN[1]! * INV_4PI * ds;
        l2[2]! += t2 * s2 * TSUN[2]! * INV_4PI * ds;
        sr += hr; sm += hm; so += hz;
      }
    }
    for (let c = 0; c < 3; c++) {
      const fms = Math.min(f[c]! / MS_DIRECTIONS, 0.99);
      out[a * 3 + c] = l2[c]! / MS_DIRECTIONS / (1 - fms);
    }
  }
  return out;
}

function elevationAt(i: number): number {
  const u = i / (EL - 1);
  return u * u * HALF_PI;
}
function azimuthAt(j: number): number {
  return (j / (AZ - 1)) * Math.PI;
}

// the real spherical harmonics of order 2 at the unit n (x, y, z)
function shBasis(n: ArrayLike<number>): number[] {
  const x = n[0]!, y = n[1]!, z = n[2]!;
  return [
    0.282095,
    0.488603 * y,
    0.488603 * z,
    0.488603 * x,
    1.092548 * x * y,
    1.092548 * y * z,
    0.315392 * (3 * z * z - 1),
    1.092548 * x * z,
    0.546274 * (x * x - y * y),
  ];
}

function diffuseAt(t: AtmosphereTables, n: ArrayLike<number>): number[] {
  const y = shBasis(n);
  const out = [0, 0, 0];
  for (let q = 0; q < 9; q++) {
    out[0]! += t.sh[q * 4]! * y[q]!;
    out[1]! += t.sh[q * 4 + 1]! * y[q]!;
    out[2]! += t.sh[q * 4 + 2]! * y[q]!;
  }
  return [Math.max(out[0]!, 0), Math.max(out[1]!, 0), Math.max(out[2]!, 0)];
}

function skyAt(t: AtmosphereTables, dir: ArrayLike<number>, orbDir: ArrayLike<number>): number[] {
  const dx = dir[0]!, dy = dir[1]!, dz = dir[2]!;
  const hd = Math.hypot(dx, dz);
  const el = Math.atan2(Math.max(dy, 0), hd);
  let az = 0;
  const ho = Math.hypot(orbDir[0]!, orbDir[2]!);
  if (hd > 1e-12 && ho > 1e-12) {
    const dot = dx * orbDir[0]! + dz * orbDir[2]!;
    const cross = dx * orbDir[2]! - dz * orbDir[0]!;
    az = Math.atan2(Math.abs(cross), dot);
  }
  const fi = Math.min(Math.sqrt(el / HALF_PI), 1) * (EL - 1);
  const fj = Math.min(az / Math.PI, 1) * (AZ - 1);
  const i0 = Math.min(Math.floor(fi), EL - 2), j0 = Math.min(Math.floor(fj), AZ - 2);
  const ti = fi - i0, tj = fj - j0;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = t.sky[(j0 * EL + i0) * 4 + c]!, b = t.sky[(j0 * EL + i0 + 1) * 4 + c]!;
    const e = t.sky[((j0 + 1) * EL + i0) * 4 + c]!, f = t.sky[((j0 + 1) * EL + i0 + 1) * 4 + c]!;
    out[c] = (a * (1 - ti) + b * ti) * (1 - tj) + (e * (1 - ti) + f * ti) * tj;
  }
  return out;
}

// the sh coefficients and the ambient from the sky's radiance, read by `radiance(dir)` on the projection grid
function project(t: AtmosphereTables, orb: number[]): void {
  const acc = new Float64Array(9 * 3);
  const mean = [0, 0, 0];
  let weight = 0;
  const w = [0, 0, 0];
  for (let a = 0; a < PROJ_AZ; a++) {
    const phi = ((a + 0.5) / PROJ_AZ) * 2 * Math.PI;
    for (let e = 0; e < PROJ_EL; e++) {
      const el = ((e + 0.5) / PROJ_EL) * HALF_PI;
      w[0] = Math.cos(el) * Math.cos(phi); w[1] = Math.sin(el); w[2] = Math.cos(el) * Math.sin(phi);
      const dOmega = Math.cos(el) * (HALF_PI / PROJ_EL) * ((2 * Math.PI) / PROJ_AZ);
      const L = skyAt(t, w, orb);
      const y = shBasis(w);
      for (let q = 0; q < 9; q++) for (let c = 0; c < 3; c++) acc[q * 3 + c]! += L[c]! * y[q]! * dOmega;
      for (let c = 0; c < 3; c++) mean[c]! += L[c]! * dOmega;
      weight += dOmega;
    }
  }
  const kernel = [1, 2 / 3, 2 / 3, 2 / 3, 1 / 4, 1 / 4, 1 / 4, 1 / 4, 1 / 4];
  for (let q = 0; q < 9; q++) for (let c = 0; c < 3; c++) t.sh[q * 4 + c] = acc[q * 3 + c]! * kernel[q]!;
  for (let c = 0; c < 3; c++) t.ambient[c] = mean[c]! / weight;
}

function emptyTables(): AtmosphereTables {
  return { sky: new Float32Array(EL * AZ * 4), sh: new Float32Array(9 * 4), ambient: new Float32Array(3) };
}

// What a view march needs of the Orb and the air: the air's coefficients, the Orb's elevation (as the unit direction (ox, oy, 0) in the plane z = 0), the multiple-scattering source
// Psi at the table's altitudes (zero when it is left out) and the Orb's irradiance at the top of the air per channel. `lit` is false when the Orb gives no light (a direction of length 0,
// no irradiance, below the horizon): the in-scatter is then 0 and the Orb's transmittance is not marched at all.
interface AirState {
  h0: number;
  ox: number;
  oy: number;
  air: Coefficients;
  psi: Float64Array;
  etop: number[];
  lit: boolean;
}

// `withMs` false: the single scattering only (the multiple-scattering source Psi is 0), for multipleShare
function airState(p: AtmosphereInput, withMs: boolean): AirState {
  const h0 = Math.max(p.observerHeight === undefined ? OBSERVER_HEIGHT : p.observerHeight, 0);
  const air = coefficients(p.tone);
  const state: AirState = { h0: h0, ox: 1, oy: 0, air: air, psi: new Float64Array(MS_ALTITUDES * 3), etop: [0, 0, 0], lit: false };
  const l = Math.hypot(p.orbDir[0]!, p.orbDir[1]!, p.orbDir[2]!);
  if (!(l > 0)) return state;
  const oy = Math.min(Math.max(p.orbDir[1]! / l, -1), 1);
  const ox = Math.sqrt(1 - oy * oy);
  towardsOrb(0, PLANET + h0, 0, ox, oy, 0, TG_STEPS, TSUN, air);
  const etop = [0, 0, 0];
  for (let c = 0; c < 3; c++) etop[c] = p.orbIrradiance[c]! / Math.max(TSUN[c]!, 1e-9) * (TSUN[c]! > 0 ? 1 : 0);
  if (!(etop[0]! > 0 || etop[1]! > 0 || etop[2]! > 0)) return state;
  state.ox = ox;
  state.oy = oy;
  state.etop = etop;
  state.lit = true;
  if (withMs) state.psi = multipleScattering(h0, ox, oy, air);
  return state;
}

const MARCH_TMP = new Float64Array(3);

// the distance along the unit direction with vertical component vy from the observer (at radius py) to the top of the air
function airLength(py: number, vy: number): number {
  const b = py * vy;
  return -b + Math.sqrt(b * b - (py * py - TOP * TOP));
}

// The view march along the unit (vx, vy, vz) from the observer over `len` metres (not past the air's top), `steps` steps spaced as a square: L = the in-scatter radiance for a unit irradiance
// at the top of the air (per channel: the single scattering of the Orb with its transmittance from every sample by an inner integral of ORB_STEPS steps, the phases, plus the
// multiple-scattering source Psi at the sample's altitude) and, when `T` is given, the view transmittance over the march. `build` calls it with len = the distance to the top, SKY_STEPS steps.
function march(s: AirState, vx: number, vy: number, vz: number, len: number, steps: number, L: number[], T: number[] | null): void {
  const h0 = s.h0, ox = s.ox, oy = s.oy, air = s.air, psi = s.psi;
  const px = 0, py = PLANET + h0, pz = 0;
  const tmp = MARCH_TMP;
  const cosT = vx * ox + vy * oy;
  const pr = RAY_K * (1 + cosT * cosT);
  const g2 = MIE_G * MIE_G;
  const pm = MIE_K * (1 + cosT * cosT) / Math.pow(1 + g2 - 2 * MIE_G * cosT, 1.5);
  let sr = 0, sm = 0, so = 0;
  L[0] = 0; L[1] = 0; L[2] = 0;
  const n2 = steps * steps;
  for (let k = 0; k < steps; k++) {
    const um = (k + 0.5) / steps;
    const sd = len * um * um;
    const ds = (len * (2 * k + 1)) / n2;
    const qx = px + vx * sd, qy = py + vy * sd, qz = pz + vz * sd;
    const h = Math.sqrt(qx * qx + qy * qy + qz * qz) - PLANET;
    const dr = Math.exp(-h / HR), dm = Math.exp(-h / HM), dz = ozone(h);
    const hr = dr * ds, hm = dm * ds, hz = dz * ds;
    if (s.lit) towardsOrb(qx, qy, qz, ox, oy, 0, ORB_STEPS, tmp, air);
    else { tmp[0] = 0; tmp[1] = 0; tmp[2] = 0; }
    // the multiple-scattering table's altitude index (the altitudes spaced as a square from the observer's)
    const fa = Math.sqrt(Math.max(h - h0, 0) / (TOP_HEIGHT - h0)) * (MS_ALTITUDES - 1);
    const a0 = Math.min(Math.floor(fa), MS_ALTITUDES - 2), ta = Math.min(fa - a0, 1);
    const rayleigh = dr * pr;
    for (let c = 0; c < 3; c++) {
      const br = air.br[c]!, bms = air.bms[c]!;
      const bo = air.bo[c]!;
      const mie = dm * bms * pm;
      const tview = Math.exp(-(br * (sr + hr / 2) + air.bme[c]! * (sm + hm / 2) + bo * (so + hz / 2)));
      const ps = psi[a0 * 3 + c]! * (1 - ta) + psi[(a0 + 1) * 3 + c]! * ta;
      const sigma = br * dr + bms * dm;
      const source = (br * rayleigh + mie) * tmp[c]! + sigma * ps;
      L[c]! += tview * source * ds;
    }
    sr += hr; sm += hm; so += hz;
  }
  if (T) for (let c = 0; c < 3; c++) T[c] = Math.exp(-(air.br[c]! * sr + air.bme[c]! * sm + air.bo[c]! * so));
}

function buildWith(p: AtmosphereInput, withMs: boolean): AtmosphereTables {
  const t = emptyTables();
  const state = airState(p, withMs);
  if (!state.lit) return t;
  const ox = state.ox, oy = state.oy, etop = state.etop;
  const orb = [ox, oy, 0];
  const py = PLANET + state.h0;
  const dv = [0, 0, 0];
  const L = [0, 0, 0];
  for (let j = 0; j < AZ; j++) {
    const az = azimuthAt(j);
    for (let i = 0; i < EL; i++) {
      if (i == EL - 1 && j > 0) {
        for (let c = 0; c < 4; c++) t.sky[(j * EL + i) * 4 + c] = t.sky[i * 4 + c]!;
        continue;
      }
      const el = elevationAt(i);
      dv[0] = Math.cos(el) * Math.cos(az); dv[1] = Math.sin(el); dv[2] = Math.cos(el) * Math.sin(az);
      march(state, dv[0]!, dv[1]!, dv[2]!, airLength(py, dv[1]!), SKY_STEPS, L, null);
      const o = (j * EL + i) * 4;
      t.sky[o] = L[0]! * etop[0]!;
      t.sky[o + 1] = L[1]! * etop[1]!;
      t.sky[o + 2] = L[2]! * etop[2]!;
    }
  }
  project(t, orb);
  return t;
}

function build(p: AtmosphereInput): AtmosphereTables {
  return buildWith(p, true);
}

// the multiple-scattering share per channel in the view direction dir (as skyAt's): (the model's radiance - its single-scattering radiance) / its single-scattering
// radiance; 0 where the single scattering is 0 (an Orb of 0 irradiance or below the horizon)
function multipleShare(p: AtmosphereInput, dir: ArrayLike<number>): number[] {
  const full = skyAt(buildWith(p, true), dir, p.orbDir);
  const single = skyAt(buildWith(p, false), dir, p.orbDir);
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) out[c] = single[c]! > 0 ? (full[c]! - single[c]!) / single[c]! : 0;
  return out;
}

// ---- the air at the ground and the aerial perspective (Feature U1) ----

export interface AirCoefficients {
  scatter: number[];
  extinction: number[];
}
export interface AerialResult {
  transmittance: number[];
  inscatter: number[];
}

// The air's coefficients per metre, per channel, at `height` above the surface (the observer's 2 m by default) with the Air tone applied as `build` applies it (the tone multiplies the Rayleigh
// and the Mie scattering, the Mie absorption and the ozone's are not scaled): scatter = bR exp(-h / HR) + bMs exp(-h / HM); extinction = bR exp(-h / HR) + bMe exp(-h / HM) + bO ozone(h) (0 below
// 10 km). A black tone gives scatter 0 and the Mie absorption's extinction.
function airGround(tone?: ArrayLike<number>, height?: number): AirCoefficients {
  const h = Math.max(height === undefined ? OBSERVER_HEIGHT : height, 0);
  const air = coefficients(tone);
  const dr = Math.exp(-h / HR), dm = Math.exp(-h / HM), dz = ozone(h);
  const scatter = [0, 0, 0], extinction = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    scatter[c] = air.br[c]! * dr + air.bms[c]! * dm;
    extinction[c] = air.br[c]! * dr + air.bme[c]! * dm + air.bo[c]! * dz;
  }
  return { scatter: scatter, extinction: extinction };
}

// The exact aerial perspective: the model's own march (`march`, SKY_STEPS steps unless `steps` says otherwise) truncated at t metres. Returns the function (dir, t) of one prepared Orb (the
// multiple-scattering table and the top-of-air irradiance are the costly part). dir: any length, y up; below the horizon it reads the horizon (the elevation max(dir.y, 0), the horizontal
// part kept; straight down reads the Orb's horizontal direction), the azimuth from the Orb's horizontal part as skyAt's. t <= 0 (or not a number): transmittance 1, in-scatter 0; t past the
// air's top: the march of `build`, so the sky table's node value at a node.
function aerialFor(p: AtmosphereInput, steps?: number): (dir: ArrayLike<number>, t: number) => AerialResult {
  const state = airState(p, true);
  const n = steps === undefined ? SKY_STEPS : Math.max(Math.floor(steps), 1);
  const py = PLANET + state.h0;
  const ho = Math.hypot(p.orbDir[0]!, p.orbDir[2]!);
  const L = [0, 0, 0], T = [0, 0, 0];
  return function (dir: ArrayLike<number>, t: number): AerialResult {
    if (!(t > 0)) return { transmittance: [1, 1, 1], inscatter: [0, 0, 0] };
    const dx = dir[0]!, dy = dir[1]!, dz = dir[2]!;
    const hd = Math.hypot(dx, dz);
    const el = Math.atan2(Math.max(dy, 0), hd);
    let az = 0;
    if (hd > 1e-12 && ho > 1e-12) {
      const dot = dx * p.orbDir[0]! + dz * p.orbDir[2]!;
      const cross = dx * p.orbDir[2]! - dz * p.orbDir[0]!;
      az = Math.atan2(Math.abs(cross), dot);
    }
    const vx = Math.cos(el) * Math.cos(az), vy = Math.sin(el), vz = Math.cos(el) * Math.sin(az);
    const top = airLength(py, vy);
    march(state, vx, vy, vz, t < top ? t : top, n, L, T);
    return {
      transmittance: [T[0]!, T[1]!, T[2]!],
      inscatter: [L[0]! * state.etop[0]!, L[1]! * state.etop[1]!, L[2]! * state.etop[2]!],
    };
  };
}

function aerial(orbDir: ArrayLike<number>, orbIrradiance: ArrayLike<number>, tone: ArrayLike<number> | undefined, dir: ArrayLike<number>, t: number): AerialResult {
  return aerialFor({ orbDir: orbDir, orbIrradiance: orbIrradiance, tone: tone })(dir, t);
}

// ---- the analytic form of the aerial perspective (what the shader evaluates) ----
// A homogeneous layer with the density's fall folded into the optical depth. With mu = max(dir.y, 0) / |dir| and, for each species s (Rayleigh: H = HR, Mie: H = HM) at the observer's
// density rho_s0 = exp(-h0 / H_s), the optical depth over the first t metres is tau_s(t) = tau_s,inf (1 - exp(-t / (m_s H_s))): its slope at t = 0 is the ground's extinction (tau_s,inf / (m_s
// H_s) = beta_s rho_s0) and its value at infinity the whole column tau_s,inf = beta_s rho_s0 H_s m_s, m_s being the species' airmass (Chapman's function of the sine mu for an exponential
// atmosphere on a sphere of radius PLANET + h0: m = 2 / (mu + sqrt(mu^2 + K / X)), X = (PLANET + h0) / H_s, the parabolic ray's closed form, K fitted per species). The ozone's absorption is the
// tent's column O(h) = integral of ozone to h (a piecewise quadratic) at the ray's height h_t = h0 + t mu + t^2 / (2 PLANET) (the ray's rise over the curved surface): tau_O(t) = bO O_TOT m_O O(h_t) / O_TOT
// with the thin-shell airmass m_O of the tent's centre (25 km). The transmittance is T(t) = exp(-sum of the three) and the in-scatter L(t) = sky (1 - T(t)) / (1 - T_inf): the source function
// J = sky / (1 - T_inf) is the sky table's own value towards dir over the whole air's column, so t -> infinity gives the sky exactly and t -> 0 gives 0 exactly.
const OZONE_COLUMN_TOTAL = 15000;
const OZONE_SHELL = 25000;
// the species' airmass fits: m(mu) = 1 / (mu + A (mu + B)^-C), within 0.15% of the exact airmass of a ray through the spherical exponential atmosphere at every elevation from 0 to 90 degrees (fitted to a
// 200,000-step integral of the model's geometry); the saturation shape S(x) = 1 - exp(-x - kappa x^2), x = t / (m H), kappa = KAPPA0 / (1 + 2a + 2a^2) with a = mu sqrt(X / 2) (X = (PLANET + h0) / H): the
// flat atmosphere's exponential (kappa 0, a large) and, at the horizon, the sharper saturation of the curved ray (the error function's, kappa 0.56); within 0.004 of tau_inf of the exact optical depth
const RAYLEIGH_FIT = [0.000744559, 0.138308, 1.83914];
const MIE_FIT = [0.0000665384, 0.0490253, 1.69298];
const KAPPA0 = 0.56;
const X_RAYLEIGH = (PLANET + OBSERVER_HEIGHT) / HR;
const X_MIE = (PLANET + OBSERVER_HEIGHT) / HM;

function airmass(mu: number, fit: number[]): number {
  return 1 / (mu + fit[0]! * Math.pow(mu + fit[1]!, -fit[2]!));
}
// the saturation 1 - exp(-x - kappa x^2) of a species' optical depth at x = t / (m H)
function saturation(x: number, mu: number, X: number): number {
  const a = mu * Math.sqrt(X / 2);
  const kappa = KAPPA0 / (1 + 2 * a + 2 * a * a);
  return 1 - Math.exp(-x - kappa * x * x);
}
// the integral of the ozone's tent from 0 to h, metres of full-density ozone (the tent's area at 40 km: OZONE_COLUMN_TOTAL)
function ozoneColumn(h: number): number {
  const u = Math.min(Math.max((h - 10000) / 15000, 0), 1);
  const v = Math.min(Math.max((h - 25000) / 15000, 0), 1);
  return 7500 * u * u + 7500 * (2 * v - v * v);
}
function sineOf(dir: ArrayLike<number>): number {
  const l = Math.hypot(dir[0]!, dir[1]!, dir[2]!);
  return l > 0 ? Math.min(Math.max(dir[1]! / l, 0), 1) : 0;
}

// tau_inf per channel: the optical depth from the observer to space along a direction of sine mu
function airColumn(tone: ArrayLike<number> | undefined, mu: number): number[] {
  const air = coefficients(tone);
  const m = Math.min(Math.max(mu, 0), 1);
  const rr = PLANET + OBSERVER_HEIGHT;
  const hr = HR * Math.exp(-OBSERVER_HEIGHT / HR) * airmass(m, RAYLEIGH_FIT);
  const hm = HM * Math.exp(-OBSERVER_HEIGHT / HM) * airmass(m, MIE_FIT);
  const k = rr / (rr + OZONE_SHELL);
  const ho = OZONE_COLUMN_TOTAL / Math.sqrt(1 - k * k * (1 - m * m));
  return [0, 1, 2].map((c) => air.br[c]! * hr + air.bme[c]! * hm + air.bo[c]! * ho);
}

// What the analytic form needs of the Orb besides the sky table's value: the Orb's unit direction (world), its irradiance at the ground (the input's) and the multiple-scattering radiance at the
// observer's height for that irradiance (Psi x E_top, per channel: three numbers, from the table `build` marches already). An Orb that gives no light (no irradiance, below the horizon, no
// direction) is all zeros.
export interface AerialSource {
  direction: number[];
  irradiance: number[];
  multiple: number[];
}
function aerialSource(p: AtmosphereInput): AerialSource {
  const state = airState(p, true);
  const l = Math.hypot(p.orbDir[0]!, p.orbDir[1]!, p.orbDir[2]!);
  const direction = l > 0 ? [p.orbDir[0]! / l, p.orbDir[1]! / l, p.orbDir[2]! / l] : [0, 1, 0];
  if (!state.lit) return { direction: direction, irradiance: [0, 0, 0], multiple: [0, 0, 0] };
  return {
    direction: direction,
    irradiance: [p.orbIrradiance[0]!, p.orbIrradiance[1]!, p.orbIrradiance[2]!],
    multiple: [state.psi[0]! * state.etop[0]!, state.psi[1]! * state.etop[1]!, state.psi[2]! * state.etop[2]!],
  };
}

// The analytic aerial perspective towards dir over t metres, given the sky table's value there (sky: rgb) and the Orb's source (aerialSource). The in-scatter is built per species, with the
// densities along the ray the derivatives of the saturation shape (so the Mie's fast thinning with height and the Rayleigh's slow one are both followed) and the Orb's irradiance and the
// multiple-scattering radiance taken at their ground values: L_model(t) = (p_R E + Psi) (1 - exp(-tau_R)) exp(-X tau_other) + (bMs / bMe) (p_M E + Psi) (1 - exp(-tau_M)) exp(-X tau_other), with
// tau_R, tau_M the species' optical depths over the first t metres, tau_other the other species' and the ozone's, X = AERIAL_CROSS (the cross-extinction, taken at a mean of the ray's) and p the phases at the
// angle to the Orb. The ground values are wrong aloft (the Orb's light is stronger above the ozone and the air's albedo rises as the Mie thins, the table's own multiple scattering differs), so
// the sky seen anchors it: L(t) = L_model(t) (1 + (r - 1) w(t)) with r = sky / L_model(infinity) per channel and w(t) = 1 - exp(-h_t / AERIAL_ANCHOR_HEIGHT), h_t = t mu + t^2 / (2 PLANET) the height
// the ray has reached: a ray that stays low (the horizon, the water) keeps the ground's values for as far as it goes, a ray that leaves the dense air is the sky's. t -> 0 gives 0 and t -> infinity the
// sky exactly. The transmittance is T(t) = exp(-tau(t)), tau the sum of the three.
const AERIAL_CROSS = 0.5;
const AERIAL_ANCHOR_HEIGHT = 7000;
function aerialAnalytic(tone: ArrayLike<number> | undefined, source: AerialSource, sky: ArrayLike<number>, dir: ArrayLike<number>, t: number): AerialResult {
  if (!(t > 0)) return { transmittance: [1, 1, 1], inscatter: [0, 0, 0] };
  const air = coefficients(tone);
  const dx = dir[0]!, dy = Math.max(dir[1]!, 0), dz = dir[2]!;
  const len = Math.hypot(dx, dy, dz);
  const mu = len > 0 ? Math.min(dy / len, 1) : 0;
  const rr = PLANET + OBSERVER_HEIGHT;
  const mr = airmass(mu, RAYLEIGH_FIT), mm = airmass(mu, MIE_FIT);
  const dr0 = Math.exp(-OBSERVER_HEIGHT / HR), dm0 = Math.exp(-OBSERVER_HEIGHT / HM);
  const hr = HR * dr0 * mr, hm = HM * dm0 * mm;
  const k = rr / (rr + OZONE_SHELL);
  const ho = OZONE_COLUMN_TOTAL / Math.sqrt(1 - k * k * (1 - mu * mu));
  const rise = t * mu + (t * t) / (2 * PLANET);
  const fr = saturation(t / (mr * HR), mu, X_RAYLEIGH), fm = saturation(t / (mm * HM), mu, X_MIE);
  const fo = ozoneColumn(OBSERVER_HEIGHT + rise) / OZONE_COLUMN_TOTAL;
  const weight = 1 - Math.exp(-rise / AERIAL_ANCHOR_HEIGHT);
  // the angle to the Orb (the direction's elevation clamped at the horizon)
  const o = source.direction;
  const cosT = len > 0 ? (dx * o[0]! + dy * o[1]! + dz * o[2]!) / len : 0;
  const pr = RAY_K * (1 + cosT * cosT);
  const g2 = MIE_G * MIE_G;
  const pm = MIE_K * (1 + cosT * cosT) / Math.pow(1 + g2 - 2 * MIE_G * cosT, 1.5);
  const transmittance = [0, 0, 0], inscatter = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const e = source.irradiance[c]!, psi = source.multiple[c]!;
    const albedo = air.bms[c]! / air.bme[c]!;
    const tr = air.br[c]! * hr * fr, tm = air.bme[c]! * hm * fm, to = air.bo[c]! * ho * fo;
    const fullR = air.br[c]! * hr, fullM = air.bme[c]! * hm, fullO = air.bo[c]! * ho;
    transmittance[c] = Math.exp(-(tr + tm + to));
    const near = (pr * e + psi) * (1 - Math.exp(-tr)) * Math.exp(-AERIAL_CROSS * (tm + to)) + albedo * (pm * e + psi) * (1 - Math.exp(-tm)) * Math.exp(-AERIAL_CROSS * (tr + to));
    const whole = (pr * e + psi) * (1 - Math.exp(-fullR)) * Math.exp(-AERIAL_CROSS * (fullM + fullO)) + albedo * (pm * e + psi) * (1 - Math.exp(-fullM)) * Math.exp(-AERIAL_CROSS * (fullR + fullO));
    const anchor = whole > 0 ? sky[c]! / whole : 1;
    inscatter[c] = near * (1 + (anchor - 1) * weight);
  }
  return { transmittance: transmittance, inscatter: inscatter };
}

function uniformSky(radiance: ArrayLike<number>): AtmosphereTables {
  const t = emptyTables();
  for (let q = 0; q < EL * AZ; q++) for (let c = 0; c < 3; c++) t.sky[q * 4 + c] = radiance[c]!;
  for (let c = 0; c < 3; c++) {
    t.sh[c] = radiance[c]! * 0.282095 * 2 * Math.PI;
    t.sh[4 + c] = radiance[c]! * (2 / 3) * 0.488603 * Math.PI;
    t.ambient[c] = radiance[c]!;
  }
  return t;
}

// The seen sky as a picture (the water programs' lookup: one filtered read, no trigonometry): SKY_W x SKY_H texels over an octahedral map of the direction in the Orb's frame. With e the
// Orb's horizontal unit direction ((1, 0) when it is straight up, as the uniform block's aOrb), q = (c, s, y) = (dir.xz . e, |dir.xz x e|, max(dir.y, 0)) (a direction below the horizon reads
// the horizon's row) and p = (q.x, q.y) / (|q.x| + q.y + q.z): the picture's coordinates are (u, v) = (p.x / 2 + 1 / 2, p.y) in the half octahedron |p.x| + p.y <= 1 (the zenith (1 / 2, 0), the
// horizon on the Orb's side (1, 0), away from it (0, 0), 90 degrees to the side (1 / 2, 1); the bottom edge is the Orb's meridian plane, the sky's two sides of it being one).
const SKY_W = 256;
const SKY_H = 128;

// the Orb's horizontal unit direction (x, z); (1, 0) when it is straight up
function orbFlat(orbDir: ArrayLike<number>): [number, number] {
  const flat = Math.hypot(orbDir[0]!, orbDir[2]!);
  return flat > 1e-6 ? [orbDir[0]! / flat, orbDir[2]! / flat] : [1, 0];
}

// the picture's coordinates of a unit direction (the shader's atmosSeen computes the same)
function skyUv(dir: ArrayLike<number>, orbDir: ArrayLike<number>): number[] {
  const e = orbFlat(orbDir);
  const c = dir[0]! * e[0] + dir[2]! * e[1];
  const s = Math.abs(dir[0]! * e[1] - dir[2]! * e[0]);
  const y = Math.max(dir[1]!, 0);
  const sum = Math.max(Math.abs(c) + s + y, 1e-6);
  return [(c / sum) * 0.5 + 0.5, s / sum];
}

// the picture's RGBA floats (row j from v = 0 up): each texel the table's lookup (skyAt) in the direction its middle's coordinates name; a middle outside the half octahedron holds the horizon
// its p projects to. Nothing in the tables gives zeros, alpha is 1
function skyTexture(t: AtmosphereTables, orbDir: ArrayLike<number>): Float32Array {
  const out = new Float32Array(SKY_W * SKY_H * 4);
  const e = orbFlat(orbDir);
  const dir = [0, 0, 0];
  for (let j = 0; j < SKY_H; j++) {
    const v = (j + 0.5) / SKY_H;
    for (let i = 0; i < SKY_W; i++) {
      let px = ((i + 0.5) / SKY_W) * 2 - 1;
      let py = v;
      const n = Math.abs(px) + py;
      if (n > 1) {
        px /= n;
        py /= n;
      }
      const y = Math.max(1 - Math.abs(px) - py, 0);
      const length = Math.hypot(px, py, y);
      dir[0] = (px * e[0] - py * e[1]) / length;
      dir[1] = y / length;
      dir[2] = (px * e[1] + py * e[0]) / length;
      const radiance = skyAt(t, dir, orbDir);
      const at = (j * SKY_W + i) * 4;
      out[at] = radiance[0]!;
      out[at + 1] = radiance[1]!;
      out[at + 2] = radiance[2]!;
      out[at + 3] = 1;
    }
  }
  return out;
}

// the GPU's read of the picture at (u, v): bilinear between the four texels around, the coordinates clamped to the edge (LINEAR, CLAMP_TO_EDGE)
function skyRead(texture: Float32Array, uv: ArrayLike<number>): number[] {
  const x = uv[0]! * SKY_W - 0.5;
  const y = uv[1]! * SKY_H - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const xa = Math.min(Math.max(x0, 0), SKY_W - 1), xb = Math.min(Math.max(x0 + 1, 0), SKY_W - 1);
  const ya = Math.min(Math.max(y0, 0), SKY_H - 1), yb = Math.min(Math.max(y0 + 1, 0), SKY_H - 1);
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = texture[(ya * SKY_W + xa) * 4 + c]!, b = texture[(ya * SKY_W + xb) * 4 + c]!;
    const d = texture[(yb * SKY_W + xa) * 4 + c]!, f = texture[(yb * SKY_W + xb) * 4 + c]!;
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + f * fx) * fy;
  }
  return out;
}

// ---- the aerial span's table (Feature U1, story U3) ----
// The closed form per pixel cost the water program 238 ms of compile time (the budget is +20), so the span of air beyond the fog volume's far end is tabulated for the rays the water has (the form's elevation
// is 0 below the horizon) and the shader reads it. The water programs' picture (uSkyTable) is SKY_W x PICTURE_H: the seen sky's SKY_H rows, a row that is the last sky row again (the filtered read at the
// sky's top edge must not meet the table), then 2 AERIAL_H rows: the transmittance (rgb) for AERIAL_H distances, then the light (rgb), AERIAL_W columns each (the rest of the row is 0, alpha 1). Column i is the
// azimuth az = 2 asin(i / (AERIAL_W - 1)) from the Orb's horizontal direction (u = sin(az / 2), the shader's sqrt((1 - cos az) / 2): the finest steps towards the Orb, where the Mie lobe is), row j the
// distance t = AERIAL_FROM exp(j / (AERIAL_H - 1) ln(AERIAL_TO / AERIAL_FROM)); a node is at its texel's centre, so the filtered read is exact there. A node holds the span from AERIAL_FROM to t of the form at
// that azimuth (the sky seen there anchoring it): T = T(t) / T(AERIAL_FROM) and L = L(t) - T L(AERIAL_FROM); row 0 is the span of nothing, T 1 and L 0 exactly.
const AERIAL_W = 48;
const AERIAL_H = 64;
const AERIAL_FROM = 300;
const AERIAL_TO = 1e6;
const PICTURE_H = SKY_H + 1 + 2 * AERIAL_H;

function picture(p: AtmosphereInput, tables: AtmosphereTables): Float32Array {
  const out = new Float32Array(SKY_W * PICTURE_H * 4);
  for (let q = 0; q < SKY_W * PICTURE_H; q++) out[q * 4 + 3] = 1;
  const sky = skyTexture(tables, p.orbDir);
  out.set(sky, 0);
  out.set(sky.subarray((SKY_H - 1) * SKY_W * 4, SKY_H * SKY_W * 4), SKY_H * SKY_W * 4);
  const source = aerialSource(p);
  const e = orbFlat(p.orbDir);
  const rowT = SKY_H + 1, rowL = rowT + AERIAL_H;
  const range = Math.log(AERIAL_TO / AERIAL_FROM);
  const dir = [0, 0, 0];
  for (let i = 0; i < AERIAL_W; i++) {
    const u = i / (AERIAL_W - 1);
    const c = 1 - 2 * u * u, s = 2 * u * Math.sqrt(Math.max(1 - u * u, 0));
    dir[0] = c * e[0] - s * e[1];
    dir[1] = 0;
    dir[2] = c * e[1] + s * e[0];
    const sky0 = skyAt(tables, dir, p.orbDir);
    const base = aerialAnalytic(p.tone, source, sky0, dir, AERIAL_FROM);
    for (let j = 0; j < AERIAL_H; j++) {
      const at = j === 0 ? base : aerialAnalytic(p.tone, source, sky0, dir, AERIAL_FROM * Math.exp((j / (AERIAL_H - 1)) * range));
      for (let k = 0; k < 3; k++) {
        const t = at.transmittance[k]! / base.transmittance[k]!;
        out[((rowT + j) * SKY_W + i) * 4 + k] = t;
        out[((rowL + j) * SKY_W + i) * 4 + k] = at.inscatter[k]! - t * base.inscatter[k]!;
      }
    }
  }
  return out;
}

// the shader's read of the table, as the GPU does it: the span from AERIAL_FROM to t (t clamped to AERIAL_FROM .. AERIAL_TO) at the azimuth whose cosine from the Orb's horizontal direction is cosAz,
// bilinear between the four nodes round the coordinates (u = sqrt((1 - cos az) / 2), s = ln(t / AERIAL_FROM) / ln(AERIAL_TO / AERIAL_FROM))
function aerialRead(pictureData: Float32Array, cosAz: number, t: number): AerialResult {
  const u = Math.sqrt(0.5 * Math.max(1 - cosAz, 0));
  const s = Math.min(Math.max(Math.log(Math.max(t, AERIAL_FROM) / AERIAL_FROM) / Math.log(AERIAL_TO / AERIAL_FROM), 0), 1);
  const x = u * (AERIAL_W - 1), x0 = Math.floor(x), fx = x - x0;
  const y = s * (AERIAL_H - 1), y0 = Math.floor(y), fy = y - y0;
  const read = (row0: number): number[] => {
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const at = (r: number, c: number) => pictureData[((row0 + r) * SKY_W + c) * 4 + k]!;
      const x1 = Math.min(x0 + 1, SKY_W - 1), y1 = Math.min(y0 + 1, AERIAL_H - 1);
      out[k] = (at(y0, x0) * (1 - fx) + at(y0, x1) * fx) * (1 - fy) + (at(y1, x0) * (1 - fx) + at(y1, x1) * fx) * fy;
    }
    return out;
  };
  return { transmittance: read(SKY_H + 1), inscatter: read(SKY_H + 1 + AERIAL_H) };
}

export const Atmosphere = { EL, AZ, SKY_W, SKY_H, AERIAL_W, AERIAL_H, AERIAL_FROM, AERIAL_TO, PICTURE_H, elevationAt, azimuthAt, build, multipleShare, skyAt, skyUv, skyTexture, skyRead, diffuseAt, shBasis, uniformSky, airGround, aerial, aerialFor, aerialSource, aerialAnalytic, airColumn, picture, aerialRead };

M.Atmosphere = Atmosphere;
