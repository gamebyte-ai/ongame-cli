// make-game, publish and the polish skill must send the agent through play_gate and play_review before a build is
// done or published (ongame PR 916). Without the text the agent meets the finish hook's refusal with no plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('make-game says a game is done only after it was played on record', () => {
  const text = read('commands/make-game.md');
  const i = text.indexOf('**A game is done only after it was played on record.**');
  assert.ok(i > -1);
  const block = text.slice(i, text.indexOf('Use the registered game/build identifiers', i));
  for (const needle of ['`play_gate({gameDir, buildId, desktop, phone})`', '`play_review`', '`skip: {reason}`', 'An install with no `play_gate` tool']) {
    assert.ok(block.includes(needle), needle);
  }
});

test('publish plays the build on record before the upload', () => {
  const text = read('commands/publish.md');
  const i = text.indexOf('**Played on record.**');
  assert.ok(i > -1 && i < text.indexOf('**The files.**'));
  assert.ok(text.slice(i).includes('`play_gate_missing`'));
});

test('polish step 1e runs the play gate after the contact sheet and before the pre-publish check', () => {
  const text = read('skills/phases/polish/SKILL.md');
  const sheet = text.indexOf('1d. **Contact sheet');
  const gate = text.indexOf('1e. **Play gate — `play_gate({gameDir, buildId, desktop, phone})`**');
  const pre = text.indexOf('2. **Pre-publish check');
  assert.ok(sheet > -1 && sheet < gate && gate < pre);
  assert.ok(text.slice(gate, pre).includes('`play_review`'));
});
