// skills/juice holds feedback timings measured frame by frame from play video. Makers on this public plugin read it,
// so it must stay what it claims to be: numbers and rules only, each number marked measured or inferred and given a
// purpose, each tier with a scaling rule, no game named, and no word from the tooling that produced it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const skill = read('skills/juice/SKILL.md');
const body = skill.slice(skill.indexOf('\n---\n') + 5);

// '## Title' -> the text under it, up to the next '## '.
const sections = Object.fromEntries(body.split(/^## /m).slice(1).map((part) => {
  const end = part.indexOf('\n');
  return [part.slice(0, end).trim(), part.slice(end + 1)];
}));

// Every markdown table in a text, as { head: [...], rows: [[...]] }.
const tables = (text) => {
  const out = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) { current = null; continue; }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (!current) { current = { head: cells, rows: [] }; out.push(current); continue; }
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    current.rows.push(cells);
  }
  return out;
};

const TIERS = [
  'Tier 0: the routine action', 'Tier 1: the small reward', 'Tier 2 and up: the combo ladder',
  'Big clears: two or more lines at once', 'The end: game over', 'A refused move: inferred, not measured',
];
const constants = JSON.parse(/```json\n([\s\S]+?)\n```/.exec(skill)[1]);

test('the skill loads by its description', () => {
  const front = /^---\nname: juice\ndescription: (\S.{40,})\n---\n/.exec(skill);
  assert.ok(front, 'frontmatter with name and a description');
  for (const word of ['particles', 'sound', 'screen shake', 'combo', 'milliseconds', 'measured', 'inferred', 'scale']) {
    assert.ok(front[1].includes(word), word);
  }
});

