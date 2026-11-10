${unpackHdr}
@group(0) @binding(0) var image : texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(p[i], 0.0, 1.0);
}
// the check picture's levels as unsigned integers, row y of the target the picture's row y (bottom row first): the
// bitmap's rows are top row first, so its row ${height} - 1 - y
@fragment fn fs(@builtin(position) at : vec4<f32>) -> @location(0) vec4<u32> {
  let x = i32(at.x);
  let row = ${height} - 1 - i32(at.y);
  let hi = textureLoad(image, vec2<i32>(x, row), 0);
  let lo = textureLoad(image, vec2<i32>(x + ${width}, row), 0);
  return vec4<u32>(unpackHdr(hi, lo), 3u);
}
