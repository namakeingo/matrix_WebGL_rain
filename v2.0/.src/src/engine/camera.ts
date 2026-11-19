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
// The mirrored pass (the reflection's picture, larger than the view by a margin: models/reflectionframe.ts) has its own block of the same layout, made by mirrorUpdate from the view's: cViewProj
// with its clip x and y scaled by the view's size over the picture's (the same focal length in pixels), cScreen the picture's size (so rayOf and the pixel reads of the mirrored pass are in
// the picture's pixels), cUp.w the margin past the view across and cScreen.w down, in pixels (0 in the view's own block). bindMirror / bindView put one or the other on the block's binding point.
//
// The lens: `lens` {x, y} in device pixels (0 by default, on the prototype too) moves the image centre to (width / 2 + lens.x, height / 2 - lens.y) (cx(), cy(): positive y moves the
// picture up). A lens moves every depth by the same number of pixels (a point's pixel is cx() + f X / Z), so project, toScreen, rayAt and horizonY use the centre, the view-projection has the
// off-axis term (models/frame.ts) and the block holds it in cLens (floats 36 and 37 of its 40; the std140 block is the 36 floats of before, then one vec4). setLens(x, y) makes the camera dirty only
// when the lens changed. The mirrored pass's block carries the lens clamped to the picture's margin (ReflectionFrame.clampLens); the view's own is not clamped.
//
// Changelog:
// 2026-11-18: margin (the OLED margin, device pixels), setMargin, leftTan(), rightTan(); bottomAngle() and topAngle() are the margin's (the rain's world does not depend on the lens).
// 2026-11-18: bottomAngle() and topAngle() (the extended window's bottom and top rows' angles from the optical axis, exactly halfFov at margin 0); topAt follows the extended top row.
// 2026-11-18: the lens (lens, setLens, cx, cy; frameInput's lensX and lensY; the block 40 floats with cLens; the mirrored block carries the lens clamped to its margin).
// 2026-11-12: the mirrored pass's block (setMirror, mirrorUpdate, bindMirror, bindView): the view's with its clip x and y scaled for the larger picture (models/reflectionframe.ts), cScreen the picture's size, the margin in cUp.w and cScreen.w.
// 2026-11-12: EYE (the eye's resting height, for the spawn box); ceilingAt stays the world's ceiling (the rain's spawn plane is the spawn box's top: models/spawnbox.ts).
// 2026-11-10: update() makes its matrices and block with models/frame.ts's compute (one function; axes() too), and takes a worker's answer (offer) made for the same view inputs.
// 2026-11-09: the mouse parallax's offsets (yaw, pitchShift, eyeX, eyeShift), setParallax, baseVersion; the axes, project, toScreen, rayAt, topAt, the view matrix and the uniform block take them.
// 2026-11-04: TypeScript, a module of src/engine/ (was engine/camera.js).
// 2026-11-05: the Plane height setting removed (the camera looks level); its rotation code moved to engine/parallax.ts.
import { M } from "./core";
import { fill } from "./glsl";
import { Parallax } from "./parallax";
import { Frame } from "../models/frame";
import { ReflectionFrame } from "../models/reflectionframe";
import type { ReflectionFrameOf } from "../models/reflectionframe";
import type { FrameInput, FrameOutput } from "../models/frame";
import type { UniformBlock } from "./gl";
import CAMERA_SOURCE from "../shaders/camera/camera.glsl";

const EYE = 1.4;
const FIELD_OF_VIEW = 50;
const LOWEST_PLANE_HEIGHT = 5;

