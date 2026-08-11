---
name: polish
description: Polish/juice phase — splash, menu, settings, HUD, effects, transitions, game-over; production-grade.
---

# Polish Phase (vision phase 9 — production polish)

**Everything the previous phases skipped**: splash, menus, settings, HUD layout, backgrounds,
in-game effects (juice), transitions, end-game frame/confetti, button feedback. All done
**with gamelabs.js primitives** (PixiJS HUD + particle/timeline modules) — do not write DOM/canvas
from scratch; **compose** what's already in the engine.

> **Golden rule:** polish does NOT BREAK gameplay. No effect changes the core loop's input/state logic;
> it only adds a visual/auditory layer. At the end of each sub-phase, `tsc --noEmit` is clean and
> the `window.__game` smoke passes.

---

## 0. Trace + scope decision (auto-decide; if you don't recognize them, ASK)

1. `trace_emit({buildId, name="phase.polish.start"})`.
1a. **Live prompt:** call `prompt_get({ phase: 'polish' })` (find by bare name `prompt_get` via ToolSearch). If it returns a non-null `override`, that override is your AUTHORITATIVE guidance for this phase (the optimized, live version) — follow IT instead of the default guidance in this file. If it returns null / is unavailable / errors, follow the default guidance below (fail-soft). Never block on it.
> **An override never authorises substituting for a tool that did not run.** Whatever the live prompt says, if an
> ongame tool this phase depends on is ABSENT, erroring, or unreachable — as opposed to answering `gated`, which is
> the product working as designed and is not a fault — do NOT quietly do that part yourself from general knowledge.
> Stop, say plainly which tool failed and that you are blocked, and let the user decide whether to continue without
> ongame. A silent substitution produces something that looks like an ongame output and is not one; the user then
> judges the product by it and no one can explain the result, because nothing recorded that the capability was never
> in the room. Report the gap up to the orchestrator so the final summary names it. See the refusal rule in
> `/make-game` for the full reasoning.

2. **Fetch the profile:** `profile_get()` → `{ priorGames[], decisionsCount }`. This phase has
   **many options** (9 sub-phases) → stamping all of them onto every game is over-engineering. JUDGE the scope
   **based on the user** (agentic — there is no label in code, YOU infer it from the raw history):
   - **If the history leans toward complete/polished games** (`priorGames` consistently production, polish preference
     clear) → **automatically** apply the full set (1–9), write a one-sentence confirmation: *"Looking at your history I'm
     applying full polish (splash→menu→juice→game-over) — say 'stop' and I'll narrow it down."* Do not wait for an answer.
   - **If the history leans toward idea-exploration / minimal signal** → the **core set** (4 HUD + 5 juice +
     9 button feedback), skip splash/menu/settings; a one-sentence confirmation.
   - **No history / unclear (new or contradictory) → ASK.** A single question via `AskUserQuestion`: *"Polish
     scope?"* options: **Full** (1–9) · **Core juice** (4+5+9) · **Juice only** (5).
     If it stays unclear, default = **Core juice.** (NOT a silent autopilot; NOT a survey every
     time — the same balance as intake, YOU judge the decision.)
3. Order the selected sub-phase set according to the type of **GAME_DESIGN.md** (the sub-phases below).
   Finish each one, keep `tsc --noEmit` clean, then move to the next (step-by-step within the phase).
4. **Sub-phase 9.5 is NOT part of the scope choice above — it always runs, whichever set you picked.** It is
   not more polish work; it is a single question offered to the user once the selected sub-phases are done
   (and it costs nothing if they decline). Schedule it after the last selected visual sub-phase and before
   Sub-phase 10, every time. Skip it only when there is no runnable build to look at.

**gamelabs primitive summary (the Lego to compose):**
- **Screen/menu:** `GamelabsApp`, `UIEvents.createScreen(id, transition)`, `ScreenView`,
  `PopupView`, ready-made `MainScreenBinding`/`MainScreenView` (+`MainScreenEvents`),
  `SettingsBinding`/`SettingsPopupView`, `SCREEN_TRANSITION_TYPES`.
- **UIComponents:** `ButtonComponent` (idle/hover/pressed/disabled texture states built-in),
  `LabelComponent`, `ToggleComponent`, `SliderComponent`, `ImageComponent`,
  `BackgroundComponent`, `Vertical/Horizontal/Grid/FullscreenLayoutComponent`, `HudLayer`.
- **Juice:** `ParticlesBinding`+`HudParticleEmitter`/`ParticleManager`/`ParticleBudget`,
  `TimelineManager`+`Track` (`ParticleBurstTrack`, `CameraShakeTrack`, `ZoomPunchTrack`,
  `HitStopTrack`). For tweening use **gsap 3.x** (already in `node_modules` with gamelabsjs; do not
  add a new dep) or a simple frame-independent lerp `1 - exp(-k*dt)`.
