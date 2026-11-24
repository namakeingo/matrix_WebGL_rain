// The base mist's shade grid on the CPU (Feature P1, story M7b; units.ui.basemistcpu.ts): the base layers of the fog's shade texture (the layers 96..191 of the GPU's, shaders/fog/basemist_shade_head.glsl) baked by the CPU model
// M.BaseMistShade over the CPU noise (M.NoiseField), so that the base mist's worker reads nothing back from the GPU. Pure, no GL, no page, importable in any thread (workers/baseshadeworker.ts bakes it in bands).
// - LENGTH: 128 x 64 x 96 x 2 halves, index ((z 64 + y) 128 + x) 2 + c (z the base layer 0..95: the texture's layer 96 + z; c 0 the sky's shade, 1 the Orb's)
// - inputOf(stretch, strength, front?): { stretch, strength, front? { sigma, time, tail, tailScale } }; stretch the noise's (M.FogMist.NOISE_STRETCH), strength the base's extinction the GPU's grid was baked with (M.BaseMistShade
//   Schedule.baked); front, when given, makes buildFront possible (the front cloud's layers, at that time: the test switch Fog.baseFrontShade)
// - build(input, out, from, to): the base layers [from, to) into out: at their absolute place when out holds the whole grid (LENGTH), else from the start of out (a band's own array); the other layers are untouched
// - buildFront(input, out, from, to): the same for the front layers (M.QualityFogShade.bake over the noise's levels 3..7, the front's sigma, time and profile)
// - Version: event(kind) -> the version, bumped by one on 'start', 'strength' (the base's strength changed) and 'size' and on nothing else: the grid is baked once per those events
//
// Changelog:
// 2026-11-23: prepare(stretch): the noise generated before the first band (a worker's warm message).
// 2026-11-23: new (Feature P1, story M7b).
import { M } from "../engine/core";
import { NoiseField } from "./noisefield";
import { BaseMistJob } from "./basemistjob";
import { BaseMistShade } from "./basemistshade";
import { QualityFogShade } from "./quality/fogshade";

export interface BaseShadeFront {
  sigma: number;
  time: number;
  tail: number;
  tailScale: number;
}

export interface BaseShadeInput {
  stretch: number;
  strength: number;
  front?: BaseShadeFront;
  // the layers a job covers (the worker's): [from, to)
  layers?: number[];
}

const ACROSS = 128;
const UP = 64;
const DEEP = 96;
const PLANE = ACROSS * UP * 2;
const LENGTH = PLANE * DEEP;

const kept: { stretch: number; read: ((q: number[], lod: number) => number) | null; packed: Float32Array | null } = { stretch: NaN, read: null, packed: null };

// the noise's reader and the packed levels 3..7 of a stretch (made once, with the thread's noise)
function noiseOf(stretch: number): { read: (q: number[], lod: number) => number; packed: Float32Array } {
  if (kept.stretch !== stretch || kept.read === null || kept.packed === null) {
    const bytes = NoiseField.bytes(stretch), levels: Uint8Array[] = [];
    let at = 0;
    for (let l = 0; l <= QualityFogShade.MIP_LAST; l++) {
      const n = Math.pow(128 >> l, 3);
      if (l >= QualityFogShade.MIP_FROM) {
        levels.push(bytes.slice(at, at + n));
      }
      at += n;
    }
    kept.stretch = stretch;
    kept.read = BaseMistJob.readerOf(bytes);
    kept.packed = QualityFogShade.packMips(levels);
  }
  return { read: kept.read, packed: kept.packed };
}

// the noise made and kept for a stretch (the warm handler of the baseshade worker)
function prepare(stretch: number): void {
  noiseOf(stretch);
}

function inputOf(stretch: number, strength: number, front?: BaseShadeFront): BaseShadeInput {
  const input: BaseShadeInput = { stretch, strength };
  if (front) {
    input.front = front;
  }
  return input;
}

function build(input: BaseShadeInput, out: Uint16Array, from: number, to: number): void {
  const { read } = noiseOf(input.stretch), absolute = out.length >= LENGTH;
  for (let iz = from; iz < to; iz++) {
    const base = ((absolute ? iz : iz - from) * UP) * ACROSS * 2;
    for (let iy = 0; iy < UP; iy++) {
      for (let ix = 0; ix < ACROSS; ix++) {
        const cell = BaseMistShade.cell(input.strength, read, ix, iy, iz), at = base + (iy * ACROSS + ix) * 2;
        out[at] = BaseMistJob.halfOf(cell[0]!);
        out[at + 1] = BaseMistJob.halfOf(cell[1]!);
      }
    }
  }
}

function buildFront(input: BaseShadeInput, out: Uint16Array, from: number, to: number): void {
  const f = input.front;
  if (!f) {
    throw new Error("BaseShadeGrid.buildFront: no front profile given");
  }
  const { packed } = noiseOf(input.stretch), absolute = out.length >= LENGTH;
  QualityFogShade.bake(packed, f.sigma, f.time, out.subarray(absolute ? from * PLANE : 0), from, to, 0, ACROSS, UP, QualityFogShade.MOON_KERNEL, 0, { tail: f.tail, scale: f.tailScale });
}

// the grid's version: baked once per start, strength change and size change
class Version {
  version = 0;

  event(kind: string): number {
    if (kind === "start" || kind === "strength" || kind === "size") {
      this.version++;
    }
    return this.version;
  }
}

export const BaseShadeGrid = { prepare, LENGTH, PLANE, LAYERS: DEEP, inputOf, build, buildFront, Version };

M.BaseShadeGrid = BaseShadeGrid;
