// The sound rule from ongame PR 1081: every game's sounds fit the game and feel good, never 8-bit unless the game
// is retro or pixel. Makers on this public plugin follow these two files, so the rule must be in both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('make-game carries the sound rule', () => {
  const text = read('commands/make-game.md');
  for (const needle of ['Sound fits the game and feels good', 'No 8-bit sound', 'retro or pixel', 'pattern:audio-sound-design']) {
    assert.ok(text.includes(needle), needle);
  }
});

test('the audio phase asks for game-fitting, non-8-bit sound text', () => {
  const text = read('skills/phases/audio/SKILL.md');
  const i = text.indexOf('**Every `text` fits the game and feels good.**');
  assert.ok(i > -1);
  assert.ok(i < text.indexOf('## 3. Generation via the `sound_request` tool'));
  for (const needle of ['No 8-bit', 'retro or pixel', 'the listening check']) assert.ok(text.slice(i).includes(needle), needle);
});
