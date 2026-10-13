import { describe, expect, it } from 'vitest';
import { RINGS, SHAPES, overlap, percent, shapeFor } from '../src/rings/puzzle';

describe('the puzzle', () => {
  it('has targets whose mean radius is about one', () => {
    for (const s of SHAPES) {
      let m = 0;
      for (let i = 0; i < 360; i++) m += s.r((i / 360) * Math.PI * 2);
      expect(m / 360).toBeGreaterThan(0.95); expect(m / 360).toBeLessThan(1.05);
    }
    expect(RINGS).toBe(8);
  });
  it('gives everyone the same target on a day, and turns through them', () => {
    expect(shapeFor('2026-10-13').id).toBe(shapeFor('2026-10-13').id);
    const seen = new Set(['2026-10-13', '2026-10-14', '2026-10-15'].map((d) => shapeFor(d).id));
    expect(seen.size).toBe(SHAPES.length);
    expect(shapeFor('2026-10-13', 'lobes').id).toBe('lobes');
    expect(shapeFor('2026-10-13', 'nonsense').id).toBe(shapeFor('2026-10-13').id);
  });
  it('scores a perfect fill as whole, and overshoot as badly as falling short', () => {
    const t = SHAPES[2].r;
    expect(overlap(t, t)).toBeCloseTo(1, 6);
    const short = overlap((a) => t(a) * 0.9, t), over = overlap((a) => t(a) / 0.9, t);
    expect(short).toBeCloseTo(0.81, 2); expect(over).toBeCloseTo(0.81, 2);
    expect(overlap(() => 1, t)).toBeLessThan(0.97);
    expect(overlap(() => 0, t)).toBe(0);
  });
  it('says the score to a tenth', () => {
    expect(percent(0.87436)).toBe('87.4%');
    expect(percent(1)).toBe('100.0%');
  });
});
