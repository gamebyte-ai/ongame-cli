---
name: credit
description: Put the "Built with onGame" credit into a web game — an animated card at launch and a small pill on the first screen. /publish runs it before every build; run it yourself for a store build or to move the pill.
---

The credit is one fenced block in the game's own `index.html` (card, pill, and the script that times them). It needs
no hook into the game's code, so it works the same for any engine.

`apply.mjs` sits next to this file:

```sh
node <this skill's dir>/apply.mjs <gameDir>                              # add it, or update an older one
node <this skill's dir>/apply.mjs --check <gameDir>/dist/index.html      # 0 = the built page carries it
```

- **Run it before `npm run build`.** It is idempotent: a second run reports `already current` and changes nothing.
- **After the build, `--check` the built page.** Exit 1 means the build dropped the block (a build step that rewrites
  `index.html`); fix the build, do not publish without the credit.
- **Look at the first screen once, on the built page** (`npx vite preview`): the dev server shows no credit. The pill sits at the bottom centre until the player's first tap. If it covers the
  game's own text or buttons there, re-run with `--badge top` (or `--badge off` when both edges are taken). The choice
  is stored in the block, so later runs keep it.
- **A game that draws its first screen late** (its own loader after the page load) shows a dark gap between the card
  and that screen. Apply with `--wait ready` and call `window.ongameCredit?.ready()` once the first screen is drawn;
  the card waits for it, never longer than 6 s.
- **Drop the pill when play starts.** Call `window.ongameCredit?.leave()` when the player moves past the first
  screen (the play button, the first level); the pill goes at once and does not come back. Hide it while the
  game's own loading bar is on screen for the same reason.
- **When neither edge is free, the game places the pill.** Set `#ogc-badge`'s `style.bottom` from the game's own
  `onResize` (above its bottom nav or button row) instead of editing the block. Check the pill on one line at
  360×640: it is `nowrap`, so a clipped caption means it sits too close to an edge.
- **Do not edit inside the `ongame:brand-credit` markers.** The next run replaces the block; change `apply.mjs` instead.
- **In a Capacitor app** the block hides the launch splash itself and starts the motion when the card is uncovered. Set
  the splash `backgroundColor` (and Android's `windowSplashScreenBackground`) to `#0e121b` so the launch reads as one
  dark frame. The game's own splash must stay at least 0.9 s after the card leaves, or it is never seen.

If `apply.mjs` exits 2, its message names the missing piece (no `index.html`, no `<body>`). A game with neither cannot be
published either; fix that first.
