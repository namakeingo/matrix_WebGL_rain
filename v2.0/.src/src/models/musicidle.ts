// MusicIdle: whether the music is driven now or the idle animation plays (pure: no GL, no page, no clock of its own: the time is given, in ms; importable in any
// thread). matrix_web_rain's, value for value (units.ui.musicrain.ts runs that code's text beside this one): with Idle animation when silent (useTimeout), the
// music's reactions stop after `timeoutSeconds` seconds without sound (a column's volume above 0.01) and the rain and the lightning run on their own again; the
// first sound ends it at once. Without the setting the music always drives. update(silent, now) once for every array; driven(useMusic) is whether the music sets
// the rain and the strikes now: React to music, and no idle animation.
//
// Changelog:
// 2026-11-09: new (matrix_web_rain's idle timeout, as a model).
import { M } from "../engine/core";
import { takeSnapshot, putSnapshot } from "./snapshot";
import type { Snapshot } from "./snapshot";

export class MusicIdle {
  useTimeout = true;
  timeoutSeconds = 15;
  // the idle animation plays (the timeout is over)
  timeout = true;
  private lastSound = 0;

  // the timer's whole state as plain data, and a timer made again from it (models/snapshot.ts)
  snapshot(): Snapshot {
    return takeSnapshot(this);
  }

  restore(snapshot: Snapshot): void {
    putSnapshot(this, snapshot);
  }

  // starts as at a load: the last sound `now`, the timeout over
  reset(now: number): void {
    this.lastSound = now;
    this.timeout = true;
  }

  update(silent: boolean, now: number): void {
    if (!this.useTimeout) return;
    if (!silent) {
      this.timeout = false;
      this.lastSound = now;
    } else if (now - this.lastSound > this.timeoutSeconds * 1000) {
      this.timeout = true;
    }
  }

  driven(useMusic: boolean): boolean {
    return useMusic && (!this.timeout || !this.useTimeout);
  }
}

M.MusicIdle = MusicIdle;
