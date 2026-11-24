#!/usr/bin/env node
/**
 * Puts the onGame analytics shim v2 into a web game and writes its privacy page. Safe to run again: a second run
 * with the same inputs changes no file.
 *
 *   node upgrade.mjs <gameDir> [--shim <v2 telemetry.ts>] [--audience general|children] [--title <game title>] [--opt-out yes|no]
 *   node upgrade.mjs --check <gameDir>      # exit 0 when the shim is v2 and the privacy page is current
 *
 * What it does, in order:
 * 1. Audience. The answer to "is this game aimed at children?" is kept in .ongame/analytics.json. Without that
 *    file and without --audience it stops with exit 3, so the caller asks the maker once and runs it again.
 * 2. Shim. --shim names the v2 src/telemetry.ts (from a fresh scaffold). It must export every v2 call. Every name
 *    the game imports from its telemetry module must still be exported, or nothing is written (exit 2). The old
 *    file is kept in .ongame/archive/ before it is replaced. Without --shim the game's own file must already be v2.
 * 3. A children's game: the telemetry block in index.html is removed, so no id is ever made.
 * 4. Privacy page. public/privacy.html lists exactly the events in events.json (the build copies public/ to the
 *    site root, so it is served at /privacy.html). A privacy.html the maker wrote, with no onGame marker, is kept.
 *    The page promises an analytics switch only when the maker said the player has one (--opt-out yes, kept in
 *    .ongame/analytics.json). A setConsent call alone is no switch: a game may call setConsent(true) at start.
 * 5. A game with that switch must apply the player's saved answer before the deployed SDK starts, because the SDK
 *    sends what an earlier visit left queued while it starts. That needs a shim that keeps a setConsent(false) made
 *    before the SDK exists, and a setConsent(<saved answer>) in the boot module before its first await. The run
 *    names what is missing in a note; --check fails on it.
 *
 * Exit codes: 0 done (or --check passed), 1 --check failed, 2 refused (nothing written), 3 audience unknown,
 * 4 the shim is not v2 (the audience and privacy page are still saved; the shim is left as it was),
 * 5 a children's game still holds telemetry this tool did not write (remove it, run again).
 * After exit 0 or 4 the last stdout line is a JSON summary: {audience, consentDefault, shim, privacy, changed}.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename, resolve, relative, sep, extname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// A path inside the game, with forward slashes on every OS, so messages read the same on Windows.
export const shownPath = (root, file, p = { relative, sep }) => p.relative(root, file).split(p.sep).join('/');

const REGISTRY = JSON.parse(readFileSync(join(HERE, 'events.json'), 'utf8'));
const PRIVACY_TEMPLATE = readFileSync(join(HERE, 'privacy.html'), 'utf8');
const PRIVACY_MARKER = '<!-- ongame:privacy v';

/** The v2 shim's calls (design section 4.1). The last three are the 1.x calls, which v2 keeps. */
export const V2_EXPORTS = [
  'setConsent', 'screen', 'tap', 'levelStart', 'levelEnd', 'economy', 'tutorial', 'track',
  'trackLevelStart', 'trackLevelComplete', 'trackLevelFail',
];

/** Consent default per audience. A children's game gets no analytics tag at all, so no id is ever made. */
const CONSENT_DEFAULT = { general: 'on', children: 'off' };

const sha8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Names a TypeScript/JavaScript module exports (function, const, let, class, `export { a, b as c }`). */
export function exportedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum|declare\s+(?:const|function))\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  if (/^\s*export\s+default\b/m.test(src)) names.add('default');
  return names;
}

function sourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(m?[jt]sx?)$/.test(entry)) out.push(p);
  }
  return out;
}

// Any specifier whose last part is `telemetry`, captured: relative paths and aliases such as '@/telemetry' alike.
// pointsAtShim then drops a relative one that lands on the game's own helper.
const TELEMETRY_SPEC = String.raw`['"]((?:[^'"\n]*/)?telemetry(?:\.[jt]s)?)['"]`;
const TELEMETRY_FROM = String.raw`from\s*` + TELEMETRY_SPEC;

// Where a relative import may land, in the order a bundler tries them.
const RESOLVE_EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'];

