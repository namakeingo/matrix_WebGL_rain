// HdrReadback: the HDR picture read back from WebGL without a stall (the HDR bridge's first half).
// The picture is RGB10_A2 (10 bits a channel, 4 bytes a pixel: the tone map writes the encoded
// output over 0 to HdrOutput.ENCODED_MAX): reading it back costs what its bytes cost, and
// half floats cost twice as much (measured: getBufferSubData of 33 MB took 14.5 ms at 1920 x 2160).
// request() reads the bound framebuffer's picture into a pixel pack buffer and puts a fence after
// it; take() gives the newest picture whose fence has passed (clientWaitSync with a timeout of 0,
// then getBufferSubData into the destination it is given), never waiting: a frame that has none
// ready gets none, and with no destination (the pool's buffers all out) it takes nothing. A ring of
// SLOTS buffers; when every slot waits, request() skips that frame. Where several pictures are ready
// the newest is given and the older slots freed (a picture older than another is never shown after
// it). It has no array of its own (HdrBuffers': the picture's buffer goes on to the presenter's
// worker, transferred). readable(gl) says, once, whether the bound picture reads back as RGBA with
// UNSIGNED_INT_2_10_10_10_REV (what ES 3.0 guarantees for RGB10_A2).
//
// Changelog:
// 2026-11-05: new, for the HDR output.
// 2026-11-05: take(dst), the destination from HdrBuffers (it had an array of its own).
// 2026-11-05: RGB10_A2, 4 bytes a pixel (was half floats, 8).
import { M } from "./core";

const SLOTS = 3;

// one 32-bit word a pixel
export type HdrPixels = Uint32Array;

export class HdrReadback {
  static SLOTS = SLOTS;
  gl: WebGL2RenderingContext;
  width: number;
  height: number;
  buffers: (WebGLBuffer | null)[];
  fences: (WebGLSync | null)[];
  // the slots in the order they were requested (oldest first)
  queue: number[];
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.width = 0;
    this.height = 0;
    this.buffers = [];
    this.fences = [];
    this.queue = [];
    for (let i = 0; i < SLOTS; i++) {
      this.buffers.push(null);
      this.fences.push(null);
    }
  }

  // whether the bound framebuffer's picture reads back as RGBA with UNSIGNED_INT_2_10_10_10_REV
  // (asked once, not in a frame)
  static readable(gl: WebGL2RenderingContext): boolean {
    const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) as number;
    const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number;
    return format === gl.RGBA && type === gl.UNSIGNED_INT_2_10_10_10_REV;
  }

  // buffers for a picture of this size (the pending reads dropped when it changes)
  size(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return;
    }
    const gl = this.gl;
    this.release();
    this.width = width;
    this.height = height;
    for (let i = 0; i < SLOTS; i++) {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, width * height * 4, gl.STREAM_READ);
      this.buffers[i] = buffer;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }

  // reads the bound framebuffer's picture (width x height) into the next free slot; false: all wait
  request(): boolean {
    const gl = this.gl;
    let slot = -1;
    for (let i = 0; i < SLOTS; i++) {
      if (!this.fences[i] && this.buffers[i]) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      return false;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffers[slot]);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_INT_2_10_10_10_REV, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.fences[slot] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this.queue.push(slot);
    return true;
  }

  // the newest picture ready, in dst, or null (never waits; no dst: nothing taken)
  take(dst: HdrPixels | null): HdrPixels | null {
    if (!dst) {
      return null;
    }
    const gl = this.gl;
    let ready = -1;
    for (let k = 0; k < this.queue.length; k++) {
      const fence = this.fences[this.queue[k]];
      if (!fence) {
        continue;
      }
      const status = gl.clientWaitSync(fence, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
        ready = k;
      } else {
        break;
      }
    }
    if (ready < 0) {
      return null;
    }
    const slot = this.queue[ready];
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buffers[slot]);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, dst);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    // (the picture and every older one done with: their fences deleted, their slots free)
    for (let k = 0; k <= ready; k++) {
      const s = this.queue[k];
      gl.deleteSync(this.fences[s]);
      this.fences[s] = null;
    }
    this.queue.splice(0, ready + 1);
    return dst;
  }

  // the pending reads dropped and the buffers deleted
  release(): void {
    const gl = this.gl;
    for (let i = 0; i < SLOTS; i++) {
      if (this.fences[i]) {
        gl.deleteSync(this.fences[i]);
        this.fences[i] = null;
      }
      if (this.buffers[i]) {
        gl.deleteBuffer(this.buffers[i]);
        this.buffers[i] = null;
      }
    }
    this.queue.length = 0;
    this.width = 0;
    this.height = 0;
  }

  destroy(): void {
    this.release();
  }
}

M.HdrReadback = HdrReadback;
