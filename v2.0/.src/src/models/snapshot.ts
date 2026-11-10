// takeSnapshot and putSnapshot: a model's whole state as plain data and back (the state a worker-backed task hands from the inline model to its worker and back). takeSnapshot
// copies every own field of an object (numbers, booleans, strings, typed arrays, arrays and plain objects, deeply; functions skipped), putSnapshot writes such a copy back into an
// object of the same class (typed arrays written into the ones it has, plain objects field by field). Taking the fields as they are, not a list of them, means a field added to a
// model later is carried too: nothing the next step depends on is left behind.
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";

export type Snapshot = Record<string, unknown>;

const copy = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return (value as unknown as { slice(): unknown }).slice();
  }
  if (Array.isArray(value)) {
    return value.map(copy);
  }
  const out: Snapshot = {};
  for (const key of Object.keys(value as Snapshot)) {
    out[key] = copy((value as Snapshot)[key]);
  }
  return out;
};

export function takeSnapshot(object: object): Snapshot {
  const out: Snapshot = {};
  const o = object as Snapshot;
  for (const key of Object.keys(o)) {
    if (typeof o[key] !== "function") {
      out[key] = copy(o[key]);
    }
  }
  return out;
}

const put = (into: Snapshot, from: Snapshot): void => {
  for (const key of Object.keys(from)) {
    const have = into[key];
    const value = from[key];
    if (value !== null && typeof value === "object" && ArrayBuffer.isView(value) && have && ArrayBuffer.isView(have) && (have as unknown as { length: number }).length === (value as unknown as { length: number }).length) {
      (have as unknown as { set(a: unknown): void }).set(value);
    } else if (value !== null && typeof value === "object" && !ArrayBuffer.isView(value) && !Array.isArray(value) && have && typeof have === "object") {
      put(have as Snapshot, value as Snapshot);
    } else {
      into[key] = copy(value);
    }
  }
};

export function putSnapshot(object: object, snapshot: Snapshot): void {
  put(object as Snapshot, snapshot);
}

M.takeSnapshot = takeSnapshot;
M.putSnapshot = putSnapshot;
