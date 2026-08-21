---
name: intake
description: ongame Phase 0 — personalization; JUDGE the output MODE (concept-only/prototype/production/playable-ad) + PERSONA (studio/indie) from the user's materials/prompt, gather materials for playable-ad, ask only when genuinely needed.
---

# Intake — Personalization (Phase 0)

Goal: **not everyone enters the same pipeline.** Get to know the user and **judge** (a) the output MODE and (b) the
PERSONA, from what the user actually shared. This is an **agentic** step — YOU decide; the code only presents signals +
options (NO keyword-if). The mode is carried in the build plan (server-persisted; downstream phases + the jury
calibrate to it). This skill is the runtime recipe.

## The four output MODES (judge which one)
- **concept-only** — docs only, no build (lightest).
- **prototype** — validate a mechanic FAST; graybox playable, loop-correctness first (AIStudio territory).
- **production** — a full, polished, soft-launchable game (graybox-first → dress → juice → levels → polish).
- **playable-ad** — a short, hook-first PLAYABLE AD from the user's uploaded MATERIALS.

## The two PERSONAS (orthogonal — sets your TONE, not the bar)
- **studio** — game company / marketing: detailed prompts, watches actively, technical language OK.
- **indie** — hobby: simple prompts ("make a match-3 like X"), often a clone, may not know what a GDD is → teach in
  plain non-industry language, keep it always-shippable under budget.
- Genuinely can't tell → **unknown** (proceed neutrally).

## Steps

0. **Live prompt:** call `prompt_get({ phase: 'intake' })` (bare name via ToolSearch). Non-null `override`
   → follow it (the optimized live version). null/unavailable/error → the default below (fail-soft). Never block on it.
1. **Pull context:** `intake_context(concept=<concept>)` → `{ concept, returning, decisionsCount, priorGames[],
   pathOptions[], intentOptions[] }`. This is CONTEXT for your judgment, not a decision.
1b. **JUDGE the ENTRY — is there already a game here?** (`/make-game` §0.5 does the looking; this is where the
   judgment is recorded.) Two doors, and they are not symmetric:
   - **`new`** — a game is being started from nothing. The mode's full pipeline runs.
   - **`continue`** — the user is inside a game that already exists and wants something DONE to it. Then you must
     also judge the **`intent`** — what kind of work it is — from `intentOptions` (each carries a `summary` and a
     `suggestedPhases` starting point): `feature | content | bugfix | polish | art | performance | ship | derive |
     other`. `derive` is the one that also changes the MODE (a playable ad cut from an existing game is
     `path='playable-ad'`, `entry='continue'`, `intent='derive'`).
   - **A continuation carries the game's identity, not a new one:** same `gameId`, same directory, and `continues` =
     the prior `buildId` when the game has one (`games_list`/`game_summary`). A game built by hand or before the
     plugin has none — send no `continues` rather than inventing one.
   - **Choose the PHASES for a continuation.** `suggestedPhases` is a starting point, not an answer: a "bugfix" that
     turns out to need a design change genuinely needs `docs`; a "feature" in a game with no docs does not. Send the
     subset YOU judge. Order does not matter — it is normalised to the pipeline's dependency chain.
2. **JUDGE the MODE (agentic — from the materials/prompt, NOT keyword-if):**
   - The user **UPLOADED materials** (gameplay video, screenshots, game assets, a GDD) and wants an ad / a playable →
     **playable-ad** (see the recipe in step 5).
   - They want to **see/validate a loop fast** ("does this mechanic work", a genre mashup, a PC→mobile idea) →
     **prototype**.
   - They want a **full, polished game** to ship/iterate (a clone "like X", a detailed GDD) → **production**.
   - Just a sketch / "explore the idea" → **concept-only**.
   - Weigh the concept + `priorGames` + `returning`. YOU infer — there is no label in the code.
3. **JUDGE the PERSONA:** studio vs indie from the prompt's sophistication + history (a polished GDD + technical
   language → studio; a one-line "make X like Y" with no game-dev vocabulary → indie). Unsure → `unknown`.
