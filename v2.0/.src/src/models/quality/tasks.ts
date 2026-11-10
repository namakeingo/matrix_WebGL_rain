// QualityTasks: the pure scheduling and buffer logic of the quality worker pool (no Worker, no GL, no page:
// importable in any thread).
// - build: one flat list of tasks over every effect's units, so no effect waits for another: each job's units cut
//   into contiguous chunks of at least minChunk (a job with fewer units than minChunk is one task), about
//   MIN_TASKS_PER_WORKER tasks a worker over all the jobs, the largest first (ties by effect, then start),
//   deterministic, every unit in exactly one task.
// - assign: the tasks of a frame given to the workers when there is no shared cursor (messages): the longest first,
//   each to the least loaded worker, ties to the lowest index.
// - workerCount: clamp(cores - 2, 1, WORKERS_MOST); the render worker and the page keep their cores.
// - Cursor and Done: atomic counters over an Int32Array (a SharedArrayBuffer's view). Workers pull the next task
//   index from the cursor until it passes the task count (dynamic load balancing); each task ends with
//   Done.finish, true for the last one (it wakes the waiter).
// - Ring: two result slots. The render thread waits for each frame's tasks before it draws, and the pool starts a
//   frame only when none is in flight (canStart), so frames never overlap: frame n writes slot n % 2 while the
//   reader reads the slot of the newest completed frame, which is the other one. A late frame is skipped, not
//   queued; the last result stays in use (isLate: LATE_MS).
// - layoutOf: the byte offsets and sizes of the one shared buffer (inputs snapshot, cursor, done counter, then for
//   each ring slot and effect its hidden mask and levels, a byte a unit), every region 16 byte aligned, so the
//   pool allocates once.
//
// Changelog:
// 2026-11-06: new.
// 2026-11-06: assign.
import { M } from "../../engine/core";
import type { QualityJob, QualityTask } from "./types";

const MIN_TASKS_PER_WORKER = 4;
const WORKERS_MOST = 6;
// the late bound after the warm-up: the measured round trip's p95 is 1.9 ms at 18684 units (6 workers), and 3 ms is
// still well inside the 8.33 ms of a frame at 120 fps
const LATE_MS = 3;
const INPUTS_BYTES = 4096;
const CONTROL_BYTES = 16;
const ALIGN = 16;

function padded(bytes: number): number {
  return Math.ceil(bytes / ALIGN) * ALIGN;
}

function workerCount(cores: number | undefined): number {
  if (typeof cores != "number" || !(cores >= 3)) {
    return 1;
  }
  return Math.max(1, Math.min(WORKERS_MOST, Math.floor(cores) - 2));
}

// how many chunks a job's units make at a chunk size (at least 1 for a job with units)
function chunksAt(units: number, chunk: number): number {
  return Math.max(1, Math.floor(units / chunk));
}

function build(jobs: QualityJob[], workers: number): QualityTask[] {
  const w = Math.max(1, Math.floor(workers) || 1);
  const live = jobs.filter((job) => job.units > 0);
  let total = 0;
  let capacity = 0;
  for (const job of live) {
    total += job.units;
    capacity += chunksAt(job.units, Math.max(1, job.minChunk));
  }
  const want = Math.min(MIN_TASKS_PER_WORKER * w, capacity);
  // the chunk size aimed at, made smaller until the jobs make enough tasks (never below a job's minChunk)
  let target = Math.max(1, Math.ceil(total / (MIN_TASKS_PER_WORKER * w)));
  const countAt = (size: number): number => {
    let n = 0;
    for (const job of live) {
      n += chunksAt(job.units, Math.max(size, job.minChunk, 1));
    }
    return n;
  };
  while (target > 1 && countAt(target) < want) {
    target = Math.max(1, Math.floor(target * 0.8));
  }
  const tasks: QualityTask[] = [];
  for (const job of live) {
    const n = chunksAt(job.units, Math.max(target, job.minChunk, 1));
    const base = Math.floor(job.units / n);
    const extra = job.units - base * n;
    let from = 0;
    for (let i = 0; i < n; i++) {
      const to = from + base + (i < extra ? 1 : 0);
      tasks.push({ effect: job.effect, from, to });
      from = to;
    }
  }
  tasks.sort((a, b) => b.to - b.from - (a.to - a.from) || a.effect - b.effect || a.from - b.from);
  return tasks;
}

