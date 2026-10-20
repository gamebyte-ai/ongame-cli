---
name: art-direction
description: When an existing game must look consistent, holistic or "like one world", match a reference game's quality, or the user asks you to work as an art director — audit it, lock one visual language in writing, and prove the change on every screen.
---

**Use it** when the game already plays and the request is about its look as a whole: "make it consistent",
"art direction", "it looks like assets glued together", "as polished as <reference>", "the character looks pasted
in" or "looks frozen between animations". Run it again whenever a later change replaces art the user already saw.

**Skip it** for a single asset request that already has an anchor (follow the assets recipe), and for a new game
whose look is still being decided (that is the concept step, `pattern:art-direction-contract`).

1. Call `knowledge_get({ key: "pattern:art-direction-pass" })` and follow the returned procedure in its order,
   including its audit, its control matrix and its coverage sweep.
2. Write the rules to `docs/ART_DIRECTION.md` in the game directory before changing code, with the invariants the pass must
   not move. Show the user the audit page and the rules before generating anything.
3. Keep the control matrix as a script in the game, so a later change can be checked against the same rules.

Deliver a before/after page for every changed screen, the matrix result and an open-issues list. A link means a
local link; publishing stays a separate request.

If `knowledge_get` is unavailable, gated or fails, say so and report the art direction as not reviewed. Do not
substitute a remembered or improvised version of the procedure.
