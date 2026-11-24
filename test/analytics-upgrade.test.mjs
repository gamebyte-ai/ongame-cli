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
import { pathToFileURL } from 'node:url';
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
// The scaffold's shim from the onGame CLI release after cli-v0.2.50: a setConsent(false) made before the SDK starts is
// kept in globalThis.__ongameConsent, and the SDK reads it before it sends anything.
const SHIM_BOOT = SHIM_V2.replace('export function setConsent(analytics: boolean): void {}', `export function setConsent(analytics: boolean): void {
  const g = globalThis as { __ongameConsent?: false };
  if (analytics === true) delete g.__ongameConsent; else g.__ongameConsent = false;
}`) + 'export function watchTaps(pixiApp: unknown): void {}\n';
// The template's src/main.ts, cut down: \`apply\` is what the game runs before \`await app.initialize()\`.
const BOOT = (apply = '  setConsent(loadSettings().analytics);\n', after = '', top = '') => `import { MyGameApp } from './MyGameApp';
import { setConsent, watchTaps } from './telemetry';
import { loadSettings } from './settings';

async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('#stage mount element is missing from index.html');
  const app = new MyGameApp(stage);
${apply}  await app.initialize();
${after}  watchTaps(app.pixiApp);
}

${top}void boot().catch((err: unknown) => {
  console.error('[game] boot failed', err);
});
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

test('a helper module named telemetry is checked too: only src/telemetry.ts is the shim', () => {
  const dir = game();
  fs.mkdirSync(path.join(dir, 'src', 'utils'));
  fs.writeFileSync(path.join(dir, 'src', 'utils', 'telemetry.ts'), "import { trackLevelQuit } from '../telemetry';\nexport const quit = () => trackLevelQuit(1);\n");
  const before = snapshot(dir);
  const r = run(dir, '--shim', v2File(), '--audience', 'general');
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stdout, /src\/utils\/telemetry\.ts imports trackLevelQuit/);
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
  const dir9 = game({ main: "export const config = {}\nimport { trackLevelQuit } from './telemetry'\ntrackLevelQuit(1)\n" });
  assert.match(run(dir9, '--shim', v2File(), '--audience', 'general').stdout, /imports trackLevelQuit/);
  const dir5 = game({ main: "export * from './telemetry';\n" });
  assert.equal(run(dir5, '--shim', v2File(), '--audience', 'general').status, 2);
  const dir3 = game({ main: "export { trackLevelQuit } from './telemetry';\n" });
  assert.equal(run(dir3, '--shim', v2File(), '--audience', 'general').status, 2);
});

test('a game that only calls setConsent(true) at start gets no opt-out promise, and --check agrees', () => {
  const dir = game({ shim: SHIM_V2, main: "import { setConsent } from '../telemetry';\nsetConsent(true);\n" });
  const r = run(dir, '--audience', 'general');
  assert.equal(r.status, 0, r.stdout);
  const page = fs.readFileSync(path.join(dir, 'public/privacy.html'), 'utf8');
  assert.ok(!page.includes('turn analytics off'), 'no switch the player can use, so no promise');
  assert.equal(run('--check', dir).status, 0);
});

test('an import from a game helper named telemetry is not an import from the shim', () => {
  const dir = game({ main: "import { quit } from '../utils/telemetry';\nimport { trackLevelStart } from '../telemetry';\nquit(); trackLevelStart(1);\n" });
  fs.mkdirSync(path.join(dir, 'src', 'utils'));
  fs.writeFileSync(path.join(dir, 'src', 'utils', 'telemetry.ts'), 'export function quit(): void {}\n');
  const r = run(dir, '--shim', v2File(), '--audience', 'general');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(summary(r).shim, 'upgraded');
  // quit still comes from the helper, which the upgrade leaves as it was.
  assert.equal(fs.readFileSync(path.join(dir, 'src/utils/telemetry.ts'), 'utf8'), 'export function quit(): void {}\n');
  assert.match(fs.readFileSync(path.join(dir, 'src/views/Main.ts'), 'utf8'), /import \{ quit \} from '\.\.\/utils\/telemetry'/);
  // The same name taken from the shim itself is still refused.
  const shimQuit = game({ main: "import { quit } from '../telemetry';\nquit();\n" });
  const refused = run(shimQuit, '--shim', v2File(), '--audience', 'general');
  assert.equal(refused.status, 2);
  assert.match(refused.stdout, /src\/views\/Main\.ts imports quit, which the v2 shim does not export/);
  // So is an alias such as '@/telemetry', and a namespace or dynamic import of the helper is no refusal either.
  assert.equal(run(game({ main: "import { quit } from '@/telemetry';\n" }), '--shim', v2File(), '--audience', 'general').status, 2);
  const dir2 = game({ main: "import * as U from '../utils/telemetry';\nconst { quit } = U; quit();\nexport const l = () => import('../utils/telemetry.js');\n" });
  fs.mkdirSync(path.join(dir2, 'src', 'utils'));
  fs.writeFileSync(path.join(dir2, 'src', 'utils', 'telemetry.ts'), 'export function quit(): void {}\n');
  const r2 = run(dir2, '--shim', v2File(), '--audience', 'general');
  assert.equal(r2.status, 0, r2.stdout);
  // A helper that passes on a shim name v2 lacks is still refused: the helper itself is scanned.
  const dir3 = game({ main: "import { quit } from '../utils/telemetry';\nquit();\n" });
  fs.mkdirSync(path.join(dir3, 'src', 'utils'));
  fs.writeFileSync(path.join(dir3, 'src', 'utils', 'telemetry.ts'), "export { quit } from '../telemetry';\n");
  const r3 = run(dir3, '--shim', v2File(), '--audience', 'general');
  assert.equal(r3.status, 2, r3.stdout);
  assert.match(r3.stdout, /src\/utils\/telemetry\.ts imports quit, which the v2 shim does not export/);
  // A game with no src/telemetry.ts yet but a src/telemetry/ folder: the shim the upgrade adds takes over '../telemetry'.
  const dir4 = game({ main: "import { quit } from '../telemetry';\nquit();\n" });
  fs.rmSync(path.join(dir4, 'src', 'telemetry.ts'));
  fs.mkdirSync(path.join(dir4, 'src', 'telemetry'));
  fs.writeFileSync(path.join(dir4, 'src', 'telemetry', 'index.ts'), 'export function quit(): void {}\n');
  const r4 = run(dir4, '--shim', v2File(), '--audience', 'general');
  assert.equal(r4.status, 2, r4.stdout);
  assert.match(r4.stdout, /src\/views\/Main\.ts imports quit/);
});

test('the page promises an opt-out only when the maker says the player has a switch', () => {
  const dir = game({ shim: SHIM_BOOT });
  fs.writeFileSync(path.join(dir, 'src/main.ts'), BOOT());
  run(dir, '--audience', 'general');
  const page = () => fs.readFileSync(path.join(dir, 'public/privacy.html'), 'utf8');
  const settings = () => JSON.parse(fs.readFileSync(path.join(dir, '.ongame/analytics.json'), 'utf8'));
  assert.ok(!page().includes('turn analytics off'));
  // A setConsent call in the code is no promise by itself: the run names the question instead.
  fs.writeFileSync(path.join(dir, 'src/views/Settings.ts'), "import { setConsent as consent } from '../telemetry';\nexport const off = () => consent(false);\n");
  const asked = run(dir);
  assert.equal(summary(asked).privacy, 'unchanged');
  assert.match(asked.stdout, /--opt-out yes/);
  assert.ok(!page().includes('turn analytics off'));
  assert.equal(run('--check', dir).status, 0);
  // The maker's answer is kept with the game and drives the page and --check.
  const yes = run(dir, '--opt-out', 'yes');
  assert.equal(yes.status, 0, yes.stdout);
  assert.equal(summary(yes).privacy, 'updated');
  assert.equal(settings().optOut, true);
  assert.ok(page().includes("You can turn analytics off in the game's settings."));
  assert.equal(run('--check', dir).status, 0);
  assert.equal(summary(run(dir)).changed, false);
  // Without the answer on file, --check reads the page as out of date.
  fs.writeFileSync(path.join(dir, '.ongame/analytics.json'), JSON.stringify({ audience: 'general', consentDefault: 'on' }));
  assert.equal(run('--check', dir).status, 1);
  const no = run(dir, '--opt-out', 'no');
  assert.equal(summary(no).privacy, 'updated');
  assert.equal(settings().optOut, false);
  assert.ok(!page().includes('turn analytics off'));
  assert.equal(run(dir, '--opt-out', 'maybe').status, 2);
});

// A general game whose maker said it has an Analytics switch, with the given boot module and shim.
function switchGame(main, { shim = SHIM_BOOT, file = 'src/main.ts' } = {}) {
  const dir = game({ shim });
  if (main !== null) fs.writeFileSync(path.join(dir, file), main);
  const r = run(dir, '--audience', 'general', '--opt-out', 'yes');
  assert.ok(r.status === 0, r.stdout);
  return { dir, upgrade: r };
}
const check = (dir) => run('--check', dir);
const BOOT_LINE = /does not apply the saved Analytics answer before its first await/;

test('a game with a switch passes --check when its boot applies the saved answer before the first await', () => {
  const { dir, upgrade } = switchGame(BOOT());
  assert.doesNotMatch(upgrade.stdout, /note: .*(Analytics answer|fresh scaffold)/);
  const c = check(dir);
  assert.equal(c.status, 0, c.stdout);
  // The same call, written in the other ways a game writes it.
  const passes = {
    'a branch': BOOT('  if (!loadSettings().analytics) setConsent(false);\n'),
    'an alias': BOOT('  consent(loadSettings().analytics);\n').replace('import { setConsent, watchTaps }', 'import { setConsent as consent, watchTaps }'),
    'a namespace import': BOOT('  T.setConsent(loadSettings().analytics);\n').replace("import { setConsent, watchTaps } from './telemetry';", "import * as T from './telemetry';\nconst watchTaps = T.watchTaps;"),
    'a helper in main.ts called before the await': BOOT('  applySaved();\n').replace('async function boot', 'function applySaved(): void {\n  setConsent(loadSettings().analytics);\n}\n\nasync function boot'),
    'a const arrow helper': BOOT('  applySaved();\n').replace('async function boot', 'const applySaved = () => setConsent(loadSettings().analytics);\n\nasync function boot'),
    'a top-level call before boot()': BOOT('', '', 'setConsent(loadSettings().analytics);\n'),
    'a top-level call after void boot()': BOOT('') + 'setConsent(loadSettings().analytics);\n',
    'an immediately called function': BOOT('  (() => { setConsent(loadSettings().analytics); })();\n'),
    'code without semicolons': BOOT().replace(/;\n/g, '\n'),
  };
  for (const [name, main] of Object.entries(passes)) {
    const r = check(switchGame(main).dir);
    assert.equal(r.status, 0, `${name}: ${r.stdout}`);
  }
});

test('a game with a switch fails --check when its boot applies the answer late, or not at all', () => {
  const fails = {
    'after the await': BOOT('', '  setConsent(loadSettings().analytics);\n'),
    'only setConsent(true)': BOOT('  setConsent(true);\n'),
    'no argument': BOOT('  setConsent();\n'),
    'no call at all': BOOT(''),
    'a helper called only after the await': BOOT('', '  applySaved();\n').replace('async function boot', 'function applySaved(): void {\n  setConsent(loadSettings().analytics);\n}\n\nasync function boot'),
    'an await in a branch before the call': BOOT('  if (stage.dataset.slow) await new Promise((r) => setTimeout(r, 0));\n  setConsent(loadSettings().analytics);\n'),
    'a top-level await before the call': BOOT('').replace("void boot().catch", "await new Promise((r) => setTimeout(r, 0));\nsetConsent(loadSettings().analytics);\nvoid boot().catch"),
    'a .then callback': BOOT('').replace("void boot().catch((err: unknown) => {", "void boot().then(() => setConsent(loadSettings().analytics)).catch((err: unknown) => {"),
    'a setTimeout callback': BOOT('  setTimeout(() => setConsent(loadSettings().analytics), 0);\n'),
    'a for loop update after an awaiting body': BOOT('  for (let i = 0; i < 1; setConsent(loadSettings().analytics), i++) { await app.initialize(); }\n'),
    'a parameter that shadows setConsent': BOOT('  apply(console.log);\n').replace('async function boot', 'function apply(setConsent: (on: boolean) => void): void {\n  setConsent(false);\n}\n\nasync function boot'),
    'a local variable that shadows the namespace': BOOT('  { const T = { setConsent: (on: boolean) => on }; T.setConsent(false); }\n').replace("import { setConsent, watchTaps } from './telemetry';", "import * as T from './telemetry';\nconst watchTaps = T.watchTaps;"),
    'a generator that is only created': BOOT('  apply();\n').replace('async function boot', 'function* apply(): Generator<void> {\n  setConsent(loadSettings().analytics);\n}\n\nasync function boot'),
    'a setConsent from another module': BOOT('  setConsent(loadSettings().analytics);\n').replace("import { setConsent, watchTaps } from './telemetry';", "import { watchTaps } from './telemetry';\nimport { setConsent } from './settings';"),
  };
  for (const [name, main] of Object.entries(fails)) {
    const { dir, upgrade } = switchGame(main);
    assert.match(upgrade.stdout, /note: src\/main\.ts does not apply the saved Analytics answer/, `${name}: the upgrade run names it`);
    const r = check(dir);
    assert.equal(r.status, 1, `${name}: ${r.stdout}`);
    assert.match(r.stdout, BOOT_LINE, name);
  }
});

test('the boot check reads the module index.html starts, and fails when it is missing or unreadable', () => {
  // index.html starts src/boot.ts; the deployed SDK tag after it is another origin and is not the game.
  const { dir } = switchGame(BOOT(), { file: 'src/boot.ts' });
  const html = '<!DOCTYPE html><html><head><title>Pebble Path</title></head><body>\n<script type="module" src="/src/boot.ts"></script>\n'
    + '<script type="module" src="https://telemetry.example/sdk.js"></script>\n</body></html>\n';
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  assert.equal(check(dir).status, 0, check(dir).stdout);
  fs.writeFileSync(path.join(dir, 'src/boot.ts'), BOOT(''));
  assert.match(check(dir).stdout, /src\/boot\.ts does not apply the saved Analytics answer/);

  const missing = switchGame(null).dir;
  const m = check(missing);
  assert.equal(m.status, 1);
  assert.match(m.stdout, /src\/main\.ts, the boot module, is missing/);

  const broken = switchGame('import { setConsent } from "./telemetry";\nsetConsent(saved;\n').dir;
  const b = check(broken);
  assert.equal(b.status, 1);
  assert.match(b.stdout, /src\/main\.ts cannot be read as code/);
});

test('a game with a switch and a shim from before the boot fix fails --check, naming a fresh scaffold', () => {
  const { dir, upgrade } = switchGame(BOOT(), { shim: SHIM_V2 });
  assert.match(upgrade.stdout, /note: src\/telemetry\.ts drops a setConsent\(false\) made before analytics starts/);
  const r = check(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /src\/telemetry\.ts drops a setConsent\(false\) made before analytics starts/);
  assert.match(r.stdout, /fresh scaffold/);
  assert.doesNotMatch(r.stdout, BOOT_LINE);
  // A comment that names the global is not the code that keeps it.
  const commented = switchGame(BOOT(), { shim: `// keeps globalThis.__ongameConsent\n${SHIM_V2}` }).dir;
  assert.equal(check(commented).status, 1);
  // The fresh scaffold's shim fixes it: the upgrade takes it, and --check passes.
  const f = path.join(tmp('analytics-shim-'), 'telemetry.ts');
  fs.writeFileSync(f, SHIM_BOOT);
  const up = run(dir, '--shim', f);
  assert.equal(up.status, 0, up.stdout);
  assert.equal(summary(up).shim, 'upgraded');
  assert.equal(check(dir).status, 0);
});

