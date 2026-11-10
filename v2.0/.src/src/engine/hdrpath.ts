// HdrPath: the HDR output as one part the coordinator drives (the HDR setting, the gate, the bridge).
// Per frame, before the frame is drawn: active() says whether this frame's tone map goes to the HDR
// picture (HdrOutput.decide's gate on, a presenter ready and its path checked); after the tone map:
// present() hands the picture to the presenter (WebGPU's extended tone mapping), a frame or two behind.
// The picture reaches WebGPU one of two ways (HdrOutput.pathFor): "bitmap" (the pack pass writes it into the
// canvas, twice as wide, which becomes an ImageBitmap that WebGPU copies on the GPU: no CPU readback; used
// only after a self-check sent a known picture through it once and every level came back exact), else
// "readback" (the picture read into pixel pack buffers, fences, the newest taken into a buffer of HdrBuffers'
// pool and transferred on). The presenter runs in a worker of its own (workers/hdrworker.ts); where no worker
// can be made it runs in this thread (DirectBackend), the same interface. Every way HDR is not used is the SDR
// path unchanged, with its reason in the report (Support.hdrOutput): the setting off, the probe not in or
// reporting no HDR display, no HDR canvas (a renderer on the page has none), a picture that does not read back
// as RGB10_A2, no WebGPU device, a lost device. A failure of the presenter or the read type is kept until the
// setting is turned off and on again (never retried in a loop), and the presenter's start is guarded by a
// generation number so an older one cannot land after a newer. `shown` tells the page when the HDR canvas has
// a picture (so it covers the WebGL canvas) and when it has not.
//
// Changelog:
// 2026-11-05: new, for the HDR output.
// 2026-11-05: the presenter in a worker of its own (HdrWorker, HdrBuffers); DirectBackend where none.
// 2026-11-05: RGB10_A2: no float formats to choose between, no float render targets needed.
// 2026-11-05: the bitmap path and its self-check, the readback as the fallback.
import { M } from "./core";
import type { HdrReport, HdrOutputReport } from "../platform/support";
import type { Exposure } from "../effects/exposure";
import type { HdrGate } from "../models/hdroutput";
import { HdrReadback } from "./hdrreadback";
import type { HdrPixels } from "./hdrreadback";
import { HdrBuffers } from "./hdrbuffers";
import { HdrPresenter } from "./hdrpresenter";
import "./hdrcheck";
import "../workers/hdrworker";
import { HdrTask } from "./hdrtask";
import type { HdrHandle, HdrTaskOptions } from "./hdrtask";

// how fast the timings follow a new value
const SMOOTH = 0.1;
// the bitmaps the presenter may still have to do before a new one is skipped
const IN_FLIGHT = 2;

export interface HdrHost {
  // the bundle's URL (the presenter's worker is made from it)
  base: string;
  // the HDR canvas of the renderer's worker (none on the page) and its element's id on the page
  canvas: OffscreenCanvas | null;
  canvasId?: string;
  // a new HDR canvas for a presenter worker (the page makes the element and hands the canvas over; null: none), and the canvas given back when its worker is gone
  spare?(): Promise<{ canvas: OffscreenCanvas; id: string } | null>;
  dropSpare?(id: string): void;
  // the HDR canvas of that element has a picture to show (true), or none is to show (false)
  shown(on: boolean, id?: string): void;
  // the presenter's device was lost (counted by the GPU guard)
  lost(message: string): void;
  // the readout to be written again (the report changed)
  changed(): void;
}

// where a picture is presented: the presenter's worker (HdrWorker), or the presenter here
export interface HdrBackend {
  onRecycle: ((buffer: ArrayBuffer) => void) | null;
  onLost: ((message: string) => void) | null;
  frames: number;
  // whether it can take pictures as ImageBitmaps, and how many it was given that it has not done yet
  bitmap: boolean;
  inFlight: number;
  init(canvas: OffscreenCanvas): Promise<string>;
  present(pixels: HdrPixels, width: number, height: number): void;
  presentBitmap(bitmap: ImageBitmap, width: number, height: number): void;
  checkBitmap(bitmap: ImageBitmap, width: number, height: number): Promise<boolean>;
  release(): void;
  destroy(): void;
}

