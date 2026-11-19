// The rig step from ongame's assets skill: a 3d-char that arrives with its clips needs no forge_rig job.
// Makers on this public plugin follow the assets skill, so the skip condition must be in step 3 itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const skill = read('skills/phases/assets/SKILL.md');

test('the rig step says to skip forge_rig when measurement.animations has the clips', () => {
  const start = skill.indexOf('3. **Rigging (3d-char only, optional):**');
  assert.ok(start > -1, 'the assets skill has the rig step');
  const step = skill.slice(start, skill.indexOf('\n4. ', start));
  assert.ok(step.includes('skip it when the delivered `measurement.animations` already has the clips\n   the game needs.'));
  assert.ok(step.indexOf('skip it when') < step.indexOf('forge_rig('), 'the skip comes before the forge_rig call');
});

test('the rig step no longer rigs every static mesh', () => {
  assert.ok(!skill.includes("once the static mesh's `asset_job_status` call reports `completed`"));
});

test('the plugin version and the changelog name the release that carries it', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.74', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.74 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.74'));
});
