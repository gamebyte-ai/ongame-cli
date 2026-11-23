// The code phase asks the agent to pick a 2D or a 3D frame when it scaffolds a web game (ongame PR for card
// i_8dlt3tgz). A 2D frame is only safe with its one rule: every file imports the engine from the entry the App
// file uses. A file on the other entry typechecks clean and stops the game at boot, so the rule must ship with
// the choice, and the phases that teach full-entry modules must say what a 2D frame does instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
// One line of prose: quote markers at line starts and line wraps are layout, not text.
const flat = (s) => s.replace(/^>\s?/gm, '').replace(/\s+/g, ' ');

test('the code phase asks for a frame on every gamelabs scaffold', () => {
  const text = flat(read('skills/phases/code/SKILL.md'));
  for (const needle of [
    'dimension=<"2d"|"3d">',
    'On gamelabs, pass `dimension` every time',
    '`"2d"` is the frame for a game drawn only in the 2D HUD',
    'Left out, it is `"3d"`.',
    'a gamelabs result without it came from an older CLI and is the 3D frame',
  ]) assert.ok(text.includes(needle), needle);
});

test('the code phase states the one-entry rule beside the scaffold call', () => {
  const text = flat(read('skills/phases/code/SKILL.md'));
  const call = text.indexOf('dimension=<"2d"|"3d">');
  const rule = text.indexOf('**One engine entry per game.**');
  const install = text.indexOf('Then **`deps_install(gameDir=<gameDir>)`**');
  assert.ok(call > -1 && call < rule && rule < install, 'the rule sits between the scaffold call and deps_install');
  const block = text.slice(rule, install);
  for (const needle of ['`@gamebyte/gamelabsjs` on 3D, `@gamebyte/gamelabsjs/core` on 2D', 'typechecks clean and stops the game at boot', 'On a continuation, read that line first.']) {
    assert.ok(block.includes(needle), needle);
  }
});

test('the polish and audio phases say which ready-made modules stop a 2D frame', () => {
  const polish = flat(read('skills/phases/polish/SKILL.md'));
  const summary = polish.indexOf('**gamelabs primitive summary (the Lego to compose):**');
  const note = polish.indexOf('On a 2D frame');
  assert.ok(summary > -1 && note > summary && note < polish.indexOf('- **Screen/menu:**'), 'the note opens the primitive summary');
  assert.ok(polish.slice(note).startsWith('On a 2D frame (`src/<Name>App.ts` imports `@gamebyte/gamelabsjs/core`) the ready-made `MainScreenBinding`, `SettingsBinding` and `UIComponentsBinding` stop the boot.'));
  assert.ok(polish.slice(note, note + 400).includes('Particles and the timeline work.'));

  const audio = flat(read('skills/phases/audio/SKILL.md'));
  const line = audio.indexOf('this.addModule(new SettingsBinding({ audioFields: true }));');
  assert.ok(line > -1);
  assert.ok(audio.slice(line, line + 400).includes('`SettingsBinding` stops the boot: keep the same four fields in the game\'s own settings state'));
});

test('the plugin version, lock and changelog name the release that adds these lines', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.91', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.91 or later`);
  assert.equal(JSON.parse(read('skills/SKILLS.lock.json')).pluginVersion, version);
  const changelog = read('CHANGELOG.md');
  const i = changelog.indexOf('## 1.7.91 ');
  assert.ok(i > -1, 'the changelog has an entry for 1.7.91');
  const entry = changelog.slice(i, changelog.indexOf('\n## ', i + 1));
  for (const needle of ['`dimension`', 'the CLI release after `cli-v0.2.50`', 'test/scaffold-dimension-text.test.mjs']) assert.ok(entry.includes(needle), needle);
});
