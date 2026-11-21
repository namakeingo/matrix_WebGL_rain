// SkyLight: the Orb's light and the air's tone as settings, a pure model (no GL, no page).
// - gains({ brightness, airTone, moonTone }): { moon, air } (Float32Array of 3 each), as the fog's uniform block and the atmosphere's tables hold them.
//   moon is the Orb's gain per channel in linear light: (brightness / DEFAULT_BRIGHTNESS) x linear(picked) / linear(default tone), channel by channel, so at the defaults it is exactly 1
//   (the same float operations on the same strings), a darker pick dims the Orb, black gives none, and the slider scales the Orb's light in proportion (0: no light, 50: the default, 100: twice).
//   air is the Air tone as linear light: linear(picked) per channel (the default white "1 1 1" is exactly 1), NOT scaled by the slider (the tone is a property of the air, the slider the Orb's):
//   it multiplies the air's scattering coefficients (models/atmosphere.ts: AtmosphereInput.tone). There is no sky gain: the sky is the atmosphere's, the Orb's light scattered.
// - The tones are Wallpaper Engine's colors ("r g b", sRGB), made linear by M.color.
//
// Changelog:
// 2026-11-05: new, a module of src/models/.
// 2026-11-19: the slider's default 50 (was 5), its range 0 to 100 now the earlier 0 to 10: gain = brightness / 50.
// 2026-11-20: the slider's default 40 (the value whose default picture is closest to the flat-sky version's: the water's light matches), the gain's reference stays 50 (REFERENCE_BRIGHTNESS).
// 2026-11-20: the flat sky's gain and DEFAULT_SKY_TONE removed; the Air tone (DEFAULT_AIR_TONE white, gains().air) added (Feature S1, stories A2 and A5).
import { M } from "../engine/core";

// the defaults of Sky/Orb brightness, Air tone and Orb tone (project.json's)
// the slider's default (project.json's) and the gain's reference: the slider value at which the Orb's gain is 1 (the earlier physical light; slider 100 is twice it)
const DEFAULT_BRIGHTNESS = 40;
const REFERENCE_BRIGHTNESS = 50;
const DEFAULT_AIR_TONE = "1 1 1";
const DEFAULT_MOON_TONE = "0.5843137254901961 0.6 0.6352941176470588";

// a tone's linear gain over its default's, per channel, times the slider's gain
const toneGain = (tone: string, base: string, brightness: number): Float32Array => {
  const picked = M.color(tone);
  const reference = M.color(base);
  const slider = brightness / REFERENCE_BRIGHTNESS;
  const gain = new Float32Array(3);
  for (let c = 0; c < 3; c++) {
    gain[c] = (picked[c] / reference[c]) * slider;
  }
  return gain;
};

export interface SkyLightInput {
  brightness: number;
  airTone: string;
  moonTone: string;
}

export interface SkyLightGains {
  moon: Float32Array;
  air: Float32Array;
}

const gains = (p: SkyLightInput): SkyLightGains => ({
  moon: toneGain(p.moonTone, DEFAULT_MOON_TONE, p.brightness),
  air: Float32Array.from(M.color(p.airTone)),
});

export const SkyLight = { DEFAULT_BRIGHTNESS, REFERENCE_BRIGHTNESS, DEFAULT_AIR_TONE, DEFAULT_MOON_TONE, gains };

M.SkyLight = SkyLight;
