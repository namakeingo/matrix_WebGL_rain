// The camera's bloom: the emitters' light spread as a lens spreads it, with no threshold: the
// characters' (drops, splashes, the bolt: Exposure's resolved HDR picture of them) and what the
// scene reflects of the emitters (the water pass's second output): the characters' mirror image
// on the water, where the waves bend it, and the strikes' light the fog and the air scatter and the
// water reflects. The sky's and the moon's light (seen, scattered by the fog or reflected by the
// water) is not spread: it is dim and smooth, too faint for its spread to show.
// - The spread: LEVELS levels, each half the size of the one before (a half, a quarter, an eighth
//   and a sixteenth of the screen at REFERENCE_ROWS rows), each its 2 x 2 boxes of the one before
//   (the first: of the two pictures added), blurred across and along by a Gaussian of SIGMA of its
//   own pixels (TAPS each way): each twice as wide as the one before, all as strong (a bright core
//   and a faint wide skirt). The spread at a pixel is their mean, each read bilinearly at its place.
// - A lens spreads light over a share of the view, not a number of pixels: above REFERENCE_ROWS
//   the screen is first halved `skip` times more (2 x 2 boxes, no blur), the nearest whole number
//   of halvings to the screen's rows over REFERENCE_ROWS (at most MOST_SKIP), so the levels cover
//   about the same share of the screen at any size (at 2160 rows: 2, its widest level 5.9% of the
//   height against 5.3% at 603).
// - Energy kept: the emitters' light shown is (1 - share) x their light + share x its spread
//   (every level keeps its light per area, the blur's weights add up to 1), so the bloom moves
//   light, it never adds or takes any (but past the screen's sides): the tone map adds
//   share x (spread - source) to the picture (bloomMoved). share is Bloom x SHARE_FULL; at Bloom 0
//   none of the passes runs and the picture is the one without bloom.
// - Each level is a section of the GPU guard ("bloom 1" to "bloom 4"), its passes drawn in its
//   bands; framebuffers made once (resized with the canvas); a level's blur's work picture let go
//   once read, and the levels once the tone map has read them (done()). The levels after the first
//   take their 2 x 2 boxes by one bilinear read (the same mean: a read at the texels' shared
//   corner weighs each a quarter; at an odd size's last row or column the edge's texel, as the
//   four reads did); the first reads its pictures' texels (they are not filtered).
// - Its programs are drawn once when they are ready, over one pixel, whatever Bloom says (the
//   driver finishes a program when it is first used).
// - Its result (render) binds its levels for the tone map itself (bind, unbind); `wanted` says
//   whether this frame makes one (the scene's second attachment is drawn into only then).
// Its GLSL (Bloom.GLSL, given to the tone map with the shared GLSL): the spread at a pixel and the
// light it moves there.
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/bloom.js).
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import type { ShaderProgram, RenderTarget, Programs, ProgramSources } from "../engine/gl";
import type { EffectContext } from "../engine/effect";
import BLOOM_SOURCE from "../shaders/bloom/bloom.glsl";
import DOWN_FRAGMENT_SOURCE from "../shaders/bloom/down_fragment.glsl";
import BLUR_FRAGMENT_SOURCE from "../shaders/bloom/blur_fragment.glsl";
import SHOW_FRAGMENT_SOURCE from "../shaders/bloom/show_fragment.glsl";

const LEVELS = 4;
// the rows the levels' sizes are set for, and the most halvings before the first level
const REFERENCE_ROWS = 603;
const MOST_SKIP = 3;
// the share of the emitters' light the spread takes at Bloom 100% (Bloom 40%: a quarter; to
// tune by eye)
const SHARE_FULL = 0.625;
// the blur: a Gaussian's sigma in a level's own pixels, and its taps each way
const SIGMA = 2;
const TAPS = 4;
const ACROSS = [1, 0];
const ALONG = [0, 1];
// the levels' texture units (Bloom.GLSL's samplers). Its passes' input is on M.UNITS.bloomFrom,
// which the strikes' bakes share (their shadow grid, Fog.bindStrikeInputs): each pass binds its
// input there itself, never relying on what was left bound
const LEVEL_UNITS = [M.UNITS.bloom1, M.UNITS.bloom2, M.UNITS.bloom3, M.UNITS.bloom4];
const LEVEL_SAMPLERS = { uBloom1: M.UNITS.bloom1, uBloom2: M.UNITS.bloom2, uBloom3: M.UNITS.bloom3, uBloom4: M.UNITS.bloom4 };

