---
name: storyboard
description: Settle the world's structure, camera, cast, kit and tempo as a countable contract BEFORE generating any visual, so consistency is checkable instead of remembered.
---

Use this between understanding the request and generating the first image, whenever the game has
**more than one scene** or **at least one recurring character**. It costs one text file and no
generation credits.

**Skip it** when there is nothing for it to hold: a single-screen mechanic prototype, a text or
logic-only change, a request that touches no visual.

**A REPLICA IS NOT A SKIP — it is the case with the most to hold.** "Make this game", with a link, a
video or a handful of screenshots, does not remove the storyboard; it removes the *inventing*. Every
row is FILLED FROM the reference instead of imagined, and the procedure runs unchanged.
`pattern:concept-deconstruction` is a different job — it measures types and placement inside ONE
supplied composite — and yields no scene list, no cast contract, no tempo and no part gate. Use it
inside this procedure, not instead of it.

1. Call `knowledge_get({ key: "pattern:storyboard" })` and follow the returned instructions.
2. Write the result to `docs/STORYBOARD.md` in the game directory, and put it in front of the user
   before generating anything — level and content art included. Collecting reference evidence
   (frames, crops) comes first; generating comes after the storyboard has been shown.
3. Keep that file as the contract every later phase checks its output against. Re-run this step when
   the user changes what the game contains, and run its checks against the RUNNING game before
   calling the game done — the rows alone are not evidence that the game matches them.

If `knowledge_get` is unavailable, gated or fails, say so and report the storyboard as not produced.
Do not substitute a remembered or improvised version of the procedure — a contract nobody can check
is worse than none, because later phases will trust it.
