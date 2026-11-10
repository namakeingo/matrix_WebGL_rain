// HdrWorker: the HDR output's presenter in a worker of its own ("hdr", from the same bundle, made
// by Workers.start), so the render worker keeps only the readback's copy and the picture's second
// copy (into WebGPU's texture) runs on this worker's thread. The client (the render worker's
// side) hands the OffscreenCanvas over once with its first init (transferred: the render worker
// makes no context on it), and each picture's buffer to it as a transferable (HdrBuffers); the
// worker answers every frame with the buffer back ("done", with the frames presented so far).
// A picture goes in one of two ways: its buffer (CPU readback, HdrBuffers) or an ImageBitmap of a WebGL canvas
// (HdrPack: no readback), counted in flight until the worker answers it.
// Messages:
//   client -> worker: { type: "init", canvas? } (the presenter made: "ready" or "failed"
//   with why; the canvas only the first time), { type: "frame", buffer, width, height },
//   { type: "bitmap", bitmap, width, height } (a picture as an ImageBitmap 2 x width wide), { type: "check", bitmap,
//   width, height } (the bitmap path's self-check: "checked" with ok),
//   { type: "release" } (the presenter's device let go, the canvas kept: init works again)
//   worker -> client: { type: "ready" }, { type: "failed", why }, { type: "done", buffer?, frames } (a bitmap's has
//   no buffer), { type: "checked", ok },
//   { type: "lost", message } (the device was lost; a worker that errors counts as lost too)
// destroy() ends the worker. serve() is the worker's own side (src/index.ts, name "hdr").
//
// Changelog:
// 2026-11-05: new, the presenter off the render worker's thread.
// 2026-11-05: the picture is RGB10_A2 (no format to give: init has no floats).
// 2026-11-05: bitmap frames and the bitmap path's check.
import { M } from "../engine/core";
import type { MadeWorker } from "../platform/workers";
import { workerScope } from "../platform/scope";
import type { HdrPixels } from "../engine/hdrreadback";
import type { HdrPresenter } from "../engine/hdrpresenter";
import "../engine/hdrpresenter";

const JOB = { name: "hdr" };

export class HdrWorker {
  worker: Worker;
  url: string | null;
  kind: MadeWorker["kind"];
  // a picture's buffer back from the worker
  onRecycle: ((buffer: ArrayBuffer) => void) | null;
  // the worker's device was lost (once)
  onLost: ((message: string) => void) | null;
  // the pictures presented so far (the worker's count)
  frames: number;
  // the client can hand over ImageBitmaps; how many it handed over that the worker has not answered yet
  bitmap: boolean;
  inFlight: number;
  handedOver: boolean;
  pending: ((why: string) => void) | null;
  checking: ((ok: boolean) => void) | null;
  lostSaid: boolean;
  gone: boolean;
  constructor(made: MadeWorker) {
    this.worker = made.worker;
    this.url = made.url;
    this.kind = made.kind;
    this.onRecycle = null;
    this.onLost = null;
    this.frames = 0;
    this.bitmap = true;
    this.inFlight = 0;
    this.handedOver = false;
    this.pending = null;
    this.checking = null;
    this.lostSaid = false;
    this.gone = false;
    this.worker.onmessage = (event: MessageEvent) => this.receive(event.data);
    this.worker.onerror = (event: ErrorEvent) => {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      this.lose((event && event.message) || "the HDR worker failed");
    };
  }

  static start(base: string, options: { force?: string } = {}): Promise<HdrWorker | null> {
    return M.Workers.start(base, Object.assign({}, JOB, { force: options.force || "" })).then((made) => (made ? new HdrWorker(made) : null));
  }

  // ---- the render worker's side ----
  receive(m: { type: string; why?: string; buffer?: ArrayBuffer; frames?: number; message?: string; ok?: boolean }): void {
    if (!m || this.gone) {
      return;
    }
    if (m.type === "ready" || m.type === "failed") {
      const pending = this.pending;
      this.pending = null;
      if (pending) {
        pending(m.type === "ready" ? "" : m.why || "the HDR worker could not make its presenter");
      }
    } else if (m.type === "done") {
      this.frames = m.frames || 0;
      if (m.buffer) {
        if (this.onRecycle) {
          this.onRecycle(m.buffer);
        }
      } else if (this.inFlight > 0) {
        this.inFlight--;
      }
    } else if (m.type === "checked") {
      const checking = this.checking;
      this.checking = null;
      if (checking) {
        checking(!!m.ok);
      }
    } else if (m.type === "lost") {
      this.lose(m.message || "the HDR device was lost");
    }
  }