test('the skill folder holds the text only: no frame, sound or art', () => {
  assert.deepEqual(readdirSync(new URL('../skills/juice/', import.meta.url)), ['SKILL.md']);
  assert.ok(!/!\[|<img|https?:\/\/|data:/.test(skill), 'no image, link or embedded data');
});

test('the skill names no game', () => {
  const names = [
    'tetris', 'candy crush', 'wordle', 'angry birds', 'flappy bird', 'subway surfers', 'royal match', 'block blast',
    'clash royale', 'among us', 'pac-man', 'toon blast', 'homescapes', 'woodoku', 'bejeweled', 'fruit ninja',
    'temple run', 'puyo', 'gardenscapes', 'triple match',
  ];
  const lower = skill.toLowerCase();
  for (const name of names) assert.ok(!lower.includes(name), name);
});

test('the skill holds no word from the tooling that produced it', () => {
  for (const word of ['board', 'card', 'host', 'fleet']) {
    assert.ok(!new RegExp(`\\b${word}s?\\b`, 'i').test(skill), word);
  }
});

test('the skill says what one frame of error is', () => {
  const how = sections['How to read the numbers'];
  for (const needle of ['59.92 fps', 'One frame is 16.7 ms', '17 ms at 60 fps', '30 fps', '33 ms']) {
    assert.ok(how.includes(needle), needle);
  }
  assert.equal(constants.frameMs, 16.7);
});

test('every event has its tier, and every tier says how to scale', () => {
  for (const title of TIERS) {
    assert.ok(sections[title], title);
    assert.ok(tables(sections[title]).length > 0, `${title}: has a table`);
    assert.match(sections[title], /^\*\*Scale:\*\* \S/m, `${title}: has a Scale line`);
  }
});

test('every number is marked measured or inferred, and says what it is for', () => {
  let rows = 0;
  for (const title of TIERS) {
    for (const table of tables(sections[title])) {
      const basis = table.head.indexOf('Basis');
      const purpose = table.head.indexOf('What it is for');
      assert.ok(basis > -1 && purpose > -1, `${title}: Basis and purpose columns`);
      for (const row of table.rows) {
        assert.equal(row.length, table.head.length, row.join(' | '));
        assert.match(row[basis], /^(M, n=[1-9]\d*|I)$/, row.join(' | '));
        assert.ok(row[purpose].length >= 15, row.join(' | '));
        rows += 1;
      }
    }
  }
  assert.ok(rows >= 40, `${rows} rows`);
});

test('the refused move is inferred in the tables and in the constants', () => {
  const title = 'A refused move: inferred, not measured';
  const rows = tables(sections[title]).flatMap((table) => table.rows.map((row) => row[table.head.indexOf('Basis')]));
  assert.ok(rows.length >= 3);
  for (const basis of rows) assert.equal(basis, 'I');
  assert.ok(sections[title].includes('No refused move appeared'));
  assert.equal(constants.refusedMove.inferred, true);
  // No other tier borrows the inferred mark for a timing: the measured tiers are measured.
  for (const other of TIERS.filter((name) => name !== title)) {
    for (const table of tables(sections[other])) {
      for (const row of table.rows) assert.notEqual(row[table.head.indexOf('Basis')], 'I', row.join(' | '));
    }
  }
});

test('the constants agree with the tables', () => {
  const ladder = sections['Tier 2 and up: the combo ladder'];
  const { shake, pitch, banner, halo, clear, place } = constants;
  // Shake: one size, as a share of the width; 4.5 px on a 390 px screen.
  assert.equal(Math.round(shake.peakShareOfWidth * 390 * 10) / 10, 4.5);
  assert.ok(ladder.includes('peak 4.5 px (1.2% of the width)'));
  assert.deepEqual(shake.lengthMsByStep, { 2: 190, 3: 300 });
  assert.equal(shake.fromStep, 2);
  assert.ok(skill.includes('4.5 px on a 390 px screen, 8.8 px on a 768 px'));
  assert.equal(Math.round(shake.peakShareOfWidth * 768 * 10) / 10, 8.8);
  // Pitch: the tones in the ladder table are the base times a semitone ratio.
  const tones = [261, 261, 277, 293, 311, 349, 370, 392, 415, 523];
  assert.equal(pitch.semitonesByStep.length, tones.length);
  tones.forEach((hz, step) => {
    const computed = pitch.baseHz * pitch.ratioPerSemitone ** pitch.semitonesByStep[step];
    assert.ok(Math.abs(computed - hz) / hz < 0.01, `step ${step}: ${computed.toFixed(1)} Hz against ${hz} Hz`);
    assert.ok(ladder.includes(`${hz}`), `${hz} Hz is in the ladder`);
  });
  assert.ok(ladder.includes('0, 0, 1, 2, 3, 5, 6, 7, 8, 12'));
  // The rules must not ask for a rise the measured steps do not have: step 1 keeps the base pitch.
  assert.equal(pitch.semitonesByStep[1], 0);
  assert.ok(!/one semitone per step/i.test(skill) && !skill.includes('rises at each one'), 'no uniform-rise rule');
  assert.ok(ladder.includes('it holds at step 1, rises one or two semitones'));
  // Layers switch on by step.
  assert.deepEqual([banner.fromStep, shake.fromStep, halo.fromStep], [1, 2, 4]);
  assert.ok(ladder.includes('banner at 1, shake at 2, halo at 4'));
  // The order of the show is strictly rising.
  const order = [0, shake.startMs, clear.soundOnMs, clear.beamOnMs, clear.particlesOnMs, banner.onMs, clear.scorePopOnMs];
  for (let i = 1; i < order.length; i += 1) assert.ok(order[i] > order[i - 1], order.join(' < '));
  assert.ok(banner.goneMs <= 1000 && halo.offMs <= 1100 && banner.scorePopFadeFromMs <= 1400);
  assert.ok(banner.scorePopOnMs > banner.goneMs, 'the score pop waits for the banner');
  // A big clear: three lines or more get the wind-up and the sweep, in rising order.
  const { bigClear } = constants;
  assert.equal(bigClear.fromLines, 3);
  const sweep = [bigClear.sweepOnMs, bigClear.sweepFullMs, bigClear.sweepFadeFromMs, bigClear.sweepGoneMs];
  for (let i = 1; i < sweep.length; i += 1) assert.ok(sweep[i] > sweep[i - 1], sweep.join(' < '));
  assert.ok(sections['Big clears: two or more lines at once'].includes('starts at 50 ms (17 to 83), covers the lines by 133 ms'));
  // A routine placement: one frame, then the count.
  assert.equal(place.snapMs, 17);
  assert.equal(place.scoreTickMs, 33);
  assert.ok(sections['Tier 0: the routine action'].includes('+1 point every 33 ms'));
});

test('make-game and the polish phase point to the skill', () => {
  const make = read('commands/make-game.md');
  const i = make.indexOf('**Feedback starts from measured timings.**');
  assert.ok(i > -1);
  assert.ok(make.slice(i, i + 400).includes('`skills/juice/SKILL.md`'));
  // It sits with the other build rules, before the verification paragraph that closes them.
  assert.ok(i < make.indexOf('Verify the behavior the user asked for'));
  const polish = read('skills/phases/polish/SKILL.md');
  const juice = polish.indexOf('## Sub-phase 5');
  const link = polish.indexOf('**Timings and sizes start from `skills/juice/SKILL.md`.**');
  assert.ok(juice > -1 && link > juice && link < polish.indexOf('## Sub-phase 6'), 'the link is inside Sub-phase 5');
  // One source of juice numbers: the link follows the recipe call it takes precedence over.
  assert.ok(link > polish.indexOf('pattern:polish-juice-recipes" })` for the tuned juice/motion recipes (burst counts'));
});

test('the plugin version and the changelog name the release that carries it', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.90', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.90 or later`);
  assert.equal(JSON.parse(read('skills/SKILLS.lock.json')).pluginVersion, version);
  assert.ok(Object.hasOwn(JSON.parse(read('skills/SKILLS.lock.json')).skills, 'juice'), 'the lock lists the skill');
  assert.ok(read('CHANGELOG.md').includes('## 1.7.90 '));
});
