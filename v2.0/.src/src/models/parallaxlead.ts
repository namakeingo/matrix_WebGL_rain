// ParallaxLead: the parallax pose with the Parallax delay as a lead time, as a pure model (no GL, no page, importable in any thread; Feature U3, story M7a). The shipped parallax (models/mouseparallax.ts) smooths the cursor
// with a time constant of 1.5 s x the delay. Here the displayed pose is the cursor of `lead` ago smoothed by a shorter time constant, so a compute that depends on the pose is started when the pose is known (the cursor's event)
// and has the lead to finish before the frame that shows it; the mean lag, lead + smoothing, is today's time constant.
// - LEAD_PER_DELAY 1 and SMOOTH_PER_SETTING 0.5 (seconds a unit of Parallax smoothing; with both settings equal, 1 + 0.5 = MouseParallax.DELAY_SECONDS); SETTLED: a pose this close to its target is on it
// - lead(delay), smoothing(setting): seconds, 0 at 0; Parallax delay is only the lead, Parallax smoothing only the exponential's time constant
// - Follower: delay (the lead), smoothing (the time constant), x, y (the normalised pose, -1 to 1), moving; point(ms, x, y) the cursor from `ms` on (clamped as MouseParallax.point), leave(ms); at(ms) the pose displayed at `ms`, exact in continuous time: the sum of the step
//   responses of the cursor's changes, each starting a lead after its event, the exponential of the smoothing's time constant (the cursor's value at ms - lead with the delay 0); it depends on the events up to ms - lead only, so
//   it is known a lead ahead; step(ms) sets x, y to it (within SETTLED of the delayed cursor: on it) and says whether they changed, and forgets the events whose response has settled (at(ms) is for ms from the last step on);
//   peek(ms) the pose step(ms) would set (the snap included), without changing anything: the pose of a time ahead, known from the events up to ms - lead; reset(), seed(x, y)
// - releaseFrame(times, askIndex, delay): the first frame at or after the ask's time + the lead (times.length when none; the ask frame itself with the lead 0); times compared with a tolerance of TOLERANCE_MS
// - Lane(fn, delay): the schedule of a compute: ask(ms, input) its id; take(ms, ready) the asks whose release time (ask + lead) has come, in order, each once: its output is ready(id)'s when the worker has it, else fn(input) run
//   here ({ id, askMs, releaseMs, output, by: 'worker' | 'inline' }); pending() the asks not taken
//
// Changelog:
// 2026-11-23: new (Feature U3, story M7a).
// 2026-11-23: moving is against the cursor's last place (an event not yet due is still to be shown); folding a settled event keeps at() bit for bit (the pose and the cursor kept apart).
// 2026-11-23: the smoothing is its own input of the Follower (smoothing, SMOOTH_PER_SETTING; was SMOOTH_PER_DELAY x delay); peek(ms).
import { M } from "../engine/core";

const LEAD_PER_DELAY = 1;
const SMOOTH_PER_SETTING = 0.5;
const SETTLED = 1e-4;
const TOLERANCE_MS = 1e-6;
// a response this many time constants old is whole (e^-40 under 1e-17)
const WHOLE = 40;

const clamp = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

function lead(delay: number): number {
  return LEAD_PER_DELAY * delay;
}

function smoothing(setting: number): number {
  return SMOOTH_PER_SETTING * setting;
}

interface CursorEvent {
  t: number;
  x: number;
  y: number;
}

class Follower {
  delay = 0.1;
  smoothing = 0.1;
  x = 0;
  y = 0;
  moving = false;
  // the cursor before the first event, and the events not yet settled (in time order)
  // (x0, y0: the pose before the events, summed with the arithmetic of at(); cx0, cy0: the cursor's value there)
  private x0 = 0;
  private y0 = 0;
  private cx0 = 0;
  private cy0 = 0;
  private events: CursorEvent[] = [];

  point(ms: number, x: number, y: number): void {
    this.events.push({ t: ms, x: clamp(x), y: clamp(y) });
  }

  leave(ms: number): void {
    this.point(ms, 0, 0);
  }

  // the pose displayed at ms
  at(ms: number): { x: number; y: number } {
    const L = lead(this.delay) * 1000;
    const tau = smoothing(this.smoothing) * 1000;
    let x = this.x0, y = this.y0, px = this.cx0, py = this.cy0;
    for (const e of this.events) {
      const due = e.t + L;
      if (due > ms) {
        break;
      }
      if (tau > 0) {
        const f = 1 - Math.exp(-(ms - due) / tau);
        x += (e.x - px) * f;
        y += (e.y - py) * f;
      }
      px = e.x;
      py = e.y;
    }
    return tau > 0 ? { x, y } : { x: px, y: py };
  }

