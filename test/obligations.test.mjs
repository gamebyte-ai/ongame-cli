#!/usr/bin/env node
/**
 * The dispatcher's contract, on throwaway fixtures. No browser, no game, no network.
 *
 * The rule with teeth is that a BLOCKING obligation with no result is a FAIL, never a skip — silence
 * used to read as success. These fixtures pin that, plus the two verdicts that are deliberately NOT
 * failures: `advisory` (it rests on an assumption, so turning it into a law is the error) and
 * `pose` without a predicate (the primitive exposes a counter and no rendered transform, so it is a
 * missing capability, not a broken build).
 *
 *   node test/obligations.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DISPATCH = path.join(ROOT, 'skills/reference/obligations.mjs');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

/** Build a throwaway gameDir, run `score`, return {results, exitCode}. */
function run(obligations, { sources = {}, evidence = [], collected = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obl-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
  for (const name of evidence) fs.writeFileSync(path.join(dir, 'evidence', name), '');
  for (const [name, body] of Object.entries(sources)) fs.writeFileSync(path.join(dir, 'src', name), body);
  fs.writeFileSync(path.join(dir, 'docs/obligations.json'), JSON.stringify(obligations));
  const args = [DISPATCH, 'score', dir];
  if (collected) {
    fs.writeFileSync(path.join(dir, 'collected.json'), JSON.stringify(collected));
    args.push(path.join(dir, 'collected.json'));
  }
  let exitCode = 0;
  try { execFileSync('node', args, { stdio: 'pipe' }); }
  catch (e) { exitCode = e.status ?? 1; }
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'docs/obligations.result.json'), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  return { results: out.results, exitCode };
}
const verdictOf = (r, id) => (r.find((x) => x.id === id) || {}).verdict;

// PROV-01: a MEASURED claim citing a generated artefact is the failure this lock exists for.
const DIRTY = `/** MEASURED, from the reference frame (assets/concept/05_pour.png, 768 px wide). */
export const TILT_DEG = 142;`;
const CLEAN = `/** MEASURED off shot_04_gameplay.png at 924x1999. */
export const TILT_DEG = 63;`;
const PROV = [{ id: 'PROV-01', primitive: 'prov', enforcement: 'blocking' }];

let r = run(PROV, { sources: { 'a.ts': DIRTY }, evidence: ['shot_04_gameplay.png'] });
check('PROV-01 FAILs on a constant measured off generated concept art',
  verdictOf(r.results, 'PROV-01') === 'FAIL' && r.exitCode === 1);

r = run(PROV, { sources: { 'a.ts': CLEAN }, evidence: ['shot_04_gameplay.png'] });
check('PROV-01 PASSes when the cited basename resolves in the evidence root',
  verdictOf(r.results, 'PROV-01') === 'PASS' && r.exitCode === 0,
  'a bare basename must count — real code writes shot_04.png, not evidence/shot_04.png');

// The teeth: no result is a FAIL, and it rejects the build.
r = run([{ id: 'R-01', primitive: 'model', enforcement: 'blocking' }]);
check('a blocking obligation with no binding FAILs and rejects',
  verdictOf(r.results, 'R-01') === 'FAIL' && r.exitCode === 1);

// advisory is reported and must NOT reject — a guess may not become a law.
r = run([{ id: 'R-02', primitive: 'model', enforcement: 'advisory' }]);
check('an advisory obligation with no binding does not reject',
  verdictOf(r.results, 'R-02') === 'FAIL' && r.exitCode === 0);

// pose without a predicate is a missing capability, not a broken build.
r = run([{ id: 'R-03', primitive: 'pose', enforcement: 'blocking' }]);
check('pose without a predicate reports BLOCKED, not FAIL',
  verdictOf(r.results, 'R-03') === 'BLOCKED');

// every other primitive still owes a predicate.
r = run([{ id: 'R-04', primitive: 'state', enforcement: 'blocking' }]);
check('a non-pose primitive without a predicate still FAILs',
  verdictOf(r.results, 'R-04') === 'FAIL');

// hitArea predicates evaluate against the collected payload, with pick() and W.
const CTX = { any: { W: 430, H: 932, hitAreas: [
  { id: 'bottle-0', x: 42.6, y: 379.9, width: 60, height: 183 },
  { id: 'bottle-1', x: 113.8, y: 379.9, width: 60, height: 183 }] } };
r = run([{ id: 'R-05', primitive: 'hitArea', enforcement: 'blocking', state: 'any',
  predicate: "pick('bottle-*').every(b => Math.abs(b.width/W - 0.1396) <= 0.0014)",
  evidence: "pick('bottle-*').map(b => (b.width/W).toFixed(4)).join(',')" }], { collected: CTX });
check('a hitArea predicate evaluates over pick() and W',
  verdictOf(r.results, 'R-05') === 'PASS',
  (r.results.find((x) => x.id === 'R-05') || {}).evidence);

// px is a FUNCTION over collected samples, and says so when the sample is missing.
r = run([{ id: 'R-06', primitive: 'pixel', enforcement: 'blocking', state: 'any',
  predicate: "px('yellow')[0] === 252" }], { collected: { any: { W: 1, H: 1, px: { yellow: [252, 192, 6] } } } });
check('px(key) resolves a collected sample', verdictOf(r.results, 'R-06') === 'PASS');

r = run([{ id: 'R-07', primitive: 'pixel', enforcement: 'blocking', state: 'any',
  predicate: "px('missing')[0] === 1" }], { collected: { any: { W: 1, H: 1, px: {} } } });
const ev = (r.results.find((x) => x.id === 'R-07') || {}).evidence || '';
check('px(key) names the missing sample instead of throwing undefined',
  verdictOf(r.results, 'R-07') === 'FAIL' && /no pixel sample collected for "missing"/.test(ev));

console.log(`\n  ${failures ? `${failures} FAILURE(S)` : 'the dispatcher contract holds'}`);
process.exit(failures ? 1 : 0);
