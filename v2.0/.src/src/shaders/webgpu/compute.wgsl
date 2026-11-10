
struct Params { seed : u32 }
@group(0) @binding(0) var<storage, read_write> hashes : array<u32>;
@group(0) @binding(1) var<uniform> params : Params;
${M.HASH_WGSL}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id : vec3<u32>) {
  if (id.x < arrayLength(&hashes)) {
    hashes[id.x] = hash(id.x + params.seed);
  }
}