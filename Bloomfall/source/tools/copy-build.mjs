// Copy the single-file build next to the README so it can be played without building.
import { copyFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../dist/index.html');
const dst = resolve(here, '../../bloomfall.html');
copyFileSync(src, dst);
const mb = statSync(dst).size / 1048576;
console.log(`bloomfall.html: ${mb.toFixed(2)} MB`);
if (mb > 50) { console.error('Build is over the 50 MB limit.'); process.exit(1); }
