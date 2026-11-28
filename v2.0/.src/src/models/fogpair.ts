// The calibration pair's sliders (Feature U3, story M6; units.ui.fogpair.ts): the pure model of the headed pair's controls (pages/fogpaircompare/pair.html), TEMPORARY like the pair itself: the noise multiplier, the colour patches'
// contrast, the base mist's and the front cloud's own Fog intensities (one decimal), the base mist's height scale Hb and the front's tail scale Hf and share t. Pure, no GL, no page.
// - SLIDERS: { id, kind ('reload': the right frame reloads with the query; 'live': set on its fog effect), query | prop, min, max, step, def, decimals, label }, in the page's order
// - tenths(v), clampSlider(id, v), baseStrength(i), frontSigma(i) (the layers' terms of M.StaticMist.splitStrengths, each with its OWN intensity), defaults(), effective(state, single), live(state, single), query(state), format(id, v), colourEdges(c)
//
// Changelog:
// 2026-11-23: the calibrated defaults (noise 5, colour 1.6, hb 45, hf 100, tail 0.3); a slider that follows takes the single Fog intensity halved, a moved one is raw.
// 2026-11-23: new (Feature U3, story M6, the headed pair).
import { M } from "../engine/core";
import { BaseMist } from "../engine/basemist";
import { colourEdges } from "../materials/fog";
import { StaticMist } from "./staticmist";

interface Axis {
  id: string;
  kind: "reload" | "live";
  query?: string;
  prop?: string;
  min: number;
  max: number;
  step: number;
  def: number | null;
  decimals: number;
  label: string;
}
interface State {
  noise: number;
  colour: number;
  base: number | null;
  front: number | null;
  hb: number;
  hf: number;
  tail: number;
}

// (the shipped defaults, not the current test options': the page's reset goes back to them)
const SLIDERS: Axis[] = [
  { id: "noise", kind: "reload", query: "noiseContrast", min: 1, max: 10, step: 0.1, def: 5, decimals: 1, label: "noise multiplier (density and colour noise)" },
  { id: "colour", kind: "reload", query: "colourContrast", min: 0.25, max: 4, step: 0.05, def: 1.6, decimals: 2, label: "colour patches' contrast (1 = the earlier window)" },
  { id: "base", kind: "live", prop: "baseIntensity", min: 1, max: 100, step: 0.1, def: null, decimals: 1, label: "base mist: Fog intensity (own)" },
  { id: "front", kind: "live", prop: "frontIntensity", min: 1, max: 100, step: 0.1, def: null, decimals: 1, label: "front cloud: Fog intensity (own)" },
  { id: "hb", kind: "reload", query: "mistHeight", min: 10, max: 400, step: 1, def: 45, decimals: 0, label: "base mist: height scale Hb (m)" },
  { id: "hf", kind: "live", prop: "tailScale", min: 4, max: 130, step: 1, def: 100, decimals: 0, label: "front cloud: tail scale Hf (m)" },
  { id: "tail", kind: "live", prop: "tailShare", min: 0, max: 1, step: 0.01, def: 0.3, decimals: 2, label: "front cloud: tail share t" },
];

const axis = (id: string): Axis => SLIDERS.find((s) => s.id === id)!;
const clamp = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);

// the Fog intensity in tenths, 1 to 100
const tenths = (v: number): number => (typeof v === "number" && !isNaN(v) ? clamp(Math.round(v * 10) / 10, 1, 100) : 1);

// a slider's value clamped to its range and rounded to its step (NaN: its default, or its minimum for a default that follows)
function clampSlider(id: string, v: number): number {
  const a = axis(id);
  if (typeof v !== "number" || isNaN(v)) return a.def === null ? a.min : a.def;
  const x = clamp(v, a.min, a.max), places = Math.max(0, Math.ceil(-Math.log10(a.step) - 1e-9));
  return Number(clamp(a.min + Math.round((x - a.min) / a.step) * a.step, a.min, a.max).toFixed(places));
}

const baseStrength = (i: number): number => StaticMist.splitStrengths(i, BaseMist.SHARE).base;
const frontSigma = (i: number): number => StaticMist.splitStrengths(i, BaseMist.SHARE).front;

const defaults = (): State => ({ noise: 5, colour: 1.6, base: null, front: null, hb: 45, hf: 100, tail: 0.3 });

// the layers' intensities in tenths: a moved slider's (raw: it bypasses the halving; 1 is a faint layer, the factor raw / 101), or the single Fog intensity's, halved (M.StaticMist.layerIntensity), for one that follows
function effective(state: State, single: number): { base: number; front: number } {
  const followed = StaticMist.layerIntensity(single);
  return { base: tenths(state.base === null ? followed : state.base), front: tenths(state.front === null ? followed : state.front) };
}

// the values of the live sliders as the fog effect's properties
function live(state: State, single: number): { baseIntensity: number; frontIntensity: number; tailScale: number; tailShare: number } {
  const e = effective(state, single);
  return { baseIntensity: e.base, frontIntensity: e.front, tailScale: clampSlider("hf", state.hf), tailShare: clampSlider("tail", state.tail) };
}

// the reload sliders as the right frame's query
const query = (state: State): string => `noiseContrast=${clampSlider("noise", state.noise)}&colourContrast=${clampSlider("colour", state.colour)}&mistHeight=${clampSlider("hb", state.hb)}`;

const format = (id: string, v: number): string => Number(v).toFixed(axis(id).decimals);

export const FogPair = { SLIDERS, tenths, clampSlider, baseStrength, frontSigma, defaults, effective, live, query, format, colourEdges };

M.FogPair = FogPair;
