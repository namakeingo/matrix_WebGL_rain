// WaterTone: the water's body colour and the ripples' brightness strengths; pure, so the water's effect and the
// tests read the same rules. Plane tone tints the water's body light (the water lit by the sky, the moon and the
// strikes) per channel by the picked colour in linear light: white is exactly 1, 1, 1 (the water unchanged, bit for
// bit), black no body light; the mirror reflection is never tinted. Ripples highlights and shadows (0 to 100) act
// on the water's whole light (body and mirror) against the same water still: per channel, delta = the ripples'
// light - the still water's; delta > 0 gets delta x (highlights / 100 x RIPPLE_GAIN) more, delta < 0 gets
// delta x (shadows / 100 x RIPPLE_GAIN) more (deeper), never below 0; 0 is no change, bit for bit.
//
// Changelog:
// 2026-11-05: new.
import { M } from "../engine/core";

// the most a strength of 100 adds to a difference: delta x RIPPLE_GAIN
const RIPPLE_GAIN = 2;

// the picked colour ("r g b", sRGB) as linear light
function tint(color: string): Float32Array {
  return M.color(color);
}

// the body light times the tint, per channel
function body(light: ArrayLike<number>, tintOf: ArrayLike<number>): number[] {
  return [light[0] * tintOf[0], light[1] * tintOf[1], light[2] * tintOf[2]];
}

// one channel's light with the ripples (ripple) against the same water still (still), by the two strengths (0 to 100)
function rippleGain(still: number, ripple: number, highlights: number, shadows: number): number {
  const delta = ripple - still;
  const strength = Math.min(Math.max(delta > 0 ? highlights : shadows, 0), 100);
  return Math.max(ripple + delta * ((strength / 100) * RIPPLE_GAIN), 0);
}

export const WaterTone = { RIPPLE_GAIN, tint, body, rippleGain };

M.WaterTone = WaterTone;
