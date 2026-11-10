// WebGPU beside WebGL 2.0: it finds an adapter and a device, works out the drops' hashes with a
// compute shader (each checked against the script's: the same ones lay the drops out), draws a
// triangle into a small picture and reads it back, and draws the readout's panel on a canvas of
// its own every frame (its validation errors counted), as large as the readout in device pixels
// (the panel's host: its canvas, a page's or a worker's OffscreenCanvas; its size; its CSS size
// set, on the page or by a message to it). Its pipelines are made asynchronously. A lost device (a driver reset) is
// counted by the GPU guard with WebGL's lost contexts, and starts it again after a second unless
// the guard has stopped (then onStopped). Its device is kept only while the readout is shown
// (want): let go when it is hidden, made again (its checks run again) when it is shown. A start
// that fails (no adapter, no device, a check that throws) is not tried again until the readout is
// shown again after being hidden, or after a lost device. What it finds goes into report
// (Support.webgpu).
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/engine/ (was engine/webgpu.js).
import { M } from "./core";
import { fill } from "./glsl";
import type { GpuGuard } from "./guard";
import type { WebGPUReport } from "../platform/support";
import type { Panel as PanelHost } from "../platform/page";
import type { CompareResult } from "../models/rainlayout";
import COMPUTE_SOURCE from "../shaders/webgpu/compute.wgsl";
import TRIANGLE_SOURCE from "../shaders/webgpu/triangle.wgsl";
import PANEL_SOURCE from "../shaders/webgpu/panel.wgsl";

const COMPUTE_WGSL = fill(COMPUTE_SOURCE, { "M.HASH_WGSL": M.HASH_WGSL });

// a triangle over the left and lower half of a picture (its corner at the bottom left)
const TRIANGLE_WGSL = TRIANGLE_SOURCE;

// the readout's panel: dark and translucent, with a line of light along its bottom that moves
// with the time (so a panel that is not drawn again shows)
const PANEL_WGSL = PANEL_SOURCE;

// the GPU's hashes against the script's: { wrong, first, a, b }, or a promise of it
export type CompareHashes = (hashes: Uint32Array<ArrayBuffer>) => CompareResult | Promise<CompareResult>;

// the readout's panel's WebGPU objects (made once a device)
interface PanelState {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  params: GPUBuffer;
  values: Float32Array<ArrayBuffer>;
  group: GPUBindGroup;
  // (its view set each frame before the pass begins)
  attachment: Omit<GPURenderPassColorAttachment, "view"> & { view: GPUTextureView | null };
  pass: GPURenderPassDescriptor | null;
}

export class WebGPUSupport {
  gaveUp: boolean;
  wanted: boolean;
  starting: Promise<void> | null;
  panel: PanelState | null;
  device: GPUDevice | null;
  onStopped: () => void;
  onHashes: (hashes: Uint32Array<ArrayBuffer>) => void;
  compareHashes: CompareHashes;
  seed: number;
  count: number;
  host: PanelHost;
  guard: GpuGuard;
  report: WebGPUReport;
  // report: Support.webgpu; guard: the GPU guard; compareHashes(hashes): the GPU's hashes
  // against the script's ({ wrong, first, a, b }, or a promise of it: worked out in the scene's
  // worker where there is one); onHashes(hashes): the GPU's hashes, when they are the script's;
  // onStopped(): a lost device made the guard stop the wallpaper; host: the panel's { canvas,
  // size() (device pixels), style(width, height) }
  constructor(report: WebGPUReport, guard: GpuGuard, count: number, seed: number, compareHashes: CompareHashes, onHashes: (hashes: Uint32Array<ArrayBuffer>) => void, onStopped: () => void, host: PanelHost) {
    this.report = report;
    this.guard = guard;
    this.host = host;
    this.count = count;
    this.seed = seed;
    this.compareHashes = compareHashes;
    this.onHashes = onHashes;
    this.onStopped = onStopped;
    this.device = null;
    this.panel = null;
    this.starting = null;
    this.wanted = true;
    // the last start failed: not tried again until the readout is shown anew or a device is lost
    this.gaveUp = false;
  }

  // starts it (once at a time); afterwards its device let go if it is not wanted
  start(): Promise<void> {
    if (!this.starting) {
      this.starting = this.run().then(() => {
        this.starting = null;
        this.want(this.wanted);
      });
    }
    return this.starting;
  }

  // whether its device is wanted (the readout shown): made, or let go
  want(wanted: boolean) {
    if (wanted && !this.wanted) {
      this.gaveUp = false;
    }
    this.wanted = wanted;
    if (this.starting) {
      return;
    }
    if (wanted && !this.device && navigator.gpu && !this.guard.stopped && !this.gaveUp) {
      this.start();
    } else if (!wanted && this.device) {
      const device = this.device;
      if (this.panel) {
        this.panel.context.unconfigure();
      }
      this.device = null;
      this.panel = null;
      device.destroy();
    }
  }

