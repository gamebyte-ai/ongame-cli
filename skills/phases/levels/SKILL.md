---
name: levels
description: Retention-tuned level generation (phase 8) — the D1/D7/D30 difficulty curve comes from the math service and is integrated into the game as config.
---
# Levels Phase (retention-tuned, production-grade)

Purpose (VISION phase 8): for the shipped game to hit its **D1, D7, D30** retention numbers — levels
are **fun, sticky, and won't burn the player out**. Do not hand-tune the difficulty curve; **the `levels_generate`
tool generates PURE retention-math**, and you integrate it into the game code.

## Steps

1. `trace_emit({ buildId, name: "phase.levels.start" })` (`buildId` from `state_init`'s return, threaded through the build).

1a. **Live prompt:** call `prompt_get({ phase: 'levels' })` (find by bare name `prompt_get` via ToolSearch). If it returns a non-null `override`, that override is your AUTHORITATIVE guidance for this phase (the optimized, live version) — follow IT instead of the default guidance in this file. If it returns null / is unavailable / errors, follow the default guidance below (fail-soft). Never block on it.

2. **Determine the mechanic:** read the core loop/mechanic from `GAME_DESIGN.md` (e.g. "match-3",
   "tower-defense", "endless-runner"). This becomes the `mechanic` argument.

3. **Generate the curve — call `levels_generate`** (by short name; find by bare name with ToolSearch):
   ```
   levels_generate({ mechanic: "<core-mechanic>", targetLevels: 30, difficultyProfile: "d30" })
   ```
   - `targetLevels`: 15–30 in prototype, 30–50 is enough in production (default 30).
   - `difficultyProfile`: choose based on the D1/D7/D30 logic below (default `d30`).
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
     // level.goal → the goal text to show in the HUD
     // level.isRelief → relief level: a "breather" tone in the UI, more generous reward
     // level.params.spike → challenge peak: show a "Boss/Challenge" badge
     ```
   - **If the `code` phase is already written**, refactor the game's level-loading block to read this
     config (instead of a hardcoded single-level start, use `levelsConfig.levels`).
   - `params.reward` → that level's reward multiplier (high in onboarding & relief = dopamine).
   - Fix until `npx tsc --noEmit` is clean (config import + type usage).

5. **Verify:** `levelsConfig.levels.length === targetLevels`; the first level is easy+rewarding
   (`difficulty < 0.2`, `params.reward > 0`); there is at least one `isRelief: true` level.
   - **Deterministic sub-score (`curve_valid`):** right after this validation, emit the objective result —
     `brain_score({ gameId: <slug>, phase: "levels", name: "curve_valid", value: <1 if the curve is valid else 0>, buildId: <buildId>, comment: "<validation result>" })`
     (ongame). **Valid** = the checks above hold: length matches, a generally-increasing (monotonic-ish) ramp with
     no `NaN`/holes/missing fields, level-0 easy+rewarding, ≥1 relief level. Judge-independent backbone, distinct from the
     gate's self-judged `phase_quality`. Fail-soft: a failed `brain_score` NEVER blocks the build; no-op if
     `buildId`/brain is absent.

6. **Emit the phase's headline decision (observability) — BEFORE `state_advance`:**
   ```
   trace_emit({ buildId, name: "phase.output", payload: {
     input:  "<the CONTEXT this phase consumed: the brain_recall retention signal(s) used (e.g. 'D7 lake learning: match-3 drops at L2'), the mechanic read from GAME_DESIGN.md, and the targetLevels/intent (prototype vs production)>",
     output: "<the ARTIFACT produced: src/levels.config.json with N levels (difficulty 0..1), the relief/spike level indices, level-0 ease+reward values, and the code refactor that drives the flow from the config; tsc clean>",
     metadata: {
       decision: "<the MAIN choice: the difficultyProfile selected (d1 / d7 / d30) and targetLevels>",
       why: "<the RATIONALE, explicitly citing what drove it: the brain_recall retention signal (e.g. 'recall showed L2 drop-off → d7 plateau + periodic relief to stop burnout'), the user intent (prototype → fewer levels + d1; production → d30 meta), and the mechanic's curve needs>"
     }
   }})
   ```
   One emit — the phase's headline retention-curve decision (profile + level count + WHY), not per-level. Core maps `phase.output` → a `generation` nested under the phase span, so Langfuse shows, for this phase, "what context went in → what curve came out → which profile was chosen and why".

6b. **Independent quality check (advisory):** call `phase_review({ phase:'levels', buildId, gameId, artifact:<the levels.config.json curve text>, context:{ targetLevels:<N>, retentionProfile:<d1|d7|d30>, genre:<mechanic>, intent:<the user's intent / mode> } })` (bare name `phase_review` via ToolSearch) → `{ verdict, score, feedback:[{issue, confidence}] }`. **ADVISORY — you decide:** on `verdict:'revise'`, weigh each `feedback.issue` (profile-fit · **VARIETY — not monotone 'same level, harder'** · integration shape); where you agree it improves retention, adjust the curve (your judgment), then you MAY re-review (a cap bounds re-runs). On `'pass'`/`'skip'` (or free/unavailable) proceed. Relay any change in YOUR OWN voice — never mention an external check or how it works. Fail-soft: never block.
7. `state_advance({ buildId })` + `trace_emit({ buildId, name: "phase.levels.done" })`.

## D1 / D7 / D30 logic (profile selection)

The curve is **generally-increasing but NOT monotonic** in every profile (relief dips + spike peaks):

- **D1 — first session / onboarding (`difficultyProfile: "d1"`):**
  The first levels are **easy + high-reward** (so the player gets an "I won" feeling), an almost-linear
  smooth ramp, **no wall**. For short/casual games or prototypes.

- **D7 — sticky for a week (`difficultyProfile: "d7"`):**
  Onboarding + **plateau segments** (a "mastery plateau" instead of a sudden jump) +
  **periodic relief** (a breather every ~7 levels → no burnout). Mid-term retention target.

- **D30 — long-term meta (`difficultyProfile: "d30"`, default):**
  Everything from D7 + **periodic challenge spikes** (params.spike) and a **steeper finale** →
  sticky meta-progression. For production/full games.

> The tool applies this teaching internally: early easy+rewarding (D1), gradual no-wall ramp, periodic
> relief (no burnout), plateau+spike balance (D7/D30). You just select the right profile and wire the
> resulting config into the game.

> **Correction-learning:** if this phase is re-running because the user **corrected** the difficulty (rejected the
> curve as too hard/easy, redirected the profile/level count, or hand-edited `levels.config.json`), call
> `friction_report(buildId, gameId, phase="levels", kind, agentDid, userWanted, evidence?)` (bare name via
> ToolSearch) with the DELTA — what profile/curve you assumed vs what the user actually wanted (e.g. "assumed d30 with
> steep spikes → user wanted a gentle d7 ramp, no walls"). Report the user-correction delta, NOT a self-summary of the
> curve you generated. Agentic (you judge if it's a real correction); fail-soft (never block). See `/make-game`'s
> correction-learning block.
