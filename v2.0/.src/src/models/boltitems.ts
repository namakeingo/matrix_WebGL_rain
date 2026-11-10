// The lightning's items: a strike's shape (models/boltshape.ts) as the pieces and characters Bolt
// draws (effects/bolt.ts), worked out from the shape and the view alone, with no GL and no page:
// the same function on the main thread and in the bolt's worker (workers/boltworker.ts), so
// their arrays are the same to the bit.
// - Made once a strike and a view, at its full growth: each piece and each character's place keeps
//   the growths at which it starts and ends (and at which it is hidden: the routes' parts at the
//   meeting), and Bolt's vertex shaders cut them at the slot's growth each frame. With
//   options.growth they are made cut at that growth instead (the tests' main-thread cut), their
//   growths left so the shaders cut nothing.
// - A piece: 20 floats, 5 texels: its start and size; its end (as grown) and radiance (a unit of its
//   slot's light: its generation's share of the main channel's over F); the start of the piece
//   before and its kind; the end of the piece after (as grown) and 0; the growths at which its
//   start, its end and the next piece's end are reached, and from which it is hidden.
// - A character's place: 20 floats, 5 texels: its point and size; its seed at rest, its radiance
//   for full ink across the view, its kind and 0; the joint before the next place and the part of
//   the way it is at; the next place and how far it may move once grown; its rate (places a second)
//   and the growths at which it is reached and its next place is, and from which it is hidden.
// - Their slot is not in them (each slot has a region of Bolt's textures of its own): the same
//   strike's items in any slot.
// - The characters' seeds from the strike's own seed (and each line's number in its shape).
// - Every line of a strike's characters at one speed: the main channel's length over TRAVEL of the
//   strike's duration; the main channel walked from its foot, every other line from its start.
// Also the bell's sum across (BAND_PER_SIZE) and the constants of the items' light (the bell's
// own: materials/bolt.ts).
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/models/ (was engine/boltitems.js); the bell's constants
//   (BELL_SPREAD, BELL_PX, BELL_LEAST, BELL_END) in materials/bolt.ts.
import { M } from "../engine/core";
import { BELL_SPREAD, BELL_PX, BELL_LEAST, BELL_END } from "../materials/bolt";
import type { ShapeLine } from "./boltshape";

// a line of a strike's shape as the items read it (BoltShape's, made or from its flat form)
export type ItemsLine = ShapeLine;

// a strike's shape as the items read it: the main channel's size F, the main channel, the other
// lines
export interface ItemsShape {
  F: number;
  main: ItemsLine;
  lines: readonly ItemsLine[];
}

// the options a strike's items are made with (optionsFor); growth: cut at that growth
export interface ItemsOptions {
  seed: number;
  duration: number;
  viewProjection: number[];
  eyeHeight: number;
  mostSegments: number;
  mostGlyphs: number;
  growth?: number;
}

// the items made by kind, and the loops' steps
export interface ItemsCounts {
  leaders: number;
  branches: number;
  main: number;
  glyphs: number;
  mainGlyphs: number;
  steps: number;
}

// where a strike's items go: its arrays (made when missing or too small), their counts, and when
// given each piece's line and its piece in it
export interface ItemsOut {
  segments?: Float32Array<ArrayBuffer> | null;
  glyphs?: Float32Array<ArrayBuffer> | null;
  segmentCount?: number;
  glyphCount?: number;
  counts?: ItemsCounts | null;
  lineOf?: (ItemsLine | null)[];
  pieceOf?: Int32Array<ArrayBuffer>;
}

// a strike's items once built
export interface ItemsBuilt extends ItemsOut {
  segments: Float32Array<ArrayBuffer>;
  glyphs: Float32Array<ArrayBuffer>;
  segmentCount: number;
  glyphCount: number;
  counts: ItemsCounts;
}

