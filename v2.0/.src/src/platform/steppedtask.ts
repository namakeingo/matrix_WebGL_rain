// SteppedTask: the base of the tasks whose work is a simulation stepped one step at a time (the rain's landings, the splashes, the strikes' plan, ...), a ThreadedTask
// (platform/threadedtask.ts) over a StepModel: pure code with no GL, the same inline and in the worker, so that what a worker computed is, bit for bit, what the model computes here.
//
// The model: `step` (the steps done), `run()` (simulate the next step, return its packet), `event(payload)` (a live input applied at the current position: before the next step),
// `snapshot()` (plain data: the whole state, structured-cloneable) and `restore(snapshot)`.
//
// The task (the render thread): `advance(to)` gives the packets of the steps (consumed, to], in order, each { to: step, data }. Inline (no worker yet, or none alive) the model is run
// for each step. A worker is taken over from the inline model's snapshot (init: the snapshot, the events not applied yet), simulates steps ahead (the lookahead: `go` messages with
// the step to reach) and answers with the packets, a checkpoint (the snapshot after a step that is a multiple of checkpointEvery) now and then; the frame takes the packets that are
// due. The task drives from the worker once its packets are contiguous with the steps consumed. Whatever ran where, the stream of packets is the same.
// - event(payload): a live input applied before step consumed + eventDelay, inline and in the worker alike (the worker, when it had gone past that step, rewinds to its own snapshot of
//   the step before; the packets it had sent for the steps from it are stale and dropped: each such change starts a new epoch, and the worker's answers carry its epoch);
//   the events are kept until a checkpoint passes them
// - jump(step, payload): the position moved (a reset, a jump in time): consumed = step, the buffered packets dropped, the model given the payload (as an event, in the worker too)
// - a worker lost, or one that does not have the steps asked of it (lag: late++): the inline model restored from the last checkpoint and replayed (the events applied at their steps)
//   to the steps consumed, then run inline; ThreadedTask retries after 20 ms, 40 ...
// - advanceAsync(to, deadlineMs): the frame's fork and join: a promise of the packets of the steps (consumed, to]; with a worker driving, the frame waits for its packets (no lookahead is
//   needed, so a live input can apply before the very next step: event(payload, 1)); a worker lost while the frame waits, or not answering within the deadline: the inline model
//   restored from the last checkpoint and replayed, the promise resolved with the packets (late counted, the worker counted lost). The packets are the same whoever made them.
// The worker's side is serveStepped: the same model, a snapshot of each step kept (`keep` steps) for the rewinds.
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";
import { serveTask } from "./servetask";
import { Workers } from "./workers";
import { ThreadedTask } from "./threadedtask";
import type { TaskOptions, TaskWorker } from "./threadedtask";
import type { TaskScope } from "./servetask";

type Message = Record<string, unknown>;

export interface StepModel<P> {
  step: number;
  run(): P;
  event(payload: unknown): void;
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

export interface StepPacket<P> {
  to: number;
  data: P;
}

interface Checkpoint {
  step: number;
  snapshot: unknown;
}

interface LoggedEvent {
  at: number;
  payload: unknown;
}

// a worker as the task holds it: the link to it (a Worker, or a stand-in in the tests)
// the frames the worker answers late in a row after which it is counted lost (one late answer is answered inline and the state handed to the worker again)
const LATE_LOST = 5;

export interface StepLink {
  postMessage(message: Message, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent | { data: unknown }) => void) | null;
  onerror: unknown;
  terminate(): void;
}

