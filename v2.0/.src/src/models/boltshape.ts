// BoltShape: a strike's branching channel in 3D, made once when it starts, from the lightning's
// own random numbers, F, the main channel's size (given by src/index.ts: a rain character's, as
// matrix_web_rain's F is the rain's font size at the strike's distance), and the camera's view
// (Camera: project, focal, height, pitch, eyeHeight). Not an effect: Lightning is given its make
// function. Sizes are in metres in the world.
// - Its routes: the way down from the top (at the top of the view at its distance) and the way up
//   from the water, each a jagged line of its own (every middle pushed across its piece, in any
//   way round it, its part along the line of sight SIGHT_PUSH of it, by ROUGHNESS of its length, 0.55 of that at each finer level: matrix_web_rain's
//   kinks over its COARSE_LEVELS halvings, each finer one pushed FINE_PUSH as much again), halved
//   again until every piece is at most PIECE_SHARE of the screen's height long on the screen (at
//   least ROUTE_LEVELS halvings, at most MOST_LEVELS; a piece still longer then cut straight), to
//   the meeting point: MEET_LOW to MEET_HIGH of
//   the way down from the top's row to the foot's on the screen, to the side of the straight line
//   by up to MEET_ACROSS of the height, and in depth by up to MEET_DEPTH. Each route keeps to its
//   own side of the meeting point's row as the camera sees it (a plane through the eye: a middle
//   pushed past it is pushed the other way, or not at all), so the two never cross on the screen
//   before they meet; every line keeps above the water, below the top of the view and at least
//   half the bolt's distance ahead of the eye. The foot's first piece is turned towards the
//   vertical once halved (its angle from it scaled to at most FOOT_SLANT, shortened when that
//   would turn the line too much, else a short upright piece put before it). The main channel is
//   the two joined; the whole of it is the lightning's emitter (models/flash.ts, Flash.of).
// - Its turns: every line (the main channel, the meeting point and the foot included, and every
//   branch, its end moved onto a line it rejoins included) turns at most KINK_MOST between two of
//   its pieces, in the world and on the screen. A middle is pushed only as far as keeps the turns
//   at it and at its piece's ends within it (its push, the other way, a half, a quarter, else
//   none: a middle not pushed keeps the level before's turns); the way down ends towards the
//   foot and the way up towards the way down's last piece; the meeting point is moved towards
//   the straight line from the top to the foot until that line turns within it there; a
//   rejoining branch drops the points before its moved end while its turn there is more. Forks
//   and the angle a rejoin meets its line at are between two lines.
// - Its forks, by matrix_web_rain's rules: 10 to 50 a side, shared among 4 generations
//   (forkPlan); each route a chain of 1 to 4 forks (the leader forks, the route goes on as a
//   branch of the next generation, with a sibling at each fork); every line thins to THIN of its
//   size after each fork along it, a branch starts at THIN of its parent's size there; the
//   leaders' first parts F / 2. A fork turns 20° to 50° off its line (without a view up to 80° in the later
//   tries), round the line of sight leaning FORK_DEPTH out of it (so the turn shows on the
//   screen; a random axis across it without a view), never back against its leader's way; as
//   matrix_web_rain's, a branch off a route (or a route's sibling) is 0.6-1.1 times the rest of
//   the route long (in matrix_web_rain's route length: OLD_WINDING times its straight line), off
//   a branch 0.3-0.65 times its line's length (cut short to stay inside the view's limits); a
//   branch's path is about that long: its straight line shorter by the branches' winding so far
//   (a path longer than that kept as it is). A branch is jagged as the routes (pushed by ROUGHNESS,
//   halved at least BRANCH_LEAST times, then until every piece is at most PIECE_SHARE of the
//   screen's height, every turn within KINK_MOST), its pieces then cut straight to that limit. A fork whose branch touches the other half at
//   its first piece is given up at once.
// - In 3D, two lines touch where their pieces come within half their sizes added plus GAP_F F of
//   each other (the distance between the pieces as segments in the world); they cross at the
//   angle between the two pieces there. A branch never touches a line of the other half on the
//   screen (their widths drawn there, at least 1 px each, the routes at the main channel's F,
//   GAP_PX apart; without a view, in the world). Seen through a camera, a branch touching a line
//   of its own half on the screen in the same widths, kept as far apart as the glow round the
//   wider (their visible edges, EDGE_SHARE of each width past it and at least EDGE_PX, then APART_SHARE of the wider's
//   width) and at least ZONE_SHARE of the height (but within its fork's room, matrix_web_rain's
//   clearFrom: twice its and its parent's widths plus ZONE_SHARE of the height, or the other's)
//   meets it there: a rejoin if it may be one (by the rules below, the crossing seen on the
//   screen; its last point moved onto the other line), else cut short before it, never onto its
//   parent; and a rejoin's bigger size is checked on the screen too. In the world too, in its
//   own half, past its own fork, touching another line is a rejoin when they cross at JOIN_ANGLE
//   or more, at least JOIN_GAP F from every other meeting point (and from the leaders'), at most
//   REJOIN_DEPTH in a row: the branch ends there, on the other line (its last point moved onto
//   it, as the sizes it was checked with are made again smaller later), and the other line goes
//   on from there one generation bigger than the bigger of the two (the leader's rule of
//   matrix_web_rain, for every line): only past the other line's forks, the lines forking off it
//   (a sibling at its end too) and earlier rejoins (it would make them bigger), and only where its bigger size touches no line of the half. Near
//   its fork a branch touches its parent only as close as a departure at JOIN_ANGLE would (its
//   first pieces turning off it); on the screen a rejoin only where the two are within
//   REJOIN_REACH_F F in the world, its moved end clear of every other line there. Otherwise the
//   try fails. Seen through a camera the checks are on the screen, and in the world for the
//   lines of its half where a piece comes as near on the screen as a contact in the world can,
//   by chunks of the line against the lines near each chunk; a branch's straight line is
//   looked at first (against the other half and its parent), a try touching before VIEW_KEEP of
//   its length is not kept (past it, the longest is kept cut short before what it touches), and
//   a fork none of its tries clears is tried at other places (FORK_PLACES in all, VIEW_TRIES
//   shared among them), then given up; without a view,
//   after TRIES tries the longest try clear for at least 40% of its length is cut short before
//   what it touches, or no fork is made. Each side's least of each generation is made first,
//   the generations in turn, each with its own LEAST_FORKS forks tried (the plan's windows, then
//   looser ones, then anywhere along a parent); then the plan's forks past it, within
//   TOP_UP_TRIES tries; then, below FORKS_MIN, any generation that has room. A shape keeps its
//   tries by stage (spent), its leasts not reached (short) and its foot's stub (foot).
// - Its timing in the strike's growth (0 at its start, 1 at its leaders' meeting): each route
//   grows over all of it, each part of a route over its share; a branch starts growing when its
//   line has grown to its fork, as fast as its route.
// - Its making in slices (BoltShape.start: a step at a time, each within a budget; make: at once,
//   the same slices, the same shape).
// - A line's points are kept flat (points: x, y, z each, count of them), the halvings made in two
//   buffers in turn; a try's line is made in a trial line whose arrays are made once a shape (and
//   grown), copied only when kept: few objects a shape, none a halving and few a try. A line cut
//   straight has at most FINE_MOST points (its pieces past them left as they are).
// - Its end: shape.destroy() gives its lines (their objects and buffers) back to the pools, and a making destroyed before its shape is made gives back what it had made; a
//   making takes its scratch (one bundle a making in progress), its lines and their buffers from
//   the pools, so once warm a strike makes (almost) nothing new and leaves nothing to the garbage
//   collector (BoltShape.fresh(): the buffers and lines made new; pooled(): those waiting). A
//   destroyed shape's buffers are poisoned (NaN) under the tests. Lightning destroys a strike's
//   shape when the strike ends or is dropped.
// - Its inner loops (the distances between pieces) work on numbers in scratch arrays, with no
//   allocation; a line's box is looked at before its chunks of CHUNK pieces, a chunk's before its
//   pieces, in the world and on the screen. BoltShape.warm() makes a few shapes, so its code is
//   compiled before the first strike, and fills the pools: where the shapes are made (the main
//   thread only without a worker).
// Changelog:
// 2026-11-04: TypeScript, a module of src/models/ (was engine/boltshape.js).
import { M } from "../engine/core";
import type { Camera } from "../engine/camera";

// ---- the types ----
// (a place or a way read: x, y, z; written into: an array of 3 or more)
type V3 = ArrayLike<number>;
type Out = Float64Array | number[];
// (the camera's view a shape is made through: Camera's)
export interface BoltView {
  width: number;
  height: number;
  pitch: number;
  eyeHeight: number;
  focal(): number;
  // (x, y on the screen and the distance along the view, into out)
  project(x: number, y: number, z: number, out: Out): void;
}
// (a rejoin's bigger size on the line rejoined, from a part of its length)
export interface Boost {
  at: number;
  generation: number;
}
// a line as Bolt, Lightning and the flash read it: a made shape's and a flat form's alike
export interface ShapeLine {
  points: Float64Array;
  count: number;
  cum: Float64Array;
  length: number;
  side: number;
  generation: number;
  route: boolean;
  routeFrom: number;
  routeTo: number;
  start: number;
  end: number;
  ends: number;
  depth: number;
  size: number;
  parent: ShapeLine | null;
  at: number;
  routeLength: number;
  forkWidth: number | undefined;
  forkParentSize: number | undefined;
  zonePx: number | undefined;
  joinedInto: ShapeLine | undefined;
  joinedAt: number | undefined;
  crossing: number | undefined;
  cutShort: boolean;
  forks: number[];
  boosts: Boost[];
}
// a line as the checks read it: a made line's and a try's (the bundle's trial: its boxes plain
// arrays)
interface CheckedLine {
  points: Float64Array;
  count: number;
  cum: Float64Array;
  length: number;
  box: Out;
  chunks: Float64Array;
  screen: Float64Array | null;
  schunks: Float64Array | null;
  sbox: Out | null;
  scum: Float64Array | null;
  smax: number;
  forks: number[];
  boosts: Boost[];
  ends: number;
  depth: number;
  route: boolean;
  side: number;
  generation: number;
  size: number;
  parent: BoltLine | null;
  at: number;
  // (a made line's: its fork's widths and room, the line it rejoined)
  forkWidth?: number;
  forkParentSize?: number;
  zonePx?: number;
  joinedInto?: BoltLine;
}
// a made shape's line: its object and buffers from the pools
export interface BoltLine extends CheckedLine, ShapeLine {
  box: Float64Array;
  sbox: Float64Array | null;
  parent: BoltLine | null;
  forkWidth: number | undefined;
  forkParentSize: number | undefined;
  zonePx: number | undefined;
  joinedInto: BoltLine | undefined;
  pooled: boolean;
  flatIndex: number;
}
// (a line's fields given to makeLine)
type LineFields = Partial<Pick<BoltLine, "side" | "generation" | "route" | "routeFrom" | "routeTo" | "start" | "end" | "size" | "parent" | "at" | "depth" | "routeLength">>;
// what a shape is: a made one's and a flat form's alike
interface ShapeOf<L extends ShapeLine> {
  F: number;
  meet: number[];
  main: L;
  lines: L[];
  meetings: V3[];
  rejoins: number;
  cut: number;
  given: number;
  noRoom: number;
  tries: number;
  spent: number[];
  foot: [boolean, number, number];
  plan: number[][] | null;
  depths: (number | undefined)[];
  levels: (number | undefined)[];
  attempts?: number;
  fallback?: boolean;
  findings?: number;
  makeMs?: number;
  destroyed: boolean;
  destroy: (() => void) | null;
  // (set by the bolt's worker's client: the flash and items made with it there, its worker)
  flash?: unknown;
  items?: unknown;
  workerIndex?: number;
}
// a shape made here: its lines' boxes and screen arrays, its leasts not reached (side,
// generation, count, tries)
export interface MadeShape extends ShapeOf<BoltLine> {
  short: number[][];
}
// a shape from its flat form: its lines' points and lengths views of its Float64Array
export interface FlatShape extends ShapeOf<ShapeLine> {
  short: { length: number };
  flat: Float64Array;
}
export type AnyShape = MadeShape | FlatShape;
// (a shape's flat form, and what it is read from)
export interface FlatForm {
  nums: Float64Array;
  floats: number;
  transfer: ArrayBuffer[];
}
type FlatSource = { nums: Float64Array } | { nums?: undefined; buffer: ArrayBufferLike };
// a rule a shape breaks (validating's findings)
export interface Finding {
  rule: string;
  line?: number;
  other?: number;
  side?: number;
  generation?: number;
  count?: number;
  at?: number;
  deg?: number;
  kind?: string;
  px?: number;
  a?: number;
  b?: number;
}
// (a try's look: clear, or cut short, or a rejoin)
interface Rejoin {
  other: BoltLine;
  at: number;
  point: number[];
  crossing: number;
}
interface Look {
  ok: boolean;
  part: number;
  line: CheckedLine | null;
  from?: CheckedLine | null;
  rejoin?: Rejoin | null;
  atStart?: boolean;
}
// (a try's straight line on the screen, made once: what screenTouch reads of a line)
interface SeenPiece {
  screen: Float64Array | null;
  scum: Float64Array | null;
  size: number;
}
// a making's scratch
interface Bundle {
  near: Float64Array;
  proj: Float64Array;
  contact: Float64Array;
  reachOut: Float64Array;
  nearBoost: Float64Array;
  nearby: Int32Array;
  pairs: Int32Array;
  probe: { screen: Float64Array; scum: Float64Array; size: number };
  trial: CheckedLine;
  fineHold: { buf: Float64Array };
  branchStart: Float64Array;
  branchWay: Float64Array;
  branchAxis: Float64Array;
  branchDir: Float64Array;
  branchWay3: Float64Array;
  branchEnd: Float64Array;
  downPlanes: Float64Array;
  upPlanes: Float64Array;
  branchPlanes: Float64Array;
  worldPlanes: Float64Array;
}
// (what a making has made so far, given back when it ends before its shape)
interface MakingState {
  shape: MadeShape | null;
  temps: Float64Array[];
  tempLines: BoltLine[];
  done: boolean;
}
// (a making's slices: what each ended with, its shape at the end)
type Slices<T> = Generator<string, T, unknown>;
// a strike's shape made over several calls (BoltShape.start)
export interface Making {
  readonly slow: number;
  after: number;
  slices: number;
  slowest: number;
  phase: string;
  jag: { points: number; px: number; ms: number } | null;
  boost: { ms: number; calls: number } | null;
  sliceMs: number;
  total: number;
  slowestIndex: number;
  destroyed: boolean;
  destroy(): void;
  step(budget: number): MadeShape | null;
}

const ROUTE_LEVELS = 5;
const MOST_LEVELS = 10;
// the longest a piece is on the screen: a share of its height (24 px at 2160 rows)
const PIECE_SHARE = 24 / 2160;
const ROUGHNESS = 0.3;
// the routes' halvings at full roughness (matrix_web_rain's 5: its kinks); each finer one pushed
// FINE_PUSH as much again as the 0.55 a level (a small jitter on its straight runs)
const COARSE_LEVELS = 5;
const FINE_PUSH = 0.2;
// the part of a push along the line of sight kept (the rest across the screen: matrix_web_rain's
// winding seen)
const SIGHT_PUSH = 0.5;
// a piece cut straight is cut to this part of the screen's limit; the most points a line cut
// straight has (past them its pieces are left as they are)
const FINE_MARGIN = 0.9;
const FINE_MOST = 1024;
// (a share of the screen's height: 4 px at 2160 rows) the room past twice the widths where a
// branch may touch the lines at its fork (matrix_web_rain's clearFrom)
const ZONE_SHARE = 4 / 2160;
// (in F) the farthest apart in the world two lines touching on the screen may be to rejoin (the
// branch's last point moved onto the other line by at most this)
const REJOIN_REACH_F = 1;
// the places a fork is tried at, the tries of a branch shared among them
const FORK_PLACES = 4;
// the least halvings of a branch (jagged as the routes: their push, then halved until every piece
// is at most PIECE_SHARE of the screen's height; without a view, these)
const BRANCH_LEAST = 3;
// the stretch of its parent a fork's turn is from: its course over FORK_WAY of its length either
// way (its parent jagged as the routes: the way of its last piece is its jitter's)
const FORK_WAY = 0.15;
// how far a fork's turn leans out of the view's plane (its axis off the line of sight)
const FORK_DEPTH = 0.35;
// the meeting point: a part of the way down on the screen, off the straight line (in the
// strike's height) across and in depth
const MEET_LOW = 0.3;
const MEET_HIGH = 0.75;
const MEET_ACROSS = 0.25;
const MEET_DEPTH = 0.1;
// the most the foot's first piece leans from the vertical (degrees)
const FOOT_SLANT = 20;
// (the lengths, in the first piece's, the foot's piece is tried at turned upright: in the line,
// then as a short piece put before it)
const STAND_LENGTHS = [1, 0.75, 0.5];
const STUB_LENGTHS = [0.5, 0.25, 0.125, 0.0625, 0.03125];
// (the most pieces the stub is made in)
const STUB_PIECES = 4;
// the most a line turns between two of its pieces (degrees), in the world and on the screen
// (under 90: a branch's path shrunk towards its start, a homothety in the world, changes its
// angles on the screen a little)
const KINK_MOST = 88;
const KINK_COS = Math.cos((KINK_MOST * Math.PI) / 180);
// how fast the slowest slice lately is forgotten: a share kept at each step (about a frame), not
// at each slice (hundreds of quick slices would forget a slow one)
const STEP_DECAY = 0.995;
// (the slowest slice lately, ms, of every making: the shapes' slices are alike), of the slices
// up to SLOW_MOST only: a slice slower than that is an engine pause (garbage collection, every
// second or so) or a rare one; counted, it held every step to one slice (a tenth of a ms) for
// seconds after it, and a shape of some 500 slices was not made before its strike was due
const SLOW_MOST = 2.5;
// (by the place a slice starts from: the yield it follows, its kind of work next: a heavy
// jag follows a "try", a light check a "check". One slowest for all slices starved the steps:
// a 2-2.5 ms jag held every step to one slice for seconds, and a shape of ~500 slices was not
// made in the plan's lead-in)
const PHASES = ["start", "routes", "sibling", "place", "fork", "try", "jag", "check", "join", "join end", "validate", "attempt"];
const PHASE_INDEX: Record<string, number> = {};
PHASES.forEach((name, k) => (PHASE_INDEX[name] = k));
const phaseSlow = new Float64Array(PHASES.length);
// a slice ends at every YIELD_EVERY-th place it may yield (counted in each making, so its
// slices are the same whenever it is made: ?test=ahead makes a slow slice again by its index),
// a few times fewer slices than places, each slice an object made (the generator's result);
// made at once (atOnce), it never yields
const YIELD_EVERY = 2;
let atOnce = false;
// (the objects made by the shapes, counted at the sites that make them: an estimate of the garbage;
// not the generator's result of each slice, V8's own, as many as the slices)
let made = 0;

