// MouseParallax: the mouse parallax's model (pure: no GL, no page, no clock of its own: the time is given, in ms; importable in any thread; the parallax worker's model).
// The cursor's position (point: -1 to 1 across the window, y up) is followed with an exponential approach whose time constant is Parallax delay (0 to 1) times DELAY_SECONDS, an
// exact exponential so the position after a time is the same however the time is divided into steps (the frame rate does not matter), and is given as the camera's offsets in the mode
// chosen: "rotation" (yaw and pitch, radians) or "translation" (the eye's x and y, metres), the other mode's offsets 0. Movement = the cursor's position x Amount, in units where
// one unit is half of the largest safe movement of the mode (`limits`: the world's width and the window's aspect give them, limitsFor), so Amount 1 reaches half of the limit
// (REACH) and the default 0.5 a quarter of it. Without input nothing moves; leave() (the cursor left the window) sends the target back to the centre, which the view eases back to. The position settles
// exactly on its target (within SETTLED: snapped), after which step() reports no change: the camera is not touched once the view is still.
// - farFrom(a, b): whether two sets of the camera's offsets ({ yaw, pitchShift, eyeX, eyeShift }) differ by more than TOLERANCE (yaw and pitch 0.004 rad, the eye 0.03 m, any one of them):
//   what the fog's volume and shade, built for the view of a time, tolerate before they are built again.
// - seed(x, y): the position and its target put at (x, y) at once (a model taking over from another, mid-movement: the view does not jump).
// - reset(): the position, its target and every offset back to 0, the clock forgotten (Mouse parallax off: nothing is left of the cursor's last place).
// - step(now): follows the target to `now` (ms; the first call only takes the time); true when an offset changed since the last step.
// - limitsFor({ span, aspect, halfFov, near, highestPitch }): the yaw limit atan(span) - atan(tan(halfFov) x aspect) (the view's edge stays inside the world's width; not under 0), the
//   pitch limit the yaw limit's (the same angle moves the picture by the same number of pixels along both axes: balanced) but not over highestPitch (the highest view the world's ceiling covers), the eye's x limit (span - tan(halfFov) x aspect) x near (the view's edge at the nearest distance stays
//   inside the world's width; not under 0) and the eye's y limit the same, both at most MOST_EYE (1 m).
// - reach(mode, amount, limits): the range a setting reaches, Amount x REACH x the mode's limits ({ yaw, pitch } in rotation, { eyeX, eyeY } in translation, the other mode's 0): what the spawn
//   box (models/spawnbox.ts) extends the view by; step()'s movement and the limits are unchanged.
//
// Changelog:
// 2026-11-09: new.
// 2026-11-10: seed (a handover between a model and another).
// 2026-11-12: reach (the range a setting reaches, for the spawn box).
// 2026-11-10: the movement without the x 2 (Amount 1 reaches half of the limit: REACH); the pitch limit the yaw limit's (balanced rotation), not over the highest pitch.
import { M } from "../engine/core";

// the time constant at Parallax delay 1 (s)
const DELAY_SECONDS = 1.5;
// a position within this of its target is on it
const SETTLED = 1e-4;
// the part of the limit Amount 1 moves the view by (the movement is the cursor's position x Amount x REACH x the limit)
const REACH = 0.5;
// the most the eye moves from its place along an axis (m)
const MOST_EYE = 1;

// how far the offsets may drift from the view something was built for before it is built again
const TOLERANCE = { yaw: 0.004, pitch: 0.004, eye: 0.03 };

export interface ParallaxOffsets {
  yaw: number;
  pitchShift: number;
  eyeX: number;
  eyeShift: number;
}

export interface ParallaxLimits {
  yaw: number;
  pitch: number;
  eyeX: number;
  eyeY: number;
}

export interface ParallaxView {
  span: number;
  aspect: number;
  halfFov: number;
  near: number;
  highestPitch: number;
}

const clamp = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

export class MouseParallax {
  static DELAY_SECONDS = DELAY_SECONDS;
  static SETTLED = SETTLED;
  static MOST_EYE = MOST_EYE;
  static REACH = REACH;
  static TOLERANCE = TOLERANCE;

