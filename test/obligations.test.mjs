#!/usr/bin/env node
/**
 * The dispatcher's contract, on throwaway fixtures. No browser, no game, no network.
 *
 * The rule with teeth is that a BLOCKING obligation with no result is a FAIL, never a skip — silence
 * used to read as success. These fixtures pin that, plus the verdicts that are deliberately NOT
 * failures: `advisory` (it rests on an assumption, so turning it into a law is the error) and
 * BLOCKED (a capability this pipeline does not have yet — a gap in the tooling is not a defect in
 * the build, and rejecting for it would make those obligations unshippable).
 *
 * Everything from `PREDICATES ARE DATA` down was written against a Codex review that found the
 * dispatcher executing compiler-authored JavaScript with `new Function`. Those cases assert the
 * refusal, so the vulnerable path cannot come back quietly.
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

/** Build a throwaway gameDir. Returns the dir; caller removes it. */
function makeDir({ obligations, sources = {}, evidence = [], ref = [], assets = [], collected = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obl-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  if (evidence.length) fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
  if (ref.length) fs.mkdirSync(path.join(dir, '.ref'), { recursive: true });
  for (const name of evidence) fs.writeFileSync(path.join(dir, 'evidence', name), '');
  for (const name of ref) fs.writeFileSync(path.join(dir, '.ref', name), '');
  for (const a of assets) {
    fs.mkdirSync(path.join(dir, 'assets', path.dirname(a)), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets', a), '');
  }
  for (const [name, body] of Object.entries(sources)) fs.writeFileSync(path.join(dir, 'src', name), body);
  fs.writeFileSync(path.join(dir, 'docs/obligations.json'),
    typeof obligations === 'string' ? obligations : JSON.stringify(obligations));
  if (collected) fs.writeFileSync(path.join(dir, 'collected.json'), JSON.stringify(collected));
  return dir;
}

function dispatch(cmd, dir, extra = []) {
  let exitCode = 0, stdout = '';
  try { stdout = execFileSync('node', [DISPATCH, cmd, dir, ...extra], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (e) { exitCode = e.status ?? 1; stdout = String(e.stdout ?? ''); }
  return { exitCode, stdout };
}

/** Run `score` on a throwaway gameDir and return {results, exitCode, dir kept? no}. */
function run(obligations, opts = {}) {
  // A real reference package always carries PROV-01, and the dispatcher now says so. Fixtures get it
  // by default (their empty src/ makes it a clean PASS) so that each case tests the ONE behaviour it
  // names; `prov: false` opts out for the cases that are about its absence.
  if (opts.prov !== false && Array.isArray(obligations) &&
      !obligations.some((x) => x && (x.primitive === 'prov' || /^PROV-/.test(x.id || '')))) {
    obligations = [...obligations, { id: 'PROV-01', primitive: 'prov', enforcement: 'blocking' }];
  }
  const dir = makeDir({ obligations, ...opts });
  const { exitCode, stdout } = dispatch('score', dir, opts.collected ? [path.join(dir, 'collected.json')] : []);
  const resPath = path.join(dir, 'docs/obligations.result.json');
  const out = fs.existsSync(resPath) ? JSON.parse(fs.readFileSync(resPath, 'utf8')) : null;
  // The exploit string writes to process.cwd(), which for the child is the REPO root, not gameDir.
  // Checking only gameDir made this probe vacuous — it would have missed the very regression it exists
  // for. Both locations are checked, and a stray file is removed so a real regression is visible once.
  const spots = [path.join(dir, 'PWNED'), path.join(ROOT, 'PWNED'), path.join(process.cwd(), 'PWNED')];
  const hit = spots.filter((f) => fs.existsSync(f));
  for (const f of hit) fs.rmSync(f, { force: true });
  const sideEffect = hit.length > 0;
  fs.rmSync(dir, { recursive: true, force: true });
  return { results: out?.results ?? null, out, exitCode, stdout, sideEffect };
}
const of_ = (r, id) => (r || []).find((x) => x.id === id) || {};
const verdictOf = (r, id) => of_(r, id).verdict;

/* ────────────────────────── PROVENANCE (PROV-01) ────────────────────────── */

const DIRTY = `/** MEASURED, from the reference frame (assets/concept/05_pour.png, 768 px wide). */
export const TILT_DEG = 142;`;
const CLEAN = `/** MEASURED off shot_04_gameplay.png at 924x1999. */
export const TILT_DEG = 63;`;
const GHOST = `/** MEASURED from does_not_exist.png, frame 12. */
export const TILT_DEG = 63;`;
const PROV = [{ id: 'PROV-01', primitive: 'prov', enforcement: 'blocking' }];

let r = run(PROV, { sources: { 'a.ts': DIRTY }, evidence: ['shot_04_gameplay.png'] });
check('PROV-01 FAILs on a constant measured off generated concept art',
  verdictOf(r.results, 'PROV-01') === 'FAIL' && r.exitCode === 1);

r = run(PROV, { sources: { 'a.ts': CLEAN }, evidence: ['shot_04_gameplay.png'] });
check('PROV-01 PASSes when the cited basename resolves in the evidence root',
  verdictOf(r.results, 'PROV-01') === 'PASS' && r.exitCode === 0,
  'a bare basename must count — real code writes shot_04.png, not evidence/shot_04.png');

// [Codex P1] the skill documents raw evidence under `.ref/`; the checker only looked in `evidence/`.
r = run(PROV, { sources: { 'a.ts': CLEAN }, ref: ['shot_04_gameplay.png'] });
check('PROV-01 resolves evidence under .ref/, which is where the skill says raw evidence lives',
  verdictOf(r.results, 'PROV-01') === 'PASS' && r.exitCode === 0,
  of_(r.results, 'PROV-01').evidence);

// [Codex P1] a MEASURED claim citing a path that resolves NOWHERE used to pass, because only
// denylisted generated paths were flagged. The documented rule is "must resolve in the evidence root".
r = run(PROV, { sources: { 'a.ts': GHOST }, evidence: ['shot_04_gameplay.png'] });
check('PROV-01 FAILs on a MEASURED claim whose cited file resolves nowhere',
  verdictOf(r.results, 'PROV-01') === 'FAIL' && r.exitCode === 1,
  of_(r.results, 'PROV-01').evidence);

// Measuring your OWN shipped sprite is not a provenance violation — it is not reference authority,
// but it does resolve, and flagging it would make the lock unusable.
const SELF = `/** MEASURED off assets/sprites/bottle.png (the sprite we ship). */\nexport const W = 60;`;
r = run(PROV, { sources: { 'a.ts': SELF }, evidence: ['shot_04.png'], assets: ['sprites/bottle.png'] });
check('PROV-01 tolerates a constant measured off the build\'s own shipped asset',
  verdictOf(r.results, 'PROV-01') === 'PASS' && /1 measured off the build/.test(of_(r.results, 'PROV-01').evidence || ''),
  of_(r.results, 'PROV-01').evidence);

// The build side resolves by BASENAME, like the evidence root does — a run on a real shipped build
// flagged a genuine self-measurement (`bottle-glass.png`, actually at public/assets/) because only
// three fixed prefixes were checked.
r = run(PROV, {
  sources: { 'a.ts': '/** `bottle-glass.png` v6, measured on the shipped file (224 x 683). */\nexport const W = 224;' },
  evidence: ['shot_04.png'], assets: ['deep/nested/forge/bottle-glass.png'],
});
check('a bare-basename citation of a shipped asset resolves wherever it actually lives',
  verdictOf(r.results, 'PROV-01') === 'PASS', of_(r.results, 'PROV-01').evidence);

// [Codex 6th pass P1] and the widening reopened the bypass from the other side: a BARE basename whose
// only copy in the build is a generated artefact was waved through as a self-measurement. The denylist
// is tested against the path the basename actually resolved to.
r = run(PROV, {
  sources: { 'a.ts': '/** MEASURED from shot.png, 768 px wide. */\nexport const T = 142;' },
  evidence: ['other.png'], assets: ['concept/shot.png'],
});
check('a bare basename resolving ONLY to generated art is still a violation',
  verdictOf(r.results, 'PROV-01') === 'FAIL' && r.exitCode === 1, of_(r.results, 'PROV-01').evidence);

// ...but a name that ALSO exists as a real shipped asset keeps the exemption.
r = run(PROV, {
  sources: { 'a.ts': '/** MEASURED from shot.png, 768 px wide. */\nexport const T = 142;' },
  evidence: ['other.png'], assets: ['concept/shot.png', 'sprites/shot.png'],
});
check('the same name shipped as a real asset keeps the self-measurement exemption',
  verdictOf(r.results, 'PROV-01') === 'PASS', of_(r.results, 'PROV-01').evidence);

// ...but the exemption is "it resolves", not "it starts with assets/" — an asset that is not there
// is an unresolvable citation like any other.
r = run(PROV, { sources: { 'a.ts': SELF }, evidence: ['shot_04.png'] });
check('PROV-01 does not let a non-existent assets/ path claim the self-measurement exemption',
  verdictOf(r.results, 'PROV-01') === 'FAIL', of_(r.results, 'PROV-01').evidence);

// [Codex P1] the doc/code contract: SKILL.md's PROV-01 example must name the primitive the
// dispatcher actually routes to provenance. The old skill said `model` and the dispatcher said `prov`,
// so a compliant package would have failed for a missing model binding.
const SKILL = fs.readFileSync(path.join(ROOT, 'skills/reference/SKILL.md'), 'utf8');
const provPrimitive = (SKILL.match(/PROV-01[\s\S]{0,400}?primitive:\s*`?([a-z]+)`?/) || [])[1];
check('SKILL.md declares PROV-01 with the primitive the dispatcher routes to provenance',
  provPrimitive === 'prov', `SKILL.md says ${provPrimitive ?? '(not found)'}`);
const enumLine = (SKILL.match(/^\s*primitive:\s*[a-z|]+$/m) || ['(enum line not found)'])[0];
check('SKILL.md lists `prov` among the primitives an obligation may name',
  /\bprov\b/.test(enumLine), enumLine.trim());

// [Codex 4th pass P1] the provenance lock could be DOWNGRADED: `enforcement: advisory` made a
// generated-art citation an ADVISORY-FAIL and the decision ACCEPT. It is the one obligation whose
// enforcement is not the package's to choose.
r = run([{ id: 'PROV-01', primitive: 'prov', enforcement: 'advisory' }],
  { sources: { 'a.ts': DIRTY }, evidence: ['shot_04_gameplay.png'] });
check('PROV-01 cannot be downgraded to advisory',
  verdictOf(r.results, 'PROV-01') === 'FAIL' && r.exitCode === 1 &&
  of_(r.results, 'PROV-01').enforcement === 'blocking',
  `enforcement=${of_(r.results, 'PROV-01').enforcement} exit=${r.exitCode}`);

// The measured floor this lock has to keep: "measured" is ordinary English in real game code
// ("freshly measured", "a measured layout"). Across the four shipped A/B builds, treating a claim
// with no cited file as a violation produced 6-39 findings per build and essentially all of them were
// prose, including on the two arms that had no reference package at all. The lock fires on a CITED
// FILE for that reason, and this case pins the floor so that never regresses into noise.
r = run(PROV, {
  sources: { 'a.ts': `/** Every registered rect, freshly measured. This is what diagnostics maps over. */
export const RECTS = [];
// floor makes it the wrong size against a measured layout; an invisible margin would too.
export const PAD = 8;` },
  evidence: ['shot_04.png'],
});
check('ordinary "measured" prose with no citation is not a violation',
  verdictOf(r.results, 'PROV-01') === 'PASS',
  of_(r.results, 'PROV-01').evidence);

// [Codex 5th pass P1] the claim regex only matched `observed from`, so `observed in <path>` slipped
// through and the cited generated artefact was never checked. Broadening is free of noise because the
// CITED FILE is the gate: measured across the four shipped builds, it catches 2-8 more real claims per
// build and adds no prose.
for (const [phrasing, name] of [
  ['/** observed in assets/concept/shot.png */', 'observed in'],
  ['/** DIRECTLY_OBSERVED, assets/concept/shot.png frame 4 */', 'DIRECTLY_OBSERVED'],
  ['/** taken off assets/concept/shot.png as measured */', 'measured, trailing'],
]) {
  r = run(PROV, { sources: { 'a.ts': `${phrasing}\nexport const ROWS = 4;` }, evidence: ['other.png'] });
  check(`PROV-01 catches a generated citation phrased "${name}"`,
    verdictOf(r.results, 'PROV-01') === 'FAIL', of_(r.results, 'PROV-01').evidence);
}

// [Codex 5th pass P2] bindings are keyed by id alone, so two blocking model obligations sharing an id
// both passed off ONE binding.
r = run([{ id: 'R-01', primitive: 'model', enforcement: 'blocking' },
         { id: 'R-01', primitive: 'model', enforcement: 'blocking' }],
  { collected: { bound: { 'R-01': { pass: true, evidence: 'one assertion' } } } });
check('duplicate obligation ids are refused, so one binding cannot satisfy two checks',
  r.exitCode === 1 && /duplicate/i.test(JSON.stringify(r.results)),
  JSON.stringify(r.results).slice(0, 160));

// Drift guard: an obligation named PROV-01 that carries some other primitive is a package bug.
r = run([{ id: 'PROV-01', primitive: 'model', enforcement: 'blocking' }], { sources: { 'a.ts': CLEAN }, evidence: ['shot_04.png'] });
check('an obligation named PROV-01 with a non-prov primitive FAILs loudly',
  verdictOf(r.results, 'PROV-01') === 'FAIL' && /prov/.test(of_(r.results, 'PROV-01').evidence || ''),
  of_(r.results, 'PROV-01').evidence);

// [Codex re-review P1] the basename check ran BEFORE the generated-artefact denylist, so a citation
// under assets/concept/ was accepted whenever ANY evidence file happened to share its basename —
// reopening the exact bypass PROV-01 exists to close.
r = run(PROV, {
  sources: { 'a.ts': '/** MEASURED from assets/concept/shot.png, 768 px wide. */\nexport const T = 142;' },
  evidence: ['shot.png'],
});
check('PROV-01 is not fooled by a basename collision with a generated path',
  verdictOf(r.results, 'PROV-01') === 'FAIL' && r.exitCode === 1, of_(r.results, 'PROV-01').evidence);

// [Codex 3rd pass P1] the path regex excluded backslashes, so a Windows-style citation was captured
// as its bare basename and laundered through the evidence lookup.
r = run(PROV, {
  sources: { 'a.ts': '/** MEASURED from assets\\concept\\shot.png. */\nexport const T = 1;' },
  evidence: ['shot.png'],
});
check('a backslash-spelled generated path is still caught',
  verdictOf(r.results, 'PROV-01') === 'FAIL', of_(r.results, 'PROV-01').evidence);

r = run(PROV, {
  sources: { 'a.ts': '/** MEASURED from runtime_01.png. */\nexport const T = 1;' },
  evidence: ['runtime_01.png'],
});
check('a numbered runtime screenshot is recognised as generated',
  verdictOf(r.results, 'PROV-01') === 'FAIL', of_(r.results, 'PROV-01').evidence);

/* ────────────────────────── THE TEETH ────────────────────────── */

r = run([{ id: 'R-01', primitive: 'model', enforcement: 'blocking' }]);
check('a blocking obligation with no binding FAILs and rejects',
  verdictOf(r.results, 'R-01') === 'FAIL' && r.exitCode === 1);

r = run([{ id: 'R-02', primitive: 'model', enforcement: 'advisory' }]);
check('an advisory obligation with no binding does not reject',
  verdictOf(r.results, 'R-02') === 'FAIL' && r.exitCode === 0);

/* ────────────────────────── PREDICATES ARE DATA [Codex P1] ────────────────────────── */

// The finding: `predicate` was a JavaScript string, evaluated with `new Function`. The compiler
// ingests external reference material and obligations.json lives in gameDir, so that is arbitrary
// Node execution as the workflow user. A refused string must not run — proven by side effect.
const EXPLOIT = "require('node:fs').writeFileSync(process.cwd() + '/PWNED','x') || true";
r = run([{ id: 'R-JS', primitive: 'state', enforcement: 'blocking', state: 'any', predicate: EXPLOIT }],
  { collected: { any: { W: 1, H: 1 } } });
check('a string predicate is REFUSED, not executed',
  verdictOf(r.results, 'R-JS') === 'FAIL' && !r.sideEffect && /declarative|not executed|string/i.test(of_(r.results, 'R-JS').evidence || ''),
  of_(r.results, 'R-JS').evidence);

// The `evidence` field was the second injection vector — same treatment.
r = run([{ id: 'R-EV', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.score' }, 'eq', 3] }, evidence: EXPLOIT }],
  { collected: { any: { W: 1, H: 1, state: { score: 3 } } } });
check('a string `evidence` expression is not executed either',
  verdictOf(r.results, 'R-EV') === 'PASS' && !r.sideEffect,
  of_(r.results, 'R-EV').evidence);

const CTX = { any: { W: 430, H: 932, hitAreas: [
  { id: 'bottle-0', x: 42.6, y: 379.9, width: 60, height: 183 },
  { id: 'bottle-1', x: 113.8, y: 379.9, width: 60, height: 183 },
  { id: 'bottle-2', x: 185.0, y: 379.9, width: 60, height: 183 }] } };

// Every one of these shapes is transcribed from a predicate a real build actually shipped
// (~/src/msort-ab/T and ~/src/yarn-ab/T), so the schema is sized to observed need, not to a guess.

// R-SP-01: each bottle's width / viewport width, within a band.  (was: pick(...).every(b => Math.abs(...)))
r = run([{ id: 'D-01', primitive: 'hitArea', enforcement: 'blocking', state: 'any',
  predicate: { every: { hitAreas: 'bottle-*' },
    satisfies: { near: [{ div: [{ item: 'width' }, { path: 'W' }] }, 0.1396, 0.0014] } } }], { collected: CTX });
check('declarative: a per-item ratio within a tolerance band',
  verdictOf(r.results, 'D-01') === 'PASS', of_(r.results, 'D-01').evidence);

// R-SP-02: the row's total gap budget.  (was: an IIFE with a for-loop)
r = run([{ id: 'D-02', primitive: 'hitArea', enforcement: 'blocking', state: 'any',
  predicate: { near: [{ div: [{ gaps: { hitAreas: 'bottle-*' }, axis: 'x' }, { path: 'W' }], }, 0.0521, 0.004] } }],
  { collected: CTX });
check('declarative: a summed inter-item gap budget, no loop and no code',
  verdictOf(r.results, 'D-02') === 'PASS', of_(r.results, 'D-02').evidence);

// R-07: two selections compared by count, plus a floor on each rect.
r = run([{ id: 'D-03', primitive: 'hitArea', enforcement: 'blocking', state: 'any',
  predicate: { all: [
    { cmp: [{ count: { hitAreas: 'bottle-*' } }, 'gte', 3] },
    { every: { hitAreas: 'bottle-*' }, satisfies: { cmp: [{ item: 'height' }, 'gte', { mul: [0.05, { path: 'H' }] }] } }] } }],
  { collected: CTX });
check('declarative: count comparison + a floor expressed against H',
  verdictOf(r.results, 'D-03') === 'PASS', of_(r.results, 'D-03').evidence);

// R-04: an implication — the invariant only binds in the win state.  (was: a ternary)
const WINCTX = { any: { W: 1, H: 1, state: { screen: 'play' }, board: [{ color: 'r' }, null] } };
r = run([{ id: 'D-04', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { when: { cmp: [{ path: 'state.screen' }, 'eq', 'win'] },
    then: { cmp: [{ count: { path: 'board', where: { truthy: { item: 'color' } } } }, 'eq', 0] } } }],
  { collected: WINCTX });
check('declarative: an implication holds vacuously outside its state',
  verdictOf(r.results, 'D-04') === 'PASS', of_(r.results, 'D-04').evidence);

// R-06: cross-reference — each ball's target cell must carry that ball's colour.
const XCTX = { any: { W: 1, H: 1, board: [{ color: 'cyan' }, { color: 'red' }],
  state: { belt: { balls: [{ color: 'cyan', target: 0 }, { color: 'red', target: 1 }, { color: 'red', target: null }] } } } };
r = run([{ id: 'D-05', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { every: { path: 'state.belt.balls', where: { not: { cmp: [{ item: 'target' }, 'eq', null] } } },
    satisfies: { cmp: [{ lookup: { path: 'board' }, at: { item: 'target' }, of: 'color' }, 'eq', { item: 'color' }] } } }],
  { collected: XCTX });
check('declarative: a filtered cross-reference between two collections',
  verdictOf(r.results, 'D-05') === 'PASS', of_(r.results, 'D-05').evidence);

// A false predicate must FAIL with the ACTUAL numbers in evidence — the trace is the whole point of
// giving up the JS `evidence` expression.
r = run([{ id: 'D-06', primitive: 'hitArea', enforcement: 'blocking', state: 'any',
  predicate: { every: { hitAreas: 'bottle-*' },
    satisfies: { near: [{ div: [{ item: 'width' }, { path: 'W' }] }, 0.30, 0.001] } } }], { collected: CTX });
check('a failing declarative predicate reports the measured value, not just "false"',
  verdictOf(r.results, 'D-06') === 'FAIL' && /0\.139/.test(of_(r.results, 'D-06').evidence || ''),
  of_(r.results, 'D-06').evidence);

// A malformed predicate is a package bug and must be named as one, not silently pass.
r = run([{ id: 'D-07', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.x' }, 'spaceship', 1] } }], { collected: { any: { W: 1, H: 1, state: { x: 1 } } } });
check('an unknown operator FAILs with the offending token named',
  verdictOf(r.results, 'D-07') === 'FAIL' && /spaceship/.test(of_(r.results, 'D-07').evidence || ''),
  of_(r.results, 'D-07').evidence);

r = run([{ id: 'D-08', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.__proto__.constructor' }, 'ne', null] } }],
  { collected: { any: { W: 1, H: 1, state: { x: 1 } } } });
check('a path may not walk into prototype internals',
  verdictOf(r.results, 'D-08') === 'FAIL' && /__proto__|prototype|forbidden/i.test(of_(r.results, 'D-08').evidence || ''),
  of_(r.results, 'D-08').evidence);

/* ─────── ABSENCE IS NOT A VALUE, AND A MALFORMED BRANCH IS NOT A PASS [Codex re-review P1] ─────── */

// [Codex 3rd pass P1] absence survived one layer of arithmetic: Number(undefined) is NaN, and
// `NaN !== null` is true, so wrapping the missing path in {add:[...,0]} restored the PASS.
r = run([{ id: 'C-01', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ add: [{ path: 'state.mispelled' }, 0] }, 'ne', null] } }],
  { collected: { any: { W: 1, H: 1, state: { spelled: 1 } } } });
check('absence does not survive arithmetic coercion',
  verdictOf(r.results, 'C-01') === 'FAIL' && /mispelled|nothing/.test(of_(r.results, 'C-01').evidence || ''),
  of_(r.results, 'C-01').evidence);

r = run([{ id: 'C-02', primitive: 'hitArea', enforcement: 'blocking', state: 'any',
  predicate: { near: [{ div: [{ path: 'state.gone' }, { path: 'W' }] }, 0.5, 1] } }],
  { collected: { any: { W: 430, H: 1, state: {} } } });
check('absence does not survive a division inside near()',
  verdictOf(r.results, 'C-02') === 'FAIL', of_(r.results, 'C-02').evidence);

// [Codex 4th pass P1] selector-backed terms laundered absence: a missing path became `[]`, so
// `{count:{path:"state.missing"}}` was 0 and satisfied `eq 0` although the surface was never there.
r = run([{ id: 'C-06', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ count: { path: 'state.missing' } }, 'eq', 0] } }],
  { collected: { any: { W: 1, H: 1, state: {} } } });
check('a selector over an ABSENT path FAILs instead of counting zero',
  verdictOf(r.results, 'C-06') === 'FAIL' && /missing|nothing/.test(of_(r.results, 'C-06').evidence || ''),
  of_(r.results, 'C-06').evidence);

// ...while a surface that is PRESENT and empty is a real observation of zero.
r = run([{ id: 'C-07', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ count: { path: 'state.balls' } }, 'eq', 0] } }],
  { collected: { any: { W: 1, H: 1, state: { balls: [] } } } });
check('a present-but-empty collection still counts as zero',
  verdictOf(r.results, 'C-07') === 'PASS', of_(r.results, 'C-07').evidence);

// [Codex 4th pass P1] selectors escaped the exactly-one-operator rule: {hitAreas, path} validated and
// then silently used hitAreas.
r = run([{ id: 'C-08', primitive: 'hitArea', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ count: { hitAreas: '*', path: 'state.realThings' } }, 'gte', 1] } }],
  { collected: { any: { W: 1, H: 1, hitAreas: [{ id: 'a', x: 0, y: 0, width: 1, height: 1 }], state: {} } } });
