/**
 * Your Earth: once the red giant is done, the one world of Chapters II and III told through its ages, each as you left it.
 * Each age's chart keeps a small round picture of the world and a line of what was made (see save.ts's pages,
 * and its story pages, kept apart so an age is never lost);
 * here they stand in a column, oldest first, each with when it was. An age not yet played is an empty ring.
 */
import type { Page } from './save';
import type { WorldId } from './worlds';

/** The ages, oldest first, and when each was (or will be). */
export const STORY: [WorldId, string][] = [
  ['first', '4.6 billion years ago'],
  ['young', '4.5 billion years ago'],
  ['archean', '2.5 billion years ago'],
  ['snowball', '700 million years ago'],
  ['ocean', 'Today'],
  ['atolls', 'A million years from now'],
  ['drying', 'A billion years from now'],
  ['giant', 'Five billion years from now'],
];

/** The latest page kept for each age, from pages oldest first (and `now`, the age just finished, which may not be kept yet). */
export function storyOf(all: Page[], now?: Page): Map<string, Page> {
  const out = new Map<string, Page>();
  for (const p of all) out.set(p.world, p);
  if (now) out.set(now.world, now);
  return out;
}

/** Fill the story's column: a row an age, with its picture (or an empty ring), when, its name and what was made. */
export function drawStory(into: HTMLElement, kept: Map<string, Page>, title: (id: WorldId) => string): void {
  into.replaceChildren();
  for (const [id, when] of STORY) {
    const page = kept.get(id), row = document.createElement('li');
    const pic = document.createElement('div'); pic.className = 'pic';
    if (page?.portrait) { const img = document.createElement('img'); img.src = page.portrait; img.alt = ''; pic.append(img); } else pic.classList.add('empty');
    const words = document.createElement('div'); words.className = 'words';
    const w = document.createElement('span'); w.className = 'when'; w.textContent = when;
    const n = document.createElement('b'); n.textContent = title(id);
    const said = document.createElement('span'); said.className = 'said'; said.textContent = page ? page.summary.split(' · ')[0] : 'Not played yet';
    words.append(w, n, said);
    row.append(pic, words);
    if (!page) row.classList.add('missing');
    into.append(row);
  }
}
