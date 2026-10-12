const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
  const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${BASE}/challenge.html`); await p.waitForTimeout(1500);
  const state = () => p.evaluate(() => { const r = window.press.run; return `rings ${r.rings} score ${r.score} over=${r.over} | hud "${document.getElementById('score').textContent}" | words "${document.getElementById('words').textContent}"`; });
  // finger: distance of the FINGER outside the bark (CSS px); dip: how far in it wanders at one angle.
  const ring = async (finger, dip = 0, steps = 60) => {
    const st = await p.evaluate(() => { const v = window.press.view, t = window.press.tree, w = v.warp; const wr = (r) => { if (!w || !w.beta) return r; const x = r / w.R; return w.R * ((1 - w.beta) * x + w.beta * x ** w.q); }; return { cx: v.cx, cy: v.cy, bark: v.s * wr(t.radius) }; });
    const r = (a) => st.bark + finger - dip * Math.exp(-((a - 4) ** 2) * 6);
    let a = 1; await p.mouse.move(st.cx + r(a) * Math.cos(a), st.cy - r(a) * Math.sin(a)); await p.mouse.down();
    for (let k = 1; k <= steps; k++) { a = 1 + (k / steps) * 2 * Math.PI; await p.mouse.move(st.cx + r(a) * Math.cos(a), st.cy - r(a) * Math.sin(a)); }
    await p.mouse.up(); await sleep(500);
  };
  // 1. Finger set down 12 px outside the edge (its brush 18 px inside), then moving out to draw at 40.
  { const st = await p.evaluate(() => { const v = window.press.view, t = window.press.tree; return { cx: v.cx, cy: v.cy, bark: v.s * t.radius }; });
    let a = 1; const r = (k) => st.bark + 12 + Math.min(1, k / 10) * 28;
    await p.mouse.move(st.cx + r(0) * Math.cos(a), st.cy - r(0) * Math.sin(a)); await p.mouse.down();
    for (let k = 1; k <= 60; k++) { a = 1 + (k / 60) * 2 * Math.PI; await p.mouse.move(st.cx + r(k) * Math.cos(a), st.cy - r(k) * Math.sin(a)); }
    await p.mouse.up(); await sleep(500); }
  console.log('1 set down near the edge:', await state(), '| marks', await p.evaluate(() => 0));
  await ring(38, 20);  console.log('2 dips in once:', await state());
  for (let i = 0; i < 7; i++) await ring(36 + (i % 3) * 3);
  console.log('9 rings:', await state());
  await ring(37); await sleep(1800);
  console.log('10 rings:', await state());
  await p.screenshot({ path: `${out}/chal-end.png` });
  await sleep(500); await p.mouse.click(40, 40); await sleep(500);
  console.log('again:', await state());
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
