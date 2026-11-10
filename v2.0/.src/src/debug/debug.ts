// Debug mode's readouts and views, their pure parts (no GL, no page):
// - AudioLevels.of(array, out): what a Wallpaper Engine audio array (128 values: 64 bins of the
//   left channel, then 64 of the right) carries: its loudness (the mean of all of them), each
//   channel's mean, the bass (bins 0-7), mid (8-31) and treble (32-63) of both channels, the peak
//   and its bin (0-63; -1 in silence). AudioLevels.Rate: arrays a second over the last second.
// - PerfMeter: frames counted with their script's time; summary(now): the frames a second and the
//   mean script ms since the last summary. PerfMeter.gpuOf(ms): the GPU's ms a frame, the sum of
//   the GPU guard's passes' last times (null when none is known).
// - RatePacer: events at a rate from the animation frames' times, each due one period after the
//   one before's due time (not after the frame that made it), so the rate holds on any display.
// - FrameHealth: the frames' health from the animation frames and the frames drawn: dropped frames
//   (a frame sent while the GPU was still busy with the frame before: shown late or replaced,
//   never at its time), missed frames (due by the frame rate's limit, or by the display's refresh
//   when that is slower, never drawn: the animation frame came late) and stalls (a gap between two
//   frames over both STALL_MS and STALL_FRAMES frame intervals: the scene jumps ahead by it, a
//   visible hitch); gap() marks a break (a pause, the page hidden, Freeze) not counted.
// - Nearness: the Nearness view's grey of a real distance d from the eye: 1 at the rain's nearest
//   distance (Font size Max's), 0 at its furthest (Min's), logarithmic between (a font size is
//   1 / distance): clamp(ln(far / d) / ln(far / near)); 0 where the ray meets no surface. The same
//   rule in GLSL (nearnessOf).
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/debug/ (was engine/debug.js).
// 2026-11-04: FrameHealth (dropped and missed frames, stalls).
// 2026-11-05: RatePacer (the simulated music's pacing: 24 a second at 122 Hz, now 30).
import { M } from "../engine/core";
import NEARNESS_SOURCE from "../shaders/debug/nearness.glsl";
import type { AudioLevelsReport } from "../platform/support";

const BINS = 64;
// the bands' last bins (exclusive)
const BASS_END = 8;
const MID_END = 32;
// the window of AudioLevels.Rate (ms), and the most arrays it keeps the times of
const RATE_WINDOW = 1000;
const RATE_MOST = 256;

// the arrays a second over the last RATE_WINDOW ms (AudioLevels.Rate)
export interface AudioRate {
  times: Float64Array<ArrayBuffer>;
  count: number;
  next: number;
  add(now: number): void;
  perSecond(now: number): number;
}

// AudioLevels: of(), and the class Rate (set on it after it)
export interface AudioLevelsApi {
  of(array: ArrayLike<number>, out: AudioLevelsReport): AudioLevelsReport;
  Rate: new () => AudioRate;
}

export const AudioLevels = {
  of(array: ArrayLike<number>, out: AudioLevelsReport): AudioLevelsReport {
    let left = 0;
    let right = 0;
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let peak = 0;
    let peakBin = -1;
    for (let f = 0; f < BINS; f++) {
      const l = array[f];
      const r = array[f + BINS];
      left += l;
      right += r;
      const both = l + r;
      if (f < BASS_END) {
        bassSum += both;
      } else if (f < MID_END) {
        midSum += both;
      } else {
        trebleSum += both;
      }
      if (l > peak) {
        peak = l;
        peakBin = f;
      }
      if (r > peak) {
        peak = r;
        peakBin = f;
      }
    }
    out.loudness = (left + right) / (2 * BINS);
    out.left = left / BINS;
    out.right = right / BINS;
    out.bass = bassSum / (2 * BASS_END);
    out.mid = midSum / (2 * (MID_END - BASS_END));
    out.treble = trebleSum / (2 * (BINS - MID_END));
    out.peak = peak;
    out.peakBin = peakBin;
    return out;
  },
} as AudioLevelsApi;

