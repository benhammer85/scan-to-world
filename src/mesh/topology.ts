/**
 * Welded topology for a render mesh.
 *
 * Scans (and most exported meshes) split vertices along UV / normal seams, so the
 * render geometry has many coincident vertices. Terrain math (heights, contours,
 * diffusion) needs one value per *surface point*, so we weld by position and keep
 * a remap from every render vertex to its welded vertex.
 */

export interface Topology {
  /** Number of welded vertices. */
  vertexCount: number;
  /** Welded vertex positions at load time (xyz, never mutated). */
  basePositions: Float32Array;
  /** Welded vertex normals at load time (xyz, never mutated). */
  baseNormals: Float32Array;
  /** Current welded positions (base + sculpt displacement). */
  positions: Float32Array;
  /** Current welded normals. */
  normals: Float32Array;
  /** Triangles as welded vertex indices (3 per triangle). */
  triangles: Uint32Array;
  /** Render vertex index -> welded vertex index. */
  remap: Uint32Array;
  /** CSR adjacency: neighbours of v are nbrList[nbrOffsets[v] .. nbrOffsets[v+1]). */
  nbrOffsets: Uint32Array;
  nbrList: Uint32Array;
}

/**
 * @param positions render vertex positions (xyz)
 * @param index     render triangle indices, or null for a non-indexed triangle soup
 * @param weldEpsilon positions closer than this (per axis, after quantisation) are merged
 */
export function buildTopology(
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  weldEpsilon = 1e-5,
): Topology {
  const renderCount = positions.length / 3;
  const remap = new Uint32Array(renderCount);
  const lookup = new Map<string, number>();
  const welded: number[] = [];
  const inv = 1 / weldEpsilon;

  for (let i = 0; i < renderCount; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let w = lookup.get(key);
    if (w === undefined) {
      w = welded.length / 3;
      lookup.set(key, w);
      welded.push(x, y, z);
    }
    remap[i] = w;
  }

  const vertexCount = welded.length / 3;
  const corner = index ? (i: number) => index[i] : (i: number) => i;
  const triCountRaw = Math.floor((index ? index.length : renderCount) / 3);

  // Drop triangles that collapse after welding.
  const tris: number[] = [];
  for (let t = 0; t < triCountRaw; t++) {
    const a = remap[corner(t * 3)], b = remap[corner(t * 3 + 1)], c = remap[corner(t * 3 + 2)];
    if (a === b || b === c || c === a) continue;
    tris.push(a, b, c);
  }
  const triangles = new Uint32Array(tris);

  const { nbrOffsets, nbrList } = buildAdjacency(vertexCount, triangles);
  const basePositions = new Float32Array(welded);
  const baseNormals = new Float32Array(vertexCount * 3);
  computeNormals(basePositions, triangles, baseNormals);

  return {
    vertexCount,
    basePositions,
    baseNormals,
    positions: basePositions.slice(),
    normals: baseNormals.slice(),
    triangles,
    remap,
    nbrOffsets,
    nbrList,
  };
}

function buildAdjacency(vertexCount: number, triangles: Uint32Array) {
  const sets: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  const nbrOffsets = new Uint32Array(vertexCount + 1);
  for (let v = 0; v < vertexCount; v++) nbrOffsets[v + 1] = nbrOffsets[v] + sets[v].size;
  const nbrList = new Uint32Array(nbrOffsets[vertexCount]);
  for (let v = 0; v < vertexCount; v++) {
    let o = nbrOffsets[v];
    for (const n of sets[v]) nbrList[o++] = n;
  }
  return { nbrOffsets, nbrList };
}

/** Area-weighted vertex normals, written into `out`. */
export function computeNormals(positions: Float32Array, triangles: Uint32Array, out: Float32Array): void {
  out.fill(0);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3, b = triangles[t + 1] * 3, c = triangles[t + 2] * 3;
    const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      out[v] += nx; out[v + 1] += ny; out[v + 2] += nz;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
}

/** One Jacobi step of umbrella (Laplacian) smoothing on a scalar field. */
export function smoothScalar(topo: Topology, field: Float32Array, lambda: number, scratch?: Float32Array): Float32Array {
  const out = scratch ?? new Float32Array(field.length);
  const { nbrOffsets, nbrList } = topo;
  for (let v = 0; v < topo.vertexCount; v++) {
    const s = nbrOffsets[v], e = nbrOffsets[v + 1];
    if (e === s) { out[v] = field[v]; continue; }
    let sum = 0;
    for (let k = s; k < e; k++) sum += field[nbrList[k]];
    out[v] = field[v] + lambda * (sum / (e - s) - field[v]);
  }
  return out;
}
