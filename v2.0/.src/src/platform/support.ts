// What was found (the report): the browser, WebGL 2.0's and WebGPU's support and checks, the
// drops' source, the workers, where the renderer runs, the readout's sections. One a thread,
// made by the coordinator (src/index.ts) and given to what fills it; on the page as
// window.Support (the tests read it); with the renderer in a worker, the worker's sent to the page
// and mirrored into the page's in place (RenderLink.mirror).

import type { FrameHealthReport } from "../debug/debug";
import type { QualityReport } from "../models/quality/types";

export interface WebGL2Report {
  ok: boolean;
  version: string;
  glsl: string;
  renderer: string;
  maxTexture: number;
  maxSamples: number;
  floatTargets: boolean;
  timerQueries: boolean;
  error: string;
}

export interface WebGPUReport {
  api: boolean;
  ok: boolean;
  adapter: string;
  fallbackAdapter: boolean;
  features: string[];
  limits: Record<string, number>;
  format: string;
  compute: string;
  render: string;
  frames: number;
  errors: string[];
  error: string;
}

export interface ThreadsReport {
  protocol: string;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  offscreenCanvas: boolean;
  cores: number;
  idle: boolean;
  postTask: boolean;
}

// the mouse parallax's state for the Performance readout's Mouse line: the settings, the cursor (-1 to 1, y up; inside: in the window), the camera's offsets (radians; metres)
// and where the smoothing runs (worker: false is inline), moving: not at its target yet
export interface MouseReport {
  on: boolean;
  mode: string;
  x: number;
  y: number;
  inside: boolean;
  yaw: number;
  pitch: number;
  eyeX: number;
  eyeY: number;
  worker: boolean;
  moving: boolean;
}

// Debug mode's Performance readout's values (renewed once a second)
export interface PerformanceReport {
  fps: number;
  scriptMs: number;
  gpuMs: number | null;
  timer: boolean;
  frozen: boolean;
  frozenFor: number;
  limit: number;
  frameCap: number;
  wallpaperFps: number;
  width: number;
  height: number;
  drops: number;
  splashes: number;
  strikes: number;
  // the frames' health (FrameHealth.summary; null: not counted yet, the wallpaper still loading)
  frames: FrameHealthReport | null;
  // the effects' quality and the quality pool (null: not counted yet, the wallpaper still loading)
  quality: QualityReport | null;
  // the mouse parallax (missing: not reported)
  mouse?: MouseReport;
}

// what an audio array carries (AudioLevels.of)
export interface AudioLevelsReport {
  loudness: number;
  left: number;
  right: number;
  bass: number;
  mid: number;
  treble: number;
  peak: number;
  peakBin: number;
}

// Debug mode's Music readout's values
export interface MusicReport {
  source: string;
  rate: number;
  levels: AudioLevelsReport;
  // the music's reactions (null: not followed: React to music off): whether the music drives or the idle animation plays, the followed loudness and floor, the best peak score
  // since the last renewal and the threshold, the tempo (0: none found) and the tempo's, the song energy's and the brightness' factors of a peak's score, the music strikes in the
  // last strikeWindow seconds, and the rain it sets: the drops falling of those wanted, the mean share of the columns
  follower: MusicFollowerReport | null;
}

export interface MusicFollowerReport {
  driven: boolean;
  loudness: number;
  floor: number;
  threshold: number;
  scoreMost: number;
  tempo: number;
  tempoFactor: number;
  energyFactor: number;
  brightnessFactor: number;
  strikes: number;
  strikeWindow: number;
  falling: number;
  wanted: number;
  // the rain's drop target the music sets (the drops wanted times the mean share of the columns), that as a Rain density (the Density setting times the mean share) and the Density set
  target: number;
  density: number;
  densitySet: number;
}

// Debug mode's OLED readout's values (renewed once a second): OLED Pixel Shift, the most a shift
// may reach across or down, and the shifts in pixels (the scene's across only)
export interface OledReport {
  limit: number;
  scene: { x: number };
  clock: { x: number; y: number };
  message: { x: number; y: number };
}

