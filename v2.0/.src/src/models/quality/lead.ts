// QualityLead: the quality pool's per-effect jobs asked a lead early (the Parallax delay, Feature P1, story P4), as a pure model (no GL, no page, importable in any thread).
// A frame's jobs are asked with the inputs of the pose the view will show at the RELEASE frame (inputsAt) and applied at that frame, when the live view is the one they were made for:
// - FIELDS, same(a, b): a VIEW key holds the four parallax offsets (yaw, pitch, eyeX, eyeY), the camera's baseVersion (a fold of its pitch and eye height), its lens and its size; two keys are the same view when every field is ===.
//   The step, the effects' own keys and the statics are not in it: they belong to each effect (LeadEffect)
// - LeadEffect { key, step }: what one effect's result was made for: its key (effectKey(qualityLeadKey(), the version of its static data)) and the clock's step when its job reads it (null: it does not); effectFits(asked, live):
//   the keys are equal and (the asked step is null or equal to the live one). A fitting effect keeps the ask's levels, a stale one is answered by the frame's own job
// - NEW_PUSH, READ_STEPS, askMargin(highest, leadSteps), marginCovers(asked, live): the shared inputs' margin (the highest wave; every unit's radius grows by it in the frustum test) is asked with the waves' own bound and the result applies while the live
//   margin is covered: a larger margin shows more units, never fewer
// - carry(levels, asked, live, full): the levels [direct n | mirror n] of the units (by serial) at the ask remapped to the live units: kept for a unit in both, `full` for one born since, a dead one dropped
// - identity(object): a number that stays the same for the same object
// - fold(keys): one number for a list of numbers, the same for the same list, another for another value or another order (0 for none)
// - inputsAt(camera, pose, out?): the shared inputs the camera would give with its parallax offsets at pose, bit for bit (Frame.compute over the camera's own input with the pose's offsets; the mirrored
//   view the way Camera.mirrorUpdate makes it, over the camera's mirror frame as it stands); the camera is left as it was; the object and its arrays are new for each call (a held ask keeps them)
// - Board(delay): ask(ms, key, payload, detail?) -> id; release(ms, live, liveDetail?): the asks whose release time (ask + the lead, delay in seconds) has come are taken, each once; the newest of them whose view key is the live
//   key (and whose margin covers the live one) is applied, with fits and stale (the effect indices whose LeadEffect fits the live one or not) and its detail; the others are dropped; none matching: apply null (the caller
//   answers the frame as it is answered without the lead; newestDropped names the newest due ask that did not match, for the counters); the asks not yet due stay (pending())
//
// Changelog:
// 2026-11-23: new (Feature P1, story P4).
// 2026-11-23: askMargin(highest, leadSteps) is WaveMax.bound over the lead's steps plus the read-back's age with a new impact's push (NEW_PUSH 0.4, READ_STEPS 8); was highest x 1.25.
// 2026-11-23: FIELDS is the view alone (the step, the effects' keys and the statics move to each effect: LeadEffect, effectKey, effectFits); askMargin, marginCovers; carry; Board takes a detail (effects, margin, state) and gives fits and stale.
import { M } from "../../engine/core";
import { Frame } from "../frame";
import { ReflectionFrame } from "../reflectionframe";
import { WaveMax } from "./wavemax";
import type { FrameOutput } from "../frame";
import type { Camera } from "../../engine/camera";

export const FIELDS = ["yaw", "pitch", "eyeX", "eyeY", "baseVersion", "lensX", "lensY", "width", "height"];

export type ViewKey = Record<string, number>;

export interface LeadPose {
  yaw: number;
  pitch: number;
  eyeX: number;
  eyeY: number;
}

export interface LeadInputs {
  viewProjection: Float32Array;
  eyeX: number;
  eyeY: number;
  focal: number;
  width: number;
  height: number;
  lensX: number;
  lensY: number;
  mirror: { viewProjection: Float32Array; width: number; height: number };
}

