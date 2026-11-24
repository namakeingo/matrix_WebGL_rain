// The band worker as the default handler of VIEW CHANGES on the shipped front shade path (Effect.lod on, the quality pool) (Feature P1, story P8d; units.ui.shadepoolbands.ts; pure, importable in any thread). The steady refresh stays the pool's sweep;
// a view change needs only the cells the new boxes add (M.ShadeDelta) and those cells get their data from the 'shadeaccum' tasks: at the lead the WHOLE reduced grid is asked as bands (M.ShadeBands) shared by the tasks, uploaded in one texSubImage3D
// and blended at weight 1 into the delta cells under a scissor; the sweep then takes the delta draws first. One set of bands in flight at a time. Order of handlers: the bands, the pool's delta worker, today's whole-grid GPU bake.
// - PER_LAYER_MS: the measured ms of a worker for a reduced layer (117 ms for the 48)
// - choose(state): 'none' | 'bands' | 'delta' | 'gpu' (see the units: the option, warmed tasks and a set that fits the lead, then the pool delta when it fits, else the whole-grid bake; a settings, jump, switch or size change or the delay 0 is the bake)
// - assign(total, core, tasks): per task the bands (M.ShadeBands.bandAt) it runs, band i on task i mod tasks; workMs(plans): the uploaded layers x PER_LAYER_MS; fits(leadMs, tasks, total, core): the busiest task's work is at most 0.8 of the lead
// - Coalescer(same): ask(pose) -> 'start' | 'reuse' | 'wait'; released() -> the pending pose (it starts) or null; one set in flight at a time, the newest ordered pose wins
// - fillPlan(delta): { draw, rect } for each rectangle of each draw's delta; joinBands(outputs, plans, layerHalves, whole): each band's output written at its first layer (the bands' guard layers are the neighbours' own)
// - workMsLod(plans): the work of the plans with the LOD's strides (M.ShadeLod.reducedFraction: the uploaded layers x PER_LAYER_MS x the share of each layer's nodes baked); fits(leadMs, tasks, total, core, lod?): with lod the busiest task's strided work
//
// Changelog:
// 2026-11-24: workMsLod and fits(.., lod) (the band job's LOD lattice, Feature P1, story P10); priorityDraws and takeoverFrames removed (the sweep's priority was removed).
// 2026-11-24: new (Feature P1, story P8d).
import { M } from "../engine/core";
import { ShadeBands } from "./shadebands";
import type { ShadeBand } from "./shadebands";
import { ShadeLod } from "./shadelod";

const PER_LAYER_MS = 2.45;

interface ChooseState {
  bands: boolean;
  warmed: boolean;
  fitsBands: boolean;
  delta: boolean;
  fitsDelta: boolean;
  delay: number;
  moved: boolean;
  settings: boolean;
  jump: boolean;
  switched: boolean;
  size: boolean;
}

function choose(s: ChooseState): string {
  if (!s.moved) {
    return "none";
  }
  if (s.settings || s.jump || s.switched || s.size || !(s.delay > 0)) {
    return "gpu";
  }
  if (s.bands && s.warmed && s.fitsBands) {
    return "bands";
  }
  return s.delta && s.fitsDelta ? "delta" : "gpu";
}

function assign(total: number, core: number, tasks: number): ShadeBand[][] {
  const out: ShadeBand[][] = Array.from({ length: Math.max(1, tasks) }, () => []);
  const count = ShadeBands.cycle(total, core);
  for (let i = 0; i < count; i++) {
    out[i % out.length]!.push(ShadeBands.bandAt(i, total, core));
  }
  return out;
}

function workMs(plans: ShadeBand[]): number {
  let layers = 0;
  for (const p of plans) {
    layers += p.to - p.from;
  }
  return layers * PER_LAYER_MS;
}

function workMsLod(plans: ShadeBand[]): number {
  let ms = 0;
  for (const p of plans) {
    for (let j = p.from; j < p.to; j++) {
      ms += PER_LAYER_MS * ShadeLod.reducedFraction(j);
    }
  }
  return ms;
}

function fits(leadMs: number, tasks: number, total: number, core: number, lod?: boolean): boolean {
  let most = 0;
  for (const plans of assign(total, core, tasks)) {
    most = Math.max(most, lod ? workMsLod(plans) : workMs(plans));
  }
  return most <= 0.8 * leadMs;
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

function fillPlan(delta: number[][][]): { draw: number; rect: number[] }[] {
  const out: { draw: number; rect: number[] }[] = [];
  delta.forEach((rects, draw) => {
    for (const rect of rects) {
      out.push({ draw, rect });
    }
  });
  return out;
}

function joinBands(outputs: Uint16Array[], plans: ShadeBand[], layerHalves: number, whole: Uint16Array): void {
  outputs.forEach((out, i) => {
    whole.set(out, plans[i]!.from * layerHalves);
  });
}

export const ShadeViewBands = { PER_LAYER_MS, choose, assign, workMs, workMsLod, fits, Coalescer, fillPlan, joinBands };

M.ShadeViewBands = ShadeViewBands;