// the presenter in this thread: the picture copied into its texture at once, its buffer free again
export class DirectBackend implements HdrBackend {
  onRecycle: ((buffer: ArrayBuffer) => void) | null;
  onLost: ((message: string) => void) | null;
  frames: number;
  bitmap: boolean;
  inFlight: number;
  presenter: HdrPresenter | null;
  constructor() {
    this.onRecycle = null;
    this.onLost = null;
    this.frames = 0;
    this.bitmap = true;
    this.inFlight = 0;
    this.presenter = null;
  }

  async init(canvas: OffscreenCanvas): Promise<string> {
    this.release();
    const result = await HdrPresenter.create(canvas, (message) => {
      if (this.onLost) {
        this.onLost(message);
      }
    });
    this.presenter = result.presenter;
    return result.presenter ? "" : result.why;
  }

  present(pixels: HdrPixels, width: number, height: number): void {
    const presenter = this.presenter;
    if (presenter) {
      presenter.size(width, height);
      presenter.present(pixels);
      this.frames = presenter.frames;
    }
    if (this.onRecycle) {
      this.onRecycle(pixels.buffer as ArrayBuffer);
    }
  }

  presentBitmap(bitmap: ImageBitmap, width: number, height: number): void {
    const presenter = this.presenter;
    if (presenter) {
      presenter.presentBitmap(bitmap, width, height);
      this.frames = presenter.frames;
    } else {
      bitmap.close();
    }
  }

  checkBitmap(bitmap: ImageBitmap, width: number, height: number): Promise<boolean> {
    if (!this.presenter) {
      bitmap.close();
      return Promise.resolve(false);
    }
    return this.presenter.checkBitmap(bitmap, width, height);
  }

  release(): void {
    if (this.presenter) {
      this.presenter.destroy();
      this.presenter = null;
    }
  }

  destroy(): void {
    this.release();
  }
}

export interface HdrPathOptions {
  // the tests' stand-ins: the thread backend, and the presenter worker task's options
  makeDirect?: () => HdrBackend;
  task?: Partial<HdrTaskOptions>;
}

export class HdrPath {
  host: HdrHost;
  options: HdrPathOptions;
  // the thread backend (the presenter in this thread, kept while the path lives), the presenter worker task and the handle of the worker taken
  direct: HdrBackend | null;
  task: HdrTask | null;
  handle: HdrHandle | null;
  // the id of the HDR canvas element shown now (null: none)
  shownId: string | null;
  report: HdrOutputReport;
  wanted: boolean;
  backend: HdrBackend | null;
  // the presenter made and answered
  ready: boolean;
  // the way the picture reaches WebGPU, once the presenter is ready and the bitmap path was checked; the check running
  path: "bitmap" | "readback";
  checking: boolean;
  // the first frame's check that the picture reads back as RGB10_A2 done
  checked: boolean;
  readback: HdrReadback | null;
  buffers: HdrBuffers | null;
  making: boolean;
  generation: number;
  failure: string | null;
  // the longest bridge frame in the current and the last window (ms), and when the current one began
  spikeNow: number;
  spikePrev: number;
  spikeAt: number;
  // the gate for the probe and the setting it was worked out for (no work in a frame while they stay)
  gateProbe: HdrReport | null;
  gateWanted: boolean;
  gate: HdrGate;
  constructor(host: HdrHost, report: HdrOutputReport, options: HdrPathOptions = {}) {
    this.host = host;
    this.options = options;
    this.direct = null;
    this.task = null;
    this.handle = null;
    this.shownId = null;
    this.report = report;
    this.wanted = false;
    this.backend = null;
    this.ready = false;
    this.path = "readback";
    this.checking = false;
    this.checked = false;
    this.readback = null;
    this.buffers = null;
    this.making = false;
    this.generation = 0;
    this.failure = null;
    this.spikeNow = 0;
    this.spikePrev = 0;
    this.spikeAt = 0;
    this.gateProbe = null;
    this.gateWanted = false;
    this.gate = { on: false, why: "HDR setting off" };
  }

