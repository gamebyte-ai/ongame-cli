// The music row from ongame PR 1110: the audio phase asks for background music only when the design has a music
// slot, through sound_request with music: true, one track per game. Makers on this public plugin follow this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('the audio phase adds a music row only when the design has a music slot', () => {
  const text = read('skills/phases/audio/SKILL.md');
  const i = text.indexOf('- **Ambient/music**: add the `music` row only when the design has a music slot');
  assert.ok(i > -1);
  assert.ok(i < text.indexOf('## 3. Generation via the `sound_request` tool'));
  assert.ok(text.slice(i).includes('A game without one gets no music row.'));
  assert.ok(!text.includes('a full `music` piece, **`loop: true`**'), 'the old loop:true music piece is gone');
});

test('Step 3 makes the music row with sound_request music: true, one track per game', () => {
  const text = read('skills/phases/audio/SKILL.md');
  const step = text.indexOf('## 3. Generation via the `sound_request` tool');
  const line = text.indexOf('call **`sound_request({ text, music: true, durationSeconds?, gameId? })`**');
  assert.ok(step > -1 && line > step && line < text.indexOf('## 4. Materialize'));
  assert.ok(text.slice(line, line + 300).includes('one background\n  track per game, not one per screen'));
});

test('the plugin version and the changelog name the release that carries it', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.79', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.79 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.79'));
});
