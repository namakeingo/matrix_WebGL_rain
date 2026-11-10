// HdrCheck: the bitmap path's self-check, the render worker's half. make() packs the known picture
// (HdrPack.checkWords) with the production pack shader (shaders/hdr/pack_fragment.glsl) into a canvas 2 x
// CHECK_WIDTH wide, in a WebGL 2.0 context of its own (small, made and let go at once), and gives its
// ImageBitmap (transferToImageBitmap); the presenter copies it on the GPU, unpacks it and compares every
// level (HdrPresenter.checkBitmap). A GPU or browser whose canvas images change the bytes (colour
// management, premultiplication) fails the check and the bridge reads the picture back instead. null:
// no OffscreenCanvas, no WebGL 2.0 or no transferToImageBitmap here.
//
// Changelog:
// 2026-11-05: new, for the bitmap path.
import { M } from "./core";
import { fill } from "./glsl";
import PACK_SOURCE from "../shaders/hdr/pack_fragment.glsl";
import CHECK_VERTEX from "../shaders/hdr/check_vertex.glsl";

export const HdrCheck = {
  make(): ImageBitmap | null {
    try {
      if (typeof OffscreenCanvas !== "function") {
        return null;
      }
      const P = M.HdrPack;
      const W = P.CHECK_WIDTH;
      const H = P.CHECK_HEIGHT;
      const canvas = new OffscreenCanvas(2 * W, H);
      if (typeof canvas.transferToImageBitmap !== "function") {
        return null;
      }
      const gl = canvas.getContext("webgl2", { antialias: false, depth: false, stencil: false }) as WebGL2RenderingContext | null;
      if (!gl) {
        return null;
      }
      const compile = (type: number, text: string) => {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, text);
        gl.compileShader(shader);
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, CHECK_VERTEX);
      const fragment = compile(gl.FRAGMENT_SHADER, fill(PACK_SOURCE, { "packGlsl": P.GLSL }));
      const program = gl.createProgram()!;
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        return null;
      }
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB10_A2, W, H, 0, gl.RGBA, gl.UNSIGNED_INT_2_10_10_10_REV, P.checkWords());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, "uPicture"), 0);
      gl.uniform1i(gl.getUniformLocation(program, "uWidth"), W);
      gl.viewport(0, 0, 2 * W, H);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const bitmap = canvas.transferToImageBitmap();
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return bitmap;
    } catch {
      return null;
    }
  },
};

M.HdrCheck = HdrCheck;