/**
 * The import names the shim, src/telemetry.ts. An alias or bare specifier ('@/telemetry') counts. A relative one counts
 * unless it lands on another file that exists, such as src/utils/telemetry.ts: that is the game's own helper.
 * A relative one that reaches the shim's path before any other file counts even when src/telemetry.ts does not exist
 * yet. A relative one that lands on nothing counts too, so a broken import is refused rather than waved through.
 */
export function pointsAtShim(spec, file, srcDir) {
  if (!/^\.\.?\//.test(spec)) return true;
  const shim = resolve(srcDir, 'telemetry.ts');
  const base = resolve(dirname(file), spec);
  // TypeScript ESM writes '../telemetry.js' for telemetry.ts, so try the path without its .js too.
  for (const b of new Set([base, base.replace(/\.m?js$/, '')])) {
    for (const ext of RESOLVE_EXT) {
      const p = b + ext;
      // The shim's own path counts before it exists: the upgrade may add src/telemetry.ts, and then it wins.
      if (p === shim) return true;
      if (existsSync(p) && statSync(p).isFile()) return false;
    }
  }
  return true;
}

const withoutComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// An import or re-export clause: no quote, `=`, parenthesis or other import/export, so a match never starts at an
// earlier declaration in a module without semicolons.
const CLAUSE = String.raw`(?:(?!\b(?:import|export)\b)[^;'"=()])*?`;

// Every source file but the shim itself. A helper elsewhere named telemetry is the game's own code and is checked.
function gameSources(srcDir) {
  const shim = join(srcDir, 'telemetry.ts');
  return sourceFiles(srcDir).filter((f) => f !== shim);
}

/**
 * Every name the game's code takes from its telemetry module, with the file that takes it: named, default and
 * namespace imports, and `export { ... } from` re-exports. `default` stands for a default import.
 */
export function importedNames(srcDir) {
  const used = new Map();
  const add = (name, file) => { if (!used.has(name)) used.set(name, file); };
  for (const file of gameSources(srcDir)) {
    const code = withoutComments(readFileSync(file, 'utf8'));
    // import('./telemetry') and require('./telemetry') hide which names they use: refuse rather than guess.
    for (const d of code.matchAll(new RegExp(String.raw`\b(?:import|require)\s*\(\s*` + TELEMETRY_SPEC, 'g'))) {
      if (pointsAtShim(d[1], file, srcDir)) add('(a dynamic import or require)', file);
    }
    for (const m of code.matchAll(new RegExp(String.raw`\b(import|export)\s+(?:type\s+)?(${CLAUSE})\s*` + TELEMETRY_FROM, 'g'))) {
      if (!pointsAtShim(m[3], file, srcDir)) continue;
      let clause = m[2].trim();
      const braces = clause.match(/\{([^}]*)\}/);
      if (braces) {
        for (const part of braces[1].split(',')) {
          const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
          if (name) add(name, file);
        }
        clause = clause.replace(braces[0], '');
      }
      const ns = clause.match(/\*\s*as\s+([A-Za-z_$][\w$]*)/);
      if (ns && m[1] === 'import') {
        for (const u of code.matchAll(new RegExp(String.raw`(?<![\w$.])${ns[1]}\s*\.\s*([A-Za-z_$][\w$]*)`, 'g'))) add(u[1], file);
        // Any other use (destructuring, T['name'], passing T on) hides which names it needs: refuse rather than guess.
        const uses = [...code.matchAll(new RegExp(String.raw`(?<![\w$.])${ns[1]}\b(?!\s*\.)`, 'g'))].length;
        if (uses > 1) add(`${ns[1]} (used other than as ${ns[1]}.name)`, file);
        clause = clause.replace(ns[0], '');
      }
      if (m[1] === 'import' && /^[A-Za-z_$][\w$]*/.test(clause.replace(/^[\s,]+/, ''))) add('default', file);
      // `export * from` passes every name on; its users are elsewhere, so refuse rather than guess.
      if (m[1] === 'export' && clause.startsWith('*')) add('* (a wildcard re-export)', file);
    }
  }
  return used;
}

/** The block telemetry_inject writes: its marker, the config script and the sdk.js tag. */
const TELEMETRY_BLOCK = /[ \t]*<!-- ongame-telemetry -->\s*<script>window\.__ONGAME_TELEMETRY__=[^<]*<\/script>\s*<script type="module" src="[^"]*\/sdk\.js"><\/script>\n?/g;
/**
 * Any onGame telemetry left in a page: its config, its marker, or an sdk.js tag served from an onGame or telemetry
 * address (any quoting, any query). Another vendor's sdk.js is not ours and stays.
 */
