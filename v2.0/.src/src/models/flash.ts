// A strike's flash: its emitter, the main channel's whole shape merged into one emitter, worked
// out from the shape alone (a pure function of shape.main: no light points, the branches cast
// none). Every piece of shape.main emits EMISSION a metre along it. The shape merged:
// - its leaves: short stretches of the path, one after the other (a stretch at most LEAF_SHARE of
//   the shape's height long and within DEVIATION of that of its chord; a piece longer than that
//   a leaf of its own), each a line light along its chord carrying its stretch's power;
// - its regions: REGIONS quarters of the path by length (each a tree of its own; the shadows
//   through the clouds are baked per region);
// - its nodes: a balanced tree over each region's leaves, each node the merged shape at its
//   scale: its power, its power's centroid and a radius round it holding all its points.
// Its light at a place (lightAt, the same walk as Lightning.EMITTER_GLSL's): from each region's
// root, a node whose radius is under THETA of its distance (and, for a surface, of its height
// above it) gives its power as from its centroid
// (1 / d^2, at least 5 cm away), a nearer one its two children; a leaf its line light (its
// points' 1 / d^2 summed exactly along it); at most VISITS_MOST nodes a place (each region
// VISITS_MOST / REGIONS; what is left on its stack then as from its centroids). With it, its
// light's vector (each part's light along the way to it: the light a surface facing n gets is
// n . vector while the emitter is in front of it) and each region's nearest point.
// Its shadow points: each region's nodes SHADOW_DEPTH levels down (a few metres of a long bolt
// each), towards the nearest of which the bakes cast its shadow through the clouds.
// Its floats (the texture Lightning sends, TEXELS_ACROSS texels a row, ROWS rows a slot): a
// header texel a region (its root's node, its nodes, its power, its stretch's length), each
// region's SHADOW_POINTS shadow points (centroid, radius; -1: none), then
// NODE_TEXELS texels a node: (centroid, power); an inner node (first child, 0, 0, radius) and
// (0, 0, 0, 1), its second child next to its first; a leaf (a, radius) and (b, -1), its chord.
// Worked out in a worker (workers/boltworker.ts) with the shape; Lightning.flashOf is this.
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/models/ (was engine/flash.js).
import { M } from "../engine/core";

// what a flash is worked out from: the main channel's points, flat (x, y, z each, count of them:
// BoltShape's format) or as [x, y, z] each
export interface FlashLine {
  points: ArrayLike<number> | ArrayLike<ArrayLike<number>>;
  count?: number;
}

export interface FlashSource {
  main: FlashLine;
}

// a node of a region's tree while it is built: a leaf (its stretch's chord a to b) or an inner
// node (its two children); index its place in the layout, child its first child's
interface FlashLeaf {
  leaf: true;
  c: number[];
  power: number;
  radius: number;
  a: number[];
  b: number[];
  index?: number;
  child?: number;
}

interface FlashInner {
  leaf: false;
  c: number[];
  power: number;
  radius: number;
  kids: [FlashNode, FlashNode];
  index?: number;
  child?: number;
}

type FlashNode = FlashLeaf | FlashInner;

// a region: its power, its stretch's length, its root's node (-1: none), its shadow points
// (centroid, radius)
export interface FlashRegion {
  power: number;
  length: number;
  root: number;
  points: number[][];
}

// a shape's flash (of): its floats (the texture's, nodes the same), its regions, the path's
// length, its points, its leaves and its nodes
export interface FlashData {
  floats: Float32Array<ArrayBuffer>;
  nodes: Float32Array<ArrayBuffer>;
  regions: FlashRegion[];
  length: number;
  count: number;
  leaves: number;
  nodeCount: number;
}

// a flash as lightAt reads it: one of() gave, or its floats alone
export type FlashFloats = { floats: Float32Array } | Float32Array;

// a region's light at a place (lightAt): its light, its vector, its nearest point and its distance
export interface FlashRegionLight {
  light: number;
  vector: number[];
  near: number[];
  best: number;
}

// the light at a place (lightAt): in all, its vector, what a surface facing the normal gets, the
// nodes visited, each region's
export interface FlashLight {
  light: number;
  vector: number[];
  facing: number;
  visits: number;
  regions: FlashRegionLight[];
}

