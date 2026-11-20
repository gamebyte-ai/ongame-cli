// Six game-design rules are on by default in /make-game: capacity, waiting and blocked states, caps in play,
// an odds model before the levels, phone sizes, and a rival study that is applied. They live in an always-read
// section of make-game.md and in skills/game-design/SKILL.md, never only in a phase skill (phases are not run).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const section = () => {
  const text = read('commands/make-game.md');
  const start = text.indexOf("## Design the game's rules before its content");
  const end = text.indexOf('## Work and verify');
  assert.ok(start > -1, 'make-game has the design-rules section');
  assert.ok(end > start, 'the section comes before Work and verify');
  return text.slice(start, end);
};

test('make-game applies the six rules by default, not as a phase', () => {
  const part = section();
  assert.ok(part.includes('Every new game, and every change to a game\'s rules, levels, layout or economy, follows'));
  assert.ok(part.includes('`skills/game-design/SKILL.md`'));
  assert.ok(part.includes('It is on by\ndefault, not a phase or an approval gate.'));
  for (const needle of [
    '1. **Capacity:**',
    '2. **Waiting and blocked:**',
    '3. **Caps in play:**',
    '4. **Odds model first:**',
    '5. **Phone sizes:**',
    '6. **Rival study, applied:**',
    '`docs/GAME_DESIGN.md`',
  ]) {
    assert.ok(part.includes(needle), needle);
  }
});

test('the design rules are read before levels and game-rule code', () => {
  const text = read('commands/make-game.md');
  const rules = text.indexOf("## Design the game's rules before its content");
  // The always-read mode statement still says phase skills are not invoked, so the rules cannot live there.
  assert.ok(text.indexOf('The phase skills and `workflows/build.js` remain available as definitions, but are not automatically invoked.') > -1);
  assert.ok(rules > -1 && rules < text.indexOf('Before writing a game rule'), 'rules come before the mechanic search');
});

test('the game-design skill states each rule with numbers and its checks', () => {
  const skill = read('skills/game-design/SKILL.md');
  assert.match(skill, /^---\nname: game-design\ndescription: Before writing the rules, levels, layout or economy of a game/);
  for (const needle of [
    '**On by default.**',
    '## 1. Every container has a capacity',
    'a test checks that a full container refuses',
    '## 2. When a piece waits or is blocked',
    'A waiting area has its own capacity',
    '## 3. Caps on what is in play',
    '## 4. An odds model before the levels',
    'the chance a deal can be solved',
    'Build the difficulty curve from them',
    'Tuning levels by trial alone, with no model, is not enough.',
    '## 5. Sizes and readability on phones',
    'at least 44x44 px',
    'differ by more than colour',
    '## 6. Study rival games, then apply what they show',
    'study at least three popular games in the same genre',
    'A study that changes nothing in\n  the game is not done.',
    'do not fill the table from memory',
  ]) {
    assert.ok(skill.includes(needle), needle);
  }
});

test('the skill ships to outside users: generic text only', () => {
  const skill = read('skills/game-design/SKILL.md');
  for (const word of ['gamebyte', 'fleet', 'board item', 'Can ', 'i_']) {
    assert.ok(!skill.includes(word), `no internal word: ${word}`);
  }
});

test('the skill is pinned in the lock and the release names it', () => {
  const lock = JSON.parse(read('skills/SKILLS.lock.json'));
  assert.ok(lock.skills['game-design'], 'game-design is in SKILLS.lock.json');
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.78', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.78 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.78'));
});
