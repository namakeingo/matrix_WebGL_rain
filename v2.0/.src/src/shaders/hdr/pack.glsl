// the 10 bit channel levels q (0 to 1023) of one picture pixel as one 8 bit pixel: the high 8 bits, alpha 1 (a canvas copied as
// an image premultiplies by alpha: 1 changes nothing)
vec4 packHdr(ivec3 q) {
  return vec4(vec3(q >> 2) / 255.0, 1.0);
}
// the low 2 bits of four neighbouring picture pixels (x = 4k .. 4k + 3) as one 8 bit pixel: pixel j in bits 2j and 2j + 1 of each
// channel's byte, alpha 1
vec4 packHdrLow(ivec3 q0, ivec3 q1, ivec3 q2, ivec3 q3) {
  ivec3 b = (q0 & 3) | ((q1 & 3) << 2) | ((q2 & 3) << 4) | ((q3 & 3) << 6);
  return vec4(vec3(b) / 255.0, 1.0);
}
