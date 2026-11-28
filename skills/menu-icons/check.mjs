#!/usr/bin/env node
/**
 * Checks that every bottom menu in a web game moves its icons part by part (SKILL.md next to this file).
 *
 *   node check.mjs <gameDir>     # exit 0 = pass, or no bottom menu; 1 = a menu fails (file:line); 2 = unreadable
 *
 * A menu is a `new BottomNav(...)` (template:shell-bottom-nav), or a `new BottomTabs(...)` drawn another way.
 * Test files (`*.test.*`, `*.spec.*`, `__tests__/`) are not read: they build a menu to test it, not to show it.
 * It passes when
 *   - a `new TabIconMotion(...)` takes that nav as its first argument: the `new BottomNav(...)` itself, `this.nav`
 *     in the same class, `nav` inside the scope that declares it, or an exported `nav` the driver's file imports; or
 *   - every tab in the nav's array literal passes `rig:` (a nav with a part player built in); or
 *   - for a `BottomTabs` drawn another way, the same file constructs a `PartPlayer` (or a `TabIconMotion`).
 * The copies apply.mjs wrote (they start with its MARKER) must equal this skill's copy, and a game that uses
 * `TabIconMotion` must have all three files. Code is read as a syntax tree, with the Babel parser the gradients
 * check bundles, so spacing, comments and type casts do not change the result. Only a file that names BottomNav,
 * BottomTabs, TabIconMotion or PartPlayer is parsed. One it cannot parse is named and the run exits 2 unless a menu
 * failed (1): an unread file is never a pass.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { FILES, MARKER, SHELL_DIR, shown, source } from './apply.mjs';

// @babel/parser 7.29.14, MIT: see skills/gradients/vendor/README.md.
const { parse } = createRequire(import.meta.url)('../gradients/vendor/babel-parser.cjs');

const EXTS = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs']);
// Capacitor's android/, ios/ and www/ hold copies of the built bundle.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '__tests__', 'android', 'ios', 'www']);
// A file that names none of these holds no menu and no driver, so it is not parsed.
const NAMES = /\b(?:BottomNav|BottomTabs|TabIconMotion|PartPlayer)\b/;
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

const CLASSES = new Set(['ClassDeclaration', 'ClassExpression']);
const SCOPES = new Set(['Program', 'BlockStatement', 'StaticBlock', 'FunctionDeclaration', 'FunctionExpression',
  'ArrowFunctionExpression', 'ClassMethod', 'ClassPrivateMethod', 'ObjectMethod']);
/** The nearest node above `node` whose type is in `types`. */
function enclosing(node, parents, types) {
  let n = parents.get(node);
  while (n && !types.has(n.type)) n = parents.get(n);
  return n ?? null;
}
const isThisMember = (n) => (n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression') && n.object.type === 'ThisExpression';

/**
 * Where a `new BottomNav()` is kept, so a driver can be matched to it and to no other nav of the same name:
 *   this    a class field or `this.nav = ...`: a driver taking `this.nav` in the same class
 *   var     `const nav = ...`: a driver taking `nav` inside the scope that declares it, or in a file that imports
 *           it when the declaration is exported
 *   name    any other named place (`ui.nav = ...`, `{ nav: ... }`): a driver taking that name in the same file
 */
function bindingOf(node, parents, exported) {
  let n = node, up = parents.get(n);
  while (up && WRAPPERS.has(up.type)) { n = up; up = parents.get(n); }
  if (!up) return null;
  if (up.type === 'VariableDeclarator' && up.init === n) {
    if (up.id.type !== 'Identifier') return null;
    return { kind: 'var', name: up.id.name, owner: enclosing(up, parents, SCOPES), exported: exported.has(up.id.name)
      && enclosing(up, parents, SCOPES)?.type === 'Program' };
  }
  if (up.type === 'AssignmentExpression' && up.right === n) {
    if (isThisMember(up.left)) return { kind: 'this', name: lastName(up.left), owner: enclosing(up, parents, CLASSES) };
    return lastName(up.left) ? { kind: 'name', name: lastName(up.left) } : null;
  }
  if ((up.type === 'ClassProperty' || up.type === 'ClassPrivateProperty') && up.value === n) {
    const name = keyName(up.key) ?? (up.key?.type === 'PrivateName' ? up.key.id.name : null);
    return name ? { kind: 'this', name, owner: enclosing(up, parents, CLASSES) } : null;
  }
  if (up.type === 'ObjectProperty' && up.value === n) return keyName(up.key) ? { kind: 'name', name: keyName(up.key) } : null;
  return null;
}
/** Names a module exports from its top level: `export const nav`, `export { nav }`. */
function exportsOf(program) {
  const out = new Set();
  for (const s of program.body) {
    if (s.type !== 'ExportNamedDeclaration' || s.source) continue;
    for (const d of s.declaration?.declarations ?? []) if (d.id.type === 'Identifier') out.add(d.id.name);
    for (const sp of s.specifiers ?? []) if (sp.local?.type === 'Identifier') out.add(sp.local.name);
  }
  return out;
}
/** Local names a module imports. */
function importsOf(program) {
  const out = new Set();
  for (const s of program.body) if (s.type === 'ImportDeclaration') for (const sp of s.specifiers) out.add(sp.local.name);
  return out;
}
function isInside(node, ancestor, parents) {
  for (let n = node; n; n = parents.get(n)) if (n === ancestor) return true;
  return false;
}
/** True when the driver takes this nav: the `new BottomNav()` itself, or the place it is kept (bindingOf). */
function drives(d, nav) {
  const arg = unwrap(d.arg);
  if (arg === nav.node) return true;
  const b = nav.binding, name = lastName(arg);
  if (!b || name !== b.name) return false;
  if (b.kind === 'this') return isThisMember(arg) && enclosing(d.node, d.parents, CLASSES) === b.owner && !!b.owner;
  if (b.kind === 'var') {
    if (arg.type !== 'Identifier') return false;
    if (d.file === nav.file) return !b.owner || isInside(d.node, b.owner, d.parents);
    return b.exported && d.imports.has(b.name);
  }
  return d.file === nav.file;
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
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const name = entry.name;
    if (SKIP_DIRS.has(name) || name.startsWith('.') || entry.isSymbolicLink()) continue;
    const full = join(path, name);
    if (entry.isDirectory()) files(full, acc);
    else if (entry.isFile() && EXTS.has(extname(name)) && !/\.d\.[cm]?ts$/.test(name) && !TEST_FILE.test(name)) acc.push(full);
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
    const rel = shown(dir, file);
    const buf = readFileSync(file);
    const text = lf(buf);
    if (FILES.includes(basename(file))) {
      if (text.startsWith(MARKER)) { copies.set(basename(file), [...(copies.get(basename(file)) ?? []), file]); continue; }
      own.add(basename(file));
    }
    if (!NAMES.test(text)) continue;
    let ast;
    try { ast = tree(text, file); } catch (e) {
      unread++;
      lines.push(`menu-icons-check: cannot read ${rel}: ${String(e?.message ?? e).split('\n')[0]}`);
      continue;
    }
    const parents = new Map();
    const all = walk(ast.program, parents);
    const declaresNav = all.some((n) => CLASSES.has(n.type) && n.id?.name === 'BottomNav');
    const exported = exportsOf(ast.program), imports = importsOf(ast.program);
    for (const n of all) {
      if (n.type !== 'NewExpression') continue;
      const at = { file, rel, line: n.loc?.start.line ?? 0, node: n, parents };
      if (newOf(n, 'BottomNav')) navs.push({ ...at, binding: bindingOf(n, parents, exported) });
      else if (newOf(n, 'BottomTabs') && !declaresNav) models.push(at);
      else if (newOf(n, 'TabIconMotion')) drivers.push({ ...at, arg: n.arguments[0], imports });
      else if (newOf(n, 'PartPlayer')) players.push(at);
    }
  }
  const failures = [];
  // A driver matches a nav it takes (drives). A nav kept where this cannot read (returned, passed on) is matched
  // by count, against the drivers no nav matched.
  const spare = drivers.filter((d) => !navs.some((n) => drives(d, n))).length;
  const unbound = navs.filter((n) => !n.binding && !drivers.some((d) => drives(d, n))).length;
  for (const nav of navs) {
    const driven = drivers.some((d) => drives(d, nav));
    const counted = !nav.binding && spare >= unbound;
    if (driven || counted || everyTabRigged(nav.node)) continue;
    failures.push(`FAIL ${nav.rel}:${nav.line} new BottomNav(...): its icons do not move part by part. Build each icon with `
      + `partedIcon and pass this nav to new TabIconMotion (skills/menu-icons/SKILL.md).`);
  }
  for (const m of models) {
    if (players.some((p) => p.file === m.file) || drivers.some((d) => d.file === m.file)) continue;
    failures.push(`FAIL ${m.rel}:${m.line} new BottomTabs(...): its icons do not move part by part. Drive each icon's parts `
      + `with a PartPlayer from src/shell/partMotion.ts (skills/menu-icons/SKILL.md).`);
  }
  for (const name of FILES) {
    for (const path of copies.get(name) ?? []) {
      if (lf(readFileSync(path)) !== lf(source(name))) {
        failures.push(`FAIL ${shown(dir, path)}: an older or edited copy. Run apply.mjs again; put the game's own clips in its own file.`);
      }
    }
    if (drivers.length && !copies.has(name) && !own.has(name)) {
      failures.push(`FAIL ${SHELL_DIR.split(sep).join('/')}/${name} is missing: run apply.mjs.`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
