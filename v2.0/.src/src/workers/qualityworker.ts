// QualityWorker: the quality workers' body ("quality", from the same bundle, made by Workers.start). handle(state,
// message) is the whole behaviour as a function of the worker's state and one message, so the pool's tests run it
// without a real worker; serve() wires it to the worker's scope.
// Messages:
//   pool -> worker: { type: "ping" }; { type: "static", effect, version, kind, arrays } (an effect's static arrays and
//   the job kind that reads them, kept until the next static of that effect; no reply); { type: "run", frame,
//   versions: { effect: version }, params: { effect: params }, tasks: [{ effect, from, to }] }
//   worker -> pool: { type: "pong" }; { type: "result", frame, parts: [{ effect, from, to, levels }] } (levels: a
//   Uint8Array of the task's range, one byte a unit, its buffer transferred), or { type: "result", frame, parts: [],
//   error } when a task's effect has no static or another version of it than the run expects (the pool then does
//   that worker's tasks itself).
//
// Changelog:
// 2026-11-06: new.
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import "../models/quality/jobs";
import "../models/quality/fogshade";
import "../models/quality/strikeshade";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";

interface Stored {
  version: number;
  kind: string;
  arrays: QualityStatics;
}

export interface QualityWorkerState {
  statics: Map<number, Stored>;
  // one scratch array of levels, indexed by unit, kept between tasks (a task's range is copied out of it)
  scratch: Uint8Array;
}

type Message = Record<string, unknown>;

export interface QualityReply {
  reply: Message;
  transfer: ArrayBuffer[];
}

function create(): QualityWorkerState {
  return { statics: new Map(), scratch: new Uint8Array(0) };
}

function handle(state: QualityWorkerState, message: Message): QualityReply | null {
  const type = message.type;
  if (type === "ping") {
    return { reply: { type: "pong" }, transfer: [] };
  }
  if (type === "static") {
    state.statics.set(message.effect as number, { version: message.version as number, kind: message.kind as string, arrays: message.arrays as QualityStatics });
    return null;
  }
  if (type === "bake") {
    // the fog's shade grid, a run of layers over a box of its columns and rows, for the time given (models/quality/fogshade.ts)
    const effect = message.effect as number;
    const stored = state.statics.get(effect);
    const head = { type: "baked", id: message.id, effect, version: message.version };
    if (stored && stored.kind === "strikeshade" && stored.version === message.version) {
      // a strike's shadow grid (models/quality/strikeshade.ts): four values a cell, the strike's shadow points given
      const sp = message.params as { sigma: number; time: number; points: Float32Array };
      const from = message.layerFrom as number;
      const to = message.layerTo as number;
      const sx = message.x0 as number;
      const snx = message.nx as number;
      const srows = message.rows as number;
      const sdata = new Uint16Array((to - from) * srows * snx * 4);
      M.QualityStrikeShade.bake(stored.arrays.noise as unknown as Uint8Array, sp.points, sp.sigma, sp.time, sdata, from, to, sx, snx, srows);
      return { reply: Object.assign(head, { layerFrom: from, layerTo: to, x0: sx, nx: snx, rows: srows, data: sdata }), transfer: [sdata.buffer as ArrayBuffer] };
    }
    if (!stored || stored.kind !== "fogshade" || stored.version !== message.version) {
      return { reply: Object.assign(head, { error: "static " + effect + " is " + (stored ? "version " + stored.version : "missing") + ", expected " + message.version }), transfer: [] };
    }
    const p = message.params as { sigma: number; time: number };
    const layerFrom = message.layerFrom as number;
    const layerTo = message.layerTo as number;
    const x0 = message.x0 as number;
    const nx = message.nx as number;
    const rows = message.rows as number;
    const data = new Uint16Array((layerTo - layerFrom) * rows * nx * 2);
    M.QualityFogShade.bake(stored.arrays.noise, p.sigma, p.time, data, layerFrom, layerTo, x0, nx, rows);
    return { reply: Object.assign(head, { layerFrom, layerTo, x0, nx, rows, data }), transfer: [data.buffer as ArrayBuffer] };
  }
  if (type !== "run") {
    return null;
  }
  const frame = message.frame as number;
  const versions = message.versions as Record<number, number>;
  const params = message.params as Record<number, QualityParams>;
  const tasks = message.tasks as { effect: number; from: number; to: number }[];
  const parts: { effect: number; from: number; to: number; levels: Uint8Array }[] = [];
  const transfer: ArrayBuffer[] = [];
  for (const task of tasks) {
    const stored = state.statics.get(task.effect);
    if (!stored || stored.version !== versions[task.effect]) {
      const found = stored ? "version " + stored.version : "missing";
      return { reply: { type: "result", frame, parts: [], error: "static " + task.effect + " is " + found + ", expected " + versions[task.effect] }, transfer: [] };
    }
    if (state.scratch.length < task.to) {
      state.scratch = new Uint8Array(task.to);
    }
    M.QualityJobs.run(stored.kind, stored.arrays, params[task.effect], task.from, task.to, state.scratch);
    const levels = state.scratch.slice(task.from, task.to);
    parts.push({ effect: task.effect, from: task.from, to: task.to, levels });
    transfer.push(levels.buffer as ArrayBuffer);
  }
  return { reply: { type: "result", frame, parts }, transfer };
}

// the worker's own side (src/index.ts, name "quality")
function serve(): void {
  const scope = workerScope();
  const state = create();
  scope.onmessage = (event: MessageEvent) => {
    const answer = handle(state, event.data as Message);
    if (answer) {
      scope.postMessage(answer.reply, answer.transfer);
    }
  };
}

export const QualityWorker = { create, handle, serve };

M.QualityWorker = QualityWorker;
