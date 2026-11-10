// QualityJobs: the table of job kinds the quality workers and the pool's inline path run (pure: no GL, no page,
// importable in any thread). A kind is a function (statics, params, from, to, out): the effect's static arrays (sent
// to the workers once, when they change), the frame's parameters, a range of units, and the array of levels the range
// is written into (indexed by unit, out[i] for from <= i < to). The pool's inline path and the worker call run()
// with the same function, so both give identical levels. An effect's adapter registers its kind when its module
// loads (register); "units" is built in: QualityUnit.process over the statics' xs, ys, zs and radii with the params
// as its inputs.
//
// Changelog:
// 2026-11-06: new.
import { M } from "../../engine/core";
import { QualityUnit } from "./unit";
import type { QualityInputs } from "./unit";

export type QualityStatics = Record<string, Float32Array>;
export type QualityParams = Record<string, unknown>;
export type QualityJobFunction = (statics: QualityStatics, params: QualityParams, from: number, to: number, out: Uint8Array) => void;

const kinds = new Map<string, QualityJobFunction>();

function register(name: string, fn: QualityJobFunction): void {
  kinds.set(name, fn);
}

function has(name: string): boolean {
  return kinds.has(name);
}

function run(kind: string, statics: QualityStatics, params: QualityParams, from: number, to: number, out: Uint8Array): void {
  const fn = kinds.get(kind);
  if (!fn) {
    throw new Error("unknown quality job kind: " + kind);
  }
  fn(statics, params, from, to, out);
}

register("units", (statics, params, from, to, out) => {
  QualityUnit.process(Object.assign({}, params, statics) as unknown as QualityInputs, from, to, out);
});

export const QualityJobs = { register, has, run };

M.QualityJobs = QualityJobs;
