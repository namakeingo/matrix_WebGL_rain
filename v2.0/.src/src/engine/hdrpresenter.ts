// HdrPresenter: the HDR picture shown through WebGPU (the HDR bridge's second half). Its canvas
// (an OffscreenCanvas in the presenter's worker) is configured as rgba16float with the extended tone
// mapping, so a value of 1 is the user's SDR white and more is HDR up to the display's headroom.
// A picture arrives in one of two ways, both drawn on the canvas with one triangle:
//  - present(pixels): the CPU readback's picture (RGB10_A2: one word a pixel, 10 bits a channel over
//    0 to HdrOutput.ENCODED_MAX) written into an rgb10a2unorm texture (shaders/webgpu/hdr.wgsl scales it
//    back by ENCODED_MAX and flips its rows: WebGL reads the bottom row first);
//  - presentBitmap(bitmap, width, height): an ImageBitmap of a WebGL canvas 2 x width wide, the levels
//    packed in 8 bit pixels (HdrPack), copied into an rgba8unorm texture on the GPU
//    (copyExternalImageToTexture: no CPU readback) and unpacked by shaders/webgpu/hdrbitmap.wgsl.
// checkBitmap(bitmap) is the bitmap path's self-check: a known picture (HdrPack.checkWords) sent through
// it must come back with every level of every channel exact, else the bridge uses the readback.
// Its device is its own; a lost device (a driver reset) calls onLost, once. create() resolves to a
// presenter, or to null with the reason in `why` where there is no WebGPU, no adapter or device, or the
// canvas cannot be configured.
//
// Changelog:
// 2026-11-05: new, for the HDR output.
// 2026-11-05: the picture is RGB10_A2 (was half floats or floats).
// 2026-11-05: presentBitmap and checkBitmap (the ImageBitmap hand-over).
import { M } from "./core";
import { fill } from "./glsl";
import type { HdrPixels } from "./hdrreadback";
import HDR_SOURCE from "../shaders/webgpu/hdr.wgsl";
import HDR_BITMAP_SOURCE from "../shaders/webgpu/hdrbitmap.wgsl";
import HDR_CHECK_SOURCE from "../shaders/webgpu/hdrcheck.wgsl";

// the configuration the extended tone mapping and its colour space need (not in every typing of
// GPUCanvasConfiguration)
interface HdrConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  colorSpace: string;
  toneMapping: { mode: string };
  alphaMode: GPUCanvasAlphaMode;
}

export interface HdrPresenterResult {
  presenter: HdrPresenter | null;
  why: string;
}

