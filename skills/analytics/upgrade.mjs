#!/usr/bin/env node
/**
 * Puts the onGame analytics shim v2 into a web game and writes its privacy page. Safe to run again: a second run
 * with the same inputs changes no file.
 *
 *   node upgrade.mjs <gameDir> [--shim <v2 telemetry.ts>] [--audience general|children] [--title <game title>]
 *   node upgrade.mjs --check <gameDir>      # exit 0 when the shim is v2 and the privacy page is current
 *
 * What it does, in order:
 * 1. Audience. The answer to "is this game aimed at children?" is kept in .ongame/analytics.json. Without that
 *    file and without --audience it stops with exit 3, so the caller asks the maker once and runs it again.
 * 2. Shim. --shim names the v2 src/telemetry.ts (from a fresh scaffold). It must export every v2 call. Every name
 *    the game imports from its telemetry module must still be exported, or nothing is written (exit 2). The old
 *    file is kept in .ongame/archive/ before it is replaced. Without --shim the game's own file must already be v2.
 * 3. Privacy page. public/privacy.html lists exactly the events in events.json (the build copies public/ to the
 *    site root, so it is served at /privacy.html). A privacy.html the maker wrote, with no onGame marker, is kept.
 *
 * Exit codes: 0 done (or --check passed), 1 --check failed, 2 refused (nothing written), 3 audience unknown,
 * 4 the shim is not v2 (the audience and privacy page are still saved; the shim is left as it was).
 * After exit 0 or 4 the last stdout line is a JSON summary: {audience, consentDefault, shim, privacy, changed}.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
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

const TELEMETRY_FROM = String.raw`from\s*['"](?:\.{1,2}/)+(?:[\w.-]+/)*telemetry(?:\.[jt]s)?['"]`;

function gameSources(srcDir) {
  return sourceFiles(srcDir).filter((f) => basename(f).replace(/\.\w+$/, '') !== 'telemetry');
}

/**
 * Every name the game's code takes from its telemetry module, with the file that takes it: named, default and
 * namespace imports, and `export { ... } from` re-exports. `default` stands for a default import.
 */
export function importedNames(srcDir) {
  const used = new Map();
  const add = (name, file) => { if (!used.has(name)) used.set(name, file); };
  for (const file of gameSources(srcDir)) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(new RegExp(String.raw`\b(import|export)\s+(?:type\s+)?([^;'"]*?)\s*` + TELEMETRY_FROM, 'g'))) {
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
        for (const u of code.matchAll(new RegExp(String.raw`\b${ns[1]}\.([A-Za-z_$][\w$]*)`, 'g'))) add(u[1], file);
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

/** The game has its own analytics switch when its code (not the shim) calls setConsent. */
export function hasOptOut(srcDir) {
  return gameSources(srcDir).some((f) => /\bsetConsent\s*\(/.test(readFileSync(f, 'utf8')));
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
    else if (a === '--shim' || a === '--audience' || a === '--title') {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = v;
    } else rest.push(a);
  }
  if (rest.length !== 1) throw new Error('usage: upgrade.mjs [--check] <gameDir> [--shim <file>] [--audience general|children] [--title <t>]');
  opts.gameDir = rest[0];
  if (opts.audience && !(opts.audience in CONSENT_DEFAULT)) throw new Error('--audience must be general or children');
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
      if (!own && page !== renderPrivacy(gameTitle(gameDir, settings.title), settings.audience, hasOptOut(join(gameDir, 'src')))) problems.push('public/privacy.html is missing or out of date');
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
  } else if (candidate !== current) {
    const offered = exportedNames(candidate);
    const broken = [...importedNames(join(gameDir, 'src'))].filter(([name]) => !offered.has(name));
    if (broken.length) {
      for (const [name, file] of broken) log(`refused: ${file.slice(gameDir.length + 1)} imports ${name}, which the v2 shim does not export`);
      return 2;
    }
    nextShim = candidate;
    shimState = current === null ? 'added' : 'upgraded';
  }

  // Everything checked: write.
  const title = gameTitle(gameDir, opts.title ?? settings?.title);
  const nextSettings = { audience, consentDefault: CONSENT_DEFAULT[audience], ...(opts.title ? { title: opts.title } : settings?.title ? { title: settings.title } : {}) };
  const settingsChanged = writeIfChanged(settingsPath, JSON.stringify(nextSettings, null, 2) + '\n');
  settings = nextSettings;

  if (nextShim !== null) {
    if (current !== null) writeIfChanged(join(gameDir, '.ongame', 'archive', `telemetry-${sha8(current)}.ts`), current);
    writeFileSync(shimPath, nextShim);
  }

  let privacyState;
  const existing = existsSync(privacyPath) ? readFileSync(privacyPath, 'utf8') : null;
  if (existing !== null && !existing.includes(PRIVACY_MARKER)) {
    privacyState = 'kept-own';
    log('note: public/privacy.html was written by hand and is kept. Check that it lists every event the analytics SDK sends (see the analytics skill).');
  } else {
    privacyState = writeIfChanged(privacyPath, renderPrivacy(title, audience, hasOptOut(join(gameDir, 'src')))) ? (existing === null ? 'added' : 'updated') : 'unchanged';
  }

  const changed = settingsChanged || nextShim !== null || privacyState === 'added' || privacyState === 'updated';
  log(JSON.stringify({ audience, consentDefault: settings.consentDefault, shim: shimState, privacy: privacyState, changed }));
  return notV2 ? 4 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = run(process.argv.slice(2));