// ---- the pools: what a shape is made of, given back when it ends (destroy) and taken again by
// the next making, so once warm a strike makes (almost) nothing new and leaves nothing to the
// garbage collector ----
// (buffers by their size, a power of two of floats; a taken one is a view of its first n; the
// lines' objects; the makings' scratch, one bundle a making in progress)
const bufferPool = new Map<number, ArrayBufferLike[]>();
const linePool: BoltLine[] = [];
const bundlePool: Bundle[] = [];
// (the buffers and lines made new, and those waiting in the pools)
let fresh = 0;
let pooled = 0;
// (the new ones by kind: lines, and buffers by their size)
const freshBy = { lines: 0, bundles: 0, arenas: 0, buffers: {} as Record<number, number> };
// (the tests: the buffers taken and given back so far, by size class)
const tally = { taken: {} as Record<number, number>, given: {} as Record<number, number> };
// a Float64Array of n floats, from the pool when one of its size, or of up to TAKE_LARGER sizes
// above it, waits there (each size's count of buffers in use varies from shape to shape: a
// request finding its own size empty takes a larger one rather than make one)
const TAKE_LARGER = 3;
function takeF64(n: number) {
  let size = 8;
  while (size < n) {
    size *= 2;
  }
  let buffer: ArrayBufferLike | null | undefined = null;
  for (let k = 0, s = size; k <= TAKE_LARGER && !buffer; k++, s *= 2) {
    const list = bufferPool.get(s);
    if (list && list.length) {
      buffer = list.pop();
      pooled--;
    }
  }
  if (!buffer) {
    buffer = new ArrayBuffer(size * 8);
    fresh++;
    made++;
    freshBy.buffers[size] = (freshBy.buffers[size] || 0) + 1;
  }
  if (M.TEST) {
    const c = buffer.byteLength / 8;
    tally.taken[c] = (tally.taken[c] || 0) + 1;
  }
  return new Float64Array(buffer, 0, n);
}
// a taken Float64Array given back (poisoned under the tests: a use after it shows as NaN)
function giveF64(array: Float64Array | null) {
  if (!array) {
    return;
  }
  if (M.TEST) {
    new Float64Array(array.buffer).fill(NaN);
  }
  const size = array.buffer.byteLength / 8;
  if (M.TEST) {
    tally.given[size] = (tally.given[size] || 0) + 1;
  }
  let list = bufferPool.get(size);
  if (!list) {
    list = [];
    bufferPool.set(size, list);
  }
  list.push(array.buffer);
  pooled++;
}
// a line's object, every field set (one shape of object for every line), from the pool when one
// waits there
function takeLine(): BoltLine {
  if (linePool.length) {
    pooled--;
    return linePool.pop()!;
  }
  return newLine();
}
// a line's object made new
function newLine(): BoltLine {
  fresh++;
  made++;
  freshBy.lines++;
  return {
    // (its arrays null until made: set by makeLine before any is read)
    points: null!, count: 0, cum: null!, length: 0, box: null!, chunks: null!, screen: null, schunks: null, sbox: null, scum: null, smax: 0,
    forks: [], boosts: [], ends: 1, depth: 0, side: 0, generation: 0, route: false, routeFrom: 0, routeTo: 0, start: 0, end: 0,
    size: 0, parent: null, at: 0, routeLength: 0, forkWidth: undefined, forkParentSize: undefined, zonePx: undefined,
    joinedInto: undefined, joinedAt: undefined, crossing: undefined, cutShort: false, pooled: false, flatIndex: -1,
  };
}
// a line given back: its buffers and its object (kept as it is, poisoned, until taken again)
function giveLine(line: BoltLine | null | undefined) {
  if (!line || line.pooled) {
    return;
  }
  giveF64(line.points);
  giveF64(line.cum);
  giveF64(line.box);
  giveF64(line.chunks);
  giveF64(line.screen);
  giveF64(line.schunks);
  giveF64(line.sbox);
  giveF64(line.scum);
  line.pooled = true;
  linePool.push(line);
  pooled++;
}
// a making's scratch: from the pool, else made (its arrays counted as new)
function takeBundle(): Bundle {
  if (bundlePool.length) {
    pooled--;
    return bundlePool.pop()!;
  }
  fresh += 24;
  made += 24;
  freshBy.bundles++;
  return {
    near: new Float64Array(6), proj: new Float64Array(3), contact: new Float64Array(4), reachOut: new Float64Array(2), nearBoost: new Float64Array(6),
    nearby: new Int32Array(256), pairs: new Int32Array(1024),
    probe: { screen: new Float64Array(6), scum: new Float64Array(2), size: 0 },
    trial: {
      points: new Float64Array(3 * 64), count: 0, cum: new Float64Array(64), length: 0,
      box: [0, 0, 0, 0, 0, 0], chunks: new Float64Array(6 * 8),
      screen: new Float64Array(3 * 64), schunks: new Float64Array(4 * 8), sbox: [0, 0, 0, 0], scum: new Float64Array(64), smax: 0,
      forks: [], boosts: [], ends: 1, depth: 0, route: false, side: 0, generation: 0, size: 0, parent: null, at: 0,
    },
    fineHold: { buf: new Float64Array(3 * 256) },
    branchStart: new Float64Array(3), branchWay: new Float64Array(3), branchAxis: new Float64Array(3), branchDir: new Float64Array(3),
    branchWay3: new Float64Array(3), branchEnd: new Float64Array(3),
    downPlanes: new Float64Array(16), upPlanes: new Float64Array(16), branchPlanes: new Float64Array(12), worldPlanes: new Float64Array(8),
  };
}
function giveBundle(bundle: Bundle) {
  bundle.trial.parent = null;
  bundlePool.push(bundle);
  pooled++;
}
// a shape given back: its lines; marked destroyed
function destroyShape(shape: MadeShape) {
  if (shape.destroyed) {
    return;
  }
  shape.destroyed = true;
  giveLine(shape.main);
  for (const line of shape.lines) {
    giveLine(line);
  }
}
// (the last jag: its points, its length on the screen (px), and its try's time to it (ms))
const jagNote = { points: 0, px: 0, ms: 0 };
// (within the slice now: the bigger-size checks of the rejoins tried, their time (ms) and number)
const boostNote = { ms: 0, calls: 0 };
// the pieces of a chunk (one box each)
const CHUNK = 8;
// (pixels) the least gap between lines of the two halves on the screen
const GAP_PX = 1;
// lines of a half kept apart on the screen: each one's visible edge EDGE_SHARE of its width
// past its half width (a line is drawn soft: 10% of white at about 0.98 of its width from its
// middle, 0.48 past its half width), then a dark gap of APART_SHARE of the wider's width, at
// least ZONE_SHARE of the screen's height (matrix_web_rain's look: dark between two lines)
const EDGE_SHARE = 0.5;
const APART_SHARE = 0.4;
// (pixels) the least visible edge of a line past its half width: the drawing's tail falls by e
// every max(0.15 of the size, 1 px), so on thin lines it reaches about two of its pixel spreads
const EDGE_PX = 2;
// matrix_web_rain's routes' length over their straight line (its 5 halvings: 29% longer), for
// the lengths its rules give in a route's length
const OLD_WINDING = 1.29;
// a branch's length along its path over its straight line, before any is made (jagged as the
// routes: their winding)
const FIRST_WINDING = OLD_WINDING;
// a side's forks (its generations' least added up; at most 40, not matrix_web_rain's 50)
const FORKS_MIN = 16;
const FORKS_MAX = 40;
const GENERATIONS = 4;
// each side's lines of each generation: least, most
const GENERATION_FORKS = [[2, 5], [4, 25], [8, 40], [2, 40]];
// (a rejoin's way on within this of the bigger line's way in, over JOIN_REACH_F F either side of
// the point: matrix_web_rain's)
const JOIN_WAY = 45;
const JOIN_REACH_F = 2;
const THIN = 0.75;
const TRIES = 24;
// seen through a camera: a branch's tries in all (shared among its fork's places), and the
// least of its length a try touching past it is kept as, cut short before what it touches
// (12: lines kept apart by their soft edges and jagged branches leave less room than the 8 of
// straighter branches did)
const VIEW_TRIES = 12;
const VIEW_KEEP = 0.8;
// the forks tried more for a generation under its least in a strike, and for a side under
// FORKS_MIN
// (each side's least of each generation: the forks tried for it, the first LEAST_PLAN in the
// plan's windows, LEAST_LOOSE more in looser ones, the rest anywhere along a parent)
const LEAST_FORKS = 60;
const LEAST_PLAN = 8;
const LEAST_LOOSE = 24;
const MIN_TRIES = 80;
// (the top-ups' last stage, anywhere along a parent: its forks a side and generation, and its
// branches' lengths a share of the usual, so they find room on short lines; and the most tries a
// shape takes in all its top-ups, so a shape is made in its time)
const ANYWHERE_LENGTH = 0.5;
const TOP_UP_TRIES = 1500;
const REJOIN_DEPTH = 3;
const JOIN_ANGLE = 20;
const JOIN_GAP = 3;
// (in F)
const GAP_F = 0.25;
// a fork is made only while its branch is at least this many F
const LEAST_SIZE_F = 0.5 * Math.pow(THIN, 9);

// ---- vectors (arrays of 3), for what is kept (points); the inner loops use numbers ----
const sub = (a: V3, b: V3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));
const lerp = (a: V3, b: V3, f: number) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

// a unit vector across d (in a random way round it), into out (no array made)
function acrossInto(d: V3, random: () => number, out: Out) {
  for (let k = 0; k < 8; k++) {
    const ux = random() - 0.5;
    const uy = random() - 0.5;
    const uz = random() - 0.5;
    const along = ux * d[0] + uy * d[1] + uz * d[2];
    const cx = ux - d[0] * along;
    const cy = uy - d[1] * along;
    const cz = uz - d[2] * along;
    const l = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (l > 1e-3) {
      const f = 1 / (l || 1);
      out[0] = cx * f;
      out[1] = cy * f;
      out[2] = cz * f;
      return out;
    }
  }
  const b = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cx = d[1] * b[2] - d[2] * b[1];
  const cy = d[2] * b[0] - d[0] * b[2];
  const cz = d[0] * b[1] - d[1] * b[0];
  const f = 1 / (Math.sqrt(cx * cx + cy * cy + cz * cz) || 1);
  out[0] = cx * f;
  out[1] = cy * f;
  out[2] = cz * f;
  return out;
}

// v turned by an angle round a unit axis (Rodrigues), into out (no array made)
function turnInto(v: V3, axis: V3, angle: number, out: Out) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kx = axis[1] * v[2] - axis[2] * v[1];
  const ky = axis[2] * v[0] - axis[0] * v[2];
  const kz = axis[0] * v[1] - axis[1] * v[0];
  const along = (axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2]) * (1 - c);
  out[0] = v[0] * c + kx * s + axis[0] * along;
  out[1] = v[1] * c + ky * s + axis[1] * along;
  out[2] = v[2] * c + kz * s + axis[2] * along;
  return out;
}

// the closest points of piece i of the points P (x, y, z each) and piece j of Q, into out: their
// squared distance, where on each (0 to 1), and the point on P's piece (out[3..5])
function segmentDistance(P: V3, i: number, Q: V3, j: number, out: Out) {
  const a0 = i * 3;
  const b0 = j * 3;
  const d1x = P[a0 + 3] - P[a0];
  const d1y = P[a0 + 4] - P[a0 + 1];
  const d1z = P[a0 + 5] - P[a0 + 2];
  const d2x = Q[b0 + 3] - Q[b0];
  const d2y = Q[b0 + 4] - Q[b0 + 1];
  const d2z = Q[b0 + 5] - Q[b0 + 2];
  const rx = P[a0] - Q[b0];
  const ry = P[a0 + 1] - Q[b0 + 1];
  const rz = P[a0 + 2] - Q[b0 + 2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e > 1e-12) {
    t = Math.min(1, Math.max(0, f / e));
  } else if (a > 1e-12) {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const px = P[a0] + d1x * s;
  const py = P[a0 + 1] + d1y * s;
  const pz = P[a0 + 2] + d1z * s;
  const dx = px - (Q[b0] + d2x * t);
  const dy = py - (Q[b0 + 1] + d2y * t);
  const dz = pz - (Q[b0 + 2] + d2z * t);
  out[0] = dx * dx + dy * dy + dz * dz;
  out[1] = s;
  out[2] = t;
  out[3] = px;
  out[4] = py;
  out[5] = pz;
}

// whether a place is inside every plane (each [nx, ny, nz, w]: n . p + w >= 0)
function inside(planes: V3, x: number, y: number, z: number) {
  for (let k = 0; k < planes.length; k += 4) {
    if (planes[k] * x + planes[k + 1] * y + planes[k + 2] * z + planes[k + 3] < -1e-9) {
      return false;
    }
  }
  return true;
}

// the most (0 to 1) of the way d from p (inside the planes) that stays inside them
function within(planes: V3, p: V3, d: V3) {
  let t = 1;
  for (let k = 0; k < planes.length; k += 4) {
    const v = planes[k] * p[0] + planes[k + 1] * p[1] + planes[k + 2] * p[2] + planes[k + 3];
    const dv = planes[k] * d[0] + planes[k + 1] * d[1] + planes[k + 2] * d[2];
    if (dv < 0) {
      t = Math.min(t, Math.max(0, -v / dv) * 0.98);
    }
  }
  return t;
}

// the longest piece on the screen of n points' places there (x, y and the distance along the
// view each): 0 without a view, Infinity for a place behind the eye
function longestOf(seen: V3, n: number, view: BoltView | null | undefined) {
  if (!view) {
    return 0;
  }
  if (seen[2] <= 1e-3) {
    return Infinity;
  }
  let most = 0;
  for (let i = 1; i < n; i++) {
    if (seen[i * 3 + 2] <= 1e-3) {
      return Infinity;
    }
    most = Math.max(most, Math.hypot(seen[i * 3] - seen[i * 3 - 3], seen[i * 3 + 1] - seen[i * 3 - 2]));
  }
  return most;
}

// whether a line turns more than KINK_MOST at b, from a through b to c, in the world (a piece of
// no length turns nothing)
function sharp3(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - bx;
  const vy = cy - by;
  const vz = cz - bz;
  const uu = ux * ux + uy * uy + uz * uz;
  const vv = vx * vx + vy * vy + vz * vz;
  if (uu < 1e-18 || vv < 1e-18) {
    return false;
  }
  return ux * vx + uy * vy + uz * vz < KINK_COS * Math.sqrt(uu * vv);
}

// the same on the screen (pixels; a piece under 1e-3 px turns nothing)
function sharp2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const ux = bx - ax;
  const uy = by - ay;
  const vx = cx - bx;
  const vy = cy - by;
  const uu = ux * ux + uy * uy;
  const vv = vx * vx + vy * vy;
  if (uu < 1e-6 || vv < 1e-6) {
    return false;
  }
  return ux * vx + uy * vy < KINK_COS * Math.sqrt(uu * vv);
}

// whether the turns at the inner points from + 1 to to - 1 of a line's points (x, y, z each) are
// all within KINK_MOST, in the world and, with a view, on the screen
function keepsTurns(pts: V3, from: number, to: number, view: BoltView | null | undefined, proj: Out, seen: Out) {
  for (let i = Math.max(1, from + 1); i < to; i++) {
    const o = i * 3;
    if (sharp3(pts[o - 3], pts[o - 2], pts[o - 1], pts[o], pts[o + 1], pts[o + 2], pts[o + 3], pts[o + 4], pts[o + 5])) {
      return false;
    }
  }
  if (!view) {
    return true;
  }
  for (let i = Math.max(0, from); i <= to; i++) {
    view.project(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], proj);
    seen[(i - from) * 2] = proj[0];
    seen[(i - from) * 2 + 1] = proj[1];
  }
  for (let i = Math.max(1, from + 1); i < to; i++) {
    const o = (i - from) * 2;
    if (sharp2(seen[o - 2], seen[o - 1], seen[o], seen[o + 1], seen[o + 2], seen[o + 3])) {
      return false;
    }
  }
  return true;
}
// (keepsTurns' places on the screen: at most 8 points)
const turnSeen = new Float64Array(16);

// the way the foot's first piece is turned to: its angle from the vertical scaled from 0-90
// degrees to 0-FOOT_SLANT, its way across kept, into out (a unit vector; false when it is
// within that already)
function standWay(pts: V3, out: Out) {
  const vx = pts[3] - pts[0];
  const vy = pts[4] - pts[1];
  const vz = pts[5] - pts[2];
  const h = Math.sqrt(vx * vx + vz * vz);
  if (h < 1e-12) {
    return false;
  }
  const from = Math.atan2(h, vy);
  if (from <= (FOOT_SLANT * Math.PI) / 180) {
    return false;
  }
  const angle = (from * FOOT_SLANT) / 90;
  out[0] = (vx / h) * Math.sin(angle);
  out[1] = Math.cos(angle);
  out[2] = (vz / h) * Math.sin(angle);
  return true;
}
const standDir = new Float64Array(3);
// (the pieces of the last stub made: 0 none needed, -1 none found)
let stubPieces = 0;

// the foot's first piece turned towards the vertical (standWay), as long as it was or shorter
// (STAND_LENGTHS of it), when the place stays inside the planes and the turns at its end and the
// point after it stay within KINK_MOST: whether it is upright now (else left as it was)
function standUp(pts: Out, n: number, planes: V3, view: BoltView | null | undefined, proj: Out) {
  if (!standWay(pts, standDir)) {
    return true;
  }
  const ox = pts[3];
  const oy = pts[4];
  const oz = pts[5];
  const l = Math.sqrt((ox - pts[0]) * (ox - pts[0]) + (oy - pts[1]) * (oy - pts[1]) + (oz - pts[2]) * (oz - pts[2]));
  for (let k = 0; k < STAND_LENGTHS.length; k++) {
    const g = STAND_LENGTHS[k] * l;
    const x = pts[0] + standDir[0] * g;
    const y = pts[1] + standDir[1] * g;
    const z = pts[2] + standDir[2] * g;
    if (!inside(planes, x, y, z)) {
      continue;
    }
    pts[3] = x;
    pts[4] = y;
    pts[5] = z;
    if (keepsTurns(pts, 0, Math.min(n - 1, 3), view, proj, turnSeen)) {
      return true;
    }
  }
  pts[3] = ox;
  pts[4] = oy;
  pts[5] = oz;
  return false;
}

// a route from the foot (its n points) whose first piece could not be turned upright: a short
// upright piece put before it (standWay, STUB_LENGTHS of the first piece's length, the first
// that stays inside the planes and turns within KINK_MOST at its end and at the first piece's),
// a new array; else the route as it is. As the stub shortens, its turn tends to the turn made
// to the vertical (at most 90 - FOOT_SLANT degrees in the world) and the first piece's to what
// it was
function footStub(route: Float64Array, n: number, planes: V3, view: BoltView | null | undefined, proj: Out) {
  stubPieces = 0;
  if (n < 2 || !standWay(route, standDir)) {
    return route;
  }
  stubPieces = -1;
  const l = Math.sqrt((route[3] - route[0]) ** 2 + (route[4] - route[1]) ** 2 + (route[5] - route[2]) ** 2);
  const out = takeF64(route.length + 3);
  out[0] = route[0];
  out[1] = route[1];
  out[2] = route[2];
  for (let i = 3; i < route.length; i++) {
    out[i + 3] = route[i];
  }
  for (let k = 0; k < STUB_LENGTHS.length; k++) {
    const g = STUB_LENGTHS[k] * l;
    out[3] = route[0] + standDir[0] * g;
    out[4] = route[1] + standDir[1] * g;
    out[5] = route[2] + standDir[2] * g;
    if (inside(planes, out[3], out[4], out[5]) && keepsTurns(out, 0, Math.min(n, 3), view, proj, turnSeen)) {
      stubPieces = 1;
      return out;
    }
  }
  giveF64(out);
  // (else in more pieces: the upright one, then each turned a share of the way to the first
  // piece's way, so each turns that share)
  const vx = route[3] - route[0];
  const vy = route[4] - route[1];
  const vz = route[5] - route[2];
  const h = Math.sqrt(vx * vx + vz * vz) || 1;
  const from = Math.atan2(h, vy);
  const upright = (from * FOOT_SLANT) / 90;
  for (let pieces = 2; pieces <= STUB_PIECES; pieces++) {
    const many = takeF64(route.length + 3 * pieces);
    many[0] = route[0];
    many[1] = route[1];
    many[2] = route[2];
    for (let i = 3; i < route.length; i++) {
      many[i + 3 * pieces] = route[i];
    }
    for (let k = 0; k < STUB_LENGTHS.length; k++) {
      const g = (STUB_LENGTHS[k] * l) / pieces;
      let ok = true;
      for (let q = 0; q < pieces; q++) {
        const a = upright + ((from - upright) * q) / pieces;
        const o = 3 * (q + 1);
        many[o] = many[o - 3] + (vx / h) * Math.sin(a) * g;
        many[o + 1] = many[o - 2] + Math.cos(a) * g;
        many[o + 2] = many[o - 1] + (vz / h) * Math.sin(a) * g;
        ok = ok && inside(planes, many[o], many[o + 1], many[o + 2]);
      }
      if (ok && keepsTurns(many, 0, Math.min(n + pieces - 1, pieces + 2), view, proj, turnSeen)) {
        stubPieces = pieces;
        return many;
      }
    }
    giveF64(many);
  }
  return route;
}

// (the halvings' points, two buffers in turn, grown when needed: no allocation a level; with a
// view, their places on the screen too: x, y and the distance along the view)
const halvings = [new Float64Array(3 * 1025), new Float64Array(3 * 1025)];
const seens = [new Float64Array(3 * 1025), new Float64Array(3 * 1025)];
// (the places on the screen of the points before a line's start and after its end)
const beforeSeen = new Float64Array(3);
const afterSeen = new Float64Array(3);
// (a middle's place on the screen, as it is tried)
const middleSeen = new Float64Array(3);
// (the pushes a middle is tried at, in its push: the other way, then less, then none)
const PUSH_TRIES = [1, -1, 0.5, -0.5, 0.25, 0];

