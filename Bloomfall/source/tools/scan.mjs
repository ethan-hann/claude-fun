// Runs a scenario (like play.mjs) and saves every image a step stored in window.__scan[name] as a PNG.
// usage: node tools/scan.mjs <scenario.mjs> <outdir> [query]
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [,, scen, out, query = 'manual'] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + resolve('dist/index.html') + '?' + query);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const { steps } = await import(pathToFileURL(resolve(scen)).href);
for (const s of steps) { const r = await page.evaluate(s.code); console.log(`[${s.name}]`, JSON.stringify(r)); await page.screenshot({ path: `${out}/${s.name}.png` }); }
const scans = await page.evaluate(() => window.__scan || {});
for (const [k, v] of Object.entries(scans)) writeFileSync(`${out}/scan_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
await browser.close();
