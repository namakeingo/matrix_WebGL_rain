// The clock and the message: UI overlays in front of the scene (not part of the 3D world), made of
// the rain that passes through their letters, as matrix_web_rain's and matrix_3d_rain's.
// - Their letters: Letters.layout's lit rectangles (models/letters.ts), laid out again only when
//   the text, its place, its size, the screen or the OLED shift changes (the clock's text when its
//   minute changes, measured on "88:88" so its size does not change with the time).
// - The stamps: at each rain step, each drop's newest character whose cell on the screen meets the
//   letters' box, drawn opaque where the rain draws it, at full light in its drop's colour (no fog,
//   not whitened): by the rain (Rain.drawNewest, through onStamp: src/index.ts gives it), into two
//   pictures of the screen in one draw (MRT): their colour (times their ink) and their ink. A
//   picture keeps what was drawn in it, so the stamps accumulate: each frame draws only the steps
//   since the last frame's (at most a frame's worth after a jump in time), a newer step's covering
//   an older one's, within a step the nearer drop's the further's (the depth: a newer step's
//   nearer than any older one's, cleared once a frame). A reset or a resize clears them (as
//   matrix_web_rain's canvas, cleared when resized).
// - The composite (composite, src/index.ts: after the characters' picture is resolved, before
//   the bloom, so the text blooms): over the letters' lit rectangles only, the scene's light and
//   the characters' light times (1 - ink), plus the stamps' colour; so the fog, the lightning and
//   the rain behind show between the strokes. Blended into the pictures in place: the scene's (and
//   its second attachment, the emitters' light it reflects) and the characters'.
// - High contrast text off with the colour wave: the stamps take the hue of the rain in their
//   column now (a fall beginning now at the pixel's bearing: Rain's colours, colorState), their
//   luminosity kept (the W3C 'color' blend: setLum).
// - OLED Pixel Shift (OledShift, models/oled.ts): every 10 s of real time (not the simulation's:
//   the screen's own time) the scene moves 1 px left or right and the clock and the message 1 px to
//   a neighbouring pixel, never past the setting. The scene's shift is applied where its picture
//   is shown (Exposure.shiftX, src/index.ts); the stamps and the letters are in screen pixels, so
//   the stamps are drawn at the rain's place plus the scene's shift and the composite reads them at
//   the scene's pixel plus the shift: the text stays where its own shift puts it.
// - No reflection of the text: taken to be 2.5 m from the eye along each pixel's ray, its mirror
//   image in the water is below the bottom of the screen for every Plane height and window shape
//   (scenetest.html ?test=textreflect).
// - Every pass is a section of the GPU guard's; its programs drawn once at the start (the first
//   frame drawn); no allocation in a frame (the layouts made only when they change).
//
// Changelog:
// 2026-11-04: first version.
// 2026-11-06: the composite skipped while the letters' box is wholly off the screen.
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import type { EffectContext } from "../engine/effect";
import type { Programs, ProgramSources, ShaderProgram, RenderTarget } from "../engine/gl";
import type { StepClock } from "../engine/clock";
import type { TextLayout, TextPlace } from "../models/letters";
import type { JobTask } from "../platform/jobtask";
import type { LayoutJob, LayoutOut } from "../workers/textlayoutworker";
import type { OledShift } from "../models/oled";
import type { RainColors } from "./rain";
import { TextVisibility } from "../models/textvisibility";
import COMPOSITE_VERTEX_SOURCE from "../shaders/text/composite_vertex.glsl";
import COMPOSITE_FRAGMENT_SOURCE from "../shaders/text/composite_fragment.glsl";
import COLOR_SOURCE from "../shaders/rain/color.glsl";

// the text the clock is measured on (its size the same at every time)
const CLOCK_MEASURE = "88:88";
const MINUTE_MS = 60000;
// the OLED shift's random numbers' seed
const OLED_SEED = 0x01ed5;

// the stamps' drawing: steps from..to, their cells meeting the box (device pixels from the top
// left: x0, y0, x1, y1), the scene's shift across, the tests' view of their ids
export type StampCallback = (from: number, to: number, box: Float32Array, shift: number, ids: boolean) => void;

// one of the two texts: shown, its place and size, its text (the message's; the clock's from the
// time), its letters (null: hidden or none)
interface TextItem {
  shown: boolean;
  place: TextPlace;
  text: string;
  layout: TextLayout | null;
}