  // the cursor as the pose follows it at ms: its value at ms - lead
  private target(ms: number): { x: number; y: number } {
    const L = lead(this.delay) * 1000;
    let x = this.cx0, y = this.cy0;
    for (const e of this.events) {
      if (e.t + L > ms) {
        break;
      }
      x = e.x;
      y = e.y;
    }
    return { x, y };
  }

  // the pose at ms within SETTLED of the delayed cursor snapped onto it, with the cursor itself
  private settle(ms: number): { x: number; y: number; tx: number; ty: number } {
    const p = this.at(ms), t = this.target(ms);
    return { x: Math.abs(t.x - p.x) < SETTLED ? t.x : p.x, y: Math.abs(t.y - p.y) < SETTLED ? t.y : p.y, tx: t.x, ty: t.y };
  }

  // the pose step(ms) would set, nothing changed
  peek(ms: number): { x: number; y: number } {
    const r = this.settle(ms);
    return { x: r.x, y: r.y };
  }

  step(ms: number): boolean {
    const L = lead(this.delay) * 1000;
    const tau = smoothing(this.smoothing) * 1000;
    while (this.events.length > 0 && this.events[0]!.t + L + (tau > 0 ? WHOLE * tau : 0) <= ms) {
      const e = this.events.shift()!;
      // (a response this old is whole: its factor is exactly 1, so folding it with that factor keeps at() bit for bit what it was with the event kept)
      if (tau > 0) {
        this.x0 += (e.x - this.cx0) * 1;
        this.y0 += (e.y - this.cy0) * 1;
      } else {
        this.x0 = e.x;
        this.y0 = e.y;
      }
      this.cx0 = e.x;
      this.cy0 = e.y;
    }
    const { x, y } = this.settle(ms);
    const changed = x !== this.x || y !== this.y;
    this.x = x;
    this.y = y;
    // (moving: not on the cursor's last place, so an event not yet due keeps the pose moving: the worker is asked again until it is shown)
    const last = this.events.length > 0 ? this.events[this.events.length - 1]! : { x: this.cx0, y: this.cy0 };
    this.moving = x !== last.x || y !== last.y;
    return changed;
  }

  reset(): void {
    this.x0 = 0;
    this.y0 = 0;
    this.cx0 = 0;
    this.cy0 = 0;
    this.events = [];
    this.x = 0;
    this.y = 0;
    this.moving = false;
  }

  seed(x: number, y: number): void {
    this.reset();
    this.x0 = this.cx0 = this.x = clamp(x);
    this.y0 = this.cy0 = this.y = clamp(y);
  }
}

function releaseFrame(times: number[], askIndex: number, delay: number): number {
  const due = times[askIndex]! + lead(delay) * 1000 - TOLERANCE_MS;
  for (let f = askIndex; f < times.length; f++) {
    if (times[f]! >= due) {
      return f;
    }
  }
  return times.length;
}

interface Taken<O> {
  id: number;
  askMs: number;
  releaseMs: number;
  output: O;
  by: string;
}

class Lane<I, O> {
  delay: number;
  private fn: (input: I) => O;
  private queue: { id: number; askMs: number; releaseMs: number; input: I }[] = [];
  private serial = 0;

  constructor(fn: (input: I) => O, delay: number) {
    this.fn = fn;
    this.delay = delay;
  }

  ask(ms: number, input: I): number {
    const id = ++this.serial;
    this.queue.push({ id, askMs: ms, releaseMs: ms + lead(this.delay) * 1000, input });
    return id;
  }

  take(ms: number, ready: (id: number) => O | undefined): Taken<O>[] {
    const out: Taken<O>[] = [];
    const keep: typeof this.queue = [];
    for (const q of this.queue) {
      if (q.releaseMs > ms + TOLERANCE_MS) {
        keep.push(q);
        continue;
      }
      const given = ready(q.id);
      out.push({ id: q.id, askMs: q.askMs, releaseMs: q.releaseMs, output: given !== undefined ? given : this.fn(q.input), by: given !== undefined ? "worker" : "inline" });
    }
    this.queue = keep;
    return out;
  }

  pending(): number {
    return this.queue.length;
  }
}

export const ParallaxLead = { LEAD_PER_DELAY, SMOOTH_PER_SETTING, SETTLED, TOLERANCE_MS, lead, smoothing, Follower, releaseFrame, Lane };

M.ParallaxLead = ParallaxLead;
