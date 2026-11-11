// The lightning seen: the bolt (the main channel, from the meeting at a quarter of the strike)
// and the branches (the lines of generations 0 to 4: before the meeting the routes' parts and
// their branches) (its shape: models/boltshape.ts, made by Lightning; its items:
// models/boltitems.ts): each frame of a strike, its lines grown so far as emissive bands and,
// with Characters lightning, rain characters along them:
// - before its leaders meet, the branches, every one drawn by its generation (its size, its light:
//   the leader is a role, not a look); from the meeting, the bolt at F and the branches (no more
//   growing) fading by their own light (Lightning.boltLevelsAt: the lightning's drawn light,
//   Lightning brightness), gone at Lightning.BRANCHES_END;
// - drawn white: the light it casts on the scene keeps the flash's color (Lightning flash hue),
//   the bolt itself is white (with Characters lightning, its line under them TINT);
// - its radiance its drawn light per unit length (Lightning's drawn level) over F; a thinner line
//   is as bright and gives less light; every other line GENERATION_LIGHT x GENERATION_THIN^g of
//   it, g its generation (BoltShape's: the routes' parts before the meeting too);
// - a band faces the camera round each piece of a line (exact for the outline of a thin glowing
//   line), its light across a bell of the distance r from the line: a Gaussian half at half the
//   size, going on as an exponential tail (by e every BELL_SPREAD of the size, at least BELL_PX)
//   from where the Gaussian falls as fast, no flat top; over its sum across, so its light a metre
//   is BAND_PER_SIZE x its size x its radiance; a line under
//   WIDEN_PX drawn WIDEN_PX wide with its light spread over it (the same light). A pixel's
//   distance to a piece is the distance of the ray through the pixel's middle to it (the outline
//   of a thin line seen), each piece's band covering every pixel its profile reaches (round its
//   ends too, across the view);
// - in two passes: first one combined shape of every line, then its light. The mask (a picture of
//   its own, one sample a pixel, in update): of each line, the piece nearest a pixel's ray among it
//   and its neighbours owns the pixel (one owner a line: its joints add nothing, no bead), and the
//   owners make one shape, 1 - the product of (1 - each one's bell) (summed as logarithms: lines
//   near each other, forks and crossings blend as one shape, no crease, never brighter than one),
//   their light summed by the same weights as their bells (each owner's bell x its light, its slot's
//   level, its generation's factor and the fog's transmittance; the bells summed beside it, and
//   their nearness the same: every sum added in one pass). Then the light (in draw): one pass over
//   the screen (the guard's bands) reading the mask, the combined shape x the light it carries,
//   ADDED to what the picture holds (the rain's light under the glow kept). Mirrored, the pieces
//   also give the reflection their core's distance (no light);
// - with Characters lightning: rain characters (the atlas's) along each line, CHARACTER_MAIN (the
//   main channel) or CHARACTER_SPACING of its size apart, each a plane in the world of the line's
//   size facing along z as the rain's, giving CHARACTER_SHARE of the band's light a metre (their
//   radiance worked out from their spacing and, on the GPU, each one's own glyph's ink), on top
//   of the line: the same line, its shape and profile, at the rest of the light
//   (1 - CHARACTER_SHARE), slightly blue (TINT, of white's luminance); only along pieces seen
//   directly or mirrored;
// - moving: the characters travel along every line of a strike at one speed, the main channel's
//   length over CHARACTER_TRAVEL of the strike's duration (a character at its foot at the meeting
//   is at its top at the branches' end), by the strike's age: the main channel from its foot up,
//   every other line from its start (a branch outwards from its fork); each keeping its glyph: a
//   character's place k holds, at a strike's age, the glyph that started at place k - the places
//   moved (the age x the place's rate, the speed over its spacing), a part (the phase) of the way
//   to place k + 1. Worked out on the GPU from each slot's age: each place keeps its point, the
//   joint before the next place, the next place, how far it may move (the line's grown end) and
//   its rate;
// - covering, with Characters lightning: the line a layer of COVER opacity (times its profile),
//   the characters' ink opaque, both times min(1, their radiance / COVER_LIGHT) (a line fading
//   to black lets what is behind it through). They hide only what lies behind them along the
//   pixel's ray: the mask's second picture holds each one's opacity (line, ink; direct and
//   mirrored) and the third its nearness (NEAR_SCALE / its distance, the nearest by MAX). The
//   scene's picture (sky, water and fog) is covered by one pass over the screen (coverScene, the
//   guard's bands: what lies past the line, the fog's light in front of it kept: L - c (L - S),
//   c = 1 - (1 - line) (1 - ink), S the fog's light to the line); the rain and the splashes, and
//   the water's mirrored sky, read them where they are drawn (GlyphAtlas.fragment, Water); the
//   line's own light is under its characters' ink (1 - ink);
// - into the characters' HDR picture (so they bloom), added up; mirrored in the water (in the
//   mirrored pass, with the distance of its core as the reflection's second output: Fresnel and
//   the fog dim it there, nothing else); dimmed by the fog along their way (the fog's volume at
//   their corners); hidden below the water's surface (the highest wave looked at first);
// - its pieces (at most mostSegments) and characters' places (at most mostGlyphs) are worked out
//   and written to the start of two float textures (read by gl_InstanceID: no vertex array
//   changes) only when they change: while a strike grows, when a slot takes a new strike, when
//   Characters lightning changes, and for the characters when the view changes (which pieces are
//   seen); the glyphs' inks (over the share with ink; 0: blank, not drawn) in the characters'
//   texture's last rows, when the atlas changes. Each frame only each slot's lights and its
//   characters' motion go to the programs (uniforms). Each item holds its slot and kind; drawn in
//   the GPU guard's chunks; its programs warmed when first updated (drawn once into pictures of
//   one pixel with as many attachments as they draw into);
// - the quality model's job "bolt" (models/quality/bolt.ts) over the pieces seen directly: the
//   direct bands are drawn from a list of the pieces whose band can reach the screen (aDrop: the
//   piece's index in the data texture, one value an instance), the list used only for the items
//   and the view it was made for. The job's units are the pieces twice: seen directly, and their
//   mirror images (the reflection picture is drawn from the same camera with y -> -y; the water
//   reads it afterwards, so what its frustum misses is not there to be read): a second list for
//   the mirrored bands. Both lists are cut each frame to the pieces that draw something at the
//   frame's growth and lights (drawable). With no piece drawn in a view that view's light pass and
//   (directly, without characters) the cover pass are skipped (they would add nothing). The
//   characters (their items are made cut by view) and the mask's clears are as before.
//
// Changelog:
// 2026-11-02: a thin bright core in every line (BAND + CORE), BAND_PER_SIZE from the profile; the
//   bands blended by MAX on the light, each piece's distance the ray's through the pixel's middle,
//   its band round its ends across the view, REACH 0.5 + 4 GLOW_SPREAD (was 0.5 + 3: the glow cut
//   where still seen) (was each band cut by the bisector plane of its joints, which left unlit
//   wedges at the outer side of bends); the pieces' neighbours stored in place of the bisectors;
//   with Characters bolt the band only a glow round the characters (was the core at
//   CHARACTER_SHARE's rest); MOST_SEGMENTS 16384 (was 4096), MOST_GLYPHS 65536 (was 16384).
// 2026-11-03: the bands drawn as shapes into a mask (MAX within it) and their light added to the
//   picture in one pass (was MAX blending in the scene's picture: the rain under the glow lost);
//   the branches BRANCH_LIGHT of the main channel's light; GLOW 5e-5 spreading 0.1 (was 0.2
//   spreading 0.6); with Characters bolt the line the same profile at 1 - CHARACTER_SHARE of the
//   light, tinted TINT, the characters white; the band's soft edge by its width, its level over
//   its sum across; hidden below the water by the piece's point nearest the pixel's ray; the
//   routes' parts before the meeting in the branches' shape, light and characters; a band's reach
//   at least its soft edge and a pixel past half its size; each character's radiance by its own
//   glyph's ink and by its piece's share across the view.
// 2026-11-03: a line's points read flat (x, y, z each, count of them: BoltShape's format).
// 2026-11-03: the profile a soft core (a smoothstep CORE_HALF either side of half the size) and a
//   faint tail of TAIL_LIGHT radiance (the edge soft as tone mapped), over its sum across (was a
//   band to half the size with a pixel's soft edge, a thin core and GLOW: hard as shown); lines
//   under WIDEN_PX (1 px) drawn WIDEN_PX wide; the characters moving along their line at
//   CHARACTER_SPEED spacings a second, worked out on the GPU (their glyph and its ink there:
//   GLYPH_FLOATS 16, was 8, the inks in the characters' texture); with Characters lightning the
//   line covering COVER of what lies behind it and the characters' ink all of it (the mask's
//   cover and nearness pictures, the scene covered by coverScene, the line's light under the ink);
//   the reflection's distance drawn by a program of its own (boltDistance: two draw buffers, the
//   mask's three).
// 2026-11-03: the profile a bell (a Gaussian half at half the size with an exponential tail by e
//   every max(BELL_SPREAD of the size, BELL_PX), no flat top; was a smoothstep core and a faint
//   tail); every other line by its generation, GENERATION_LIGHT x GENERATION_THIN^g of the main
//   channel's light (was BRANCH_LIGHT 0.5 for all); the characters at the main channel's length
//   over CHARACTER_TRAVEL of the strike's duration, every line at that speed, the main channel's
//   from its foot up (was CHARACTER_SPEED, 12 spacings a second, from its top): a rate per place
//   (GLYPH_FLOATS 20), each slot's age to the GPU.
// 2026-11-03: one combined shape: each line's pixels owned by one piece (the nearest of it and its
//   neighbours, ties by order: the distance past an end from the end alone), the owners' bells
//   added and their light by the same weights, the cover added (its readers take at most COVER),
//   the nearness the nearest (per attachment, OES_draw_buffers_indexed, else a pass of its own);
//   the light the shape (JOIN_MOST past 1) x the light it carries (was the main channel's and the
//   branches' shapes apart, each by MAX: a crease where lines came near).
// 2026-11-03: the combined shape 1 - the product of (1 - each owner's bell), summed as logarithms
//   (was the bells' sum, JOIN_MOST past 1: brighter at forks, a kink where it saturated); the
//   nearness the owners' mean by their bells (was the nearest); every sum in one added pass (the
//   attachments: the light and the logarithms, the cover, the nearness and the bells' sum).
// 2026-11-03: the items made once a strike and a view at their full growth (engine/boltitems.js,
//   the same in the bolt's worker), each with the growths at which it starts, ends and is hidden,
//   cut at the slot's growth by the vertex shaders (was made again every frame while a strike
//   grew); each slot a region of the textures (SLOT_SEGMENTS, SLOT_GLYPHS), the slot a uniform
//   (uSlot; was in each item); the characters' seeds from the strike's seed (was its slot and
//   start); the line's share of the light with Characters lightning a uniform (uBand); the
//   characters always made, drawn only with Characters lightning.
// 2026-11-03: MOST_SEGMENTS 32768 (was 16384: jagged branches, up to about 6,300 pieces a
//   strike), MOST_GLYPHS 131072 (was 65536: their characters too).
// 2026-11-03: each character's share across the view worked out on the GPU from the way to its
//   next place (was its piece's, in the script: it changed at once where a character moved on).
// 2026-11-04: the mask's programs warmed into a picture of the mask's formats (was RGBA8 for all).
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/bolt.js); the bell's constants and
//   TINT from materials/bolt.ts (Bolt.BELL_SPREAD and Bolt.TINT the same values).
// 2026-11-07: the characters drawn from a list of their units (QualityBolt.processGlyphs, exact for the quad: the shader's middle-point test removed;
//   uListed, aDrop) with a least light by level (uGlyphEps); the cut counts the brightest piece sharing a pixel (uOthers) and a piece whose light with
//   it is under eps is dropped in the mask (uDrop). Not applied: merging pieces (models/boltitems.ts) and the light pass at 1/k of the resolution
//   (the rays read gl_FragCoord at full resolution): their bounds are in models/quality/bolt.ts only.
// 2026-11-07: the band's glow cut earlier for a piece whose peak light's glow falls under an HDR threshold of its level (uTailEps, QualityBolt.tailEpsTable;
//   level = the footprint of its extent), with Effect.lod; the profile's erf and sum moved to profile.glsl.
// 2026-11-07: the job's units twice (the pieces' mirror images after the direct ones): the mirrored bands drawn from their own list;
//   both lists cut to the pieces that draw something at the frame's growth and lights; the mirrored light pass skipped when none.
// 2026-11-06: the quality job "bolt": the direct bands drawn from the list of pieces the model says
//   can reach the screen (band_vertex.glsl: uListed, aDrop); the direct light and cover passes
//   skipped when no piece is listed.
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import { BELL_SPREAD, BELL_PX, BELL_LEAST, BELL_END, TINT } from "../materials/bolt";
import type { EffectContext, SharedGlsl } from "../engine/effect";
import type { ShaderProgram, RenderTarget, Programs, ProgramSources } from "../engine/gl";
import type { GlyphAtlas } from "../engine/glyphs";
import type { ItemsOut, ItemsOptions, ItemsBuilt, ItemsLine, ItemsCounts } from "../models/boltitems";
import type { MadeShape } from "../models/boltshape";
import { QualityBolt } from "../models/quality/bolt";
import { BoltList } from "../models/boltlist";
import type { BoltListInput, BoltListOutput, BoltListSlot } from "../models/boltlist";
import type { JobTask } from "../platform/jobtask";
import type { Strike } from "./lightning";
import type { EffectQuality, QualityJob, QualityShared } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";
import LIGHT_SOURCE from "../shaders/bolt/light.glsl";
import PROFILE_SOURCE from "../shaders/bolt/profile.glsl";
import BAND_VERTEX_SOURCE from "../shaders/bolt/band_vertex.glsl";
import BAND_FRAGMENT_SOURCE from "../shaders/bolt/band_fragment.glsl";
import NEAR_OUTPUT_SOURCE from "../shaders/bolt/near_output.glsl";
import LIGHT_FRAGMENT_SOURCE from "../shaders/bolt/light_fragment.glsl";
import COVER_FRAGMENT_SOURCE from "../shaders/bolt/cover_fragment.glsl";
import GLYPH_MASK_FRAGMENT_SOURCE from "../shaders/bolt/glyph_mask_fragment.glsl";
import GLYPH_VERTEX_SOURCE from "../shaders/bolt/glyph_vertex.glsl";

