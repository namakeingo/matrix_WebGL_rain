// HdrOutput: the HDR output's rules as pure functions, with no GL and no page.
// - decide(report, toggle): whether the HDR path runs. Only with the HDR setting on, a display
//   that reports high dynamic range (the probe's `display`) and a WebGPU canvas that takes the
//   extended tone mapping (the probe's `webgpu`); every other case, an unknown value included, is
//   the SDR path, with the reason in words for the readout.
// - curve(x, headroom): the tone map's output for the light x (after exposure), in SDR-white
//   units (an extended-range canvas shows 1 as the user's SDR white and more as HDR, up to what
//   the display allows). Up to x = 1 it is the SDR curve (ACES, Narkowicz's fit) exactly, so what
//   SDR shows is unchanged; above 1 an extra term t^2 / (1 + t^2), t = (x - 1) / SPAN, lifts the
//   highlights toward the headroom (smooth at 1: its slope there is 0). The output never exceeds
//   the headroom; headroom 1 is the SDR curve everywhere.
// - encode(x): the sRGB transfer curve, extended above 1: the values a WebGPU canvas takes whatever
//   its format (colorSpace "srgb" means sRGB-encoded values, also in rgba16float: linear light written
//   to it shows far too dark); the tone map writes encode(curve(light)). The curve above 1 is the
//   same formula, so an encoded 1.8247 is the linear light 4.
// - ENCODED_MAX: the picture read back is 10 bits a channel over 0 to ENCODED_MAX (the encoded output
//   scaled by it; 4 bytes a pixel, half the bytes of half floats, which cost 14.5 ms at 1920 x 2160 to
//   read back): a step of ENCODED_MAX / 1023 is finer than the SDR output's 8 bits.
// - pathFor(checked, supported): how the picture reaches WebGPU: "bitmap" (an ImageBitmap of a WebGL canvas,
//   its 10 bit levels packed in 8 bit pixels: no CPU readback) only where it is supported and its self-check
//   (a known picture sent through it once) came back exact; else "readback" (getBufferSubData).
// - headroomFor(max, display): the headroom used: MAX_HEADROOM, or the display's own headroom
//   where known if lower (never below 1: SDR).
// The same curve is in shaders/exposure/fragment.glsl (hdrCurve), checked against this one.
//
// Changelog:
// 2026-11-05: new, for the HDR setting.
// 2026-11-05: ENCODED_MAX, the 10 bit picture's range.
// 2026-11-05: pathFor, the bitmap path or the readback.
// 2026-11-05: encode: the output is sRGB-encoded (it was linear, and showed too dark).
import { M } from "../engine/core";

// the most the highlights rise above SDR white (a multiple of it)
const MAX_HEADROOM = 4;
// the light above 1 over which the lift builds (t = 1 at x = 1 + SPAN: half the lift)
const SPAN = 4;
// the range the 10 bit picture covers: the encoded output of MAX_HEADROOM (1.8247) rounded up
const ENCODED_MAX = 2;

const aces = (x: number): number => {
  const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return Math.min(Math.max(v, 0), 1);
};

const curve = (x: number, headroom: number): number => {
  const base = aces(x);
  const t = Math.max(x - 1, 0) / SPAN;
  return base + (headroom - 1) * ((t * t) / (1 + t * t));
};

const encode = (x: number): number => (x < 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

const pathFor = (checked: boolean | null, supported: boolean): "bitmap" | "readback" => (supported && checked === true ? "bitmap" : "readback");

const headroomFor = (max: number, display: number | null): number => {
  if (display === null || !(display === display)) {
    return max;
  }
  return Math.max(1, Math.min(max, display));
};

export interface HdrGate {
  on: boolean;
  why: string;
}

interface GateReport {
  display: string;
  webgpu: string;
}

const decide = (report: GateReport | null, toggle: boolean): HdrGate => {
  if (!toggle) {
    return { on: false, why: "HDR setting off" };
  }
  if (!report) {
    return { on: false, why: "HDR not probed yet" };
  }
  if (report.display !== "high") {
    return { on: false, why: `the display does not report HDR (${report.display}): HDR on in Windows and Wallpaper Engine's Post-processing Ultra (Display HDR) needed` };
  }
  if (report.webgpu !== "yes") {
    return { on: false, why: `no WebGPU extended tone mapping (${report.webgpu})` };
  }
  return { on: true, why: "HDR on" };
};

export const HdrOutput = { MAX_HEADROOM, SPAN, ENCODED_MAX, pathFor, encode, curve, headroomFor, decide };

M.HdrOutput = HdrOutput;
