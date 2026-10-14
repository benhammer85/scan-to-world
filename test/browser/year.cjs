// A year's tree, finished on its anniversary: standing in the grove, a new seed to choose. Then the whole
// kept as a copy (a file), and taken back.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2], BASE = process.env.BASE || 'http://localhost:5199';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage();
  const bad = []; p.on('pageerror', (e) => bad.push(e.message)); p.on('dialog', (d) => { console.log('asked:', d.message()); void d.accept(); });
  await p.goto(`${BASE}/press.html?fresh`); await sleep(2000);
  await p.mouse.click(195, 397); await sleep(1500);
  const g = await p.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2, R: (v.s * window.press.tree.radius) / 2 }; });
  let a = 0.3; const R = Math.max(g.R, 20) + 34;
  await p.mouse.move(g.cx + R * Math.cos(a), g.cy - R * Math.sin(a)); await p.mouse.down();
  for (let k = 0; k < 120; k++) { a += (2 * Math.PI) / 110; await p.mouse.move(g.cx + R * Math.cos(a), g.cy - R * Math.sin(a)); await sleep(8); }
  await p.mouse.up(); await sleep(2500);
  console.log('drawn: rings', await p.evaluate(() => window.press.tree.rings.length));
  // (A year passes: its first day set back a year and a day, in the store.)
  await p.evaluate(() => new Promise((done) => {
    const r = indexedDB.open('annulus', 1);
    r.onsuccess = () => { const db = r.result, st = db.transaction('kept', 'readwrite').objectStore('kept'), q = st.get('diary');
      q.onsuccess = () => { const k = q.result, d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() - 1);
        k.days = k.days.map(() => d.toISOString().slice(0, 10)); st.put(k, 'diary').onsuccess = () => done(); }; };
  }));
  await p.goto(`${BASE}/press.html`); await sleep(2500);
  console.log('a year on: rings', await p.evaluate(() => window.press.tree.rings.length), '| grove', (await p.evaluate(() => window.press.grove())).length, '|', await p.evaluate(() => document.getElementById('words').textContent));
  await p.screenshot({ path: out + '/yr-after.png' });
  // Plant the next, a ring, then to the grove; a copy kept.
  await p.mouse.click(195, 397); await sleep(1500);
  const g2 = await p.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2, R: (v.s * window.press.tree.radius) / 2 }; });
  a = 0.3; const R2 = Math.max(g2.R, 20) + 34;
  await p.mouse.move(g2.cx + R2 * Math.cos(a), g2.cy - R2 * Math.sin(a)); await p.mouse.down();
  for (let k = 0; k < 120; k++) { a += (2 * Math.PI) / 110; await p.mouse.move(g2.cx + R2 * Math.cos(a), g2.cy - R2 * Math.sin(a)); await sleep(8); }
  await p.mouse.up(); await sleep(3000);
  await p.mouse.move(195, 400); for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, 70); await sleep(50); }
  await sleep(2500); await p.screenshot({ path: out + '/yr-grove.png' });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.mouse.click(195 - 52, 844 - 44)]);
  const file = out + '/yr-copy.json'; await dl.saveAs(file);
  console.log('copy kept:', dl.suggestedFilename(), require('fs').statSync(file).size, 'bytes');
  // Taken back on another device (a fresh browser): a tree planted, a ring, to the grove, the copy chosen.
  await ctx.close();
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }), p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => bad.push(e.message)); p2.on('dialog', (d) => { console.log('asked:', d.message()); void d.accept(); });
  await p2.goto(`${BASE}/press.html`); await sleep(2500);
  console.log('new device: rings', await p2.evaluate(() => window.press.tree.rings.length));
  await p2.mouse.click(195, 397); await sleep(1200);
  const g3 = await p2.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2, R: (v.s * window.press.tree.radius) / 2 }; });
  a = 0.3; const R3 = Math.max(g3.R, 20) + 34;
  await p2.mouse.move(g3.cx + R3 * Math.cos(a), g3.cy - R3 * Math.sin(a)); await p2.mouse.down();
  for (let k = 0; k < 120; k++) { a += (2 * Math.PI) / 110; await p2.mouse.move(g3.cx + R3 * Math.cos(a), g3.cy - R3 * Math.sin(a)); await sleep(8); }
  await p2.mouse.up(); await sleep(3000);
  await p2.mouse.move(195, 400); for (let i = 0; i < 30; i++) { await p2.mouse.wheel(0, 70); await sleep(50); }
  await sleep(2500);
  const fcP = p2.waitForEvent('filechooser'); await sleep(300); await p2.mouse.click(195 + 52, 844 - 44); const fc = await fcP;
  await Promise.all([p2.waitForEvent('load'), fc.setFiles(file)]); await sleep(2500);
  console.log('taken back: rings', await p2.evaluate(() => window.press.tree.rings.length), '| grove', (await p2.evaluate(() => window.press.grove())).length);
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
