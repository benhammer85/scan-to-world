const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:5199';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.goto(`${BASE}/child.html?name=Ada&birth=2024-06-09&demo`); await p.waitForTimeout(3000);
  const links = () => p.evaluate(() => [...document.querySelectorAll('#views a')].filter((a) => !a.hidden).map((a) => a.textContent).join(' · '));
  console.log('this year:', await links());
  await p.click('a[data-view=life]'); await p.waitForTimeout(800); console.log('every year:', await links());
  await p.click('a[data-view=year]'); await p.waitForTimeout(800); console.log('back:', await links());
  await p.goto(`${BASE}/child.html?fresh`); await p.waitForTimeout(1200);
  console.log('listen checked by default:', await p.evaluate(() => document.querySelector('input[name=listen]').checked));
  await p.screenshot({ path: process.argv[2] + '/setup2.png' });
  await b.close();
})();