// what the HDR probe found (platform/hdr.ts): the display's dynamic range as the page sees it (high,
// standard, unknown), the widest colour gamut, the colour depth in bits (null: unknown), and
// whether a WebGPU canvas takes the extended tone mapping and a WebGL canvas has the HDR output
// API (yes, no, unknown)
export interface HdrReport {
  display: string;
  video: string;
  gamut: string;
  colorDepth: number | null;
  webgpu: string;
  webgl: string;
}

// the HDR output as it is now (engine/hdrpath.ts): whether this wallpaper's picture goes out as HDR, why
// not when it does not (the setting off, no HDR display, no WebGPU, ...), and its headroom (a multiple of SDR white)
export interface HdrOutputReport {
  on: boolean;
  why: string;
  headroom: number;
  // the pictures presented through WebGPU so far
  frames: number;
  // where the presenter runs: "worker" (a worker of its own), "thread" (the render worker), "" (not made)
  presenter: string;
  // the way the picture reaches WebGPU: "bitmap" (an ImageBitmap of the canvas, no CPU readback), "readback", "" (not yet)
  path: string;
  // the bridge's calls in the render worker, a smoothed time each frame (ms): the read request, taking the picture
  // (getBufferSubData), handing it on
  // the longest single frame of the bridge's calls (ms) since the last report was read
  spikeMs: number;
  requestMs: number;
  takeMs: number;
  presentMs: number;
}

export interface SupportReport {
  done: boolean;
  browser: string;
  webgl2: WebGL2Report;
  webgpu: WebGPUReport;
  drops: { source: string };
  // (the bolt's shapes' worker: "url" or "blob" when made, "" when none can be; undefined while
  // trying)
  workers: string | undefined;
  // (what the page offers for threads: Workers.threads())
  threads: ThreadsReport | null;
  // (the scene's worker: the hashes, the rain's layouts, the characters; "url", "blob" or
  // "fetched" when made, "" when none can be; undefined while trying)
  sceneWorker: string | undefined;
  // (where the renderer runs: "worker" or "page", why on the page, and whether the worker's
  // state block is a SharedArrayBuffer; undefined until decided)
  renderer: string | undefined;
  rendererWhy: string;
  rendererShared: boolean;
  // (the HDR probe's result: null until it has run, which it does only when the support readout is
  // about to be shown; made on the page, given to the renderer by a message)
  hdr: HdrReport | null;
  hdrOutput: HdrOutputReport;
  // (the readout's sections: the support's, Debug mode's Performance, Music and OLED readouts'
  // values, null when off)
  debug: { support: boolean; performance: PerformanceReport | null; music: MusicReport | null; oled: OledReport | null };
}

export const createSupport = (): SupportReport => ({
  done: false,
  browser: (navigator.userAgent.match(/(Chrome|Edg)\/[\d.]+/g) || ["unknown"]).join(", "),
  webgl2: { ok: false, version: "", glsl: "", renderer: "", maxTexture: 0, maxSamples: 0, floatTargets: false, timerQueries: false, error: "" },
  webgpu: {
    api: !!navigator.gpu,
    ok: false,
    adapter: "",
    fallbackAdapter: false,
    features: [],
    limits: {},
    format: "",
    compute: "not run",
    render: "not run",
    frames: 0,
    errors: [],
    error: "",
  },
  drops: { source: "none" },
  workers: undefined,
  threads: null,
  sceneWorker: undefined,
  renderer: undefined,
  rendererWhy: "",
  rendererShared: false,
  hdr: null,
  hdrOutput: { on: false, why: "HDR setting off", headroom: 4, frames: 0, presenter: "", path: "", spikeMs: 0, requestMs: 0, takeMs: 0, presentMs: 0 },
  debug: { support: true, performance: null, music: null, oled: null },
});
