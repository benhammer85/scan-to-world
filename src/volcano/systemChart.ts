/**
 * The solar system's chart: the star at the head of the plate and its worlds below it, each on its
 * orbit, drawn as an old orrery plate draws them, in dotted arcs. Each world says its kind and its
 * twist, and what it made once it's been played; a world still to play is pencilled, and touched,
 * it's played. What the last world made, carried to the next, is said at the head. Once every
 * world has been played, the chart goes into the atlas.
 */
import { worldOf } from './worlds';
import { finished, loadSystem, madeCount, nameOf, newSystem, saveSystem, twistOf, type System } from './system';
import { keepPage } from './save';

const INK = '#2e2118', PENCIL = '#a8987f', W = 360;
const SIZE: Record<string, number> = { young: 11, ocean: 10, mars: 8, io: 7, moon: 7, ice: 8, enceladus: 6 };

/** Where each body is on the plate: down from the star along a gentle line, a moon close under its world. */
function layout(sys: System): { x: number; y: number; d: number }[] {
  const out: { x: number; y: number; d: number }[] = [];
  let d = 40;
  for (const b of sys.bodies) {
    d += b.moonOf !== undefined ? 66 : 84;
    const a = 0.12;
    out.push({ x: 48 + d * Math.sin(a), y: 34 + d * Math.cos(a), d });
  }
  return out;
}

function svgOf(sys: System): string {
  const at = layout(sys), h = (at.at(-1)?.y ?? 100) + 60, parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="100%" style="display:block;max-width:520px;margin:0 auto" font-family="Iowan Old Style, Palatino, Georgia, serif">`);
  parts.push(`<rect width="${W}" height="${h}" fill="#f4efe4"/>`);
  // The star, with short rays.
  parts.push(`<circle cx="48" cy="34" r="12" fill="#efe0b0" stroke="${INK}" stroke-width="1.2"/>`);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(`<line x1="${48 + 16 * Math.cos(a)}" y1="${34 + 16 * Math.sin(a)}" x2="${48 + 21 * Math.cos(a)}" y2="${34 + 21 * Math.sin(a)}" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>`);
  }
  sys.bodies.forEach((b, i) => {
    const p = at[i], made = b.made, w = worldOf(b.world), r = b.moonOf !== undefined ? 5 : SIZE[b.world] ?? 8;
    if (b.moonOf === undefined) {
      // Its orbit: an arc round the star, dotted, across the plate.
      const a0 = -0.35, a1 = 1.25, x0 = 48 + p.d * Math.sin(a0), y0 = 34 + p.d * Math.cos(a0), x1 = 48 + p.d * Math.sin(a1), y1 = 34 + p.d * Math.cos(a1);
      parts.push(`<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${p.d} ${p.d} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${PENCIL}" stroke-width="1.1" stroke-dasharray="0.1 5" stroke-linecap="round"/>`);
    } else {
      // A moon: tied to its world by a dotted line, as a chart ties a name to its place.
      const q = at[b.moonOf], qr = SIZE[sys.bodies[b.moonOf].world] ?? 8;
      parts.push(`<line x1="${q.x.toFixed(1)}" y1="${(q.y + qr + 3).toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${(p.y - 8).toFixed(1)}" stroke="${PENCIL}" stroke-width="1.1" stroke-dasharray="0.1 4" stroke-linecap="round"/>`);
    }
    const fill = made?.met ? w.palette.paper : '#f4efe4', stroke = made ? INK : PENCIL;
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"${made ? '' : ' stroke-dasharray="2 2"'}/>`);
    // Not made: struck through, as a surveyor strikes out what wasn't found.
    if (made && !made.met) parts.push(`<line x1="${p.x - r * 0.7}" y1="${p.y + r * 0.7}" x2="${p.x + r * 0.7}" y2="${p.y - r * 0.7}" stroke="${INK}" stroke-width="1"/>`);
    const name = nameOf(sys, i), twist = twistOf(b.twist), tx = p.x + r + 12;
    const status = made ? (made.met ? `made · ${made.words}` : 'not made') : 'touch to go';
    parts.push(`<text paint-order="stroke" stroke="#f4efe4" stroke-width="4" stroke-linejoin="round" x="${tx}" y="${p.y - 4}" font-size="13" font-style="italic" fill="${made ? INK : '#5a4a3a'}">${esc(`${name.numeral} · ${name.title}`)}</text>`);
    parts.push(`<text paint-order="stroke" stroke="#f4efe4" stroke-width="4" stroke-linejoin="round" x="${tx}" y="${p.y + 11}" font-size="11" fill="${INK}" opacity="0.6">${esc(twist.name)}</text>`);
    parts.push(`<text paint-order="stroke" stroke="#f4efe4" stroke-width="4" stroke-linejoin="round" x="${tx}" y="${p.y + 25}" font-size="11" font-style="italic" fill="${INK}" opacity="${made ? 0.75 : 0.5}">${esc(status)}</text>`);
  });
  parts.push('</svg>');
  return parts.join('');
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Open the chart over the page; with no system yet, a new one is begun. */
export function openSystem(): void {
  const box = document.getElementById('system')!;
  let sys = loadSystem();
  if (!sys) { sys = newSystem(1 + Math.floor(Math.random() * 1e9)); saveSystem(sys); }
  render(box, sys);
  box.classList.add('open');
}

