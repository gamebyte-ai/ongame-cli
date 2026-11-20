// Three instructions the source repo ships that this package lacked: the teardown mechanics sheet in /make-game,
// the art-direction file the concept phase writes, and the SDK's own session events in the polish phase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('make-game tells the agent to copy and bind a teardown mechanics sheet', () => {
  const text = read('commands/make-game.md');
  const i = text.indexOf("When the user gives a teardown's `mechanics.json`");
  assert.ok(i > -1, 'the mechanics paragraph is present');
  const block = text.slice(i, text.indexOf('When `play_gate` passes', i));
  assert.ok(block.includes('copy it\nunchanged to `{gameDir}/mechanics.json`'));
  assert.ok(block.includes('write `{gameDir}/mechanics.bind.json` beside the sheet'));
  assert.ok(block.includes('`{"<id>": {"path": "/tuning/reach", "tolerance": 0.05, "scale": 1}}`'));
  assert.ok(block.includes('each bound number as `match`, `drift` or `unread`. It never blocks.'));
  const gate = text.indexOf('**A game is done only after it was played on record.**');
  assert.ok(gate > -1 && gate < i, 'the paragraph sits after the play gate it extends');
});

test('the concept phase names docs/ART_DIRECTION.md in its look step', () => {
  const text = read('skills/phases/concept/SKILL.md');
  assert.ok(text.includes('3b. **LOCK THE LOOK before any asset wave — write `docs/ART_DIRECTION.md`:** follow `skills/game-concept/SKILL.md`, "Lock the look".'));
  assert.ok(read('skills/game-concept/SKILL.md').includes('## Lock the look'), 'the section the step points to exists');
});

test('the polish phase names the session events the SDK sends by itself', () => {
  const text = read('skills/phases/polish/SKILL.md');
  assert.ok(text.includes('sessions (`session_start` and `session_end`, and from SDK 2.0 also active time'));
  const events = JSON.parse(read('skills/analytics/events.json'));
  const names = JSON.stringify(events);
  for (const e of ['session_start', 'session_end']) assert.ok(names.includes(`"${e}"`), `${e} is a catalogued event`);
});

test('the plugin version, lock and changelog name the release that adds these lines', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.equal(version, '1.7.87');
  assert.equal(JSON.parse(read('skills/SKILLS.lock.json')).pluginVersion, version);
  const changelog = read('CHANGELOG.md');
  const i = changelog.indexOf(`## ${version} `);
  assert.ok(i > -1, 'the changelog has an entry for this version');
  assert.ok(changelog.slice(i, changelog.indexOf('\n## ', i + 1)).includes('`mechanics.json`'));
});
