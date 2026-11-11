// The strikes' plan's worker: models/strikeplan.ts's plan run off the render thread (the worker part "strikeplan" of the bundle: src/index.ts routes it here; stateless: each request
// carries the generator's state). Its client is a JobTask (platform/jobtask.ts) made in src/index.ts: Lightning asks for the next strikes when its queue is short and takes the
// answer when it has arrived (at once while no worker is alive).
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { StrikePlan } from "../models/strikeplan";

function serve(): void {
  serveJob(workerScope(), StrikePlan.plan);
}

export const StrikePlanWorker = { serve };

M.StrikePlanWorker = StrikePlanWorker;
