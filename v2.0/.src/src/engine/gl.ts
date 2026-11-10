// WebGL 2.0 helpers the effects share: programs compiled in parallel and waited for without
// blocking, uniform blocks, pictures to draw into (with several color attachments, or
// multisampled), and the quad every draw is made of. They follow MDN's WebGL best practices:
// shaders compiled all at once and linked all at once, then KHR_parallel_shader_compile's
// COMPLETION_STATUS_KHR polled; only LINK_STATUS checked (the logs only when it failed); shaders
// deleted once linked; uniform locations looked up once; immutable textures (texStorage); static
// vertex arrays.
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/engine/ (was engine/gl.js).
import { M } from "./core";
import FULL_VERTEX_SOURCE from "../shaders/gl/full_vertex.glsl";
import type { GpuGuard } from "./guard";

// every program's attributes at fixed locations; 0, the quad's corner, is always an array
// (MDN's WebGL best practices: "Always enable vertex attrib 0 as an array")
export const ATTRIBUTES = { aCorner: 0, aPlace: 1, aInfo: 2, aImpact: 3, aColor: 4, aDrop: 5 };

// the uniform blocks and their binding points
export const BLOCKS = { Camera: 0, Fog: 1, Lightning: 2, Waves: 3 };

M.ATTRIBUTES = ATTRIBUTES;
M.BLOCKS = BLOCKS;

// an attribute's name (its location in ATTRIBUTES)
export type AttributeName = keyof typeof ATTRIBUTES;

// a uniform block's name (its binding point in BLOCKS)
export type BlockName = keyof typeof BLOCKS;

// a program's sources: its vertex and fragment shaders' texts
export type ProgramSource = [vertex: string, fragment: string];

// the programs to compile, by name (an effect's static programs(), all of them put together)
export type ProgramSources = Record<string, ProgramSource>;

// the compiled programs, by name (compilePrograms)
export type Programs = Record<string, ShaderProgram>;

// a program's uniforms' locations, by name (its samplers' and its arrays' names without [0])
export type Uniforms = Record<string, WebGLUniformLocation>;

// samplers' texture units, by name (ShaderProgram.samplers)
export type SamplerUnits = Readonly<Record<string, number>>;

// a shader of a type and a source, compiled (by compilePrograms: once a source)
export type ShaderOf = (type: GLenum, source: string) => WebGLShader;

// an instance attribute of a vertex array (Quad.vertexArray): one value of size components an
// instance, from buffer (integer: unsigned integers)
export interface InstanceAttribute {
  buffer: WebGLBuffer;
  attribute: AttributeName;
  size: number;
  integer?: boolean;
}

// a RenderTarget's options: its color attachments' formats (one, format, or several, formats),
// a depth picture, its textures' filter (NEAREST by default)
export interface TargetOptions {
  format?: GLenum;
  formats?: GLenum[];
  depth?: boolean;
  filter?: GLenum;
  // the first attachment's mip levels (made by generateMipmap; read with textureLod, trilinear)
  levels?: number;
}

// a MultisampleTarget's options: its format and the most samples
export interface MultisampleOptions {
  format: GLenum;
  samples: number;
}

