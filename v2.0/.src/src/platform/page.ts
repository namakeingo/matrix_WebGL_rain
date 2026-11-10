// The page's side: what differs for a renderer on the page (PagePlatform: its canvases, its sizes
// by ResizeObservers, the readout on the page), the messages of the page's given to a renderer
// (receive, the same on the page and in a worker), and the page as shipped (startShell): the
// renderer's place decided (RenderLink.where), a worker started from the bundle (its name
// "render": workers/render.ts), the page's listeners forwarded (RenderLink.Forward), the report
// shown; or the renderer on the page. The page's thread keeps only the page: its DOM, the
// canvases' and the readout's sizes (device pixels), Wallpaper Engine's listeners and
// visibilitychange, the readout's text. A worker that fails after (an error, a failed message,
// no report within REPORT_WAIT) is let go and the renderer made again on the page on new
// canvases, every setting given again.
//
// Changelog:
// 2026-11-04: out of index.js into a module of its own; the scripts no longer loaded (one bundle);
//   a failure while starting said on the page.
import { M } from "../engine/core";
import type { SupportReport, HdrReport } from "./support";
import "./hdr";
import type { WallpaperProperties, GeneralProperties } from "../globals";
import type { ForwardMessage } from "./renderlink";

// how long a worker given the canvases has to send its first report (ms; else it failed)
const REPORT_WAIT = 15000;

// what a renderer is told by the page (and by a worker's page: RenderLink.Forward's messages)
export interface WallpaperControl {
  applyUserProperties(p: WallpaperProperties): void;
  applyGeneralProperties(p: GeneralProperties): void;
  setPaused(paused: boolean): void;
  setHidden(hidden: boolean): void;
  audio(array: ArrayLike<number>): void;
  // the cursor across the window (-1 to 1, y up), inside: it is in the window (the mouse parallax)
  pointer(x: number, y: number, inside: boolean): void;
  begin(): Promise<void>;
}

// the readout's panel: its canvas, its size in device pixels (the readout's border box), its CSS
// size set
export interface Panel {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  size(): number[];
  style(width: number, height: number): void;
}

// a readout: the page's text (SupportReadout), or a worker's report sent to the page
export interface Readout {
  shown: boolean;
  show(panelReady?: boolean, tick?: boolean): void;
}

// the page's sizes sent to a renderer in a worker (when its state block is not shared)
export interface StateMessage {
  width: number;
  height: number;
  panelWidth: number;
  panelHeight: number;
}

// where a renderer runs: PagePlatform or WorkerPlatform (everything else the same)
export interface RenderPlatform {
  // (the bundle's URL: its workers are made from it)
  base: string;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  panel: Panel;
  readout(report: SupportReport): Readout;
  watch(wallpaper: WallpaperControl): void;
  size(): number[];
  failText(text: string): void;
  setState?(m: StateMessage): void;
  // the HDR output's canvas (a worker's only) and the page told when it has a picture
  hdr?: OffscreenCanvas | null;
  // the page told which HDR canvas (its element's id: "hdr", or a spare's) has a picture, or that it has none
  hdrShown?(on: boolean, id?: string): void;
  // a new HDR canvas for a presenter worker (null: none can be made), and one given back when its worker is gone
  hdrSpare?(): Promise<{ canvas: OffscreenCanvas; id: string } | null>;
  hdrDrop?(id: string): void;
}

// an element's size in device pixels, from a ResizeObserver (MDN: device-pixel-content-box where
// there is one); onSize(width, height) at once and on each change
export const observeDevicePixels = (element: HTMLElement, box: "device-pixel-content-box" | "border-box", onSize: (width: number, height: number) => void): void => {
  const ratio = () => window.devicePixelRatio || 1;
  onSize(Math.max(1, Math.round(element.clientWidth * ratio())), Math.max(1, Math.round(element.clientHeight * ratio())));
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (box === "border-box") {
      const border = entry.borderBoxSize[0];
      onSize(Math.max(1, Math.round(border.inlineSize * ratio())), Math.max(1, Math.round(border.blockSize * ratio())));
      return;
    }
    const pixels = entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
    if (pixels) {
      onSize(pixels.inlineSize, pixels.blockSize);
      return;
    }
    const content = entry.contentBoxSize[0];
    onSize(Math.round(content.inlineSize * ratio()), Math.round(content.blockSize * ratio()));
  });
  if (box === "border-box") {
    observer.observe(element, { box: "border-box" });
    return;
  }
  try {
    observer.observe(element, { box: "device-pixel-content-box" });
  } catch (error) {
    observer.observe(element, { box: "content-box" });
  }
};

