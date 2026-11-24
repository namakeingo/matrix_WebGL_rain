// ParallaxPose: the mouse parallax's pose with the Parallax delay as a lead time and the Parallax smoothing as the time constant (pure: no GL, no page, no clock of its own: the time is given, in ms; importable in any
// thread; the parallax worker's model and the client's mirror). It is M.ParallaxLead.Follower (the normalised position x, y: the cursor of `lead` ago, smoothed) plus the mapping to the camera's offsets of the mode
// chosen (MouseParallax.offsetsFor: the limits, the mode, the amount), so the same numbers MouseParallax gave are given with a delay 0 and a smoothing 0 (the cursor's own position), bit for bit.
// - mode ("rotation" or "translation"), amount (0 to 1), delay (0 to 1: the lead, 1 s a unit), smoothing (0 to 1: the time constant, 0.5 s a unit), limits (MouseParallax.limitsFor)
// - point(ms, x, y), leave(ms): the cursor from ms on (a point equal to the last one is not kept: a view still costs no events); step(ms): the outputs yaw, pitch, eyeX, eyeY, x, y, moving at ms, true when an offset changed
// - poseAt(nowMs, msAhead): the offsets step(nowMs + msAhead) would give, nothing changed; msAhead from 0 to the lead (a larger one is the lead: only the events up to nowMs are known; a lead of 0 is the pose now)
// - reset(): everything back to 0; seed(x, y): the position at (x, y) at once
//
// Changelog:
// 2026-11-23: new (Feature P1).
import { M } from "../engine/core";
import { MouseParallax } from "./mouseparallax";
import type { ParallaxLimits } from "./mouseparallax";
import { ParallaxLead } from "./parallaxlead";

export interface ParallaxPoseOffsets {
  yaw: number;
  pitch: number;
  eyeX: number;
  eyeY: number;
}

export class ParallaxPose {
  mode = "translation";
  amount = 0.5;
  limits: ParallaxLimits = { yaw: 0, pitch: 0, eyeX: 0, eyeY: 0 };
  yaw = 0;
  pitch = 0;
  eyeX = 0;
  eyeY = 0;
  x = 0;
  y = 0;
  moving = false;
  private follower = new ParallaxLead.Follower();
  // the cursor's last place given (an equal one adds nothing)
  private lastX = 0;
  private lastY = 0;

  get delay(): number {
    return this.follower.delay;
  }
  set delay(v: number) {
    this.follower.delay = v;
  }
  get smoothing(): number {
    return this.follower.smoothing;
  }
  set smoothing(v: number) {
    this.follower.smoothing = v;
  }

  point(ms: number, x: number, y: number): void {
    const cx = x < -1 ? -1 : x > 1 ? 1 : x;
    const cy = y < -1 ? -1 : y > 1 ? 1 : y;
    if (cx === this.lastX && cy === this.lastY) {
      return;
    }
    this.lastX = cx;
    this.lastY = cy;
    this.follower.point(ms, cx, cy);
  }

  leave(ms: number): void {
    this.point(ms, 0, 0);
  }

  seed(x: number, y: number): void {
    this.follower.seed(x, y);
    this.lastX = this.follower.x;
    this.lastY = this.follower.y;
    this.x = this.follower.x;
    this.y = this.follower.y;
    this.moving = false;
    this.map();
  }

  reset(): void {
    this.follower.reset();
    this.lastX = 0;
    this.lastY = 0;
    this.x = 0;
    this.y = 0;
    this.moving = false;
    this.yaw = 0;
    this.pitch = 0;
    this.eyeX = 0;
    this.eyeY = 0;
  }

  step(ms: number): boolean {
    this.follower.step(ms);
    this.x = this.follower.x;
    this.y = this.follower.y;
    this.moving = this.follower.moving;
    return this.map();
  }

  poseAt(nowMs: number, msAhead: number): ParallaxPoseOffsets {
    const lead = ParallaxLead.lead(this.follower.delay) * 1000;
    const ahead = msAhead < 0 ? 0 : msAhead > lead ? lead : msAhead;
    const p = this.follower.peek(nowMs + ahead);
    return MouseParallax.offsetsFor(this.mode, this.amount, this.limits, p.x, p.y);
  }

  // the offsets of the position; true when one changed
  private map(): boolean {
    const o = MouseParallax.offsetsFor(this.mode, this.amount, this.limits, this.x, this.y);
    const changed = o.yaw !== this.yaw || o.pitch !== this.pitch || o.eyeX !== this.eyeX || o.eyeY !== this.eyeY;
    this.yaw = o.yaw;
    this.pitch = o.pitch;
    this.eyeX = o.eyeX;
    this.eyeY = o.eyeY;
    return changed;
  }
}

M.ParallaxPose = ParallaxPose;