// every other line's light against the main channel's, by its generation g (BoltShape's, the
// routes' parts before the meeting too): GENERATION_LIGHT x GENERATION_THIN^g
const GENERATION_LIGHT = 0.2;
const GENERATION_THIN = 0.75;
// the bell across a line (Bolt's shaders): exp(-g(r)) at r pixels from it, g a Gaussian's out to
// where its slope reaches 1 / the tail's spread (BELL_SPREAD of the size, at least BELL_PX), then
// on straight; half its light at half the size (on thin lines at least BELL_LEAST px); cut from
// BELL_END - 2 to BELL_END of g (its constants: materials/bolt.ts)
const bellG = (r: number, size: number) => {
  const lambda = Math.max(BELL_SPREAD * size, BELL_PX);
  const h = 0.5 * size;
  let s2 = (h * h) / (2 * Math.LN2);
  if (s2 / lambda < h) {
    s2 = Math.max(2 * lambda * (h - lambda * Math.LN2), BELL_LEAST * BELL_LEAST);
  }
  const rt = s2 / lambda;
  return r <= rt ? (r * r) / (2 * s2) : (rt * rt) / (2 * s2) + (r - rt) / lambda;
};
// the bell's light a metre over its size and radiance, for a wide line (its middle 1)
const BAND_PER_SIZE = (() => {
  const size = 64;
  const step = 1e-3 * size;
  let sum = 0;
  for (let r = step / 2; r < 8 * size; r += step) {
    const g = bellG(r, size);
    if (g > BELL_END) {
      break;
    }
    sum += Math.exp(-g) * step;
  }
  return (2 * sum) / size;
})();
// the characters' spacing (of their size) on the main channel and the others; their share of the
// light a metre (the line under them the rest); a character's radiance for full ink: their share x
// BAND_PER_SIZE x their spacing
const CHARACTER_MAIN = 0.7;
const CHARACTER_SPACING = 0.6;
const CHARACTER_SHARE = 0.8;
// the part of a strike over which a character at the main channel's foot reaches its top (the
// meeting to the branches' end)
const TRAVEL = 0.25;
const SEGMENT_FLOATS = 20;
const GLYPH_FLOATS = 20;
// what an item is: a route's part (before the meeting), a branch, the main channel
const LEADER = 0;
const BRANCH = 1;
const MAIN = 2;
// a growth never reached (a line that is never hidden), and one always (the main-thread cut)
const NEVER = 2;
const ALWAYS = -1;

// scratch, made once
const pa = new Float64Array(3);
const pq = new Float64Array(3);
const pn = new Float64Array(3);
const pb = new Float64Array(3);
const end = new Float64Array(3);
const nextEnd = new Float64Array(3);
const place0 = new Float64Array(3);
const place1 = new Float64Array(3);
const joint = new Float64Array(3);
const clip = new Float64Array(8);

const pointOf = (points: ArrayLike<number>, i: number, out: Float64Array<ArrayBuffer>) => {
  out[0] = points[i * 3];
  out[1] = points[i * 3 + 1];
  out[2] = points[i * 3 + 2];
  return out;
};
// the end of a piece a to q grown to a part f of it (q itself when whole)
const endOf = (a: ArrayLike<number>, q: ArrayLike<number>, f: number, out: Float64Array<ArrayBuffer>) => {
  for (let c = 0; c < 3; c++) {
    out[c] = f >= 1 ? q[c] : a[c] + (q[c] - a[c]) * f;
  }
};
// the point at a length s along a line, on its piece i (past its last point: on along it)
const alongLine = (line: ItemsLine, i: number, s: number, out: Float64Array<ArrayBuffer>) => {
  const p = line.points;
  const span = Math.max(1e-9, line.cum[i + 1] - line.cum[i]);
  const f = (s - line.cum[i]) / span;
  for (let c = 0; c < 3; c++) {
    out[c] = p[i * 3 + c] + (p[(i + 1) * 3 + c] - p[i * 3 + c]) * f;
  }
  return out;
};

