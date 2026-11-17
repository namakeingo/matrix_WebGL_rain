// GlyphTurn: the glyphs' random turn about their own vertical (Y) axis ("3D Symbols"), as a pure model (no GL, no page: importable in any thread). Every glyph (a rain cell, a splash's
// stamp, a bolt's character) is a quad whose local right axis is x; with 3D Symbols on it is turned about its centre by an angle between -MAX_DEGREES and +MAX_DEGREES, drawn from the
// glyph's seed, so it is fixed from spawn to death and the same on the CPU and the GPU:
// - angle(seed): radians, ((hash(seed) / 2^32) x 2 - 1) x MAX, with M.hash (the codebase's 32-bit PCG hash; shaders/core/hash.glsl is its twin): across [-MAX, +MAX), uniform;
// - offset(localX, angle): [dx, dz] of a quad corner at localX from the glyph's centre along its right axis: [localX cos, localX sin]; the centre never moves, the width never grows;
// - normal(angle): the turned quad's normal [-sin, 0, cos], (0, 0, 1) at angle 0.
// The GLSL twin is shaders/glyphs/turn.glsl (GLSL: turnAngle, turnCS, turnOffset, turnNormal), with MAX filled in.
//
// Changelog:
// 2026-11-16: new.
// 2026-11-16: the range +-45 degrees, was +-30
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import TURN_SOURCE from "../shaders/glyphs/turn.glsl";

const MAX_DEGREES = 45;
const MAX = (MAX_DEGREES * Math.PI) / 180;

function angle(seed: number): number {
  return ((M.hash(seed >>> 0) / 4294967296) * 2 - 1) * MAX;
}

function offset(localX: number, a: number): number[] {
  return [localX * Math.cos(a), localX * Math.sin(a)];
}

function normal(a: number): number[] {
  return [-Math.sin(a), 0, Math.cos(a)];
}

const GLSL = fill(TURN_SOURCE, { TURN_MAX: MAX.toFixed(7) });

export const GlyphTurn = { MAX_DEGREES, MAX, angle, offset, normal, GLSL };

M.GlyphTurn = GlyphTurn;
