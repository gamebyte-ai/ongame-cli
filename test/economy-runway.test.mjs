import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkEconomyRunway, assertEconomyRunway } from '../skills/game-design/economy-check.mjs';

const point = (completedSessions = 12, elapsedDays = 3, playMinutes = 66) => ({ completedSessions, elapsedDays, playMinutes });
const report = (firstShortage = point(), testedThrough = point(16, 4, 88)) => ({ schemaVersion: 1,
  runs: ['average', 'light'].map(profile => ({ profile, seed: 42, purchases: false, rewardedAds: false,
    firstShortage: structuredClone(firstShortage), testedThrough: structuredClone(testedThrough) })) });
const script = name => fileURLToPath(new URL(`../skills/game-design/${name}`, import.meta.url));
const run = (...args) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 10000 });

test('control: exact boundary, later shortage and a fully tested shortage-free plan pass', () => {
  for (const data of [report(), report(point(15, 3.8, 80)), report(null)]) {
    assert.equal(assertEconomyRunway(data).checkedRuns, 2);
  }
});

test('either early sessions or early days fails, including a first-day binge', () => {
  for (const p of [point(11, 3), point(12, 2.999), point(20, 0.5, 110), point(2, 10, 11)]) {
    const result = checkEconomyRunway(report(p, point(24, 12, 132)));
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0], /early coin shortage/);
    assert.throws(() => assertEconomyRunway(report(p, point(24, 12, 132))), /early coin shortage/);
  }
});

test('no shortage is not a pass without both horizon thresholds', () => {
  for (const end of [point(11, 4), point(12, 2.9)]) {
    assert.match(checkEconomyRunway(report(null, end)).errors[0], /insufficient simulation horizon/);
  }
});

test('one early sample fails even if the majority never runs short', () => {
  const data = report(null);
  data.runs.push({ ...data.runs[0], seed: 43, firstShortage: point(1, 0.1, 5.5) });
  const result = checkEconomyRunway(data);
  assert.equal(result.ok, false);
  assert.equal(result.checkedRuns, 3);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /average seed 43/);
});

test('malformed, absent, unsupported and contradictory evidence is rejected', () => {
  const mutations = [
    d => { d.schemaVersion = 2; }, d => { d.runs = []; }, d => { d.runs.pop(); },
    d => { delete d.runs[0].firstShortage; }, d => { d.runs[0].firstShortage = {}; },
    d => { d.runs[0].firstShortage.completedSessions = 12.5; },
    d => { d.runs[0].firstShortage.completedSessions = '12'; },
    d => { d.runs[0].firstShortage.elapsedDays = NaN; },
    d => { d.runs[0].testedThrough.elapsedDays = Infinity; },
    d => { d.runs[0].firstShortage.playMinutes = -1; },
    d => { d.runs[0].firstShortage = point(17, 3, 80); },
    d => { d.runs[0].firstShortage = point(12, 5, 80); },
    d => { d.runs[0].firstShortage = point(12, 3, 90); },
    d => { d.runs[0].firstShortage = point(12, 0, 66); },
    d => { d.runs[0].purchases = true; }, d => { d.runs[0].rewardedAds = true; },
    d => { d.runs[0].seed = -1; }, d => { d.runs[0].profile = ''; },
    d => { d.runs.push(structuredClone(d.runs[0])); },
  ];
  for (const mutate of mutations) {
    const data = report(); mutate(data);
    assert.throws(() => checkEconomyRunway(data), TypeError, mutate.toString());
  }
  for (const data of [null, {}, [], { schemaVersion: 1, runs: [null] }]) {
    assert.throws(() => checkEconomyRunway(data), TypeError);
  }
});

test('miniature economy simulator and JSON CLI pass the control and reject the early plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'economy-runway-'));
  try {
    for (const early of [false, true]) {
      const args = early ? ['--early'] : [];
      const simulated = run(script('economy-example.mjs'), ...args);
      assert.equal(simulated.status, early ? 1 : 0, simulated.stderr);
      assert.match(simulated.stdout, /2 simulated runs checked/);
      const json = run(script('economy-example.mjs'), ...args, '--json');
      assert.equal(json.status, 0, json.stderr);
      const file = join(dir, 'report.json');
      writeFileSync(file, json.stdout);
      const checked = run(script('economy-check.mjs'), file);
      assert.equal(checked.status, early ? 1 : 0, checked.stderr);
      assert.match(checked.stdout, /2 runs checked/);
    }
    const bad = join(dir, 'bad.json'); writeFileSync(bad, '{');
    for (const args of [[], [bad], [join(dir, 'missing.json')]]) {
      const result = run(script('economy-check.mjs'), ...args);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /ERROR economy runway/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
