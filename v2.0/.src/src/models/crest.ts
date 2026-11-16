// CrestHide: the rule that hides a glyph (a rain drop, a splash, a bolt piece or its characters) behind a wave crest. Pure: no GL, no page, importable in any thread.
// The water pass writes, per pixel, the eye's distance to the crest it shows (the wave hit's `hit`) into a third attachment (R32F), and FAR where there is no crest: calm water, the sky,
// a pixel the march found no crest on, and every pixel while the wave hit is off (the gate). A glyph fragment at eye distance `fragDist` is behind that crest when it is farther than the
// crest's distance plus a bias, never where nothing was written (crestDist >= FAR).
// - FAR: what the picture holds where no crest was found (larger than any drawn distance).
// - BIAS, REL_BIAS: the tolerance, an absolute part (m) and a part relative to the distance (the picture's rounding and the two shaders' float error grow with it), so the crest's own
//   surface and a glyph lying on it are not hidden.
// - bias(crestDist): BIAS + REL_BIAS x crestDist.
// - behindCrest(fragDist, crestDist, bias): fragDist > crestDist + bias, false for crestDist >= FAR.
// - GLSL: shaders/waves/crest.glsl, the shader's twin (uCrest, uCrestHide, behindCrest(vec3 world)), with these constants filled in.
// The pool's culling by this rule is not made: no exact lower bound of the surface along the eye's ray exists (only 0, which the below-water discard already covers), so the model offers no
// cull function.
//
// Changelog:
// 2026-11-15: new.
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import CREST_SOURCE from "../shaders/waves/crest.glsl";

const FAR = 1.0e6;
const BIAS = 1e-3;
const REL_BIAS = 1e-4;

function bias(crestDist: number): number {
  return BIAS + REL_BIAS * crestDist;
}

function behindCrest(fragDist: number, crestDist: number, tolerance: number): boolean {
  return crestDist < FAR && fragDist > crestDist + tolerance;
}

const GLSL = fill(CREST_SOURCE, { CREST_FAR: FAR.toFixed(1), CREST_BIAS: BIAS.toFixed(6), CREST_REL_BIAS: REL_BIAS.toFixed(6) });

export const CrestHide = { FAR, BIAS, REL_BIAS, bias, behindCrest, GLSL };

M.CrestHide = CrestHide;
