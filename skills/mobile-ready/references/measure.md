# mobile-ready — how to measure each rule

Run these on the **built** game (`npx vite preview`), not the dev server: the launch card and the shell code only
exist there. Use mobile emulation at 414×896 with device scale factor 3, `isMobile` and `hasTouch`. Where the browser
you drive cannot emulate one of these (a plain resized window has DPR 1 and a mouse), report that row **unverified**,
never passed. The snippets are for `browser_evaluate` (or `page.evaluate` in your own Playwright script).

Taps, the stepped clock, transitions and reward queues: `skills/game-verify/references/proof-run.md`.

## 1. Pixel ratio and draw cost
```js
[...document.querySelectorAll('canvas')].map(c => `${c.width}x${c.height} css ${c.clientWidth}x${c.clientHeight}`)
```
Every canvas, including an undrawn 3D one, must be at most 1.5× its CSS size on touch (414×896 → ≤ 621×1344).
Read it again after a resize: the host's resize pass resets the 3D renderer to the raw ratio (SKILL.md §1).
Draw cost: log `renderer.info.render.calls` and `renderer.info.memory` before and after a change, in the busiest scene.

Missing glyphs: compare a character's bounding box in the font file with that of a code point the font cannot
have (U+FFFF); equal boxes mean the glyph is missing. A slow card build that the profiler shows as "(program)"
points here: time each step of the build to find the button.

## three.js warm-up
Detect a first-use stall by logging `renderer.info.programs.length` next to the raw rAF frame time for frames over
50 ms; a program count that jumps on the stall frame is a shader compile.
Warm up during loading:
1. Make every hidden pooled object and effect visible.
2. `renderer.compile(scene, camera)` and `renderer.initTexture(t)` for every texture.
3. Render one real frame (the shadow pass is first-use too), then restore visibility.
Keep lights always visible, at intensity 0 when off, and outside hidden groups: a light that appears changes the
light count, and every lit material recompiles (one case: about 28 programs, 180–200 ms). Programs compiled in the
warm-up are freed once unused, so a light count that differs at runtime recompiles them again.

## 2. Safe area that arrives late
After the game has loaded, without resizing:
```js
const s = document.createElement('style');
s.textContent = ':root{--safe-area-inset-top:47px;--safe-area-inset-bottom:34px}';
document.head.appendChild(s);
```
Wait 1 s, then read the hit areas from the UI registry (`template:platform-ui-registry`): every control's top is at
least 47 and its bottom at most 896 − 34, on the menu and in play. Dispatching a synthetic `resize` instead hides the
bug: the real shell sends no resize. (gamelabsjs 4.2.x, as of 2026-11, watches the mount with a ResizeObserver,
not window `resize`.)

## 3. Device life
- **Pause holds:** open pause, read the game's sim clock or step counter, wait 1.2 s, read again: equal.
- **Backgrounding:**
  ```js
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
  ```
  Expect the pause card and the audio context `suspended`; flip `hidden` back and expect the card still up.
- **Android back:** press back (`adb shell input keyevent 4`) once per step of the SKILL.md §3 order and screenshot
  after each; the last press must leave the app (emulator and focus checks:
  `skills/store-build/references/build-and-smoke.md`). On the lose card, back must do what the card's own close
  does (a life is taken and the level restarts). A web build can map Escape to the same handler so the order is
  testable in a browser.
