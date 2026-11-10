// The camera's response: the scene is drawn into two HDR pictures (half floats where they can be
// drawn into: light is kept past 1), the sky, water and fog into one of one sample a pixel (a
// full-screen pass: nothing in it to antialias), the characters (rain and splashes, added up)
// into a multisampled one (SAMPLES samples, their antialiasing) cleared to no light, then
// resolved. The sky, water and fog's picture has a second attachment: the emitters' light the
// scene reflects (the characters' mirror image on the water, the strikes' light the fog and the
// air scatter and the water reflects), as the water's pass shows it (part of the first's light,
// kept apart for the bloom). The two pictures added together are shown on the canvas by exposure (gain: the Exposure setting), a
// filmic tone map (ACES, Narkowicz's fit) and the sRGB curve, with the bloom of the emitters'
// light: the characters' own and what the scene reflects of the emitters (Bloom made its levels
// from both;
// the light it moves, Bloom.GLSL's bloomMoved, added); the tests' views as they are (linear,
// clamped, without the bloom).
// Once shown, the pictures' contents are let go (invalidateFramebuffer). The sky, water and fog's
// picture is not cleared when the water's pass covers it all (every frame but the tests' views).
// Its second attachment is always drawn into (its draw buffer never NONE: through ANGLE's Direct3D
// 11 a pixel shader is compiled again for each set of draw buffers, seconds the first frame with
// the other set waits for); it is the bloom's to read only in a frame that makes one. The bloom's
// GLSL comes with the shared GLSL (glsl.bloom), its levels bound by Bloom's own result (bind,
// unbind).
// OLED Pixel Shift: the whole scene's picture shifted across where it is shown (shiftX, device
// pixels, set by src/index.ts each frame from the text's shift): the screen's pixel x shows the
// scene's x - shiftX, the column it uncovers black.
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/exposure.js).
// 2026-11-04: shiftX, the scene's OLED shift where it is shown.
// 2026-11-05: gain, the Exposure setting (was a constant 1).
// 2026-11-05: packHdr, the HDR picture packed into the canvas (twice as wide) for an ImageBitmap.
// 2026-11-05: the HDR picture is RGB10_A2 (the encoded output over 0 to HdrOutput.ENCODED_MAX), 4 bytes a pixel.
// 2026-11-05: the HDR output (hdr, headroom): the tone map drawn into a half-float picture of its own by
//   HdrOutput's curve, sRGB-encoded (extended above 1) in SDR-white units, for the HDR bridge to read back.
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import type { ShaderProgram, RenderTarget, MultisampleTarget, Programs, ProgramSources } from "../engine/gl";
import type { EffectContext, SharedGlsl } from "../engine/effect";
import type { BloomResult } from "./bloom";
import FRAGMENT_SOURCE from "../shaders/exposure/fragment.glsl";
import PACK_SOURCE from "../shaders/hdr/pack_fragment.glsl";

const SAMPLES = 4;
const STOP = 25;

export class Exposure extends M.Effect {
  // the exposure is the picture's post-processing: not an effect of the quality pool
  static IN_QUALITY = false;
  static fragment: (bloomGlsl: string) => string;
  // the multiplier of all the light before the tone map (the Exposure setting; 1: as it was)
  gain: number;
  // the HDR output: this frame's tone map goes into hdrOut by the HDR curve (set by src/index.ts each
  // frame; never for the tests' raw views or the Nearness view), its headroom a multiple of SDR white
  hdr: boolean;
  headroom: number;
  hdrOut: RenderTarget | null;
  // whether the last finish drew into hdrOut (left bound, for the readback)
  drawnHdr: boolean;
  // (made in init)
  program!: ShaderProgram;
  // the pass that packs the HDR picture into the canvas for an ImageBitmap (HdrPack), and whether it was drawn once
  pack!: ShaderProgram;
  packWarmed: boolean;
  keep: boolean;
  shiftX: number;
  secondWritten: boolean;
  resolved: boolean;
  none: Float32Array;
  black: Float32Array;
  glyphs: MultisampleTarget;
  scene: RenderTarget;
  constructor(context: EffectContext) {
    super(context);
    const gl = this.gl;
    const format = this.caps.floats ? gl.RGBA16F : gl.RGBA8;
    // (its light, and the emitters' light in it: see Water)
    this.scene = this.target({ formats: [format, format] });
    this.glyphs = this.multisampleTarget({ format, samples: SAMPLES });
    this.black = new Float32Array([0, 0, 0, 1]);
    this.none = new Float32Array([0, 0, 0, 0]);
    // whether the characters' picture is resolved this frame; whether the last frame made a bloom
    // (the second attachment then the bloom's to read: set by begin)
    this.resolved = false;
    this.secondWritten = false;
    // (the tests': the pictures kept after they are shown, to read them)
    this.keep = false;
    // the scene's shift across where it is shown (device pixels: OLED Pixel Shift)
    this.shiftX = 0;
    this.gain = 1;
    this.hdr = false;
    this.headroom = M.HdrOutput.MAX_HEADROOM;
    this.hdrOut = null;
    this.drawnHdr = false;
    this.packWarmed = false;
  }

