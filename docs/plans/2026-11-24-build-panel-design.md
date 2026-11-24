# Build panel in Claude Code — design (2026-11-24)

Board item i_0ok7s6fm. Can picked option 3 of the research on i_jvi4xuh0: a pane with the game's
current state and play link. On a narrow terminal it sits above the prompt. The maker can turn it off.

## What the panel shows, and where each fact comes from

The panel shows only what an ongame tool or file has said. It never guesses a step or a link.

| Line | Source | Rule |
| --- | --- | --- |
| Game name | `gameId` from `state_init`'s input, or `.ongame/active-build.json` | No game: no panel. |
| Build state | `state_init` / `state_advance` / `state_get` / `record_iteration` / `approve_phase` answers (`currentPhase`, `completed`, `done`, `plan.phases`); `trace_emit` `build.done` | A marker older than 36 h counts as no build, as the status line does. |
| Play check | `play_gate` (`blocked`, `awaiting_review`, `skipped`, `unverified`) and `play_review` (`passed`) | A refused call changes nothing. |
| Play link | `preview_start` `{ ok: true, url }` (local, ends with the session); `publish_game` `publicUrl` held as pending until `trace_emit` `publish.done` | A link shows only with an `http:` or `https:` address. A pending publish shows no link. |
| Updated | the time of the last fact above | Shown as "2 min ago". |

There is no "next step" line. ongame does not save one, so the panel leaves it out.

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
  `mods/build-panel/hooks/panel.test.tsx` (`claude plugin test mods/build-panel`) for the panel.

## Placement

The panel opens by itself only while an ongame build is active and the maker has not turned it off.
Claude Code places a pane that opens by itself only from 144 terminal columns (110 once the maker
opened it), as a sidebar. Below that width the panel waits until the maker types `/ongame-panel`;
Claude Code then seats it inline above the prompt. A pane the maker closes stays closed for the session.

## Try it and test it

- Adapter: `node --test test/build-panel-state.test.mjs` (also runs in the repo's CI).
- Panel: `claude plugin test mods/build-panel` and `claude plugin validate mods/build-panel`. These need the
  `claude` command, which CI does not install.
- In a real session without an ongame account: `mods/build-panel/dev/ongame-fixture.mjs` answers five ongame
  tools with the CLI's answer shapes. Its header has the `claude --plugin-dir ... --mcp-config ...` line.

## Limits kept

- Claude Code is not modified. The mod uses only the documented mod API of Claude Code 2.1.331.
- The panel says "ongame". It uses no Claude or Anthropic name or logo.
- Nothing reaches makers yet: the mod is its own plugin folder, and the marketplace does not list it.
  Releasing it is one change (a marketplace entry, or a `modules` line in the ongame plugin's
  `hooks/hooks.json`) and waits for Can's go.
