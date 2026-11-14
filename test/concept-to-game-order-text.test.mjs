// In concept-to-game the assets phase runs before docs and code, and the first code build after the review is a
// continuation with no game code yet. The assets skill must cut from the concept screens without wiring code, and a
// continuation must still scaffold when the game has no code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const assetsCase = () => {
  const text = read('skills/phases/assets/SKILL.md');
  const i = text.indexOf('## Concept-to-game: you run BEFORE `docs` and `code`');
  const j = text.indexOf('> **GRAYBOX-FIRST — you run AFTER `code`**');
  assert.ok(i > -1 && i < j, 'the concept-to-game case sits before the graybox-first note');
  return { text, block: text.slice(i, j) };
};

test('the assets skill has a concept-to-game case that cuts from the concept screens', () => {
  const { block } = assetsCase();
  assert.ok(block.includes("In `concept-to-game` the order is research, concept,\nassets, docs"));
  assert.ok(block.includes('the path is `concept-to-game` AND `gameDir` has no game code yet'));
  assert.ok(block.includes('an\nassets run in a continuation follows the normal steps, §6 wiring included.'));
  assert.ok(block.includes('It has no `docs/GAME_DESIGN.md` either.'));
  assert.ok(block.includes("cut the assets from the concept screens recorded in `docs/CONCEPT.md`"));
  assert.ok(block.includes("knowledge_get({ key: 'pattern:concept-cut' })"));
  assert.ok(block.includes('not from `docs/GAME_DESIGN.md` (§1b)'));
});

test('the concept-to-game assets case wires no code and records the cut assets', () => {
  const { block } = assetsCase();
  assert.ok(block.includes('**No code wiring.** Skip §6.'));
  assert.ok(block.includes('Do not create `src/`, `public/assets/` or `src/assets.ts`, and do not scaffold.'));
  assert.ok(block.includes('write `docs/ASSETS.md`'));
  assert.ok(block.includes('skip `npx tsc --noEmit` and `preview_start`'));
});

test('the assets skill no longer says, without exception, that it runs after code', () => {
  const { text } = assetsCase();
  assert.ok(text.includes('> **GRAYBOX-FIRST — you run AFTER `code`** (every mode except `concept-to-game`).'));
  const description = text.split('\n').find((l) => l.startsWith('description:'));
  assert.ok(description.includes('concept-to-game'), 'the description names the exception');
  assert.ok(text.includes('Read `docs/GAME_DESIGN.md` (in `concept-to-game`, the concept screens instead'));
});

test('a continuation with no game code yet is told to scaffold', () => {
  const build = read('workflows/build.js');
  const i = build.indexOf('THIS IS A CONTINUATION');
  const j = build.indexOf('ONE EXCEPTION: if gameDir has no game code yet');
  assert.ok(i > -1 && j > i, 'the exception follows the continuation rule');
  assert.ok(build.slice(j, j + 400).includes('the code phase DOES ` +\n      `scaffold the engine first'));
});

test('the code skill scaffolds a continuation that has no game code yet', () => {
  const code = read('skills/phases/code/SKILL.md');
  const i = code.indexOf('## 2. Scaffold — STEP 0 (first on a NEW build, or a continuation with no game code yet; SKIPPED otherwise)');
  const j = code.indexOf('## 3. Routing');
  assert.ok(i > -1 && j > i);
  const block = code.slice(i, j);
  assert.ok(block.includes('**A continuation with NO game code yet DOES scaffold.**'));
  assert.ok(block.includes("SKIP THIS ENTIRE SECTION when the plan says `entry: 'continue'` and the game already has code"));
  assert.ok(block.includes('wire in the assets listed in `docs/ASSETS.md`'));
  assert.ok(block.indexOf('DOES scaffold') < block.indexOf('SKIP THIS ENTIRE SECTION'), 'the exception is read first');
});