  async run() {
    const w = this.report;
    if (!navigator.gpu) {
      this.failed("navigator.gpu is not there");
      return;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) {
        throw new Error("no adapter");
      }
      const info = adapter.info || {};
      w.adapter = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" ") || "(no details given)";
      w.fallbackAdapter = !!((adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter || info.isFallbackAdapter);
      w.features = Array.from(adapter.features).sort();
      w.limits = {
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
        maxBufferSize: adapter.limits.maxBufferSize,
        maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
      };
      const device = await adapter.requestDevice();
      this.device = device;
      w.ok = true;
      device.addEventListener("uncapturederror", (e) => {
        if (w.errors.length < 10) {
          w.errors.push(String(e.error.message));
        }
      });
      device.lost.then((lost) => {
        if (this.device === device) {
          this.device = null;
          this.panel = null;
        }
        // (a driver reset, not a device let go: start again, as WebGL does, unless there were
        // too many)
        if (lost.reason !== "destroyed") {
          w.error = `device lost: ${lost.message}`;
          this.guard.lost(performance.now());
          if (this.guard.stopped) {
            this.onStopped();
          } else {
            setTimeout(() => {
              this.gaveUp = false;
              this.want(this.wanted);
            }, 1000);
          }
        }
      });
      await this.compute(device);
      // (the render check and the panel only while the readout is shown: it is all they are for)
      if (this.wanted) {
        await this.renderCheck(device);
        await this.setupPanel(device);
      }
    } catch (error) {
      this.failed(String((error && (error as Error).message) || error));
    }
  }

  failed(message: string) {
    this.report.ok = false;
    this.report.error = message;
    this.gaveUp = true;
  }

  // the drops' hashes on the GPU, checked against the script's
  async compute(device: GPUDevice) {
    const count = this.count * 4;
    const hashes = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(params, 0, new Uint32Array([this.seed, 0, 0, 0]));
    const readback = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const pipeline = await device.createComputePipelineAsync({
      layout: "auto",
      compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
    });
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: hashes } },
        { binding: 1, resource: { buffer: params } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();
    encoder.copyBufferToBuffer(hashes, 0, readback, 0, count * 4);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const gpu = new Uint32Array(readback.getMappedRange().slice(0));
    readback.unmap();
    [hashes, params, readback].forEach((b) => b.destroy());
    const result = await this.compareHashes(gpu);
    if (result.wrong > 0) {
      this.report.compute = `${result.wrong} of ${count} differ (first ${result.first}: ${result.a}, the script ${result.b})`;
      return;
    }
    this.report.compute = "ok";
    this.onHashes(gpu);
  }

  // a triangle drawn into a small picture, read back: bottom left red, top right the clear blue
  async renderCheck(device: GPUDevice) {
    const size = 8;
    const texture = device.createTexture({
      size: [size, size],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const module = device.createShaderModule({ code: TRIANGLE_WGSL });
    const pipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
    });
    // (rows of a copy are 256 bytes apart at least)
    const readback = device.createBuffer({ size: 256 * size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: texture.createView(), clearValue: { r: 0, g: 0, b: 1, a: 1 }, loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();
    encoder.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: 256 }, [size, size]);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const px = new Uint8Array(readback.getMappedRange().slice(0));
    readback.unmap();
    readback.destroy();
    texture.destroy();
    // (row 0 is the top)
    const bottomLeft = Array.from(px.subarray(256 * (size - 1), 256 * (size - 1) + 4));
    const topRight = Array.from(px.subarray((size - 1) * 4, size * 4));
    const ok = bottomLeft.join() === "255,0,0,255" && topRight.join() === "0,0,255,255";
    this.report.render = ok ? "ok" : `read back ${bottomLeft} and ${topRight}`;
  }

  async setupPanel(device: GPUDevice) {
    const canvas = this.host.canvas;
    const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!context) {
      this.report.errors.push("no webgpu context on a canvas");
      return;
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.report.format = format;
    context.configure({ device, format, alphaMode: "premultiplied" });
    const module = device.createShaderModule({ code: PANEL_WGSL });
    const pipeline = await device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
    });
    const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.panel = {
      canvas,
      context,
      pipeline,
      params,
      values: new Float32Array(4),
      group: device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: params } }] }),
      // (the render pass's description, made once: only its view changes)
      attachment: { view: null, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
      pass: null,
    };
    this.panel.pass = { colorAttachments: [this.panel.attachment as GPURenderPassColorAttachment] };
  }

  get hasPanel(): boolean {
    return !!this.panel;
  }

  // draws the readout's panel, as large as the readout
  drawPanel(seconds: number) {
    const panel = this.panel;
    if (!this.device || !panel) {
      return;
    }
    const size = this.host.size();
    const width = size[0];
    const height = size[1];
    if (panel.canvas.width !== width || panel.canvas.height !== height) {
      panel.canvas.width = width;
      panel.canvas.height = height;
      this.host.style(width, height);
    }
    panel.values[0] = seconds;
    panel.values[1] = width;
    panel.values[2] = height;
    this.device.queue.writeBuffer(panel.params, 0, panel.values);
    const encoder = this.device.createCommandEncoder();
    panel.attachment.view = panel.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass(panel.pass!);
    pass.setPipeline(panel.pipeline);
    pass.setBindGroup(0, panel.group);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.report.frames++;
  }
}

M.WebGPUSupport = WebGPUSupport;
