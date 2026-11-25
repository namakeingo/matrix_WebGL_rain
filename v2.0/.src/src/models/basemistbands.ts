// The base mist job in temporal row bands over several tasks, modelled on the front shade's view-change bands (Feature P1, base mist worker, story B of the view-change banding plan; units.ui.basemistbands.ts; pure, importable in any thread). The whole job (every reduced
// column, 144 slices) is longer than the Parallax lead, so its answer was late and was run inline on the render thread. Here a view change's accumulation is made of BANDS: the rows of the FINEST class's lattice (the smallest factor of the table: the last slices of the
// chain, most of the nodes) are cut into bands, each band asked of a task a lead ahead and released in its own frame; every band job runs the coarser classes whole (they are tiny, and the finest class's first slice reads the previous slice bilinearly from them) and only its
// own rows of the finest class plus ONE guard row each side (the blend reads the array linearly: a core row sees same-jitter neighbours); only the HEAD band (the core starting at row 0) emits the coarser classes. All the bands of a pass share the jitter, and a row's
// n-th update is the pass n: after N passes a row equals the unbanded accumulation's, whatever the bands' arrival times.
// - PER_STEP_MS: the ms of a worker for one node-slice step of the job (the estimate; set from the job's measured cost)
// - cycle(rows, per) = ceil(rows / per); bandAt(frame, rows, per) -> { cycle, k, core: [a, b), from, to }: M.ShadeBands.bandAt's (cycle = k = the pass: the jitter index every band of a pass shares)
// - assign(rows, per, tasks): the bands of each task, band i on task i mod tasks; workMs(plans, stepsPerRow, coarseSteps, perStepMs = PER_STEP_MS) = the sum of ((to - from) stepsPerRow + coarseSteps) perStepMs (every band runs the coarse classes)
// - fits(leadMs, tasks, rows, per, stepsPerRow, coarseSteps): the busiest task's work is at most 0.8 of the lead; perFor(...): the fewest rows a band that fits (0: none does)
// - choose(state) -> 'none' | 'bands' | 'gpu': 'none' without a view change; 'gpu' for a settings, jump, switch or size change or no delay; 'bands' when the option is on, the tasks are warmed and the bands fit; else 'gpu'
// - Coalescer(same): ask(pose) -> 'start' | 'reuse' | 'wait'; released() -> the pending pose (it starts) or null; one set in flight at a time, the newest pose wins
// - finest(factors, covered, across, down) -> { factor, ra, rd }; bandInput(whole, plan) -> the whole input with band = { from, to, head }; headOnly(plan); joinBands(outputs, inputs, whole): each band's output written into the whole job's layout
// - stepsOf(factors, covered, across, down) -> { perRow, coarse }: the finest class's node-slice steps a row and the coarser classes' in all (the job's work, for fits)
//
// Changelog:
// 2026-11-25: workMs, fits and perFor take `cached` (the coarse part counted once for a task's bands) and perFor `inlineMs` (a band whose rows cost at most that where the lattice allows, else the lead-fraction rule).
// 2026-11-25: workMs, fits and perFor take the per-step cost (the run's measured one) and perFor the share of the lead a band may take.
// 2026-11-25: new (Feature P1, base mist worker, story B).
import { M } from "../engine/core";
import { ShadeBands } from "./shadebands";
import type { ShadeBand } from "./shadebands";
import { BaseLodRes } from "./baselodres";
import { BaseMistJob } from "./basemistjob";
import type { BaseMistInput } from "./basemistjob";

// (estimated from the job's cost before story A, 200 ms for 255 nodes x about 140 slices, and the 0.5 of it that story A measured: to be set from basemistjobcheapcost's figure)
const PER_STEP_MS = 0.003;
// the base mist's tasks the bands are spread over (the front shade's shadeaccum has 4: one 'basemist' JobTask, one worker, for each)
const TASKS = 3;

function cycle(rows: number, per: number): number {
  return ShadeBands.cycle(rows, per);
}

function bandAt(frame: number, rows: number, per: number): ShadeBand {
  return ShadeBands.bandAt(frame, rows, per);
}

function assign(rows: number, per: number, tasks: number): ShadeBand[][] {
  const out: ShadeBand[][] = Array.from({ length: Math.max(1, tasks) }, () => []);
  const count = cycle(rows, per);
  for (let i = 0; i < count; i++) {
    out[i % out.length]!.push(bandAt(i, rows, per));
  }
  return out;
}

function workMs(plans: ShadeBand[], stepsPerRow: number, coarseSteps: number, perStepMs = PER_STEP_MS, cached = false): number {
  let ms = 0;
  for (const p of plans) {
    ms += ((p.to - p.from) * stepsPerRow + (cached ? 0 : coarseSteps)) * perStepMs;
  }
  // (with the coarse part cached a task makes it once for all its bands of a pass)
  return cached && plans.length > 0 ? ms + coarseSteps * perStepMs : ms;
}

function fits(leadMs: number, tasks: number, rows: number, per: number, stepsPerRow: number, coarseSteps: number, perStepMs = PER_STEP_MS, cached = false): boolean {
  let most = 0;
  for (const plans of assign(rows, per, tasks)) {
    most = Math.max(most, workMs(plans, stepsPerRow, coarseSteps, perStepMs, cached));
  }
  return most <= 0.8 * leadMs;
}

