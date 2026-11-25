// The schedule of the base mist's view-change asks with the Parallax delay as lead time (Feature P1, story P6 = Feature U3's story M7; units.ui.basemistworker.ts; pure, importable in any thread). The base volume follows a
// view change by a frame of accumulation each (M.StaticMist.viewAlpha) until M.StaticMist.converged; each frame's fresh columns are a job asked a lead ahead for the pose the view will show then and released at the frame that shows it.
// - Stream(fn, delay, per = 1): fn the job's function (run here for an ask the worker did not answer), delay the Parallax delay (the lead is M.ParallaxLead.lead(delay) s), per the asks of one pass (the row bands of M.BaseMistBands: the accumulation owes StaticMist.converged passes, so per x that many asks; 1: one ask a pass)
// - ask(ms, target, moved, inputOf, from = 0) -> id | null: `moved` (the view decision made for the target pose: M.FogPlan.ViewLead.ask's decision.moved) restarts the accumulation index k at `from` (0 at the change's own ask;
//   the schedule's frames when the asks start late, after the GPU drew the first frames of the change: k is the index the frame will have at the release); asks go on, k = 0, 1, 2 ..., until
//   M.StaticMist.converged(k) (the number of jobs a change owes), then null until the next `moved`; null before any change; the job's input is inputOf(k); the ask is released at ms + the lead
// - take(ms, shown, ready) -> Taken[]: the asks whose release time has come (M.ParallaxLead.TOLERANCE_MS), each once, in order; { id, k, askMs, releaseMs, target, apply, output, by }: apply is whether the pose `shown` is the
//   ask's target (M.MouseParallax.farFrom false); an applied ask's output is ready(id) ('worker') or fn(input) ('inline'); an ask that is not applied (the cursor changed direction before the release) has output undefined and
//   fn is never run for it. The accumulation advances per released job, whatever frames the jobs took
// - pending(), reset() (a settings or size event: the exact build is owed; what is in flight is dropped)
//
// Changelog:
// 2026-11-25: per: the asks of one pass (the accumulation's convergence counts passes: floor(asks / per)).
// 2026-11-23: Taken.inlineMs: the milliseconds the inline run of fn took (the tests' statistics).
// 2026-11-23: ask(..., from): a late start continues the accumulation index at the schedule's frames.
// 2026-11-23: new (Feature P1, story P6 = M7).
import { M } from "../engine/core";
import { ParallaxLead } from "./parallaxlead";
import { MouseParallax } from "./mouseparallax";
import type { ParallaxOffsets } from "./mouseparallax";
import { StaticMist } from "./staticmist";

interface Entry<I> {
  id: number;
  k: number;
  askMs: number;
  releaseMs: number;
  target: ParallaxOffsets;
  input: I;
}

export interface BaseMistTaken<O> {
  id: number;
  k: number;
  askMs: number;
  releaseMs: number;
  target: ParallaxOffsets;
  apply: boolean;
  output: O | undefined;
  by: string;
  // the ms fn took when it ran here (0 otherwise)
  inlineMs: number;
}

export class Stream<I, O> {
  delay: number;
  // the asks of one pass (a band each): the accumulation owes StaticMist.converged(passes) passes
  per: number;
  private fn: (input: I) => O;
  private queue: Entry<I>[] = [];
  private serial = 0;
  private next = 0;
  private active = false;

  constructor(fn: (input: I) => O, delay: number, per = 1) {
    this.fn = fn;
    this.delay = delay;
    this.per = Math.max(1, Math.floor(per));
  }

  ask(ms: number, target: ParallaxOffsets, moved: boolean, inputOf: (k: number) => I, from = 0): number | null {
    if (moved) {
      this.next = from;
      this.active = true;
    }
    if (!this.active) {
      return null;
    }
    if (StaticMist.converged(Math.floor(this.next / this.per))) {
      this.active = false;
      return null;
    }
    const k = this.next++;
    const id = ++this.serial;
    this.queue.push({ id, k, askMs: ms, releaseMs: ms + ParallaxLead.lead(this.delay) * 1000, target: { yaw: target.yaw, pitchShift: target.pitchShift, eyeX: target.eyeX, eyeShift: target.eyeShift }, input: inputOf(k) });
    return id;
  }

  take(ms: number, shown: ParallaxOffsets, ready: (id: number) => O | undefined): BaseMistTaken<O>[] {
    const out: BaseMistTaken<O>[] = [];
    const keep: Entry<I>[] = [];
    for (const q of this.queue) {
      if (q.releaseMs > ms + ParallaxLead.TOLERANCE_MS) {
        keep.push(q);
        continue;
      }
      const apply = !MouseParallax.farFrom(q.target, shown);
      let output: O | undefined, by = "dropped", inlineMs = 0;
      if (apply) {
        const given = ready(q.id);
        if (given !== undefined) {
          output = given;
          by = "worker";
        } else {
          const t0 = performance.now();
          output = this.fn(q.input);
          inlineMs = performance.now() - t0;
          by = "inline";
        }
      }
      out.push({ id: q.id, k: q.k, askMs: q.askMs, releaseMs: q.releaseMs, target: q.target, apply, output, by, inlineMs });
    }
    this.queue = keep;
    return out;
  }

  pending(): number {
    return this.queue.length;
  }

  reset(): void {
    this.queue = [];
    this.next = 0;
    this.active = false;
  }
}

export const BaseMistLead = { Stream };

M.BaseMistLead = BaseMistLead;
