/**
 * The chart at the end: what you made, as a plate from an old atlas. The world
 * as it was left, with its islands named on it; the kinds of life it holds; and
 * the eras along the foot, with what happened in each. It's drawn on a canvas of
 * its own, so it can be kept as a picture.
 */
export interface ChartInfo {
  title: string;
  subtitle: string;
  /** Island names, where they are on the globe's canvas (in its pixels). */
  labels: { name: string; x: number; y: number }[];
  kinds: { name: string; ink: string; living: boolean }[];
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
  g.font = `italic 30px ${SERIF}`; g.fillStyle = INK;
  for (const l of info.labels) {
    const x = bx + ((l.x - sx) / side) * box, y = by + ((l.y - sy) / side) * box;
    if (x < bx || x > bx + box || y < by || y > by + box) continue;
    spaced(g, l.name, x, y, 3);
  }

  // What lives there.
  let y = by + box + 60;
  g.font = `italic 30px ${SERIF}`; g.fillStyle = INK;
  g.fillText(info.summary, W / 2, y);
  y += 60;
  const step = (W - 240) / info.kinds.length;
  info.kinds.forEach((k, i) => {
    const x = 120 + step * (i + 0.5);
    g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2);
    g.lineWidth = 2; g.strokeStyle = k.ink;
    if (k.living) { g.fillStyle = k.ink; g.fill(); }
    g.stroke();
    g.font = `20px ${SERIF}`; g.fillStyle = k.living ? INK : FAINT;
    g.fillText(k.name, x, y + 42);
  });

  // The eras along the foot, named beneath the rule, and what happened above it, in rows so
  // that nothing written crowds anything else.
  y += 210;
  const x0 = 110, x1 = W - 110, at = (t: number) => x0 + (x1 - x0) * Math.min(1, t / Math.max(1, info.length));
  g.strokeStyle = INK; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  g.font = `italic 19px ${SERIF}`; g.fillStyle = FAINT;
  for (const e of info.eras) {
    g.beginPath(); g.moveTo(at(e.from), y - 8); g.lineTo(at(e.from), y + 8); g.stroke();
    g.fillText(e.name, (at(e.from) + at(e.to)) / 2, y + 34);
  }
  g.beginPath(); g.moveTo(x1, y - 8); g.lineTo(x1, y + 8); g.stroke();
  g.font = `17px ${SERIF}`;
  const rows: number[] = [];
  for (const e of info.events.slice(0, 14)) {
    const x = Math.max(x0 + 40, Math.min(x1 - 40, at(e.t))), w = g.measureText(e.text).width + 18;
    // The lowest row where this doesn't overlap what's already written.
    let row = 0;
    while (row < rows.length && rows[row] > x - w / 2) row++;
    rows[row] = x + w / 2;
    const ty = y - 26 - row * 26;
    g.strokeStyle = 'rgba(46,33,24,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(at(e.t), y); g.lineTo(at(e.t), ty + 6); g.stroke();
    g.fillStyle = INK;
    g.fillText(e.text, x, ty);
  }
  return cv;
}

/** Text with its letters spaced apart, as maps letter names. */
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number): void {
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + gap * (text.length - 1);
  let cx = x - total / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  [...text].forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + gap; });
  g.textAlign = align;
}