  // whether the canvas is to be twice as wide this frame (the bitmap path draws the packed picture into it)
  get packed(): boolean {
    return this.ready && !this.checking && this.path === "bitmap";
  }

  // the HDR setting (a change from off to on forgets an earlier failure: it may work now)
  setWanted(value: boolean): void {
    if (value === this.wanted) {
      return;
    }
    this.wanted = value;
    if (value) {
      this.failure = null;
    } else {
      this.release();
    }
  }

  // the report written where it changed (the readout follows)
  say(on: boolean, why: string): void {
    const headroom = M.HdrOutput.headroomFor(M.HdrOutput.MAX_HEADROOM, null);
    const r = this.report;
    if (r.on !== on || r.why !== why || r.headroom !== headroom) {
      r.on = on;
      r.why = why;
      r.headroom = headroom;
      this.host.changed();
    }
  }

  // whether this frame's tone map goes to the HDR picture; starts the presenter when the gate allows
  active(probe: HdrReport | null): boolean {
    if (probe !== this.gateProbe || this.wanted !== this.gateWanted) {
      this.gateProbe = probe;
      this.gateWanted = this.wanted;
      this.gate = M.HdrOutput.decide(probe, this.wanted);
    }
    const gate = this.gate;
    if (!gate.on) {
      this.say(false, gate.why);
      this.hide();
      return false;
    }
    if (!this.host.canvas) {
      this.say(false, "no HDR canvas: HDR is only in the renderer's worker");
      return false;
    }
    if (this.failure) {
      this.say(false, this.failure);
      this.hide();
      return false;
    }
    if (!this.ready) {
      this.say(false, "HDR starting (WebGPU)");
      this.start();
      return false;
    }
    if (this.checking) {
      this.say(false, "HDR starting (checking the bitmap path)");
      return false;
    }
    this.say(true, gate.why);
    return true;
  }

  // the thread backend (the presenter in this thread), made once and kept; its lost device is a failure (the presenter worker's is not: HdrTask)
  makeDirect(): HdrBackend {
    if (!this.direct) {
      const backend = this.options.makeDirect ? this.options.makeDirect() : new DirectBackend();
      backend.onRecycle = (buffer) => {
        if (this.buffers) {
          this.buffers.release(buffer);
        }
      };
      backend.onLost = (message) => this.deviceLost(this.generation, message);
      this.direct = backend;
    }
    return this.direct;
  }

  // the presenter made in this thread at once (asynchronously), checked, and the presenter worker's task started beside it: the worker takes over when it is made
  start(): void {
    const canvas = this.host.canvas;
    if (this.making || !canvas) {
      return;
    }
    this.startTask();
    if (this.handle) {
      return;
    }
    this.making = true;
    const mine = ++this.generation;
    const backend = this.makeDirect();
    this.backend = backend;
    this.report.presenter = "thread";
    void backend.init(canvas).then((why) => {
      this.making = false;
      if (mine !== this.generation || !this.wanted || this.backend !== backend) {
        backend.release();
        return;
      }
      if (why === "") {
        this.ready = true;
        this.runCheck(backend, mine);
      } else {
        this.failure = `no WebGPU for HDR: ${why}`;
      }
      this.host.changed();
    });
  }

  // the presenter worker's task (once for each start of the path): a worker made as soon as it can be, taken, and made again after its loss
  startTask(): void {
    if (this.task) {
      return;
    }
    const task = new HdrTask(
      Object.assign({ host: this.host, onChange: (handle: HdrHandle | null) => (handle ? this.takeWorker(handle) : this.workerLost("the presenter worker was lost")) }, this.options.task || {})
    );
    this.task = task;
    task.start();
  }