// a jagged line from a to b (both inside the planes): its points (x, y, z each), each middle
// pushed across its piece round it in a random way, halved at least least times, then until its
// longest piece on the screen is at most maxPx, at most most times, the halvings past coarse
// pushed FINE_PUSH as much; with upright, its first piece turned towards the vertical at the
// end. A middle is pushed only as far as keeps it inside the planes and every turn within
// KINK_MOST, in the world and on the screen: the turn at its piece's start (from the point
// before it: the middle placed before, or the point given before a), at itself, and at its
// piece's end (towards the next point of the level before, or the point given after b); tried
// at its push, the other way, then a half and a quarter of it, else not pushed. A middle not
// pushed turns nothing and keeps the level before's turns, so every level keeps every turn
// within the limit (before and after: the line's neighbours where it joins another, or null)
// (own false: the halvings' buffer itself, its points jaggedCount, to be copied before another
// jag)
let jaggedCount = 0;
// (with upright: whether its first piece could be turned upright)
let stoodUp = true;
function jagged(a: V3, b: V3, roughness: number, least: number, most: number, maxPx: number, view: BoltView | null | undefined, planes: V3, random: () => number, upright: boolean, proj: Out, coarse: number, own = true, before: V3 | null = null, after: V3 | null = null): Float64Array {
  let which = 0;
  let cur = halvings[which];
  let seenCur = seens[which];
  let n = 2;
  cur[0] = a[0];
  cur[1] = a[1];
  cur[2] = a[2];
  cur[3] = b[0];
  cur[4] = b[1];
  cur[5] = b[2];
  if (view) {
    view.project(a[0], a[1], a[2], proj);
    seenCur[0] = proj[0];
    seenCur[1] = proj[1];
    seenCur[2] = proj[2];
    view.project(b[0], b[1], b[2], proj);
    seenCur[3] = proj[0];
    seenCur[4] = proj[1];
    seenCur[5] = proj[2];
    if (before) {
      view.project(before[0], before[1], before[2], beforeSeen);
    }
    if (after) {
      view.project(after[0], after[1], after[2], afterSeen);
    }
  }
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const ez = b[2] - a[2];
  let amount = roughness * Math.sqrt(ex * ex + ey * ey + ez * ez);
  for (let level = 0; level < most; level++) {
    if (level >= least && longestOf(seenCur, n, view) <= maxPx) {
      break;
    }
    const need = (2 * n - 1) * 3;
    if (halvings[1 - which].length < need) {
      halvings[1 - which] = new Float64Array(need * 2);
      seens[1 - which] = new Float64Array(need * 2);
    }
    const next = halvings[1 - which];
    const seenNext = seens[1 - which];
    next[0] = cur[0];
    next[1] = cur[1];
    next[2] = cur[2];
    seenNext[0] = seenCur[0];
    seenNext[1] = seenCur[1];
    seenNext[2] = seenCur[2];
    let m = 1;
    for (let i = 0; i + 1 < n; i++) {
      const px = cur[i * 3];
      const py = cur[i * 3 + 1];
      const pz = cur[i * 3 + 2];
      const qx = cur[i * 3 + 3];
      const qy = cur[i * 3 + 4];
      const qz = cur[i * 3 + 5];
      let dx = qx - px;
      let dy = qy - py;
      let dz = qz - pz;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      // (a random way across the piece)
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let cl = 0;
      for (let k = 0; k < 8 && cl <= 1e-3; k++) {
        const ux = random() - 0.5;
        const uy = random() - 0.5;
        const uz = random() - 0.5;
        const along = ux * dx + uy * dy + uz * dz;
        cx = ux - along * dx;
        cy = uy - along * dy;
        cz = uz - along * dz;
        cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
      }
      if (cl <= 1e-3) {
        cx = -dz;
        cy = 0;
        cz = dx;
        cl = Math.sqrt(cx * cx + cz * cz) || 1;
      }
      const mx = (px + qx) / 2;
      const my = (py + qy) / 2;
      const mz = (pz + qz) / 2;
      if (view) {
        // (its part along the line of sight SIGHT_PUSH of it: pushed mostly across the screen)
        let sx = mx;
        let sy = my - view.eyeHeight;
        let sz = mz;
        const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        sx /= sl;
        sy /= sl;
        sz /= sl;
        const toward = (1 - SIGHT_PUSH) * (cx * sx + cy * sy + cz * sz);
        cx -= toward * sx;
        cy -= toward * sy;
        cz -= toward * sz;
        cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
      }
      const push = ((random() * 2 - 1) * amount) / cl;
      // (the point before p: the middle placed before it, else the one given before the line;
      // the point after q: the next of this level's points, else the one given after the line)
      const hasBefore = i > 0 || before !== null;
      const B = i > 0 ? next : before;
      const bo = i > 0 ? (m - 2) * 3 : 0;
      const BS = i > 0 ? seenNext : beforeSeen;
      const hasAfter = i + 2 < n || after !== null;
      const A = i + 2 < n ? cur : after;
      const ao = i + 2 < n ? (i + 2) * 3 : 0;
      const AS = i + 2 < n ? seenCur : afterSeen;
      const ps = i * 3;
      let x = mx;
      let y = my;
      let z = mz;
      for (let t = 0; t < PUSH_TRIES.length; t++) {
        const f = PUSH_TRIES[t] * push;
        x = mx + cx * f;
        y = my + cy * f;
        z = mz + cz * f;
        if (f === 0) {
          break;
        }
        if (!inside(planes, x, y, z)
          || (hasBefore && sharp3(B![bo], B![bo + 1], B![bo + 2], px, py, pz, x, y, z))
          || sharp3(px, py, pz, x, y, z, qx, qy, qz)
          || (hasAfter && sharp3(x, y, z, qx, qy, qz, A![ao], A![ao + 1], A![ao + 2]))) {
          continue;
        }
        if (!view) {
          break;
        }
        view.project(x, y, z, middleSeen);
        if (middleSeen[2] > 1e-3
          && !(hasBefore && sharp2(BS[bo], BS[bo + 1], seenCur[ps], seenCur[ps + 1], middleSeen[0], middleSeen[1]))
          && !sharp2(seenCur[ps], seenCur[ps + 1], middleSeen[0], middleSeen[1], seenCur[ps + 3], seenCur[ps + 4])
          && !(hasAfter && sharp2(middleSeen[0], middleSeen[1], seenCur[ps + 3], seenCur[ps + 4], AS[ao], AS[ao + 1]))) {
          break;
        }
        x = mx;
        y = my;
        z = mz;
      }
      next[m * 3] = x;
      next[m * 3 + 1] = y;
      next[m * 3 + 2] = z;
      next[m * 3 + 3] = qx;
      next[m * 3 + 4] = qy;
      next[m * 3 + 5] = qz;
      if (view) {
        view.project(x, y, z, middleSeen);
        seenNext[m * 3] = middleSeen[0];
        seenNext[m * 3 + 1] = middleSeen[1];
        seenNext[m * 3 + 2] = middleSeen[2];
        seenNext[m * 3 + 3] = seenCur[ps + 3];
        seenNext[m * 3 + 4] = seenCur[ps + 4];
        seenNext[m * 3 + 5] = seenCur[ps + 5];
      }
      m += 2;
    }
    which = 1 - which;
    cur = next;
    seenCur = seenNext;
    n = m;
    amount *= level + 1 === coarse ? 0.55 * FINE_PUSH : 0.55;
  }
  stoodUp = upright ? standUp(cur, n, planes, view, proj) : true;
  jaggedCount = n;
  if (!own) {
    return cur;
  }
  const copy = takeF64(n * 3);
  for (let i = 0; i < n * 3; i++) {
    copy[i] = cur[i];
  }
  return copy;
}

// a line's n points with every piece longer than maxPx on the screen cut into equal straight
// parts (the line's shape kept, at most FINE_MOST points): the same points when none is, else
// the cut points (into hold.buf, grown when needed, when a holder is given; else a new array of
// their size); their number fineCount
let fineCount = 0;
// (the cutting's state: its view, scratch, limit, points made and their array)
let fineView: BoltView | null = null;
let fineProj: Out | null = null;
let fineLimit = 0;
let fineM = 0;
let fineOut: Float64Array | null = null;
// (the cut points of a line given no holder, before their copy: grown when needed)
let fineScratch: Float64Array = new Float64Array(3 * 256);
// (fineView, fineProj and fineOut set by fine while it cuts)
function fineSeen(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  fineView!.project(ax, ay, az, fineProj!);
  const x = fineProj![0];
  const y = fineProj![1];
  fineView!.project(bx, by, bz, fineProj!);
  return Math.hypot(fineProj![0] - x, fineProj![1] - y);
}
function finePut(x: number, y: number, z: number) {
  if ((fineM + 1) * 3 > fineOut!.length) {
    const more = new Float64Array(fineOut!.length * 2);
    more.set(fineOut!);
    fineOut = more;
  }
  fineOut![fineM * 3] = x;
  fineOut![fineM * 3 + 1] = y;
  fineOut![fineM * 3 + 2] = z;
  fineM++;
}
// (a piece longer than the limit halved, each half again, at most 8 times)
function fineSplit(ax: number, ay: number, az: number, bx: number, by: number, bz: number, depth: number) {
  if (depth < 8 && fineM < FINE_MOST && fineSeen(ax, ay, az, bx, by, bz) > fineLimit) {
    const mx = ax + (bx - ax) * 0.5;
    const my = ay + (by - ay) * 0.5;
    const mz = az + (bz - az) * 0.5;
    fineSplit(ax, ay, az, mx, my, mz, depth + 1);
    fineSplit(mx, my, mz, bx, by, bz, depth + 1);
  } else {
    finePut(bx, by, bz);
  }
}
function fine(pts: Float64Array, n: number, view: BoltView | null | undefined, maxPx: number, proj: Out, hold: { buf: Float64Array } | null): Float64Array {
  fineCount = n;
  if (!view) {
    return pts;
  }
  fineView = view;
  fineProj = proj;
  fineLimit = FINE_MARGIN * maxPx;
  let first = -1;
  for (let i = 1; i < n && first < 0; i++) {
    const o = i * 3;
    if (fineSeen(pts[o - 3], pts[o - 2], pts[o - 1], pts[o], pts[o + 1], pts[o + 2]) > fineLimit) {
      first = i;
    }
  }
  if (first < 0) {
    return pts;
  }
  if (!hold && fineScratch.length < Math.max(4 * n, 64) * 3) {
    fineScratch = new Float64Array(Math.max(4 * n, 64) * 3);
  }
  fineOut = hold ? hold.buf : fineScratch;
  fineM = 0;
  for (let i = 0; i < first; i++) {
    finePut(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
  }
  for (let i = first; i < n; i++) {
    const o = i * 3;
    fineSplit(pts[o - 3], pts[o - 2], pts[o - 1], pts[o], pts[o + 1], pts[o + 2], 0);
  }
  fineCount = fineM;
  const out = fineOut!;
  fineOut = null;
  if (hold) {
    hold.buf = out;
    return out;
  }
  fineScratch = out;
  const copy = takeF64(fineM * 3);
  for (let i = 0; i < fineM * 3; i++) {
    copy[i] = out[i];
  }
  return copy;
}

// the closest points of segments a-b and c-d on the screen, into out: their squared distance and
// where on each (0 to 1)
function segmentDistance2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, out: Out) {
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = dx - cx;
  const d2y = dy - cy;
  const rx = ax - cx;
  const ry = ay - cy;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e > 1e-12) {
    t = Math.min(1, Math.max(0, f / e));
  } else if (a > 1e-12) {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-12) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y;
      const denom = a * e - b * b;
      s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const x = ax + d1x * s - cx - d2x * t;
  const y = ay + d1y * s - cy - d2y * t;
  out[0] = x * x + y * y;
  out[1] = s;
  out[2] = t;
}

// a line of the bolt: its points (x, y, z each, count of them), their lengths along it, its box,
// and what it is
// (its object and buffers from the pools; every field set again)
// (its fields given in an object of their own: one object made a line)
function makeLine(pts: Float64Array, fields: LineFields): BoltLine {
  made++;
  const count = pts.length / 3;
  const line = takeLine();
  const cum = takeF64(count);
  const box = takeF64(6);
  const chunks = takeF64(6 * Math.max(1, Math.ceil((count - 1) / CHUNK)));
  lineArrays(pts, count, cum, box, chunks);
  line.points = pts;
  line.count = count;
  line.cum = cum;
  line.length = cum[count - 1];
  line.box = box;
  line.chunks = chunks;
  line.screen = line.schunks = line.sbox = line.scum = null;
  line.smax = 0;
  line.forks.length = 0;
  line.boosts.length = 0;
  line.ends = 1;
  line.depth = 0;
  line.side = 0;
  line.generation = 0;
  line.route = false;
  line.routeFrom = line.routeTo = line.start = line.end = 0;
  line.size = 0;
  line.parent = null;
  line.at = 0;
  line.routeLength = 0;
  line.forkWidth = line.forkParentSize = line.zonePx = line.joinedInto = line.joinedAt = line.crossing = undefined;
  line.cutShort = false;
  line.pooled = false;
  return Object.assign(line, fields);
}

// a line's lengths along it (cum), its box and its chunks' boxes, from its count points
function lineArrays(pts: V3, count: number, cum: Out, box: Out, chunks: Out) {
  cum[0] = 0;
  for (let i = 1; i < count; i++) {
    const dx = pts[i * 3] - pts[i * 3 - 3];
    const dy = pts[i * 3 + 1] - pts[i * 3 - 2];
    const dz = pts[i * 3 + 2] - pts[i * 3 - 1];
    cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  box[0] = box[1] = box[2] = Infinity;
  box[3] = box[4] = box[5] = -Infinity;
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      box[k] = Math.min(box[k], pts[i * 3 + k]);
      box[3 + k] = Math.max(box[3 + k], pts[i * 3 + k]);
    }
  }
  // (each CHUNK pieces' box: min x, y, z, max x, y, z)
  const pieces = count - 1;
  for (let k = 0; k * CHUNK < pieces; k++) {
    const o = k * 6;
    chunks[o] = chunks[o + 1] = chunks[o + 2] = Infinity;
    chunks[o + 3] = chunks[o + 4] = chunks[o + 5] = -Infinity;
    const last = Math.min(pieces, (k + 1) * CHUNK);
    for (let i = k * CHUNK; i <= last; i++) {
      for (let c = 0; c < 3; c++) {
        chunks[o + c] = Math.min(chunks[o + c], pts[i * 3 + c]);
        chunks[o + 3 + c] = Math.max(chunks[o + 3 + c], pts[i * 3 + c]);
      }
    }
  }
}

// the point at a part (0 to 1) of a line's length, into out: the index of its piece
function pointInto(line: { length: number; count: number; cum: V3; points: V3 }, part: number, out: Out) {
  const target = part * line.length;
  let i = 1;
  while (i < line.count - 1 && line.cum[i] < target) {
    i++;
  }
  const span = line.cum[i] - line.cum[i - 1];
  const f = Math.min(1, Math.max(0, span > 0 ? (target - line.cum[i - 1]) / span : 0));
  const P = line.points;
  const o = i * 3;
  out[0] = P[o - 3] + (P[o] - P[o - 3]) * f;
  out[1] = P[o - 2] + (P[o + 1] - P[o - 2]) * f;
  out[2] = P[o - 1] + (P[o + 2] - P[o - 1]) * f;
  return i - 1;
}
// (the places a rejoin's ways are measured at, and a fork's place: wayOn, fork)
const joinAt = new Float64Array(3);
const joinOn = new Float64Array(3);
const joinIn = new Float64Array(3);
const nearPlace = new Float64Array(3);
// (pointInto's places for slicePoints and wayInto)
const fromPoint = new Float64Array(3);
const toPoint = new Float64Array(3);

// the points of a line from one part of its length to another
function slicePoints(line: { length: number; count: number; cum: V3; points: V3 }, from: number, to: number) {
  const a = pointInto(line, from, fromPoint);
  const b = pointInto(line, to, toPoint);
  const out = takeF64((b - a + 2) * 3);
  out[0] = fromPoint[0];
  out[1] = fromPoint[1];
  out[2] = fromPoint[2];
  let m = 3;
  for (let i = a + 1; i <= b; i++) {
    out[m] = line.points[i * 3];
    out[m + 1] = line.points[i * 3 + 1];
    out[m + 2] = line.points[i * 3 + 2];
    m += 3;
  }
  out[m] = toPoint[0];
  out[m + 1] = toPoint[1];
  out[m + 2] = toPoint[2];
  return out;
}

// a line cut short at a part of its length (the same line otherwise)
function cutLine(line: CheckedLine, part: number) {
  return makeLine(slicePoints(line, 0, part), { side: line.side, generation: line.generation, route: line.route, size: line.size, parent: line.parent, at: line.at, depth: line.depth });
}

// the way a line goes at a part of its length, into out (a unit vector): over half (a part of
// its length) either way
function wayInto(line: { length: number; count: number; cum: V3; points: V3; side: number }, part: number, out: Out, half: number) {
  pointInto(line, Math.min(1, part + half), toPoint);
  pointInto(line, Math.max(0, part - half), fromPoint);
  const x = toPoint[0] - fromPoint[0];
  const y = toPoint[1] - fromPoint[1];
  const z = toPoint[2] - fromPoint[2];
  const l = Math.sqrt(x * x + y * y + z * z);
  if (l > 1e-6) {
    out[0] = x / l;
    out[1] = y / l;
    out[2] = z / l;
  } else {
    out[0] = 0;
    out[1] = line.side === 0 ? -1 : 1;
    out[2] = 0;
  }
  return out;
}

// the meeting point placed at its offsets from the straight line (place(1)), or at a share of
// them, halved until the line from the top through it to the foot turns at most KINK_MOST there,
// in the world and on the screen (on the straight line, place(0), at the last)
const meetSeen = new Float64Array(8);
const meetPoints = new Float64Array(9);
function meetPlace(place: (f: number) => void, top: V3, meet: V3, foot: V3, view: BoltView | null | undefined, proj: Out) {
  for (let f = 1; f > 0.1; f /= 2) {
    place(f);
    meetPoints.set(top, 0);
    meetPoints.set(meet, 3);
    meetPoints.set(foot, 6);
    if (keepsTurns(meetPoints, 0, 2, view, proj, meetSeen)) {
      return;
    }
  }
  place(0);
}

// a generator run to its end at once: its result
function runAll<T>(slices: Slices<T>) {
  let next = slices.next();
  while (!next.done) {
    next = slices.next();
  }
  return next.value;
}

// an attempt's random numbers: from the strike's draw (base, 32 bits) and the attempt's number
function attemptRandom(base: number, attempt: number) {
  return M.seededRandom((base + Math.imul(attempt, 0x9e3779b1)) >>> 0);
}