// the most rows a band may have for the bands to fit the lead (the fewest bands) and for one band (its largest, the head's with its guard row) to take at most `bandShare` of the lead on a worker, at perStepMs a step: 0 when even one row does not
function perFor(leadMs: number, tasks: number, rows: number, stepsPerRow: number, coarseSteps: number, perStepMs = PER_STEP_MS, bandShare = 1, inlineMs = 0, cached = false): number {
  // (with the coarse part cached a band's own rows are its cost once the first band of its task has made the coarse part: the largest band whose rows, with its two guard rows, cost at most inlineMs where the lattice allows)
  if (cached && inlineMs > 0) {
    for (let per = rows; per >= 1; per--) {
      if (fits(leadMs, tasks, rows, per, stepsPerRow, coarseSteps, perStepMs, true) && (per + 2) * stepsPerRow * perStepMs <= inlineMs) {
        return per;
      }
    }
  }
  for (let per = rows; per >= 1; per--) {
    if (fits(leadMs, tasks, rows, per, stepsPerRow, coarseSteps, perStepMs, cached) && ((per + 2) * stepsPerRow + coarseSteps) * perStepMs <= bandShare * leadMs) {
      return per;
    }
  }
  return 0;
}

function choose(s: Record<string, boolean | number>): string {
  if (!s.moved) {
    return "none";
  }
  if (s.settings || s.jump || s.switched || s.size || !((s.delay as number) > 0)) {
    return "gpu";
  }
  return s.bands && s.warmed && s.fitsBands ? "bands" : "gpu";
}

class Coalescer<P = number> {
  inFlight = false;
  pending: P | null = null;
  started = 0;
  maxInFlight = 0;
  private flying: P | null = null;
  private same: (a: P, b: P) => boolean;

  constructor(same: (a: P, b: P) => boolean) {
    this.same = same;
  }

  ask(pose: P): string {
    if (!this.inFlight) {
      this.start(pose);
      return "start";
    }
    if (this.flying !== null && this.same(this.flying, pose)) {
      this.pending = null;
      return "reuse";
    }
    this.pending = pose;
    return "wait";
  }

  released(): P | null {
    if (this.pending !== null) {
      const pose = this.pending;
      this.pending = null;
      this.start(pose);
      return pose;
    }
    this.inFlight = false;
    this.flying = null;
    return null;
  }

  private start(pose: P): void {
    this.inFlight = true;
    this.flying = pose;
    this.started++;
    this.maxInFlight = Math.max(this.maxInFlight, 1);
  }
}

function finest(factors: ArrayLike<number>, covered: number, across: number, down: number): { factor: number; ra: number; rd: number } {
  const c = BaseLodRes.layoutOf(factors, covered, across, down).classes[0]!;
  return { factor: c.factor, ra: c.ra, rd: c.rd };
}

// the job's work: the finest class's node-slice steps a row (its columns x its slices) and the coarser classes' in all
function stepsOf(factors: ArrayLike<number>, covered: number, across: number, down: number): { perRow: number; coarse: number } {
  const classes = BaseLodRes.layoutOf(factors, covered, across, down).classes;
  let coarse = 0;
  for (let i = 1; i < classes.length; i++) {
    coarse += classes[i]!.ra * classes[i]!.rd * classes[i]!.slices.length;
  }
  return { perRow: classes[0]!.ra * classes[0]!.slices.length, coarse };
}

function headOnly(plan: ShadeBand): boolean {
  return plan.core[0] === 0;
}

function bandInput<I extends BaseMistInput>(whole: I, plan: ShadeBand): I & { band: { from: number; to: number; head: boolean } } {
  return { ...whole, band: { from: plan.from, to: plan.to, head: headOnly(plan) } };
}

// each band's output written into the whole job's layout: the finest class's rows from to to of every slice and both rays, the head's coarser classes whole
function joinBands(outputs: Uint16Array[], inputs: BaseMistInput[], whole: Uint16Array): void {
  outputs.forEach((out, n) => {
    const input = inputs[n]!, band = input.band!, view = input.view, covered = BaseMistJob.slicesCovered(input.cut);
    const lay = BaseLodRes.layoutOf(input.factors!, covered, view.across, view.down, band), all = BaseLodRes.layoutOf(input.factors!, covered, view.across, view.down);
    const bf = BaseLodRes.bandFactorOf(input.factors!);
    lay.classes.forEach((c) => {
      const w = all.classes.find((q) => q.factor === c.factor)!;
      if (c.factor === bf) {
        const rows = c.rd, plane = c.ra * 4;
        for (let j = 0; j < c.slices.length; j++) {
          for (let m = 0; m < 2; m++) {
            for (let y = 0; y < rows; y++) {
              const src = c.offset + (((j * 2 + m) * rows + y) * c.ra) * 4, dst = w.offset + (((j * 2 + m) * w.rd + band.from + y) * w.ra) * 4;
              whole.set(out.subarray(src, src + plane), dst);
            }
          }
        }
      } else {
        whole.set(out.subarray(c.offset, c.offset + c.length), w.offset);
      }
    });
  });
}

export const BaseMistBands = { PER_STEP_MS, TASKS, cycle, bandAt, assign, workMs, fits, perFor, choose, Coalescer, finest, stepsOf, headOnly, bandInput, joinBands };

M.BaseMistBands = BaseMistBands;
