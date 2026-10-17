// The loop the same size every day; a ring drawn while looking closer; where the name sits under it; a new
// tree planted from the grove's empty circle.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2], BASE = process.env.BASE || 'http://localhost:5199';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const bad = []; p.on('pageerror', (e) => bad.push(e.message)); p.on('dialog', (d) => { console.log('asked:', d.message()); void d.accept(); });
  await p.goto(`${BASE}/press.html?fresh`); await sleep(2000);
  await p.mouse.click(195, 397); await sleep(1200);
  const bark = () => p.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2, R: (v.s * window.press.tree.radius) / 2, n: window.press.tree.rings.length }; });
  const loop = async (cx, cy, R) => {
    let a = 0.3; await p.mouse.move(cx + R * Math.cos(a), cy - R * Math.sin(a)); await p.mouse.down();
    for (let k = 0; k < 120; k++) { a += (2 * Math.PI) / 110; await p.mouse.move(cx + R * Math.cos(a), cy - R * Math.sin(a)); await sleep(8); }
    await p.mouse.up();
  };
  const sizes = [];
  for (let d = 0; d < 5; d++) { const g = await bark(); sizes.push(Math.round(g.R)); await loop(g.cx, g.cy, Math.max(g.R, 20) + 34); await sleep(5000); }
  const g = await bark(); sizes.push(Math.round(g.R));
  console.log('bark on the sheet after each day (css px):', sizes.join(', '), '| rings', g.n);
  console.log('name under the slice at y, rings:', await p.evaluate(() => window.press.editionY), (await p.evaluate(() => window.press.tree.rings.length)));
  // Closer, then a ring drawn round it.
  await p.mouse.move(195, 400); for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -60); await sleep(60); }
  await sleep(800);
  const z = await bark(); await loop(z.cx, z.cy, z.R + 30); await sleep(1500);
  console.log('zoomed: bark', Math.round(z.R), '-> rings', (await bark()).n);
  await p.screenshot({ path: out + '/st-zoomdraw.png' });
  await b.close();
  // The grove's empty circle: a new tree.
  const b2 = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const q = await b2.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  q.on('pageerror', (e) => bad.push(e.message)); q.on('dialog', (d) => { console.log('asked:', d.message()); void d.dismiss(); });
  await q.goto(`${BASE}/press.html?demo&grove`); await sleep(5000);
  await q.mouse.move(195, 400); for (let i = 0; i < 30; i++) { await q.mouse.wheel(0, 70); await sleep(50); }
  await sleep(2500);
  console.log('grove words:', await q.evaluate(() => document.getElementById('words').textContent));
  await q.screenshot({ path: out + '/st-grove.png' });
  const nx = await q.evaluate(() => window.press.groveNext());
  await q.mouse.click(nx.x, nx.y); await sleep(500);
  console.log('errors', bad.length ? bad : 'none'); await b2.close();
})();
