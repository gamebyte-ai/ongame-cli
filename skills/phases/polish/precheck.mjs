#!/usr/bin/env node
/**
 * Pre-publish check: run on a built game BEFORE publish_game.
 *
 *   node precheck.mjs <gameDir>
 *
 * Prints one JSON object on stdout:
 *   { ok, files: [{path, size}], problems: [{reason, path?, detail}] }
 * `files` is exactly what publish_game takes — every regular file under <gameDir>/dist, dist-relative, with its byte
 * size. `problems` names every file publish_game would refuse, all at once, with publish_game's own reason codes.
 * Exit 0 = nothing to fix, 1 = problems to fix before publishing, 2 = no dist/ (build first).
 *
 * Why it exists: in 30 days publish_game refused 27 calls (no_such_build 11, disallowed_file_type 10,
 * payload_too_large 4, no_entry_point 2). The server names only the FIRST bad file per refusal, so a build with three
 * stray files cost three round trips. This finds them all, locally, in one pass.
 *
 * The allowlist and caps below are a COPY of core/src/publish-guard.ts, which stays the enforcement point.
 * core/test/publish-precheck.test.mjs fails when the two drift, so edit both together.
 */
import { lstatSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_EXTENSIONS = Object.freeze(Object.fromEntries([
  'html', 'js', 'mjs', 'css', 'json', 'map', 'wasm',
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'gif', 'ico',
  'mp3', 'ogg', 'wav', 'm4a', 'webm', 'mp4',
  'glb', 'gltf', 'bin', 'data', 'ktx2', 'hdr',
  'woff', 'woff2', 'ttf', 'otf',
  'txt', 'xml',
].map((ext) => [ext, true])));
const ENCODING_SUFFIXES = ['br', 'gz'];
export const MAX_FILES = 2000;
export const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
export const MAX_FILE_BYTES = MAX_TOTAL_BYTES;
export const ENTRY_POINT = 'index.html';

/** Same rule as publish-guard typeForPath: one optional .br/.gz over an allowed base; no extension = refused. */
function allowed(path) {
  const parts = (path.split('/').pop() ?? '').split('.');
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1].toLowerCase();
  if (ENCODING_SUFFIXES.includes(last)) return parts.length >= 3 && Boolean(ALLOWED_EXTENSIONS[parts[parts.length - 2].toLowerCase()]);
  return Boolean(ALLOWED_EXTENSIONS[last]);
}

/** Every problem publish_game would refuse this set for — all of them, not only the first. */
export function checkFiles(files) {
  const problems = [];
  if (files.length === 0) problems.push({ reason: 'empty_payload', detail: 'dist/ holds no files — build first' });
  if (files.length > MAX_FILES) {
    problems.push({ reason: 'too_many_files', detail: `${files.length} files; the limit is ${MAX_FILES}` });
  }
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (f.size > MAX_FILE_BYTES) {
      problems.push({ reason: 'payload_too_large', path: f.path, detail: `${f.size} bytes; the per-file limit is ${MAX_FILE_BYTES}` });
    }
  }
  if (total > MAX_TOTAL_BYTES) {
    problems.push({ reason: 'payload_too_large', detail: `${total} bytes in all; the limit is ${MAX_TOTAL_BYTES}` });
  }
  if (files.length > 0 && !files.some((f) => f.path === ENTRY_POINT)) {
    problems.push({ reason: 'no_entry_point', detail: `no ${ENTRY_POINT} at the root of dist/ — check the build's output config` });
  }
  for (const f of files) {
    if (!allowed(f.path)) {
      problems.push({ reason: 'disallowed_file_type', path: f.path, detail: 'not a file type a game can publish — stop the build from emitting it, or delete it from dist/' });
    }
  }
  return problems;
}

/** Regular files under dir, dist-relative with '/' separators, sorted. Symlinks are reported, never followed. */
function walk(root) {
  const files = [];
  const links = [];
  const visit = (rel) => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(join(root, r));
      if (st.isSymbolicLink()) links.push(r);
      else if (st.isDirectory()) visit(r);
      else if (st.isFile()) files.push({ path: r, size: st.size });
    }
  };
  visit('');
  return { files, links };
}

function main(gameDir) {
  const dist = join(gameDir, 'dist');
  let isDir = false;
  try { isDir = statSync(dist).isDirectory(); } catch { /* reported below */ }
  if (!isDir) {
    console.log(JSON.stringify({ ok: false, files: [], problems: [{ reason: 'no_dist', detail: `${dist} does not exist — run the build first` }] }));
    return 2;
  }
  const { files, links } = walk(dist);
  const problems = [
    ...links.map((p) => ({ reason: 'symlink', path: p, detail: 'a symlink is not uploaded — replace it with the real file' })),
    ...checkFiles(files),
  ];
  console.log(JSON.stringify({ ok: problems.length === 0, files, problems }, null, 2));
  return problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gameDir = process.argv[2];
  if (!gameDir) {
    console.error('usage: node precheck.mjs <gameDir>');
    process.exit(2);
  }
  process.exit(main(gameDir));
}
