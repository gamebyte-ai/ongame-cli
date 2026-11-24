#!/usr/bin/env node
// A miniature consumer, not a replacement for a game's own simulation or runtime economy.
import { checkEconomyRunway } from './economy-check.mjs';

const early = process.argv.includes('--early');
const runs = ['average', 'light'].map((profile) => {
  const sessionMinutes = profile === 'average' ? 5.5 : 4;
  let coins = early ? 110 : 120;
  let firstShortage = null;
  let playMinutes = 0;
  let testedThrough;
  for (let session = 0; session < 16; session++) {
    // Four sessions per day, starting at 0, 6, 12 and 18 hours. A needed item costs ten coins.
    const elapsedDays = session / 4;
    if (coins < 10 && firstShortage === null) {
      firstShortage = { completedSessions: session, elapsedDays, playMinutes };
    }
    if (coins >= 10) coins -= 10;
    playMinutes += sessionMinutes;
    testedThrough = { completedSessions: session + 1, elapsedDays: elapsedDays + sessionMinutes / 1440, playMinutes };
  }
  return { profile, seed: 0, purchases: false, rewardedAds: false, firstShortage, testedThrough };
});
const report = { schemaVersion: 1, runs };
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  const result = checkEconomyRunway(report);
  for (const error of result.errors) console.error(`FAIL ${error}`);
  console.log(`${result.ok ? 'PASS' : 'FAIL'} economy runway: ${result.checkedRuns} simulated runs checked`);
  process.exitCode = result.ok ? 0 : 1;
}