// its emission a metre of the path: the light cast in all, on average, what the 16 pieces
// between the old 17 light points cast at 1 a metre (the path is 1.114 times as long on average)
const EMISSION = 1 / 1.114;
const REGIONS = 4;
// a leaf's stretch: at most this share of the shape's height long, within DEVIATION of its
// length of its chord
const LEAF_SHARE = 1 / 400;
const DEVIATION = 0.05;
// a node far enough to give its light as from its centroid: its radius under THETA of its
// distance
const THETA = 0.2;
const VISITS_MOST = 1024;
const STACK = 32;
// the nearest a light is worked out from (m), as a piece's line light
const NEAREST = 0.05;
// the texture's layout: its texels a row, the most nodes a slot, a node's texels, its rows
const TEXELS_ACROSS = 1024;
const NODE_TEXELS = 3;
// each region's shadow points (the bakes' shadows through the clouds are cast towards the nearest
// of them): its nodes SHADOW_DEPTH levels down (or its leaves above them), at most SHADOW_POINTS
const SHADOW_DEPTH = 3;
const SHADOW_POINTS = 8;
// the nodes' first texel, after the regions' header and their shadow points
const NODE_BASE = REGIONS * (1 + SHADOW_POINTS);
const NODES_MOST = 4096;
const ROWS = Math.ceil((NODE_BASE + NODE_TEXELS * NODES_MOST) / TEXELS_ACROSS);

// the light a stretch (a to b, emission 1 a metre) gives at p: its points' 1 / d^2 summed along
// it (h at least NEAREST), as Lightning.EMITTER_GLSL's pieceLight
const pieceLight = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const len = Math.max(Math.hypot(abx, aby, abz), 1e-4);
  const ux = abx / len, uy = aby / len, uz = abz / len;
  const qx = px - ax, qy = py - ay, qz = pz - az;
  const along = qx * ux + qy * uy + qz * uz;
  const h = Math.max(Math.hypot(qx - along * ux, qy - along * uy, qz - along * uz), NEAREST);
  return Math.atan2(len * h, h * h - along * (len - along)) / h;
};

