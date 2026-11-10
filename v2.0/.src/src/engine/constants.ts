// The constants no single part of the wallpaper owns: each is read by several effects, the
// coordinator and the tests (on the namespace: M.UNITS, M.STRIKES_MOST, M.MAX_GAP). A constant
// with an owner stays with it: an effect's on its class, a surface's or a medium's in materials/,
// a model's limits in models/.

// the most the simulation moves on in one frame (s): a pause is never caught up
export const MAX_GAP = 0.25;

// the most strikes giving light at once: each has a slot of its own (its light, its channel,
// its baked shadows)
export const STRIKES_MOST = 3;

// the step rate's limits: the reference Speed, at which the rain makes Rain.STEP_RATE steps a second,
// and the Speed at which the rate would be infinite; at Speed v the rate is
// STEP_RATE x (SPEED_TOP - SPEED_REFERENCE) / (SPEED_TOP - v)
// (the Speed setting starts at SPEED_START: 75 is 30 x 30 / 25 = 36 steps a second)
export const SPEED_REFERENCE = 70;
export const SPEED_START = 75;
export const SPEED_TOP = 100;

// the texture units: each texture always on its own, so the samplers are set once
export const UNITS = {
  drops: 0,
  atlas: 1,
  noise: 2,
  waves: 3,
  waveMax: 4,
  reflection: 5,
  reflectionDistance: 6,
  work: 7,
  hdr: 8,
  hdrGlyphs: 9,
  fogDirect: 10,
  fogMirror: 11,
  fogSum: 12,
  fogSumMirror: 13,
  shade: 14,
  // the strikes' light on the water (Water's grid: the strikes' shadow grid is read only by the
  // bakes, on bloomFrom, and the emitter on work, each bound before them)
  strikeWater: 15,
  strikeDirect: 16,
  strikeMirror: 17,
  strikeSum: 18,
  strikeSumMirror: 19,
  waveBlocks: 20,
  // the bloom: a pass's input, and its four levels (read by the tone map)
  bloomFrom: 21,
  bloom1: 22,
  bloom2: 23,
  bloom3: 24,
  bloom4: 25,
  dropLife: 26,
  // the bolt's pieces and the characters bolt's characters (read by gl_InstanceID)
  boltSegments: 27,
  boltGlyphs: 28,
  // the characters' light the water reflects (the scene picture's second attachment: the bloom's
  // source with the characters' own)
  hdrReflected: 29,
  // the bolt's cover with Characters lightning (the line's and its characters' opacity, direct
  // and mirrored) and the nearness of what covers (1 / its distance), read by what lies behind
  boltCover: 30,
  boltNear: 31,
};

export type TextureUnit = keyof typeof UNITS;
