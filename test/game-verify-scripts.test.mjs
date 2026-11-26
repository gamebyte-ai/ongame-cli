// game-verify's two scripts keep their exit contract (0 pass, 1 finding, 2 nothing to read) on real inputs:
// line-check.mjs against throwaway git repositories (a bare repo as the remote), live-diff.mjs against a local
// HTTP server serving a fixture build. Nothing leaves localhost.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LINE_CHECK = join(ROOT, 'skills/game-verify/line-check.mjs');
const LIVE_DIFF = join(ROOT, 'skills/game-verify/live-diff.mjs');
const scratchDirs = [];
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'game-verify-')); scratchDirs.push(d); return d; };
after(() => { for (const d of scratchDirs) rmSync(d, { recursive: true, force: true }); });

const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
const git = (dir, ...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t',
  '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', env: ENV }).trim();
const commit = (dir, file, text) => { writeFileSync(join(dir, file), text); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', file); };
const lineCheck = (...a) => spawnSync(process.execPath, [LINE_CHECK, ...a], { encoding: 'utf8', env: ENV });

// A bare remote with main, and a clone of it checked out on main.
function repoWithRemote() {
  const d = scratch();
  const bare = join(d, 'remote.git');
  const seed = join(d, 'seed');
  git(d, 'init', '-q', '--bare', bare);
  git(d, 'init', '-q', seed);
  commit(seed, 'game.js', 'v1');
  git(seed, 'remote', 'add', 'origin', bare);
  git(seed, 'push', '-q', 'origin', 'main');
  git(d, 'clone', '-q', bare, join(d, 'work'));
  return { bare, seed, work: join(d, 'work') };
}

test('line-check: HEAD holds the default branch and nothing else → 0', () => {
  const { work } = repoWithRemote();
  const r = lineCheck(work);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /HEAD holds origin\/main/);
});

test('line-check: a remote branch with a unique commit → 1, listed', () => {
  const { seed, work } = repoWithRemote();
  git(seed, 'checkout', '-qb', 'telemetry');
  commit(seed, 'telemetry.js', 'track()');
  git(seed, 'push', '-q', 'origin', 'telemetry');
  git(work, 'fetch', '-q');
  const r = lineCheck(work);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /origin\/telemetry .*1 commits in neither HEAD nor origin\/main/);
  assert.match(r.stdout, /telemetry\.js/);
});

test('line-check: HEAD behind the default branch → 1 with a BEHIND line', () => {
  const { seed, work } = repoWithRemote();
  commit(seed, 'game.js', 'v2');
  git(seed, 'push', '-q', 'origin', 'main');
  git(work, 'fetch', '-q');
  const r = lineCheck(work);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^BEHIND origin\/main by 1/m);
});

test('line-check: a local-only branch with a unique commit → 1, listed', () => {
  const { work } = repoWithRemote();
  git(work, 'checkout', '-qb', 'local-work');
  commit(work, 'level.js', 'new level');
  git(work, 'checkout', '-q', 'main');
  const r = lineCheck(work);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /local-work .*1 commits in neither HEAD/);
});

// git prints a non-ASCII path quoted, "sahne-\304\237.js". Passed back to `git diff`, that text matched no file, so a
// branch changing the file looked squash-merged and the script exited 0.
test('line-check: a remote branch changes a file with a non-ASCII name → 1, listed', () => {
  const { seed, work } = repoWithRemote();
  commit(seed, 'sahne-ğ.js', 'v1');
  git(seed, 'push', '-q', 'origin', 'main');
  git(seed, 'checkout', '-qb', 'scene');
  commit(seed, 'sahne-ğ.js', 'v2');
  git(seed, 'push', '-q', 'origin', 'scene');
  git(work, 'pull', '-q');
  const r = lineCheck(work);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /origin\/scene .*1 commits in neither HEAD nor origin\/main/);
  assert.match(r.stdout, /1 of 1 touched files differ from origin\/main/);
  assert.doesNotMatch(r.stdout, /^BEHIND/m);
});

test('line-check: a branch whose non-ASCII file change main already has (squash merge) → 0', () => {
  const { seed, work } = repoWithRemote();
  git(seed, 'checkout', '-qb', 'scene');
  commit(seed, 'sahne-ğ.js', 'v1');
  git(seed, 'push', '-q', 'origin', 'scene');
  git(seed, 'checkout', '-q', 'main');
  // The same content lands on main as a new commit, so main's tip is not the branch's.
  writeFileSync(join(seed, 'sahne-ğ.js'), 'v1');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'squash scene');
  git(seed, 'push', '-q', 'origin', 'main');
  git(work, 'pull', '-q');
  const r = lineCheck(work);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /1 more only carry content origin\/main already has/);
});