// ---- the rules a shape keeps, in one place (BoltShape.check; the maker draws shapes until one
// keeps them all) ----
// (a turn's most, degrees; the foot's last piece's most from the vertical, degrees; a piece's
// most on the screen is the maker's, PIECE_SHARE of its height, and the gaps' least ZONE_SHARE
// of it: 24 and 4 px at 2160 rows)
const RULE_KINK = 90;
const RULE_FOOT = 30;
// (the pieces a chunk's box holds, for the pairs' checks)
const RULE_CHUNK = 16;
// (piece pairs looked at between slices, when made in slices)
const RULE_WORK = 4000;
// (the shapes drawn at most for a strike; past them the one with fewest findings is kept:
// shape.fallback)
const ATTEMPTS = 12;
// (scratch: closest points, a place, two ways)
const ruleNear = new Float64Array(6);
const rulePoint = new Float64Array(3);
const rulePoint2 = new Float64Array(3);
const ruleHits: number[] = [];
// a line's place at a part of its length, into out
function rulePointAt(line: { points: V3; cum: V3; length: number; count: number }, part: number, out: Out) {
  const P = line.points;
  const cum = line.cum;
  const target = part * line.length;
  let i = 1;
  while (i < line.count - 1 && cum[i] < target) {
    i++;
  }
  const span = cum[i] - cum[i - 1];
  const f = span > 0 ? Math.min(1, Math.max(0, (target - cum[i - 1]) / span)) : 0;
  for (let k = 0; k < 3; k++) {
    out[k] = P[(i - 1) * 3 + k] + (P[i * 3 + k] - P[(i - 1) * 3 + k]) * f;
  }
  return out;
}
// the angle (degrees) between two ways
function ruleAngle(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const d = (ax * bx + ay * by + az * bz) / (Math.sqrt(ax * ax + ay * ay + az * az) * Math.sqrt(bx * bx + by * by + bz * bz) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
}
// the turns over RULE_KINK of count points (x, y, z each: in the world, pieces under 1e-9 m left
// out; on the screen x, y and the distance, pieces under 1e-3 px left out) into out
function ruleKinks(P: V3, count: number, line: number, screen: boolean, out: Finding[]) {
  let px = 0;
  let py = 0;
  let pz = 0;
  let has = false;
  for (let i = 0; i + 1 < count; i++) {
    const dx = P[i * 3 + 3] - P[i * 3];
    const dy = P[i * 3 + 4] - P[i * 3 + 1];
    const dz = screen ? 0 : P[i * 3 + 5] - P[i * 3 + 2];
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(l >= (screen ? 1e-3 : 1e-9))) {
      continue;
    }
    if (has) {
      const deg = ruleAngle(px, py, pz, dx, dy, dz);
      if (deg > RULE_KINK + 1e-9) {
        out.push({ rule: "kink", line, at: i, deg, kind: screen ? "screen" : "world" });
      }
    }
    px = dx;
    py = dy;
    pz = dz;
    has = true;
  }
}
// whether two pieces on the screen cross (each one's ends on both sides of the other)
function ruleCrosses(S: V3, i: number, T: V3, j: number) {
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d1 = side(T[j * 3], T[j * 3 + 1], T[j * 3 + 3], T[j * 3 + 4], S[i * 3], S[i * 3 + 1]);
  const d2 = side(T[j * 3], T[j * 3 + 1], T[j * 3 + 3], T[j * 3 + 4], S[i * 3 + 3], S[i * 3 + 4]);
  const d3 = side(S[i * 3], S[i * 3 + 1], S[i * 3 + 3], S[i * 3 + 4], T[j * 3], T[j * 3 + 1]);
  const d4 = side(S[i * 3], S[i * 3 + 1], S[i * 3 + 3], S[i * 3 + 4], T[j * 3 + 3], T[j * 3 + 4]);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
// the boxes of a line's chunks of RULE_CHUNK pieces (dims 2: on the screen, x, y of 3 a point;
// 3: in the world), lows then highs, into a taken array
function ruleChunks(count: number) {
  return Math.max(1, Math.ceil((count - 1) / RULE_CHUNK));
}
function ruleBoxes(P: V3, count: number, dims: number, boxes: Float64Array) {
  const chunks = ruleChunks(count);
  for (let c = 0; c < chunks; c++) {
    const o = 2 * dims * c;
    for (let k = 0; k < dims; k++) {
      boxes[o + k] = Infinity;
      boxes[o + dims + k] = -Infinity;
    }
    const last = Math.min(count - 1, (c + 1) * RULE_CHUNK);
    for (let i = c * RULE_CHUNK; i <= last; i++) {
      for (let k = 0; k < dims; k++) {
        const v = P[i * 3 + k];
        if (v < boxes[o + k]) {
          boxes[o + k] = v;
        }
        if (v > boxes[o + dims + k]) {
          boxes[o + dims + k] = v;
        }
      }
    }
  }
  return boxes;
}
function ruleBoxesNear(A: V3, a: number, B: V3, b: number, dims: number, margin: number) {
  const oa = 2 * dims * a;
  const ob = 2 * dims * b;
  for (let k = 0; k < dims; k++) {
    if (A[oa + k] > B[ob + dims + k] + margin || B[ob + k] > A[oa + dims + k] + margin) {
      return false;
    }
  }
  return true;
}
// the validator's arenas: one Float64Array a validation, its arrays views of it, taken whole and
// given back whole (a validation in slices may run while another is between its slices); grown
// to the largest asked (the smaller one dropped)
const arenaPool: Float64Array[] = [];
function takeArena(n: number) {
  let arena = arenaPool.pop();
  if (!arena || arena.length < n) {
    // (twice what is asked, so a larger shape later seldom grows it again)
    let size = 4096;
    while (size < 2 * n) {
      size *= 2;
    }
    arena = new Float64Array(size);
    fresh++;
    made++;
    freshBy.arenas++;
  }
  return arena;
}
// the most size (m) a line has anywhere: its first size, or a rejoin's bigger after (the routes
// at the main channel's F)
function ruleSizeMost(line: { route: boolean; size: number; boosts: Boost[] }, F: number) {
  if (line.route) {
    return F;
  }
  let size = line.size;
  for (const b of line.boosts) {
    size = Math.max(size, (F / 2) * Math.pow(THIN, b.generation));
  }
  return size;
}

// every rule a shape breaks, pushed into out as findings { rule, ... } (none: it keeps them
// all), with the view (null: the world's rules only); yields "validate" between pieces of the
// work when made in slices. The rules:
// - forks { side, count }: a side's lines of the 1st generation on, FORKS_MIN to FORKS_MAX;
//   generation { side, generation, count }: a side's lines of each generation within
//   GENERATION_FORKS; deeper { line, generation }: none past GENERATIONS
// - kink { line, at, deg, kind }: every turn of the main channel (line -1) and of every branch
//   at most RULE_KINK, in the world and on the screen
// - foot { kind, deg }: the main channel's last piece within RULE_FOOT of the vertical, in the
//   world and on the screen
// - behind { line }: no point of a line behind the eye
// - piece { line, px }: every branch piece at most PIECE_SHARE of the height (a rejoin's last
//   one 1.5 times that)
// - routeSide { count }: the way down above the meeting point's row, the way up below (within
//   0.5 px); routesCross { count }: the routes never crossing but at the meeting point
// - halves { line, other }: no branch touching a line of the other half on the screen (their
//   drawn widths, at least 1 px)
// - touch3d { line, other }: lines of a half (not two routes) no closer in 3D than half their
//   sizes there added, but near a line's fork and at a rejoin's end
// - touch { line, other }: lines of a half no closer on the screen than their half widths, their
//   visible edges (EDGE_SHARE, at least EDGE_PX) and a gap (APART_SHARE of the wider, at least
//   ZONE_SHARE of the height), but along a branch's fork zone (2 (its width + its parent's) +
//   ZONE_SHARE of the height) and the last
//   (that much) / sin JOIN_ANGLE of a rejoin; sideBySide { line, other }: never so over two
//   pieces in a row
// - rejoinGeneration, rejoinSize { line }: the line rejoined going on one generation bigger than
//   the bigger of the two (the smaller number less 1, at least 0), at that size;
//   rejoinCrossing { line, deg }: crossing at JOIN_ANGLE or more; rejoinWay { line, deg }: the way
//   on within JOIN_WAY of the bigger one's way in (over JOIN_REACH_F F); rejoinGrowth { line }:
//   the way on grown only once both have grown to the point; joinThird { line, other }: no third
//   line starting, ending or rejoining within JOIN_GAP F of it
// - meetGap { a, b }: meeting points at least JOIN_GAP F apart
function* validating(shape: Pick<ShapeOf<ShapeLine>, "F" | "meet" | "main" | "lines" | "meetings">, view: BoltView | null, out: Finding[]): Slices<Finding[]> {
  const F = shape.F;
  const lines = shape.lines;
  const n = lines.length;
  const sizeAt = BoltShape.sizeAt;
  let work = 0;
  // ---- the counts ----
  for (let side = 0; side < 2; side++) {
    let forks = 0;
    const counts = [0, 0, 0, 0];
    for (const l of lines) {
      if (l.side === side && l.generation >= 1) {
        forks++;
        if (l.generation <= GENERATIONS) {
          counts[l.generation - 1]++;
        }
      }
    }
    if (forks < FORKS_MIN || forks > FORKS_MAX) {
      out.push({ rule: "forks", side, count: forks });
    }
    for (let g = 1; g <= GENERATIONS; g++) {
      const range = GENERATION_FORKS[g - 1];
      if (counts[g - 1] < range[0] || counts[g - 1] > range[1]) {
        out.push({ rule: "generation", side, generation: g, count: counts[g - 1] });
      }
    }
  }
  for (let a = 0; a < n; a++) {
    if (lines[a].generation > GENERATIONS) {
      out.push({ rule: "deeper", line: a, generation: lines[a].generation });
    }
  }
  // ---- the turns and the foot, in the world ----
  const main = shape.main;
  ruleKinks(main.points, main.count, -1, false, out);
  for (let a = 0; a < n; a++) {
    if (!lines[a].route) {
      ruleKinks(lines[a].points, lines[a].count, a, false, out);
    }
  }
  const MP = main.points;
  const last = (main.count - 1) * 3;
  {
    const dx = MP[last - 3] - MP[last];
    const dy = MP[last - 2] - MP[last + 1];
    const dz = MP[last - 1] - MP[last + 2];
    const deg = (Math.atan2(Math.sqrt(dx * dx + dz * dz), dy) * 180) / Math.PI;
    if (!(deg <= RULE_FOOT)) {
      out.push({ rule: "foot", kind: "world", deg });
    }
  }
  // ---- rejoins and meeting points ----
  const sinJoin = Math.sin((JOIN_ANGLE * Math.PI) / 180);
  for (let a = 0; a < n; a++) {
    const l = lines[a];
    const o = l.joinedInto;
    if (!o) {
      continue;
    }
    const at = l.joinedAt!;
    const point = rulePointAt(o, at, rulePoint);
    const px = point[0];
    const py = point[1];
    const pz = point[2];
    const want = Math.max(Math.min(l.generation, o.generation) - 1, 0);
    let boost = null;
    for (const b of o.boosts) {
      if (Math.abs(b.at - at) < 1e-9) {
        boost = b;
      }
    }
    if (!boost || boost.generation !== want) {
      out.push({ rule: "rejoinGeneration", line: a });
    }
    if (!(sizeAt(o, Math.min(1, at + 1e-6), F) >= (F / 2) * Math.pow(THIN, want) - 1e-12)) {
      out.push({ rule: "rejoinSize", line: a });
    }
    if (!((l.crossing as number) >= JOIN_ANGLE)) {
      out.push({ rule: "rejoinCrossing", line: a, deg: l.crossing });
    }
    if (at < 1 - 1e-9) {
      const reach = JOIN_REACH_F * F;
      const on = rulePointAt(o, Math.min(1, at + reach / o.length), rulePoint2);
      const wx = on[0] - px;
      const wy = on[1] - py;
      const wz = on[2] - pz;
      let ix;
      let iy;
      let iz;
      if (l.generation < o.generation) {
        const lp = l.points;
        const e = (l.count - 1) * 3;
        const from = rulePointAt(l, Math.max(0, 1 - reach / l.length), rulePoint2);
        ix = lp[e] - from[0];
        iy = lp[e + 1] - from[1];
        iz = lp[e + 2] - from[2];
      } else {
        const from = rulePointAt(o, Math.max(0, at - reach / o.length), rulePoint2);
        ix = px - from[0];
        iy = py - from[1];
        iz = pz - from[2];
      }
      const deg = ruleAngle(wx, wy, wz, ix, iy, iz);
      if (deg > JOIN_WAY) {
        out.push({ rule: "rejoinWay", line: a, deg });
      }
    }
    if (o.start + at * (o.end - o.start) < l.end - 1e-9) {
      out.push({ rule: "rejoinGrowth", line: a });
    }
    const gapSq = JOIN_GAP * F * (JOIN_GAP * F);
    for (let b = 0; b < n; b++) {
      const t = lines[b];
      if (t === l || t === o || t.route) {
        continue;
      }
      let near = false;
      if (t.parent) {
        const s = rulePointAt(t.parent, t.at, rulePoint2);
        near = (s[0] - px) ** 2 + (s[1] - py) ** 2 + (s[2] - pz) ** 2 < gapSq;
      }
      const tp = t.points;
      const e = (t.count - 1) * 3;
      near = near || (tp[e] - px) ** 2 + (tp[e + 1] - py) ** 2 + (tp[e + 2] - pz) ** 2 < gapSq;
      if (near) {
        out.push({ rule: "joinThird", line: a, other: b });
      }
    }
  }
  const meetings = shape.meetings;
  for (let i = 0; i < meetings.length; i++) {
    for (let j = i + 1; j < meetings.length; j++) {
      const p = meetings[i];
      const q = meetings[j];
      if (Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2) < JOIN_GAP * F - 1e-9) {
        out.push({ rule: "meetGap", a: i, b: j });
      }
    }
  }
  // ---- in 3D, lines of a half apart ----
  // (the arrays: each line's chunks' boxes in the world; with a view each line's points on the
  // screen, its lengths there and its chunks' boxes there, and the main channel's points there)
  let floats = view ? 3 * main.count : 0;
  for (let a = 0; a < n; a++) {
    const count = lines[a].count;
    floats += 6 * ruleChunks(count) + (view ? 4 * count + 4 * ruleChunks(count) + 1 : 0);
  }
  floats += 1;
  const arena = takeArena(floats);
  let used = 0;
  const part = (k: number) => {
    const v = arena.subarray(used, used + k);
    used += k;
    return v;
  };
  const worldBoxes: Float64Array[] = [];
  const screens: Float64Array[] = [];
  const screenBoxes: Float64Array[] = [];
  const cumPx: Float64Array[] = [];
  try {
    for (let a = 0; a < n; a++) {
      worldBoxes.push(ruleBoxes(lines[a].points, lines[a].count, 3, part(6 * ruleChunks(lines[a].count))));
    }
    const clearOf = (l: ShapeLine) => (l.route ? 3 * F : l.forkWidth !== undefined ? 2 * (l.forkWidth + l.forkParentSize!) + F : Math.min(0.5 * l.length, 2 * (l.size + l.size / THIN) + F));
    const bandOf = (l: ShapeLine, o: ShapeLine) => (l.size + F / 2) / (2 * sinJoin) + (l.size + o.size) / 2;
    for (let a = 0; a < n; a++) {
      const l = lines[a];
      for (let b = a + 1; b < n; b++) {
        const o = lines[b];
        if (o.side !== l.side || (l.route && o.route)) {
          continue;
        }
        const margin = (ruleSizeMost(l, F) + ruleSizeMost(o, F)) / 2;
        const A = worldBoxes[a];
        const Bx = worldBoxes[b];
        let met = false;
        for (let ca = 0; ca * 6 < A.length && !met; ca++) {
          for (let cb = 0; cb * 6 < Bx.length && !met; cb++) {
            work++;
            if (work >= RULE_WORK) {
              work = 0;
              if (!atOnce) {
                yield "validate";
              }
            }
            if (!ruleBoxesNear(A, ca, Bx, cb, 3, margin)) {
              continue;
            }
            const iEnd = Math.min(l.count - 1, (ca + 1) * RULE_CHUNK);
            const jEnd = Math.min(o.count - 1, (cb + 1) * RULE_CHUNK);
            for (let i = ca * RULE_CHUNK; i < iEnd && !met; i++) {
              for (let j = cb * RULE_CHUNK; j < jEnd; j++) {
                work++;
                segmentDistance(l.points, i, o.points, j, ruleNear);
                const d = Math.sqrt(ruleNear[0]);
                if (d >= (l.size + o.size) / 2) {
                  continue;
                }
                const alongL = l.cum[i] + ruleNear[1] * (l.cum[i + 1] - l.cum[i]);
                const alongO = o.cum[j] + ruleNear[2] * (o.cum[j + 1] - o.cum[j]);
                if (d >= (sizeAt(l, alongL / l.length, F) + sizeAt(o, alongO / o.length, F)) / 2) {
                  continue;
                }
                if (alongL < clearOf(l) || alongO < clearOf(o)) {
                  continue;
                }
                if ((l.joinedInto === o && alongL > l.length - bandOf(l, o) - 1e-9) || (o.joinedInto === l && alongO > o.length - bandOf(o, l) - 1e-9)) {
                  continue;
                }
                out.push({ rule: "touch3d", line: a, other: b });
                met = true;
                break;
              }
            }
            if (work >= RULE_WORK) {
              work = 0;
              if (!atOnce) {
                yield "validate";
              }
            }
          }
        }
      }
    }
    if (!view) {
      return out;
    }
    // ---- on the screen ----
    const focal = view.focal();
    const pieceMost = PIECE_SHARE * view.height;
    const gapLeast = ZONE_SHARE * view.height;
    const pxOf = (size: number, along: number) => Math.max(1, (size * focal) / along);
    const project = (P: V3, count: number, line: number) => {
      const S = part(3 * count);
      let behind = false;
      for (let i = 0; i < count; i++) {
        view.project(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], rulePoint);
        if (rulePoint[2] > 0.01) {
          S[i * 3] = rulePoint[0];
          S[i * 3 + 1] = rulePoint[1];
        } else {
          S[i * 3] = S[i * 3 + 1] = NaN;
          behind = true;
        }
        S[i * 3 + 2] = rulePoint[2];
      }
      if (behind) {
        out.push({ rule: "behind", line });
      }
      return S;
    };
    const mainScreen = project(MP, main.count, -1);
    ruleKinks(mainScreen, main.count, -1, true, out);
    {
      const ax = mainScreen[last];
      const ay = mainScreen[last + 1];
      const bx = mainScreen[last - 3];
      const by = mainScreen[last - 2];
      const deg = (Math.atan2(Math.abs(bx - ax), ay - by) * 180) / Math.PI;
      if (!(deg <= RULE_FOOT)) {
        out.push({ rule: "foot", kind: "screen", deg });
      }
    }
    // (the routes, from the main channel: the way down to the meeting point, the way up from it)
    const m = shape.meet;
    let mi = 0;
    while (mi < main.count && (MP[mi * 3] - m[0]) ** 2 + (MP[mi * 3 + 1] - m[1]) ** 2 + (MP[mi * 3 + 2] - m[2]) ** 2 > 1e-18) {
      mi++;
    }
    view.project(m[0], m[1], m[2], rulePoint);
    const my = rulePoint[1];
    let off = 0;
    let downMost = -Infinity;
    let upLeast = Infinity;
    for (let i = 0; i < main.count; i++) {
      const y = mainScreen[i * 3 + 1];
      if (i <= mi) {
        if (!(y <= my + 0.5)) {
          off++;
        }
        downMost = Math.max(downMost, y);
      }
      if (i >= mi) {
        if (!(y >= my - 0.5)) {
          off++;
        }
        upLeast = Math.min(upLeast, y);
      }
    }
    if (off) {
      out.push({ rule: "routeSide", count: off });
    }
    let crossed = 0;
    for (let i = 0; i + 1 <= mi && i + 1 < main.count; i++) {
      if (!(Math.max(mainScreen[i * 3 + 1], mainScreen[i * 3 + 4]) >= upLeast)) {
        continue;
      }
      for (let j = mi; j + 1 < main.count; j++) {
        if (i + 1 === mi && j === mi) {
          continue;
        }
        if (!(Math.min(mainScreen[j * 3 + 1], mainScreen[j * 3 + 4]) <= downMost)) {
          continue;
        }
        if (ruleCrosses(mainScreen, i, mainScreen, j)) {
          crossed++;
        }
      }
    }
    if (crossed) {
      out.push({ rule: "routesCross", count: crossed });
    }
    // (each line on the screen, its lengths along it there, its chunks' boxes, its most width)
    const widest: number[] = [];
    for (let a = 0; a < n; a++) {
      const l = lines[a];
      const S = project(l.points, l.count, a);
      screens.push(S);
      screenBoxes.push(ruleBoxes(S, l.count, 2, part(4 * ruleChunks(l.count))));
      const c = part(l.count);
      c[0] = 0;
      let nearest = Infinity;
      for (let i = 0; i < l.count; i++) {
        if (i) {
          c[i] = c[i - 1] + Math.sqrt((S[i * 3] - S[i * 3 - 3]) ** 2 + (S[i * 3 + 1] - S[i * 3 - 2]) ** 2);
        }
        nearest = Math.min(nearest, S[i * 3 + 2]);
      }
      cumPx.push(c);
      widest.push(pxOf(ruleSizeMost(l, F), Math.max(0.01, nearest)));
      if (!l.route) {
        let most = 0;
        for (let i = 0; i + 1 < l.count; i++) {
          let len = c[i + 1] - c[i];
          len = Number.isFinite(len) ? len : Infinity;
          most = Math.max(most, l.joinedInto && i + 2 === l.count ? len / 1.5 : len);
        }
        if (!(most <= pieceMost)) {
          out.push({ rule: "piece", line: a, px: most });
        }
        ruleKinks(S, l.count, a, true, out);
      }
    }
    const edge = (w: number) => Math.max(EDGE_SHARE * w, EDGE_PX);
    const widthAt = (line: ShapeLine, part: number, along: number) => pxOf(line.route ? F : sizeAt(line, part, F), along);
    const zoneOf = (line: ShapeLine, S: V3) => {
      if (line.route) {
        return 0;
      }
      const along = S[2];
      const w = pxOf(line.forkWidth !== undefined ? line.forkWidth : line.size, along);
      const parent = line.parent;
      const pw = !parent || parent.route ? pxOf(F, along) : pxOf(line.forkParentSize !== undefined ? line.forkParentSize : sizeAt(parent, line.at, F), along);
      return 2 * (w + pw) + gapLeast;
    };
    // (each line's fork zone, once)
    const zones = part(Math.max(1, n));
    for (let a = 0; a < n; a++) {
      zones[a] = zoneOf(lines[a], screens[a]);
    }
    for (let a = 0; a < n; a++) {
      const l = lines[a];
      const SA = screens[a];
      const zoneA = zones[a];
      for (let b = 0; b < n; b++) {
        const o = lines[b];
        const other = o.side !== l.side;
        // (the other half: every branch against every line there; a half: each pair once, not two
        // routes)
        if (other ? l.route : b <= a || (l.route && o.route)) {
          continue;
        }
        const SB = screens[b];
        const wa = widest[a];
        const wb = widest[b];
        const margin = other ? (wa + wb) / 2 : (wa + wb) / 2 + edge(wa) + edge(wb) + Math.max(gapLeast, APART_SHARE * Math.max(wa, wb));
        const A = screenBoxes[a];
        const Bx = screenBoxes[b];
        const zoneB = other ? 0 : zones[b];
        const ca0 = cumPx[a];
        const cb0 = cumPx[b];
        let found = false;
        ruleHits.length = 0;
        for (let ca = 0; ca * 4 < A.length && !(other && found); ca++) {
          for (let cb = 0; cb * 4 < Bx.length && !(other && found); cb++) {
            work++;
            if (work >= RULE_WORK) {
              work = 0;
              if (!atOnce) {
                yield "validate";
              }
            }
            if (!ruleBoxesNear(A, ca, Bx, cb, 2, margin)) {
              continue;
            }
            const iEnd = Math.min(l.count - 1, (ca + 1) * RULE_CHUNK);
            const jEnd = Math.min(o.count - 1, (cb + 1) * RULE_CHUNK);
            for (let i = ca * RULE_CHUNK; i < iEnd; i++) {
              for (let j = cb * RULE_CHUNK; j < jEnd; j++) {
                work++;
                segmentDistance2(SA[i * 3], SA[i * 3 + 1], SA[i * 3 + 3], SA[i * 3 + 4], SB[j * 3], SB[j * 3 + 1], SB[j * 3 + 3], SB[j * 3 + 4], ruleNear);
                const d = Math.sqrt(ruleNear[0]);
                if (!Number.isFinite(d)) {
                  continue;
                }
                const s = ruleNear[1];
                const t = ruleNear[2];
                const alongA = SA[i * 3 + 2] + (SA[i * 3 + 5] - SA[i * 3 + 2]) * s;
                const alongB = SB[j * 3 + 2] + (SB[j * 3 + 5] - SB[j * 3 + 2]) * t;
                const partB = (o.cum[j] + t * (o.cum[j + 1] - o.cum[j])) / o.length;
                if (other) {
                  const reach = (pxOf(l.size, alongA) + widthAt(o, partB, alongB)) / 2;
                  if (d < reach) {
                    found = true;
                    break;
                  }
                  continue;
                }
                const partA = (l.cum[i] + s * (l.cum[i + 1] - l.cum[i])) / l.length;
                const wl = widthAt(l, partA, alongA);
                const wo = widthAt(o, partB, alongB);
                const apart = (wl + wo) / 2 + edge(wl) + edge(wo) + Math.max(gapLeast, APART_SHARE * Math.max(wl, wo));
                if (d >= apart) {
                  continue;
                }
                const atA = ca0[i] + s * (ca0[i + 1] - ca0[i]);
                const atB = cb0[j] + t * (cb0[j + 1] - cb0[j]);
                if (atA < zoneA || atB < zoneB) {
                  continue;
                }
                const band = apart / sinJoin;
                if ((l.joinedInto === o && atA > ca0[l.count - 1] - band) || (o.joinedInto === l && atB > cb0[o.count - 1] - band)) {
                  continue;
                }
                found = true;
                if (ruleHits.indexOf(i) < 0) {
                  ruleHits.push(i);
                }
              }
              if (other && found) {
                break;
              }
            }
            if (work >= RULE_WORK) {
              work = 0;
              if (!atOnce) {
                yield "validate";
              }
            }
          }
        }
        if (found) {
          out.push({ rule: other ? "halves" : "touch", line: a, other: b });
          if (!other) {
            ruleHits.sort((x, y) => x - y);
            for (let h = 1; h < ruleHits.length; h++) {
              if (ruleHits[h] === ruleHits[h - 1] + 1) {
                out.push({ rule: "sideBySide", line: a, other: b });
                break;
              }
            }
          }
        }
      }
    }
    return out;
  } finally {
    arenaPool.push(arena);
  }
}

export class BoltShape {
  static segmentDistance: (p0: V3, p1: V3, q0: V3, q1: V3) => { distance: number; s: number; t: number };
  static pointsOf: (line: { count: number; points: V3 }) => number[][];
  static tally: () => { taken: Record<number, number>; given: Record<number, number> };
  static freshBy: () => typeof freshBy;
  static pooled: () => number;
  static fresh: () => number;
  static giveBuffer: (buffer: ArrayBufferLike | null | undefined) => void;
  static fromFlat: (flat: FlatSource) => FlatShape;
  static made: () => number;
  static EDGE_PX: number;
  static EDGE_SHARE: number;
  static APART_SHARE: number;
  static PIECE_SHARE: number;
  static FORKS_MAX: number;
  static FORKS_MIN: number;
  static GENERATION_FORKS: number[][];
  static GENERATIONS: number;
  static JOIN_GAP: number;
  static JOIN_ANGLE: number;
  static GAP_F: number;
  static makeAttempt: (top: V3, foot: V3, random: () => number, F: number, view?: BoltView | null) => MadeShape;
  static ATTEMPTS: number;
  static check: (shape: Pick<ShapeOf<ShapeLine>, "F" | "meet" | "main" | "lines" | "meetings">, view?: BoltView | null) => Finding[];
  static THIN: number;
  static toFlat: (shape: MadeShape, alloc?: (n: number) => Float64Array) => FlatForm;
  static warm: () => void;
  static sizeAt(line: { forks: number[]; boosts: Boost[]; size: number }, part: number, F: number) {
    let k = 0;
    for (const f of line.forks) {
      if (f < part) {
        k++;
      }
    }
    let size = line.size * Math.pow(THIN, k);
    for (const b of line.boosts) {
      if (b.at < part) {
        let after = 0;
        for (const f of line.forks) {
          if (f > b.at && f < part) {
            after++;
          }
        }
        size = Math.max(size, (F / 2) * Math.pow(THIN, b.generation + after));
      }
    }
    return size;
  }

