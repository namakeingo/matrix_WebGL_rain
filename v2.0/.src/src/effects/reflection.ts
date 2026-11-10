// The reflection: the scene mirrored below the water, as the eye sees it there, into a picture of
// the screen's size with two attachments: its light (half floats where they can be drawn into:
// the light is kept past 1; added up) and the distance from the eye of the nearest ink each pixel
// shows (R16F, the smallest kept: blending MIN), where the water's reflected rays look (see Water).
// - The sky behind them is the water's to add (the fog's mirrored volume read where each reflected
//   ray lands, see Water): the picture holds only the characters, on black.
// - The rain and the splashes drawn mirrored (their geometry y -> -y): in one pass where each
//   attachment can have its own blending (OES_draw_buffers_indexed), else in two, one attachment
//   each.
// - The light's picture has a chain of mip levels (generateMipmap after it is drawn, a guard piece of
//   its own: "reflection mips"): each level is the exact mean of the four texels below it, so the
//   water's glossy read (a pixel's reflected beam is as wide as the surface's curvature makes it, see
//   Water) takes the mean light over that width by textureLod, light conserved. The distance picture
//   has one level (read by texelFetch). `mips` false (the waves calm: every beam a pixel wide)
//   skips the chain: setCalm(calm), each frame before render, sets it (and the water's glossy read with
//   it: when no chain is made no beam is read from it, the water reads the point as for a beam under
//   a pixel and the pictures are the same bit for bit). With M.TEST, forceMips keeps both on, and
//   mipsMade counts the chains made.
// - Once the water has read it, its contents are let go (invalidateFramebuffer).
//
// - Quality (models/quality/water.ts): a view with no water pixel (no ray below the horizon: the camera looking up past the bottom
//   edge's horizon) reads no mirrored picture, so the whole pass (the clear, the mirrored draws, the chain) is skipped for the frame
//   (skipped counts them). The result is used only for the camera it was made for; the wallpaper's own cameras always have water in
//   view, so there it never skips.
//
// - The pass is also skipped (with the level of detail on) when the nearest water's fog leaves no light (models/quality/water.ts); the
//   picture's resolution is never lowered (no bound allows it: QualityWater.reflectionShift is 0 for any water seen).
//
// - Level of detail on: the picture of last frame stands for this frame's while what defines it is unchanged (models/quality/rainreuse.ts: the
//   rain step, camera, shift, settings, size, strikes, covered; the fog's changes tolerated up to MAX_LAG frames): the clear, the mirrored
//   draws and the mip chain are skipped and the picture is not invalidated after the water has read it (reused and drawn count the frames).
//
// Changelog:
// 2026-11-08: the picture reused while its inputs hold (level of detail on).
// 2026-11-07: the pass skipped for a view whose nearest water the fog hides (level of detail on).
// 2026-11-06: the pass skipped for a view with no water (quality job "water").
// 2026-11-06: mip levels of the light's picture for the water's glossy read.
// 2026-11-06: the chain only while the waves are not calm (setCalm); mipsMade and forceMips for the tests.
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/reflection.js).
import { M } from "../engine/core";
import type { RenderTarget } from "../engine/gl";
import { QualityWater } from "../models/quality/water";
import { QualityRainReuse } from "../models/quality/rainreuse";
import type { ReuseInputs } from "../models/quality/rainreuse";
import type { EffectContext } from "../engine/effect";
import type { EffectQuality, QualityJob, QualityShared, QualityViewInputs } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";

export class Reflection extends M.Effect {
  distance: GLenum[];
  light: GLenum[];
  both: GLenum[];
  black: Float32Array;
  far: Float32Array;
  picture: RenderTarget;
  // whether the light's mip levels are made this frame
  mips: boolean;
  // (with M.TEST only) the chain and the glossy read always on, and the chains made since the start
  forceMips!: boolean;
  mipsMade!: number;
  // the passes skipped for a view with no water, the camera version the quality result was made for, whether the quality job's statics
  // were given, and the parameters object the job keeps
  skipped: number;
  qualityFor: number;
  qualitySent: boolean;
  qualityValues: { inputs: QualityViewInputs; lod: boolean } | null;
  // the reuse of the mirrored picture: the gate, the inputs the Wallpaper fills before render (step, shift, settings, strikes, fog, covered),
  // and the stamp of the picture's size and of whether it has its mip chain
  gate: InstanceType<typeof QualityRainReuse.Gate>;
  reuse: ReuseInputs;
  pictureStamp: number;
  constructor(context: EffectContext) {
    super(context);
    const gl = this.gl;
    this.mips = true;
    this.skipped = 0;
    this.qualityFor = -1;
    this.qualitySent = false;
    this.qualityValues = null;
    this.gate = new QualityRainReuse.Gate();
    this.reuse = { step: 0, camera: 0, cameraDirty: false, shift: 0, settings: 0, size: 0, lod: false, covered: false, strikes: 0, fog: 0 };
    this.pictureStamp = 0;
    if (M.TEST) {
      this.forceMips = false;
      this.mipsMade = 0;
    }
    this.picture = this.target({ formats: [this.caps.floats ? gl.RGBA16F : gl.RGBA8, this.caps.floats ? gl.R16F : gl.RGBA8], levels: 16 });
    this.far = new Float32Array([M.Camera.FAR_DISTANCE, 0, 0, 1]);
    this.black = new Float32Array([0, 0, 0, 1]);
    this.both = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
    this.light = [gl.COLOR_ATTACHMENT0, gl.NONE];
    this.distance = [gl.NONE, gl.COLOR_ATTACHMENT1];
  }

