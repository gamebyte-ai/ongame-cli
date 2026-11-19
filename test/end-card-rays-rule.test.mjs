// End-card light rays: they fade from bright at the centre to transparent at the edge, drawn with one radial
// gradient, never one flat colour. The play review flags flat rays. Makers follow these two files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('Sub-phase 8 gives the end-card rays a centre-to-edge radial gradient', () => {
  const text = read('skills/phases/polish/SKILL.md');
  const start = text.indexOf('## Sub-phase 8');
  const end = text.indexOf('## Sub-phase 9 ');
  assert.ok(start > -1 && end > start);
  const part = text.slice(start, end);
  for (const needle of [
    '**Light rays behind the card fade from bright at the centre to transparent at the edge.**',
    "type: 'radial'",
    "textureSpace: 'global'",
    'center: { x: 0, y: 0 }',
    '{ offset: 1, color: rgba(0) }',
    'Never fill rays with one flat colour',
  ]) {
    assert.ok(part.includes(needle), needle);
  }
});

test('the play review step flags rays that stay one flat colour', () => {
  const polish = read('skills/phases/polish/SKILL.md');
  const step = polish.indexOf('1e. **Play gate');
  const check = polish.indexOf('rays that keep one flat colour out to their tips are a failed');
  assert.ok(step > -1 && check > step && check < polish.indexOf('  2. **Pre-publish check'));
  const make = read('commands/make-game.md');
  const review = make.indexOf('then call `play_review` with what you saw.');
  assert.ok(review > -1);
  assert.ok(make.slice(review, review + 300).includes('keep one flat colour out to their tips'));
});

test('make-game states the gradient rule with the other win-screen rules', () => {
  const text = read('commands/make-game.md');
  const rule = text.indexOf('Light rays behind the end card fade from bright at the centre to transparent');
  assert.ok(rule > text.indexOf('Wins look rich'));
  assert.ok(rule < text.indexOf('Verify the behavior the user asked for'));
});

test('the plugin version and the changelog name the release that carries it', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.76', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.76 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.76'));
});
