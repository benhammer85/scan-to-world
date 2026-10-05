/**
 * The atlas as a night sky, engraved as the old star atlases were: each chapter a constellation,
 * its figure one of Johann Bayer's (Uranometria, 1603, engraved by Alexander Mair; from the ETH
 * Library Zurich's copy on e-rara.ch, marked public domain), cleaned of its chart's grid and printed pale on night blue. Each world sits on one of the
 * figure's own stars. The figure is a faint ghost until its worlds are made: each world made inks the
 * figure round it, and a chapter played through shows it whole. A world made is the world itself,
 * small and round as it was left; one still to play, a small pencilled circle.
 */
import { CHAPTERS, worldOf, type WorldId } from './worlds';
import type { Page } from './save';
import ursa from './figures/ursa.webp';
import hydra from './figures/hydra.webp';
import draco from './figures/draco.webp';
import hercules from './figures/hercules.webp';
import pegasus from './figures/pegasus.webp';

/** The night's colours: the sky, the engraving's pale ink, the old gold of its stars. */
export const NIGHT = '#1b2341', PALE = '#efe7d3', GOLD = '#e2c27a';
const W = 360, PAD = 8, LABEL = 34, GAP = 22, TALL = 330;

/** A chapter's figure: its picture, its size in pixels, and its worlds' stars on it (in the picture's pixels), in order. */
interface Figure { name: string; src: string; w: number; h: number; stars: [number, number][] }
const FIGURES: Record<string, Figure> = {
  // I · Our neighbours: the Great Bear, the most familiar figure in our sky; its worlds on the Dipper (η, ζ, ε, δ, α).
  I: { name: 'Ursa Major', src: ursa, w: 820, h: 672, stars: [[58, 93], [178, 50], [233, 93], [305, 140], [476, 173]] },
  // II · One world, through time: the Hydra, the long water-serpent, from its tail to its head (γ, β, θ, α, ζ).
  II: { name: 'Hydra', src: hydra, w: 820, h: 269, stars: [[117, 50], [270, 213], [412, 133], [580, 138], [712, 38]] },
  // III · Strange fires: the Dragon: its tail, its coil, its head.
  III: { name: 'Draco', src: draco, w: 677, h: 818, stars: [[80, 710], [182, 262], [293, 80]] },
  // IV · Pressure: Hercules, straining: club, face, shoulder, hip, knee and foot.
  IV: { name: 'Hercules', src: hercules, w: 686, h: 819, stars: [[318, 44], [427, 213], [418, 392], [310, 494], [120, 600], [478, 770]] },
  // V · Far worlds: Pegasus, flying far: muzzle, neck, wing, wingtip, cloud.
  V: { name: 'Pegasus', src: pegasus, w: 820, h: 573, stars: [[57, 232], [265, 158], [372, 186], [616, 72], [671, 292]] },
};

/** A small seeded random, so the sky is the same every time it's opened. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Where each chapter's band lies, and where its figure sits in it. */
function layout(): { y: number; h: number; fx: number; fy: number; fw: number; fh: number }[] {
  let y = 14;
  return CHAPTERS.map((c) => {
    const f = FIGURES[c.numeral];
    let fw = W - 2 * PAD, fh = (fw * f.h) / f.w;
    if (fh > TALL) { fh = TALL; fw = (fh * f.w) / f.h; }
    const band = { y, h: LABEL + fh + GAP, fx: (W - fw) / 2, fy: y + LABEL, fw, fh };
    y += band.h;
    return band;
  });
}

