// The schedule of the front volume's jobs with the Parallax delay as lead time (Feature P1, story P8a; units.ui.frontvolume.ts; pure, importable in any thread). The front volume's temporal accumulation never converges (the
// clouds drift): in the steady state a job is asked every `period` (the plan's sweep) and a change of the view asks one every frame until `owed` (M.FogAccum.FRAMES) have been asked, the average's convergence, then the period
// again. Each ask is for the pose the view will show a lead ahead and is released at the frame that shows it.
// - Stream(fn, delay, period = M.FrontVolumeJob.PERIOD_SECONDS, owed = M.FogAccum.FRAMES): fn the job's function (run here for an ask the worker did not answer by its release: the ThreadedTask rule), delay the Parallax delay
// - ask(ms, target, moved, inputOf) -> id | null: the index k is 0, 1, 2 ... for ever; `moved` (the view decision for the target pose) restarts it at 0 and starts the burst: every call asks while k < owed; otherwise a call
//   asks only when `period` has passed since the last ask; the job's input is inputOf(k); the ask is released at ms + the lead (M.ParallaxLead.lead(delay))
// - take(ms, shown, ready) -> Taken[]: the asks whose release time has come (M.ParallaxLead.TOLERANCE_MS), each once, in order: { id, k, askMs, releaseMs, target, apply, output, by, inlineMs, superseded }; apply: the pose
//   `shown` is the ask's target (M.MouseParallax.farFrom false); of the applied asks of one take only the newest is used, the older ones are `superseded` (no output, never computed); the used one's output is ready(id) ('worker')
//   or fn(input) ('inline'); an ask that is not applied has no output and fn is never run for it
// - nextReleaseMs(): the release time (ms) of the earliest ask still waiting, or null
// - pending(), reset() (a settings, size or time-jump event: what is in flight is dropped)
//
// Changelog:
// 2026-11-24: nextReleaseMs().
// 2026-11-23: new (Feature P1, story P8a).
import { M } from "../engine/core";
import { ParallaxLead } from "./parallaxlead";
import { MouseParallax } from "./mouseparallax";
import type { ParallaxOffsets } from "./mouseparallax";
import { FogAccum } from "./fogaccum";
import { FrontVolumeJob } from "./frontvolumejob";

interface Entry<I> {
  id: number;
  k: number;
  askMs: number;
  releaseMs: number;
  target: ParallaxOffsets;
  input: I;
}

export interface FrontVolumeTaken<O> {
  id: number;
  k: number;
  askMs: number;
  releaseMs: number;
  target: ParallaxOffsets;
  apply: boolean;
  output: O | undefined;
  by: string;
  inlineMs: number;
  superseded: boolean;
}

export class Stream<I, O> {
  delay: number;
  private fn: (input: I) => O;
  private period: number;
  private owed: number;
  private queue: Entry<I>[] = [];
  private serial = 0;
  private next = 0;
  private bursting = false;
  private lastAskMs = -Infinity;

  constructor(fn: (input: I) => O, delay: number, period: number = FrontVolumeJob.PERIOD_SECONDS, owed: number = FogAccum.FRAMES) {
    this.fn = fn;
    this.delay = delay;
    this.period = period;
    this.owed = owed;
  }

  ask(ms: number, target: ParallaxOffsets, moved: boolean, inputOf: (k: number) => I): number | null {
    if (moved) {
      this.next = 0;
      this.bursting = true;
    }
    if (!(this.bursting && this.next < this.owed)) {
      this.bursting = false;
      if (ms - this.lastAskMs < this.period * 1000 - 1e-6) {
        return null;
      }
    }
    const k = this.next++;
    const id = ++this.serial;
    this.lastAskMs = ms;
    this.queue.push({ id, k, askMs: ms, releaseMs: ms + ParallaxLead.lead(this.delay) * 1000, target: { yaw: target.yaw, pitchShift: target.pitchShift, eyeX: target.eyeX, eyeShift: target.eyeShift }, input: inputOf(k) });
    return id;
  }

  take(ms: number, shown: ParallaxOffsets, ready: (id: number) => O | undefined): FrontVolumeTaken<O>[] {
    const due: Entry<I>[] = [], keep: Entry<I>[] = [];
    for (const q of this.queue) {
      (q.releaseMs > ms + ParallaxLead.TOLERANCE_MS ? keep : due).push(q);
    }
    this.queue = keep;
    const applied = due.map((q) => !MouseParallax.farFrom(q.target, shown));
    let newest = -1;
    applied.forEach((a, i) => {
      if (a) {
        newest = i;
      }
    });
    return due.map((q, i) => {
      const apply = applied[i]!, base = { id: q.id, k: q.k, askMs: q.askMs, releaseMs: q.releaseMs, target: q.target, apply, inlineMs: 0 };
      if (!apply) {
        return { ...base, output: undefined, by: "dropped", superseded: false };
      }
      if (i !== newest) {
        return { ...base, output: undefined, by: "superseded", superseded: true };
      }
      const given = ready(q.id);
      if (given !== undefined) {
        return { ...base, output: given, by: "worker", superseded: false };
      }
      const t0 = performance.now(), output = this.fn(q.input);
      return { ...base, output, by: "inline", inlineMs: performance.now() - t0, superseded: false };
    });
  }

  nextReleaseMs(): number | null {
    let first: number | null = null;
    for (const q of this.queue) {
      if (first === null || q.releaseMs < first) {
        first = q.releaseMs;
      }
    }
    return first;
  }

  pending(): number {
    return this.queue.length;
  }

  reset(): void {
    this.queue = [];
    this.next = 0;
    this.bursting = false;
    this.lastAskMs = -Infinity;
  }
}

export const FrontVolumeLead = { Stream };

M.FrontVolumeLead = FrontVolumeLead;
