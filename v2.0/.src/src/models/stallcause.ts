// StallCause: what a stall (a frame over a limit) was spent on, as a pure model (no GL, no page, importable in any thread; story P11; units.ui.stallcause.ts). The wallpaper times the main-thread sections of each frame (its effects' advances and
// updates, the reflection, the water, the rain, the splashes, the bolt, the text, the bloom, the shade grid's fill and uploads, the front volume's worker frame) into a Probe's fixed slots (no allocation: a slot is an index made once, a
// section's ms is added at its end) and counts events (a view change asked, ...); a Recorder is given each frame's ms with the probe's figures and names for each frame over the limit the largest section or the UNACCOUNTED remainder (the
// frame's ms minus the sum of its sections: the GPU, the driver or the compositor's wait), and counts the stalls by cause.
// - UNACCOUNTED: the remainder's name ('unaccounted'); LIMIT_MS 17 (the 4K budget); WINDOW_MS 60000 (the overlay's window)
// - attribute(frame, limitMs): null when frame.frameMs <= limitMs, else { frameMs, cause, causeMs, accounted, unaccounted, events }; a frame is { at, frameMs, sections: { name: ms }, events?: { name: count } }. The cause is the largest of the
//   sections and the remainder, a section winning a tie with the remainder and the first of equal sections (insertion order) a tie between sections; unaccounted = max(0, frameMs - accounted)
// - Probe: section(name) -> slot, event(name) -> slot (made once, by name), add(slot, ms), count(slot, n), clear(); pending() -> { sections, events } of the frame in progress (for the tests). A section's ms are its OWN: what is attributed inside it is
//   not counted twice: push() / pop(slot) bracket a region (the ms between them minus the ms attributed to sections inside it), and mark() / lap(slot) cut a function into consecutive parts (each lap the ms since the last mark or lap minus those attributed inside it)
// - probe: the wallpaper's own Probe, shared by the effects (they import this module)
// - Recorder(limitMs, windowMs): record(frame) -> the verdict or null; recordProbe(at, frameMs, probe) the same from a probe's slots, which are cleared (the verdict's objects are made for a stall only); frames; total() the stalls by cause since the start or
//   reset; counts(nowMs) the same within windowMs of nowMs; over(ms) the frames over ms (of the last RING frames); p99() (the nearest rank) and max() of the same; moves() the sum of the events named 'viewChange'; movesPerSecond() the moves over the span
//   between the first and the last frame's `at` (0 under two frames); line(nowMs) the overlay's line ('  Stall causes: rain 2, bolt 1 (last 60 s)', or '  Stall causes: none (last 60 s)'); reset()
//
// Changelog:
// 2026-11-24: new (story P11).
import { M } from "../engine/core";

const UNACCOUNTED = "unaccounted";
const LIMIT_MS = 17;
const WINDOW_MS = 60000;
// the frames' ms kept for over(), p99() and max(): the last RING
const RING = 32768;
const MOVE_EVENT = "viewChange";

export interface StallFrame {
  at: number;
  frameMs: number;
  sections: Record<string, number>;
  events?: Record<string, number>;
}

export interface StallVerdict {
  frameMs: number;
  cause: string;
  causeMs: number;
  accounted: number;
  unaccounted: number;
  events: Record<string, number>;
}

// the cause among the named sections and the remainder: the verdict's fields (a section wins a tie with the remainder, the first of equal sections a tie between sections)
function verdictOf(frameMs: number, names: ArrayLike<string>, ms: ArrayLike<number>, count: number, evNames: ArrayLike<string>, ev: ArrayLike<number>, evCount: number): StallVerdict {
  let accounted = 0;
  let cause = UNACCOUNTED;
  let causeMs = -1;
  for (let i = 0; i < count; i++) {
    const v = ms[i]!;
    if (v <= 0) {
      continue;
    }
    accounted += v;
    if (v > causeMs) {
      causeMs = v;
      cause = names[i]!;
    }
  }
  const unaccounted = Math.max(0, frameMs - accounted);
  if (unaccounted > causeMs) {
    cause = UNACCOUNTED;
    causeMs = unaccounted;
  }
  const events: Record<string, number> = {};
  for (let i = 0; i < evCount; i++) {
    if (ev[i]! !== 0) {
      events[evNames[i]!] = ev[i]!;
    }
  }
  return { frameMs, cause, causeMs, accounted, unaccounted, events };
}

