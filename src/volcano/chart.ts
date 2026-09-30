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
}

const PAPER = '#f4efe4', INK = '#2e2118', FAINT = 'rgba(46,33,24,0.45)';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

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
  y += 60;
  const step = (W - 240) / info.kinds.length;
  info.kinds.forEach((k, i) => {
    const x = 120 + step * (i + 0.5);
    g.globalAlpha = k.living ? 1 : 0.3;
    sign(g, k.sign, x, y, 13, k.ink);
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
function drawTimeline(g: CanvasRenderingContext2D, info: ChartInfo, x0: number, x1: number, y: number, k: number): void {
  const at = (t: number) => x0 + (x1 - x0) * Math.min(1, t / Math.max(1, info.length));
  g.textAlign = 'center';
  g.strokeStyle = INK; g.lineWidth = 1.5 * k;
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  g.font = `italic ${19 * k}px ${SERIF}`; g.fillStyle = FAINT;
  for (const e of info.eras) {
    g.beginPath(); g.moveTo(at(e.from), y - 8 * k); g.lineTo(at(e.from), y + 8 * k); g.stroke();
    g.fillText(e.name, (at(e.from) + at(e.to)) / 2, y + 34 * k);
  }
  g.beginPath(); g.moveTo(x1, y - 8 * k); g.lineTo(x1, y + 8 * k); g.stroke();
  g.font = `${17 * k}px ${SERIF}`;
  const rows: number[] = [];
  for (const e of info.events.slice(0, 14)) {
    const x = Math.max(x0 + 40 * k, Math.min(x1 - 40 * k, at(e.t))), w = g.measureText(e.text).width + 18 * k;
    let row = 0;
    while (row < rows.length && rows[row] > x - w / 2) row++;
    if (row >= 4) continue; // no room left above the rule here: better unsaid than crowded
    rows[row] = x + w / 2;
    const ty = y - 26 * k - row * 26 * k;
    g.strokeStyle = 'rgba(46,33,24,0.25)'; g.lineWidth = 1 * k;
    g.beginPath(); g.moveTo(at(e.t), y); g.lineTo(at(e.t), ty + 6 * k); g.stroke();
    g.fillStyle = INK;
    g.fillText(e.text, x, ty);
  }
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
  g.fillText(info.summary, w / 2, foot - 140 * k);
  drawTimeline(g, info, 34 * k, w - 34 * k, foot - 44 * k, 0.62 * k);
  g.globalAlpha = 1;
}

/** A kind's conventional sign, as the page draws it, at a size (half its width). */
export function sign(g: CanvasRenderingContext2D, name: Sign, x: number, y: number, r: number, ink: string, width?: number): void {
  drawSign(g, name, x, y, r, ink, width);
}
