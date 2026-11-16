// The Unity play lines from ongame commands/make-game.md: a Unity game is played from its WebGL build in dist/,
// boots on `pass boot` and taps by `tapAt`. play_gate plays Unity WebGL builds from ongame-cli 0.2.42, so the
// changelog must name that version for makers on older CLIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('make-game plays a Unity game from its WebGL build', () => {
  const text = read('commands/make-game.md');
  for (const needle of ['-buildTarget WebGL', '`{gameDir}/dist`', '`pass boot`', 'tap by `tapAt`', 'pattern:unity-self-check',
    'Unity with no WebGL build support']) {
    assert.ok(text.includes(needle), needle);
  }
});

test('the changelog names the ongame-cli version that plays Unity WebGL builds', () => {
  // The Unity lines shipped in 1.7.71; later versions keep their own "Needs" line.
  const log = read('CHANGELOG.md');
  const start = log.indexOf('## 1.7.71 ');
  assert.ok(start > -1, 'CHANGELOG has a 1.7.71 section');
  const section = log.slice(start, log.indexOf('\n## ', start + 1));
  assert.ok(section.includes('Needs ongame-cli 0.2.42 or later'));
});
