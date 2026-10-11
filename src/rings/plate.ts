/**
 * The plate (Well Rounded's keepsake): the finished slice set out as a botanical engraver's plate. A double rule round it, the
 * plate's number, the tree's Latin and common names, the slice itself as large as the plate allows
 * (Fig. 1, a transverse section of the trunk) with a scale; then the tree drawn at each age it
 * reached (Figs. 2 and on, as a plate of about 1838 drew a tree at its ages); and what the wood records.
 */
import type { TreeSim } from './tree';
import type { Tree } from './trees';
import { drawBark, drawPaper, drawShadow, drawSlice, ink, PAPER, barkThickness, type View } from './draw';
import { Paper } from './paint';
import { MILESTONES, drawFigure } from './oak';
import { stageAt } from './plates';

const SERIF = '"Newsreader", "Iowan Old Style", Georgia, serif';
const INK = '#2e2118', FAINT = 'rgba(46,33,24,0.7)';

const ORDINAL = (n: number) => { const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'; return `${n}${s}`; };

/** What the wood records, in a line or two. */
export function recordOf(tree: TreeSim, T: Tree): { subtitle: string; notes: string[]; fate: string } {
  const per = tree.k.yearsPerRing, fires = tree.scars.map((s) => s.ring * per), even = Math.round(100 * tree.evenness);
  const wounds = new Set(tree.wounds.map((w) => w.ring)).size;
  const years = (kind: number) => tree.ringWeather.filter((w) => w === kind).length * per;
  const wet = years(1), dry = years(2), bled = tree.bleeds.filter(Boolean).length;
  void even; void wounds;
  const notes = [
    `${tree.rings.length} rings, each ${per} years’ wood`,
    [wet ? `${wet} years of rain` : '', dry ? `${dry} of drought` : ''].filter(Boolean).join(', ') || 'calm years throughout',
    fires.length ? `fire in the ${fires.map(ORDINAL).join(' and ')} year${fires.length > 1 ? 's' : ''}` : 'no fire',
    bled ? `${bled} ring${bled > 1 ? 's' : ''} laid wet-in-wet` : 'every ring left to dry',
  ];
  const fate = tree.cause === 'felled' || tree.k.endless ? `Kept in its ${ORDINAL(tree.year)} year.`
    : tree.cause === 'old' ? `It fell of age, in its ${ORDINAL(tree.year)} year.`
    : tree.cause === 'withered' ? `Its wood dead round half its girth, it fell in its ${ORDINAL(tree.year)} year.`
    : `Starved, it fell in its ${ORDINAL(tree.year)} year.`;
  return { subtitle: `${T.name}: a section of the trunk at ${tree.year} years`, notes, fate };
}

export function drawPlate(tree: TreeSim, T: Tree, water: boolean): HTMLCanvasElement {
  const W = 1200, H = 1900, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  // A double rule round the plate, heavy outside and fine within.
  g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
  g.lineWidth = 1; g.strokeRect(48, 48, W - 96, H - 96);
  g.textAlign = 'center'; g.fillStyle = FAINT;
  g.font = `20px ${SERIF}`;
  g.fillText(`WELL ROUNDED.   PLATE ${T.numeral}.`.split('').join(String.fromCharCode(8202)), W / 2, 104);
  g.fillStyle = INK; g.font = `italic 56px ${SERIF}`;
  g.fillText(T.latin, W / 2, 172);
  const rec = recordOf(tree, T);
  g.fillStyle = FAINT; g.font = `22px ${SERIF}`;
  g.fillText(rec.subtitle, W / 2, 212);

  // Fig. 1: the slice, as large as the plate allows, the pith in the middle.
  let maxR = tree.k.pith;
  for (const r of tree.rings) for (let i = 0; i < r.length; i += 6) maxR = Math.max(maxR, r[i]);
  const box = 840, cx = W / 2, cy = 250 + box / 2;
  const v: View = { cx, cy, s: 1, turn: 0, px: 1.5 };
  v.s = (box / 2) / (maxR + barkThickness(tree, { ...v, s: box / 2 / maxR }));
  drawShadow(g, tree, v);
  // (Watercolour: the whole tree painted again on a fresh sheet, true to scale, ring by ring.)
  let wash: ((g: CanvasRenderingContext2D) => void) | undefined;
  let heart: ((g: CanvasRenderingContext2D) => void) | undefined;
  if (water) { const p = new Paper(560); p.fit(undefined, maxR * 1.02); p.bake(tree); wash = (h) => p.draw(h, v); heart = (h) => p.heartwood(h, tree, v); }
  drawSlice(g, tree, v, { water, wash });
  if (water && heart) heart(g);
  drawBark(g, tree, v);

  // Its number, and a scale in centimetres, as a plate's scale is ruled.
  const footY = cy + box / 2 + 56;
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

  // Figs. 2 and on: the tree at each age it reached, as a plate of about 1838 drew a tree at its ages,
  // and as it stood when it was kept.
  const ages = MILESTONES.filter((a) => a <= tree.year);
  if (tree.year >= 10 && stageAt(tree.year).stage !== stageAt(ages[ages.length - 1] ?? -1).stage) ages.push(tree.year);
  const rowY = footY + 300, cell = (W - 192) / Math.max(1, ages.length);
  ages.forEach((age, k) => {
    const x = 96 + cell * (k + 0.5), size = Math.min(cell * 0.95, 250);
    drawFigure(g, x, rowY, size, age, { px: 1.5, caption: false });
    g.fillStyle = INK; g.textAlign = 'center'; g.font = `italic 19px ${SERIF}`;
    g.fillText(`Fig. ${k + 2}.`, x, rowY + 34);
    g.fillStyle = FAINT; g.font = `17px ${SERIF}`;
    g.fillText(age === tree.year && !MILESTONES.includes(age) ? `as kept, at ${age} years` : `at ${age} years`, x, rowY + 58);
    g.font = `italic 14px ${SERIF}`;
    g.fillText(stageAt(age).stage.credit, x, rowY + 80);
  });

  // What the wood records, beneath.
  const ny = rowY + (ages.length ? 136 : 0);
  g.font = `23px ${SERIF}`; g.fillStyle = INK; g.textAlign = 'center';
  for (let k = 0; k < rec.notes.length; k += 2) g.fillText(rec.notes.slice(k, k + 2).join('   ·   '), W / 2, ny + (k / 2) * 36);
  g.font = `italic 23px ${SERIF}`; g.fillStyle = FAINT;
  g.fillText(rec.fate, W / 2, ny + Math.ceil(rec.notes.length / 2) * 36 + 16);
  g.textAlign = 'center'; g.font = `italic 21px ${SERIF}`; g.fillStyle = INK;
  g.fillText(T.fact.split('.')[0] + '.', W / 2, H - 128);
  g.font = `18px ${SERIF}`; g.fillStyle = FAINT;
  g.fillText('The decade dots, as on a core: one at each ten years, two at fifty, three at a hundred.', W / 2, H - 88);
  if (water) drawPaper(g, W, H);
  return cv;
}
