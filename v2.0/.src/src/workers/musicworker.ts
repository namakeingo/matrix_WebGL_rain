// The music worker: the maths of the music's reactions, off the main thread (the worker part "music" of the bundle: src/index.ts routes it here; one state a worker).
// Main -> worker, for every frame (matrix_web_rain's frame reads the last array every frame, and follows the music once for each new array):
//   { type: "audio", array (the 128 values, copied; null on a frame with no new array), fresh (a new array), now (ms, the frame's), settings, lightning, start? }
//   settings: { useMusic, useIdle, idleSeconds, sensitivity, loud, sudden, tempo, energy, brightness (0 to 1), multiplier (Music sensitivity / 10), columns (the
//   screen's columns of Font size Max), fall, above, rainScale (the rain's: the drops' fall and the rows above, for the scale) }
//   lightning: Lightning is on (the music is followed only then, as matrix_web_rain's updateLightning does). start: the time the wallpaper's idle clock starts at
//   (the first message's: otherwise its `now`). A frame without a new array runs the columns' chances, the rain's scale and the silence timeout on the last array and
//   does not follow the music.
//   { type: "ping" }
// Worker -> main: { type: "pong" }; { type: "music", peak, driven, scale, loudness, threshold, score, tempo, beat, brightness, heard }; { type: "failed", error }.
// The order is matrix_web_rain's frame's: driven (React to music, and no idle animation) as it was before this array; the music followed (a peak: the strike
// asked for, loudness, score), only with React to music and Lightning on; the columns' chances and the rain's scale (1 when not driven: the settled rain); the
// idle timeout updated by whether any column heard sound. A strike the main thread starts on a peak is recorded here at once (the gap between music strikes).
// The client keeps the peaks of every reply since the last take (a frame that took no reply loses none) and, with no worker (none made, or it failed), does the same
// work in tick (an inline client, as the fog's and the bolt's).
//
// Changelog:
// 2026-11-09: new.
// 2026-11-10: the client became MusicTask, a ThreadedTask (inline first, the worker taking over with the music's snapshot, inline again from the last snapshot a reply carried when
//   it fails, tried again after 20 ms, 40 ...); the worker's side is serveTask's; snapshotOf and restoreInto.
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveTask } from "../platform/servetask";
import { Workers } from "../platform/workers";
import { ThreadedTask } from "../platform/threadedtask";
import type { TaskOptions, TaskWorker } from "../platform/threadedtask";
import type { Snapshot } from "../models/snapshot";
import { MusicFollower } from "../models/musicfollower";
import { MusicRain } from "../models/musicrain";
import { MusicIdle } from "../models/musicidle";

type Message = Record<string, unknown>;

// the worker's part of the bundle (its name: src/index.ts)
const JOB = { name: "music" };
// the most columns (a 7,680 pixel wide screen of 4 pixel characters is 1,920)
const COLUMNS_MOST = 2048;

export interface MusicWorkerSettings {
  useMusic: boolean;
  useIdle: boolean;
  idleSeconds: number;
  sensitivity: number;
  loud: number;
  sudden: number;
  tempo: number;
  energy: number;
  brightness: number;
  multiplier: number;
  // Music light intensity (0 to 1): the drops' light multiple eased towards 1 (0: no change)
  lightIntensity: number;
  columns: number;
  fall: number;
  above: number;
  rainScale: number;
}

export interface MusicReply {
  type: "music";
  peak: boolean;
  driven: boolean;
  scale: number;
  loudness: number;
  threshold: number;
  score: number;
  tempo: number;
  beat: number;
  brightness: number;
  heard: boolean;
  floor: number;
  tempoFactor: number;
  energyFactor: number;
  brightnessFactor: number;
  // each column's share of the settled rain's falls (while the music drives; null: the settled rain)
  share: Float32Array | null;
  // the drops' light emittance across the window (MusicRain.LIGHT_BINS bins, the lightness of the columns as a multiple of the light; null: 1 everywhere)
  light: Float32Array | null;
  // the worker's whole state as of this reply (a message with carry asks for it: the task restores its inline model from the last one when the worker fails)
  state?: Snapshot;
}

export interface MusicWorkerState {
  follower: MusicFollower;
  idle: MusicIdle;
  started: boolean;
  chance: Float64Array;
  lightness: Float64Array;
  // the last array given (the frame's, when no new one comes)
  last: Float32Array;
  shares: Float32Array;
  lights: Float32Array;
}