const ITEMS = M.BoltItems;
// the items' layout and their light's constants (models/boltitems.ts: one place for them; the
// bell's own and TINT: materials/bolt.ts)
const SEGMENT_FLOATS = ITEMS.SEGMENT_FLOATS;
const SEGMENT_TEXELS = SEGMENT_FLOATS / 4;
const GLYPH_FLOATS = ITEMS.GLYPH_FLOATS;
const GLYPH_TEXELS = GLYPH_FLOATS / 4;
const BAND_PER_SIZE = ITEMS.BAND_PER_SIZE;
const CHARACTER_MAIN = ITEMS.CHARACTER_MAIN;
const CHARACTER_SPACING = ITEMS.CHARACTER_SPACING;
const CHARACTER_SHARE = ITEMS.CHARACTER_SHARE;
// lines thinner than this (pixels) drawn this wide, their light spread over it (BoltShape keeps
// lines apart by their drawn widths, at least 1 px)
const WIDEN_PX = 1;
// with Characters lightning, the line's opacity (times its profile) over what lies behind it, the
// characters' that of their ink; both times min(1, radiance / COVER_LIGHT): COVER_LIGHT is the
// radiance the tone map shows at half white (0.15)
const COVER = 0.5;
const COVER_LIGHT = 0.15;
// a line's shape at most this in the combined shape's product (its logarithm finite)
const SHAPE_MOST = 0.999;
// the characters' mean ink when the atlas does not give it, and the least that is drawn as ink
const INK_DEFAULT = 0.3;
const INK_LEAST = 0.01;
const SLOTS = M.STRIKES_MOST;
// each slot's region of the textures: its pieces and its characters' places (whole rows)
const SLOT_SEGMENTS = 11264;
const SLOT_GLYPHS = 43776;
const MOST_SEGMENTS = SLOTS * SLOT_SEGMENTS;
const MOST_GLYPHS = SLOTS * SLOT_GLYPHS;
const SEGMENTS_ACROSS = 128;
const GLYPHS_ACROSS = 128;
// the glyphs' inks: in the characters' texture's last rows (4 a texel)
const INK_ROWS = 2;
const INKS = GLYPHS_ACROSS * GLYPH_TEXELS * 4 * INK_ROWS;
const NEAR_SCALE = M.GlyphAtlas.NEAR_SCALE;

// a slot's items (BoltItems.build's, or the worker's), their counts always set
type SlotItems = ItemsOut & { segmentCount: number; glyphCount: number };

// the items made of each kind in a slot (the tests)
type MadeCounts = Omit<ItemsCounts, "steps">;

