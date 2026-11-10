// The camera: the eye 1.4 m above the water (y = 0), looking along -z, a field of view of 50°
// from the bottom of the screen to the top, looking level (the horizon half way down the screen;
// engine/parallax.ts tilts it). A distance along the water is -z. Its values reach the shaders in
// the uniform block "Camera", sent only when they changed.
// The world does not depend on the camera: Camera.SPAN is the world's width (x / distance) the
// rain, the waves and the strikes are laid out in, wide enough for any screen up to 21:9 (a view
// of x / distance 0.98 at the screen's edge), and Camera.HIGHEST_PITCH the most it can look up
// (Parallax's 5% horizon height), so whatever the view the world is the same.
//
// The mouse parallax moves the view with four offsets, all 0 by default (then every value is what it was without them): `yaw` (radians, turning right positive, about the
// vertical, applied after the pitch), `pitchShift` (radians, added to the pitch: the rotation mode), `eyeX` and `eyeShift` (metres, added to the eye's place (0, eyeHeight, 0):
// the translation mode). setParallax() sets them; `version` goes up on any change of the view, `baseVersion` only on a change of the base (the size, the pitch, the eye's height),
// so what depends on the base alone (a strike's shape) is not made again as the parallax moves. tilt() is the pitch with its shift, eyeY() the eye's height with its shift.
//
// Changelog:
// 2026-11-09: the mouse parallax's offsets (yaw, pitchShift, eyeX, eyeShift), setParallax, baseVersion; the axes, project, toScreen, rayAt, topAt, the view matrix and the uniform block take them.
// 2026-11-04: TypeScript, a module of src/engine/ (was engine/camera.js).
// 2026-11-05: the Plane height setting removed (the camera looks level); its rotation code moved to engine/parallax.ts.
import { M } from "./core";
import { fill } from "./glsl";
import { Parallax } from "./parallax";
import type { UniformBlock } from "./gl";
import CAMERA_SOURCE from "../shaders/camera/camera.glsl";

const EYE = 1.4;
const FIELD_OF_VIEW = 50;
const LOWEST_PLANE_HEIGHT = 5;

