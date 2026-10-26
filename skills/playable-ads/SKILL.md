---
name: playable-ads
description: When the user wants playable ads for a game that already plays — interactive ads, "playables", an ad end card, or files for AppLovin, Unity Ads, Meta or Google — follow the playable-ads procedure.
---

**Use it** when the game already plays and the request is for ads that are played: "make playable ads", "3 playables
for this game", "an ad for AppLovin / Meta / Google", "an end card with our mascot", "a single HTML for the networks".
Run it again for any later change to a playable.

**Skip it** for a store video or screenshots (that is the store step) and for a game that does not play yet.

Call `knowledge_get({ key: "pattern:playable-ads" })` and follow the returned procedure in its order.

A link means a local link; publishing stays a separate request.

If `knowledge_get` is unavailable, gated or fails, say so and report the playables as not built to the procedure. Do
not substitute a remembered or improvised version of it.
