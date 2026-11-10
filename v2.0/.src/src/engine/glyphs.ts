// The characters: the typed Symbols, each drawn once into its own layer of a texture array
// (WebGL 2.0: immutable storage with texStorage3D, mipmaps per layer, so no character bleeds
// into another at any size, and any number of them), made again only when Symbols changes
// (never per frame: fillText in the frames grows Chromium's text caches without end).
// And the GLSL every character shares (the rain's and the splashes'): in its vertex shader
// (GlyphAtlas.VERTEX_GLSL) its mirror image's fade by its height, whether it is on the screen, and
// what the fog lets through to a corner; and its fragment shader:
// - its ink (a pixel with none adds no light: skipped before any other work);
// - hidden where it is below the water's surface (and so is its mirror image);
// - its light in its trail, as its vertex shader gives it (already dimmed by the fog along its
//   way, read at its corners); its head
//   (Head brightness, uHead 0 to 1) whitened by uHead and giving 1 + HEAD_GAIN x uHead times the
//   light: an emitter's own light, the same at any distance (HDR: past 1 it whitens further in the
//   tone map);
// - a second output, its distance from the eye where its ink is (otherwise far): drawn into the
//   reflection's distance picture, the nearest kept (blending MIN);
// - covered (the rain's and the splashes': fragment(glsl, test, vertexColor, true)): with
//   Characters lightning (uCovered), a character further from the eye than the bolt's line or its
//   characters at the pixel (the bolt's nearness, uBoltNear: NEAR_SCALE over the distance of the
//   lines there, their mean by their shapes: r, g the sums of shape x nearness, b, a of the shapes)
//   lets through only what their opacities leave (uBoltCover: the line's and its characters'
//   opacity, direct in r, g, mirrored in b, a: (1 - line) x (1 - ink), the lines' added, at most
//   the bolt's COVER); one in front is not covered.
// Each character's ink (inks: its mean over its cell, 0 to 1) and their mean (meanInk), from the
// canvas they are drawn on, once when the atlas is made.
// The characters are drawn (GlyphAtlas.drawBatch, models/atlas.ts, on any 2D canvas) in the
// scene's worker where there is one (useWorker: on its OffscreenCanvas, sent back as an
// ImageBitmap a batch with their inks), the atlas before them kept until they come; else here, on
// an OffscreenCanvas (a page's canvas without one). The layers' limit is read once, when the atlas
// is made. The head's whitening and gain (HEAD, HEAD_GAIN) are the drops' material
// (materials/drops.ts).
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/engine/ (was engine/glyphs.js); the drawing moved to
//   models/atlas.ts (drawBatch, SIZE, BATCH), the head's whitening and gain to materials/drops.ts.
// 2026-11-03: the characters drawn in the scene's worker (drawBatch on its OffscreenCanvas), the
//   layers' limit read once; DEFAULT_SYMBOLS here (index.js's before).
// 2026-11-03: each character's own ink (inks), and the share of the characters with ink
//   (inkedShare), for the characters bolt's light per character.
// 2026-11-03: covered by the bolt's line and characters where they lie in front (uCovered,
//   uBoltCover, uBoltNear; GlyphAtlas.NEAR_SCALE, COVER_BEHIND).
import { M } from "./core";
import { fill } from "./glsl";
import VERTEX_SOURCE from "../shaders/glyphs/vertex.glsl";
import FRAGMENT_SOURCE from "../shaders/glyphs/fragment.glsl";
import COLOR_UNIFORM_SOURCE from "../shaders/glyphs/color_uniform.glsl";
import COLOR_VERTEX_SOURCE from "../shaders/glyphs/color_vertex.glsl";
import { SIZE, BATCH, drawBatch } from "../models/atlas";
import type { AtlasContext } from "../models/atlas";
import { HEAD, HEAD_GAIN } from "../materials/drops";
import type { SceneWorker } from "../workers/sceneworker";
import type { Uniforms } from "./gl";

