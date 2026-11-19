// Ported from ongame: the phone layout is measured by play_gate's layout_fits, and a recalled lesson is
// reinforced only after a passed review or play. layout_fits first ships in ongame-cli 0.2.43, so the
// changelog must name that version for makers on older CLIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('make-game and polish point the phone layout rules at layout_fits', () => {
  const make = read('commands/make-game.md');
  for (const needle of ['`layout_fits` measures the phone layout at 360x640 and 390x844', 'window.__game.layout()']) {
    assert.ok(make.includes(needle), needle);
  }
  const polish = read('skills/phases/polish/SKILL.md');
  for (const needle of ['`nothing_offscreen`, `layout_fits` at 360x640 and 390x844', "fails `play_gate`'s `layout_fits`",
    'window.__game.layout()']) {
    assert.ok(polish.includes(needle), needle);
  }
  assert.ok(!polish.includes('the touch target is ≥44px'), 'polish no longer restates the 44 px rule');
});

test('a recalled lesson is reinforced only after a passed review or play', () => {
  const code = read('skills/phases/code/SKILL.md');
  assert.ok(code.includes("when this phase's review returns `verdict:'pass'`, or `play_gate` passes"));
  assert.ok(code.includes('A `revise` or a `skip` reinforces nothing.'));
  const make = read('commands/make-game.md');
  assert.ok(make.includes('When `play_gate` passes, call `brain_reinforce` once'));
  assert.ok(make.includes('A blocked or skipped play reinforces nothing.'));
  assert.ok(!make.includes('When a recalled lesson you applied\nheld up'), 'the old held-up rule is gone');
});

test('the changelog names the ongame-cli version that has layout_fits', () => {
  // 1.7.72 is the release that brought layout_fits; a later version bump must not move this check.
  const log = read('CHANGELOG.md');
  const start = log.indexOf('## 1.7.72 ');
  assert.ok(start > -1, 'CHANGELOG has a 1.7.72 section');
  const section = log.slice(start, log.indexOf('\n## ', start + 1));
  assert.ok(section.includes('Needs ongame-cli 0.2.43 or later'));
});