export class Camera {
  static FAR_DISTANCE: number;
  static GLSL: string;
  static SPAN: number;
  static EYE: number;
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
  // the image centre's shift in device pixels (x right, y up), 0 by default
  lens: { x: number; y: number };
  // the OLED margin in device pixels (0 by default, on the prototype too): the rain's floor line, top and spawn box are the window extended by it, whatever the lens
  margin: number;
  // the base as of the last update (a change of it moves baseVersion)
  baseKey: number[];
  // an answer a worker made for the frame (offer), taken by the next update when its input is the frame's own
  answered: { input: FrameInput; output: FrameOutput } | null;
  own: FrameOutput;
  // the answers taken (for the tests)
  taken: number;
  height: number;
  width: number;
  far: number;
  near: number;
  fieldOfView: number;
  eyeHeight: number;
  gl: WebGL2RenderingContext;
  // the mirrored picture's frame (its margin), the view-projection and the 40 floats of the block it is drawn with, the block's buffer (made at the first bindMirror), and the
  // version of the camera and of the frame they were made for
  mirrorFrame: ReflectionFrameOf;
  mirrorViewProjection: Float32Array<ArrayBuffer>;
  // the lens the mirrored block carries (clamped to the margin) and the view-projection adjusted to it when the clamp changed it
  mirrorLens: number[];
  mirrorAdjusted: Float32Array<ArrayBuffer>;
  mirrorData: Float32Array<ArrayBuffer>;
  mirrorBlock: UniformBlock | null;
  mirrorFor: number;
  mirrorForStamp: number;
  mirrorStamp: number;
  // the inputs the quality jobs take (the larger frustum's view-projection and size), filled in place by mirrorUpdate
  mirrorView: { viewProjection: Float32Array; width: number; height: number };
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.mirrorFrame = ReflectionFrame.of(1, 1, 0);
    this.mirrorViewProjection = new Float32Array(16);
    this.mirrorLens = [0, 0];
    this.mirrorAdjusted = new Float32Array(16);
    this.mirrorData = new Float32Array(40);
    this.mirrorBlock = null;
    this.mirrorFor = -1;
    this.mirrorForStamp = -1;
    this.mirrorStamp = 0;
    this.mirrorView = { viewProjection: this.mirrorViewProjection, width: 1, height: 1 };
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
    this.lens = { x: 0, y: 0 };
    this.margin = 0;
    this.baseKey = [];
    this.answered = null;
    this.taken = 0;
    this.viewProjection = new Float32Array(16);
    this.view = new Float32Array(16);
    this.projection = new Float32Array(16);
    // (std140: the matrix, then eye + focal, forward + near, right + far, up, screen, lens)
    this.ubo = new M.UniformBlock(gl, "Camera", 40);
    this.own = { view: this.view, projection: this.projection, viewProjection: this.viewProjection, block: this.ubo.data, step: 0 };
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

  // the inputs of the matrices and the block (models/frame.ts's compute) as they stand, at a size when given (the frame's fork asks before applySize has set it) and with the step
  // clock's inputs when given (the frame's step is computed with the matrices; the camera's own update does not use it)
  frameInput(width = this.width, height = this.height, clock?: { base: number; from: number; rate: number }, time = 0): FrameInput {
    return {
      width,
      height,
      pitch: this.pitch,
      eyeHeight: this.eyeHeight,
      yaw: this.yaw,
      pitchShift: this.pitchShift,
      eyeX: this.eyeX,
      eyeShift: this.eyeShift,
      lensX: this.lens.x,
      lensY: this.lens.y,
      margin: this.margin,
      near: this.near,
      far: this.far,
      halfFov: this.halfFov(),
      base: clock ? clock.base : 0,
      from: clock ? clock.from : 0,
      rate: clock ? clock.rate : 1,
      time,
    };
  }

