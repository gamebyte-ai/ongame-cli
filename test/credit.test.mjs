/**
 * skills/credit/apply.mjs on throwaway game dirs: the onGame launch-card block goes in once, stays put on a
 * re-run, replaces an older version in place, and --check tells a build
 * that carries it from one that does not (/publish reads that exit code).
 *
 * Run: node --test test/credit.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

// The same assertions as the source repo's vitest copy of this file, on node:test.
const expect = (v) => ({
  toBe: (w) => assert.equal(v, w),
  toContain: (w) => assert.ok(v.includes(w), `expected to contain ${w}`),
  toMatch: (r) => assert.match(v, r),
  toBeLessThan: (w) => assert.ok(v < w, `${v} < ${w}`),
  not: { toContain: (w) => assert.ok(!v.includes(w), `expected not to contain ${w}`), toMatch: (r) => assert.doesNotMatch(v, r) },
});

const APPLY = path.resolve(import.meta.dirname, '../skills/credit/apply.mjs');
const PAGE = '<!DOCTYPE html>\n<html>\n<head><title>g</title></head>\n<body>\n  <div id="stage"></div>\n  <script type="module" src="/src/main.ts"></script>\n</body>\n</html>\n';

// Every folder a test makes is removed after it, on a pass or a failure.
const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-credit-'));
  made.push(dir);
  return dir;
};

function game(html = PAGE) {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  return dir;
}
const run = (...args) => spawnSync(process.execPath, [APPLY, ...args], { encoding: 'utf8' });
const read = (dir) => fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const count = (s, needle) => s.split(needle).length - 1;

test('adds the block right after <body>, keeps the page, and a re-run changes nothing', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  const once = read(dir);
  expect(once.indexOf('<!-- ongame:brand-credit v3 -->')).toBeLessThan(once.indexOf('<div id="stage">'));
  expect(once).toContain('<script type="module" src="/src/main.ts"></script>');
  expect(count(once, 'id="ogc-card"')).toBe(1);
  // The card must leave even when no script runs (a blocking CSP, a syntax error): that exit is CSS, not JS.
  expect(once).toMatch(/#ogc-card \{ animation: ogc-bail 0s 6\.5s forwards; \}/);
  // Edit rounds screenshot the dev server; the block steps aside there (the built page has no Vite client).
  expect(once).toContain('script[src$="/@vite/client"]');
  const again = run(dir);
  expect(again.status).toBe(0);
  expect(again.stdout).toContain('already current');
  expect(read(dir)).toBe(once);
});

test('replaces an older block in place instead of stacking a second card', () => {
  const dir = game(PAGE.replace('<body>\n', '<body>\n<!-- ongame:brand-credit v0 -->\n<div id="ogc-card">old</div>\n<!-- /ongame:brand-credit -->\n'));
  execFileSync(process.execPath, [APPLY, dir]);
  const html = read(dir);
  expect(html).not.toContain('>old<');
  expect(count(html, 'id="ogc-card"')).toBe(1);
  expect(html).toContain('<!-- ongame:brand-credit v3 -->');
});

test('there is no pill: --badge is still accepted, changes nothing, and nothing but the logo card is added', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  const plain = read(dir);
  const r = run(dir, '--badge', 'top');
  expect(r.status).toBe(0);
  expect(r.stderr).toContain('--badge has no effect');
  expect(read(dir)).toBe(plain);
  expect(plain).not.toContain('ogc-badge');
  expect(plain).not.toMatch(/built with/i);
  expect(count(plain, '<svg')).toBe(1);
  expect(run(dir, '--badge', 'left').status).toBe(2);
});

test('--wait ready is kept on a later run, and the block exposes ready() to the game', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  expect(read(dir)).toContain('data-wait="load"');
  execFileSync(process.execPath, [APPLY, dir, '--wait', 'ready']);
  execFileSync(process.execPath, [APPLY, dir]);
  const html = read(dir);
  expect(html).toContain('data-wait="ready"');
  expect(html).toContain('ready: function () { ready = true; }');
  expect(run(dir, '--wait', 'soon').status).toBe(2);
});

test('a v2 block (caption + pill) becomes the logo-only card and keeps its --wait choice', () => {
  const v2 = '<!-- ongame:brand-credit v2 -->\n<div id="ogc-card" class="ogc-play" data-wait="ready" hidden lang="en" aria-label="Built with onGame"><div class="ogc-cap">Built with</div></div>\n<div id="ogc-badge" data-pos="top" hidden></div>\n<!-- /ongame:brand-credit -->\n';
  const dir = game(PAGE.replace('<body>\n', '<body>\n' + v2));
  execFileSync(process.execPath, [APPLY, dir]);
  const html = read(dir);
  expect(html).toContain('<div id="ogc-card" data-wait="ready" hidden ');
  expect(html).not.toContain('ogc-badge');
  expect(html).not.toMatch(/built with/i);
});

test('leave() stays callable for games written against the pill, and does nothing', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  expect(read(dir)).toContain('leave: function () {} };');
});

test('an older block is replaced by the current one, and --check reports it as older until then', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, read(dir).replace('<!-- ongame:brand-credit v3 -->', '<!-- ongame:brand-credit v2 -->'));
  const r = run('--check', file);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('an older version');
  execFileSync(process.execPath, [APPLY, dir]);
  expect(run('--check', file).status).toBe(0);
  expect(count(read(dir), 'id="ogc-card"')).toBe(1);
});

test('the card starts hidden: only the block\'s own CSS shows it, so blocked inline styles never leave a bare card', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  expect(read(dir)).toMatch(/<div id="ogc-card" data-wait="load" hidden /);
});

test('duplicate blocks (a copied or merge-conflicted page) collapse to one', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  const block = read(dir).match(/<!-- ongame:brand-credit v3 -->[\s\S]*?<!-- \/ongame:brand-credit -->\n/)[0];
  fs.writeFileSync(path.join(dir, 'index.html'), read(dir).replace('</body>', block + '</body>'));
  expect(count(read(dir), 'id="ogc-card"')).toBe(2);
  execFileSync(process.execPath, [APPLY, dir]);
  expect(count(read(dir), 'id="ogc-card"')).toBe(1);
});

test('the block goes after the real <body>, not one inside a comment, a script or a quoted attribute', () => {
  const tricky = '<html><head><!-- <body> --><script>var t = "<body>";</script></head>\n<body data-x="1 > 0">\n<div id="stage"></div>\n</body></html>\n';
  const dir = game(tricky);
  execFileSync(process.execPath, [APPLY, dir]);
  const html = read(dir);
  expect(html.indexOf('<!-- ongame:brand-credit v3 -->')).toBe(html.indexOf('<body data-x="1 > 0">\n') + '<body data-x="1 > 0">\n'.length);
  expect(html.startsWith('<html><head><!-- <body> --><script>var t = "<body>";</script></head>')).toBe(true);
});

test('unknown or repeated arguments are refused instead of silently ignored', () => {
  const dir = game();
  expect(run(dir, '--badg', 'off').status).toBe(2);
  expect(run(dir, '--badge', 'top', '--badge', 'off').status).toBe(2);
  expect(fs.existsSync(path.join(dir, 'index.html')) && !read(dir).includes('ogc-card')).toBe(true);
});

test('--check fails a build that kept the markers but lost the script', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, read(dir).replace(/<script>[\s\S]*?<\/script>/, ''));
  const r = run('--check', file);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('missing');
});

test('--check fails a block that lost leave(), so a game calling it cannot ship a broken credit', () => {
  const dir = game();
  execFileSync(process.execPath, [APPLY, dir]);
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, read(dir).replace(/, leave: function \(\) \{[^}]*\}/, ''));
  const r = run('--check', file);
  expect(r.status).toBe(1);
  expect(r.stdout).toContain('leave: function');
});

test('--check passes only on a page that carries the current block', () => {
  const dir = game();
  const file = path.join(dir, 'index.html');
  expect(run('--check', file).status).toBe(1);
  execFileSync(process.execPath, [APPLY, dir]);
  expect(run('--check', file).status).toBe(0);
});

test('refuses a game with no index.html or no <body>, with a reason', () => {
  const empty = tempDir();
  const r1 = run(empty);
  expect(r1.status).toBe(2);
  expect(r1.stderr).toContain('not found');
  const r2 = run(game('<html><head></head></html>'));
  expect(r2.status).toBe(2);
  expect(r2.stderr).toContain('no <body>');
});
