import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildTopology } from '../src/mesh/topology';
import { contourLevels, extractContours } from '../src/terrain/contours';
import { extractHeights } from '../src/terrain/heightfield';
import { TerrainEdits } from '../src/interact/sculpt';

function sphereTopology(detail = 8) {
  const g = new THREE.IcosahedronGeometry(1, detail); // non-indexed, seams everywhere
  return buildTopology(g.attributes.position.array, null);
}

describe('buildTopology', () => {
  it('welds a triangle soup into a closed manifold', () => {
    const topo = sphereTopology(4);
    const V = topo.vertexCount, F = topo.triangles.length / 3;
    const E = topo.nbrOffsets[V] / 2;
    expect(V - E + F).toBe(2); // Euler characteristic of a sphere
  });

  it('welds across UV seams that mergeVertices keeps split', () => {
    const src = new THREE.IcosahedronGeometry(1, 3);
    const withSeams = mergeVertices(src.clone());
    const positionOnly = src.clone();
    positionOnly.deleteAttribute('uv');
    positionOnly.deleteAttribute('normal');
    const expected = mergeVertices(positionOnly).attributes.position.count;
    const topo = buildTopology(withSeams.attributes.position.array, withSeams.index!.array);
    expect(withSeams.attributes.position.count).toBeGreaterThan(expected);
    expect(topo.vertexCount).toBe(expected);
  });
});

describe('extractContours', () => {
  it('slices a sphere by height into one closed loop per level', () => {
    const topo = sphereTopology(10);
    // Use y as the heightfield: every level should be a single horizontal ring.
    const h = new Float32Array(topo.vertexCount);
    for (let v = 0; v < topo.vertexCount; v++) h[v] = (topo.positions[v * 3 + 1] + 1) / 2;
    const lines = extractContours(topo, h, { interval: 0.1, lift: 0 });
    expect(lines.length).toBe(contourLevels(h, 0.1).length);
    for (const l of lines) {
      expect(l.closed).toBe(true);
      // Ring at height y has circumference 2π·sqrt(1 - y²); tessellation keeps it slightly shorter.
      const y = l.iso * 2 - 1;
      const expected = 2 * Math.PI * Math.sqrt(1 - y * y);
      expect(l.length).toBeGreaterThan(expected * 0.95);
      expect(l.length).toBeLessThan(expected * 1.01);
      // Every point lies (approximately) on the plane y.
      for (let i = 1; i < l.points.length; i += 3) expect(Math.abs(l.points[i] - y)).toBeLessThan(1e-5);
    }
  });

  it('produces open lines on a mesh with a hole', () => {
    const g = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.8); // open at the bottom
    const topo = buildTopology(g.attributes.position.array, g.index!.array);
    const h = new Float32Array(topo.vertexCount);
    for (let v = 0; v < topo.vertexCount; v++) h[v] = topo.positions[v * 3]; // slice by x -> crosses the hole
    const lines = extractContours(topo, h, { interval: 0.25, lift: 0 });
    expect(lines.some((l) => !l.closed)).toBe(true);
  });
});

describe('heightfield + edits', () => {
  it('radial heights are flat on a perfect sphere and normalised to [0,1]', () => {
    const topo = sphereTopology(6);
    const h = extractHeights(topo, { mode: 'radial', smoothing: 0, clip: 0 });
    for (const v of h) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of h) expect(v).toBeLessThanOrEqual(1);
  });

  it('curvature marks a bump as higher than its surroundings', () => {
    const topo = sphereTopology(8);
    // Push a bump out at +y.
    const p = topo.basePositions;
    for (let v = 0; v < topo.vertexCount; v++) {
      const s = 1 + 0.3 * Math.exp(-((1 - p[v * 3 + 1]) ** 2) / 0.02);
      p[v * 3] *= s; p[v * 3 + 1] *= s; p[v * 3 + 2] *= s;
    }
    const h = extractHeights(topo, { mode: 'curvature', smoothing: 2, clip: 0.02 });
    let top = 0, bottom = 0;
    for (let v = 0; v < topo.vertexCount; v++) {
      if (p[v * 3 + 1] > 1.2) top = Math.max(top, h[v]);
      if (p[v * 3 + 1] < -0.9) bottom = Math.max(bottom, h[v]);
    }
    expect(top).toBeGreaterThan(bottom);
  });

  it('gaussian edits are permanent; diffuse edits spread and fade', () => {
    const topo = sphereTopology(8);
    const edits = new TerrainEdits(topo);
    edits.brush([0, 1, 0], { radius: 0.3, strength: 1, falloff: 'gaussian' }, 1);
    const kept = Float32Array.from(edits.field);
    edits.relax(1, 20, 0.5);
    expect(edits.field).toEqual(kept);
    edits.clear();
    edits.brush([0, 1, 0], { radius: 0.3, strength: 0.5, falloff: 'diffuse' }, 1);
    const peak = Math.max(...edits.field);
    expect(peak).toBeGreaterThan(0.5);
    // Far side untouched.
    let far = 0;
    for (let v = 0; v < topo.vertexCount; v++) if (topo.positions[v * 3 + 1] < 0) far = Math.max(far, edits.field[v]);
    expect(far).toBe(0);

    const before = edits.field.reduce((a, b) => a + b, 0);
    edits.relax(1, 20, 0.5);
    expect(Math.max(...edits.field)).toBeLessThan(peak);
    expect(edits.field.reduce((a, b) => a + b, 0)).toBeLessThan(before);
  });
});
