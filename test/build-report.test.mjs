// workflows/build.js decides a phase was BLOCKED from each builder's structured report (`ok` field), never from a
// word in its text (ongame audit 2026-10-18). This runs the real file with fake runtime globals and checks that rule.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const body = readFileSync(new URL('../workflows/build.js', import.meta.url), 'utf8').replace(
  /^export const meta/m,
  'const meta'
);
const dir = mkdtempSync(join(tmpdir(), 'build-report-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const file = join(dir, 'runner.mjs');
writeFileSync(file, `export async function run({agent, parallel, phase, log, args}) {\n${body}\n}\n`);
const { run } = await import(pathToFileURL(file).href);

const args = {
  plan: { concept: 'x', path: 'production', entry: 'new' },
  phases: ['code'],
  buildId: 'b1',
  gameDir: '/tmp/g',
  pluginRoot: '/tmp/p',
  criticRounds: 0,
};
const split = { tasks: [{ id: 'a', label: 'a', brief: 'b', owns: ['x'] }], acceptance: ['ok'], evidence: [] };

async function build(builder) {
  const logs = [];
  const opts = [];
  const agent = async (_prompt, o = {}) => {
    if (o.phase === 'Split') return split;
    if (o.phase === 'Build') {
      opts.push(o);
      return builder();
    }
    return { pass: true, findings: [], verifiedBy: ['looked'] };
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => t().catch(() => null)));
  const r = await run({ agent, parallel, phase: () => {}, log: (m) => logs.push(m), args });
  return { r, logs, opts };
}

test('builders are asked for a structured report', async () => {
  const { opts } = await build(() => ({ phase: 'code', task: 'a', ok: true, artifacts: [] }));
  assert.equal(opts.length, 1);
  assert.deepEqual(opts[0].schema.required, ['phase', 'task', 'ok', 'artifacts']);
});

test('the word "blocked" in an ok report does not block the phase', async () => {
  // As text: the old word search read this exact line as a tooling failure.
  const { r } = await build(() =>
    JSON.stringify({ phase: 'code', task: 'a', ok: true, artifacts: ['src/menu.ts'], handoff: 'the blocked tile in the menu now opens' })
  );
  assert.equal(r.blocked, undefined);
});

test('ok:false blocks the phase and names the tool', async () => {
  const { r, logs } = await build(() => ({
    phase: 'code',
    task: 'a',
    ok: false,
    artifacts: [],
    blocked: { tool: 'forge_request', what: 'unreachable' },
  }));
  assert.equal(r.blocked.length, 1);
  assert.deepEqual(r.blocked[0].tools, [{ tool: 'forge_request', what: 'unreachable' }]);
  assert.ok(logs.some((l) => l.startsWith('BLOCKED')));
});

test('a report serialised as JSON text is still read', async () => {
  const { r } = await build(() => JSON.stringify({ phase: 'code', task: 'a', ok: true, artifacts: [] }));
  assert.equal(r.blocked, undefined);
});

test('prose with no report counts as unconfirmed, not as ok', async () => {
  const { r, logs } = await build(() => 'could not reach ongame, wrote nothing');
  assert.equal(r.blocked.length, 1);
  assert.deepEqual(r.blocked[0].tools, [{ tool: 'builder', what: 'no report' }]);
  assert.ok(logs.some((l) => l.includes('returned no structured report')));
});