  // a strike's shape made at once (making's slices one after the other); makeMs its time
  static make(top: V3, foot: V3, random: () => number, F: number, view?: BoltView | null): MadeShape {
    const started = performance.now();
    const slices = BoltShape.making(top, foot, random, F, view);
    const outer = atOnce;
    atOnce = true;
    let next: IteratorResult<string, MadeShape | null>;
    try {
      next = slices.next();
      while (!next.done) {
        next = slices.next();
      }
    } finally {
      atOnce = outer;
    }
    next.value!.makeMs = performance.now() - started;
    return next.value!;
  }

  // a strike's shape made over several calls: step(budget) makes at least one slice, then more
  // while less than budget ms have gone in the call, and gives the shape once made (null till
  // then); makeMs the time spent in its steps
  // (slow: the slowest slice lately of any making, ms, shrinking by STEP_DECAY at each step: a
  // step makes a next slice only while it still fits in the budget)
  static start(top: V3, foot: V3, random: () => number, F: number, view?: BoltView | null): Making {
    const slices = BoltShape.making(top, foot, random, F, view);
    let shape: MadeShape | null = null;
    let spent = 0;
    const making: Making = {
      // (the slowest lately of the slices that start where this making is)
      get slow() {
        return phaseSlow[making.after];
      },
      // (where its next slice starts: the index of the yield it follows)
      after: 0,
      // (the last step's slices, its slowest (ms) and what that slice ended with: routes,
      // sibling, try, fork, end)
      slices: 0,
      slowest: 0,
      phase: "",
      jag: null,
      boost: null,
      // (the slices made so far, and the index of the last step's slowest; the last step's time in
      // its slices)
      sliceMs: 0,
      total: 0,
      slowestIndex: 0,
      // (ended before its shape was made: what it had made given back)
      destroyed: false,
      destroy() {
        if (!shape && !making.destroyed) {
          making.destroyed = true;
          (slices as Slices<MadeShape | null | void>).return();
        }
      },
      step(budget: number) {
        if (making.destroyed) {
          return null;
        }
        if (shape) {
          return shape;
        }
        for (let k = 0; k < phaseSlow.length; k++) {
          phaseSlow[k] *= STEP_DECAY;
        }
        const started = performance.now();
        let last = started;
        boostNote.ms = 0;
        boostNote.calls = 0;
        let next = slices.next();
        making.slices = 0;
        making.sliceMs = 0;
        making.slowest = 0;
        while (true) {
          const now = performance.now();
          making.slices++;
          making.total++;
          making.sliceMs += now - last;
          if (now - last > making.slowest) {
            making.slowest = now - last;
            making.slowestIndex = making.total;
            making.phase = next.done ? "end" : next.value;
            if (making.phase === "jag") {
              making.jag = { points: jagNote.points, px: Math.round(jagNote.px), ms: Math.round(jagNote.ms * 100) / 100 };
            }
            making.boost = { ms: Math.round(boostNote.ms * 100) / 100, calls: boostNote.calls };
          }
          if (now - last <= SLOW_MOST) {
            phaseSlow[making.after] = Math.max(phaseSlow[making.after], now - last);
          }
          last = now;
          const after = next.done ? 0 : PHASE_INDEX[next.value];
          making.after = after === undefined ? 0 : after;
          if (next.done || now - started + phaseSlow[making.after] >= budget) {
            break;
          }
          boostNote.ms = 0;
          boostNote.calls = 0;
          next = slices.next();
        }
        spent += performance.now() - started;
        if (next.done) {
          shape = next.value;
          shape!.makeMs = spent;
        }
        return shape;
      },
    };
    return making;
  }

  // how many forks each side makes in each generation (matrix_web_rain's boltForkPlan)
  static forkPlan(random: () => number) {
    const first = [2, 2];
    if (random() < 0.5) {
      first[random() < 0.5 ? 0 : 1]++;
    }
    const plan: number[][] = [];
    // (each side's own: its forks FORKS_MIN to FORKS_MAX, shared among the generations within
    // each one's least and most a side)
    const least = GENERATION_FORKS.map((r) => r[0]);
    const most = GENERATION_FORKS.map((r) => r[1]);
    for (let side = 0; side < 2; side++) {
      const forks = FORKS_MIN + Math.floor(random() * (FORKS_MAX - FORKS_MIN + 1));
      const left = forks - first[side];
      let second = Math.max(least[1], Math.min(most[1], Math.round(left * (0.15 + 0.15 * random()))));
      let third = Math.max(least[2], Math.min(most[2], Math.round((left - second) * (0.35 + 0.2 * random()))));
      let fourth = Math.max(least[3], Math.min(most[3], left - second - third));
      let over = left - second - third - fourth;
      const more = Math.max(0, Math.min(over, most[2] - third));
      third += more;
      over -= more;
      second += Math.max(0, Math.min(over, most[1] - second));
      // (over FORKS_MAX in all: the later generations less, down to their least)
      let excess = first[side] + second + third + fourth - FORKS_MAX;
      for (const take of [3, 2, 1]) {
        const counts = [first[side], second, third, fourth];
        const cut = Math.max(0, Math.min(excess, counts[take] - least[take]));
        if (take === 3) {
          fourth -= cut;
        } else if (take === 2) {
          third -= cut;
        } else {
          second -= cut;
        }
        excess -= cut;
      }
      plan.push([first[side], second, third, fourth]);
    }
    return plan;
  }

  // a strike's shape from its top (at the top of the view) to its foot (on the water), with the
  // lightning's random numbers, the main channel's size F and the camera's view (without one,
  // in the world alone: ROUTE_LEVELS halvings, nothing checked on a screen), made in slices: it
  // yields what it made ("routes", "sibling", "fork", and within each try "jag", "check" before
  // each chunk of its check on the screen, "try"), and returns the shape. Drawn again and again
  // until one keeps every rule (validating: "validate" within it, "attempt" after a shape that
  // does not), at most ATTEMPTS; each attempt from random numbers of its own (attemptRandom: the
  // strike's one draw and the attempt's number), so only one shape is alive at a time: a shape
  // that does not pass is given back at once, and past ATTEMPTS the one with the fewest findings
  // is drawn again (shape.fallback). shape.attempts: the shapes drawn; shape.findings: its
  // findings' count (0 but for a fallback)
  static *making(top: V3, foot: V3, random: () => number, F: number, view?: BoltView | null): Slices<MadeShape | null> {
    const base = Math.floor(random() * 4294967296);
    let bestAttempt = 1;
    let bestCount = Infinity;
    let current: MadeShape | null = null;
    const found: Finding[] = [];
    try {
      for (let attempt = 1; attempt <= ATTEMPTS + 1; attempt++) {
        const again = attempt > ATTEMPTS;
        current = yield* BoltShape.attempt(top, foot, attemptRandom(base, again ? bestAttempt : attempt), F, view);
        if (again) {
          const shape = current;
          current = null;
          shape.attempts = ATTEMPTS;
          shape.fallback = true;
          shape.findings = bestCount;
          return shape;
        }
        found.length = 0;
        yield* validating(current, view || null, found);
        const shape = current;
        current = null;
        if (found.length === 0) {
          shape.attempts = attempt;
          shape.fallback = false;
          shape.findings = 0;
          return shape;
        }
        if (found.length < bestCount) {
          bestCount = found.length;
          bestAttempt = attempt;
        }
        destroyShape(shape);
        if (!atOnce) {
          yield "attempt";
        }
      }
      return null;
    } finally {
      if (current) {
        destroyShape(current);
      }
    }
  }

  // one shape drawn (making's work, before its rules are checked)
  static *attempt(top: V3, foot: V3, random: () => number, F: number, view?: BoltView | null): Slices<MadeShape> {
    const bundle = takeBundle();
    const state: MakingState = { shape: null, temps: [], tempLines: [], done: false };
    try {
      return yield* BoltShape.makingBody(top, foot, random, F, view, bundle, state);
    } finally {
      giveBundle(bundle);
      // (ended before it was made: what it had made given back)
      if (!state.done) {
        for (const array of state.temps) {
          giveF64(array);
        }
        for (const line of state.tempLines) {
          giveLine(line);
        }
        if (state.shape) {
          destroyShape(state.shape);
        }
      }
    }
  }