export interface MusicAnswer {
  reply: Message;
  transfer: Transferable[];
}

function create(): MusicWorkerState {
  return { follower: new MusicFollower(), idle: new MusicIdle(), started: false, chance: new Float64Array(COLUMNS_MOST), lightness: new Float64Array(COLUMNS_MOST), last: new Float32Array(128), shares: new Float32Array(COLUMNS_MOST), lights: new Float32Array(MusicRain.LIGHT_BINS) };
}

// the worker's whole state as plain data, and a state made again from it
function snapshotOf(state: MusicWorkerState): Snapshot {
  return { follower: state.follower.snapshot(), idle: state.idle.snapshot(), started: state.started, last: state.last.slice() };
}

function restoreInto(state: MusicWorkerState, snapshot: Snapshot): void {
  state.follower.restore(snapshot.follower as Snapshot);
  state.idle.restore(snapshot.idle as Snapshot);
  state.started = !!snapshot.started;
  state.last = (snapshot.last as Float32Array).slice();
}

function audio(state: MusicWorkerState, message: Message): MusicReply {
  if (message.restore) {
    restoreInto(state, message.restore as Snapshot);
  }
  const s = message.settings as MusicWorkerSettings;
  const now = message.now as number;
  const given = message.array as Float32Array | null;
  if (given) {
    state.last = given;
  }
  const array = state.last;
  const fresh = message.fresh !== false && !!given;
  if (!state.started) {
    state.started = true;
    state.idle.reset(typeof message.start === "number" ? message.start : now);
  }
  const f = state.follower;
  f.settings.sensitivity = s.sensitivity;
  f.settings.loud = s.loud;
  f.settings.sudden = s.sudden;
  f.settings.tempo = s.tempo;
  f.settings.energy = s.energy;
  f.settings.brightness = s.brightness;
  state.idle.useTimeout = s.useIdle;
  state.idle.timeoutSeconds = s.idleSeconds;
  const driven = state.idle.driven(s.useMusic);
  let peak = false;
  let loudness = 0;
  let threshold = 0;
  let score = 0;
  if (s.useMusic && message.lightning === true && fresh) {
    const m = f.step(array, now);
    peak = m.peak;
    loudness = m.loudness;
    threshold = m.threshold;
    score = m.score;
    if (peak) f.struck(now);
  }
  const columns = Math.min(COLUMNS_MOST, Math.max(1, Math.floor(s.columns)));
  const heard = MusicRain.columns(array, columns, s.multiplier, driven, state);
  const scale = driven ? MusicRain.scale(state.chance, columns, s.fall, s.above, s.rainScale) : 1;
  let share: Float32Array | null = null;
  let light: Float32Array | null = null;
  if (driven) {
    MusicRain.lights(state.lightness, columns, state.lights, s.lightIntensity);
    light = state.lights.slice();
    MusicRain.shares(state.chance, columns, s.fall, s.above, s.rainScale, state.shares);
    share = state.shares.slice(0, columns);
  }
  state.idle.update(!heard, now);
  return { type: "music", peak, driven, scale, loudness, threshold, score, tempo: f.tempo, beat: f.beat, brightness: f.brightness, floor: f.floor, tempoFactor: f.tempoFactorNow, energyFactor: f.energyFactorNow, brightnessFactor: f.brightnessFactorNow, heard, share, light };
}

function handle(state: MusicWorkerState, message: Message): MusicAnswer | null {
  const type = message.type;
  if (type === "ping") {
    return { reply: { type: "pong" }, transfer: [] };
  }
  if (type === "audio") {
    const reply = audio(state, message);
    if (message.carry) {
      reply.state = snapshotOf(state);
    }
    return { reply: reply as unknown as Message, transfer: [] };
  }
  return { reply: { type: "failed", error: "unknown message kind: " + String(type) }, transfer: [] };
}

// the worker's own side (src/index.ts, name "music")
function serve(): void {
  serveTask(workerScope(), create, handle);
}

