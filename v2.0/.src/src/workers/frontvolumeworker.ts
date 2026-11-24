// The front volume's fresh reduced columns as a job done off the render thread (Feature P1, story P8a = Feature U2's story V6; units.ui.frontvolume.ts: the worker part "frontvolume" of the bundle, src/index.ts routes it
// here). The job is M.FrontVolumeJob.columns over an input that carries the view, the eye, the front's settings, the light and the jitter for the pose the view will show at the release frame; the noise is generated in the
// thread and the shade grid kept by version (M.FrontVolumeJob.Shipper sends each once). Its clients are the JobTasks (platform/jobtask.ts) made in src/index.ts, one for each band of rows (a JobTask drives one worker):
// Fog asks each band with the lead as the deadline, lays the bands into one output and releases it (M.FrontVolumeLead.Stream); a band a worker has not answered by the deadline is run inline by the JobTask's own rule.
// - NAME: the task's and the worker part's name
// - job(input): M.FrontVolumeJob.columns(input); pure apart from the thread's kept noise and grid; transferOf(output): [output.buffer]
// - asks(state): whether a frame asks the tasks: the option and the worker on, a lead over 0, an exact build already made, no settings or size change owed, an accumulating frame, a usable front grid, every worker warmed
// - bandsOf(rows, count): the [from, to) ranges of the reduced rows, count bands as even as possible
//
// Changelog:
// 2026-11-23: new (Feature P1, story P8a).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { FrontVolumeJob } from "../models/frontvolumejob";
import type { FrontVolumeInput } from "../models/frontvolumejob";

export interface FrontVolumeAsk {
  option: boolean;
  worker: boolean;
  delay: number;
  started: boolean;
  settings: boolean;
  size: boolean;
  accumulating: boolean;
  grid: boolean;
  warmed: boolean;
}

const NAME = "frontvolume";
// the tasks made for the bands of the job (one worker each, started when the option is on): the pool's workers but the reserved last one, at 4 workers
const BANDS = 3;

function job(input: FrontVolumeInput): Uint16Array {
  return FrontVolumeJob.columns(input);
}

function transferOf(output: Uint16Array): Transferable[] {
  return [output.buffer as ArrayBuffer];
}

function asks(s: FrontVolumeAsk): boolean {
  return s.option && s.worker && s.delay > 0 && s.started && !s.settings && !s.size && s.accumulating && s.grid && s.warmed;
}

function bandsOf(rows: number, count: number): number[][] {
  const n = Math.max(1, Math.min(count, rows)), out: number[][] = [];
  for (let i = 0; i < n; i++) {
    out.push([Math.floor((i * rows) / n), Math.floor(((i + 1) * rows) / n)]);
  }
  return out;
}

function serve(): void {
  serveJob(workerScope(), job, transferOf, (input) => FrontVolumeJob.prepare(input as { stretch: number; version: number }));
}

export const FrontVolumeWorker = { NAME, BANDS, job, transferOf, asks, bandsOf, serve };

M.FrontVolumeWorker = FrontVolumeWorker;
