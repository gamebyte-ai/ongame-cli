---
name: publish
description: Publish a game you built here to a live, shareable URL. Builds it, uploads it, and verifies the live page really serves this build before handing over the link.
---

# /publish [game]

`$ARGUMENTS` **may name a game, may be empty, or may be something else.** Do not assume. **Look first, then ask** —
the same rule as `/make-game`.

This is the door for *"put it online now"*. The full pipeline already publishes at the end of a production build;
this exists for every other moment — a game finished earlier, a fix that needs to go live, a link someone is
waiting for.

## 0. Which game

1. **Look where you are.** A `package.json` plus a `src/` or `index.html` in the working directory means you are
   standing in the game — publish that, and say which one you picked.
2. **Otherwise check what they have built** — `games_list` (an `ongame` cloud tool), then `game_summary` to resolve one.
3. **Only then ask**, with the candidates as options. Never invent a game, and never publish a different one than
   the user meant because it was the only one you found.

**Only a game built through ongame can be published.** If the account has no build for it, publish is refused
(`no_such_build`) — that is the rule working, not a fault. Say plainly that this game was not built here, and
offer `/make-game` instead. Do not try to route around it.

## 1. Build it

`Bash`: `cd {gameDir} && npm run build` → produces `dist/`. **Fix until the build is clean** — a broken build is
not something to publish around.

If the project has no web build (a Unity or native project), stop here and say so: this command ships web builds;
that engine ships through its own toolchain.

## 2. Enumerate what will go live

`Bash`: `cd {gameDir}/dist && find . -type f` → strip the leading `./`.

Send each file as **`{path, size}`** — path is `dist`-relative, size in bytes (`find . -type f -printf '%s'` or
`stat`). **Do not send a content type**: it is derived from the file itself, and anything you assert about it is
ignored.

## 3. Publish

`publish_game({gameId: <slug>, files: [{path, size}, ...]})` (an `ongame` cloud tool).

**It can refuse, and the refusal is typed** — `{refused: true, reason, detail, path?}`. A refusal means *fix the
build*, never *retry the call*:

| `reason` | What it means | What to do |
|---|---|---|
| `no_such_build` | This account has no build of that game | It was not built here — offer `/make-game` |
| `disallowed_file_type` | `dist/` holds a file type a game cannot publish (named in `path`) | Remove it from the build and rebuild |
| `no_entry_point` | No `index.html` at the root of `dist/` | The build output is wrong — check the build config |
| `too_many_files` / `payload_too_large` | Over the per-publish limits | Trim the build (unused assets, source maps) |

Otherwise it returns `{uploads, publicUrl, signing}` — upload slots, no bytes moved yet.

Then `publish_upload({gameDir, uploads})` (a local `ongame` tool) → reads each built file and uploads it. **Pass each slot
through unchanged** — the slots carry headers that were signed for that exact file, so editing or dropping a field
makes the upload fail. Returns `{uploaded, skipped?, failed?}`.

## 4. Do not hand over a link you have not checked

**The publish is live only when `failed` and `skipped` are both empty.** If either has entries, this is a partial
publish: list what failed and say the game is **not** live. Give them `npm run dev` as the working fallback rather
than a URL that half-works.

**Then verify the live page is THIS build.** A cache can keep serving the previous bytes after a clean upload —
upload succeeds, page loads, old game, no error anywhere. Fetch `publicUrl` with a no-cache request and compare
the bytes against `dist/index.html`. Matching filenames are not proof: the build hashes content, so a changed
page can rebuild to identical bundle names.

A stale response is **not** live — treat it exactly like a failed publish.

## 5. Record it, then hand it over

Only after step 4 passed: `trace_emit(buildId: <buildId>, name: "publish.done", payload: {gameId: <slug>})`
(an `ongame` cloud tool), then give the user the URL plainly.

If you could not verify, say the publish is **unverified** and why. An unverified link presented as working is
worse than no link — the user shares it, and finds out from someone else.
