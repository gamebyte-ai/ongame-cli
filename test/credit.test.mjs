/**
 * skills/credit/apply.mjs on throwaway game dirs: the "Built with onGame" block goes in once, stays put on a
 * re-run, replaces an older version in place, keeps the --badge / --wait choices, and
 * --check tells a build that carries it from one that does not (/publish reads that exit code).
 *
 * Run: node --test test/credit.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';

const APPLY = path.resolve(import.meta.dirname, '../skills/credit/apply.mjs');
const PAGE = '<!DOCTYPE html>\n<html>\n<head><title>g</title></head>\n<body>\n  <div id="stage"></div>\n  <script type="module" src="/src/main.ts"></script>\n</body>\n</html>\n';

function game(html = PAGE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-credit-'));
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  return dir;
}
const apply = (...args) => execFileSync(process.execPath, [APPLY, ...args]);
const run = (...args) => spawnSync(process.execPath, [APPLY, ...args], { encoding: 'utf8' });
const read = (dir) => fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const count = (s, needle) => s.split(needle).length - 1;

test('adds the block right after <body>, keeps the page, and a re-run changes nothing', () => {
  const dir = game();
  apply(dir);
  const once = read(dir);
  assert.ok(once.indexOf('<!-- ongame:brand-credit v1 -->') < once.indexOf('<div id="stage">'));
  assert.ok(once.includes('<script type="module" src="/src/main.ts"></script>'));
  assert.equal(count(once, 'id="ogc-card"'), 1);
  // The card must leave even when no script runs (a blocking CSP, a syntax error): that exit is CSS, not JS.
  assert.match(once, /#ogc-card \{ animation: ogc-bail 0s 6\.5s forwards; \}/);
  const again = run(dir);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /already current/);
  assert.equal(read(dir), once);
});

test('replaces an older block in place instead of stacking a second card', () => {
  const dir = game(PAGE.replace('<body>\n', '<body>\n<!-- ongame:brand-credit v0 -->\n<div id="ogc-card">old</div>\n<!-- /ongame:brand-credit -->\n'));
  apply(dir);
  const html = read(dir);
  assert.ok(!html.includes('>old<'));
  assert.equal(count(html, 'id="ogc-card"'), 1);
  assert.ok(html.includes('<!-- ongame:brand-credit v1 -->'));
});

test('--badge moves the pill, and a later run without the flag keeps that choice', () => {
  const dir = game();
  apply(dir);
  assert.ok(read(dir).includes('data-pos="bottom"'));
  apply(dir, '--badge', 'top');
  apply(dir);
  assert.ok(read(dir).includes('data-pos="top"'));
  assert.equal(count(read(dir), 'id="ogc-badge"'), 1);
  const bad = run(dir, '--badge', 'left');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /bottom, top or off/);
});

test('--wait ready is kept like --badge, and the block exposes ready() to the game', () => {
  const dir = game();
  apply(dir);
  assert.ok(read(dir).includes('data-wait="load"'));
  apply(dir, '--wait', 'ready');
  apply(dir, '--badge', 'top');
  const html = read(dir);
  assert.ok(html.includes('data-wait="ready"') && html.includes('data-pos="top"'));
  assert.ok(html.includes('ready: function () { ready = true; }'));
  assert.equal(run(dir, '--wait', 'soon').status, 2);
});

test('--check passes only on a page that carries the current block', () => {
  const dir = game();
  const file = path.join(dir, 'index.html');
  assert.equal(run('--check', file).status, 1);
  apply(dir);
  assert.equal(run('--check', file).status, 0);
});

test('refuses a game with no index.html or no <body>, with a reason', () => {
  const r1 = run(fs.mkdtempSync(path.join(os.tmpdir(), 'brand-credit-')));
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /not found/);
  const r2 = run(game('<html><head></head></html>'));
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /no <body>/);
});
