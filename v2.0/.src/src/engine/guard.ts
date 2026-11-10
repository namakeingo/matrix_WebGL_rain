// The GPU guard: the wallpaper never keeps a GPU busy long enough for Windows to reset it (its
// limit, TDR, is 2 s for one piece of work). When that reset fails, Windows stops with
// VIDEO_SCHEDULER_INTERNAL_ERROR (0x119). So:
// - Every heavy draw is cut into pieces, each sent to the GPU on its own (flush): the full-screen
//   passes in bands of rows (Quad.drawTiled), the rain in chunks of drops, the fog's volume and
//   its grids some slices or layers at a time, the waves a step at a time. The picture is the same
//   however it is cut.
// - Each section of a frame (a pass: begin(name, kind) ... end()) is timed on its own
//   (EXT_disjoint_timer_query_webgl2: its queries cannot nest; read only once the GPU says they
//   are ready, never waited for; a pool of QUERIES made once, for the most sections a frame has
//   (about 30 with a strike's bakes) times the frames their results take to come (a few), with
//   room to spare; a section that finds none free is counted in `skipped` and named in `starved`,
//   the frame's). Its time a piece sizes that pass's own pieces (size(name, kind)): bands
//   ("band"), chunks ("chunk"), slices a piece ("slice") and the waves' steps a piece ("step")
//   smaller when one takes more than SLOW ms, larger when they take less than FAST ms, within each
//   kind's bounds (KINDS: a band as high as the screen at the most); so a slow GPU gets small
//   pieces, and a slow pass is never hidden by a quick one of the same kind or many quick pieces of
//   another. Other kinds are timed only. Each section's last time is kept by its name (ms).
// - A pass whose size held over SETTLED frames is timed only every `every` frames (EVERY), every
//   frame again after a disjoint timing, a resize (unsettle) or a piece of it over SLOW ms. A pass
//   begun several times in a frame (a refresh in two parts) counts that frame once; after a resize
//   only the results of sections begun since count (`epoch`).
// - Without timer queries nothing is measured: every pass's pieces have their kind's conservative
//   size (KINDS' fourth value, under the start's).
// - Lost contexts (WebGL's, and lost WebGPU devices) are counted: after LOSSES in LOSS_WINDOW ms
//   the wallpaper stops drawing rather than restore itself again (each reset can fail and stop
//   Windows).
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/engine/ (was engine/guard.js).
import { M } from "./core";

// a kind's sizes: at the start, the least, the most, and without timer queries
type KindSizes = [start: number, least: number, most: number, untimed: number];

// EXT_disjoint_timer_query_webgl2's enums (the extension is not in TypeScript's DOM library)
interface TimerQueryExtension {
  readonly TIME_ELAPSED_EXT: GLenum;
  readonly GPU_DISJOINT_EXT: GLenum;
}

const SLOW = 25;
const FAST = 4;
const LOSSES = 2;
const LOSS_WINDOW = 10 * 60 * 1000;
const QUERIES = 256;
const EVERY = 4;
// a pass measured within this many frames counts in the GPU's time a frame (recent): a settled
// pass is timed every EVERY frames
const RECENT = 2 * EVERY + 2;
const SETTLED = 2;
// each kind's size: at the start, the least, the most, and without timer queries
const KINDS: Record<string, KindSizes> = {
  band: [128, 8, 16384, 64],
  chunk: [1024, 64, 32768, 512],
  slice: [8, 1, 32, 4],
  step: [4, 1, 64, 2],
};

