// MusicRain: how the music sets the rain (pure: no GL, no page; importable in any thread; the music worker's model). matrix_web_rain's, value for value
// (units.ui.musicrain.ts runs that code's text beside this one).
// - columns(array, count, multiplier, driven, out): for each of `count` columns of the screen, the volume of its bin of the audio array (the column's index scaled
//   to the 64 bins of a channel, both channels added), and from it the music's chance for the column (the volume cubed times the sensitivity multiplier, 0 to 1) and
//   the lightness of its character (40 to 80, floor of the volume x 100 x the multiplier); both only while the music drives (not in the idle animation: chance -1,
//   lightness 50). Gives whether any column heard sound (a volume above 0.01).
// - share(chances, count, fall): the sum over the columns with a chance of the share of drops each would keep falling if drops waited below the screen to start
//   again with that chance a step (a drop's cycle its `fall` rows on average, and a wait of 1 / chance steps); -1 when no column has a chance (no music).
// - shares(chances, count, fall, above, rainScale, out): each column's share of the settled rain's falls (the same maths, per column, kept to 0 to 1).
// - rateFactor(responsiveness): the multiple of the steady spawn rate Music rain responsiveness gives (2 ^ (responsiveness - 1)).
// - lightAt(bins, u): the light multiple at a place across the window, with linear soft edges overlapping the neighbouring columns (the shader's musicLight).
// - lights(lightness, count, out, intensity): the drops' light emittance by column, over LIGHT_BINS bins across the window, eased towards 1 by Music light intensity (0 to 1).
// - scale(chances, count, fall, above, rainScale): the music's drops wanted as a multiple of the settled rain's: the average share, times (fall + above) / fall (a
//   drop is above the screen for `above` rows before it shows), over the settled rain's rainScale; 1 without the music.
//
// Changelog:
// 2026-11-09: new (matrix_web_rain's rain reaction, as a model).
import { M } from "../engine/core";

const SOUND = 0.01;

function clamp(min: number, max: number, value: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

interface ColumnOut {
  chance: { [i: number]: number };
  lightness: { [i: number]: number };
}

function columns(array: ArrayLike<number>, count: number, multiplier: number, driven: boolean, out: ColumnOut): boolean {
  let heard = false;
  const half = array.length / 2;
  for (let i = 0; i < count; i++) {
    const frequency = Math.floor(i * (half / count));
    const volume = array[frequency]! + array[frequency + half]!;
    if (volume > SOUND) heard = true;
    if (driven) {
      out.chance[i] = clamp(0, 1, volume * volume * volume * multiplier);
      out.lightness[i] = Math.floor(clamp(40, 80, volume * 100 * multiplier));
    } else {
      out.chance[i] = -1;
      out.lightness[i] = 50;
    }
  }
  return heard;
}

function share(chances: ArrayLike<number>, count: number, fall: number): number {
  let music = false;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const chance = chances[i]!;
    if (chance >= 0) {
      music = true;
      if (chance > 0) sum += fall / (fall + 1 / chance);
    }
  }
  return music ? sum : -1;
}

function scale(chances: ArrayLike<number>, count: number, fall: number, above: number, rainScale: number): number {
  const sum = share(chances, count, fall);
  if (sum < 0) return 1;
  return ((sum / Math.max(1, count)) * ((fall + above) / fall)) / rainScale;
}

// each column's share of the settled rain's falls (a drop's fall in the column is shown or not): its share of drops falling, times (fall + above) / fall, over rainScale, kept
// to 0 to 1; 0 for a column with no chance, 1 for every column when no column has a chance (no music)
function shares(chances: ArrayLike<number>, count: number, fall: number, above: number, rainScale: number, out: { [i: number]: number }): void {
  let music = false;
  for (let i = 0; i < count; i++) {
    if (chances[i]! >= 0) {
      music = true;
      break;
    }
  }
  const lift = (fall + above) / fall / rainScale;
  for (let i = 0; i < count; i++) {
    const chance = chances[i]!;
    out[i] = !music ? 1 : chance > 0 ? Math.min(1, Math.max(0, (fall / (fall + 1 / chance)) * lift)) : 0;
  }
}

// the drops' light emittance by column: a column's lightness (40 to 80, 50 with no music: matrix_web_rain's lightness of its characters) as a multiple of their light, (lightness /
// 50) to the power LIGHT_POWER (0.51 at 40, 1 at 50, 4.1 at 80: the loud columns' drops go over 1 and show as HDR bloom), averaged over LIGHT_BINS bins across the window (a bin is
// the columns it covers; fewer columns than bins: each bin its column)
const LIGHT_BINS = 128;
const LIGHT_POWER = 3;
function lights(lightness: ArrayLike<number>, count: number, out: { [i: number]: number }, intensity = 1): void {
  for (let b = 0; b < LIGHT_BINS; b++) {
    const from = Math.floor((b * count) / LIGHT_BINS);
    const to = Math.max(from + 1, Math.floor(((b + 1) * count) / LIGHT_BINS));
    let sum = 0;
    for (let c = from; c < to; c++) {
      sum += Math.pow(lightness[c]! / 50, LIGHT_POWER);
    }
    // (Music light intensity: the multiple eased towards 1, 1 at intensity 0)
    out[b] = 1 + (sum / (to - from) - 1) * intensity;
  }
}

// Music rain responsiveness as the rate of the falls the music asks for: 1 spawns them at the exact steady rate of the normal rain for the density the music sets, and every step of the
// setting halves the time given to reach the steady state, so doubles the rate: 2 ^ (responsiveness - 1)
function rateFactor(responsiveness: number): number {
  return Math.pow(2, Math.max(1, responsiveness) - 1);
}

// the light multiple at a place across the window with soft edges that overlap the neighbouring columns and soften linearly (u: the place in bins from the left; the specification of
// the vertex shader's musicLight): a bin is at its own multiple over its middle half, and over LIGHT_SOFT (a quarter bin) each side of every edge the two bins beside the edge
// cross-fade linearly, their weights always summing to 1 (half each at the edge itself), so the contributions of two columns on an edge always sum to the same peak: a lit column is
// a bright rectangle with soft edges overlapping both columns beside it, lit columns of the same multiple in a row are one wide rectangle with soft edges only on its outer sides and no
// dark line between them, and the multiple is continuous across the window; the first and last bins are their own neighbour beyond the window
const LIGHT_SOFT = 0.25;
function lightAt(bins: ArrayLike<number>, place: number): number {
  const u = Math.min(LIGHT_BINS - 1e-6, Math.max(0, place));
  const c = Math.floor(u);
  const f = u - c;
  const own = bins[c]!;
  if (f < LIGHT_SOFT) {
    const w = 0.5 + f / (2 * LIGHT_SOFT);
    return w * own + (1 - w) * bins[Math.max(c - 1, 0)]!;
  }
  if (f > 1 - LIGHT_SOFT) {
    const w = 0.5 + (1 - f) / (2 * LIGHT_SOFT);
    return w * own + (1 - w) * bins[Math.min(c + 1, LIGHT_BINS - 1)]!;
  }
  return own;
}

export const MusicRain = { columns, share, scale, shares, lights, lightAt, rateFactor, LIGHT_BINS, LIGHT_POWER, LIGHT_SOFT };

M.MusicRain = MusicRain;
