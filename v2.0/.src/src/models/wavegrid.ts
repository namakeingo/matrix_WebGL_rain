// WaveGrid: which grid the waves use, from the effective brightness B of the Orb's light and the sky's. The waves run on the production 1024 x 512 grid; at a high B (a bright
// Orb, whose light shows the finer ripples) the full 2048 x 1024 grid. B is 1 at the defaults (Sky/Orb brightness 50, the default Orb tone), so the default picture is the
// production grid.
//
//   orbRatio = the luminance of the Orb's light (its tone's linear colour x brightness / 50, Rec. 709 weights) over that of the default tone at brightness 50
//   skyRatio = orbRatio x the luminance of the linear air tone (1 when there is none)
//   B        = orbRatio^W_ORB x skyRatio^W_SKY
//
// The choice has a gap against flapping: the full grid from B >= UP, the production grid again only under DOWN; between them the grid in use stays. Pure: no GL, no page.
//
// The weighted mean is rounded to 12 decimals: pow(2, 0.75) x pow(2, 0.25) is 1.9999999999999998 in floating point, which would keep the slider's 100 (B = 2) under UP.
//
// Changelog:
// 2026-11-20: new.
import { M } from "../engine/core";

const UP = 2;
const DOWN = 1.8;
const W_ORB = 0.75;
const W_SKY = 0.25;
// the default Orb tone (models/skylight.ts DEFAULT_MOON_TONE) and brightness
const DEFAULT_TONE = "0.5843137254901961 0.6 0.6352941176470588";
// the slider value at which the Orb's gain is 1 (models/skylight.ts REFERENCE_BRIGHTNESS)
const REFERENCE_BRIGHTNESS = 50;

// the luminance of a linear colour (Rec. 709 weights) scaled by `scale`
function luminance(c: ArrayLike<number>, scale: number): number {
  return 0.2126 * (c[0]! * scale) + 0.7152 * (c[1]! * scale) + 0.0722 * (c[2]! * scale);
}

const REFERENCE = luminance(M.color(DEFAULT_TONE), 1);

function effective(orbRatio: number, skyRatio: number): number {
  if (!(orbRatio > 0) || !(skyRatio > 0)) {
    return 0;
  }
  return Math.round(Math.pow(orbRatio, W_ORB) * Math.pow(skyRatio, W_SKY) * 1e12) / 1e12;
}

// the grid to use next: the full one from B >= UP, the production one again only under DOWN, the one in use in between
function choose(b: number, full: boolean): boolean {
  return full ? !(b < DOWN) : b >= UP;
}

function orbRatio(brightness: number, orbTone: string): number {
  return luminance(M.color(orbTone), brightness / REFERENCE_BRIGHTNESS) / REFERENCE;
}

function skyRatio(brightness: number, orbTone: string, airTone?: string): number {
  const orb = orbRatio(brightness, orbTone);
  return airTone === undefined ? orb : orb * luminance(M.color(airTone), 1);
}

function brightnessOf(p: { brightness: number; orbTone: string; airTone?: string }): number {
  return effective(orbRatio(p.brightness, p.orbTone), skyRatio(p.brightness, p.orbTone, p.airTone));
}

export const WaveGrid = { UP, DOWN, W_ORB, W_SKY, effective, choose, orbRatio, skyRatio, brightnessOf };

M.WaveGrid = WaveGrid;
