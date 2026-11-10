// Workers: Web Workers made for any of the wallpaper's jobs, the same way (the bolt's shapes, the
// scene's one-off work, the renderer): every one runs the bundle itself, told which part it runs
// by its name (src/index.ts). Workers.start(base, job) makes one and checks it answers a ping in
// time; base: the bundle's URL (or the wallpaper's folder, its dist/bundle.js then); job { name
// (the worker's part: "render", "bolt", "scene"), force ("blob": not by its URL; "none": no
// worker) }. Tried in turn: by the bundle's URL; from a Blob of the bundle's registered body's own
// text (the bundle registers itself, Matrix3DFactory("bundle", body): no fetch, so it works where
// a page cannot fetch its files, e.g. from a local file); from a Blob of the bundle fetched.
// Resolves { worker, kind ("url", "blob", "fetched"), url (a Blob's, to revoke), pong (its answer
// to the ping) }, or null. In a Blob the bundle is registered again (Matrix3DFactory), so a worker
// made from one can make its own workers from a Blob too. Workers.threads(): what the page offers
// for threads, for the readout. The ping: the worker answers { type: "ping" } with
// { type: "pong", ... } (before its warm-up).
//
// Changelog:
// 2026-11-04: every worker made from the one bundle, by its name (was a script of its own for
//   each, or the scripts' registered bodies).
import { M } from "../engine/core";
import type { ThreadsReport } from "./support";

// how long a new worker has to answer (ms)
const ANSWER_MS = 4000;

// the bundle's own file, from the wallpaper's folder
const BUNDLE = "dist/bundle.js";

export interface WorkerJob {
  name: string;
  force?: string;
}

// a worker made and answering: how it was made, its Blob's URL (to revoke), its answer to the ping
export interface MadeWorker {
  worker: Worker;
  kind: "url" | "blob" | "fetched";
  url: string | null;
  // (each kind of worker answers with what it can do: RenderLink.usable reads the renderer's)
  pong: { type: "pong"; webgl2?: boolean };
}

// a worker made by make(), checked to answer a ping in time, or null
const made = (make: () => Worker, kind: MadeWorker["kind"], url: string | null): Promise<MadeWorker | null> => {
  let worker: Worker;
  try {
    worker = make();
  } catch (error) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.terminate();
      resolve(null);
    }, ANSWER_MS);
    worker.onmessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "pong") {
        clearTimeout(timer);
        worker.onmessage = null;
        worker.onerror = null;
        resolve({ worker, kind, url, pong: event.data });
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      clearTimeout(timer);
      worker.terminate();
      resolve(null);
    };
    worker.postMessage({ type: "ping" });
  });
};

// the registering function the bundle starts with (the same text as webpack.config.ts's)
const FACTORY = "((name, body) => { (self.Matrix3DFactories = self.Matrix3DFactories || {})[name] = body; body(); })";

// a Blob worker from a text (the bundle's body registered again, or its file), after the globals
// the bundle expects
const fromText = (text: string, name: string, kind: MadeWorker["kind"]): Promise<MadeWorker | null> => {
  if (typeof Blob !== "function" || typeof URL === "undefined" || !URL.createObjectURL) {
    return Promise.resolve(null);
  }
  const parts = [`'use strict';\nself.window = self;\nself.Matrix3DFactory = self.Matrix3DFactory || ${FACTORY};\n`, text + "\n"];
  const url = URL.createObjectURL(new Blob(parts, { type: "text/javascript" }));
  return made(() => new Worker(url, { name }), kind, url).then((result) => {
    if (!result) {
      URL.revokeObjectURL(url);
    }
    return result;
  });
};

export const Workers = {
  // the bundle's URL from a base given (the bundle's URL itself, or the wallpaper's folder)
  scriptOf(base: string): string {
    return /\.js([?#].*)?$/.test(base) ? base : base + BUNDLE;
  },

  start(base: string, job: WorkerJob): Promise<MadeWorker | null> {
    const force = job.force || "";
    if (force === "none" || typeof Worker !== "function") {
      return Promise.resolve(null);
    }
    const script = Workers.scriptOf(base);
    const byUrl = force === "blob" ? Promise.resolve(null) : made(() => new Worker(script, { name: job.name }), "url", null);
    return byUrl
      .then((result) => {
        if (result) {
          return result;
        }
        // (the bundle's registered body's own text: registered again and run)
        const body = self.Matrix3DFactories && self.Matrix3DFactories.bundle;
        if (typeof body !== "function") {
          return null;
        }
        return fromText(`self.Matrix3DFactory("bundle", ${body.toString()});`, job.name, "blob");
      })
      .then((result) => {
        if (result || typeof fetch !== "function") {
          return result;
        }
        return fetch(script)
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(script))))
          .then((text) => fromText(text, job.name, "fetched"))
          .catch(() => null);
      });
  },

  // what the page offers for threads: its protocol, whether it is cross-origin isolated (shared
  // memory), SharedArrayBuffer, OffscreenCanvas (a renderer in a worker), its cores, and the
  // schedulers for idle and background work
  threads(): ThreadsReport {
    // (the Prioritized Task Scheduling API: not in the page's types)
    const scheduler = (self as unknown as { scheduler?: { postTask?: unknown } }).scheduler;
    return {
      protocol: typeof location !== "undefined" ? location.protocol : "",
      crossOriginIsolated: typeof crossOriginIsolated !== "undefined" ? !!crossOriginIsolated : false,
      sharedArrayBuffer: typeof SharedArrayBuffer === "function",
      offscreenCanvas: typeof OffscreenCanvas === "function",
      cores: (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0,
      idle: typeof requestIdleCallback === "function",
      postTask: typeof scheduler !== "undefined" && !!scheduler && typeof scheduler.postTask === "function",
    };
  },
};

M.Workers = Workers;