// the renderer on the page: its canvases, its sizes by ResizeObservers (applied at the start of a
// frame, never in the observer), the readout on the page (listens: the page's visibility given to
// the wallpaper here; else forwarded by the page's own listener)
export class PagePlatform implements RenderPlatform {
  base: string;
  listens: boolean;
  canvas: HTMLCanvasElement;
  text: HTMLElement;
  sized: number[];
  panelSized: number[];
  panel: Panel;

  constructor(base: string, canvas: HTMLCanvasElement, panelCanvas: HTMLCanvasElement, text: HTMLElement, listens: boolean) {
    this.base = base;
    this.listens = listens;
    this.canvas = canvas;
    this.text = text;
    this.sized = [1, 1];
    this.panelSized = [1, 1];
    this.panel = {
      canvas: panelCanvas,
      size: () => this.panelSized,
      style: (width, height) => {
        const ratio = window.devicePixelRatio || 1;
        panelCanvas.style.width = `${width / ratio}px`;
        panelCanvas.style.height = `${height / ratio}px`;
      },
    };
  }

  readout(report: SupportReport): Readout {
    return new M.SupportReadout(report, this.text, this.panel.canvas as HTMLCanvasElement);
  }

  // the sizes observed and the page's visibility given to the wallpaper
  watch(wallpaper: WallpaperControl): void {
    observeDevicePixels(this.canvas, "device-pixel-content-box", (width, height) => {
      this.sized[0] = width;
      this.sized[1] = height;
    });
    observeDevicePixels(this.text, "border-box", (width, height) => {
      this.panelSized[0] = width;
      this.panelSized[1] = height;
    });
    if (this.listens) {
      document.addEventListener("visibilitychange", () => wallpaper.setHidden(document.hidden));
    }
  }

  size(): number[] {
    return this.sized;
  }

  failText(text: string): void {
    this.text.style.display = "block";
    this.text.textContent = text;
  }
}

// a message of the page's (forwarded calls, the state) given to a wallpaper; the same for a
// renderer in a worker and on the page (RenderLink.Forward's messages)
export const receive = (wallpaper: WallpaperControl, platform: RenderPlatform | null, m: ForwardMessage, support?: SupportReport): void => {
  if (m.type === "hdr") {
    if (support) {
      support.hdr = m.report;
    }
  } else if (m.type === "properties") {
    wallpaper.applyUserProperties(m.properties as WallpaperProperties);
  } else if (m.type === "general") {
    wallpaper.applyGeneralProperties(m.properties as GeneralProperties);
  } else if (m.type === "paused") {
    wallpaper.setPaused(!!m.paused);
  } else if (m.type === "hidden") {
    wallpaper.setHidden(!!m.hidden);
  } else if (m.type === "state" && platform && platform.setState) {
    platform.setState(m as unknown as StateMessage);
  } else if (m.type === "audio") {
    wallpaper.audio(m.array as ArrayLike<number>);
  } else if (m.type === "pointer") {
    wallpaper.pointer(m.x, m.y, m.inside);
  }
};

