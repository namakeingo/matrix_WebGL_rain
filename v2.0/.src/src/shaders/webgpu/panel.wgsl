
struct Params { time : f32, width : f32, height : f32, pad : f32 }
@group(0) @binding(0) var<uniform> params : Params;
@vertex fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(p[i], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) at : vec4<f32>) -> @location(0) vec4<f32> {
  var color = vec4(0.01, 0.04, 0.025, 0.8);
  if (at.y > params.height - 3.0) {
    let x = at.x / params.width;
    let glow = pow(0.5 + 0.5 * sin(6.2831853 * (x - params.time * 0.25)), 8.0);
    color = vec4(vec3(0.3, 1.0, 0.55) * glow, glow) + color * (1.0 - glow);
  }
  return color;
}