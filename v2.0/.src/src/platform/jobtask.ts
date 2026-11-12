// JobTask: the base of the tasks whose work is a pure function of an input that carries all its state (the state in, the state out): a ThreadedTask (platform/threadedtask.ts) whose
// worker runs the same function. Nothing is handed over when a worker is taken and nothing recovered when one is lost: the input has it all, so a job in flight when its worker is
// lost is simply asked again here (pending() lists the ids not answered; the caller asks again), and the output is the function's, value for value, wherever it ran.
// - request(input): the job asked for (its id). Inline (no worker alive) the output is there at once: a take after the request gives it; with a worker it comes in the answer
// - take(): the newest answer not taken ({ id, output }), or null; an answer older than one taken is dropped
// - ask(input, deadlineMs): the job asked of the worker with the exact input, a promise of the output, for work a frame needs answered in the same frame (the frame's fork and join:
//   the frame's draw waits for the promise). No worker alive: the output at once (the function run here). A worker lost with the job in flight, or one that has not answered within
//   the deadline: the function run here and the promise resolved with it (the lateness counted: `late`; LATE_LOST answers late in a row, the worker is counted lost). The output is
//   the function's, value for value, whoever gave it, so what the frame draws does not depend on where the job ran.
// serveJob is the worker's side: `{ type: "job", id, input }` answered with `{ type: "result", id, output }` (the output's transferables given by transferOf).
//
// Changelog:
// 2026-11-11: the late answer of a job asked by `ask` (after its timeout) is dropped in arrive, no longer kept for take().
// 2026-11-10: new.
import { M } from "../engine/core";
import { serveTask } from "./servetask";
import { Workers } from "./workers";
import { ThreadedTask } from "./threadedtask";
import type { TaskOptions, TaskWorker } from "./threadedtask";
import type { TaskScope } from "./servetask";

type Message = Record<string, unknown>;

export interface JobLink {
  postMessage(message: Message, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent | { data: unknown }) => void) | null;
  onerror: unknown;
  terminate(): void;
}

export interface JobResult<O> {
  id: number;
  output: O;
}

class JobHandle implements TaskWorker {
  onFail: ((why: string | undefined) => void) | null;
  link: JobLink;
  constructor(link: JobLink, onResult: (id: number, output: unknown) => void) {
    this.link = link;
    this.onFail = null;
    link.onmessage = (event) => {
      const data = (event as { data: Message }).data;
      if (data && data.type === "failed") {
        this.fail(String(data.error));
      } else if (data && data.type === "result") {
        onResult(data.id as number, data.output);
      }
    };
    link.onerror = (event: unknown) => this.fail(((event && (event as ErrorEvent).message) as string) || "the job's worker failed");
  }
  private fail(why: string): void {
    if (this.onFail) {
      this.onFail(why);
    }
  }
  close(): void {
    this.link.onmessage = null;
    this.link.onerror = null;
    this.link.terminate();
  }
}

export interface JobTaskOptions<I, O> extends TaskOptions {
  // the function, run here when no worker is alive
  fn: (input: I) => O;
  // the worker's name in the bundle (src/index.ts) and the bundle's URL, or the tests' stand-in: a promise of the worker's link (null: none could be made)
  name?: string;
  base?: string;
  makeLink?: (slot: number, force: string) => Promise<JobLink | null>;
}

// the answers late in a row after which a worker is counted lost
const LATE_LOST = 5;
// the most ids of asked jobs remembered (the oldest dropped: a worker that never answers them)
const ASKED_KEPT = 64;

interface Waiter<I, O> {
  input: I;
  resolve: (output: O) => void;
  timer: unknown;
}

export class JobTask<I, O> extends ThreadedTask<null, JobHandle> {
  late: number;
  private lateRun: number;
  private waiters: Map<number, Waiter<I, O>>;
  private fn: (input: I) => O;
  private workerName: string;
  private base: string;
  private makeLink: JobTaskOptions<I, O>["makeLink"];
  private serial: number;
  private newest: JobResult<O> | null;
  private lastTaken: number;
  private flying: Set<number>;
  // the ids of the jobs asked by `ask` and not answered: their answers (late, after a timeout) are dropped, never kept for take()
  private asked: Set<number>;

