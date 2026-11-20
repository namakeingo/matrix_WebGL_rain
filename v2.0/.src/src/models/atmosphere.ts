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
// - Atmosphere.build({ orbDir, orbIrradiance, observerHeight? }): { sky, sh, ambient }
// - Atmosphere.skyAt(t, dir, orbDir): the CPU twin of the shader's lookup (bilinear in sqrt(el / (pi / 2)) (EL - 1) and az / pi (AZ - 1); below the horizon, the horizon row)
// - Atmosphere.diffuseAt(t, n), shBasis(n), uniformSky(L)
//
// Changelog:
// 2026-11-19: new (prototype P0 of the atmosphere).
import { M } from "../engine/core";

export interface AtmosphereInput {
  orbDir: ArrayLike<number>;
  orbIrradiance: ArrayLike<number>;
  observerHeight?: number;
}
export interface AtmosphereTables {
  sky: Float32Array;
  sh: Float32Array;
  ambient: Float32Array;
}

const EL = 16;
const AZ = 12;
const HALF_PI = Math.PI / 2;

const PLANET = 6360000;
const TOP = 6460000;
const TOP_HEIGHT = TOP - PLANET;
const BR0 = 5.802e-6, BR1 = 13.558e-6, BR2 = 33.1e-6;
const BMS = 3.996e-6;
const BME = 8.436e-6;
const BO0 = 0.650e-6, BO1 = 1.881e-6, BO2 = 0.085e-6;
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

// the transmittance (rgb) from p along the unit o to the top of the air, `n` steps spaced as a square; 0 where the ray meets the planet. Written into `out`.
function towardsOrb(px: number, py: number, pz: number, ox: number, oy: number, oz: number, n: number, out: Float64Array): void {
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
  out[0] = Math.exp(-(BR0 * sr + BME * sm + BO0 * so));
  out[1] = Math.exp(-(BR1 * sr + BME * sm + BO1 * so));
  out[2] = Math.exp(-(BR2 * sr + BME * sm + BO2 * so));
}

const TSUN = new Float64Array(3);

// the multiple-scattering radiance Psi (rgb, per unit irradiance at the top of the air) at the altitudes of the table: [altitude][channel]
function multipleScattering(h0: number, ox: number, oy: number): Float64Array {
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
        const t0 = Math.exp(-(BR0 * (sr + hr / 2) + BME * (sm + hm / 2) + BO0 * (so + hz / 2)));
        const t1 = Math.exp(-(BR1 * (sr + hr / 2) + BME * (sm + hm / 2) + BO1 * (so + hz / 2)));
        const t2 = Math.exp(-(BR2 * (sr + hr / 2) + BME * (sm + hm / 2) + BO2 * (so + hz / 2)));
        towardsOrb(qx, qy, qz, ox, oy, 0, MS_ORB_STEPS, TSUN);
        const s0 = BR0 * dr + BMS * dm, s1 = BR1 * dr + BMS * dm, s2 = BR2 * dr + BMS * dm;
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

function build(p: AtmosphereInput): AtmosphereTables {
  const t = emptyTables();
  const h0 = Math.max(p.observerHeight === undefined ? 2 : p.observerHeight, 0);
  const l = Math.hypot(p.orbDir[0]!, p.orbDir[1]!, p.orbDir[2]!);
  if (!(l > 0)) return t;
  const oy = Math.min(Math.max(p.orbDir[1]! / l, -1), 1);
  const ox = Math.sqrt(1 - oy * oy);
  const orb = [ox, oy, 0];
  const px = 0, py = PLANET + h0, pz = 0;
  towardsOrb(px, py, pz, ox, oy, 0, TG_STEPS, TSUN);
  const etop = [0, 0, 0];
  for (let c = 0; c < 3; c++) etop[c] = p.orbIrradiance[c]! / Math.max(TSUN[c]!, 1e-9) * (TSUN[c]! > 0 ? 1 : 0);
  if (!(etop[0]! > 0 || etop[1]! > 0 || etop[2]! > 0)) return t;

  const psi = multipleScattering(h0, ox, oy);
  const tmp = new Float64Array(3);
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
      const vx = dv[0]!, vy = dv[1]!, vz = dv[2]!;
      const cosT = vx * ox + vy * oy;
      const pr = RAY_K * (1 + cosT * cosT);
      const g2 = MIE_G * MIE_G;
      const pm = MIE_K * (1 + cosT * cosT) / Math.pow(1 + g2 - 2 * MIE_G * cosT, 1.5);
      const b = py * vy;
      const len = -b + Math.sqrt(b * b - (py * py - TOP * TOP));
      let sr = 0, sm = 0, so = 0;
      L[0] = 0; L[1] = 0; L[2] = 0;
      const n2 = SKY_STEPS * SKY_STEPS;
      for (let k = 0; k < SKY_STEPS; k++) {
        const um = (k + 0.5) / SKY_STEPS;
        const s = len * um * um;
        const ds = (len * (2 * k + 1)) / n2;
        const qx = px + vx * s, qy = py + vy * s, qz = pz + vz * s;
        const h = Math.sqrt(qx * qx + qy * qy + qz * qz) - PLANET;
        const dr = Math.exp(-h / HR), dm = Math.exp(-h / HM), dz = ozone(h);
        const hr = dr * ds, hm = dm * ds, hz = dz * ds;
        towardsOrb(qx, qy, qz, ox, oy, 0, ORB_STEPS, tmp);
        // the multiple-scattering table's altitude index (the altitudes spaced as a square from the observer's)
        const fa = Math.sqrt(Math.max(h - h0, 0) / (TOP_HEIGHT - h0)) * (MS_ALTITUDES - 1);
        const a0 = Math.min(Math.floor(fa), MS_ALTITUDES - 2), ta = Math.min(fa - a0, 1);
        const rayleigh = dr * pr, mie = dm * BMS * pm;
        for (let c = 0; c < 3; c++) {
          const br = c == 0 ? BR0 : c == 1 ? BR1 : BR2;
          const bo = c == 0 ? BO0 : c == 1 ? BO1 : BO2;
          const tview = Math.exp(-(br * (sr + hr / 2) + BME * (sm + hm / 2) + bo * (so + hz / 2)));
          const ps = psi[a0 * 3 + c]! * (1 - ta) + psi[(a0 + 1) * 3 + c]! * ta;
          const sigma = br * dr + BMS * dm;
          const source = (br * rayleigh + mie) * tmp[c]! + sigma * ps;
          L[c]! += tview * source * ds;
        }
        sr += hr; sm += hm; so += hz;
      }
      const o = (j * EL + i) * 4;
      t.sky[o] = L[0]! * etop[0]!;
      t.sky[o + 1] = L[1]! * etop[1]!;
      t.sky[o + 2] = L[2]! * etop[2]!;
    }
  }
  project(t, orb);
  return t;
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

export const Atmosphere = { EL, AZ, elevationAt, azimuthAt, build, skyAt, diffuseAt, shBasis, uniformSky };

M.Atmosphere = Atmosphere;