// the tasks of a frame given to the workers without a shared cursor: longest first (ties by effect, then start), each
// to the least loaded worker (ties to the lowest index); each worker's list keeps the order the tasks were given in
function assign(tasks: QualityTask[], workers: number): QualityTask[][] {
  const w = Math.max(1, Math.floor(workers) || 1);
  const order = tasks.map((_, i) => i);
  order.sort((a, b) => tasks[b].to - tasks[b].from - (tasks[a].to - tasks[a].from) || tasks[a].effect - tasks[b].effect || tasks[a].from - tasks[b].from || a - b);
  const load = new Array<number>(w).fill(0);
  const owned: number[][] = [];
  for (let i = 0; i < w; i++) {
    owned.push([]);
  }
  for (const index of order) {
    let least = 0;
    for (let i = 1; i < w; i++) {
      if (load[i] < load[least]) {
        least = i;
      }
    }
    load[least] += tasks[index].to - tasks[index].from;
    owned[least].push(index);
  }
  return owned.map((list) => list.sort((a, b) => a - b).map((index) => tasks[index]));
}

// the shared task cursor: self-contained (no closure), so a worker can be given its source
const Cursor = {
  next: function (cursor: Int32Array): number {
    return Atomics.add(cursor, 0, 1);
  },
  reset: function (cursor: Int32Array): void {
    Atomics.store(cursor, 0, 0);
  },
};

const Done = {
  // one task finished: true when it was the last of total (the waiter is woken)
  finish(counter: Int32Array, total: number): boolean {
    const last = Atomics.add(counter, 0, 1) + 1 === total;
    if (last) {
      Atomics.notify(counter, 0);
    }
    return last;
  },
  complete(counter: Int32Array, total: number): boolean {
    return Atomics.load(counter, 0) >= total;
  },
  reset(counter: Int32Array): void {
    Atomics.store(counter, 0, 0);
  },
};

const Ring = {
  SLOTS: 2,
  // the slot frame seq is written into
  writeSlot(seq: number): number {
    return seq % 2;
  },
  // the slot of the newest completed frame (-1: none yet)
  readSlot(newestCompleted: number): number {
    return newestCompleted < 0 ? -1 : newestCompleted % 2;
  },
  // a frame starts only when none is in flight
  canStart(inFlight: number): boolean {
    return inFlight < 0;
  },
};

function isLate(startedMs: number, nowMs: number, boundMs: number = LATE_MS): boolean {
  return nowMs - startedMs > boundMs;
}

interface Region {
  offset: number;
  bytes: number;
}

function layoutOf(effectUnits: number[], ringSlots: number) {
  let at = 0;
  const take = (bytes: number): Region => {
    const region = { offset: at, bytes };
    at += padded(bytes);
    return region;
  };
  const inputs = take(INPUTS_BYTES);
  const cursor = take(CONTROL_BYTES);
  const done = take(CONTROL_BYTES);
  const slots: { hidden: Region; levels: Region }[][] = [];
  for (let s = 0; s < Math.max(1, ringSlots); s++) {
    slots.push(effectUnits.map((units) => ({ hidden: take(units), levels: take(units) })));
  }
  return { inputs, cursor, done, slots, total: at };
}

export const QualityTasks = {
  MIN_TASKS_PER_WORKER,
  WORKERS_MOST,
  LATE_MS,
  INPUTS_BYTES,
  build,
  assign,
  workerCount,
  Cursor,
  Done,
  Ring,
  isLate,
  layoutOf,
};

M.QualityTasks = QualityTasks;