test('a top-level await in a module the boot imports fails --check: the boot runs only after it', () => {
  const save = (dir, rel, code) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), code); };
  const { dir } = switchGame(BOOT());
  save(dir, 'src/settings.ts', "import { db } from './store/db.js';\nexport const loadSettings = () => ({ analytics: db.get('analytics') !== 'off' });\n");
  save(dir, 'src/store/db.ts', 'export const db = new Map<string, string>();\n');
  assert.equal(check(dir).status, 0, check(dir).stdout);
  // Two imports down, written as '.js' for a .ts file, the way TypeScript ESM writes it.
  save(dir, 'src/store/db.ts', "export const db = new Map<string, string>(await Promise.resolve([['analytics', 'on']]));\n");
  const r = check(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /src\/store\/db\.ts has a top-level await, and src\/main\.ts imports it/);
  assert.doesNotMatch(r.stdout, BOOT_LINE);
  // The check does not follow an await inside a function, a type-only import or a dynamic import.
  save(dir, 'src/store/db.ts', "export const db = new Map<string, string>();\nexport async function load(): Promise<void> { await Promise.resolve(); }\n");
  save(dir, 'src/types.ts', 'export type Saved = { analytics: boolean };\nawait Promise.resolve();\n');
  save(dir, 'src/later.ts', 'await Promise.resolve();\nexport const later = 1;\n');
  save(dir, 'src/kinds.ts', 'export type Kind = string;\nawait Promise.resolve();\n');
  fs.appendFileSync(path.join(dir, 'src/main.ts'), "import type { Saved } from './types';\nimport { type Kind } from './kinds';\n" +
    "export const s: Saved | null = null;\nexport const k: Kind = '';\nexport const later = () => import('./later');\n");
  assert.equal(check(dir).status, 0, check(dir).stdout);
  // A module it imports that cannot be read is no pass.
  save(dir, 'src/store/db.ts', 'export const db = new Map<string, string>(;\n');
  const u = check(dir);
  assert.equal(u.status, 1);
  assert.match(u.stdout, /src\/store\/db\.ts cannot be read as code/);
});

