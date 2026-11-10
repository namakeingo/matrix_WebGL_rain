// Letters: the clock's and the message's block letters and their layout on the screen, a pure
// model (no GL, no page, runnable in any thread), matrix_web_rain's rules kept exactly:
// - GLYPHS: 40 block letters (0-9, A-Z, ":", "!", "?", " "), each rows of cells, "1" lit.
// - The text upper-cased first (toUpperCase: "ß" becomes "SS"); characters without a glyph are
//   skipped: no cells, no room, not measured.
// - A glyph's cells are UNIT (10) CSS pixels times the size; after each glyph one column of room;
//   the rows start UNIT / 4.5 px below the text's top.
// - The size absolute, or relative: the text (or `measure`, "88:88" for the clock, so its size
//   does not change with the time) sizePercent of the screen's width wide; 0 or below draws
//   nothing.
// - The position absolute (x, y in cells of UNIT), or relative: the text's middle at relativeX,
//   relativeY percent of the screen's whole cells (floored), then kept on the screen (clamped
//   after the floor, so a text at the right or bottom edge can start on a fractional cell).
// - Computed in CSS pixels (the screen's device size over the scale), then times the scale; the
//   OLED shift added in device pixels.
// - clockText: hours and minutes, two digits each; 12h from 1 to 12 (the hours past 12 minus 12,
//   the midnight hour 12, noon 12).
// The lit cells are given as rectangles, each row's run of lit cells of a glyph merged into one.
//
// Changelog:
// 2026-11-04: first version, from matrix_web_rain's letters, measureString, relativeTextSize,
//   percentagePosition and drawString.
// 2026-11-04: 12h: the midnight hour 12 (was 00, as matrix_web_rain's).
import { M } from "../engine/core";

// where and how big a text is drawn (the settings of the clock or the message)
export interface TextPlace {
  relativeSize: boolean;
  size: number;
  sizePercent: number;
  relativePosition: boolean;
  relativeX: number;
  relativeY: number;
  x: number;
  y: number;
}

// a text's lit cells
export interface TextLayout {
  text: string;
  // count rectangles, each x, y, w, h in device pixels from the screen's top left, the shift
  // included
  rects: Float32Array;
  count: number;
  // the lit cells' bounding box: x0, y0, x1, y1 (device pixels); all 0 when nothing is lit
  box: [number, number, number, number];
}

// a cell's side at size 1, CSS pixels
const UNIT = 10;
// the rows' offset below the text's top, CSS pixels
const ROW_OFFSET = UNIT / 4.5;

