---
name: mobile-ready
description: Before calling a web game done or publishing it, and when the user says it stutters on a phone, sits under the notch, has no pause or keeps playing in the background — cap every canvas's pixel ratio, budget draw cost, handle late safe-area values, order the Android back key, and walk the first-impression list from launch to result.
---

- The `/make-game` phone check (`pattern:shell-contract` §14: pause halts the sim, background suspends audio, back
  key, pixel ratio per canvas, safe-area fallback) is the base. This skill adds only what it lacks.
- Layout is `skills/phone-layout/SKILL.md`. Proving it on the build (real taps, stepped clock, transitions, reward
  queues, lose driver, unlock-all save, fullest slot) is `skills/game-verify/SKILL.md` §2-§3.
- Emulator, `-gpu host` and ANR traces: `skills/store-build/references/build-and-smoke.md`.

`node <this skill's dir>/check.mjs <gameDir>` finds what source can show (exit 1 = a FAIL). A pass is not proof:
measure at runtime (`references/measure.md`). A 390×844 desktop window is not a phone.

## 1. Smooth: pixel ratio and draw cost
- **Cap every canvas's pixel ratio in the game, on every `onResize`:** touch 1.5, other 2 (a measured choice, not a
  platform rule). Phones report 3, four times the pixels of 1.5. In gamelabsjs 4.2.x (as of 2026-11) the host's
  resize pass hands the raw `devicePixelRatio` to the 3D renderer before calling `onResize`, so a cap set once is
  overwritten. Prove it by reading every `<canvas>` size in mobile emulation, not by desktop FPS.
- **A 2D game on the full gamelabs entry still draws an empty 3D world** at raw DPR each frame. Size that renderer to
  1×1 in `onResize`, or build on the 2D (core) entry.
- **Draw-cost budget:** shadow map ≤ 1024 updated every second frame, static parts merged, no `new` in the frame,
  procedural noise baked into a texture. Compare `renderer.info.render.calls` before and after.
- **3D needs a phone texture budget:** a 500 MB desktop set did not run; a phone set, DPR 1.25, no MSAA and a
  reload on `webglcontextlost` brought it to about 90 MB.
- **First-use stalls look like freezes.** three.js compiles a shader the first time an object is seen, and a light
  inside a hidden group recompiles every lit material when it appears. Warm up (`references/measure.md`).
- **A glyph missing from the game's font** (⌂ ✕ ★) makes each draw search the system fonts, about 250 ms per button.
  Use a character the font has, or draw the icon.

## 2. Safe area that arrives late
The native shell can write `--safe-area-inset-*` a frame or two after load with no size change. gamelabsjs 4.2.x
re-reads insets on resize, `visualViewport` resize and orientation change only, so a late value goes unread. Re-read
the insets every 0.5 s on the wall clock (not the game clock, which may be slow or paused) and relayout on change.
Test: `references/measure.md` §2.

## 3. Device life beyond §14
- **Pause** is a visible control in play (top corner) whose card holds sound, music, vibration and Replay/Home; a
  settings panel over running physics is not a pause. A turn-based puzzle with no timer needs no separate button.
  Store-only items on that card (Privacy/Terms, version): `skills/store-build/SKILL.md`.
- **Backgrounding** also listens to the shell's `appStateChange`, and stops timers: the run waits on the pause card.
- **Android back key**, in order: legal page, then the top card through its own close action, then a popup, then
  pause during play, then `false` on the home screen and on the pause card so the app goes to the background.
  A plain pop skips the card's side effect (a lost life, a chest reward); back closing pause traps pause ↔ play.
- Vibration uses the native haptics plugin: `navigator.vibrate` does nothing on iOS.

## 4. Finished at first sight
Screenshot each: launch and credit card → menu (logo, motion) → play and pause → special moments → **win and lose**
cards → back from background, paused.
- Remove locked tabs or buttons that open onto nothing: a reviewer reads them as an unfinished app. Locks that open
  real content stay.
- Compare proportions with a real game in the genre: thin the drawing, keep the rule's hit area; if collision
  changes, retune tempo and difficulty.
- In Pixi, draw curves at pixel scale (or K× larger, scaled by 1/K): small-unit curves look faceted.
