---
name: store-prep
description: Get a finished game ready for the App Store and Google Play — store text, real-play screenshots, a preview video, icon options and one review page. Use when the user says "get this game ready for the stores", "store'a hazırla", or asks for an App Store or Play listing, store screenshots or a store video.
---

Use this when a game already plays end to end and the user wants it ready for the stores. It produces
everything a person needs to upload; it uploads nothing and submits nothing.

**Not for** a game that is still being built, or for publishing to a web link — that is `/publish`.

1. Find the game the same way `/publish` does: look where you are, then `games_list`, then ask.
2. Call `knowledge_get({ key: "pattern:store-prep" })` and follow the returned procedure. It names the
   agents, their order and every check.
3. Write the output to `store/release/` in the game. Never overwrite an existing listing or store graphic:
   a person may already have uploaded it.
   The one change to the game's own code is the in-app rating the procedure wires (its section 6): every
   store build asks, at the game's three high points.
4. Finish with the review page the procedure describes, and tell the user what only they can do
   (upload, the YouTube video for Play, icon A/B tests).

If `knowledge_get` is unavailable, gated or fails, say so and stop: report the store pack as not
produced. Do not improvise store text or graphics from memory — a store page is a promise to every player
who reads it.
