// The mist carried beyond the fog volume's far end (Feature U1, story U4: units.ui.mistbeyond.ts). Pure, no GL, no page: the closed forms the injected
// shader text (shaders/fog/mistbeyond.glsl) evaluates, with the scale height as an argument (the shaders' MIST_HEIGHT is the module constant of materials/fog.ts).
//
// The mist is the exponential height layer of materials/fog.ts: extinction k e^(-y / H) per metre at y metres above the water. The volume (300 m) holds the part of a ray up to FROM; the sky's rays leave
// it there and the shipped picture has no mist beyond. The span from FROM to a finite end (the water's hit: shaders/water/fragment.glsl airBeyond already has it) or to END (the sky's rays) is a segment of
// the same closed form.
// - segment(k, H, y0, y1, len): the optical depth of the layer along a straight path of length len from height y0 to y1 (clamped at the water): k len e^(-y0 / H) (1 - e^(-x)) / x, x = (y1 - y0) / H, its
//   series for a small |x| (materials/fog.ts mistDepth for any H)
// - depth(k, H, eyeY, s, from, to): the ray from the eye at height eyeY with the slope s (the unit ray's y component), between the distances from and to
// - toInfinity(k, H, eyeY, s, from): for s > 0 the limit k e^(-y0 / H) H / s, y0 = eyeY + s from; Infinity for a level or falling ray
// - sky(k, H, eyeY, s): depth(from FROM to END): the depth the shader adds to a sky ray (END 5 km: a rising ray's layer is gone before it above about 0.5 degrees at H 36)
// - apply(a, clear, lit): a read whose nearer fog lets a through: what lies behind is attenuated by the span (a x clear) and the span adds the white light a x (1 - clear) x lit (the light nearer to
//   the eye is not attenuated by it)
//
// Changelog:
// 2026-11-22: new (Feature U1, story U4).
// 2026-11-22: END 5000 m, was 100000 (the sky's depth at the horizon is the water's last rows', not the whole layer's: no step at the waterline).

import { M } from "../engine/core";

// the volume's far end (QualityFog.FOG_FAR, effects/fog.ts FOG_FAR) and the end of the sky's rays, metres. END is the distance of the horizon the flat water's rows end at (the eye at 1.4 m: the
// horizon of the sphere is at 4.2 km; the water's last rows hit at 3 to 6 km): a sky ray ending there takes the same mist as the water ray just below it (a level ray's depth k x 4.7 km, as the last
// water row's), so the picture has no step at the waterline; a rising ray whose layer is gone before END (above about 0.5 degrees for H 36) is unchanged by it
const FROM = 300;
const END = 5000;

function segment(k: number, H: number, y0: number, y1: number, len: number): number {
  const a = Math.max(y0, 0);
  const x = (Math.max(y1, 0) - a) / H;
  const g = Math.abs(x) < 0.02 ? 1 - x * 0.5 + (x * x) / 6 - (x * x * x) / 24 : (1 - Math.exp(-x)) / x;
  return k * len * Math.exp(-a / H) * g;
}

function depth(k: number, H: number, eyeY: number, s: number, from: number, to: number): number {
  return segment(k, H, eyeY + s * from, eyeY + s * to, to - from);
}

function toInfinity(k: number, H: number, eyeY: number, s: number, from: number): number {
  if (!(s > 0)) {
    return Infinity;
  }
  return (k * Math.exp(-Math.max(eyeY + s * from, 0) / H) * H) / s;
}

function sky(k: number, H: number, eyeY: number, s: number): number {
  return depth(k, H, eyeY, s, FROM, END);
}

function apply(a: number, clear: number, lit: number): { a: number; add: number } {
  return { a: a * clear, add: a * (1 - clear) * lit };
}

export const MistBeyond = { FROM, END, segment, depth, toInfinity, sky, apply };

M.MistBeyond = MistBeyond;
