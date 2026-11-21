// The light around: the Orb's (the moon's). Plain data and pure functions (no GL, no page): read by effects/fog.ts (Fog.GLSL's
// constants, their text as before, and the moon kernel's directions), which every shader seen through the fog or lit by the sky
// includes (the water's among them), and by models/quality/fogshade.ts (the CPU twin of the shade bake).
//
// The sky is the atmosphere's (models/atmosphere.ts: the Orb's light scattered by an Earth-like air; the shaders' atmosSeen and atmosDiffuse): no flat sky is kept here. What is
// left is the Orb's side: MOON, MOON_DIR and the MoonDisc.
//
// The moon disc: a source with a direction (MOON_DIR), the real moon's angular radius (0.26 degrees) and a soft edge, in place of a bare direction.
//   radius r = 0.0046 rad; solid angle pi r^2 = 6.6476e-5 sr; its radiance = the irradiance MOON over that solid angle (0.3 / 6.6476e-5 = 4,513 in the red channel,
//   4,814 green, 5,415 blue, in the scene's linear units): radiance x solid angle gives MOON back, so the diffuse lighting (a bare direction of irradiance MOON)
//   is the same light as the disc's. The penumbra kernel: MoonDisc.directions(dir, r, n) gives n directions over the disc (the centre, then the edge at 0, 180,
//   90 and 270 degrees round it: the kernel of any count is the prefix of a larger one); the shade bake's moon channel is the mean of the clouds' transmittance
//   through the first MoonDisc.KERNEL of them (the GPU's bake and the CPU twin, one constant). The kernel is 3 only where the picture test (scenetest.html
//   ?test=moonkernel: the picture with the kernel of 3 against 1, qualitylod's bounds) shows a difference; else 1.
//   MoonDisc.glint(r, footprint): the water's glint, physical: the radiance the disc gives along the reflected unit direction r over a beam of angular radius
//   `footprint` (a pixel's glossy beam): s = max(radius, footprint), the edge smoothed over the squared angle (1 - smoothstep(0.6 s^2, 1.4 s^2, delta^2): the
//   light kept is exact, the integral over the sphere is pi s^2), times (radius / s)^2 (a wider beam spreads the disc's light), times the radiance. The water
//   multiplies it by the Fresnel reflectance and the shade's moon channel.
//   The disc is placed out of reach: its elevation is above the highest view over the plane height's and the parallax's limits (Camera.HIGHEST_PITCH, the
//   parallax's pitch at Amount 1 in rotation mode, half the field of view: about 59 degrees) plus its radius plus a margin of 0.02 rad, and the mirror image
//   below the lowest view by as much, so neither the disc nor its image is drawn (units.ui.moondisc.ts: moondiscreach).
//
// Changelog:
// 2026-11-04: a module of src/materials/: SKY, MOON and MOON_DIR moved here (were in Fog.GLSL),
//   their values unchanged.
// 2026-11-12: SkyBox (the sky as a flat-coloured box: its irradiance, one definition for every lighting term) and MoonDisc (the moon's radius, solid angle,
//   radiance, the penumbra kernel's directions, the glint), registered as M.SkyBox and M.MoonDisc.
// 2026-11-20: SkyBox, SKY and the flat sky's functions removed (Feature S1, story A2): the sky is the atmosphere's.
// 2026-11-12: MOON_KERNEL 1 (the kernel of 3 changed the pictures by at most 1 level in four scenarios of scenetest ?test=moonkernel: under qualitylod's bounds, so the
//   bake does not pay for it).
import { M } from "../engine/core";

// the moonlight's irradiance through the cloud cover, linear RGB, from MOON_DIR
export const MOON: readonly number[] = [0.3, 0.32, 0.36];
// the direction towards the moon (world space, y up, -z ahead; normalized where it is read)
export const MOON_DIR: readonly number[] = [0.24, 0.91, -0.34];

const moonLength = Math.hypot(MOON_DIR[0], MOON_DIR[1], MOON_DIR[2]);
const MOON_UNIT: readonly number[] = [MOON_DIR[0] / moonLength, MOON_DIR[1] / moonLength, MOON_DIR[2] / moonLength];

