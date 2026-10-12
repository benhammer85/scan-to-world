const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage();
  const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${BASE}/child.html`); await sleep(1200);
  await p.evaluate(() => indexedDB.deleteDatabase('annulus')); await p.reload(); await sleep(1500);
  console.log('setup shown', await p.evaluate(() => !document.getElementById('setup').hidden));
  await p.fill('input[name=name]', 'Ada'); await p.fill('input[name=birth]', '2025-03-14'); await p.click('button[type=submit]'); await sleep(600);
  await p.mouse.click(195, 400); await sleep(2500);
  const v = await p.evaluate(() => ({ cx: window.press.view.cx / 2, cy: window.press.view.cy / 2, R: window.press.view.s * window.press.tree.radius / 2, n: window.press.tree.rings.length }));
  console.log('planted: rings', v.n);
  let a = 0; const R = v.R + 60;
  await p.mouse.move(v.cx + R, v.cy); await p.mouse.down();
  for (let k = 0; k < 120; k++) { a += (2 * Math.PI) / 110; await p.mouse.move(v.cx + R * Math.cos(a), v.cy - R * Math.sin(a)); await sleep(9); }
  await p.mouse.up(); await sleep(8500);
  console.log('after a day: rings', await p.evaluate(() => window.press.tree.rings.length), '|', await p.evaluate(() => document.getElementById('words').textContent));
  await p.screenshot({ path: out + '/cf-day.png' });
  // kept? reload
  await p.reload(); await sleep(2500);
  console.log('after reload: rings', await p.evaluate(() => window.press.tree.rings.length), '|', await p.evaluate(() => document.getElementById('words').textContent));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#keep-copy')]);
  const file = out + '/ada-copy.json'; await dl.saveAs(file); console.log('copy', dl.suggestedFilename());
  // restore into a fresh store
  await p.evaluate(() => indexedDB.deleteDatabase('annulus')); await p.reload(); await sleep(1500);
  await p.setInputFiles('input[name=file]', file); await sleep(2500);
  console.log('restored: rings', await p.evaluate(() => window.press.tree.rings.length), '|', await p.evaluate(() => document.getElementById('words').textContent));
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
