/** Days as they're kept (pure, no drawing). */

/** A day as it's kept: 2026-10-12 (local). */
export const dayOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** A kept day back to a date (local midnight). */
export const dayDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
