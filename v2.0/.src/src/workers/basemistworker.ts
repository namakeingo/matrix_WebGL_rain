// The base mist's fresh reduced columns of a view change as a job done off the render thread (Feature P1, story P6 = Feature U3's story M7; units.ui.basemistworker.ts: the worker part "basemist" of the bundle, src/index.ts
// routes it here). The job is M.BaseMistJob.columns over an input that carries the view, the eye, the light and the jitter for the pose the view will show at the release frame; the noise and the shade grid are kept by the
// thread by version (M.BaseMistJob.Shipper sends each once). Its client is a JobTask (platform/jobtask.ts) made in src/index.ts at the wallpaper's start (inline until its worker is made): Fog.forkBase asks it with the lead as the
// deadline and Fog.update releases the answers (M.BaseMistLead.Stream); a worker that has not answered by the deadline is replaced by the same pure function run inline, the ThreadedTask rule's own fallback. The task is its own:
// it does not use the quality pool.
// - NAME: the task's and the worker part's name
// - job(input): M.BaseMistJob.columns(input); pure apart from the thread's kept noise and grid
// - transferOf(output): [output.buffer]
// - asks(state): whether a frame asks the task: the option and the worker option on, a lead over 0, an exact build already made, no settings or size change owed, a view change being accumulated
//
// Changelog:
// 2026-11-23: serve() answers the warm message (BaseMistJob.prepare: the noise generated before the first job).
// 2026-11-23: new (Feature P1, story P6 = M7).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { BaseMistJob } from "../models/basemistjob";
import type { BaseMistInput } from "../models/basemistjob";

export interface BaseMistAsk {
  option: boolean;
  worker: boolean;
  delay: number;
  started: boolean;
  settings: boolean;
  size: boolean;
  accumulating: boolean;
}

const NAME = "basemist";

function job(input: BaseMistInput): Uint16Array {
  return BaseMistJob.columns(input);
}

function transferOf(output: Uint16Array): Transferable[] {
  return [output.buffer as ArrayBuffer];
}

function asks(s: BaseMistAsk): boolean {
  return s.option && s.worker && s.delay > 0 && s.started && !s.settings && !s.size && s.accumulating;
}

function serve(): void {
  serveJob(workerScope(), job, transferOf, (input) => BaseMistJob.prepare(input as { stretch: number; version: number; grid?: Uint16Array; gridVersion?: number }));
}

export const BaseMistWorker = { NAME, job, transferOf, asks, serve };

M.BaseMistWorker = BaseMistWorker;
