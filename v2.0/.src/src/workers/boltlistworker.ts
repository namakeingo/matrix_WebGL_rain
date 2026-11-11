// The bolt's piece lists' worker: models/boltlist.ts's run off the render thread (the worker part "boltlist" of the bundle: src/index.ts routes it here). Its client is a JobTask
// (platform/jobtask.ts) made in src/index.ts, asked by Bolt.fork with the frame's exact inputs and awaited by the frame's draw. The worker holds each slot's segments as the last
// job gave them (BoltList.run: sent only when a slot's items change); a job for a slot it does not hold is answered `missing`, and Bolt works that frame inline and sends them again.
// The masks are handed back as transferables.
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { BoltList } from "../models/boltlist";
import type { BoltListInput, BoltListOutput } from "../models/boltlist";

function serve(): void {
  serveJob<BoltListInput, BoltListOutput>(workerScope(), BoltList.run, (output) => output.masks.filter((m): m is Uint8Array => !!m).map((m) => m.buffer));
}

export const BoltListWorker = { serve };

M.BoltListWorker = BoltListWorker;
