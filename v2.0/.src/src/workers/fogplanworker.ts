// The fog's frame plan's worker: models/fogplan.ts's plan run off the render thread (the worker part "fogplan" of the bundle: src/index.ts routes it here; stateless: each request
// carries the fog's frame values and the state it keeps between frames). Its client is a JobTask (platform/jobtask.ts) made in src/index.ts: Fog.fork asks for the frame's plan with
// the frame's exact inputs and the frame's draw waits for the answer (no worker alive: the plan run here).
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { FogPlan } from "../models/fogplan";

function serve(): void {
  serveJob(workerScope(), FogPlan.plan);
}

export const FogPlanWorker = { serve };

M.FogPlanWorker = FogPlanWorker;
