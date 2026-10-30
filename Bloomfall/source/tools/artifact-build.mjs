// Split ../bloomfall.html into a page plus asset files for publishing as a claude.ai artifact.
// Artifacts cap a page at 16 MB and do not serve .glb, so large inlined assets move to dist-artifact/a/
// and each GLB becomes an equivalent self-contained glTF JSON file. The artifact CSP blocks fetch() of
// data: URLs (connect-src 'self' blob:), so the page gets a shim that decodes them in place.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../bloomfall.html');
const out = resolve(here, '../dist-artifact');
const ext = { 'image/webp': 'webp', 'model/gltf-binary': 'json', 'font/woff2': 'woff2', 'image/png': 'png' };
const minSize = 20000;

const isB64 = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61;

// GLB to glTF JSON with the binary chunk embedded as a data URI; three's GLTFLoader reads either.
function glbToGltf(b) {
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12, json, bin;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    const chunk = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  if (bin) json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
  return Buffer.from(JSON.stringify(json));
}

// Answers fetch() of a data: URL locally so GLTFLoader can read embedded buffers under the CSP.
const fetchShim = `<script>(()=>{const f=window.fetch;window.fetch=function(r,o){const u=typeof r==='string'?r:r instanceof URL?r.href:r&&r.url;if(typeof u!=='string'||!u.startsWith('data:'))return f.apply(this,arguments);const c=u.indexOf(','),m=u.slice(5,c),d=u.slice(c+1);let b;if(/;base64$/i.test(m)){const s=atob(d);b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i)}else b=new TextEncoder().encode(decodeURIComponent(d));return Promise.resolve(new Response(b,{headers:{'Content-Type':m.split(';')[0]||'text/plain'}}))}})();</script>`;

const s = readFileSync(src, 'utf8');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'a'), { recursive: true });
const parts = [], files = [];
let last = 0, i = 0;
while ((i = s.indexOf('data:', i)) >= 0) {
  const comma = s.indexOf('base64,', i);
  if (comma < 0 || comma - i > 80) { i += 5; continue; }
  const mime = s.slice(i + 5, comma).split(';')[0];
  let j = comma + 7;
  while (j < s.length && isB64(s.charCodeAt(j))) j++;
  if (j - i < minSize || !ext[mime]) { i = j; continue; }
  const name = `a/${String(files.length).padStart(2, '0')}.${ext[mime]}`;
  let bytes = Buffer.from(s.slice(comma + 7, j), 'base64');
  if (mime === 'model/gltf-binary') bytes = glbToGltf(bytes);
  writeFileSync(join(out, name), bytes);
  files.push(name);
  parts.push(s.slice(last, i), name);
  last = i = j;
}
parts.push(s.slice(last));
const html = parts.join('');
const at = html.indexOf('<script');
if (at < 0) throw new Error('no <script> in the page');
const page = html.slice(0, at) + fetchShim + '\n' + html.slice(at);
writeFileSync(join(out, 'index.html'), page);
writeFileSync(join(out, 'files.json'), JSON.stringify(Object.fromEntries(files.map((f) => [f, f])), null, 1));

const mb = Buffer.byteLength(page) / 1048576;
console.log(`dist-artifact/index.html: ${mb.toFixed(2)} MB, ${files.length} asset files`);
if (mb > 15) { console.error('Artifact page is over 15 MB; the limit is 16 MB.'); process.exit(1); }