// a worker as the task holds it: the link to it (a Worker, or a stand-in in the tests), its replies and its failures
export interface MusicLink {
  postMessage(message: Message): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

class MusicHandle implements TaskWorker {
  onFail: ((why: string | undefined) => void) | null;
  link: MusicLink;
  constructor(link: MusicLink, onReply: (reply: MusicReply) => void) {
    this.link = link;
    this.onFail = null;
    link.onmessage = (event) => {
      const data = event.data as Message;
      if (data.type === "failed") {
        this.fail(String(data.error));
      } else if (data.type === "music") {
        onReply(data as unknown as MusicReply);
      }
    };
    link.onerror = (event) => this.fail((event && event.message) || "the music's worker failed");
  }
  private fail(why: string): void {
    if (this.onFail) {
      this.onFail(why);
    }
  }
  close(): void {
    this.link.onmessage = null;
    this.link.onerror = null;
    this.link.terminate();
  }
}

export interface MusicTaskOptions extends TaskOptions {
  // the bundle's URL (or the wallpaper's folder): the worker is made from it
  base?: string;
  // the tests' stand-in for the worker: a promise of its link (null: none could be made)
  makeLink?: (slot: number, force: string) => Promise<MusicLink | null>;
}

// the music's reactions as a ThreadedTask: inline from the first moment (the same code the worker runs, here), the worker made as soon as possible and taking over with the inline
// model's snapshot (the first message to it carries `restore`), inline again from the last snapshot a reply carried when it fails, tried again after 20 ms, 40 ...
export class MusicTask extends ThreadedTask<MusicWorkerState, MusicHandle> {
  private base: string;
  private makeLink: MusicTaskOptions["makeLink"];
  private model: MusicWorkerState;
  // the newest reply not taken (with the peaks of the ones before it), the worker's last snapshot, the snapshot the next message to a new worker carries, whether a message was sent
  private pending: MusicReply | null;
  private lastState: Snapshot | null;
  private restoring: Snapshot | null;
  private begun: boolean;

  constructor(options: MusicTaskOptions = {}) {
    const model = create();
    super(model, options);
    this.model = model;
    this.base = options.base || "";
    this.makeLink = options.makeLink;
    this.pending = null;
    this.lastState = null;
    this.restoring = null;
    this.begun = false;
  }

  protected spawn(slot: number, force: string): Promise<MusicHandle | null> {
    const link: Promise<MusicLink | null> = this.makeLink
      ? this.makeLink(slot, force)
      : Workers.start(this.base, { name: JOB.name, force }).then((made) => (made ? (made.worker as unknown as MusicLink) : null));
    return link.then((l) => (l ? new MusicHandle(l, (reply) => this.arrive(reply)) : null));
  }

  protected snapshot(): unknown {
    return snapshotOf(this.model);
  }

  // the worker takes over from the inline model's state
  protected adopt(_slot: number, _worker: MusicHandle, state: unknown): void {
    this.restoring = state as Snapshot;
    this.lastState = null;
  }

  // the worker lost: the inline model goes on from the last state a reply carried (a frame in flight is lost with the worker)
  protected dropped(): void {
    if (this.lastState) {
      restoreInto(this.model, this.lastState);
    } else if (this.restoring) {
      restoreInto(this.model, this.restoring);
    }
    this.restoring = null;
    this.lastState = null;
  }

  private arrive(reply: MusicReply): void {
    if (reply.state) {
      this.lastState = reply.state;
    }
    if (this.pending && this.pending.peak) {
      reply.peak = true;
    }
    this.pending = reply;
  }

  // a frame's message (the array copied, null when no new one came): inline, the work done now; with a worker, posted
  tick(array: Float32Array | null, now: number, settings: MusicWorkerSettings, lightning: boolean): void {
    const first = !this.begun;
    this.begun = true;
    const message: Message = { type: "audio", array: array ? array.slice() : null, fresh: !!array, now, settings, lightning, start: first ? now : undefined };
    const live = this.liveSlots();
    if (live.length === 0) {
      const answer = handle(this.model, message);
      if (answer) {
        this.arrive(answer.reply as unknown as MusicReply);
      }
      return;
    }
    message.carry = true;
    if (this.restoring) {
      message.restore = this.restoring;
      this.restoring = null;
    }
    this.workerOf(live[0]!)!.link.postMessage(message);
  }

  // the newest reply not taken yet (with the peaks of the ones before it), or null
  take(): MusicReply | null {
    const reply = this.pending;
    this.pending = null;
    return reply;
  }

  close(): void {
    this.pending = null;
    this.stop();
  }
}

export const MusicWorker = { create, handle, serve, snapshotOf, restoreInto };

M.MusicWorker = MusicWorker;
M.MusicTask = MusicTask;
