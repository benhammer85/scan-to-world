/**
 * The chart at the end: what you made, as a plate from an old atlas. The world
 * as it was left; the kinds of life it holds, by their signs; and the eras
 * along the foot, with what happened in each.
 *
 * It's drawn twice. `drawFrame` draws it round the live world on the page, a
 * pen going round the border and the rest coming in after, so the world simply
 * becomes its chart. `drawChart` sets it out as a plate on a canvas of its
 * own, so it can be kept as a picture.
 */
import { drawSign, type Sign } from '../render/signs';

export interface ChartInfo {
  title: string;
  subtitle: string;
  kinds: { name: string; ink: string; sign: Sign; living: boolean }[];
  summary: string;
  /** The game's length in seconds, its eras, and what happened when. */
  length: number;
  eras: { name: string; from: number; to: number }[];
  events: { t: number; text: string }[];
  /**
   * The aim's story, for a band along the rule: how far it had come over the fire (0 to 1), drawn as a
   * wash rising in the world's own pigment; or, on the orange Earth, the sky's own colour, orange to blue.
   */
  story?: {
    samples: { t: number; v: number; sky: number; n?: number }[];
    /** sky: the orange Earth's sky; gradient: the world's colour from `from` to `to` as the aim came on; count: a mark (`shape`) for each counted; rise: a wash rising. */
    kind: 'sky' | 'gradient' | 'count' | 'rise';
    ink: string;
    from?: string;
    to?: string;
    shape?: 'dome' | 'ring' | 'rafts' | 'streak' | 'wave' | 'dot';
  };
  /** How it was done (see marks.ts): each mark, earned or not. Only when the aim was met. */
  marks?: { name: string; got: boolean }[];
}

const PAPER = '#f4efe4', INK = '#2e2118', FAINT = 'rgba(46,33,24,0.45)';
const SERIF = '"Newsreader", "Iowan Old Style", Georgia, serif';

