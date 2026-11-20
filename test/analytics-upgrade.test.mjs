/**
 * skills/analytics/upgrade.mjs on throwaway game dirs: shim v1 → v2 with the game's calls kept, the audience asked
 * once, a privacy page that lists exactly the registered events, and a second run that changes no file.
 * Also checks that /make-game, /analytics, /publish and the code and polish phases point at it.
 *
 * Run: node --test test/analytics-upgrade.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, after } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const UPGRADE = path.join(ROOT, 'skills/analytics/upgrade.mjs');
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills/analytics/events.json'), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); dirs.push(d); return d; };

const SHIM_V1 = `export function trackLevelStart(level: number, extra?: Record<string, unknown>): void {}
export function trackLevelComplete(level: number, extra?: Record<string, unknown>): void {}
export function trackLevelFail(level: number, extra?: Record<string, unknown>): void {}
`;
// The v2 interface from the design (section 4.1); bodies do not matter here, the exported names do.
const SHIM_V2 = `type Meta = Record<string, string | number | boolean>;
export function setConsent(analytics: boolean): void {}
export function screen(screenId: string): void {}
export function tap(controlId: string, meta?: Meta): void {}
export function levelStart(level: number, meta?: Meta): string { return ''; }
export function levelEnd(attemptId: string, result: 'complete' | 'fail' | 'quit', meta?: Meta): void {}
export function economy(kind: 'earn' | 'spend', currency: string, amount: number, source: string): void {}
export function tutorial(stepId: string, done?: boolean): void {}
export function track(name: string, meta?: Meta): void {}
export function trackLevelStart(level: number, extra?: Meta): void {}
export function trackLevelComplete(level: number, extra?: Meta): void {}
export function trackLevelFail(level: number, extra?: Meta): void {}
`;
const MAIN = `import { trackLevelStart, trackLevelComplete as won } from './telemetry';
import * as T from '../src/telemetry.ts';
trackLevelStart(1); won(1); T.trackLevelFail(2);
`;

function game({ shim = SHIM_V1, main = MAIN } = {}) {
  const dir = tmp('analytics-game-');
  fs.mkdirSync(path.join(dir, 'src', 'views'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<!DOCTYPE html><html><head><title>Pebble Path</title></head><body></body></html>\n');
  fs.writeFileSync(path.join(dir, 'src', 'telemetry.ts'), shim);
  fs.writeFileSync(path.join(dir, 'src', 'views', 'Main.ts'), main);
  return dir;
}
function v2File() { const d = tmp('analytics-shim-'); const f = path.join(d, 'telemetry.ts'); fs.writeFileSync(f, SHIM_V2); return f; }
const run = (...args) => spawnSync(process.execPath, [UPGRADE, ...args], { encoding: 'utf8' });
const summary = (r) => JSON.parse(r.stdout.trim().split('\n').pop());
function snapshot(dir) {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d)) { const p = path.join(d, e); if (fs.statSync(p).isDirectory()) walk(p); else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8'); } };
  walk(dir);
  return out;
}

test('without a recorded audience it stops with exit 3 and writes nothing', () => {
  const dir = game();
  const before = snapshot(dir);
  const r = run(dir, '--shim', v2File());
  assert.equal(r.status, 3, r.stdout);
  assert.match(r.stdout, /aimed at children/);
  assert.deepEqual(snapshot(dir), before);
});

test('upgrades v1 to v2, keeps the old file, writes the privacy page, and a second run changes nothing', () => {
  const dir = game();
  const shim = v2File();
  const first = run(dir, '--shim', shim, '--audience', 'general');
  assert.equal(first.status, 0, first.stdout);
  assert.deepEqual(summary(first), { audience: 'general', consentDefault: 'on', shim: 'upgraded', privacy: 'added', changed: true });
  assert.equal(fs.readFileSync(path.join(dir, 'src/telemetry.ts'), 'utf8'), SHIM_V2);
  const archived = fs.readdirSync(path.join(dir, '.ongame/archive'));
  assert.equal(archived.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, '.ongame/archive', archived[0]), 'utf8'), SHIM_V1);
  const page = fs.readFileSync(path.join(dir, 'public/privacy.html'), 'utf8');
  assert.match(page, /<title>Pebble Path: privacy<\/title>/);

  const once = snapshot(dir);
  // The audience is remembered: the second run needs no --audience and asks nothing.
  const second = run(dir, '--shim', shim);
  assert.equal(second.status, 0, second.stdout);
  assert.deepEqual(summary(second), { audience: 'general', consentDefault: 'on', shim: 'unchanged', privacy: 'unchanged', changed: false });
  assert.deepEqual(snapshot(dir), once);
  assert.equal(run('--check', dir).status, 0);
});

test('a game that imports a name v2 does not export is refused, with nothing written', () => {
  const dir = game({ main: "import { trackLevelQuit } from './telemetry';\ntrackLevelQuit(1);\n" });
  const before = snapshot(dir);
  const r = run(dir, '--shim', v2File(), '--audience', 'general');
  assert.equal(r.status, 2);
  assert.match(r.stdout, /src\/views\/Main\.ts imports trackLevelQuit/);
  assert.deepEqual(snapshot(dir), before);
});

test('a v1 shim gets exit 4, keeps its file, and still saves a children answer and the page', () => {
  const dir = game();
  const old = path.join(tmp('analytics-shim-'), 'telemetry.ts');
  fs.writeFileSync(old, SHIM_V1);
  const r = run(dir, '--shim', old, '--audience', 'children');
  assert.equal(r.status, 4);
  assert.match(r.stdout, /lacks setConsent, screen, tap, levelStart, levelEnd/);
  assert.deepEqual(summary(r), { audience: 'children', consentDefault: 'off', shim: 'not-v2', privacy: 'added', changed: true });
  assert.equal(fs.readFileSync(path.join(dir, 'src/telemetry.ts'), 'utf8'), SHIM_V1);
  // /publish on this old game: no --shim, no question again, and the children answer comes back.
  const publish = run(dir);
  assert.equal(publish.status, 4);
  assert.equal(summary(publish).audience, 'children');
  assert.equal(summary(publish).changed, false);
  assert.equal(run('--check', dir).status, 1);
});

test('type imports from the shim count as kept when v2 exports the same type', () => {
  const dir = game({ main: "import type { Meta } from './telemetry';\nimport { type LevelMeta, trackLevelStart } from './telemetry';\nexport const m: Meta = {}; trackLevelStart(1);\n" });
  const f = path.join(tmp('analytics-shim-'), 'telemetry.ts');
  fs.writeFileSync(f, SHIM_V2.replace('type Meta =', 'export type Meta =') + 'export interface LevelMeta { level_id?: string }\n');
  const r = run(dir, '--shim', f, '--audience', 'general');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(summary(r).shim, 'upgraded');
});

test('a new game that already has v2 needs no --shim', () => {
  const dir = game({ shim: SHIM_V2 });
  const r = run(dir, '--audience', 'general');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(summary(r).shim, 'unchanged');
  assert.equal(summary(r).privacy, 'added');
});

test('a children\'s game gets consent off and a page that says nothing is collected', () => {
  const dir = game({ shim: SHIM_V2 });
  const r = run(dir, '--audience', 'children');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(summary(r).consentDefault, 'off');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, '.ongame/analytics.json'), 'utf8')), { audience: 'children', consentDefault: 'off' });
  const page = fs.readFileSync(path.join(dir, 'public/privacy.html'), 'utf8');
  assert.match(page, /Nothing\. This game is made for children/);
  assert.ok(!page.includes('<code>ui_tap</code>'));
});

test('default imports and re-exports count as names the game needs', () => {
  const dir = game({ main: "import T from './telemetry';\nexport { trackLevelFail as lost } from './telemetry';\nT;\n" });
  const r = run(dir, '--shim', v2File(), '--audience', 'general');
  assert.equal(r.status, 2);
  assert.match(r.stdout, /imports default,/);
  const dir2 = game({ main: "export { trackLevelFail as lost } from './telemetry';\n" });
  assert.equal(run(dir2, '--shim', v2File(), '--audience', 'general').status, 0);
  const dir4 = game({ main: "import * as T from './telemetry';\nconst { trackLevelQuit } = T; T.trackLevelStart(1);\n" });
  const r4 = run(dir4, '--shim', v2File(), '--audience', 'general');
  assert.equal(r4.status, 2);
  assert.match(r4.stdout, /imports T \(used other than as T\.name\)/);
  const dir6 = game({ main: "import * as T from './telemetry';\nT\n  .trackLevelQuit(1);\n" });
  assert.match(run(dir6, '--shim', v2File(), '--audience', 'general').stdout, /imports trackLevelQuit/);
  const dir7 = game({ main: "import { trackLevelQuit } from '@/telemetry';\n" });
  assert.equal(run(dir7, '--shim', v2File(), '--audience', 'general').status, 2);
  const dir8 = game({ main: "export const load = async () => { const { trackLevelQuit } = await import('./telemetry'); return trackLevelQuit; };\n" });
  assert.match(run(dir8, '--shim', v2File(), '--audience', 'general').stdout, /a dynamic import or require/);
  const dir5 = game({ main: "export * from './telemetry';\n" });
  assert.equal(run(dir5, '--shim', v2File(), '--audience', 'general').status, 2);
  const dir3 = game({ main: "export { trackLevelQuit } from './telemetry';\n" });
  assert.equal(run(dir3, '--shim', v2File(), '--audience', 'general').status, 2);
});

test('the page promises an opt-out only when the game calls setConsent', () => {
  const dir = game({ shim: SHIM_V2 });
  run(dir, '--audience', 'general');
  const page = () => fs.readFileSync(path.join(dir, 'public/privacy.html'), 'utf8');
  assert.ok(!page().includes('turn analytics off'));
  fs.writeFileSync(path.join(dir, 'src/views/Settings.ts'), "import { setConsent } from '../telemetry';\nexport const off = () => setConsent(false);\n");
  assert.equal(run('--check', dir).status, 1, 'the page is out of date once the switch exists');
  // A commented-out call is no switch; an aliased one is.
  fs.writeFileSync(path.join(dir, 'src/views/Settings.ts'), "import { setConsent } from '../telemetry';\n// setConsent(false);\n");
  assert.equal(summary(run(dir)).privacy, 'unchanged');
  fs.writeFileSync(path.join(dir, 'src/views/Settings.ts'), "import { setConsent as consent } from '../telemetry';\nexport const off = () => consent(false);\n");
  const r = run(dir);
  assert.equal(summary(r).privacy, 'updated');
  assert.ok(page().includes("You can turn analytics off in the game's settings."));
  assert.equal(run('--check', dir).status, 0);
});

test('a children\'s game loses the telemetry block, and --check fails while any tag is left', () => {
  const dir = game({ shim: SHIM_V2 });
  const block = '<!-- ongame-telemetry -->\n<script>window.__ONGAME_TELEMETRY__={"gameId":"g"};</script>\n<script type="module" src="https://x.example/sdk.js"></script>\n';
  fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html><html><head><title>T</title>\n${block}</head><body></body></html>\n`);
  const r = run(dir, '--audience', 'children');
  assert.equal(r.status, 0, r.stdout);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  // A game script between the two telemetry tags is never taken out with them.
  const split = game({ shim: SHIM_V2 });
  fs.writeFileSync(path.join(split, 'index.html'), `<html><head>${block.replace('</script>\n<script type="module"', '</script>\n<script>boot()</script>\n<script type="module"')}</head></html>`);
  assert.equal(run(split, '--audience', 'children').status, 5);
  assert.ok(fs.readFileSync(path.join(split, 'index.html'), 'utf8').includes('<script>boot()</script>'));
  assert.ok(!html.includes('__ONGAME_TELEMETRY__') && !html.includes('sdk.js'));
  assert.equal(run('--check', dir).status, 0);
  assert.equal(summary(run(dir)).changed, false);
  fs.writeFileSync(path.join(dir, 'index.html'), html.replace('</head>', '<script src="https://old.example/telemetry/sdk.js"></script></head>'));
  // A tag the script did not write: exit 5 on a run (v1 or v2 shim alike), and --check fails.
  assert.equal(run(dir).status, 5);
  const c = run('--check', dir);
  assert.equal(c.status, 1);
  assert.match(c.stdout, /index\.html still holds telemetry/);
  // Another vendor's sdk.js is not onGame telemetry: it stays and does not block the game.
  fs.writeFileSync(path.join(dir, 'index.html'), html.replace('</head>', '<script src="https://ads.example/sdk.js"></script></head>'));
  assert.equal(run(dir).status, 0);
  assert.equal(run('--check', dir).status, 0);
  for (const tag of ["<script src='https://ongame-telemetry-x.example/sdk.js'></script>", '<SCRIPT type=module src=https://telemetry.example/sdk.js?v=2></SCRIPT>']) {
    fs.writeFileSync(path.join(dir, 'index.html'), html.replace('</head>', `${tag}</head>`));
    assert.equal(run('--check', dir).status, 1, tag);
  }
});

test('comments inside an import do not count as names', () => {
  const dir = game({ main: "import { /* level events */ trackLevelStart } from './telemetry';\n// import { trackLevelQuit } from './telemetry';\ntrackLevelStart(1);\n" });
  assert.equal(run(dir, '--shim', v2File(), '--audience', 'general').status, 0);
});

