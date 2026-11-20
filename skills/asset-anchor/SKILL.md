---
name: asset-anchor
description: Before ANY asset request for a game (forge_request, forge_batch) — the first manifest, a set member, or one more asset days later — find what the game already has and anchor the new asset to it with editOf; never generate an asset cold.
---

`/make-game` reads this directly; the assets phase points here.

## RULE 0 — never generate an asset cold. Anchor it to what already exists.

**Applies to EVERY asset request, at any point in a build** — the first manifest, a set member, and just as much
the one the user asks for three days later ("add a boss", "one more enemy", "a new icon"). A later request is where
this is usually dropped, and it is the one where it costs most: a fresh generation with no anchor comes back in a
different language, and the game visibly stops being one game.

**Before ANY `forge_request`/`forge_batch`, go and find the relevant references. Do not generate first.**

1. **What this game already has** — `asset_library_list({ gameId })`. The user already paid for these, and they
   define the look you must match. Take an anchor from here whenever anything related exists.
2. **The concept visuals** — `docs/CONCEPT.md` and the files it recorded (§1a); the approved picture of the game.
3. **`docs/ART_DIRECTION.md`** — the locked palette and atmosphere numbers (concept step 3b).
4. **Anything the user supplied** — `{gameDir}/assets/reference/`, a pasted screenshot, a link they sent.

Then request the asset with **`editOf` set to the anchor**, and write the prompt to describe only the
**difference**. The shared `ART_PREFIX` (§2) still goes in every prompt; the anchor is what makes the result
belong to *this* game rather than merely to the same style words.

Generating from a prompt alone is acceptable **only when nothing relevant exists** — a genuinely first asset. If
you land there, say so in one line rather than letting it pass silently, because it is the case where the result
is most likely to look foreign and the user is the one who can tell you what it should have matched.

**Most of the time this costs you ONE extra argument, not a workflow.** `editOf` accepts, directly:

- the sealed `meta.assetId` from a generating result — the anchor for a set you are making right now;
- the stable `a_<hex>` library id from `asset_library_list`/`asset_library_get` — reach for this one when the
  anchor came from an EARLIER session, since the sealed handle dies in ~24h;
- a public `http(s)` URL.

**Only a file on the user's DISK needs the upload step**, and only because generation runs remotely and cannot read
their filesystem: copy it under `assets/reference/`, call `forge_reference` for a slot, hand that to
`reference_upload` → `assetId`, then use it as `editOf`. If you already hold an id or a URL, skip all of that —
going through the upload path with an anchor you already have is wasted work, and it is the reason this flow gets
a reputation for being heavy.

For animated characters, use **sprite clip mode** (§3) and pass the character image as `editOf`.
Only the legacy **grid mode** is prompt-only; describe the anchored character in its grid prompt.
A mascot that has to *act* on menus and result cards (cheer, wave, "oops") is a **`video`** asset instead (§3):
fetch `pattern:mascot-video` before generating it.

