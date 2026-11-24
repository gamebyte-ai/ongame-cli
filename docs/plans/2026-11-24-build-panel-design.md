# Build panel in Claude Code — design (2026-11-24)

Board item i_0ok7s6fm. Can picked option 3 of the research on i_jvi4xuh0: a pane with the game's
current state and play link. On a narrow terminal it sits above the prompt. The maker can turn it off.

## What the panel shows, and where each fact comes from

The panel shows only what an ongame tool or file has said. It never guesses a step or a link.

| Line | Source | Rule |
| --- | --- | --- |
| Game name | `gameId` from `state_init`'s input, or `.ongame/active-build.json` | No game: no panel. |
| Build state | `state_init` / `state_advance` / `state_get` / `record_iteration` / `approve_phase` answers (`currentPhase`, `completed`, `done`, `plan.phases`); `trace_emit` `build.done` | A marker older than 36 h counts as no build, as the status line does. |
| Play check | `play_gate` (`blocked`, `awaiting_review`, `passed`, `skipped`, `unverified`) and `play_review` (`passed`) | A refused call, or a check of another build, changes nothing. |
| Play link | `preview_start` `{ ok: true, url }` (local, ends with the session); `publish_game` `publicUrl` held as pending until `trace_emit` `publish.done` | A link shows only with an `http:` or `https:` address and no control characters. A pending publish, or one of another game, shows no link. |
| Updated | the time of the last fact above | "Started 2 min ago" while the build's start is the last fact, else "Updated 2 min ago". |

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
  `mods/build-panel/hooks/panel.test.tsx` (`claude plugin test` from the repo root) for the panel.
- `types/index.d.ts`: the `$.state` values and the adapter's shapes. It sits at the plugin root; see Release.

## Placement

The panel opens by itself only while an ongame build is active and the maker has not turned it off.
Claude Code places a pane that opens by itself only from 144 terminal columns (110 once the maker
opened it), as a sidebar. Below that width the panel waits until the maker types `/ongame-panel`;
Claude Code then seats it inline above the prompt. A pane the maker closes stays closed for the session.

## Try it and test it

- Adapter: `node --test test/build-panel-state.test.mjs` (also runs in the repo's CI).
- Panel: `claude plugin test` and `claude plugin validate .` from the repo root. These need the `claude`
  command, which CI does not install.
- In a real session without an ongame account: `mods/build-panel/dev/ongame-fixture.mjs` answers five ongame
  tools with the CLI's answer shapes. Its header has the `claude --plugin-dir . --mcp-config ...` line.

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