test('a privacy page the maker wrote is kept', () => {
  const dir = game({ shim: SHIM_V2 });
  fs.mkdirSync(path.join(dir, 'public'));
  fs.writeFileSync(path.join(dir, 'public/privacy.html'), '<p>mine</p>');
  const r = run(dir, '--audience', 'general');
  assert.equal(r.status, 0);
  assert.equal(summary(r).privacy, 'kept-own');
  assert.equal(fs.readFileSync(path.join(dir, 'public/privacy.html'), 'utf8'), '<p>mine</p>');
});

test('the privacy page and the store labels list exactly the registered events', () => {
  const dir = game({ shim: SHIM_V2 });
  run(dir, '--audience', 'general');
  const page = fs.readFileSync(path.join(dir, 'public/privacy.html'), 'utf8');
  const labels = read('skills/analytics/store-labels.md');
  const names = REGISTRY.events.map((e) => e.t);
  assert.equal(names.length, 17);
  const inPage = [...page.matchAll(/<tr><td><code>([^<]+)<\/code>/g)].map((m) => m[1].replace('&lt;', '<').replace('&gt;', '>'));
  const inLabels = [...labels.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual(inPage, names);
  assert.deepEqual(inLabels, names);
  for (const n of REGISTRY.never) assert.ok(page.includes(n), n);
  assert.match(labels, /Product Interaction/);
  assert.match(labels, /App interactions/);
});

test('make-game, /analytics, /publish and the code and polish phases use it', () => {
  const make = read('commands/make-game.md');
  assert.ok(make.includes('**Every web game reports how it is played.**'));
  assert.ok(make.includes('node <pluginRoot>/skills/analytics/upgrade.mjs --check {gameDir}'));
  const cmd = read('commands/analytics.md');
  assert.match(cmd, /^---\nname: analytics\n/);
  assert.ok(cmd.includes('scaffold_materialize'));
  assert.ok(cmd.includes('upgrade.mjs {gameDir} --shim <temp>/src/telemetry.ts'));
  assert.ok(cmd.includes('telemetry_inject'));
  assert.ok(read('commands/publish.md').includes('node <pluginRoot>/skills/analytics/upgrade.mjs {gameDir}'));
  const code = read('skills/phases/code/SKILL.md');
  assert.ok(code.includes('const attempt = levelStart(n)'));
  assert.ok(code.includes("screen('<id>')"));
  assert.ok(code.includes('**An older scaffold has shim v1:**'));
  assert.ok(make.includes('If `src/telemetry.ts` exports no `levelStart` (shim v1, an older scaffold)'));
  const polish = read('skills/phases/polish/SKILL.md');
  assert.ok(polish.includes('1c. **CHECK screens and taps the same way.**'));
  assert.ok(polish.includes('1d. **Shim v2, audience and privacy page.**'));
  // The shim declares these names itself, so a grep that reads it always matches.
  assert.ok(polish.includes('grep -rn --exclude=telemetry.ts "screen("'));
  assert.ok(polish.includes('grep -rl --exclude=telemetry.ts "levelStart'));
  assert.ok(cmd.includes('grep -rn --exclude=telemetry.ts "screen("'));
  assert.ok(cmd.includes('do the\n  children step of section 3 first'));
});

test('nothing in the analytics files names an internal tool or person', () => {
  const text = ['skills/analytics/SKILL.md', 'skills/analytics/store-labels.md', 'skills/analytics/privacy.html',
    'skills/analytics/upgrade.mjs', 'skills/analytics/events.json', 'commands/analytics.md'].map(read).join('\n');
  for (const word of ['fleet', 'board', 'devbox', 'cairn', 'right-hand']) assert.ok(!text.toLowerCase().includes(word), word);
});

test('the plugin version and changelog carry this change', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.79', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.79 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.79'));
});
