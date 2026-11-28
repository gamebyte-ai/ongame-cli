---
name: phone-layout
description: When laying out a game's HUD and screens, and before calling a game done on phones — put HUD elements in layout components that reflow on resize, take the chrome from the library, and check pointer type, canvas geometry at DPR above 1, full-bleed cards, modal occlusion and the safe area, because a desktop window is not a phone.
---

These rules hold for every game with a HUD or more than one screen. `/make-game` reads them directly; the polish
phase points here.

## HUD layout

- Put HUD elements into **layout components**, do not give x/y by hand:
  `HorizontalLayoutComponent` (top bar: score on the left, moves/timer on the right),
  corner-anchor with `FullscreenLayoutComponent`. `HudLayer.Content` for the game, `HudLayer.Screen`
  for the menu, `HudLayer.Popup` for settings/game-over, `HudLayer.Overlay` for the toast.
- **Responsive:** every view overrides `onResize(width, height, dpr)`; layouts reflow.
  Overflow, cut-off text, text past its plate and boxes drawn over text are measured by `play_gate` (step 1e:
  `nothing_offscreen`, `layout_fits` at 360x640 and 390x844). `LabelComponent`
  for score; when the value changes, the pop tween in Sub-phase 5 fires.
- **Take the chrome from the library:** counters from `template:ui-currency-chip`, a tab bar from
  `template:shell-bottom-nav` with icons that move part by part (`skills/menu-icons/SKILL.md`), insets and DPR from `template:platform-viewport`. **Register every canvas-drawn
  control through `template:platform-ui-registry`** — without it the gate's touch-target check reports
  **unmeasured**. Call `knowledge_get({ key: "pattern:shell-contract" })` for the one-writer counter rule. If it returns empty, continue with your own judgment.

## Device-reality checks

**Device-reality checks — a 390×844 desktop session is NOT a phone.** Before calling the build done, check
pointer type, canvas geometry at dpr>1, full-bleed cards, modal occlusion and frozen animated subjects (touch-target
size and the safe area are `play_gate`'s `layout_fits`); where the tool cannot emulate a condition, report it **unverified**, never passed.
Call `knowledge_get({ key: "pattern:polish-device-reality-checks" })` for how to measure each one. If it
returns empty, continue with your own judgment.