// a shape's flash (see the header): { floats, nodes (the same), regions, length, count, leaves }
const of = (shape: FlashSource): FlashData => {
  const main = shape.main;
  const P = main.points;
  const flat = typeof P[0] === "number";
  const n = main.count || P.length / (flat ? 3 : 1);
  const at = (i: number, c: number) => Math.fround(flat ? (P as ArrayLike<number>)[i * 3 + c] : (P as ArrayLike<ArrayLike<number>>)[i][c]);
  const cum = new Float64Array(n);
  let top = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      cum[i] = cum[i - 1] + Math.hypot(at(i, 0) - at(i - 1, 0), at(i, 1) - at(i - 1, 1), at(i, 2) - at(i - 1, 2));
    }
    top = Math.max(top, at(i, 1));
  }
  const length = cum[n - 1];
  // (the leaves: each stretch [from, to] of points, from the top on; longer leaves if there
  // would be too many nodes)
  const deviationOf = (from: number, to: number) => {
    const ax = at(from, 0), ay = at(from, 1), az = at(from, 2);
    const bx = at(to, 0) - ax, by = at(to, 1) - ay, bz = at(to, 2) - az;
    const bb = bx * bx + by * by + bz * bz;
    let most = 0;
    for (let q = from + 1; q < to; q++) {
      const px = at(q, 0) - ax, py = at(q, 1) - ay, pz = at(q, 2) - az;
      const u = bb > 0 ? Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / bb)) : 0;
      most = Math.max(most, Math.hypot(px - u * bx, py - u * by, pz - u * bz));
    }
    return most;
  };
  let leaves: [number, number][] | null = null;
  for (let scale = 1; !leaves || leaves.length > NODES_MOST / 2 - REGIONS; scale *= 2) {
    const longest = Math.max(top, 1e-3) * LEAF_SHARE * scale;
    leaves = [];
    let from = 0;
    while (from < n - 1) {
      let to = from + 1;
      while (to < n - 1 && cum[to + 1] - cum[from] <= longest && deviationOf(from, to + 1) <= DEVIATION * (cum[to + 1] - cum[from])) {
        to++;
      }
      leaves.push([from, to]);
      from = to;
    }
  }
  // (the regions: the leaves whose middles fall in each quarter of the path's length)
  const regionOf = (leaf: [number, number]) => Math.min(REGIONS - 1, Math.floor((((cum[leaf[0]] + cum[leaf[1]]) / 2) / Math.max(length, 1e-9)) * REGIONS));
  // (a node over leaves lo..hi - 1, with its children)
  const build = (lo: number, hi: number): FlashNode => {
    if (hi - lo === 1) {
      const [a, b] = leaves![lo];
      const power = EMISSION * (cum[b] - cum[a]);
      // (its centroid its points' along its stretch, by their lengths; its radius round them)
      let cx = 0, cy = 0, cz = 0, sum = 0;
      for (let i = a; i < b; i++) {
        const w = cum[i + 1] - cum[i];
        cx += (w * (at(i, 0) + at(i + 1, 0))) / 2;
        cy += (w * (at(i, 1) + at(i + 1, 1))) / 2;
        cz += (w * (at(i, 2) + at(i + 1, 2))) / 2;
        sum += w;
      }
      const c = sum > 0 ? [cx / sum, cy / sum, cz / sum].map(Math.fround) : [at(a, 0), at(a, 1), at(a, 2)];
      let radius = 0;
      for (let i = a; i <= b; i++) {
        radius = Math.max(radius, Math.hypot(at(i, 0) - c[0], at(i, 1) - c[1], at(i, 2) - c[2]));
      }
      return { leaf: true, c, power, radius, a: [at(a, 0), at(a, 1), at(a, 2)], b: [at(b, 0), at(b, 1), at(b, 2)] };
    }
    const mid = (lo + hi) >> 1;
    const left = build(lo, mid);
    const right = build(mid, hi);
    const power = left.power + right.power;
    const w = power > 0 ? left.power / power : 0.5;
    const c = [0, 1, 2].map((k) => Math.fround(left.c[k] * w + right.c[k] * (1 - w)));
    const radius = Math.max(
      Math.hypot(left.c[0] - c[0], left.c[1] - c[1], left.c[2] - c[2]) + left.radius,
      Math.hypot(right.c[0] - c[0], right.c[1] - c[1], right.c[2] - c[2]) + right.radius
    );
    return { leaf: false, c, power, radius, kids: [left, right] };
  };
  // (each region's tree laid out breadth first: a node's two children next to each other)
  const order: FlashNode[] = [];
  const regions: FlashRegion[] = [];
  for (let r = 0; r < REGIONS; r++) {
    let lo = leaves.length;
    let hi = 0;
    for (let k = 0; k < leaves.length; k++) {
      if (regionOf(leaves[k]) === r) {
        lo = Math.min(lo, k);
        hi = Math.max(hi, k + 1);
      }
    }
    if (lo >= hi) {
      regions.push({ power: 0, length: 0, root: -1, points: [] });
      continue;
    }
    const root = build(lo, hi);
    root.index = order.length;
    order.push(root);
    const queue = [root];
    for (let q = 0; q < queue.length; q++) {
      const node = queue[q];
      if (!node.leaf) {
        node.child = order.length;
        order.push(node.kids[0], node.kids[1]);
        queue.push(node.kids[0], node.kids[1]);
      }
    }
    // (its shadow points: its nodes SHADOW_DEPTH levels down, or its leaves above them)
    const points: number[][] = [];
    const walk = (node: FlashNode, level: number) => {
      if (node.leaf || level === SHADOW_DEPTH) {
        points.push([node.c[0], node.c[1], node.c[2], node.radius]);
      } else {
        walk(node.kids[0], level + 1);
        walk(node.kids[1], level + 1);
      }
    };
    walk(root, 0);
    regions.push({ power: root.power, length: cum[leaves[hi - 1][1]] - cum[leaves[lo][0]], root: root.index!, points: points.slice(0, SHADOW_POINTS) });
  }
  const floats = new Float32Array(ROWS * TEXELS_ACROSS * 4);
  for (let r = 0; r < REGIONS; r++) {
    floats[r * 4] = regions[r].root;
    floats[r * 4 + 1] = 0;
    floats[r * 4 + 2] = regions[r].power;
    floats[r * 4 + 3] = regions[r].length;
    for (let j = 0; j < SHADOW_POINTS; j++) {
      const point = regions[r].points && j < regions[r].points.length ? regions[r].points[j] : [0, 0, 0, -1];
      floats.set(point, (REGIONS + r * SHADOW_POINTS + j) * 4);
    }
  }
  for (let k = 0; k < order.length; k++) {
    const node = order[k];
    const o = (NODE_BASE + k * NODE_TEXELS) * 4;
    floats.set([node.c[0], node.c[1], node.c[2], node.power], o);
    if (node.leaf) {
      floats.set([node.a[0], node.a[1], node.a[2], node.radius * (1 + 1e-6)], o + 4);
      floats.set([node.b[0], node.b[1], node.b[2], -1], o + 8);
    } else {
      floats.set([node.child!, 0, 0, node.radius * (1 + 1e-6)], o + 4);
      floats.set([0, 0, 0, 1], o + 8);
    }
  }
  return { floats, nodes: floats, regions, length, count: n, leaves: leaves.length, nodeCount: order.length };
};

