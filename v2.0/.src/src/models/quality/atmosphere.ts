// QualityAtmosphere (M.QualityAtmosphere): the atmosphere's tables and the seen sky's picture as ONE pure function of the Orb and the Air tone, no GL, no page, importable in any thread
// (the atmosphere worker runs it, workers/atmosphereworker.ts, a JobTask; Fog runs it here when no worker is alive or for a flush: the same code, so the array is the same bit for bit
// wherever it ran).
// run({ orbDir, orbIrradiance, tone }): one Float32Array of FLOATS = BLOCK_FLOATS + SKY_W x SKY_H x 4 floats:
//   [0, 44)  the Atmosphere uniform block in its std140 layout (11 vec4): aSH 0..35 (the order-2 harmonics, 9 vec4), aInfo 36..39 = (the mean radiance r, g, b, 1), aOrb 40..43 = (the Orb's
//            horizontal unit direction x, z (1, 0 when it is straight up), 0, 0)
//   [44, ..) the seen sky's picture, RGBA floats row by row (M.Atmosphere.skyTexture), the data of the RGBA16F texture the water's programs read
// The main thread only uploads: the block (UniformBlock.upload) and the picture (texSubImage2D as FLOAT).
// inputOf(orbGain, airTone): the input for the shipped Orb (MOON x its gain per channel, in MOON_DIR) with the Air tone: plain numbers in arrays (a structured clone carries it).
//
// Changelog:
// 2026-11-20: new (Feature S1, story A4): the build Fog.buildAtmosphere did on the main thread.
import { M } from "../../engine/core";
import { MOON, MOON_DIR } from "../../materials/sky";
import "../atmosphere";

export interface AtmosphereJob {
  orbDir: number[];
  orbIrradiance: number[];
  tone: number[];
}

const BLOCK_FLOATS = (9 + 2) * 4;

function run(input: AtmosphereJob): Float32Array {
  const A = M.Atmosphere;
  const tables = A.build({ orbDir: input.orbDir, orbIrradiance: input.orbIrradiance, tone: input.tone });
  const out = new Float32Array(BLOCK_FLOATS + A.SKY_W * A.SKY_H * 4);
  out.set(tables.sh, 0);
  out.set(tables.ambient, 36);
  out[39] = 1;
  const flat = Math.hypot(input.orbDir[0]!, input.orbDir[2]!);
  out[40] = flat > 1e-6 ? input.orbDir[0]! / flat : 1;
  out[41] = flat > 1e-6 ? input.orbDir[2]! / flat : 0;
  out[42] = 0;
  out[43] = 0;
  out.set(A.skyTexture(tables, input.orbDir), BLOCK_FLOATS);
  return out;
}

function inputOf(orbGain: ArrayLike<number>, airTone: ArrayLike<number>): AtmosphereJob {
  return {
    orbDir: Array.from(MOON_DIR),
    orbIrradiance: [MOON[0]! * orbGain[0]!, MOON[1]! * orbGain[1]!, MOON[2]! * orbGain[2]!],
    tone: [airTone[0]!, airTone[1]!, airTone[2]!],
  };
}

export const QualityAtmosphere = {
  BLOCK_FLOATS,
  FLOATS: BLOCK_FLOATS + 256 * 128 * 4,
  run,
  inputOf,
};

M.QualityAtmosphere = QualityAtmosphere;
