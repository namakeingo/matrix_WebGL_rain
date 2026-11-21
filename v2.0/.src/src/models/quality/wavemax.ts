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
// - peakOf: 0.8 x 0.4 keep min(spread) (spread = max(size, 0.7 cell) each way, keep = (size / spread.x)(size / spread.z)): the replica of the scheme on the
//   1024 x 512 grid gives at most 0.64 P min(spread) / cdt for the push P = 0.4 cdt keep (cdt cancels), over sizes 0.1 to 6 x 5 cm, 4 to 40 m, STABLE 0.45 and
//   0.8, so PEAK_RATIO 0.8 keeps a margin of 1.25 (the replica's highest share of peakOf is 0.797). The grid's far edge absorbs the waves over its last 32 rows
//   (from 26 m on, 58% of the water's area between 3 and 40 m; the replica's peak at 40 m is 0.15 of peakOf): a place-blind bound cannot follow that, it stays
//   above (a larger value is safe).
// - youngSteps: 3 min(spread) / cdt + 4: the replica's peak comes by 2.1 min(spread) / cdt steps at the latest (the latest peak step is 0.63 of youngSteps).
// - growth: the field with every impact past its peak rises by waves lining up by at most 1.037 after 1 step, 1.09 after 2, 1.18 after 3, 1.24 after 5,
//   1.37 after 7, 1.43 after 18 (the largest), then falls back (replica on the 1024 x 512 grid, cells twice as wide: STABLE 0.45 and 0.8, Ripples speeds 75
//   to 300, 0.25 to 64 impacts a m^2 a second, up to 86 steps after a chain). growth(n) = min(1 + 0.08 n, 1.8) is above each of those by at least 4% (after 3
//   steps 1.24 over 1.18) and the cap leaves 26% over the largest. No exact bound exists for the discrete scheme (it is not energy bounded), so the margin
//   is measured: tests.wavemaxbound holds it in 100% of the replica's pairs.
// - The blocks' maxima (blockTop) are local: no bound covers them between chains, so the chain runs every frame while a strike's shadow march reads them (due).
//
// Changelog:
// 2026-11-08: new.
// 2026-11-20: both grids: growth, bound, peakOf and youngSteps take a trailing `full` (the 2048 x 1024 grid, default false = the 1024 x 512 production grid); the full grid keeps its earlier constants
//             (FULL_GROWTH_PER_STEP 0.04, FULL_GROWTH_CAP 2, PEAK_RATIO 1, YOUNG_RATIO 4: its replica, see below), the 1024 x 512 grid's are those of 2026-11-18.
// 2026-11-18: recalibrated on the 1024 x 512 grid (was 2048 x 1024): GROWTH_PER_STEP 0.08 (was 0.04), GROWTH_CAP 1.8 (was 2), PEAK_RATIO 0.8 (was 1), YOUNG_RATIO 3 (was 4)
import { M } from "../../engine/core";

// the seconds between two chains
const PERIOD = 1 / 30;
const GROWTH_PER_STEP = 0.08;
const GROWTH_CAP = 1.8;
// the full 2048 x 1024 grid's constants (the replica of the scheme on that grid: the highest wave after n steps over the one at 0 at most 1.036 after 1 step, 1.122 after 4, 1.234 after 8,
// 1.382 after 24, the largest single ratio 1.737; one impact's peak at most 0.75 P min(spread) / cdt, by 2.7 min(spread) / cdt steps)
const FULL_GROWTH_PER_STEP = 0.04;
const FULL_GROWTH_CAP = 2;
const FULL_PEAK_RATIO = 1;
const FULL_YOUNG_RATIO = 4;
const IMPACT_PUSH = 0.4;
const PEAK_RATIO = 0.8;
const YOUNG_RATIO = 3;
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

function growth(steps: number, full: boolean = false): number {
  const g = 1 + (full ? FULL_GROWTH_PER_STEP : GROWTH_PER_STEP) * steps;
  const cap = full ? FULL_GROWTH_CAP : GROWTH_CAP;
  return g < cap ? g : cap;
}

function bound(measured: number, stepsSince: number, newPush: number, full: boolean = false): number {
  return (measured + newPush) * growth(stepsSince, full);
}

// the most one impact's waves reach (m)
function peakOf(size: number, cellX: number, cellZ: number, full: boolean = false): number {
  const a = Math.max(size, cellX * 0.7);
  const b = Math.max(size, cellZ * 0.7);
  return (full ? FULL_PEAK_RATIO : PEAK_RATIO) * IMPACT_PUSH * (size / a) * (size / b) * (a < b ? a : b);
}

// the steps after which an impact's height is past its peak
function youngSteps(cdt: number, size: number, cellX: number, cellZ: number, full: boolean = false): number {
  const a = Math.max(size, cellX * 0.7);
  const b = Math.max(size, cellZ * 0.7);
  return Math.ceil(((full ? FULL_YOUNG_RATIO : YOUNG_RATIO) * (a < b ? a : b)) / cdt) + 4;
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

export const WaveMax = { PERIOD, GROWTH_PER_STEP, GROWTH_CAP, FULL_GROWTH_PER_STEP, FULL_GROWTH_CAP, refreshEvery, due, growth, bound, peakOf, youngSteps, Young };

M.WaveMax = WaveMax;
