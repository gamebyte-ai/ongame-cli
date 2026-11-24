# Let players enjoy the game before they need coins

Default for every new game with a coin economy: **no needed-item coin shortage before 12 completed sessions AND
3 full elapsed days since the first session**. Both must be reached. Twelve uses a planning assumption of four
5–6 minute sessions per day: 3 × 4 = 12 sessions, roughly 66 play minutes at 5.5 minutes/session. This is a starting
assumption, not telemetry for the game. Record its actual session length and schedule; twelve short sessions
still need three elapsed days, and a long first-day binge still needs twelve sessions and three days.

A shortage is a needed undo, hint, continue, life refill or other gameplay purchase that the available coins
cannot pay, after free stock is used, **before** any rescue video or purchase. Optional cosmetics do not count.
Do not make early enjoyment depend on buying coins, watching ads or repeatedly grinding already completed
content. Model new players who decline purchases and rewarded ads, including average and light/less-skilled
players. Later coin pressure may be tuned only after both thresholds. Games with no coin economy mark this
section not used; do not invent one. A maker's explicit different requirement is recorded as an exception,
never reported as passing this default check.

## Plan and check

In `docs/GAME_DESIGN.md` (or linked `docs/ECONOMY.md`), record starting coins/free stock, earns and sinks, session
length and schedule, needed-item use by player profile, and the first shortage in sessions, minutes and elapsed
days. Label all player assumptions and show sensitivity to shorter sessions and more mistakes. Plan enough
content/free resources for the protected period; a level count alone proves no duration.

Use the game's existing economy simulator/test, such as `tools/economy-sim`, reading its actual runtime prices,
rewards and free stock. Add the runway assertion to its normal test command, not an optional report flag.
If none exists, create that small game-specific simulator as part of economy work. Check at the shortage event,
not at level end. Do not average away early failures: export every seeded run for each profile. Simulate through
both thresholds or the first shortage. When no shortage occurs, a shorter horizon is inconclusive and fails.
A pass covers these model runs only; it is not proof about every real player.

The shared checker is `skills/game-design/economy-check.mjs` in this plugin. Copy it unchanged into the game's
`tools/` so the game tests work without a plugin install, then import `assertEconomyRunway(report)` from it in
the existing simulation test. Keep the copied checker current when changing the economy. For a planning report:

```sh
node <pluginRoot>/skills/game-design/economy-check.mjs <gameDir>/docs/economy-runway.json
```

Exit 0 passes, 1 means early shortage or insufficient coverage, and 2 means invalid/missing input. Missing data
is never a pass. The module also exports `checkEconomyRunway(report)` for callers that need all failure messages.

Report contract (plain JSON, schemaVersion 1): `runs` is a nonempty array containing at least `average` and
`light` profiles. Each run has a unique `(profile, seed)`, nonnegative integer `seed`, `purchases: false`,
`rewardedAds: false`, `testedThrough` and `firstShortage`. A time point has finite, nonnegative `playMinutes`,
`elapsedDays` (24-hour days since first play, not minutes divided by daily play budget), and integer
`completedSessions`. Count sessions using the documented representative session schedule, not every app reopen.
`firstShortage` is a time point or explicitly `null`; it cannot be later than `testedThrough` in any counter.

```js
import { assertEconomyRunway } from './economy-check.mjs';
// In the game's normal economy test, after simulate() has run using runtime economy config:
assertEconomyRunway({ schemaVersion: 1, runs });
```

Run the included miniature simulator to see the full consumer path. It models a ten-coin needed item at each
session's start, four sessions a day, no ad income and no purchases. Starting with 120 coins lasts to session 13
(after 12 sessions and 3 days); 110 runs short in session 12 and fails. This is an example, not a game economy:

```sh
node <pluginRoot>/skills/game-design/economy-example.mjs                 # PASS
node <pluginRoot>/skills/game-design/economy-example.mjs --early         # FAIL, exit 1
node <pluginRoot>/skills/game-design/economy-example.mjs --json > report.json
node <pluginRoot>/skills/game-design/economy-check.mjs report.json
```
