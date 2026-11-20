// Fades are one shape with one gradient fill, never stacked rings, bands, strips or discs. skills/gradients holds the
// rule and a source check; /make-game and the polish review load and run it. The check must report the stacked-ring
// end-card rays below and pass the same rays drawn with one FillGradient.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const check = (...paths) => {
  const r = spawnSync(process.execPath, ['skills/gradients/check.mjs', ...paths], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const fixture = (name) => `test/fixtures/gradients/${name}`;

test('stacked-ring rays and a stacked-disc glow fail the check', () => {
  const { code, out } = check(fixture('rays-rings.ts'));
  assert.equal(code, 1, out);
  assert.match(out, /rays-rings\.ts:7: .*fill changes with each pass/);
  assert.match(out, /rays-rings\.ts:17: .*translucent shapes of growing size/);
  assert.match(out, /2 stacked-shape fades in 1 file \(1 checked\)/);
});

test('the same rays drawn with one FillGradient pass the check', () => {
  const { code, out } = check(fixture('rays-gradient.ts'));
  assert.equal(code, 0, out);
  assert.match(out, /ok, no stacked-shape fade in 1 file/);
});

test('strip skies, ring vignettes and stacked ellipses fail the check', () => {
  const { code, out } = check(fixture('strips.js'));
  assert.equal(code, 1, out);
  for (const line of [4, 8, 12, 16, 20, 24, 28, 33, 37, 41]) assert.match(out, new RegExp(`strips\\.js:${line}: `));
});

test('particles, palette tiles, paint dabs, page dots, bars, per-object loops, line layers, outlines and waived loops pass', () => {
  const { code, out } = check(fixture('not-fades.ts'));
  assert.equal(code, 0, out);
});

test('a folder is scanned recursively and nothing to check is an error, not a pass', () => {
  const all = check('test/fixtures/gradients');
  assert.equal(all.code, 1, all.out);
  assert.match(all.out, /12 stacked-shape fades in 2 files \(4 checked\)/);
  const none = check('commands');
  assert.equal(none.code, 2, none.out);
  assert.match(none.out, /nothing was checked/);
});

test('the gradients skill loads by its description and gives the FillGradient code', () => {
  const text = read('skills/gradients/SKILL.md');
  const front = /^---\nname: gradients\ndescription: (.+)\n---\n/.exec(text);
  assert.ok(front, 'frontmatter with name and description');
  for (const word of ['glow', 'light rays', 'sky', 'FillGradient', 'never as stacked rings']) assert.ok(front[1].includes(word), word);
  for (const needle of ["type: 'radial', textureSpace: 'global'", "type: 'linear'", 'check.mjs', 'gradient-check: ok']) {
    assert.ok(text.includes(needle), needle);
  }
});

test('make-game and the polish review point to the skill and run the check', () => {
  const make = read('commands/make-game.md');
  assert.ok(make.includes('Read\n`skills/gradients/SKILL.md` before drawing the first one, in a new game or a change to a finished one.'));
  assert.ok(make.includes('`node <pluginRoot>/skills/gradients/check.mjs {gameDir}`'));
  const polish = read('skills/phases/polish/SKILL.md');
  assert.ok(polish.indexOf('Read `skills/gradients/SKILL.md`') > polish.indexOf('**Anything soft'));
  const gate = polish.indexOf('1e. **Play gate');
  const run = polish.indexOf('/../../gradients/check.mjs {gameDir}`');
  assert.ok(gate > -1 && run > gate && run < polish.indexOf('  2. **Pre-publish check'));
});

test('the plugin version and the changelog name the release that carries it', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.77', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.77 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.77'));
});