export class BoltItems {
  static TRAVEL: number;
  static GENERATION_THIN: number;
  static GENERATION_LIGHT: number;
  static CHARACTER_SHARE: number;
  static CHARACTER_SPACING: number;
  static CHARACTER_MAIN: number;
  static BAND_PER_SIZE: number;
  static BELL_END: number;
  static BELL_LEAST: number;
  static BELL_PX: number;
  static BELL_SPREAD: number;
  static GLYPH_FLOATS: number;
  static SEGMENT_FLOATS: number;
  static MAIN: number;
  static BRANCH: number;
  static LEADER: number;
  cut: boolean;
  m: number[];
  out: ItemsBuilt;
  o: ItemsOptions;
  shape: ItemsShape;
  // the options a strike's items are made with, for a view (the camera, its viewProjection
  // worked out): the strike's seed and duration, the view's matrix and the eye's height, the most
  // items a slot holds
  static optionsFor(strike: { seed: number; duration: number }, view: { viewProjection: ArrayLike<number>; eyeHeight: number }, mostSegments: number, mostGlyphs: number): ItemsOptions {
    return {
      seed: strike.seed >>> 0, duration: strike.duration, viewProjection: Array.from(view.viewProjection), eyeHeight: view.eyeHeight,
      mostSegments, mostGlyphs,
    };
  }

  // a strike's items, from its shape (made whole or from its flat form) and its options, into
  // out.segments and out.glyphs (made when missing or too small) from their starts; out's
  // segmentCount and glyphCount, and (lineOf: an array) each piece's line; options.growth: cut at
  // that growth
  static build(shape: ItemsShape, options: ItemsOptions, out: ItemsOut): ItemsBuilt {
    const items = new BoltItems(shape, options, out);
    items.all();
    return out as ItemsBuilt;
  }

  constructor(shape: ItemsShape, options: ItemsOptions, out: ItemsOut) {
    this.shape = shape;
    this.o = options;
    this.out = out as ItemsBuilt;
    if (!out.segments || out.segments.length < options.mostSegments * SEGMENT_FLOATS) {
      out.segments = new Float32Array(options.mostSegments * SEGMENT_FLOATS);
    }
    if (!out.glyphs || out.glyphs.length < options.mostGlyphs * GLYPH_FLOATS) {
      out.glyphs = new Float32Array(options.mostGlyphs * GLYPH_FLOATS);
    }
    out.segmentCount = 0;
    out.glyphCount = 0;
    out.counts = { leaders: 0, branches: 0, main: 0, glyphs: 0, mainGlyphs: 0, steps: 0 };
    this.m = options.viewProjection;
    this.cut = options.growth !== undefined;
  }

  all() {
    const shape = this.shape;
    const out = this.out;
    const F = shape.F;
    const grown = this.cut ? this.o.growth! : 1;
    const seed = this.o.seed % 16777216;
    // (every line's characters at one speed: the main channel's length over TRAVEL of the strike)
    const speed = shape.main.length / Math.max(1e-6, TRAVEL * this.o.duration);
    const glyphMain = CHARACTER_SHARE * BAND_PER_SIZE * CHARACTER_MAIN;
    const glyphBranch = CHARACTER_SHARE * BAND_PER_SIZE * CHARACTER_SPACING;
    let room = true;
    if (!this.cut || grown >= 1) {
      const pieces = out.segmentCount;
      const glyphs = out.glyphCount;
      room = this.line(shape.main, MAIN, F, F, seed, glyphMain, 1, speed);
      out.counts.main = out.segmentCount - pieces;
      out.counts.mainGlyphs = out.glyphCount - glyphs;
    }
    for (let n = 0; n < shape.lines.length && room; n++) {
      const line = shape.lines[n];
      if (this.cut && line.route && grown >= 1) {
        continue;
      }
      const light = GENERATION_LIGHT * Math.pow(GENERATION_THIN, Math.max(0, line.generation || 0));
      const pieces = out.segmentCount;
      room = this.line(line, line.route ? LEADER : BRANCH, F, 0, (seed + (n + 1) * 1299709) % 16777216, glyphBranch * light, light, speed);
      out.counts[line.route ? "leaders" : "branches"] += out.segmentCount - pieces;
    }
    out.counts.glyphs = out.glyphCount;
  }

  // the growth at which a length s of a line is reached (the main channel: at once, at the meeting)
  growthAt(line: ItemsLine, s: number, kind: number) {
    return this.cut ? ALWAYS : kind === MAIN ? 1 : line.start + ((line.end - line.start) * s) / line.length;
  }