// the page as shipped. script: the bundle's URL; make: a renderer given its platform
export const startShell = (support: SupportReport, script: string, make: (platform: RenderPlatform) => WallpaperControl): void => {
  // (Wallpaper Engine's calls before RenderLink's forwarder exists, given to it in order)
  let forward: InstanceType<typeof M.RenderLink.Forward> | null = null;
  type Call = "applyUserProperties" | "applyGeneralProperties" | "setPaused";
  const early: [Call, unknown][] = [];
  // the HDR probe: run only when the support readout is about to be shown (Debug mode and Show
  // support both on), once, and again each time that turns on anew; never per frame, and nothing
  // of it with Debug mode off. Its report is given to the renderer (a message, kept until there is
  // one to take it); a probe that fails gives "unknown" fields, and an older probe never lands
  // after a newer one began
  let debugOn = false;
  let supportOn = false;
  // (the HDR setting too: with it on the probe runs without the readout, for the HDR output's gate)
  let hdrOn = false;
  let probed = 0;
  let hdrReport: HdrReport | null = null;
  const sendHdr = () => {
    if (hdrReport && forward && forward.post) {
      forward.send({ type: "hdr", report: hdrReport });
    }
  };
  const probeIfShown = (p: WallpaperProperties) => {
    const was = (debugOn && supportOn) || hdrOn;
    if (p.p615_setting_DebugMode) {
      debugOn = !!p.p615_setting_DebugMode.value;
    }
    if (p.p627_setting_DebugSupport) {
      supportOn = !!p.p627_setting_DebugSupport.value;
    }
    if (p.p108_setting_HDR) {
      hdrOn = !!p.p108_setting_HDR.value;
    }
    if (((debugOn && supportOn) || hdrOn) && !was) {
      const mine = ++probed;
      M.probeHdr(M.pageHdrEnv())
        .then((report) => {
          if (mine === probed) {
            hdrReport = report;
            sendHdr();
          }
        })
        .catch(() => {});
    }
  };
  const call = (name: Call, arg: unknown) => {
    if (name === "applyUserProperties") {
      probeIfShown(arg as WallpaperProperties);
    }
    if (forward) {
      // (each forwarder call takes the argument Wallpaper Engine gave)
      (forward[name] as (a: unknown) => void)(arg);
    } else {
      early.push([name, arg]);
    }
  };
  window.wallpaperPropertyListener = {
    applyUserProperties: (p) => call("applyUserProperties", p),
    applyGeneralProperties: (p) => call("applyGeneralProperties", p),
    setPaused: (paused) => call("setPaused", paused),
  };
  window.Support = support;
  const text = document.getElementById("support") as HTMLElement;
  // (Wallpaper Engine's audio arrays: to the renderer, wherever it runs, once it exists)
  let audioTo: ((array: ArrayLike<number>) => void) | null = null;
  if (typeof window.wallpaperRegisterAudioListener === "function") {
    window.wallpaperRegisterAudioListener((array) => {
      if (audioTo) {
        audioTo(array);
      }
    });
  }

  // the cursor (Wallpaper Engine gives a web wallpaper plain mouse events: mousemove, and mouseleave when the cursor leaves the window): normalised to -1 to 1 across the
  // window (y up) and sent to the renderer, wherever it runs, at most once a frame
  let pointerTo: ((x: number, y: number, inside: boolean) => void) | null = null;
  let aimed: [number, number, boolean] | null = null;
  let aimQueued = false;
  const aim = (x: number, y: number, inside: boolean): void => {
    aimed = [x, y, inside];
    if (!aimQueued) {
      aimQueued = true;
      requestAnimationFrame(() => {
        aimQueued = false;
        if (pointerTo && aimed) {
          pointerTo(aimed[0], aimed[1], aimed[2]);
        }
      });
    }
  };
  // (the window and the document, not the canvas, which may be offscreen; mouse and pointer events both: whichever a host sends, a pointer event repeating a mouse event sets the same place)
  const moved = (e: MouseEvent) => aim((e.clientX / Math.max(1, window.innerWidth)) * 2 - 1, 1 - (e.clientY / Math.max(1, window.innerHeight)) * 2, true);
  const left = () => aim(0, 0, false);
  window.addEventListener("mousemove", moved);
  document.addEventListener("mousemove", moved);
  window.addEventListener("pointermove", moved);
  document.addEventListener("pointermove", moved);
  window.addEventListener("mouseleave", left);
  document.addEventListener("mouseleave", left);
  document.documentElement.addEventListener("mouseleave", left);
  window.addEventListener("pointerleave", left);
  document.addEventListener("pointerleave", left);
  document.documentElement.addEventListener("pointerleave", left);

  // the renderer on the page (its own platform), given every call so far, then each as it comes
  const onPage = (why: string, canvas: HTMLCanvasElement, panelCanvas: HTMLCanvasElement) => {
    support.renderer = "page";
    support.rendererWhy = why;
    support.rendererShared = false;
    const wallpaper = make(new PagePlatform(script, canvas, panelCanvas, text, false));
    const f = forward as InstanceType<typeof M.RenderLink.Forward>;
    f.replay(wallpaper);
    f.attach((m) => receive(wallpaper, null, m, support));
    sendHdr();
    audioTo = (array) => wallpaper.audio(array);
    pointerTo = (x, y, inside) => wallpaper.pointer(x, y, inside);
    return wallpaper.begin().catch(() => {});
  };

  // the renderer in the worker made: the canvases handed over, its report shown, the sizes sent;
  // a worker that fails is let go and the renderer made again on the page on new canvases
  const runInWorker = (made: { worker: Worker; url: string | null }, gl: HTMLCanvasElement, panel: HTMLCanvasElement, hdr: HTMLCanvasElement | null) => {
    const L = M.RenderLink;
    const f = forward as InstanceType<typeof M.RenderLink.Forward>;
    const worker = made.worker;
    const state = new L.State(L.sharable());
    const sizes = { width: 1, height: 1, panelWidth: 1, panelHeight: 1 };
    let started = false;
    let reported = false;
    let over = false;
    let spares = 0;
    const sendState = () => {
      if (!started || over) {
        return;
      }
      if (state.shared) {
        state.write(sizes.width, sizes.height, false, false, sizes.panelWidth, sizes.panelHeight);
      } else {
        worker.postMessage({ type: "state", width: sizes.width, height: sizes.height, panelWidth: sizes.panelWidth, panelHeight: sizes.panelHeight });
      }
    };
    const readout = new M.SupportReadout(support, text, panel);
    const failOver = (why: string) => {
      if (over) {
        return;
      }
      over = true;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      if (hdr) {
        hdr.style.display = "none";
      }
      if (made.url) {
        URL.revokeObjectURL(made.url);
      }
      // (a canvas handed to a worker never gives a context on the page again: new ones)
      const fresh = (old: HTMLCanvasElement) => {
        const canvas = document.createElement("canvas");
        canvas.id = old.id;
        old.replaceWith(canvas);
        return canvas;
      };
      onPage(`the worker failed: ${why}`, fresh(gl), fresh(panel));
    };
    observeDevicePixels(gl, "device-pixel-content-box", (width, height) => {
      sizes.width = width;
      sizes.height = height;
      sendState();
    });
    observeDevicePixels(text, "border-box", (width, height) => {
      sizes.panelWidth = width;
      sizes.panelHeight = height;
      sendState();
    });
    worker.onmessage = (event: MessageEvent) => {
      const m = event.data;
      if (!m || over) {
        return;
      }
      if (m.type === "support") {
        reported = true;
        L.mirror(support, m.support);
        readout.shown = m.shown;
        readout.show(m.panelReady);
      } else if (m.type === "hdrSpare") {
        // (a canvas for a presenter worker: a new element, its control handed to the renderer's worker; a canvas handed to a worker never comes back)
        let spare: HTMLCanvasElement | null = null;
        let offscreen: OffscreenCanvas | null = null;
        if (hdr && typeof hdr.transferControlToOffscreen === "function") {
          spare = document.createElement("canvas");
          spare.id = `hdr${++spares}`;
          spare.dataset.hdr = "1";
          spare.style.cssText = "position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: none;";
          hdr.after(spare);
          offscreen = spare.transferControlToOffscreen();
        }
        worker.postMessage({ type: "hdrCanvas", id: spare ? spare.id : "", canvas: offscreen }, offscreen ? [offscreen] : []);
      } else if (m.type === "hdrDrop") {
        const gone = document.getElementById(String(m.id));
        if (gone && gone !== hdr) {
          gone.remove();
        }
      } else if (m.type === "hdrShown") {
        // (the HDR canvas of the presenter in use covers the WebGL canvas while it has a picture; the WebGL canvas is then hidden, not
        // composited under it every frame: visibility, not display, as its size is the wallpaper's)
        if (hdr) {
          const target = (m.id && document.getElementById(String(m.id))) || hdr;
          const all = [hdr, ...Array.from(document.querySelectorAll<HTMLElement>("canvas[data-hdr]"))];
          let any = false;
          for (const el of all) {
            if (el === target) {
              el.style.display = m.on ? "block" : "none";
            } else if (m.on) {
              el.style.display = "none";
            }
            any = any || el.style.display === "block";
          }
          gl.style.visibility = any ? "hidden" : "visible";
        }
      } else if (m.type === "panelCss") {
        panel.style.width = `${m.width}px`;
        panel.style.height = `${m.height}px`;
      } else if (m.type === "failed") {
        failOver(m.error);
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      failOver((event && event.message) || "an error in it");
    };
    support.renderer = "worker";
    support.rendererWhy = "";
    support.rendererShared = state.shared;
    try {
      const canvas = gl.transferControlToOffscreen();
      const panelCanvas = panel.transferControlToOffscreen();
      const hdrCanvas = hdr && typeof hdr.transferControlToOffscreen === "function" ? hdr.transferControlToOffscreen() : null;
      worker.postMessage(
        {
          type: "init",
          canvas,
          panel: panelCanvas,
          hdr: hdrCanvas,
          base: script,
          state: state.shared ? state.buffer : null,
          size: [sizes.width, sizes.height],
          panelSize: [sizes.panelWidth, sizes.panelHeight],
          ratio: window.devicePixelRatio || 1,
          snapshot: f.snapshot(),
        },
        hdrCanvas ? [canvas, panelCanvas, hdrCanvas] : [canvas, panelCanvas]
      );
    } catch (error) {
      failOver(String((error && (error as Error).message) || error));
      return;
    }
    started = true;
    f.attach((m) => {
      if (!over) {
        worker.postMessage(m);
      }
    });
    pointerTo = (x, y, inside) => {
      if (!over) {
        worker.postMessage({ type: "pointer", x, y, inside });
      }
    };
    // (Wallpaper Engine's audio sent on, a copy transferred; none while a simulated music plays
    // there instead: it is made in the worker)
    sendHdr();
    audioTo = (array) => {
      const p = f.properties;
      const simulated = p.p615_setting_DebugMode && p.p615_setting_DebugMode.value && p.p617_setting_DebugMusicSource && p.p617_setting_DebugMusicSource.value !== "real";
      if (!over && !simulated) {
        const copy = Float32Array.from(array);
        worker.postMessage({ type: "audio", array: copy }, [copy.buffer]);
      }
    };
    setTimeout(() => {
      if (!reported) {
        failOver("no report from it");
      }
    }, REPORT_WAIT);
  };

  const start = async () => {
    const gl = document.getElementById("gl") as HTMLCanvasElement;
    const panel = document.getElementById("gpu") as HTMLCanvasElement;
    const hdr = document.getElementById("hdr") as HTMLCanvasElement | null;
    const L = M.RenderLink;
    const f = new L.Forward();
    forward = f;
    for (const [name, arg] of early) {
      (f[name] as (a: unknown) => void)(arg);
    }
    document.addEventListener("visibilitychange", () => f.setHidden(document.hidden));
    const where = L.where({
      test: false,
      offscreenCanvas: typeof OffscreenCanvas === "function",
      transfer: typeof gl.transferControlToOffscreen === "function",
      worker: typeof Worker === "function",
    });
    if (where.at === "page") {
      return onPage(where.why, gl, panel);
    }
    // (from the bundle by its URL; else a Blob of the bundle's registered body; else of the
    // bundle fetched)
    const made = await M.Workers.start(script, { name: "render" });
    if (!made) {
      return onPage("no Worker could be made", gl, panel);
    }
    if (!L.usable(made.pong)) {
      made.worker.terminate();
      if (made.url) {
        URL.revokeObjectURL(made.url);
      }
      return onPage("no WebGL 2.0 in a worker", gl, panel);
    }
    runInWorker(made, gl, panel, hdr);
  };
  // (a failure while starting: said on the page)
  const go = () =>
    start().catch((error: unknown) => {
      text.style.display = "block";
      text.textContent = `Matrix 3D Rain WebGL 2.0 could not start: ${(error && (error as Error).message) || error}`;
    });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", go);
  } else {
    go();
  }
};