// its light at p (see the header): { light, vector, visits, regions: [{ light, vector, near,
// best }] }; with normal (a surface's at p), a node also opened unless its radius is under THETA
// of its height above that surface (the light's cosine there changes fastest near it), and the
// light the surface gets, each part's times its cosine there (facing: summed)
const lightAt = (flash: FlashFloats, p: ArrayLike<number>, normal?: ArrayLike<number>): FlashLight => {
  const f = (flash as { floats?: Float32Array }).floats || (flash as Float32Array);
  const out: FlashLight = { light: 0, vector: [0, 0, 0], facing: 0, visits: 0, regions: [] };
  const stack = new Int32Array(STACK);
  const each = VISITS_MOST / REGIONS;
  for (let r = 0; r < REGIONS; r++) {
    const region: FlashRegionLight = { light: 0, vector: [0, 0, 0], near: [0, 0, 0], best: Infinity };
    out.regions.push(region);
    const root = f[r * 4];
    if (!(root >= 0)) {
      continue;
    }
    let depth = 0;
    stack[depth++] = root;
    // (a part's light, along the way from p to q)
    const add = (light: number, qx: number, qy: number, qz: number) => {
      const dx = qx - p[0], dy = qy - p[1], dz = qz - p[2];
      const d = Math.max(Math.hypot(dx, dy, dz), 1e-4);
      region.light += light;
      region.vector[0] += (light * dx) / d;
      region.vector[1] += (light * dy) / d;
      region.vector[2] += (light * dz) / d;
      if (normal) {
        out.facing += light * Math.max(0, (dx * normal[0] + dy * normal[1] + dz * normal[2]) / d);
      }
      if (d < region.best) {
        region.best = d;
        region.near = [qx, qy, qz];
      }
    };
    const far = (o: number) => {
      const cx = f[o], cy = f[o + 1], cz = f[o + 2];
      const d = Math.max(Math.hypot(cx - p[0], cy - p[1], cz - p[2]), NEAREST);
      add(f[o + 3] / (d * d), cx, cy, cz);
    };
    for (let v = 0; v < each && depth > 0; v++) {
      const node = stack[--depth];
      const o = (NODE_BASE + node * NODE_TEXELS) * 4;
      out.visits++;
      const cx = f[o], cy = f[o + 1], cz = f[o + 2], power = f[o + 3], radius = f[o + 7];
      if (f[o + 11] < 0) {
        // (a leaf: its chord's line light carrying its power; its nearest point on it)
        const ax = f[o + 4], ay = f[o + 5], az = f[o + 6], bx = f[o + 8], by = f[o + 9], bz = f[o + 10];
        const chord = Math.hypot(bx - ax, by - ay, bz - az);
        const light = (power / Math.max(chord, 1e-4)) * pieceLight(p[0], p[1], p[2], ax, ay, az, bx, by, bz);
        const abx = bx - ax, aby = by - ay, abz = bz - az, bb = abx * abx + aby * aby + abz * abz;
        const t = bb > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * abx + (p[1] - ay) * aby + (p[2] - az) * abz) / bb)) : 0;
        add(light, ax + t * abx, ay + t * aby, az + t * abz);
      } else if ((radius < THETA * Math.hypot(cx - p[0], cy - p[1], cz - p[2]) && (!normal || radius < THETA * ((cx - p[0]) * normal[0] + (cy - p[1]) * normal[1] + (cz - p[2]) * normal[2]))) || depth + 2 > STACK) {
        far(o);
      } else {
        stack[depth++] = f[o + 4];
        stack[depth++] = f[o + 4] + 1;
      }
    }
    // (what is left on its stack: as from its centroids)
    while (depth > 0) {
      far((NODE_BASE + stack[--depth] * NODE_TEXELS) * 4);
    }
    out.light += region.light;
    for (let k = 0; k < 3; k++) {
      out.vector[k] += region.vector[k];
    }
  }
  return out;
};

export const Flash = {
  of, lightAt, pieceLight, EMISSION, REGIONS, THETA, VISITS_MOST, STACK, NEAREST, TEXELS_ACROSS, NODE_TEXELS, NODES_MOST, ROWS, SHADOW_POINTS, NODE_BASE,
};

M.Flash = Flash;
