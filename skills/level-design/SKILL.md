---
name: level-design
description: Before generating or authoring the levels of a level-based game (puzzle, casual or hybrid-casual stages) — design, measure and review where it is hard, where it rests and where a booster is offered.
---

**Required** for any game whose content is a sequence of numbered levels: puzzle (rotate, unlock, sort,
screw, match, connect), casual stage-based and hybrid-casual games. Run it before levels are generated
or hand-authored, and again whenever the curve, the boosters or the economy change.

**Skip it** for a game without a level sequence (endless, sandbox, single arena) and for a change that
touches no level, booster or reward.

**A replica is not a skip.** Copying a game's mechanic does not copy its curve; the curve is measured
from the reference and rebuilt for the new levels, not assumed from screenshots.

1. Call `knowledge_get({ key: "pattern:level-design" })` and follow the returned procedure, including
   its expert review.
2. Write the result to `docs/LEVEL_DESIGN.md` in the game directory: the measured curve, the hard and
   rest levels, the booster and offer points, and the open calibration questions. Show the user the
   summary with the levels.
3. Keep the checks it names as automated tests in the game, so a regenerated level set cannot drift
   from the curve silently.

`levels_generate` gives a curve shape; this step decides what that shape means for THIS game and
proves the shipped levels follow it. Use both when both are available.

If `knowledge_get` is unavailable, gated or fails, say so and report the level design as not
reviewed. Do not substitute a remembered or improvised version of the procedure.
