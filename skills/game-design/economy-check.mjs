#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUNWAY = Object.freeze({ completedSessions: 12, elapsedDays: 3 });
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const requireValue = (condition, message) => { if (!condition) throw new TypeError(message); };
const counters = ['completedSessions', 'elapsedDays', 'playMinutes'];

function validatePoint(point, label) {
  requireValue(object(point), `${label}: expected time counters`);
  for (const key of counters) {
    requireValue(typeof point[key] === 'number' && Number.isFinite(point[key]) && point[key] >= 0,
      `${label}.${key}: expected a finite nonnegative number`);
  }
  requireValue(Number.isSafeInteger(point.completedSessions), `${label}.completedSessions: expected an integer`);
  requireValue(point.playMinutes <= point.elapsedDays * 1440,
    `${label}: playMinutes exceeds elapsed time`);
}

/** Check individual simulated runs; the game simulator supplies timings and detects needed-item shortages. */
export function checkEconomyRunway(report) {
  requireValue(object(report) && report.schemaVersion === 1, 'expected schemaVersion: 1');
  requireValue(Array.isArray(report.runs) && report.runs.length > 0, 'runs: expected nonempty array');
  const profiles = new Set();
  const identities = new Set();
  const errors = [];
  for (const [i, run] of report.runs.entries()) {
    const label = `runs[${i}]`;
    requireValue(object(run), `${label}: expected object`);
    requireValue(typeof run.profile === 'string' && run.profile.trim().length > 0, `${label}.profile: required`);
    requireValue(Number.isSafeInteger(run.seed) && run.seed >= 0, `${label}.seed: expected nonnegative integer`);
    const id = JSON.stringify([run.profile, run.seed]);
    requireValue(!identities.has(id), `${label}: duplicate profile and seed`);
    identities.add(id);
    profiles.add(run.profile);
    requireValue(run.purchases === false && run.rewardedAds === false,
      `${label}: purchases and rewardedAds must both be false`);
    validatePoint(run.testedThrough, `${label}.testedThrough`);
    requireValue(Object.hasOwn(run, 'firstShortage'), `${label}.firstShortage: required (null if none)`);
    if (run.firstShortage !== null) {
      validatePoint(run.firstShortage, `${label}.firstShortage`);
      for (const key of counters) requireValue(run.firstShortage[key] <= run.testedThrough[key],
        `${label}.firstShortage.${key}: exceeds testedThrough`);
    }
    const point = run.firstShortage ?? run.testedThrough;
    const reason = run.firstShortage === null ? 'insufficient simulation horizon' : 'early coin shortage';
    if (point.completedSessions < RUNWAY.completedSessions || point.elapsedDays < RUNWAY.elapsedDays) {
      errors.push(`${run.profile} seed ${run.seed}: ${reason} at ${point.completedSessions} completed sessions, ` +
        `${point.elapsedDays} elapsed days, ${point.playMinutes} play minutes; need at least ` +
        `${RUNWAY.completedSessions} sessions AND ${RUNWAY.elapsedDays} days`);
    }
  }
  for (const profile of ['average', 'light']) requireValue(profiles.has(profile), `missing ${profile} profile`);
  return { ok: errors.length === 0, checkedRuns: report.runs.length, errors };
}

export function assertEconomyRunway(report) {
  const result = checkEconomyRunway(report);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireValue(process.argv.length === 3, 'usage: node economy-check.mjs <report.json>');
    const result = checkEconomyRunway(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    for (const error of result.errors) console.error(`FAIL ${error}`);
    console.log(`${result.ok ? 'PASS' : 'FAIL'} economy runway: ${result.checkedRuns} runs checked`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(`ERROR economy runway: ${error.message}`);
    process.exitCode = 2;
  }
}