// the times of the arrays in a ring (no allocation)
AudioLevels.Rate = class {
  next: number;
  count: number;
  times: Float64Array<ArrayBuffer>;
  constructor() {
    this.times = new Float64Array(RATE_MOST);
    this.count = 0;
    this.next = 0;
  }

  add(now: number) {
    this.times[this.next] = now;
    this.next = (this.next + 1) % RATE_MOST;
    this.count = Math.min(RATE_MOST, this.count + 1);
  }

  perSecond(now: number) {
    let n = 0;
    for (let k = 0; k < this.count; k++) {
      const t = this.times[(this.next - 1 - k + RATE_MOST) % RATE_MOST];
      if (now - t > RATE_WINDOW || t > now) {
        break;
      }
      n++;
    }
    return (n * 1000) / RATE_WINDOW;
  }
};

export class PerfMeter {
  out: { fps: number; scriptMs: number; frames: number };
  scriptSum: number;
  frames: number;
  since: number | null;
  constructor() {
    this.since = null;
    this.frames = 0;
    this.scriptSum = 0;
    this.out = { fps: 0, scriptMs: 0, frames: 0 };
  }

  frame(now: number, scriptMs: number) {
    this.frames++;
    this.scriptSum += scriptMs;
  }

  // since the last summary (or the first frame's time); starts the next window at now
  summary(now: number): { fps: number; scriptMs: number; frames: number } {
    const out = this.out;
    const elapsed = this.since === null ? 0 : now - this.since;
    out.frames = this.frames;
    out.fps = elapsed > 0 ? (this.frames * 1000) / elapsed : 0;
    out.scriptMs = this.frames ? this.scriptSum / this.frames : 0;
    this.since = now;
    this.frames = 0;
    this.scriptSum = 0;
    return out;
  }

  static gpuOf(ms: Readonly<Record<string, number>>): number | null {
    let sum = 0;
    let any = false;
    for (const name in ms) {
      sum += ms[name];
      any = true;
    }
    return any ? sum : null;
  }
}

// events `rate` a second from the animation frames' times: due(now) says whether one is due at this
// frame. Each is due one period after the one before's due time, so the rate holds on any display
// (made from the last frame's time it was quantised by the refresh: an event every 5th frame at
// 122 Hz, 24 a second for 30). One event a call at most; after a gap of more than a period the
// pace starts again from now (no burst making the time up). A frame up to EARLY ms before an
// event's due time makes it (a display whose refresh is the rate's period lands on the due times
// to within rounding, and an event skipped is never made up: one a frame at most).
export class RatePacer {
  static readonly EARLY = 1;
  period: number;
  next: number | null;
  constructor(rate: number) {
    this.period = 1000 / rate;
    this.next = null;
  }

  due(now: number): boolean {
    if (this.next === null || now - this.next > this.period) {
      this.next = now + this.period;
      return true;
    }
    if (now < this.next - RatePacer.EARLY) {
      return false;
    }
    this.next += this.period;
    return true;
  }

  reset(): void {
    this.next = null;
  }
}

// FrameHealth.summary's counts: totals since the start (or reset), and in the window since the
// last summary (...Last); refreshMs: the display's refresh as measured (ms, 0 before any)
export interface FrameHealthReport {
  dropped: number;
  missed: number;
  stalls: number;
  longestStallMs: number;
  droppedLast: number;
  missedLast: number;
  stallsLast: number;
  refreshMs: number;
  // where the gaps come from (ms): in the last window the longest time between animation frames' callbacks and the
  // longest frame's own work; and the last missed frame: its gap, the longest callback gap since the frame before,
  // and the work of the frame before and of that frame
  animGapLast: number;
  workLast: number;
  lastMissGap: number;
  lastMissAnimGap: number;
  lastMissPrevWork: number;
  lastMissWork: number;
  // the last dropped frame (sent while the GPU was still busy with the one before): when it happened (ms since the first
  // frame counted) and how long the frame before's fence had been pending (ms); 0 and 0 where none
  lastDropAfterMs: number;
  lastDropPendingMs: number;
  // how long each frame's GPU work took to finish (ms, to the animation frame that found its fence passed): the longest in the
  // last window, and the longest in the first START_MS after the first frame counted (a page that starts among others has its
  // frames wait behind their programs finishing in the one GPU process)
  latencyLast: number;
  startLatencyMs: number;
  // every frame's latency since the start of the counting, by the first of LATENCY_EDGES above it (the last count: all above)
  latencyHist: number[];
}