  // the Exposure setting (0 to 100, 50 = 1) as the tone map's multiplier: a doubling per 25 steps
  static gain(value: number): number {
    return 2 ** ((value - 50) / STOP);
  }

  static properties() {
    return { p107_setting_Exposure: (exposure: Exposure, v: number) => (exposure.gain = Exposure.gain(v)) };
  }

  static programs(glsl: SharedGlsl): ProgramSources {
    return { toneMap: [M.FULL_VERTEX, Exposure.fragment(glsl.bloom)], hdrPack: [M.FULL_VERTEX, fill(PACK_SOURCE, { "packGlsl": M.HdrPack.GLSL })] };
  }

  init(programs: Programs) {
    [this.program, this.pack] = this.ownPrograms(programs, ["toneMap", "hdrPack"]);
    this.pack.samplers({ uPicture: M.UNITS.hdr });
    // (the size may be known already: warm it now; else resize does)
    if (!this.packWarmed && this.scene.width > 0) {
      this.warmPack(this.scene.width, this.scene.height);
    }
    this.program.samplers({
      uScene: M.UNITS.hdr,
      uGlyphs: M.UNITS.hdrGlyphs,
      uReflected: M.UNITS.hdrReflected,
      uBloom1: M.UNITS.bloom1,
      uBloom2: M.UNITS.bloom2,
      uBloom3: M.UNITS.bloom3,
      uBloom4: M.UNITS.bloom4,
    });
  }

  resize(width: number, height: number) {
    this.scene.resize(width, height);
    // (the programs may not be made yet: init warms it then)
    if (!this.packWarmed && this.pack) {
      this.warmPack(width, height);
    }
    this.glyphs.resize(width, height);
    if (this.hdrOut) {
      this.hdrOut.resize(width, height);
    }
  }

  // the HDR picture the tone map is drawn into (made at the first HDR frame, its size the scene's)
  hdrTarget(): RenderTarget {
    if (!this.hdrOut) {
      this.hdrOut = this.target({ format: this.gl.RGB10_A2 });
      this.hdrOut.resize(this.scene.width, this.scene.height);
    }
    return this.hdrOut;
  }