// core.quotePath=false stops quoting non-ASCII letters but still quotes a double quote, so the paths are read with -z.
test('line-check: a remote branch changes a file whose name holds a double quote → 1, listed',
  { skip: process.platform === 'win32' && 'a Windows file name cannot hold a double quote' }, () => {
    const { seed, work } = repoWithRemote();
    git(seed, 'checkout', '-qb', 'quote');
    commit(seed, 'say-"hi".js', 'v1');
    git(seed, 'push', '-q', 'origin', 'quote');
    git(work, 'fetch', '-q');
    const r = lineCheck(work);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /origin\/quote .*1 commits in neither HEAD nor origin\/main/);
    assert.match(r.stdout, /1 of 1 touched files differ from origin\/main/);
  });

test('line-check: a repository without remote and other branches → 0 with a note', () => {
  const d = scratch();
  git(d, 'init', '-q');
  commit(d, 'game.js', 'v1');
  const r = lineCheck(d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /single line/);
});

test('line-check: --fetch against an unreachable remote → 2 and nothing evaluated', () => {
  const { work } = repoWithRemote();
  git(work, 'remote', 'set-url', 'origin', join(scratch(), 'gone.git'));
  const r = lineCheck(work, '--fetch');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /could not fetch; refs may be stale/);
  assert.doesNotMatch(r.stdout, /HEAD /);
});

test('line-check: not a git repository → 2', () => {
  const r = lineCheck(scratch());
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /not a git repository/);
});

// ---- live-diff ----

const INDEX = '<!doctype html><script type="module" src="./assets/app.js"></script>' +
  '<link rel="stylesheet" href="./assets/app.css"><a href="/elsewhere">more games</a>';
function dist(files = { 'index.html': INDEX, 'assets/app.js': 'play()', 'assets/app.css': 'body{}' }) {
  const d = scratch();
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(d, p, '..'), { recursive: true });
    writeFileSync(join(d, p), text);
  }
  return d;
}
// Serves `files` under /game/; anything else is 404.
async function serve(files) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const body = path.startsWith('/game/') ? files[path.slice('/game/'.length)] : undefined;
    if (body === undefined) { res.writeHead(404).end(); return; }
    res.writeHead(200).end(body);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${server.address().port}/game/`, close: () => new Promise((ok) => server.close(ok)) };
}
// Async run: the server lives in this process, so the child must not block the event loop.
const liveDiff = (...a) => new Promise((ok) => {
  const child = spawn(process.execPath, [LIVE_DIFF, ...a]);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  child.on('close', (status) => ok({ status, stdout, stderr }));
});
const LIVE = { 'index.html': INDEX, 'assets/app.js': 'play()', 'assets/app.css': 'body{}' };

test('live-diff: identical build, anchor outside the folder ignored → 0', async () => {
  const live = await serve(LIVE);
  try {
    const r = await liveDiff(dist(), live.url);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stderr, /3\/3 identical/);
    assert.doesNotMatch(r.stdout, /outside/);
  } finally { await live.close(); }
});

test('live-diff: one differing file → 1, listed', async () => {
  const live = await serve({ ...LIVE, 'assets/app.js': 'stop()' });
  try {
    const r = await liveDiff(dist(), live.url);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^differs +assets\/app\.js$/m);
  } finally { await live.close(); }
});

test('live-diff: a larger live file is cut off and reported → 1', async () => {
  const live = await serve({ ...LIVE, 'assets/app.js': 'play()'.repeat(1000) });
  try {
    const r = await liveDiff(dist(), live.url);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^differs \(larger live\) assets\/app\.js$/m);
  } finally { await live.close(); }
});

test('live-diff: the live page loads a script this build lacks → 1 (foreign)', async () => {
  const index = INDEX.replace('</script>', '</script><script src="./assets/old.js"></script>');
  const live = await serve({ ...LIVE, 'index.html': index, 'assets/old.js': 'old()' });
  try {
    const r = await liveDiff(dist({ ...LIVE, 'index.html': index }), live.url);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^foreign +assets\/old\.js/m);
  } finally { await live.close(); }
});

test('live-diff: a same-origin script outside the folder → 1 (outside)', async () => {
  const index = INDEX.replace('./assets/app.js', '/assets/app.js');
  const live = await serve({ ...LIVE, 'index.html': index });
  try {
    const r = await liveDiff(dist({ ...LIVE, 'index.html': index }), live.url);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^outside +\/assets\/app\.js/m);
  } finally { await live.close(); }
});

test('live-diff: local build without index.html → 2 before any request', async () => {
  let requests = 0;
  const server = createServer((req, res) => { requests++; res.writeHead(404).end(); });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  try {
    const r = await liveDiff(dist({ 'assets/app.js': 'play()' }), `http://127.0.0.1:${server.address().port}/game/`);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /no readable index\.html/);
    assert.equal(requests, 0);
  } finally { await new Promise((ok) => server.close(ok)); }
});

test('live-diff: an empty build → 2', async () => {
  const r = await liveDiff(scratch(), 'http://127.0.0.1:9/game/');
  assert.equal(r.status, 2, r.stdout + r.stderr);
});

test('live-diff: unreachable host → 2', async () => {
  const live = await serve(LIVE);
  const url = live.url;
  await live.close(); // the port is now closed: every request is refused
  const r = await liveDiff(dist(), url, '--timeout', '5');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /no live index\.html/);
});
