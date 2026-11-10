// The renderer's worker (the bundle started with the name "render": src/index.ts): it answers the
// ping at once (whether WebGL 2.0 and animation frames work here), then, given the canvases (its
// init message), runs the renderer here (WorkerPlatform: the canvases handed over, its sizes from
// the state block, the page's or written here from the page's messages, the readout and the
// panel's CSS on the page by messages), every setting of the page's given; then the page's
// messages (platform/page.ts, receive).
//
// Changelog:
// 2026-11-04: out of index.js into a module of its own (was engine/render.worker.js loading
//   index.js); the scripts no longer imported (one bundle).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { receive } from "../platform/page";
import type { RenderPlatform, Panel, Readout, StateMessage, WallpaperControl } from "../platform/page";
import type { SupportReport } from "../platform/support";
import type { WallpaperProperties, GeneralProperties } from "../globals";

// the page's init message (platform/page.ts, runInWorker)
export interface RenderInit {
  type: "init";
  canvas: OffscreenCanvas;
  panel: OffscreenCanvas;
  // the HDR output's canvas (absent from an older page)
  hdr?: OffscreenCanvas;
  base: string;
  state: SharedArrayBuffer | null;
  size: number[];
  panelSize: number[];
  ratio: number;
  snapshot: { properties: WallpaperProperties; general: GeneralProperties; paused: boolean; hidden: boolean };
}

// the readout of a renderer in a worker: its report sent to the page, which writes the text
// (each time it is asked to show, and once a second only while shown)
class RemoteReadout implements Readout {
  report: SupportReport;
  shown: boolean;

  constructor(report: SupportReport) {
    this.report = report;
    this.shown = false;
  }

  show(panelReady?: boolean, tick?: boolean): void {
    if (tick && !this.shown) {
      return;
    }
    workerScope().postMessage({ type: "support", support: this.report, shown: this.shown, panelReady: !!panelReady });
  }
}

// the renderer in a worker: the canvases handed over, its sizes from the state block (the
// page's: shared, or written here from the page's messages), the readout and the panel's CSS on
// the page by messages
class WorkerPlatform implements RenderPlatform {
  base: string;
  canvas: OffscreenCanvas;
  hdr: OffscreenCanvas | null;
  ratio: number;
  state: InstanceType<typeof M.RenderLink.State>;
  out: { width: number; height: number; paused: boolean; hidden: boolean; panelWidth: number; panelHeight: number };
  sized: number[];
  panelSized: number[];
  styled: number[];
  panel: Panel;

  constructor(init: RenderInit) {
    const L = M.RenderLink;
    this.base = init.base;
    this.canvas = init.canvas;
    this.hdr = init.hdr || null;
    this.ratio = init.ratio || 1;
    this.state = init.state ? new L.State(init.state) : new L.State(false);
    if (!init.state) {
      this.state.write(init.size[0], init.size[1], false, false, init.panelSize[0], init.panelSize[1]);
    }
    this.out = { width: 1, height: 1, paused: false, hidden: false, panelWidth: 1, panelHeight: 1 };
    this.sized = [1, 1];
    this.panelSized = [1, 1];
    this.styled = [0, 0];
    this.panel = {
      canvas: init.panel,
      size: () => {
        this.read();
        return this.panelSized;
      },
      style: (width, height) => {
        if (this.styled[0] !== width || this.styled[1] !== height) {
          this.styled[0] = width;
          this.styled[1] = height;
          workerScope().postMessage({ type: "panelCss", width: width / this.ratio, height: height / this.ratio });
        }
      },
    };
  }

  // the page's sizes written since (a message's: RenderLink.State.write)
  setState(m: StateMessage): void {
    this.state.write(m.width, m.height, false, false, m.panelWidth, m.panelHeight);
  }

  read(): void {
    const out = this.out;
    this.state.read(out);
    this.sized[0] = out.width;
    this.sized[1] = out.height;
    this.panelSized[0] = Math.max(1, out.panelWidth);
    this.panelSized[1] = Math.max(1, out.panelHeight);
  }

  readout(report: SupportReport): Readout {
    return new RemoteReadout(report);
  }

  watch(): void {}

  // the page told which HDR canvas has a picture (it then covers the WebGL canvas), or that none has
  hdrShown(on: boolean, id?: string): void {
    workerScope().postMessage({ type: "hdrShown", on, id });
  }

  // a new HDR canvas asked of the page (answered by a "hdrCanvas" message: hdrSpareArrived), and one given back
  private spares: ((spare: { canvas: OffscreenCanvas; id: string } | null) => void)[] = [];
  hdrSpare(): Promise<{ canvas: OffscreenCanvas; id: string } | null> {
    return new Promise((resolve) => {
      this.spares.push(resolve);
      workerScope().postMessage({ type: "hdrSpare" });
    });
  }
  hdrSpareArrived(m: { canvas?: OffscreenCanvas | null; id?: string }): void {
    const resolve = this.spares.shift();
    if (resolve) {
      resolve(m.canvas ? { canvas: m.canvas, id: String(m.id) } : null);
    }
  }
  hdrDrop(id: string): void {
    workerScope().postMessage({ type: "hdrDrop", id });
  }

  size(): number[] {
    this.read();
    return this.sized;
  }

  failText(text: string): void {
    workerScope().postMessage({ type: "failed", error: text });
  }
}

// whether WebGL 2.0 and animation frames work in this worker (a context on a 1 x 1 canvas, let
// go at once)
const probeWebGL2 = (): boolean => {
  if (typeof OffscreenCanvas !== "function" || typeof requestAnimationFrame !== "function") {
    return false;
  }
  try {
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
    if (!gl) {
      return false;
    }
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) {
      lose.loseContext();
    }
    return true;
  } catch (error) {
    return false;
  }
};

// the ping answered at once (with the probe), then the renderer made from the init message: every
// setting of the page's given, its start; then the page's messages. make: a renderer given its
// platform
export const serveWorker = (support: SupportReport, make: (platform: RenderPlatform) => WallpaperControl): void => {
  const scope = workerScope();
  let wallpaper: WallpaperControl | null = null;
  let platform: WorkerPlatform | null = null;
  scope.onmessage = (event: MessageEvent) => {
    const m = event.data;
    if (!m) {
      return;
    }
    if (m.type === "ping") {
      scope.postMessage({ type: "pong", webgl2: probeWebGL2() });
      return;
    }
    if (m.type === "init" && !wallpaper) {
      try {
        platform = new WorkerPlatform(m as RenderInit);
      } catch (error) {
        scope.postMessage({ type: "failed", error: String((error && (error as Error).message) || error) });
        return;
      }
      support.renderer = "worker";
      support.rendererWhy = "";
      support.rendererShared = platform.state.shared;
      wallpaper = make(platform);
      const s = (m as RenderInit).snapshot;
      wallpaper.applyUserProperties(s.properties);
      wallpaper.applyGeneralProperties(s.general);
      wallpaper.setPaused(s.paused);
      wallpaper.setHidden(s.hidden);
      // (a failure is said in the readout, or by a failed message when it could not start)
      wallpaper.begin().catch(() => {});
      return;
    }
    if (m.type === "hdr") {
      support.hdr = m.report;
      return;
    }
    if (m.type === "hdrCanvas") {
      if (platform) {
        platform.hdrSpareArrived(m);
      }
      return;
    }
    if (wallpaper) {
      receive(wallpaper, platform, m, support);
    }
  };
};
