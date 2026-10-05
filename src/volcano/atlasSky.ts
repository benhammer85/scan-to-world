/**
 * The atlas as a sky: an engraved star chart, each chapter a constellation of its worlds joined by
 * fine lines, its name beside it. A world made is a small engraved globe in its own colours, inked
 * round; a world still to play, a pencilled circle; the world you're on, ringed twice. A faint grid
 * of the sky and a scatter of small stars lie behind. The plates themselves are listed under it.
 */
import { CHAPTERS, worldOf, type WorldId } from './worlds';
import type { Page } from './save';

const INK = '#2e2118', PENCIL = '#a8987f', W = 360, ROW = 168, TOP = 54;

/** A small seeded random, so the sky is the same every time it's opened. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Where each world of a chapter stands: along a gentle line across its band, a little off it, as a constellation's stars are. */
function constellation(c: number, n: number): { x: number; y: number }[] {
  const r = seeded(97 + c * 131), y0 = TOP + c * ROW + 70, out: { x: number; y: number }[] = [];
  const tilt = (r() - 0.5) * 0.5, swing = 18 + r() * 16;
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1), x = 56 + f * (W - 112);
    out.push({ x: x + (r() - 0.5) * 18, y: y0 + Math.sin(f * Math.PI * (1.2 + r())) * swing + tilt * (x - W / 2) + (r() - 0.5) * 14 });
  }
  return out;
}

/**
 * A chapter's figure, as the old star atlases engraved one behind each constellation: a creature
 * whose body the chapter's worlds lie along, in the band's own frame (360 wide, 168 high). Drawn
 * faint, in pencil; each world made inks the figure round it, so a chapter played through shows
 * its creature whole.
 */
interface Figure { stars: { x: number; y: number }[]; art: string }
const FIGURES: Record<string, Figure> = {
  // III · Strange fires: the Salamander, which in legend lives in fire. Head, shoulder, tail's tip.
  III: {
    stars: [{ x: 74, y: 84 }, { x: 168, y: 78 }, { x: 326, y: 91 }],
    art: [
      // Its body, snout to tail's tip and back along the belly.
      'M 46 86 C 50 72 72 64 94 71 C 102 74 106 73 114 71 C 142 63 182 61 216 69 C 250 77 274 95 300 97 C 316 98 328 92 338 82',
      'C 334 95 318 107 298 107 C 270 107 246 94 216 90 C 182 96 142 99 114 93 C 102 91 92 99 72 99 C 58 99 48 95 46 86 Z',
      // Its legs, splayed as a salamander's are, and its toes.
      'M 124 69 Q 120 54 104 49 M 104 49 l -9 -3 M 104 49 l -7 -7 M 104 49 l 0 -9',
      'M 124 95 Q 120 110 104 116 M 104 116 l -9 3 M 104 116 l -7 7 M 104 116 l 0 9',
      'M 202 66 Q 208 50 224 45 M 224 45 l 9 -3 M 224 45 l 7 -7 M 224 45 l 0 -9',
      'M 202 92 Q 208 108 224 114 M 224 114 l 9 3 M 224 114 l 7 7 M 224 114 l 0 9',
    ].join(' '),
  },
};
/** The figure's engraving: its outline, a little hatching along the belly, spots down the back, an eye. */
function figureArt(id: string, f: Figure): string {
  const out = [`<path d="${f.art}" fill="none" stroke="${INK}" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>`];
  if (id === 'III') {
    for (let x = 120; x <= 290; x += 7) { const y = x < 216 ? 92 + (x - 120) * -0.02 : 90 + (x - 216) * 0.19; out.push(`<line x1="${x}" y1="${(y - 4).toFixed(1)}" x2="${x - 3}" y2="${(y + 1).toFixed(1)}" stroke="${INK}" stroke-width="0.45"/>`); }
    for (const [x, y, r] of [[132, 74, 2.2], [150, 70, 1.6], [186, 70, 2.4], [206, 74, 1.7], [238, 83, 2], [262, 92, 1.5], [284, 97, 1.3]]) out.push(`<ellipse cx="${x}" cy="${y}" rx="${r * 1.4}" ry="${r}" fill="none" stroke="${INK}" stroke-width="0.5"/>`);
    out.push(`<circle cx="60" cy="81" r="1.6" fill="${INK}"/>`);
  }
  return out.join('');
}