// the bolt's nearness is NEAR_SCALE / its distance (m), at most 1; a character is behind it when
// further than COVER_BEHIND of its distance (the line's thickness and the half floats' rounding)
const NEAR_SCALE = 1;
const COVER_BEHIND = 1.01;
// the Symbols setting's default (project.json's)
const DEFAULT_SYMBOLS = "日 ﾊ ﾐ ﾋ ｰ ｳ ｼ ﾅ ﾓ ﾆ ｻ ﾜ ﾂ ｵ ﾘ ｱ ﾎ ﾃ ﾏ ｹ ﾒ ｴ ｶ ｷ ﾑ ﾕ ﾗ ｾ ﾈ ｽ ﾀ ﾇ 0 1 2 3 4 5 7 8 9 : ・ . \" = * + - < > ¦｜╌ ( ← . Z ç ﾘ ｸ M A T R I X - N A M A K E I N G O";

export class GlyphAtlas {
  static COVER_BEHIND: number;
  static DEFAULT_SYMBOLS: string;
  static BATCH: number;
  static SIZE: number;
  static drawBatch: typeof drawBatch;
  static setNearness: (gl: WebGL2RenderingContext, u: Uniforms, nearFar: ArrayLike<number> | null) => void;
  static VERTEX_GLSL: string;
  static HEAD: number;
  static fragment: (glsl: { waves: string }, test: boolean, vertexColor?: boolean, covered?: boolean) => string;
  static NEAR_SCALE: number;
  waiting: boolean;
  generation: number;
  worker: SceneWorker | null;
  ctx: AtlasContext | null;
  canvas: OffscreenCanvas | HTMLCanvasElement | null;
  maxLayers: number;
  inkedShare: number;
  inks: Float32Array;
  meanInk: number;
  symbols: string | null;
  glyphs: string[];
  texture: WebGLTexture | null;
  gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.texture = null;
    this.glyphs = [];
    this.symbols = null;
    // the characters' mean ink (0 to 1, blanks included), each one's, and the share of them with
    // any (over 0.01), from the canvas they are drawn on
    this.meanInk = 0;
    this.inks = new Float32Array(0);
    this.inkedShare = 0;
    // the most layers (read once), the canvas drawn on here (made when first needed), the
    // scene's worker (null: drawn here), and the newest atlas asked for (a generation)
    this.maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
    this.canvas = null;
    this.ctx = null;
    this.worker = null;
    this.generation = 0;
    this.waiting = false;
  }

  // the scene's worker for the drawing (null: drawn here)
  useWorker(client: SceneWorker | null) {
    this.worker = client;
  }

  // draws the characters of a text (each one, spaces too: a blank character, as the web
  // version picks from its Symbols): in the worker (the atlas before kept until they come), or
  // here at once
  build(symbols: string) {
    if (symbols === this.symbols && (this.texture || this.waiting)) {
      return;
    }
    this.symbols = symbols;
    const glyphs = Array.from(symbols);
    if (glyphs.length === 0) {
      glyphs.push(" ");
    }
    const layers = Math.min(glyphs.length, this.maxLayers);
    glyphs.length = layers;
    const generation = ++this.generation;
    if (!this.worker) {
      this.drawHere(glyphs, layers);
      return;
    }
    this.waiting = true;
    this.worker.glyphs({ generation, glyphs, layers }).then(
      (r) => {
        if (r && generation === this.generation) {
          this.waiting = false;
          this.begin(layers);
          for (let k = 0; k < r.bitmaps.length; k++) {
            this.upload(r.bitmaps[k], k * BATCH, Math.min(BATCH, layers - k * BATCH));
          }
          this.finish(glyphs, layers, r.inks, r.ink);
        }
        if (r) {
          r.bitmaps.forEach((bitmap) => bitmap.close());
        }
      },
      () => {
        // (the worker could not draw them: drawn here, now and from then on)
        if (generation === this.generation) {
          this.waiting = false;
          this.worker = null;
          this.drawHere(glyphs, layers);
        }
      }
    );
  }

  // the characters drawn here, a batch at a time, each batch sent to its layers
  drawHere(glyphs: string[], layers: number) {
    if (!this.ctx) {
      this.canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(SIZE, SIZE * BATCH) : document.createElement("canvas");
      this.canvas.width = SIZE;
      this.canvas.height = SIZE * BATCH;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true }) as AtlasContext | null;
    }
    const inks = new Float32Array(layers);
    let ink = 0;
    this.begin(layers);
    for (let first = 0; first < layers; first += BATCH) {
      const count = Math.min(BATCH, layers - first);
      ink += GlyphAtlas.drawBatch(this.ctx!, glyphs, first, count, inks);
      this.upload(this.canvas!, first, count);
    }
    this.finish(glyphs, layers, inks, ink);
  }

  // a new texture of `layers` layers (the one before deleted)
  begin(layers: number) {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.atlas);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.log2(SIZE) + 1, gl.R8, SIZE, SIZE, layers);
  }

  // a batch's characters (a canvas or an ImageBitmap, each SIZE rows under the last) into its
  // layers
  upload(source: TexImageSource, first: number, count: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.atlas);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, SIZE);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, first, SIZE, SIZE, count, gl.RED, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
  }

  // the mipmaps and the characters' inks (ink: their sum, in levels of 255 over the pixels)
  finish(glyphs: string[], layers: number, inks: Float32Array, ink: number) {
    const gl = this.gl;
    this.glyphs = glyphs;
    this.inks = inks;
    this.meanInk = ink / (255 * SIZE * SIZE * layers);
    this.inkedShare = inks.filter((v) => v > 0.01).length / layers;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.atlas);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // (at least 1: the shaders pick a character modulo it, also before the first atlas comes)
  get count() {
    return Math.max(1, this.glyphs.length);
  }

  destroy() {
    // (an atlas still coming from the worker dropped)
    this.generation++;
    this.waiting = false;
    this.gl.deleteTexture(this.texture);
    this.texture = null;
  }
}

