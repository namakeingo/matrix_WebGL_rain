struct Params { width : f32, height : f32, range : f32, pad : f32 }
@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var image : texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(p[i], 0.0, 1.0);
}
// the picture's rows come from WebGL's readPixels, bottom row first: the canvas's top row is the
// picture's last
@fragment fn fs(@builtin(position) at : vec4<f32>) -> @location(0) vec4<f32> {
  let x = i32(at.x);
  let y = i32(params.height) - 1 - i32(at.y);
  return vec4(textureLoad(image, vec2<i32>(x, y), 0).rgb * params.range, 1.0);
}