function render(box: HTMLElement, sys: System): void {
  const body = box.querySelector('.plate') as HTMLElement, head = box.querySelector('.about') as HTMLElement, foot = box.querySelector('.foot') as HTMLElement;
  const n = sys.bodies.length, made = madeCount(sys), done = finished(sys);
  head.textContent = `round ${sys.star} · ${made} of ${n} ${n === 1 ? 'world' : 'worlds'} made` + (sys.gift ? `. Carried to the next world you play: ${sys.gift.words.replace(/^Given by the last world: /, '')}` : '');
  body.innerHTML = svgOf(sys);
  // Touch a world still to play, anywhere along its line, to play it.
  const at = layout(sys), svg = body.querySelector('svg')!;
  svg.addEventListener('click', (e) => {
    const r = svg.getBoundingClientRect(), k = W / r.width, y = (e.clientY - r.top) * k;
    let best = -1, bd = 30;
    at.forEach((p, i) => { if (!sys.bodies[i].made && Math.abs(p.y - y) < bd) { bd = Math.abs(p.y - y); best = i; } });
    if (best >= 0) location.search = `?run=${best}`;
  });
  svg.style.cursor = done ? 'default' : 'pointer';
  foot.innerHTML = '';
  const again = document.createElement('p');
  again.className = 'again';
  if (done) {
    const p = document.createElement('p');
    p.textContent = `The system is done: ${made} of ${n} worlds made.`;
    foot.appendChild(p);
    again.textContent = 'begin a new solar system';
    again.addEventListener('click', () => begin(box));
    if (!sys.kept) void intoTheAtlas(sys);
  } else {
    // (Begun afresh only on a second touch, so a system half played isn't lost to a slip.)
    again.textContent = 'begin a new solar system instead';
    again.addEventListener('click', () => {
      if (again.dataset.sure) begin(box);
      else { again.dataset.sure = '1'; again.textContent = 'touch again to leave this one and begin anew'; }
    });
  }
  foot.appendChild(again);
}

function begin(box: HTMLElement): void {
  const sys = newSystem(1 + Math.floor(Math.random() * 1e9));
  saveSystem(sys);
  render(box, sys);
}

/** The finished system's chart, kept as a page of the atlas. */
async function intoTheAtlas(sys: System): Promise<void> {
  saveSystem({ ...sys, kept: true });
  const img = new Image(), url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOf(sys).replace('width="100%" style="display:block;max-width:520px;margin:0 auto"', `width="${W * 2}"`));
  await new Promise<void>((resolve) => { img.onload = () => resolve(); img.onerror = () => resolve(); img.src = url; });
  if (!img.width) return;
  const cv = document.createElement('canvas');
  cv.width = 480; cv.height = Math.round((480 * img.height) / img.width);
  const g = cv.getContext('2d')!;
  g.drawImage(img, 0, 0, cv.width, cv.height);
  await keepPage({ world: 'system', numeral: '☉', title: 'A solar system', subtitle: `round ${sys.star}`, summary: `${madeCount(sys)} of ${sys.bodies.length} worlds made`, when: Date.now(), image: cv.toDataURL('image/jpeg', 0.85) });
}

/** Close the chart. */
export function closeSystem(): void {
  document.getElementById('system')!.classList.remove('open');
}
