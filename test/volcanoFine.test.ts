import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTopology } from '../src/mesh/topology';
import { FineSurface } from '../src/volcano/fine';

describe('the finer surface the volcano is drawn on', () => {
  const coarse = buildTopology(new THREE.IcosahedronGeometry(1, 8).attributes.position.array, null);
  const fine = new FineSurface(coarse, buildTopology(new THREE.IcosahedronGeometry(1, 16).attributes.position.array, null));
  const n = fine.fine.vertexCount;

  it('carries an even field across unchanged', () => {
    const out = new Float32Array(n);
    fine.carry(new Float32Array(coarse.vertexCount).fill(0.3), out);
    for (const x of out) expect(x).toBeCloseTo(0.3, 5);
  });

  it('carries a smooth field across close to what it is at each fine point', () => {
    const src = new Float32Array(coarse.vertexCount), out = new Float32Array(n);
    for (let v = 0; v < coarse.vertexCount; v++) src[v] = coarse.basePositions[v * 3] * 0.2 + coarse.basePositions[v * 3 + 2] * 0.1;
    fine.carry(src, out);
    let worst = 0;
    for (let f = 0; f < n; f++) worst = Math.max(worst, Math.abs(out[f] - (fine.fine.basePositions[f * 3] * 0.2 + fine.fine.basePositions[f * 3 + 2] * 0.1)));
    expect(worst).toBeLessThan(0.02); // a coarse test sphere: Loop rounds a little more than it would at the detail drawn
  });

  it('carries three values a vertex as easily as one', () => {
    const src = new Float32Array(coarse.vertexCount * 3), out = new Float32Array(n * 3);
    for (let v = 0; v < coarse.vertexCount; v++) src.set([1, 2, 3], v * 3);
    fine.carry(src, out, 3);
    expect(out[3 * 7 + 1]).toBeCloseTo(2, 5);
  });
});
