// Scenario runner: loads the built game, then runs steps from a scenario module in the page and
// saves screenshots. usage: node tools/play.mjs <scenario.mjs> <outdir> [query] [w] [h]
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [,, scenarioPath, outDir = 'shots', query = 'manual', w = '1280', h = '720'] = process.argv;
mkdirSync(outDir, { recursive: true });
const { steps } = await import(pathToFileURL(resolve(scenarioPath)).href);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall')) console.log('[page]', t); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + resolve('dist/index.html') + '?' + query);
await page.waitForFunction(() => window.__ready === true || document.body.innerText.includes('Error'), null, { timeout: 120000 });
let i = 0;
for (const s of steps) {
  const t0 = Date.now();
  let res;
  try {
    res = await page.evaluate(s.code);
  } catch (e) {
    console.log(`[${s.name}] ERROR`, e.message);
    continue;
  }
  if (res !== undefined) console.log(`[${s.name}]`, typeof res === 'string' ? res : JSON.stringify(res));
  if (s.shot) {
    const f = `${outDir}/${String(i).padStart(2, '0')}_${s.name}.png`;
    await page.screenshot({ path: f });
    i++;
  }
  if (Date.now() - t0 > 20000) console.log(`[${s.name}] slow: ${Date.now() - t0} ms`);
}
await browser.close();
