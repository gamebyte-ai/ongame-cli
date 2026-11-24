---
name: game-code
description: Before writing or changing a game's code — load the genre's knowledge, keep one state machine with input locked during animation and a clean restart, track level start, complete and fail, wire ads and real-money items the safe way, add lives or a shop only when the design chose them, and hold 60 fps on phones with no allocation in the frame loop.
---

These rules hold for every game's code, a new game and a change to a finished one alike. `/make-game` reads them
directly; the code phase points here.

## Load the genre's knowledge

2. **Call `mcp__ongame__knowledge_list()`** → get the canonical list of available keys.
   **Never pass a key that is NOT in this list to `knowledge_get`** (nonexistent key → 404).
3. Always fetch `knowledge_get(key="framework")`.
4. Match the type of the design against the `genre:*` keys in the list. **If there is an exact match**, fetch
   that `genre:<x>`.
5. **Genre miss (e.g. design is "snake" but `genre:snake` is not in the list):** do NOT CALL a nonexistent genre
   key. Instead, fall back to `framework` + the appropriate `pattern:*`s in the list
   (app-setup + game-loop + input + whatever else the design requires), and in the output document
   **note** "no genre knowledge existed, composed from framework + patterns".

## State machine — clean, single transition path
- `type GameState = 'menu' | 'play' | 'gameover'` + a small state machine. Transitions happen **only**
  through `transition(to)`; do not set `current` by hand.
- `transition` is idempotent + listened to from a single point (`onChange`). Side effects on transition (startGame /
  showGameOver) live in the listener.
- **Gameover → restart wait period:** so an accidental tap does not start a new game (timing: `pattern:game-loop`).
- **If the game has levels, mark each attempt WHILE you write it** — `const attempt = levelStart(n)` where the level
  actually begins for the player (after any intro/countdown, not at load), then `levelEnd(attempt, 'complete', {...})`
  on a genuine WIN only, `levelEnd(attempt, 'fail', {...})` on a loss, and `levelEnd(attempt, 'quit')` when the player
  leaves the level for the menu. They come from `src/telemetry.ts` (shim v2) in the scaffold, they are no-ops until the finished game is
  deployed, and they cannot throw into gameplay. `n` must be a NUMBER — a named level passes its index and carries
  the name in `level_id`, because a non-numeric level is dropped downstream with nothing reported. Counting a fail
  or a quit as a completion is worse than not measuring: the funnel is starts-vs-completes, so it would hide the
  exact difficulty spike it exists to find. Write them next to the transitions they belong to — retrofitted
  later they are a separate pass over code that already works, and that pass is the one that does not happen.
- **Screens and taps, in the same pass** — call `screen('<id>')` where each screen is shown (`'menu'`, `'level'`,
  `'shop'`, `'settings'`, `'gameover'`). Give every interactive Pixi object a short, stable `label`
  (`'play'`, `'shop_buy_coins'`, `'tile'`): the SDK reports its taps by that label, with no `tap()` call. Call `tap(id)`
  only for a DOM button, a key or a swipe. Currency changes call `economy('earn' | 'spend', currency, amount, source)`;
  tutorial steps call `tutorial(stepId, done)`. Settings gets an **Analytics** on/off switch calling `setConsent(on)`;
  `src/main.ts` applies its saved answer before the first `await`.
  Never pass typed text, a name or a position as meta. The full list: `skills/analytics/SKILL.md`.
  **An older scaffold has shim v1:** `src/telemetry.ts` exports no `levelStart`. Then use `trackLevelStart(n)`,
  `trackLevelComplete(n)` and `trackLevelFail(n)`, still add the labels, and skip the other v2 calls.

- **Check the existing helpers before adding imports.** These instructions can arrive before a CLI update or apply to an older game.
  Never import a helper that its `src/ads.ts` or `src/purchases.ts` does not export. If `watchRewardedReady` is absent
  but `rewardedReady` exists, check readiness immediately and every 250 ms while the screen is open.
  Update button visibility only; clear the timer on close or destruction and restart it on reopening.
  If the ads or purchases helpers are missing, update the CLI for new scaffolds; never re-scaffold an existing game.
  Report the missing helpers before wiring those features.
- **Ads, if the concept has them, go in the same pass:** `showInterstitial('level_end')` from the "Next" tap and,
  for a reward, `showRewarded(placement)` from a "Watch an ad" button. On screen open, call
  `const stop = watchRewardedReady(ready => { watchButton.visible = ready; })`; call `stop()` on close or destruction.
  A single `rewardedReady()` check misses offers that arrive later. The watcher only updates visibility; the player
  must still tap to show the ad. These helpers come from `src/ads.ts`. Ad calls do nothing until the game has an ad id,
  and must be awaited with the game paused; grant a reward
  only on `true`. The settings screen gets a "Privacy choices" button, shown only while `privacyOptionsRequired()`,
  that calls `showPrivacyOptions()`.
- **Real-money items, if the concept sells any, come from `src/purchases.ts`:** the shop shows them only while
  `purchasesReady()`, with the `title` and `price` that `products()` returns (never a price typed into the game).
  `buy(id)` runs from the item's tap, with the game paused; grant a consumable only on `'bought'` (on `'pending'`
  tell the player the store finishes it later, and grant nothing). At start-up register `onPurchaseCompleted(id =>
  …)` and grant there too: it is called once for each pending purchase that went through later. An unlock such as
  "no ads" is `owns('<entitlement>')`, asked each time, never a saved flag. Settings gets "Restore purchases"
  (`restorePurchases()`). Without a RevenueCat key the shop shows no real-money items, and the game must still work.

- **Lives and a shop:** take `template:shell-lives` / `template:shell-shop` only when the design has actually decided to have that economy.

## 60fps mobile-first performance (NO alloc on the hot path)
- Target **60 fps mobile**. In every-frame `mainLoop`/`update`, do NOT `new` up new objects, create
  array/object literals, or do closure alloc → GC pauses = jank. Reuse scratch
  variables for vector/range computations.
- **Object pool:** keep a pool for frequently spawned/dying entities (bullets, particles, falling tiles) —
  `acquire()`/`release()`, don't dispose on death, hide + return to the pool. Aim for
  zero allocation within a frame.
- Create Pixi objects once, reuse them via `visible`/transform; do not rebuild the scene
  tree every frame with addChild/removeChild.

## Input lock (during cascade / animation)
- **Goal:** input arriving while the game is resolving or animating is rejected, from every input source.

## Restart cleanup (no dangling state/listener/timer remains)
- **Goal:** one restart path, and nothing from the previous run (timer, listener, tween, pooled entity) survives it.
- Call `knowledge_get({ key: 'pattern:code-state-hygiene' })` for the input lock and the restart cleanup. If it
  returns empty, continue with your own judgment.

