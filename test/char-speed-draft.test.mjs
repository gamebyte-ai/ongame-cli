// The draft speed from ongame's 3d-char charParams: speed "fast" runs the faster model for a preview or a draft.
// Makers on this public plugin follow the assets skill, so the field and when to set it must be there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const skill = read('skills/phases/assets/SKILL.md');

test('the assets skill lists speed among the charParams fields', () => {
  assert.ok(skill.includes('`{ targetPolycount, pbr, poseMode, enableSafetyChecker, speed }`'));
});

test('the assets skill says when to set speed fast, and never for the hero', () => {
  assert.ok(skill.includes('`speed: "fast"` trades colour quality and PBR for a character in about 45 s'));
  assert.ok(skill.includes('set it for a preview, a draft or a placeholder you will replace, never for the hero the player'));
  assert.ok(skill.includes('Add `pbr: true` only if the draft must show its metal and roughness.'));
});

test('the assets skill no longer calls a 3d-char a static mesh only', () => {
  assert.ok(!skill.includes('(3d-char, STATIC MESH ONLY)'));
});

test('the plugin version and the changelog name the release that carries it', () => {
  // 1.7.73 is the release that brought speed; a later version bump must not move this check.
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.73', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.73 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.73'));
});
