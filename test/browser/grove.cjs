// The grove: drawn back past the slice (the wheel, as a pinch), the transition caught along the way; an
// older tree touched opens to its slice; double-tapped, back out; today's tree touched, home.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${process.env.BASE || 'http://localhost:5199'}/press.html?demo&grove`); await sleep(6000);
  await p.screenshot({ path: out + '/gr-0.png' });
  await p.mouse.move(195, 400);
  const far = () => p.evaluate(() => window.press.far);
  let shot = 1;
  for (let i = 0; i < 30; i++) {
    await p.mouse.wheel(0, 70); await sleep(60);
    const f = await far();
    if ([6, 12, 18].includes(i)) { await p.screenshot({ path: `${out}/gr-${shot++}.png` }); console.log('far while drawing back', f.toFixed(2)); }
  }
  await sleep(1800);
  console.log('settled at', await far());
  await p.screenshot({ path: out + '/gr-grove.png' });
  // (The older trees off to the left: walked back to, a finger drawing the row along.)
  await p.mouse.move(80, 470); await p.mouse.down();
  for (let k = 1; k <= 20; k++) { await p.mouse.move(80 + k * 14, 470); await sleep(16); }
  await p.mouse.up(); await sleep(500);
  await p.screenshot({ path: out + '/gr-walked.png' });
  const g = await p.evaluate(() => window.press.grove());
  console.log('grove:', g.map((s) => `${s.sp}(${s.n})`).join(' '));
  const ash = g.find((s) => s.sp === 'ash');
  await p.mouse.click(ash.x, (ash.top + ash.base) / 2); await sleep(400);
  await p.screenshot({ path: out + '/gr-opening.png' });
  await sleep(2600);
  console.log('visiting', await p.evaluate(() => window.press.visiting), 'kind', await p.evaluate(() => window.press.kind), 'far', await far(), '|', await p.evaluate(() => document.getElementById('words').textContent));
  await p.screenshot({ path: out + '/gr-ash.png' });
  await p.mouse.click(195, 400); await sleep(120); await p.mouse.click(195, 400); await sleep(2200);
  console.log('after double tap: far', await far(), 'visiting', await p.evaluate(() => window.press.visiting), 'kind', await p.evaluate(() => window.press.kind));
  await p.mouse.move(330, 470); await p.mouse.down();
  for (let k = 1; k <= 20; k++) { await p.mouse.move(330 - k * 14, 470); await sleep(16); }
  await p.mouse.up(); await sleep(500);
  const g2 = await p.evaluate(() => window.press.grove()), me = g2.find((s) => s.i === -1);
  await p.mouse.click(me.x, (me.top + me.base) / 2); await sleep(2200);
  console.log('today touched: far', await far(), 'kind', await p.evaluate(() => window.press.kind));
  await p.screenshot({ path: out + '/gr-home.png' });
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
