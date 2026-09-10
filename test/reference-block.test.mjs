#!/usr/bin/env node
/** Executes the real workflow to check opaque context delivery. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'workflows/build.js'), 'utf8')
  .replace(/^export const meta[\s\S]*?};\s*/m, ''); // drop the module-level export

/** Execute build.js against stubbed globals and return every prompt it gave to agent(). */
async function capture(args) {
  const captured = [];
  const stub = {
    args,
    agent: async (prompt, opts) => {
      captured.push({ label: opts?.label ?? '?', prompt });
      if (opts?.schema || String(opts?.label).startsWith('split')) {
        return { tasks: [{ id: 'a', label: 'a', brief: 'a', owns: ['src/a'] },
                          { id: 'b', label: 'b', brief: 'b', owns: ['src/b'] }],
                 acceptance: ['x'], evidence: [] };
      }
      if (String(opts?.label).startsWith('critic')) return { pass: true, findings: [], unmeasured: [] };
      return JSON.stringify({ phase: 'x', ok: true, artifacts: [] });
    },
    parallel: async (fns) => Promise.all(fns.map((f) => f())),
    phase: () => {}, log: () => {},
  };
  const fn = new Function(...Object.keys(stub), `return (async () => { ${SRC} })();`);
  await fn(...Object.values(stub));
  return captured;
}

const BASE = {
  plan: { concept: 'runner', path: 'production', entry: 'new' },
  phases: ['code', 'assets'], buildId: 'b_test', gameDir: '/tmp/g', pluginRoot: '/tmp/p',
  criticRounds: 1, split: 'auto', target: 'fun',
};
const CONTEXT = '\n\nAuthenticated reference context \u2603 \u{1f3ae}\nKeep this exact string.\n';
const plain = await capture(BASE);
assert.equal(plain.length, 8);
assert.ok(plain.every(c => !c.prompt.includes(CONTEXT)));
for (const args of [
  { ...BASE, referenceContext: CONTEXT },
  { ...BASE, phases: ['polish'], referenceContext: CONTEXT },
  { ...BASE, notes: 'Repair the animation', referenceContext: CONTEXT },
  JSON.stringify({ ...BASE, referenceContext: CONTEXT }),
]) {
  const roles = await capture(args);
  assert.ok(roles.length >= 4);
  for (const role of roles) assert.equal(role.prompt.split(CONTEXT).length - 1, 1, role.label);
}
for (const referenceContext of [null, 42, {}, 'x'.repeat(131073)]) {
  await assert.rejects(capture({ ...BASE, referenceContext }), /referenceContext/);
}
await assert.rejects(capture({ ...BASE, reference: { relation: 'match_reference' } }), /reference_context/);
console.log('PASS reference context: 8 roles, segments, retries, JSON args, invalid input');