export class Text extends M.Effect {
  // the text is a UI overlay: not an effect of the quality pool
  static IN_QUALITY = false;
  clock: TextItem;
  message: TextItem;
  twelveHour: boolean;
  highContrast: boolean;
  limit: number;
  shift: OledShift;
  scale: number;
  width: number;
  height: number;
  dirty: boolean;
  cleared: boolean;
  fromNow: boolean;
  minute: number;
  date: Date;
  stampedTo: number;
  box: Float32Array;
  hasBox: boolean;
  stamps: RenderTarget;
  rects: WebGLBuffer;
  rectData: Float32Array;
  rectCount: number;
  rectArray: WebGLVertexArrayObject;
  warm: boolean;
  warmComposite: boolean;
  zero: Float32Array;
  none: Float32Array;
  offScreen: Float32Array;
  depthOnly: GLenum[];
  steps: StepClock;
  onStamp: StampCallback | null;
  // (the tests': each stamp drawn as its id; the clock's time and the real time in ms instead of
  // the page's: with M.TEST only)
  testIds: boolean;
  clockTime: number | null;
  realTime: number | null;
  // (made in init)
  glyphsProgram!: ShaderProgram;
  sceneProgram!: ShaderProgram;
  // the layout's task (src/index.ts gives it: workers/textlayoutworker.ts), asked by fork when the layout is owed and awaited by the frame
  layoutTask: JobTask<LayoutJob, LayoutOut> | null;

  constructor(context: EffectContext) {
    super(context);
    const gl = this.gl;
    this.steps = context.clock;
    this.layoutTask = null;
    // (project.json's defaults: the clock shown, the message hidden)
    this.clock = {
      shown: true,
      place: { relativeSize: true, size: 8, sizePercent: 75, relativePosition: true, relativeX: 50, relativeY: 25, x: 14, y: 14 },
      text: "",
      layout: null,
    };
    this.message = {
      shown: false,
      place: { relativeSize: true, size: 8, sizePercent: 90, relativePosition: true, relativeX: 50, relativeY: 80, x: 30, y: 30 },
      text: "MATRIX",
      layout: null,
    };
    this.twelveHour = false;
    this.highContrast = true;
    this.limit = 20;
    this.shift = new M.OledShift(M.seededRandom(context.seed ^ OLED_SEED));
    // device pixels a CSS pixel (src/index.ts gives the page's where it has one)
    this.scale = (typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1);
    this.width = 0;
    this.height = 0;
    // the letters to lay out again; the stamps' pictures to clear
    this.dirty = true;
    this.cleared = false;
    // (after a resize: only the steps from the next on stamped)
    this.fromNow = false;
    this.minute = -1;
    this.date = new Date(0);
    // the last step stamped (-1: none since the stamps were cleared)
    this.stampedTo = -1;
    // the letters' box (device pixels from the top left: x0, y0, x1, y1)
    this.box = new Float32Array(4);
    this.hasBox = false;
    const floats = this.caps.floats;
    this.stamps = this.target({ formats: floats ? [gl.RGBA16F, gl.R16F] : [gl.RGBA8, gl.R8], depth: true });
    // the letters' lit rectangles, one instance each (made again only when they change)
    this.rects = this.createBuffer();
    this.rectData = new Float32Array(0);
    this.rectCount = 0;
    this.rectArray = this.vertexArray([{ buffer: this.rects, attribute: "aPlace", size: 4 }]);
    // (each program drawn once at the start: the stamps' and the composite's)
    this.warm = true;
    this.warmComposite = true;
    this.zero = new Float32Array(4);
    // (a box no cell meets, and a rectangle off the screen: the programs warmed with no change)
    this.none = new Float32Array([1e9, 1e9, -1e9, -1e9]);
    this.offScreen = new Float32Array([-16, -16, 1, 1]);
    // (the depth let go once a frame's stamps are drawn)
    this.depthOnly = [gl.DEPTH_ATTACHMENT];
    this.onStamp = null;
    this.testIds = false;
    this.clockTime = null;
    this.realTime = null;
  }

