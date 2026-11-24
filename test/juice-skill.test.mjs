// skills/juice holds feedback timings measured frame by frame from play video. Makers on this public plugin read it,
// so it must stay what it claims to be: numbers and rules only, each number marked measured or inferred and given a
// purpose, each tier with a scaling rule, no game named, and no word from the tooling that produced it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const skill = read('skills/juice/SKILL.md');
const body = skill.slice(skill.indexOf('\n---\n') + 5);
const flat = (text) => text.replace(/\s+/g, ' ');

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
  'Big clears: two or more lines at once', 'The end: game over', 'A refused move',
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

test('the refused move is measured in the tables and in the constants', () => {
  const section = sections['A refused move'];
  const rows = tables(section).flatMap((table) => table.rows);
  assert.deepEqual(rows.map((row) => row[0]), ['Piece returns to where it came from', 'Shake, flash, particles', 'Sound', 'Input']);
  for (const row of rows) assert.equal(row[2], 'M, n=5', row.join(' | '));
  assert.ok(section.includes('Measured on 5 refused moves'));
  assert.ok(rows[0][1].startsWith('1 frame (17 ms)'));
  assert.ok(flat(section).includes('so the same response for a repeat is inferred'), 'the repeat was not seen');
  // Its one sound is the pick-up's, so the routine tier must list that sound.
  assert.ok(rows[2][1].includes('the only sound of the move is the one its pick-up made'));
  const pickUp = tables(sections['Tier 0: the routine action'])[0].rows.find((row) => row[0] === 'Pick-up sound');
  assert.ok(pickUp, 'Tier 0 lists the pick-up sound');
  assert.deepEqual(pickUp.slice(1, 3), ['peaks 50 to 100 ms after the piece leaves the tray', 'M, n=5']);
  // The constants say the same: back in one frame, nothing else plays.
  const { refusedMove } = constants;
  assert.equal(refusedMove.returnMs, 17);
  assert.equal(refusedMove.returnMs, constants.place.snapMs);
  assert.ok(!Object.hasOwn(refusedMove, 'inferred'));
  for (const layer of ['shake', 'flash', 'particles', 'sound']) assert.equal(refusedMove[layer], false, layer);
  // Every tier is now measured: no tier table carries the inferred mark.
  for (const title of TIERS) {
    for (const table of tables(sections[title])) {
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
  assert.ok(flat(skill).includes('4.5 px on a 390 px screen as measured, and by the inferred size rule 8.8 px on a 768 px one'));
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
  // The order of the show, step by step, is in the next test: the sound's place in it depends on the step.
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

test('the sound starts by combo step: with the beam on a plain clear, before the shake on early combo steps', () => {
  const { clear, shake, banner, pitch, comboSound } = constants;
  assert.ok(comboSound, 'the constants give the sound start per step');
  const { onMsByStep, earlySteps, earlyMedianRangeMs: early, lateSteps, lateMedianRangeMs: late } = comboSound;
  const list = (steps) => `${steps.slice(0, -1).join(', ')} and ${steps.at(-1)}`;
  // The measured ranges in the constants are the ones in the ladder table, and the two groups cover every step once.
  assert.ok(sections['Tier 2 and up: the combo ladder'].includes(
    `median ${early[0]} to ${early[1]} ms at steps ${list(earlySteps)}; ${late[0]} to ${late[1]} ms at steps ${list(lateSteps)}`,
  ), 'the ladder table gives the same two ranges');
  assert.equal(onMsByStep.length, pitch.semitonesByStep.length);
  assert.deepEqual([...earlySteps, ...lateSteps].sort((a, b) => a - b), onMsByStep.map((_, step) => step));
  // Each starting value lies inside its group's measured range. Steps 0 and 1 use the measured Tier 1 median.
  for (const step of earlySteps) assert.ok(onMsByStep[step] >= early[0] && onMsByStep[step] <= early[1], `step ${step}`);
  for (const step of lateSteps) assert.ok(onMsByStep[step] >= late[0] && onMsByStep[step] <= late[1], `step ${step}`);
  assert.deepEqual(onMsByStep.slice(0, 2), [clear.soundOnMs, clear.soundOnMs]);
  assert.ok(sections['Tier 1: the small reward'].includes(`| Sound | starts at ${clear.soundOnMs} ms (61 to 111), together with the beam | M, n=18 |`));
  // The show, step by step: every layer at its own time, in this order.
  const show = (step) => {
    const layers = [
      ['result', 0],
      ...(step >= shake.fromStep ? [['shake', shake.startMs]] : []),
      ['sound', onMsByStep[step]], ['beam', clear.beamOnMs], ['particles', clear.particlesOnMs],
      ...(step >= banner.fromStep ? [['banner', banner.onMs]] : []),
      ['score pop', step >= banner.fromStep ? banner.scorePopOnMs : clear.scorePopOnMs],
    ].sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < layers.length; i += 1) assert.ok(layers[i][1] > layers[i - 1][1], `step ${step}: ${layers.join(' ')}`);
    return layers.map(([name]) => name).join(' < ');
  };
  // Base clear: the sound lands with the beam, within one frame.
  assert.ok(clear.beamOnMs - clear.soundOnMs <= constants.frameMs);
  assert.equal(show(0), 'result < sound < beam < particles < score pop');
  assert.equal(show(1), 'result < sound < beam < particles < banner < score pop');
  // Early combo steps: the sound comes with the result, before the shake. Steps 5, 8 and 9 measured late.
  for (const step of [2, 3, 4, 6, 7]) {
    assert.equal(show(step), 'result < sound < shake < beam < particles < banner < score pop', `step ${step}`);
  }
  for (const step of [5, 8, 9]) {
    assert.equal(show(step), 'result < shake < sound < beam < particles < banner < score pop', `step ${step}`);
  }
  // Rule 2 says the same, and no longer gives one sound time for every clear.
  const rule = flat(/^2\. \*\*Order the show\.\*\*[\s\S]+?(?=^3\. )/m.exec(sections.Rules)[0]);
  assert.ok(!rule.includes('sound at 80 ms') && !rule.includes('Only the beam and its sound land together'), rule);
  for (const needle of [
    'At steps 0 and 1 it starts at 80 ms, with the beam.',
    'At steps 2, 3, 4, 6 and 7 its median start is 4 to 19 ms, before the shake.',
    'the medians of steps 0, 1, 5, 8 and 9 are 47 to 111 ms.',
  ]) assert.ok(rule.includes(needle), needle);
  // The note under the constants says which starting values were measured and which were chosen.
  assert.ok(flat(skill).includes('The other values are chosen inside the measured median ranges'));
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
  // The moment list keeps the skill's one shake rule: the shake never grows, and a match gets no hit-stop.
  const moments = flat(polish.slice(juice, link));
  assert.ok(moments.includes('screenshake of one size that never grows (a combo makes it longer, not stronger), impact (zoom punch, no hit-stop on a match) on big combos'));
  assert.ok(!moments.includes('screenshake scaled to match size'));
});

test('the plugin version and the changelog name the release that carries it', () => {
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.98', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.98 or later`);
  assert.equal(JSON.parse(read('skills/SKILLS.lock.json')).pluginVersion, version);
  assert.ok(Object.hasOwn(JSON.parse(read('skills/SKILLS.lock.json')).skills, 'juice'), 'the lock lists the skill');
  const changelog = read('CHANGELOG.md');
  const i = changelog.indexOf('## 1.7.98 ');
  assert.ok(i > -1, 'the changelog has an entry for 1.7.98');
  assert.ok(changelog.slice(i, changelog.indexOf('\n## ', i + 1)).includes('`skills/juice/SKILL.md`'));
});
