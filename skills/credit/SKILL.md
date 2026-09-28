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
- **Look at the first screen once.** The pill sits at the bottom centre until the player's first tap. If it covers the
  game's own text or buttons there, re-run with `--badge top` (or `--badge off` when both edges are taken). The choice
  is stored in the block, so later runs keep it.
- **A game that draws its first screen late** (its own loader after the page load) shows a dark gap between the card
  and that screen. Apply with `--wait ready` and call `window.ongameCredit?.ready()` once the first screen is drawn;
  the card waits for it, never longer than 6 s.
- **Do not edit inside the `ongame:brand-credit` markers.** The next run replaces the block; change `apply.mjs` instead.
- **In a Capacitor app** the block hides the launch splash itself and starts the motion when the card is uncovered. Set
  the splash `backgroundColor` (and Android's `windowSplashScreenBackground`) to `#0e121b` so the launch reads as one
  dark frame.

If `apply.mjs` exits 2, its message names the missing piece (no `index.html`, no `<body>`). A game with neither cannot be
published either; fix that first.
