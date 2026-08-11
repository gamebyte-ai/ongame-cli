#!/usr/bin/env node
/**
 * A local stand-in for the two GitHub hosts the install path talks to, so install.sh, install.ps1 and the
 * binary's own self-updater can be exercised END TO END in CI instead of being the one production path that is
 * only ever tested by shipping it.
 *
 * It is reached through the `ONGAME_LAUNCHER_API_ROOT` / `ONGAME_LAUNCHER_DOWNLOAD_ROOT` seams that all three
 * implementations honour. One port serves both roots — the path spaces do not collide (`/repos/...` for the API,
 * `/<owner>/<repo>/releases/download/...` for assets).
 *
 * Deliberately dumb and dependency-free (node:http only): it serves whatever files are in --dir and computes
 * checksums.txt from those exact bytes, so a test that wants a checksum MISMATCH just overwrites the asset after
 * checksums.txt has been generated, and a test that wants a MISSING ENTRY passes --omit-checksum. Nothing here
 * knows anything about the product.
 *
 *   node test/mock-release-server.mjs --port 8787 --dir ./fixtures --tag cli-v9.9.9
 *
 * Prints `LISTENING <port>` on stdout once bound (a caller can poll for it) and logs each request to stderr.
 */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const port = Number(arg('port', '8787'));
const dir = arg('dir', '.');
const tag = arg('tag', 'cli-v9.9.9');
const repo = arg('repo', 'gamebyte-ai/ongame-cli');
/** Serve a release payload with no checksums entry for the asset — the "release is broken" refusal path. */
const omitChecksum = has('omit-checksum');
/** Serve checksums.txt with a deliberately wrong hash — the tamper-detection path. */
const badChecksum = has('bad-checksum');
/** Fail the release-metadata call, to exercise "GitHub unreachable → keep the working binary". */
const failMetadata = has('fail-metadata');

const assets = () => readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile() && f !== 'checksums.txt');

function checksumsBody() {
  return assets()
    .map((name) => {
      const real = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex');
      const hash = badChecksum ? '0'.repeat(64) : real;
      // The real file is written by `cd dist-bin && shasum -a 256 ongame-cli-*`, i.e. bare basenames and TWO
      // spaces. Reproduced exactly so the consumers' basename matching is tested against the real shape.
      return omitChecksum ? null : `${hash}  ${name}`;
    })
    .filter(Boolean)
    .join('\n') + '\n';
}

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  process.stderr.write(`[mock] ${req.method} ${path}\n`);

  if (path === `/repos/${repo}/releases/latest`) {
    if (failMetadata) { res.writeHead(500); res.end('upstream is having a bad day'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    // Minified on purpose: the real API returns minified JSON, and install.sh's tag parsing was once broken by
    // assuming pretty-printed whitespace. Keep it minified so that regression stays covered.
    res.end(JSON.stringify({ tag_name: tag, name: tag, assets: [] }));
    return;
  }

  const prefix = `/${repo}/releases/download/${tag}/`;
  if (path.startsWith(prefix)) {
    const name = path.slice(prefix.length);
    if (name === 'checksums.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(checksumsBody());
      return;
    }
    try {
      const body = readFileSync(join(dir, name));
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': body.length });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('no such asset');
    }
    return;
  }

  res.writeHead(404);
  res.end('not a route this mock serves');
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`LISTENING ${server.address().port}\n`);
});
