const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = process.argv[2], shape = process.argv[3] || 'lobes', skill = Number(process.argv[4] || 1);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage(); const bad = []; p.on('pageerror', (e) => bad.push(e.message));
  await p.goto(`${process.env.BASE || 'http://localhost:5199'}/puzzle.html?shape=${shape}`); await sleep(2000);
  console.log('start:', await p.evaluate(() => document.getElementById('words').textContent));
  await p.screenshot({ path: `${out}/pu-${shape}-0.png` });
  // a player who aims each ring a share of the way from the bark to the target (skill 1: well judged)
  for (let ring = 0; ring < 8; ring++) {
    const g = await p.evaluate(() => { const v = window.press.view; return { cx: v.cx / 2, cy: v.cy / 2, s: v.s / 2 }; });
    const tr = await p.evaluate((n) => { const t = window.press.tree, K = 240, last = t.rings[t.rings.length - 1]; const out = []; for (let i = 0; i < 64; i++) { const a = i / 64 * 2 * Math.PI; out.push({ a, bark: last ? last[Math.round(i / 64 * K) % K] : t.k.pith, tgt: window.press.target(a) }); } return out; }, ring);
    const left = 8 - ring;
    const at = (a) => { const i = Math.round(((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 64) % 64, q = tr[i];
      const r = q.bark + (q.tgt - q.bark) / left * skill + (q.tgt * 0.02) * Math.sin(a * 3 + ring); const R = r * g.s + 30; return [g.cx + R * Math.cos(a), g.cy - R * Math.sin(a)]; };
    let a = 0.3; await p.mouse.move(...at(a)); await p.mouse.down();
    for (let k = 0; k < 120; k++) { a += 2 * Math.PI / 110; await p.mouse.move(...at(a)); await sleep(8); }
    await p.mouse.up(); await sleep(1300);
    if (ring === 3) await p.screenshot({ path: `${out}/pu-${shape}-4.png` });
  }
  await sleep(2000);
  console.log('end:', await p.evaluate(() => document.getElementById('words').textContent), '| hud:', await p.evaluate(() => document.getElementById('score').textContent));
  await p.screenshot({ path: `${out}/pu-${shape}-8.png` });
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#share')]); await dl.saveAs(`${out}/pu-${shape}-card.png`);
  await p.mouse.click(195, 300); await sleep(1500);
  console.log('again rings:', await p.evaluate(() => window.press.tree.rings.length), '| hud:', await p.evaluate(() => document.getElementById('score').textContent));
  console.log('errors', bad.length ? bad : 'none'); await b.close();
})();