// what one effect's result was made for
export interface LeadEffect {
  key: number;
  step: number | null;
}

// what an ask carries besides its view: each effect's LeadEffect (by effect index), the margin it was made with, and what the host needs to carry its levels to the frame that shows them
export interface LeadDetail {
  effects: Record<number, LeadEffect>;
  margin: number;
  state?: unknown;
}

export interface LeadAsk<P> {
  id: number;
  askMs: number;
  releaseMs: number;
  key: ViewKey;
  payload: P;
  detail?: LeadDetail;
}

export interface LeadApplied<P> extends LeadAsk<P> {
  fits: number[];
  stale: number[];
}

// the most one new impact adds to the highest wave (WaveMax's IMPACT_PUSH) and the steps a read-back of the highest wave can be old (READ_EVERY 0.25 s at 30 steps/s, rounded up)
const NEW_PUSH = 0.4;
const READ_STEPS = 8;

// the margin to ask the jobs with: the waves' own bound (WaveMax.bound) over the lead's steps and the read-back's age, with a new impact's push
function askMargin(highest: number, leadSteps: number): number {
  return WaveMax.bound(highest, leadSteps + READ_STEPS, NEW_PUSH);
}

function marginCovers(asked: number, live: number): boolean {
  return live <= asked;
}

function effectFits(asked: LeadEffect, live: LeadEffect): boolean {
  return asked.key === live.key && (asked.step === null || asked.step === live.step);
}



const TOLERANCE_MS = 1e-6;

function same(a: ViewKey, b: ViewKey): boolean {
  for (let i = 0; i < FIELDS.length; i++) {
    const f = FIELDS[i]!;
    if (a[f] !== b[f]) {
      return false;
    }
  }
  return true;
}

const BITS = new Float64Array(1);
const WORDS = new Uint32Array(BITS.buffer);

// FNV-style mix of the numbers' bits, a word at a time
function fold(keys: ArrayLike<number>): number {
  if (keys.length === 0) {
    return 0;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < keys.length; i++) {
    BITS[0] = keys[i]!;
    h = Math.imul(h ^ WORDS[0]!, 0x01000193);
    h = Math.imul(h ^ WORDS[1]!, 0x01000193);
  }
  return h >>> 0;
}

// an effect's key for the lead: its own key and the version of the static data its job reads (a change of the data, not a count of calls)
function effectKey(leadKey: number, staticsVersion: number): number {
  return fold([leadKey, staticsVersion]);
}

// the levels [direct n | mirror n] of the units whose serials were `asked`, for the units whose serials are `live`
function carry(levels: Uint8Array, asked: ArrayLike<number>, live: ArrayLike<number>, full: number): Uint8Array {
  const n = asked.length;
  const m = live.length;
  const out = new Uint8Array(2 * m);
  const at = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    at.set(asked[i]!, i);
  }
  for (let j = 0; j < m; j++) {
    const i = at.get(live[j]!);
    out[j] = i === undefined ? full : levels[i]!;
    out[m + j] = i === undefined ? full : levels[n + i]!;
  }
  return out;
}

const IDS = new WeakMap<object, number>();
let nextId = 0;

// a number for an object that stays the same as long as it is the same object (an array replaced is another number): what an effect's key says of a layout it holds
function identity(object: object | null | undefined): number {
  if (!object) {
    return 0;
  }
  let id = IDS.get(object);
  if (id === undefined) {
    id = ++nextId;
    IDS.set(object, id);
  }
  return id;
}

const SCRATCH: FrameOutput = { view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16), block: new Float32Array(40), step: 0 };
const LENS = [0, 0];