  // (making's work, with its scratch and what it has made so far kept in state)
  static *makingBody(top: V3, foot: V3, random: () => number, F: number, view: BoltView | null | undefined, bundle: Bundle, state: MakingState): Slices<MadeShape> {
    // (whether to end the slice at this place: every YIELD_EVERY-th)
    let yieldPlaces = 0;
    const due = () => !atOnce && ++yieldPlaces % YIELD_EVERY === 0;
    const gap = GAP_F * F;
    const height = top[1];
    const near = bundle.near;
    const proj = bundle.proj;
    const maxPx = view ? PIECE_SHARE * view.height : Infinity;
    const focal = view ? view.focal() : 0;
    const part = MEET_LOW + (MEET_HIGH - MEET_LOW) * random();
    const straight = lerp(top, foot, part);
    const meet = straight.slice();
    const meetAcross = (random() - 0.5) * 2 * MEET_ACROSS * height;
    const meetDepth = (random() - 0.5) * 2 * MEET_DEPTH * height;
    // (the meeting point off the straight line by a share of its offsets; with a view, on the
    // screen as matrix_web_rain's: at its row part of the way down and across part of the way
    // from the top's place to the foot's, off it by its share of the strike's height there, at
    // its depth)
    let meetAt: ((f: number) => void) | null = null;
    const placeMeet = (f: number) => {
      meet[0] = straight[0] + f * meetAcross;
      meet[2] = straight[2] + f * meetDepth;
      if (meetAt) {
        meetAt(f);
      }
    };
    const water = [0, 1, 0, 0];
    let downPlanes: Float64Array;
    let upPlanes: Float64Array;
    let branchPlanes: Float64Array;
    if (view) {
      const c = Math.cos(view.pitch);
      const s = Math.sin(view.pitch);
      const eye = view.eyeHeight;
      // a row's plane through the eye (sign 1: n . p + w above 0 above the row on the screen)
      const rowPlane = (row: number, sign: number) => {
        const k = (view.height / 2 - row) / focal;
        return [0, sign * (c - k * s), sign * (s + k * c), -sign * eye * (c - k * s)];
      };
      view.project(top[0], top[1], top[2], proj);
      const topX = proj[0];
      const topRow = proj[1];
      const topAlong = proj[2];
      view.project(foot[0], foot[1], foot[2], proj);
      const footX = proj[0];
      const footRow = proj[1];
      const footAlong = proj[2];
      // (the meeting point's height: at its row, part of the way down, at its place across and
      // in depth)
      const k = (view.height / 2 - (topRow + part * (footRow - topRow))) / focal;
      // (on its row at its depth; where the row meets the water nearer than that, at least
      // 0.02 of the strike's height up, the point brought nearer along the row instead, so it
      // keeps its row)
      const lowest = 0.02 * height;
      meetAt = (f: number) => {
        meet[1] = eye - (meet[2] * (s + k * c)) / (c - k * s);
        if (meet[1] < lowest) {
          meet[2] = ((eye - lowest) * (c - k * s)) / (s + k * c);
          meet[1] = lowest;
        }
        const x = topX + part * (footX - topX) + ((f * meetAcross) / height) * (footRow - topRow);
        meet[0] = ((x - view.width / 2) * ((meet[1] - eye) * s - meet[2] * c)) / focal;
      };
      meetPlace(placeMeet, top, meet, foot, view, proj);
      view.project(meet[0], meet[1], meet[2], proj);
      const meetRow = proj[1];
      const below = rowPlane(topRow, -1);
      const ahead = [0, s, -c, -eye * s - 0.5 * Math.min(topAlong, footAlong)];
      downPlanes = bundle.downPlanes;
      downPlanes.set(water.concat(below, ahead, rowPlane(meetRow, 1)));
      upPlanes = bundle.upPlanes;
      upPlanes.set(water.concat(below, ahead, rowPlane(meetRow, -1)));
      branchPlanes = bundle.branchPlanes;
      branchPlanes.set(water.concat(below, ahead));
    } else {
      meetPlace(placeMeet, top, meet, foot, null, proj);
      downPlanes = upPlanes = branchPlanes = bundle.worldPlanes;
      downPlanes.set(water.concat([0, -1, 0, height]));
    }
    // (the way down turning at the meeting point at most KINK_MOST towards the foot, then the way
    // up at most that towards the way down's last piece: the main channel's turn there)
    const downRoute = jagged(top, meet, ROUGHNESS, ROUTE_LEVELS, MOST_LEVELS, maxPx, view, downPlanes, random, false, proj, COARSE_LEVELS, true, null, foot);
    const beforeMeet = Array.from(downRoute.subarray(downRoute.length - 6, downRoute.length - 3));
    // (the way up's first piece within KINK_MOST of the vertical, in the world and on the screen,
    // as if it came up from under the water: never down on the screen, so its piece can be
    // turned upright)
    const underFoot = [foot[0], foot[1] - 1, foot[2]];
    state.temps.push(downRoute);
    const halved = [
      downRoute,
      jagged(foot, meet, ROUGHNESS, ROUTE_LEVELS, MOST_LEVELS, maxPx, view, upPlanes, random, true, proj, COARSE_LEVELS, true, underFoot, beforeMeet),
    ];
    state.temps.push(halved[1]);
    const upStood = stoodUp;
    // (a piece still too long on the screen, by the foot's turn, cut straight)
    const routes = halved.map((r) => fine(r, r.length / 3, view, maxPx, proj, null));
    // (a foot whose first piece could not be turned upright in the line: a short upright piece
    // put before it)
    // (shape.foot: whether the foot stood up in the line, the stub's pieces, the first piece's
    // angle from the vertical in degrees before)
    const footMade: [boolean, number, number] = [upStood, 0, 0];
    if (!upStood) {
      const r1 = routes[1];
      footMade[2] = Math.round((Math.atan2(Math.hypot(r1[3] - r1[0], r1[5] - r1[2]), r1[4] - r1[1]) * 180) / Math.PI);
      const stub = footStub(routes[1], routes[1].length / 3, upPlanes, view, proj);
      footMade[1] = stubPieces;
      if (stub !== routes[1] && routes[1] !== halved[1]) {
        giveF64(routes[1]);
      }
      routes[1] = stub;
    }
    // (the way down, then the way up the other way round, without its meeting point again)
    const downCount = routes[0].length / 3;
    const upCount = routes[1].length / 3;
    const main = takeF64((downCount + upCount - 1) * 3);
    main.set(routes[0]);
    for (let i = upCount - 2, m = downCount * 3; i >= 0; i--, m += 3) {
      main[m] = routes[1][i * 3];
      main[m + 1] = routes[1][i * 3 + 1];
      main[m + 2] = routes[1][i * 3 + 2];
    }
    const down = halved[0];
    const up = halved[1];
    const chords = [len(sub(meet, top)), len(sub(meet, foot))];
    const shape: MadeShape = { F, meet, main: makeLine(main, { side: -1 }), lines: [], meetings: [meet], rejoins: 0, cut: 0, given: 0, noRoom: 0, tries: 0, spent: [0, 0, 0], short: [], foot: footMade, plan: null, depths: [], levels: [Math.log2(down.length / 3 - 1), Math.log2(up.length / 3 - 1)], destroyed: false, destroy: null };
    shape.destroy = () => destroyShape(shape);
    state.shape = shape;
    const lines = shape.lines;
    const routeLines = routes.map((r, side) => makeLine(r, { side }));
    // (the halvings no longer needed: each given back unless it is its route's own points, given
    // back with the route's line)
    state.temps.length = 0;
    for (let k = 0; k < 2; k++) {
      if (halved[k] !== routes[k]) {
        giveF64(halved[k]);
      }
    }
    state.tempLines.push(routeLines[0], routeLines[1]);
    // a line's places on the screen (x, y, and pixels a metre there), its box and its chunks'
    // boxes there (min x, y, max x, y)
    const seen = (line: BoltLine) => {
      if (!view || line.screen) {
        return line;
      }
      const n = line.count;
      line.screen = takeF64(n * 3);
      line.schunks = takeF64(4 * Math.max(1, Math.ceil((n - 1) / CHUNK)));
      line.sbox = takeF64(4);
      line.scum = takeF64(n);
      screenArrays(line);
      return line;
    };
    // a line's places on the screen (x, y, and pixels a metre there), the length along it there
    // to each point, its box and its chunks' boxes there (min x, y, max x, y), into its arrays
    // (only with a view, its arrays made)
    const screenArrays = (line: CheckedLine) => {
      const points = line.points;
      const n = line.count;
      const screen = line.screen!;
      let most = 0;
      for (let i = 0; i < n; i++) {
        view!.project(points[i * 3], points[i * 3 + 1], points[i * 3 + 2], proj);
        screen[i * 3] = proj[0];
        screen[i * 3 + 1] = proj[1];
        screen[i * 3 + 2] = focal / Math.max(proj[2], 1e-3);
        most = Math.max(most, screen[i * 3 + 2]);
      }
      const pieces = n - 1;
      const chunks = line.schunks!;
      const box = line.sbox!;
      box[0] = box[1] = Infinity;
      box[2] = box[3] = -Infinity;
      for (let k = 0; k * CHUNK < pieces; k++) {
        const o = k * 4;
        chunks[o] = chunks[o + 1] = Infinity;
        chunks[o + 2] = chunks[o + 3] = -Infinity;
        const last = Math.min(pieces, (k + 1) * CHUNK);
        for (let i = k * CHUNK; i <= last; i++) {
          chunks[o] = Math.min(chunks[o], screen[i * 3]);
          chunks[o + 1] = Math.min(chunks[o + 1], screen[i * 3 + 1]);
          chunks[o + 2] = Math.max(chunks[o + 2], screen[i * 3]);
          chunks[o + 3] = Math.max(chunks[o + 3], screen[i * 3 + 1]);
        }
        box[0] = Math.min(box[0], chunks[o]);
        box[1] = Math.min(box[1], chunks[o + 1]);
        box[2] = Math.max(box[2], chunks[o + 2]);
        box[3] = Math.max(box[3], chunks[o + 3]);
      }
      const along = line.scum!;
      along[0] = 0;
      for (let i = 1; i < n; i++) {
        along[i] = along[i - 1] + Math.hypot(screen[i * 3] - screen[i * 3 - 3], screen[i * 3 + 1] - screen[i * 3 - 2]);
      }
      line.smax = most;
    };
    // (a try's line, its arrays made once and grown when needed: a try's line kept is a copy;
    // and the straight cuts' buffer)
    const trial = bundle.trial;
    const fineHold = bundle.fineHold;
    // the trial made from n points (copied in), with its arrays on and off the screen
    const fillTrial = (pts: Float64Array, n: number) => {
      if (trial.cum.length < n) {
        const room = n * 2;
        fresh += 6;
        made += 6;
        trial.points = new Float64Array(room * 3);
        trial.cum = new Float64Array(room);
        trial.chunks = new Float64Array(6 * Math.ceil(room / CHUNK));
        trial.screen = new Float64Array(room * 3);
        trial.schunks = new Float64Array(4 * Math.ceil(room / CHUNK));
        trial.scum = new Float64Array(room);
      }
      trial.points.set(pts.subarray(0, n * 3));
      trial.count = n;
      lineArrays(trial.points, n, trial.cum, trial.box, trial.chunks);
      trial.length = trial.cum[n - 1];
      if (view) {
        screenArrays(trial);
      }
      return trial;
    };
    // the trial kept: a line of its own (its points copied, its arrays made)
    const own = (line: CheckedLine) => {
      const points = takeF64(line.count * 3);
      for (let i = 0; i < line.count * 3; i++) {
        points[i] = line.points[i];
      }
      return seen(makeLine(points, { side: line.side, generation: line.generation, route: false, size: line.size, parent: line.parent, at: line.at, depth: line.depth }));
    };
    // ---- the routes, each a chain of forks ----
    const siblings: { side: number; parent: BoltLine; generation: number; rest: number }[] = [];
    for (let side = 0; side < 2; side++) {
      const route = routeLines[side];
      const depth = 1 + Math.floor(random() * GENERATIONS);
      const cuts = [0.1 + 0.3 * random()];
      if (depth > 1) {
        const last = 0.8 + 0.15 * random();
        for (let c = 1; c < depth - 1; c++) {
          cuts.push(cuts[0] + 0.05 + (last - 0.1 - cuts[0]) * random());
        }
        cuts.sort((a, b) => a - b);
        cuts.push(last);
      }
      shape.depths.push(depth);
      let previous: BoltLine | null = null;
      for (let j = 0; j <= depth; j++) {
        const from = j ? cuts[j - 1] : 0;
        const to = j < depth ? cuts[j] : 1;
        const piece = seen(makeLine(slicePoints(route, from, to), {
          side, generation: j, route: true, routeFrom: from, routeTo: to, start: from, end: to,
          size: F / 2, parent: previous, at: 1, routeLength: route.length,
        }));
        lines.push(piece);
        if (previous) {
          siblings.push({ side, parent: previous, generation: j, rest: (1 - from) * chords[side] * OLD_WINDING });
        }
        previous = piece;
      }
    }
    const speed = [routeLines[0].length, routeLines[1].length];
    giveLine(routeLines[0]);
    giveLine(routeLines[1]);
    state.tempLines.length = 0;
    // ---- whether a line is clear of the others: { ok, line (cut short to where it may go), part } ----
    // (a look with no line kept is read at once and never kept: one object a making for them)
    // (a try cut short is read at once: one object a making for it, the line it may be cut to
    // (from) and how far; its cut line made only for the try kept as the best, in branch)
    const failed: Look = { ok: false, part: 0, line: null, from: null, atStart: false };
    const finish = (line: CheckedLine, part: number) => {
      const kept = Math.max(0, part - (2 * line.size) / line.length);
      failed.part = kept;
      failed.from = kept > (view ? VIEW_KEEP : 0) ? line : null;
      failed.atStart = false;
      return failed;
    };
    // (the lines near a line looked at, by their index: reused)
    let nearby = bundle.nearby;
    // (where two pieces touch on the screen: their squared distance, the parts on each; and, for
    // a check with the world's reach, the nearest squared distance within it: Infinity if none)
    const contact = bundle.contact;
    // the gap kept on the screen between two lines of widths wa and wb (px), past their half
    // widths: of the two halves GAP_PX; of a half their visible edges (EDGE_SHARE of each
    // width, at least EDGE_PX), then APART_SHARE of the wider's width, at least ZONE_SHARE of
    // the screen's height
    const halfGap = view ? ZONE_SHARE * view.height : 0;
    const gapOf = (same: boolean, wa: number, wb: number) => same ? Math.max(EDGE_SHARE * wa, EDGE_PX) + Math.max(EDGE_SHARE * wb, EDGE_PX) + Math.max(halfGap, APART_SHARE * Math.max(wa, wb)) : GAP_PX;
    // (a piece's reach against another line: the most they can touch at, and, of a half, the
    // most a contact in the world can be apart on the screen)
    const reachOut = bundle.reachOut;
    const pieceReach = (line: SeenPiece, i: number, other: BoltLine, same: boolean) => {
      const s = line.screen!;
      const scale = Math.max(s[i * 3 + 2], s[i * 3 + 5]);
      const wa = Math.max(1, line.size * scale);
      const wb = Math.max(1, (other.route ? F : F / 2) * other.smax);
      const most = (wa + wb) / 2 + gapOf(same, wa, wb);
      reachOut[0] = most;
      reachOut[1] = same ? Math.max(most, ((line.size + F / 2) / 2 + gap) * Math.max(scale, other.smax) + GAP_PX) : most;
    };
    // the first piece of chunk k of another line that piece i of a line touches on the screen
    // (their widths there, at least 1 px each, a route at the main channel's F, gapOf apart),
    // but within lineZone px of the line's start or otherZone px of the other's: its index (the
    // parts of the two pieces in contact[1], contact[2]), or -1; the nearest squared distance
    // within wide kept in contact[3]
    const touchChunk = (line: SeenPiece, i: number, other: BoltLine, k: number, lineZone: number, otherZone: number, same: boolean, most: number, wide: number) => {
      const s = line.screen!;
      const ax = s[i * 3];
      const ay = s[i * 3 + 1];
      const as = s[i * 3 + 2];
      const bx = s[i * 3 + 3];
      const by = s[i * 3 + 4];
      const bs = s[i * 3 + 5];
      const ch = other.schunks!;
      const q = k * 4;
      if (Math.max(ax, bx) + wide < ch[q] || Math.min(ax, bx) - wide > ch[q + 2]
        || Math.max(ay, by) + wide < ch[q + 1] || Math.min(ay, by) - wide > ch[q + 3]) {
        return -1;
      }
      const width = line.size;
      const o = other.screen!;
      const la = line.scum!;
      const oa = other.scum!;
      const last = Math.min(other.count - 1, (k + 1) * CHUNK);
      for (let j = k * CHUNK; j < last; j++) {
        segmentDistance2(ax, ay, bx, by, o[j * 3], o[j * 3 + 1], o[j * 3 + 3], o[j * 3 + 4], contact);
        if (contact[0] < wide * wide && contact[0] < contact[3]) {
          contact[3] = contact[0];
        }
        if (contact[0] >= most * most) {
          continue;
        }
        const wa = Math.max(1, width * (as + (bs - as) * contact[1]));
        const otherPart = (other.cum[j] + contact[2] * (other.cum[j + 1] - other.cum[j])) / other.length;
        const wb = Math.max(1, (other.route ? F : BoltShape.sizeAt(other, otherPart, F)) * (o[j * 3 + 2] + (o[j * 3 + 5] - o[j * 3 + 2]) * contact[2]));
        const limit = (wa + wb) / 2 + gapOf(same, wa, wb);
        if (contact[0] >= limit * limit
          || la[i] + contact[1] * (la[i + 1] - la[i]) < lineZone
          || oa[j] + contact[2] * (oa[j + 1] - oa[j]) < otherZone) {
          continue;
        }
        return j;
      }
      return -1;
    };
    // the first piece of another line that piece i of a line touches on the screen (touchChunk,
    // over its chunks), or -1
    const screenTouch = (line: SeenPiece, i: number, other: BoltLine, lineZone: number, otherZone: number, same: boolean) => {
      pieceReach(line, i, other, same);
      const most = reachOut[0];
      const wide = reachOut[1];
      contact[3] = Infinity;
      const s = line.screen!;
      const ob = other.sbox!;
      if (Math.max(s[i * 3], s[i * 3 + 3]) + wide < ob[0] || Math.min(s[i * 3], s[i * 3 + 3]) - wide > ob[2]
        || Math.max(s[i * 3 + 1], s[i * 3 + 4]) + wide < ob[1] || Math.min(s[i * 3 + 1], s[i * 3 + 4]) - wide > ob[3]) {
        return -1;
      }
      const chunks = Math.ceil((other.count - 1) / CHUNK);
      for (let k = 0; k < chunks; k++) {
        const j = touchChunk(line, i, other, k, lineZone, otherZone, same, most, wide);
        if (j >= 0) {
          return j;
        }
      }
      return -1;
    };
    // the length along a line from its fork where it may touch the lines there (a route's part:
    // from its start, at the leaders' size)
    const zoneOf = (line: BoltLine) => line.route ? 2 * F + 4 * gap : 2 * (line.forkWidth! + line.forkParentSize!) + 4 * gap;
    // the length from a line's end where it touches the line it rejoined: two lines crossing at
    // JOIN_ANGLE or more are within half their sizes added that far from the crossing
    const bandOf = (line: BoltLine, other: BoltLine) => (line.size + F / 2) / (2 * Math.sin((JOIN_ANGLE * Math.PI) / 180)) + (line.size + other.size) / 2;
    // whether a line, made bigger from a part of its length by a rejoin (to a generation's
    // size), would touch a line of its half there (but the joining one, and near forks and
    // rejoins' ends)
    // (its own scratch: it runs inside clear's loop, whose closest points it must not change)
    const nearBoost = bundle.nearBoost;
    const boostTouches = (other: BoltLine, at: number, generation: number, joining: BoltLine) => {
      const began = performance.now();
      const touches = boostCheck(other, at, generation, joining);
      boostNote.ms += performance.now() - began;
      boostNote.calls++;
      return touches;
    };
    const boostCheck = (other: BoltLine, at: number, generation: number, joining: BoltLine) => {
      const size = Math.max(BoltShape.sizeAt(other, at, F), (F / 2) * Math.pow(THIN, generation));
      const op = other.points;
      const ob = other.box;
      const from = at * other.length;
      for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        if (line === other || line === joining || line.side !== other.side) {
          continue;
        }
        const reach = (size + F / 2) / 2 + gap;
        const lb = line.box;
        if (lb[3] < ob[0] - reach || lb[0] > ob[3] + reach || lb[4] < ob[1] - reach || lb[1] > ob[4] + reach
          || lb[5] < ob[2] - reach || lb[2] > ob[5] + reach) {
          continue;
        }
        const lp = line.points;
        for (let j = 0; j + 1 < other.count; j++) {
          if (other.cum[j + 1] < from) {
            continue;
          }
          const o = j * 3;
          if (Math.max(op[o], op[o + 3]) < lb[0] - reach || Math.min(op[o], op[o + 3]) > lb[3] + reach
            || Math.max(op[o + 1], op[o + 4]) < lb[1] - reach || Math.min(op[o + 1], op[o + 4]) > lb[4] + reach
            || Math.max(op[o + 2], op[o + 5]) < lb[2] - reach || Math.min(op[o + 2], op[o + 5]) > lb[5] + reach) {
            continue;
          }
          // (the line's chunks near the piece, then their pieces)
          const lc = line.chunks;
          const loX = Math.min(op[o], op[o + 3]) - reach;
          const hiX = Math.max(op[o], op[o + 3]) + reach;
          const loY = Math.min(op[o + 1], op[o + 4]) - reach;
          const hiY = Math.max(op[o + 1], op[o + 4]) + reach;
          const loZ = Math.min(op[o + 2], op[o + 5]) - reach;
          const hiZ = Math.max(op[o + 2], op[o + 5]) + reach;
          for (let i = 0; i + 1 < line.count; i++) {
            if (i % CHUNK === 0) {
              const q = (i / CHUNK) * 6;
              if (hiX < lc[q] || loX > lc[q + 3] || hiY < lc[q + 1] || loY > lc[q + 4] || hiZ < lc[q + 2] || loZ > lc[q + 5]) {
                i += CHUNK - 1;
                continue;
              }
            }
            segmentDistance(op, j, lp, i, nearBoost);
            if (nearBoost[0] >= reach * reach) {
              continue;
            }
            const alongO = other.cum[j] + nearBoost[1] * (other.cum[j + 1] - other.cum[j]);
            const alongL = line.cum[i] + nearBoost[2] * (line.cum[i + 1] - line.cum[i]);
            const limit = (size + BoltShape.sizeAt(line, alongL / line.length, F)) / 2 + gap;
            if (alongO < from || nearBoost[0] >= limit * limit || alongL < zoneOf(line) || alongO < zoneOf(other)
              || (line.joinedInto && alongL > line.length - bandOf(line, line.joinedInto))) {
              continue;
            }
            return true;
          }
        }
      }
      // (on the screen: its bigger width there against the lines of its half, but near their
      // forks and a rejoin's end on it; a route is drawn at the main channel's F already)
      if (view && !other.route) {
        const os = other.screen!;
        const oa = other.scum!;
        // (the joining line too, last, but near its end on the other line)
        for (let n = 0; n <= lines.length; n++) {
          const line = n < lines.length ? lines[n] : joining;
          if (!line || !line.screen || line === other || (n < lines.length && line === joining) || line.side !== other.side) {
            continue;
          }
          const wideO = Math.max(1, size * other.smax);
          const wideL = Math.max(1, (line.route ? F : F / 2) * line.smax);
          const reach = (wideO + wideL) / 2 + gapOf(true, wideO, wideL);
          const lb = line.sbox!;
          const sb = other.sbox!;
          if (lb[2] < sb[0] - reach || lb[0] > sb[2] + reach || lb[3] < sb[1] - reach || lb[1] > sb[3] + reach) {
            continue;
          }
          const ls = line.screen;
          const la = line.scum!;
          const end = la[la.length - 1];
          const lc = line.schunks!;
          for (let j = 0; j + 1 < other.count; j++) {
            if (other.cum[j + 1] < from) {
              continue;
            }
            // (the piece's box on the screen against the line's, then its chunks')
            const loX = Math.min(os[j * 3], os[j * 3 + 3]) - reach;
            const hiX = Math.max(os[j * 3], os[j * 3 + 3]) + reach;
            const loY = Math.min(os[j * 3 + 1], os[j * 3 + 4]) - reach;
            const hiY = Math.max(os[j * 3 + 1], os[j * 3 + 4]) + reach;
            if (hiX < lb[0] || loX > lb[2] || hiY < lb[1] || loY > lb[3]) {
              continue;
            }
            for (let i = 0; i + 1 < line.count; i++) {
              if (i % CHUNK === 0) {
                const q = (i / CHUNK) * 4;
                if (hiX < lc[q] || loX > lc[q + 2] || hiY < lc[q + 1] || loY > lc[q + 3]) {
                  i += CHUNK - 1;
                  continue;
                }
              }
              segmentDistance2(os[j * 3], os[j * 3 + 1], os[j * 3 + 3], os[j * 3 + 4], ls[i * 3], ls[i * 3 + 1], ls[i * 3 + 3], ls[i * 3 + 4], nearBoost);
              if (nearBoost[0] >= reach * reach) {
                continue;
              }
              const alongO = other.cum[j] + nearBoost[1] * (other.cum[j + 1] - other.cum[j]);
              const scaleO = os[j * 3 + 2] + (os[j * 3 + 5] - os[j * 3 + 2]) * nearBoost[1];
              const scaleL = ls[i * 3 + 2] + (ls[i * 3 + 5] - ls[i * 3 + 2]) * nearBoost[2];
              const partL = (line.cum[i] + nearBoost[2] * (line.cum[i + 1] - line.cum[i])) / line.length;
              const wo = Math.max(1, size * scaleO);
              const wl = Math.max(1, (line.route ? F : BoltShape.sizeAt(line, partL, F)) * scaleL);
              const limit = (wo + wl) / 2 + gapOf(true, wo, wl);
              const atL = la[i] + nearBoost[2] * (la[i + 1] - la[i]);
              const atO = oa[j] + nearBoost[1] * (oa[j + 1] - oa[j]);
              // (two lines crossing at JOIN_ANGLE come within the limit that far from the crossing)
              const band = limit / Math.sin((JOIN_ANGLE * Math.PI) / 180);
              if (alongO < from || nearBoost[0] >= limit * limit || atL < (line.zonePx || 0) || atO < (other.zonePx || 0)
                || ((line.joinedInto === other || line === joining) && atL > end - band)) {
                continue;
              }
              return true;
            }
          }
        }
      }
      return false;
    };
    // a branch touching a line of its half at piece i (the other's piece j, at parts s and t of
    // the two, crossing at an angle): a rejoin, if it may be one (crossing at JOIN_ANGLE or more,
    // far enough from every meeting point, past the other's forks and rejoins, at most
    // REJOIN_DEPTH in a row, the other's bigger size touching nothing), else cut short before it
    // (a generator: it yields before the bigger size's check and before its moved end's, each a
    // slice of its own; its result the look)
    // whether a place is within JOIN_GAP F of a meeting point
    const nearMeeting = (x: number, y: number, z: number) => {
      const r2 = JOIN_GAP * F * JOIN_GAP * F;
      for (const m of shape.meetings) {
        const dx = m[0] - x;
        const dy = m[1] - y;
        const dz = m[2] - z;
        if (dx * dx + dy * dy + dz * dz < r2) {
          return true;
        }
      }
      return false;
    };
    // whether a line other than the two starts (its fork) or ends within JOIN_GAP F of a place
    const thirdNear = (x: number, y: number, z: number, one: CheckedLine, two: BoltLine) => {
      const r2 = JOIN_GAP * F * JOIN_GAP * F;
      for (const t of lines) {
        if (t === one || t === two || t.route) {
          continue;
        }
        const P = t.points;
        const e = (t.count - 1) * 3;
        let dx = P[e] - x;
        let dy = P[e + 1] - y;
        let dz = P[e + 2] - z;
        if (dx * dx + dy * dy + dz * dz < r2) {
          return true;
        }
        dx = P[0] - x;
        dy = P[1] - y;
        dz = P[2] - z;
        if (dx * dx + dy * dy + dz * dz < r2) {
          return true;
        }
      }
      return false;
    };
    // whether a rejoin's way on (the line ended on, past the point) is within JOIN_WAY of the
    // bigger one's way in (the smaller generation's; the line ended on when the same), over
    // JOIN_REACH_F F either side
    const wayOn = (line: CheckedLine, along: number, other: BoltLine, otherPart: number) => {
      if (otherPart >= 1 - 1e-9) {
        return true;
      }
      const reach = JOIN_REACH_F * F;
      pointInto(other, otherPart, joinAt);
      pointInto(other, Math.min(1, otherPart + reach / other.length), joinOn);
      if (line.generation < other.generation) {
        pointInto(line, Math.max(0, (along - reach) / line.length), joinIn);
      } else {
        pointInto(other, Math.max(0, otherPart - reach / other.length), joinIn);
      }
      const ax = joinAt[0] - joinIn[0];
      const ay = joinAt[1] - joinIn[1];
      const az = joinAt[2] - joinIn[2];
      const bx = joinOn[0] - joinAt[0];
      const by = joinOn[1] - joinAt[1];
      const bz = joinOn[2] - joinAt[2];
      const d = (ax * bx + ay * by + az * bz) / (Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz)) || 1);
      return d >= Math.cos((JOIN_WAY * Math.PI) / 180);
    };
    const rejoinOr = function* (line: CheckedLine, i: number, other: BoltLine, j: number, s: number, t: number, crossing: number, zone: number): Slices<Look> {
      const op = other.points;
      // (seen through a camera, crossing as much on the screen too: its approach seen)
      if (view && line.screen && other.screen) {
        const ls = line.screen;
        const os = other.screen;
        const ax = ls[i * 3 + 3] - ls[i * 3];
        const ay = ls[i * 3 + 4] - ls[i * 3 + 1];
        const bx = os[j * 3 + 3] - os[j * 3];
        const by = os[j * 3 + 4] - os[j * 3 + 1];
        const cosine = Math.abs(ax * bx + ay * by) / (Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by)) || 1);
        crossing = Math.min(crossing, (Math.acos(Math.min(1, cosine)) * 180) / Math.PI);
      }
      const along = line.cum[i] + s * (line.cum[i + 1] - line.cum[i]);
      const otherPart = (other.cum[j] + t * (other.cum[j + 1] - other.cum[j])) / other.length;
      // (from where it would meet: its point on the other line, which it ends on)
      const ox = op[j * 3] + (op[j * 3 + 3] - op[j * 3]) * t;
      const oy = op[j * 3 + 1] + (op[j * 3 + 4] - op[j * 3 + 1]) * t;
      const oz = op[j * 3 + 2] + (op[j * 3 + 5] - op[j * 3 + 2]) * t;
      let far = true;
      for (const m of shape.meetings) {
        const mx = m[0] - ox;
        const my = m[1] - oy;
        const mz = m[2] - oz;
        far = far && mx * mx + my * my + mz * mz >= JOIN_GAP * F * JOIN_GAP * F;
      }
      let later = false;
      for (const f of other.forks) {
        later = later || f > otherPart;
      }
      for (const b of other.boosts) {
        later = later || b.at > otherPart;
      }
      // (and before a line forking off it: a sibling at its end is not among its forks)
      for (let n = 0; n < lines.length && !later; n++) {
        later = lines[n].parent === other && !lines[n].route && lines[n].at > otherPart;
      }
      if (crossing < JOIN_ANGLE || !far || line.depth >= REJOIN_DEPTH || later) {
        return finish(line, line.cum[i] / line.length);
      }
      // (matrix_web_rain's: the way on grows once both have grown to the point, so the line
      // ended on reaches it no sooner than the branch arrives (their growth times); the way on
      // within JOIN_WAY of the bigger one's way in, over JOIN_REACH_F F either side; and never a
      // third line there: none starting or ending within JOIN_GAP F of it)
      const reaches = other.start + otherPart * (other.end - other.start);
      if (!wayOn(line, along, other, otherPart) || thirdNear(ox, oy, oz, line, other)) {
        return finish(line, line.cum[i] / line.length);
      }
      // (the branch cut there, its last point moved onto the other line: it ends on it)
      const part = along / line.length;
      const onOther = [ox, oy, oz];
      let kept = slicePoints(line, 0, part);
      kept[kept.length - 3] = ox;
      kept[kept.length - 2] = oy;
      kept[kept.length - 1] = oz;
      // (its turn into the moved end at most KINK_MOST, in the world and on the screen: the
      // points before the end dropped while the turn at the last of them is more)
      let count = kept.length / 3;
      while (count > 2 && !keepsTurns(kept, count - 3, count - 1, view, proj, turnSeen)) {
        kept[(count - 2) * 3] = ox;
        kept[(count - 2) * 3 + 1] = oy;
        kept[(count - 2) * 3 + 2] = oz;
        count--;
      }
      if (count * 3 < kept.length) {
        const shorter = takeF64(count * 3);
        for (let k = 0; k < count * 3; k++) {
          shorter[k] = kept[k];
        }
        giveF64(kept);
        // (the pieces joined into its last one cut straight to the screen's limit again)
        kept = fine(shorter, count, view, maxPx, proj, null);
        if (kept !== shorter) {
          giveF64(shorter);
        }
      }
      const joined = makeLine(kept, { side: line.side, generation: line.generation, route: line.route, size: line.size, parent: line.parent, at: line.at, depth: line.depth });
      // (its arrival as register will time it: from its fork, its whole length at its route's
      // speed; the line ended on reaching the point no sooner)
      const arrives = line.parent!.start + line.at * (line.parent!.end - line.parent!.start) + joined.length / speed[line.side];
      if (reaches < arrives - 1e-12) {
        giveLine(joined);
        return finish(line, line.cum[i] / line.length);
      }
      if (view) {
        seen(joined);
        joined.zonePx = zone;
      }
      // (the other's bigger size touching nothing, the joining line itself but at its end)
      if (due()) {
        yield "join";
      }
      if (boostTouches(other, otherPart, Math.max(Math.min(line.generation, other.generation) - 1, 0), joined)) {
        giveLine(joined);
        return finish(line, line.cum[i] / line.length);
      }
      // (seen through a camera, its last pieces, moved onto the other line, clear of every
      // other line on the screen)
      if (view) {
        if (due()) {
          yield "join end";
        }
        const n = joined.count - 1;
        for (let k = Math.max(0, n - 2); k < n; k++) {
          for (let m = 0; m < lines.length; m++) {
            const o = lines[m];
            if (o !== other && (o.side !== joined.side ? screenTouch(joined, k, o, 0, 0, false) : screenTouch(joined, k, o, zone, o.zonePx || 0, true)) >= 0) {
              giveLine(joined);
              return finish(line, line.cum[i] / line.length);
            }
          }
        }
      }
      return { ok: true, part, line: joined, rejoin: { other, at: otherPart, point: onOther, crossing } };
    };
    // (the most another line can touch a line or come near it at, on the screen)
    const wideOf = (line: CheckedLine, other: BoltLine) => {
      const same = other.side === line.side;
      const wa = Math.max(1, line.size * line.smax);
      const wb = Math.max(1, (other.route ? F : F / 2) * other.smax);
      const most = (wa + wb) / 2 + gapOf(same, wa, wb);
      return same ? Math.max(most, ((line.size + F / 2) / 2 + gap) * Math.max(line.smax, other.smax) + GAP_PX) : most;
    };
    // (the chunks of the lines near a chunk of a line: line index, chunk, ...; reused)
    let pairs = bundle.pairs;
    // whether a line is clear seen through a camera: each chunk of it against the chunks of the
    // lines near it on the screen, its pieces in order; for a line of its half, in the world too
    // where a piece comes as near on the screen as a contact in the world can
    // (a generator: it yields before each chunk of the line after the first, its result the look)
    // (the lines near the try's box, by their index: clearNear of them in nearby)
    let clearNear = 0;
    const clearPrepare = (line: CheckedLine) => {
      const sb = line.sbox!;
      if (nearby.length < lines.length) {
        nearby = bundle.nearby = new Int32Array(lines.length * 2);
      }
      clearNear = 0;
      for (let n = 0; n < lines.length; n++) {
        const ob = lines[n].sbox!;
        const wide = wideOf(line, lines[n]);
        if (sb[2] < ob[0] - wide || sb[0] > ob[2] + wide || sb[3] < ob[1] - wide || sb[1] > ob[3] + wide) {
          continue;
        }
        nearby[clearNear++] = n;
      }
    };
    // (a rejoin to try, rejoinOr's arguments but the zone: JOIN returned)
    const JOIN = {} as Look;
    const joinArgs: [number, BoltLine | null, number, number, number, number] = [0, null, 0, 0, 0, 0];
    made += 2;
    const askJoin = (i: number, other: BoltLine, j: number, s: number, t: number, crossing: number) => {
      joinArgs[0] = i;
      joinArgs[1] = other;
      joinArgs[2] = j;
      joinArgs[3] = s;
      joinArgs[4] = t;
      joinArgs[5] = crossing;
      return JOIN;
    };
    // chunk kc of a try against the lines near it (clearPrepare's): null while clear, else the
    // look (cut short), or JOIN (a rejoin to try: joinArgs)
    const clearChunk = (line: CheckedLine, kc: number, zone: number, clearFrom: number, parentBand: number): Look | null => {
      const lch = line.schunks!;
      const pieces = line.count - 1;
      const points = line.points;
      const count = clearNear;
      {
        const q = kc * 4;
        let np = 0;
        for (let c = 0; c < count; c++) {
          const other = lines[nearby[c]];
          const wide = wideOf(line, other);
          const ob = other.sbox!;
          if (lch[q + 2] < ob[0] - wide || lch[q] > ob[2] + wide || lch[q + 3] < ob[1] - wide || lch[q + 1] > ob[3] + wide) {
            continue;
          }
          const och = other.schunks!;
          const chunks = Math.ceil((other.count - 1) / CHUNK);
          for (let k = 0; k < chunks; k++) {
            const r = k * 4;
            if (lch[q + 2] < och[r] - wide || lch[q] > och[r + 2] + wide || lch[q + 3] < och[r + 1] - wide || lch[q + 1] > och[r + 3] + wide) {
              continue;
            }
            if (np + 2 > pairs.length) {
              const more = new Int32Array(pairs.length * 2);
              more.set(pairs);
              pairs = bundle.pairs = more;
            }
            pairs[np++] = nearby[c];
            pairs[np++] = k;
          }
        }
        const last = Math.min(pieces, (kc + 1) * CHUNK);
        for (let i = kc * CHUNK; i < last && np > 0; i++) {
          let p = 0;
          while (p < np) {
            const n = pairs[p];
            const other = lines[n];
            const same = other.side === line.side;
            pieceReach(line, i, other, same);
            const most = reachOut[0];
            const wide = reachOut[1];
            contact[3] = Infinity;
            let j = -1;
            while (p < np && pairs[p] === n) {
              if (j < 0) {
                j = touchChunk(line, i, other, pairs[p + 1], same ? zone : 0, same ? other.zonePx || 0 : 0, same, most, wide);
              }
              p += 2;
            }
            if (!same) {
              if (j >= 0) {
                // (touching at its first piece: no other way from the same fork can be clear)
                const cut = finish(line, line.cum[i] / line.length);
                cut.atStart = i === 0;
                return cut;
              }
              continue;
            }
            // (a line of its half: but near its fork and the other's, only as a rejoin, never
            // its parent; on the screen, then in the world)
            if (j < 0) {
              const look = contact[3] < Infinity ? touchInWorld(line, i, other, clearFrom, parentBand) : null;
              if (look) {
                return look;
              }
              continue;
            }
            if (other === line.parent) {
              return finish(line, line.cum[i] / line.length);
            }
            // (a rejoin only where they are close in the world too, not one passing behind)
            const A = points;
            const B = other.points;
            const a0 = i * 3;
            const b0 = j * 3;
            const cs = contact[1];
            const ct = contact[2];
            const gx = A[a0] + (A[a0 + 3] - A[a0]) * cs - B[b0] - (B[b0 + 3] - B[b0]) * ct;
            const gy = A[a0 + 1] + (A[a0 + 4] - A[a0 + 1]) * cs - B[b0 + 1] - (B[b0 + 4] - B[b0 + 1]) * ct;
            const gz = A[a0 + 2] + (A[a0 + 5] - A[a0 + 2]) * cs - B[b0 + 2] - (B[b0 + 5] - B[b0 + 2]) * ct;
            if (gx * gx + gy * gy + gz * gz > REJOIN_REACH_F * F * REJOIN_REACH_F * F) {
              return finish(line, line.cum[i] / line.length);
            }
            const ls = line.screen!;
            const os = other.screen!;
            const ax = ls[i * 3 + 3] - ls[i * 3];
            const ay = ls[i * 3 + 4] - ls[i * 3 + 1];
            const bx = os[j * 3 + 3] - os[j * 3];
            const by = os[j * 3 + 4] - os[j * 3 + 1];
            const cosine = Math.abs(ax * bx + ay * by) / (Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by)) || 1);
            return askJoin(i, other, j, cs, ct, (Math.acos(Math.min(1, cosine)) * 180) / Math.PI);
          }
        }
      }
      return null;
    };
    // (a try clear all along: one object a making for it, its line set each time)
    const passed: Look = { ok: true, part: 1, line: null, rejoin: null, atStart: false };
    // a line's piece i against a line of its half in the world: null while clear (or touching
    // only near its fork), else the line cut short, or { join }: the rejoin to try (rejoinOr's
    // arguments but the zone)
    const touchInWorld = (line: CheckedLine, i: number, other: BoltLine, clearFrom: number, parentBand: number) => {
      const width = line.size;
      const P = line.points;
      const a0 = i * 3;
      // (a line given a boost by a rejoin is up to F / 2 past it)
      const reach = (width + (other.boosts.length ? F / 2 : other.size)) / 2 + gap;
      const box = other.box;
      const loX = Math.min(P[a0], P[a0 + 3]);
      const hiX = Math.max(P[a0], P[a0 + 3]);
      const loY = Math.min(P[a0 + 1], P[a0 + 4]);
      const hiY = Math.max(P[a0 + 1], P[a0 + 4]);
      const loZ = Math.min(P[a0 + 2], P[a0 + 5]);
      const hiZ = Math.max(P[a0 + 2], P[a0 + 5]);
      if (hiX < box[0] - reach || loX > box[3] + reach || hiY < box[1] - reach || loY > box[4] + reach
        || hiZ < box[2] - reach || loZ > box[5] + reach) {
        return null;
      }
      const op = other.points;
      const ch = other.chunks;
      const pieces = other.count - 1;
      for (let k = 0; k * CHUNK < pieces; k++) {
        const q = k * 6;
        if (hiX < ch[q] - reach || loX > ch[q + 3] + reach || hiY < ch[q + 1] - reach || loY > ch[q + 4] + reach
          || hiZ < ch[q + 2] - reach || loZ > ch[q + 5] + reach) {
          continue;
        }
        const last = Math.min(pieces, (k + 1) * CHUNK);
        for (let j = k * CHUNK; j < last; j++) {
          segmentDistance(P, i, op, j, near);
          if (near[0] >= reach * reach) {
            continue;
          }
          const otherPart = (other.cum[j] + near[2] * (other.cum[j + 1] - other.cum[j])) / other.length;
          const limit = (width + BoltShape.sizeAt(other, otherPart, F)) / 2 + gap;
          if (near[0] >= limit * limit) {
            continue;
          }
          const along = line.cum[i] + near[1] * (line.cum[i + 1] - line.cum[i]);
          if (other === line.parent) {
            if (along < parentBand) {
              continue;
            }
            return finish(line, line.cum[i] / line.length);
          }
          if (along < clearFrom) {
            continue;
          }
          const ax = P[a0 + 3] - P[a0];
          const ay = P[a0 + 4] - P[a0 + 1];
          const az = P[a0 + 5] - P[a0 + 2];
          const bx = op[j * 3 + 3] - op[j * 3];
          const by = op[j * 3 + 4] - op[j * 3 + 1];
          const bz = op[j * 3 + 5] - op[j * 3 + 2];
          const cosine = Math.abs(ax * bx + ay * by + az * bz) / (Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz)) || 1);
          // (the rejoin it may make, made by the caller in slices: rejoinOr)
          return askJoin(i, other, j, near[1], near[2], (Math.acos(Math.min(1, cosine)) * 180) / Math.PI);
        }
      }
      return null;
    };
    // (without a view: in the world alone, at once)
    const clear = (line: CheckedLine, clearFrom: number, parentBand: number): Look => {
      const width = line.size;
      const P = line.points;
      const lb = line.box;
      if (nearby.length < lines.length) {
        nearby = bundle.nearby = new Int32Array(lines.length * 2);
      }
      // (the lines whose box comes near the line's)
      let count = 0;
      for (let n = 0; n < lines.length; n++) {
        const other = lines[n];
        const box = other.box;
        const reach = (width + F / 2) / 2 + gap;
        if (lb[3] < box[0] - reach || lb[0] > box[3] + reach || lb[4] < box[1] - reach || lb[1] > box[4] + reach
          || lb[5] < box[2] - reach || lb[2] > box[5] + reach) {
          continue;
        }
        nearby[count++] = n;
      }
      for (let i = 0; i + 1 < line.count; i++) {
        const a0 = i * 3;
        const loX = Math.min(P[a0], P[a0 + 3]);
        const hiX = Math.max(P[a0], P[a0 + 3]);
        const loY = Math.min(P[a0 + 1], P[a0 + 4]);
        const hiY = Math.max(P[a0 + 1], P[a0 + 4]);
        const loZ = Math.min(P[a0 + 2], P[a0 + 5]);
        const hiZ = Math.max(P[a0 + 2], P[a0 + 5]);
        for (let c = 0; c < count; c++) {
          const other = lines[nearby[c]];
          // (a line given a boost by a rejoin is up to F / 2 past it)
          const reach = (width + (other.boosts.length ? F / 2 : other.size)) / 2 + gap;
          const box = other.box;
          if (hiX < box[0] - reach || loX > box[3] + reach || hiY < box[1] - reach || loY > box[4] + reach
            || hiZ < box[2] - reach || loZ > box[5] + reach) {
            continue;
          }
          const op = other.points;
          const ch = other.chunks;
          const pieces = other.count - 1;
          for (let k = 0; k * CHUNK < pieces; k++) {
            const q = k * 6;
            if (hiX < ch[q] - reach || loX > ch[q + 3] + reach || hiY < ch[q + 1] - reach || loY > ch[q + 4] + reach
              || hiZ < ch[q + 2] - reach || loZ > ch[q + 5] + reach) {
              continue;
            }
            const last = Math.min(pieces, (k + 1) * CHUNK);
            for (let j = k * CHUNK; j < last; j++) {
              segmentDistance(P, i, op, j, near);
              // (the pre-check: farther than the most they can touch at)
              if (near[0] >= reach * reach) {
                continue;
              }
              const otherPart = (other.cum[j] + near[2] * (other.cum[j + 1] - other.cum[j])) / other.length;
              if (otherPart > other.ends) {
                continue;
              }
              const limit = (width + BoltShape.sizeAt(other, otherPart, F)) / 2 + gap;
              if (near[0] >= limit * limit) {
                continue;
              }
              const along = line.cum[i] + near[1] * (line.cum[i + 1] - line.cum[i]);
              if (other.side !== line.side) {
                return finish(line, line.cum[i] / line.length);
              }
              if (other === line.parent) {
                if (along < parentBand) {
                  continue;
                }
                return finish(line, line.cum[i] / line.length);
              }
              if (along < clearFrom) {
                continue;
              }
              // a rejoin, if it may be one
              const ax = P[a0 + 3] - P[a0];
              const ay = P[a0 + 4] - P[a0 + 1];
              const az = P[a0 + 5] - P[a0 + 2];
              const bx = op[j * 3 + 3] - op[j * 3];
              const by = op[j * 3 + 4] - op[j * 3 + 1];
              const bz = op[j * 3 + 5] - op[j * 3 + 2];
              const cosine = Math.abs(ax * bx + ay * by + az * bz) / (Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz)) || 1);
              return runAll(rejoinOr(line, i, other, j, near[1], near[2], (Math.acos(Math.min(1, cosine)) * 180) / Math.PI, 0));
            }
          }
        }
      }
      return { ok: true, part: 1, line };
    };
    // (a straight line on the screen, made once: a try's look before it is made)
    const probe = bundle.probe;
    // whether a branch's straight line from a to b touches the other half on the screen, or its
    // parent past its fork's room
    // (only with a view)
    const probeTouches = (a: V3, b: V3, width: number, parent: BoltLine, side: number, zoneFull: number) => {
      const sc = probe.screen;
      view!.project(a[0], a[1], a[2], proj);
      sc[0] = proj[0];
      sc[1] = proj[1];
      sc[2] = focal / Math.max(proj[2], 1e-3);
      view!.project(b[0], b[1], b[2], proj);
      sc[3] = proj[0];
      sc[4] = proj[1];
      sc[5] = focal / Math.max(proj[2], 1e-3);
      probe.scum[1] = Math.hypot(sc[3] - sc[0], sc[4] - sc[1]);
      probe.size = width;
      const zone = Math.min(0.5 * probe.scum[1], zoneFull);
      for (let n = 0; n < lines.length; n++) {
        const other = lines[n];
        if ((other.side !== side && screenTouch(probe, 0, other, 0, 0, false) >= 0) || (other === parent && screenTouch(probe, 0, other, zone, 0, true) >= 0)) {
          return true;
        }
      }
      return false;
    };
    // a branch's look kept: its fork's widths and room on its line
    const keepFork = (look: Look | null, width: number, parentSize: number, zoneFull: number) => {
      if (look && look.line) {
        look.line.forkWidth = width;
        look.line.forkParentSize = parentSize;
        look.line.zonePx = zoneFull;
      }
      return look;
    };
    // (the branches' path over their straight line so far)
    let winding = FIRST_WINDING;
    // (a branch's place, way and a try's vectors: one branch is made at a time)
    const branchStart = bundle.branchStart;
    const branchWay = bundle.branchWay;
    const branchAxis = bundle.branchAxis;
    const branchDir = bundle.branchDir;
    const branchWay3 = bundle.branchWay3;
    const branchEnd = bundle.branchEnd;
    // ---- a branch off a line at a part of its length, in tries; null when none could be made ----
    // (a generator: it yields before each try after the first, its result the branch's look)
    const branch = function* (parent: BoltLine, at: number, generation: number, length: number, tries: number): Slices<Look | null> {
      const side = parent.side;
      const way = side === 0 ? -1 : 1;
      const start = branchStart;
      pointInto(parent, at, start);
      const d = wayInto(parent, at, branchWay, FORK_WAY);
      const parentSize = BoltShape.sizeAt(parent, at, F);
      const width = parentSize * THIN;
      const clearFrom = Math.min(0.5 * length, 2 * (width + parentSize) + 4 * gap);
      // (near its parent only as a departure at JOIN_ANGLE or more would be: its first pieces
      // turning off it)
      const parentBand = Math.min(clearFrom, ((width + parentSize) / 2 + gap) / Math.sin((JOIN_ANGLE * Math.PI) / 180));
      // (on the screen: where it may touch the lines at its fork, matrix_web_rain's clearFrom:
      // twice its and its parent's widths there, a route's at F, and ZONE_SHARE of the height)
      let zoneFull = 0;
      if (view) {
        view.project(start[0], start[1], start[2], proj);
        const scale0 = focal / Math.max(proj[2], 1e-3);
        zoneFull = 2 * (Math.max(1, width * scale0) + Math.max(1, (parent.route ? F : parentSize) * scale0)) + ZONE_SHARE * view.height;
      }
      let best: Look | null = null;
      // (the generator: one object a branch)
      made++;
      // (a try's vectors: made once a making, filled each try)
      const axis = branchAxis;
      const dir = branchDir;
      const way3 = branchWay3;
      const end = branchEnd;
      for (let t = 0; t < tries; t++) {
        shape.tries++;
        shape.spent[stage]++;
        if (t > 0) {
          if (due()) {
            yield "try";
          }
        }
        const tried = performance.now();
        const tryWinding = winding;
        // (seen through a camera at most 50 degrees, as matrix_web_rain's first tries; without,
        // up to 80 in the later tries)
        const widest = !view && t >= tries / 2 ? 80 : 50;
        const angle = ((20 + (widest - 20) * random()) * Math.PI) / 180;
        // (round the line of sight, leaning FORK_DEPTH out of it: the turn seen on the screen)
        acrossInto(d, random, axis);
        if (view) {
          const sx = start[0];
          const sy = start[1] - view.eyeHeight;
          const sz = start[2];
          const on = sx * d[0] + sy * d[1] + sz * d[2];
          const qx = sx - on * d[0];
          const qy = sy - on * d[1];
          const qz = sz - on * d[2];
          const ql = 1 / (Math.sqrt(qx * qx + qy * qy + qz * qz) || 1);
          const lx = qx * ql + axis[0] * FORK_DEPTH;
          const ly = qy * ql + axis[1] * FORK_DEPTH;
          const lz = qz * ql + axis[2] * FORK_DEPTH;
          const lon = lx * d[0] + ly * d[1] + lz * d[2];
          const ax = lx - d[0] * lon;
          const ay = ly - d[1] * lon;
          const az = lz - d[2] * lon;
          const al = 1 / (Math.sqrt(ax * ax + ay * ay + az * az) || 1);
          axis[0] = ax * al;
          axis[1] = ay * al;
          axis[2] = az * al;
        }
        turnInto(d, axis, angle, dir);
        if (dir[1] * way < 0.2) {
          turnInto(d, axis, -angle, dir);
        }
        if (dir[1] * way < 0.2) {
          continue;
        }
        // (cut short to stay inside the view's limits)
        way3[0] = dir[0] * length;
        way3[1] = dir[1] * length;
        way3[2] = dir[2] * length;
        const reach = within(branchPlanes, start, way3);
        if (reach < 0.3) {
          continue;
        }
        // (its straight line shorter by the branches' winding, so its path is about its length)
        const l = length * reach;
        const chord = l / tryWinding;
        end[0] = start[0] + dir[0] * chord;
        end[1] = start[1] + dir[1] * chord;
        end[2] = start[2] + dir[2] * chord;
        // (its straight line first, on the screen: touching the other half, or its parent past
        // its fork's room, the try is given up before it is made)
        if (view && probeTouches(start, end, width, parent, side, zoneFull)) {
          continue;
        }
        // (jagged as the routes: their roughness and halvings, until every piece is at most
        // PIECE_SHARE of the screen's height)
        const raw = jagged(start, end, ROUGHNESS, BRANCH_LEAST, MOST_LEVELS, maxPx, view, branchPlanes, random, false, proj, COARSE_LEVELS, false);
        const rawCount = jaggedCount;
        let path = 0;
        for (let i = 1; i < rawCount; i++) {
          const dx = raw[i * 3] - raw[i * 3 - 3];
          const dy = raw[i * 3 + 1] - raw[i * 3 - 2];
          const dz = raw[i * 3 + 2] - raw[i * 3 - 1];
          path += Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        winding = 0.8 * winding + 0.2 * (path / chord);
        // (not shrunk to its length when its path comes out longer: shrunk towards its start, a
        // homothety in the world, its turns changed on the screen, past the kink limit near the
        // eye; its straight line follows the branches' winding instead)
        const points = fine(raw, rawCount, view, maxPx, proj, fineHold);
        const n = fineCount;
        trial.side = side;
        trial.generation = generation;
        trial.size = width;
        trial.parent = parent;
        trial.at = at;
        trial.depth = parent.depth;
        const candidate = fillTrial(points, n);
        jagNote.points = n;
        jagNote.px = view ? candidate.scum![n - 1] : 0;
        jagNote.ms = performance.now() - tried;
        if (due()) {
          yield "jag";
        }
        let look: Look | null = null;
        if (view) {
          const zone = Math.min(0.5 * candidate.scum![n - 1], zoneFull);
          clearPrepare(candidate);
          for (let kc = 0; kc * CHUNK < candidate.count - 1 && !look; kc++) {
            if (kc > 0 && due()) {
              yield "check";
            }
            const r = clearChunk(candidate, kc, zone, clearFrom, parentBand);
            look = r === JOIN ? yield* rejoinOr(candidate, joinArgs[0], joinArgs[1]!, joinArgs[2], joinArgs[3], joinArgs[4], joinArgs[5], zone) : r;
          }
          if (!look) {
            passed.line = candidate;
            look = passed;
          }
        } else {
          look = clear(candidate, clearFrom, parentBand);
        }
        // (never a third line at a join: a line, but a rejoin's, ending within JOIN_GAP F of a
        // meeting point not kept)
        if (look.ok && !look.rejoin) {
          const P = look.line!.points;
          const e = (look.line!.count - 1) * 3;
          if (nearMeeting(P[e], P[e + 1], P[e + 2])) {
            if (look.line !== trial) {
              giveLine(look.line as BoltLine);
            }
            look = failed;
            failed.part = 0;
            failed.from = null;
            failed.atStart = false;
          }
        }
        if (look.ok) {
          if (look.line === trial) {
            look.line = own(trial);
          }
          if (best) {
            giveLine(best.line as BoltLine);
          }
          return keepFork(look, width, parentSize, zoneFull);
        }
        // (a try cut short kept as the best: its cut line made now, from the try still there;
        // not one ending near a meeting point)
        if (look.from && look.part >= (view ? VIEW_KEEP : 0.4) && (!best || look.part > best.part)) {
          pointInto(look.from, look.part, nearPlace);
          if (!nearMeeting(nearPlace[0], nearPlace[1], nearPlace[2])) {
            if (best) {
              giveLine(best.line as BoltLine);
            }
            made++;
            best = { ok: false, part: look.part, line: cutLine(look.from, look.part), atStart: false };
          }
        }
        if (look.atStart) {
          break;
        }
      }
      return keepFork(best, width, parentSize, zoneFull);
    };
    // ---- a branch made: kept, its fork on its parent, its timing ----
    // (its line a line of its own: own's, a rejoin's or a try cut short)
    const register = (look: Look) => {
      const line = seen(look.line as BoltLine);
      const parent = line.parent!;
      const forkTime = parent.start + line.at * (parent.end - parent.start);
      line.start = forkTime;
      line.end = forkTime + line.length / speed[line.side];
      if (line.at < 1) {
        parent.forks.push(line.at);
        parent.forks.sort((a: number, b: number) => a - b);
      }
      if (look.rejoin) {
        const r = look.rejoin;
        r.other.boosts.push({ at: r.at, generation: Math.max(Math.min(line.generation, r.other.generation) - 1, 0) });
        shape.meetings.push(r.point);
        line.joinedInto = r.other;
        line.joinedAt = r.at;
        line.crossing = r.crossing;
        shape.rejoins++;
      }
      if (!look.ok) {
        shape.cut++;
        line.cutShort = true;
      }
      lines.push(line);
      return line;
    };
    if (due()) {
      yield "routes";
    }
    // (the stage the tries are spent in: 0 the generations' least, 1 the plan's forks past it,
    // 2 a side under FORKS_MIN; the siblings count as the least's)
    let stage = 0;
    // ---- the routes' siblings ----
    for (const s of siblings) {
      const look = yield* branch(s.parent, 1, s.generation, s.rest * (0.6 + 0.5 * random()), view ? VIEW_TRIES : TRIES);
      if (look && look.line) {
        register(look);
      } else {
        shape.given++;
      }
      if (due()) {
        yield "sibling";
      }
    }
    // ---- the other forks, generation by generation ----
    const plan = BoltShape.forkPlan(random);
    shape.plan = plan;
    // where a line can fork for a branch of a generation (matrix_web_rain's boltForkWindow)
    // (loose: 0 the plan's windows, 1 looser ones, 2 anywhere along the line, its growth and its
    // forks before left aside: the top-ups' last way to reach a generation's least)
    // (the window into windowSpan: whether there is one)
    const windowSpan = new Float64Array(2);
    made++;
    const windowOf = (line: BoltLine, generation: number, loose: number) => {
      if (line.size * Math.pow(THIN, line.forks.length + 1) < LEAST_SIZE_F * F) {
        return false;
      }
      if (loose === 2) {
        windowSpan[0] = 0.03;
        windowSpan[1] = Math.min(0.97, line.ends);
        return windowSpan[1] > windowSpan[0];
      }
      const latest = loose ? 0.95 : 0.85 - 0.15 * (GENERATIONS - generation);
      const between = loose ? 0.01 : 0.03;
      const from = Math.max(0.03, line.forks.length ? line.forks[line.forks.length - 1] + between : 0);
      const to = Math.min(loose ? 0.97 : 0.9, line.ends, (latest - line.start) / (line.end - line.start));
      windowSpan[0] = from;
      windowSpan[1] = to;
      return to > from;
    };
    // a fork's place for a generation on a side, into picked (line) and pickedAt: whether one
    let picked: BoltLine | null = null;
    let pickedAt = 0;
    const pick = (side: number, generation: number, loose: number) => {
      let total = 0;
      for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        if (line.side === side && line.generation === generation - 1 && windowOf(line, generation, loose)) {
          total += (windowSpan[1] - windowSpan[0]) * line.length;
        }
      }
      let at = random() * total;
      for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        if (line.side === side && line.generation === generation - 1 && windowOf(line, generation, loose)) {
          const span = (windowSpan[1] - windowSpan[0]) * line.length;
          if (at <= span) {
            picked = line;
            pickedAt = windowSpan[0] + at / line.length;
            return true;
          }
          at -= span;
        }
      }
      return false;
    };
    const count = (side: number, generation: number) => {
      let n = 0;
      for (let k = 0; k < lines.length; k++) {
        n += lines[k].side === side && lines[k].generation === generation ? 1 : 0;
      }
      return n;
    };
    const forks = (side: number) => {
      let n = 0;
      for (let k = 0; k < lines.length; k++) {
        n += lines[k].side === side && lines[k].generation >= 1 ? 1 : 0;
      }
      return n;
    };
    // (seen through a camera, a fork whose branch touches is tried at other places, FORK_PLACES
    // in all, the tries shared among them; a fork none of them clears is given up)
    // (a generator, as branch)
    const fork = function* (side: number, generation: number, loose: number) {
      // (in the top-ups, loose: twice the places, the tries shared among them as many each)
      const places = view ? (loose ? 2 * FORK_PLACES : FORK_PLACES) : loose === 2 ? FORK_PLACES : 1;
      for (let place = 0; place < places; place++) {
        // (each place after the first a slice of its own)
        if (place > 0) {
          if (due()) {
            yield "place";
          }
        }
        if (!pick(side, generation, loose)) {
          shape.noRoom++;
          return false;
        }
        const parent = picked!;
        const at = pickedAt;
        // (never a third line at a join: no fork within JOIN_GAP F of a meeting point)
        pointInto(parent, at, nearPlace);
        if (nearMeeting(nearPlace[0], nearPlace[1], nearPlace[2])) {
          continue;
        }
        // (off a route 0.6-1.1 x the rest of the route, off a branch 0.3-0.65 x its line: matrix_web_rain's)
        const rest = (1 - parent.routeFrom - at * (parent.routeTo - parent.routeFrom)) * chords[side] * OLD_WINDING;
        const length = (parent.route ? rest * (0.6 + 0.5 * random()) : parent.length * (0.3 + 0.35 * random())) * (loose === 2 ? ANYWHERE_LENGTH : 1);
        const look = yield* branch(parent, at, generation, length, Math.ceil((view ? VIEW_TRIES : TRIES) / (view ? FORK_PLACES : 1)));
        if (look && look.line) {
          register(look);
          return true;
        }
      }
      shape.given++;
      return false;
    };
    // (first each side's least of each generation, the generations in turn: each its own share
    // of the forks tried, LEAST_FORKS, the plan's windows first, then looser ones, then anywhere
    // along a parent; then the plan's forks past the least, within TOP_UP_TRIES tries; then a
    // side under FORKS_MIN. A least not reached is noted (shape.short) with its tries)
    for (let generation = 1; generation <= GENERATIONS; generation++) {
      for (let side = 0; side < 2; side++) {
        const least = GENERATION_FORKS[generation - 1][0];
        let k = 0;
        for (; k < LEAST_FORKS && count(side, generation) < least && forks(side) < FORKS_MAX; k++) {
          stage = 0;
          yield* fork(side, generation, k < LEAST_PLAN ? 0 : k < LEAST_PLAN + LEAST_LOOSE ? 1 : 2);
          if (due()) {
            yield "fork";
          }
        }
        if (count(side, generation) < least) {
          shape.short.push([side, generation, count(side, generation), k]);
        }
      }
    }
    for (let generation = 1; generation <= GENERATIONS; generation++) {
      for (let side = 0; side < 2; side++) {
        const want = plan[side][generation - 1] - count(side, generation);
        for (let k = 0; k < want && shape.spent[1] < TOP_UP_TRIES && forks(side) < FORKS_MAX; k++) {
          stage = 1;
          yield* fork(side, generation, 0);
          if (due()) {
            yield "fork";
          }
        }
        for (let tries = 0; tries < 10 && shape.spent[1] < TOP_UP_TRIES && count(side, generation) < plan[side][generation - 1] && forks(side) < FORKS_MAX; tries++) {
          stage = 1;
          yield* fork(side, generation, 1);
          if (due()) {
            yield "fork";
          }
        }
      }
    }
    for (let side = 0; side < 2; side++) {
      for (let tries = 0; tries < MIN_TRIES && shape.spent[2] < TOP_UP_TRIES && forks(side) < FORKS_MIN; tries++) {
        const generation = 1 + (tries % GENERATIONS);
        if (count(side, generation) < GENERATION_FORKS[generation - 1][1]) {
          stage = 2;
          yield* fork(side, generation, 1);
          if (due()) {
            yield "fork";
          }
        }
      }
    }
    // ---- sizes made again, now every fork and rejoin is known (parents before children) ----
    for (const line of lines) {
      if (line.parent) {
        line.size = BoltShape.sizeAt(line.parent, line.at, F) * THIN;
      }
    }
    state.done = true;
    return shape;
  }
}

