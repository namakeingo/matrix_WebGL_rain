// MusicFollower: what the music is doing, array by array, and whether it asks for a strike (pure: no GL, no page, no clock of its own: the time is given, in
// ms; importable in any thread; the music worker's model). The same maths as matrix_web_rain's (musicPeak and the functions it calls), value for value
// (units.ui.musicfollower.ts runs that code's text beside this one).
// - Every audio array (128 values: 64 bins left, 64 right, low to high; about 30 a second), step(array, now):
//   - loudness: the average of the values; a peak is the frame before the loudest of three (it rose, and the one now is not higher), whose score reaches the
//     threshold, at least GAP seconds after the last strike (struck(now) records one). The threshold runs in a straight line from PEAK_LEAST at sensitivity 0
//     (never: no peak at all at 0) to PEAK at 1. The score is loud x the loudness before + sudden x its rise above the floor, times the tempo's, the song
//     energy's and the brightness' factors (each 1 at its weight 0).
//   - the floor: drops at once to a quieter frame, rises over FLOOR_RISE seconds to a louder one (the step limited to 0.5 s: a paused wallpaper does not jump it).
//   - the tempo: the rise of the bass (the lowest 8 bins of each channel) of every array into a ring of ONSETS frames; every TEMPO_EVERY seconds their
//     autocorrelation gives the beat's period between 50 and 200 a minute (tempo) and how clear it is (beat, 0 to 1); the shortest of the periods that repeat
//     almost as well as the best (OCTAVE of it) is taken; the rises are blurred over the neighbouring frames first.
//   - the song's energy: the loudness of the part playing (an average over PART seconds) against the song's so far (over SONG seconds), both following only while
//     there is sound (above 0.01), each divided by how much of its span is filled yet; after WARM_UP seconds of sound.
//   - the brightness: the share of the loudness above the lowest quarter of the bins, an average over BRIGHT_SPAN seconds, while there is sound.
// - settings: the five weights and the sensitivity, 0 to 1 (the Settings' values over 100).
//
// Changelog:
// 2026-11-09: new (matrix_web_rain's music code, as a model).
import { M } from "../engine/core";
import { takeSnapshot, putSnapshot } from "./snapshot";
import type { Snapshot } from "./snapshot";

const PEAK = 0.2;
const PEAK_LEAST = 1.0;
const FLOOR_RISE = 0.6;
const GAP = 0.15;
const TEMPO_SLOW = 80;
const TEMPO_FAST = 160;
const TEMPO_SLOWEST = 0.25;
const TEMPO_FASTEST = 1.75;
const ONSETS = 256;
const TEMPO_EVERY = 0.5;
const OCTAVE = 0.7;
const ENERGY_PART = 3;
const ENERGY_SONG = 60;
const ENERGY_SLOPE = 3;
const ENERGY_LEAST = 0.25;
const ENERGY_MOST = 1.75;
const ENERGY_WARM_UP = 10;
const BRIGHT_SPAN = 2;
const BRIGHT_LOW = 0.25;
const BRIGHT_HIGH = 0.55;
const BRIGHT_LEAST = 0.25;
const BRIGHT_MOST = 1.75;

export interface MusicSettings {
  sensitivity: number;
  loud: number;
  sudden: number;
  tempo: number;
  energy: number;
  brightness: number;
}

export interface MusicStep {
  peak: boolean;
  loudness: number;
  threshold: number;
  score: number;
}