/** The chart, as SVG markup: worlds carry `data-world` to be touched. */
export function skySvg(pages: Page[], here: WorldId): string {
  const latest = new Map<string, Page>();
  for (const p of pages) if (p.world) latest.set(p.world, p);
  const H = TOP + CHAPTERS.length * ROW + 20, parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;max-width:560px;margin:0 auto 26px" font-family="Newsreader, Iowan Old Style, Georgia, serif">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#f4efe4"/>`);
  // The sky's grid: hour lines bowed as on a chart of the heavens, and lines of declination.
  for (let i = 1; i < 6; i++) { const x = (i / 6) * W, bow = (x - W / 2) * 0.12; parts.push(`<path d="M ${x} 10 Q ${x + bow} ${H / 2} ${x} ${H - 10}" fill="none" stroke="${PENCIL}" stroke-width="0.4" stroke-dasharray="1 4" opacity="0.7"/>`); }
  for (let y = TOP + ROW; y < H - 20; y += ROW) parts.push(`<path d="M 10 ${y} Q ${W / 2} ${y - 14} ${W - 10} ${y}" fill="none" stroke="${PENCIL}" stroke-width="0.4" stroke-dasharray="1 4" opacity="0.7"/>`);
  // A scatter of small stars, a few of them with rays.
  const r = seeded(4242);
  for (let i = 0; i < 140; i++) {
    const x = 8 + r() * (W - 16), y = 8 + r() * (H - 16), s = r() ** 3 * 1.6 + 0.35;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="${INK}" opacity="${(0.25 + r() * 0.35).toFixed(2)}"/>`);
    if (s > 1.4) for (const a of [0, Math.PI / 2]) parts.push(`<line x1="${(x - Math.cos(a) * s * 3).toFixed(1)}" y1="${(y - Math.sin(a) * s * 3).toFixed(1)}" x2="${(x + Math.cos(a) * s * 3).toFixed(1)}" y2="${(y + Math.sin(a) * s * 3).toFixed(1)}" stroke="${INK}" stroke-width="0.5" opacity="0.4"/>`);
  }
  parts.push('<defs>');
  const starsOf = (ci: number) => { const f = FIGURES[CHAPTERS[ci].numeral], y0 = TOP + ci * ROW; return f && f.stars.length === CHAPTERS[ci].worlds.length ? f.stars.map((p) => ({ x: p.x, y: p.y + y0 })) : constellation(ci, CHAPTERS[ci].worlds.length); };
  CHAPTERS.forEach((c, ci) => {
    const f = FIGURES[c.numeral]; if (!f) return;
    // (Each world made inks the figure round it: a soft circle of the figure, wider than the globe.)
    parts.push(`<mask id="m${ci}" maskUnits="userSpaceOnUse" x="0" y="${TOP + ci * ROW - 30}" width="${W}" height="${ROW + 40}"><rect x="0" y="${TOP + ci * ROW - 30}" width="${W}" height="${ROW + 40}" fill="black"/>`);
    const all = c.worlds.every((w) => latest.has(w));
    starsOf(ci).forEach((p, i) => { if (all || latest.has(c.worlds[i])) parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${all ? 400 : 82}" fill="url(#reveal)"/>`); });
    parts.push('</mask>');
  });
  parts.push(`<radialGradient id="reveal"><stop offset="0.55" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>`);
  CHAPTERS.forEach((_c, ci) => starsOf(ci).forEach((p, i) => parts.push(`<clipPath id="w${ci}-${i}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${latest.get(CHAPTERS[ci].worlds[i])?.portrait ? 14.5 : 13}"/></clipPath>`)));
  parts.push('</defs>');
  CHAPTERS.forEach((c, ci) => {
    const at = starsOf(ci), f = FIGURES[c.numeral];
    // Its figure: faint in pencil all along, inked where its worlds are made.
    if (f) {
      const art = figureArt(c.numeral, f), y0 = TOP + ci * ROW;
      parts.push(`<g transform="translate(0 ${y0})" opacity="0.16">${art}</g>`);
      parts.push(`<g mask="url(#m${ci})"><g transform="translate(0 ${y0})" opacity="0.6">${art}</g></g>`);
    }
    // Its name, small, by its first star; its lines, fine, from star to star.
    parts.push(`<text x="18" y="${TOP + ci * ROW + 16}" font-size="12" font-style="italic" fill="${INK}" opacity="0.7">${c.numeral} · ${c.title}</text>`);
    for (let i = 1; i < at.length; i++) parts.push(`<line x1="${at[i - 1].x.toFixed(1)}" y1="${at[i - 1].y.toFixed(1)}" x2="${at[i].x.toFixed(1)}" y2="${at[i].y.toFixed(1)}" stroke="${INK}" stroke-width="0.6" opacity="${latest.has(c.worlds[i]) && latest.has(c.worlds[i - 1]) ? 0.55 : 0.2}"/>`);
    c.worlds.forEach((id, i) => {
      const p = at[i], page = latest.get(id), w = worldOf(id), x = p.x.toFixed(1), y = p.y.toFixed(1);
      parts.push(`<g data-world="${id}" style="cursor:pointer">`);
      parts.push(`<circle cx="${x}" cy="${y}" r="22" fill="transparent"/>`); // (a touch's width)
      if (page?.portrait) {
        // Made, and kept as it was left: the world itself, small and round, inked round.
        parts.push(`<circle cx="${x}" cy="${y}" r="15" fill="#f4efe4"/>`);
        parts.push(`<image href="${page.portrait}" x="${(p.x - 15).toFixed(1)}" y="${(p.y - 15).toFixed(1)}" width="30" height="30" clip-path="url(#w${ci}-${i})" preserveAspectRatio="xMidYMid slice"/>`);
        parts.push(`<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="${INK}" stroke-width="1"/>`);
      } else if (page) {
        // Made, before worlds were kept so (or not caught): a small engraved globe in its own colours, a line of latitude across it, its night
        // side hatched. (Its plate, shrunk this small, read as nothing.)
        const P = w.palette, cx = p.x, cy = p.y;
        parts.push(`<circle cx="${x}" cy="${y}" r="13" fill="${P.paper}"/>`);
        parts.push(`<g clip-path="url(#w${ci}-${i})">`);
        parts.push(`<circle cx="${(cx + 6).toFixed(1)}" cy="${(cy + 4).toFixed(1)}" r="9" fill="${P.basalt}" opacity="0.35"/>`);
        parts.push(`<ellipse cx="${x}" cy="${y}" rx="13" ry="4" fill="none" stroke="${INK}" stroke-width="0.5" opacity="0.5"/>`);
        parts.push(`<ellipse cx="${x}" cy="${y}" rx="5" ry="13" fill="none" stroke="${INK}" stroke-width="0.5" opacity="0.35"/>`);
        for (let k = -3; k <= 6; k++) parts.push(`<line x1="${(cx + k * 3).toFixed(1)}" y1="${(cy + 14).toFixed(1)}" x2="${(cx + k * 3 + 14).toFixed(1)}" y2="${(cy - 14).toFixed(1)}" stroke="${INK}" stroke-width="0.45" opacity="${k > 1 ? 0.35 : 0}"/>`);
        parts.push('</g>');
        parts.push(`<circle cx="${x}" cy="${y}" r="13" fill="none" stroke="${INK}" stroke-width="1"/>`);
      } else parts.push(`<circle cx="${x}" cy="${y}" r="6" fill="#f4efe4" stroke="${PENCIL}" stroke-width="0.9" stroke-dasharray="1.5 2"/>`);
      if (id === here) parts.push(`<circle cx="${x}" cy="${y}" r="${page?.portrait ? 19 : page ? 17 : 10}" fill="none" stroke="${INK}" stroke-width="0.6"/>`);
      parts.push(`<text x="${x}" y="${(p.y + (page?.portrait ? 29 : page ? 27 : 19)).toFixed(1)}" font-size="9" text-anchor="middle" fill="${INK}" opacity="${page ? 0.85 : 0.45}">${w.numeral}</text>`);
      parts.push('</g>');
    });
  });
  parts.push('</svg>');
  return parts.join('');
}
