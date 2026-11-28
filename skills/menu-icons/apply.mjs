#!/usr/bin/env node
/**
 * Writes the menu-icons motion code into a web game, next to the template's BottomNav:
 * src/shell/partMotion.ts, src/shell/partRoles.ts and src/shell/tabIconMotion.ts (copies of shell/ here).
 *
 *   node apply.mjs <gameDir>     # exit 0 = written or already current, 2 = refused or bad input (nothing written)
 *
 * A copy this script wrote starts with MARKER. A second run leaves a current copy alone and replaces an older one.
 * A file of the same name without MARKER is the game's own (a game may have its own partMotion.ts): the run
 * names it and stops before writing any file, so a game never ends up with half of one version.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FILES = Object.freeze(['partMotion.ts', 'partRoles.ts', 'tabIconMotion.ts']);
export const MARKER = '// ongame:menu-icons';
/** Where the copies go, relative to the game folder: beside the template's BottomNav.ts. */
export const SHELL_DIR = join('src', 'shell');

/** The skill's own copy of `file`. */
export const source = (file) => readFileSync(join(HERE, 'shell', file));

/** What a run would do to each file: 'new', 'current', 'update', or 'foreign' (the game's own file). */
export function plan(gameDir) {
  return FILES.map((file) => {
    const target = join(gameDir, SHELL_DIR, file);
    const want = source(file);
    if (!existsSync(target)) return { file, target, state: 'new', want };
    const have = readFileSync(target);
    if (have.equals(want)) return { file, target, state: 'current', want };
    return { file, target, state: have.toString('utf8').startsWith(MARKER) ? 'update' : 'foreign', want };
  });
}

/** Runs it. Returns the exit code and the lines to print. */
export function apply(gameDir) {
  const dir = resolve(gameDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(join(dir, 'src'))) {
    return { code: 2, lines: [`menu-icons: ${gameDir} is not a game folder (no src/)`] };
  }
  const steps = plan(dir);
  const foreign = steps.filter((s) => s.state === 'foreign');
  if (foreign.length) {
    return { code: 2, lines: [
      ...foreign.map((s) => `menu-icons: ${relative(dir, s.target)} is the game's own file; not overwritten`),
      'menu-icons: nothing written. Rename the game\'s file, or keep it and use its own player (check.mjs accepts that).',
    ] };
  }
  mkdirSync(join(dir, SHELL_DIR), { recursive: true });
  const lines = [];
  for (const s of steps) {
    if (s.state !== 'current') writeFileSync(s.target, s.want);
    const what = s.state === 'new' ? 'written' : s.state === 'update' ? 'updated' : 'already current';
    lines.push(`menu-icons: ${relative(dir, s.target)} ${what}`);
  }
  return { code: 0, lines };
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('-'));
  if (args.length !== 1 || argv.includes('--help') || argv.includes('-h')) {
    console.error('usage: node apply.mjs <gameDir>');
    return 2;
  }
  const { code, lines } = apply(args[0]);
  for (const l of lines) (code ? console.error : console.log)(l);
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