// a level: its guard's section, its scale (the screen's size over its size), its picture and its
// blur's work picture
interface BloomLevel {
  name: string;
  scale: number;
  picture: RenderTarget;
  work: RenderTarget;
}

// what the tone map reads (Bloom.render's result): the share this frame (0: no bloom), the first
// level's scale, the levels' pictures, and their binding on their units
export interface BloomResult {
  share: number;
  first: number;
  textures: (WebGLTexture | null)[];
  bind: () => void;
  unbind: () => void;
}

export class Bloom extends M.Effect {
  // the bloom is the picture's post-processing: not an effect of the quality pool
  static IN_QUALITY = false;
  static GLSL: string;
  static TAPS: number;
  static SIGMA: number;
  static SHARE_FULL: number;
  static REFERENCE_ROWS: number;
  static LEVELS: number;
  static SHOW_FRAGMENT: string;
  static BLUR_FRAGMENT: string;
  static DOWN_FRAGMENT: string;
  static skipFor: (rows: number) => number;
  // (with M.TEST only: on the prototype)
  readBack!: (from: WebGLTexture | null, mode: number, reflected: WebGLTexture | null) => Float32Array;
  // (made in init; show with M.TEST only)
  show!: ShaderProgram;
  blur!: ShaderProgram;
  down!: ShaderProgram;
  // (with M.TEST only)
  shown!: RenderTarget | null;
  bypass!: boolean;
  warmed: boolean;
  height: number;
  width: number;
  result: BloomResult;
  share: number;
  halves: RenderTarget[];
  skip: number;
  levels: BloomLevel[];
  constructor(context: EffectContext) {
    super(context);
    const gl = this.gl;
    const format = this.caps.floats ? gl.RGBA16F : gl.RGBA8;
    // each level: its picture (read bilinearly by the tone map) and its blur's work picture
    this.levels = [];
    for (let n = 1; n <= LEVELS; n++) {
      this.levels.push({ name: `bloom ${n}`, scale: 2 ** n, picture: this.target({ format, filter: gl.LINEAR }), work: this.target({ format }) });
    }
    // the halvings before the first level (skip of them used) and their pictures
    this.skip = 0;
    this.halves = [];
    for (let n = 1; n <= MOST_SKIP; n++) {
      this.halves.push(this.target({ format, filter: gl.LINEAR }));
    }
    this.share = 0.4 * SHARE_FULL;
    // what the tone map reads: the share this frame (0: no bloom) and the levels' pictures, bound
    // on their units by the result itself
    const textures: (WebGLTexture | null)[] = new Array(LEVELS).fill(null);
    this.result = {
      share: 0,
      // the first level's scale (the screen's size over its size)
      first: 2,
      textures,
      bind: () => {
        for (let n = 0; n < LEVELS; n++) {
          gl.activeTexture(gl.TEXTURE0 + LEVEL_UNITS[n]);
          gl.bindTexture(gl.TEXTURE_2D, textures[n]);
        }
      },
      unbind: () => {
        for (let n = 0; n < LEVELS; n++) {
          gl.activeTexture(gl.TEXTURE0 + LEVEL_UNITS[n]);
          gl.bindTexture(gl.TEXTURE_2D, null);
        }
      },
    };
    this.width = 0;
    this.height = 0;
    this.warmed = false;
    // (the tests': the bloom left out whatever Bloom says, and the picture readBack draws into)
    if (M.TEST) {
      this.bypass = false;
      this.shown = null;
    }
  }

  // whether this frame makes a bloom (Bloom above 0)
  get wanted() {
    return this.share > 0 && !(M.TEST && this.bypass);
  }

  static programs(): ProgramSources {
    const programs: ProgramSources = {
      bloomDown: [M.FULL_VERTEX, Bloom.DOWN_FRAGMENT],
      bloomBlur: [M.FULL_VERTEX, Bloom.BLUR_FRAGMENT],
    };
    if (M.TEST) {
      programs.bloomShow = [M.FULL_VERTEX, Bloom.SHOW_FRAGMENT];
    }
    return programs;
  }

