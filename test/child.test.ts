import { describe, expect, it } from 'vitest';
import { ASK, TYPICAL, ageOn, ageWords, dayDate, dayOf, grewIn, question, yearSpans } from '../src/rings/child';
import { growth, season } from '../src/rings/growing';

describe('a child’s tree: days', () => {
  it('keeps a day as a local date and reads it back', () => {
    expect(dayOf(new Date(2026, 9, 12))).toBe('2026-10-12');
    expect(dayOf(dayDate('2024-02-29'))).toBe('2024-02-29');
  });
});

describe('a child’s age', () => {
  it('is no years and no days on the day they’re born', () => {
    expect(ageOn('2024-06-09', '2024-06-09')).toEqual({ years: 0, day: 0, len: 365 });
  });
  it('turns a year on the birthday, not the day before', () => {
    expect(ageOn('2024-06-09', '2025-06-08').years).toBe(0);
    expect(ageOn('2024-06-09', '2025-06-09')).toMatchObject({ years: 1, day: 0 });
  });
  it('counts a leap year’s days', () => {
    expect(ageOn('2023-06-09', '2023-06-10').len).toBe(366);
  });
  it('never goes below nothing (a day before the birth)', () => {
    expect(ageOn('2024-06-09', '2024-06-01').years).toBe(0);
  });
  it('is said as a person says it', () => {
    expect(ageWords('2024-06-09', '2024-06-10')).toBe('1 day');
    expect(ageWords('2024-06-09', '2024-06-12')).toBe('3 days');
    expect(ageWords('2024-06-09', '2024-06-30')).toBe('3 weeks');
    expect(ageWords('2024-06-09', '2024-07-10')).toBe('1 month');
    expect(ageWords('2024-06-09', '2025-01-09')).toBe('7 months');
    expect(ageWords('2024-06-09', '2025-06-09')).toBe('1 year');
    expect(ageWords('2024-06-09', '2026-10-12')).toBe('2 years, 4 months');
  });
});

describe('how much they grew', () => {
  it('is measured when both birthdays’ heights are known', () => {
    expect(grewIn({ 1: 74, 2: 86.5 }, 1)).toBe(12.5);
  });
  it('is as children typically grow when a height is missing, or didn’t rise', () => {
    expect(grewIn({}, 0)).toBe(TYPICAL[0]);
    expect(grewIn({ 3: 95 }, 3)).toBe(TYPICAL[3]);
    expect(grewIn({ 3: 95, 4: 94 }, 3)).toBe(TYPICAL[3]);
  });
  it('carries on past eighteen at the last year’s pace', () => {
    expect(grewIn({}, 30)).toBe(TYPICAL[TYPICAL.length - 1]);
  });
});

describe('where each day lies in its year', () => {
  it('gives a whole year to rings grown before days were drawn, and to rings with no day', () => {
    const s = yearSpans('2024-06-09', ['2024-06-09', undefined], 2, 1);
    expect(s[0]).toEqual({ y: 0, f0: 0, f1: 1, whole: true });
    expect(s[1].whole).toBe(true);
  });
  it('gives a day its own share of the year, in order', () => {
    const s = yearSpans('2024-06-09', ['2025-06-09', '2025-12-09'], 2);
    expect(s[0]).toMatchObject({ y: 1, whole: false });
    expect(s[0].f0).toBe(0);
    expect(s[1].f0).toBeGreaterThan(s[0].f1);
    expect(s[1].f1).toBeLessThan(1);
  });
  it('shares a day drawn twice between its two rings', () => {
    const [a, b] = yearSpans('2024-06-09', ['2025-06-10', '2025-06-10'], 2);
    expect(a.f1).toBeCloseTo(b.f0, 12);
    expect(b.f1 - a.f0).toBeCloseTo(1 / 365, 12);
  });
});

describe('the day’s question', () => {
  it('names the child, is the same all day, and changes the next day', () => {
    const q = question('Ada', '2024-06-09', '2026-10-12');
    expect(q).toBe(question('Ada', '2024-06-09', '2026-10-12'));
    expect(q).not.toBe(question('Ada', '2024-06-09', '2026-10-13'));
    expect(ASK.some((a) => a.replace('{n}', 'Ada') === q)).toBe(true);
  });
  it('comes round to every question in turn', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= ASK.length; d++) seen.add(question('Ada', '2024-06-09', dayOf(new Date(2026, 0, d))));
    expect(seen.size).toBe(ASK.length);
  });
});

describe('how a tree grows', () => {
  it('swells and narrows round its girth, gently, never to nothing', () => {
    let lo = Infinity, hi = 0;
    for (let n = 0; n < 400; n += 7) for (let a = 0; a < Math.PI * 2; a += 0.1) { const g = growth(42, a, n); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    expect(lo).toBeGreaterThan(0.3);
    expect(hi).toBeLessThan(3);
    expect(hi / lo).toBeGreaterThan(1.2);
  });
  it('is its own for each tree, and changes slowly from year to year', () => {
    expect(growth(1, 1, 50)).not.toBe(growth(2, 1, 50));
    expect(Math.abs(growth(7, 1, 101) - growth(7, 1, 100))).toBeLessThan(0.05);
  });
  it('goes through a season quick at first, easing to a stop', () => {
    expect(season(0)).toBe(0);
    expect(season(1)).toBe(1);
    expect(season(-1)).toBe(0);
    expect(season(2)).toBe(1);
    expect(season(0.25)).toBeGreaterThan(0.25);
    for (let t = 0; t < 1; t += 0.05) expect(season(t + 0.05)).toBeGreaterThanOrEqual(season(t));
  });
});