function attribute(frame: StallFrame, limitMs: number): StallVerdict | null {
  if (!(frame.frameMs > limitMs)) {
    return null;
  }
  const names = Object.keys(frame.sections);
  const ev = frame.events || {};
  const evNames = Object.keys(ev);
  return verdictOf(
    frame.frameMs,
    names,
    names.map((n) => frame.sections[n]!),
    names.length,
    evNames,
    evNames.map((n) => ev[n]!),
    evNames.length,
  );
}

// the frame's timed sections and events in fixed slots: a slot is made once by its name; adding is an array write
export class Probe {
  names: string[] = [];
  ms = new Float64Array(64);
  eventNames: string[] = [];
  events = new Float64Array(16);
  // the ms attributed to sections so far (never reset: a region's own time is its elapsed time minus the growth of this)
  total = 0;
  private markAt = 0;
  private markTotal = 0;
  private stackAt = new Float64Array(32);
  private stackTotal = new Float64Array(32);
  private depth = 0;

  section(name: string): number {
    let i = this.names.indexOf(name);
    if (i < 0) {
      i = this.names.length;
      if (i >= this.ms.length) {
        const grown = new Float64Array(this.ms.length * 2);
        grown.set(this.ms);
        this.ms = grown;
      }
      this.names.push(name);
    }
    return i;
  }

  event(name: string): number {
    let i = this.eventNames.indexOf(name);
    if (i < 0) {
      i = this.eventNames.length;
      if (i >= this.events.length) {
        const grown = new Float64Array(this.events.length * 2);
        grown.set(this.events);
        this.events = grown;
      }
      this.eventNames.push(name);
    }
    return i;
  }

  add(slot: number, ms: number): void {
    this.ms[slot] += ms;
    this.total += ms;
  }

  // a region begun: its own ms go to the slot popped with
  push(): void {
    this.stackAt[this.depth] = performance.now();
    this.stackTotal[this.depth] = this.total;
    this.depth = Math.min(this.depth + 1, 31);
  }

  pop(slot: number): void {
    this.depth = Math.max(0, this.depth - 1);
    const own = performance.now() - this.stackAt[this.depth]! - (this.total - this.stackTotal[this.depth]!);
    if (own > 0) {
      this.add(slot, own);
    }
  }

  // the start of the consecutive parts of a function, and the end of one part: the ms since the last mark or lap, minus those attributed to sections inside it, go to the slot
  mark(): void {
    this.markAt = performance.now();
    this.markTotal = this.total;
  }

  lap(slot: number): void {
    const now = performance.now();
    const own = now - this.markAt - (this.total - this.markTotal);
    if (own > 0) {
      this.add(slot, own);
    }
    this.markAt = now;
    this.markTotal = this.total;
  }

  count(slot: number, n = 1): void {
    this.events[slot] += n;
  }

  clear(): void {
    this.ms.fill(0, 0, this.names.length);
    this.events.fill(0, 0, this.eventNames.length);
  }

  // the frame in progress's sections and events by name (those not zero)
  pending(): { sections: Record<string, number>; events: Record<string, number> } {
    const sections: Record<string, number> = {};
    const events: Record<string, number> = {};
    this.names.forEach((n, i) => {
      if (this.ms[i]! > 0) {
        sections[n] = this.ms[i]!;
      }
    });
    this.eventNames.forEach((n, i) => {
      if (this.events[i]! !== 0) {
        events[n] = this.events[i]!;
      }
    });
    return { sections, events };
  }
}

const probe = new Probe();

export class Recorder {
  limitMs: number;
  windowMs: number;
  frames = 0;
  private causes = new Map<string, number>();
  // the stalls (a verdict's cause and the frame's `at`), those within the window kept
  private stalls: { at: number; cause: string }[] = [];
  private ring = new Float64Array(RING);
  private moveCount = 0;
  private first = NaN;
  private lastAt = NaN;

