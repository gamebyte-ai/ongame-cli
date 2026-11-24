---
name: difficulty-curve
description: Before generating the levels of a level-based game — get the difficulty curve from levels_generate on a D1, D7 or D30 retention profile, write it as the game's runtime level config, check that level 1 is easy and rewarding and that a relief level exists, and have the levels review read every file that sets prices and earnings.
---

These rules hold for every level-based game, inside or outside the phases. `/make-game` reads them directly; the
levels phase points here. The steps keep the levels phase's numbers. `skills/level-design/SKILL.md` then works from
the curve that step 4 writes.

3. **Generate the curve — call `levels_generate`** (by short name; find by bare name with ToolSearch):
   ```
   levels_generate({ mechanic: "<core-mechanic>", targetLevels: 30, difficultyProfile: "d30" })
   ```
   - `targetLevels`: 15–30 in prototype, 30–50 is enough in production (default 30).
   - `difficultyProfile`: choose based on the profile selection below (default `d30`).
   - Returned shape: `{ levels: [{ index, difficulty(0..1), goal, params:{moves,target,reward,spike}, isRelief }] }`.
   - **The tool is deterministic and pure** — same input, same curve; do not make up the numbers, trust the tool.

4. **Write the config file — let the game read it at RUNTIME (do NOT embed the math in code):**
   - Write the returned `levels` array as `<gameDir>/src/levels.config.json` (verbatim, as-is).
   - In the game code, import this file and drive the level flow from it:
     ```ts
     import levelsConfig from './levels.config.json';
     // levelsConfig: { levels: Level[] }
     const level = levelsConfig.levels[state.levelIndex];
     // level.params.moves / .target → this level's move budget & target score
     // (a game WITHOUT a fail state does not turn params.moves into a limit — see the level-design step)
     // level.goal → the goal text to show in the HUD
     // level.isRelief → relief level; level.params.spike → challenge peak
     ```
   - **If the `code` phase is already written**, refactor the game's level-loading block to read this
     config (instead of a hardcoded single-level start, use `levelsConfig.levels`).
   - `params.reward` → that level's reward multiplier.
   - Fix until `npx tsc --noEmit` is clean (config import + type usage).

5. **Verify:** `levelsConfig.levels.length === targetLevels`; the first level is easy+rewarding
   (`difficulty < 0.2`, `params.reward > 0`); there is at least one `isRelief: true` level.

**The levels review reads the economy too.** A `phase_review` of the levels gets
`artifact:<the levels.config.json curve text, then each file that sets prices, earnings or upgrade effects, each under a `--- <path> ---` line>`.

**Check the coin runway with the curve.** When levels earn or spend coins, run the game's economy simulation
with the assertion from `skills/game-design/economy.md`. Early shortages must fail its normal test command.
A D1 profile or a short level list does not waive the 12-session AND 3-day default; extend the simulated content
horizon or report it unverified. Include the report with the economy files in the levels review.

## D1 / D7 / D30 logic (profile selection)

Pick the profile by the retention horizon the game is built for: `d1` for a short/casual game or a prototype, `d7`
for a mid-term target, `d30` (default) for a production/full game. Call
`knowledge_get({ key: 'pattern:levels-retention-profiles' })` for what each profile shapes and how relief and spike
levels are presented in the game. If it returns empty, continue with your own judgment.
