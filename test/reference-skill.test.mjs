#!/usr/bin/env node
/**
 * The reference SKILL's schema contract, asserted against the file the compiler actually reads.
 *
 * Why this file exists: everything in `skills/reference/SKILL.md` is an instruction executed by an
 * agent, so a rule that quietly disappears from it fails silently and completely — the compiler still
 * runs, still writes a package, and the missing rule shows up months later as a wrong number in a
 * build. Five rules below were each paid for by a real package error, and each is cheap to assert:
 * the field it names has to be in the schema, and the dispatcher that enforces one of them has to
 * agree with the document that describes it.
 *
 * It asserts PRESENCE and AGREEMENT, not wording. A golden-text test over prose goes red on every
 * legitimate edit and gets regenerated without being read.
 *
 *   node test/reference-skill.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKILL = fs.readFileSync(path.join(ROOT, 'skills/reference/SKILL.md'), 'utf8');
const DISPATCH = fs.readFileSync(path.join(ROOT, 'skills/reference/obligations.mjs'), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

/* ── every screenshot array, not just the default one ───────────────────────────────────────────
   A listing carried 7 portrait screenshots AND 7 landscape iPad ones at the same version; only the
   portrait set was fetched, and three build decisions then rested on "the landscape evidence is not
   version-matched" while a version-matched landscape set sat in the lookup JSON. */
check('the seed step tells the agent to take every screenshot array the listing carries',
  /ipadScreenshotUrls/.test(SKILL) && /device_class/.test(SKILL),
  'names the second array and the field that records which device it came from');

/* ── variant is per evidence item ────────────────────────────────────────────────────────────────
   One package held portrait store frames and a landscape web build with a different HUD under one
   version label; a design doc then called one landscape frame the end-of-level screen (it is that
   build's in-play HUD) and the code imitated a screen that never existed. */
check('evidence items carry their own variant and observed_version',
  /`variant`/.test(SKILL) && /per EVIDENCE ITEM, not per package/i.test(SKILL),
  'the per-item rule is stated, not only the package-level field');
check('evidence spanning two variants is CONFLICTING by construction',
  /spans more than\s*\n?\s*one `variant`[\s\S]{0,120}CONFLICTING/.test(SKILL) ||
  /CONFLICTING` by construction/.test(SKILL),
  'an obligation cannot quietly average two builds');

/* ── ads are not the game ────────────────────────────────────────────────────────────────────────
   A 170 s recording held two interstitials; a state survey that mines frames without this rule files
   them as screens of the game. */
check('ad and interstitial frames are excluded, and the exclusion is recorded',
  /interstitial/i.test(SKILL) && /EXCLUDED/.test(SKILL),
  'the rule exists and says the exclusion is recorded');
check('the rule is absolute about what may reach the build',
  /Nothing from an ad frame may reach the package or the build/.test(SKILL));

/* ── distinct frames ────────────────────────────────────────────────────────────────────────────
   A package presented six frames of which four were byte-identical, so every "n=6 frames" claim was
   inflated to 6 from 3. */
check('extracted frames are content-hashed and counted as distinct',
  /Content-hash every extracted frame/.test(SKILL) && /counts distinct images/.test(SKILL));

/* ── the state enumeration is a block, not a paragraph ───────────────────────────────────────────
   A package's list was prose; `win` and `transition` never got rows, and a design doc asserted a
   frame WAS the end-of-level screen in their place. */
{
  const m = SKILL.match(/```yaml\nscreens:[\s\S]*?```/);
  check('the state enumeration is written as a screens block with a row per state', !!m);
  const block = m ? m[0] : '';
  for (const field of ['state:', 'status:', 'evidence_locator:', 'would_have_shown_it:']) {
    check(`the screens row carries ${field}`, block.includes(field));
  }
  check('NOT_FOUND is a complete answer and an ABSENT row is not',
    /A `NOT_FOUND` row is a complete answer[\s\S]{0,200}An absent row is not/.test(SKILL),
    'the distinction the paragraph version lost');
  check('screens is in the output list, so it cannot be described and then not written',
    /`screens`[\s\S]{0,40}one row per state/.test(SKILL));
}

/* ── reference.resolution records the attempt, and the two files agree ───────────────────────────
   A package said a pin's diameter "could not be keyed out of a 34x31 px box" and left it advisory; at
   a resolving scale it keys cleanly, and the unmeasurable claim also had the pin's SHAPE wrong. */
check('the obligation schema documents `attempted` with all three of its fields',
  /attempted:/.test(SKILL) && /feature_px/.test(SKILL) && /region: \[x0, x1, y0, y1\]/.test(SKILL));
check('the DISPATCHER enforces the same three fields the document promises',
  /at\.evidence/.test(DISPATCH) && /at\.region/.test(DISPATCH) && /at\.feature_px/.test(DISPATCH),
  'a documented requirement nothing checks is how the pin claim survived');
check('the BLOCKED record carries the attempt through to its evidence line',
  /attempted on \$\{o\.attempted\.evidence\}/.test(DISPATCH));

console.log(`\n  ${failures ? `${failures} FAILURE(S)` : 'the reference skill contract holds'}`);
process.exit(failures ? 1 : 0);
