/**
 * The plate: the finished slice set out as a botanical engraver's plate. A double rule round it, the
 * plate's number, the tree's Latin and common names, the slice itself as large as the plate allows
 * (Fig. 1, a transverse section of the trunk), a scale, and beneath it what the wood records.
 */
import type { TreeSim } from './tree';
import type { Tree } from './trees';
import { drawBark, drawShadow, drawSlice, ink, PAPER, barkThickness, type View } from './draw';

const SERIF = '"Newsreader", "Iowan Old Style", Georgia, serif';
const INK = '#2e2118', FAINT = 'rgba(46,33,24,0.7)';

const ORDINAL = (n: number) => { const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'; return `${n}${s}`; };

/** What the wood records, in a line or two. */
export function recordOf(tree: TreeSim, T: Tree): { subtitle: string; notes: string[]; fate: string } {
  const fires = tree.scars.map((s) => s.year), even = Math.round(100 * tree.evenness);
  const notes = [
    `${tree.surges} surge year${tree.surges === 1 ? '' : 's'}`,
    fires.length ? `fire in the ${fires.map(ORDINAL).join(' and ')} year${fires.length > 1 ? 's' : ''}` : 'no fire',
    tree.cracks.length ? `${tree.cracks.length} frost crack${tree.cracks.length > 1 ? 's' : ''}` : 'no frost crack',
    `even to ${even} parts in a hundred`,
  ];
  const fate = tree.k.endless && tree.cause === 'felled' ? `Felled in its ${ORDINAL(tree.year)} year.`
    : tree.cause === 'old' ? `It fell of age, in its ${ORDINAL(tree.year)} year.`
    : tree.cause === 'cracked' ? `Split by frost, it fell in its ${ORDINAL(tree.year)} year.`
    : tree.cause === 'burnt' ? `Weakened by fire, it fell in its ${ORDINAL(tree.year)} year.`
    : `Starved of light, it fell in its ${ORDINAL(tree.year)} year.`;
  const reached = tree.year >= T.years ? '' : ` (it was to live ${T.years})`;
  return { subtitle: `${T.name}: a section of the trunk at ${tree.year} years${reached}`, notes, fate };
}

export function drawPlate(tree: TreeSim, T: Tree, water: boolean): HTMLCanvasElement {
  const W = 1200, H = 1680, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // A double rule round the plate, heavy outside and fine within.
  g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
  g.lineWidth = 1; g.strokeRect(48, 48, W - 96, H - 96);
  g.textAlign = 'center'; g.fillStyle = FAINT;
  g.font = `20px ${SERIF}`;
  g.fillText(`PLATE ${T.numeral}.`.split('').join(String.fromCharCode(8202)), W / 2, 104);
  g.fillStyle = INK; g.font = `italic 56px ${SERIF}`;
  g.fillText(T.latin, W / 2, 172);
  const rec = recordOf(tree, T);
  g.fillStyle = FAINT; g.font = `22px ${SERIF}`;
  g.fillText(rec.subtitle, W / 2, 212);

  // The slice, as large as the plate allows, the pith in the middle.
  let maxR = tree.k.pith;
  for (const r of tree.rings) for (let i = 0; i < r.length; i += 6) maxR = Math.max(maxR, r[i]);
  for (let i = 0; i < tree.cur.length; i += 6) maxR = Math.max(maxR, tree.outer(i));
  const box = 900, cx = W / 2, cy = 250 + box / 2;
  const v: View = { cx, cy, s: 1, turn: 0, px: 1.5 };
  v.s = (box / 2) / (maxR + barkThickness(tree, { ...v, s: box / 2 / maxR }));
  drawShadow(g, tree, v);
  drawSlice(g, tree, v, { water });
  drawBark(g, tree, v);

  // The figure's number, and a scale in centimetres, as a plate's scale is ruled.
  const footY = cy + box / 2 + 64;
  g.fillStyle = INK; g.font = `italic 22px ${SERIF}`; g.textAlign = 'left';
  g.fillText('Fig. 1.', 96, footY);
  const cm = 10 * v.s, step = maxR > 250 ? 10 : maxR > 60 ? 5 : 1, bar = cm * step * 2, bx = W - 96 - bar;
  g.strokeStyle = INK; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(bx, footY - 6); g.lineTo(bx + bar, footY - 6); g.stroke();
  for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(bx + (bar * k) / 2, footY - 12); g.lineTo(bx + (bar * k) / 2, footY); g.stroke(); }
  g.fillStyle = ink(0.95); g.fillRect(bx, footY - 9, bar / 2, 3);
  g.font = `16px ${SERIF}`; g.textAlign = 'center'; g.fillStyle = FAINT;
  for (let k = 0; k <= 2; k++) g.fillText(`${k * step}`, bx + (bar * k) / 2, footY + 22);
  g.textAlign = 'left'; g.fillText('cm', bx + bar + 8, footY + 22);

  // What the wood records.
  g.textAlign = 'center'; g.fillStyle = INK; g.font = `24px ${SERIF}`;
  g.fillText(rec.notes.join('  ·  '), W / 2, footY + 82);
  g.font = `italic 24px ${SERIF}`; g.fillStyle = FAINT;
  g.fillText(rec.fate, W / 2, footY + 122);
  g.font = `italic 22px ${SERIF}`; g.fillStyle = INK;
  g.fillText(T.fact, W / 2, footY + 210);
  g.font = `18px ${SERIF}`; g.fillStyle = FAINT;
  g.fillText('The decade dots, as on a core: one at each ten years, two at fifty, three at a hundred.', W / 2, H - 92);
  return cv;
}
