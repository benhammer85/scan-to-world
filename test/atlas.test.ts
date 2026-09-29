import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ATLAS, layout, railwayCurve, railwayLines, trainAt } from '../src/atlas/atlas';

describe('the atlas', () => {
  it('lays the worlds out so none crowds another: the first in the middle, the rest spiralling out', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const at = layout(names);
    expect(at.get('a')!.length()).toBe(0);
    for (const x of names) for (const y of names) if (x < y) expect(at.get(x)!.distanceTo(at.get(y)!)).toBeGreaterThan(2.6); // worlds are about 2 across
    expect(layout(names).get('e')!.toArray()).toEqual(at.get('e')!.toArray()); // always the same places
  });
});

describe('the celestial railway', () => {
  const a = { at: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(1, 0, 0) };
  const b = { at: new THREE.Vector3(5, 0, 0), up: new THREE.Vector3(-1, 0, 0) };

  it('runs from one station to the other, climbing straight up off each world first', () => {
    const c = railwayCurve(a, b);
    expect(c.getPoint(0).distanceTo(a.at)).toBeLessThan(1e-9);
    expect(c.getPoint(1).distanceTo(b.at)).toBeLessThan(1e-9);
    expect(c.getTangent(0).dot(a.up)).toBeGreaterThan(0.5); // leaves along the ground's up
    expect(c.getTangent(1).dot(b.up)).toBeLessThan(-0.5); // and comes down onto the other
    // And it bows across the chart rather than running straight.
    expect(Math.abs(c.getPoint(0.5).y)).toBeGreaterThan(0.3);
  });

  it('is laid from both ends, meeting in the middle, and only then gets its halfway station', () => {
    const c = railwayCurve(a, b), eye = new THREE.Vector3(3, 0, 10);
    const count = (g: number) => railwayLines(c, new THREE.Vector3(0, 0, 0), new THREE.Vector3(6, 0, 0), eye, g).reduce((n, l) => n + l.length, 0);
    expect(count(0.3)).toBeLessThan(count(0.7));
    expect(count(0.7)).toBeLessThan(count(1));
  });

  it("the train goes out, rests, comes back, rests, and never leaves the line", () => {
    const c = railwayCurve(a, b);
    let seenEnd = false, seenStart = false;
    for (let s = 0; s < 40; s += 0.05) {
      const { t } = trainAt(c, s, 0);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      if (t === 1) seenEnd = true;
      if (t === 0 && s > 5) seenStart = true;
    }
    expect(seenEnd && seenStart).toBe(true);
    // It comes in again and again: that is when settlers arrive.
    expect(trainAt(c, 60, 0).arrivals).toBeGreaterThan(trainAt(c, 10, 0).arrivals);
    void ATLAS;
  });
});
