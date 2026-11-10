// AudioGen: synthetic Wallpaper Engine audio arrays (Debug mode's Simulated music): 128 values,
// 64 bins of the left channel then 64 of the right, low to high frequencies, as
// wallpaperRegisterAudioListener gives them; levels modelled on typical spectra (the bass the
// strongest, values mostly 0 to 1). The same music as matrix_web_rain's audiogen.js, value for
// value: the same random numbers (a linear congruential generator of its own, never Math.random,
// worked out in doubles as there: the product before the mask is not a 32-bit one), drawn in the
// same order (one for each bin's noise, then one for the right channel's).
// new AudioGen(kind, seed = 7); fill(t, out): the array at the time t (s) into out (any array of
// 128, filled and given back; no allocation). AudioGen.KINDS: the kinds, in the Simulated music
// setting's order; an unknown kind is silent.
//   silent: all 0
//   soft: quiet, smooth, slowly swelling (ambient, piano)
//   pop: 118 bpm kick and snare, louder choruses, an accent hit now and then
//   metal: loud distorted guitars everywhere and a fast double kick
//   dubstep: 140 bpm half-time beat with a loud wobbling bass
//   steady: constantly loud
//   pulses: quiet and very loud, alternating
//   slowbeat, fastbeat: the same loud kick on every beat, at 70 or 170 bpm (fading over 0.15 s,
//     longer than a frame, so every beat's sampled peak is about as high)
//   verse, chorus: the same kick at 120 bpm over quieter or louder music
//   darkmusic, brightmusic: the same loudness and kick, the sound low or spread high
//   loudest: every bin of both channels at the top (1): the music's chance is 1 in every column (this version's own kind)
//   tone100loud: a loud constant tone of 100 Hz (the second bin, a little in the bins beside
//     it, both channels the same, no noise); tone100quiet: the same, 12 times quieter
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/debug/ (was engine/audiogen.js).
import { M } from "../engine/core";

// a kind's level of bin f (0-63) at the time t (s), with its noise n
type LevelOf = (f: number, t: number, n: number) => number;

const BINS = 64;
const TAU = 2 * Math.PI;

// the bass's share of a bin, and the tilt down to the high frequencies
const bass = (f: number) => Math.exp(-f / 12);
const tilt = (f: number) => 1 - (0.7 * f) / 64;

// the kick at 120 bpm the beat kinds share (fading over 0.15 s)
const hit120 = (t: number) => Math.exp(-(t % 0.5) / 0.15);