/** The chart, as SVG markup: worlds carry `data-world` to be touched. */
export function skySvg(pages: Page[], here: WorldId): string {
  const latest = new Map<string, Page>();
  for (const p of pages) if (p.world) latest.set(p.world, p);
  const bands = layout(), H = bands[bands.length - 1].y + bands[bands.length - 1].h + 30, parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H.toFixed(0)}" width="100%" style="display:block;max-width:560px;margin:0 auto 26px" font-family="Newsreader, Iowan Old Style, Georgia, serif">`);
  parts.push(`<rect width="${W}" height="${H.toFixed(0)}" fill="${NIGHT}"/>`);
  // The sky's grid, faint: hour lines bowed as on a chart of the heavens.
  for (let i = 1; i < 6; i++) { const x = (i / 6) * W, bow = (x - W / 2) * 0.12; parts.push(`<path d="M ${x} 6 Q ${x + bow} ${H / 2} ${x} ${H - 6}" fill="none" stroke="${PALE}" stroke-width="0.4" stroke-dasharray="1 5" opacity="0.18"/>`); }
  // A scatter of small stars.
  const r = seeded(4242);
  for (let i = 0; i < 220; i++) {
    const x = 6 + r() * (W - 12), y = 6 + r() * (H - 12), s = r() ** 3 * 1.1 + 0.25;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="${r() < 0.25 ? GOLD : PALE}" opacity="${(0.2 + r() * 0.45).toFixed(2)}"/>`);
  }
  const starsOf = (ci: number) => { const f = FIGURES[CHAPTERS[ci].numeral], b = bands[ci]; return f.stars.map(([x, y]) => ({ x: b.fx + (x / f.w) * b.fw, y: b.fy + (y / f.h) * b.fh })); };
  parts.push('<defs>');
  parts.push(`<radialGradient id="reveal"><stop offset="0.5" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>`);
  CHAPTERS.forEach((c, ci) => {
    const b = bands[ci], all = c.worlds.every((w) => latest.has(w));
    // (Each world made inks the figure round it: a soft circle of it, wider than the globe.)
    parts.push(`<mask id="m${ci}" maskUnits="userSpaceOnUse" x="0" y="${b.y}" width="${W}" height="${b.h}"><rect x="0" y="${b.y}" width="${W}" height="${b.h}" fill="black"/>`);
    starsOf(ci).forEach((p, i) => { if (all || latest.has(c.worlds[i])) parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${all ? 900 : 95}" fill="url(#reveal)"/>`); });
    parts.push('</mask>');
    starsOf(ci).forEach((p, i) => parts.push(`<clipPath id="w${ci}-${i}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12.5"/></clipPath>`));
    starsOf(ci).forEach((p, i) => parts.push(`<clipPath id="u${ci}-${i}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="8"/></clipPath>`));
  });
  parts.push('</defs>');
  CHAPTERS.forEach((c, ci) => {
    const b = bands[ci], f = FIGURES[c.numeral], at = starsOf(ci);
    // Its figure: a pale ghost all along, printed in full where its worlds are made.
    const img = `<image href="${f.src}" x="${b.fx.toFixed(1)}" y="${b.fy.toFixed(1)}" width="${b.fw.toFixed(1)}" height="${b.fh.toFixed(1)}" preserveAspectRatio="none"/>`;
    parts.push(`<g opacity="0.2">${img}</g>`);
    parts.push(`<g mask="url(#m${ci})" opacity="0.92">${img}</g>`);
    // Its name, and the figure's, as the old atlases letter them.
    parts.push(`<text x="16" y="${(b.y + 20).toFixed(1)}" font-size="12.5" font-style="italic" fill="${PALE}" opacity="0.85">${c.numeral} · ${c.title}</text>`);
    parts.push(`<text x="${W - 16}" y="${(b.y + 20).toFixed(1)}" font-size="9" letter-spacing="1.6" text-anchor="end" fill="${GOLD}" opacity="0.7">${f.name.toUpperCase()}</text>`);
    // Its worlds joined, star to star: dotted while still to make, a fine line once both are made.
    for (let i = 1; i < at.length; i++) {
      const both = latest.has(c.worlds[i]) && latest.has(c.worlds[i - 1]);
      parts.push(`<line x1="${at[i - 1].x.toFixed(1)}" y1="${at[i - 1].y.toFixed(1)}" x2="${at[i].x.toFixed(1)}" y2="${at[i].y.toFixed(1)}" stroke="${GOLD}" stroke-width="0.7" ${both ? '' : 'stroke-dasharray="1.5 3"'} opacity="${both ? 0.7 : 0.4}"/>`);
    }
    c.worlds.forEach((id, i) => {
      const p = at[i], page = latest.get(id), w = worldOf(id), x = p.x.toFixed(1), y = p.y.toFixed(1);
      parts.push(`<g data-world="${id}" style="cursor:pointer">`);
      parts.push(`<circle cx="${x}" cy="${y}" r="22" fill="transparent"/>`); // (a touch's width)
      if (page) {
        // Made: the world itself as it was left (or, made before worlds were kept so, a disc in its own colours).
        parts.push(`<circle cx="${x}" cy="${y}" r="12.5" fill="${w.palette.paper}"/>`);
        if (page.portrait) parts.push(`<image href="${page.portrait}" x="${(p.x - 12.5).toFixed(1)}" y="${(p.y - 12.5).toFixed(1)}" width="25" height="25" clip-path="url(#w${ci}-${i})" preserveAspectRatio="xMidYMid slice"/>`);
        else parts.push(`<circle cx="${(p.x + 4).toFixed(1)}" cy="${(p.y + 3).toFixed(1)}" r="9" fill="${w.palette.basalt}" opacity="0.4" clip-path="url(#w${ci}-${i})"/>`);
        parts.push(`<circle cx="${x}" cy="${y}" r="13" fill="none" stroke="${GOLD}" stroke-width="1"/>`);
      } else {
        // Still to play: the world small, in its own colours, lit from the upper left, its night side
        // shaded, ringed in pencil: so every star shows its world, made or not.
        const P = w.palette;
        parts.push(`<circle cx="${x}" cy="${y}" r="8" fill="${P.paper}" opacity="0.92"/>`);
        parts.push(`<circle cx="${(p.x + 3).toFixed(1)}" cy="${(p.y + 2.5).toFixed(1)}" r="7" fill="${P.basalt}" opacity="0.45" clip-path="url(#u${ci}-${i})"/>`);
        parts.push(`<circle cx="${(p.x + 5).toFixed(1)}" cy="${(p.y + 4).toFixed(1)}" r="7.5" fill="${NIGHT}" opacity="0.35" clip-path="url(#u${ci}-${i})"/>`);
        parts.push(`<circle cx="${x}" cy="${y}" r="8.6" fill="none" stroke="${PALE}" stroke-width="0.7" stroke-dasharray="1.5 2" opacity="0.7"/>`);
      }
      if (id === here) parts.push(`<circle cx="${x}" cy="${y}" r="${page ? 17 : 12}" fill="none" stroke="${GOLD}" stroke-width="0.7"/>`);
      parts.push(`<text x="${x}" y="${(p.y + (page ? 25 : 20)).toFixed(1)}" font-size="9" text-anchor="middle" fill="${PALE}" opacity="${page ? 0.9 : 0.55}">${w.numeral}</text>`);
      parts.push('</g>');
    });
  });
  // (Their source, lettered small at the foot, as an engraver signed a plate.)
  parts.push(`<text x="${W / 2}" y="${(H - 12).toFixed(0)}" font-size="8.5" font-style="italic" text-anchor="middle" fill="${PALE}" opacity="0.45">The figures after Bayer's Uranometria, engraved by Alexander Mair, 1603</text>`);
  parts.push('</svg>');
  return parts.join('');
}
