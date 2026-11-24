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

`node <pluginRoot>/skills/analytics/upgrade.mjs <gameDir> [--shim <file>] [--audience general|children] [--title <t>] [--opt-out yes|no]`

- Exit 3: the audience is not recorded. Ask the maker once, with `ask_user`: **"Is this game aimed at children?"**
  with the options **No, general audience** and **Yes, aimed at children**. Run again with `--audience`.
  The answer is kept in `.ongame/analytics.json`; never ask again for that game.
- Exit 4: the shim is not v2. The audience and privacy page are saved anyway and the JSON line is printed; the shim
  is left as it was. Update the onGame CLI, then take `src/telemetry.ts` from a fresh scaffold.
- Exit 2: a file imports a name the v2 shim does not export. The output names the file and the name. Change that
  call to its v2 form, then run again.
- Exit 5: a children's game still holds a telemetry script the script did not write. Remove every script that
  sets `__ONGAME_TELEMETRY__` and the `sdk.js` tag, then run again. Never finish or publish on exit 5.
- Exit 0 (and exit 4): the last line is JSON, `{audience, consentDefault, shim, privacy, changed}`. `changed: false` means the
  game already had all of it.

`--check <gameDir>` exits 0 only when the audience is recorded, the shim is v2, `public/privacy.html` is current, and a
children's game has no telemetry left in `index.html`. A game with the Analytics switch must also apply its saved
answer at boot (see "Audience and consent"); the upgrade run names what is missing in a `note:` line. For a children's game the script removes the block
`telemetry_inject` wrote; it names any other telemetry script for you to remove.

## Audience and consent

| audience | consentDefault | telemetry |
|---|---|---|
| `general` | `on` | inject the `sdk.js` tag. Analytics is on until the player turns it off in settings. |
| `children` | `off` | inject nothing. Remove any `__ONGAME_TELEMETRY__` config and `sdk.js` tag. No id is ever made. |

A `general` game's settings screen gets an **Analytics** on/off switch that calls `setConsent(on)`. The privacy page
promises the switch only when you say the player has one: after adding it, run `upgrade.mjs` again with `--opt-out yes`.
A `setConsent` call alone is no switch (a game may call `setConsent(true)` at start). Without a switch, pass
`--opt-out no`. The answer is kept in `.ongame/analytics.json`, and `--check` reads the page against it.

**Apply a saved off at boot.** The deployed SDK starts after the game's own code. While it starts, it sends what an
earlier visit left queued. So a game with the switch reads its saved answer in `src/main.ts`, before the first
`await` of its boot. When that answer is off, it calls `setConsent(false)` there: `if (saved === 'off') setConsent(false);`.
With nothing saved, make no call: analytics stays on. The template marks the place: before `await app.initialize()`.
Called there, the no holds until the SDK starts, and the SDK then sends nothing. After an `await`, even a 0 ms timer,
it can come too late. A `setConsent(true)` there only withdraws an earlier no; it is not the player's yes.

**Never write the SDK's own storage keys**, `ongame_consent:*` and `ongame_spool:*`. Keep the switch's answer under
the game's own key. Give it to the SDK only through `setConsent`.

**`--check` enforces it** for a game with the switch. It fails when:
- `src/main.ts` calls no `setConsent` with an answer before its first `await`. A call made only inside an imported
  function, a method or a constructor does not count: make it in `src/main.ts` itself.
- a game file that `src/main.ts` imports has a top-level `await`. The boot then runs only after it.
- `src/telemetry.ts` drops a `setConsent(false)` made before the SDK starts. An older shim does: its exported names are
  the same, so the v2 name check cannot see it. Update the onGame CLI to the release after `cli-v0.2.50`, then take
  the shim from a fresh scaffold (`/analytics add` steps 1-2). An upgrade never swaps a shim that keeps that early no
  for one that drops it.

The upgrade run prints the same lines as `note:` lines. Never pass `--opt-out no` to get past them while the game has
the switch.

## Privacy page and store labels

`public/privacy.html` lists exactly the events in `events.json`; the build serves it at `/privacy.html`.
Store answers: `store-labels.md`. When the event list changes, change `events.json`; the page follows on the next run.
