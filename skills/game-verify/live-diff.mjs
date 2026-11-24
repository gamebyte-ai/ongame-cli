#!/usr/bin/env node
// Compare every file of a local build with the live copy, by sha256 over an uncached fetch.
//   node live-diff.mjs <distDir> <liveBaseUrl> [--json] [--timeout <seconds>]
// <liveBaseUrl> is the folder that serves index.html (a trailing /index.html is accepted). <distDir> must hold a
// regular index.html; nothing is fetched otherwise.
// Prints one line per file that differs or is missing live, then the live page's own resource references that the
// local build does not contain (the live page was built from other source), then a summary.
// --json prints the differing files as [{path, size}] with index.html last instead of the per-file lines.
// Each download is streamed into the hash, aborted after --timeout seconds (default 20), and cut off as soon as it
// grows past the local file's size (`differs (larger live)`); at most 8 run at once.
// Only resource-bearing references count: <script src>, <img src>, <source src>, <audio src>, <video src> and
// <link href> with rel stylesheet, modulepreload, preload, icon, apple-touch-icon or manifest; anchors and other
// links are ignored. Root-absolute refs (`/assets/x.js`, Vite's default base) resolve against the page URL; a
// same-origin ref outside the page's folder (a game under a sub-path built with base '/') is listed as `outside`.
// Exit: 0 = every local file is byte-identical live and the live page references nothing foreign or outside;
//       1 = something differs; 2 = usage error, no local index.html, or the live page could not be fetched.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const json = args.includes('--json');
const ti = args.indexOf('--timeout');
const timeoutS = ti >= 0 ? Number(args[ti + 1]) : 20;
const [dist, rawBase] = args.filter((a, i) => !a.startsWith('--') && !(ti >= 0 && i === ti + 1));
if (!dist || !rawBase || !(timeoutS > 0)) {
  console.error('usage: node live-diff.mjs <distDir> <liveBaseUrl> [--json] [--timeout <seconds>]');
  process.exit(2);
}
const base = rawBase.replace(/index\.html(\?.*)?$/, '').replace(/\/?$/, '/');
const INDEX_CAP = 8 * 1024 * 1024;
const LINK_RELS = new Set(['stylesheet', 'modulepreload', 'preload', 'icon', 'apple-touch-icon', 'manifest']);

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// Streams one live file into a sha256. Returns null when it is missing live, {over: true} once it passes `cap`
// bytes, else {hash, buf?} (the bytes are kept only when `keep`).
async function fetchLive(path, cap, keep = false) {
  const url = `${base}${path.split('/').map(encodeURIComponent).join('/')}?nc=${Date.now()}`;
  const res = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    signal: AbortSignal.timeout(timeoutS * 1000),
  });
  if (res.status === 404 || res.status === 403) { await res.body?.cancel(); return null; } // object storage answers 403 for a missing key
  if (!res.ok) { await res.body?.cancel(); throw new Error(`${res.status} ${url}`); }
  const hash = createHash('sha256');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of res.body ?? []) {
    bytes += chunk.length;
    if (bytes > cap) return { over: true }; // leaving the loop cancels the stream
    hash.update(chunk);
    if (keep) chunks.push(chunk);
  }
  return { hash: hash.digest('hex'), buf: keep ? Buffer.concat(chunks) : undefined };
}
const reason = (e) => (e.name === 'TimeoutError' ? `timed out after ${timeoutS}s` : e.cause?.code || e.message);

// Resource-bearing references in the live page: [url, ...].
function resourceRefs(html) {
  const out = [];
  for (const [tag, name] of html.matchAll(/<(script|link|img|source|audio|video)\b[^>]*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/\s([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
    }
    const kind = name.toLowerCase();
    if (kind === 'link') {
      const rels = (attrs.rel || '').toLowerCase().split(/\s+/);
      if (attrs.href && rels.some((r) => LINK_RELS.has(r))) out.push(attrs.href);
    } else if (attrs.src) out.push(attrs.src);
  }
  return out.map((r) => r.split(/[?#]/)[0]).filter(Boolean);
}

async function main() {
  let files;
  try {
    if (!statSync(join(dist, 'index.html')).isFile()) throw new Error('index.html is not a regular file');
    files = walk(dist).map((p) => relative(dist, p).split(sep).join('/')).sort();
  } catch (e) {
    console.error(`${dist} holds no readable index.html build (${e.code || e.message}): build first.`);
    return 2;
  }

  const result = new Map();
  let failed = 0;
  const queue = [...files];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const local = readFileSync(join(dist, f));
      try {
        const live = await fetchLive(f, local.length);
        result.set(f, live === null ? 'missing' : live.over ? 'differs (larger live)' : live.hash === sha(local) ? 'same' : 'differs');
      } catch (e) {
        result.set(f, 'error');
        failed++;
        console.error(`fetch failed: ${f}: ${reason(e)}`);
      }
    }
  }));

  let liveIndex = null;
  try { liveIndex = await fetchLive('index.html', INDEX_CAP, true); } catch { /* reported above */ }
  if (!liveIndex || liveIndex.over) {
    console.error(liveIndex ? `live index.html at ${base} is larger than ${INDEX_CAP} bytes` : `no live index.html at ${base}`);
    return 2;
  }
  // Same-origin resource references in the live page, resolved against the page URL (so Vite's default base '/'
  // output `/assets/x.js` and relative `./assets/x.js` both count). A ref under the page's folder that the local
  // build does not have is foreign; a same-origin ref outside that folder is reported as outside the base.
  const pageUrl = new URL(base);
  const outside = [];
  const refs = [];
  for (const ref of resourceRefs(liveIndex.buf.toString('utf8'))) {
    if (/^(?:data|blob|mailto|javascript):/i.test(ref)) continue;
    let u;
    try { u = new URL(ref, pageUrl); } catch { continue; }
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
  const count = (s) => files.filter((f) => result.get(f).startsWith(s)).length;
  console.error(`# ${count('same')}/${files.length} identical, ${count('differs')} differ, ${count('missing')} missing live, ` +
    `${failed} fetch errors, ${foreign.length} foreign live references, ${outsideBase.length} outside the base`);
  return failed ? 2 : changed.length || foreign.length || outsideBase.length ? 1 : 0;
}

main().then((code) => process.exit(code), (e) => {
  console.error(`live-diff failed: ${e.message}`);
  process.exit(2);
});