BoltShape.THIN = THIN;
// every rule a shape breaks (validating's findings), with the camera's view (none: the world's
// rules only); an empty list when it keeps them all
BoltShape.check = (shape, view) => {
  const out: Finding[] = [];
  const outer = atOnce;
  atOnce = true;
  try {
    const steps = validating(shape, view || null, out);
    while (!steps.next().done) {
      // (made at once: it never yields)
    }
  } finally {
    atOnce = outer;
  }
  return out;
};
BoltShape.ATTEMPTS = ATTEMPTS;
if (M.TEST) {
  // (the tests: one shape drawn at once, its rules not checked: what the maker's own rules make)
  BoltShape.makeAttempt = (top, foot, random, F, view) => {
    const started = performance.now();
    const outer = atOnce;
    atOnce = true;
    try {
      const steps = BoltShape.attempt(top, foot, random, F, view);
      let next = steps.next();
      while (!next.done) {
        next = steps.next();
      }
      next.value.attempts = 1;
      next.value.fallback = false;
      next.value.makeMs = performance.now() - started;
      return next.value;
    } finally {
      atOnce = outer;
    }
  };
}
BoltShape.GAP_F = GAP_F;
BoltShape.JOIN_ANGLE = JOIN_ANGLE;
BoltShape.JOIN_GAP = JOIN_GAP;
BoltShape.GENERATIONS = GENERATIONS;
BoltShape.GENERATION_FORKS = GENERATION_FORKS;
BoltShape.FORKS_MIN = FORKS_MIN;
BoltShape.FORKS_MAX = FORKS_MAX;
BoltShape.PIECE_SHARE = PIECE_SHARE;
BoltShape.APART_SHARE = APART_SHARE;
BoltShape.EDGE_SHARE = EDGE_SHARE;
BoltShape.EDGE_PX = EDGE_PX;
// (the objects the shapes have made so far, counted at their sites: an estimate)
BoltShape.made = () => made;
// ---- a shape's flat form: one Float64Array (from the pools), to be transferred to and from a
// worker ----
// (its head: the version, its floats, F, its lines (the main channel first), 0 (once its light
// points), its meeting points, its counts, its routes' depths and levels, its time, its meeting point,
// its fork plan, its tries (all, by stage), its foot (stood up, stub pieces, angle), its
// leasts not reached, and its attempts, whether a fallback and its findings; then each line's record, LINE_FLOATS each; then each line's points, lengths
// along it, forks and boosts (at, generation); then the meeting points)
const FLAT_VERSION = 2;
const HEAD_FLOATS = 37;
const LINE_FLOATS = 25;
// (undefined kept as NaN)
const keep = (v: number | null | undefined) => (v === undefined || v === null ? NaN : +v);
const back = (v: number) => (Number.isNaN(v) ? undefined : v);
// (alloc(n): a Float64Array of n floats for it, by default from the pools)
BoltShape.toFlat = (shape, alloc = takeF64) => {
  const all = [shape.main];
  for (const line of shape.lines) {
    all.push(line);
  }
  let floats = HEAD_FLOATS + LINE_FLOATS * all.length + 3 * shape.meetings.length;
  for (let i = 0; i < all.length; i++) {
    all[i].flatIndex = i;
    floats += 4 * all[i].count + all[i].forks.length + 2 * all[i].boosts.length;
  }
  const nums = alloc(floats);
  const plan = shape.plan;
  const head = [FLAT_VERSION, floats, shape.F, all.length, 0, shape.meetings.length, shape.rejoins, shape.cut, shape.given, shape.noRoom,
    keep(shape.depths[0]), keep(shape.depths[1]), keep(shape.levels[0]), keep(shape.levels[1]), keep(shape.makeMs), shape.meet[0], shape.meet[1], shape.meet[2]];
  for (let k = 0; k < head.length; k++) {
    nums[k] = head[k];
  }
  for (let k = 0; k < 8; k++) {
    nums[18 + k] = plan ? keep(plan[k >> 2][k & 3]) : NaN;
  }
  const foot = shape.foot || [true, 0, 0];
  const spent = shape.spent || [0, 0, 0];
  const tail = [keep(shape.tries), spent[0], spent[1], spent[2], foot[0] ? 1 : 0, foot[1], foot[2], shape.short ? shape.short.length : 0];
  for (let k = 0; k < tail.length; k++) {
    nums[26 + k] = tail[k];
  }
  nums[34] = keep(shape.attempts);
  nums[35] = shape.fallback ? 1 : 0;
  nums[36] = keep(shape.findings);
  let data = HEAD_FLOATS + LINE_FLOATS * all.length;
  for (let i = 0; i < all.length; i++) {
    const l = all[i];
    const o = HEAD_FLOATS + LINE_FLOATS * i;
    const record = [l.count, data, l.length, l.side, l.generation, l.route ? 1 : 0, keep(l.routeFrom), keep(l.routeTo), keep(l.start), keep(l.end), keep(l.ends),
      keep(l.depth), keep(l.size), l.parent ? l.parent.flatIndex : -1, keep(l.at), keep(l.routeLength), keep(l.forkWidth), keep(l.forkParentSize), keep(l.zonePx),
      l.joinedInto ? l.joinedInto.flatIndex : -1, keep(l.joinedAt), keep(l.crossing), l.cutShort ? 1 : 0, l.forks.length, l.boosts.length];
    for (let k = 0; k < LINE_FLOATS; k++) {
      nums[o + k] = record[k];
    }
    for (let k = 0; k < 3 * l.count; k++) {
      nums[data++] = l.points[k];
    }
    for (let k = 0; k < l.count; k++) {
      nums[data++] = l.cum[k];
    }
    for (const f of l.forks) {
      nums[data++] = f;
    }
    for (const b of l.boosts) {
      nums[data++] = b.at;
      nums[data++] = b.generation;
    }
  }
  for (const p of shape.meetings) {
    nums[data++] = p[0];
    nums[data++] = p[1];
    nums[data++] = p[2];
  }
  for (const l of all) {
    l.flatIndex = -1;
  }
  return { nums, floats, transfer: nums.buffer instanceof ArrayBuffer ? [nums.buffer] : [] };
};
// a shape from its flat form (nums: its Float64Array, or the whole buffer it came in): its lines'
// points and lengths views of it; what Bolt and Lightning read (no boxes or screen arrays)
BoltShape.fromFlat = (flat) => {
  const nums = flat.nums || new Float64Array(flat.buffer);
  if (nums[0] !== FLAT_VERSION) {
    throw new Error("BoltShape.fromFlat: not a shape's flat form");
  }
  const n = nums[3];
  const lines: ShapeLine[] = [];
  for (let i = 0; i < n; i++) {
    const o = HEAD_FLOATS + LINE_FLOATS * i;
    const count = nums[o];
    let data = nums[o + 1];
    // (parent and joinedInto: the lines' indices, made the lines below; a made line's numbers are
    // never undefined: routeFrom ... routeLength cast)
    const line: ShapeLine = {
      points: nums.subarray(data, data + 3 * count), count, cum: nums.subarray(data + 3 * count, data + 4 * count), length: nums[o + 2],
      side: nums[o + 3], generation: nums[o + 4], route: nums[o + 5] === 1, routeFrom: back(nums[o + 6]) as number, routeTo: back(nums[o + 7]) as number,
      start: back(nums[o + 8]) as number, end: back(nums[o + 9]) as number, ends: back(nums[o + 10]) as number, depth: back(nums[o + 11]) as number, size: back(nums[o + 12]) as number,
      parent: nums[o + 13] as unknown as ShapeLine | null, at: back(nums[o + 14]) as number, routeLength: back(nums[o + 15]) as number, forkWidth: back(nums[o + 16]),
      forkParentSize: back(nums[o + 17]), zonePx: back(nums[o + 18]), joinedInto: nums[o + 19] as unknown as ShapeLine | undefined, joinedAt: back(nums[o + 20]),
      crossing: back(nums[o + 21]), cutShort: nums[o + 22] === 1, forks: [], boosts: [],
    };
    data += 4 * count;
    for (let k = 0; k < nums[o + 23]; k++) {
      line.forks.push(nums[data++]);
    }
    for (let k = 0; k < nums[o + 24]; k++) {
      line.boosts.push({ at: nums[data], generation: nums[data + 1] });
      data += 2;
    }
    lines.push(line);
  }
  for (const line of lines) {
    line.parent = (line.parent as unknown as number) >= 0 ? lines[line.parent as unknown as number] : null;
    line.joinedInto = (line.joinedInto as unknown as number) >= 0 ? lines[line.joinedInto as unknown as number] : undefined;
  }
  let data = nums[HEAD_FLOATS + LINE_FLOATS * (n - 1) + 1] + 4 * nums[HEAD_FLOATS + LINE_FLOATS * (n - 1)] + nums[HEAD_FLOATS + LINE_FLOATS * (n - 1) + 23] + 2 * nums[HEAD_FLOATS + LINE_FLOATS * (n - 1) + 24];
  const meetings: Float64Array[] = [];
  for (let k = 0; k < nums[5]; k++, data += 3) {
    meetings.push(nums.subarray(data, data + 3));
  }
  const plan = Number.isNaN(nums[18]) ? null : [[0, 1, 2, 3].map((k) => nums[18 + k]), [0, 1, 2, 3].map((k) => nums[22 + k])];
  const shape: FlatShape = {
    F: nums[2], meet: [nums[15], nums[16], nums[17]], main: lines[0], lines: lines.slice(1), meetings,
    rejoins: nums[6], cut: nums[7], given: nums[8], noRoom: nums[9], tries: nums[26], spent: [nums[27], nums[28], nums[29]], foot: [nums[30] === 1, nums[31], nums[32]], short: { length: nums[33] }, attempts: back(nums[34]), fallback: nums[35] === 1, findings: back(nums[36]), plan, depths: [back(nums[10]), back(nums[11])], levels: [back(nums[12]), back(nums[13])],
    makeMs: back(nums[14]), flat: nums, destroyed: false, destroy: null,
  };
  // (its own end: marked; a worker's client gives its buffer back instead)
  shape.destroy = () => {
    shape.destroyed = true;
  };
  return shape;
};
// a flat form's buffer given back (from the main thread, to the worker's pools)
BoltShape.giveBuffer = (buffer) => {
  if (buffer && buffer.byteLength) {
    giveF64(new Float64Array(buffer));
  }
};
// (the buffers and lines made new so far, and those waiting in the pools now)
BoltShape.fresh = () => fresh;
BoltShape.pooled = () => pooled;
// (the new ones so far by kind: lines, bundles (24 arrays each), and buffers by their size)
BoltShape.freshBy = () => JSON.parse(JSON.stringify(freshBy));
if (M.TEST) {
  BoltShape.tally = () => JSON.parse(JSON.stringify(tally));
}
// a line's points as [x, y, z] each (for reading; its points are kept flat, x, y, z each)
BoltShape.pointsOf = (line) => {
  const out = [];
  for (let i = 0; i < line.count; i++) {
    out.push([line.points[i * 3], line.points[i * 3 + 1], line.points[i * 3 + 2]]);
  }
  return out;
};
if (M.TEST) {
  // (the tests: the closest points of two pieces, as { distance, s, t })
  const out = new Float64Array(6);
  BoltShape.segmentDistance = (p0, p1, q0, q1) => {
    segmentDistance(Float64Array.of(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]), 0, Float64Array.of(q0[0], q0[1], q0[2], q1[0], q1[1], q1[2]), 0, out);
    return { distance: Math.sqrt(out[0]), s: out[1], t: out[2] };
  };
}

