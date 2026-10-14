const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2], pick = Number(process.argv[3] ?? 0); // (which wood: 0 oak … 8 olive, swiped to)
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${process.env.BASE || 'http://localhost:5199'}/press.html?fresh`); await sleep(2000);
  console.log('words:', await p.evaluate(() => document.getElementById('words').textContent));
  await p.screenshot({ path: out + '/sd-choose.png' });
  // (Swiped to it, one page at a time, right to left; caught mid-swipe once.)
  for (let i = 0; i < pick; i++) {
    await p.mouse.move(300, 400); await p.mouse.down();
    for (let k = 1; k <= 12; k++) { await p.mouse.move(300 - k * 18, 400); await sleep(16); if (i === 0 && k === 7) await p.screenshot({ path: out + '/sd-swipe.png' }); }
    await p.mouse.up(); await sleep(600);
  }
  console.log('shown:', await p.evaluate(() => window.press.choice));
  await p.screenshot({ path: out + '/sd-shown.png' });
  await p.mouse.click(195, 397); await sleep(500);
  await p.screenshot({ path: out + '/sd-fold.png' });
  await sleep(1500);
  console.log('kind after touching it', pick, ':', await p.evaluate(() => window.press.kind), '|', await p.evaluate(() => document.getElementById('words').textContent));
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
