// HdrBuffers: the pool of picture buffers the HDR bridge hands to the presenter's worker. A picture
// is read back into a buffer from the pool, the buffer is transferred to the worker (the worker
// owns it, the render worker's view of it detaches), and the worker transfers it back when it has
// copied the picture into its texture. At most COUNT buffers are made (lazily, one a picture the
// first time); acquire() gives a free one as an array of the picture's size (one 32-bit word a
// pixel: 10 bits a channel and 2 of alpha), or null when all are out; release() takes one back (a
// new array over it). A new size starts a new pool: the old buffers are dropped, and one of an
// older size coming back late is ignored.
//
// Changelog:
// 2026-11-05: new, for the HDR output's presenter worker.
// 2026-11-05: one word a pixel (RGB10_A2), was half floats or floats.
import { M } from "./core";
import type { HdrPixels } from "./hdrreadback";

const COUNT = 3;

export class HdrBuffers {
  static COUNT = COUNT;
  width: number;
  height: number;
  // the buffers' byte length now (a returned buffer of any other length is an older size's)
  bytes: number;
  // the buffers waiting, and how many were made for this size
  idle: ArrayBuffer[];
  made: number;
  constructor() {
    this.width = 0;
    this.height = 0;
    this.bytes = 0;
    this.idle = [];
    this.made = 0;
  }

  get free(): number {
    return this.idle.length;
  }

  // the picture's size (a new pool when it changes)
  size(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return;
    }
    this.width = width;
    this.height = height;
    this.bytes = width * height * 4;
    this.idle = [];
    this.made = 0;
  }

  // a free buffer as an array, or null when all are out
  acquire(): HdrPixels | null {
    const buffer = this.idle.pop();
    if (buffer) {
      return new Uint32Array(buffer);
    }
    if (this.made >= COUNT || this.bytes === 0) {
      return null;
    }
    this.made++;
    return new Uint32Array(new ArrayBuffer(this.bytes));
  }

  // a buffer given back (ignored: one of an older size, or one more than were made)
  release(buffer: ArrayBuffer): void {
    if (buffer.byteLength !== this.bytes || this.idle.length >= this.made || this.idle.indexOf(buffer) >= 0) {
      return;
    }
    this.idle.push(buffer);
  }
}

M.HdrBuffers = HdrBuffers;