  // an answer made by a worker for the frame: update() uses it when its view inputs are the camera's own then, else makes the values itself
  offer(answer: { input: FrameInput; output: FrameOutput }) {
    this.answered = answer;
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

  // the lens (the camera is dirty only when it changed; the lens object is the camera's own, never the prototype's)
  setLens(x: number, y: number) {
    if (x !== this.lens.x || y !== this.lens.y) {
      this.lens = { x, y };
      this.dirty = true;
    }
  }

  // the OLED margin (the camera is dirty only when it changed): the OLED Pixel Shift limit, the most the lens can ever move the picture
  setMargin(m: number) {
    if (m !== this.margin) {
      this.margin = m;
      this.dirty = true;
    }
  }

  // the image centre in pixels from the top left: the window's centre moved by the lens
  cx() {
    return this.width / 2 + this.lens.x;
  }

  cy() {
    return this.height / 2 - this.lens.y;
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
    return Frame.axes(this.tilt(), this.yaw);
  }

  // where a place of the world is on the screen (pixels from the top left)
  toScreen(x: number, y: number, z: number) {
    const a = this.axes();
    const rel = [x - this.eyeX, y - this.eyeY(), z];
    const along = Camera.dot(rel, a.forward);
    const f = this.focal();
    return [this.cx() + (Camera.dot(rel, a.right) * f) / along, this.cy() - (Camera.dot(rel, a.up) * f) / along];
  }

  // where a place of the world is on the screen, into out: x and y (pixels from the top left)
  // and its distance along the view (no allocation)
  project(x: number, y: number, z: number, out: number[]) {
    const f = this.focal();
    const centreX = this.cx();
    const centreY = this.cy();
    const p = this.tilt();
    const c = Math.cos(p);
    const s = Math.sin(p);
    const ry = y - this.eyeY();
    if (this.yaw === 0) {
      const rx = x - this.eyeX;
      const along = ry * s - z * c;
      out[0] = centreX + (rx * f) / along;
      out[1] = centreY - ((ry * c + z * s) * f) / along;
      out[2] = along;
      return;
    }
    const rx = x - this.eyeX;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const along = rx * c * sy + ry * s - z * c * cy;
    out[0] = centreX + ((rx * cy + z * sy) * f) / along;
    out[1] = centreY - ((-rx * s * sy + ry * c + z * s * cy) * f) / along;
    out[2] = along;
  }

  // the height of the top of the window extended by the margin at a distance ahead (-z): where the ray through its top
  // row's centre column is there (a yaw stretches the ray's way to the depth by 1 / cos(yaw))
  topAt(distance: number) {
    const rise = distance * Math.tan(this.tilt() + this.topAngle());
    return this.eyeY() + (this.yaw === 0 ? rise : rise / Math.cos(this.yaw));
  }

  // the angles from the optical axis of the bottom and top rows of the window extended by the OLED margin (exactly halfFov at margin 0), whatever the lens: the rain covers every row the
  // pixel shift can reveal and its world does not move with the shift
  bottomAngle() {
    return Frame.edgeAngle(this.halfFov(), this.height, this.margin);
  }

  topAngle() {
    return Frame.edgeAngle(this.halfFov(), this.height, this.margin);
  }

  // the tangents of the horizontal angles of the extended window's left and right columns, (width / 2 + margin) / f (exactly (width / height) x tan(halfFov), the box's own, at margin 0)
  leftTan() {
    return this.margin === 0 ? (this.width / this.height) * Math.tan(this.halfFov()) : (this.width / 2 + this.margin) / this.focal();
  }

  rightTan() {
    return this.leftTan();
  }

  // the direction of the ray from the eye through a point of the screen
  rayAt(px: number, py: number) {
    const a = this.axes();
    const u = (px - this.cx()) / this.focal();
    const v = (this.cy() - py) / this.focal();
    const d = [0, 1, 2].map((k) => a.forward[k] + u * a.right[k] + v * a.up[k]);
    const length = Math.hypot(d[0], d[1], d[2]);
    return d.map((c) => c / length);
  }

  // the row of the horizon, in pixels from the top
  horizonY() {
    return this.cy() + this.focal() * Math.tan(this.tilt());
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
      this.answered = null;
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
    // (the matrices and the block: models/frame.ts's compute, the one function; an answer a worker made under this very input is copied in, else it is made here, in place)
    const input = this.frameInput();
    const answered = this.answered;
    this.answered = null;
    if (answered && Frame.sameView(answered.input, input)) {
      this.taken++;
      this.view.set(answered.output.view);
      this.projection.set(answered.output.projection);
      this.viewProjection.set(answered.output.viewProjection);
      this.ubo.data.set(answered.output.block);
    } else {
      const own = this.own;
      own.view = this.view;
      own.projection = this.projection;
      own.viewProjection = this.viewProjection;
      own.block = this.ubo.data;
      Frame.compute(input, own);
    }
    this.ubo.upload();
  }

  // the mirrored picture's frame for a margin (a fraction of the view's size, each side); a different frame makes the mirrored values again
  setMirror(margin: number) {
    const f = this.mirrorFrame;
    if (f.viewWidth !== this.width || f.viewHeight !== this.height || f.marginX !== Math.round(margin * this.width) || f.marginY !== Math.round(margin * this.height)) {
      this.mirrorFrame = ReflectionFrame.of(this.width, this.height, margin);
      this.mirrorStamp++;
    }
  }

  // the mirrored pass's values for the camera as it stands (after update()): the view's block with the clip x and y scaled and the picture's size, and the view-projection and
  // size the quality jobs take; made again only when the camera or the frame changed
  mirrorUpdate() {
    if (this.mirrorFor === this.version && this.mirrorForStamp === this.mirrorStamp) {
      return;
    }
    this.mirrorFor = this.version;
    this.mirrorForStamp = this.mirrorStamp;
    const f = this.mirrorFrame;
    const d = this.mirrorData;
    d.set(this.ubo.data);
    // the lens the picture carries: the view's, clamped to the picture's margin; the view-projection takes the difference (the off-axis term of the clamped lens instead of the view's)
    const lens = ReflectionFrame.clampLens(f, this.lens.x, this.lens.y, this.mirrorLens);
    let source = this.viewProjection;
    if (lens[0] !== this.lens.x || lens[1] !== this.lens.y) {
      const adjusted = this.mirrorAdjusted;
      const offX = (2 * (lens[0] - this.lens.x)) / this.width;
      const offY = (2 * (lens[1] - this.lens.y)) / this.height;
      for (let c = 0; c < 4; c++) {
        adjusted[c * 4] = source[c * 4] + offX * source[c * 4 + 3];
        adjusted[c * 4 + 1] = source[c * 4 + 1] + offY * source[c * 4 + 3];
        adjusted[c * 4 + 2] = source[c * 4 + 2];
        adjusted[c * 4 + 3] = source[c * 4 + 3];
      }
      source = adjusted;
    }
    ReflectionFrame.scaleViewProjection(source, f, this.mirrorViewProjection);
    d.set(this.mirrorViewProjection, 0);
    d[36] = lens[0];
    d[37] = lens[1];
    d[31] = f.marginX;
    d[32] = f.width;
    d[33] = f.height;
    d[35] = f.marginY;
    this.mirrorView.width = f.width;
    this.mirrorView.height = f.height;
    const block = this.mirrorBlock;
    if (block) {
      block.data.set(d);
      block.upload();
    }
  }

  // the Camera block's binding point on the mirrored pass's block (made here the first time), and back on the view's
  bindMirror() {
    const gl = this.gl;
    let block = this.mirrorBlock;
    if (!block) {
      block = this.mirrorBlock = new M.UniformBlock(gl, "Camera", 40);
      block.data.set(this.mirrorData);
      block.upload();
    }
    gl.bindBufferBase(gl.UNIFORM_BUFFER, M.BLOCKS.Camera, block.buffer);
  }

  bindView() {
    const gl = this.gl;
    gl.bindBufferBase(gl.UNIFORM_BUFFER, M.BLOCKS.Camera, this.ubo.buffer);
  }

  destroy() {
    this.ubo.destroy();
    if (this.mirrorBlock) {
      this.mirrorBlock.destroy();
    }
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
Camera.prototype.lens = { x: 0, y: 0 };
Camera.prototype.margin = 0;
Camera.prototype.baseVersion = 0;
Camera.SPAN = 1.0;
Camera.EYE = EYE;
// a distance for nothing seen there (the farthest a half float holds)
Camera.FAR_DISTANCE = 65504;
Camera.HIGHEST_PITCH = Parallax.pitchFor(LOWEST_PLANE_HEIGHT, Camera.halfFov());

Camera.GLSL = fill(CAMERA_SOURCE, { "Camera.FAR_DISTANCE.toFixed(1)": Camera.FAR_DISTANCE.toFixed(1) });

M.Camera = Camera;
