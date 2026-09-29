import { describe, expect, it } from 'vitest';
import { frameAt, tree } from '../src/life/countryMarks';
import { gathering, STANDING } from '../src/life/figures';
import { stippleDots } from '../src/render/stipple';

const nm = new Float32Array([0, 0, 1]);

describe('standing figures', () => {
  it('a tree drawn inside a gathering stands as a figure, and outside one is drawn flat in strokes', () => {
    const flat = tree([0, 0, 1], frameAt(nm, 0), 0.004, 7);
    expect(flat.length).toBeGreaterThan(0);
    const got = gathering(() => ({ lines: tree([0, 0, 1], frameAt(nm, 0), 0.004, 7) }));
    expect(got.lines).toEqual([]);
    expect(got.figures).toHaveLength(1);
    expect(['tree', 'fir']).toContain(got.figures[0].kind);
    expect(got.figures[0].up).toEqual([0, 0, 1]); // it stands on the ground's up
  });

  it('with ?flat, a gathering draws everything flat as before', () => {
    STANDING.on = false;
    try {
      const got = gathering(() => ({ lines: tree([0, 0, 1], frameAt(nm, 0), 0.004, 7) }));
      expect(got.lines.length).toBeGreaterThan(0);
      expect(got.figures).toHaveLength(0);
    } finally { STANDING.on = true; }
  });
});

describe('stipple', () => {
  const square = (s: number) => [0, 0, 0, s, 0, 0, s, s, 0, 0, 0, 0, s, s, 0, 0, s, 0];
  it('dots built ground evenly: four times the ground, about four times the dots', () => {
    const small = stippleDots(square(0.02)).length / 3, big = stippleDots(square(0.04)).length / 3;
    expect(small).toBeGreaterThan(10);
    expect(big / small).toBeGreaterThan(3);
    expect(big / small).toBeLessThan(5);
  });
  it('puts the same dots in the same places every time, so a growing town never shimmers', () => {
    expect(stippleDots(square(0.03))).toEqual(stippleDots(square(0.03)));
  });
});
