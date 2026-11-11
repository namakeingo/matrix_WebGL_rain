// Frame: the camera's numbers of a frame as a pure function (no GL, no page: it runs in a worker too, workers/frameworker.ts). Its input carries all its state: the camera's inputs (the
// size, the pitch, the eye's height, the mouse parallax's four offsets, the near and far planes, the half field of view) and the step clock's (base, from, rate) with the time. Its
// output is the view, projection and view-projection matrices, the 36 floats of the "Camera" uniform block (std140: the matrix, then eye + focal, forward + near, right + far, up,
// screen) and the clock's step. Camera.update() makes its values with it (into its own arrays) and takes an answer made by a worker for the same input; the output is the
// function's, value for value, wherever it ran.
// axes() is the view's axes: the pitch, then the yaw about the vertical (turning right: forward towards +x).
//
// Changelog:
// 2026-11-10: new, from Camera.update() and StepClock.stepAt.
import { M } from "../engine/core";

export interface FrameInput {
  width: number;
  height: number;
  pitch: number;
  eyeHeight: number;
  yaw: number;
  pitchShift: number;
  eyeX: number;
  eyeShift: number;
  near: number;
  far: number;
  halfFov: number;
  // the step clock (engine/clock.ts): the steps at `from` and the rate, and the time
  base: number;
  from: number;
  rate: number;
  time: number;
}

export interface FrameOutput {
  view: Float32Array<ArrayBuffer>;
  projection: Float32Array<ArrayBuffer>;
  viewProjection: Float32Array<ArrayBuffer>;
  block: Float32Array<ArrayBuffer>;
  step: number;
}

const KEYS: (keyof FrameInput)[] = ["width", "height", "pitch", "eyeHeight", "yaw", "pitchShift", "eyeX", "eyeShift", "near", "far", "halfFov", "base", "from", "rate", "time"];

const VIEW_KEYS = 11;

function axes(tilt: number, yaw: number) {
  const cp = Math.cos(tilt);
  const sp = Math.sin(tilt);
  if (yaw === 0) {
    return { right: [1, 0, 0], up: [0, cp, sp], forward: [0, sp, -cp] };
  }
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return { right: [cy, 0, sy], up: [-sp * sy, cp, sp * cy], forward: [cp * sy, sp, -cp * cy] };
}

// the output made in `out`'s arrays when given (the camera's own), else in new ones
function compute(input: FrameInput, out?: FrameOutput): FrameOutput {
  const o = out || { view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16), block: new Float32Array(36), step: 0 };
  const tilt = input.pitch + input.pitchShift;
  const eyeY = input.eyeHeight + input.eyeShift;
  const f = 1 / Math.tan(input.halfFov);
  const aspect = input.width / input.height;
  const a = axes(tilt, input.yaw);
  const rows = [a.right, a.up, a.forward.map((c) => -c)];
  const view = o.view;
  view.fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      view[c * 4 + r] = rows[r][c];
    }
    view[12 + r] = -(rows[r][0] * input.eyeX + rows[r][1] * eyeY);
  }
  view[15] = 1;
  const n = input.near;
  const far = input.far;
  const proj = o.projection;
  proj.fill(0);
  proj[0] = f / aspect;
  proj[5] = f;
  proj[10] = (far + n) / (n - far);
  proj[11] = -1;
  proj[14] = (2 * far * n) / (n - far);
  const vp = o.viewProjection;
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += proj[k * 4 + row] * view[col * 4 + k];
      }
      vp[col * 4 + row] = s;
    }
  }
  const d = o.block;
  d.set(vp, 0);
  d[16] = input.eyeX;
  d[17] = eyeY;
  d[18] = 0;
  d[19] = input.height / 2 / Math.tan(input.halfFov);
  d.set(a.forward, 20);
  d[23] = input.near;
  d.set(a.right, 24);
  d[27] = input.far;
  d.set(a.up, 28);
  d[31] = 0;
  d[32] = input.width;
  d[33] = input.height;
  d[34] = Math.tan(input.halfFov - tilt);
  o.step = Math.floor(input.base + (input.time - input.from) * input.rate);
  return o;
}

function same(a: FrameInput, b: FrameInput): boolean {
  for (let i = 0; i < KEYS.length; i++) {
    if (a[KEYS[i]] !== b[KEYS[i]]) {
      return false;
    }
  }
  return true;
}

// the matrices' inputs alone (the first eleven keys, not the clock's): what an answer's matrices depend on
function sameView(a: FrameInput, b: FrameInput): boolean {
  for (let i = 0; i < VIEW_KEYS; i++) {
    if (a[KEYS[i]] !== b[KEYS[i]]) {
      return false;
    }
  }
  return true;
}

export const Frame = { compute, same, sameView, axes };

M.Frame = Frame;