export class Bolt extends M.Effect {
  static TINT: Float32Array<ArrayBuffer>;
  static BELL_SPREAD: number;
  static COVER_LIGHT: number;
  static COVER: number;
  static CHARACTER_TRAVEL: number;
  static CHARACTER_SHARE: number;
  static CHARACTER_SPACING: number;
  static CHARACTER_MAIN: number;
  static GENERATION_THIN: number;
  static GENERATION_LIGHT: number;
  static SLOT_GLYPHS: number;
  static SLOT_SEGMENTS: number;
  static SEGMENT_FLOATS: number;
  static BAND_PER_SIZE: number;
  static GLYPH_FLOATS: number;
  static MOST_GLYPHS: number;
  static MOST_SEGMENTS: number;
  static bandVertex: (glsl: SharedGlsl) => string;
  static bandFragment: (glsl: SharedGlsl, mask: boolean) => string;
  static lightFragment: (test: boolean) => string;
  static coverFragment: (glsl: SharedGlsl) => string;
  static glyphMaskFragment: (glsl: SharedGlsl) => string;
  static glyphVertex: (glsl: SharedGlsl) => string;
  cover!: ShaderProgram;
  light!: ShaderProgram;
  glyphMask!: ShaderProgram;
  glyph!: ShaderProgram;
  distance!: ShaderProgram;
  band!: ShaderProgram;
  // (the tests only: M.TEST)
  cutOnCpu!: boolean;
  onlyPieces!: [number, number] | null;
  onlyGlyph!: number;
  pieceOf!: Int32Array<ArrayBuffer>;
  lineOf!: (ItemsLine | null)[];
  builds!: number;
  steps!: number;
  drawn!: Omit<MadeCounts, "mainGlyphs">;
  made!: MadeCounts[];
  glyphCount!: number;
  segmentCount!: number;
  glyphs!: Float32Array<ArrayBuffer>;
  segments!: Float32Array<ArrayBuffer>;
  // the quality job: a count that changes whenever a slot's items were made again (the pieces' numbering), the count the statics were
  // packed at and each slot's first unit in them, the list of the pieces seen (items' indices, slot x SLOT_SEGMENTS + piece, by slot:
  // listCounts), the count and camera version it was made for, and the buffer and vertex array that feed it to the vertex shader
  itemsVersion: number;
  sentItems: number;
  unitOffsets: Int32Array;
  pieceList: Uint32Array<ArrayBuffer>;
  listCounts: Int32Array<ArrayBuffer>;
  listTotal: number;
  // the same for the mirror images, and what is drawn after the frame's growth and lights cut the lists (drawList: the direct draw's
  // pieces then, from MOST_SEGMENTS, the mirrored draw's; by slot in drawCounts and mirrorDrawCounts; filtered: made for this frame)
  mirrorList: Uint32Array<ArrayBuffer>;
  mirrorCounts: Int32Array<ArrayBuffer>;
  mirrorListTotal: number;
  drawList: Uint32Array<ArrayBuffer>;
  drawCounts: Int32Array<ArrayBuffer>;
  mirrorDrawCounts: Int32Array<ArrayBuffer>;
  directDrawn: number;
  mirrorDrawn: number;
  filtered: boolean;
  // the glow's cut by level of detail, eps for each level (QualityBolt.tailEpsTable), and the table of full detail (all 0)
  tailEps: Float32Array<ArrayBuffer>;
  tailFull: Float32Array<ArrayBuffer>;
  // the characters' units of the job (after the pieces' two halves): each slot's first unit, the lists of the characters seen directly and as mirror
  // images (items' indices, slot x SLOT_GLYPHS + place, by slot in glyphCounts and glyphMirrorCounts), their buffer (the direct list, then from
  // MOST_GLYPHS the mirrored) and vertex array, and the characters' least light by level (QualityBolt.glyphEpsTable)
  glyphEps: Float32Array<ArrayBuffer>;
  glyphOffsets: Int32Array<ArrayBuffer>;
  glyphList: Uint32Array<ArrayBuffer>;
  glyphMirrorList: Uint32Array<ArrayBuffer>;
  glyphCounts: Int32Array<ArrayBuffer>;
  glyphMirrorCounts: Int32Array<ArrayBuffer>;
  glyphListed: boolean;
  glyphUploaded: boolean;
  glyphMirrorUploaded: boolean;
  glyphBuffer!: WebGLBuffer;
  glyphArray!: WebGLVertexArrayObject;
  // each slot's greatest piece radiance, and the greatest peak a piece sharing a pixel can have this frame (the cut's others)
  radiance: Float32Array<ArrayBuffer>;
  others: number;
  // the piece lists' job (models/boltlist.ts; src/index.ts gives its task), each slot's items version (bumped when its items are made again) and the version last sent to the job's
  // worker (-1: send them again), and the answer of this frame's fork with what it was asked, taken in by update only when every input is still the same
  listTask: JobTask<BoltListInput, BoltListOutput> | null;
  slotVersion: number[];
  sentSlot: number[];
  answered: { input: BoltListInput; output: BoltListOutput } | null;
  directUploaded: boolean;
  mirrorUploaded: boolean;
  listItems: number;
  listCamera: number;
  qualityParamValues: { inputs: QualityShared["inputs"] } | null;
  listBuffer!: WebGLBuffer;
  listArray!: WebGLVertexArrayObject;
  warmed: boolean;
  warmItem: Float32Array<ArrayBuffer>;
  warmPair: RenderTarget;
  warmMask: RenderTarget;
  glyphTexture: WebGLTexture;
  segmentTexture: WebGLTexture;
  none: Float32Array<ArrayBuffer>;
  mask: RenderTarget;
  covers: boolean;
  lit: boolean;
  tinted: boolean;
  white: Float32Array<ArrayBuffer>;
  age: Float32Array<ArrayBuffer>;
  grown: Float32Array<ArrayBuffer>;
  branchLight: Float32Array<ArrayBuffer>;
  mainLight: Float32Array<ArrayBuffer>;
  builtVersion: number[];
  builtFrom: (Strike | null)[];
  inksFrom: Float32Array | null;
  inks: Float32Array<ArrayBuffer>;
  slotItems: SlotItems[];
  mostGlyphs: number;
  mostSegments: number;
  viewScale: number;
  levels: Float32Array<ArrayBuffer>;
  slots: (Strike | null)[];
  characters: boolean;
  atlas: GlyphAtlas;
  constructor(context: EffectContext) {
    super(context);
    const gl = this.gl;
    this.atlas = context.atlas;
    this.characters = true;
    this.slots = [];
    this.levels = new Float32Array(SLOTS * 3);
    this.viewScale = 1;
    // the most items a slot holds (the tests lower them)
    this.mostSegments = SLOT_SEGMENTS;
    this.mostGlyphs = SLOT_GLYPHS;
    // each slot's items (BoltItems.build's), made once its strike's and view's
    this.slotItems = Array.from({ length: SLOTS }, (): SlotItems => ({ segments: null, glyphs: null, segmentCount: 0, glyphCount: 0, counts: null }));
    this.inks = new Float32Array(INKS);
    this.inksFrom = null;
    // what each slot's items were made from: its strike and the view's version
    this.builtFrom = new Array(SLOTS).fill(null);
    this.builtVersion = new Array(SLOTS).fill(-1);
    // each slot's lights now (the main channel's, the leaders' and branches'), its growth and its
    // characters' age, for the programs
    this.mainLight = new Float32Array(4);
    this.branchLight = new Float32Array(4);
    this.grown = new Float32Array(4);
    this.age = new Float32Array(4);
    this.white = Float32Array.of(1, 1, 1);
    // whether Characters lightning's characters are drawn (then the line TINT, at the rest of the
    // light); whether any slot gives light this frame, and whether it covers what is behind it
    this.tinted = false;
    this.lit = false;
    this.covers = false;
    // the shapes' light (see the mask pass), their opacities and their nearness, one sample a
    // pixel
    const sums = this.caps.floats ? gl.RGBA16F : gl.RGBA8;
    this.mask = this.target({ formats: [sums, gl.RGBA8, sums] });
    this.none = new Float32Array(4);
    this.segmentTexture = this.dataTexture(M.UNITS.boltSegments, SEGMENTS_ACROSS * SEGMENT_TEXELS, MOST_SEGMENTS / SEGMENTS_ACROSS);
    this.glyphTexture = this.dataTexture(M.UNITS.boltGlyphs, GLYPHS_ACROSS * GLYPH_TEXELS, MOST_GLYPHS / GLYPHS_ACROSS + INK_ROWS);
    // (the programs warmed into pictures of one pixel with the attachments they draw into, the
    // mask's of its formats)
    this.warmMask = this.target({ formats: [sums, gl.RGBA8, sums] });
    this.warmPair = this.target({ formats: [gl.RGBA8, gl.RGBA8] });
    this.warmItem = new Float32Array(Math.max(SEGMENT_FLOATS, GLYPH_FLOATS));
    this.warmed = false;
    this.itemsVersion = 0;
    this.sentItems = -1;
    this.unitOffsets = new Int32Array(SLOTS + 1);
    this.pieceList = new Uint32Array(MOST_SEGMENTS);
    this.listCounts = new Int32Array(SLOTS);
    this.listTotal = 0;
    this.listItems = -1;
    this.listCamera = -1;
    this.mirrorList = new Uint32Array(MOST_SEGMENTS);
    this.mirrorCounts = new Int32Array(SLOTS);
    this.mirrorListTotal = 0;
    this.drawList = new Uint32Array(2 * MOST_SEGMENTS);
    this.drawCounts = new Int32Array(SLOTS);
    this.mirrorDrawCounts = new Int32Array(SLOTS);
    this.directDrawn = 0;
    this.mirrorDrawn = 0;
    this.filtered = false;
    this.tailEps = QualityBolt.tailEpsTable() as Float32Array<ArrayBuffer>;
    this.tailFull = new Float32Array(this.tailEps.length);
    this.glyphEps = QualityBolt.glyphEpsTable() as Float32Array<ArrayBuffer>;
    this.glyphOffsets = new Int32Array(SLOTS + 1);
    this.glyphList = new Uint32Array(MOST_GLYPHS);
    this.glyphMirrorList = new Uint32Array(MOST_GLYPHS);
    this.glyphCounts = new Int32Array(SLOTS);
    this.glyphMirrorCounts = new Int32Array(SLOTS);
    this.glyphListed = false;
    this.glyphUploaded = false;
    this.glyphMirrorUploaded = false;
    this.radiance = new Float32Array(SLOTS);
    this.others = 0;
    this.listTask = null;
    this.slotVersion = new Array(SLOTS).fill(0);
    this.sentSlot = new Array(SLOTS).fill(-1);
    this.answered = null;
    this.directUploaded = false;
    this.mirrorUploaded = false;
    this.qualityParamValues = null;
    if (M.TEST) {
      // (the tests: every slot's items in one array each at their regions, the totals to the last
      // slot with any; items made by slot and kind, what the last frame drew, the loops' steps,
      // the times items were made, each piece's line; one character or a line's pieces drawn
      // alone; the items cut at the growth on the main thread each frame instead of the GPU)
      this.segments = new Float32Array(MOST_SEGMENTS * SEGMENT_FLOATS);
      this.glyphs = new Float32Array(MOST_GLYPHS * GLYPH_FLOATS);
      this.segmentCount = 0;
      this.glyphCount = 0;
      this.made = Array.from({ length: SLOTS }, () => ({ leaders: 0, branches: 0, main: 0, glyphs: 0, mainGlyphs: 0 }));
      this.drawn = { leaders: 0, branches: 0, main: 0, glyphs: 0 };
      this.steps = 0;
      this.builds = 0;
      this.lineOf = new Array(MOST_SEGMENTS).fill(null);
      this.pieceOf = new Int32Array(MOST_SEGMENTS);
      this.onlyGlyph = -1;
      this.onlyPieces = null;
      this.cutOnCpu = false;
    }
  }