  // the pack pass drawn once over one pixel (the driver finishes a program at its first draw: this one is first
  // wanted when HDR is turned on, not in a frame that is shown); the scene's picture stands in for the HDR one,
  // which is made only when HDR is used
  warmPack(width: number, height: number) {
    const gl = this.gl;
    this.packWarmed = true;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    const u = this.pack.use();
    gl.uniform1i(u.uWidth, width);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdr);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.texture);
    this.quad.drawFull();
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.SCISSOR_TEST);
  }

  // the HDR picture packed into the canvas (2 x its width wide, the default framebuffer) for an ImageBitmap:
  // the high 8 bits of each level on the left, the low 2 bits on the right (HdrPack)
  packHdr() {
    const gl = this.gl;
    const target = this.hdrTarget();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 2 * target.width, target.height);
    const u = this.pack.use();
    gl.uniform1i(u.uWidth, target.width);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdr);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    this.guard.begin("hdr pack", "band");
    this.quad.drawTiled("hdr pack", 2 * target.width, target.height);
    this.guard.end();
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // the sky, water and fog are drawn into their picture from here (covered: the water's pass
  // draws every pixel, so it is not cleared; bloomed: this frame makes a bloom, which reads the
  // second attachment)
  begin(covered: boolean, bloomed: boolean) {
    const gl = this.gl;
    this.scene.bind();
    this.secondWritten = bloomed;
    if (!covered) {
      gl.clearBufferfv(gl.COLOR, 0, this.black);
      gl.clearBufferfv(gl.COLOR, 1, this.none);
    }
  }

  // the characters are drawn into theirs from here
  beginGlyphs() {
    const gl = this.gl;
    this.glyphs.bind();
    gl.clearBufferfv(gl.COLOR, 0, this.none);
  }

  // the characters' samples averaged into their picture (for the bloom to read it), once a frame
  resolveGlyphs() {
    if (!this.resolved) {
      this.glyphs.resolve();
      this.resolved = true;
    }
  }

  // the characters' resolved picture (after resolveGlyphs)
  get glyphsTexture() {
    return this.glyphs.texture;
  }

  // the emitters' light the scene reflects (after the water's pass; none when the last frame made
  // no bloom: Bloom 0, the tests' raw views)
  get reflectedTexture() {
    return this.secondWritten ? this.scene.textures[1] : null;
  }

  // the pictures added up and shown on the canvas, the characters' light with its bloom (bloom:
  // Bloom.render's result; none, or raw: as they are, for the tests' views); nearness: Debug
  // mode's Nearness view, the nearer of the two pictures' greys as they are
  finish(raw: boolean, bloom: BloomResult | null, nearness: boolean) {
    const gl = this.gl;
    this.resolveGlyphs();
    this.resolved = false;
    const share = !raw && bloom ? bloom.share : 0;
    const reflected = share > 0 ? this.reflectedTexture : null;
    const toHdr = this.hdr && !raw && !nearness;
    this.drawnHdr = toHdr;
    if (toHdr) {
      this.hdrTarget().bind();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, this.scene.width, this.scene.height);
    const u = this.program.use();
    gl.uniform1i(u.uHdr, toHdr ? 1 : 0);
    gl.uniform1f(u.uHeadroom, this.headroom);
    gl.uniform1i(u.uRaw, raw ? 1 : 0);
    gl.uniform1i(u.uNearness, nearness ? 1 : 0);
    gl.uniform1f(u.uExposure, this.gain);
    gl.uniform1i(u.uShift, Math.round(this.shiftX));
    gl.uniform1f(u.uBloom, share);
    gl.uniform1i(u.uWithReflected, reflected ? 1 : 0);
    if (share > 0) {
      // (share > 0: there is a result)
      gl.uniform1f(u.uBloomFirst, bloom!.first);
      bloom!.bind();
    }
    if (reflected) {
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdrReflected);
      gl.bindTexture(gl.TEXTURE_2D, reflected);
    }
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdr);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.texture);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdrGlyphs);
    gl.bindTexture(gl.TEXTURE_2D, this.glyphs.texture);
    this.guard.begin("tone map", "band");
    this.quad.drawTiled("tone map", this.scene.width, this.scene.height);
    this.guard.end();
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdr);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (share > 0) {
      bloom!.unbind();
    }
    if (reflected) {
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.hdrReflected);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    if (!(M.TEST && this.keep)) {
      this.scene.invalidate();
      this.glyphs.invalidate();
    }
    // (invalidate() leaves the canvas bound: the HDR picture bound again, for the readback)
    if (toHdr) {
      this.hdrTarget().bind();
    }
  }
}

// the tone map's fragment shader, with the bloom's GLSL (bloomMoved)
Exposure.fragment = (bloomGlsl) => fill(FRAGMENT_SOURCE, { "bloomGlsl": bloomGlsl, "hdrSpan": M.HdrOutput.SPAN.toFixed(1), "hdrRange": M.HdrOutput.ENCODED_MAX.toFixed(1) });

M.Exposure = Exposure;
