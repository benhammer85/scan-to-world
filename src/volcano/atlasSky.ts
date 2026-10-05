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
  CHAPTERS.forEach((c, ci) => constellation(ci, c.worlds.length).forEach((p, i) => parts.push(`<clipPath id="w${ci}-${i}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="13"/></clipPath>`)));
  parts.push('</defs>');
  CHAPTERS.forEach((c, ci) => {
    const at = constellation(ci, c.worlds.length);
    // Its name, small, by its first star; its lines, fine, from star to star.
    parts.push(`<text x="18" y="${TOP + ci * ROW + 16}" font-size="12" font-style="italic" fill="${INK}" opacity="0.7">${c.numeral} · ${c.title}</text>`);
    for (let i = 1; i < at.length; i++) parts.push(`<line x1="${at[i - 1].x.toFixed(1)}" y1="${at[i - 1].y.toFixed(1)}" x2="${at[i].x.toFixed(1)}" y2="${at[i].y.toFixed(1)}" stroke="${INK}" stroke-width="0.6" opacity="${latest.has(c.worlds[i]) && latest.has(c.worlds[i - 1]) ? 0.55 : 0.2}"/>`);
    c.worlds.forEach((id, i) => {
      const p = at[i], page = latest.get(id), w = worldOf(id), x = p.x.toFixed(1), y = p.y.toFixed(1);
      parts.push(`<g data-world="${id}" style="cursor:pointer">`);
      parts.push(`<circle cx="${x}" cy="${y}" r="22" fill="transparent"/>`); // (a touch's width)
      if (page) {
        // Made: a small engraved globe in its own colours, a line of latitude across it, its night
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
      if (id === here) parts.push(`<circle cx="${x}" cy="${y}" r="${page ? 17 : 10}" fill="none" stroke="${INK}" stroke-width="0.6"/>`);
      parts.push(`<text x="${x}" y="${(p.y + (page ? 27 : 19)).toFixed(1)}" font-size="9" text-anchor="middle" fill="${INK}" opacity="${page ? 0.85 : 0.45}">${w.numeral}</text>`);
      parts.push('</g>');
    });
  });
  parts.push('</svg>');
  return parts.join('');
}