test('a setConsent from a game helper named telemetry is not the shim\'s, at boot either', () => {
  const main = BOOT().replace("import { setConsent, watchTaps } from './telemetry';", "import { watchTaps } from './telemetry';\nimport { setConsent } from './utils/telemetry';");
  const { dir } = switchGame(main);
  fs.mkdirSync(path.join(dir, 'src/utils'));
  fs.writeFileSync(path.join(dir, 'src/utils/telemetry.ts'), 'export function setConsent(on: boolean): void { console.log(on); }\n');
  const r = check(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, BOOT_LINE);
  // The shim itself under an alias such as '@/telemetry' still counts.
  fs.writeFileSync(path.join(dir, 'src/main.ts'), main.replace("from './utils/telemetry'", "from '@/telemetry'"));
  assert.equal(check(dir).status, 0, check(dir).stdout);
});

test('an upgrade never swaps a shim that keeps the early no for one that drops it', () => {
  const { dir } = switchGame(BOOT());
  const older = path.join(tmp('analytics-shim-'), 'telemetry.ts');
  fs.writeFileSync(older, SHIM_V2 + 'export function watchTaps(pixiApp: unknown): void {}\n');
  const r = run(dir, '--shim', older);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(summary(r).shim, 'unchanged');
  assert.match(r.stdout, /note: src\/telemetry\.ts is kept/);
  assert.equal(fs.readFileSync(path.join(dir, 'src/telemetry.ts'), 'utf8'), SHIM_BOOT);
  assert.equal(check(dir).status, 0);
});

