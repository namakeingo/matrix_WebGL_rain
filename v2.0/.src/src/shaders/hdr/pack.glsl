// the 10 bit channel levels q (0 to 1023) of one picture pixel as one 8 bit pixel: the high 8 bits (lo false) or the
// low 2 bits scaled by 85 (lo true), alpha 1 (a canvas copied as an image premultiplies by alpha: 1 changes nothing)
vec4 packHdr(ivec3 q, bool lo) {
  ivec3 part = lo ? (q & 3) * 85 : q >> 2;
  return vec4(vec3(part) / 255.0, 1.0);
}