  // a float texture of the data read by gl_InstanceID, on its own unit
  dataTexture(unit: number, width: number, height: number) {
    const gl = this.gl;
    const texture = this.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  }

  static programs(glsl: SharedGlsl): ProgramSources {
    return {
      boltBand: [Bolt.bandVertex(glsl), Bolt.bandFragment(glsl, true)],
      boltDistance: [Bolt.bandVertex(glsl), Bolt.bandFragment(glsl, false)],
      boltLight: [M.FULL_VERTEX, Bolt.lightFragment(M.TEST)],
      boltGlyph: [Bolt.glyphVertex(glsl), M.GlyphAtlas.fragment(glsl, M.TEST)],
      boltGlyphMask: [Bolt.glyphVertex(glsl), Bolt.glyphMaskFragment(glsl)],
      boltCover: [M.FULL_VERTEX, Bolt.coverFragment(glsl)],
    };
  }

  static QUALITY_UNIT = "pieces";

  static properties() {
    return { p127_setting_CharactersLightning: (bolt: Bolt, v: boolean) => (bolt.characters = v) };
  }

  init(programs: Programs) {
    [this.band, this.distance, this.glyph, this.glyphMask, this.light, this.cover] = this.ownPrograms(programs, ["boltBand", "boltDistance", "boltGlyph", "boltGlyphMask", "boltLight", "boltCover"]);
    const fog = { uFogDirect: M.UNITS.fogDirect, uFogMirror: M.UNITS.fogMirror, uStrikeDirect: M.UNITS.strikeDirect, uStrikeMirror: M.UNITS.strikeMirror };
    this.light.samplers({ uMask: M.UNITS.work, uBoltCover: M.UNITS.boltCover, uBoltNear: M.UNITS.boltNear });
    this.cover.samplers(Object.assign({ uBoltCover: M.UNITS.boltCover, uBoltNear: M.UNITS.boltNear }, fog));
    // (an integer attribute's own current value: a draw without the list reads it)
    const gl = this.gl;
    gl.vertexAttribI4ui(M.ATTRIBUTES.aDrop, 0, 0, 0, 0);
    this.listBuffer = this.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.listBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 2 * MOST_SEGMENTS * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.listArray = this.vertexArray([{ buffer: this.listBuffer, attribute: "aDrop", size: 1, integer: true }]);
    this.glyphBuffer = this.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 2 * MOST_GLYPHS * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.glyphArray = this.vertexArray([{ buffer: this.glyphBuffer, attribute: "aDrop", size: 1, integer: true }]);
    for (const band of [this.band, this.distance]) {
      band.samplers(Object.assign({ uSegments: M.UNITS.boltSegments, uWaves: M.UNITS.waves, uWaveMax: M.UNITS.waveMax }, fog));
    }
    for (const glyph of [this.glyph, this.glyphMask]) {
      glyph.samplers(Object.assign({ uBoltGlyphs: M.UNITS.boltGlyphs, uAtlas: M.UNITS.atlas, uWaves: M.UNITS.waves, uWaveMax: M.UNITS.waveMax }, fog));
    }
  }

  resize(width: number, height: number) {
    this.mask.resize(width, height);
  }

  // ---- the quality job (models/quality/bolt.ts) ----

  qualityKind(): string {
    return "bolt";
  }

  // the job's statics when a slot's items were made again since the last call: the pieces of the slots packed one after the other
  qualityStatics(): QualityStatics | null {
    if (this.itemsVersion === this.sentItems) {
      return null;
    }
    this.sentItems = this.itemsVersion;
    const slots: { segments: Float32Array | null; count: number }[] = [];
    for (let k = 0; k < SLOTS; k++) {
      const items = this.slotItems[k];
      slots.push({ segments: items.segments || null, count: items.segmentCount });
    }
    const packed = QualityBolt.pack(slots, SEGMENT_FLOATS);
    this.unitOffsets = packed.offsets;
    const characters: { glyphs: Float32Array | null; count: number }[] = [];
    for (let k = 0; k < SLOTS; k++) {
      const items = this.slotItems[k];
      characters.push({ glyphs: items.glyphs || null, count: items.glyphCount });
    }
    const glyphs = QualityBolt.packGlyphs(characters, GLYPH_FLOATS);
    this.glyphOffsets = glyphs.offsets as Int32Array<ArrayBuffer>;
    return { ends: packed.ends, sizes: packed.sizes, points: glyphs.points };
  }

  // the frame's parameters: the shared view
  qualityParams(shared: QualityShared): QualityParams {
    let p = this.qualityParamValues;
    if (!p) {
      p = this.qualityParamValues = { inputs: shared.inputs };
    }
    p.inputs = shared.inputs;
    return p as unknown as QualityParams;
  }

  // the pieces of the statics last sent, twice (seen directly, then their mirror images), then the characters, twice, in chunks of
  // QualityBolt.CHUNK (none while no strike has pieces)
  qualityJobs(): QualityJob[] {
    const units = 2 * this.unitOffsets[SLOTS] + 2 * this.glyphOffsets[SLOTS];
    return units > 0 && this.qualityIndex >= 0 ? [{ effect: this.qualityIndex, units, minChunk: QualityBolt.CHUNK }] : [];
  }

  // the frame's quality: the pieces seen (level over 0 in the first half of the levels) become the direct bands' list, and those whose
  // mirror image is seen (the second half) the mirrored bands', by slot. The levels are for the items the statics were packed from
  // (sentItems) and the camera as it is now; the lists are used only while both still are (listValid). The readout's quality is the
  // direct view's (units = the pieces)
  setQuality(q: EffectQuality) {
    super.setQuality(q);
    const levels = q.levels;
    this.filtered = false;
    const n = this.unitOffsets[SLOTS];
    const g = this.glyphOffsets[SLOTS];
    if (!levels || levels.length !== 2 * n + 2 * g) {
      this.listItems = -1;
      return;
    }
    // (the characters seen directly and as images: their units follow the pieces', exact for the quad)
    QualityBolt.listOf(levels, this.glyphOffsets, SLOT_GLYPHS, this.glyphList, this.glyphCounts, 2 * n);
    QualityBolt.listOf(levels, this.glyphOffsets, SLOT_GLYPHS, this.glyphMirrorList, this.glyphMirrorCounts, 2 * n + g);
    this.glyphUploaded = false;
    this.glyphMirrorUploaded = false;
    this.listTotal = QualityBolt.listOf(levels, this.unitOffsets, SLOT_SEGMENTS, this.pieceList, this.listCounts);
    this.mirrorListTotal = QualityBolt.listOf(levels, this.unitOffsets, SLOT_SEGMENTS, this.mirrorList, this.mirrorCounts, n);
    let sum = 0;
    let top = 0;
    for (let i = 0; i < n; i++) {
      sum += levels[i];
      if (levels[i] > top) {
        top = levels[i];
      }
    }
    q.units = n;
    q.drawn = this.listTotal;
    q.level = top;
    q.meanLevel = this.listTotal > 0 ? sum / this.listTotal : 0;
    q.visible = this.listTotal > 0;
    this.listItems = this.sentItems;
    this.listCamera = this.camera.dirty ? -1 : this.camera.version;
  }

