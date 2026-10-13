// The practice: a tap on the maker's mark (the small stamp at the end of the pencilled line) asks to plant
// a new tree; cancelled, the tree stays; confirmed, the sheet is bare again. And no daily words.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${BASE}/press.html`); await sleep(1000);
  await p.evaluate(() => indexedDB.deleteDatabase('annulus')); await p.reload(); await sleep(1500);
  await p.mouse.click(195, 400); await sleep(800);
  const g = await p.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2 }; });
  let a = 0; const R = 70; await p.mouse.move(g.cx + R, g.cy); await p.mouse.down();
  for (let k = 0; k < 120; k++) { a += 2 * Math.PI / 110; await p.mouse.move(g.cx + R * Math.cos(a), g.cy - R * Math.sin(a)); await sleep(9); }
  await p.mouse.up(); await sleep(12000);
  const rings = () => p.evaluate(() => window.press.tree.rings.length);
  console.log('drawn:', await rings());
  const [sx, sy] = await p.evaluate(() => window.press.stampAt.map((v) => v / 2));
  const hold = async (accept) => {
    p.once('dialog', (d) => { console.log('asked:', d.message()); accept ? d.accept() : d.dismiss(); });
    await p.mouse.click(sx, sy); await sleep(1500);
  };
  await hold(false); console.log('cancelled -> rings', await rings());
  await p.reload(); await sleep(1500); console.log('after reload -> rings', await rings(), '| words:', JSON.stringify(await p.evaluate(() => document.getElementById('words').classList.contains('shown') ? document.getElementById('words').textContent : '')));
  await sleep(4000); await hold(true); await sleep(1500);
  console.log('confirmed -> rings', await rings(), '|', await p.evaluate(() => document.getElementById('words').textContent));
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
