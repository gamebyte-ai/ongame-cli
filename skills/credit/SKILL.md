---
name: credit
description: Put the onGame launch card into a web game — the onGame logo alone on a dark screen for a moment at launch, then the game. Nothing of onGame stays on the game's screens. /publish runs it before every build; run it yourself for a store build.
---

The credit is one fenced block in the game's own `index.html`: a dark card (`#0e121b`) with the onGame logo, no
caption and no motion, and the script that times it. Once the card has faded the game carries no onGame text, badge
or logo anywhere. It needs no hook into the game's code, so it works the same for any engine.

`apply.mjs` sits next to this file:

```sh
node <this skill's dir>/apply.mjs <gameDir>                              # add it, or update an older one
node <this skill's dir>/apply.mjs --check <gameDir>/dist/index.html      # 0 = the built page carries it
```

- **Run it before `npm run build`.** It is idempotent: a second run reports `already current` and changes nothing.
  An older block (v1/v2, with the "Built with" caption and the first-screen pill) is replaced in place.
- **After the build, `--check` the built page.** Exit 1 means the build dropped the block (a build step that rewrites
  `index.html`); fix the build, do not publish without the credit.
- **Timing.** The card holds the logo for 1.2 s after the page has loaded, then fades in 0.35 s; a tap after load
  skips it. It goes at 6 s at the latest. The dev server shows no card, so look at it once on the built page
  (`npx vite preview`).
- **A game that draws its first screen late** (its own loader after the page load) shows a dark gap between the card
  and that screen. Apply with `--wait ready` and call `window.ongameCredit?.ready()` once the first screen is drawn
  (two `requestAnimationFrame`s after it is built). The card then waits for it and says LOADING past 6 s instead of
  lifting onto an empty stage. The choice is stored in the block, so later runs keep it.
- **The game's own title screen must be seen.** With no "tap to start" on it, keep it at least 0.9 s after the card
  has gone (`!document.getElementById('ogc-card')`).
- **`--badge` and `window.ongameCredit?.leave()` are left over from the pill.** Both are accepted so older games keep
  building and running; neither does anything. Do not add them to new games.
- **Do not edit inside the `ongame:brand-credit` markers.** The next run replaces the block; change `apply.mjs` instead.
- **In a Capacitor app** the block hides the launch splash itself and starts its clock when the card is uncovered. Set
  the splash `backgroundColor` (and Android's `windowSplashScreenBackground`) to `#0e121b`, and use a splash image with
  the logo alone, so launch → card → game reads as one dark frame.

If `apply.mjs` exits 2, its message names the missing piece (no `index.html`, no `<body>`). A game with neither cannot be
published either; fix that first.
