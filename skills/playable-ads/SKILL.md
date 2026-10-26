---
name: playable-ads
description: When the user wants playable ads for a game that already plays — interactive ads, "playables", an ad end card, or files for AppLovin, Unity Ads, Meta or Google — build them from the game's own code, art, sounds and mascot, measure that each is a real challenge, and deliver one self-contained file per ad network.
---

**Use it** when the game already plays and the request is for ads that are played: "make playable ads", "3 playables
for this game", "an ad for AppLovin / Meta / Google", "an end card with our mascot", "a single HTML for the networks".
Run it again for any later change to a playable, since the proof steps cover all three.

**Skip it** for a store video or screenshots (that is the store step) and for a game that does not play yet.

1. Call `knowledge_get({ key: "pattern:playable-ads" })` and follow the returned procedure in its order: map the
   game's seams, choose three concepts, measure every board with the game's own simulation, build the ad layer and
   the end card, prove every path, then hand off.
2. Show the user the three playables on a review page, with each one's measured difficulty, before building the
   network files. When the user leaves the concepts to you, say in one line each why you picked them.
3. Keep the measuring script and the build script beside the playables, so a later change can be measured and
   rebuilt the same way.

Deliver the review page, then the network files with their sizes against each network's budget and the store link
they open. A link means a local link; publishing stays a separate request.

If `knowledge_get` is unavailable, gated or fails, say so and report the playables as not built to the procedure. Do
not substitute a remembered or improvised version of it.
