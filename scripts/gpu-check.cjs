// Fails if the print can't be pressed on the graphics chip (a shader that won't compile falls back, silently,
// to pressing by hand). Run with the dev server up: node scripts/gpu-check.cjs [url]
// (Playwright from the global install; set CHROME to a Chromium binary if it isn't found on its own.)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:5199/press.html?demo=40&tree=oak&knots=3';
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const bad = [];
  p.on('console', (m) => { if (/pressing by hand/.test(m.text())) bad.push(m.text()); });
  p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(url);
  await p.waitForTimeout(8000);
  await b.close();
  if (bad.length) { console.error('GPU press failed:\n' + bad.join('\n')); process.exit(1); }
  console.log('GPU press ok');
})();