// count characters drawn on a 2D canvas's context, each one's ink into inks (models/atlas.ts)
GlyphAtlas.drawBatch = drawBatch;
GlyphAtlas.SIZE = SIZE;
GlyphAtlas.BATCH = BATCH;
GlyphAtlas.DEFAULT_SYMBOLS = DEFAULT_SYMBOLS;

// the characters' vertex GLSL (after Camera.GLSL and Fog.GLSL):
// - whether a character, its middle at clip, is on the screen (its middle within MARGIN of the
//   screen's size past each side: a character near the side still shows whole);
// - what the fog lets through to a corner (world, at clip; mirrored: from the mirrored volume)
GlyphAtlas.VERTEX_GLSL = VERTEX_SOURCE;

GlyphAtlas.HEAD = HEAD;
GlyphAtlas.NEAR_SCALE = NEAR_SCALE;
GlyphAtlas.COVER_BEHIND = COVER_BEHIND;

// the characters' fragment shader, with the camera and the waves (whose GLSL it is given; test:
// their light scaled by uViewScale, so a test can read light past 1); their colour from their
// vertex shader (vertexColor: vColor, each drop's and splash's own) or a uniform (uColor);
// covered: dimmed where the bolt covers them (see above)
GlyphAtlas.fragment = (glsl, test, vertexColor, covered) => fill(FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "COVERED": covered ? "#define COVERED" : "", "color": vertexColor ? COLOR_VERTEX_SOURCE : COLOR_UNIFORM_SOURCE, "M.Camera.GLSL": M.Camera.GLSL, "glsl.waves": glsl.waves, "M.Nearness.GLSL": M.Nearness.GLSL, "HEAD_GAIN.toFixed(1)": HEAD_GAIN.toFixed(1), "NEAR_SCALE.toFixed(1)": NEAR_SCALE.toFixed(1), "COVER_BEHIND.toFixed(3)": COVER_BEHIND.toFixed(3), "(covered ? M.Bolt.COVER : 0).toFixed(4)": (covered ? M.Bolt.COVER : 0).toFixed(4) });

// the Nearness view in a program of the characters' fragment shader (nearFar: the rain's nearest
// and furthest distances; null: off)
GlyphAtlas.setNearness = (gl, u, nearFar) => {
  gl.uniform1i(u.uNearness, nearFar ? 1 : 0);
  if (nearFar) {
    gl.uniform2f(u.uNearFar, nearFar[0], nearFar[1]);
  }
};

M.GlyphAtlas = GlyphAtlas;
