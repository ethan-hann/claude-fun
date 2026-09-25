// Headless test harness: open the built game (file:// or a URL), wait, print console output,
// optionally run a script in the page, and save a screenshot.
// usage: node tools/shot.mjs <url-or-file> <out.png> [waitMs] [w] [h] [evalFile]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [,, target = 'dist/index.html', out = 'shot.png', waitMs = '4000', w = '1280', h = '720', evalFile] = process.argv;
const url = /^https?:|^file:/.test(target) ? target : 'file://' + resolve(target);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(+waitMs);
if (evalFile) {
  const code = readFileSync(evalFile, 'utf8');
  const res = await page.evaluate(code);
  if (res !== undefined) console.log('[eval]', typeof res === 'string' ? res : JSON.stringify(res));
}
await page.screenshot({ path: out });
console.log('[body]', (await page.evaluate(() => document.body.innerText)).slice(0, 500));
await browser.close();
