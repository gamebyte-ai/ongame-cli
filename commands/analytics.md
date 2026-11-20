---
name: analytics
description: Add onGame analytics to a game you already built - screens, taps, level attempts, currency - with its privacy page. Safe to run again.
---

# /analytics add [game]

Upgrades an existing web game to analytics shim v2, keeps every call the game already makes, writes its privacy
page and wires telemetry into `index.html`. A second run changes nothing. The calls and the audience rules are in
`skills/analytics/SKILL.md`.

## 0. Which game

The same as `/publish` step 0: a `package.json` plus `src/` in the working directory is the game. Otherwise
`games_list`, then ask with `ask_user`. A Unity or native project: stop and say this command adds web analytics.

## 1. Get shim v2

`scaffold_materialize({gameDir: <a new empty temp folder>, gameName: "Probe"})`. Its `src/telemetry.ts` is shim v2.
Keep its path; delete the temp folder after step 2.

## 2. Upgrade

`Bash`: `node <pluginRoot>/skills/analytics/upgrade.mjs {gameDir} --shim <temp>/src/telemetry.ts`

- Exit 3 → ask the maker once, with `ask_user`: **"Is this game aimed at children?"**, options **No, general
  audience** and **Yes, aimed at children**. Run again with `--audience general` or `--audience children`.
- Exit 4 → the CLI is older than shim v2. Say so, ask the maker to update the onGame CLI, and stop.
- Exit 2 → change each named call to its v2 form, then run again.
- Exit 0 → go on. Read `audience` from its JSON line.

## 3. Wire telemetry

- `audience: "general"` → `telemetry_provision({gameId: <slug>, gameTitle: <visible title>, appVersion: <package.json
  version>})`, then `telemetry_inject({gameDir, indexFile: "index.html", snippet})`, with the same rules as
  `/publish` step 1. The same snippet again is a no-op.
- `audience: "children"` → do not provision or inject. Remove any script that sets `__ONGAME_TELEMETRY__` and the
  telemetry `sdk.js` tag from `index.html`.

## 4. New calls (general audience only)

Check first; add only what is missing, so a second run adds nothing:
- `grep -rn "screen(" {gameDir}/src` → add `screen('<id>')` where each screen is shown, if absent.
- Interactive Pixi objects with no `label` → give each a short, stable `label`.
- `trackLevelStart` / `trackLevelComplete` / `trackLevelFail` keep working. Move them to `levelStart` / `levelEnd`
  only when you touch that code anyway; also send `levelEnd(a, 'quit')` when the player leaves a level to the menu.
- Settings has no analytics switch → add **Analytics** on/off calling `setConsent(on)`.

## 5. Prove it

`Bash`: `cd {gameDir} && npx tsc --noEmit` must stay clean. Run `node <pluginRoot>/skills/analytics/upgrade.mjs {gameDir}`
once more: it adds the opt-out line to the privacy page once the switch exists. Then
`node <pluginRoot>/skills/analytics/upgrade.mjs --check {gameDir}` must exit 0.
Tell the maker what changed: the shim version, the privacy page at `/privacy.html` after the next `/publish`, and
the store answers in `skills/analytics/store-labels.md` if the game ships to the stores.
