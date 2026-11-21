#!/usr/bin/env node
// Compare every file of a local build with the live copy, by sha256 over an uncached fetch.
//   node live-diff.mjs <distDir> <liveBaseUrl> [--json]
// <liveBaseUrl> is the folder that serves index.html (a trailing /index.html is accepted).
// Prints one line per file that differs or is missing live, then the live page's own asset references that the
// local build does not contain (the live page was built from other source), then a summary.
// --json prints the differing files as [{path, size}] with index.html last instead of the per-file lines.
// Root-absolute refs (`/assets/x.js`, Vite's default base) resolve against the page URL; a same-origin ref outside
// the page's folder (a game under a sub-path built with base '/') is listed as `outside`.
// Exit: 0 = every local file is byte-identical live and the live page references nothing foreign or outside;
//       1 = something differs; 2 = usage error or the live page could not be fetched.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const json = args.includes('--json');
const [dist, rawBase] = args.filter((a) => !a.startsWith('--'));
if (!dist || !rawBase) {
  console.error('usage: node live-diff.mjs <distDir> <liveBaseUrl> [--json]');
  process.exit(2);
}
const base = rawBase.replace(/index\.html(\?.*)?$/, '').replace(/\/?$/, '/');

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
let files;
try {
  files = walk(dist).map((p) => relative(dist, p).split(sep).join('/')).sort();
} catch (e) {
  console.error(`cannot read ${dist}: ${e.message}`);
  process.exit(2);
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function fetchLive(path) {
  const url = `${base}${path.split('/').map(encodeURIComponent).join('/')}?nc=${Date.now()}`;
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
  if (res.status === 404 || res.status === 403) return null; // object storage answers 403 for a missing key
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const result = new Map();
let failed = 0;
const queue = [...files];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const local = readFileSync(join(dist, f));
    try {
      const live = await fetchLive(f);
      result.set(f, live === null ? 'missing' : sha(live) === sha(local) ? 'same' : 'differs');
    } catch (e) {
      result.set(f, 'error');
      failed++;
      console.error(`fetch failed: ${e.message}`);
    }
  }
}));

let liveIndex = null;
try { liveIndex = await fetchLive('index.html'); } catch { /* reported above when index.html is local */ }
if (!liveIndex) {
  console.error(`no live index.html at ${base}`);
  process.exit(2);
}
// Same-origin asset references in the live page, resolved against the page URL (so Vite's default base '/'
// output `/assets/x.js` and relative `./assets/x.js` both count). A ref under the page's folder that the local
// build does not have is foreign; a same-origin ref outside that folder is reported as outside the base.
const pageUrl = new URL(base);
const outside = [];
const refs = [];
for (const m of liveIndex.toString('utf8').matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)/g)) {
  if (/^(?:data|blob|mailto|javascript):/i.test(m[1])) continue;
  let u;
  try { u = new URL(m[1], pageUrl); } catch { continue; }
  if (u.origin !== pageUrl.origin) continue; // CDN or other host: not part of this build
  if (u.pathname.startsWith(pageUrl.pathname)) refs.push(decodeURIComponent(u.pathname.slice(pageUrl.pathname.length)));
  else outside.push(u.pathname);
}
const foreign = [...new Set(refs)].filter((r) => r && !result.has(r));
const outsideBase = [...new Set(outside)];

const changed = files.filter((f) => result.get(f) !== 'same');
const ordered = [...changed.filter((f) => f !== 'index.html'), ...changed.filter((f) => f === 'index.html')];
if (json) {
  console.log(JSON.stringify(ordered.map((f) => ({ path: f, size: statSync(join(dist, f)).size }))));
} else {
  for (const f of ordered) console.log(`${result.get(f).padEnd(8)} ${f}`);
  for (const r of foreign) console.log(`foreign  ${r}  (referenced by the live page, absent from this build)`);
  for (const r of outsideBase) console.log(`outside  ${r}  (same-origin reference outside ${pageUrl.pathname}: check the build's base)`);
}
const count = (s) => files.filter((f) => result.get(f) === s).length;
console.error(`# ${count('same')}/${files.length} identical, ${count('differs')} differ, ${count('missing')} missing live, ` +
  `${failed} fetch errors, ${foreign.length} foreign live references, ${outsideBase.length} outside the base`);
process.exit(failed ? 2 : changed.length || foreign.length || outsideBase.length ? 1 : 0);
