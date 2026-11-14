// The water, the sky and the fog over them, for each pixel's ray:
// - The surface: where the ray meets still water (y = 0); the waves' heights are not traced (a
//   crest does not hide what is behind it), only their slopes are seen.
// - Its normal from the waves' real slopes there; still water is a mirror.
// - Its reflection by Fresnel (water's 0.02 head-on, Schlick's: materials/water.ts), times Reflection strength (100%:
//   water's own; at most all the light): the reflected ray, mirrored in the water, projected into
//   the mirrored picture (Reflection: the mirrored characters) at the distance of the nearest ink
//   seen at the pixel (none: FOG_FAR), then once more at the distance of the ink where that lands;
//   on still water that is the pixel itself, the waves' slopes bend it. Behind the characters, the
//   sky past still water through the fog's mirrored volume, where the ray lands; covered
//   (covered, set each frame: Characters lightning) where the bolt's mirrored line and characters
//   lie in front of it there: past them only what their opacities leave, the fog's mirrored light
//   in front of them kept (the mirrored characters behind them are covered as they are drawn,
//   GlyphAtlas.fragment). A ray leaving the
//   screen sees that sky as far as the volume's margin reaches (the screen's edge's mirrored
//   characters are not seen past the screen), and the margin's edge's beyond it; a ray turned into
//   the water (on a steep wave) sees the light the water reflects diffusely.
// - The light it reflects diffusely: its albedo lit by the sky (through the clouds above) and the moon (by the
//   angle, through the clouds towards it: the fog's baked shadow), as the fog is, and the strikes'
//   light: baked once a strike (bakeStrike, when the fog has baked its shadows: src/index.ts) into a
//   grid fixed on the water (GRID_ACROSS across the world's width by x / distance, GRID_DEEP deep
//   by the distance's logarithm from GRID_NEAR to FOG_FAR, a layer a slot; only the cells the view
//   can read), each cell its light's vector from the strike's emitter (Lightning.EMITTER_GLSL: the
//   main channel merged, each region through the clouds between: the baked shadow) and how far its
//   light comes from; each pixel reads it once (the light a surface facing n gets: n . vector,
//   the emitter in front of it), times the strike's light now, past the waves in its way along
//   it: marched (the waves move every step) by half blocks of the waves' 4 x 4 cells as far as
//   the ray is under the highest wave (at most BLOCK_STEPS), looking at the cells (4 places a
//   half block) only where the ray is under its blocks' highest wave, and under the waves by more
//   than SHADOW_BIAS; not at all for light under FAINT.
// - The sky past it, and the fog (with the strikes' light in it) over both: the fog's volume read
//   at the pixel and the distance.
// - A second output (the scene picture's second attachment): the emitters' light the scene
//   reflects, as it is shown, the bloom's source with the characters' own: the characters' mirror
//   image on the water (where the reflected ray lands, times the reflectance, through the fog);
//   the strikes' light the fog and the air scatter (fogAt's strike share), along the eye's ray and
//   along the mirrored ray seen on the water (times the reflectance); and the strikes' light the
//   water reflects diffusely. The sky's and the moon's light (seen, scattered or reflected) is left
//   out, and so are the tests' views. The first output is the same with or without it.
// With M.TEST the shader also has the tests' views (Water.MODES), among them the fog marched
// along each pixel's own ray, to check the volume against; and two switches to measure what the
// strikes' light on the water costs: no shadow by the waves (noWaveShadow), none of it
// (noStrikeWater).
// FLOAT_PICTURES (the device draws into float pictures: caps.floats) is a compile-time define:
// without them the reflection's distance picture cannot hold distances.
// The water's own parameters (its reflectance head-on, its albedo, the share it scatters back) are
// in materials/water.ts.
//
// - Plane tone (uTone, linear light) tints the body light only (the water lit by the sky, the moon and the strikes; the mirror
//   and Fresnel never): white is the water unchanged. Ripples highlights and shadows (models/watertone.ts): with either above
//   0 each pixel's whole light (body and mirror) is evaluated for the ripples' normal and for the flat one (the same lookups,
//   shadows and strike marches; one loop of at most 2 evaluations, its count uRipplePasses), and per channel the difference is
//   pushed by the strength: brighter by highlights, darker by shadows. Both 0: one evaluation, the water as is.
//
// - The water off (off: Collision plane and Reflection plane both off): no surface, nothing of the above for the pixels
//   below the horizon: they show the sky and the fog as the pixel mirrored upwards does (the ray (x, -y, z) from the
//   eye: the sky's colour and the fog's direct volume read at that pixel, to the far distance), so the picture is
//   continuous at the horizon and the lower half is the upper half's mirror image; no mirrored picture, no light on
//   the water, no strike bake.
//
// - The ripples scatter the mirrored picture instead of cutting it into dots: the normal is the slope
//   averaged over the pixel's footprint on the water (the heights at the footprint's two sides over
//   its width, exact; a footprint under two cells: the normal at the place), and the mirrored light is
//   read over the beam the pixel's reflection covers, the screen step between neighbouring pixels'
//   reflected directions (a reflected beam spreads with the surface's curvature): up to 4 reads along
//   it of the reflection picture's mip level as wide as the beam (Reflection: each level the exact mean
//   of the texels below it), so the light a thin line sends is spread over the pixels whose beams
//   cross it, none lost. A beam under 1.25 pixels (still water, and ripples too weak to widen it) is the
//   one texel as before. With M.TEST each is switched off by noFilteredNormal, noGlossyRead.
//
// - The level of detail (models/quality/waves.ts, all off with lod off: uFlatPx 0): the fog's read at the water's distance is made first, so
//   the flat path's tolerance grows as its transmittance falls (flatPx), a pixel's level (ceil(40 footprint transmittance), from its
//   cell's size over its footprint on the water) lowers the strike-shadow march's coarse steps by a stride, a strike's light under the
//   share of one level of the picture after the fog is not marched, and water the fog leaves under FOG_CUT of the picture is the fog's
//   colour alone.
//
// - The sky bands (models/quality/waterbands.ts): the pass is drawn in the guard's bands of rows; a band with no water row in it (every row
//   above the horizon by a margin) is drawn with the sky-only program (shaders/water/sky_fragment.glsl: the water's source without the water's parts;
//   the pixels are the same, the water program's own code never touches them), the others with the full one. The full program is used in every band
//   with lod off (the A/B: Effect.lod off is the earlier draw), for the Nearness view and, with M.TEST, for the views other than the scene.
//
// - The wave hit (models/wavehit.ts, shaders/water/fragment.glsl waveHit): where a crest shifts the picture by a pixel or more, the eye's ray is marched down through the waves from the plane at
//   the highest wave and the first crest it meets is the hit (a crest hides the water behind it, the hit moves what is seen); the fog, the normal, the light and the reflection follow the hit. The
//   global gate (waveHitOn: the highest wave read back, the nearest water, the focal length: WaveHit.globalOn) switches the march on for the frame (uWaveHit); off, the water is as it was. With
//   M.TEST noWaveHit forces it off and forceWaveHit on, its gates open (uForceWaveHit).
//
// Changelog:
// 2026-11-13: the wave hit (waveHitOn, uWaveHit, noWaveHit, forceWaveHit, waveSource, nearestWater).
// 2026-11-12: the tests' displacement views (testReflection "displacementX" and "displacementY": the lookup's shift from the pixel's own place).
// 2026-11-12: uMirrorMargin: the mirrored picture's margin past the view (the lookup, the glossy taps and the distance read map into the larger picture).
// 2026-11-12: the moon's glint (moonGlint: the disc's radiance over the glossy beam, times the Fresnel reflectance and the moon's shade; the test view waterGlint); the
//   diffuse sky and moon light from the shared glyphSkyMoonLight (the sky box's (1 + n.y) / 2).
// 2026-11-08: the sky-only program for the bands above the horizon (identical pixels).
// 2026-11-07: the level of detail by the pixel's fog and footprint (flat tolerance, shadow stride and cut, early exit).
// 2026-11-07: the flat path (flatWater): a pixel whose normal is up to the waves' own bound takes no heights, one evaluation, no glossy read; off with lod off (uFlatPx 0).
// 2026-11-06: footprint-filtered normal and glossy read of the mirrored picture.
// 2026-11-06: uGlossOn: no glossy read while the reflection makes no mip chain (the waves calm); the point read, as for a beam under a pixel.
// 2026-11-05: the water off (off, uWaterOff).
// 2026-11-05: Plane tone, Ripples highlights and shadows.
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/water.js); the water's physical
//   parameters moved to materials/water.ts, values unchanged.
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import type { ShaderProgram, Programs, ProgramSources } from "../engine/gl";
import type { EffectContext, SharedGlsl } from "../engine/effect";
import type { Capabilities } from "../engine/namespace";
import { WATER_F0, WATER_ALBEDO, WATER_DIFFUSE } from "../materials/water";
import { WaterTone } from "../models/watertone";
import { QualityWaves } from "../models/quality/waves";
import { QualityUnit } from "../models/quality/unit";
import { QualityWaterBands } from "../models/quality/waterbands";
import FRAGMENT_SOURCE from "../shaders/water/fragment.glsl";
import MODE_SOURCE from "../shaders/water/mode.glsl";
import GRID_SOURCE from "../shaders/water/grid.glsl";
import STRIKE_FRAGMENT_SOURCE from "../shaders/water/strike_fragment.glsl";
import SKY_FRAGMENT_SOURCE from "../shaders/water/sky_fragment.glsl";

