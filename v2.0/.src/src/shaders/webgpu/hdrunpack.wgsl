// the 10 bit channel levels of picture pixel x from the pixel of its high 8 bits and the pixel of the low-bits byte of its group
// of four (pixel x in bits 2 (x mod 4) and 2 (x mod 4) + 1), each as read from an 8 bit texture (0 to 1)
fn unpackHdr(hi : vec4<f32>, lowByte : vec4<f32>, x : i32) -> vec3<u32> {
  let h = vec3<u32>(round(hi.rgb * 255.0));
  let b = vec3<u32>(round(lowByte.rgb * 255.0));
  let l = (b >> vec3<u32>(u32((x & 3) * 2))) & vec3<u32>(3u);
  return (h << vec3<u32>(2u)) | l;
}
