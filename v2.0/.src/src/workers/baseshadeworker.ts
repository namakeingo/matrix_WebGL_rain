// The base mist's shade grid baked off the render thread (Feature P1, story M7b; units.ui.basemistcpu.ts: the worker part "baseshade" of the bundle, src/index.ts routes it here). The job is M.BaseShadeGrid's build over the layers
// the input names (input.layers [from, to), default all 96; input.part 'front' bakes the front layers instead), answered as a band's own array (the layers' halves from index 0); its client is a JobTask (platform/jobtask.ts) made
// in src/index.ts at the wallpaper's start; Fog asks it band by band (BAND layers each: the base grid costs seconds of script once per strength or size change, so no band is ever inline unless its worker is lost).
// - NAME: the task's and the worker part's name; BAND: the layers of a band
// - job(input): the layers' halves; transferOf(output): [output.buffer]; serve(): serveJob over them
//
// Changelog:
// 2026-11-23: serve() answers the warm message (BaseShadeGrid.prepare: the noise generated before the first band).
// 2026-11-23: new (Feature P1, story M7b).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { BaseShadeGrid } from "../models/baseshadegrid";
import type { BaseShadeInput } from "../models/baseshadegrid";

export interface BaseShadeJob extends BaseShadeInput {
  part?: string;
}

const NAME = "baseshade";
const BAND = 4;

function job(input: BaseShadeJob): Uint16Array {
  const from = input.layers ? input.layers[0]! : 0, to = input.layers ? input.layers[1]! : BaseShadeGrid.LAYERS;
  const out = new Uint16Array((to - from) * BaseShadeGrid.PLANE);
  if (input.part === "front") {
    BaseShadeGrid.buildFront(input, out, from, to);
  } else {
    BaseShadeGrid.build(input, out, from, to);
  }
  return out;
}

function transferOf(output: Uint16Array): Transferable[] {
  return [output.buffer as ArrayBuffer];
}

function serve(): void {
  serveJob(workerScope(), job, transferOf, (input) => BaseShadeGrid.prepare((input as { stretch: number }).stretch));
}

export const BaseShadeWorker = { NAME, BAND, job, transferOf, serve };

M.BaseShadeWorker = BaseShadeWorker;
