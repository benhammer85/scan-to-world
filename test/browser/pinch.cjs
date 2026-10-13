const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(); const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${process.env.BASE || 'http://localhost:5199'}/press.html?seed=21&demo`); await sleep(5000);
  const v = await p.evaluate(() => ({ cx: window.press.view.cx / 2, cy: window.press.view.cy / 2 }));
  // zoom in with the wheel, about the slice's left part, and let it press again
  await p.mouse.move(v.cx - 60, v.cy); for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -250); await sleep(50); }
  await sleep(2500); await p.screenshot({ path: process.argv[2] + '/pz-in.png' });
  // now a real two-finger pinch out, via touch events through CDP
  const cdp = await ctx.newCDPSession(p);
  const t = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195 - d, y: 420, id: 1 }, { x: 195 + d, y: 420, id: 2 }] });
  await t('touchStart', 150);
  for (let d = 150; d > 40; d -= 10) { await t('touchMove', d); await sleep(16); }
  await p.screenshot({ path: process.argv[2] + '/pz-mid.png' });
  await t('touchEnd', 0); await sleep(1500); await p.screenshot({ path: process.argv[2] + '/pz-after.png' });
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
