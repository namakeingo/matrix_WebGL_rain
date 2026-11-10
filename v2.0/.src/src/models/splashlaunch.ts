// SplashLaunch: a splash's launch from the Splash height target, pure. The target is the average height of
// a splash thrown straight up: the launch speed is sqrt(2 g h f) under Earth's gravity, f an energy factor
// about the ideal 1 (uniform from ENERGY_MIN to ENERGY_MAX, mean 1, so the mean straight-up height over the
// variance is the target, h f each). The speed is the same in every direction of the splash's cone, so a
// slanted splash peaks lower than the target (its peak is (speed sin(elevation))^2 / 2 g).
//
// Changelog:
// 2026-11-05: new: the splashes' launch from a target height in metres (was a fixed 18 to 60 mm).
import { M } from "../engine/core";

const GRAVITY = 9.81;
const ENERGY_MIN = 0.5;
const ENERGY_MAX = 1.5;

interface Vector {
  x: number;
  y: number;
  z: number;
}

// the launch speed (m/s) for a straight-up height of `height` m at the energy factor `energy`
const speedFor = (height: number, energy = 1): number => Math.sqrt(2 * GRAVITY * height * energy);

// the energy factor for a random value from 0 to 1
const energyFactorOf = (random01: number): number => ENERGY_MIN + (ENERGY_MAX - ENERGY_MIN) * random01;

// the highest point (m) of a splash thrown straight up at `speed`
const heightStraightUp = (speed: number): number => (speed * speed) / (2 * GRAVITY);

// the velocity (m/s) of length `speed`: azimuth round the vertical (y up), elevation from the water's plane
// (90 degrees straight up)
const velocity = (speed: number, azimuth: number, elevation: number): Vector => {
  const flat = speed * Math.cos(elevation);
  return { x: flat * Math.cos(azimuth), y: speed * Math.sin(elevation), z: flat * Math.sin(azimuth) };
};

export const SplashLaunch = { GRAVITY, ENERGY_MIN, ENERGY_MAX, speedFor, energyFactorOf, heightStraightUp, velocity };

M.SplashLaunch = SplashLaunch;
