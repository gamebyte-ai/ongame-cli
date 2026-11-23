// The onGame team's Google Play launch cycle lives in the team's Playbook as the skill `ongame-game-launch`. Each store
// step names it in one line, only for agents whose `playbook catalog` lists it, and copies none of its content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const GUARD = 'if `playbook catalog` lists `ongame-game-launch`';

// [skill, the launch phases its line names]
const STEPS = [
  ['store-prep', ['creatives']],
  ['store-build', ['integrations', 'play-console']],
  ['store-submit', ['play-console', 'qa']],
];

for (const [skill, phases] of STEPS) {
  test(`${skill} points to ongame-game-launch once, only when the catalog lists it`, () => {
    const text = flat(read(`skills/${skill}/SKILL.md`));
    assert.equal(text.split(GUARD).length - 1, 1, `${skill} has exactly one guarded pointer`);
    const line = text.slice(text.indexOf(GUARD), text.indexOf('.', text.indexOf(GUARD) + GUARD.length) + 1);
    for (const phase of phases) assert.ok(line.includes(phase), `${skill}'s pointer names its ${phase} phase`);
  });
}

test('store-build and store-submit keep their limits next to the pointer', () => {
  const build = flat(read('skills/store-build/SKILL.md'));
  assert.ok(build.includes('it does not upload, sign with the owner\'s key, or submit'));
  assert.ok(build.includes('play-console phases; the limits above still hold.'));
  const submit = flat(read('skills/store-submit/SKILL.md'));
  assert.ok(submit.includes('**The agent never writes to a store.**'));
  assert.ok(submit.includes('qa phases; the boundary above still holds.'));
});

test('the plugin version and changelog name the release that adds the pointers', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.91', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.91 or later`);
  const changelog = read('CHANGELOG.md');
  const i = changelog.indexOf('## 1.7.91 ');
  assert.ok(i > -1, 'the changelog has an entry for 1.7.91');
  const end = changelog.indexOf('\n## ', i + 1);
  assert.ok(changelog.slice(i, end).includes('`ongame-game-launch`'), 'the 1.7.91 entry names the skill');
});
