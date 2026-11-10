// Floor: the height of the floor at a distance ahead, pure. The rain falls to it and a strike's foot
// stands on it.
// - "water": the water's surface, y = 0 at every distance.
// - "screen" (the water off, models/waterstate.ts): the bottom of the screen at that distance, where
//   the ray through the screen's bottom row is there: eye - distance x tan(halfFov - pitch), a
//   distance along the view's horizontal (-z), the pitch positive looking up. It is above y = 0
//   nearer than eye / tan(halfFov) (3.0 m level) and below it further.
//
// Changelog:
// 2026-11-05: new.
import { M } from "../engine/core";

export type FloorKind = "water" | "screen";

// the view a screen floor is worked out in (the water's ignores all but the kind)
export interface FloorView {
  kind: FloorKind;
  eyeHeight: number;
  pitch: number;
  halfFov: number;
}

const WATER_Y = 0;

function heightAt(kind: FloorKind, distance: number, eyeHeight: number, halfFov: number, pitch: number): number {
  return kind === "screen" ? eyeHeight - distance * Math.tan(halfFov - pitch) : WATER_Y;
}

export const Floor = { WATER_Y, heightAt };

M.Floor = Floor;