export function drawChart(globe: HTMLCanvasElement, info: ChartInfo): HTMLCanvasElement {
  const W = 1200, H = 1680;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // A double rule round the plate.
  g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
  g.lineWidth = 1; g.strokeRect(48, 48, W - 96, H - 96);

  g.textAlign = 'center'; g.fillStyle = INK;
  g.font = `italic 58px ${SERIF}`;
  g.fillText(info.title, W / 2, 140);
  g.font = `22px ${SERIF}`; g.fillStyle = FAINT;
  g.fillText(info.subtitle, W / 2, 180);

  // The world: the middle of the globe's picture, as large as the plate allows.
  const side = Math.min(globe.width, globe.height), sx = (globe.width - side) / 2, sy = (globe.height - side) / 2;
  const box = 960, bx = (W - box) / 2, by = 210;
  g.drawImage(globe, sx, sy, side, side, bx, by, box, box);

  // What lives there.
  let y = by + box + 60;
  g.font = `italic 30px ${SERIF}`; g.fillStyle = INK;
  g.fillText(info.summary, W / 2, y);
  if (info.marks) { y += 46; drawMarks(g, info.marks, W / 2, y, 1.6); }
  y += 60;
  const step = (W - 240) / info.kinds.length;
  info.kinds.forEach((k, i) => {
    const x = 120 + step * (i + 0.5);
    g.globalAlpha = k.living ? 1 : 0.3;
    // (A swatch of its colour, as a watercolourist's key: the kinds are washes on the map, not signs.)
    g.fillStyle = k.ink; g.globalAlpha *= 0.75;
    g.beginPath(); g.ellipse(x, y, 15, 11, -0.3, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    g.font = `20px ${SERIF}`; g.fillStyle = k.living ? INK : FAINT;
    g.fillText(k.name, x, y + 42);
  });

  drawTimeline(g, info, 110, W - 110, y + 210, 1);
  return cv;
}

/**
 * The eras along a rule, named beneath it, and what happened above it in rows, so that nothing
 * written crowds anything else. `k` scales the lettering (1 for the plate's).
 */
function drawTimeline(g: CanvasRenderingContext2D, info: ChartInfo, x0: number, x1: number, y: number, k: number, most = 4): void {
  const at = (t: number) => x0 + (x1 - x0) * Math.min(1, t / Math.max(1, info.length));
  g.textAlign = 'center';
  // The band: the aim's story along the rule, as a strip of wash (see drawBand), with what happened set above it.
  const band = info.story && info.story.samples.length > 1 ? (info.story.kind === 'sky' || info.story.kind === 'gradient' ? 20 : info.story.kind === 'count' ? 28 : 36) * k : 0; // (a rising wash needs height to be read)
  if (band) drawBand(g, info.story!, info.length, x0, x1, y - band, y, k);
  g.strokeStyle = INK; g.lineWidth = 1.5 * k;
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  for (const x of [x0, x1]) { g.beginPath(); g.moveTo(x, y - 6 * k); g.lineTo(x, y + 6 * k); g.stroke(); }
  // (Only the fire's start and its length beneath it: the eras' names said little, and filled half the rule with nothing.)
  g.font = `italic ${15 * k}px ${SERIF}`; g.fillStyle = FAINT;
  const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  g.textAlign = 'left'; g.fillText('0:00', x0, y + 24 * k);
  g.textAlign = 'right'; g.fillText(mm(info.length), x1, y + 24 * k);
  g.textAlign = 'center';
  g.font = `${17 * k}px ${SERIF}`;
  const rows: number[] = [];
  for (const e of info.events.slice(0, 14)) {
    const x = Math.max(x0 + 40 * k, Math.min(x1 - 40 * k, at(e.t))), w = g.measureText(e.text).width + 18 * k;
    let row = 0;
    while (row < rows.length && rows[row] > x - w / 2) row++;
    if (row >= (info.story?.kind === 'rise' && band ? Math.max(1, most - 1) : most)) continue; // no room left above the rule here (a row fewer over the taller band): better unsaid than crowded
    rows[row] = x + w / 2;
    const ty = y - band - 18 * k - row * 26 * k;
    g.strokeStyle = 'rgba(46,33,24,0.25)'; g.lineWidth = 1 * k;
    g.beginPath(); g.moveTo(at(e.t), y - band); g.lineTo(at(e.t), ty + 6 * k); g.stroke();
    g.fillStyle = INK;
    g.fillText(e.text, x, ty);
  }
}

/**
 * The aim's story as a strip of watercolour from top to bottom: on the orange Earth the sky's colour at each moment,
 * from its orange haze to blue; elsewhere a wash in the world's pigment rising from the rule as the aim came on,
 * a little darker along its top, where the pigment pooled. Its edges a little ragged, as a brush leaves them.
 */
function drawBand(g: CanvasRenderingContext2D, story: NonNullable<ChartInfo['story']>, length: number, x0: number, x1: number, top: number, bottom: number, k: number): void {
  const S = story.samples, at = (t: number) => x0 + (x1 - x0) * Math.min(1, t / Math.max(1, length));
  const valueAt = (t: number, f: (p: (typeof S)[number]) => number) => {
    if (t <= S[0].t) return f(S[0]);
    for (let i = 1; i < S.length; i++) if (S[i].t >= t) { const a = S[i - 1], b = S[i], u = (t - a.t) / Math.max(1e-6, b.t - a.t); return f(a) + (f(b) - f(a)) * u; }
    return f(S[S.length - 1]);
  };
  const rag = (x: number, seed: number) => (Math.sin(x * 0.11 + seed) + Math.sin(x * 0.037 + seed * 2.3) * 0.7) * 1.2 * k;
  const step = Math.max(1, 2 * k), h = bottom - top;
  g.save();
  const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  if (story.kind === 'count') {
    // A mark for each, where it came, drawn as what it is; a faint wash under them all along the fire.
    g.globalAlpha = 0.12; g.fillStyle = story.ink; g.fillRect(x0, bottom - h * 0.18, at(S[S.length - 1].t) - x0, h * 0.18);
    let had = 0;
    const r = h * 0.4, cy = bottom - h * 0.5;
    for (const p of S) {
      const n = Math.floor((p.n ?? 0) + 1e-6);
      for (; had < n; had++) {
        const x = at(p.t), [cr, cg, cb] = hex(story.ink);
        g.globalAlpha = 1; g.fillStyle = `rgba(${cr},${cg},${cb},0.55)`; g.strokeStyle = `rgba(${cr},${cg},${cb},0.85)`; g.lineWidth = 1.3 * k;
        switch (story.shape) {
          case 'dome': g.beginPath(); g.ellipse(x, bottom, r * 1.2, r * 1.3, 0, Math.PI, 0); g.fill(); g.stroke(); break; // (flat-topped, standing on the rule)
          case 'ring': g.beginPath(); g.arc(x, cy, r, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, cy, r * 0.35, 0, Math.PI * 2); g.fill(); break;
          case 'rafts': for (let i = 0; i < 4; i++) { g.save(); g.translate(x + (i % 2 - 0.5) * r * 0.9, cy + (i < 2 ? -0.45 : 0.45) * r); g.rotate(0.3 + i * 0.7); g.fillRect(-r * 0.32, -r * 0.24, r * 0.64, r * 0.48); g.restore(); } break;
          case 'streak': g.lineWidth = 3 * k; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - r * 0.3, cy + r * 0.5); g.lineTo(x + r * 1.4, cy - r * 0.6); g.stroke(); break;
          case 'wave': for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(x, bottom, r * 0.4 * i, Math.PI, 0); g.stroke(); } break;
          default: g.beginPath(); g.arc(x, cy, r * 0.45, 0, Math.PI * 2); g.fill();
        }
      }
    }
  } else if (story.kind === 'sky' || story.kind === 'gradient') {
    // (The orange Earth by its sky, orange to blue; the others from their colour before to after, by how far the aim had come.)
    const orange = story.kind === 'sky' ? [233, 164, 106] : hex(story.to!), blue = story.kind === 'sky' ? [150, 184, 212] : hex(story.from!);
    for (let x = x0; x < x1; x += step) {
      const t = ((x - x0) / (x1 - x0)) * length, haze = Math.max(0, Math.min(1, story.kind === 'sky' ? valueAt(t, (p) => p.sky) : valueAt(t, (p) => p.v)));
      const c = blue.map((b, i) => Math.round(b + (orange[i] - b) * haze));
      g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.62)`;
      g.fillRect(x, top + rag(x, 1), step + 0.5, h - rag(x, 1)); // (its foot on the rule, its top as the brush left it)
    }
  } else {
    g.fillStyle = story.ink;
    g.globalAlpha = 0.38;
    g.beginPath(); g.moveTo(x0, bottom);
    const last = at(S[S.length - 1].t);
    for (let x = x0; x <= last; x += step) { const t = ((x - x0) / (x1 - x0)) * length; g.lineTo(x, bottom - Math.max(0.5 * k, valueAt(t, (p) => p.v) * h + rag(x, 2) * 0.4)); }
    g.lineTo(last, bottom); g.closePath(); g.fill();
    // The pooled top edge.
    g.globalAlpha = 0.55; g.strokeStyle = story.ink; g.lineWidth = 1.4 * k;
    g.beginPath();
    for (let x = x0; x <= last; x += step) { const t = ((x - x0) / (x1 - x0)) * length, yy = bottom - Math.max(0.5 * k, valueAt(t, (p) => p.v) * h + rag(x, 2) * 0.4); if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy); }
    g.stroke();
  }
  g.restore();
}

/**
 * The chart drawn round the live world, on a transparent canvas over it (in device pixels, `k`
 * to a CSS pixel): the double rule of a plate's border drawn as a pen would go round it, then
 * the subtitle, the summary and the eras coming in. `progress` runs from 0 to 1 over the drawing.
 * The title is the page's own, and the key of the kinds is the page's own, at the foot.
 */
export function drawFrame(g: CanvasRenderingContext2D, w: number, h: number, k: number, info: ChartInfo, progress: number, footRoom: number): void {
  g.clearRect(0, 0, w, h);
  // The border, drawn round from the top middle, outer rule then inner.
  const rule = (inset: number, width: number, upto: number) => {
    const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset, pw = x1 - x0, ph = y1 - y0;
    const total = 2 * (pw + ph);
    let left = Math.max(0, Math.min(1, upto)) * total;
    const pts: [number, number][] = [[w / 2, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0], [w / 2, y0]];
    g.strokeStyle = INK; g.lineWidth = width * k; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && left > 0; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], seg = Math.hypot(bx - ax, by - ay), f = Math.min(1, left / seg);
      g.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f);
      left -= seg;
    }
    g.stroke();
  };
  rule(10 * k, 1.6, progress * 1.6);
  rule(16 * k, 0.7, progress * 1.6 - 0.35);
  const later = Math.max(0, Math.min(1, (progress - 0.55) / 0.45));
  if (later <= 0) return;
  g.globalAlpha = later;
  g.textAlign = 'center';
  g.font = `${12 * k}px ${SERIF}`; g.fillStyle = FAINT;
  g.fillText(info.subtitle, w / 2, 70 * k);
  const foot = h - footRoom * k;
  g.font = `italic ${15 * k}px ${SERIF}`; g.fillStyle = INK;
  // (Wrapped to the plate's width, a line to each part of it, the last line where the one line was:
  // on a phone, one long line ran off both sides.)
  const lines = wrap(g, info.summary, w - 72 * k);
  lines.forEach((line, i) => g.fillText(line, w / 2, foot - 140 * k - (lines.length - 1 - i) * 21 * k));
  // (The marks under it, between it and what happened.)
  if (info.marks) drawMarks(g, info.marks, w / 2, foot - 112 * k, k, w - 72 * k);
  drawTimeline(g, info, 34 * k, w - 34 * k, foot - 44 * k, 0.62 * k, info.marks ? 3 : 4); // (a row fewer under the marks)
  g.globalAlpha = 1;
}

/**
 * The stars in a row, centred on x: each a small five-pointed star, filled when it was earned, drawn
 * open when not, and its name beside it, faint when not earned.
 */
function drawMarks(g: CanvasRenderingContext2D, marks: { name: string; got: boolean }[], x: number, y: number, k: number, most = Infinity): void {
  g.save();
  g.font = `${12 * k}px ${SERIF}`;
  // (Narrow, all of it smaller, to fit in one row.)
  const wide = marks.reduce((a, m) => a + g.measureText(m.name).width + 14 * k, 0) + 18 * k * (marks.length - 1);
  k *= Math.min(1, most / wide);
  const size = 12 * k, gap = 18 * k, r = 4 * k;
  g.font = `${size}px ${SERIF}`;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const widths = marks.map((m) => g.measureText(m.name).width + r * 2 + 6 * k);
  let at = x - (widths.reduce((a, b) => a + b, 0) + gap * (marks.length - 1)) / 2;
  marks.forEach((m, i) => {
    const cx = at + r, ink = m.got ? INK : FAINT;
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 0.9 * k;
    g.beginPath();
    for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + (j * Math.PI) / 5, rr = j % 2 ? r * 0.5 : r * 1.25; g.lineTo(cx + rr * Math.cos(a), y + rr * Math.sin(a)); }
    g.closePath();
    if (m.got) g.fill(); else g.stroke();
    g.fillText(m.name, at + r * 2 + 6 * k, y + 0.5 * k);
    at += widths[i] + gap;
  });
  g.restore();
}

/** Text broken into lines no wider than `width`: at its parts (" · ") first, then between words. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const part of text.split(' · ')) {
    let line = '';
    for (const word of part.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > width) { out.push(line); line = word; } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

/** A kind's conventional sign, as the page draws it, at a size (half its width). */
export function sign(g: CanvasRenderingContext2D, name: Sign, x: number, y: number, r: number, ink: string, width?: number): void {
  drawSign(g, name, x, y, r, ink, width);
}
