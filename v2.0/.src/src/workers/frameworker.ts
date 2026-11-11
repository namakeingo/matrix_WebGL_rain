// The frame's camera numbers' worker: models/frame.ts's compute run off the render thread (the worker part "frame" of the bundle: src/index.ts routes it here; stateless: each request
// carries the camera's and the clock's inputs of the frame). Its client is a JobTask (platform/jobtask.ts) made in src/index.ts: the frame asks for the matrices of its own inputs after
// its advance (the frame's fork: Camera.fork) and its draw waits for the answer in the same frame (the function run here when no worker is alive or it is late).
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { Frame } from "../models/frame";

function serve(): void {
  serveJob(workerScope(), (input) => Frame.compute(input as Parameters<typeof Frame.compute>[0]));
}

export const FrameWorker = { serve };

M.FrameWorker = FrameWorker;