class StepHandle implements TaskWorker {
  onFail: ((why: string | undefined) => void) | null;
  link: StepLink;
  constructor(link: StepLink, onMessage: (m: Message) => void) {
    this.link = link;
    this.onFail = null;
    link.onmessage = (event) => {
      const data = (event as { data: Message }).data;
      if (data && data.type === "failed") {
        this.fail(String(data.error));
      } else if (data && data.type === "packets") {
        onMessage(data);
      }
    };
    link.onerror = (event: unknown) => this.fail(((event && (event as ErrorEvent).message) as string) || "the worker failed");
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

export interface SteppedTaskOptions<P> extends TaskOptions {
  // the inline model
  model: StepModel<P>;
  // the worker's name in the bundle (src/index.ts) and the bundle's URL, or the tests' stand-in: a promise of the worker's link (null: none could be made)
  name?: string;
  base?: string;
  makeLink?: (slot: number, force: string) => Promise<StepLink | null>;
  // the steps ahead of the frame the worker simulates, the steps between the checkpoints it sends, the steps between a live input's arrival and its step
  lookahead?: number;
  checkpointEvery?: number;
  eventDelay?: number;
}

export class SteppedTask<P> extends ThreadedTask<StepModel<P>, StepHandle> {
  consumed: number;
  late: number;
  protected model: StepModel<P>;
  private workerName: string;
  private base: string;
  private makeLink: SteppedTaskOptions<P>["makeLink"];
  private lookahead: number;
  private every: number;
  private delay: number;
  // the worker's packets not taken (in order), its epoch, whether it drives (its packets are the steps' source), whether one was handed the state
  private buffer: StepPacket<P>[];
  private epoch: number;
  private driving: boolean;
  private handed: boolean;
  // the step consumed when the worker was handed the state (a model with no lookahead, asked a tick at a time, is in step with the worker from then on)
  private handedAt: number;
  // the late answers in a row, and whether the worker was set aside (suspend)
  private lateRun: number;
  private suspended: boolean;
  private replay: boolean;
  private checkpoints: Checkpoint[];
  private inputs: LoggedEvent[];
  // the frame waiting for the worker's packets (advanceAsync)
  private waiting: { to: number; resolve: (packets: StepPacket<P>[]) => void; timer: unknown } | null;

  constructor(options: SteppedTaskOptions<P>) {
    super(options.model, options);
    this.model = options.model;
    this.workerName = options.name || "";
    this.base = options.base || "";
    this.makeLink = options.makeLink;
    this.lookahead = options.lookahead === undefined ? 12 : options.lookahead;
    this.every = options.checkpointEvery || 24;
    this.delay = options.eventDelay === undefined ? 4 : options.eventDelay;
    this.consumed = options.model.step;
    this.late = 0;
    this.buffer = [];
    this.epoch = 0;
    this.driving = false;
    this.handed = false;
    this.handedAt = -1;
    this.lateRun = 0;
    this.suspended = false;
    this.replay = false;
    this.checkpoints = [];
    this.inputs = [];
    this.waiting = null;
  }

  protected spawn(slot: number, force: string): Promise<StepHandle | null> {
    const link: Promise<StepLink | null> = this.makeLink
      ? this.makeLink(slot, force)
      : Workers.start(this.base, { name: this.workerName, force }).then((made) => (made ? (made.worker as unknown as StepLink) : null));
    return link.then((l) => (l ? new StepHandle(l, (m) => this.arrive(m)) : null));
  }

  // a worker taken: handed the inline model's state (the model is at the steps consumed) and the events not applied yet, asked for steps ahead
  protected adopt(_slot: number, worker: StepHandle): void {
    this.syncInline();
    this.resync();
    this.buffer.length = 0;
    this.driving = false;
    this.handed = true;
    this.handedAt = this.consumed;
    const epoch = ++this.epoch;
    worker.link.postMessage({ type: "init", epoch, snapshot: this.model.snapshot(), events: this.inputs.filter((e) => e.at > this.consumed) });
    worker.link.postMessage({ type: "go", epoch, to: this.consumed + this.lookahead });
  }

  // the worker handed the inline model's state again (the model is at the steps consumed), and the events not applied yet
  private rehand(worker: StepHandle): void {
    this.handed = true;
    this.handedAt = this.consumed;
    const epoch = ++this.epoch;
    worker.link.postMessage({ type: "init", epoch, snapshot: this.model.snapshot(), events: this.inputs.filter((e) => e.at > this.consumed) });
    worker.link.postMessage({ type: "go", epoch, to: this.consumed + this.lookahead });
  }

  // the worker lost: the inline model is restored from the last checkpoint at the next advance
  protected dropped(): void {
    if (this.driving) {
      this.replay = true;
    }
    this.driving = false;
    this.handed = false;
    this.buffer.length = 0;
    const waiting = this.waiting;
    if (waiting) {
      // (the frame that waits is answered by the inline model, replayed from the last checkpoint)
      this.waiting = null;
      this.timers.clearTimeout(waiting.timer);
      waiting.resolve(this.advance(waiting.to));
    }
  }

  protected snapshot(): unknown {
    return null;
  }

  // a packets message of the worker (the answer to a go): taken if of this epoch
  private arrive(m: Message): void {
    if (m.epoch !== this.epoch) {
      return;
    }
    const packets = m.packets as StepPacket<P>[];
    for (const p of packets) {
      this.buffer.push(p);
    }
    const cp = m.checkpoint as Checkpoint | undefined;
    if (cp) {
      this.checkpoints.push(cp);
      if (this.checkpoints.length > 3) {
        this.checkpoints.shift();
      }
    }
    this.settle();
  }

  // the frame that waits is answered when the worker's packets cover its steps
  private settle(): void {
    const waiting = this.waiting;
    if (waiting && this.covered(waiting.to)) {
      this.waiting = null;
      this.timers.clearTimeout(waiting.timer);
      waiting.resolve(this.deliver(waiting.to));
    }
  }

  // whether the buffer holds the packets of the steps (consumed, to], contiguous
  private covered(to: number): boolean {
    while (this.buffer.length && this.buffer[0]!.to <= this.consumed) {
      this.buffer.shift();
    }
    return this.buffer.length >= to - this.consumed && this.buffer.length > 0 && this.buffer[0]!.to === this.consumed + 1 && this.buffer[to - this.consumed - 1]!.to === to;
  }

  // the packets of the steps (consumed, to] taken from the buffer (covered), the steps consumed, the checkpoints and events they passed let go, the worker asked for the next
  private deliver(to: number): StepPacket<P>[] {
    this.lateRun = 0;
    const out = this.buffer.splice(0, to - this.consumed);
    this.consumed = to;
    while (this.checkpoints.length > 1 && this.checkpoints[1]!.step <= this.consumed) {
      this.checkpoints.shift();
    }
    const base = this.checkpoints.length ? this.checkpoints[0]!.step : 0;
    this.inputs = this.inputs.filter((e) => e.at > base);
    const slots = this.liveSlots();
    if (slots.length) {
      this.workerOf(slots[0]!)!.link.postMessage({ type: "go", epoch: this.epoch, to: this.consumed + this.lookahead });
    }
    return out;
  }

  // the inline model brought to the steps consumed (after a worker drove: restored from the last checkpoint and replayed with the events)
  private syncInline(): void {
    if (!this.replay) {
      return;
    }
    this.replay = false;
    let cp: Checkpoint | null = null;
    for (const c of this.checkpoints) {
      if (c.step <= this.consumed) {
        cp = c;
      }
    }
    if (cp) {
      this.model.restore(cp.snapshot);
      while (this.model.step < this.consumed) {
        this.applyEvents(this.model.step + 1);
        this.model.run();
      }
    }
    this.checkpoints.length = 0;
    this.inputs = this.inputs.filter((e) => e.at > this.consumed);
  }

  // the logged events due before step s, applied to the inline model
  private applyEvents(s: number): void {
    for (const e of this.inputs) {
      if (e.at === s) {
        this.model.event(e.payload);
      }
    }
  }

  // whether the inline model is behind (a worker lost: it is restored from the last checkpoint and replayed at the next advance): what the caller asks of the model meanwhile is to be
  // given as events, not done to it
  get replayPending(): boolean {
    return this.replay;
  }

  // whether the worker is the source of the packets now
  get isDriving(): boolean {
    return this.driving;
  }

  // a frame that does not wait for the worker (a mode that does not fork) while one is handed the state or driving: the worker is set aside, not lost (no backoff, still alive); the
  // inline model is made current at the next advance (restored from the last checkpoint and replayed) and the frames run inline; the next awaited frame hands the worker the state again
  suspend(): void {
    if (this.driving || this.handed) {
      if (this.driving) {
        this.replay = true;
      }
      this.driving = false;
      this.handed = false;
      this.buffer.length = 0;
      this.suspended = true;
      const waiting = this.waiting;
      if (waiting) {
        this.waiting = null;
        this.timers.clearTimeout(waiting.timer);
        waiting.resolve(this.advance(waiting.to));
      }
    }
  }

  // a model run outside the task (a frame of a mode that does not use it) has moved its step on: the steps consumed follow it, when the task is not waiting on a worker
  private resync(): void {
    if (!this.driving && !this.waiting && !this.replay && this.model.step !== this.consumed) {
      this.consumed = this.model.step;
      this.handedAt = -1;
    }
  }

  // the worker's packets contiguous with the steps consumed: from now on they are the source (the inline model's state at that step is the first checkpoint)
  private promote(worker: StepHandle | null): void {
    if (worker && this.handed && !this.driving && this.lookahead === 0 && this.handedAt === this.consumed) {
      // (no lookahead: the worker is at the step consumed, as handed it, and drives from now on)
      this.syncInline();
      this.checkpoints = [{ step: this.consumed, snapshot: this.model.snapshot() }];
      this.inputs = this.inputs.filter((e) => e.at > this.consumed);
      this.driving = true;
      return;
    }
    if (worker && this.handed && !this.driving) {
      while (this.buffer.length && this.buffer[0]!.to <= this.consumed) {
        this.buffer.shift();
      }
      if (this.buffer.length && this.buffer[0]!.to === this.consumed + 1) {
        this.syncInline();
        this.checkpoints = [{ step: this.consumed, snapshot: this.model.snapshot() }];
        this.inputs = this.inputs.filter((e) => e.at > this.consumed);
        this.driving = true;
      }
    }
  }

  // the packets of the steps (consumed, to]
  advance(to: number): StepPacket<P>[] {
    this.resync();
    if (to <= this.consumed) {
      return [];
    }
    const slots = this.liveSlots();
    const worker = slots.length ? this.workerOf(slots[0]!) : null;
    this.promote(worker);
    if (worker && this.driving) {
      if (this.covered(to)) {
        return this.deliver(to);
      }
      // (the worker has not the steps asked: lag; replayed inline from the last checkpoint, the worker counted lost)
      this.late++;
      this.replay = true;
      this.driving = false;
      this.handed = false;
      this.buffer.length = 0;
      this.lost(slots[0]!, "late");
    }
    this.syncInline();
    const out: StepPacket<P>[] = [];
    for (let s = this.consumed + 1; s <= to; s++) {
      this.applyEvents(s);
      out.push({ to: s, data: this.model.run() });
    }
    this.consumed = to;
    this.inputs = this.inputs.filter((e) => e.at > this.consumed);
    if (worker && this.handed) {
      // (the worker handed the state asked for the steps ahead of the ones consumed here, to take over)
      worker.link.postMessage({ type: "go", epoch: this.epoch, to: this.consumed + this.lookahead });
    }
    return out;
  }

  // the packets of the steps (consumed, to] as a promise, for a frame that waits for them (see the header): at once inline or when the worker's are there, else when they arrive
  advanceAsync(to: number, deadlineMs = 12): Promise<StepPacket<P>[]> {
    this.resync();
    if (to <= this.consumed) {
      return Promise.resolve([]);
    }
    const slots = this.liveSlots();
    const worker = slots.length ? this.workerOf(slots[0]!) : null;
    if (this.suspended && worker) {
      // (the worker set aside is handed the state again: the inline model made current first)
      this.suspended = false;
      this.syncInline();
      this.rehand(worker);
    }
    this.promote(worker);
    if (!worker || !this.driving || this.covered(to)) {
      return Promise.resolve(this.advance(to));
    }
    return new Promise<StepPacket<P>[]>((resolve) => {
      const timer = this.timers.setTimeout(() => {
        const waiting = this.waiting;
        if (!waiting) {
          return;
        }
        // (not answered in time: the frame is answered by the inline model, restored from the last checkpoint and replayed; the worker is kept, handed the state again, unless it has
        // been late LATE_LOST frames in a row: then it is counted lost)
        this.late++;
        this.lateRun++;
        this.replay = true;
        if (this.lateRun >= LATE_LOST) {
          this.lateRun = 0;
          this.lost(slots[0]!, "late");
          if (this.waiting) {
            this.waiting = null;
            resolve(this.advance(to));
          }
          return;
        }
        this.waiting = null;
        this.driving = false;
        this.handed = false;
        this.buffer.length = 0;
        const packets = this.advance(to);
        this.rehand(worker);
        resolve(packets);
      }, deadlineMs);
      this.waiting = { to, resolve, timer };
      worker.link.postMessage({ type: "go", epoch: this.epoch, to: to + this.lookahead });
    });
  }

  // a live input: applied before step consumed + eventDelay (or consumed + delay: 1 for a frame that waits for the worker's answer), inline and in the worker alike
  event(payload: unknown, delay: number = this.delay): void {
    this.resync();
    const at = this.consumed + delay;
    this.inputs.push({ at, payload });
    if (this.driving) {
      this.stale(at);
      const worker = this.workerOf(this.liveSlots()[0]!)!;
      worker.link.postMessage({ type: "event", epoch: ++this.epoch, at, payload });
      worker.link.postMessage({ type: "go", epoch: this.epoch, to: this.consumed + this.lookahead });
    } else if (this.handed) {
      // (a worker handed the state, not yet driving: told the event; its packets for the steps from it are stale)
      this.stale(at);
      const worker = this.workerOf(this.liveSlots()[0]!);
      if (worker) {
        worker.link.postMessage({ type: "event", epoch: ++this.epoch, at, payload });
        worker.link.postMessage({ type: "go", epoch: this.epoch, to: this.consumed + this.lookahead });
      }
    }
  }

  // the packets from step `at` are stale
  private stale(at: number): void {
    while (this.buffer.length && this.buffer[this.buffer.length - 1]!.to >= at) {
      this.buffer.pop();
    }
  }

  // the position moved: the buffered packets dropped, the model told (at once inline; in the worker as an event at the next step), consumed = step
  jump(step: number, payload: unknown): void {
    const slots = this.liveSlots();
    const worker = slots.length ? this.workerOf(slots[0]!) : null;
    if (worker && this.driving) {
      const at = this.consumed + 1;
      this.inputs.push({ at, payload });
      this.buffer.length = 0;
      worker.link.postMessage({ type: "event", epoch: ++this.epoch, at, payload });
      this.consumed = step;
      worker.link.postMessage({ type: "go", epoch: this.epoch, to: this.consumed + this.lookahead });
      return;
    }
    this.syncInline();
    this.model.event(payload);
    this.consumed = step;
    this.inputs.length = 0;
    this.checkpoints.length = 0;
    if (this.handed && worker) {
      // (a worker handed the old state: handed the new)
      this.buffer.length = 0;
      worker.link.postMessage({ type: "init", epoch: ++this.epoch, snapshot: this.model.snapshot(), events: [] });
      worker.link.postMessage({ type: "go", epoch: this.epoch, to: this.consumed + this.lookahead });
    }
  }
}

// the worker's side: the same model, answering init (the state taken), go (steps simulated up to a step, the packets in one answer) and event (rewound to the step's snapshot when
// it had gone past); keep: the steps' snapshots kept for the rewinds
export function serveStepped<P>(scope: TaskScope, make: () => StepModel<P>, options: { checkpointEvery?: number; keep?: number } = {}): void {
  const every = options.checkpointEvery || 24;
  // keep: the steps' snapshots kept for the rewinds (0: none, for a model too big to copy every step and asked only for the very next step, its events applying before it)
  const keep = options.keep === undefined ? 40 : options.keep;
  serveTask(
    scope,
    () => ({ model: make(), epoch: 0, snaps: new Map<number, unknown>(), pending: [] as LoggedEvent[] }),
    (state, message) => {
      const model = state.model;
      const note = () => {
        if (keep > 0) {
          state.snaps.set(model.step, model.snapshot());
          state.snaps.delete(model.step - keep);
        }
      };
      if (message.type === "init") {
        state.epoch = message.epoch as number;
        model.restore(message.snapshot);
        state.pending = (message.events as LoggedEvent[]).slice();
        state.snaps.clear();
        note();
        return null;
      }
      if (message.type === "event") {
        state.epoch = message.epoch as number;
        const at = message.at as number;
        if (model.step >= at) {
          const snap = state.snaps.get(at - 1);
          if (snap === undefined) {
            throw new Error(`no snapshot of step ${at - 1} to rewind to`);
          }
          model.restore(snap);
          for (const k of Array.from(state.snaps.keys())) {
            if (k > at - 1) {
              state.snaps.delete(k);
            }
          }
          state.pending = state.pending.filter((e) => e.at < at);
        }
        state.pending.push({ at, payload: message.payload });
        return null;
      }
      if (message.type === "go") {
        if (message.epoch !== state.epoch) {
          return null;
        }
        const to = message.to as number;
        const packets: StepPacket<P>[] = [];
        let checkpoint: Checkpoint | undefined;
        while (model.step < to) {
          let moved = false;
          for (const e of state.pending) {
            if (e.at === model.step + 1) {
              model.event(e.payload);
              moved = true;
            }
          }
          if (moved) {
            note();
          }
          const data = model.run();
          note();
          packets.push({ to: model.step, data });
          if (model.step % every === 0) {
            checkpoint = { step: model.step, snapshot: keep > 0 ? state.snaps.get(model.step) : model.snapshot() };
          }
        }
        state.pending = state.pending.filter((e) => e.at > model.step);
        return { reply: { type: "packets", epoch: state.epoch, packets, checkpoint }, transfer: [] };
      }
      return null;
    }
  );
}

M.SteppedTask = SteppedTask;
M.serveStepped = serveStepped;
