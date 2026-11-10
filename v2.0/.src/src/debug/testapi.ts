// The tests' API (window.Rain3D): the scene's parts and state, its pictures drawn on demand, the
// script's time a frame by effect (frameCost). Installed only with the tests' flag (M.TEST:
// window.Matrix3DTest, set by the test pages before the wallpaper loads), by src/index.ts; never
// in the wallpaper as shipped (supporttest.html ?test=plain, shipped).
//
// Changelog:
// 2026-11-04: out of index.js into a module of its own.
import { M as Matrix3D } from "../engine/core";
import type { Wallpaper, Parts } from "../index";
import type { Waves } from "../effects/waves";
import type { Lightning } from "../effects/lightning";

export type TestApi = ReturnType<typeof makeTestApi>;

// a method of an effect's prototype, timed in its place
type Method = (this: unknown, ...args: unknown[]) => unknown;

// the frame costs' sums (ms) by part, then by effect or call
type Part = "advance" | "update" | "draw" | "calls";
type Sums = Record<Part, Record<string, number>>;

// the tests' API of a wallpaper on the page (ready: its start)
const makeTestApi = (wallpaper: Wallpaper, ready: Promise<void>) => {
  // for the tests: the scene's parts and state
  const M = () => Matrix3D;

  // the script's time a frame by effect (for the tests): each effect's advance and update, and the
  // drawing methods render calls, timed once frameCost is first used (their classes' methods
  // wrapped, kept over rebuilds), each method's own time (the timed calls it makes taken out);
  // read() gives the means a frame since reset(); the simulation's calls between the effects (a
  // landing's splashes and impacts) timed on their own too ("calls", taken out of the caller's)
  const CALLS: Record<string, string[]> = {
    Splashes: ["fromLanding"],
    Waves: ["add"],
  };
  const DRAWING: Record<string, string[]> = {
    Lightning: ["levelsAt", "boltLevelsAt"],
    Fog: ["setStrikes"],
    Rain: ["draw", "drawNewest"],
    Splashes: ["draw"],
    Bolt: ["setStrikes", "bindCover", "coverScene", "draw", "unbindCover"],
    Reflection: ["render", "bind", "done"],
    Water: ["draw"],
    Exposure: ["begin", "beginGlyphs", "resolveGlyphs", "finish"],
    Bloom: ["render", "done"],
    Text: ["composite"],
  };
  const frameCost = (() => {
    const sums: Sums = { advance: {}, update: {}, draw: {}, calls: {} };
    const parts = Object.keys(sums) as Part[];
    let frames = 0;
    let frameMs = 0;
    // (the timed calls open: each one's time spent in timed calls it made)
    const inner: number[] = [];
    const wrapped = new WeakSet();
    let on = false;
    const timed = (fn: Method, part: Part, name: string): Method =>
      function (this: unknown, ...args: unknown[]) {
        if (!on) {
          return fn.apply(this, args);
        }
        const start = performance.now();
        inner.push(0);
        try {
          return fn.apply(this, args);
        } finally {
          const took = performance.now() - start;
          const own = took - inner.pop()!;
          if (inner.length) {
            inner[inner.length - 1] += took;
          }
          sums[part][name] = (sums[part][name] || 0) + own;
        }
      };
    const wrap = () => {
      for (const effect of wallpaper.effects || []) {
        const proto = Object.getPrototypeOf(effect) as Record<string, Method>;
        if (wrapped.has(proto)) {
          continue;
        }
        wrapped.add(proto);
        const name = effect.constructor.name;
        for (const part of ["advance", "update"] as const) {
          proto[part] = timed(proto[part], part, name);
        }
        for (const method of DRAWING[name] || []) {
          if (typeof proto[method] === "function") {
            proto[method] = timed(proto[method], "draw", name);
          }
        }
        for (const method of CALLS[name] || []) {
          if (typeof proto[method] === "function") {
            proto[method] = timed(proto[method], "calls", `${name}.${method}`);
          }
        }
      }
      if (!wallpaper.timedFrame) {
        const advanceFrame = wallpaper.advanceFrame;
        wallpaper.timedFrame = true;
        wallpaper.advanceFrame = function (this: Wallpaper, passed: number) {
          if (!on) {
            return advanceFrame.call(this, passed);
          }
          const start = performance.now();
          try {
            return advanceFrame.call(this, passed);
          } finally {
            frameMs += performance.now() - start;
            frames++;
          }
        };
      }
    };
    const reset = () => {
      wrap();
      on = true;
      frames = 0;
      frameMs = 0;
      for (const part of parts) {
        sums[part] = {};
      }
    };
    const read = () => {
      const out: { frames: number; frame: number } & Partial<Sums> = { frames, frame: frames ? frameMs / frames : 0 };
      for (const part of parts) {
        const means: Record<string, number> = (out[part] = {});
        for (const [name, ms] of Object.entries(sums[part])) {
          means[name] = frames ? ms / frames : 0;
        }
      }
      return out;
    };
    return { reset, read };
  })();
  const api = {
    get gl() {
      return wallpaper.gl;
    },
    get manual() {
      return wallpaper.manual;
    },
    set manual(v) {
      wallpaper.manual = v;
    },
    get time() {
      return wallpaper.time;
    },
    set time(v) {
      wallpaper.time = v;
    },
    get stepRate() {
      return wallpaper.clock.rate;
    },
    stepAt: (t: number) => wallpaper.clock.stepAt(t),
    timeOf: (step: number) => wallpaper.clock.timeOf(step),
    // the characters' light scaled in the tests' pictures (so light past 1 can be read)
    get glyphScale() {
      return wallpaper.rain.viewScale;
    },
    set glyphScale(v) {
      wallpaper.rain.viewScale = v;
      wallpaper.splashes.viewScale = v;
      wallpaper.bolt.viewScale = v;
    },
    get cell() {
      return M().Rain.CELL;
    },
    // the drops drawn (the pool's first ones), the drops wanted in view and in the pool
    get count() {
      return wallpaper.rain.reach;
    },
    get targets() {
      return { inView: wallpaper.rain.inView, total: wallpaper.rain.wanted, active: wallpaper.rain.active };
    },
    get steady() {
      return wallpaper.settings.steadyTest;
    },
    set steady(v) {
      wallpaper.settings.steadyTest = v;
      wallpaper.applySteady();
    },
    get gravity() {
      return M().Splashes.GRAVITY;
    },
    get guard() {
      return wallpaper.guard;
    },
    get waveSpeed() {
      return wallpaper.waves.speed;
    },
    reset: () => wallpaper.reset(),
    advanceTo: (t: number) => wallpaper.advanceTo(t),
    advanceWaves: (seconds: number) => {
      wallpaper.guard.beginFrame();
      wallpaper.waves.run(seconds, true);
      wallpaper.guard.endFrame();
    },
    render: (parts?: Parts) => wallpaper.renderTimed(parts),
    // one frame as the wallpaper's own frames make it (the simulation moved on by `seconds`, then
    // drawn), without an animation frame: to time a whole frame's script
    frameStep: (seconds: number) => wallpaper.advanceFrame(seconds),
    // one frame through the quality controller at a time (the mode as set): drawn when the promise resolves; its counts and the pool's workers alive
    frameAt: (seconds: number) => wallpaper.frameAt(seconds),
    qualityStats: () => wallpaper.qualityStats(),
    // the level of detail on or off for every effect (culling stays): to compare a frame at full detail with the same frame at its levels
    setLod: (on: boolean) => wallpaper.setLod(on),
    // (the music: an audio array given at `now` ms, and what the music does now)
    feedAudio: (array: ArrayLike<number>, now: number) => wallpaper.takeAudio(array, now),
    music: () => wallpaper.musicState(),
    get musicClient() {
      return wallpaper.musicClient;
    },
    // the fog's volume rebuilt whole at the next frame (as after a view change): what a full refresh gives, against the refresh by distance's stale far slices
    rebuildFog: () => {
      wallpaper.fog.cameraVersion = -1;
    },
    // the pool's last round trip and the time waited for it (null without a pool)
    // the effects' quality results as a number: the units drawn of each, summed (the same for the same frame whoever computed it)
    qualitySum: () => {
      let sum = 0;
      for (const effect of wallpaper.effects || []) {
        if (effect.qualityResult) {
          sum += effect.qualityResult.drawn;
        }
      }
      return sum;
    },
    qualityPoolReport: () => (wallpaper.qualityPool ? wallpaper.qualityPool.report() : null),
    // the quality model's inputs for the frame as the pool would take them (the rain's: the place of a drop, its levels' inputs)
    qualityParams: () => wallpaper.qualityParamsOf(),
    draw: (seconds: number, parts?: Parts) => {
      wallpaper.time = seconds;
      wallpaper.renderTimed(parts);
    },
    rebuild: () => wallpaper.makeEffects(),
    get drawn() {
      return wallpaper.drawn;
    },
    // Debug mode's frames' health (its counts), and the GPU's state at each frame forced for it
    // (true: busy, false: done; null: the frame's fence)
    get frameHealth() {
      return wallpaper.health;
    },
    get gpuBusy() {
      return wallpaper.test!.gpuBusy;
    },
    set gpuBusy(v: boolean | null) {
      wallpaper.test!.gpuBusy = v;
    },
    get programsReady() {
      return wallpaper.programsReady;
    },
    fail: (error: unknown) => wallpaper.fail(error),
    setPaused: (paused: boolean) => wallpaper.setPaused(paused),
    tick: (now: number) => wallpaper.tick(now),
    get properties() {
      return wallpaper.properties;
    },
    // the settings this script handles itself (its own table's keys)
    get ownSettings() {
      return Object.keys(wallpaper.ownSettings);
    },
    effect: <K extends keyof Wallpaper>(name: K) => wallpaper[name],
    horizonY: () => wallpaper.camera.horizonY(),
    pitch: () => wallpaper.camera.pitch,
    // tilts the camera as the horizon (100 - height)% down the screen (Parallax: no setting does it)
    setPlaneHeight: (height: number) => Matrix3D.Parallax.apply(wallpaper.camera, height),
    // the camera's mouse parallax offsets (yaw, pitch shift: radians; eye x, eye shift: metres), as the parallax would set them
    setParallax: (yaw: number, pitchShift: number, eyeX: number, eyeShift: number) => {
      wallpaper.parallaxHold = true;
      wallpaper.camera.setParallax(yaw, pitchShift, eyeX, eyeShift);
    },
    // the cursor at (x, y) across the window (-1 to 1, y up), or outside it: what the page's mouse events give the renderer
    parallaxTo: (x: number, y: number, inside = true) => {
      wallpaper.parallaxHold = false;
      wallpaper.pointer(x, y, inside);
    },
    // a worker-backed task's worker lost as a crash loses it (by the task's name and slot), and a task's state and log
    killWorker: (name: string, slot?: number) => {
      const task = name === "hdr" ? wallpaper.hdrPath && wallpaper.hdrPath.task : wallpaper.tasks[name];
      if (task) {
        for (const k of slot === undefined ? task.liveSlots() : [slot]) {
          task.kill(k);
        }
      }
      return !!task;
    },
    get boltTask() {
      return wallpaper.boltTask;
    },
    taskInfo: (name: string) => {
      const task = name === "hdr" ? wallpaper.hdrPath && wallpaper.hdrPath.task : wallpaper.tasks[name];
      return task ? { state: task.state, alive: task.alive, inline: task.inline, attempts: task.attempts, restarts: task.restarts, why: task.why, events: task.events.slice() } : null;
    },
    parallaxOffsets: () => ({ yaw: wallpaper.camera.yaw, pitchShift: wallpaper.camera.pitchShift, eyeX: wallpaper.camera.eyeX, eyeShift: wallpaper.camera.eyeShift }),
    toScreen: (x: number, y: number, z: number) => wallpaper.camera.toScreen(x, y, z),
    rayAt: (x: number, y: number) => wallpaper.camera.rayAt(x, y),
    dropAt: (i: number, step: number) => wallpaper.rain.dropAt(i, step),
    landings: (step: number) => wallpaper.rain.landings(step),
    get onlyDrop() {
      return wallpaper.rain.onlyDrop;
    },
    set onlyDrop(v) {
      wallpaper.rain.onlyDrop = v;
    },
    get headOnly() {
      return wallpaper.rain.headOnly;
    },
    set headOnly(v) {
      wallpaper.rain.headOnly = v;
    },
    splashAt: (x: number, z: number, count: number) => wallpaper.splashes.spawn(x, z, count, M().Rain.CELL, wallpaper.time),
    splashList: () => wallpaper.splashes.describe(wallpaper.time),
    get impactLog() {
      return wallpaper.waves.impactLog();
    },
    addImpact: (x: number, z: number, weight: number) => wallpaper.waves.add(x, z, weight),
    readWaves: () => wallpaper.waves.read(),
    gridOf: (x: number, z: number) => wallpaper.waves.gridOf(x, z),
    worldOf: (i: number, j: number) => wallpaper.waves.worldOf(i, j),
    cellArea: (i: number, j: number) => wallpaper.waves.cellArea(i, j),
    setWaves: (shape: Parameters<Waves["setHeights"]>[0]) => wallpaper.waves.setHeights(shape),
    get noDamping() {
      return wallpaper.waves.noDamping;
    },
    set noDamping(v) {
      wallpaper.waves.noDamping = v;
    },
    strike: (x: number, z: number) => wallpaper.lightning.strike(x, z, wallpaper.time),
    strikeLevel: (strike: Parameters<Lightning["light"]>[0], time: number) => wallpaper.lightning.light(strike, time),
    // every program's active samplers not given a texture unit ("program: sampler")
    unsetSamplers: () => {
      const out = [];
      for (const [name, program] of Object.entries(wallpaper.programs || {})) {
        for (const sampler of program.unsetSamplers()) {
          out.push(`${name}: ${sampler}`);
        }
      }
      return out;
    },
    get strikes() {
      // (Lightning keeps no list of that name: as before, nothing)
      return (wallpaper.lightning as unknown as { strikes?: unknown }).strikes;
    },
    get fogDistance() {
      return wallpaper.test!.fogDistance;
    },
    set fogDistance(v) {
      wallpaper.test!.fogDistance = v;
    },
    get viewScale() {
      return wallpaper.test!.viewScale;
    },
    set viewScale(v) {
      wallpaper.test!.viewScale = v;
    },
    // every baked shadow marched instead (the fog and the water)
    get marched() {
      return wallpaper.test!.marched;
    },
    set marched(v) {
      wallpaper.test!.marched = v;
      wallpaper.fog.marched = v;
      wallpaper.water.marched = v;
      wallpaper.fog.refreshAll();
    },
    refreshFog: () => wallpaper.fog.refreshAll(),
    get fogRefreshed() {
      return wallpaper.fog.refreshed;
    },
    get testReflection() {
      return wallpaper.test!.reflection;
    },
    set testReflection(v) {
      wallpaper.test!.reflection = v;
    },
    // the script's time a frame by effect: frameCost.reset(), frameCost.read()
    frameCost,
    // the scene's worker (its client, null without one), and its use by the rain and the atlas
    // (off in the tests unless asked: their resets and steps are synchronous)
    get sceneWorker() {
      return wallpaper.sceneWorker;
    },
    // the start's steps (ms since the page began: effects, compiling, compiled, made, webgpu), and
    // each program's own compile (ms, with window.Matrix3DTest { compileEach })
    get timings() {
      return wallpaper.test!.timings;
    },
    get compileMs() {
      return wallpaper.test!.compileMs;
    },
    // the script's hashes worked out (by the scene's worker when one is alive and workers are on, else here): a sum of them and who made them
    scriptHashes: () =>
      wallpaper.scriptHashes().then((hashes) => {
        let sum = 0;
        for (let i = 0; i < hashes.length; i++) {
          sum = (sum + hashes[i]! * ((i % 97) + 1)) % 4294967291;
        }
        return { length: hashes.length, sum, by: wallpaper.hashesBy };
      }),
    useWorkers: (on: boolean) => {
      wallpaper.test!.workers = !!on;
      wallpaper.giveWorker();
    },
    ready,
  };
  return api;
};

export const installTestApi = (wallpaper: Wallpaper, ready: Promise<void>): void => {
  window.Rain3D = makeTestApi(wallpaper, ready);
};
