const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2], pick = Number(process.argv[3] ?? 0); // (which seed: 0 oak … 8 olive, in rows of three)
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${process.env.BASE || 'http://localhost:5199'}/press.html?fresh`); await sleep(2000);
  console.log('words:', await p.evaluate(() => document.getElementById('words').textContent));
  await p.screenshot({ path: out + '/sd-choose.png' });
  await p.mouse.click(195 + ((pick % 3) - 1) * 110, 397 + (Math.floor(pick / 3) - 1) * 120); await sleep(1200);
  console.log('kind after tapping seed', pick, ':', await p.evaluate(() => window.press.kind), '|', await p.evaluate(() => document.getElementById('words').textContent));
  await p.screenshot({ path: out + '/sd-planted.png' });
  const loop = async () => {
    const g = await p.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2, R: v.s * window.press.tree.radius / 2 }; });
    const R = g.R + 34 + 30; let a = 0.3; await p.mouse.move(g.cx + R * Math.cos(a), g.cy - R * Math.sin(a)); await p.mouse.down();
    for (let k = 0; k < 120; k++) { a += 2 * Math.PI / 110; const rr = R + 5 * Math.sin(k / 7); await p.mouse.move(g.cx + rr * Math.cos(a), g.cy - rr * Math.sin(a)); await sleep(8); }
    await p.mouse.up(); return R;
  };
  const sizes = [];
  for (let d = 0; d < 6; d++) { sizes.push(Math.round(await loop())); await sleep(d === 0 ? 9000 : 9000); if (d === 0) await p.screenshot({ path: out + '/sd-day1.png' }); }
  console.log('loop radius each day (css px):', sizes.join(', '));
  await sleep(4000); await p.screenshot({ path: out + '/sd-day6.png' });
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
