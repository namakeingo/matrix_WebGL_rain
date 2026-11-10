// Parallax: tilting the camera (INCOMPLETE: not driven by any setting yet). The camera's pitch for a
// Plane height, the percentage of the screen the horizon is above its bottom: the camera looks up by
// atan((0.5 - height / 100) x 2 x tan(half the field of view)), so the horizon is (100 - height)% down the
// screen, 50 giving a level view. The Plane height setting is gone (the camera looks level), and this is
// what the Mouse parallax settings (not implemented) are to move the view with. The rest of the code
// reads the camera's pitch only, so a tilted view is ready: the camera's axes, projection, ceiling and
// horizon all take it into account, and the tests tilt it through the test API.
//
// Changelog:
// 2026-11-05: new, the rotation code of the Plane height setting moved out of engine/camera.ts.
import { M } from "./core";
import type { Camera } from "./camera";

export const Parallax = {
  // the pitch (radians, up positive) for a horizon (100 - height)% down a screen of that half field of view
  pitchFor(height: number, halfFov: number): number {
    return Math.atan((0.5 - height / 100) * 2 * Math.tan(halfFov));
  },
  // tilts a camera so the horizon is (100 - height)% down the screen
  apply(camera: Camera, height: number): void {
    camera.pitch = Parallax.pitchFor(height, camera.halfFov());
    camera.dirty = true;
  },
};

M.Parallax = Parallax;
