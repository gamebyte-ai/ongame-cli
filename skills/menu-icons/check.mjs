#!/usr/bin/env node
/**
 * Checks that every bottom menu in a web game moves its icons part by part (SKILL.md next to this file).
 *
 *   node check.mjs <gameDir>     # exit 0 = pass, or no bottom menu; 1 = a menu fails (file:line); 2 = unreadable
 *
 * A menu is a `new BottomNav(...)` (template:shell-bottom-nav), or a `new BottomTabs(...)` drawn another way.
 * Test files (`*.test.*`, `*.spec.*`, `__tests__/`) are not read: they build a menu to test it, not to show it.
 * It passes when
 *   - a `new TabIconMotion(...)` takes that nav as its first argument (the same name, `nav` or `this.nav`); or
 *   - every tab in the nav's array literal passes `rig:` (a nav with a part player built in); or
 *   - for a `BottomTabs` drawn another way, the game constructs its own `PartPlayer`.
 * The copies apply.mjs wrote (they start with its MARKER) must equal this skill's copy, and a game that uses
 * `TabIconMotion` must have all three files. Code is read as a syntax tree, with the Babel parser the gradients
 * check bundles, so spacing, comments and type casts do not change the result. A file it cannot parse is named and
 * the run exits 2 unless a menu failed (1): an unread file is never a pass.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { FILES, MARKER, source } from './apply.mjs';

// @babel/parser 7.29.14, MIT: see skills/gradients/vendor/README.md.
const { parse } = createRequire(import.meta.url)('../gradients/vendor/babel-parser.cjs');

const EXTS = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '__tests__']);
// Tests build a BottomTabs to test the model, not to draw a menu.
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const NOT_CODE = new Set(['loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens', 'errors']);
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion',
  'ParenthesizedExpression', 'TypeCastExpression']);
const lf = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');

function tree(src, file) {
  const ext = extname(file);
  const tries = ext === '.ts' || ext === '.mts' ? [['typescript']] : ext === '.tsx' ? [['typescript', 'jsx']]
    : [['jsx'], ['typescript', 'jsx']];
  let first;
  for (const plugins of tries) {
    try { return parse(src, { sourceType: 'unambiguous', plugins: [...plugins, 'decorators-legacy'] }); } catch (e) { first ??= e; }
  }
  throw first;
}

/** Every node under `root`, with its parent recorded in `parents`. */
function walk(root, parents) {
  const out = [];
  const visit = (n, parent) => {
    if (parent) parents.set(n, parent);
    out.push(n);
    for (const key of Object.keys(n)) {
      if (NOT_CODE.has(key)) continue;
      const v = n[key];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') visit(c, n); }
      else if (v && typeof v.type === 'string') visit(v, n);
    }
  };
  visit(root, null);
  return out;
}
const unwrap = (n) => { while (n && WRAPPERS.has(n.type)) n = n.expression; return n; };
/** The last name of a name or member path: `nav`, `this.nav`, `ui['nav']` all give 'nav'. */
function lastName(n) {
  n = unwrap(n);
  if (!n) return null;
  if (n.type === 'Identifier') return n.name;
  if ((n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression')) {
    if (!n.computed && n.property.type === 'Identifier') return n.property.name;
    if (n.property.type === 'StringLiteral') return n.property.value;
  }
  return null;
}
const newOf = (n, name) => n.type === 'NewExpression' && lastName(n.callee) === name;
const keyName = (k) => (k?.type === 'Identifier' ? k.name : k?.type === 'StringLiteral' ? k.value : null);

/** The name a `new X()` is kept under: `const nav = ...`, `this.nav = ...`, `nav: ...`, `private nav = ...`. */
function bindingOf(node, parents) {
  let n = node, up = parents.get(n);
  while (up && WRAPPERS.has(up.type)) { n = up; up = parents.get(n); }
  if (!up) return null;
  if (up.type === 'VariableDeclarator' && up.init === n) return up.id.type === 'Identifier' ? up.id.name : null;
  if (up.type === 'AssignmentExpression' && up.right === n) return lastName(up.left);
  if ((up.type === 'ClassProperty' || up.type === 'ClassPrivateProperty' || up.type === 'ObjectProperty') && up.value === n) {
    return keyName(up.key) ?? (up.key?.type === 'PrivateName' ? up.key.id.name : null);
  }
  return null;
}

/** True when the nav's first argument is an array literal whose every tab object passes `rig:`. */
function everyTabRigged(nav) {
  const list = unwrap(nav.arguments[0]);
  if (list?.type !== 'ArrayExpression' || !list.elements.length) return false;
  return list.elements.every((e) => {
    const o = unwrap(e);
    return o?.type === 'ObjectExpression' && o.properties.some((p) => p.type === 'ObjectProperty' && keyName(p.key) === 'rig');
  });
}

function files(path, acc = []) {
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = join(path, name);
    if (statSync(full).isDirectory()) files(full, acc);
    else if (EXTS.has(extname(name)) && !/\.d\.[cm]?ts$/.test(name) && !TEST_FILE.test(name)) acc.push(full);
  }
  return acc;
}