  lose(message: string): void {
    if (this.lostSaid) {
      return;
    }
    this.lostSaid = true;
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      pending(message);
    }
    const checking = this.checking;
    this.checking = null;
    if (checking) {
      checking(false);
    }
    this.inFlight = 0;
    if (this.onLost) {
      this.onLost(message);
    }
  }

  // the presenter made in the worker (canvas: handed over the first time only); resolves "" or why not
  init(canvas: OffscreenCanvas): Promise<string> {
    if (this.gone) {
      return Promise.resolve("the HDR worker is gone");
    }
    return new Promise((resolve) => {
      this.pending = resolve;
      const first = !this.handedOver;
      this.handedOver = true;
      this.lostSaid = false;
      this.worker.postMessage({ type: "init", canvas: first ? canvas : undefined }, first ? [canvas] : []);
    });
  }

  // a picture presented: its buffer goes to the worker (transferred), and comes back as onRecycle
  present(pixels: HdrPixels, width: number, height: number): void {
    if (this.gone) {
      return;
    }
    const buffer = pixels.buffer as ArrayBuffer;
    this.worker.postMessage({ type: "frame", buffer, width, height }, [buffer]);
  }

  // a picture handed over as an ImageBitmap (transferred; the worker closes it): in flight until it answers
  presentBitmap(bitmap: ImageBitmap, width: number, height: number): void {
    if (this.gone) {
      return;
    }
    this.inFlight++;
    this.worker.postMessage({ type: "bitmap", bitmap, width, height }, [bitmap]);
  }

  // the bitmap path's self-check: the worker checks the known picture, resolves whether it arrived exactly
  checkBitmap(bitmap: ImageBitmap, width: number, height: number): Promise<boolean> {
    if (this.gone) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      this.checking = resolve;
      this.worker.postMessage({ type: "check", bitmap, width, height }, [bitmap]);
    });
  }

  // the presenter's device let go (the worker and its canvas kept)
  release(): void {
    this.inFlight = 0;
    if (!this.gone) {
      this.worker.postMessage({ type: "release" });
    }
  }

  destroy(): void {
    if (this.gone) {
      return;
    }
    this.gone = true;
    this.pending = null;
    this.checking = null;
    this.worker.terminate();
    if (this.url) {
      URL.revokeObjectURL(this.url);
    }
  }

  // ---- the worker's side ----
  static serve(): void {
    const scope = workerScope();
    let presenter: HdrPresenter | null = null;
    let canvas: OffscreenCanvas | null = null;
    let generation = 0;
    scope.onmessage = (event: MessageEvent) => {
      const m = event.data;
      if (m.type === "ping") {
        scope.postMessage({ type: "pong" });
      } else if (m.type === "init") {
        if (m.canvas) {
          canvas = m.canvas as OffscreenCanvas;
        }
        if (presenter) {
          presenter.destroy();
          presenter = null;
        }
        const mine = ++generation;
        if (!canvas) {
          scope.postMessage({ type: "failed", why: "no canvas for the HDR output" });
          return;
        }
        void M.HdrPresenter.create(canvas, (message) => scope.postMessage({ type: "lost", message })).then((result) => {
          if (mine !== generation) {
            if (result.presenter) {
              result.presenter.destroy();
            }
            return;
          }
          presenter = result.presenter;
          scope.postMessage(presenter ? { type: "ready" } : { type: "failed", why: result.why });
        });
      } else if (m.type === "frame") {
        const buffer = m.buffer as ArrayBuffer;
        if (presenter) {
          try {
            presenter.size(m.width, m.height);
            presenter.present(new Uint32Array(buffer));
          } catch (error) {
            scope.postMessage({ type: "lost", message: String((error && (error as Error).message) || error) });
          }
        }
        scope.postMessage({ type: "done", buffer, frames: presenter ? presenter.frames : 0 }, [buffer]);
      } else if (m.type === "bitmap") {
        const bitmap = m.bitmap as ImageBitmap;
        if (presenter) {
          try {
            presenter.presentBitmap(bitmap, m.width, m.height);
          } catch (error) {
            bitmap.close();
            scope.postMessage({ type: "lost", message: String((error && (error as Error).message) || error) });
          }
        } else {
          bitmap.close();
        }
        scope.postMessage({ type: "done", frames: presenter ? presenter.frames : 0 });
      } else if (m.type === "check") {
        const bitmap = m.bitmap as ImageBitmap;
        const answer = (ok: boolean) => scope.postMessage({ type: "checked", ok });
        if (!presenter) {
          bitmap.close();
          answer(false);
        } else {
          presenter.checkBitmap(bitmap, m.width, m.height).then(answer, () => answer(false));
        }
      } else if (m.type === "release") {
        generation++;
        if (presenter) {
          presenter.destroy();
          presenter = null;
        }
      }
    };
  }
}

M.HdrWorker = HdrWorker;