  static properties() {
    return { p106_setting_Bloom: (bloom: Bloom, v: number) => (bloom.share = (v / 100) * SHARE_FULL) };
  }

  init(programs: Programs) {
    [this.down, this.blur] = this.ownPrograms(programs, ["bloomDown", "bloomBlur"]);
    this.down.samplers({ uFrom: M.UNITS.bloomFrom, uFromAdd: M.UNITS.hdrReflected });
    this.blur.samplers({ uFrom: M.UNITS.bloomFrom });
    if (M.TEST) {
      [this.show] = this.ownPrograms(programs, ["bloomShow"]);
      this.show.samplers(Object.assign({ uFrom: M.UNITS.bloomFrom, uFromAdd: M.UNITS.hdrReflected }, LEVEL_SAMPLERS));
    }
    this.warmed = false;
    if (this.width > 0) {
      this.warm();
    }
  }

  // its programs drawn once over one pixel of the last level (the driver finishes a program at
  // its first draw: not in a frame that is shown)
  warm() {
    const gl = this.gl;
    const level = this.levels[LEVELS - 1];
    this.warmed = true;
    gl.disable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    for (const linear of [false, true]) {
      const u = this.down.use();
      gl.uniform1i(u.uAdd, 0);
      gl.uniform1i(u.uLinear, linear ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
      gl.bindTexture(gl.TEXTURE_2D, level.work.texture);
      level.picture.bind();
      this.quad.drawFull();
    }
    gl.uniform2i(this.blur.use().uStep, 1, 0);
    gl.bindTexture(gl.TEXTURE_2D, level.picture.texture);
    level.work.bind();
    this.quad.drawFull();
    gl.disable(gl.SCISSOR_TEST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.skip = Bloom.skipFor(height);
    this.halves.forEach((half, n) => {
      const scale = n < this.skip ? 2 ** (n + 1) : Infinity;
      half.resize(Math.max(1, Math.ceil(width / scale)), Math.max(1, Math.ceil(height / scale)));
    });
    this.levels.forEach((level, n) => {
      level.scale = 2 ** (this.skip + n + 1);
      const w = Math.max(1, Math.ceil(width / level.scale));
      const h = Math.max(1, Math.ceil(height / level.scale));
      level.picture.resize(w, h);
      level.work.resize(w, h);
    });
    this.result.first = this.levels[0].scale;
    if (!this.warmed && this.down) {
      this.warm();
    }
  }

  // one pass: a program reading `from` (on the bloom's input unit) into a level's picture (the
  // boxes: with add, the second picture, on its unit, added; linear: by one bilinear read)
  pass(program: ShaderProgram, from: WebGLTexture | null, target: RenderTarget, name: string, step: number[] | null, add?: boolean, linear?: boolean) {
    const gl = this.gl;
    const u = program.use();
    if (step) {
      gl.uniform2i(u.uStep, step[0], step[1]);
    } else {
      gl.uniform1i(u.uAdd, add ? 1 : 0);
      gl.uniform1i(u.uLinear, linear ? 1 : 0);
    }
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_2D, from);
    target.bind();
    this.quad.drawTiled(name, target.width, target.height);
  }

  // the levels made from the emitters' pictures (textures of the canvas's size: the characters',
  // and the characters' light the water reflects, or none); gives what the tone map reads (its
  // share 0 when there is no bloom: nothing drawn)
  render(texture: WebGLTexture | null, reflected: WebGLTexture | null) {
    const result = this.result;
    result.share = 0;
    if (!this.wanted || !(this.share > 0 && texture)) {
      return result;
    }
    const gl = this.gl;
    if (!this.warmed) {
      this.warm();
    }
    gl.disable(gl.BLEND);
    if (reflected) {
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdrReflected);
      gl.bindTexture(gl.TEXTURE_2D, reflected);
    }
    let from = texture;
    if (this.skip > 0) {
      this.guard.begin("bloom halves", "band");
      for (let n = 0; n < this.skip; n++) {
        const half = this.halves[n];
        this.pass(this.down, from, half, "bloom halves", null, n === 0 && !!reflected, n > 0);
        from = half.texture;
      }
      this.guard.end();
    }
    for (let n = 0; n < LEVELS; n++) {
      const level = this.levels[n];
      this.guard.begin(level.name, "band");
      this.pass(this.down, from, level.picture, level.name, null, n === 0 && this.skip === 0 && !!reflected, n > 0 || this.skip > 0);
      this.pass(this.blur, level.picture.texture, level.work, level.name, ACROSS);
      this.pass(this.blur, level.work.texture, level.picture, level.name, ALONG);
      this.guard.end();
      level.work.invalidate();
      if (n === 0 && this.skip > 0) {
        for (let k = 0; k < this.skip; k++) {
          this.halves[k].invalidate();
        }
      }
      from = level.picture.texture;
      result.textures[n] = from;
    }
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdrReflected);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    result.share = this.share;
    return result;
  }

  // the levels' contents let go (once the tone map has read them)
  done() {
    if (this.result.share > 0) {
      for (const level of this.levels) {
        level.picture.invalidate();
      }
    }
  }
}