export const hasTelemetry = (html) => html.includes('__ONGAME_TELEMETRY__') || html.includes('<!-- ongame-telemetry -->') ||
  /<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*(?:ongame|telemetry)[^"'\s>]*sdk\.js(?:[?#][^"'\s>]*)?["']?/i.test(html);

/**
 * The game's code (not the shim) calls the shim's setConsent, under any name. This is no proof of a switch the player
 * can use (a game may call setConsent(true) at start), so it only prompts the --opt-out question.
 */
export function callsSetConsent(srcDir) {
  return gameSources(srcDir).some((f) => {
    const code = withoutComments(readFileSync(f, 'utf8'));
    const callers = [];
    for (const m of code.matchAll(new RegExp(String.raw`\bimport\s+(?:type\s+)?(${CLAUSE})\s*` + TELEMETRY_FROM, 'g'))) {
      const braces = m[1].match(/\{([^}]*)\}/);
      for (const part of braces ? braces[1].split(',') : []) {
        const [name, alias] = part.trim().split(/\s+as\s+/).map((x) => x.trim());
        if (name === 'setConsent') callers.push(alias || name);
      }
      const ns = m[1].match(/\*\s*as\s+([A-Za-z_$][\w$]*)/);
      if (ns) callers.push(`${ns[1]}\\s*\\.\\s*setConsent`);
    }
    return callers.some((c) => new RegExp(String.raw`(?<![\w$])${c}\s*\(`).test(code));
  });
}

// ---- The saved Analytics answer at boot ----

/**
 * The global the shim keeps a "no" in while the SDK does not exist yet; the SDK reads it before it sends anything.
 * Its name is shared with the onGame scaffold's src/telemetry.ts and the SDK.
 */
const EARLY_NO = '__ongameConsent';

/** The shim keeps a setConsent(false) made before the SDK starts. A comment that names the global is not code. */
export const keepsEarlyNo = (shim) => withoutComments(shim).includes(EARLY_NO);

/**
 * The module the page starts the game with: the first `<script type="module" src>` in index.html that names a file of
 * the game. A script from another origin, such as the deployed sdk.js, is not the game. With none, src/main.ts.
 */
