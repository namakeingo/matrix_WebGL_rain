// SkyLight: the sky's and the moon's light as settings, a pure model (no GL, no page).
// - gains({ brightness, skyTone, moonTone }): each light's gain per channel in linear light, as the
//   fog's uniform block holds it: { sky, moon } (Float32Array of 3 each).
//   gain = (brightness / DEFAULT_BRIGHTNESS) x linear(picked) / linear(default tone), channel by
//   channel, so at the defaults it is exactly 1 (the same float operations on the same strings),
//   a darker pick dims its light, black gives none, and brightness scales both lights in
//   proportion (0: no light, 10: twice, 100: twenty times).
// - The tones are Wallpaper Engine's colors ("r g b", sRGB), made linear by M.color.
//
// Changelog:
// 2026-11-05: new, a module of src/models/.
import { M } from "../engine/core";

// the defaults of Sky and moon brightness, Sky tone and Moon tone (project.json's)
const DEFAULT_BRIGHTNESS = 5;
const DEFAULT_SKY_TONE = "0.050980392156862744 0.043137254901960784 0.08627450980392157";
const DEFAULT_MOON_TONE = "0.5843137254901961 0.6 0.6352941176470588";

// a tone's linear gain over its default's, per channel, times the slider's gain
const toneGain = (tone: string, base: string, brightness: number): Float32Array => {
  const picked = M.color(tone);
  const reference = M.color(base);
  const slider = brightness / DEFAULT_BRIGHTNESS;
  const gain = new Float32Array(3);
  for (let c = 0; c < 3; c++) {
    gain[c] = (picked[c] / reference[c]) * slider;
  }
  return gain;
};

export interface SkyLightInput {
  brightness: number;
  skyTone: string;
  moonTone: string;
}

export interface SkyLightGains {
  sky: Float32Array;
  moon: Float32Array;
}

const gains = (p: SkyLightInput): SkyLightGains => ({
  sky: toneGain(p.skyTone, DEFAULT_SKY_TONE, p.brightness),
  moon: toneGain(p.moonTone, DEFAULT_MOON_TONE, p.brightness),
});

export const SkyLight = { DEFAULT_BRIGHTNESS, DEFAULT_SKY_TONE, DEFAULT_MOON_TONE, gains };

M.SkyLight = SkyLight;
