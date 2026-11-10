// RainLayout: the rain's layout and its restart as pure functions of their inputs, in typed
// arrays, with no GL and no page: run by the rain itself (effects/rain.ts) and by the scene's
// worker (workers/sceneworker.ts), the same arrays either way.
// - hashes(count, seed): the drops' four hashes each (the script's: WebGPU's compute shader works
//   out the same).
// - layout({ hashes, near, far, trail, spawn }): each drop's distance, speed, phase and rows (its
//   ceiling's and its trail's), and the wheel's size (a power of two more than the steps of the
//   slowest, longest fall): { layout (Float32Array, 4 a drop), slots }.
// - restartOf({ layout, slots, wanted, steady, lastStep, eyeHeight, pitch, halfFov }, into): a
//   clean screen at a step (each drop wanted shows from the first of its falls whose head comes
//   down past the top of the view), or with steady the settled rain; and the wheel of the drawn
//   drops' next landings after that step: { life (Uint32Array, 4 a drop: its first fall shown, the
//   fall it ends before, a fall it shows again from), slots (Int32Array: each slot's first drop),
//   nextInSlot (Int32Array), inWheel (Uint8Array), active, reach }. Into the arrays of `into` where
//   their sizes fit (no new ones), else new.
// - The floor (models/floor.ts): a layout and a restart take it as the water (y = 0, omitted: as it
//   always was) or the bottom of the screen at each drop's distance (the water off): a drop falls from
//   the world's ceiling at its distance to the floor there, its rows those between plus its trail;
//   headY(data, i, step, floor) is its head's height in the world.
// - A drop's fall in 32-bit integers (total, falls, landed, nextLanding): the rows fallen at a step
//   (step / 16) x speed + (step % 16) x speed / 16 + phase, exactly step x speed / 16, as the
//   shader.
// - compare(a, b): how many values of two arrays differ, and the first.
//
// Changelog:
// 2026-11-05: the floor (the water's, or the bottom of the screen's): layout, restartOf, headY.
// 2026-11-04: TypeScript, a module of src/models/ (was engine/rainlayout.js).
import { M } from "../engine/core";
import type { FloorKind, FloorView } from "./floor";

// a layout's inputs: the drops' hashes (4 a drop), the nearest and furthest distances (m), the
// trail's cells
export interface LayoutInput {
  hashes: ArrayLike<number>;
  near: number;
  far: number;
  trail: number;
  // the floor the drops fall to (omitted: the water, y = 0)
  floor?: FloorView;
  // the plane the falls start from, for React to music (omitted: the world's ceiling, whatever the camera): the top of the view (the eye's height, the pitch and the half
  // field of view), not turned: 0 distance from the view's top at the nearest distance and at the furthest
  spawn?: SpawnPlane;
}

export interface SpawnPlane {
  eyeHeight: number;
  pitch: number;
  halfFov: number;
}

// a layout: each drop's distance, speed, phase and rows, and the wheel's size
export interface LayoutResult {
  layout: Float32Array<ArrayBuffer>;
  slots: number;
}

// a restart's inputs: the layout, the wheel's size, the drops wanted, Steady start, the step, and
// the view (the eye's height, the pitch and the half field of view, radians)
export interface RestartParams {
  layout: ArrayLike<number>;
  slots: number;
  wanted: number;
  steady: boolean;
  lastStep: number;
  eyeHeight: number;
  pitch: number;
  halfFov: number;
  // the floor kind the layout was made for (omitted: the water)
  floor?: FloorKind;
}

// a restart's arrays (the lives, the wheel's slots, each drop's next in its slot, whether it is in
// the wheel)
export interface RestartArrays {
  life: Uint32Array;
  slots: Int32Array;
  nextInSlot: Int32Array;
  inWheel: Uint8Array;
}

// a restart: its arrays, the drops counted as falling and the ones drawn
export interface RestartResult extends RestartArrays {
  active: number;
  reach: number;
}

// two arrays compared: the values that differ, the first, and the two values there
export interface CompareResult {
  wrong: number;
  first: number;
  a: number;
  b: number;
}

// the pool (the most drops that can fall, whatever the settings and the window)
const COUNT = 65536;
const CELL = 0.03;
const SEED = 12345;
// the slowest speed, in sixteenths of a row a step
const SLOWEST = 9;
// no fall (a life's bound)
const NONE = 0xffffffff;

// the distance of a unit (0 to 1) between near and far, as many per square metre (the
// distance's density grows with it): the drops', and the strikes'
const distanceAt = (unit: number, near: number, far: number) => Math.sqrt(near * near + (far * far - near * near) * unit);

const hashes = (count: number, seed: number) => {
  const out = new Uint32Array(count * 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = M.hash((i + seed) >>> 0);
  }
  return out;
};

// the floor's height at a distance (0 for the water or no floor given)
const floorHeight = (floor: FloorView | undefined, distance: number): number => (floor ? M.Floor.heightAt(floor.kind, distance, floor.eyeHeight, floor.halfFov, floor.pitch) : 0);

const layout = ({ hashes: h, near, far, trail, floor, spawn }: LayoutInput): LayoutResult => {
  const tanTop = spawn ? Math.tan(spawn.pitch + spawn.halfFov) : 0;
  const data = new Float32Array(COUNT * 4);
  let most = 0;
  for (let i = 0; i < COUNT; i++) {
    const distance = distanceAt(h[i * 4 + 1] / 4294967296, near, far);
    data[i * 4] = distance;
    data[i * 4 + 1] = SLOWEST + Math.floor((h[i * 4 + 2] / 4294967296) * 8);
    data[i * 4 + 2] = Math.floor((h[i * 4 + 3] / 4294967296) * 65536);
    // (the spawn plane: the ceiling; with React to music the top of the view)
    const top = spawn ? spawn.eyeHeight + distance * tanTop : M.Camera.ceilingAt(distance);
    data[i * 4 + 3] = Math.ceil((top - floorHeight(floor, distance)) / CELL) + trail;
    most = Math.max(most, data[i * 4 + 3]);
  }
  let slots = 1;
  while (slots < Math.ceil((most * 16) / SLOWEST) + 2) {
    slots *= 2;
  }
  return { layout: data, slots };
};