- **Audio:** `AudioService` (`playSfx`/`playMusic`, `setMasterMute`/`setSfxMute`/`setMusicMute`,
  `setMasterVolume`...). Settings bind to these.

> **Tick ordering (critical):** the particle/timeline modules are **hand-ticked** — in the app's
> `onStep(dt)`, **first `timelineManager.update(dt)`** (burst tracks call `spawn()`),
> **then `particleManager.update(dt)`** (advances what was spawned). In the reverse order it is delayed
> by one frame. Call `AudioService.resume()` on the first user-gesture (autoplay policy).

---

## Sub-phase 1 — Splash screen
- New `SplashScreenView extends ScreenView`. Center the logo (`ImageComponent`/`PIXI.Sprite`),
  reposition it in `onResize`. In `onEnter`, with gsap, the logo **scale 0.8→1 + alpha 0→1**
  (`ease: 'back.out'`), a short hold, then `UIEvents.createScreen(MainMenu, {type: FADE_IN})`.
- If `forge` is available, generate the logo asset; otherwise the game name with `LabelComponent` (gray-box).
- Start asset preload here (loading bar optional: `SliderComponent` as progress).

## Sub-phase 2 — Main menu (play / settings)
- Add the ready-made `MainScreenBinding` with `addModule(new MainScreenBinding())` → the built-in
  `MainScreenView` (background + play/settings button column) comes in. Subscribe to `MainScreenEvents`:
  `onPlayClick(() => UIEvents.createScreen(GameScreen, transition))`,
  `onSettingsClick(() => UIEvents.openPopup(Settings))`.
- If a custom view is wanted, your own `MainMenuView extends ScreenView` + `ButtonComponent({label:'PLAY'})` /
  `ButtonComponent({label:'SETTINGS'})` inside a `VerticalLayoutComponent`; route with each
  `.onPress(...)`. Title with `LabelComponent`.

## Sub-phase 3 — Settings (sound on/off, theme)
- Ready-made `SettingsBinding` + `SettingsPopupView`: **automatically** binds the `sfx`/`music` (boolean) +
  `sfxVolume`/`musicVolume` (0–100) fields to `AudioService`
  (`setSfxMute(!v)` / `setSfxVolume(v/100)`), values persist via `StorageService`.
  `addModule(new SettingsBinding())` + open from `MainScreenEvents.onSettingsClick`.
- If an extra field is needed, add `SettingsBooleanField`/`SettingsNumberField` to `SettingsModel`
  (e.g. a theme toggle). Theme: with `StyleManager.modify(...)`, swap the global UIComponents styles
  (color/texture) between two presets.

## Sub-phase 4 — HUD/UI element layout + responsive
- Put HUD elements into **layout components**, do not give x/y by hand:
  `HorizontalLayoutComponent` (top bar: score on the left, moves/timer on the right),
  corner-anchor with `FullscreenLayoutComponent`. `HudLayer.Content` for the game, `HudLayer.Screen`
  for the menu, `HudLayer.Popup` for settings/game-over, `HudLayer.Overlay` for the toast.
- **Responsive:** every view overrides `onResize(width, height, dpr)`; layouts reflow.
  Phone/desktop test: no overflow on narrow (390px) and wide (1280px) viewports. `LabelComponent`
  for score; when the value changes, the pop tween in Sub-phase 5 fires.

