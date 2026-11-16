---
name: scene-transitions
description: Before wiring how a game moves between its big screens — splash, lobby, play, result, next level, retry, home — map every edge, choose a style per edge and verify each path, so no frequent edge is a hard cut and no frequent edge is a long show.
---

**Required** for any game with more than one big screen: a lobby or menu and a play screen, or a level
sequence with a result between levels. Run it when the screens are first wired, and again whenever a
screen, a path into play (retry, a daily quest, a deep link) or a transition changes.

**Skip it** for a single-screen game with no lobby and no level sequence, and for a change that touches
no screen change.

**A replica is not a skip.** Copying a game's screens does not copy how they connect. The edges are
mapped and each one gets a chosen style, rather than being left as they came out of the code.

1. Call `knowledge_get({ key: "pattern:scene-transitions" })` and follow the returned procedure. It
   indexes the styles; fetch the chosen ones as `knowledge_get({ key: "transition:<id>" })`.
2. Write the edge map and the style chosen for each edge to `docs/TRANSITIONS.md` in the game
   directory. Show the user the summary.
3. Route every path that changes screen through one entry and keep the stepped checks it names as
   tests, so a new path cannot slip in as a hard cut.

If `knowledge_get` is unavailable, gated or fails, say so and report the transitions as not reviewed.
Do not substitute a remembered or improvised version of the procedure.