// the strikes' light on the water's grid (see the header): its cells across and deep, its
// nearest distance (m), its light's scale (half floats keep faint light)
const GRID_ACROSS = 1024;
const GRID_DEEP = 1024;
const GRID_NEAR = 0.5;
const GRID_FAR = 300;
const GRID_SCALE = 64;
const SLOTS = M.STRIKES_MOST;
const WATER_NO_TONE = Float32Array.of(1, 1, 1);

// the tests' options of a draw (Water.draw)
interface WaterTest {
  noWaterLight: boolean;
  reflection: string;
  fogDistance: number;
  viewScale: number;
  marched: boolean;
}

export class Water extends M.Effect {
  static GRID_GLSL: string;
  static MODES: Record<string, number>;
  static fragment: (glsl: SharedGlsl, test: boolean, floats: boolean) => string;
  static strikeFragment: (glsl: SharedGlsl, test: boolean) => string;
  static skyFragment: (glsl: SharedGlsl, test: boolean, floats: boolean) => string;
  // (made in init)
  program!: ShaderProgram;
  skyProgram!: ShaderProgram;
  // (with M.TEST only: the last draw's bands, the sky-only ones, the full ones and the rows in the sky-only ones)
  bandsDrawn!: { sky: number; full: number; skyRows: number };
  strikeProgram!: ShaderProgram;
  // (with M.TEST only)
  noStrikeWater!: boolean;
  noWaveShadow!: boolean;
  // (the tint and the ripples' gain skipped: the water as it was before them)
  noTone!: boolean;
  noRippleGain!: boolean;
  // (the footprint-filtered normal and the glossy read of the reflection skipped: the water as it was before them)
  noFilteredNormal!: boolean;
  noGlossyRead!: boolean;
  // (the wave hit's march forced off / on with its gates open)
  noWaveHit!: boolean;
  forceWaveHit!: boolean;
  // the waves, for the highest wave read back (src/index.ts), and whether the global gate switched the wave hit's march on for the last frame
  waveSource: { highest: number } | null;
  waveHitOn: boolean;
  covered: boolean;
  // the glossy read on (the reflection's mip chain is made: src/index.ts gives Reflection.mips); off, the point read as for a beam under a pixel
  glossOn: boolean;
  // the mirrored picture's margin past the view, pixels on each side (src/index.ts gives Reflection.frame's: x and y)
  mirrorMargin: Float32Array;
  // the water off (models/waterstate.ts): no surface; below the horizon the sky and the fog go on, seen along the ray
  // mirrored upwards
  off: boolean;
  nearness: ArrayLike<number> | null;
  ready: ArrayLike<number> | null;
  warmed: boolean;
  marched: boolean;
  refreshed: { strikeSlots: number; };
  bakedNow: number;
  gridDraws: WebGLFramebuffer[];
  grid: WebGLTexture | null;
  emitter: WebGLTexture | null;
  strength: number;
  // Plane tone in linear light (white: no tint) and the ripples' strengths, 0 to 100
  tone: Float32Array;
  rippleHighlights: number;
  rippleShadows: number;
  constructor(context: EffectContext) {
    super(context);
    this.strength = 1;
    this.mirrorMargin = new Float32Array(2);
    this.tone = Float32Array.of(1, 1, 1);
    this.rippleHighlights = 0;
    this.rippleShadows = 0;
    // the strikes' emitter (Lightning.emitterTexture, src/index.ts: setEmitter), the grid of their
    // light on the water (a layer a slot, on M.UNITS.strikeWater for good) and a framebuffer a
    // layer, the slots baked since the last update (refreshed: the last frame's), the tests'
    // marched shadows, and whether its bake's program was drawn once
    this.emitter = null;
    this.grid = null;
    this.gridDraws = [];
    this.bakedNow = 0;
    this.refreshed = { strikeSlots: 0 };
    this.marched = false;
    this.warmed = false;
    // whether each slot's bakes are done (the fog's: src/index.ts gives its array), its light shown
    this.ready = null;
    const gl = this.gl;
    if (this.caps.floats) {
      this.grid = this.createTexture();
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.strikeWater);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.grid);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA16F, GRID_ACROSS, GRID_DEEP, SLOTS);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      for (let slot = 0; slot < SLOTS; slot++) {
        const framebuffer = this.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.grid, 0, slot);
        this.gridDraws.push(framebuffer);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // (Debug mode's Nearness view: the rain's nearest and furthest distances, null when off)
    this.nearness = null;
    // whether the bolt covers what lies behind it this frame (Characters lightning: set by src/index.ts)
    this.covered = false;
    this.glossOn = true;
    this.off = false;
    this.waveSource = null;
    this.waveHitOn = false;
    if (M.TEST) {
      this.noWaveShadow = false;
      this.noStrikeWater = false;
      this.noTone = false;
      this.noRippleGain = false;
      this.noFilteredNormal = false;
      this.noGlossyRead = false;
      this.noWaveHit = false;
      this.forceWaveHit = false;
      this.bandsDrawn = { sky: 0, full: 0, skyRows: 0 };
    }
  }

  static programs(glsl: SharedGlsl, caps: Capabilities): ProgramSources {
    return {
      water: [M.FULL_VERTEX, Water.fragment(glsl, M.TEST, caps.floats)],
      waterStrike: [M.FULL_VERTEX, Water.strikeFragment(glsl, M.TEST)],
      waterSky: [M.FULL_VERTEX, Water.skyFragment(glsl, M.TEST, caps.floats)],
    };
  }

  // the strikes' emitter's texture (Lightning.emitterTexture)
  setEmitter(texture: WebGLTexture | null) {
    this.emitter = texture;
  }

  // the grid's cells the view can read: [first column, columns, first row, rows] (the columns
  // of x / distance the view reaches, a cell more each way; the rows from 0.9 of the nearest
  // distance it sees the water at)
  // the distance (along the view's depth) of the nearest water the view sees: the rays of the bottom row's left, middle and right (none: `none`)
  nearestWater(none: number) {
    const c = this.camera;
    let nearest = none;
    for (const x of [0, c.width / 2, c.width]) {
      const d = c.rayAt(x, c.height);
      if (d[1] < 0) {
        nearest = Math.min(nearest, (c.eyeY() / -d[1]) * -d[2]);
      }
    }
    return nearest;
  }

  gridBox() {
    const c = this.camera;
    const tan = Math.tan(c.halfFov());
    const slant = Math.max(0.1, Math.cos(c.tilt()) - tan * Math.abs(Math.sin(c.tilt())));
    const wide = ((c.width / c.height) * tan) / slant;
    const column = (g: number) => ((g / M.Camera.SPAN + 1) / 2) * GRID_ACROSS;
    const first = Math.max(0, Math.floor(column(-wide)) - 1);
    const last = Math.min(GRID_ACROSS, Math.ceil(column(wide)) + 1);
    const nearest = this.nearestWater(GRID_FAR);
    const row = Math.floor((Math.log(Math.max(0.9 * nearest, GRID_NEAR) / GRID_NEAR) / Math.log(GRID_FAR / GRID_NEAR)) * GRID_DEEP);
    const from = Math.max(0, Math.min(GRID_DEEP - 1, row - 1));
    return [first, last - first, from, GRID_DEEP - from];
  }

  // a strike's light on the water baked into its slot's layer of the grid, from its emitter
  // and its shadows (bound by the fog on M.UNITS.work and M.UNITS.bloomFrom when it calls
  // this, right after baking them); in the guard's bands of rows
  bakeStrike(slot: number, onePixel = false) {
    const gl = this.gl;
    if (!this.grid || !this.strikeProgram) {
      return;
    }
    const u = this.strikeProgram.use();
    gl.uniform1i(u.uSlot, slot);
    if (M.TEST) {
      gl.uniform1i(u.uMarched, this.marched ? 1 : 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridDraws[slot]);
    gl.viewport(0, 0, GRID_ACROSS, GRID_DEEP);
    gl.disable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST);
    const box = onePixel ? [0, 1, 0, 1] : this.gridBox();
    const tile = this.guard.size("strike water", "band");
    this.guard.begin("strike water", "band");
    for (let y = box[2]; y < box[2] + box[3]; y += tile) {
      gl.scissor(box[0], y, box[1], Math.min(tile, box[2] + box[3] - y));
      this.quad.drawFull();
      this.guard.piece();
    }
    this.guard.end();
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!onePixel) {
      this.bakedNow++;
    }
  }

  // the slots baked since the last update kept for the tests (refreshed); its bake's program
  // drawn once over one pixel when ready (the driver finishes a program at its first draw)
  update() {
    this.refreshed.strikeSlots = this.bakedNow;
    this.bakedNow = 0;
    if (!this.warmed && this.strikeProgram && this.grid && this.emitter) {
      this.warmed = true;
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
      gl.bindTexture(gl.TEXTURE_2D, this.emitter);
      this.bakeStrike(0, true);
    }
  }

  static properties() {
    return {
      p206_setting_PlaneTone: (water: Water, v: string) => (water.tone = WaterTone.tint(v)),
      p208_setting_ReflectionStrength: (water: Water, v: number) => (water.strength = v / 100),
      p211_setting_RippleShadows: (water: Water, v: number) => (water.rippleShadows = v),
      p212_setting_RippleHighlights: (water: Water, v: number) => (water.rippleHighlights = v),
    };
  }

  init(programs: Programs) {
    [this.program, this.strikeProgram, this.skyProgram] = this.ownPrograms(programs, ["water", "waterStrike", "waterSky"]);
    this.skyProgram.samplers({ uFogDirect: M.UNITS.fogDirect, uFogMirror: M.UNITS.fogMirror, uStrikeDirect: M.UNITS.strikeDirect, uStrikeMirror: M.UNITS.strikeMirror });
    this.strikeProgram.samplers({ uNoise: M.UNITS.noise, uStrikeShade: M.UNITS.bloomFrom, uEmitter: M.UNITS.work });
    this.program.samplers({
      uNoise: M.UNITS.noise,
      uShade: M.UNITS.shade,
      uStrikeWater: M.UNITS.strikeWater,
      uFogDirect: M.UNITS.fogDirect,
      uFogMirror: M.UNITS.fogMirror,
      uStrikeDirect: M.UNITS.strikeDirect,
      uStrikeMirror: M.UNITS.strikeMirror,
      uWaves: M.UNITS.waves,
      uWaveMax: M.UNITS.waveMax,
      uWaveBlocks: M.UNITS.waveBlocks,
      uReflection: M.UNITS.reflection,
      uReflectionDistance: M.UNITS.reflectionDistance,
      uBoltCover: M.UNITS.boltCover,
      uBoltNear: M.UNITS.boltNear,
    });
  }

  // draws it: the scene, or (with M.TEST) one of the tests' views (Water.MODES), with test:
  // { noWaterLight, reflection ("white" or "uv"), fogDistance, viewScale, marched } (null
  // without M.TEST)
  draw(mode: string, test: WaterTest | null) {
    const gl = this.gl;
    const u = this.program.use();
    gl.uniform1f(u.uStrength, this.strength);
    const tint = M.TEST && this.noTone ? WATER_NO_TONE : this.tone;
    gl.uniform3f(u.uTone, tint[0], tint[1], tint[2]);
    const gain = !(M.TEST && this.noRippleGain) && (this.rippleHighlights > 0 || this.rippleShadows > 0);
    gl.uniform1f(u.uRippleHighlights, (this.rippleHighlights / 100) * WaterTone.RIPPLE_GAIN);
    gl.uniform1f(u.uRippleShadows, (this.rippleShadows / 100) * WaterTone.RIPPLE_GAIN);
    gl.uniform1i(u.uRipplePasses, gain ? 2 : 1);
    gl.uniform1f(u.uFlatPx, this.lod ? QualityWaves.FLAT_PX : 0);
    // the wave hit's global gate (the highest wave read back, a few frames old: the shader's own bound is the live one)
    const source = this.waveSource;
    const gate = this.caps.floats && !this.off && !!source && M.WaveHit.globalOn(source.highest, this.nearestWater(Infinity), this.camera.focal());
    const hitOn = M.TEST && this.noWaveHit ? false : M.TEST && this.forceWaveHit ? this.caps.floats : gate;
    this.waveHitOn = hitOn;
    gl.uniform1i(u.uWaveHit, hitOn ? 1 : 0);
    if (M.TEST) {
      gl.uniform1i(u.uForceWaveHit, this.forceWaveHit && hitOn ? 1 : 0);
    }
    const ready = this.ready;
    gl.uniform4f(u.uStrikeReady, ready && ready[0] ? 1 : 0, ready && ready[1] ? 1 : 0, ready && ready[2] ? 1 : 0, 0);
    gl.uniform1i(u.uCovered, this.covered ? 1 : 0);
    gl.uniform1i(u.uNearness, this.nearness ? 1 : 0);
    gl.uniform1i(u.uWaterOff, this.off ? 1 : 0);
    gl.uniform1i(u.uGlossOn, this.glossOn ? 1 : 0);
    gl.uniform2f(u.uMirrorMargin, this.mirrorMargin[0], this.mirrorMargin[1]);
    if (this.nearness) {
      gl.uniform2f(u.uNearFar, this.nearness[0], this.nearness[1]);
    }
    if (M.TEST && test) {
      gl.uniform1i(u.uMode, Water.MODES[mode]);
      gl.uniform1i(u.uNoWaterLight, test.noWaterLight ? 1 : 0);
      gl.uniform1i(u.uTestReflection, test.reflection === "white" ? 1 : test.reflection === "uv" ? 2 : test.reflection === "displacementX" ? 3 : test.reflection === "displacementY" ? 4 : 0);
      gl.uniform1f(u.uFogDistance, test.fogDistance);
      gl.uniform1f(u.uViewScale, test.viewScale);
      gl.uniform1i(u.uMarched, test.marched ? 1 : 0);
      gl.uniform1i(u.uNoWaveShadow, this.noWaveShadow ? 1 : 0);
      gl.uniform1i(u.uNoStrikeWater, this.noStrikeWater ? 1 : 0);
      gl.uniform1i(u.uNoFilteredNormal, this.noFilteredNormal ? 1 : 0);
      gl.uniform1i(u.uNoGlossyRead, this.noGlossyRead ? 1 : 0);
    }
    // the bands above the horizon with the sky-only program (the same pixels: lod off draws every band with the full one, the A/B; the Nearness
    // view and the tests' views other than the scene need the full one)
    const split = this.lod && !this.nearness && (!M.TEST || mode === "scene");
    const width = this.camera.width;
    const height = this.camera.height;
    const tile = this.guard.size("water", "band");
    const first = split ? QualityWaterBands.skyFrom(this.camera) : height;
    let sky = 0;
    let full = 0;
    gl.bindVertexArray(this.quad.plain);
    gl.enable(gl.SCISSOR_TEST);
    this.guard.begin("water", "band");
    let skyUsed = false;
    for (let y = 0; y < height; y += tile) {
      if (y >= first) {
        if (!skyUsed) {
          this.skyProgram.use();
          skyUsed = true;
        }
        sky++;
      } else {
        full++;
      }
      gl.scissor(0, y, width, Math.min(tile, height - y));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.guard.piece();
    }
    this.guard.end();
    gl.disable(gl.SCISSOR_TEST);
    if (M.TEST) {
      this.bandsDrawn = { sky, full, skyRows: sky ? height - Math.ceil(first / tile) * tile : 0 };
    }
    if (skyUsed) {
      this.program.use();
    }
  }
}

