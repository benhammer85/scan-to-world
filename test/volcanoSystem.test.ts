import { describe, expect, it } from 'vitest';
import { newSystem, worldFor, recordPlayed, giftOf, finished, madeCount, nameOf, twistOf, MOST_WARMTH } from '../src/volcano/system';
import { worldOf } from '../src/volcano/worlds';
import { VOLCANO } from '../src/volcano/sim';

describe('a solar system', () => {
  it('is five kinds of world, warmest nearest the star, each its own twist, the same for the same seed', () => {
    const a = newSystem(42), b = newSystem(42), c = newSystem(43);
    expect(a).toEqual(b);
    expect(a.bodies.length).toBe(5);
    expect(new Set(a.bodies.map((x) => x.world)).size).toBe(5);
    expect(a.bodies.filter((x) => x.twist === 'none').length).toBeLessThanOrEqual(1);
    for (const x of a.bodies) expect(twistOf(x.twist).not ?? []).not.toContain(x.world);
    expect(JSON.stringify(c.bodies)).not.toBe(JSON.stringify(a.bodies));
  });

  it('plays each world with its twist, said on its card', () => {
    const sys = newSystem(1);
    sys.bodies[0] = { world: 'mars', twist: 'cold' };
    const w = worldFor(sys, 0);
    expect(w.rules.rising).toBeCloseTo(0.52 * 0.8);
    expect(w.rules.heat ?? 250).toBeCloseTo(250); // the same heat, only slower
    expect(w.then).toContain('A slow fire: the heat comes slowly');
    expect(w.title).toBe('A red world');
  });

  it('passes warmth from a world made to the next one played, more for a better second aim', () => {
    let sys = newSystem(1);
    sys.bodies = [{ world: 'mars', twist: 'none' }, { world: 'ice', twist: 'thin' }];
    sys = recordPlayed(sys, 0, { met: true, second: 700, words: '' });
    expect(sys.gift!.heat).toBeCloseTo(MOST_WARMTH);
    const next = worldFor(sys, 1);
    expect(next.rules.heat).toBeCloseTo(380 * (1 + MOST_WARMTH));
    expect(next.then).toContain('Given by the last world');
    // Spent once played; and a world not made passes nothing on.
    sys = recordPlayed(sys, 1, { met: false, second: 10, words: '' });
    expect(sys.gift).toBe(null);
    expect(finished(sys)).toBe(true);
    expect(madeCount(sys)).toBe(1);
  });

  it('makes a young world\'s moon a world of the system, to play', () => {
    let sys = newSystem(1);
    sys.bodies = [{ world: 'young', twist: 'none' }, { world: 'ocean', twist: 'none' }];
    sys = recordPlayed(sys, 1, { met: false, second: 0, words: '' });
    sys = recordPlayed(sys, 0, { met: true, second: 3474, words: '' });
    expect(sys.bodies.map((b) => b.world)).toEqual(['young', 'moon', 'ocean']);
    expect(sys.bodies[1].moonOf).toBe(0);
    expect(sys.order).toEqual([2, 0]);
    expect(finished(sys)).toBe(false);
    expect(nameOf(sys, 1).numeral).toBe('Ia');
    expect(nameOf(sys, 2).numeral).toBe('II');
  });

  it('turns a small ice moon\'s ring into stones for the next world', () => {
    let sys = newSystem(1);
    sys.bodies = [{ world: 'mars', twist: 'none' }, { world: 'enceladus', twist: 'none' }];
    sys = recordPlayed(sys, 1, { met: true, second: 0, words: '' });
    expect(giftOf(sys, 1)!.stones).toBe(true);
    const mars = worldFor(sys, 0), own = { ...VOLCANO, ...worldOf('mars').rules };
    expect(mars.rules.impactEvery![1]).toBeCloseTo(own.impactEvery[1] * 0.6);
    expect(mars.rules.impactHeat).toBeCloseTo(own.impactHeat * 1.5);
  });
});