export function bootModule(gameDir) {
  const indexPath = join(gameDir, 'index.html');
  const html = existsSync(indexPath) ? readFileSync(indexPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '') : '';
  for (const tag of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attr = (name) => {
      const m = tag[1].match(new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))`, 'i'));
      return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
    };
    const src = attr('src');
    if (attr('type')?.toLowerCase() !== 'module' || !src || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) continue;
    return join(gameDir, src.split(/[?#]/)[0].replace(/^\//, ''));
  }
  return join(gameDir, 'src', 'main.ts');
}

let babelParse;
/** The module's syntax tree, read with the parser the gradients check vendors. Throws when the code cannot be read. */
function syntaxTree(src, file) {
  // @babel/parser 7.29.14, MIT: see skills/gradients/vendor/README.md.
  babelParse ??= createRequire(import.meta.url)('../gradients/vendor/babel-parser.cjs').parse;
  const ext = extname(file);
  const tries = ext === '.ts' || ext === '.mts' ? [['typescript']] : ext === '.tsx' ? [['typescript', 'jsx']] : [['jsx'], ['typescript', 'jsx']];
  let first;
  for (const plugins of tries) {
    try { return babelParse(src, { sourceType: 'module', plugins: [...plugins, 'decorators-legacy'] }); } catch (e) { first ??= e; }
  }
  throw first;
}

// Nodes whose body does not run where they stand: it runs when something calls it, if ever.
const DEFERRED = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod',
  'ClassDeclaration', 'ClassExpression', 'ClassMethod', 'ClassPrivateMethod']);
// TypeScript nodes that hold run-time code; every other TS node is a type and runs nothing.
const TS_CODE = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion',
  'TSInstantiationExpression', 'TSEnumDeclaration', 'TSEnumMember', 'TSModuleDeclaration', 'TSModuleBlock',
  'TSExportAssignment']);
const NOT_CODE = new Set(['loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'comments', 'tokens', 'errors']);
const FUNCTION_VALUE = new Set(['FunctionExpression', 'ArrowFunctionExpression']);

/**
 * True when the module, as the browser runs it, calls the shim's setConsent with an answer before the code reaches an
 * await. The top level runs in order. A function declared in this module is followed into when it is called, up to
 * its own first await; the caller then goes on, since the rest of that function runs later. A top-level await ends it
 * all. Every branch of an if, a loop or a try is read in source order: a call in one counts, and an await in one ends
 * the walk there. A literal setConsent(true) is not the player's answer. Imported functions, methods and constructors
 * are not followed, so a call made only inside one of them does not count.
 */
export function appliesAnswerAtBoot(ast) {
  const names = new Set(); // what this module calls the shim's setConsent
  const spaces = new Set(); // `import * as T` of the shim: T.setConsent
  const declared = new Map(); // a name declared once in this module as a function → that function
  const twice = new Set();
  const declare = (name, fn) => { if (declared.has(name)) twice.add(name); else declared.set(name, fn); };
  const scan = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type' && /(?:^|\/)telemetry(?:\.[jt]s)?$/.test(node.source.value)) {
      for (const s of node.specifiers) {
        if (s.type === 'ImportNamespaceSpecifier') spaces.add(s.local.name);
        else if (s.type === 'ImportSpecifier' && s.importKind !== 'type' && (s.imported.name ?? s.imported.value) === 'setConsent') names.add(s.local.name);
      }
    }
    if (node.type === 'FunctionDeclaration' && node.id) declare(node.id.name, node);
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && FUNCTION_VALUE.has(node.init?.type)) declare(node.id.name, node.init);
    for (const child of children(node)) scan(child);
  };
  scan(ast.program);
  for (const name of twice) declared.delete(name);

  const isSetConsent = (callee) => (callee.type === 'Identifier' && names.has(callee.name)) ||
    ((callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && callee.object.type === 'Identifier' &&
      spaces.has(callee.object.name) && (callee.computed ? callee.property.value : callee.property.name) === 'setConsent');
  const isAnswer = (args) => args.length > 0 && !(args[0].type === 'BooleanLiteral' && args[0].value === true);

  const following = new Set();
  // 'found' once setConsent(answer) runs, 'await' when an await comes first, undefined when neither happened.
  const visit = (node) => {
    if (!node || typeof node.type !== 'string' || DEFERRED.has(node.type)) return undefined;
    if (node.type.startsWith('TS') && !TS_CODE.has(node.type)) return undefined;
    if (node.type === 'AwaitExpression') return visit(node.argument) ?? 'await';
    if (node.type === 'ForOfStatement' && node.await) return 'await';
    for (const child of children(node)) {
      const r = visit(child);
      if (r) return r;
    }
    if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return undefined;
    if (isSetConsent(node.callee) && isAnswer(node.arguments)) return 'found';
    const fn = FUNCTION_VALUE.has(node.callee.type) ? node.callee : node.callee.type === 'Identifier' ? declared.get(node.callee.name) : undefined;
    if (!fn || following.has(fn)) return undefined;
    following.add(fn);
    const r = visit(fn.body);
    following.delete(fn);
    return r === 'found' ? 'found' : undefined; // an await ends only that function; its caller goes on
  };
  for (const statement of ast.program.body) {
    const r = visit(statement);
    if (r) return r === 'found';
  }
  return false;
}

/** A node's children that are nodes, in source order. */
function children(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (NOT_CODE.has(key)) continue;
    const v = node[key];
    for (const c of Array.isArray(v) ? v : [v]) if (c && typeof c.type === 'string') out.push(c);
  }
  return out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

/** The module holds an await that runs while it is evaluated: one outside every function. */
function awaitsAtTopLevel(node) {
  if (!node || typeof node.type !== 'string' || DEFERRED.has(node.type)) return false;
  if (node.type === 'AwaitExpression' || (node.type === 'ForOfStatement' && node.await)) return true;
  return children(node).some(awaitsAtTopLevel);
}

/** The game file a relative import names, tried the way a bundler tries it; undefined for anything else. */
function resolveModule(fromDir, spec) {
  if (!/^\.\.?\//.test(spec)) return undefined;
  const base = resolve(fromDir, spec);
  for (const b of new Set([base, base.replace(/\.m?js$/, '')])) {
    for (const ext of RESOLVE_EXT) {
      const p = b + ext;
      if (/\.(m?[jt]sx?)$/.test(p) && existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  return undefined;
}

/**
 * The game files the boot module imports, directly or through others, that hold a top-level await: the boot module
 * runs only after it. Each comes with the error when it could not be read. Packages and aliases are not followed.
 */
function awaitedImports(bootFile, bootAst) {
  const out = [];
  const seen = new Set([bootFile]);
  const queue = [bootAst];
  const dirs = [dirname(bootFile)];
  while (queue.length) {
    const ast = queue.shift();
    const dir = dirs.shift();
    for (const node of ast.program.body) {
      const typeOnly = node.importKind === 'type' || node.exportKind === 'type';
      const spec = /^(?:Import|ExportNamed|ExportAll)Declaration$/.test(node.type) && !typeOnly ? node.source?.value : undefined;
      const file = spec && resolveModule(dir, spec);
      if (!file || seen.has(file)) continue;
      seen.add(file);
      let dep;
      try { dep = syntaxTree(readFileSync(file, 'utf8'), file); } catch (e) { out.push({ file, error: String(e.message).split('\n')[0] }); continue; }
      if (awaitsAtTopLevel(dep.program)) out.push({ file });
      queue.push(dep);
      dirs.push(dirname(file));
    }
  }
  return out;
}

/**
 * What a general game with an Analytics switch still lacks to apply the saved answer at boot, as lines for the maker's
 * agent. Empty when the shim keeps an early no and the boot module applies the answer before its first await.
 */
export function bootAnswerProblems(gameDir, shim) {
  const problems = [];
  if (!keepsEarlyNo(shim)) {
    problems.push('src/telemetry.ts drops a setConsent(false) made before analytics starts: it comes from an older scaffold. ' +
      'Update the onGame CLI to the release after cli-v0.2.50, then take src/telemetry.ts from a fresh scaffold (/analytics add, steps 1-2).');
  }
  const boot = bootModule(gameDir);
  const shown = shownPath(gameDir, boot);
  if (!existsSync(boot)) {
    problems.push(`${shown}, the boot module, is missing, so the saved Analytics answer at boot cannot be checked`);
    return problems;
  }
  let ast;
  try { ast = syntaxTree(readFileSync(boot, 'utf8'), boot); } catch (e) {
    problems.push(`${shown} cannot be read as code (${String(e.message).split('\n')[0]}), so the saved Analytics answer at boot cannot be checked`);
    return problems;
  }
  if (!appliesAnswerAtBoot(ast)) {
    problems.push(`${shown} does not apply the saved Analytics answer before its first await. Read the saved answer there and, ` +
      'when it is off, call setConsent(false) before the first await (in the template, before `await app.initialize()`).');
  }
  for (const { file, error } of awaitedImports(boot, ast)) {
    const dep = shownPath(gameDir, file);
    problems.push(error
      ? `${dep} cannot be read as code (${error}), so whether ${shown} runs after an await cannot be checked`
      : `${dep} has a top-level await, and ${shown} imports it, so the boot runs only after that await. Move the await into a function.`);
  }
  return problems;
}

export function renderPrivacy(title, audience, optOut) {
  let collection;
  if (audience === 'children') {
    collection = [
      '<h2>What the game collects</h2>',
      '<p>Nothing. This game is made for children, so it has no analytics: it sends no play data and stores no id',
      'on your device.</p>',
    ].join('\n');
  } else {
    const rows = REGISTRY.events.map((e) => `<tr><td><code>${esc(e.t)}</code></td><td>${esc(e.what)}</td></tr>`);
    collection = [
      '<h2>What the game collects</h2>',
      '<p>To learn which levels are too hard and which screens players use, the game records how it is played.',
      'Each record is linked to a random id the game makes on your device. The id is not your name, email or',
      'account, and it is not shared with advertisers. It is not used to track you across other apps or sites.</p>',
      '<table>',
      '<tr><th>Event</th><th>What it records</th></tr>',
      ...rows,
      '</table>',
      ...(optOut ? [
        '<h2>Your choice</h2>',
        "<p>You can turn analytics off in the game's settings. Turning it off deletes the records still waiting on your",
        'device and stops all sending.</p>',
      ] : []),
    ].join('\n');
  }
  const never = REGISTRY.never.map((n) => `  <li>${esc(n)}</li>`).join('\n');
  return PRIVACY_TEMPLATE.replaceAll('{{TITLE}}', esc(title)).replace('{{COLLECTION}}', collection).replace('{{NEVER}}', never);
}

function gameTitle(gameDir, given) {
  if (given) return given;
  const html = join(gameDir, 'index.html');
  if (existsSync(html)) {
    const m = readFileSync(html, 'utf8').match(/<title>([^<]*)<\/title>/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  const pkg = join(gameDir, 'package.json');
  if (existsSync(pkg)) {
    try { const name = JSON.parse(readFileSync(pkg, 'utf8')).name; if (name) return name; } catch { /* fall through */ }
  }
  return basename(gameDir);
}

function writeIfChanged(path, text) {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
}

function parseArgs(argv) {
  const opts = { check: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if (a === '--shim' || a === '--audience' || a === '--title' || a === '--opt-out') {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      opts[a === '--opt-out' ? 'optOut' : a.slice(2)] = v;
    } else rest.push(a);
  }
  if (rest.length !== 1) throw new Error('usage: upgrade.mjs [--check] <gameDir> [--shim <file>] [--audience general|children] [--title <t>] [--opt-out yes|no]');
  opts.gameDir = rest[0];
  if (opts.audience && !(opts.audience in CONSENT_DEFAULT)) throw new Error('--audience must be general or children');
  if (opts.optOut !== undefined && opts.optOut !== 'yes' && opts.optOut !== 'no') throw new Error('--opt-out must be yes or no');
  return opts;
}

export function run(argv, log = console.log) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { log(String(e.message)); return 2; }
  const { gameDir } = opts;
  if (!existsSync(join(gameDir, 'src'))) { log(`refused: ${gameDir} has no src/ folder; this command upgrades web games`); return 2; }

  const settingsPath = join(gameDir, '.ongame', 'analytics.json');
  let settings = null;
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { log('refused: .ongame/analytics.json is not valid JSON; fix or delete it'); return 2; }
  }
  const shimPath = join(gameDir, 'src', 'telemetry.ts');
  const privacyPath = join(gameDir, 'public', 'privacy.html');

  if (opts.check) {
    const problems = [];
    if (!settings) problems.push('audience not recorded (.ongame/analytics.json)');
    const shim = existsSync(shimPath) ? readFileSync(shimPath, 'utf8') : '';
    const missing = V2_EXPORTS.filter((n) => !exportedNames(shim).has(n));
    if (missing.length) problems.push(`src/telemetry.ts is not v2 (missing: ${missing.join(', ')})`);
    if (settings) {
      const page = existsSync(privacyPath) ? readFileSync(privacyPath, 'utf8') : '';
      const own = page && !page.includes(PRIVACY_MARKER);
      const html = existsSync(join(gameDir, 'index.html')) ? readFileSync(join(gameDir, 'index.html'), 'utf8') : '';
      if (settings.audience === 'children' && hasTelemetry(html)) problems.push('index.html still holds telemetry, but the game is for children');
      if (!own && page !== renderPrivacy(gameTitle(gameDir, settings.title), settings.audience, settings.optOut === true)) problems.push('public/privacy.html is missing or out of date');
      // The page promises that turning analytics off stops all sending: at boot, too.
      if (settings.audience === 'general' && settings.optOut === true && !missing.length) problems.push(...bootAnswerProblems(gameDir, shim));
    }
    for (const p of problems) log(`check: ${p}`);
    log(problems.length ? 'check: FAIL' : 'check: ok');
    return problems.length ? 1 : 0;
  }

  // 1. Audience: asked once, kept with the game.
  const audience = opts.audience ?? settings?.audience;
  if (!audience) {
    log('audience unknown: ask the maker once whether this game is aimed at children, then run again with --audience general|children');
    return 3;
  }

  // 2. Shim: check everything before writing anything.
  let shimState = 'unchanged';
  let nextShim = null;
  const current = existsSync(shimPath) ? readFileSync(shimPath, 'utf8') : null;
  const candidate = opts.shim ? readFileSync(opts.shim, 'utf8') : current;
  const missingV2 = V2_EXPORTS.filter((n) => !exportedNames(candidate ?? '').has(n));
  const notV2 = missingV2.length > 0;
  if (notV2) {
    // The audience and the privacy page are still saved: the served SDK sends its own events whatever the shim is.
    log(`not v2: ${opts.shim ?? 'src/telemetry.ts'} lacks ${missingV2.join(', ')}. Update the onGame CLI, then take src/telemetry.ts from a fresh scaffold.`);
    shimState = 'not-v2';
  } else if (candidate !== current && current !== null && keepsEarlyNo(current) && !keepsEarlyNo(candidate)) {
    // A scaffold from an older CLI must not undo the early no: the game keeps the newer shim.
    log('note: src/telemetry.ts is kept. It keeps a setConsent(false) made before analytics starts; the offered shim, from an older onGame CLI, drops it.');
  } else if (candidate !== current) {
    const offered = exportedNames(candidate);
    const broken = [...importedNames(join(gameDir, 'src'))].filter(([name]) => !offered.has(name));
    if (broken.length) {
      for (const [name, file] of broken) log(`refused: ${shownPath(gameDir, file)} imports ${name}, which the v2 shim does not export`);
      return 2;
    }
    nextShim = candidate;
    shimState = current === null ? 'added' : 'upgraded';
  }

  // Everything checked: write.
  const title = gameTitle(gameDir, opts.title ?? settings?.title);
  // The player's analytics switch: only the maker's answer counts. It is kept like the title, once given.
  const optOut = opts.optOut !== undefined ? opts.optOut === 'yes' : settings?.optOut;
  const nextSettings = {
    audience, consentDefault: CONSENT_DEFAULT[audience],
    ...(opts.title ? { title: opts.title } : settings?.title ? { title: settings.title } : {}),
    ...(typeof optOut === 'boolean' ? { optOut } : {}),
  };
  const settingsChanged = writeIfChanged(settingsPath, JSON.stringify(nextSettings, null, 2) + '\n');
  settings = nextSettings;

  if (nextShim !== null) {
    if (current !== null) writeIfChanged(join(gameDir, '.ongame', 'archive', `telemetry-${sha8(current)}.ts`), current);
    writeFileSync(shimPath, nextShim);
  }

  // A children's game sends nothing: take out the block telemetry_inject wrote. --check fails on anything else left.
  let telemetryRemoved = false;
  let telemetryLeft = false;
  const indexPath = join(gameDir, 'index.html');
  if (audience === 'children' && existsSync(indexPath)) {
    const html = readFileSync(indexPath, 'utf8');
    const stripped = html.replace(TELEMETRY_BLOCK, '');
    if (stripped !== html) { writeFileSync(indexPath, stripped); telemetryRemoved = true; }
    if (hasTelemetry(stripped)) telemetryLeft = true;
  }

  let privacyState;
  const existing = existsSync(privacyPath) ? readFileSync(privacyPath, 'utf8') : null;
  if (existing !== null && !existing.includes(PRIVACY_MARKER)) {
    privacyState = 'kept-own';
    log('note: public/privacy.html was written by hand and is kept. Check that it lists every event the analytics SDK sends (see the analytics skill).');
  } else {
    privacyState = writeIfChanged(privacyPath, renderPrivacy(title, audience, settings.optOut === true)) ? (existing === null ? 'added' : 'updated') : 'unchanged';
    if (audience === 'general' && settings.optOut === undefined && callsSetConsent(join(gameDir, 'src'))) {
      log("note: the game calls setConsent, but the privacy page promises no analytics switch yet. If the game's settings let the player turn analytics off, run again with --opt-out yes; if not, with --opt-out no.");
    }
  }

  // A switch the player can use must also hold at boot, before the SDK sends what an earlier visit queued.
  if (audience === 'general' && settings.optOut === true && !notV2) {
    for (const p of bootAnswerProblems(gameDir, nextShim ?? current ?? '')) log(`note: ${p}`);
  }

  const changed = settingsChanged || telemetryRemoved || nextShim !== null || privacyState === 'added' || privacyState === 'updated';
  log(JSON.stringify({ audience, consentDefault: settings.consentDefault, shim: shimState, privacy: privacyState, changed }));
  if (telemetryLeft) {
    log('children: index.html still holds a telemetry script this tool did not write. Remove every script that sets __ONGAME_TELEMETRY__ and the sdk.js tag, then run again.');
    return 5;
  }
  return notV2 ? 4 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = run(process.argv.slice(2));
