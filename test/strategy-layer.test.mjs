// The strategy layer: lessons by genre and by studio that /make-game reads before it designs a game.
// New sources drop in as files under skills/strategy/genres/ and skills/strategy/studios/, so every file there
// is checked for the same shape: front matter, ids that match the file, lessons with a check, and references
// that resolve. The text ships to outside users, so it is also checked for internal words and pasted transcript.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const list = (rel) => readdirSync(new URL(`../${rel}`, import.meta.url)).filter((n) => n.endsWith('.md')).sort();

const GENRE_SECTIONS = [
  '## Mechanics',
  '## Level design',
  '## Difficulty and mechanic curve',
  '## Retention',
  '## Money',
  '## Live ops',
  '## Launch ads and growth',
];

/** Front matter as { key: string | string[] }: `key: value`, `key: [a, b]` and `key:` followed by `  - item` lines. */
function frontMatter(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${file}: starts with front matter`);
  const out = {};
  let listKey = null;
  for (const line of match[1].split('\n')) {
    const item = /^  - (.*)$/.exec(line);
    if (item && listKey) { out[listKey].push(item[1].replace(/^"|"$/g, '')); continue; }
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    assert.ok(kv, `${file}: front matter line parses: ${line}`);
    const [, key, value] = kv;
    if (value === '') { out[key] = []; listKey = key; continue; }
    listKey = null;
    const inline = /^\[(.*)\]$/.exec(value);
    out[key] = inline ? inline[1].split(',').map((s) => s.trim()).filter(Boolean) : value;
  }
  return out;
}

/** Every lesson file: genres, studios and principles, with its parsed front matter and lessons. */
function lessonFiles() {
  const files = [
    ...list('skills/strategy/genres').map((n) => ({ rel: `skills/strategy/genres/${n}`, folder: 'genre', name: n })),
    ...list('skills/strategy/studios').map((n) => ({ rel: `skills/strategy/studios/${n}`, folder: 'studio', name: n })),
    { rel: 'skills/strategy/principles.md', folder: 'principles', name: 'principles.md' },
  ];
  return files.map((f) => {
    const text = read(f.rel);
    const meta = frontMatter(text, f.rel);
    const lessons = [...text.matchAll(/^\*\*([a-z0-9-]+)\/(\d+) — (.+?)\*\*(.*)$/gm)].map((m) => ({
      prefix: m[1], n: Number(m[2]), title: m[3],
      body: text.slice(m.index).split(/\n\n/)[0],
    }));
    return { ...f, text, meta, lessons };
  });
}

const allIds = () => new Set(lessonFiles().flatMap((f) => f.lessons.map((l) => `${l.prefix}/${l.n}`)));

test('make-game reads the strategy layer before the design rules', () => {
  const text = read('commands/make-game.md');
  const start = text.indexOf("## Choose the game's strategy from what made its genre succeed");
  const design = text.indexOf("## Design the game's rules before its content");
  assert.ok(start > -1, 'make-game has the strategy section');
  assert.ok(design > start, 'the strategy section comes before the design rules');
  const part = text.slice(start, design);
  for (const needle of [
    'follows `skills/strategy/SKILL.md` first. It is on by default, not a phase or an approval gate.',
    '`skills/strategy/genres/`',
    '`skills/strategy/studios/`',
    '`skills/strategy/principles.md`',
    'write the table to `docs/STRATEGY.md` before `docs/GAME_DESIGN.md`',
    "The user's request wins over any lesson.",
    'Where those\nfiles are not on disk, apply the same five lessons',
  ]) {
    assert.ok(part.includes(needle), needle);
  }
});

test('the strategy skill says how to match, decide, write, check and add', () => {
  const skill = read('skills/strategy/SKILL.md');
  assert.match(skill, /^---\nname: strategy\ndescription: Before deciding what a new game is/);
  for (const needle of [
    '**On by default.**',
    '## 1. Find the files that match the game',
    'Always read `principles.md`',
    '## 2. Decide each lesson for this game',
    '**apply**', '**adapt**', '**not used**',
    '1. What the user asked for.',
    '## 3. Write `docs/STRATEGY.md`',
    '## 4. Check an existing game against the strategy',
    '**missing**',
    '## 5. Add a new source',
    'Copy `TEMPLATE.md`',
    'Never renumber or reuse an id',
    'A strategy that changes nothing in the game is not done.',
  ]) {
    assert.ok(skill.includes(needle), needle);
  }
});

test('every strategy file has front matter that matches its place', () => {
  const files = lessonFiles();
  assert.ok(files.some((f) => f.folder === 'genre'), 'at least one genre file');
  assert.ok(files.some((f) => f.folder === 'studio'), 'at least one studio file');
  const genreIds = new Set(files.filter((f) => f.folder === 'genre').map((f) => f.meta.id));
  const studioIds = new Set(files.filter((f) => f.folder === 'studio').map((f) => f.meta.id));
  for (const f of files) {
    const { meta } = f;
    assert.equal(meta.kind, f.folder === 'principles' ? 'principles' : f.folder, `${f.rel}: kind`);
    assert.equal(`${meta.id}.md`, f.name, `${f.rel}: id matches the file name`);
    for (const key of ['title', 'summary', 'updated']) assert.ok(meta[key], `${f.rel}: ${key}`);
    assert.match(meta.updated, /^\d{4}-\d{2}-\d{2}$/, `${f.rel}: updated is a date`);
    assert.ok(Array.isArray(meta.sources) && meta.sources.length > 0, `${f.rel}: names its sources`);
    for (const source of meta.sources) assert.ok(source.includes('in our own words'), `${f.rel}: source says it is rewritten`);
    if (f.folder !== 'principles') assert.ok(meta.match.length > 0, `${f.rel}: has match words`);
    for (const id of meta.studios ?? []) assert.ok(studioIds.has(id), `${f.rel}: studio ${id} has a file`);
    for (const id of meta.genres ?? []) assert.ok(genreIds.has(id), `${f.rel}: genre ${id} has a file`);
  }
});

test('every lesson has a stable id, a reason and a check', () => {
  for (const f of lessonFiles()) {
    assert.ok(f.lessons.length > 0, `${f.rel}: has lessons`);
    f.lessons.forEach((lesson, i) => {
      assert.equal(lesson.prefix, f.meta.id, `${f.rel}: lesson ${lesson.n} uses the file id`);
      assert.equal(lesson.n, i + 1, `${f.rel}: lessons are numbered 1, 2, 3 in order`);
      if (f.folder !== 'principles') assert.ok(lesson.body.includes('*Check:*'), `${f.rel}: ${lesson.prefix}/${lesson.n} has a check`);
    });
  }
});

test('genre files keep the sections in order', () => {
  for (const f of lessonFiles().filter((x) => x.folder === 'genre')) {
    let at = -1;
    for (const section of GENRE_SECTIONS) {
      const next = f.text.indexOf(`\n${section}\n`);
      assert.ok(next > at, `${f.rel}: ${section} is present and in order`);
      at = next;
    }
  }
});

test('every lesson reference points at a lesson that exists', () => {
  const ids = allIds();
  const texts = [...lessonFiles().map((f) => [f.rel, f.text]), ['skills/strategy/SKILL.md', read('skills/strategy/SKILL.md')]];
  for (const [rel, text] of texts) {
    for (const m of text.matchAll(/`([a-z0-9-]+\/\d+)`/g)) {
      assert.ok(ids.has(m[1]), `${rel}: ${m[1]} exists`);
    }
    for (const m of text.matchAll(/From (`[a-z0-9-]+\/\d+`(?:, `[a-z0-9-]+\/\d+`)*)/g)) {
      for (const ref of m[1].match(/[a-z0-9-]+\/\d+/g)) assert.ok(ids.has(ref), `${rel}: ${ref} exists`);
    }
  }
});

test('the arrow escape lessons carry what made the reviewed game work', () => {
  const genre = read('skills/strategy/genres/arrow-escape.md');
  for (const needle of [
    '**arrow-escape/1 — Give the game a way to lose.**',
    'a time limit per level, and a set of lives (3)',
    '**arrow-escape/4 — Reveal the board in sections.**',
    '**arrow-escape/7 — Add new mechanics on a steady schedule.**',
    'about 15 mechanics by level 300 to 500',
    'interstitial ads start well after level 26',
    'about 30 to 40% of its revenue from purchases',
    '**arrow-escape/17 — Defend your name in store search.**',
  ]) {
    assert.ok(genre.replace(/\s+/g, ' ').includes(needle), needle);
  }
});

// A number in a lesson is either seen in the reviewed game, estimated or advised by the source, or chosen by us.
// Agents copy the label into the game's docs, so a threshold we chose must never read as the source's fact.
const LABELS = ['*Observed:*', '*Estimated by the source:*', '*Our inference:*'];

test('the strategy skill keeps observed, estimated and inferred numbers apart', () => {
  const skill = read('skills/strategy/SKILL.md');
  for (const label of LABELS) assert.ok(skill.includes(`- ${label}`), `SKILL.md defines ${label}`);
  for (const needle of [
    'A number with no label is our inference.',
    'Every *Check:* line is our test, not the source\'s.',
    'into `docs/STRATEGY.md` and `docs/GAME_DESIGN.md`, next to the number.',
    'Never turn our\ninference into a source fact, and never turn an estimate into an observation.',
  ]) {
    assert.ok(skill.includes(needle), needle);
  }
  assert.ok(!skill.includes('are what the source observed or estimated'), 'SKILL.md no longer credits every number to the source');
});

test('every lesson that gives a number labels where it came from', () => {
  for (const f of lessonFiles().filter((x) => x.folder !== 'principles')) {
    for (const lesson of f.lessons) {
      // Lesson ids such as `arrow-escape/11` and rule numbers such as "rule 2" are references, not numbers.
      const prose = lesson.body.replace(/\*\*[^*]+\*\*/, '').replace(/`[^`]*`/g, '').replace(/rule \d+/g, '');
      if (!/\d/.test(prose)) continue;
      assert.ok(LABELS.some((label) => prose.includes(label)), `${f.rel}: ${lesson.prefix}/${lesson.n} gives a number with no label`);
    }
  }
});