  static programs(): ProgramSources {
    const fragment = (scene: boolean) =>
      fill(COMPOSITE_FRAGMENT_SOURCE, { "OUTPUT": scene ? "#define SCENE" : "", "M.Camera.GLSL": M.Camera.GLSL, "COLOR_GLSL": COLOR_SOURCE });
    return {
      textGlyphs: [COMPOSITE_VERTEX_SOURCE, fragment(false)],
      textScene: [COMPOSITE_VERTEX_SOURCE, fragment(true)],
    };
  }

  static properties() {
    const clock = (text: Text, set: (item: TextItem) => void) => {
      set(text.clock);
      text.dirty = true;
    };
    const message = (text: Text, set: (item: TextItem) => void) => {
      set(text.message);
      text.dirty = true;
    };
    return {
      p118_setting_HighContrastText: (text: Text, v: boolean) => (text.highContrast = v),
      p401_setting_ShowClock: (text: Text, v: boolean) => clock(text, (c) => (c.shown = v)),
      p402_setting_ClockRelativeSize: (text: Text, v: boolean) => clock(text, (c) => (c.place.relativeSize = v)),
      p403_setting_ClockSize: (text: Text, v: number) => clock(text, (c) => (c.place.size = v)),
      p404_setting_ClockRelativeSizePercent: (text: Text, v: number) => clock(text, (c) => (c.place.sizePercent = v)),
      p405_setting_ClockRelativePosition: (text: Text, v: boolean) => clock(text, (c) => (c.place.relativePosition = v)),
      p406_setting_ClockRelativePositionX: (text: Text, v: number) => clock(text, (c) => (c.place.relativeX = v)),
      p407_setting_ClockRelativePositionY: (text: Text, v: number) => clock(text, (c) => (c.place.relativeY = v)),
      p408_setting_ClockPositionX: (text: Text, v: number) => clock(text, (c) => (c.place.x = v)),
      p409_setting_ClockPositionY: (text: Text, v: number) => clock(text, (c) => (c.place.y = v)),
      p410_setting_Clock12h: (text: Text, v: boolean) => {
        text.twelveHour = v;
        text.minute = -1;
      },
      p501_setting_ShowMessage: (text: Text, v: boolean) => message(text, (m) => (m.shown = v)),
      // (an empty text keeps the one before, as matrix_web_rain's)
      p502_setting_MessageText: (text: Text, v: string) => message(text, (m) => (m.text = typeof v === "string" && v.length > 0 ? v : m.text)),
      p503_setting_MessageRelativeSize: (text: Text, v: boolean) => message(text, (m) => (m.place.relativeSize = v)),
      p504_setting_MessageSize: (text: Text, v: number) => message(text, (m) => (m.place.size = v)),
      p505_setting_MessageRelativeSizePercent: (text: Text, v: number) => message(text, (m) => (m.place.sizePercent = v)),
      p506_setting_MessageRelativePosition: (text: Text, v: boolean) => message(text, (m) => (m.place.relativePosition = v)),
      p507_setting_MessageRelativePositionX: (text: Text, v: number) => message(text, (m) => (m.place.relativeX = v)),
      p508_setting_MessageRelativePositionY: (text: Text, v: number) => message(text, (m) => (m.place.relativeY = v)),
      p509_setting_MessagePositionX: (text: Text, v: number) => message(text, (m) => (m.place.x = v)),
      p510_setting_MessagePositionY: (text: Text, v: number) => message(text, (m) => (m.place.y = v)),
      p612_setting_OledPixelShift: (text: Text, v: number) => (text.limit = Math.max(0, Math.round(v))),
    };
  }

  init(programs: Programs) {
    [this.glyphsProgram, this.sceneProgram] = this.ownPrograms(programs, ["textGlyphs", "textScene"]);
    for (const program of [this.glyphsProgram, this.sceneProgram]) {
      program.samplers({ uStampColor: M.UNITS.work, uStampInk: M.UNITS.bloomFrom });
    }
  }

  // the clock's letters (null: hidden)
  get clockLayout(): TextLayout | null {
    return this.clock.shown ? this.clock.layout : null;
  }

  // the message's letters (null: hidden)
  get messageLayout(): TextLayout | null {
    return this.message.shown ? this.message.layout : null;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.stamps.resize(width, height);
    this.dirty = true;
    this.clear();
    this.fromNow = true;
  }

  reset() {
    this.clear();
  }

  // the stamps let go: their pictures cleared (at the next update), nothing stamped since
  clear() {
    this.cleared = false;
    this.stampedTo = -1;
    this.fromNow = false;
  }

