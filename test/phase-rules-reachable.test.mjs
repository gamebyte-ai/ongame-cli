// /make-game does not invoke the phase skills (commands/make-game.md, "Current working mode"), so a rule that lives only
// under skills/phases/ never reaches the agent. Each rule below once lived only there. It must now be in
// commands/make-game.md itself, or in a top-level skill that Claude Code loads by its description AND that
// make-game.md names. The phase skill that held it must point to the same skill, so a phase run reads the same text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const make = read('commands/make-game.md');

// Top-level skills only: skills/<name>/SKILL.md. skills/phases/<name>/SKILL.md is not loaded by description.
const described = Object.fromEntries(readdirSync(new URL('../skills/', import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'phases' && existsSync(new URL(`../skills/${d.name}/SKILL.md`, import.meta.url)))
  .map((d) => [d.name, read(`skills/${d.name}/SKILL.md`)])
  .filter(([name, text]) => new RegExp(`^---\\nname: ${name}\\ndescription: \\S.{40,}\\n---\\n`).test(text)));

// [rule, phase skill it lived in (ongame-cli ce8de10), verbatim text of the rule]
const RULES = [
  ['core loop, fun moment and hook', 'concept', 'Capture: the core gameplay loop, target audience, the specific fun-moment, and a 1-sentence hook.'],
  ['light design doc', 'docs', 'Generate a **light GDD** from CONCEPT.md: core loop, entities, controls, win/lose, screens (menu/play/gameover).'],
  ['one state machine', 'code', 'Transitions happen **only** through `transition(to)`; do not set `current` by hand.'],
  ['input locked during animation', 'code', 'input arriving while the game is resolving or animating is rejected, from every input source.'],
  ['clean restart', 'code', 'one restart path, and nothing from the previous run (timer, listener, tween, pooled entity) survives it.'],
  ['curve from levels_generate', 'levels', 'levels_generate({ mechanic: "<core-mechanic>", targetLevels: 30, difficultyProfile: "d30" })'],
  ['D1 / D7 / D30 profile', 'levels', 'Pick the profile by the retention horizon the game is built for: `d1` for a short/casual game or a prototype'],
  ['curve check', 'levels', 'the first level is easy+rewarding (`difficulty < 0.2`, `params.reward > 0`); there is at least one `isRelief: true` level.'],
  ['label every number', 'docs', 'Each number in GAME_DESIGN.md is marked measured, set by the user, or a starting guess with the range to tune within.'],
  ['track level start, complete and fail', 'code', "on a genuine WIN only, `levelEnd(attempt, 'fail', {...})` on a loss"],
  ['research phase', 'research', 'Output: `docs/RESEARCH.md` — 1 page: genre, competitor patterns, recommended out-of-the-box angle, risks.'],
  ["the user's request outranks research", 'concept', "**PRIORITY RULE — the user's explicit request OUTRANKS research's angle.**"],
  ["the genre's knowledge", 'code', '**Genre miss (e.g. design is "snake" but `genre:snake` is not in the list):** do NOT CALL a nonexistent genre key.'],
  ['anchor every asset', 'assets', '**Before ANY `forge_request`/`forge_batch`, go and find the relevant references. Do not generate first.**'],
  ['lock the look first', 'concept', '**LOCK THE LOOK before any asset wave — write `docs/ART_DIRECTION.md`.**'],
  ['HUD in layout components', 'polish', 'Put HUD elements into **layout components**, do not give x/y by hand:'],
  ['device-reality checks', 'polish', 'check pointer type, canvas geometry at dpr>1, full-bleed cards, modal occlusion and frozen animated subjects'],
  ['ads', 'code', "**Ads, if the concept has them, go in the same pass:** `showInterstitial('level_end')` from the \"Next\" tap"],
  ['real-money items', 'code', "with the `title` and `price` that `products()` returns (never a price typed into the game)."],
  ['lives and shop only by design', 'polish', '`template:shell-lives` / `template:shell-shop` only when the design has actually decided to have that economy.'],
  ['levels review reads the economy', 'levels', 'then each file that sets prices, earnings or upgrade effects, each under a `--- <path> ---` line'],
  ['60 fps on phones', 'code', 'In every-frame `mainLoop`/`update`, do NOT `new` up new objects, create array/object literals, or do closure alloc'],
];

// Fragments of a longer phase sentence (the polish template list, the levels review call) stay in the phase and are
// copied word for word into the skill; every other rule has one home.
const COPIED = new Set(['lives and shop only by design', 'levels review reads the economy']);

const whereReachable = (needle) => {
  if (flat(make).includes(needle)) return ['commands/make-game.md'];
  return Object.entries(described).filter(([, text]) => flat(text).includes(needle)).map(([name]) => name);
};

test('the list covers the 19 phase-only rules, one row each', () => {
  // 19 rules were counted. Two of them are split here so each part is checked on its own: "one state machine, input
  // locked during animation, clean restart" (3 rows) and "difficulty curve from levels_generate on a D1, D7 or D30
  // profile" (2 rows). 19 + 2 + 1 = 22.
  assert.equal(RULES.length, 22);
  assert.equal(new Set(RULES.map(([rule]) => rule)).size, RULES.length);
});

for (const [rule, phase, needle] of RULES) {
  test(`reachable from /make-game: ${rule}`, () => {
    const where = whereReachable(needle);
    assert.ok(where.length > 0, `"${rule}" is in neither make-game.md nor a skill with a description`);
    if (where[0] === 'commands/make-game.md') return;
    const named = where.filter((name) => make.includes(`skills/${name}/SKILL.md`));
    assert.ok(named.length > 0, `"${rule}" is in ${where.join(', ')}, which make-game.md does not name`);
    if (COPIED.has(rule)) return;
    const phaseText = read(`skills/phases/${phase}/SKILL.md`);
    assert.ok(named.some((name) => phaseText.includes(`skills/${name}/SKILL.md`)),
      `the ${phase} phase does not point to ${named.join(' or ')} for "${rule}"`);
  });
}

test('a moved rule is not left behind as a second copy in its phase', () => {
  for (const [rule, phase, needle] of RULES) {
    if (COPIED.has(rule)) continue;
    assert.ok(!flat(read(`skills/phases/${phase}/SKILL.md`)).includes(needle), `"${rule}" is still in the ${phase} phase`);
  }
});

test('the new skills ship nothing internal', () => {
  for (const name of ['game-concept', 'game-code', 'difficulty-curve', 'asset-anchor', 'phone-layout']) {
    const text = described[name];
    assert.ok(text, `${name} has a description`);
    assert.doesNotMatch(text, /\bfleet\b|\bi_[a-z0-9]{8}\b|\/home\/|\/Users\//i, name);
  }
});

test('the plugin version and the changelog name the release that carries it', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.79', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.79 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.79'));
});