  resize(width: number, height: number) {
    this.picture.resize(width, height);
    this.pictureStamp++;
    this.gate.reset();
  }

  // the waves calm or not: the chain is made, and the water reads it, only while they are not
  setCalm(calm: boolean) {
    this.mips = !calm || (M.TEST && this.forceMips);
  }

  // the frame's quality: the view's answer (a result of the pool's job) and the camera it was made for
  setQuality(q: EffectQuality) {
    super.setQuality(q);
    this.qualityFor = this.camera.dirty ? -1 : this.camera.version;
  }

  qualityKind(): string {
    return "water";
  }

  // the job has no static arrays: one dummy array, given once, so the pool keeps the job's kind
  qualityStatics(): QualityStatics | null {
    if (this.qualitySent) {
      return null;
    }
    this.qualitySent = true;
    return { none: new Float32Array(1) };
  }

  qualityParams(shared: QualityShared): QualityParams {
    let p = this.qualityValues;
    if (!p) {
      p = this.qualityValues = { inputs: shared.inputs, lod: this.lod };
    }
    p.inputs = shared.inputs;
    p.lod = this.lod;
    return p as unknown as QualityParams;
  }

  // one unit: whether the view has water
  qualityJobs(): QualityJob[] {
    return this.qualityIndex >= 0 ? [{ effect: this.qualityIndex, units: 1, minChunk: 1 }] : [];
  }

  // whether this frame's pass is skipped: the view has no water pixel (the tests that force the chain on keep it)
  noWater(): boolean {
    return QualityWater.skips(this.qualityResult, this.qualityFor, this.camera.version, this.camera.dirty) && !(M.TEST && this.forceMips);
  }

  // draws the mirrored picture: drawMirrored() draws the mirrored rain and splashes
  render(drawMirrored: () => void) {
    if (this.noWater()) {
      this.skipped++;
      this.gate.reset();
      return;
    }
    // (lod on: last frame's picture, with its chain, stands while its inputs hold; the guard sees no pass)
    const r = this.reuse;
    r.camera = this.camera.version;
    r.cameraDirty = this.camera.dirty;
    r.lod = this.lod;
    r.size = this.pictureStamp * 2 + (this.mips ? 1 : 0);
    if (this.gate.use(r)) {
      return;
    }
    const gl = this.gl;
    this.picture.bind();
    gl.disable(gl.BLEND);
    gl.clearBufferfv(gl.COLOR, 0, this.black);
    gl.clearBufferfv(gl.COLOR, 1, this.far);
    const indexed = this.caps.drawBuffersIndexed;
    if (indexed) {
      gl.drawBuffers(this.both);
      indexed.enableiOES(gl.BLEND, 0);
      indexed.blendEquationiOES(0, gl.FUNC_ADD);
      indexed.blendFunciOES(0, gl.ONE, gl.ONE);
      indexed.enableiOES(gl.BLEND, 1);
      indexed.blendEquationiOES(1, gl.MIN);
      drawMirrored();
      gl.disable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
    } else {
      gl.enable(gl.BLEND);
      gl.drawBuffers(this.light);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      drawMirrored();
      gl.drawBuffers(this.distance);
      gl.blendEquation(gl.MIN);
      drawMirrored();
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
    }
    gl.drawBuffers(this.both);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (this.mips) {
      if (M.TEST) {
        this.mipsMade++;
      }
      this.guard.begin("reflection mips", "step");
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
      gl.bindTexture(gl.TEXTURE_2D, this.picture.textures[0]);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.guard.piece();
      this.guard.end();
    }
  }

  // its pictures on their texture units, for the water
  bind() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.reflection);
    gl.bindTexture(gl.TEXTURE_2D, this.picture.textures[0]);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.reflectionDistance);
    gl.bindTexture(gl.TEXTURE_2D, this.picture.textures[1]);
  }

  // the water has read it: its contents are no longer needed
  done() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.reflection);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.reflectionDistance);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!QualityRainReuse.keeps(this.lod)) {
      this.picture.invalidate();
    }
  }
}

M.Reflection = Reflection;
