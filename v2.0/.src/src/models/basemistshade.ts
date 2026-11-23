// The base mist's shade as a pure model (Feature U3, story M3; units.ui.basemistshade.ts; no GL, no page, importable in any thread). The sky's and the Orb's light reaching a point through the STATIC base density, baked once into
// extra layers of the fog's shade texture and read with the front cloud's shade in one read (their product).
// - GRID: the front shade grid's constants (M.QualityFogShade's); LAYERS = 2 DEEP (the texture's depth: the front's layers, then the base's); layerOf(iz) = DEEP + iz; node(ix, iy, iz) the grid node's place (the shader's shadePlace and
//   the CPU twin's); nodeLod(ix, iy, iz) the cell's lod (the front bake's: max(log2(size x 128), 8), 8 being lodOf(2 m), the places' spacing)
// - density(p, strength, read, lod): M.StaticMist.baseDensity(y, HB, strength, M.StaticMist.meanOne(baseNoise(p, read, lod), lod, 0)): the static density (the fixed offsets, no time), the noise read at the cell's lod, the window of mean 1 at it
// - through(p, dir, strength, read, lod): exp(-(mean of density at the 4 places p + dir 8 (i + 1/2) / 4) x 8): the front's through() convention, with no air (the front grid holds it: the product counts it once)
// - cell(strength, read, ix, iy, iz): [sky, moon]: through up, and the mean of through over the first M.MoonDisc.KERNEL directions of the moon's disc
// - combine(front, base): the product per channel
// - Schedule: the bake's decisions: frame(strength, on) is true on the frame that owes it (the first with a strength over 0 and `on`, one whose strength differs from the baked one, the first after event('size')), never while the strength is
//   0 or `on` is false; every other event owes nothing (the time, the view, a strike, a colour: the static density's shade changes with none of them); bakes counts the true answers, baked is the strength the grid holds
//
// Changelog:
// 2026-11-22: new (Feature U3, story M3).
import { M } from "../engine/core";
import { MOON_DIR, MoonDisc } from "../materials/sky";
import { MIST_HEIGHT } from "../materials/fog";
import { QualityFogShade } from "./quality/fogshade";
import { StaticMist } from "./staticmist";

type Read = (q: number[], lod: number) => number;

const GRID = { ACROSS: QualityFogShade.ACROSS, UP: QualityFogShade.UP, DEEP: QualityFogShade.DEEP, TOP: QualityFogShade.TOP, NEAR: QualityFogShade.NEAR, FAR: QualityFogShade.FAR, SPAN: QualityFogShade.SPAN };
const LAYERS = 2 * GRID.DEEP;
const PLACES = 4;
const LENGTH = 8;
const LOG = Math.log(GRID.FAR / GRID.NEAR);
const KERNEL_DIRS = MoonDisc.directions(MOON_DIR as number[], MoonDisc.RADIUS, MoonDisc.KERNEL_MAX);

const layerOf = (iz: number): number => GRID.DEEP + iz;

function node(ix: number, iy: number, iz: number): number[] {
  const z = GRID.NEAR * Math.exp((iz / (GRID.DEEP - 1)) * LOG), gy = iy / (GRID.UP - 1);
  return [((ix / (GRID.ACROSS - 1)) * 2 - 1) * GRID.SPAN * z, gy * gy * GRID.TOP, -z];
}

function nodeLod(ix: number, iy: number, iz: number): number {
  const z = GRID.NEAR * Math.exp((iz / (GRID.DEEP - 1)) * LOG), gy = iy / (GRID.UP - 1), y = gy * gy * GRID.TOP;
  const up = (2 * Math.sqrt(Math.max(y, 0) * GRID.TOP)) / (GRID.UP - 1);
  const size = Math.max(Math.max((2 * GRID.SPAN * z) / (GRID.ACROSS - 1), up), (z * LOG) / (GRID.DEEP - 1));
  return Math.max(Math.log2(Math.max(size * 128, 1e-6)), 8);
}

function density(p: number[], strength: number, read: Read, lod: number): number {
  return StaticMist.baseDensity(p[1]!, MIST_HEIGHT, strength, StaticMist.meanOne(StaticMist.baseNoise(p, read, lod), lod, 0));
}

function through(p: number[], dir: number[], strength: number, read: Read, lod: number): number {
  let sum = 0;
  for (let i = 0; i < PLACES; i++) {
    const s = (LENGTH * (i + 0.5)) / PLACES;
    sum += density([p[0]! + dir[0]! * s, p[1]! + dir[1]! * s, p[2]! + dir[2]! * s], strength, read, lod);
  }
  return Math.exp(-(sum / PLACES) * LENGTH);
}

function cell(strength: number, read: Read, ix: number, iy: number, iz: number): number[] {
  const p = node(ix, iy, iz), lod = nodeLod(ix, iy, iz);
  let moon = 0;
  for (let k = 0; k < MoonDisc.KERNEL; k++) {
    moon += through(p, [KERNEL_DIRS[3 * k]!, KERNEL_DIRS[3 * k + 1]!, KERNEL_DIRS[3 * k + 2]!], strength, read, lod);
  }
  return [through(p, [0, 1, 0], strength, read, lod), moon / MoonDisc.KERNEL];
}

const combine = (front: number[], base: number[]): number[] => [front[0]! * base[0]!, front[1]! * base[1]!];

class Schedule {
  bakes: number;
  baked: number | null;
  private sizeOwed: boolean;

  constructor() {
    this.bakes = 0;
    this.baked = null;
    this.sizeOwed = false;
  }

  event(kind: string): void {
    if (kind === "size") {
      this.sizeOwed = true;
    }
  }

  frame(strength: number, on: boolean): boolean {
    if (!on || !(strength > 0)) {
      return false;
    }
    if (this.baked === null || strength !== this.baked || this.sizeOwed) {
      this.baked = strength;
      this.sizeOwed = false;
      this.bakes++;
      return true;
    }
    return false;
  }
}

export const BaseMistShade = { GRID, LAYERS, PLACES, LENGTH, layerOf, node, nodeLod, density, through, cell, combine, Schedule };

M.BaseMistShade = BaseMistShade;
