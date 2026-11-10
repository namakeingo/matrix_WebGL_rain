// The HDR probe: what the page can say about showing HDR, from its own objects (a worker has no
// screen information and no matchMedia, so the page probes). probeHdr(env) is pure: the page's
// objects (or stand-ins) are given in env, and every value it cannot tell is "unknown", never a
// guess; nothing it reads throws out of it. pageHdrEnv() makes the page's env: matchMedia and
// screen, and two canvas feature checks.
//   dynamic-range / video-dynamic-range: the display and browser's capability for HDR (not whether
//   Windows' HDR is switched on); color-gamut: the widest of rec2020, p3 and srgb that matches
//   WebGPU: a canvas configured with toneMapping { mode: "extended" } (Chromium 129), read back
//   by getConfiguration() (Chromium 131); asked with a throwaway device, destroyed at once
//   WebGL: the HDR canvas API is only a proposal (drawingBufferStorage, drawingBufferToneMapping):
//   its presence on a WebGL 2.0 context is all that is checked
// It is run only when the support readout is about to be shown (platform/page.ts), never per
// frame.
//
// Changelog:
// 2026-11-05: new.
import { M } from "../engine/core";
import type { HdrReport } from "./support";

type Word = "yes" | "no" | "unknown";

export interface HdrEnv {
  matchMedia?: (query: string) => { matches: boolean };
  screen?: { colorDepth?: number };
  // whether a WebGPU canvas takes the extended tone mapping: null when it cannot be told
  webgpuExtended?: () => Promise<boolean | null>;
  // whether a WebGL 2.0 canvas has the HDR output API: null when it cannot be told
  webglHdr?: () => boolean | null;
}

const word = (value: boolean | null): Word => (value === null ? "unknown" : value ? "yes" : "no");

// a media feature at "high" as the display says, or "unknown"
const level = (env: HdrEnv, query: string): "high" | "standard" | "unknown" => {
  try {
    if (typeof env.matchMedia !== "function") {
      return "unknown";
    }
    return env.matchMedia(query).matches ? "high" : "standard";
  } catch {
    return "unknown";
  }
};

const gamutOf = (env: HdrEnv): string => {
  try {
    if (typeof env.matchMedia !== "function") {
      return "unknown";
    }
    for (const gamut of ["rec2020", "p3", "srgb"]) {
      if (env.matchMedia(`(color-gamut: ${gamut})`).matches) {
        return gamut;
      }
    }
  } catch {
    // (unknown)
  }
  return "unknown";
};

const depthOf = (env: HdrEnv): number | null => {
  try {
    const depth = env.screen && env.screen.colorDepth;
    return typeof depth === "number" && depth > 0 ? depth : null;
  } catch {
    return null;
  }
};

const settled = async (check: (() => Promise<boolean | null> | boolean | null) | undefined): Promise<Word> => {
  if (typeof check !== "function") {
    return "unknown";
  }
  try {
    const value = await check();
    return typeof value === "boolean" ? word(value) : "unknown";
  } catch {
    return "unknown";
  }
};

export const probeHdr = async (env: HdrEnv): Promise<HdrReport> => {
  const [webgpu, webgl] = await Promise.all([settled(env.webgpuExtended), settled(env.webglHdr)]);
  return {
    display: level(env, "(dynamic-range: high)"),
    video: level(env, "(video-dynamic-range: high)"),
    gamut: gamutOf(env),
    colorDepth: depthOf(env),
    webgpu,
    webgl,
  };
};

// the page's WebGPU check: a throwaway device and canvas, the extended tone mapping configured and
// read back; the device destroyed whatever happens. true: configured as extended; false: the
// configuration reads back without it (or no WebGPU); null: cannot be told (no getConfiguration)
interface ToneMappedContext {
  configure(configuration: object): void;
  unconfigure(): void;
  getConfiguration?: () => { toneMapping?: { mode?: string } } | null;
}
const webgpuExtended = async (): Promise<boolean | null> => {
  const gpu = navigator.gpu;
  if (!gpu) {
    return false;
  }
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    return false;
  }
  const device = await adapter.requestDevice();
  try {
    const context = document.createElement("canvas").getContext("webgpu") as unknown as ToneMappedContext | null;
    if (!context) {
      return null;
    }
    try {
      context.configure({ device, format: "rgba16float", toneMapping: { mode: "extended" } });
      if (typeof context.getConfiguration !== "function") {
        return null;
      }
      const configuration = context.getConfiguration();
      if (!configuration) {
        return null;
      }
      if (configuration.toneMapping && configuration.toneMapping.mode) {
        return configuration.toneMapping.mode === "extended";
      }
      return "toneMapping" in configuration ? false : null;
    } finally {
      context.unconfigure();
    }
  } finally {
    device.destroy();
  }
};

// presence of the HDR output API (only proposed) on a WebGL 2.0 context's class
const webglHdr = (): boolean | null => {
  if (typeof WebGL2RenderingContext !== "function") {
    return null;
  }
  const proto = WebGL2RenderingContext.prototype;
  return "drawingBufferStorage" in proto && "drawingBufferToneMapping" in proto;
};

export const pageHdrEnv = (): HdrEnv => ({
  matchMedia: typeof window.matchMedia === "function" ? (query: string) => window.matchMedia(query) : undefined,
  screen: window.screen,
  webgpuExtended,
  webglHdr,
});

M.probeHdr = probeHdr;
M.pageHdrEnv = pageHdrEnv;
