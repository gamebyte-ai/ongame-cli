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

**First, wire player telemetry** — into the SOURCE `index.html`, because the build copies it into `dist/`.
Without this step the published game reports nothing about how people play it.

1. `telemetry_provision({gameId: <slug>, appVersion: <version from package.json>})` (an `ongame` cloud tool) → `{snippet}`
   or `null`. Use the same `<slug>` you will publish under.
2. Got a snippet → `telemetry_inject({gameDir, snippet})` (a local `ongame` tool). Safe on a game that already has telemetry:
   the same snippet is a no-op, and a new version replaces the old block.
3. `injected: false` with a `reason` → the page still holds an older telemetry config, maybe another maker's key.
   Fix or delete the script the `note` names, then call `telemetry_inject` again. If it still refuses, delete every
   script that sets `__ONGAME_TELEMETRY__` and the telemetry `sdk.js` tag, then publish without telemetry. Never
   publish a page that still holds the old config: its players would report to that config's owner.
4. `null`, or `injected: false` with no `reason` → publish anyway, and say in the hand-over that this build
   does not report player data. Telemetry never blocks a publish.

Every published game carries the "Built with onGame" credit. Next
`Bash`: `node <pluginRoot>/skills/credit/apply.mjs {gameDir}` — it adds or updates the credit in `index.html`;
`skills/credit/SKILL.md` covers moving it off the game's own UI.

Then `Bash`: `cd {gameDir} && npm run build` → produces `dist/`. **Fix until the build is clean** — a broken build is
not something to publish around. Finish with
`node <pluginRoot>/skills/credit/apply.mjs --check {gameDir}/dist/index.html`: a non-zero exit means the
build lost the credit, which is a build to fix, not one to publish.

If the project has no web build (a Unity or native project), stop here and say so: this command ships web builds;
that engine ships through its own toolchain.

## 2. Check before you publish

Every refusal `publish_game` gives can be found here first. Fix all of it before step 3.

**A build behind the game.** `game_summary({gameId: <slug>})` (an `ongame` cloud tool). `reason: "unknown_game"` means this
account has no build of that slug, and `publish_game` would refuse it (`no_such_build`). Check the slug first: it must be
the `gameId` the build started with. If none of their games has it, the game was not built here: say so and offer
`/make-game`.

**The files.** `Bash`: `node <pluginRoot>/skills/phases/polish/precheck.mjs {gameDir}` → `{ok, files, problems}`.
- Exit 0: pass `files` to `publish_game` exactly as printed. It holds every file under `dist/` as `{path, size}`.
- Exit 1: fix every entry in `problems`, rebuild, and run it again. Each `reason` is the one `publish_game` would
  refuse with, and the table in step 3 says how to fix it. `publish_game` names only the first bad file; this names
  them all.
- Exit 2: there is no `dist/`. Build first.

**Do not send a content type**: it is derived from the file itself, and anything you assert about it is ignored.

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
| `missing_size` | A file was sent without its size (named in `path`) | Send every file as `{path, size}`, size in bytes |

Otherwise it returns `{uploads, publicUrl, signing}` — upload slots, no bytes moved yet.

It also returns `source` — where this publish keeps the game's source, privately, for your team.

Then `publish_upload({gameDir, uploads, source})` (a local `ongame` tool) → reads each built file and uploads it, then
keeps the source. **Pass each slot through unchanged** — the slots carry headers that were signed for that exact file,
so editing or dropping a field makes the upload fail. Returns `{uploaded, skipped?, failed?, source, repo}`; `repo` is
the game folder's repository URL, or `none` when it has none.

`source` is separate from the game: `.env` files, keys, `node_modules`, `dist` and `.ongame` are never in it, and its
`.gitignore` is honoured. `status: "uploaded"` → keep `source.key` for step 5. `status: "not_kept"` → this account
keeps no source; that is a setting, not a problem, so say nothing about it. `status: "failed"` → the game can still be
live, but its source was not kept: say that in the hand-over, with the `reason`. Never drop it because the game
worked.

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

Only after step 4 passed: `trace_emit(buildId: <buildId>, name: "publish.done", payload: {gameId: <slug>, source:
<source.key>, repo: <repo>})` (an `ongame` cloud tool) — leave `source` out when it did not upload; always pass `repo`
exactly as publish_upload returned it — then give the user the URL plainly.

If you could not verify, say the publish is **unverified** and why. An unverified link presented as working is
worse than no link — the user shares it, and finds out from someone else.