  // whether a piece a to b may be seen, directly or mirrored
  seen(a: ArrayLike<number>, b: ArrayLike<number>) {
    const m = this.m;
    const c = clip;
    for (let mirror = 1; mirror >= -1; mirror -= 2) {
      for (let k = 0; k < 2; k++) {
        const p = k ? b : a;
        const y = p[1] * mirror;
        for (let r = 0; r < 4; r++) {
          c[k * 4 + r] = m[r] * p[0] + m[4 + r] * y + m[8 + r] * p[2] + m[12 + r];
        }
      }
      const hidden = (c[3] <= 0 && c[7] <= 0)
        || (c[0] > c[3] && c[4] > c[7]) || (-c[0] > c[3] && -c[4] > c[7])
        || (c[1] > c[3] && c[5] > c[7]) || (-c[1] > c[3] && -c[5] > c[7]);
      if (!hidden) {
        return true;
      }
    }
    return false;
  }

  // a line (grown at the cut's growth, else whole to where it ends): its pieces and its
  // characters' places; false once full
  line(line: ItemsLine, kind: number, F: number, mainSize: number, seedBase: number, glyphRadiance: number, light: number, speed: number) {
    const cut = this.cut;
    const grown = cut ? this.o.growth! : 1;
    const part = kind === MAIN ? 1 : Math.min(1, (Math.min(1, grown) - line.start) / (line.end - line.start));
    if (part <= 0) {
      return true;
    }
    const until = Math.min(part, line.ends) * line.length;
    if (until <= 0) {
      return true;
    }
    const out = this.out;
    const o = this.o;
    const points = line.points;
    const count = line.count;
    const hide = cut ? NEVER : line.route ? 1 : NEVER;
    for (let i = 0; i + 1 < count && line.cum[i] < until; i++) {
      out.counts.steps++;
      if (out.segmentCount >= o.mostSegments) {
        return false;
      }
      const a = pointOf(points, i, pa);
      const q = pointOf(points, i + 1, pq);
      const span = Math.max(1e-9, line.cum[i + 1] - line.cum[i]);
      const f = Math.min(1, (until - line.cum[i]) / span);
      endOf(a, q, f, end);
      // (its size by its whole piece's middle, as grown)
      const size = mainSize || M.BoltShape.sizeAt(line, (line.cum[i] + 0.5 * f * span) / line.length, F);
      const whole = f >= 1 && i + 2 < count && line.cum[i + 1] < until;
      let nextF = 0;
      if (whole) {
        const nextSpan = Math.max(1e-9, line.cum[i + 2] - line.cum[i + 1]);
        nextF = Math.min(1, (until - line.cum[i + 1]) / nextSpan);
        endOf(q, pointOf(points, i + 2, pn), nextF, nextEnd);
      }
      const before = i > 0 ? pointOf(points, i - 1, pb) : a;
      const after = whole ? nextEnd : end;
      const s = out.segments;
      const k = out.segmentCount * SEGMENT_FLOATS;
      s[k] = a[0];
      s[k + 1] = a[1];
      s[k + 2] = a[2];
      s[k + 3] = size;
      s[k + 4] = end[0];
      s[k + 5] = end[1];
      s[k + 6] = end[2];
      s[k + 7] = light / F;
      s[k + 8] = before[0];
      s[k + 9] = before[1];
      s[k + 10] = before[2];
      s[k + 11] = kind;
      s[k + 12] = after[0];
      s[k + 13] = after[1];
      s[k + 14] = after[2];
      s[k + 15] = 0;
      // (the growths at its ends and the next piece's end, worked out as the next piece works out
      // its own: the two give the same numbers to the bit, so they agree which owns a pixel)
      s[k + 16] = this.growthAt(line, line.cum[i], kind);
      s[k + 17] = this.growthAt(line, f >= 1 ? line.cum[i + 1] : line.cum[i] + f * span, kind);
      s[k + 18] = whole ? this.growthAt(line, nextF >= 1 ? line.cum[i + 2] : line.cum[i + 1] + nextF * Math.max(1e-9, line.cum[i + 2] - line.cum[i + 1]), kind) : s[k + 17];
      s[k + 19] = hide;
      if (out.lineOf) {
        out.lineOf[out.segmentCount] = line;
        if (out.pieceOf) {
          out.pieceOf[out.segmentCount] = i;
        }
      }
      out.segmentCount++;
    }
    return this.places(line, until, kind, F, mainSize, seedBase, glyphRadiance, speed, kind === MAIN, hide);
  }

