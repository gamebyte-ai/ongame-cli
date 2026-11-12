// The code phase's final phase_review sends "every source file". The code skill supports four engines (gamelabs,
// Unity, Godot, native; skills/phases/code/SKILL.md §2), and Godot and native projects need not have `src/` or
// `Assets/`. A rule limited to those two folders sent a Godot game with project.godot + scripts/main.gd to review
// with zero files (ongame-cli PR 98 review). These checks keep the artifact rule naming each engine's own layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';

const text = readFileSync(new URL('../skills/phases/code/SKILL.md', import.meta.url), 'utf8');

function artifactRule() {
  const i = text.indexOf('**Independent quality check (advisory):**');
  assert.ok(i > -1, 'the Independent quality check bullet exists');
  const j = text.indexOf('**But a `\'skip\'` is not an approval', i);
  assert.ok(j > i, 'the artifact rule ends before the skip-reason rule');
  return text.slice(i, j);
}

test('the final artifact is not limited to src/ or Assets/', () => {
  const rule = artifactRule();
  assert.ok(!rule.includes('every source file under src/ or Assets/'), 'old two-folder rule is gone');
  assert.ok(rule.includes('every source file the game\'s engine builds from'));
});

test('the artifact rule names the source layout of every engine the skill supports', () => {
  const rule = artifactRule();
  // The engines the skill supports, from its scaffold section.
  for (const engine of ['engine="gamelabs"', 'engine="unity"', 'Godot, or a native project']) {
    assert.ok(text.includes(engine), `the skill supports ${engine}`);
  }
  for (const clause of [
    'gamelabs, everything under `src/`',
    'Unity, the C# scripts under `Assets/`',
    'Godot, every `.gd` and `.cs` script under the folder that holds `project.godot`',
    'native, every source file the project\'s own build compiles, read from its build file',
  ]) {
    assert.ok(rule.includes(clause), clause);
  }
  assert.ok(rule.includes('An empty artifact means you looked in the wrong place'));
});

// Select files the way the Godot clause says: the extensions and skipped folders are read from the rule's text,
// so a rewrite that drops one of them fails here.
function godotSelection(root, rule) {
  const clause = rule.slice(rule.indexOf('Godot, every'), rule.indexOf('; native,'));
  const exts = [...clause.matchAll(/`(\.[a-z]+)`/g)].map((m) => m[1]);
  const skip = [...clause.matchAll(/`(\.?[a-z]+)\/`/g)].map((m) => m[1]);
  assert.deepEqual(exts, ['.gd', '.cs']);
  assert.deepEqual(skip, ['.godot', 'addons']);
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (!skip.includes(e.name)) walk(p); }
      else if (exts.some((x) => e.name.endsWith(x))) out.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

test('a Godot game with project.godot and scripts/main.gd sends its script, not zero files', () => {
  const root = mkdtempSync(join(tmpdir(), 'godot-layout-'));
  try {
    writeFileSync(join(root, 'project.godot'), '[application]\n');
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts', 'main.gd'), 'extends Node\n');
    mkdirSync(join(root, '.godot'));
    writeFileSync(join(root, '.godot', 'cache.gd'), '');
    mkdirSync(join(root, 'addons', 'plugin'), { recursive: true });
    writeFileSync(join(root, 'addons', 'plugin', 'vendor.gd'), '');
    assert.deepEqual(godotSelection(root, artifactRule()), ['scripts/main.gd']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
