---
name: analytics
description: Put onGame analytics (shim v2) into a web game, keep its privacy page and store labels matching what it sends, and record once whether the game is aimed at children. Used by /analytics, the code and polish phases, and /publish.
---

# Analytics: shim v2, privacy page, audience

A web game reports play through `src/telemetry.ts` (the shim). Version 2 adds screens, taps, level attempts,
currency and tutorial steps. The published page's `sdk.js` does the sending; the shim does nothing until then.

## The shim v2 calls

| call | when |
|---|---|
| `screen(id)` | a screen became visible: `'menu'`, `'level'`, `'shop'`, `'settings'`, `'gameover'` |
| `tap(id)` | a control the SDK cannot see was used: a DOM button, a key, a swipe |
| `const a = levelStart(n)` | a level begins play, after any intro. `n` is a number. Keep `a`. |
| `levelEnd(a, 'complete' \| 'fail' \| 'quit', meta?)` | the attempt `a` ended: won, lost, or left to the menu |
| `economy('earn' \| 'spend', currency, amount, source)` | in-game currency changed |
| `tutorial(stepId, done?)` | a tutorial step was shown (`done` once finished) |
| `track(name, meta?)` | a game-specific event: at most 8 keys, numbers, yes/no or short codes |
| `setConsent(on)` | the player's analytics switch in settings |

`trackLevelStart`, `trackLevelComplete` and `trackLevelFail` still work in v2.

**Taps come by themselves.** The SDK reports a tap on every Pixi display object with `eventMode` `'static'` or
`'dynamic'` and a `label`. So give every interactive object a short, stable `label` (`'play'`, `'shop_buy_coins'`,
`'tile'`). An object with no label is reported as `"unlabelled"`.

**Never pass** typed text, a player name, an email, a URL or a position as meta.

## upgrade.mjs

`node <pluginRoot>/skills/analytics/upgrade.mjs <gameDir> [--shim <file>] [--audience general|children] [--title <t>]`

- Exit 3: the audience is not recorded. Ask the maker once, with `ask_user`: **"Is this game aimed at children?"**
  with the options **No, general audience** and **Yes, aimed at children**. Run again with `--audience`.
  The answer is kept in `.ongame/analytics.json`; never ask again for that game.
- Exit 4: the shim is not v2. The audience and privacy page are saved anyway and the JSON line is printed; the shim
  is left as it was. Update the onGame CLI, then take `src/telemetry.ts` from a fresh scaffold.
- Exit 2: a file imports a name the v2 shim does not export. The output names the file and the name. Change that
  call to its v2 form, then run again.
- Exit 0 (and exit 4): the last line is JSON, `{audience, consentDefault, shim, privacy, changed}`. `changed: false` means the
  game already had all of it.

`--check <gameDir>` exits 0 only when the audience is recorded, the shim is v2, `public/privacy.html` is current, and a
children's game has no telemetry left in `index.html`. For a children's game the script removes the block
`telemetry_inject` wrote; it names any other telemetry script for you to remove.

## Audience and consent

| audience | consentDefault | telemetry |
|---|---|---|
| `general` | `on` | inject the `sdk.js` tag. Analytics is on until the player turns it off in settings. |
| `children` | `off` | inject nothing. Remove any `__ONGAME_TELEMETRY__` config and `sdk.js` tag. No id is ever made. |

A `general` game's settings screen gets an **Analytics** on/off switch that calls `setConsent(on)`. The privacy page
promises the switch only once the game's code calls `setConsent`, so run `upgrade.mjs` again after adding it.

## Privacy page and store labels

`public/privacy.html` lists exactly the events in `events.json`; the build serves it at `/privacy.html`.
Store answers: `store-labels.md`. When the event list changes, change `events.json`; the page follows on the next run.
