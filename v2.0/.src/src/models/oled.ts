// OledShift: the OLED pixel shift, a pure model (no GL, no page, runnable in any thread).
// One shift, the scene's: the clock and the message have none of their own, they ride the scene's, so
// everything on the screen moves by the same pixels.
// - every EVERY_MS of the real time given in, one step of 1 px at most across and 1 px at most down,
//   never 0 on both (a diagonal when both are 1), within OLED Pixel Shift of 0 across and down;
// - each position (x, y) within the limit has a visit count: the number of times the scene has been
//   there (the start, 0 0, counts 1). A cycle is a journey to a bias target: when there is none, or the
//   scene has reached it (or the limit was lowered past it), a NEW target is picked among the positions
//   of the least count (never the previous target nor the current position while another candidate
//   remains; one random number: floor(random() x n) over the candidates in row-major order, y outer,
//   x inner); the target is held until it is reached (a new target at every step makes the walk dither
//   through the middle: measured to cover the positions slower than the plain neighbour walk). Each
//   step takes the neighbour random of old (x then y, floor(random() x 3) - 1 each, drawn again while
//   both are 0) and the sum of the target's direction (the sign of each axis' distance) and that
//   random, each axis cut to its sign; where the two cancel on both axes the target's direction wins;
// - a step that would take the shift past the limit is turned back, so no shift is ever more than the
//   limit from 0, across or down;
// - a lower limit brings the shift back into its range at once (not a visit); the counts stay, so a
//   raised limit has its new outer positions at 0; at 0 the shift is 0 and no step is taken (no random
//   number drawn), the beat going on; reset() clears the counts and the target;
// - no catching up: after a gap (paused, hidden) one step, the next EVERY_MS after it; time going
//   back (the clock set back) starts the beat again from there.
// Shifts in device pixels.
//
// Changelog:
// 2026-11-04: first version, from matrix_web_rain's shiftPixels and applyShiftStep.
// 2026-11-18: the scene shifts across and down (scene.y), its step the neighbour rule of the clock's
//   and the message's (was 1 px left or right).
// 2026-11-18: lensOf: the camera's lens of a scene shift (the scene is shifted by the camera's image centre).
// 2026-11-19: the clock and the message take the scene's shift alone (no shift of their own); the step is
//   biased toward the least visited positions (visit counts, a random target of the least count held until reached).
import { M } from "../engine/core";

export class OledShift {
  static readonly EVERY_MS: number = 10000;
  scene: { x: number; y: number };
  // the bias target of the last step (null before the first step, after reset() and at limit 0)
  target: { x: number; y: number } | null;
  private random: () => number;
  // the time of the next step (ms); null until the first update
  private due: number | null;
  // the visit counts by "x,y"; absent: 0
  private counts: Map<string, number>;

  constructor(random: () => number) {
    this.random = random;
    this.scene = { x: 0, y: 0 };
    this.target = null;
    this.due = null;
    this.counts = new Map();
    this.counts.set("0,0", 1);
  }

  // the shift 0, the counts and the target cleared, the beat started again at the next update
  reset(): void {
    this.scene.x = 0;
    this.scene.y = 0;
    this.target = null;
    this.due = null;
    this.counts.clear();
    this.counts.set("0,0", 1);
  }

  // the times the scene has been at (x, y)
  visits(x: number, y: number): number {
    return this.counts.get(x + "," + y) || 0;
  }

  // the shift at nowMs with OLED Pixel Shift `limit`; true when it changed
  update(nowMs: number, limit: number): boolean {
    const most = Math.max(0, limit);
    const scene = this.scene;
    const sx = scene.x, sy = scene.y;
    scene.x = OledShift.clamp(sx, most);
    scene.y = OledShift.clamp(sy, most);
    const every = OledShift.EVERY_MS;
    if (this.due === null || nowMs < this.due - every) {
      this.due = nowMs + every;
    } else if (nowMs >= this.due) {
      if (most > 0) this.step(most);
      else this.target = null;
      this.due += every;
      if (nowMs >= this.due) this.due = nowMs + every;
    }
    return sx != scene.x || sy != scene.y;
  }

  // the camera's lens (Camera.setLens) that shifts the picture by a scene shift: x as is, y turned (the shift's positive y moves the picture down, the lens' up);
  // a fresh object, +0 for a zero of either sign
  static lensOf(scene: { x: number; y: number }): { x: number; y: number } {
    return { x: scene.x === 0 ? 0 : scene.x, y: scene.y === 0 ? 0 : -scene.y };
  }

  // a shift within +-most
  private static clamp(v: number, most: number): number {
    return Math.max(-most, Math.min(most, v));
  }

  // a shift moved by step, turned back if it would go past +-most
  private static turn(shift: number, step: number, most: number): number {
    return Math.abs(shift + step) > most ? shift - step : shift + step;
  }

  private static sign(v: number): number {
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  }

  // a new bias target: among the positions within +-most of the least visit count, the previous target
  // left out and then the current position left out while another candidate remains; one random number
  private pickTarget(most: number): { x: number; y: number } {
    let least = Infinity;
    for (let y = -most; y <= most; y++) {
      for (let x = -most; x <= most; x++) {
        const c = this.visits(x, y);
        if (c < least) least = c;
      }
    }
    let list: { x: number; y: number }[] = [];
    for (let y = -most; y <= most; y++) {
      for (let x = -most; x <= most; x++) {
        if (this.visits(x, y) === least) list.push({ x, y });
      }
    }
    const previous = this.target;
    if (previous) {
      const rest = list.filter(function (p) { return !(p.x === previous.x && p.y === previous.y); });
      if (rest.length > 0) list = rest;
    }
    const here = this.scene;
    const away = list.filter(function (p) { return !(p.x === here.x && p.y === here.y); });
    if (away.length > 0) list = away;
    return list[Math.floor(this.random() * list.length)];
  }

  // one step: toward the target (a new one when none is held), the neighbour random added, 1 px at most per axis, never 0 on both
  private step(most: number): void {
    const held = this.target;
    const target = held && !(held.x === this.scene.x && held.y === this.scene.y) && Math.abs(held.x) <= most && Math.abs(held.y) <= most ? held : this.pickTarget(most);
    this.target = target;
    let rx = 0;
    let ry = 0;
    while (rx == 0 && ry == 0) {
      rx = Math.floor(this.random() * 3) - 1;
      ry = Math.floor(this.random() * 3) - 1;
    }
    const scene = this.scene;
    const bx = OledShift.sign(target.x - scene.x);
    const by = OledShift.sign(target.y - scene.y);
    let dx = OledShift.sign(rx + bx);
    let dy = OledShift.sign(ry + by);
    if (dx === 0 && dy === 0) {
      dx = bx;
      dy = by;
    }
    if (bx === 0 && by === 0) {
      dx = rx;
      dy = ry;
    }
    scene.x = OledShift.turn(scene.x, dx, most);
    scene.y = OledShift.turn(scene.y, dy, most);
    const key = scene.x + "," + scene.y;
    this.counts.set(key, (this.counts.get(key) || 0) + 1);
  }
}

M.OledShift = OledShift;