/** Reads the game. Returns the exit code and the lines to print. */
export function check(gameDir) {
  const dir = resolve(gameDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return { code: 2, lines: [`menu-icons-check: ${gameDir} is not a folder`] };
  const root = existsSync(join(dir, 'src')) ? join(dir, 'src') : dir;
  const lines = [];
  const navs = [], models = [], drivers = [], players = [];
  const copies = new Map(); // file name -> paths of copies apply.mjs wrote
  const own = new Set(); // file names the game has its own version of
  let unread = 0;
  for (const file of files(root)) {
    const rel = relative(dir, file);
    const buf = readFileSync(file);
    const text = lf(buf);
    if (FILES.includes(basename(file))) {
      if (text.startsWith(MARKER)) { copies.set(basename(file), [...(copies.get(basename(file)) ?? []), file]); continue; }
      own.add(basename(file));
    }
    let ast;
    try { ast = tree(text, file); } catch (e) {
      unread++;
      lines.push(`menu-icons-check: cannot read ${rel}: ${String(e?.message ?? e).split('\n')[0]}`);
      continue;
    }
    const parents = new Map();
    const all = walk(ast.program, parents);
    const declaresNav = all.some((n) => (n.type === 'ClassDeclaration' || n.type === 'ClassExpression') && n.id?.name === 'BottomNav');
    for (const n of all) {
      const at = { rel, line: n.loc?.start.line ?? 0, node: n };
      if (newOf(n, 'BottomNav')) navs.push({ ...at, name: bindingOf(n, parents) });
      else if (newOf(n, 'BottomTabs') && !declaresNav) models.push(at);
      else if (newOf(n, 'TabIconMotion')) drivers.push({ ...at, arg: n.arguments[0] });
      else if (newOf(n, 'PartPlayer')) players.push(at);
    }
  }
  const failures = [];
  // A driver matches a nav by the nav's name, or by taking the `new BottomNav(...)` itself. A nav kept under no
  // name this can read (returned, passed on) is matched by count, against the drivers no other nav matched.
  const navNames = new Set(navs.map((n) => n.name).filter(Boolean));
  const driverNames = new Set(drivers.map((d) => lastName(d.arg)).filter(Boolean));
  const spare = drivers.filter((d) => !navNames.has(lastName(d.arg)) && !navs.some((n) => unwrap(d.arg) === n.node)).length;
  const unnamed = navs.filter((n) => !n.name && !drivers.some((d) => unwrap(d.arg) === n.node)).length;
  for (const nav of navs) {
    const inline = drivers.some((d) => unwrap(d.arg) === nav.node);
    const named = !!nav.name && driverNames.has(nav.name);
    const counted = !nav.name && spare >= unnamed;
    if (inline || named || counted || everyTabRigged(nav.node)) continue;
    failures.push(`FAIL ${nav.rel}:${nav.line} new BottomNav(...): its icons do not move part by part. Build each icon with `
      + `partedIcon and pass this nav to new TabIconMotion (skills/menu-icons/SKILL.md).`);
  }
  for (const m of models) {
    if (players.length || drivers.length) continue;
    failures.push(`FAIL ${m.rel}:${m.line} new BottomTabs(...): its icons do not move part by part. Drive each icon's parts `
      + `with a PartPlayer from src/shell/partMotion.ts (skills/menu-icons/SKILL.md).`);
  }
  for (const name of FILES) {
    for (const path of copies.get(name) ?? []) {
      if (lf(readFileSync(path)) !== lf(source(name))) {
        failures.push(`FAIL ${relative(dir, path)}: an older or edited copy. Run apply.mjs again; put the game's own clips in its own file.`);
      }
    }
    if (drivers.length && !copies.has(name) && !own.has(name)) {
      failures.push(`FAIL src/shell/${name} is missing: run apply.mjs.`);
    }
  }
  lines.push(...failures);
  if (!navs.length && !models.length) lines.push('menu-icons-check: no bottom menu in this game; nothing to check.');
  else if (!failures.length) lines.push(`menu-icons-check: ${navs.length + models.length} bottom menu(s), every icon moves part by part.`);
  if (unread) lines.push(`menu-icons-check: ${unread} file(s) not read; that is not a pass.`);
  return { code: failures.length ? 1 : unread ? 2 : 0, lines };
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('-'));
  if (args.length !== 1 || argv.includes('--help') || argv.includes('-h')) {
    console.error('usage: node check.mjs <gameDir>');
    return 2;
  }
  const { code, lines } = check(args[0]);
  for (const l of lines) (code ? console.error : console.log)(l);
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
