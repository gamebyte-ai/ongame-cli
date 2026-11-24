// The fade check (skills/gradients/check.mjs) reads a game's code as a parsed syntax tree, not as text. The text
// check needed a new rule for each way of writing the same code. Every case below is written in a way it never
// learned: it got each one wrong. test/gradients-rule.test.mjs and its fixtures stay the pass bar for the rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scan } from '../skills/gradients/check.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = (...paths) => {
  const r = spawnSync(process.execPath, ['skills/gradients/check.mjs', ...paths], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};
const loop = (body) => `for (let i = 0; i < 20; i++) {\n${body}\n}`;
const contextFn = (before) => `function draw(ctx) {\n  ${before}\n  for (let i = 0; i < 20; i++) ctx.fillRect(0, 0, 100 - i * 4, 100 - i * 4);\n}`;

test('fades written in ways the text check never learned are reported', () => {
  const fades = {
    'a regex literal with a brace in the loop': loop(`  if (/}/.test(label)) continue;
  g.circle(0, 0, 100 - i * 4).fill({ color: 0xffffff, alpha: i / 20 });`),
    'a loop whose one statement is an if block': `for (let i = 0; i < 20; i++) if (show) { g.circle(0, 0, 100 - i * 4); g.fill({ color: 0xffffff, alpha: 0.05 }); }`,
    'a do ... while counter loop': `let i = 0;
do { g.circle(0, 0, 100 - i * 4).fill({ color: 0xffffff, alpha: 0.05 }); i++; } while (i < 20);`,
    'a Canvas style set through a string key in the loop': loop(`  ctx['globalAlpha'] = 0.02 + i / 40;
  ctx.fillRect(0, 0, 100 - i * 4, 100 - i * 4);`),
    'a style set before the loop through a non-null assertion': contextFn('ctx!.globalAlpha = 0.05;'),
    'a style set before the loop through a type cast': contextFn('(ctx as CanvasRenderingContext2D).globalAlpha = 0.05;'),
    'a write of another Canvas setting through a string key before the loop': contextFn(`ctx.globalAlpha = 0.05; ctx['imageSmoothingEnabled'] = false;`),
    'a shape and its fill on one object, one written with !': loop(`  this.g!.circle(0, 0, 100 - i * 4);
  this.g.fill({ color: 0xffffff, alpha: 0.05 });`),
  };
  for (const [name, src] of Object.entries(fades)) assert.equal(scan(src).length, 1, name);
});

test('a comment inside a fill is not part of its style', () => {
  for (const fill of ['0xffffff /* alpha: i / 20 */', '{ color: 0xffffff, /* alpha: 0.5, */ }']) {
    assert.deepEqual(scan(loop(`  g.circle(0, 0, 100 - i * 4).fill(${fill});`)), [], fill);
  }
});

test('the file type picks the parser, and a file that cannot be parsed is named and never passes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradient-check-'));
  try {
    writeFileSync(join(dir, 'menu.tsx'), `export const Menu = () => <div className="menu" />;
export function glow(g: { circle(x: number, y: number, r: number): any }): void {
  for (let i = 0; i < 20; i++) g.circle(0, 0, 100 - i * 4).fill({ color: 0xffffff, alpha: i / 20 });
}
`);
    const tsx = check(dir);
    assert.equal(tsx.code, 1, tsx.out);
    assert.match(tsx.out, /menu\.tsx:3: a fade made of stacked shapes/);

    writeFileSync(join(dir, 'broken.ts'), 'for (let i = 0; i < ; i++) {\n');
    const both = check(dir);
    assert.equal(both.code, 1, both.out);
    assert.match(both.out, /broken\.ts: cannot parse this file, so it was not checked/);
    assert.match(both.out, /1 stacked-shape fade in 1 file \(1 checked\).* 1 file could not be parsed and was not checked/);

    rmSync(join(dir, 'menu.tsx'));
    const broken = check(dir);
    assert.equal(broken.code, 2, broken.out);
    assert.match(broken.out, /no stacked-shape fade in 0 files\. 1 file could not be parsed .* Nothing unchecked is a pass/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the bundled parser is the pinned @babel/parser release, with its license', async () => {
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const vendor = new URL('../skills/gradients/vendor/', import.meta.url);
  const sha = (name) => createHash('sha256').update(readFileSync(new URL(name, vendor))).digest('hex');
  const readme = readFileSync(new URL('README.md', vendor), 'utf8');
  assert.ok(readme.includes(`\`${sha('babel-parser.cjs')}\``), 'README names the parser file sha256');
  assert.ok(readme.includes(`\`${sha('LICENSE')}\``), 'README names the license sha256');
  assert.match(readFileSync(new URL('LICENSE', vendor), 'utf8'), /Permission is hereby granted, free of charge/);
  assert.match(readFileSync(new URL('../NOTICE', import.meta.url), 'utf8'), /@babel\/parser 7\.29\.14/);
});