check('a selector carrying two sources is refused, not resolved by key order',
  verdictOf(r.results, 'C-08') === 'FAIL', of_(r.results, 'C-08').evidence);

// [Codex 4th pass P1] lookup/at could index INHERITED array properties, so `at:"constructor"` read the
// prototype instead of game data.
r = run([{ id: 'C-09', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ lookup: { path: 'board' }, at: 'constructor' }, 'ne', null] } }],
  { collected: { any: { W: 1, H: 1, board: [{ color: 'r' }] } } });
check('lookup refuses a non-index `at`, so it cannot read the prototype',
  verdictOf(r.results, 'C-09') === 'FAIL' && /index|integer/i.test(of_(r.results, 'C-09').evidence || ''),
  of_(r.results, 'C-09').evidence);

r = run([{ id: 'C-10', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ lookup: { path: 'board' }, at: 7, of: 'color' }, 'eq', 'r'] } }],
  { collected: { any: { W: 1, H: 1, board: [{ color: 'r' }] } } });
check('lookup refuses an index past the end of the collection',
  verdictOf(r.results, 'C-10') === 'FAIL', of_(r.results, 'C-10').evidence);

// [Codex 3rd pass P1] both validation and evaluation took the FIRST recognised key and ignored the
// rest, so a malformed check could hide behind a well-formed sibling key in the same object.
r = run([{ id: 'C-03', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { truthy: true, cmp: [{ path: 'state.x' }, 'spaceship', 1] } }],
  { collected: { any: { W: 1, H: 1, state: { x: 1 } } } });