export class FrameHealth {
  // a stall: a gap over both STALL_MS and STALL_FRAMES frame intervals
  static readonly STALL_MS = 100;
  static readonly STALL_FRAMES = 3;
  // the start-up whose longest GPU latency is kept apart (ms after the first frame counted)
  static readonly START_MS = 3000;
  // the latency histogram's edges (ms): the display's frame (8.33 ms at 120 Hz) among them
  static readonly LATENCY_EDGES: readonly number[] = [2, 4, 6, 8.33, 12, 17, 25, 50];
  out: FrameHealthReport;
  // (each set by reset(), from the constructor)
  // the last animation frame's and frame's times (null: none since the start or a break)
  lastAnimation!: number | null;
  lastFrame!: number | null;
  // the least time between animation frames in this window, and the last window's (the refresh)
  leastNow!: number;
  refreshMs!: number;
  dropped!: number;
  missed!: number;
  stalls!: number;
  longestStallMs!: number;
  droppedWindow!: number;
  missedWindow!: number;
  stallsWindow!: number;
  // the longest callback gap since the last frame and in this window; the longest frame work in this window; the work of
  // the frame before
  animGap!: number;
  // the time of the first frame counted (null: none yet), what the last dropped frame's lastDrop* are measured from
  firstFrameAt!: number | null;
  // the longest GPU latency in this window and in the start-up
  latencyWindow!: number;
  startLatency!: number;
  animGapWindow!: number;
  workWindow!: number;
  prevWork!: number;
  constructor() {
    this.out = { dropped: 0, missed: 0, stalls: 0, longestStallMs: 0, droppedLast: 0, missedLast: 0, stallsLast: 0, refreshMs: 0, animGapLast: 0, workLast: 0, lastMissGap: 0, lastMissAnimGap: 0, lastMissPrevWork: 0, lastMissWork: 0, lastDropAfterMs: 0, lastDropPendingMs: 0, latencyLast: 0, startLatencyMs: 0, latencyHist: new Array(FrameHealth.LATENCY_EDGES.length + 1).fill(0) };
    this.reset();
  }

  reset(): void {
    this.lastAnimation = null;
    this.lastFrame = null;
    this.leastNow = Infinity;
    this.refreshMs = 0;
    this.dropped = 0;
    this.missed = 0;
    this.stalls = 0;
    this.longestStallMs = 0;
    this.droppedWindow = 0;
    this.missedWindow = 0;
    this.stallsWindow = 0;
    this.animGap = 0;
    this.animGapWindow = 0;
    this.workWindow = 0;
    this.prevWork = 0;
    this.firstFrameAt = null;
    this.latencyWindow = 0;
    this.startLatency = 0;
    this.out.latencyHist.fill(0);
    this.out.lastDropAfterMs = 0;
    this.out.lastDropPendingMs = 0;
  }

  // a break (paused, hidden, frozen): the next frames' gaps start after it
  gap(): void {
    this.lastAnimation = null;
    this.lastFrame = null;
  }

  // every animation frame (the display's refreshes)
  animationFrame(now: number): void {
    if (this.lastAnimation !== null && now > this.lastAnimation) {
      const gap = now - this.lastAnimation;
      this.leastNow = Math.min(this.leastNow, gap);
      if (gap > this.animGap) {
        this.animGap = gap;
      }
      if (gap > this.animGapWindow) {
        this.animGapWindow = gap;
      }
    }
    this.lastAnimation = now;
  }

