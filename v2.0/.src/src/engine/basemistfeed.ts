// What the base mist's job needs, held on the CPU (Feature P1, story M7b; the GL half is gone: no read-back of the noise or the shade grid): the noise is generated in the job's own thread from its stretch (M.NoiseField,
// params.noiseStretch: nothing to ship), and the base shade grid is the CPU's (M.BaseShadeGrid, baked in bands by the 'baseshade' tasks and installed with setGrid(version, halves); the version bumps on the grid's events only).
// The feed makes no GL call at all.
// - ready(bakes, shaded): the noise's stretch is known and, with the base's own shade on, a grid is installed
// - setNoiseStretch(stretch), setGrid(version, halves), clearGrid(); noiseVersion, gridVersion
// - ship(): the job's noise (always null: generated in the thread) and grid, each null when the worker has that version (M.BaseMistJob.Shipper); forgetWorker() (a worker lost or made again); release()
// - change(time), want(time, bakes, shaded), pump(), setEpoch(seconds): kept as no-ops (the earlier read-back feed's calls)
//
// Changelog:
// 2026-11-23: story M7b: no GL: the noise generated in the thread, the base shade grid from the CPU (setGrid); the read-backs, the front snapshot's reads and AsyncRead's use removed; registered as M.BaseMistFeed.
// 2026-11-23: new (Feature P1, story P6 = M7).
import { M } from "./core";
import { BaseMistJob } from "../models/basemistjob";

export class BaseMistFeed {
  noiseVersion = 0;
  gridVersion = 0;
  private stretch: number | null = null;
  private grid: Uint16Array | null = null;
  private shipper = new BaseMistJob.Shipper();

  // (the effect is not used: the feed holds no GL object)
  constructor(_fog?: unknown) {
    void _fog;
  }

  get noiseStretch(): number | null {
    return this.stretch;
  }

  ready(_bakes: number, shaded: boolean): boolean {
    void _bakes;
    return this.stretch !== null && (!shaded || this.grid !== null);
  }

  setNoiseStretch(stretch: number): void {
    if (this.stretch !== stretch) {
      this.stretch = stretch;
      this.noiseVersion++;
    }
  }

  setGrid(version: number, halves: Uint16Array): void {
    this.gridVersion = version;
    this.grid = halves;
  }

  clearGrid(): void {
    this.grid = null;
  }

  change(_time: number): void {
    void _time;
  }

  want(_time: number, _bakes: number, _shaded: boolean): void {
    void _time;
    void _bakes;
    void _shaded;
  }

  pump(): void {
    // (nothing is read back)
  }

  setEpoch(_seconds: number): void {
    void _seconds;
  }

  ship(): { noise: Uint8Array | null; grid: Uint16Array | null } {
    return this.shipper.ship(this.noiseVersion, null, this.gridVersion, this.grid || new Uint16Array(0));
  }

  forgetWorker(): void {
    this.shipper.reset();
  }

  release(): void {
    this.grid = null;
    this.stretch = null;
    this.noiseVersion = 0;
    this.gridVersion = 0;
    this.shipper.reset();
    BaseMistJob.forget();
  }
}

M.BaseMistFeed = BaseMistFeed;
