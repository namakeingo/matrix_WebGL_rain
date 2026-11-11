// The clock's and the message's layout (models/letters.ts: Letters.layout, the lit cells' rectangles) as a pure job, done off the render thread (the worker part "textlayout" of the
// bundle: src/index.ts routes it here; stateless: the input carries the texts, their places, the screen and the shift). Its client is a JobTask (platform/jobtask.ts) made in
// src/index.ts: Text.fork asks for the layout when something that lays the texts out changed (a text, a place, a size, the screen, the shift) and the frame waits for the answer, so the
// frame draws the new layout in the frame it was asked in; never asked in a frame that changed none.
// Input: { clock: LayoutArgs | null, message: LayoutArgs | null }, LayoutArgs = { text, place, width, height, scale, measure?, dx, dy }. Output: { clock, message }, each a TextLayout or
// null (a text not shown); the rectangles are transferred.
//
// Changelog:
// 2026-11-10: new.
// 2026-11-10: a pure job on a JobTask, awaited by the frame (it was a task of its own that gave the layout in a later frame).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { Letters } from "../models/letters";
import type { TextLayout, TextPlace } from "../models/letters";

export interface LayoutArgs {
  text: string;
  place: TextPlace;
  width: number;
  height: number;
  scale: number;
  measure?: string;
  dx: number;
  dy: number;
}

export interface LayoutJob {
  clock: LayoutArgs | null;
  message: LayoutArgs | null;
}

export interface LayoutOut {
  clock: TextLayout | null;
  message: TextLayout | null;
}

const lay = (a: LayoutArgs | null): TextLayout | null => (a ? Letters.layout(a.text, a.place, a.width, a.height, a.scale, a.measure, a.dx, a.dy) : null);

function job(input: LayoutJob): LayoutOut {
  return { clock: lay(input.clock), message: lay(input.message) };
}

function serve(): void {
  serveJob(workerScope(), job, (out) => {
    const transfer: Transferable[] = [];
    if (out.clock) {
      transfer.push(out.clock.rects.buffer);
    }
    if (out.message) {
      transfer.push(out.message.rects.buffer);
    }
    return transfer;
  });
}

export const TextLayoutWorker = { job, serve };

M.TextLayoutWorker = TextLayoutWorker;