  // whether the lists are for the items and the view of this frame's drawing
  listValid(): boolean {
    return this.listItems === this.itemsVersion && this.listCamera === this.camera.version && !(M.TEST && this.onlyPieces);
  }

  // whether this frame's drawing takes the filtered lists
  listsUsable(): boolean {
    return this.filtered && this.listValid();
  }

  // the lists cut to the pieces that draw something at the frame's growth and lights (each slot's, in QualityBolt.filter: the band
  // vertex shader's own test), into drawList: the direct draw's, then from MOST_SEGMENTS the mirrored draw's. Called with the slots'
  // lights and growths set (update), before the mask is drawn
  filterLists(masks: (Uint8Array | null)[] | null = null) {
    this.filtered = false;
    if (!this.listValid()) {
      return;
    }
    const band = this.tinted ? 1 - CHARACTER_SHARE : 1;
    let direct = 0;
    let mirror = 0;
    let at = 0;
    let mirrorAt = 0;
    for (let k = 0; k < SLOTS; k++) {
      const segments = this.slotItems[k].segments;
      const grown = this.grown[k], main = this.mainLight[k], branch = this.branchLight[k];
      let kept = 0;
      let mirrorKept = 0;
      if (segments) {
        // (the job's mask of the drawable pieces, when this frame's fork was answered: the same cut as QualityBolt.filter's, see BoltList.keep)
        const mask = masks ? masks[k] : null;
        if (mask) {
          kept = BoltList.keep(mask, SLOT_SEGMENTS, this.pieceList, at, this.listCounts[k], this.drawList, direct);
          mirrorKept = BoltList.keep(mask, SLOT_SEGMENTS, this.mirrorList, mirrorAt, this.mirrorCounts[k], this.drawList, MOST_SEGMENTS + mirror);
        } else {
          kept = QualityBolt.filter(segments, SEGMENT_FLOATS, SLOT_SEGMENTS, this.pieceList, at, this.listCounts[k], this.drawList, direct, grown, main, branch, band);
          mirrorKept = QualityBolt.filter(segments, SEGMENT_FLOATS, SLOT_SEGMENTS, this.mirrorList, mirrorAt, this.mirrorCounts[k], this.drawList, MOST_SEGMENTS + mirror, grown, main, branch, band);
        }
      }
      at += this.listCounts[k];
      mirrorAt += this.mirrorCounts[k];
      this.drawCounts[k] = kept;
      this.mirrorDrawCounts[k] = mirrorKept;
      direct += kept;
      mirror += mirrorKept;
    }
    this.directDrawn = direct;
    this.mirrorDrawn = mirror;
    this.directUploaded = false;
    this.mirrorUploaded = false;
    this.filtered = true;
  }

  reset() {
    this.slots = [];
    for (const items of this.slotItems) {
      items.segmentCount = items.glyphCount = 0;
    }
    this.builtFrom.fill(null);
    this.builtVersion.fill(-1);
    this.itemsVersion++;
    this.filtered = false;
    for (let k = 0; k < SLOTS; k++) {
      this.slotVersion[k]++;
    }
  }

  // the strikes' slots (their shapes), and each slot's growth and lights now
  // (Lightning.boltLevelsAt: grown, the main channel's, the leaders' and branches')
  setStrikes(slots: (Strike | null)[], levels: Float32Array<ArrayBuffer>) {
    this.slots = slots;
    this.levels = levels;
  }

  // whether Characters lightning's characters are drawn: on, and the atlas with ink
  drawsCharacters() {
    const ink = this.atlas.meanInk === undefined ? INK_DEFAULT : this.atlas.meanInk;
    return this.characters && ink >= INK_LEAST;
  }

  // the glyphs' inks for the GPU (each one's ink over the share of the glyphs with ink, the
  // blanks' light made up by the others on average; 0: blank, not drawn), when the atlas changed
  uploadInks() {
    const atlas = this.atlas;
    this.inksFrom = atlas.inks;
    const known = atlas.inks && atlas.inks.length === atlas.count;
    const mean = atlas.meanInk === undefined ? INK_DEFAULT : atlas.meanInk;
    const count = Math.min(atlas.count, INKS);
    this.inks.fill(0);
    for (let g = 0; g < count; g++) {
      const ink = known ? atlas.inks[g] : mean;
      this.inks[g] = !known ? ink : ink < INK_LEAST ? 0 : ink * atlas.inkedShare;
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltGlyphs);
    gl.bindTexture(gl.TEXTURE_2D, this.glyphTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, MOST_GLYPHS / GLYPHS_ACROSS, GLYPHS_ACROSS * GLYPH_TEXELS, INK_ROWS, gl.RGBA, gl.FLOAT, this.inks, 0);
  }

  // the options a strike's items are made with, in the bolt's worker beside its shape (Lightning
  // asks them through src/index.ts: the view now, a slot's room)
  itemsOptionsOf(strike: Strike): ItemsOptions {
    return ITEMS.optionsFor(strike, this.camera, SLOT_SEGMENTS, SLOT_GLYPHS);
  }

  // the options a slot's strike's items are made with (the view now, the slot's room)
  optionsOf(k: number): ItemsOptions {
    return ITEMS.optionsFor(this.slots[k]!, this.camera, Math.min(this.mostSegments, SLOT_SEGMENTS), Math.min(this.mostGlyphs, SLOT_GLYPHS));
  }

  // a slot's strike's items made on the main thread, at their full growth (or, the tests' cut, at
  // the slot's growth now), into out (fresh arrays when none)
  buildItems(k: number, out: ItemsOut, growth?: number): ItemsBuilt {
    const options = this.optionsOf(k);
    if (growth !== undefined) {
      options.growth = growth;
    }
    return ITEMS.build(this.slots[k]!.shape!, options, out);
  }

  // the tests and the worker: a slot's strike's items as the main thread makes them (fresh
  // arrays), and what the worker is given to make them (the shape's flat form, copied, and the
  // options)
  itemsFor(k: number): ItemsBuilt {
    return this.buildItems(k, {});
  }

  itemsSpec(k: number): { flat: Float64Array; items: ItemsOptions } {
    const shape = this.slots[k]!.shape!;
    const flat = shape.flat ? shape.flat.slice() : M.BoltShape.toFlat(shape as MadeShape).nums.slice();
    return { flat, items: this.optionsOf(k) };
  }

  // the slots whose items must be made again: a slot's strike new or gone, or the view changed
  // (the tests' main-thread cut: every frame a strike plays); none while a strike grows
  refresh() {
    const cut = M.TEST && this.cutOnCpu;
    for (let k = 0; k < SLOTS; k++) {
      const s = this.slots[k] || null;
      if (!cut && s === this.builtFrom[k] && (!s || this.builtVersion[k] === this.camera.baseVersion)) {
        continue;
      }
      this.builtFrom[k] = s;
      this.builtVersion[k] = this.camera.baseVersion;
      this.itemsVersion++;
      this.slotVersion[k]++;
      const items = this.slotItems[k];
      items.segmentCount = items.glyphCount = 0;
      this.radiance[k] = 0;
      if (M.TEST) {
        items.lineOf = items.lineOf || new Array(SLOT_SEGMENTS).fill(null);
        items.pieceOf = items.pieceOf || new Int32Array(SLOT_SEGMENTS);
      }
      if (s && s.shape) {
        const made = s.shape.items as ItemsBuilt | null | undefined;
        if (made && s.version === this.camera.baseVersion && !cut) {
          // (made in the bolt's worker with its shape, for this view: itemsOptionsOf's)
          items.segments = made.segments;
          items.glyphs = made.glyphs;
          items.segmentCount = made.segmentCount;
          items.glyphCount = made.glyphCount;
          items.counts = made.counts;
        } else {
          this.buildItems(k, items, cut ? Math.min(1, this.levels[k * 3]) : undefined);
        }
        this.upload(k, items);
      }
      if (M.TEST) {
        this.tested(k, items);
      }
    }
  }

