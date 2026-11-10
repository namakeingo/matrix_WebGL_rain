// The shaders (shaders/*.glsl, *.wgsl) are imported as their text (tools/text-loader.ts).
declare module "*.glsl" {
  const source: string;
  export default source;
}

declare module "*.wgsl" {
  const source: string;
  export default source;
}