3b. **JUDGE the ENGINE and the DELIVERY TARGET — read the workspace, don't ask first.** These are two separate
   axes and collapsing them loses real lessons: *"hook the player in the first 5 seconds"* is a delivery-target
   lesson that transfers across engines, while *"batch particles"* is engine-specific. One label cannot carry both.
   - `engine` — what it is BUILT with: `three-js` | `unity` | `godot` | `unreal` | `unknown`.
     Read the directory the user is in: `ProjectSettings/ProjectVersion.txt` or an `Assets/` tree → **unity**;
     `package.json` with a vite/three setup → **three-js**; `project.godot` → **godot**. An empty directory with
     no signal is not unity — it is the default web path unless the user says otherwise.
   - `deliveryTarget` — where it SHIPS: `browser` | `mobile-build` | `desktop-build` | `ad-network` | `editor` |
     `unknown`. A playable-ad ships to `ad-network`; a web game to `browser`; a Unity project may still ship to
     any of them, which is exactly why this is not derivable from the engine.
   - **Judging `unity` has a consequence, not just a label:** if you cannot see the Editor the build is written
     blind. Usually you can — `unity status` answers from the terminal, no setup asked of the user. If you land
     on `unity`, check it here rather than discovering three phases later that nothing was verifiable;
     `/make-game` step 0.2 and `skills/unity/SKILL.md` §3 carry it.
   - **If you cannot tell, send `unknown` — do NOT omit the field.** The two are not the same and the difference
     is the whole point: `unknown` records that you looked and could not decide, while an omitted field records
     that nothing considered it at all. Skipping it destroys a signal that costs you nothing to send.
4. **CONFIRM in one sentence; ASK only when genuinely ambiguous** (never silent autopilot, never over-ask):
   - Clear signal → auto-decide + a one-sentence confirmation: *"This looks like a **<mode>** (<short rationale>) —
     I'm going that way; say 'stop' to change."* Continue without waiting.
   - New user (`returning=false`) OR ambiguous goal/mode → **ASK** with `AskUserQuestion`, options built from
     `pathOptions.summary`. One question at a time; if the genre/mechanic is also unclear, one more.
5. **PLAYABLE-AD recipe** (ONLY when mode=playable-ad — a DIFFERENT process from making a game):
   - **Analyze the uploaded materials FIRST:** what is the game, what is the exact playable MOMENT the ad should show,
     what format. The user may have it fully in mind, or need creative direction.
   - **Missing materials?** REQUEST them directly ("I need the gameplay video / the hero sprite to match the look"),
     OR offer **"shall I generate the assets?"**. Do not proceed on a guess.
   - **No creative direction?** GUIDE them — propose a hook/format ("like the ad for <genre> where <moment>?"),
     ideally with a visual reference.
   - **Variation?** If they point at an EXISTING playable (its code), this is a VARIATION iteration — continue from
     that build, do NOT rebuild from scratch.
6. **Collect answers → `notes`:** fold the genre/mechanic + any material/format/persona notes into one string (e.g.
   `"genre: puzzle; mechanic: swap-match; materials: gameplay video + hero sprite"`). Empty string if nothing extra.
7. **Generate BuildPlan:** `intake_build_plan(concept, path=<mode>, persona=<studio|indie|unknown>, engine,
   deliveryTarget, entry, intent?, continues?, phases?, decidedBy, userKnown, notes)`.
   - `path` = the MODE judged in step 2 (concept-only / prototype / production / playable-ad).
   - `persona` = step 3.
   - `entry` = step 1b (`new` | `continue`). On `continue`, `intent` is **REQUIRED** — the tool rejects a
     continuation without one, because an unlabelled continuation cannot be routed, judged or learned from. Send
     `continues` when the game has a prior build, and `phases` when you judged a subset. On `new`, sending any of
     those three is an error (they describe something that did not happen) — the tool says so rather than ignoring
     them.
   - `engine` + `deliveryTarget` = step 3b. **Always send both, `unknown` included.** They are what lets a lesson
     learned on one project reach the right future project — and only the right one.
   - `decidedBy` = "auto" (proceeded automatically) | "asked".
   - `userKnown` = `intake_context.returning` (observed truth).
   - `notes` = step 6 (empty if none).
8. Return the BuildPlan to the `/make-game` flow.

## Principle
Agentic: YOU judge MODE + PERSONA from what the user actually shared — no keyword-if, no pre-baked decision. **Mode
sets what "good" means downstream** (the jury + phase skills calibrate to it); **persona sets your tone, not the bar.**
Confirm in one sentence; ask only when a wrong guess would cost more than the question. For playable-ad, the
first job is analyzing the user's materials and filling the gaps (request or offer-to-generate), not guessing. The
answers fold into `notes` so the effort carries to the phases.