export class ShaderProgram {
  shaders: WebGLShader[];
  ownShaders: boolean;
  unitsGiven: Record<string, boolean>;
  samplerNames: string[];
  uniforms: Uniforms;
  program: WebGLProgram | null;
  name: string;
  gl: WebGL2RenderingContext;
  // shaderOf(type, source): its compiled shader, which the caller keeps and deletes (shared by
  // programs of the same source); by default one of its own, deleted once linked
  constructor(gl: WebGL2RenderingContext, name: string, vertex: string, fragment: string, shaderOf?: ShaderOf) {
    this.gl = gl;
    this.name = name;
    this.program = gl.createProgram();
    this.uniforms = {};
    // its active samplers, and the ones given a texture unit (an active sampler left without one
    // reads unit 0)
    this.samplerNames = [];
    this.unitsGiven = {};
    this.ownShaders = !shaderOf;
    const compile = (type: GLenum, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    this.shaders = (
      [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ] as [GLenum, string][]
    ).map(([type, source]) => {
      const shader = (shaderOf || compile)(type, source);
      gl.attachShader(this.program!, shader);
      return shader;
    });
    for (const [attribute, location] of Object.entries(M.ATTRIBUTES)) {
      gl.bindAttribLocation(this.program!, location, attribute);
    }
  }

  link() {
    this.gl.linkProgram(this.program!);
  }

  // has the driver finished it? (always, without the extension: then the next call waits)
  done(parallel: KHR_parallel_shader_compile | null): boolean {
    return !parallel || this.gl.getProgramParameter(this.program!, parallel.COMPLETION_STATUS_KHR);
  }

  // checks it linked, lets its shaders go, and looks up its uniforms and blocks
  finish() {
    const gl = this.gl;
    const program = this.program!;
    if (gl.isContextLost()) {
      throw new Error("the WebGL context was lost");
    }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const logs = this.shaders.map((s) => gl.getShaderInfoLog(s)).filter(Boolean);
      throw new Error(`${this.name}: ${gl.getProgramInfoLog(program)} ${logs.join(" ")}`);
    }
    for (const shader of this.shaders) {
      gl.detachShader(program, shader);
      if (this.ownShaders) {
        gl.deleteShader(shader);
      }
    }
    this.shaders = [];
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    const samplerTypes: GLenum[] = [gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_CUBE, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D];
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i)!;
      const name = info.name.replace(/\[0\]$/, "");
      const location = gl.getUniformLocation(program, name);
      if (location) {
        this.uniforms[name] = location;
        if (samplerTypes.includes(info.type)) {
          this.samplerNames.push(name);
        }
      }
    }
    for (const [block, binding] of Object.entries(M.BLOCKS)) {
      const index = gl.getUniformBlockIndex(program, block);
      if (index !== gl.INVALID_INDEX) {
        gl.uniformBlockBinding(program, index, binding);
      }
    }
  }

  use(): Uniforms {
    this.gl.useProgram(this.program);
    return this.uniforms;
  }

  // sets its samplers to their texture units (once: see M.UNITS)
  samplers(units: SamplerUnits) {
    const gl = this.gl;
    gl.useProgram(this.program);
    for (const [name, unit] of Object.entries(units)) {
      if (this.uniforms[name]) {
        gl.uniform1i(this.uniforms[name], unit);
        this.unitsGiven[name] = true;
      }
    }
  }

  // its active samplers not given a texture unit (for the tests)
  unsetSamplers(): string[] {
    return this.samplerNames.filter((name) => !this.unitsGiven[name]);
  }

  destroy() {
    if (this.ownShaders) {
      for (const shader of this.shaders) {
        this.gl.deleteShader(shader);
      }
    }
    this.shaders = [];
    this.gl.deleteProgram(this.program);
    this.program = null;
  }
}

// compiles every program at once (each shader source once: the same one shared by the programs
// that use it, M.FULL_VERTEX by most), links them all, then resolves with them once the driver
// has finished (polled on animation frames, never waited for); rejects (every program deleted)
// if one failed or the context is lost meanwhile. The shaders are deleted once every program is
// linked and looked at
export const compilePrograms = (gl: WebGL2RenderingContext, sources: ProgramSources): Promise<Programs> => {
  const parallel = gl.getExtension("KHR_parallel_shader_compile");
  const programs: Programs = {};
  const shaders = new Map<string, WebGLShader>();
  const shaderOf = (type: GLenum, source: string) => {
    const key = `${type}:${source}`;
    let shader = shaders.get(key);
    if (!shader) {
      shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      shaders.set(key, shader);
    }
    return shader;
  };
  const deleteShaders = () => {
    for (const shader of shaders.values()) {
      gl.deleteShader(shader);
    }
    shaders.clear();
  };
  for (const [name, [vertex, fragment]] of Object.entries(sources)) {
    programs[name] = new ShaderProgram(gl, name, vertex, fragment, shaderOf);
  }
  for (const program of Object.values(programs)) {
    program.link();
  }
  return new Promise<Programs>((resolve, reject) => {
    const poll = () => {
      if (!gl.isContextLost() && !Object.values(programs).every((p) => p.done(parallel))) {
        requestAnimationFrame(poll);
        return;
      }
      try {
        for (const program of Object.values(programs)) {
          program.finish();
        }
        deleteShaders();
        resolve(programs);
      } catch (error) {
        for (const program of Object.values(programs)) {
          program.destroy();
        }
        deleteShaders();
        reject(error);
      }
    };
    poll();
  });
};