  // "rotation" or "translation"; Parallax amount and Parallax delay (0 to 1)
  mode = "translation";
  amount = 0.5;
  delay = 0.1;
  // the limits of the offsets of each mode (limitsFor)
  limits: ParallaxLimits = { yaw: 0, pitch: 0, eyeX: 0, eyeY: 0 };
  // the offsets: yaw and pitch (rotation), the eye's x and y (translation)
  yaw = 0;
  pitch = 0;
  eyeX = 0;
  eyeY = 0;
  // the position followed (-1 to 1), and whether it is not on its target
  x = 0;
  y = 0;
  moving = false;
  private tx = 0;
  private ty = 0;
  private last = -1;

  static limitsFor(v: ParallaxView): ParallaxLimits {
    const half = Math.tan(v.halfFov) * v.aspect;
    const yaw = Math.max(0, Math.atan(v.span) - Math.atan(half));
    const eye = Math.min(MOST_EYE, Math.max(0, (v.span - half) * v.near));
    return { yaw, pitch: Math.min(yaw, v.highestPitch), eyeX: eye, eyeY: eye };
  }

  // the range the setting reaches (the largest offset the cursor can give, either way) in the mode chosen: Amount x REACH x the mode's limits, the other mode's 0 (what the
  // spawn box extends the view by: models/spawnbox.ts); the limits themselves and step()'s movement are unchanged
  static reach(mode: string, amount: number, limits: ParallaxLimits): ParallaxLimits {
    const s = Math.max(0, amount) * REACH;
    const rotate = mode === "rotation";
    return { yaw: rotate ? s * limits.yaw : 0, pitch: rotate ? s * limits.pitch : 0, eyeX: rotate ? 0 : s * limits.eyeX, eyeY: rotate ? 0 : s * limits.eyeY };
  }

  static farFrom(a: ParallaxOffsets, b: ParallaxOffsets): boolean {
    return (
      Math.abs(a.yaw - b.yaw) > TOLERANCE.yaw ||
      Math.abs(a.pitchShift - b.pitchShift) > TOLERANCE.pitch ||
      Math.abs(a.eyeX - b.eyeX) > TOLERANCE.eye ||
      Math.abs(a.eyeShift - b.eyeShift) > TOLERANCE.eye
    );
  }

  // the cursor is at (x, y) across the window, -1 to 1, y up (outside the window: at its edge)
  point(x: number, y: number): void {
    this.tx = clamp(x);
    this.ty = clamp(y);
  }

  // the cursor left the window: the view eases back to the centre
  leave(): void {
    this.tx = 0;
    this.ty = 0;
  }

  seed(x: number, y: number): void {
    this.x = this.tx = clamp(x);
    this.y = this.ty = clamp(y);
  }

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.tx = 0;
    this.ty = 0;
    this.last = -1;
    this.moving = false;
    this.yaw = 0;
    this.pitch = 0;
    this.eyeX = 0;
    this.eyeY = 0;
  }

  step(now: number): boolean {
    const seconds = this.last < 0 ? 0 : Math.max(0, (now - this.last) / 1000);
    this.last = now;
    const tau = this.delay * DELAY_SECONDS;
    const k = tau > 0 ? 1 - Math.exp(-seconds / tau) : 1;
    if (this.x !== this.tx || this.y !== this.ty) {
      this.x += (this.tx - this.x) * k;
      this.y += (this.ty - this.y) * k;
      if (Math.abs(this.tx - this.x) < SETTLED) this.x = this.tx;
      if (Math.abs(this.ty - this.y) < SETTLED) this.y = this.ty;
    }
    this.moving = this.x !== this.tx || this.y !== this.ty;
    const s = this.amount * REACH;
    const l = this.limits;
    const rotate = this.mode === "rotation";
    const yaw = rotate ? this.x * s * l.yaw : 0;
    const pitch = rotate ? this.y * s * l.pitch : 0;
    const eyeX = rotate ? 0 : this.x * s * l.eyeX;
    const eyeY = rotate ? 0 : this.y * s * l.eyeY;
    const changed = yaw !== this.yaw || pitch !== this.pitch || eyeX !== this.eyeX || eyeY !== this.eyeY;
    this.yaw = yaw;
    this.pitch = pitch;
    this.eyeX = eyeX;
    this.eyeY = eyeY;
    return changed;
  }
}

M.MouseParallax = MouseParallax;
