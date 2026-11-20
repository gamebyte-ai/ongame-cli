import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const policy = readFileSync(new URL('../.github/ci/merge-policy', import.meta.url), 'utf8');
const critical = policy.split('\n')
  .map(line => line.split('#')[0].trim().split(/\s+/))
  .filter(parts => parts.length === 2 && parts[0] === 'critical')
  .map(parts => parts[1]);
const protectedPath = path => critical.some(prefix => path.startsWith(prefix));

test('workflow changes retain the retest', () => {
  assert.equal(protectedPath('.github/workflows/skill-integrity.yml'), true);
});

test('ordinary README edits remain outside the critical paths', () => {
  assert.equal(protectedPath('README.md'), false);
});

for (const path of ['skills/game-code/SKILL.md', 'scripts/build-skills-lock.mjs']) {
  test(`${path} retains the retest`, () => {
    assert.equal(protectedPath(path), true, `${path} must be critical`);
  });
}
