// The code phase asks the agent to pick a 2D or a 3D frame when it scaffolds a web game (ongame PR for card
// i_8dlt3tgz). The App file's engine entry is the frame. From gamelabs.js 4.2.4 the other files of a 2D game may
// import the full entry's ready-made modules (ongame PR 1356, card i_3zyks788). On an older engine such an import
// typechecks clean and stops the game at boot, so the phases that teach those modules name the version.
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
    'A 2D game stays `"2d"` when it uses the engine\'s ready-made main screen',
    'Left out, it is `"3d"`.',
    'a gamelabs result without it came from an older CLI and is the 3D frame',
  ]) assert.ok(text.includes(needle), needle);
});

test('the code phase says the App file holds the frame, beside the scaffold call', () => {
  const text = flat(read('skills/phases/code/SKILL.md'));
  assert.ok(!text.includes('One engine entry per game'), 'the old one-entry rule is gone');
  const call = text.indexOf('dimension=<"2d"|"3d">');
  const rule = text.indexOf('**The App file holds the frame.**');
  const install = text.indexOf('Then **`deps_install(gameDir=<gameDir>)`**');
  assert.ok(call > -1 && call < rule && rule < install, 'the rule sits between the scaffold call and deps_install');
  const block = text.slice(rule, install);
  for (const needle of [
    '`GamelabsApp` from `@gamebyte/gamelabsjs` on 3D and from `@gamebyte/gamelabsjs/core` on 2D',
    'on gamelabs.js 4.2.4 or later',
    'typecheck clean and stop the game at boot',
    'On a continuation, read the engine version first.',
  ]) {
    assert.ok(block.includes(needle), needle);
  }
});

test('the polish and audio phases import the ready-made modules from the full entry on 4.2.4 or later', () => {
  const polish = flat(read('skills/phases/polish/SKILL.md'));
  const summary = polish.indexOf('**gamelabs primitive summary (the Lego to compose):**');
  const note = polish.indexOf('On a 2D frame');
  assert.ok(summary > -1 && note > summary && note < polish.indexOf('- **Screen/menu:**'), 'the note opens the primitive summary');
  assert.ok(polish.slice(note).startsWith('On a 2D frame (`src/<Name>App.ts` imports `@gamebyte/gamelabsjs/core`) the App keeps `GamelabsApp` from `/core`. Import the modules below from `@gamebyte/gamelabsjs`.'));
  assert.ok(polish.slice(note, note + 400).includes('`UIComponentsBinding` need gamelabs.js 4.2.4 or later there.'));

  const audio = flat(read('skills/phases/audio/SKILL.md'));
  const line = audio.indexOf('this.addModule(new SettingsBinding({ audioFields: true }));');
  assert.ok(line > -1);
  assert.ok(audio.slice(line, line + 400).includes('import `SettingsBinding` from `@gamebyte/gamelabsjs`. It needs gamelabs.js 4.2.4 or later there'));
});

test('the plugin version, lock and changelog name the release that adds these lines', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.100', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.100 or later`);
  assert.equal(JSON.parse(read('skills/SKILLS.lock.json')).pluginVersion, version);
  const changelog = read('CHANGELOG.md');
  const i = changelog.indexOf('## 1.7.91 ');
  assert.ok(i > -1, 'the changelog has an entry for 1.7.91');
  const entry = changelog.slice(i, changelog.indexOf('\n## ', i + 1));
  for (const needle of ['`dimension`', 'the CLI release after `cli-v0.2.50`', 'test/scaffold-dimension-text.test.mjs']) assert.ok(entry.includes(needle), needle);
});

test('the changelog names the release that lets a 2D frame use the ready-made modules', () => {
  const changelog = read('CHANGELOG.md');
  const i = changelog.indexOf('## 1.7.100 ');
  assert.ok(i > -1, 'the changelog has an entry for 1.7.100');
  const entry = changelog.slice(i, changelog.indexOf('\n## ', i + 1));
  for (const needle of ['gamelabs.js 4.2.4', 'test/scaffold-dimension-text.test.mjs']) assert.ok(entry.includes(needle), needle);
});
