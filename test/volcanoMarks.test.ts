import { describe, expect, it } from 'vitest';
import { WORLDS } from '../src/volcano/worlds';
import { MARK_AT, earned, markNames, mergeMarks, readMarks, stillToEarn, writeMarks } from '../src/volcano/marks';

describe('marks', () => {
  it('every world has its thresholds, in shares that have words', () => {
    for (const w of WORLDS) {
      expect(MARK_AT[w.id], w.id).toBeDefined();
      expect([10, 20, 25, 33, 50]).toContain(MARK_AT[w.id].heat);
      expect(markNames(w.id)[0]).toMatch(/heat left$/);
    }
  });
  it('earns each mark on its own', () => {
    const at = MARK_AT.moon;
    expect(earned('moon', at.heat / 100, 0, at.minutes * 60)).toEqual([true, true, true]);
    expect(earned('moon', at.heat / 100 - 0.02, 1, at.minutes * 60 + 1)).toEqual([false, false, false]);
  });
  it('keeps what was earned once', () => {
    const kept = mergeMarks(readMarks('100'), [false, false, true]);
    expect(writeMarks(kept)).toBe('101');
    expect(readMarks(null)).toEqual([false, false, false]);
  });
  it('says what is still to earn', () => {
    expect(stillToEarn('moon', [true, false, false])).toBe(`Still to earn: no setbacks and within ${MARK_AT.moon.minutes} minutes.`);
    expect(stillToEarn('moon', [true, true, true])).toBe('');
  });
});