  // a slot's items into its regions of the textures
  upload(k: number, items: SlotItems) {
    const gl = this.gl;
    if (items.segmentCount > 0) {
      // (the greatest radiance of its pieces: the band's brightest light, for the cut's others)
      let most = 0;
      const s = items.segments!;
      for (let i = 0; i < items.segmentCount; i++) {
        const radiance = s[i * SEGMENT_FLOATS + 7];
        if (radiance > most) {
          most = radiance;
        }
      }
      this.radiance[k] = most;
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltSegments);
      gl.bindTexture(gl.TEXTURE_2D, this.segmentTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, (k * SLOT_SEGMENTS) / SEGMENTS_ACROSS, SEGMENTS_ACROSS * SEGMENT_TEXELS, Math.ceil(items.segmentCount / SEGMENTS_ACROSS), gl.RGBA, gl.FLOAT, items.segments!, 0);
    }
    if (items.glyphCount > 0) {
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltGlyphs);
      gl.bindTexture(gl.TEXTURE_2D, this.glyphTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, (k * SLOT_GLYPHS) / GLYPHS_ACROSS, GLYPHS_ACROSS * GLYPH_TEXELS, Math.ceil(items.glyphCount / GLYPHS_ACROSS), gl.RGBA, gl.FLOAT, items.glyphs!, 0);
    }
  }

  // (the tests: a slot's items copied to its regions of the one arrays, its counts and lines)
  tested(k: number, items: SlotItems) {
    this.builds++;
    const counts = items.counts || { leaders: 0, branches: 0, main: 0, glyphs: 0, mainGlyphs: 0, steps: 0 };
    const made = this.made[k];
    made.leaders = items.segmentCount ? counts.leaders : 0;
    made.branches = items.segmentCount ? counts.branches : 0;
    made.main = items.segmentCount ? counts.main : 0;
    made.glyphs = items.glyphCount;
    made.mainGlyphs = items.glyphCount ? counts.mainGlyphs : 0;
    this.steps += counts.steps || 0;
    if (items.segmentCount) {
      this.segments.set(items.segments!.subarray(0, items.segmentCount * SEGMENT_FLOATS), k * SLOT_SEGMENTS * SEGMENT_FLOATS);
    }
    if (items.glyphCount) {
      this.glyphs.set(items.glyphs!.subarray(0, items.glyphCount * GLYPH_FLOATS), k * SLOT_GLYPHS * GLYPH_FLOATS);
    }
    for (let i = 0; i < SLOT_SEGMENTS; i++) {
      this.lineOf[k * SLOT_SEGMENTS + i] = i < items.segmentCount && items.lineOf ? items.lineOf[i] : null;
      this.pieceOf[k * SLOT_SEGMENTS + i] = i < items.segmentCount && items.pieceOf ? items.pieceOf[i] : 0;
    }
    let segments = 0;
    let glyphs = 0;
    for (let j = 0; j < SLOTS; j++) {
      const other = this.slotItems[j];
      if (other.segmentCount) {
        segments = j * SLOT_SEGMENTS + other.segmentCount;
      }
      if (other.glyphCount) {
        glyphs = j * SLOT_GLYPHS + other.glyphCount;
      }
    }
    this.segmentCount = segments;
    this.glyphCount = glyphs;
  }

  // the piece lists' job asked of its worker with this frame's inputs, after the frame's advance (the wallpaper's fork: the slots' growth and lights are set from this frame's time):
  // the slots' pieces, growth and lights as update will set them, and the segments of the slots whose items the worker does not hold yet (a copy of the used part: a typed array's
  // whole buffer is cloned). Null when nothing is lit (update then has nothing to cut). update takes the answer only when its inputs are still these (takeAnswer)
  fork(_time: number): Promise<void> | null {
    this.answered = null;
    const task = this.listTask;
    if (!task) {
      return null;
    }
    const share = this.drawsCharacters() ? 1 - CHARACTER_SHARE : 1;
    const slots: BoltListSlot[] = [];
    let lit = false;
    for (let k = 0; k < SLOTS; k++) {
      const items = this.slotItems[k];
      const count = items.segmentCount;
      const has = count > 0;
      const main = has ? this.levels[k * 3 + 1] : 0;
      const branch = has ? this.levels[k * 3 + 2] : 0;
      lit = lit || main > 0 || branch > 0;
      let segments: Float32Array | null = null;
      if (has && this.sentSlot[k] !== this.slotVersion[k] && items.segments) {
        segments = items.segments.slice(0, count * SEGMENT_FLOATS);
        this.sentSlot[k] = this.slotVersion[k];
      }
      slots.push({ version: this.slotVersion[k], count, segments, grown: M.TEST && this.cutOnCpu ? 1.5 : this.levels[k * 3], main, branch, radiance: this.radiance[k] });
    }
    if (!lit) {
      return null;
    }
    const input: BoltListInput = { slots, band: share, share };
    return task.ask(input).then((output) => {
      for (const k of output.missing) {
        this.sentSlot[k] = -1;
      }
      this.answered = { input, output };
    });
  }

  // the fork's answer when every input of the job is still this frame's (each slot's items version and count, growth, lights and radiance, the band's share) and the worker had
  // every slot's segments; else null (the lists are cut here). Taken once: cleared either way
  takeAnswer(share: number): BoltListOutput | null {
    const a = this.answered;
    this.answered = null;
    if (!a || a.output.missing.length > 0 || a.input.band !== share || a.input.share !== share) {
      return null;
    }
    for (let k = 0; k < SLOTS; k++) {
      const s = a.input.slots[k];
      if (s.version !== this.slotVersion[k] || s.count !== this.slotItems[k].segmentCount || s.grown !== this.grown[k] || s.main !== this.mainLight[k] || s.branch !== this.branchLight[k] || s.radiance !== this.radiance[k]) {
        return null;
      }
    }
    return a.output;
  }

  // this frame's lights, growths and the characters' age for the programs, the items made again
  // where a slot changed (and the programs warmed the first time), and the mask drawn
  update(time: number) {
    if (!this.warmed && this.band) {
      this.warm();
    }
    if (this.atlas.inks !== this.inksFrom) {
      this.uploadInks();
    }
    this.refresh();
    this.tinted = this.drawsCharacters();
    this.lit = false;
    for (let k = 0; k < SLOTS; k++) {
      const s = this.slots[k];
      const has = this.slotItems[k].segmentCount > 0;
      this.mainLight[k] = has ? this.levels[k * 3 + 1] : 0;
      this.branchLight[k] = has ? this.levels[k * 3 + 2] : 0;
      // (the tests' main-thread cut: the items already cut, every piece shown)
      this.grown[k] = M.TEST && this.cutOnCpu ? 1.5 : this.levels[k * 3];
      this.lit = this.lit || this.mainLight[k] > 0 || this.branchLight[k] > 0;
      // (a strike's age: short, so the places moved, worked out from it, stay small numbers)
      this.age[k] = s ? Math.max(0, time - s.start) : 0;
    }
    this.covers = this.lit && this.tinted;
    // (the brightest peak a piece sharing a pixel can have: the greatest radiance x the band's share x the slot's light; and the lists cut to the drawable pieces: the answer of
    // this frame's fork (Bolt.fork) when every input is still the one it was asked with, else worked out here with the same functions)
    const share = this.tinted ? 1 - CHARACTER_SHARE : 1;
    const answer = this.takeAnswer(share);
    this.others = answer ? answer.others : QualityBolt.peakBound(BoltList.brightest(this.radiance, this.mainLight, this.branchLight, share));
    this.filterLists(answer ? answer.masks : null);
    if (this.lit) {
      this.drawMask();
    }
    if (M.TEST) {
      const d = this.drawn;
      d.leaders = d.branches = d.main = d.glyphs = 0;
      for (let k = 0; k < SLOTS; k++) {
        const made = this.made[k];
        const branches = this.branchLight[k] > 0;
        const main = this.mainLight[k] > 0;
        // (the items made whole: the ones grown so far; the routes' parts before the meeting)
        const before = this.levels[k * 3] < 1;
        d.leaders += branches && before ? made.leaders : 0;
        d.branches += branches ? made.branches : 0;
        d.main += main && !before ? made.main : 0;
        d.glyphs += this.tinted ? (main && !before ? made.mainGlyphs : 0) + (branches ? made.glyphs - made.mainGlyphs : 0) : 0;
      }
    }
  }

  // the mask: the bands' shapes, their light, opacities and nearness, direct and mirrored, each
  // into its sums (added), and with Characters lightning the characters' ink (the most of it);
  // the light pass and what lies behind read it; no framebuffer left bound
  drawMask() {
    const gl = this.gl;
    this.mask.bind();
    gl.clearBufferfv(gl.COLOR, 0, this.none);
    gl.clearBufferfv(gl.COLOR, 1, this.none);
    gl.clearBufferfv(gl.COLOR, 2, this.none);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    // (every sum added)
    gl.blendEquation(gl.FUNC_ADD);
    this.drawItems(this.band, null, false, "bolt mask");
    this.drawItems(this.band, null, true, "bolt mask mirrored");
    // (the characters' ink the most of it; the sums given 0, kept: every value 0 or more)
    gl.blendEquation(gl.MAX);
    if (this.tinted) {
      this.drawItems(this.glyphMask, null, false, "bolt ink");
      this.drawItems(this.glyphMask, null, true, "bolt ink mirrored");
    }
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // the mask's opacities and nearness on their units, for what lies behind (the scene's cover,
  // the rain, the splashes, the water's mirrored sky, the light pass), from the mask's drawing
  // to the frame's last characters
  bindCover() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltCover);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.textures[1]);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltNear);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.textures[2]);
  }

  unbindCover() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltCover);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltNear);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // the scene's picture (bound, both its attachments) covered where the line and its characters
  // lie in front of it: past them what their opacity leaves, the fog's light in front of them
  // kept (inFront: the scene, not a test's view), over the screen in the guard's bands
  coverScene(inFront: boolean) {
    // (no piece seen directly and no character: the mask holds no direct opacity, the pass would draw nothing)
    if (this.listsUsable() && this.directDrawn === 0 && this.slotItems.every((items) => items.glyphCount === 0)) {
      return;
    }
    const gl = this.gl;
    const u = this.cover.use();
    gl.uniform1i(u.uInFront, inFront ? 1 : 0);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.guard.begin("bolt cover", "band");
    this.quad.drawTiled("bolt cover", this.mask.width, this.mask.height);
    this.guard.end();
    gl.disable(gl.BLEND);
  }

  // the shapes' light added to the picture bound (the caller's blending), over the screen in the
  // guard's bands; mirrored, the mirrored shapes
  drawLight(mirror: boolean) {
    // (no piece drawn in this view: the mask holds no light for it, the pass would add nothing)
    if (this.listsUsable() && (mirror ? this.mirrorDrawn : this.directDrawn) === 0) {
      return;
    }
    const gl = this.gl;
    const name = mirror ? "bolt light mirrored" : "bolt light";
    const u = this.light.use();
    gl.uniform3fv(u.uColor, this.tinted ? TINT : this.white);
    gl.uniform1f(u.uMirror, mirror ? -1 : 1);
    gl.uniform1i(u.uInked, this.covers ? 1 : 0);
    if (M.TEST) {
      gl.uniform1f(u.uViewScale, this.viewScale);
    }
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.texture);
    // (the shapes' sum and the nearness: on their unit, also without the cover)
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltNear);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.textures[2]);
    this.guard.begin(name, "band");
    this.quad.drawTiled(name, this.mask.width, this.mask.height);
    this.guard.end();
    if (!this.covers) {
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // every program drawn once into a picture of one pixel with as many attachments as it draws
  // into: the driver finishes a program when it is first drawn (otherwise in the frame of the
  // first strike)
  warm() {
    const gl = this.gl;
    this.warmed = true;
    this.warmMask.resize(1, 1);
    this.warmPair.resize(1, 1);
    this.warmItem.fill(0);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltSegments);
    gl.bindTexture(gl.TEXTURE_2D, this.segmentTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SEGMENT_TEXELS, 1, gl.RGBA, gl.FLOAT, this.warmItem, 0);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.boltGlyphs);
    gl.bindTexture(gl.TEXTURE_2D, this.glyphTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GLYPH_TEXELS, 1, gl.RGBA, gl.FLOAT, this.warmItem, 0);
    this.warmMask.bind();
    this.drawItems(this.band, 1, false, "bolt");
    this.drawItems(this.glyphMask, 1, false, "bolt ink");
    this.warmPair.bind();
    this.drawItems(this.distance, 1, false, "bolt distance");
    this.drawItems(this.glyph, 1, false, "bolt characters");
    this.light.use();
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.texture);
    this.quad.drawFull();
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.cover.use();
    this.quad.drawFull();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // the shapes' light and the characters drawn (mirrored: their reflection, and the pieces' core
  // distance), additive (the caller's blending); nothing while no slot gives light
  draw(mirror: boolean) {
    if (!this.lit) {
      return;
    }
    if (mirror) {
      this.drawItems(this.distance, null, true, "bolt distance mirrored");
    }
    this.drawLight(mirror);
    if (this.tinted) {
      this.drawItems(this.glyph, null, mirror, mirror ? "bolt characters mirrored" : "bolt characters");
    }
  }

  // a program's items drawn, each slot's from its region (warm: count, slot 0's first), in the
  // GPU guard's chunks
  drawItems(program: ShaderProgram, count: number | null, mirror: boolean, name: string) {
    const gl = this.gl;
    const u = program.use();
    const characters = program === this.glyph || program === this.glyphMask;
    gl.uniform3fv(u.uColor, this.white);
    gl.uniform1f(u.uMirror, mirror ? -1 : 1);
    gl.uniform4fv(u.uMainLight, this.mainLight);
    gl.uniform4fv(u.uBranchLight, this.branchLight);
    gl.uniform4fv(u.uGrown, this.grown);
    if (characters) {
      gl.uniform1fv(u.uGlyphEps, this.lod ? this.glyphEps : this.tailFull);
      gl.uniform1i(u.uGlyphs, this.atlas.count);
      gl.uniform1f(u.uHead, 0);
      gl.uniform4fv(u.uAge, this.age);
    } else {
      gl.uniform1i(u.uCovers, this.tinted ? 1 : 0);
      // (with Characters lightning the line the rest of the light)
      gl.uniform1f(u.uBand, this.tinted ? 1 - CHARACTER_SHARE : 1);
      gl.uniform1fv(u.uTailEps, this.lod ? this.tailEps : this.tailFull);
      gl.uniform1f(u.uOthers, this.others);
      // (a piece dropped by its light only in the mask: the reflection's distance output keeps every piece)
      gl.uniform1f(u.uDrop, program === this.band ? 1 : 0);
    }
    if (M.TEST && program === this.glyph) {
      gl.uniform1f(u.uViewScale, this.viewScale);
    }
    const chunk = this.guard.size(name, "chunk");
    if ((program === this.band || program === this.distance) && count === null && this.listsUsable()) {
      this.drawListed(u, name, chunk, mirror);
      return;
    }
    if (characters && count === null && this.glyphListUsable()) {
      this.drawGlyphListed(u, name, chunk, mirror);
      return;
    }
    gl.uniform1i(u.uListed, 0);
    gl.bindVertexArray(this.quad.plain);
    this.guard.begin(name, "chunk");
    for (let k = 0; k < SLOTS; k++) {
      const region = characters ? SLOT_GLYPHS : SLOT_SEGMENTS;
      let from = k * region;
      let to = from + (count !== null ? (k === 0 ? count : 0) : characters ? this.slotItems[k].glyphCount : this.slotItems[k].segmentCount);
      if (M.TEST && characters && this.onlyGlyph >= 0) {
        from = Math.max(from, this.onlyGlyph);
        to = Math.min(to, this.onlyGlyph + 1);
      }
      if (M.TEST && !characters && this.onlyPieces) {
        // (the tests: one line's pieces alone, [first, count])
        from = Math.max(from, this.onlyPieces[0]);
        to = Math.min(to, this.onlyPieces[0] + this.onlyPieces[1]);
      }
      if (to <= from) {
        continue;
      }
      gl.uniform1f(u.uSlot, k);
      for (let first = from; first < to; first += chunk) {
        gl.uniform1i(u.uFirst, first);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.min(chunk, to - first));
        this.guard.piece();
      }
    }
    this.guard.end();
  }

  // whether the characters are drawn from the lists of this frame's job (made for the items and the view now, and not a test's one character)
  glyphListUsable(): boolean {
    return this.listValid() && !(M.TEST && this.onlyGlyph >= 0);
  }

  // the characters of the list only (direct, or the mirror images from MOST_GLYPHS in the buffer): each slot's in chunks of the guard's size, each
  // chunk from its own place in the list
  drawGlyphListed(u: ReturnType<ShaderProgram["use"]>, name: string, chunk: number, mirror: boolean) {
    const gl = this.gl;
    const counts = mirror ? this.glyphMirrorCounts : this.glyphCounts;
    const list = mirror ? this.glyphMirrorList : this.glyphList;
    let total = 0;
    for (let k = 0; k < SLOTS; k++) {
      total += counts[k];
    }
    if (total === 0) {
      return;
    }
    const first = mirror ? MOST_GLYPHS : 0;
    gl.uniform1i(u.uListed, 1);
    gl.bindVertexArray(this.glyphArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glyphBuffer);
    if (!(mirror ? this.glyphMirrorUploaded : this.glyphUploaded)) {
      gl.bufferSubData(gl.ARRAY_BUFFER, first * 4, list, 0, total);
      if (mirror) {
        this.glyphMirrorUploaded = true;
      } else {
        this.glyphUploaded = true;
      }
    }
    this.guard.begin(name, "chunk");
    let at = first;
    for (let k = 0; k < SLOTS; k++) {
      const n = counts[k];
      if (n === 0) {
        continue;
      }
      gl.uniform1f(u.uSlot, k);
      for (let from = 0; from < n; from += chunk) {
        gl.vertexAttribIPointer(M.ATTRIBUTES.aDrop, 1, gl.UNSIGNED_INT, 0, (at + from) * 4);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.min(chunk, n - from));
        this.guard.piece();
      }
      at += n;
    }
    this.guard.end();
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.uniform1i(u.uListed, 0);
    gl.bindVertexArray(this.quad.plain);
  }

  // the direct bands of the listed pieces only: the list sent once to the start of its buffer, each slot's pieces in chunks of the
  // guard's size, each chunk from its own place in it (the attribute's offset), the slot's lights as for any draw
  drawListed(u: ReturnType<ShaderProgram["use"]>, name: string, chunk: number, mirror: boolean) {
    const gl = this.gl;
    const total = mirror ? this.mirrorDrawn : this.directDrawn;
    if (total === 0) {
      return;
    }
    const counts = mirror ? this.mirrorDrawCounts : this.drawCounts;
    const first = mirror ? MOST_SEGMENTS : 0;
    gl.uniform1i(u.uListed, 1);
    gl.bindVertexArray(this.listArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.listBuffer);
    if (!(mirror ? this.mirrorUploaded : this.directUploaded)) {
      gl.bufferSubData(gl.ARRAY_BUFFER, first * 4, this.drawList, first, total);
      if (mirror) {
        this.mirrorUploaded = true;
      } else {
        this.directUploaded = true;
      }
    }
    this.guard.begin(name, "chunk");
    let at = first;
    for (let k = 0; k < SLOTS; k++) {
      const n = counts[k];
      if (n === 0) {
        continue;
      }
      gl.uniform1f(u.uSlot, k);
      for (let first = 0; first < n; first += chunk) {
        gl.vertexAttribIPointer(M.ATTRIBUTES.aDrop, 1, gl.UNSIGNED_INT, 0, (at + first) * 4);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, Math.min(chunk, n - first));
        this.guard.piece();
      }
      at += n;
    }
    this.guard.end();
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.uniform1i(u.uListed, 0);
    gl.bindVertexArray(this.quad.plain);
  }
}

