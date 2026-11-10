// HdrTask: the HDR output's presenter worker as a ThreadedTask (platform/threadedtask.ts), for HdrPath (engine/hdrpath.ts). The presenter is first made in the render worker's own
// thread (the thread backend, on the HDR canvas the page gave); this task makes a presenter worker as soon as it can, and HdrPath moves the picture to it when it is taken
// (onChange with the handle) and back to the thread backend when it is lost (onChange with null); the task makes it again after 20 ms, 40 ...
// A worker needs a canvas of its own (a canvas handed to a worker never comes back): host.spare() asks the page for a new one, host.dropSpare(id) gives it back when the worker is
// lost or the attempt failed. An attempt is: the spare canvas, the worker started, its presenter made on the canvas (init), and where the worker takes bitmaps the bitmap path's check
// (a known picture through it, every level compared): only then is the handle given. A host with no spare canvas (the renderer on the page: no HDR canvas at all) refuses.
//
// Changelog:
// 2026-11-10: new.
import { M } from "./core";
import { ClientTask } from "../platform/threadedtask";
import type { ClientTaskOptions, TaskWorker } from "../platform/threadedtask";
import { HdrWorker } from "../workers/hdrworker";
import type { HdrBackend, HdrHost } from "./hdrpath";

// a worker taken: its backend, the canvas it presents on (the page's element id) and the way a picture reaches it
export class HdrHandle implements TaskWorker {
  onFail: ((why: string | undefined) => void) | null;
  backend: HdrBackend;
  id: string;
  path: "bitmap" | "readback";
  private host: HdrHost;
  constructor(host: HdrHost, backend: HdrBackend, id: string, path: "bitmap" | "readback") {
    this.host = host;
    this.backend = backend;
    this.id = id;
    this.path = path;
    this.onFail = null;
    backend.onLost = (message) => {
      if (this.onFail) {
        this.onFail(message);
      }
    };
  }
  close(): void {
    this.backend.onLost = null;
    this.backend.destroy();
    if (this.host.dropSpare) {
      this.host.dropSpare(this.id);
    }
  }
}

export interface HdrTaskOptions extends ClientTaskOptions<HdrHandle> {
  host: HdrHost;
  // the tests' stand-ins: the worker's start, and the bitmap path's check picture (null: none can be made)
  startWorker?: (base: string, force: string) => Promise<HdrBackend | null>;
  makeCheck?: () => ImageBitmap | null;
}

export class HdrTask extends ClientTask<HdrHandle> {
  constructor(options: HdrTaskOptions) {
    const host = options.host;
    const startWorker = options.startWorker || ((base: string, force: string) => HdrWorker.start(base, { force }) as Promise<HdrBackend | null>);
    const makeCheck = options.makeCheck || (() => M.HdrCheck.make());
    const make = async (_slot: number, force: string): Promise<HdrHandle | null> => {
      const spare = host.spare ? await host.spare() : null;
      if (!spare) {
        return null;
      }
      const give = () => {
        if (host.dropSpare) {
          host.dropSpare(spare.id);
        }
      };
      const worker = await startWorker(host.base, force);
      if (!worker) {
        give();
        return null;
      }
      const why = await worker.init(spare.canvas);
      if (why !== "") {
        worker.destroy();
        give();
        return null;
      }
      let ok: boolean | null = null;
      const bitmap = worker.bitmap ? makeCheck() : null;
      if (bitmap) {
        ok = await worker.checkBitmap(bitmap, M.HdrPack.CHECK_WIDTH, M.HdrPack.CHECK_HEIGHT).catch(() => false);
      }
      return new HdrHandle(host, worker, spare.id, M.HdrOutput.pathFor(ok, worker.bitmap));
    };
    super(Object.assign({}, options, { force: options.force || (host.spare ? "" : "none"), makeWorker: make }));
  }
}

M.HdrTask = HdrTask;
