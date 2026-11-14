// The celebration and reward-art rule from ongame PR 1082: wins use rich, realistic layered particles, never flat
// primitive ones; coins and rewards are drawn in the game's own style, never a flat `$` coin; praise words sit
// tilted with their ribbon. Makers on this public plugin follow these four files, so the rule must be in each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('make-game carries the celebration and reward-art rule', () => {
  const text = read('commands/make-game.md');
  for (const needle of [
    'Wins look rich and rewards look like the game',
    'Never flat primitive particles',
    "game's own style",
    'Never a generic flat coin',
    'tilted together with the ribbon',
    'pattern:celebration-and-reward-art',
  ]) {
    assert.ok(text.includes(needle), needle);
  }
  // It sits with the other build rules, before the verification paragraph that closes them.
  assert.ok(text.indexOf('Wins look rich') < text.indexOf('Verify the behavior the user asked for'));
});

test('the concept phase makes the win moment one of the key frames', () => {
  const text = read('skills/phases/concept/SKILL.md');
  const i = text.indexOf('**The win moment is one of them.**');
  assert.ok(i > -1);
  for (const needle of ['never flat primitive', 'never a flat `$` coin', 'tilted with their ribbon']) {
    assert.ok(text.slice(i, i + 400).includes(needle), needle);
  }
});

test('the assets phase lists game-styled coins and celebration textures', () => {
  const text = read('skills/phases/assets/SKILL.md');
  assert.match(text, /\| \*\*Rewards \+ celebration\*\* \|[^\n]*never a flat `\$` coin[^\n]*praise ribbon \|/);
});

test('the polish phase asks for layered celebrations and checks the win screen', () => {
  const text = read('skills/phases/polish/SKILL.md');
  const juice = text.indexOf('## Sub-phase 5');
  const rule = text.indexOf('**Every burst, firework and confetti is rich and realistic');
  assert.ok(juice > -1 && rule > juice, 'the particle rule is inside Sub-phase 5');
  assert.ok(text.includes('pattern:celebration-and-reward-art'));
  assert.ok(text.includes('**The win screen always has a full layered celebration**'));
});
