// TextVisibility: whether the clock's and the message's letters can be seen (pure: no GL, no page, importable in any thread).
// onScreen: whether the letters' box (x0, y0, x1, y1, device pixels from the top left) meets the screen, widened by a margin
// (the OLED shift's reach); the composite over a box wholly off the screen draws nothing, so it is skipped. The text is a UI
// overlay, not an effect of the quality pool.
//
// Changelog:
// 2026-11-07: moved out of models/quality (the text is not in the quality pool).
import { M } from "../engine/core";

function onScreen(box: ArrayLike<number>, width: number, height: number, margin: number): boolean {
  return box[2] + margin > 0 && box[0] - margin < width && box[3] + margin > 0 && box[1] - margin < height && box[2] > box[0] && box[3] > box[1];
}

export const TextVisibility = { onScreen };

M.TextVisibility = TextVisibility;
