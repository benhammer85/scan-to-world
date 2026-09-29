import { describe, expect, it } from 'vitest';
import { lineKey, PlotterLines } from '../src/render/plotterLines';
import type { Polyline } from '../src/terrain/contours';

/** Many short strokes scattered over a sphere, like a grown town's marks. */
function strokes(n: number): Polyline[] {
  const out: Polyline[] = [];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    const x = s * Math.cos(a), y = s * Math.sin(a);
    out.push({ points: new Float32Array([x, y, z, x + 0.01, y, z, x + 0.01, y + 0.01, z]), closed: false, level: 0, length: 0.02 } as Polyline);
  }
  return out;
}

describe('a nimble pen', () => {
  it('orders thousands of strokes quickly, and leaves the strokes it was given alone', () => {
    const lines = strokes(6000);
    const before = lines.map(lineKey);
    const pen = new PlotterLines();
    const t = performance.now();
    pen.setLines(lines, 'plot');
    const took = performance.now() - t;
    expect(lines.map(lineKey)).toEqual(before);
    expect(took).toBeLessThan(1500); // was quadratic; now a grid walk
  });

  it('redrawing the same strokes once inked costs next to nothing', () => {
    const lines = strokes(3000);
    const pen = new PlotterLines();
    pen.setLines(lines, 'ink');
    const t = performance.now();
    pen.setLines(lines, 'ink');
    expect(performance.now() - t).toBeLessThan(200);
  });
});