  // the presenter worker taken: the pictures go to it from the next frame, the thread presenter is let go; its canvas is shown once it has presented a frame (reveal)
  takeWorker(handle: HdrHandle): void {
    if (!this.wanted || !this.task) {
      return;
    }
    this.handle = handle;
    this.generation++;
    this.making = false;
    if (this.direct) {
      this.direct.release();
    }
    this.dropReadback();
    handle.backend.onRecycle = (buffer) => {
      if (this.buffers) {
        this.buffers.release(buffer);
      }
    };
    this.backend = handle.backend;
    this.ready = true;
    this.checking = false;
    this.path = handle.path;
    this.report.path = handle.path;
    this.report.presenter = "worker";
    this.host.changed();
  }

  // the presenter worker lost: the thread presenter again at once (made and checked anew; SDR frames meanwhile), the worker made again by the task after its backoff
  workerLost(why: string): void {
    const handle = this.handle;
    if (!handle) {
      return;
    }
    this.handle = null;
    this.generation++;
    this.making = false;
    this.ready = false;
    this.checking = false;
    this.path = "readback";
    this.report.path = "";
    this.hide();
    this.dropReadback();
    this.host.lost(why);
    this.backend = null;
    if (this.wanted) {
      this.start();
    }
    this.host.changed();
  }

  // the bridge's readback and its buffers let go (they belong to the backend that is leaving)
  dropReadback(): void {
    if (this.readback) {
      this.readback.destroy();
      this.readback = null;
    }
    this.buffers = null;
    this.checked = false;
  }

  // the bitmap path's self-check, once for each presenter made: a known picture through the path, every level
  // compared; the path is the bitmap one only where it came back exact (and the backend takes bitmaps)
  runCheck(backend: HdrBackend, generation: number): void {
    const settle = (ok: boolean | null) => {
      if (generation !== this.generation || this.backend !== backend) {
        return;
      }
      this.checking = false;
      this.path = M.HdrOutput.pathFor(ok, backend.bitmap);
      this.report.path = this.path;
      this.host.changed();
    };
    const bitmap = backend.bitmap ? M.HdrCheck.make() : null;
    if (!bitmap) {
      this.path = "readback";
      this.report.path = this.path;
      return;
    }
    this.checking = true;
    backend.checkBitmap(bitmap, M.HdrPack.CHECK_WIDTH, M.HdrPack.CHECK_HEIGHT).then(settle, () => settle(false));
  }

  deviceLost(generation: number, message: string): void {
    if (generation !== this.generation) {
      return;
    }
    this.failure = `the HDR WebGPU device was lost: ${message}`;
    this.release();
    this.host.lost(message);
    this.host.changed();
  }

  // after the tone map drew into the HDR picture (left bound): the picture handed to the presenter
  present(gl: WebGL2RenderingContext, exposure: Exposure): void {
    const backend = this.backend;
    if (!backend || !this.ready || this.checking || !exposure.drawnHdr) {
      return;
    }
    if (this.path === "bitmap") {
      this.presentPacked(gl, exposure, backend);
    } else {
      this.presentReadback(gl, exposure, backend);
    }
    this.reveal();
  }

  // the canvas of the presenter in use shown once it has drawn a picture (before it the canvas would cover the scene with black; a canvas shown before stays until then)
  reveal(): void {
    const backend = this.backend;
    const id = this.handle ? this.handle.id : this.host.canvasId || "hdr";
    if (backend && backend.frames > 0 && this.shownId !== id) {
      this.shownId = id;
      this.host.shown(true, id);
    }
  }