## Sub-phase 5 — JUICE (explosion on match, score pop, screenshake, glow, cascade multiplier)
Add the modules: `addModule(new ParticlesBinding(budget?))` + `addModule(new TimelineBinding())`.
Resolve `ParticleManager` and `TimelineManager` from DI, tick them in `onStep` in the order above.
- **Match explosion (particle burst):** per tile type, a `HudParticleEmitter` (colored sprite +
  fade/gravity `IParticleBehavior`), `EmitterConfig {rate:0, ...}` (burst-only). On a match, move the
  emitter to the tile's HUD coordinate, `timeline.add(new ParticleBurstTrack(emitter, {burst:12,
  duration:0.3}))`. The budget is bounded by `ParticleBudget` (default 4096) — safe on mobile.
- **Score pop-up tween:** for the match score, spawn a short-lived `LabelComponent` at the match position,
  with gsap **y -= 40, alpha 1→0, scale 1→1.4 (0.5s, ease 'power2.out')**, `destroy()` when done.
  The total score label: gsap `scale 1→1.25→1` "punch" (every time the number increases).
- **Screenshake:** `timeline.add(new CameraShakeTrack(gameCamera, {amplitude, duration:0.2}))`
  (3D/world camera). In a 2D-only game, briefly offset the HUD root `Container`'s `x/y` randomly
  (gsap timeline) — let amplitude scale with the match size (bigger cascade = stronger shake).
- **Impact (zoom punch / hit-stop):** on a big match/combo, `ZoomPunchTrack({duration:0.2,
  fovDelta:-4})` or `HitStopTrack({duration:0.08})` — a short dramatic emphasis.
- **Glow / sparkle:** a white `ImageComponent` overlay on the matched tile, gsap alpha 0→0.8→0 "flash";
  for continuous shimmer, a low-`rate` sparkle emitter. (Glow via PixiJS `BlurFilter`/`ColorMatrixFilter`
  — but filters are expensive on mobile, prefer sprite-flash.)
- **Cascade multiplier animation:** as the chain length grows, the multiplier label (`x2`, `x3`...) comes
  onto the screen with gsap **pop-in (back.out) + color transition**; at each cascade step, the `playSfx`
  pitch increases (`PlaySfxOptions`). As the multiplier visual rises, the shake amplitude also increases.

> All these effects are triggered in the **Controller** (when Board state changes), the **View** only renders.
> The effect does NOT BLOCK input — the input lock already exists in the code phase during cascade resolving.

**If the game has ABILITIES** (spells, skills, ultimates, dashes, projectiles with a status effect —
action/RPG/shooter/MOBA-shaped, 2D or 3D), the juice above is not enough: an ability effect has to
match its own mechanic (radius, windup, duration) or it misinforms the player, and the naive
additive-burst-plus-bloom attempt reliably reads as a glowing blob. Call
`knowledge_get({ key: 'pattern:ability-vfx' })` **before authoring the first effect** — it carries the
mechanic→composition grammar, tuned billboard/particle numbers, the eight failure modes with fixes,
and the freeze-frame verification harness. It also answers the renderer question (**short version:
do not migrate to WebGPU for this**). Fetch it only for ability-shaped games; a match-3 or endless
runner does not need it. Gated/unavailable → handle exactly as in Sub-phase 9.5 below (never
improvise a half-version), and continue.

## Sub-phase 6 — Transitions (screen transitions + tween easing)
- Between screens: `UIEvents.createScreen(id, {type: SCREEN_TRANSITION_TYPES.FADE_IN |
  SLIDE_IN_LEFT | SLIDE_IN_RIGHT | SLIDE_IN_UP | SLIDE_IN_DOWN, durationMs})`. Splash→menu FADE,
  menu→game SLIDE. Collect into the scaffold's `<GameName>Config.transitions` (the renamed `MyGameConfig` from the
  baseplate — `scaffold_materialize` renamed it to PascalCase(gameName), e.g. `Match3Config`).
- In-view micro-transition: in the `onEnter(transition)`/`onExit(transition)` hooks, element stagger
  with gsap (buttons alpha/scale in sequence). Easing standard: entry `back.out`/`power2.out`,
  exit `power2.in`. Popup `onClose(done)` → call `done()` when the fade-out completes.

## Sub-phase 7 — Background (gradient / parallax)
- Static: `BackgroundComponent` (texture) or a **vertical gradient** (fill between two colors) with
  `PIXI.Graphics` at the very bottom of `HudLayer.Content`, scaled to full-stage in `onResize`.
- Parallax: 2–3 `ImageComponent` layers at different speeds; in `onStep`, shift `x` according to the
  derivative of the camera/score (far layer slow). For a slight continuous motion, gsap `repeat:-1 yoyo`.
- If `forge` is available, generate the background asset; otherwise gradient (gray-box fallback). Performance: the
  background is a single sprite/single draw, do not draw a new `Graphics` every frame.

## Sub-phase 8 — Game-over screen + frame + confetti
- `GameOverView extends PopupView` (`HudLayer.Popup`): a semi-transparent scrim + a centered **framed
  panel** (`BackgroundComponent`/`ImageComponent` frame), final score `LabelComponent` (gsap
  count-up tween 0→score), high-score comparison (`StorageService`).
- **Confetti:** a dedicated `HudParticleEmitter` (random color/rotation/gravity behavior), on open
  `timeline.add(new ParticleBurstTrack(confettiEmitter, {burst:80, duration:1.2, rate:30}))` —
  rains down from the top of the screen. Intensity changes based on win/loss.
- Buttons: `ButtonComponent({label:'RETRY'})` → state reset + `createScreen(GameScreen)`;
  `ButtonComponent({label:'MENU'})` → `createScreen(MainMenu)`. Panel gsap pop-in in `onOpen`.

## Sub-phase 9 — Button hover/press feedback
- `ButtonComponent` already manages the **idle/hover/pressed/disabled** texture states automatically
  (pointer over/down/up). Add **feel** on top: inside `onPress`, gsap **scale punch**
  (`1→0.92→1`, 0.12s) + `playSfx('click')`. On hover, a slight `scale 1.04` (pointer over event in a
  custom view; in the ready-made component the texture swap is enough).
- Disabled button (e.g. insufficient moves): `setEnabled(false)` → disabled texture + the press is swallowed.
  On all interactive elements, the touch target is ≥44px on mobile (layout `width/height`).

---

## Sub-phase 9.5 — Visual polish loop (look at the real game, then elevate it)

Sub-phases 1–9 author the layout **blind** — from a description, never from the running game. This
sub-phase closes that gap: screenshot the real build, redesign what you actually see, cut the result into
runtime assets, and look again. It is what separates "plays correctly" from "looks shipped".

**The procedure is NOT in this file** — it lives server-side under the knowledge key
`pattern:visual-polish-loop` (the loop steps, the img2img prompt shapes, the deterministic-slice/9-slice
rules, and the lighting + character-motion findings). **Do not fetch it until the user has accepted** (see
below): the fetch is a paid crown-jewel read, and pulling it for a user who then declines spends a
rate-limited read and can surface an upgrade prompt nobody asked for.

**ALWAYS ASK FIRST — never auto-run, in any mode.** This loop is *extra* polish on top of a game that is
already built, and it costs several forge generations plus a few minutes. Extra spend on an already-done game
is the user's call every time, not a mode default. Ask once, politely, via `AskUserQuestion`: describe the
game's state **honestly** — if the build was runtime-verified (the visual-evidence step below ran with a
working browser tool), *"the game is complete and playable"*; if it was **not** verified (no/unusable browser
tool), *"the game is built but not yet runtime-verified"* — never assert playability you did not observe. Then:
this pass would elevate how it *looks* (screenshot the real build → redesign the chrome → re-cut the assets →
compare), and it costs asset generations and a few minutes. Name the screens you think are weakest so the offer
is concrete rather than generic. **Declining is a perfectly good answer** — accept it without re-asking and
move to Sub-phase 10.

**If they accept:** call `knowledge_get({ key: 'pattern:visual-polish-loop' })` and run **one** pass, then
STOP and report the before/after. Never silently start a second pass — offer it, and let them decide again.

**If `knowledge_get` comes back `gated: true`, do NOT improvise** — do not reconstruct the loop from memory,
general art-pipeline knowledge, or this file. The value here is the specific proven recipe; a half-version
produces worse assets than doing nothing while still spending the user's forge budget. **Then read WHICH
kind of gate it was — they are different situations and must not be conflated:**
- **`rateLimited: true` (no `upgrade` payload)** → this is a *paying* tenant who hit the crown-jewel read
  limiter. Do **not** pitch an upgrade at a customer who already paid. Say the recipe is momentarily
  unavailable and can be retried shortly, then continue.
- **an `upgrade` payload is present** → free tier. Say plainly that the guided visual polish pass is a paid
  capability and relay the upgrade doors that payload carries.

Either way, continue to Sub-phase 10 with the game exactly as it is. Be helpful, not apologetic — but describe
what they have **honestly**: "complete and playable" only if it was runtime-verified, otherwise "built (not yet
runtime-verified)".

**Fail-soft:** if `knowledge_get` is merely unavailable (network/core down, not gated), skip silently and
continue — the build must never break. The golden rule still applies: the loop only swaps the visual layer;
`tsc --noEmit` stays clean and the `window.__game` smoke gives the same result before and after. If a screen
did not clearly improve, keep its old assets.

## Sub-phase 10 — Telemetry provisioning (deploy wiring, Channel B)
- Provision shipped-game **player telemetry** so the deployed game feeds the flywheel ("which games retain") in **two steps**:
  1. `telemetry_provision({gameId: <game slug>})` → returns `{ingestKey, endpoint, sdkUrl, snippet}`. This mints
     a per-game **public ingest key** (gate, via your OAuth identity — a tenant mints only its own) and builds the
     `ongame-telemetry` SDK snippet (NO disk write — it returns the snippet). The SDK auto-emits exactly two
     events — `session_start` and `session_end` — with an anonymous install id (D1/D7 retention); no PII.
  1b. **Instrument the level funnel YOURSELF — the SDK does not.** This is a real step, not a nicety: the
     auto-emitted pair answers *"did anyone come back"* and nothing else. Retention curves, difficulty tuning
     and the whole level-progression half of the flywheel are computed from `level_start` / `level_complete`,
     and those exist only if the game's own code sends them. Add two calls in the game's level lifecycle:
     ```js
     globalThis.ongameTelemetry?.track('level_start',    { level: n });
     globalThis.ongameTelemetry?.track('level_complete', { level: n, durationMs, score });
     ```
     The `?.` matters — the handle is absent when provisioning was skipped, and telemetry must never break
     gameplay. Emit `level_start` where the level actually begins for the player (after any intro/countdown,
     not at load) and `level_complete` only on a genuine win — a fail or a quit is not a completion, and
     counting it as one silently inflates every retention number computed from it.
  2. `telemetry_inject(gameDir, indexFile, snippet)` → writes the returned `snippet` into the SOURCE
     `index.html` on disk.
- **Idempotent + graceful:** re-running `telemetry_inject` does not double-inject; if telemetry provisioning is unavailable
  (no `{snippet}` returned) skip the inject — the SDK then fails silent → it NEVER blocks the build or breaks gameplay.
  Inject into the SOURCE `index.html` (before `vite build`) so the bundle carries it. This is Channel B (runtime player
  telemetry — the shipped game's browser SDK), distinct from Channel A (build-time orchestration traces via `trace_emit`).

## Sub-phase 11 — Build + publish to public static hosting (deploy, the flywheel's front door)
- Ship the game to a **public URL** so real player browsers load it and the telemetry SDK (Sub-phase 10) feeds the
  flywheel. Telemetry is injected into the SOURCE `index.html` FIRST (Sub-phase 10) so `vite build` bundles it; THEN:
  1. **Build:** `Bash`: `cd {gameDir} && npm run build` → produces `dist/`. Fix until the build is clean.
  2. **Enumerate the built files:** `Bash`: list every file under `dist/` as `dist`-relative paths, e.g.
     `cd {gameDir}/dist && find . -type f` → strip the leading `./`. Pair each with its content-type
     (`.html`→`text/html`, `.js`→`application/javascript`, `.css`→`text/css`, `.png`→`image/png`,
     `.json`→`application/json`, `.mp3`→`audio/mpeg`, `.glb`→`model/gltf-binary`, `.webp`→`image/webp`, else
     `application/octet-stream`).
  3. `publish_game({gameId: <game slug>, files: [{path, contentType}, ...]})` → returns
     `{uploads, publicUrl, signing}`. This tenant-scopes every object key under `games/{tenantId}/{gameId}/` (tenant from
     your OAuth identity, never self-asserted) and mints a V4 signed PUT URL per file (NO upload happens here).
  4. `publish_upload({gameDir, subdir: "dist", uploads})` → reads each built file from `dist/` and PUTs it
     to its signed URL. Returns `{uploaded:[{path,status}], skipped?, failed?}`.
  5. **Only if `failed` AND `skipped` are both empty:** **report the `publicUrl`** to the user — that is the live,
     shareable game. **If `failed` is non-empty** (one or more PUTs returned a non-2xx status — expired signed-URL TTL,
     missing bucket, blocked public access), the game is **NOT** fully live: do NOT hand over the `publicUrl` as a working
     link. Surface it as a **partial/failed publish** (list the failed paths+statuses), and keep the locally-playable
     fallback (`npm run dev`) instead.
  6. **Live-serve check (a successful upload is NOT a successful serve — CDN stale-edge).** A CDN edge can keep
     serving the PREVIOUS bytes of a **stable-named** file (`index.html`, a hand-named `.glb`) after a clean
     republish, with no error anywhere — upload 200, page loads, old game. So before handing over `publicUrl`,
     verify the live response is THIS build **by bytes, not by filename**: fetch the live `index.html` (with a
     no-cache request) and compare its **digest/bytes against `dist/index.html`** — don't merely check that it
     references the expected bundle names, because Vite hashes *content*, so an HTML-only or asset-only change
     can rebuild to IDENTICAL bundle filenames and a stale HTML would still "look right". Same rule for any
     **stable-named asset** the game fetches at runtime (a `public/` GLB/audio kept under one name): the durable
     fix is a **content-addressed filename** (rename per build); a `?v=<build-hash>` query is second-best and
     only helps if the CDN's cache key includes the query string — when you rely on it, verify the live asset's
     digest too. One matching response proves one edge (yours), not all PoPs — that residual is acceptable; a
     MISMATCHED response is not. A stale serve = NOT live: treat like a failed publish (surface it, don't hand
     over the URL as working).
  7. **Stamp the build record — ONLY after step 6's live-byte check passed** (all PUTs ok in step 4 AND the live
     bytes are THIS build): emit `trace_emit(buildId=<buildId>, name="publish.done", payload={gameId: <game slug>})`
     (ongame). Server-side this writes `publishedUrl`/`publishedAt` onto the build record; the URL is
     reconstructed from your verified identity + the build's own gameId, and the emitted `gameId` must MATCH the
     build's (a mismatch is refused — it means the uploaded location and this record diverged). Skip on any
     partial/failed/stale publish — an unshipped build must never be recorded as published.
- **Graceful + signing fallback:** if `publish_game` returns `signing:"direct"` (the host SA cannot mint signed URLs),
  `publish_upload` skips those files (`skipped`) — surface that the operator must finish the upload out of band (a host
  IAM step); the build still produced `dist/`. If hosting is entirely unavailable, the game is still locally playable
  (`npm run dev`) — hosting NEVER blocks the build.
- **Deterministic sub-score (`deploy_success`) — only when the deploy step actually RAN:** right after the build +
  publish objective check, emit the result —
  `brain_score({gameId: <slug>, phase: "polish", name: "deploy_success", value: <1 if vite build was clean AND publish_upload returned failed+skipped both empty AND the live-serve check (step 6) confirmed publicUrl serves THIS build (not a stale edge) else 0>, buildId: <buildId>, comment: "<build + publish + live-serve result>"})`
  (ongame). Judge-independent backbone, distinct from the gate's self-judged `phase_quality`.
  - **If the deploy step never APPLIED, this is `unverified`, which is NOT a `0`** — same rule as the code phase's
    `playable`. "Never applied" means there was nothing to run or nothing to run it against: the target is not a web
    build (no `vite build`/`dist/` in the first place — a Unity/native project ships through its own engine build,
    which this phase does not drive), or hosting is entirely unavailable so no publish was attempted. In those cases
    **do not write the `deploy_success` score at all** — a `0` tells the flywheel this build objectively FAILED to
    deploy, indistinguishable from a real broken deploy, and poisons the signal. Instead tell the user plainly that
    the build is *not deploy-verified* and what the next step is on their target. A `0` is only for a deploy you
    actually attempted and that actually failed (a broken build, a failed/partial upload, a stale live URL).
  - Fail-soft: a failed `brain_score` NEVER blocks the build; no-op if `buildId`/brain is absent.

## Finish (gate + wiring)
- **Is gameplay unbroken:** the `window.__game` smoke before/after the effects must give the same result;
  input works during effects (the lock is only in the code-phase cascade). Preserve 60fps — particle
  `ParticleBudget`, avoid filters, no alloc every frame.
- Fix until **`tsc --noEmit` clean** (gate).
- **Observability (the phase's headline decision → Langfuse generation under the phase span):** BEFORE `state_advance`,
  `trace_emit({buildId, name="phase.output", payload={`
  `input: <the context this phase consumed — the `profile_get` history signal that set the scope, any polish/juice `brain_recall` lesson(s) + `knowledge_get` key(s), and the prior-phase inputs used: GAME_DESIGN.md game type, the code-phase Controller/View seams, forge asset availability>,`
  `output: <the artifact produced — the polish sub-phases actually applied (e.g. splash/menu/settings/HUD/juice/transitions/bg/game-over/button-feedback), the file(s) written/edited, telemetry-injected? published publicUrl?, the `tsc --noEmit` clean + `window.__game` smoke result>,`
  `metadata: { decision: <the MAIN choice — the POLISH SCOPE selected (Full 1–9 / Core juice 4+5+9 / Juice-only 5) and the headline juice/menu direction>, why: <the RATIONALE — explicitly cite what drove it: the `profile_get` history lean (production→full vs idea-exploration→core) or the AskUserQuestion answer, plus any `brain_recall` retention/juice lesson and the GAME_DESIGN.md game type that shaped the sub-phase ordering> }`
  `}})` — ONE emit (the phase's headline decision), no-op if `buildId` is absent.
- **Visual evidence — REQUIRED for a production build; the last chance to catch a broken look before you call it done.**
  A polished build you never looked at is a claim, not a fact. `preview_start(gameDir)` → a live dev
  URL; with the browser tool (ToolSearch `browser_navigate` / `browser_resize` / `browser_take_screenshot` /
  `browser_click`), first `browser_resize` to **390×844** (mobile-first — matches how most players will actually see
  it), then navigate there. **Walk the screens this phase actually built, not just the first one** — splash→menu,
  open Settings, play a beat, trigger game-over if reachable — screenshotting each into
  `{gameDir}/.ongame/screenshots/polish-N.png` (numbered, create the dir if needed), reading the console for errors
  at every step. Look at each screenshot yourself: does it render, is the HUD placed right, any obvious breakage.
  **Dead-interaction check:** polish is exactly where buttons get wired (Play, Settings toggle, Retry/Menu on
  game-over) — if a tap meant to do something leaves the screenshot effectively unchanged, treat that button as
  suspected dead before calling the build done.
  **Phone-reality check (the 390×844 viewport is NOT a phone).** Resizing gives you a phone's *size* and nothing
  else: the session still reports a **fine pointer**, has **no safe-area insets**, and never misses a tap. So the
  three ways a game is fine on your screen and unusable on a real handset all pass silently here. Check each, and
  where the tool cannot emulate the condition, say **unverified** rather than passing it:
  (a) **Pointer type** — `browser_evaluate` **both** `matchMedia('(pointer: coarse)').matches` and
  `matchMedia('(any-pointer: coarse)').matches`: `pointer` describes only the PRIMARY pointer, so a hybrid or
  touch-capable device reports `false` there while still being touched — `any-pointer` is what tells you a coarse
  input exists at all. Better still, confirm touch directly (`'ontouchstart' in window` / `navigator.maxTouchPoints`).
  If the tool can emulate touch (a touch-enabled context / device emulation), turn it on and re-walk the core verb;
  a control that only reacts to `hover`/`mousemove` is DEAD on a handset and this is the only way to see it. If it
  cannot, report the core verb as **unverified for touch** and confirm from the code that no REQUIRED interaction
  depends on hover (hover may only *enhance*).
  (b) **Touch-target size** — the build rule is ≥44 CSS px (§ sub-phase 9); the gate is where it gets checked, not
  assumed. **Measure the RIGHT surface:** a gamelabs HUD draws its buttons into the CANVAS, so they are not DOM
  elements — `getBoundingClientRect()` over `document` finds nothing and an empty set "passes" vacuously. Read
  `__game.diagnostics.hitAreas` (the code phase publishes each control's rect in CSS px, viewport coords — §9) and
  flag anything under 44×44; for a genuinely DOM-based UI, measure the elements directly. **An EMPTY result is not
  a pass** — on a screen where you can plainly see controls, an empty `hitAreas` means the surface is unwired, so
  report **unmeasured**, exactly as when neither surface exists. Cross-check the ids you got against the controls
  you actually just interacted with in the walk above: a control you clicked that has no entry is a hole in the
  surface, not a control that passed. A 30px button is clickable with a mouse and a coin-flip with a thumb.
  (c) **Safe area** — a desktop browser reports `env(safe-area-inset-*)` as **0**, so a control tucked under a notch
  or the home indicator is invisible here by construction. This one is a SOURCE assertion, and say so: `viewport-fit=cover`
  must be in the meta viewport, and each edge-pinned element must consume the inset for **the edge it actually
  occupies** — `top` for a status bar, `bottom` for a thumb bar, `left`/`right` for anything hugging a side in
  landscape (a phone in landscape puts the notch on a SIDE). Demanding all four everywhere would fail correct
  layouts; demanding none is how a control ends up under the home indicator. Claiming it "looked fine" from a
  notch-less browser is not evidence either way.
  **Canvas-geometry check (dpr silent misalignment):** a game can "work" — logic fine, clean console — while
  every overlay/hit-target sits visibly offset from the canvas content, because the canvas CSS size, its backing
  size and the renderer's resolution disagree (a classic symptom: everything lands at ~1/dpr of where it should
  on a dpr=1.5 screen). Assert with the instrument, in two separate claims:
  (a) **CSS geometry** — the canvas `getBoundingClientRect()` fills its intended CSS area (fullscreen game →
  ≈`window.innerWidth/innerHeight`); and `canvas.width/height` ≈ `rect × <the resolution the game CONFIGURED>` —
  which is the renderer's `resolution` (often deliberately capped, e.g. `min(devicePixelRatio, 2)`), **not**
  blindly `devicePixelRatio`: rendering below native dpr is a valid perf choice that costs sharpness, not
  alignment, so comparing against raw dpr false-fails a correct game.
  (b) **Coordinate mapping** — alignment itself: pick a canvas-anchored landmark the DOM/HUD also positions
  against (a button over a board cell, a health bar over a unit) and confirm via `elementFromPoint` /
  `getBoundingClientRect` that the two land in the same place.
  This failure mode only EXISTS at `devicePixelRatio > 1` — a check run in a dpr=1 browser session passes
  vacuously. If the browser tool can emulate dpr (device-scale emulation), run the check at dpr 2; if it
  cannot and the session reports `devicePixelRatio <= 1`, report this check as **unverified at dpr>1** rather
  than passed.
  **Modal-occlusion check:** when a modal/overlay/panel is OPEN (shop, settings, pause, confirm, game-over), nothing
  should render OVER it. Screenshot each open modal and look: is its content fully on top, or is a HUD bar / score / a
  leftover element bleeding through above it — **especially along the modal's top edge**, where a stray top-bar tends to
  sit? Confirm with the instrument — `browser_evaluate` `document.elementFromPoint` at **several points inside the
  modal's own bounding rect** (centre **plus near each edge**, not just the viewport centre — an off-centre modal or a
  partial top-strip occlusion slips past a single centre sample) and check each hit element is `.contains`-ed by the
  modal root, not a HUD/overlay node behind it. In the default gamelabs.js layer stack the DOM HUD overlay sits above
  the Pixi canvas, so any surviving DOM HUD node (e.g. a top-bar left half-hidden by a partial DOM→Pixi migration — only
  some of its children set `display:none`) paints over a canvas modal; the audit is **per-panel/container-level**, not
  per-child. Treat an occluded modal as a blocker to fix (raise the modal's layer, or fully hide the leftover container)
  before calling the build done.
  **Frozen-subject check:** whatever should be moving on its own — an idle/locomotion animation, an ambient
  loop, a drifting background — must actually move. Pixels alone are a poor test in both directions: a busy
  background can drift while the subject stays frozen (false pass), and a loop sampled at matching phase, or
  one that hasn't started yet, reads as frozen when it isn't (false fail). So **lead with the runtime signal
  and use pixels to corroborate.** First put the subject into the state that should animate (don't sample an
  idle screen and conclude about a run cycle). Then `browser_evaluate` the code phase's
  `__game.diagnostics.subjects[<id>].poseChanges` — the per-subject counter that increments only when that
  subject's rendered pose actually changed — taking the baseline **after** the state is active, then polling
  it across a short observation window (~1s). Require it to keep advancing — **at least two increments on
  separate polls**, not one: a subject that applies a single pose and then freezes passes a one-shot check,
  and a single pair of samples can land on the same loop phase. Corroborate with two screenshots over that
  same window, comparing **the subject's own region**, not the whole frame. A counter that never advances
  (or a subject the code phase never registered, which makes this unknowable) is a blocker to fix before
  calling the build done — the usual cause is a name-keyed
  clip/asset lookup that resolved to nothing, which fails with a completely clean console. A quiet console is
  not evidence of life. The screenshots also feed the auto-jury (a CC hook you don't
  control) — without them the review is text-only and blind to the actual look. **If the browser tool is unavailable
  OR unusable (Chromium missing, the call errors —
  preflight 0.1):** say so to the user with the one-line enable step, skip the screenshots (the jury silently degrades to
  text-only — nothing breaks; never hard-block), and do **not** describe the game as "polished", "shipped", "playable",
  "working", or "complete" as if you saw it — say *"built, not visually/runtime verified"*. Never fake the look.
- **Independent quality check (advisory):** call `phase_review({ phase:'polish', buildId, gameId, artifact:<the polish plan + the juice/menu changes applied — a summary, not every line>, context:{ genre:<mechanic>, intent:<user intent / mode + persona scope signal> } })` (bare name `phase_review` via ToolSearch) → `{ verdict, score, feedback:[{issue, confidence}], strengths:[{issue, confidence}] }`. **ADVISORY — you decide:** on `verdict:'revise'`, weigh each `feedback.issue` (con) against `strengths` (pro — what's already working, keep it): scope-calibration to the user · concrete high-impact JUICE scaled by weight · non-regression — the working game still works; where you agree a con improves feel, adjust (your judgment, keep `tsc` clean + the smoke identical), then you MAY re-review (a cap bounds re-runs). On `'pass'`/`'skip'` (or free/unavailable) proceed. **But a `'skip'` is not an approval — check `reason`, and treat ONLY `gated` as benign.** `gated` means the user isn't entitled to the review; that is expected and needs no remark. EVERY other reason means the review did not actually run on this artifact — `no-providers` (all providers failed), `unavailable` (reviewer unreachable), `rate-limited`, `cap` (re-review budget spent), `unknown-build`, `no-images` — and so does any reason you don't recognise, because a new one will be added before this line is updated. In all of those the phase went UNREVIEWED: the quality gate did not open, it was never closed. Still proceed (fail-soft is the rule), but do NOT carry it forward as if it had been checked, and tell the user plainly in your own voice that you had no second opinion on this one and it rests on your judgment alone. **And a verdict is only as strong as the panel behind it — read `perProvider` as `k of N`:** N is its length (the panel that was meant to answer), k the entries whose `score` is not null (the ones that actually did). `k = N` is the ordinary case. `k < N` but `k >= 2` is a PARTIAL panel: more than one provider contributed, which is all the number proves — it does NOT establish that any single rubric dimension was scored twice, since two providers can answer on disjoint dimensions and leave every one of them singly-scored. So note the reduced panel in passing rather than presenting full-jury health. `k = 1` is thinner still: with no second scorer there is no cross-check at all, which is the entire point of a panel, so that one model's bias goes unchallenged — a single-scorer `pass` is not WRONG, it is one opinion, and you disclose it the way you would a review that did not run. Never block on any of this; fail-soft holds throughout — the duty is accuracy about what was checked, not refusal. Relay both the pros AND cons to the user in YOUR OWN voice (never mention an external check or how it works) — a balanced "what's working / what to watch" note is more useful than only listing problems. Fail-soft: never block.
- `state_advance({buildId})` + `trace_emit({buildId, name="phase.polish.done"})`.

> **Correction-learning:** if this phase is re-running because the user **corrected** the polish/feel (rejected the
> juice/menu/scope, asked to redo it "again", redirected the visual direction, or hand-edited the polish code), call
> `friction_report(buildId, gameId, phase="polish", kind, agentDid, userWanted, evidence?)` (bare name via
> ToolSearch) with the DELTA — what polish/feel you assumed vs what the user actually wanted (e.g. "assumed heavy
> screenshake + confetti everywhere → user wanted subtle, restrained juice"). Report the user-correction delta, NOT a
> self-summary of the polish you applied. Agentic (you judge if it's a real correction); fail-soft (never block). See
> `/make-game`'s correction-learning block.