// an item's light now: its slot's main channel's or leaders' and branches' (never a dynamic
// index into a vector)
const LIGHT_GLSL = LIGHT_SOURCE;

// the bell's constants and its parts for a line of a size (pixels): its Gaussian's s^2, its
// tail's spread, where the tail starts; g at r pixels from the line; and how far it reaches
// (pixels)
const PROFILE_GLSL = fill(PROFILE_SOURCE, { "BELL_SPREAD.toFixed(4)": BELL_SPREAD.toFixed(4), "BELL_PX.toFixed(4)": BELL_PX.toFixed(4), "BELL_LEAST.toFixed(4)": BELL_LEAST.toFixed(4), "BELL_END.toFixed(1)": BELL_END.toFixed(1) });

// a piece's band: its ends (and size, radiance), the start of the piece before and the end of the
// piece after (and kind, slot), read by gl_InstanceID; faces the camera round the piece, as wide
// as its profile reaches
Bolt.bandVertex = (glsl) => fill(BAND_VERTEX_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "glsl.fog": glsl.fog, "M.GlyphAtlas.VERTEX_GLSL": M.GlyphAtlas.VERTEX_GLSL, "LIGHT_GLSL": LIGHT_GLSL, "PROFILE_GLSL": PROFILE_GLSL, "SEGMENTS_ACROSS": SEGMENTS_ACROSS, "SEGMENT_TEXELS": SEGMENT_TEXELS, "WIDEN_PX.toFixed(2)": WIDEN_PX.toFixed(2), "BAND_PER_SIZE.toFixed(6)": BAND_PER_SIZE.toFixed(6), "FOOTPRINT_FULL_PX.toFixed(1)": QualityBolt.FOOTPRINT_FULL_PX.toFixed(1), "QUALITY_LEVELS": QualityBolt.QUALITY_LEVELS, "TAIL_END_FLOOR.toFixed(1)": QualityBolt.TAIL_END_FLOOR.toFixed(1) });