export class GpuGuard {
  gl!: WebGL2RenderingContext;
  adapt: boolean;
  stopped: boolean;
  losses: number[];
  recentMs: Record<string, number>;
  seen: Record<string, number>;
  ms: Record<string, number>;
  starved: string[];
  tainted: number;
  skipped: number;
  sectionPieces: number;
  kind: string;
  name: string;
  query: WebGLQuery | null;
  count: number;
  first: number;
  epoch: number;
  heldFrame: Record<string, number>;
  waiting: { query: WebGLQuery[]; name: string[]; kind: string[]; pieces: Int32Array<ArrayBuffer>; epoch: Int32Array<ArrayBuffer>; frame: Int32Array<ArrayBuffer> };
  free: WebGLQuery[];
  timer: TimerQueryExtension | null;
  pieces: number;
  frames: number;
  every: number;
  held: Record<string, number>;
  sizes: Record<string, number>;
  fixed: Record<string, number>;
  constructor() {
    // each kind's size at the start (and for every pass while `adapt` is off), each pass's own,
    // and the results in a row each pass's size held for
    this.fixed = {};
    for (const kind of Object.keys(KINDS)) {
      this.fixed[kind] = KINDS[kind][0];
    }
    this.sizes = {};
    this.held = {};
    this.every = EVERY;
    this.frames = 0;
    this.pieces = 0;
    this.timer = null;
    this.free = [];
    // the sections timed, waiting for their results (a ring of QUERIES)
    this.waiting = { query: new Array(QUERIES), name: new Array(QUERIES), kind: new Array(QUERIES), pieces: new Int32Array(QUERIES), epoch: new Int32Array(QUERIES), frame: new Int32Array(QUERIES) };
    // the frame each pass's last result counted towards settling came from
    this.heldFrame = {};
    // the resizes so far (unsettle): a section's result counts towards settling only in its own
    this.epoch = 0;
    this.first = 0;
    this.count = 0;
    this.query = null;
    this.name = "";
    this.kind = "";
    this.sectionPieces = 0;
    this.skipped = 0;
    // the sections waiting when the GPU last said its timing was disturbed: their results are
    // dropped as they come (the flag is read once and cleared, often before they are ready)
    this.tainted = 0;
    // (the sections of the frame left untimed for want of a free query)
    this.starved = [];
    this.ms = {};
    // (the frame each pass's last time was measured in; the recent ones' times, made once)
    this.seen = {};
    this.recentMs = {};
    this.losses = [];
    this.stopped = false;
    this.adapt = true;
  }

  // a new context: its timer extension (optional), and a pool of queries made once
  attach(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.first = 0;
    this.count = 0;
    this.tainted = 0;
    this.query = null;
    this.ms = {};
    this.seen = {};
    this.free = [];
    if (this.timer) {
      for (let i = 0; i < QUERIES; i++) {
        this.free.push(gl.createQuery());
      }
    }
  }

  destroy() {
    if (this.gl) {
      for (const query of this.free) {
        this.gl.deleteQuery(query);
      }
      for (let k = 0; k < this.count; k++) {
        this.gl.deleteQuery(this.waiting.query[(this.first + k) % QUERIES]);
      }
      if (this.query) {
        this.gl.deleteQuery(this.query);
      }
    }
    this.free = [];
    this.count = 0;
    this.query = null;
  }

  // the start's sizes of the bands, chunks and slices (the tests set them, with `adapt` off)
  get tile(): number {
    return this.fixed.band;
  }

  set tile(v: number) {
    this.fixed.band = v;
  }

  get chunk(): number {
    return this.fixed.chunk;
  }

  set chunk(v: number) {
    this.fixed.chunk = v;
  }

  get slices(): number {
    return this.fixed.slice;
  }

  set slices(v: number) {
    this.fixed.slice = v;
  }

  // a pass's piece size of its kind ("band": rows, "chunk": drops, "slice": slices or layers,
  // "step": the waves' steps)
  size(name: string, kind: string): number {
    if (!this.adapt) {
      return this.fixed[kind];
    }
    if (!this.timer) {
      return KINDS[kind][3];
    }
    const own = this.sizes[name];
    return own === undefined ? this.fixed[kind] : own;
  }

  // every pass timed every frame again (the canvas resized: the passes' work changed)
  unsettle() {
    this.held = {};
    this.epoch = (this.epoch + 1) | 0;
  }