// each kind's level of bin f at the time t, with its noise n (1 +- 25%); null for the kinds
// without noise (their own level, n not applied)
const KIND_LEVELS: Record<string, LevelOf> = {
  silent: () => 0,
  soft: (f: number, t: number, n: number) => {
    const swell = 1 + 0.3 * Math.sin((TAU * t) / 6);
    return 0.045 * swell * (0.5 + 1.5 * bass(f)) * tilt(f) * n;
  },
  pop: (f: number, t: number, n: number) => {
    const beat = 60 / 118;
    const chorus = t % 25 > 15;
    const level = chorus ? 0.12 : 0.085;
    const kick = Math.exp(-(t % beat) / 0.07);
    const snare = Math.exp(-((t + beat / 2) % beat) / 0.06);
    // (an accent, a crash and a kick, at the start of every 8th bar of a chorus)
    const bar = beat * 4;
    const accent = chorus && Math.floor(t / bar) % 4 == 0 ? Math.exp(-(t % bar) / 0.12) : 0;
    return (level * (0.5 + 1.5 * bass(f)) * tilt(f) + 0.3 * kick * bass(f) + 0.1 * snare * (1 - bass(f)) * tilt(f) + 0.45 * accent * tilt(f)) * n;
  },
  metal: (f: number, t: number, n: number) => (0.34 * (0.6 + 0.8 * bass(f)) * (1 - (0.4 * f) / 64) + 0.3 * Math.exp(-(t % 0.083) / 0.03) * bass(f)) * n,
  dubstep: (f: number, t: number, n: number) => {
    const half = (60 / 140) * 2;
    const wobble = 0.5 + 0.5 * Math.sin(TAU * 4 * t);
    const kick = Math.exp(-(t % half) / 0.08);
    const snare = Math.exp(-((t + half / 2) % half) / 0.07);
    return (0.14 * (0.5 + 1.2 * bass(f)) * tilt(f) + 0.55 * wobble * bass(f) + 0.45 * kick * bass(f) + 0.35 * snare * tilt(f)) * n;
  },
  steady: (f: number, t: number, n: number) => 0.5 * (0.6 + 0.8 * bass(f)) * tilt(f) * n,
  pulses: (f: number, t: number, n: number) => (t % 0.5 < 0.2 ? 0.55 : 0.06) * (0.6 + 0.8 * bass(f)) * tilt(f) * n,
  slowbeat: (f: number, t: number, n: number) => (0.06 * (0.5 + 1.5 * bass(f)) * tilt(f) + 1.4 * Math.exp(-(t % (60 / 70)) / 0.15) * bass(f)) * n,
  fastbeat: (f: number, t: number, n: number) => (0.06 * (0.5 + 1.5 * bass(f)) * tilt(f) + 1.4 * Math.exp(-(t % (60 / 170)) / 0.15) * bass(f)) * n,
  verse: (f: number, t: number, n: number) => (0.04 * (0.5 + 1.5 * bass(f)) * tilt(f) + 1.4 * hit120(t) * bass(f)) * n,
  chorus: (f: number, t: number, n: number) => (0.13 * (0.5 + 1.5 * bass(f)) * tilt(f) + 1.4 * hit120(t) * bass(f)) * n,
  // (the music's shape over its mean, so both are as loud)
  darkmusic: (f: number, t: number, n: number) => ((0.09 * Math.exp(-f / 5)) / 0.078 + 1.4 * hit120(t) * bass(f)) * n,
  brightmusic: (f: number, t: number, n: number) => ((0.09 * (0.25 + f / 64)) / 0.742 + 1.4 * hit120(t) * bass(f)) * n,
  tone100loud: (f: number) => (f == 1 ? 0.3 : f == 0 || f == 2 ? 0.08 : 0),
  tone100quiet: (f: number) => (f == 1 ? 0.3 : f == 0 || f == 2 ? 0.08 : 0) / 12,
  // (this version's own, not matrix_web_rain's: every bin at the top, 1, so every column's chance with the music is 1 and the rain's density target is the whole of the density set)
  loudest: () => 1,
};

// the kinds whose level is their own (no noise)
const NOISELESS = new Set(["tone100loud", "tone100quiet", "loudest"]);

export class AudioGen {
  static KINDS: readonly string[];
  state: number;
  noisy: boolean;
  level: LevelOf;
  kind: string;
  constructor(kind: string, seed = 7) {
    this.kind = kind;
    this.level = KIND_LEVELS[kind] || KIND_LEVELS.silent;
    this.noisy = !NOISELESS.has(kind);
    // (0 is taken as the default, as in matrix_web_rain)
    this.state = seed || 7;
  }

  // the next random number, 0 to 1 (the product in doubles, as matrix_web_rain's)
  random(): number {
    this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }

  fill<T extends { [index: number]: number }>(t: number, out: T): T {
    for (let f = 0; f < BINS; f++) {
      const noise = 1 + 0.25 * (this.random() * 2 - 1);
      const v = this.level(f, t, this.noisy ? noise : 1);
      out[f] = v;
      out[f + BINS] = v * (0.95 + 0.1 * this.random());
    }
    return out;
  }
}

AudioGen.KINDS = Object.freeze(["silent", "soft", "pop", "metal", "dubstep", "steady", "pulses", "slowbeat", "fastbeat", "verse", "chorus", "darkmusic", "brightmusic", "tone100loud", "tone100quiet", "loudest"]);

M.AudioGen = AudioGen;
