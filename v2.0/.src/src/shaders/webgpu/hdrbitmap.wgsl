${unpackHdr}
struct Params { width : f32, height : f32, range : f32, pad : f32 }
@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var image : texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(p[i], 0.0, 1.0);
}
// the bitmap's rows are the picture's, top row first (a canvas image): the high-bits half is on the left, the
// low-bits half on the right; the levels (0 to 1023) scaled back to the encoded output (0 to range)
@fragment fn fs(@builtin(position) at : vec4<f32>) -> @location(0) vec4<f32> {
  let x = i32(at.x);
  let y = i32(at.y);
  let w = i32(params.width);
  let q = unpackHdr(textureLoad(image, vec2<i32>(x, y), 0), textureLoad(image, vec2<i32>(x + w, y), 0));
  return vec4(vec3<f32>(q) / 1023.0 * params.range, 1.0);
}
