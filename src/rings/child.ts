/**
 * A child's tree, the reckoning of it (pure, no drawing): days as 2026-10-12, a child's age on a day,
 * their age as it's said, how much they grew in a year, where each day lies in its year of their life,
 * and the day's question.
 */

/** A day as it's kept: 2026-10-12 (local). */
export const dayOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** A kept day back to a date (local midnight). */
export const dayDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

/** Their age on a day: whole years, the day of that year (0 on the birthday), and that year's length in days. */
export function ageOn(birth: string, day: string): { years: number; day: number; len: number } {
  const b = dayDate(birth), t = dayDate(day);
  const at = (n: number) => new Date(b.getFullYear() + n, b.getMonth(), b.getDate());
  let years = t.getFullYear() - b.getFullYear();
  if (t < at(years)) years--;
  years = Math.max(0, years);
  const from = at(years), to = at(years + 1);
  return { years, day: Math.round((t.getTime() - from.getTime()) / 864e5), len: Math.round((to.getTime() - from.getTime()) / 864e5) };
}

/** Their age, as it's said: "3 days", "3 weeks", "7 months", "2 years, 4 months". */
export function ageWords(birth: string, day: string): string {
  const a = ageOn(birth, day), months = Math.floor((a.day / a.len) * 12 + 1e-6);
  if (a.years === 0 && months === 0) return a.day < 7 ? `${a.day} ${a.day === 1 ? 'day' : 'days'}` : `${Math.floor(a.day / 7)} weeks`;
  if (a.years === 0) return `${months} ${months === 1 ? 'month' : 'months'}`;
  return `${a.years} ${a.years === 1 ? 'year' : 'years'}${months ? `, ${months} ${months === 1 ? 'month' : 'months'}` : ''}`;
}

/** How much children typically grow in each year of their life (cm), birth to 18. */
export const TYPICAL = [25, 12, 9, 7, 6.5, 6, 6, 5.5, 5.5, 5.5, 6, 6.5, 7, 6.5, 5, 3, 1.5, 1];
/** How much they grew in a year of their life (cm): measured, if both birthdays' heights are known and it grew; else as children do. */
export function grewIn(heights: Record<number, number>, age: number): number {
  const a = heights[age], b = heights[age + 1];
  return a && b && b > a ? b - a : TYPICAL[Math.min(age, TYPICAL.length - 1)];
}

export interface Span { y: number; f0: number; f1: number; whole: boolean }
/**
 * Where in its year of their life each ring lies: the year (their age), and the share of that year from
 * where it begins to where it ends. A whole year (the first `whole` rings, or a ring with no day) is 0 to 1;
 * a day is its own day's share; days drawn more than once share their day between them.
 */
export function yearSpans(birth: string, days: (string | undefined)[], rings: number, whole = 0): Span[] {
  const out: Span[] = [], count = new Map<string, number>(), seen = new Map<string, number>();
  for (let i = whole; i < days.length; i++) { const d = days[i]; if (d) count.set(d, (count.get(d) ?? 0) + 1); }
  for (let i = 0; i < rings; i++) {
    const d = days[i];
    if (i < whole || !d) { out.push({ y: i, f0: 0, f1: 1, whole: true }); continue; }
    const a = ageOn(birth, d), k = count.get(d) ?? 1, j = seen.get(d) ?? 0;
    seen.set(d, j + 1);
    out.push({ y: a.years, f0: (a.day + j / k) / a.len, f1: (a.day + (j + 1) / k) / a.len, whole: false });
  }
  return out;
}

/** One gentle question a day, answered by the loop drawn. */
export const ASK = ['How was today with {n}?', 'What did {n} notice today?', 'How did {n} sleep?', 'What made {n} laugh today?', 'What was hard today?',
  'Where did you go with {n} today?', 'What did {n} try for the first time?', 'How was bedtime?', 'What was {n} curious about?',
  'What will you remember about today?', 'How did {n} seem today?', 'What did {n} love today?', 'What did {n} say today?', 'How were you, with {n}, today?'];
/** The day's question (the same all day, a different one the next). */
export function question(name: string, birth: string, today: string): string {
  const n = Math.round((dayDate(today).getTime() - dayDate(birth).getTime()) / 864e5);
  return ASK[((n % ASK.length) + ASK.length) % ASK.length].replace('{n}', name);
}