export class Camera {
  static FAR_DISTANCE: number;
  static GLSL: string;
  static SPAN: number;
  static HIGHEST_PITCH: number;
  ubo: UniformBlock;
  projection: Float32Array<ArrayBuffer>;
  view: Float32Array<ArrayBuffer>;
  viewProjection: Float32Array<ArrayBuffer>;
  version: number;
  baseVersion: number;
  dirty: boolean;
  pitch: number;
  yaw: number;
  pitchShift: number;
  eyeX: number;
  eyeShift: number;
  // the base as of the last update (a change of it moves baseVersion)
  baseKey: number[];
  height: number;
  width: number;
  far: number;
  near: number;
  fieldOfView: number;
  eyeHeight: number;
  gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.eyeHeight = EYE;
    this.fieldOfView = FIELD_OF_VIEW;
    this.near = 0.05;
    this.far = 500;
    this.width = 800;
    this.height = 600;
    this.pitch = 0;
    this.dirty = true;
    // (one more each time its values change: what depends on the view knows to make itself again)
    this.version = 0;
    this.baseVersion = 0;
    this.yaw = 0;
    this.pitchShift = 0;
    this.eyeX = 0;
    this.eyeShift = 0;
    this.baseKey = [];
    this.viewProjection = new Float32Array(16);
    this.view = new Float32Array(16);
    this.projection = new Float32Array(16);
    // (std140: the matrix, then eye + focal, forward + near, right + far, up, screen)
    this.ubo = new M.UniformBlock(gl, "Camera", 36);
  }

  static halfFov() {
    return (FIELD_OF_VIEW * Math.PI) / 360;
  }

  halfFov() {
    return Camera.halfFov();
  }

  // the focal length in pixels
  focal() {
    return this.height / 2 / Math.tan(this.halfFov());
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.dirty = true;
  }

  // the mouse parallax's offsets (the camera is dirty only when one changed)
  setParallax(yaw: number, pitchShift: number, eyeX: number, eyeShift: number) {
    if (yaw !== this.yaw || pitchShift !== this.pitchShift || eyeX !== this.eyeX || eyeShift !== this.eyeShift) {
      this.yaw = yaw;
      this.pitchShift = pitchShift;
      this.eyeX = eyeX;
      this.eyeShift = eyeShift;
      this.dirty = true;
    }
  }

  // the pitch with the rotation mode's shift, and the eye's height with the translation mode's
  tilt() {
    return this.pitch + this.pitchShift;
  }

  eyeY() {
    return this.eyeHeight + this.eyeShift;
  }

  // the axes of the view: the pitch, then the yaw about the vertical (turning right: forward towards +x)
  axes() {
    const p = this.tilt();
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    if (this.yaw === 0) {
      return { right: [1, 0, 0], up: [0, cp, sp], forward: [0, sp, -cp] };
    }
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    return { right: [cy, 0, sy], up: [-sp * sy, cp, sp * cy], forward: [cp * sy, sp, -cp * cy] };
  }

  // where a place of the world is on the screen (pixels from the top left)
  toScreen(x: number, y: number, z: number) {
    const a = this.axes();
    const rel = [x - this.eyeX, y - this.eyeY(), z];
    const along = Camera.dot(rel, a.forward);
    const f = this.focal();
    return [this.width / 2 + (Camera.dot(rel, a.right) * f) / along, this.height / 2 - (Camera.dot(rel, a.up) * f) / along];
  }

  // where a place of the world is on the screen, into out: x and y (pixels from the top left)
  // and its distance along the view (no allocation)
  project(x: number, y: number, z: number, out: number[]) {
    const f = this.focal();
    const p = this.tilt();
    const c = Math.cos(p);
    const s = Math.sin(p);
    const ry = y - this.eyeY();
    if (this.yaw === 0) {
      const rx = x - this.eyeX;
      const along = ry * s - z * c;
      out[0] = this.width / 2 + (rx * f) / along;
      out[1] = this.height / 2 - ((ry * c + z * s) * f) / along;
      out[2] = along;
      return;
    }
    const rx = x - this.eyeX;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const along = rx * c * sy + ry * s - z * c * cy;
    out[0] = this.width / 2 + ((rx * cy + z * sy) * f) / along;
    out[1] = this.height / 2 - ((-rx * s * sy + ry * c + z * s * cy) * f) / along;
    out[2] = along;
  }

  // the height of the top of the view at a distance ahead (-z): where the ray through the top
  // row of the screen's centre is there (a yaw stretches the ray's way to the depth by 1 / cos(yaw))
  topAt(distance: number) {
    const rise = distance * Math.tan(this.tilt() + this.halfFov());
    return this.eyeY() + (this.yaw === 0 ? rise : rise / Math.cos(this.yaw));
  }

  // the direction of the ray from the eye through a point of the screen
  rayAt(px: number, py: number) {
    const a = this.axes();
    const u = (px - this.width / 2) / this.focal();
    const v = (this.height / 2 - py) / this.focal();
    const d = [0, 1, 2].map((k) => a.forward[k] + u * a.right[k] + v * a.up[k]);
    const length = Math.hypot(d[0], d[1], d[2]);
    return d.map((c) => c / length);
  }

  // the row of the horizon, in pixels from the top
  horizonY() {
    return this.height / 2 + this.focal() * Math.tan(this.tilt());
  }

  // the height of the top of the highest view (the horizon 5% up the screen) at a distance along the
  // water: the world's ceiling there, whatever the camera
  static ceilingAt(distance: number) {
    return EYE + distance * Math.tan(Camera.HIGHEST_PITCH + Camera.halfFov());
  }

  // the distance along the water where the bottom of the screen meets it, looking ahead (the
  // nearest the camera ever sees the water)
  static nearestWater() {
    return EYE / Math.tan(Camera.halfFov());
  }

  // its values for the shaders, when they changed
  update() {
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    this.version++;
    const key = this.baseKey;
    if (key[0] !== this.pitch || key[1] !== this.eyeHeight || key[2] !== this.width || key[3] !== this.height) {
      key[0] = this.pitch;
      key[1] = this.eyeHeight;
      key[2] = this.width;
      key[3] = this.height;
      this.baseVersion++;
    }
    const eyeY = this.eyeY();
    const f = 1 / Math.tan(this.halfFov());
    const aspect = this.width / this.height;
    const a = this.axes();
    const rows = [a.right, a.up, a.forward.map((c) => -c)];
    const view = this.view;
    view.fill(0);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        view[c * 4 + r] = rows[r][c];
      }
      view[12 + r] = -(rows[r][0] * this.eyeX + rows[r][1] * eyeY);
    }
    view[15] = 1;
    const n = this.near;
    const far = this.far;
    const proj = this.projection;
    proj.fill(0);
    proj[0] = f / aspect;
    proj[5] = f;
    proj[10] = (far + n) / (n - far);
    proj[11] = -1;
    proj[14] = (2 * far * n) / (n - far);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          s += proj[k * 4 + row] * view[col * 4 + k];
        }
        this.viewProjection[col * 4 + row] = s;
      }
    }
    const d = this.ubo.data;
    d.set(this.viewProjection, 0);
    d[16] = this.eyeX;
    d[17] = eyeY;
    d[18] = 0;
    d[19] = this.focal();
    d.set(a.forward, 20);
    d[23] = this.near;
    d.set(a.right, 24);
    d[27] = this.far;
    d.set(a.up, 28);
    d[31] = 0;
    d[32] = this.width;
    d[33] = this.height;
    d[34] = Math.tan(this.halfFov() - this.tilt());
    this.ubo.upload();
  }

  destroy() {
    this.ubo.destroy();
  }

  static dot(a: ArrayLike<number>, b: ArrayLike<number>) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
}

// (the offsets are 0 on the prototype too: a bare view made from it, as the bolt's worker and the tests do, has none of its own)
Camera.prototype.yaw = 0;
Camera.prototype.pitchShift = 0;
Camera.prototype.eyeX = 0;
Camera.prototype.eyeShift = 0;
Camera.prototype.baseVersion = 0;
Camera.SPAN = 1.0;
// a distance for nothing seen there (the farthest a half float holds)
Camera.FAR_DISTANCE = 65504;
Camera.HIGHEST_PITCH = Parallax.pitchFor(LOWEST_PLANE_HEIGHT, Camera.halfFov());

Camera.GLSL = fill(CAMERA_SOURCE, { "Camera.FAR_DISTANCE.toFixed(1)": Camera.FAR_DISTANCE.toFixed(1) });

M.Camera = Camera;