  constructor(limitMs: number = LIMIT_MS, windowMs: number = WINDOW_MS) {
    this.limitMs = limitMs;
    this.windowMs = windowMs;
  }

  private note(at: number, frameMs: number, verdict: StallVerdict | null, moves: number): StallVerdict | null {
    this.ring[this.frames % RING] = frameMs;
    this.frames++;
    this.moveCount += moves;
    if (this.first !== this.first) {
      this.first = at;
    }
    this.lastAt = at;
    if (verdict) {
      this.causes.set(verdict.cause, (this.causes.get(verdict.cause) || 0) + 1);
      this.stalls.push({ at, cause: verdict.cause });
    }
    const keep = at - this.windowMs;
    let drop = 0;
    while (drop < this.stalls.length && this.stalls[drop]!.at < keep) {
      drop++;
    }
    if (drop > 0) {
      this.stalls.splice(0, drop);
    }
    return verdict;
  }

  record(frame: StallFrame): StallVerdict | null {
    const events = frame.events;
    return this.note(frame.at, frame.frameMs, attribute(frame, this.limitMs), events && events[MOVE_EVENT] ? events[MOVE_EVENT]! : 0);
  }

  // a frame from a probe's slots (cleared after): nothing is allocated unless the frame is a stall
  recordProbe(at: number, frameMs: number, p: Probe): StallVerdict | null {
    const moveSlot = p.eventNames.indexOf(MOVE_EVENT);
    const moves = moveSlot >= 0 ? p.events[moveSlot]! : 0;
    const verdict = frameMs > this.limitMs ? verdictOf(frameMs, p.names, p.ms, p.names.length, p.eventNames, p.events, p.eventNames.length) : null;
    p.clear();
    return this.note(at, frameMs, verdict, moves);
  }

  total(): Record<string, number> {
    const out: Record<string, number> = {};
    this.causes.forEach((n, cause) => {
      out[cause] = n;
    });
    return out;
  }

  counts(nowMs: number): Record<string, number> {
    const out: Record<string, number> = {};
    const from = nowMs - this.windowMs;
    for (const s of this.stalls) {
      if (s.at >= from && s.at <= nowMs) {
        out[s.cause] = (out[s.cause] || 0) + 1;
      }
    }
    return out;
  }

  private kept(): number {
    return Math.min(this.frames, RING);
  }

  over(ms: number): number {
    let n = 0;
    for (let i = 0; i < this.kept(); i++) {
      if (this.ring[i]! > ms) {
        n++;
      }
    }
    return n;
  }

  p99(): number {
    const n = this.kept();
    if (n === 0) {
      return 0;
    }
    const sorted = Array.from(this.ring.subarray(0, n)).sort((a, b) => a - b);
    return sorted[Math.ceil(0.99 * n) - 1]!;
  }

  max(): number {
    let m = 0;
    for (let i = 0; i < this.kept(); i++) {
      m = Math.max(m, this.ring[i]!);
    }
    return m;
  }

  moves(): number {
    return this.moveCount;
  }

  movesPerSecond(): number {
    if (this.frames < 2 || !(this.lastAt > this.first)) {
      return 0;
    }
    return this.moveCount / ((this.lastAt - this.first) / 1000);
  }

  line(nowMs: number): string {
    const counts = this.counts(nowMs);
    const names = Object.keys(counts).sort((a, b) => counts[b]! - counts[a]! || (a < b ? -1 : a > b ? 1 : 0));
    const window = `(last ${Math.round(this.windowMs / 1000)} s)`;
    return names.length === 0 ? `  Stall causes: none ${window}` : `  Stall causes: ${names.map((n) => `${n} ${counts[n]}`).join(", ")} ${window}`;
  }

  reset(): void {
    this.frames = 0;
    this.causes.clear();
    this.stalls.length = 0;
    this.ring.fill(0);
    this.moveCount = 0;
    this.first = NaN;
    this.lastAt = NaN;
  }
}

export const StallCause = { UNACCOUNTED, LIMIT_MS, WINDOW_MS, attribute, Probe, probe, Recorder };

M.StallCause = StallCause;
