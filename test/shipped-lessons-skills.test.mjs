// Six skills distilled from games that shipped to the web, Google Play and the App Store: store-build, store-submit,
// game-verify, mobile-ready, forge-assets and unity-port. Each must load by its description, be named by the command
// or skill that runs before its work, and keep its scripts' exit contract (0 pass, 1 finding, 2 nothing to read).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const run = (script, args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
const scratch = () => mkdtempSync(join(tmpdir(), 'shipped-lessons-'));

// [skill, file that names it]
const SKILLS = [
  ['store-build', 'skills/store-prep/SKILL.md'],
  ['store-submit', 'skills/store-prep/SKILL.md'],
  ['game-verify', 'commands/make-game.md'],
  ['mobile-ready', 'commands/make-game.md'],
  ['forge-assets', 'commands/make-game.md'],
  ['unity-port', 'skills/unity/SKILL.md'],
];

for (const [name, namer] of SKILLS) {
  test(`${name} loads by its description and is named by ${namer}`, () => {
    const text = read(`skills/${name}/SKILL.md`);
    assert.match(text, new RegExp(`^---\\nname: ${name}\\ndescription: \\S.{40,}\\n---\\n`));
    assert.ok(flat(read(namer)).includes(`skills/${name}`), `${namer} names skills/${name}`);
    assert.ok(Buffer.byteLength(text) < 6500, `${name}/SKILL.md stays short`);
  });
}

test('publish runs the latest-line check and the full live diff', () => {
  const text = flat(read('commands/publish.md'));
  assert.ok(text.includes('skills/game-verify/line-check.mjs {gameDir}'));
  assert.ok(text.includes('skills/game-verify/live-diff.mjs {gameDir}/dist <publicUrl>'));
});

const SCRIPTS = [
  'skills/store-build/store-check.mjs',
  'skills/store-submit/check-text.mjs',
  'skills/game-verify/live-diff.mjs',
  'skills/game-verify/line-check.mjs',
  'skills/mobile-ready/check.mjs',
  'skills/forge-assets/chroma-key.mjs',
];
for (const script of SCRIPTS) {
  test(`${script} with no arguments prints usage and exits 2`, () => {
    assert.equal(run(script, []).status, 2);
  });
}

test('check-text warns on a level count but fails a "no data" claim next to an analytics SDK', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'store'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { posthog: '1.0.0' } }));
  writeFileSync(join(dir, 'store', 'listing.md'), 'Relax with 48 levels across 4 worlds.\n');
  const warnOnly = run('skills/store-submit/check-text.mjs', [dir]);
  assert.equal(warnOnly.status, 0, warnOnly.stdout + warnOnly.stderr);
  writeFileSync(join(dir, 'store', 'review-notes.txt'), 'No data is collected.\n');
  assert.equal(run('skills/store-submit/check-text.mjs', [dir]).status, 1);
});

test('check-text has nothing to check without a store folder', () => {
  assert.equal(run('skills/store-submit/check-text.mjs', [scratch()]).status, 0);
});

test('mobile-ready fails a game that only handles pagehide', () => {
  const dir = scratch();
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'index.html'),
    '<meta name="viewport" content="width=device-width, viewport-fit=cover">\n' +
    '<style>body{padding-top:var(--safe-area-inset-top, env(safe-area-inset-top))}</style>\n');
  writeFileSync(join(dir, 'src', 'main.ts'), "window.addEventListener('pagehide', () => game.pause());\n");
  const res = run('skills/mobile-ready/check.mjs', [dir]);
  assert.equal(res.status, 1);
  assert.match(res.stdout, /lifecycle/);
});

test('chroma-key refuses a missing input with exit 2', () => {
  assert.equal(run('skills/forge-assets/chroma-key.mjs', ['check', join(scratch(), 'none.png')]).status, 2);
});

test('the plugin version, lock and changelog name the release that adds these skills', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.90', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.90 or later`);
  const changelog = read('CHANGELOG.md');
  const i = changelog.indexOf('## 1.7.90 ');
  assert.ok(i > -1, 'the changelog has an entry for 1.7.90');
  const end = changelog.indexOf('\n## ', i + 1);
  const entry = changelog.slice(i, end === -1 ? undefined : end);
  for (const [name] of SKILLS) assert.ok(entry.includes(`\`${name}\``), `the 1.7.90 entry names ${name}`);
});