check('a predicate object carrying two operators is refused, not resolved by key order',
  verdictOf(r.results, 'C-03') === 'FAIL' && /one operator|two|extra key/i.test(of_(r.results, 'C-03').evidence || ''),
  of_(r.results, 'C-03').evidence);

r = run([{ id: 'C-04', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.x', count: { hitAreas: '*' } }, 'eq', 1] } }],
  { collected: { any: { W: 1, H: 1, state: { x: 1 } } } });
check('a TERM carrying two operators is refused too',
  verdictOf(r.results, 'C-04') === 'FAIL', of_(r.results, 'C-04').evidence);

// A stray unknown key is a package bug as well — silently ignoring it is how a typo'd companion
// (`satisfy` for `satisfies`, `tolerance` for a tol term) becomes an unnoticed no-op.
r = run([{ id: 'C-05', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.x' }, 'eq', 1], tolerence: 0.5 } }],
  { collected: { any: { W: 1, H: 1, state: { x: 1 } } } });
check('an unknown companion key is refused rather than ignored',
  verdictOf(r.results, 'C-05') === 'FAIL' && /tolerence/.test(of_(r.results, 'C-05').evidence || ''),
  of_(r.results, 'C-05').evidence);

// A path that resolves to NOTHING used to compare as an ordinary `undefined`, so a typo in an
// observable satisfied a blocking predicate: `undefined !== null` is true.
r = run([{ id: 'A-01', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.mispelled' }, 'ne', null] } }], { collected: { any: { W: 1, H: 1, state: { spelled: 1 } } } });
check('a comparison against an ABSENT path FAILs and names the path',
  verdictOf(r.results, 'A-01') === 'FAIL' && /mispelled/.test(of_(r.results, 'A-01').evidence || ''),
  of_(r.results, 'A-01').evidence);

r = run([{ id: 'A-02', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.a' }, 'eq', { path: 'state.b' }] } }], { collected: { any: { W: 1, H: 1, state: {} } } });
check('two absent paths do not compare equal',
  verdictOf(r.results, 'A-02') === 'FAIL', of_(r.results, 'A-02').evidence);

// ...but a field that is PRESENT and null is a value, and `truthy` is the operator whose whole job is
// asking whether something is there. Neither may become strict, or real predicates stop expressing.
r = run([{ id: 'A-03', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.target' }, 'eq', null] } }], { collected: { any: { W: 1, H: 1, state: { target: null } } } });
check('a present-and-null field still compares as a value',
  verdictOf(r.results, 'A-03') === 'PASS', of_(r.results, 'A-03').evidence);

r = run([{ id: 'A-04', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ count: { path: 'board', where: { truthy: { item: 'color' } } } }, 'eq', 1] } }],
  { collected: { any: { W: 1, H: 1, board: [{ color: 'r' }, null, {}] } } });
check('truthy still tolerates absent fields — it is the "is it there" operator',
  verdictOf(r.results, 'A-04') === 'PASS', of_(r.results, 'A-04').evidence);

// An empty conjunction is not a check. `{all:[]}` passed vacuously and satisfied a blocking obligation.
for (const [id, pred, name] of [
  ['E-01', { all: [] }, '{all:[]} is not a passing predicate'],
  ['E-02', { any: [] }, '{any:[]} is not a passing predicate'],
]) {
  r = run([{ id, primitive: 'state', enforcement: 'blocking', state: 'any', predicate: pred }],
    { collected: { any: { W: 1, H: 1 } } });
  check(name, verdictOf(r.results, id) === 'FAIL', of_(r.results, id).evidence);
}

// Short-circuiting hid malformed branches: `{any:[true, <garbage>]}` never validated the garbage.
r = run([{ id: 'E-03', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { any: [{ truthy: true }, { cmp: [{ path: 'state.x' }, 'spaceship', 1] }] } }],
  { collected: { any: { W: 1, H: 1, state: { x: 1 } } } });
check('a malformed branch behind a short-circuit is still caught',
  verdictOf(r.results, 'E-03') === 'FAIL' && /spaceship/.test(of_(r.results, 'E-03').evidence || ''),
  of_(r.results, 'E-03').evidence);

// Same hole under an implication whose guard is false: the `then` branch was never looked at.
r = run([{ id: 'E-04', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { when: { cmp: [{ path: 'state.screen' }, 'eq', 'win'] },
    then: { nonsense: [1, 2] } } }], { collected: { any: { W: 1, H: 1, state: { screen: 'play' } } } });
check('a malformed `then` is caught even when the guard is false',
  verdictOf(r.results, 'E-04') === 'FAIL' && /nonsense/.test(of_(r.results, 'E-04').evidence || ''),
  of_(r.results, 'E-04').evidence);

/* ────────────────────────── BLOCKED IS NOT A REJECTION [Codex P1] ────────────────────────── */

// The finding: `pose` was advertised as one of six primitives but special-cased to BLOCKED, and any
// blocking non-PASS rejected — so a blocking pose obligation could never be released. A capability
// this file does not have is a gap in the tooling, not a defect in the build.
// [Codex re-review P1] `pose` used to become BLOCKED automatically, with no declared gap — an
// evasion path now that BLOCKED does not reject. The compiler must NAME the gap it is standing on.
r = run([{ id: 'R-03x', primitive: 'pose', enforcement: 'blocking' }]);
check('pose with neither a predicate nor a declared gap FAILs, it is not auto-BLOCKED',
  verdictOf(r.results, 'R-03x') === 'FAIL' && r.exitCode === 1, of_(r.results, 'R-03x').evidence);

r = run([{ id: 'R-03', primitive: 'pose', enforcement: 'blocking', blocked_on: 'pose.transform' }]);
check('pose reports BLOCKED once the gap is declared', verdictOf(r.results, 'R-03') === 'BLOCKED');
check('a blocking BLOCKED obligation does NOT reject the build', r.exitCode === 0,
  `exit ${r.exitCode}`);
check('BLOCKED stays visible in the summary line', /BLOCKED/.test(r.stdout));
check('the result file carries the blocked ids so they cannot be lost',
  Array.isArray(r.out?.blocked) && r.out.blocked.includes('R-03'),
  JSON.stringify(r.out?.blocked));

// ...but BLOCKED must be earned. An obligation may only be BLOCKED for a capability this file
// declares missing; otherwise "blocked" becomes a way to opt out of every check.
r = run([{ id: 'R-09', primitive: 'state', enforcement: 'blocking', blocked_on: 'a thing I made up' }]);
check('BLOCKED is refused for a capability the dispatcher does not recognise',
  verdictOf(r.results, 'R-09') === 'FAIL' && r.exitCode === 1,
  of_(r.results, 'R-09').evidence);

// A SUBSTRING match let any sentence mentioning a gap claim it. The id must lead.
r = run([{ id: 'R-09b', primitive: 'state', enforcement: 'blocking',
  blocked_on: 'not really reference.resolution, I just do not want to check this' }]);
check('a gap id buried mid-sentence does not earn BLOCKED',
  verdictOf(r.results, 'R-09b') === 'FAIL' && r.exitCode === 1, of_(r.results, 'R-09b').evidence);

// The third gap is not in this file but in the evidence: the primitive can read the build, and the
// reference has no number to compare against. A real shipped package surfaced this one.
r = run([{ id: 'R-10', primitive: 'pose', enforcement: 'advisory',
  blocked_on: 'reference.resolution — the evidence samples at 2 s and cannot resolve a 300 ms easing' }]);
check('reference.resolution is a recognised gap: BLOCKED, and it does not reject',
  verdictOf(r.results, 'R-10') === 'BLOCKED' && r.exitCode === 0, of_(r.results, 'R-10').evidence);

// [Codex 3rd pass P1] a recognised gap id was accepted on ANY obligation, so `pixel.sample` waived a
// `state` check. A gap belongs to the surface it describes.
r = run([{ id: 'G-01', primitive: 'state', enforcement: 'blocking', blocked_on: 'pixel.sample' }]);
check('a gap id does not transfer to a primitive it has nothing to do with',
  verdictOf(r.results, 'G-01') === 'FAIL' && r.exitCode === 1, of_(r.results, 'G-01').evidence);

// `reference.resolution` is not about a surface — it says the REFERENCE has no number. Then the
// obligation was never a blocking one: it is an open assumption, and §4 wants the constant named.
r = run([{ id: 'G-02', primitive: 'state', enforcement: 'blocking', blocked_on: 'reference.resolution — 2 s sampling' }]);
check('reference.resolution cannot hold a BLOCKING obligation open',
  verdictOf(r.results, 'G-02') === 'FAIL' && /advisory/.test(of_(r.results, 'G-02').evidence || ''),
  of_(r.results, 'G-02').evidence);

r = run([{ id: 'G-03', primitive: 'state', enforcement: 'advisory', blocked_on: 'reference.resolution — 2 s sampling' }]);
check('reference.resolution is legitimate on an advisory obligation',
  verdictOf(r.results, 'G-03') === 'BLOCKED' && r.exitCode === 0, of_(r.results, 'G-03').evidence);

r = run([{ id: 'R-04', primitive: 'state', enforcement: 'blocking' }]);
check('a non-pose primitive without a predicate still FAILs',
  verdictOf(r.results, 'R-04') === 'FAIL');

/* ────────────────────────── PIXEL: probe → score, end to end [Codex P1] ────────────────────────── */

// The finding: pixel obligations were advertised, but the probe collected no samples and there was
// no sample-key contract, so the only passing test was one that injected `px` by hand. This runs the
// REAL emitted snippet against a stub page and feeds its REAL output to `score`.
const PIXOBL = [{ id: 'P-01', primitive: 'pixel', enforcement: 'blocking', state: 'any',
  samples: { 'cap-fill': { hitArea: 'bottle-0', at: [0.5, 0.15] } },
  predicate: { cmp: [{ px: 'cap-fill', channel: 'r' }, 'eq', 145] } },
  // carried like a real package would, so this case is not also testing PROV-01's absence
  { id: 'PROV-01', primitive: 'prov', enforcement: 'blocking' }];
let dir = makeDir({ obligations: PIXOBL });
const probe = dispatch('probe', dir);
const snippet = (probe.stdout.split('// ---8<--- BEGIN PAGE SNIPPET')[1] || '').split('// ---8<--- END PAGE SNIPPET')[0];
check('probe emits the page snippet between stable markers', snippet.trim().length > 0);
check('probe declares the pixel sample keys it needs', /cap-fill/.test(probe.stdout));

let collectedFromPage = null, snippetError = null;
try {
  // A stub page: the 2d context answers with the coordinates it was asked for, so the assertion
  // below pins the snippet's viewport-px -> canvas-px mapping, not just that it returned something.
  const canvas = {
    width: 860, height: 1864,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 430, height: 932 }),
    getContext: (k) => (k === '2d'
      ? { getImageData: (x, y) => ({ data: [Math.round(x), Math.round(y), 6, 255] }) }
      : null),
  };
  const stub = {
    window: { __game: { state: { screen: 'play' }, board: null,
      diagnostics: { hitAreas: [{ id: 'bottle-0', x: 42.6, y: 379.9, width: 60, height: 183 }] } } },
    document: { querySelector: (s) => (s === 'canvas' ? canvas : null), body: canvas },
  };
  const fn = new Function('window', 'document', `return (${snippet.trim()});`);
  collectedFromPage = fn(stub.window, stub.document);
} catch (e) { snippetError = e.message; }

check('the emitted snippet runs in a page and returns px samples',
  collectedFromPage && collectedFromPage.px && 'cap-fill' in collectedFromPage.px,
  snippetError || JSON.stringify(collectedFromPage?.px));
check('the snippet maps the hitArea fraction to canvas pixels correctly',
  collectedFromPage?.px?.['cap-fill']?.[0] === 145 && collectedFromPage?.px?.['cap-fill']?.[1] === 815,
  `got ${JSON.stringify(collectedFromPage?.px?.['cap-fill'])} — expected [145,815,6]`);

// [Codex re-review P2] `W`/`H` come from the canvas box while SKILL.md called them the viewport. On
// a letterboxed canvas those differ, and `width / W` was silently scored against the wrong divisor.
// Both are now returned under honest names, so a predicate picks the one it means.
let inset = null, insetErr = null;
try {
  const c = { width: 780, height: 1400,
    getBoundingClientRect: () => ({ left: 20, top: 50, width: 390, height: 700 }),
    getContext: () => null };
  const fn = new Function('window', 'document', `return (${snippet.trim()});`);
  inset = fn({ __game: { diagnostics: { hitAreas: [] } }, innerWidth: 430, innerHeight: 800 },
    { querySelector: (q) => (q === 'canvas' ? c : null), body: c });
} catch (e) { insetErr = e.message; }
// [Codex 4th pass P2] the probe took the FIRST canvas, so a hidden preloader canvas ahead of the game
// canvas silently sourced W/H and every pixel sample from the wrong surface.
let picked = null, pickErr = null;
try {
  const mk = (w, h, bw, bh) => ({ width: w, height: h,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: bw, height: bh }), getContext: () => null });
  const preloader = mk(32, 32, 0, 0), game = mk(780, 1400, 390, 700);
  const fn = new Function('window', 'document', `return (${snippet.trim()});`);
  picked = fn({ __game: { diagnostics: { hitAreas: [] } }, innerWidth: 430, innerHeight: 800 },
    { querySelector: () => preloader, querySelectorAll: () => [preloader, game], body: preloader });
} catch (e) { pickErr = e.message; }
check('the probe picks the largest visible canvas, not the first in the DOM',
  picked && picked.W === 390 && picked.H === 700, pickErr || `W=${picked?.W} H=${picked?.H}`);

check('a letterboxed canvas reports the drawing box and the viewport separately',
  inset && inset.W === 390 && inset.H === 700 && inset.viewportW === 430 && inset.viewportH === 800,
  insetErr || `W=${inset?.W} H=${inset?.H} viewportW=${inset?.viewportW} viewportH=${inset?.viewportH}`);
check('SKILL.md no longer calls W/H the viewport',
  /`W`, `H` \(the canvas drawing box|canvas drawing box/.test(SKILL) && /viewportW/.test(SKILL),
  (SKILL.match(/`W`,\s*`H`[^\n]{0,80}/) || ['(not found)'])[0]);

if (collectedFromPage) {
  fs.writeFileSync(path.join(dir, 'page.json'), JSON.stringify({ any: collectedFromPage }));
  const scored = dispatch('score', dir, [path.join(dir, 'page.json')]);
  const res = JSON.parse(fs.readFileSync(path.join(dir, 'docs/obligations.result.json'), 'utf8')).results;
  check('score consumes the px the probe\'s own snippet collected',
    verdictOf(res, 'P-01') === 'PASS' && scored.exitCode === 0, of_(res, 'P-01').evidence);
}
fs.rmSync(dir, { recursive: true, force: true });

// A page that cannot give up pixels (WebGL, a tainted canvas) is a capability gap: BLOCKED, not FAIL.
r = run(PIXOBL, { collected: { any: { W: 430, H: 932, px: {}, pxUnavailable: { 'cap-fill': 'no 2d context' } } } });
check('an unavailable pixel sample is BLOCKED, not a build rejection',
  verdictOf(r.results, 'P-01') === 'BLOCKED' && r.exitCode === 0, of_(r.results, 'P-01').evidence);

// A pixel obligation that declares no samples is a package bug.
r = run([{ id: 'P-02', primitive: 'pixel', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ px: 'nope', channel: 'r' }, 'eq', 1] } }], { collected: { any: { W: 1, H: 1 } } });
check('a pixel obligation with no declared samples FAILs and says so',
  verdictOf(r.results, 'P-02') === 'FAIL' && /sample/.test(of_(r.results, 'P-02').evidence || ''),
  of_(r.results, 'P-02').evidence);

/* ────────────────────────── MALFORMED INPUT IS A VERDICT [Codex P2] ────────────────────────── */

// The finding: bad JSON threw before obligations.result.json was written, so the caller got a Node
// stack instead of the machine verdict the whole file exists to produce.
// [Codex 3rd pass P1] an EMPTY obligations array accepted vacuously: zero results, zero blocking
// failures, decision ACCEPT. A reference package owes at least the standing provenance lock.
r = run([], { prov: false });
check('an empty obligations.json is not a passing build',
  r.results && r.exitCode === 1 && /at least|PROV/.test(JSON.stringify(r.results)),
  JSON.stringify(r.results));

r = run([{ id: 'R-01', primitive: 'state', enforcement: 'blocking', state: 'any',
  predicate: { cmp: [{ path: 'state.x' }, 'eq', 1] } }],
  { prov: false, collected: { any: { W: 1, H: 1, state: { x: 1 } } } });
check('a package with no provenance obligation is reported as missing it',
  r.exitCode === 1 && verdictOf(r.results, 'PROV-01') === 'FAIL',
  (of_(r.results, 'PROV-01').evidence || '(no PROV row)').slice(0, 120));

r = run('{ this is not json ');
check('malformed obligations.json still writes a typed FAIL result file',
  r.results && verdictOf(r.results, '__file__') === 'FAIL' && r.exitCode === 1,
  of_(r.results, '__file__').evidence);

r = run({ id: 'not-an-array' });
check('a non-array obligations.json is a typed FAIL, not a crash',
  r.results && verdictOf(r.results, '__file__') === 'FAIL' && r.exitCode === 1,
  of_(r.results, '__file__').evidence);

r = run([{ primitive: 'state', enforcement: 'blocking' }, { id: 'R-OK', primitive: 'nonsense' }]);
const named = (r.results || []).filter((x) => x.id !== 'PROV-01');
check('an obligation with no id gets a typed FAIL and does not sink its siblings',
  named.length === 2 && named.every((x) => x.verdict === 'FAIL') && r.exitCode === 1,
  named.map((x) => `${x.id}:${x.evidence}`).join(' | '));

console.log(`\n  ${failures ? `${failures} FAILURE(S)` : 'the dispatcher contract holds'}`);
process.exit(failures ? 1 : 0);
