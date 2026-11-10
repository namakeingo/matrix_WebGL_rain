// the 10 bit channel levels of one picture pixel from the pixel of its high 8 bits and the pixel of its low 2 bits
// (scaled by 85), each as read from an 8 bit texture (0 to 1)
fn unpackHdr(hi : vec4<f32>, lo : vec4<f32>) -> vec3<u32> {
  let h = vec3<u32>(round(hi.rgb * 255.0));
  let l = vec3<u32>(round(lo.rgb * 255.0 / 85.0));
  return (h << vec3<u32>(2u)) | l;
}