  // a lost context (WebGL's, or a lost WebGPU device): stop for good after too many
  lost(now: number) {
    this.losses = this.losses.filter((t) => now - t < LOSS_WINDOW);
    this.losses.push(now);
    if (this.losses.length >= LOSSES) {
      this.stopped = true;
    }
  }

  // the last times of the passes measured within the last RECENT frames (by name: those a
  // frame draws now, not those it no longer does)
  recent(): Record<string, number> {
    const out = this.recentMs;
    for (const name in out) {
      delete out[name];
    }
    for (const name in this.ms) {
      if (this.frames - this.seen[name] <= RECENT) {
        out[name] = this.ms[name];
      }
    }
    return out;
  }

  // a frame's GPU work starts: the sections whose times are known are read
  beginFrame() {
    this.pieces = 0;
    this.starved.length = 0;
    this.frames++;
    this.poll();
  }

  // a section of the frame starts: a pass named `name`, of pieces of a kind
  begin(name: string, kind: string) {
    if (this.query || !this.adapt || !this.timer) {
      return;
    }
    // (a settled pass: timed every `every` frames only)
    if ((this.held[name] || 0) >= SETTLED && this.frames % this.every !== 0) {
      return;
    }
    if (this.free.length === 0) {
      this.skipped++;
      if (this.starved.length < 64) {
        this.starved.push(name);
      }
      return;
    }
    this.query = this.free.pop()!;
    this.name = name;
    this.kind = kind;
    this.sectionPieces = 0;
    this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.query);
  }

  // one piece of work sent to the GPU (a band, a chunk, some slices, a step of the waves)
  piece() {
    this.pieces++;
    this.sectionPieces++;
    this.gl.flush();
  }

  end() {
    if (!this.query) {
      return;
    }
    this.gl.endQuery(this.timer!.TIME_ELAPSED_EXT);
    const at = (this.first + this.count) % QUERIES;
    this.waiting.query[at] = this.query;
    this.waiting.name[at] = this.name;
    this.waiting.kind[at] = this.kind;
    this.waiting.pieces[at] = Math.max(1, this.sectionPieces);
    this.waiting.epoch[at] = this.epoch;
    this.waiting.frame[at] = this.frames;
    this.count++;
    this.query = null;
  }

  endFrame() {
    this.end();
  }

  // the sections whose GPU time is known: each kept by its name, and its time a piece sizing
  // that pass's pieces (none when the GPU says its timing was disturbed: read once a poll)
  poll() {
    const gl = this.gl;
    if (!this.timer || this.count === 0) {
      return;
    }
    // (a disturbed timing: every section waiting now dropped, those not ready yet too)
    if (gl.getParameter(this.timer.GPU_DISJOINT_EXT)) {
      this.tainted = this.count;
    }
    while (this.count > 0) {
      const at = this.first;
      const query = this.waiting.query[at];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        return;
      }
      this.first = (this.first + 1) % QUERIES;
      this.count--;
      this.free.push(query);
      const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      const disjoint = this.tainted > 0;
      if (disjoint) {
        this.tainted--;
        this.held = {};
      }
      if (disjoint || !this.adapt) {
        continue;
      }
      const name = this.waiting.name[at];
      const kind = this.waiting.kind[at];
      this.ms[name] = ms;
      this.seen[name] = this.waiting.frame[at];
      const bounds = KINDS[kind];
      const each = ms / this.waiting.pieces[at];
      let held = true;
      if (bounds) {
        const size = this.size(name, kind);
        const next = each > SLOW ? Math.max(bounds[1], Math.floor(size / 2)) : each < FAST ? Math.min(bounds[2], size * 2) : size;
        held = next === size;
        this.sizes[name] = next;
      }
      if (this.waiting.epoch[at] === this.epoch) {
        const frame = this.waiting.frame[at];
        if (!(held && each <= SLOW)) {
          this.held[name] = 0;
        } else if (this.heldFrame[name] !== frame) {
          this.held[name] = (this.held[name] || 0) + 1;
        }
        this.heldFrame[name] = frame;
      }
    }
  }
}

M.GpuGuard = GpuGuard;