  // the real time (ms): the OLED shift's
  now(): number {
    return M.TEST && this.realTime !== null ? this.realTime : performance.now();
  }

  // the letters laid out again where something they depend on changed; the OLED shift moved on by
  // the real time; the clock's text at a new minute; the steps since the last frame stamped
  update(time: number) {
    if (this.shift.update(this.now(), this.limit)) {
      this.dirty = true;
    }
    if (this.clock.shown) {
      const ms = M.TEST && this.clockTime !== null ? this.clockTime : Date.now();
      const minute = Math.floor(ms / MINUTE_MS);
      if (minute !== this.minute) {
        this.minute = minute;
        this.date.setTime(ms);
        const text = M.Letters.clockText(this.date, this.twelveHour);
        if (text !== this.clock.text) {
          this.clock.text = text;
          this.dirty = true;
        }
      }
    }
    if (this.dirty && this.width > 0) {
      this.layOut();
    }
    this.stamp(this.steps.stepAt(time));
  }

  // both texts' letters, laid out here (the quality mode workers asks the task in fork instead: the same function)
  layOut() {
    this.dirty = false;
    const job = this.layoutJob();
    const out = M.TextLayoutWorker.job(job);
    this.applyLayouts(out.clock, out.message);
  }

  // what lays both texts out, as the layout's job takes it: the texts, their places, the screen and the shift
  layoutJob(): LayoutJob {
    const s = this.shift;
    const clock = this.clock;
    const message = this.message;
    return {
      clock: clock.shown ? { text: clock.text, place: clock.place, width: this.width, height: this.height, scale: this.scale, measure: CLOCK_MEASURE, dx: s.clock.x, dy: s.clock.y } : null,
      message: message.shown ? { text: message.text, place: message.place, width: this.width, height: this.height, scale: this.scale, dx: s.message.x, dy: s.message.y } : null,
    };
  }

  // the layout owed asked of the task with its exact input and awaited by the frame (Effect.fork): taken in before the frame's update
  fork(_time: number): Promise<void> | null {
    const task = this.layoutTask;
    if (!task || !this.dirty || this.width <= 0) {
      return null;
    }
    this.dirty = false;
    return task.ask(this.layoutJob()).then((out) => this.applyLayouts(out.clock, out.message));
  }

  // both texts' letters in place: their rectangles sent to the GPU, the box of them all
  applyLayouts(clockLayout: TextLayout | null, messageLayout: TextLayout | null) {
    const clock = this.clock;
    const message = this.message;
    clock.layout = clockLayout;
    message.layout = messageLayout;
    const count = (clock.layout ? clock.layout.count : 0) + (message.layout ? message.layout.count : 0);
    if (this.rectData.length < count * 4) {
      this.rectData = new Float32Array(count * 4);
    }
    let at = 0;
    const box = this.box;
    box[0] = box[1] = Infinity;
    box[2] = box[3] = -Infinity;
    for (const layout of [clock.layout, message.layout]) {
      if (!layout || layout.count === 0) {
        continue;
      }
      this.rectData.set(layout.rects.subarray(0, layout.count * 4), at * 4);
      at += layout.count;
      box[0] = Math.min(box[0], layout.box[0]);
      box[1] = Math.min(box[1], layout.box[1]);
      box[2] = Math.max(box[2], layout.box[2]);
      box[3] = Math.max(box[3], layout.box[3]);
    }
    this.rectCount = at;
    this.hasBox = at > 0;
    if (at > 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rects);
      gl.bufferData(gl.ARRAY_BUFFER, this.rectData.subarray(0, at * 4), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  // the steps after the last stamped up to `step` (at most the steps one frame can move), their
  // newest characters drawn into the stamps' pictures (the pictures cleared first when owed); on
  // the first frame the rain's program is drawn even with nothing to stamp (warmed)
  stamp(step: number) {
    const gl = this.gl;
    if (!this.cleared && this.width > 0) {
      this.stamps.bind();
      gl.clearBufferfv(gl.COLOR, 0, this.zero);
      gl.clearBufferfv(gl.COLOR, 1, this.zero);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.cleared = true;
    }
    // (back in time, or resized: nothing stamped until a newer step)
    if (step < this.stampedTo || this.fromNow) {
      this.stampedTo = step;
      this.fromNow = false;
    }
    const from = Math.max(this.stampedTo + 1, step - this.steps.most + 1, 0);
    this.stampedTo = step;
    const warm = this.warm;
    if (!this.onStamp || this.width === 0 || ((!this.hasBox || from > step) && !warm)) {
      return;
    }
    this.stamps.bind();
    // (opaque: each stamp takes its whole cell)
    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    if (warm) {
      // (warmed, whatever is shown and whether the drops are laid out yet: one instance, a box no
      // cell meets, into the same pictures as every later stamp)
      this.warm = false;
      gl.enable(gl.DEPTH_TEST);
      this.onStamp(step, step, this.none, 0, false);
    }
    if (this.hasBox && from <= step) {
      // (the box's rows and columns only: its depth cleared there, the stamps drawn there)
      const b = this.box;
      const x0 = Math.max(0, Math.floor(b[0]));
      const x1 = Math.min(this.width, Math.ceil(b[2]));
      const y0 = Math.max(0, Math.floor(b[1]));
      const y1 = Math.min(this.height, Math.ceil(b[3]));
      if (x1 > x0 && y1 > y0) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x0, this.height - y1, x1 - x0, y1 - y0);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        this.onStamp(from, step, this.box, this.shift.scene.x, M.TEST && this.testIds);
        gl.disable(gl.SCISSOR_TEST);
      }
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.stamps.framebuffer);
    gl.invalidateFramebuffer(gl.FRAMEBUFFER, this.depthOnly);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
  }

