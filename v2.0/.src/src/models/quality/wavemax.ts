// The waves' highest-wave bound between two searches, pure: no GL, no page, importable in any thread. The max chain (effects/waves.ts findMax: the 4 x 4
// blocks' maxima, then the highest of all) runs only every refreshEvery frames with the level of detail on; the highest wave is read by the shaders
// only as a bound (the water's flat path, the strike-shadow reach, the glyphs' and the bolt's hidden-under-water tests: a larger value is always safe),
// so between two chains it is raised by this arithmetic:
//
//   H_used = (H_measured + newPush) x growth(stepsSince)        growth(n) = min(1 + GROWTH_PER_STEP n, GROWTH_CAP)
//
// - H_measured is the chain's result, describing the state after step S0 (the waves' step counter when it ran); stepsSince the steps taken since S0.
// - An impact is a push of the water's speed: its height is its push after one step and grows about linearly (about one push a step) to a peak of
//   7 to 60 pushes after 12 to 130 steps, so a chain that ran when an impact was young reads a fraction of the height it reaches. newPush is the sum of the
//   peaks (peakOf) of the impacts still young at S0 (Young.sum(S0)): applied before S0 and not yet past their peak, or applied after S0.
// - peakOf: 0.4 keep min(spread) (spread = max(size, 0.7 cell) each way, keep = (size / spread.x)(size / spread.z)): the replica of the scheme gives at most
//   0.75 P min(spread) / cdt for the push P = 0.4 cdt keep (cdt cancels), over sizes 0.1 to 6 x 5 cm, 4 to 40 m, STABLE 0.45 and 0.8.
// - youngSteps: 4 min(spread) / cdt + 4: the replica's peak comes by 2.7 min(spread) / cdt steps at the latest.
// - growth: the field with every impact past its peak rises by waves lining up by at most 1.036 after 1 step, 1.122 after 4, 1.234 after 8, 1.382 after 24,
//   then falls back (replica: STABLE 0.45 and 0.8, Ripples speeds 75 to 300, 0.25 to 64 impacts a m^2 a second, up to 220 steps; the largest single
//   ratio 1.737). No exact bound exists for the discrete scheme (it is not energy bounded), so the margin is measured: tests.wavemaxbound holds it in 100% of
//   the replica's pairs.
// - The blocks' maxima (blockTop) are local: no bound covers them between chains, so the chain runs every frame while a strike's shadow march reads them (due).
//
// Changelog:
// 2026-11-08: new.
import { M } from "../../engine/core";

// the seconds between two chains
const PERIOD = 1 / 30;
const GROWTH_PER_STEP = 0.04;
const GROWTH_CAP = 2;
const IMPACT_PUSH = 0.4;
const PEAK_RATIO = 1;
const YOUNG_RATIO = 4;
// the ledger's ring (steps of expiry it holds directly: longer ones go to the overflow list)
const RING = 4096;
const MASK = RING - 1;

// the frames between two chains: round(fps x PERIOD), at least 1; 1 with the level of detail off or no usable frame rate
function refreshEvery(framesPerSecond: number, lod: boolean = true): number {
  if (!lod || !(framesPerSecond > 0)) {
    return 1;
  }
  if (!Number.isFinite(framesPerSecond)) {
    return 1e6;
  }
  const every = Math.round(framesPerSecond * PERIOD);
  return every < 1 ? 1 : every;
}

// whether the chain runs this frame
function due(framesSince: number, every: number, blocksNeeded: boolean): boolean {
  return blocksNeeded || framesSince >= every;
}

function growth(steps: number): number {
  const g = 1 + GROWTH_PER_STEP * steps;
  return g < GROWTH_CAP ? g : GROWTH_CAP;
}

function bound(measured: number, stepsSince: number, newPush: number): number {
  return (measured + newPush) * growth(stepsSince);
}

// the most one impact's waves reach (m)
function peakOf(size: number, cellX: number, cellZ: number): number {
  const a = Math.max(size, cellX * 0.7);
  const b = Math.max(size, cellZ * 0.7);
  return PEAK_RATIO * IMPACT_PUSH * (size / a) * (size / b) * (a < b ? a : b);
}

// the steps after which an impact's height is past its peak
function youngSteps(cdt: number, size: number, cellX: number, cellZ: number): number {
  const a = Math.max(size, cellX * 0.7);
  const b = Math.max(size, cellZ * 0.7);
  return Math.ceil((YOUNG_RATIO * (a < b ? a : b)) / cdt) + 4;
}

// The young impacts' ledger: a ring indexed by the step an impact stops being young, and the running total of those still young; allocation-free (the
// overflow list only holds impacts young for RING steps or more). sum(measuredStep) never gets a step lower than the last one.
class Young {
  ring: Float64Array;
  over: number[];
  live: number;
  total: number;
  last: number;
  constructor() {
    this.ring = new Float64Array(RING);
    this.over = [];
    this.live = 0;
    this.total = 0;
    this.last = -1;
  }

  // an impact applied when `step` steps were done, young for `steps` more
  add(step: number, peak: number, steps: number): void {
    if (!(steps > 0)) {
      return;
    }
    const until = step + steps;
    if (until <= this.last) {
      return;
    }
    this.live++;
    this.total += peak;
    if (until - this.last >= RING) {
      this.over.push(until, peak);
    } else {
      this.ring[until & MASK] += peak;
    }
  }

  // the summed peaks of the impacts still young at measuredStep (those whose expiry step is after it)
  sum(measuredStep: number): number {
    if (measuredStep > this.last) {
      const from = this.last + 1;
      const n = Math.min(measuredStep - this.last, RING);
      for (let k = 0; k < n; k++) {
        const i = (from + k) & MASK;
        const v = this.ring[i]!;
        if (v !== 0) {
          this.total -= v;
          this.ring[i] = 0;
        }
      }
      this.last = measuredStep;
      const over = this.over;
      if (over.length) {
        let w = 0;
        for (let i = 0; i < over.length; i += 2) {
          if (over[i]! > measuredStep) {
            over[w++] = over[i]!;
            over[w++] = over[i + 1]!;
          } else {
            this.total -= over[i + 1]!;
          }
        }
        over.length = w;
      }
    }
    return this.total < 1e-18 ? 0 : this.total;
  }
}

export const WaveMax = { PERIOD, GROWTH_PER_STEP, GROWTH_CAP, refreshEvery, due, growth, bound, peakOf, youngSteps, Young };

M.WaveMax = WaveMax;