function clamp(min: number, max: number, value: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export class MusicFollower {
  static PEAK = PEAK;
  static PEAK_LEAST = PEAK_LEAST;
  static GAP = GAP;
  static ONSETS = ONSETS;

  settings: MusicSettings;
  floor = 0;
  tempo = 0;
  beat = 0;
  brightness = 0;
  part = 0;
  song = 0;
  heard = 0;
  // the factors the last score was multiplied by (for the readout)
  tempoFactorNow = 1;
  energyFactorNow = 1;
  brightnessFactorNow = 1;
  // the loudness of the last two arrays, the time of the last array and of the last strike (ms)
  private before = 0;
  private earlier = 0;
  private lastTime = 0;
  private lastStrike = 0;
  // the bass's rises (a ring), its last value, the frame interval (ms) and the next estimate's time
  private onsets = new Float32Array(ONSETS);
  private onsetAt = 0;
  private onsetFilled = 0;
  private bass = 0;
  private frameMs = 1000 / 24;
  private tempoNext = 0;
  private work = new Float32Array(ONSETS);
  private result: MusicStep = { peak: false, loudness: 0, threshold: 0, score: 0 };

  constructor() {
    this.settings = { sensitivity: 0.5, loud: 0.3, sudden: 0.7, tempo: 0.5, energy: 0.5, brightness: 0.5 };
  }

  // the follower's whole state as plain data, and a follower made again from it (a worker-backed task hands the state over: models/snapshot.ts)
  snapshot(): Snapshot {
    return takeSnapshot(this);
  }

  restore(snapshot: Snapshot): void {
    putSnapshot(this, snapshot);
  }

  // a strike started at `now`
  struck(now: number): void {
    this.lastStrike = now;
  }

  // the music in this array (null: none) at `now` (ms); the result is reused: read it before the next step
  step(array: ArrayLike<number> | null, now: number): MusicStep {
    const s = this.settings;
    let loudness = 0;
    if (array && array.length) {
      for (let i = 0; i < array.length; i++) loudness += array[i]!;
      loudness = loudness / array.length;
    }
    const threshold = PEAK_LEAST - (PEAK_LEAST - PEAK) * s.sensitivity;
    const before = this.before;
    const earlier = this.earlier;
    this.earlier = before;
    this.before = loudness;
    let score = s.loud * before + s.sudden * Math.max(0, before - this.floor);
    this.tempoFactorNow = this.tempoFactor();
    this.energyFactorNow = this.energyFactor();
    this.brightnessFactorNow = this.brightnessFactor();
    score *= this.tempoFactorNow * this.energyFactorNow * this.brightnessFactorNow;
    const peak = s.sensitivity > 0 && before > earlier && before >= loudness && score >= threshold && now - this.lastStrike >= GAP * 1000;
    const seconds = Math.min(0.5, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (loudness < this.floor) {
      this.floor = loudness;
    } else {
      this.floor += (loudness - this.floor) * (1 - Math.exp(-seconds / FLOOR_RISE));
    }
    this.followTempo(array, seconds, now);
    if (loudness > 0.01) {
      this.followBrightness(array, seconds);
      this.part += (loudness - this.part) * (1 - Math.exp(-seconds / ENERGY_PART));
      this.song += (loudness - this.song) * (1 - Math.exp(-seconds / ENERGY_SONG));
      this.heard += seconds;
    }
    const out = this.result;
    out.peak = peak;
    out.loudness = loudness;
    out.threshold = threshold;
    out.score = score;
    return out;
  }

  // the part of each channel's loudness above its lowest quarter of the bins, averaged
  private followBrightness(array: ArrayLike<number> | null, seconds: number): void {
    if (!array || array.length < 8) return;
    const half = Math.floor(array.length / 2);
    const low = Math.floor(half / 4);
    let all = 0;
    let high = 0;
    for (let i = 0; i < half; i++) {
      const v = array[i]! + array[half + i]!;
      all += v;
      if (i >= low) high += v;
    }
    if (all > 0) this.brightness += (high / all - this.brightness) * (1 - Math.exp(-seconds / BRIGHT_SPAN));
  }

  private brightnessFactor(): number {
    const w = this.settings.brightness;
    if (!(w > 0) || this.heard < BRIGHT_SPAN) return 1;
    const bright = clamp(0, 1, (this.brightness - BRIGHT_LOW) / (BRIGHT_HIGH - BRIGHT_LOW));
    const factor = BRIGHT_LEAST + (BRIGHT_MOST - BRIGHT_LEAST) * bright;
    return 1 + (factor - 1) * w;
  }

  // an average that started from nothing, divided by how much of its span (s) is filled after `heard` seconds of sound
  private energyAverage(value: number, span: number): number {
    return value / Math.max(0.001, 1 - Math.exp(-this.heard / span));
  }

  private energyFactor(): number {
    const w = this.settings.energy;
    if (!(w > 0) || this.heard < ENERGY_WARM_UP || !(this.song > 0.001)) return 1;
    const part = this.energyAverage(this.part, ENERGY_PART);
    const song = this.energyAverage(this.song, ENERGY_SONG);
    const factor = clamp(ENERGY_LEAST, ENERGY_MOST, 1 + ENERGY_SLOPE * (part / song - 1));
    return 1 + (factor - 1) * w;
  }

  // the beat of this array (the rise of the bass), and every TEMPO_EVERY seconds a new estimate of the tempo
  private followTempo(array: ArrayLike<number> | null, seconds: number, now: number): void {
    let bass = 0;
    if (array && array.length >= 16) {
      const half = Math.floor(array.length / 2);
      for (let i = 0; i < 8; i++) bass += array[i]! + array[half + i]!;
      bass /= 16;
    }
    this.onsets[this.onsetAt] = Math.max(0, bass - this.bass);
    this.bass = bass;
    this.onsetAt = (this.onsetAt + 1) % ONSETS;
    this.onsetFilled = Math.min(ONSETS, this.onsetFilled + 1);
    if (seconds > 0) this.frameMs += (seconds * 1000 - this.frameMs) * 0.05;
    if (now >= this.tempoNext) {
      this.tempoNext = now + TEMPO_EVERY * 1000;
      this.estimateTempo();
    }
  }

  // the rise of the bass k arrays ago (0: this one)
  private onsetAgo(k: number): number {
    return this.onsets[(this.onsetAt - 1 - k + 2 * ONSETS) % ONSETS]!;
  }

  // the tempo and how clear the beat is, from the autocorrelation of the rises of the bass
  private estimateTempo(): void {
    const n = this.onsetFilled;
    const shortest = Math.max(2, Math.floor(60000 / 200 / this.frameMs));
    const longest = Math.min(n - 8, Math.ceil(60000 / 50 / this.frameMs));
    if (longest <= shortest + 1) {
      this.tempo = 0;
      this.beat = 0;
      return;
    }
    const o = this.work;
    for (let k = 0; k < n; k++) {
      const before = k > 0 ? this.onsetAgo(k - 1) : this.onsetAgo(k);
      const after = k + 1 < n ? this.onsetAgo(k + 1) : this.onsetAgo(k);
      o[k] = 0.25 * before + 0.5 * this.onsetAgo(k) + 0.25 * after;
    }
    let mean = 0;
    for (let k = 0; k < n; k++) mean += o[k]!;
    mean /= n;
    let power = 0;
    for (let k = 0; k < n; k++) power += (o[k]! - mean) * (o[k]! - mean);
    power /= n;
    if (!(power > 1e-9)) {
      this.tempo = 0;
      this.beat = 0;
      return;
    }
    const values: number[] = [];
    let top = -2;
    for (let lag = shortest - 1; lag <= longest + 1; lag++) {
      let sum = 0;
      for (let k = 0; k + lag < n; k++) sum += (o[k]! - mean) * (o[k + lag]! - mean);
      const value = sum / (n - lag) / power;
      values.push(value);
      if (lag >= shortest && lag <= longest) top = Math.max(top, value);
    }
    let best = shortest;
    let bestValue = -2;
    for (let lag = shortest; lag <= longest; lag++) {
      const v = values[lag - shortest + 1]!;
      if (v >= OCTAVE * top && v >= values[lag - shortest]! && v >= values[lag - shortest + 2]!) {
        best = lag;
        bestValue = v;
        break;
      }
    }
    if (bestValue < -1) bestValue = top;
    const a = values[best - shortest]!;
    const b = values[best - shortest + 1]!;
    const c = values[best - shortest + 2]!;
    const shift = a - 2 * b + c < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / (a - 2 * b + c))) : 0;
    this.tempo = 60000 / ((best + shift) * this.frameMs);
    this.beat = Math.max(0, Math.min(1, bestValue));
  }

  private tempoFactor(): number {
    const w = this.settings.tempo;
    if (!(w > 0)) return 1;
    const fast = clamp(0, 1, (this.tempo - TEMPO_SLOW) / (TEMPO_FAST - TEMPO_SLOW)) * Math.min(1, this.beat / 0.3);
    const factor = TEMPO_SLOWEST + (TEMPO_FASTEST - TEMPO_SLOWEST) * fast;
    return 1 + (factor - 1) * w;
  }
}

M.MusicFollower = MusicFollower;
