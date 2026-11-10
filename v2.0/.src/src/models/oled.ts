// OledShift: the OLED pixel shift, a pure model (no GL, no page, runnable in any thread),
// matrix_web_rain's rules (shiftPixels, applyShiftStep) kept step for step:
// - every EVERY_MS of the real time given in, one step: the scene 1 pixel left or right
//   (random() < 0.5: left), then the clock and the message each to one of their 8 neighbouring
//   pixels (x then y, floor(random() x 3) - 1 each, drawn again while both are 0);
// - a step that would take a shift past the limit (OLED Pixel Shift) is turned back, so no shift
//   is ever more than the limit from 0, across or down;
// - a lower limit brings every shift back into its range at once; at 0 every shift is 0 and no
//   step is taken (no random number drawn), the beat going on;
// - no catching up: after a gap (paused, hidden) one step, the next EVERY_MS after it; time going
//   back (the clock set back) starts the beat again from there.
// Shifts in device pixels.
//
// Changelog:
// 2026-11-04: first version, from matrix_web_rain's shiftPixels and applyShiftStep.
import { M } from "../engine/core";

export class OledShift {
  static readonly EVERY_MS: number = 10000;
  scene: { x: number };
  clock: { x: number; y: number };
  message: { x: number; y: number };
  private random: () => number;
  // the time of the next step (ms); null until the first update
  private due: number | null;

  constructor(random: () => number) {
    this.random = random;
    this.scene = { x: 0 };
    this.clock = { x: 0, y: 0 };
    this.message = { x: 0, y: 0 };
    this.due = null;
  }

  // every shift 0, the beat started again at the next update
  reset(): void {
    this.scene.x = 0;
    this.clock.x = 0;
    this.clock.y = 0;
    this.message.x = 0;
    this.message.y = 0;
    this.due = null;
  }

  // the shifts at nowMs with OLED Pixel Shift `limit`; true when any shift changed
  update(nowMs: number, limit: number): boolean {
    const most = Math.max(0, limit);
    const { scene, clock, message } = this;
    const sx = scene.x, cx = clock.x, cy = clock.y, mx = message.x, my = message.y;
    scene.x = OledShift.clamp(sx, most);
    clock.x = OledShift.clamp(cx, most);
    clock.y = OledShift.clamp(cy, most);
    message.x = OledShift.clamp(mx, most);
    message.y = OledShift.clamp(my, most);
    const every = OledShift.EVERY_MS;
    if (this.due === null || nowMs < this.due - every) {
      this.due = nowMs + every;
    } else if (nowMs >= this.due) {
      if (most > 0) this.step(most);
      this.due += every;
      if (nowMs >= this.due) this.due = nowMs + every;
    }
    return sx != scene.x || cx != clock.x || cy != clock.y || mx != message.x || my != message.y;
  }

  // a shift within +-most
  private static clamp(v: number, most: number): number {
    return Math.max(-most, Math.min(most, v));
  }

  // a shift moved by step, turned back if it would go past +-most
  private static turn(shift: number, step: number, most: number): number {
    return Math.abs(shift + step) > most ? shift - step : shift + step;
  }

  // one step of every shift within +-most
  private step(most: number): void {
    this.scene.x = OledShift.turn(this.scene.x, this.random() < 0.5 ? -1 : 1, most);
    this.neighbour(this.clock, most);
    this.neighbour(this.message, most);
  }

  // a shift to one of its 8 neighbouring pixels
  private neighbour(shift: { x: number; y: number }, most: number): void {
    let x = 0;
    let y = 0;
    while (x == 0 && y == 0) {
      x = Math.floor(this.random() * 3) - 1;
      y = Math.floor(this.random() * 3) - 1;
    }
    shift.x = OledShift.turn(shift.x, x, most);
    shift.y = OledShift.turn(shift.y, y, most);
  }
}

M.OledShift = OledShift;
