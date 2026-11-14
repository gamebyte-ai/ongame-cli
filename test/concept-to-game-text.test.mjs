// A new game starts in concept-to-game: research, concept screens, game-ready assets, docs, then the maker's review
// before any code. Other modes stay reachable, and a continuation keeps its game's path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const section = () => {
  const text = read('commands/make-game.md');
  const i = text.indexOf('## A new game starts with a concept review');
  const j = text.indexOf('## Keep the game\'s identity and record its phases');
  assert.ok(i > -1 && i < j, 'the concept-review section sits before game registration');
  return text.slice(i, j);
};

test('a new game with no clear mode signal uses concept-to-game', () => {
  const block = section();
  assert.ok(block.includes('A new game (`entry: "new"`) uses `path: "concept-to-game"` unless the maker clearly asked for another mode.'));
  assert.ok(block.includes('"a cozy farming\ngame" is no such signal'));
});

test('a clear ask for another mode keeps that mode', () => {
  const block = section();
  for (const mode of ['`prototype`', '`production`', '`playable-ad`', '`concept-only`']) assert.ok(block.includes(mode), mode);
});

test('concept-to-game registers research, concept, assets, docs in order and stops before code', () => {
  const block = section();
  assert.ok(block.includes('`plan.phases: ["research", "concept", "assets", "docs"]`'));
  const steps = ['1. `research`', '2. `concept`', '3. `assets`', '4. `docs`', 'stop for the maker\'s review before any code'];
  let at = -1;
  for (const s of steps) { const k = block.indexOf(s); assert.ok(k > at, s); at = k; }
  assert.ok(block.includes('Write no game\ncode before the maker answers.'));
  assert.ok(block.includes('`skip: {reason}`'));
  assert.ok(block.includes('pattern:concept-cut') && block.indexOf("pattern:concept-cut") < block.indexOf('`assets_materialize`'), 'cut the screens before materializing');
});

test('a continuation keeps its game\'s path', () => {
  const block = section();
  assert.ok(block.includes('`entry: "continue"`') && block.includes('`continues` set to this `buildId`'));
  assert.ok(block.includes('A continuation keeps its game\'s `path`.'));
  assert.ok(block.includes('`intent: "derive"`'), 'a derived playable ad may still change the path');
  assert.ok(block.includes('Never switch an existing game to `concept-to-game`.'));
});

test('the intake reference lists concept-to-game as the fifth mode', () => {
  const text = read('skills/intake/SKILL.md');
  assert.ok(text.includes('## The five output MODES (judge which one)'));
  assert.ok(text.includes('(concept-to-game / concept-only / prototype / production / playable-ad)'));
});
