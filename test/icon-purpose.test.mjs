// The icon field from ongame's forge_request: a prompt-alone UI or HUD icon sets purpose "icon". Makers on this
// public plugin follow the assets skill, so the field and when to set it must be there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../skills/phases/assets/SKILL.md', import.meta.url), 'utf8');

test('the assets skill lists purpose among the spec fields', () => {
  assert.ok(text.includes('transparent?, purpose?, maxDim?'));
});

test('the assets skill says when to set purpose icon, and that an anchored icon keeps editOf', () => {
  assert.ok(text.includes('set `"icon"` for a UI or HUD icon'));
  assert.ok(text.includes('an icon that has an anchor keeps its `editOf`'));
});
