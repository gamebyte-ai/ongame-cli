// The rig step from ongame's assets skill: forge_rig bakes clips, so it is the path for a missing clip too.
// It once said "rig-only", which left a rigged character missing one clip with no step that worked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const skill = read('skills/phases/assets/SKILL.md');
const start = skill.indexOf('3. **Rigging (3d-char only, optional):**');
const step = skill.slice(start, skill.indexOf('\n4. ', start));

test('the rig step names the two cases a forge_rig job pays off', () => {
  assert.ok(start > -1, 'the assets skill has the rig step');
  assert.ok(step.includes('Call it in two cases only: the list is empty with a "could not rig" warning, or a clip the game'));
});

test('the rig step says forge_rig bakes clips and how to ask for more', () => {
  assert.ok(step.includes('`idle`, `walk`, `run`, `attack`, `cast`, `hit` and `death`'));
  assert.ok(step.includes('`clips: [names]`'));
  assert.ok(step.includes('ask for EVERY clip the game uses'));
  assert.ok(!skill.includes('no animation is produced'));
});

test('the rig step checks every needed clip against measurement.animations, not only the warnings', () => {
  // An unknown library name is dropped before the rig's warning check, so an empty warnings list can hide it.
  assert.ok(step.includes("compare the rigged poll's `measurement.animations` with every clip name the game"));
  assert.ok(step.includes('even when `warnings` is empty'));
  assert.ok(step.includes('Make the game code skip each name that is missing'));
  assert.ok(!step.includes('a requested name that did not land is listed there'));
});

test('the rig step says what to do when the rig cannot add the clip', () => {
  assert.ok(step.includes('make the game code skip the missing one'));
});

test('the plugin version and the changelog name the release that carries it', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.75', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.75 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.75'));
});
