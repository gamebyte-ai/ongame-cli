# Proof run — details and traps

The scripted player of `SKILL.md` §2, with the traps that each cost at least one wasted run.

## Serving the build

- **Build output, own folder.** `vite build` empties its outDir. When `dist/` may be someone's running preview or
  the folder a store wrapper copies from, build QA into `dist-qa/` and the store build into its own folder
  (the wrapper's web directory), so one build never wipes another.
- **Check the port before you serve.** Parallel sessions collide on preview ports (5173 and others were taken in
  practice). `lsof -iTCP:<port> -sTCP:LISTEN` first, start with `--strictPort`, then `curl` the page and confirm
  its `<title>` is your game before driving it.
- **Stop the preview by process group**, or the port stays taken by an orphan.
- **Give screenshot paths as absolute paths.** Browser tools may write relative paths under their own folder.
- **A shared emulator is someone else's.** `adb devices` can list another session's emulator; read its name
  (`adb -s <id> emu avd name`), start your own on a separate port with `-read-only`, and close only yours. Two
  software-rendered emulators side by side boot slowly (about a minute) and may show "System UI isn't responding"
  on cold boot; that is the host, not the app.
- **At most about four headless WebGL pages at once.** Nine at once ran at 1-5 fps and made timing checks useless.

## Driving the game

- **Seed state with `addInitScript`.** A navigation that changes only the `#hash` does not reload the page, so the
  seed never runs: go to `about:blank` first.
- **Real input only.** `page.mouse.click(x, y)` / `page.touchscreen.tap(x, y)` at the centre of the rectangle from
  `__game.hitAreas()`. A canvas that captures `pointerdown` swallowed every click on a DOM button above it; a
  synthetic `dispatchEvent` reached the button anyway and hid the bug.
- **Render before you click on a stepped clock.** With the clock paused and advanced by `step()`, a 2D renderer
  may not draw the HUD, and hit testing uses the last drawn transforms: a freshly opened card's button still has
  an identity transform and the tap lands on the backdrop. Give the test surface a `present()` (one draw, no time
  advance) and call it before every real click. Before reporting "this button does not work", retry once on the
  real loop (resume and wait). A screenshot helper must restore the previous pause state, not resume the game.
- **Wait out transitions.** A screen transition that runs on game time eats taps and darkens screenshots on a slow
  software renderer. Have the snapshot report `transitioning` and wait for it to clear before each tap and shot.
- **Wait for the launch card to leave** (`!document.getElementById('ogc-card')`) before the first tap.
- **Collect delayed rewards like a player.** Result cards that queue a chest or gift after a delay must be drained
  before the next run starts, or the next tap goes to the wrong card.

## When a real tap does nothing

After the real-loop retry above, find what swallowed the tap:
- **Pixi hit test:** `new EventBoundary(stage).hitTest(x, y)` at the target's centre must return the target. In
  Pixi v8 an `eventMode='static'` root makes every passive child a hit blocker: keep roots and layers `passive`.
- **DOM UI over the canvas** must mount outside the container that captures the pointer, or its `click` never fires.
- **Cards:** a closing card turns its whole root, scrim included, non-interactive at once; an opening card's
  buttons go live when the open tween ends, or the overshoot puts a neighbour under the finger.
- **Transitions** take input on purpose (a full-screen hit area) and the snapshot reports `transitioning`.

Probes:
- Tap pause five times, each right as a run starts: all five open the pause card.
- Close a card and tap another button 450 ms later: it opens. Tap a neighbour's spot while a card opens: nothing.
- Finish a run that queues a chest and try to start a run before collecting it: the start is refused.
- Count toasts in the snapshot: at least 1 right after a purchase, 0 once another card opens (a card that
  rebuilds itself, such as a shop after a purchase, keeps it).

## Every screen, fullest case

- With the unlock-all save, open every screen and popup; draw each reward slot with its largest content and give
  the icon group a `maxW` to shrink into.
- Text: shorten first, then a shrink-only fit (`fitText(label, maxW)`, maxW = the neighbouring button's left edge
  minus a gap) in the shared panel and title code, so every window gets it.
- At 360×640, look at the screenshot, not only hit-area overlap: drawn items that take no taps (path stones,
  decoration) are invisible to `play_gate`'s overlap check.

## What the run measures

- Console errors and `pageerror` events: 0 over the whole run.
- The game's own probes, when it has them: unbound events 0, idle jitter 0, sounds per second in the busiest moment,
  canvas size.
- For a level game, play every level to a terminal result on the real build and check the model and the view
  agree. A discriminating check that worked: the number of wins over all levels must fall inside the expected
  sum of per-level win chances plus or minus three standard deviations. A runtime that plays a different game
  from the model fails it; a correct one passes.
- A bot sweep on the real build caught a delayed win card dropping onto the next screen, which unit tests of the
  model could not see. Delayed UI callbacks need a guard (a scene turn counter) in the game code.
