---
name: game-concept
description: Before shaping a new game's concept, its design doc (docs/GAME_DESIGN.md) or its look — research the genre and its rival games, keep the user's request above the research angle, capture the core loop, fun moment and hook, write a light design doc with every number labelled, and lock the look in docs/ART_DIRECTION.md before any asset.
---

These rules hold for every new game, and for every change to a game's concept, design doc or look. `/make-game`
reads them directly; the research, concept and docs phases point here.

## Research the genre

2. Analyze the concept's genre/mechanic: similar popular games, tired patterns, **differentiation angle**. (v1: web search optional; if unavailable, use reasoning.)
3. Output: `docs/RESEARCH.md` — 1 page: genre, competitor patterns, recommended out-of-the-box angle, risks.

## Shape the concept

- **PRIORITY RULE — the user's explicit request OUTRANKS research's angle.** Research's "out-of-the-box angle"
  is a SUGGESTION; the user's stated concept/materials are the BRIEF. When the user asked for something specific
  (e.g. "rebuild this game 1:1", a named mechanic set, shared materials), the concept's identity/name/hook must
  serve THAT — a research-suggested secondary system may only be woven in as flavor, never promoted into the core
  identity over the user's ask. The originality bar above applies WITHIN the user's brief, not against it: for a
  faithful-remake brief, "original" means execution quality, not swapping the core. **Non-goals discipline:** never
  scope out something the user explicitly asked for. A non-goals list may only contain exclusions the user stated
  or approved (via the gate / an AskUserQuestion); if you believe a requested mechanic should be cut, ASK — do not
  silently non-goal it. ("Do not scope out what the user did not scope out.")
- Capture: the core gameplay loop, target audience, the specific fun-moment, and a 1-sentence hook.

## Lock the look

3b. **LOCK THE LOOK before any asset wave — write `docs/ART_DIRECTION.md`.** Palette, atmosphere numbers
   (fog colour / start / end, ambient, exposure), silhouette rules, material language, and what the game must NOT
   look like. Call `knowledge_get({ key: "pattern:art-direction-contract" })` for how to measure those numbers from a
   reference and what to check first when fidelity is questioned. If it returns empty, continue with your own judgment.

## Light design doc

2. Generate a **light GDD** from CONCEPT.md: core loop, entities, controls, win/lose, screens (menu/play/gameover).
3. Output: `docs/GAME_DESIGN.md` (short, actionable — the anchor for the code phase).
   If it has coins, include the economy plan and runway proof from `skills/game-design/economy.md`: no needed-item
   shortage before 12 completed sessions AND 3 full elapsed days. Check the plan with `economy-check.mjs` before code.
3a. **Label every number.** Each number in GAME_DESIGN.md is marked measured, set by the user, or a starting guess with
   the range to tune within. An unlabeled number reads as measured, and nobody tunes it. Before writing the numbers,
   read `knowledge_get({ key: 'pattern:design-numbers' })`. Before step 4, check that no number is left unlabeled.