// the warm-up, once, where the shapes are made (on the main thread without a worker, in each
// worker): a few shapes made and destroyed, through a camera and without (the engine compiles
// make's code then, not in the frame of the first strike), and the pools filled for the largest
// shape the limits allow, so a shape larger than the ones made so far makes nothing new:
// PREFILL_LINES lines (both sides' most forks, the routes' parts, tries in flight), each with its
// 8 buffers in the sizes a line of up to 85 points takes, and a few long
// lines' buffers (about 1.3 MB). Not when the script loads: with a worker, the main thread makes
// no shape
const PREFILL_LINES = 2 * FORKS_MAX + 20;
let warmed = false;
BoltShape.warm = () => {
  if (warmed || !M.Camera || !M.seededRandom) {
    return;
  }
  warmed = true;
  const view: Camera = Object.create(M.Camera.prototype);
  view.width = 1920;
  view.height = 2160;
  view.eyeHeight = 1.4;
  view.fieldOfView = 50;
  view.pitch = 0;
  view.version = 0;
  const random = M.seededRandom(1);
  for (const d of [4, 12, 30]) {
    const shape = BoltShape.make([0.3, view.topAt(d), -d], [0, 0, -d], random, 0.03, view);
    // (the flash's code compiled too, where the shapes are made: its first strike's otherwise)
    if (M.Flash) {
      M.Flash.of(shape);
    }
    shape.destroy!();
    BoltShape.make([0.3, view.topAt(d), -d], [0, 0, -d], random, 0.03).destroy!();
  }
  const prefill = (size: number, count: number) => {
    let list = bufferPool.get(size);
    if (!list) {
      list = [];
      bufferPool.set(size, list);
    }
    while (list.length < count) {
      list.push(new ArrayBuffer(size * 8));
      pooled++;
      fresh++;
    }
  };
  [[8, 3 * PREFILL_LINES + 40], [16, PREFILL_LINES], [32, PREFILL_LINES], [64, PREFILL_LINES], [128, PREFILL_LINES], [256, PREFILL_LINES], [512, 40], [1024, 20], [2048, 10], [4096, 6]].forEach((c) => prefill(c[0], c[1]));
  while (linePool.length < PREFILL_LINES) {
    const line = newLine();
    line.pooled = true;
    linePool.push(line);
    pooled++;
  }
};

M.BoltShape = BoltShape;