export class HdrPresenter {
  device: GPUDevice;
  canvas: OffscreenCanvas;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  bitmapPipeline: GPURenderPipeline;
  params: GPUBuffer;
  values: Float32Array<ArrayBuffer>;
  texture: GPUTexture | null;
  group: GPUBindGroup | null;
  packed: GPUTexture | null;
  packedGroup: GPUBindGroup | null;
  width: number;
  height: number;
  frames: number;
  lost: boolean;
  attachment: GPURenderPassColorAttachment;
  pass: GPURenderPassDescriptor;
  constructor(device: GPUDevice, canvas: OffscreenCanvas, context: GPUCanvasContext, pipeline: GPURenderPipeline, bitmapPipeline: GPURenderPipeline) {
    this.device = device;
    this.canvas = canvas;
    this.context = context;
    this.pipeline = pipeline;
    this.bitmapPipeline = bitmapPipeline;
    this.params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.values = new Float32Array(4);
    this.texture = null;
    this.group = null;
    this.packed = null;
    this.packedGroup = null;
    this.width = 0;
    this.height = 0;
    this.frames = 0;
    this.lost = false;
    // (the render pass's description, made once: only its view changes)
    this.attachment = { view: null as unknown as GPUTextureView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" };
    this.pass = { colorAttachments: [this.attachment] };
  }

  static async create(canvas: OffscreenCanvas, onLost: (message: string) => void): Promise<HdrPresenterResult> {
    try {
      if (typeof navigator === "undefined" || !navigator.gpu) {
        return { presenter: null, why: "no WebGPU" };
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return { presenter: null, why: "no WebGPU adapter" };
      }
      const device = await adapter.requestDevice();
      const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
      if (!context) {
        device.destroy();
        return { presenter: null, why: "no WebGPU context on the HDR canvas" };
      }
      const configuration: HdrConfiguration = { device, format: "rgba16float", colorSpace: "srgb", toneMapping: { mode: "extended" }, alphaMode: "opaque" };
      (context as unknown as { configure(c: object): void }).configure(configuration);
      const module = device.createShaderModule({ code: HDR_SOURCE });
      const bitmapModule = device.createShaderModule({ code: fill(HDR_BITMAP_SOURCE, { "unpackHdr": M.HdrPack.WGSL }) });
      const [pipeline, bitmapPipeline] = await Promise.all([
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module, entryPoint: "vs" },
          fragment: { module, entryPoint: "fs", targets: [{ format: "rgba16float" }] },
        }),
        device.createRenderPipelineAsync({
          layout: "auto",
          vertex: { module: bitmapModule, entryPoint: "vs" },
          fragment: { module: bitmapModule, entryPoint: "fs", targets: [{ format: "rgba16float" }] },
        }),
      ]);
      const presenter = new HdrPresenter(device, canvas, context, pipeline, bitmapPipeline);
      void device.lost.then((lost) => {
        if (lost.reason !== "destroyed" && !presenter.lost) {
          presenter.lost = true;
          onLost(lost.message);
        }
      });
      return { presenter, why: "" };
    } catch (error) {
      return { presenter: null, why: String((error && (error as Error).message) || error) };
    }
  }

  // the canvas this size, and the parameters the shaders read
  setSize(width: number, height: number): boolean {
    if (width === this.width && height === this.height) {
      return false;
    }
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.values[0] = width;
    this.values[1] = height;
    this.values[2] = M.HdrOutput.ENCODED_MAX;
    this.device.queue.writeBuffer(this.params, 0, this.values);
    return true;
  }

  // the picture's texture this size (made again when it changes)
  size(width: number, height: number): void {
    if (!this.setSize(width, height) && this.texture) {
      return;
    }
    if (this.texture) {
      this.texture.destroy();
    }
    this.texture = this.device.createTexture({
      size: [width, height],
      format: "rgb10a2unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.group = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: this.texture.createView() },
      ],
    });
  }

  // the picture (width x height pixels, RGBA) shown on the canvas
  present(pixels: HdrPixels): void {
    if (this.lost || !this.texture || !this.group) {
      return;
    }
    this.device.queue.writeTexture({ texture: this.texture }, pixels as unknown as GPUAllowSharedBufferSource, { bytesPerRow: this.width * 4 }, [this.width, this.height]);
    this.draw(this.pipeline, this.group);
  }

  // a picture handed over as an ImageBitmap (2 x width wide, height rows: HdrPack's two halves), copied on the
  // GPU and shown; the bitmap is closed
  presentBitmap(bitmap: ImageBitmap, width: number, height: number): void {
    if (this.lost) {
      bitmap.close();
      return;
    }
    const resized = this.setSize(width, height);
    if (resized || !this.packed || !this.packedGroup) {
      if (this.packed) {
        this.packed.destroy();
      }
      this.packed = this.device.createTexture({
        size: [2 * width, height],
        format: "rgba8unorm",
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.packedGroup = this.device.createBindGroup({
        layout: this.bitmapPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.params } },
          { binding: 1, resource: this.packed.createView() },
        ],
      });
    }
    this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: this.packed }, [2 * width, height]);
    bitmap.close();
    this.draw(this.bitmapPipeline, this.packedGroup!);
  }

  draw(pipeline: GPURenderPipeline, group: GPUBindGroup): void {
    this.attachment.view = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass(this.pass);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.frames++;
  }

  // the bitmap path's self-check: the known picture (HdrPack.checkWords, packed into a canvas 2 x CHECK_WIDTH
  // wide) copied and unpacked into a 32 bit unsigned target, read back, and compared level by level; true when
  // every level of every channel of every pixel is exact; the bitmap is closed
  async checkBitmap(bitmap: ImageBitmap, width: number, height: number): Promise<boolean> {
    const P = M.HdrPack;
    const W = P.CHECK_WIDTH;
    const H = P.CHECK_HEIGHT;
    if (this.lost || width !== W || height !== H || bitmap.width !== 2 * W || bitmap.height !== H) {
      bitmap.close();
      return false;
    }
    const device = this.device;
    device.pushErrorScope("validation");
    const packed = device.createTexture({ size: [2 * W, H], format: "rgba8unorm", usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: packed }, [2 * W, H]);
    bitmap.close();
    const target = device.createTexture({ size: [W, H], format: "rgba32uint", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const module = device.createShaderModule({ code: fill(HDR_CHECK_SOURCE, { "unpackHdr": P.WGSL, "width": W, "height": H }) });
    const pipeline = await device.createRenderPipelineAsync({ layout: "auto", vertex: { module, entryPoint: "vs" }, fragment: { module, entryPoint: "fs", targets: [{ format: "rgba32uint" }] } });
    const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: packed.createView() }] });
    const read = device.createBuffer({ size: W * 16 * H, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
    encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow: W * 16 }, [W, H]);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const got = new Uint32Array(read.getMappedRange().slice(0));
    read.unmap();
    const error = await device.popErrorScope();
    packed.destroy();
    target.destroy();
    read.destroy();
    if (error) {
      return false;
    }
    for (let i = 0; i < W * H; i++) {
      const want = P.checkLevels(i);
      if (got[i * 4] !== want[0] || got[i * 4 + 1] !== want[1] || got[i * 4 + 2] !== want[2]) {
        return false;
      }
    }
    return true;
  }

  destroy(): void {
    this.lost = true;
    if (this.texture) {
      this.texture.destroy();
      this.texture = null;
    }
    if (this.packed) {
      this.packed.destroy();
      this.packed = null;
    }
    this.params.destroy();
    this.device.destroy();
  }
}

M.HdrPresenter = HdrPresenter;
