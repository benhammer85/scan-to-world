const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${BASE}/press.html?seed=3&fresh`); await p.waitForTimeout(1500); await p.mouse.click(195, 400); await p.waitForTimeout(800);
  const geo = () => p.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2 }; });
  // A wide, hand-drawn circle (90 CSS px out), stopping `share` of the way round, starting at angle a0.
  const circle = async (share, a0, extra = 45) => {
    const g = await geo(); const rad = (await p.evaluate(() => window.press.view.s * window.press.tree.radius / 2)) + extra; let a = a0;
    await p.mouse.move(g.cx + rad * Math.cos(a), g.cy - rad * Math.sin(a)); await p.mouse.down();
    const n = Math.round(300 * share);
    for (let k = 0; k < n; k++) { a += (2 * Math.PI) / 300; await p.mouse.move(g.cx + (rad + 4 * Math.sin(k / 9)) * Math.cos(a), g.cy - (rad + 4 * Math.sin(k / 9)) * Math.sin(a)); await sleep(12); }
    await p.mouse.up(); await sleep(400);
  };
  const rings = () => p.evaluate(() => window.press.tree.rings.length);
  await circle(0.93, 1.5);
  console.log('stopped 7% short and lifted -> rings', await rings(), 'phase', await p.evaluate(() => window.press.phase));
  await sleep(3500);
  await circle(0.45, 0.2);
  console.log('half a circle, lifted -> rings', await rings(), 'resting', await p.evaluate(() => window.press.tree.resting));
  await circle(1.0, 3.6);
  console.log('then a whole circle begun somewhere else -> rings', await rings());
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