// a uniform block's buffer: its values in data (std140), sent with upload()
export class UniformBlock {
  buffer: WebGLBuffer | null;
  data: Float32Array<ArrayBuffer>;
  gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext, name: BlockName, floats: number) {
    this.gl = gl;
    this.data = new Float32Array(floats);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, M.BLOCKS[name], this.buffer);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  }

  upload() {
    const gl = this.gl;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.data);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
  }

  destroy() {
    this.gl.deleteBuffer(this.buffer);
    this.buffer = null;
  }
}

// a picture to draw into: its color attachments (one texture each, of the formats given), its
// framebuffer and, if asked, a depth picture; immutable storage, made again only when its size
// changes. texture is the first attachment's
export class RenderTarget {
  height: number;
  width: number;
  depth: WebGLTexture | null;
  textures: WebGLTexture[];
  framebuffer: WebGLFramebuffer | null;
  attachments: GLenum[];
  filter: GLenum;
  withDepth: boolean;
  formats: GLenum[];
  // the most mip levels of the first attachment (the levels of its size, up to this many)
  mostLevels: number;
  gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext, { format, formats, depth = false, filter, levels = 1 }: TargetOptions) {
    this.gl = gl;
    this.mostLevels = levels;
    this.formats = formats || [format!];
    this.withDepth = depth;
    this.filter = filter || gl.NEAREST;
    this.attachments = this.formats.map((f: GLenum, i: number) => gl.COLOR_ATTACHMENT0 + i);
    this.framebuffer = gl.createFramebuffer();
    this.textures = [];
    this.depth = null;
    this.width = 0;
    this.height = 0;
  }

  get texture(): WebGLTexture {
    return this.textures[0];
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) {
      return;
    }
    const gl = this.gl;
    this.width = width;
    this.height = height;
    this.textures.forEach((t) => gl.deleteTexture(t));
    gl.deleteTexture(this.depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    this.textures = this.formats.map((format: GLenum, i: number) => {
      const mips = i === 0 ? Math.min(this.mostLevels, Math.floor(Math.log2(Math.max(width, height))) + 1) : 1;
      const texture = RenderTarget.storage(gl, format, width, height, mips > 1 ? gl.LINEAR_MIPMAP_LINEAR : this.filter, mips);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
      return texture;
    });
    gl.drawBuffers(this.attachments);
    if (this.withDepth) {
      this.depth = RenderTarget.storage(gl, gl.DEPTH_COMPONENT24, width, height, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depth, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  static storage(gl: WebGL2RenderingContext, format: GLenum, width: number, height: number, filter: GLenum, levels = 1): WebGLTexture {
    // (on the work unit: never unbinding a texture another unit keeps)
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, levels, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, levels > 1 ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
  }

  // its contents are no longer needed (MDN: invalidateFramebuffer when done with a picture)
  invalidate() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.invalidateFramebuffer(gl.FRAMEBUFFER, this.attachments);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  destroy() {
    const gl = this.gl;
    this.textures.forEach((t) => gl.deleteTexture(t));
    gl.deleteTexture(this.depth);
    gl.deleteFramebuffer(this.framebuffer);
    this.textures = [];
    this.depth = this.framebuffer = null;
  }
}

// a multisampled picture to draw into (a renderbuffer of up to `samples` samples: as many as its
// format allows), resolved into a texture (blitFramebuffer) to be read, its samples then let go
export class MultisampleTarget {
  height: number;
  width: number;
  resolved: RenderTarget;
  renderbuffer: WebGLRenderbuffer;
  framebuffer: WebGLFramebuffer;
  attachments: GLenum[];
  samples: number;
  format: GLenum;
  gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext, { format, samples }: MultisampleOptions) {
    this.gl = gl;
    this.format = format;
    const allowed = gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES);
    this.samples = Math.max(0, Math.min(samples, allowed && allowed.length ? allowed[0] : 0));
    this.attachments = [gl.COLOR_ATTACHMENT0];
    this.framebuffer = gl.createFramebuffer();
    this.renderbuffer = gl.createRenderbuffer();
    this.resolved = new RenderTarget(gl, { format });
    this.width = 0;
    this.height = 0;
  }

  get texture(): WebGLTexture {
    return this.resolved.texture;
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) {
      return;
    }
    const gl = this.gl;
    this.width = width;
    this.height = height;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.renderbuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, this.format, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.renderbuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.resolved.resize(width, height);
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
  }

  // its resolved picture's contents are no longer needed
  invalidate() {
    this.resolved.invalidate();
  }

  // its samples averaged into its texture
  resolve() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolved.framebuffer);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, this.attachments);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  destroy() {
    const gl = this.gl;
    gl.deleteRenderbuffer(this.renderbuffer);
    gl.deleteFramebuffer(this.framebuffer);
    this.resolved.destroy();
  }
}

