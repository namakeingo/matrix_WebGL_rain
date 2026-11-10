// The drops' characters as emitters (the rain's and the splashes'): how their head looks and how
// much light it gives, read by the characters' fragment shader (engine/glyphs.ts).
//
// Changelog:
// 2026-11-04: a module of src/materials/ (was in engine/glyphs.js).

// the head's whitening at the default Head brightness (75)
export const HEAD = 0.75;

// the head's extra light at Head brightness 100: 1 + HEAD_GAIN x uHead times the light (an
// emitter's own light, the same at any distance)
export const HEAD_GAIN = 1;
