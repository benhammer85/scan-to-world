/**
 * Real wood for the print (see wood/CREDITS.md): a red oak's years, straightened, as ink (each year a
 * strip `YEAR` px deep, pores at its top), and a red pine's fibre. Loaded once, the years then kept in
 * smaller and smaller copies, so a fine ring samples a small copy rather than shimmering.
 */
export interface Level { w: number; h: number; d: Float32Array }
export interface Years { n: number; year: number; levels: (Level & { rows: number })[] }

export const YEAR = 112;
export const wood: { oak?: Years; pine?: Level } = {};

const URLS = {
  oak: new URL('./wood/red-oak-years.png', import.meta.url).href,
  pine: new URL('./wood/red-pine-fibre.png', import.meta.url).href,
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

/**
 * A smaller copy of the years: each year `rows` deep, `w` round, every texel the mean of what it covers
 * (so a ring a few pixels wide prints the year's tone, not a shimmer).
 */
function shrink(l: Level, years: number, rows: number, w: number): Level {
  const d = new Float32Array(w * years * rows), fy = YEAR / rows, fx = l.w / w;
  for (let yr = 0; yr < years; yr++) for (let r = 0; r < rows; r++) {
    const s0 = yr * YEAR + Math.floor(r * fy), s1 = yr * YEAR + Math.max(Math.floor(r * fy) + 1, Math.floor((r + 1) * fy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let t = 0;
      for (let sy = s0; sy < s1; sy++) for (let sx = x0; sx < x1; sx++) t += l.d[sy * l.w + sx];
      d[(yr * rows + r) * w + x] = t / ((s1 - s0) * (x1 - x0));
    }
  }
  return { w, h: years * rows, d };
}

/** Bilinear, wrapping round (along) and clamped within one year's strip (across). */
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
  pixels(URLS.oak).then((l) => {
    const n = Math.round(l.h / YEAR), levels = [{ ...l, rows: YEAR }];
    for (let k = 1; 2 ** (k - 1) < YEAR; k++) {
      const rows = Math.max(1, Math.round(YEAR / 2 ** k));
      levels.push({ ...shrink(l, n, rows, Math.max(4, Math.round(l.w / 2 ** k))), rows });
    }
    wood.oak = { n, year: YEAR, levels };
    then();
  }).catch(() => {});
  pixels(URLS.pine).then((l) => { wood.pine = l; then(); }).catch(() => {});
}
