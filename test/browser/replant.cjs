// The practice: a new tree, nothing asked. A tap on the maker's mark (or the grove's empty circle) goes
// straight to the seeds, the tree drawn so far waiting; drawn back instead, it's as it was; a seed
// touched, it stands in the grove and the new one is planted. And no daily words.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const bad = []; p.on('pageerror', (e) => bad.push(e.message)); p.on('dialog', (d) => { bad.push('asked: ' + d.message()); void d.dismiss(); });
  await p.goto(`${BASE}/press.html`); await sleep(1000);
  await p.evaluate(() => indexedDB.deleteDatabase('annulus')); await p.reload(); await sleep(1500);
  await p.mouse.click(195, 400); await sleep(800);
  const g = await p.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2 }; });
  let a = 0; const R = 70; await p.mouse.move(g.cx + R, g.cy); await p.mouse.down();
  for (let k = 0; k < 120; k++) { a += 2 * Math.PI / 110; await p.mouse.move(g.cx + R * Math.cos(a), g.cy - R * Math.sin(a)); await sleep(9); }
  await p.mouse.up(); await sleep(12000);
  const state = () => p.evaluate(() => ({ rings: window.press.tree.rings.length, parting: window.press.parting, far: +window.press.far.toFixed(2), kind: window.press.kind }));
  console.log('drawn:', JSON.stringify(await state()));
  const [sx, sy] = await p.evaluate(() => window.press.stampAt.map((v) => v / 2));
  await p.mouse.click(sx, sy); await sleep(1500);
  console.log('mark tapped (the seeds):', JSON.stringify(await state()));
  await p.mouse.move(195, 400); for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, 70); await sleep(50); }
  await sleep(2500);
  console.log('drawn back instead:', JSON.stringify(await state()));
  const nx = await p.evaluate(() => window.press.groveNext());
  await p.mouse.click(nx.x, nx.y); await sleep(2000);
  console.log('empty circle tapped:', JSON.stringify(await state()));
  await p.mouse.click(195, 400); await sleep(3000);
  console.log('a seed touched:', JSON.stringify(await state()));
  await p.reload(); await sleep(2500);
  console.log('after reload:', JSON.stringify(await state()), '| grove trees', (await p.evaluate(() => window.press.grove())).length, '| words:', JSON.stringify(await p.evaluate(() => document.getElementById('words').classList.contains('shown') ? document.getElementById('words').textContent : '')));
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
