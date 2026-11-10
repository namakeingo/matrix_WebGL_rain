// WaterState: what the water and everything that touches it does, from the Collision plane, Reflection plane
// and Ripples settings; pure, so every effect reads the same rules. Collision plane off: no splashes and no
// impacts of any kind (drops, splashes, strikes), the water stays calm. Reflection plane off: the water still
// reflects the baked sky and moon, but the scene (fog, drops, splashes, lightning) is not mirrored, so the
// reflection pass is skipped. Both off: no water at all (no surface, no reflection of the sky either), the
// rain and the lightning go down to the bottom of the screen. Ripples off: the waves are not stepped, the
// water is calm and keeps its reflections.
//
// Changelog:
// 2026-11-05: new.
import { M } from "../engine/core";

export interface WaterStateOf {
  splashes: boolean;
  impacts: boolean;
  wavesStepped: boolean;
  reflectionPass: boolean;
  skyMoonReflection: boolean;
  waterDrawn: boolean;
  floor: "water" | "screen";
}

function of(collision: boolean, reflection: boolean, ripples: boolean): WaterStateOf {
  const waterDrawn = collision || reflection;
  return {
    splashes: collision,
    impacts: collision,
    wavesStepped: collision && ripples,
    reflectionPass: reflection && waterDrawn,
    skyMoonReflection: waterDrawn,
    waterDrawn,
    floor: waterDrawn ? "water" : "screen",
  };
}

export const WaterState = { of };

M.WaterState = WaterState;