// the real moon's angular radius (0.26 degrees)
const MOON_RADIUS = 0.0046;
// its solid angle, pi r^2 (sr)
const MOON_SOLID_ANGLE = Math.PI * MOON_RADIUS * MOON_RADIUS;
// its radiance: the irradiance MOON over the solid angle
const MOON_RADIANCE: readonly number[] = [MOON[0] / MOON_SOLID_ANGLE, MOON[1] / MOON_SOLID_ANGLE, MOON[2] / MOON_SOLID_ANGLE];
// the penumbra kernel the shade bake's moon channel takes (directions over the disc), and the most the GLSL's constants hold
const MOON_KERNEL = 1;
const MOON_KERNEL_MAX = 5;
// the edge points' angles round the centre, in order (degrees)
const EDGE_ANGLES = [0, 180, 90, 270];
// the soft edge's half width as a share of the squared radius: the coverage falls from 1 to 0 between (1 - E) s^2 and (1 + E) s^2
const EDGE_SOFT = 0.4;

// the n directions of the kernel over the disc of angular radius `radius` round dir: the centre first, then the edge points; a flat array of 3 n unit vectors
function directions(dir: ArrayLike<number>, radius: number, n: number): number[] {
  const length = Math.hypot(dir[0], dir[1], dir[2]);
  const c = [dir[0] / length, dir[1] / length, dir[2] / length];
  const out = [c[0], c[1], c[2]];
  // (the horizontal perpendicular, up x centre; straight up has none: any horizontal one)
  const flat = Math.hypot(c[2], c[0]);
  const u = flat < 1e-9 ? [1, 0, 0] : [c[2] / flat, 0, -c[0] / flat];
  const v = [c[1] * u[2] - c[2] * u[1], c[2] * u[0] - c[0] * u[2], c[0] * u[1] - c[1] * u[0]];
  const cosR = Math.cos(radius);
  const sinR = Math.sin(radius);
  const count = Math.min(Math.max(Math.floor(n), 1), MOON_KERNEL_MAX);
  for (let k = 0; k < count - 1; k++) {
    const a = (EDGE_ANGLES[k] * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < 3; i++) {
      out.push(c[i] * cosR + (ca * u[i] + sa * v[i]) * sinR);
    }
  }
  return out;
}

// the glint's radiance along the unit direction r over a beam of angular radius `footprint` (the shaders' moonGlint, with the shade's moon channel 1)
function glint(r: ArrayLike<number>, footprint: number): number[] {
  const cosine = r[0] * MOON_UNIT[0] + r[1] * MOON_UNIT[1] + r[2] * MOON_UNIT[2];
  if (cosine <= 0) {
    return [0, 0, 0];
  }
  const cx = r[1] * MOON_UNIT[2] - r[2] * MOON_UNIT[1];
  const cy = r[2] * MOON_UNIT[0] - r[0] * MOON_UNIT[2];
  const cz = r[0] * MOON_UNIT[1] - r[1] * MOON_UNIT[0];
  // (the sine of the angle, squared: the angle's square to the order that matters here)
  const delta2 = cx * cx + cy * cy + cz * cz;
  const s = Math.max(MOON_RADIUS, footprint);
  const s2 = s * s;
  const t = Math.min(Math.max((delta2 - (1 - EDGE_SOFT) * s2) / (2 * EDGE_SOFT * s2), 0), 1);
  const cover = 1 - t * t * (3 - 2 * t);
  const k = cover * (MOON_RADIUS / s) * (MOON_RADIUS / s);
  return [MOON_RADIANCE[0] * k, MOON_RADIANCE[1] * k, MOON_RADIANCE[2] * k];
}

export const MoonDisc = { RADIUS: MOON_RADIUS, SOLID_ANGLE: MOON_SOLID_ANGLE, RADIANCE: MOON_RADIANCE, KERNEL: MOON_KERNEL, KERNEL_MAX: MOON_KERNEL_MAX, EDGE_SOFT, DIR: MOON_DIR, directions, glint };

M.MoonDisc = MoonDisc;