  // the stamps laid over the scene's picture (scene: its light and the emitters' light it
  // reflects) and the characters' (glyphs, resolved), over the letters' lit rectangles; colors:
  // the rain's colours this frame (High contrast text off with the colour wave: their hue). On the
  // first frame drawn both programs are drawn (warmed), over a rectangle off the screen
  composite(scene: RenderTarget, glyphs: RenderTarget, colors: RainColors) {
    const gl = this.gl;
    const warm = this.rectCount === 0;
    if (warm && !this.warmComposite) {
      return;
    }
    // (the letters' box wholly off the screen, the OLED shift's reach included: nothing of them is drawn)
    if (!warm && !this.warmComposite && !TextVisibility.onScreen(this.box, this.width, this.height, this.limit + 2)) {
      return;
    }
    this.warmComposite = false;
    const count = warm ? 1 : this.rectCount;
    if (warm) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rects);
      gl.bufferData(gl.ARRAY_BUFFER, this.offScreen, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    const shift = this.shift.scene.x;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.stamps.textures[0]);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_2D, this.stamps.textures[1]);
    gl.bindVertexArray(this.rectArray);
    gl.enable(gl.BLEND);
    this.guard.begin("text", "chunk");
    // the characters' light times (1 - ink), plus the stamps' colour
    glyphs.bind();
    let u = this.glyphsProgram.use();
    gl.uniform2f(u.uSize, glyphs.width, glyphs.height);
    gl.uniform1f(u.uShiftPx, shift);
    gl.uniform1i(u.uShift, shift);
    const recolor = colors.wave && !this.highContrast;
    gl.uniform1i(u.uRecolor, recolor ? 1 : 0);
    if (recolor) {
      gl.uniform3fv(u.uColor1, colors.colors[0]);
      gl.uniform3fv(u.uColor2, colors.colors[1]);
      gl.uniform3fv(u.uColor3, colors.colors[2]);
      gl.uniform3fv(u.uColor4, colors.colors[3]);
      gl.uniform1i(u.uCustom, colors.custom ? 1 : 0);
      gl.uniform1i(u.uWave, colors.wave ? 1 : 0);
      gl.uniform1f(u.uWaveWidth, colors.width);
      gl.uniform1f(u.uWaveNow, colors.now);
      gl.uniform1f(u.uWaveScreen, colors.screen);
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    this.guard.piece();
    // the scene's light (and the emitters' light it reflects) times (1 - ink)
    scene.bind();
    u = this.sceneProgram.use();
    gl.uniform2f(u.uSize, scene.width, scene.height);
    gl.uniform1f(u.uShiftPx, shift);
    gl.uniform1i(u.uShift, shift);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    this.guard.piece();
    this.guard.end();
    gl.disable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (warm) {
      // (the letters' rectangles sent again when there are some)
      this.dirty = true;
    }
  }
}

M.Text = Text;