// the tests' views: the water's pixels (white), its distance (whole metres in red, the rest in
// green), its reflection alone, the mirrored picture (its characters and the sky behind them),
// the strikes' light on the water alone, the moon's glint alone (times viewScale)
// (times viewScale), the sky and fog alone, the light the water reflects diffusely alone (times viewScale); and
// the fog to fogDistance from its volume and marched along the pixel's ray: what it lets
// through, its light (times viewScale), and what it lets through mirrored (below the horizon)
Water.MODES = {
  scene: 0, waterMask: 1, waterDistance: 2, reflection: 3, reflectionPicture: 4, waterLight: 5, sky: 6, waterOwn: 7,
  fogT: 8, fogTMarch: 9, fogLight: 10, fogLightMarch: 11, mirrorFogT: 12, mirrorFogTMarch: 13, waterGlint: 14,
};

// the sky-only program (see the header): the water's source with the water's parts taken away, over the camera's and the fog's code
Water.skyFragment = (glsl) => fill(SKY_FRAGMENT_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "glsl.fog": glsl.fog });

Water.fragment = (glsl, test, floats) => fill(FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "FLOAT_PICTURES": floats ? "#define FLOAT_PICTURES" : "", "M.Camera.GLSL": M.Camera.GLSL, "glsl.fog": glsl.fog, "glsl.medium": glsl.medium, "glsl.shade": glsl.shade, "glsl.test": glsl.test, "glsl.lightning": glsl.lightning, "march": test ? glsl.march : "", "glsl.waves": glsl.waves, "modes": Object.entries(Water.MODES).map(([name, value]) => fill(MODE_SOURCE, { "NAME": name.toUpperCase(), "value": value })).join("\n"), "M.Nearness.GLSL": M.Nearness.GLSL, "M.GlyphAtlas.NEAR_SCALE.toFixed(1)": M.GlyphAtlas.NEAR_SCALE.toFixed(1), "Water.GRID_GLSL": Water.GRID_GLSL, "M.Bolt.COVER.toFixed(4)": M.Bolt.COVER.toFixed(4), 'WATER_ALBEDO.map((v) => v.toFixed(2)).join(", ")': WATER_ALBEDO.map((v) => v.toFixed(2)).join(", "), "WATER_DIFFUSE": WATER_DIFFUSE, "WATER_F0": WATER_F0, "1 - WATER_F0": 1 - WATER_F0, "FOOTPRINT_FULL_PX": QualityUnit.FOOTPRINT_FULL_PX.toFixed(1), "STRIDE_1": QualityWaves.STRIDE_LEVELS[0], "STRIDE_2": QualityWaves.STRIDE_LEVELS[1], "STRIDE_4": QualityWaves.STRIDE_LEVELS[2], "STRIKE_CUT": (QualityWaves.LIGHT_TOL / QualityWaves.STRIKES_MOST).toExponential(6), "FOG_CUT": QualityWaves.CUT_T.toExponential(6), "M.WaveHit.THRESHOLD_PX.toFixed(2)": M.WaveHit.THRESHOLD_PX.toFixed(2) });