  constructor(options: JobTaskOptions<I, O>) {
    super(null, options);
    this.fn = options.fn;
    this.workerName = options.name || "";
    this.base = options.base || "";
    this.makeLink = options.makeLink;
    this.serial = 0;
    this.newest = null;
    this.lastTaken = 0;
    this.flying = new Set();
    this.asked = new Set();
    this.late = 0;
    this.lateRun = 0;
    this.waiters = new Map();
  }

  protected spawn(slot: number, force: string): Promise<JobHandle | null> {
    const link: Promise<JobLink | null> = this.makeLink
      ? this.makeLink(slot, force)
      : Workers.start(this.base, { name: this.workerName, force }).then((made) => (made ? (made.worker as unknown as JobLink) : null));
    return link.then((l) => (l ? new JobHandle(l, (id, output) => this.arrive(id, output as O)) : null));
  }

  // the jobs in flight are lost with the worker: the caller asks again
  protected dropped(): void {
    this.flying.clear();
    this.asked.clear();
    // (the jobs a frame waits for: run here, so that no frame waits for a worker that is gone)
    for (const [id, w] of Array.from(this.waiters.entries())) {
      this.waiters.delete(id);
      this.timers.clearTimeout(w.timer);
      w.resolve(this.fn(w.input));
    }
  }

  private arrive(id: number, output: O): void {
    this.flying.delete(id);
    const waiter = this.waiters.get(id);
    const wasAsked = this.asked.delete(id);
    if (waiter) {
      this.waiters.delete(id);
      this.timers.clearTimeout(waiter.timer);
      this.lateRun = 0;
      waiter.resolve(output);
      return;
    }
    if (wasAsked) {
      return;
    }
    if (id > this.lastTaken && (!this.newest || id > this.newest.id)) {
      this.newest = { id, output };
    }
  }

  // the job asked for: run here (the output is there at once), or by the worker; the request's id
  request(input: I): number {
    const id = ++this.serial;
    const live = this.liveSlots();
    if (live.length === 0) {
      this.arrive(id, this.fn(input));
      return id;
    }
    this.flying.add(id);
    this.workerOf(live[0]!)!.link.postMessage({ type: "job", id, input });
    return id;
  }

  // the job asked of the worker for a frame that waits for it: a promise of the output (see the header)
  ask(input: I, deadlineMs = 12): Promise<O> {
    const live = this.liveSlots();
    if (live.length === 0) {
      return Promise.resolve(this.fn(input));
    }
    const id = ++this.serial;
    this.asked.add(id);
    if (this.asked.size > ASKED_KEPT) {
      this.asked.delete(this.asked.values().next().value as number);
    }
    return new Promise<O>((resolve) => {
      const timer = this.timers.setTimeout(() => {
        const waiter = this.waiters.get(id);
        if (!waiter) {
          return;
        }
        this.waiters.delete(id);
        this.flying.delete(id);
        this.late++;
        this.lateRun++;
        waiter.resolve(this.fn(input));
        if (this.lateRun >= LATE_LOST) {
          this.lateRun = 0;
          for (const k of this.liveSlots()) {
            this.lost(k, "late");
          }
        }
      }, deadlineMs);
      this.waiters.set(id, { input, resolve, timer });
      this.flying.add(id);
      this.workerOf(live[0]!)!.link.postMessage({ type: "job", id, input });
    });
  }

  // the newest answer not taken, or null
  take(): JobResult<O> | null {
    const answer = this.newest;
    this.newest = null;
    if (answer) {
      this.lastTaken = answer.id;
    }
    return answer;
  }

  // the ids of the jobs asked of a worker and not answered
  pending(): number[] {
    return Array.from(this.flying);
  }
}

// the worker's side: each job's input run through fn, the output answered (its transferables from transferOf)
export function serveJob<I, O>(scope: TaskScope, fn: (input: I) => O, transferOf?: (output: O) => Transferable[]): void {
  serveTask(
    scope,
    () => null,
    (_state, message) => {
      if (message.type !== "job") {
        return { reply: { type: "failed", error: "unknown message kind: " + String(message.type) }, transfer: [] };
      }
      const output = fn(message.input as I);
      return { reply: { type: "result", id: message.id, output }, transfer: transferOf ? transferOf(output) : [] };
    }
  );
}

M.JobTask = JobTask;
M.serveJob = serveJob;
