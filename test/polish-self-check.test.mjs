// The polish skill must make the agent exercise the built game before the review judges it: open it with ?test=1,
// fix every `fail <name>` line and every feature with no line, then take the contact sheet the review reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../skills/phases/polish/SKILL.md', import.meta.url), 'utf8');
const at = (needle) => {
  const i = text.indexOf(needle);
  assert.ok(i > -1, `${needle} is missing from the polish skill`);
  return i;
};

test('the built game is opened with ?test=1 after the build and before the contact sheet', () => {
  const build = at('cd {gameDir} && npm run build');
  const selfCheck = at('1c. **Play every feature');
  const sheet = at('1d. **Contact sheet — `contact_sheet({gameDir})`**');
  assert.ok(build < selfCheck && selfCheck < sheet);
  const block = text.slice(selfCheck, sheet);
  assert.ok(block.includes('`preview_start({gameDir, built: true})`'));
  assert.ok(block.includes('`?test=1`'));
});

test('every fail line and every feature with no line is fixed', () => {
  const block = text.slice(at('1c. **Play every feature'), at('1d. **Contact sheet'));
  for (const needle of [
    '**Every `fail <name>` line is a bug.**',
    '**Every feature with no line is a bug too.**',
    '`GAME_DESIGN.md`',
    'pattern:gamelabs-self-check',
    'pattern:unity-self-check',
    'Go on only when every feature has a `pass` line.',
  ]) assert.ok(block.includes(needle), needle);
});

test('the contact sheet comes before publishing and before the review', () => {
  const sheet = at('`contact_sheet({gameDir})`');
  assert.ok(sheet < at('`publish_game({gameId'));
  assert.ok(sheet < at("call `phase_review({ phase:'polish'"));
});