  // the bitmap path: the picture packed into the canvas (twice as wide), the canvas handed over as an ImageBitmap
  // (a transfer, not a copy), the presenter copying it on the GPU; a frame while it has IN_FLIGHT to do is skipped
  presentPacked(gl: WebGL2RenderingContext, exposure: Exposure, backend: HdrBackend): void {
    const r = this.report;
    const t0 = performance.now();
    exposure.packHdr();
    const t1 = performance.now();
    const bitmap = (gl.canvas as OffscreenCanvas).transferToImageBitmap();
    if (backend.inFlight >= IN_FLIGHT) {
      bitmap.close();
    } else {
      backend.presentBitmap(bitmap, exposure.scene.width, exposure.scene.height);
    }
    const t2 = performance.now();
    r.requestMs += (t1 - t0 - r.requestMs) * SMOOTH;
    r.takeMs += (0 - r.takeMs) * SMOOTH;
    r.presentMs += (t2 - t1 - r.presentMs) * SMOOTH;
    // (the longest frame of the last 5 to 10 s: two windows of 5 s)
    if (t2 - this.spikeAt > 5000) {
      this.spikePrev = this.spikeNow;
      this.spikeNow = 0;
      this.spikeAt = t2;
    }
    if (t2 - t0 > this.spikeNow) {
      this.spikeNow = t2 - t0;
    }
    r.spikeMs = Math.max(this.spikeNow, this.spikePrev);
    r.frames = backend.frames;
  }

  // the readback path: its read requested, the newest picture ready handed to the presenter
  presentReadback(gl: WebGL2RenderingContext, exposure: Exposure, backend: HdrBackend): void {
    if (!this.readback) {
      // (asked once: the HDR picture is bound; ES 3.0 guarantees RGBA with UNSIGNED_INT_2_10_10_10_REV for RGB10_A2)
      if (!this.checked && !HdrReadback.readable(gl)) {
        this.failure = "the HDR picture cannot be read back as 10 bits a channel";
        this.release();
        this.host.changed();
        return;
      }
      this.checked = true;
      this.readback = new HdrReadback(gl);
      this.buffers = new HdrBuffers();
    }
    const readback = this.readback;
    const buffers = this.buffers!;
    const width = exposure.scene.width;
    const height = exposure.scene.height;
    readback.size(width, height);
    buffers.size(width, height);
    const r = this.report;
    const t0 = performance.now();
    readback.request();
    const t1 = performance.now();
    r.requestMs += (t1 - t0 - r.requestMs) * SMOOTH;
    // (no free buffer: the presenter has them all; nothing taken, the picture waits for the next frame)
    const dst = buffers.acquire();
    if (!dst) {
      return;
    }
    const picture = readback.take(dst);
    const t2 = performance.now();
    if (!picture) {
      buffers.release(dst.buffer as ArrayBuffer);
      return;
    }
    r.takeMs += (t2 - t1 - r.takeMs) * SMOOTH;
    backend.present(picture, width, height);
    r.presentMs += (performance.now() - t2 - r.presentMs) * SMOOTH;
    r.frames = backend.frames;
  }

  // the HDR canvas not covering the WebGL canvas
  hide(): void {
    if (this.shownId !== null) {
      const id = this.shownId;
      this.shownId = null;
      this.host.shown(false, id);
    }
  }

  // everything of this context's let go, the presenter's device too (the setting off, a failure, a lost device): the presenter worker destroyed with its canvas, the thread
  // presenter let go (the thread backend and the HDR canvas are kept for the next start)
  release(): void {
    this.generation++;
    this.making = false;
    this.ready = false;
    this.checking = false;
    this.path = "readback";
    this.report.path = "";
    this.hide();
    this.dropReadback();
    const task = this.task;
    this.task = null;
    this.handle = null;
    if (task) {
      task.stop();
    }
    this.backend = null;
    if (this.direct) {
      this.direct.release();
    }
  }

  destroy(): void {
    this.release();
    if (this.direct) {
      this.direct.destroy();
      this.direct = null;
    }
  }
}

M.HdrPath = HdrPath;