  // a line's characters' places, from its start (backward: from its end), each a spacing of its
  // piece's size after the last, as far as it has grown; only on pieces seen, each place counted
  // all the same (its seed by its number along the line); false once full
  places(line: ItemsLine, until: number, kind: number, F: number, mainSize: number, seedBase: number, glyphRadiance: number, speed: number, backward: boolean, hide: number) {
    const out = this.out;
    const o = this.o;
    const points = line.points;
    const count = line.count;
    const cum = line.cum;
    const length = line.length;
    const spacing = kind === MAIN ? CHARACTER_MAIN : CHARACTER_SPACING;
    const last = count - 2;
    const along = (s: number) => (backward ? length - s : s);
    let place = place0;
    let next = place1;
    let piece = backward ? last : 0;
    let at = -1;
    let size = 0;
    let shown = false;
    pointOf(points, backward ? count - 1 : 0, place);
    for (let s = 0, k = 0; s <= until; k++) {
      out.counts.steps++;
      if (piece !== at) {
        at = piece;
        const a = pointOf(points, piece, pa);
        const q = pointOf(points, piece + 1, pq);
        const middle = Math.min(0.5 * (cum[piece] + cum[piece + 1]), 0.5 * (cum[piece] + until));
        size = mainSize || M.BoltShape.sizeAt(line, middle / length, F);
        shown = this.seen(a, q);
      }
      const step = spacing * size;
      const after = s + step;
      let to = piece;
      if (backward) {
        while (to > 0 && cum[to] >= along(after)) {
          to--;
        }
      } else {
        while (to < last && cum[to + 1] <= after) {
          to++;
        }
      }
      alongLine(line, to, along(after), next);
      let jf = 1;
      let j = next;
      if (to !== piece) {
        const p = backward ? piece : piece + 1;
        j = pointOf(points, p, joint);
        jf = Math.abs(cum[p] - along(s)) / step;
      }
      if (shown) {
        if (out.glyphCount >= o.mostGlyphs) {
          return false;
        }
        const g = out.glyphs;
        const q = out.glyphCount * GLYPH_FLOATS;
        g[q] = place[0];
        g[q + 1] = place[1];
        g[q + 2] = place[2];
        g[q + 3] = size;
        g[q + 4] = (seedBase + k * 7919) % 16777216;
        g[q + 5] = glyphRadiance / F;
        g[q + 6] = kind;
        g[q + 7] = 0;
        g[q + 8] = j[0];
        g[q + 9] = j[1];
        g[q + 10] = j[2];
        g[q + 11] = jf;
        g[q + 12] = next[0];
        g[q + 13] = next[1];
        g[q + 14] = next[2];
        g[q + 15] = Math.min(1, (until - s) / step);
        g[q + 16] = speed / step;
        g[q + 17] = this.growthAt(line, s, kind);
        g[q + 18] = this.growthAt(line, s + step, kind);
        g[q + 19] = hide;
        out.glyphCount++;
      }
      const swap = place;
      place = next;
      next = swap;
      s = after;
      piece = to;
    }
    return true;
  }
}

BoltItems.SEGMENT_FLOATS = SEGMENT_FLOATS;
BoltItems.GLYPH_FLOATS = GLYPH_FLOATS;
BoltItems.GENERATION_LIGHT = GENERATION_LIGHT;
BoltItems.GENERATION_THIN = GENERATION_THIN;
BoltItems.BELL_SPREAD = BELL_SPREAD;
BoltItems.BELL_PX = BELL_PX;
BoltItems.BELL_LEAST = BELL_LEAST;
BoltItems.BELL_END = BELL_END;
BoltItems.BAND_PER_SIZE = BAND_PER_SIZE;
BoltItems.CHARACTER_MAIN = CHARACTER_MAIN;
BoltItems.CHARACTER_SPACING = CHARACTER_SPACING;
BoltItems.CHARACTER_SHARE = CHARACTER_SHARE;
BoltItems.TRAVEL = TRAVEL;
BoltItems.LEADER = LEADER;
BoltItems.BRANCH = BRANCH;
BoltItems.MAIN = MAIN;

M.BoltItems = BoltItems;