test('the boot checks apply only to a general game whose maker said it has a switch', () => {
  // No switch on file: neither check runs, whatever the shim and the boot.
  const plain = game({ shim: SHIM_V2 });
  fs.writeFileSync(path.join(plain, 'src/main.ts'), BOOT(''));
  assert.equal(run(plain, '--audience', 'general', '--opt-out', 'no').status, 0);
  assert.equal(check(plain).status, 0, check(plain).stdout);
  // A children's game sends nothing, so it has no boot answer to apply.
  const kids = game({ shim: SHIM_V2 });
  assert.equal(run(kids, '--audience', 'children', '--opt-out', 'yes').status, 0);
  assert.equal(check(kids).status, 0, check(kids).stdout);
  // A v1 shim gets only its own not-v2 line.
  const old = game();
  assert.equal(run(old, '--audience', 'general', '--opt-out', 'yes').status, 4);
  const c = check(old);
  assert.match(c.stdout, /is not v2/);
  assert.doesNotMatch(c.stdout, /drops a setConsent|Analytics answer/);
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
  assert.match(labels, /\*\*Device or other IDs\*\*: collected, \*\*not shared\*\*/);
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
  // The code phase's state-machine rules live in skills/game-code/SKILL.md, which the phase points to.
  const code = read('skills/phases/code/SKILL.md') + read('skills/game-code/SKILL.md');
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

test('the analytics skill states the boot rule and the storage rule, and the switch lines point at it', () => {
  const skill = read('skills/analytics/SKILL.md');
  const consent = skill.slice(skill.indexOf('## Audience and consent'), skill.indexOf('## Privacy page'));
  assert.ok(consent.includes('**Apply a saved off at boot.**'));
  assert.ok(consent.includes("before the first\n`await` of its boot. When that answer is off, it calls `setConsent(false)` there"));
  assert.ok(consent.includes('With nothing saved, make no call'));
  assert.ok(consent.includes('`await app.initialize()`'));
  assert.ok(consent.includes('has a top-level `await`'));
  assert.ok(consent.includes('Never pass `--opt-out no` to get past them'));
  assert.ok(consent.includes('**Never write the SDK\'s own storage keys**, `ongame_consent:*` and `ongame_spool:*`'));
  assert.ok(consent.includes('Update the onGame CLI to the release after `cli-v0.2.50`'));
  for (const f of ['commands/analytics.md', 'commands/make-game.md', 'skills/game-code/SKILL.md']) {
    assert.match(read(f).replace(/\s+/g, ' '), /saved answer (at boot, in `src\/main\.ts` )?before the first `await`/, f);
  }
  // /publish and the polish phase run the upgrade without --check, so they act on its note.
  for (const f of ['commands/publish.md', 'skills/phases/polish/SKILL.md']) {
    assert.ok(read(f).replace(/\s+/g, ' ').includes('A `note:` about the saved Analytics answer at boot → fix what it names'), f);
  }
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.99', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.99 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.99'));
});

test('the plugin version and changelog carry this change', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.82', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.82 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.82'));
});

test('a refused file is named with forward slashes on every OS', async () => {
  const { shownPath } = await import(pathToFileURL(UPGRADE).href);
  assert.equal(shownPath('C:\\games\\g', 'C:\\games\\g\\src\\views\\Main.ts', path.win32), 'src/views/Main.ts');
  assert.equal(shownPath('/games/g', '/games/g/src/views/Main.ts', path.posix), 'src/views/Main.ts');
});
