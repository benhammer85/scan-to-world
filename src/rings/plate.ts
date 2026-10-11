/**
 * The plate: the finished slice set out as a botanical plate, hand-coloured. A double rule round it,
 * the plate's number, the tree's Latin and common names, the slice itself as large as the plate allows
 * (Fig. 1, a transverse section of the trunk) with all its colour returned and a scale, and beside what
 * the wood records, the whole tree on its hill as it stood (Fig. 2, its habit).
 */
import type { TreeSim } from './tree';
import type { Tree } from './trees';
import { drawBark, drawGhosts, PAPER, barkThickness, type View } from './draw';
import { drawHabit } from './habit';

const SERIF = '"Newsreader", "Iowan Old Style", Georgia, serif';
const INK = '#2e2118', FAINT = 'rgba(46,33,24,0.7)';

const ORDINAL = (n: number) => { const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'; return `${n}${s}`; };
const WEATHERS = ['', 'wet', 'dry', 'windy', 'frosty'];

/** What the wood records, in a line or two. */
export function recordOf(tree: TreeSim, T: Tree): { subtitle: string; notes: string[]; fate: string } {
  const per = tree.k.yearsPerRing, fires = tree.scars.map((s) => s.ring * per);
  const count = (w: number) => tree.ringWeather.filter((x) => x === w).length;
  const weathers = [1, 2, 3, 4].filter((w) => count(w)).map((w) => `${count(w)} ${WEATHERS[w]}`);
  const notes = [
    `${tree.rings.length} rings, each ${per} years’ wood`,
    weathers.length ? `${weathers.join(', ')}` : 'every ring calm',
    fires.length ? `fire on the slope in the ${fires.map(ORDINAL).join(' and ')} year${fires.length > 1 ? 's' : ''}` : 'no fire',
  ];
  return { subtitle: `${T.name}: a section of the trunk at ${tree.year} years`, notes, fate: `Let rest in its ${ORDINAL(Math.max(1, tree.year))} year.` };
}

export function drawPlate(tree: TreeSim, T: Tree): HTMLCanvasElement {
  const W = 1200, H = 1680, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(36, 36, W - 72, H - 72);
  g.lineWidth = 1; g.strokeRect(48, 48, W - 96, H - 96);
  g.textAlign = 'center'; g.fillStyle = FAINT;
  g.font = `20px ${SERIF}`;
  g.fillText(`WELL ROUNDED  ·  PLATE ${T.numeral}.`.split('').join(String.fromCharCode(8202)), W / 2, 104);
  g.fillStyle = INK; g.font = `italic 56px ${SERIF}`;
  g.fillText(T.latin, W / 2, 172);
  const rec = recordOf(tree, T);
  g.fillStyle = FAINT; g.font = `22px ${SERIF}`;
  g.fillText(rec.subtitle, W / 2, 212);

  // Fig. 1: the slice, all its colour returned.
  let maxR = tree.k.pith;
  for (const r of tree.rings) for (let i = 0; i < r.length; i += 6) maxR = Math.max(maxR, r[i]);
  const box = 840, cx = W / 2, cy = 250 + box / 2;
  const v: View = { cx, cy, s: 1, turn: 0, px: 1.5 };
  v.s = (box / 2) / (maxR + barkThickness({ ...v, s: box / 2 / maxR }));
  drawGhosts(g, tree, v, 0.9);
  drawBark(g, tree, v);

  const footY = cy + box / 2 + 56;
  g.fillStyle = INK; g.font = `italic 22px ${SERIF}`; g.textAlign = 'left';
  g.fillText('Fig. 1.', 96, footY);
  const cm = 10 * v.s, step = maxR > 250 ? 10 : maxR > 60 ? 5 : 1, bar = cm * step * 2, bx = W - 96 - bar;
  g.strokeStyle = INK; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(bx, footY - 6); g.lineTo(bx + bar, footY - 6); g.stroke();
  for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(bx + (bar * k) / 2, footY - 12); g.lineTo(bx + (bar * k) / 2, footY); g.stroke(); }
  g.font = `16px ${SERIF}`; g.textAlign = 'center'; g.fillStyle = FAINT;
  for (let k = 0; k <= 2; k++) g.fillText(`${k * step}`, bx + (bar * k) / 2, footY + 22);
  g.textAlign = 'left'; g.fillText('cm', bx + bar + 8, footY + 22);

  // Fig. 2: the habit, the whole oak on its hill in high summer, as it stood.
  const hb = { x: 96, y: footY + 54, w: 360, h: 250 };
  drawHabit(g, hb, { age: tree.year, season: 0.3, weather: 0, now: 0, coming: 0, gather: 0, fire: 0, fireComing: 0, wind: 0, time: 0, fallen: 0, water: true, seed: tree.seed, px: 1.5 });
  g.fillStyle = INK; g.font = `italic 22px ${SERIF}`; g.textAlign = 'left';
  g.fillText('Fig. 2. Habit.', hb.x, hb.y + hb.h + 34);

  const tx = hb.x + hb.w + 56;
  g.font = `23px ${SERIF}`; g.fillStyle = INK;
  rec.notes.forEach((n, i) => g.fillText(n, tx, hb.y + 30 + i * 36));
  g.font = `italic 23px ${SERIF}`; g.fillStyle = FAINT;
  g.fillText(rec.fate, tx, hb.y + 30 + rec.notes.length * 36 + 18);
  g.textAlign = 'center'; g.font = `italic 21px ${SERIF}`; g.fillStyle = INK;
  g.fillText('Each ring runs spring green to autumn sienna, the way its stroke went; the weather mixed its colours in.', W / 2, H - 128);
  g.font = `18px ${SERIF}`; g.fillStyle = FAINT;
  g.fillText('The decade dots, as on a core: one at each ten years, two at fifty, three at a hundred.', W / 2, H - 88);
  return cv;
}