// each glyph's rows, "1" a lit cell
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "010", "010", "010", "010"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  A: ["010", "101", "101", "111", "101"],
  B: ["110", "101", "111", "101", "110"],
  C: ["111", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "111", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["0110", "1000", "1011", "1001", "0110"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["111", "001", "001", "101", "111"],
  K: ["1001", "1010", "1100", "1010", "1001"],
  L: ["100", "100", "100", "100", "111"],
  M: ["11111", "10101", "10101", "10001", "10001"],
  N: ["1001", "1101", "1011", "1001", "1001"],
  O: ["111", "101", "101", "101", "111"],
  P: ["111", "101", "111", "100", "100"],
  Q: ["0110", "1001", "1001", "1011", "1111"],
  R: ["110", "101", "101", "110", "101"],
  S: ["111", "100", "111", "001", "111"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["10001", "10001", "01010", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "11111"],
  X: ["10001", "01010", "00100", "01010", "10001"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  ":": ["000", "010", "000", "010", "000"],
  "!": ["010", "010", "010", "000", "010"],
  "?": ["111", "001", "010", "000", "010"],
  " ": ["000", "000", "000", "000", "000"],
};

// the glyphs of a text, upper-cased, those without a glyph left out
function glyphsOf(text: string): (readonly string[])[] {
  const upper = text.toUpperCase();
  const out: (readonly string[])[] = [];
  for (let i = 0; i < upper.length; i++) {
    const glyph = GLYPHS[upper.charAt(i)];
    if (glyph) out.push(glyph);
  }
  return out;
}

// a glyph's width in cells (its longest row)
function widthOf(glyph: readonly string[]): number {
  let w = 0;
  for (const row of glyph) w = Math.max(w, row.length);
  return w;
}

// a text's width and height in cells of UNIT at a size (no room after the last glyph)
function measure(text: string, size: number): [number, number] {
  let width = 0;
  let height = 0;
  for (const glyph of glyphsOf(text)) {
    width += (widthOf(glyph) + 1) * size;
    height = Math.max(height, glyph.length * size);
  }
  return [Math.max(0, width - size), height];
}

// the size that makes `text` percent of a screen `cssWidth` CSS pixels wide; 0 hides it
function relativeSize(text: string, percent: number, cssWidth: number): number {
  const cells = measure(text, 1)[0];
  if (!(cells > 0) || !(percent > 0)) return 0;
  return ((percent / 100) * cssWidth) / (cells * UNIT);
}

// the top left cell that puts a text's middle at a percentage of the screen, kept on the screen
function percentagePosition(text: string, size: number, percentX: number, percentY: number, cssWidth: number, cssHeight: number): [number, number] {
  const cells = measure(text, size);
  const columns = Math.floor(cssWidth / UNIT);
  const rows = Math.floor(cssHeight / UNIT);
  let x = Math.floor((columns * percentX) / 100 - cells[0] / 2);
  let y = Math.floor((rows * percentY) / 100 - cells[1] / 2);
  x = Math.max(0, Math.min(columns - cells[0], x));
  y = Math.max(0, Math.min(rows - cells[1], y));
  return [x, y];
}

// hours and minutes, two digits each
function clockText(date: Date, twelveHour: boolean): string {
  let h = date.getHours();
  const m = date.getMinutes();
  if (twelveHour) h = h % 12 || 12;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

// a text's lit cells on a screen of width x height device pixels (scale device pixels a CSS
// pixel), shifted by dx, dy device pixels
function layout(text: string, place: TextPlace, width: number, height: number, scale: number, measureText?: string, dx = 0, dy = 0): TextLayout {
  const cssWidth = width / scale;
  const cssHeight = height / scale;
  const size = place.relativeSize ? relativeSize(measureText || text, place.sizePercent, cssWidth) : place.size;
  const empty: TextLayout = { text, rects: new Float32Array(0), count: 0, box: [0, 0, 0, 0] };
  if (!(size > 0)) return empty;
  let cellX = place.x;
  let cellY = place.y;
  if (place.relativePosition) [cellX, cellY] = percentagePosition(text, size, place.relativeX, place.relativeY, cssWidth, cssHeight);
  const glyphs = glyphsOf(text);
  // at most one rectangle a lit cell
  let most = 0;
  for (const glyph of glyphs) for (const row of glyph) for (let i = 0; i < row.length; i++) if (row.charAt(i) == "1") most++;
  if (most == 0) return empty;
  const rects = new Float32Array(most * 4);
  const cell = size * UNIT;
  let count = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let currX = cellX * UNIT;
  for (const glyph of glyphs) {
    let currY = cellY * UNIT;
    let room = 0;
    for (const row of glyph) {
      let x = 0;
      while (x < row.length) {
        if (row.charAt(x) != "1") {
          x++;
          continue;
        }
        let end = x;
        while (end < row.length && row.charAt(end) == "1") end++;
        const left = (currX + x * cell) * scale + dx;
        const top = (currY + ROW_OFFSET) * scale + dy;
        const w = (end - x) * cell * scale;
        const h = cell * scale;
        rects[count * 4] = left;
        rects[count * 4 + 1] = top;
        rects[count * 4 + 2] = w;
        rects[count * 4 + 3] = h;
        count++;
        x0 = Math.min(x0, left);
        y0 = Math.min(y0, top);
        x1 = Math.max(x1, left + w);
        y1 = Math.max(y1, top + h);
        x = end;
      }
      room = Math.max(room, row.length * cell);
      currY += cell;
    }
    currX += cell + room;
  }
  return { text, rects, count, box: [x0, y0, x1, y1] };
}

export const Letters = { UNIT, GLYPHS, clockText, layout, measure };

M.Letters = Letters;
