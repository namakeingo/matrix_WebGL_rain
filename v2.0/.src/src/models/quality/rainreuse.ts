// QualityRainReuse: whether last frame's mirrored picture (Reflection's persistent picture: the mirrored rain, splashes and bolt, and its mip
// chain) can stand for this frame's, decided on the CPU from the inputs that define it. Pure: no GL, no page, no allocation in use().
//
// What can be reused (SCOPE):
// - The mirrored picture: Reflection's picture is a texture of its own, kept between frames when it is not invalidated, so skipping its clear,
//   the mirrored draws and the mip chain leaves the last frame's pictures in place: no extra memory, no copy.
// - Not the direct rain: it is drawn additively into Exposure's multisampled glyphs target together with the splashes and the bolt, a target
//   cleared every frame; reusing it needs a persistent rain-only multisampled target (4 samples x 8 bytes x a 1920 x 2160 screen = 133 MB) and a
//   pass writing the same pixels back, about as much traffic as the culled draw costs.
//
// The picture depends on: the rain's step (the drops' cells, the splashes' stamps and the colour wave all go by step), the camera (version; a
// dirty camera is a new view), the OLED shift (it only moves the text, kept in the key: a move is rare), the settings (a stamp), the picture's
// size (a resize loses its contents), Effect.lod, the bolt's cover (drawn each frame: never reused), the strikes' light and bolts (a signature of
// their levels: any change is a new picture) and the fog's mirrored volume, read where each cell is drawn.
//
// The rule (Gate.use): with lod off never reuse (the earlier behaviour exactly); covered or a dirty camera: draw; any of step, camera, shift,
// settings, size, strikes differing from the drawn picture's: draw; only the fog's stamp differing: reuse while the picture's age (frames since
// it was drawn) is at most MAX_LAG, else draw (the fog dims the trail up to MAX_LAG frames late: 25 ms at 120 fps); the fog's stamp the same:
// the pixels are identical however long the key holds.
//
// Changelog:
// 2026-11-08: new.
import { M } from "../../engine/core";

// the most frames a reused picture may be old when the fog has changed since it was drawn (a step is 4 frames at the default Speed at 120 fps)
const MAX_LAG = 3;

const SCOPE = { direct: false, mirrored: true };

// the values a frame's decision reads
interface ReuseInputs {
  step: number;
  camera: number;
  cameraDirty: boolean;
  shift: number;
  settings: number;
  size: number;
  lod: boolean;
  covered: boolean;
  strikes: number;
  fog: number;
}

class Gate {
  // the frames since the picture was drawn (0: drawn this frame), the pictures drawn and the frames that reused one
  age: number;
  drawn: number;
  reused: number;
  // the inputs the picture was drawn for
  has: boolean;
  step: number;
  camera: number;
  shift: number;
  settings: number;
  size: number;
  strikes: number;
  fog: number;
  constructor() {
    this.age = 0;
    this.drawn = 0;
    this.reused = 0;
    this.has = false;
    this.step = this.camera = this.shift = this.settings = this.size = this.strikes = this.fog = 0;
  }

  // forgets the picture (a resize, a lost context): the next frame draws
  reset() {
    this.has = false;
  }

  // true: reuse the picture; false: draw it, and these inputs are its
  use(i: ReuseInputs): boolean {
    if (!i.lod || i.covered || i.cameraDirty) {
      this.has = false;
      return false;
    }
    if (
      this.has &&
      this.step === i.step &&
      this.camera === i.camera &&
      this.shift === i.shift &&
      this.settings === i.settings &&
      this.size === i.size &&
      this.strikes === i.strikes &&
      (this.fog === i.fog || this.age < MAX_LAG)
    ) {
      this.age++;
      this.reused++;
      return true;
    }
    this.has = true;
    this.age = 0;
    this.drawn++;
    this.step = i.step;
    this.camera = i.camera;
    this.shift = i.shift;
    this.settings = i.settings;
    this.size = i.size;
    this.strikes = i.strikes;
    this.fog = i.fog;
    return false;
  }
}

// whether the picture is left in place (not invalidated) after the water has read it
function keeps(lod: boolean): boolean {
  return lod;
}

export const QualityRainReuse = { MAX_LAG, SCOPE, Gate, keeps };
export type { ReuseInputs };
M.QualityRainReuse = QualityRainReuse;