// how far drop i has fallen at a step, counted in rows since the start (in 32 bits)
const total = (data: ArrayLike<number>, i: number, step: number): number => {
  const speed = data[i * 4 + 1];
  return (Math.floor(step / 16) * speed + (((step % 16) * speed) >>> 4) + data[i * 4 + 2]) >>> 0;
};

// the height of drop i's head in the world at a step: its rows down from the top of its fall, up from
// the floor at its distance (the water: y = 0)
const headY = (data: ArrayLike<number>, i: number, step: number, floor?: FloorView): number => {
  const rows = data[i * 4 + 3];
  const t = total(data, i, step);
  const head = t - Math.floor(t / rows) * rows;
  return (rows - 1 - head) * CELL + floorHeight(floor, data[i * 4]);
};

// its falls finished by a step (a fall finishes when its head reaches its lowest row)
const falls = (data: ArrayLike<number>, i: number, step: number): number => Math.floor((total(data, i, step) + 1) / data[i * 4 + 3]);

const landed = (data: ArrayLike<number>, i: number, step: number): boolean => step > 0 && falls(data, i, step) > falls(data, i, step - 1);

// the first step after `after` in which drop i lands
const nextLanding = (data: ArrayLike<number>, i: number, after: number): number => {
  const speed = data[i * 4 + 1];
  const rows = data[i * 4 + 3];
  const phase = data[i * 4 + 2];
  // (the row count it must reach, then the first step whose fall reaches it)
  const target = (falls(data, i, after) + 1) * rows - 1 - phase;
  let step = Math.max(after + 1, Math.ceil((target * 16) / speed));
  while (!landed(data, i, step)) {
    step++;
  }
  return step;
};

// the first of drop i's falls whose head comes down past the top of the view (the view's top at
// a distance: eyeHeight + distance x tan(top), top its angle above the horizon) from a step on:
// the fall now if its head is above the view, else the next
const firstFrom = (data: ArrayLike<number>, i: number, step: number, eyeHeight: number, tanTop: number, floorY = 0): number => {
  const rows = data[i * 4 + 3];
  const t = total(data, i, step);
  const cycle = Math.floor(t / rows);
  const head = (rows - 1 - (t - cycle * rows)) * CELL + floorY;
  return head > eyeHeight + data[i * 4] * tanTop ? cycle : cycle + 1;
};

const fits = <T extends ArrayLike<number>>(array: unknown, Type: new (length: number) => T, length: number): array is T => array instanceof Type && array.length === length;

const restartOf = (p: RestartParams, into: Partial<RestartArrays> = {}): RestartResult => {
  const data = p.layout;
  const life = fits(into.life, Uint32Array, COUNT * 4) ? into.life : new Uint32Array(COUNT * 4);
  const slots = fits(into.slots, Int32Array, p.slots) ? into.slots : new Int32Array(p.slots);
  const nextInSlot = fits(into.nextInSlot, Int32Array, COUNT) ? into.nextInSlot : new Int32Array(COUNT);
  const inWheel = fits(into.inWheel, Uint8Array, COUNT) ? into.inWheel : new Uint8Array(COUNT);
  const tanTop = Math.tan(p.pitch + p.halfFov);
  const floor: FloorView | undefined = p.floor === "screen" ? { kind: "screen", eyeHeight: p.eyeHeight, pitch: p.pitch, halfFov: p.halfFov } : undefined;
  for (let i = 0; i < COUNT; i++) {
    life[i * 4] = NONE;
    life[i * 4 + 1] = 0;
    life[i * 4 + 2] = NONE;
  }
  for (let i = 0; i < p.wanted; i++) {
    life[i * 4] = p.steady ? 0 : firstFrom(data, i, p.lastStep, p.eyeHeight, tanTop, floorHeight(floor, data[i * 4]));
    life[i * 4 + 1] = NONE;
    life[i * 4 + 2] = NONE;
  }
  slots.fill(-1);
  inWheel.fill(0);
  const mask = slots.length - 1;
  for (let i = 0; i < p.wanted; i++) {
    if (life[i * 4] === NONE) {
      continue;
    }
    const slot = nextLanding(data, i, p.lastStep) & mask;
    nextInSlot[i] = slots[slot];
    slots[slot] = i;
    inWheel[i] = 1;
  }
  return { life, slots, nextInSlot, inWheel, active: p.wanted, reach: p.wanted };
};

const compare = (a: ArrayLike<number>, b: ArrayLike<number>): CompareResult => {
  let wrong = 0;
  let first = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      wrong++;
      if (first < 0) {
        first = i;
      }
    }
  }
  if (a.length !== b.length) {
    wrong += Math.abs(a.length - b.length);
    first = first < 0 ? Math.min(a.length, b.length) : first;
  }
  return { wrong, first, a: first >= 0 ? a[first] : 0, b: first >= 0 ? b[first] : 0 };
};

export const RainLayout = { COUNT, CELL, SEED, SLOWEST, NONE, distanceAt, hashes, layout, restartOf, total, headY, falls, landed, nextLanding, firstFrom, compare };

M.RainLayout = RainLayout;
