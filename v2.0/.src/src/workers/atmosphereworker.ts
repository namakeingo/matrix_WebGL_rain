// The atmosphere's tables' worker: models/quality/atmosphere.ts's run off the render thread (the worker part "atmosphere" of the bundle: src/index.ts routes it here; stateless: each
// request carries the Orb and the Air tone). Its client is a JobTask (platform/jobtask.ts) made in src/index.ts: Fog.setLight asks for the tables when the settings stop moving
// (after the debounce) and takes the answer at a later update; no worker alive: the function run here. The answer is one Float32Array, its buffer transferred.
//
// Changelog:
// 2026-11-20: new (Feature S1, story A4).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { QualityAtmosphere } from "../models/quality/atmosphere";

function serve(): void {
  serveJob(workerScope(), QualityAtmosphere.run, (output) => [output.buffer as ArrayBuffer]);
}

export const AtmosphereWorker = { serve };

M.AtmosphereWorker = AtmosphereWorker;