test('the thresholds the source does not give are labelled as our inference', () => {
  const genre = read('skills/strategy/genres/arrow-escape.md');
  const studio = read('skills/strategy/studios/grand-games.md');
  for (const [text, needle] of [
    [genre, '*Our inference:* open a level in sections once it has more than about 20 pieces.'],
    [genre, '*Our inference:* about one new mechanic every 20 levels'],
    [genre, '*Our inference:* no stretch of more than about 30 levels'],
    [genre, '*Our inference:* events, collections and challenges'],
    [studio, '*Our inference:* the first 50 tuned levels'],
  ]) {
    assert.ok(text.replace(/\s+/g, ' ').includes(needle), needle);
  }
});

test('the strategy text ships to outside users: no internal words, no pasted transcript', () => {
  const rels = ['skills/strategy/SKILL.md', 'skills/strategy/TEMPLATE.md', ...lessonFiles().map((f) => f.rel)];
  for (const rel of rels) {
    const text = read(rel);
    for (const word of ['gamebyte', 'fleet', 'board item', 'Can ', 'Can,', 'transcript.rtf']) {
      assert.ok(!text.includes(word), `${rel}: no internal word: ${word}`);
    }
    assert.ok(!/\bi_[a-z0-9]{8}\b/.test(text), `${rel}: no card id`);
    for (const mark of ['[music]', '[laughter]', '[ __ ]', 'Uh-huh']) {
      assert.ok(!text.includes(mark), `${rel}: no transcript mark: ${mark}`);
    }
    assert.ok(!/\d:\d{2}\d* (?:seconds?|minutes?)/.test(text), `${rel}: no transcript timestamp`);
    assert.ok(!/^> /m.test(text), `${rel}: no quoted block`);
  }
});

test('the skill is pinned in the lock and the release names it', () => {
  const lock = JSON.parse(read('skills/SKILLS.lock.json'));
  assert.ok(lock.skills.strategy, 'strategy is in SKILLS.lock.json');
  const version = JSON.parse(read('.claude-plugin/plugin.json')).version;
  assert.ok(version.localeCompare('1.7.80', undefined, { numeric: true }) >= 0, `plugin ${version} is 1.7.80 or later`);
  assert.ok(read('CHANGELOG.md').includes('## 1.7.80'));
});