// the grid on the water: its cells, nearest and furthest distance, scale, and a place's grid
// coordinates (0 to 1 each way, the cells' middles at (i + 0.5) / cells: x / distance across the
// world's width, the distance's logarithm)
Water.GRID_GLSL = fill(GRID_SOURCE, { "GRID_ACROSS": GRID_ACROSS, "GRID_DEEP": GRID_DEEP, "GRID_NEAR.toFixed(2)": GRID_NEAR.toFixed(2), "Math.log(GRID_FAR / GRID_NEAR).toFixed(6)": Math.log(GRID_FAR / GRID_NEAR).toFixed(6), "GRID_SCALE.toFixed(1)": GRID_SCALE.toFixed(1), "M.Camera.SPAN.toFixed(4)": M.Camera.SPAN.toFixed(4) });

// a strike's light on the water baked into its layer of the grid (see the header): each cell's
// place on still water, each region of strike slot uSlot's emitter there (Lightning's walk)
// through the clouds between (the baked shadow, or marched with 8 places), its light's vector
// (times GRID_SCALE) and how far its light comes from (by its light)
Water.strikeFragment = (glsl, test) => fill(STRIKE_FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "M.Camera.GLSL": M.Camera.GLSL, "glsl.fog": glsl.fog, "glsl.medium": glsl.medium, "glsl.shade": glsl.shade, "glsl.test": glsl.test, "glsl.lightning": glsl.lightning, "glsl.emitter": glsl.emitter, "Water.GRID_GLSL": Water.GRID_GLSL });

M.Water = Water;
