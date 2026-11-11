// BoltList: the bolt's piece lists worked out as a pure function (no GL, no page: it runs in a worker too, workers/boltlistworker.ts), asked in Bolt.fork with the frame's exact inputs
// after the frame's advance and answered before its draw:
// - run(input): per slot, a mask of the pieces the band vertex shader can draw at the slot's growth and lights (QualityBolt.drawable over every piece: the frame's quality lists are not
//   known when the job is asked, they come with the pool's replies, so the mask covers all the pieces and `keep` cuts a list to it afterwards), and `others`: QualityBolt.peakBound
//   of the brightest piece's light over the slots (the cut's others)
// - keep(mask, ...): a quality list cut to the masked pieces, in order, from `at` of the output: QualityBolt.filter's result for the same list, value for value
// - the slots' segments are big: the input carries them only when a slot's items changed (`segments`, with the slot's `version`), and run holds the last of each slot (module state:
//   in a worker its own, inline the page's); a slot whose segments are neither given nor held at that version is listed in `missing` with no mask, so the caller computes that frame
//   inline (the same functions) and sends the segments again. Nothing else is held, and the output depends on the input and on what was held at the version it names
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";
import { QualityBolt } from "./quality/bolt";

export interface BoltListSlot {
  // the slot's items version (Bolt's per-slot counter, bumped when its items are made again) and its piece count
  version: number;
  count: number;
  // the pieces' floats (count x SEGMENT_FLOATS), only when the worker does not hold this version yet
  segments: Float32Array | null;
  // the slot's growth and lights as Bolt.update sets them (the lights 0 for a slot with no pieces), and its pieces' greatest radiance
  grown: number;
  main: number;
  branch: number;
  radiance: number;
}

export interface BoltListInput {
  slots: BoltListSlot[];
  // the band's share of the light (1 less the characters' share when they are drawn), used for the drawable test and the brightest
  band: number;
  share: number;
}

export interface BoltListOutput {
  masks: (Uint8Array | null)[];
  missing: number[];
  others: number;
}

const SEGMENT_FLOATS = QualityBolt.SEGMENT_FLOATS;

// the segments held per slot: the last version given
const held: ({ version: number; segments: Float32Array } | null)[] = [];

function forget(): void {
  held.length = 0;
}

// the brightest peak a piece sharing a pixel can have before peakBound: the greatest radiance x the band's share x the slot's light
function brightest(radiance: ArrayLike<number>, main: ArrayLike<number>, branch: ArrayLike<number>, share: number): number {
  let most = 0;
  for (let k = 0; k < radiance.length; k++) {
    most = Math.max(most, radiance[k] * share * Math.max(main[k], branch[k]));
  }
  return most;
}

function run(input: BoltListInput): BoltListOutput {
  const slots = input.slots;
  const masks: (Uint8Array | null)[] = [];
  const missing: number[] = [];
  const radiance: number[] = [];
  const main: number[] = [];
  const branch: number[] = [];
  for (let k = 0; k < slots.length; k++) {
    const s = slots[k];
    radiance.push(s.radiance);
    main.push(s.main);
    branch.push(s.branch);
    if (s.count <= 0) {
      masks.push(null);
      held[k] = null;
      continue;
    }
    if (s.segments) {
      held[k] = { version: s.version, segments: s.segments };
    }
    const h = held[k];
    if (!h || h.version !== s.version || h.segments.length < s.count * SEGMENT_FLOATS) {
      masks.push(null);
      missing.push(k);
      continue;
    }
    const mask = new Uint8Array(s.count);
    for (let u = 0; u < s.count; u++) {
      mask[u] = QualityBolt.drawable(h.segments, u * SEGMENT_FLOATS, s.grown, s.main, s.branch, input.band) ? 1 : 0;
    }
    masks.push(mask);
  }
  return { masks, missing, others: QualityBolt.peakBound(brightest(radiance, main, branch, input.share)) };
}

// a quality list's pieces (list[from .. from+count-1]: slot x region + piece) that the mask keeps, in order, to out from `at`; returns how many
function keep(mask: Uint8Array, region: number, list: Uint32Array, from: number, count: number, out: Uint32Array, at: number): number {
  let kept = 0;
  for (let k = from; k < from + count; k++) {
    const index = list[k];
    if (mask[index % region] === 1) {
      out[at + kept++] = index;
    }
  }
  return kept;
}

export const BoltList = { run, forget, keep, brightest };

M.BoltList = BoltList;
