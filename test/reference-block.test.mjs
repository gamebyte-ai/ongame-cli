#!/usr/bin/env node
/**
 * The reference block's three invariants, asserted on the REAL workflows/build.js.
 *
 * Why this file exists: a reference package that silently stops reaching the builder looks exactly
 * like one that arrives — the build still runs, the prompts still compose, nothing errors. The only
 * cheap way to know is to execute the runner with stubbed Workflow globals and read what it handed
 * to each agent.
 *
 * It asserts INVARIANTS, not a golden hash. A hash over the composed prompt would go red on every
 * legitimate wording change in the runner and get regenerated without being read, which is worse
 * than no test.
 *
 *   node test/reference-block.test.mjs
 */
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
  plan: { concept: 'a simple endless runner', path: 'production', entry: 'new' },
  phases: ['code', 'assets'], buildId: 'b_test', gameDir: '/tmp/g', pluginRoot: '/tmp/p',
  criticRounds: 1, split: 'auto', target: 'fun and fast',
};
const REFERENCE = {
  relation: 'match_reference', title: 'Some Game', packagePath: '/tmp/g/docs/reference_package.yaml',
  truth: ['R-01 the board is 4x4'], blocking: ['A-01 X -> NAMED (why)'],
  levels: ['INST-01 the opening board'], notObserved: ['lose state'], overrides: [],
  obligations: ['R-01 [geometry] the board pitch @ any ±1% <- evidence/shot.png'],
};

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

// 1. create_from_idea is untouched. This is the one that protects every build that has no reference.
const plain = await capture(BASE);
check('create_from_idea: no reference marker in any prompt',
  plain.length > 0 && plain.every((c) => !/REFERENCE PACKAGE|VERIFICATION OBLIGATIONS/.test(c.prompt)),
  `${plain.length} roles`);

// 2. With a reference, the block reaches EVERY role — splitter and critic included, not just builders.
const withRef = await capture({ ...BASE, reference: REFERENCE });
const gotBlock = withRef.filter((c) => c.prompt.includes('=== REFERENCE PACKAGE')).length;
check('match_reference: the block reaches every role', gotBlock === withRef.length,
  `${gotBlock}/${withRef.length} roles`);
const gotObl = withRef.filter((c) => c.prompt.includes('VERIFICATION OBLIGATIONS')).length;
check('obligations reach every role', gotObl === withRef.length, `${gotObl}/${withRef.length} roles`);

// 3. Absent or empty sections render nothing — an empty header is noise in every prompt.
for (const [name, ref] of [['obligations absent', { ...REFERENCE, obligations: undefined }],
                           ['obligations empty', { ...REFERENCE, obligations: [] }],
                           ['levels empty', { ...REFERENCE, levels: [] }]]) {
  const caps = await capture({ ...BASE, reference: ref });
  const marker = name.startsWith('obligations') ? 'VERIFICATION OBLIGATIONS' : 'MEASURED INSTANCES';
  check(`${name}: section not rendered`, caps.every((c) => !c.prompt.includes(marker)));
}

// 4. The role count itself: a runner that stopped fanning out would pass 1-3 silently.
check('runner fans out to more than one role per phase', withRef.length >= 4, `${withRef.length} roles`);

console.log(`\n  ${failures ? `${failures} FAILURE(S)` : 'all invariants hold'}`);
process.exit(failures ? 1 : 0);
