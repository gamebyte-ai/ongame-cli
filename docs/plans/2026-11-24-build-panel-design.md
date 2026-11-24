# Build panel in Claude Code — design (2026-11-24)

Board item i_0ok7s6fm. Can picked option 3 of the research on i_jvi4xuh0: a pane with the game's
current state and play link. On a narrow terminal it sits above the prompt. The maker can turn it off.

## What the panel shows, and where each fact comes from

The panel shows only what an ongame tool or file has said. It never guesses a step or a link.

| Line | Source | Rule |
| --- | --- | --- |
| Game name | `gameId` from `state_init`'s input, or `.ongame/active-build.json` | No game: no panel. |
| Build state | `state_init` / `state_advance` / `state_get` / `record_iteration` / `approve_phase` answers (`currentPhase`, `completed`, `done`, `plan.phases`); `trace_emit` `build.done` answered `{ ok: true }` | A marker older than 36 h counts as no build, as the status line does. A `build.done` whose payload names `outcome: failed` or `abandoned` shows "Build failed" or "Build abandoned", and marks no step done that ongame did not report complete. |
| Play check | `play_gate` (`blocked`, `awaiting_review`, `passed`, `skipped`, `unverified`) and `play_review` (`passed`) | Only a `play_gate` that names this build's `buildId` counts. Its `runId` and `gameDir` are kept; a `play_review` passes the check only when it names that run and that folder. A refused call changes nothing. |
| Play link | `preview_start` `{ ok: true, url }` (local, ends with the session); `publish_game` `publicUrl` held as pending until `trace_emit` `publish.done` answers `{ ok: true }` for this game | A link shows only with an `http:` or `https:` address and no control characters. A pending publish, or one of another game, shows no link. A `preview_start` refused with `no_npm_project`, `no_dist` or `superseded` leaves the link as it was; every other failure removes it. |
| Updated | the time of the last fact above | "Started 2 min ago" while the build's start is the last fact, else "Updated 2 min ago". |

There is no "next step" line. ongame does not save one, so the panel leaves it out.

## Which answers count

An answer moves the panel only when it says the thing happened, for this build or this game.

- `trace_emit` answers `{ ok }`. `ok: false` is an event ongame refused (`publish.done` with
  `reason: game_id_mismatch`) or a build it does not know. It changes nothing.
- An accepted `publish.done` names the game in its payload. It promotes the held publish of that game only.
- `play_review` names a folder and a run, never a build. The panel matches it on the `runId` and `gameDir`
  of the `play_gate` run it holds for this build.
- A call slower than 45 s answers `{ ok: false, reason: call_pending, callId }` first. That is "not known
  yet". Its own answer then comes through `call_wait`, and the panel reads it as the answer of that call.
  On aws-w2, 29 of 76 real `play_gate` runs went pending (2026-11-21 to 2026-11-23, i_4rirhc58).
- That answer is collected later than the call ran, so a newer call of the same kind wins. The kinds are
  build (the state tools and `build.done`), check (`play_gate`), review (`play_review`), preview
  (`preview_start`, `preview_stop`) and publish (`publish_game`, `publish.done`). The panel holds at most one
  waiting call per kind, with only the input fields it reads. Any newer call of that kind, whatever it
  answered, drops it. So `preview_start` pending, then `preview_stop`, then `call_wait` shows no link.
  A late answer passes the same checks as one given at once (this build, this run, this game).
  A late `state_init` names a build no check can hold it to, so it gets the marker's rule: it does not replace
  a build that started after it went pending. A new game drops a held `preview_start` or `publish_game`, as it
  drops their links.

## Parts

- `mods/build-panel/hooks/state.ts`: the state adapter. Pure functions, no engine import, so Node's
  test runner and the engine load the same file. `observe(state, call)` folds one finished ongame
  tool call into the state. `fromMarker(text, now)` reads the marker. `view(state, now)` turns the
  state into the lines the panel draws.
- `mods/build-panel/hooks/register.tsx`: the mod. It reads the marker at `session.start`, watches
  ongame tool calls with `tool.call`, keeps the state in `$.state`, and draws the `Pane`.
  `/ongame-panel` opens it; `/ongame-panel off` turns it off for every later session (`$.store`);
  `/ongame-panel on` turns it back on.
- Tests: `test/build-panel-state.test.mjs` (Node, runs in CI) for the adapter, and
  `mods/build-panel/hooks/panel.test.tsx` (`claude plugin test` from the repo root) for the panel.
- `types/index.d.ts`: the `$.state` values and the adapter's shapes. It sits at the plugin root; see Release.

## Placement

The panel opens by itself only while an ongame build is active and the maker has not turned it off.
Claude Code places a pane that opens by itself only from 144 terminal columns (110 once the maker
opened it), as a sidebar. Below that width the panel waits until the maker types `/ongame-panel`;
Claude Code then seats it inline above the prompt. A pane the maker closes is meant to stay closed for
the session: the panel sets a flag on that close and then does not open by itself. No test or real session
has closed the pane by hand yet, so this is a guess until one does.

## Try it and test it

- Adapter: `node --test test/build-panel-state.test.mjs` (also runs in the repo's CI).
- Panel: `claude plugin test` and `claude plugin validate .` from the repo root. These need the `claude`
  command, which CI does not install.
- In a real session without an ongame account: `mods/build-panel/dev/ongame-fixture.mjs` answers five ongame
  tools and `call_wait` with the CLI's answer shapes. Its header has the `claude --plugin-dir . --mcp-config ...`
  line. Its `play_review` takes `gameDir` and `runId`, as the CLI's does, and passes only the latest run.
  With `--pending play_gate` it answers `play_gate` as a slow call: `call_pending` first, the run through `call_wait`.

## Limits kept

- Claude Code is not modified. The mod uses only the documented mod API of Claude Code 2.1.331.
- The panel says "ongame". It uses no Claude or Anthropic name or logo.

## Release (board item i_q2xe7ru5)

Can chose to ship the panel to every maker with the ongame plugin's next update. The ongame plugin loads it:

- `hooks/hooks.json` names the module: `"modules": ["../mods/build-panel/hooks/register.tsx"]`, a path relative
  to that file. The settings hooks beside it are unchanged.
- The panel's `$.state` values belong to the plugin that loads them, so their owner is `ongame`.
- `types/index.d.ts` declares them. Claude Code reads that file at the plugin root by itself from v2.1.299.
  A `"types"` key in `plugin.json` is not used: Claude Code 2.1.50 then refused the whole plugin
  (`Unrecognized key: "types"`), and the docs say 2.0.15 to 2.1.75 reject any unknown manifest key.
- Measured on 2026-11-24 with real sessions and an unchanged-plugin control: 2.1.50, 2.1.100, 2.1.150,
  2.1.250 and 2.1.280 load the same MCP servers, skills, commands and hooks with this change, and no panel.
  2.1.286 and 2.1.331 load the panel.
