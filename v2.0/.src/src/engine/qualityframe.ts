// QualityFrame: the frame's controller for the quality pool (the Debug setting p628_setting_DebugQualityMode). It orders what a
// frame does around the quality job and keeps a pending frame safe; the wallpaper (the host) supplies the work.
// - "off": advance, draw, at once; nothing of the quality runs (the wallpaper does not even call the controller: its own frame is
//   the frame as it was).
// - "inline": advance, the jobs run synchronously on this thread (host.inline: the same pure code the workers run), draw, apply.
// - "workers": advance, the pool's run is posted, the work that needs no quality (host.work), then the replies are awaited and
//   the DRAW IS THE CONTINUATION (a promise's callback), then apply. A mode "workers" with no pool acts as "inline".
// - In flight: a frame asked while the previous one is pending is skipped (counted in skipped, nothing called): the wallpaper
//   then draws nothing in that animation frame, so the frames' health sees the longer gap to the next drawn frame as missed
//   frames (FrameHealth.frame counts the gap, not the animation frames).
// - Late: a null result (the pool's late bound passed) draws with no quality applied (late counted).
// - Generation: every frame takes the generation number; cancel() and setMode() move it on and clear the in-flight flag, so a
//   continuation that finds another number neither draws nor applies (its outcome is "cancelled"). The wallpaper cancels on pause,
//   hide, a lost context, the effects being made again, a failure and the page's end, so a stale continuation never draws.
// - Failures: a throw in the continuation, or a pool run that rejects, goes to host.fail (once; outcome "failed"); in the
//   synchronous modes a throw propagates to the caller (the animation frame's try/catch, which makes it a failure).
// last is the outcome of the latest frame started ("drawn", "late", "cancelled" or "failed").
// summarize(levels) is the EffectQuality of a job's levels (a unit hidden at level 0).
//
// Changelog:
// 2026-11-06: new.
import { M } from "./core";
import type { QualityJob, EffectQuality } from "../models/quality/types";
import type { QualityResults } from "./qualitypool";

export type QualityMode = "off" | "inline" | "workers";
export type QualityOutcome = "drawn" | "late" | "cancelled" | "failed";

// the pool as the controller uses it (QualityPool's run)
export interface QualityRunner {
  run(frame: number, jobs: QualityJob[], params: Record<number, object>): Promise<QualityResults | null>;
}

export interface QualityHost {
  pool: QualityRunner | null;
  advance(): void;
  jobs(): QualityJob[];
  params(): Record<number, object>;
  inline(jobs: QualityJob[], params: Record<number, object>): QualityResults;
  work(): void;
  draw(): void;
  apply(results: QualityResults): void;
  fail(error: unknown): void;
}

const MODES: readonly string[] = ["off", "inline", "workers"];

export class QualityFrame {
  mode: QualityMode;
  generation: number;
  inFlight: boolean;
  skipped: number;
  late: number;
  applied: number;
  frames: number;
  last: Promise<QualityOutcome>;
  host: QualityHost;

  constructor(host: QualityHost) {
    this.host = host;
    this.mode = "off";
    this.generation = 0;
    this.inFlight = false;
    this.skipped = 0;
    this.late = 0;
    this.applied = 0;
    this.frames = 0;
    this.last = Promise.resolve("drawn");
  }

  setMode(mode: string): void {
    this.mode = (MODES.indexOf(mode) >= 0 ? mode : "off") as QualityMode;
    this.cancel();
  }

  // a pending frame will neither draw nor apply; the next one may start at once
  cancel(): void {
    this.generation++;
    this.inFlight = false;
  }

  frame(): "drawn" | "pending" | "skipped" {
    const host = this.host;
    const mode = this.mode === "workers" && !host.pool ? "inline" : this.mode;
    if (mode === "off") {
      host.advance();
      host.draw();
      this.last = Promise.resolve("drawn");
      return "drawn";
    }
    if (mode === "inline") {
      host.advance();
      const jobs = host.jobs();
      const results = host.inline(jobs, host.params());
      host.apply(results);
      host.draw();
      this.applied++;
      this.last = Promise.resolve("drawn");
      return "drawn";
    }
    if (this.inFlight) {
      this.skipped++;
      return "skipped";
    }
    host.advance();
    const jobs = host.jobs();
    const params = host.params();
    const generation = this.generation;
    const pending = host.pool!.run(this.frames++, jobs, params);
    this.inFlight = true;
    host.work();
    this.last = pending.then(
      (results) => {
        if (generation !== this.generation) {
          return "cancelled";
        }
        this.inFlight = false;
        try {
          if (!results) {
            host.draw();
            this.late++;
            return "late";
          }
          // (the result first: the draw takes only what it says is seen)
          host.apply(results);
          host.draw();
          this.applied++;
          return "drawn";
        } catch (error) {
          host.fail(error);
          return "failed";
        }
      },
      (error) => {
        if (generation !== this.generation) {
          return "cancelled";
        }
        this.inFlight = false;
        host.fail(error);
        return "failed";
      },
    );
    return "pending";
  }

  // an effect's quality from its job's levels: its units, those not hidden (level over 0), the mean level of those and the highest
  static summarize(levels: Uint8Array): EffectQuality {
    let drawn = 0;
    let sum = 0;
    let top = 0;
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (level > 0) {
        drawn++;
        sum += level;
        if (level > top) {
          top = level;
        }
      }
    }
    return { visible: drawn > 0, level: top, units: levels.length, drawn, meanLevel: drawn > 0 ? sum / drawn : 0, hidden: null, levels };
  }
}

M.QualityFrame = QualityFrame;
