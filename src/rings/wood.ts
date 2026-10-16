/**
 * Real wood for the print (see wood/CREDITS.md): each wood's fibre, from real sections, and how ink takes
 * on a real relief print (Munch's sea and his field, as density, 1 full, 0 the paper). Loaded once.
 */
export interface Level { w: number; h: number; d: Float32Array }

export const wood: { pine?: Level; sea?: Level; field?: Level; fibre: Record<string, Level> } = { fibre: {} };

const URLS = {
  pine: new URL('./wood/red-pine-fibre.png', import.meta.url).href,
  cherry: new URL('./wood/black-cherry-fibre.png', import.meta.url).href,
  maple: new URL('./wood/bigleaf-maple-fibre.png', import.meta.url).href,
  birch: new URL('./wood/paper-birch-fibre.png', import.meta.url).href,
  redwood: new URL('./wood/giant-sequoia-fibre.png', import.meta.url).href,
  sea: new URL('./wood/munch-sea-ink.png', import.meta.url).href,
  field: new URL('./wood/munch-field-ink.png', import.meta.url).href,
};

function pixels(url: string): Promise<Level> {
  return new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0);
      const s = x.getImageData(0, 0, c.width, c.height).data, d = new Float32Array(c.width * c.height);
      for (let i = 0; i < d.length; i++) d[i] = s[i * 4] / 255;
      done({ w: c.width, h: c.height, d });
    };
    img.onerror = fail; img.src = url;
  });
}

/** Bilinear, wrapping both ways (a tile). */
export const tile = (l: Level, u: number, v: number) => sample(l, u, ((v % l.h) + l.h) % l.h);
/** Bilinear, wrapping round (along) and clamped within a strip (across). */
export function sample(l: Level, u: number, v: number, top = 0, rows = l.h): number {
  u = ((u % l.w) + l.w) % l.w;
  v = Math.max(top, Math.min(top + rows - 1.001, v));
  const x0 = Math.min(l.w - 1, Math.floor(u)), y0 = Math.floor(v), fx = u - x0, fy = v - y0, x1 = x0 + 1 >= l.w ? 0 : x0 + 1, y1 = Math.min(l.h - 1, y0 + 1);
  const a = l.d[y0 * l.w + x0], b = l.d[y0 * l.w + x1], c = l.d[y1 * l.w + x0], e = l.d[y1 * l.w + x1];
  return (a + (b - a) * fx) + ((c + (e - c) * fx) - (a + (b - a) * fx)) * fy;
}

let asked = false;
/** Fetch the wood once; `then` when each arrives (to redraw). */
export function loadWood(then: () => void): void {
  if (asked) return;
  asked = true;
  // (The fibre of each wood; bristlecone and olive, with no section to hand, take
  // their nearest kin's: a red pine's, a cherry's.)
  const fibre = (url: string, ...as: string[]) => pixels(url).then((l) => { for (const k of as) wood.fibre[k] = l; then(); }).catch(() => {});
  fibre(URLS.cherry, 'cherry', 'olive'); fibre(URLS.maple, 'maple'); fibre(URLS.birch, 'birch'); fibre(URLS.redwood, 'redwood');
  pixels(URLS.pine).then((l) => { wood.pine = l; wood.fibre.pine = l; wood.fibre.bristlecone = l; then(); }).catch(() => {});
  pixels(URLS.sea).then((l) => { wood.sea = l; then(); }).catch(() => {});
  pixels(URLS.field).then((l) => { wood.field = l; then(); }).catch(() => {});
}
