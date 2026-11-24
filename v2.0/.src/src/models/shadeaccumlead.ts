// The schedule of the front shade grid's accumulation asks with the Parallax delay as lead time (Feature P1, story P8b; units.ui.shadeaccumcpu.ts; pure, importable in any thread). The shade grid accumulates every frame (the clouds
// drift all the time), so the stream asks one job (the fresh reduced grid, in bands) every m-th frame, a lead ahead, for the time and the jitter index the frame will show at the release; the job is released at the frame that shows it.
// - Stream(fn, delay): fn the pure job (run here for an ask the worker did not answer: the ThreadedTask's rule for a lost or late worker, 25 to 40 ms for the whole grid), delay the Parallax delay (the lead is M.ParallaxLead.lead(delay) s)
// - ask(ms, k, time, input) -> id: the job for the index k and the time `time` (the time the frame shows at the release: timeAt), released at ms + the lead
// - take(ms, ready) -> Taken[]: the asks whose release time has come (M.ParallaxLead.TOLERANCE_MS), each once, in order: { id, k, time, askMs, releaseMs, output, by, inlineMs }; the output is ready(id) ('worker') or fn(input)
//   ('inline'); the id is never asked about again, so a late answer is dropped
// - pending(), reset() (an exact bake owed: what is in flight is dropped and never released)
// - timeAt(time, delay): time + the lead in seconds
//
// Changelog:
// 2026-11-23: new (Feature P1, story P8b).
import { M } from "../engine/core";
import { ParallaxLead } from "./parallaxlead";

interface Entry<I> {
  id: number;
  k: number;
  time: number;
  askMs: number;
  releaseMs: number;
  input: I;
}

export interface ShadeAccumTaken<O> {
  id: number;
  k: number;
  time: number;
  askMs: number;
  releaseMs: number;
  output: O;
  by: string;
  // the ms fn took when it ran here (0 otherwise)
  inlineMs: number;
}

export class Stream<I, O> {
  delay: number;
  private fn: (input: I) => O;
  private queue: Entry<I>[] = [];
  private serial = 0;

  constructor(fn: (input: I) => O, delay: number) {
    this.fn = fn;
    this.delay = delay;
  }

  ask(ms: number, k: number, time: number, input: I): number {
    const id = ++this.serial;
    this.queue.push({ id, k, time, askMs: ms, releaseMs: ms + ParallaxLead.lead(this.delay) * 1000, input });
    return id;
  }

  take(ms: number, ready: (id: number) => O | undefined): ShadeAccumTaken<O>[] {
    const out: ShadeAccumTaken<O>[] = [];
    const keep: Entry<I>[] = [];
    for (const q of this.queue) {
      if (q.releaseMs > ms + ParallaxLead.TOLERANCE_MS) {
        keep.push(q);
        continue;
      }
      let output = ready(q.id), by = "worker", inlineMs = 0;
      if (output === undefined) {
        const t0 = performance.now();
        output = this.fn(q.input);
        inlineMs = performance.now() - t0;
        by = "inline";
      }
      out.push({ id: q.id, k: q.k, time: q.time, askMs: q.askMs, releaseMs: q.releaseMs, output, by, inlineMs });
    }
    this.queue = keep;
    return out;
  }

  pending(): number {
    return this.queue.length;
  }

  reset(): void {
    this.queue = [];
  }
}

function timeAt(time: number, delay: number): number {
  return time + ParallaxLead.lead(delay);
}

export const ShadeAccumLead = { Stream, timeAt };

M.ShadeAccumLead = ShadeAccumLead;