// a band's shape: its profile by the distance of the ray through the pixel's middle to the piece,
// times its level and the fog's transmittance; nothing under the water (the highest wave first).
// mask: into its shape's channel of the mask (R, G direct, B, A mirrored: the main channel, every
// other line), its opacity (uCovers: COVER x the profile x min(1, its radiance / COVER_LIGHT); R
// direct, B mirrored) and its nearness (R direct, G mirrored); else (the reflection's distance)
// no light, the distance of its line (within half its size) as the second output
Bolt.bandFragment = (glsl, mask) => fill(BAND_FRAGMENT_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "glsl.waves": glsl.waves, "PROFILE_GLSL": PROFILE_GLSL, "nearOutput": mask ? NEAR_OUTPUT_SOURCE : "", "COVER.toFixed(4)": COVER.toFixed(4), "COVER_LIGHT.toFixed(4)": COVER_LIGHT.toFixed(4), "NEAR_SCALE.toFixed(1)": NEAR_SCALE.toFixed(1), "BAND_PER_SIZE.toFixed(6)": BAND_PER_SIZE.toFixed(6), "SHAPE_MOST.toFixed(4)": SHAPE_MOST.toFixed(4), "mask ? 1 : 0": mask ? 1 : 0 });

// the lightning's light: the combined shape x the light it carries
// (direct, or mirrored), white or TINT, under the characters' ink (uInked: 1 - the ink's
// opacity); no distance (the reflection's second output: as far as can be)
Bolt.lightFragment = (test) => fill(LIGHT_FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "M.Camera.FAR_DISTANCE.toFixed(1)": M.Camera.FAR_DISTANCE.toFixed(1) });

// what the line and its characters cover of the scene's picture behind them (blended ONE,
// ONE_MINUS_SRC_ALPHA: L - c (L - S)): their opacity c = 1 - (1 - line) (1 - ink), and the
// fog's light S between the eye and them (uInFront; the strikes' share of it for the second
// attachment, the emitters' light the scene reflects)
Bolt.coverFragment = (glsl) => fill(COVER_FRAGMENT_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "glsl.fog": glsl.fog, "NEAR_SCALE.toFixed(1)": NEAR_SCALE.toFixed(1), "COVER.toFixed(4)": COVER.toFixed(4) });

// a character's ink into the mask: its opacity (its ink x min(1, its radiance / COVER_LIGHT); G
// direct, A mirrored) and its nearness (R direct, G mirrored); no light; nothing under the water
Bolt.glyphMaskFragment = (glsl) => fill(GLYPH_MASK_FRAGMENT_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "glsl.waves": glsl.waves, "NEAR_SCALE.toFixed(1)": NEAR_SCALE.toFixed(1) });

// a character of Characters lightning: its place (its point, size, seed at rest, radiance for
// full ink, kind and slot, the joint before the next place, the next place and its rate) read by
// gl_InstanceID; moved, by its slot's age x its rate, the part of a place of the way to the next
// place, with the glyph of the place that many whole places before (the seed's 7919 a place
// back), its ink from
// the inks' rows (none: blank, not drawn); a plane in the world facing along z, as a rain
// character (the characters' fragment shader, or the mask's)
Bolt.glyphVertex = (glsl) => fill(GLYPH_VERTEX_SOURCE, { "FOOTPRINT_FULL_PX.toFixed(1)": QualityBolt.FOOTPRINT_FULL_PX.toFixed(1), "QUALITY_LEVELS": QualityBolt.QUALITY_LEVELS, "M.Camera.GLSL": M.Camera.GLSL, "glsl.fog": glsl.fog, "M.GlyphAtlas.VERTEX_GLSL": M.GlyphAtlas.VERTEX_GLSL, "M.HASH_GLSL": M.HASH_GLSL, "LIGHT_GLSL": LIGHT_GLSL, "GLYPHS_ACROSS": GLYPHS_ACROSS, "GLYPH_TEXELS": GLYPH_TEXELS, "MOST_GLYPHS / GLYPHS_ACROSS": MOST_GLYPHS / GLYPHS_ACROSS, "GLYPHS_ACROSS * GLYPH_TEXELS": GLYPHS_ACROSS * GLYPH_TEXELS, "COVER_LIGHT.toFixed(4)": COVER_LIGHT.toFixed(4) });

Bolt.MOST_SEGMENTS = MOST_SEGMENTS;
Bolt.MOST_GLYPHS = MOST_GLYPHS;
Bolt.GLYPH_FLOATS = GLYPH_FLOATS;
Bolt.BAND_PER_SIZE = BAND_PER_SIZE;
Bolt.SEGMENT_FLOATS = SEGMENT_FLOATS;
Bolt.SLOT_SEGMENTS = SLOT_SEGMENTS;
Bolt.SLOT_GLYPHS = SLOT_GLYPHS;
Bolt.GENERATION_LIGHT = ITEMS.GENERATION_LIGHT;
Bolt.GENERATION_THIN = ITEMS.GENERATION_THIN;
Bolt.CHARACTER_MAIN = CHARACTER_MAIN;
Bolt.CHARACTER_SPACING = CHARACTER_SPACING;
Bolt.CHARACTER_SHARE = CHARACTER_SHARE;
Bolt.CHARACTER_TRAVEL = ITEMS.TRAVEL;
Bolt.COVER = COVER;
Bolt.COVER_LIGHT = COVER_LIGHT;
Bolt.BELL_SPREAD = BELL_SPREAD;
Bolt.TINT = TINT;

M.Bolt = Bolt;