// the quad every draw is made of (corners 0 to 1), and vertex arrays of it with instance
// attributes: made once, never changed
export class Quad {
  plain: WebGLVertexArrayObject;
  corners: WebGLBuffer;
  guard: GpuGuard;
  gl: WebGL2RenderingContext;
  // guard: the GPU guard (its band height, and each piece counted and sent)
  constructor(gl: WebGL2RenderingContext, guard: GpuGuard) {
    this.gl = gl;
    this.guard = guard;
    this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.plain = this.vertexArray([]);
  }

  // instances: [{ buffer, attribute, size, integer }], one value each an instance (integer:
  // read as unsigned integers, vertexAttribIPointer)
  vertexArray(instances: readonly InstanceAttribute[]): WebGLVertexArrayObject {
    const gl = this.gl;
    const vertexArray = gl.createVertexArray();
    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.enableVertexAttribArray(M.ATTRIBUTES.aCorner);
    gl.vertexAttribPointer(M.ATTRIBUTES.aCorner, 2, gl.FLOAT, false, 0, 0);
    for (const { buffer, attribute, size, integer } of instances) {
      const location = M.ATTRIBUTES[attribute];
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      if (integer) {
        gl.vertexAttribIPointer(location, size, gl.UNSIGNED_INT, 0, 0);
      } else {
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      }
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vertexArray;
  }

  destroy() {
    this.gl.deleteBuffer(this.corners);
    this.gl.deleteVertexArray(this.plain);
  }

  // a full-screen (or full-target) pass
  drawFull() {
    const gl = this.gl;
    gl.bindVertexArray(this.plain);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // a full-screen pass (named, as the guard times it) in bands of the guard's rows for that pass
  // (of the rows from..to only, from the bottom), each sent to the GPU on its own: a heavy pass
  // never keeps the GPU in one piece of work long enough for Windows to reset it (see GpuGuard).
  // The same picture
  drawTiled(name: string, width: number, height: number, from = 0, to = height) {
    const gl = this.gl;
    const tile = this.guard.size(name, "band");
    gl.bindVertexArray(this.plain);
    gl.enable(gl.SCISSOR_TEST);
    for (let y = Math.max(0, from); y < Math.min(height, to); y += tile) {
      gl.scissor(0, y, width, Math.min(tile, Math.min(height, to) - y));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.guard.piece();
    }
    gl.disable(gl.SCISSOR_TEST);
  }
}

// a full-screen pass's vertex shader
M.FULL_VERTEX = FULL_VERTEX_SOURCE;

M.compilePrograms = compilePrograms;
M.ShaderProgram = ShaderProgram;
M.UniformBlock = UniformBlock;
M.RenderTarget = RenderTarget;
M.MultisampleTarget = MultisampleTarget;
M.Quad = Quad;