function inputsAt(camera: Camera, pose: LeadPose, out?: LeadInputs): LeadInputs {
  Frame.compute(Frame.atPose(camera.frameInput(), pose), SCRATCH);
  const o = out || { viewProjection: new Float32Array(16), eyeX: 0, eyeY: 0, focal: 1, width: 1, height: 1, lensX: 0, lensY: 0, mirror: { viewProjection: new Float32Array(16), width: 1, height: 1 } };
  o.viewProjection.set(SCRATCH.viewProjection);
  o.eyeX = pose.eyeX;
  o.eyeY = camera.eyeHeight + pose.eyeY;
  o.focal = camera.focal();
  o.width = camera.width;
  o.height = camera.height;
  o.lensX = camera.lens.x;
  o.lensY = camera.lens.y;
  // (the mirrored view as Camera.mirrorUpdate makes it: the view-projection with the lens clamped to the picture's margin, its clip x and y scaled)
  const f = camera.mirrorFrame;
  const lens = ReflectionFrame.clampLens(f, camera.lens.x, camera.lens.y, LENS);
  let source: ArrayLike<number> = SCRATCH.viewProjection;
  if (lens[0] !== camera.lens.x || lens[1] !== camera.lens.y) {
    const adjusted = new Float32Array(16);
    const offX = (2 * (lens[0] - camera.lens.x)) / camera.width;
    const offY = (2 * (lens[1] - camera.lens.y)) / camera.height;
    for (let c = 0; c < 4; c++) {
      adjusted[c * 4] = source[c * 4]! + offX * source[c * 4 + 3]!;
      adjusted[c * 4 + 1] = source[c * 4 + 1]! + offY * source[c * 4 + 3]!;
      adjusted[c * 4 + 2] = source[c * 4 + 2]!;
      adjusted[c * 4 + 3] = source[c * 4 + 3]!;
    }
    source = adjusted;
  }
  ReflectionFrame.scaleViewProjection(source, f, o.mirror.viewProjection);
  o.mirror.width = f.width;
  o.mirror.height = f.height;
  return o;
}

export class Board<P = unknown> {
  delay: number;
  private queue: LeadAsk<P>[] = [];
  private serial = 0;

  constructor(delaySeconds: number) {
    this.delay = delaySeconds;
  }

  ask(ms: number, key: ViewKey, payload: P, detail?: LeadDetail): number {
    const id = ++this.serial;
    this.queue.push({ id, askMs: ms, releaseMs: ms + this.delay * 1000, key, payload, detail });
    return id;
  }

  release(ms: number, live: ViewKey, liveDetail?: { effects: Record<number, LeadEffect>; margin: number }): { apply: LeadApplied<P> | null; dropped: number; newestDropped: LeadAsk<P> | null } {
    let apply: LeadAsk<P> | null = null;
    let newestDropped: LeadAsk<P> | null = null;
    let due = 0;
    const keep: LeadAsk<P>[] = [];
    for (const q of this.queue) {
      if (q.releaseMs > ms + TOLERANCE_MS) {
        keep.push(q);
        continue;
      }
      due++;
      if (same(q.key, live) && (!q.detail || !liveDetail || marginCovers(q.detail.margin, liveDetail.margin))) {
        apply = q;
      } else {
        newestDropped = q;
      }
    }
    this.queue = keep;
    let applied: LeadApplied<P> | null = null;
    if (apply) {
      const fits: number[] = [];
      const stale: number[] = [];
      if (apply.detail && liveDetail) {
        for (const key of Object.keys(apply.detail.effects)) {
          const index = Number(key);
          const now = liveDetail.effects[index];
          if (now && effectFits(apply.detail.effects[index]!, now)) {
            fits.push(index);
          } else {
            stale.push(index);
          }
        }
      }
      applied = Object.assign({}, apply, { fits, stale });
    }
    return { apply: applied, dropped: due - (apply ? 1 : 0), newestDropped };
  }

  pending(): number {
    return this.queue.length;
  }
}

export const QualityLead = { FIELDS, same, fold, identity, inputsAt, Board, TOLERANCE_MS, NEW_PUSH, READ_STEPS, askMargin, marginCovers, effectFits, effectKey, carry };

M.QualityLead = QualityLead;