  // a frame drawn: intervalMs the frame rate's limit's (1000 / frames a second); gpuBusy: the
  // frame before still being processed by the GPU when this one was sent
  // (pendingMs: how long the fence of the frame before had been pending when this frame was sent, for a dropped one)
  frame(now: number, intervalMs: number, gpuBusy: boolean, workMs = 0, pendingMs = 0): void {
    if (this.firstFrameAt === null) {
      this.firstFrameAt = now;
    }
    if (gpuBusy) {
      this.dropped++;
      this.droppedWindow++;
      this.out.lastDropAfterMs = now - this.firstFrameAt;
      this.out.lastDropPendingMs = pendingMs;
    }
    if (this.lastFrame !== null) {
      const refresh = this.refreshMs > 0 ? this.refreshMs : this.leastNow === Infinity ? 0 : this.leastNow;
      const due = Math.max(intervalMs, refresh);
      const gap = now - this.lastFrame;
      const missed = Math.max(0, Math.round(gap / due) - 1);
      this.missed += missed;
      this.missedWindow += missed;
      if (missed > 0) {
        const out = this.out;
        out.lastMissGap = gap;
        out.lastMissAnimGap = this.animGap;
        out.lastMissPrevWork = this.prevWork;
        out.lastMissWork = workMs;
      }
      if (gap > FrameHealth.STALL_MS && gap > FrameHealth.STALL_FRAMES * due) {
        this.stalls++;
        this.stallsWindow++;
        this.longestStallMs = Math.max(this.longestStallMs, gap);
      }
    }
    this.lastFrame = now;
    this.animGap = 0;
    this.prevWork = workMs;
    if (workMs > this.workWindow) {
      this.workWindow = workMs;
    }
  }

  // a frame's GPU work finished: ms after it was sent, found at time `now`
  latency(now: number, ms: number): void {
    const edges = FrameHealth.LATENCY_EDGES;
    let bucket = 0;
    while (bucket < edges.length && ms >= edges[bucket]) {
      bucket++;
    }
    this.out.latencyHist[bucket]++;
    if (ms > this.latencyWindow) {
      this.latencyWindow = ms;
    }
    if (this.firstFrameAt !== null && now - this.firstFrameAt <= FrameHealth.START_MS && ms > this.startLatency) {
      this.startLatency = ms;
    }
  }

  // the counts (out, renewed in place); starts the next window
  summary(now: number): FrameHealthReport {
    if (this.leastNow !== Infinity) {
      this.refreshMs = this.leastNow;
    }
    this.leastNow = Infinity;
    const out = this.out;
    out.dropped = this.dropped;
    out.missed = this.missed;
    out.stalls = this.stalls;
    out.longestStallMs = this.longestStallMs;
    out.droppedLast = this.droppedWindow;
    out.missedLast = this.missedWindow;
    out.stallsLast = this.stallsWindow;
    out.refreshMs = this.refreshMs;
    out.animGapLast = this.animGapWindow;
    out.latencyLast = this.latencyWindow;
    out.startLatencyMs = this.startLatency;
    this.latencyWindow = 0;
    out.workLast = this.workWindow;
    this.animGapWindow = 0;
    this.workWindow = 0;
    this.droppedWindow = 0;
    this.missedWindow = 0;
    this.stallsWindow = 0;
    return out;
  }
}

export const Nearness = {
  of(d: number, near: number, far: number): number {
    if (!(d > 0) || d === Infinity) {
      return 0;
    }
    const v = Math.log(far / d) / Math.log(far / near);
    return Math.min(1, Math.max(0, v));
  },
  // (uNear, uFar: the rain's nearest and furthest distances; d <= 0: no surface)
  GLSL: NEARNESS_SOURCE,
};

M.AudioLevels = AudioLevels;
M.PerfMeter = PerfMeter;
M.RatePacer = RatePacer;
M.FrameHealth = FrameHealth;
M.Nearness = Nearness;