if (M.TEST) {
  // (for the tests) a picture of the canvas's size drawn from the last render and read back as
  // floats (RGBA, bottom row first): mode 0 to 3 a level alone, 4 the emitters' light with its
  // bloom (the share of the last render), 5 the emitters' light alone, 6 the reflected alone;
  // from, reflected: the emitters' pictures given to that render (reflected: none, or the
  // characters' light the water reflects)
  Bloom.prototype.readBack = function (from, mode, reflected) {
    const gl = this.gl;
    if (!this.shown) {
      this.shown = this.target({ format: gl.RGBA16F });
    }
    this.shown.resize(this.width, this.height);
    const u = this.show.use();
    gl.uniform1i(u.uMode, mode);
    gl.uniform1f(u.uBloom, this.result.share);
    gl.uniform1f(u.uBloomFirst, this.result.first);
    gl.uniform1i(u.uAdd, reflected ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdrReflected);
    gl.bindTexture(gl.TEXTURE_2D, reflected || null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_2D, from);
    this.result.bind();
    this.shown.bind();
    this.guard.begin("bloom read", "band");
    this.quad.drawTiled("bloom read", this.width, this.height);
    this.guard.end();
    const out = new Float32Array(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.result.unbind();
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdrReflected);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return out;
  };
}

// the halvings before the first level at a screen of `rows` rows
Bloom.skipFor = (rows) => Math.min(MOST_SKIP, Math.max(0, Math.round(Math.log2(rows / REFERENCE_ROWS))));

Bloom.LEVELS = LEVELS;
Bloom.REFERENCE_ROWS = REFERENCE_ROWS;
Bloom.SHARE_FULL = SHARE_FULL;
Bloom.SIGMA = SIGMA;
Bloom.TAPS = TAPS;

// the spread at a pixel (at: gl_FragCoord.xy of the canvas's size): the levels' mean, each read
// bilinearly where the pixel's middle is in it (uBloomFirst: the first level's scale); the light the bloom moves there, from the
// emitters' light there (source; uBloom: the share; 0, none); and that light with it
Bloom.GLSL = BLOOM_SOURCE;

// a level from the one before (or the pictures: with uAdd, the second added to the first): the
// mean of its 2 x 2 texels (the last row and column of an odd size read again); with uLinear
// (a filtered source) by one bilinear read at their shared corner
Bloom.DOWN_FRAGMENT = DOWN_FRAGMENT_SOURCE;

// one way of a level's blur (uStep: across or along): a Gaussian of SIGMA texels, TAPS each way,
// its weights adding up to 1 (texels past the sides: the side's)
Bloom.BLUR_FRAGMENT = fill(BLUR_FRAGMENT_SOURCE, { "TAPS": TAPS, "SIGMA.toFixed(1)": SIGMA.toFixed(1) });

// (for the tests) a level alone (uMode 0 to 3), the emitters' light (the first picture, and the
// second with uAdd) with its bloom (4), or alone (5), or the second alone (6)
Bloom.SHOW_FRAGMENT = fill(SHOW_FRAGMENT_SOURCE, { "Bloom.GLSL": Bloom.GLSL });

M.Bloom = Bloom;
