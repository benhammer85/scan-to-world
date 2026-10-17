// The choosing slices, pressed by the app itself: run with the dev server on :5199, then crop to ink (see README).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const out = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const k of ['oak','ash','cherry','maple','birch','pine','redwood','bristlecone','olive','fir','juniper']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await p.goto(`http://localhost:5199/press.html?demo=60&tree=${k}&seed=${1000 + ['oak','ash','cherry','maple','birch','pine','redwood','bristlecone','olive','fir','juniper'].indexOf(k) * 7919}`);
    await p.waitForFunction(() => window.press && window.press.tree.rings.length > 40, null, { timeout: 90000 });
    await p.waitForTimeout(2500); // (the real wood loaded)
    const url = await p.evaluate(() => window.press.print());
    fs.writeFileSync(`${out}/${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(k); await p.close();
  }
  await b.close();
})();
