---
name: code
description: Write a production-quality playable game with gamelabs.js — compose the knowledge, build it with clean architecture.
---
# Code Phase (core value — production-quality)

Goal: a **clean-room, tech-debt-free, 60fps mobile-first** playable game. Compose the knowledge
as inspiration; do not copy blindly. Every unit is **single-responsibility**, NodeNext +
`.js`-extension imports. The phase does NOT END without `tsc --noEmit` clean.

> **GRAYBOX-FIRST.** This is the *playable mechanic* step — it runs BEFORE `assets`. You
> build a fully-playable game with PLACEHOLDER art (the scaffold's `PIXI.Graphics` shapes) and a **minimal feel layer**
> (basic tap/hit response, a simple tween/score-pop — enough that the mechanic is READABLE; zero juice makes a mechanic
> unreadable). Do NOT wait for real assets — the later `assets`/`audio` phases "dress" this graybox (swap shapes for
> sprites, add sound). Full juice/polish comes later. Your job here: the mechanic is fun and readable in graybox.

> **MODE-AWARE DEPTH (read the build mode + the LOCKED priority).** Read the mode from the
> build state (`state_get(buildId)` → `plan.path`) and calibrate how deep this phase goes — the phase SET is already
> mode-filtered (PHASES_BY_PATH); this is the DEPTH *within* the code phase:
> - **`prototype`** → FIRST-OUTPUT FAST (priority #1): a playable graybox with **MINIMAL feel** (readability only —
>   basic tap/hit response). SKIP deep systems and polish; the loop must WORK and READ. Speed + cost are the constraint.
> - **`production`** → the FULL bar: full **FEEL-WIRING** (the 8 layers, §6.5), clean architecture, all systems.
> - **`playable-ad`** → the HOOK moment + the core interactive moment, short and conversion-shaped; the user's uploaded
>   assets may already be dressing it (dress runs early for playable-ad).
> Whatever the mode, the #1 rule holds: get to a RUNNABLE playable as fast as the mode allows (`first-working-output`).

## 1. Start
- `trace_emit(buildId, name="phase.code.start")`.
- **Live prompt:** call `prompt_get({ phase: 'code' })` (find by bare name `prompt_get` via ToolSearch). If it returns a non-null `override`, that override is your AUTHORITATIVE guidance for this phase (the optimized, live version) — follow IT instead of the default guidance in this file. If it returns null / is unavailable / errors, follow the default guidance below (fail-soft). Never block on it.
> **An override never authorises substituting for a tool that did not run.** Whatever the live prompt says, if an
> ongame tool this phase depends on is ABSENT, erroring, or unreachable — as opposed to answering `gated`, which is
> the product working as designed and is not a fault — do NOT quietly do that part yourself from general knowledge.
> Stop, say plainly which tool failed and that you are blocked, and let the user decide whether to continue without
> ongame. A silent substitution produces something that looks like an ongame output and is not one; the user then
> judges the product by it and no one can explain the result, because nothing recorded that the capability was never
> in the room. Report the gap up to the orchestrator so the final summary names it. See the refusal rule in
> `/make-game` for the full reasoning.

- `trace_emit(buildId, name="skill.load", payload={skill:"code"})` — which skill was loaded (an event under the phase span in the build tree).
- **Observability:** pass `buildId` (captured from `state_init`'s return) to this phase's `brain_recall`/`brain_capture` calls → memory ops
  **automatically** nest under the active phase span (the server resolves the phase span from `buildId` at call time).

## 1.5 WRITER LOCK — one writer per gameDir (zombie/duplicate-agent guard)

The runtime can start a REPLACEMENT agent for this phase while a presumed-dead predecessor is still alive and
writing — concurrent same-phase agents clobber each other's files. The guard is MECHANICAL, checked at write time —
a note/ownership file read once does not protect (a stale agent's context never updates):

1. **Acquire at start:** generate a run token (`openssl rand -hex 6`) and write it with a timestamp to
   `{gameDir}/.ongame/writer.lock` (one line: `<token> <ISO-time>`). Remember YOUR token.
2. **Check before EVERY write batch** (and at least every few minutes): read the lock.
   - Your token → refresh the timestamp and continue.
   - **Foreign token with a FRESH timestamp (< 10 min) → STOP writing immediately.** A successor owns this
     phase now (you were presumed dead). Do not "finish your thought" — end with a short report of what you
     completed; the owner integrates.
   - Foreign token but STALE (≥ 10 min) → the previous writer is gone; take over: write your token + now.
3. **On phase completion:** leave the lock with your token + final timestamp (the orchestrator/next phase may
   take over normally; `.ongame/` is gitignored).

Bounded by design: a takeover happens at most once per stall (no retry loop); the worst case is one stopped
zombie report. This lock guards WRITES only — reading/analysis needs no lock.

## 2. Scaffold — STEP 0 (always first; build ON TOP of the baseplate)
- **`scaffold_materialize(gameDir=<gameDir>, gameName=<the game's display name>)`** (find by bare name
  `scaffold_materialize` via ToolSearch). It copies the bundled gamelabs.js baseplate (`templates/gamelabs-base`) into
  `gameDir` and renames every `MyGame*` identifier (`MyGameApp`/`MyGameConfig`/`MyGameUIIds` + the enum value + the
  package `"name"`) → PascalCase(`gameName`) across file contents **and** file names. It returns
  `{ written:[...], renamedTo }` — `renamedTo` is the PascalCase identifier the App/Config/UIIds were renamed to (use
  it when you reference the App class below).
- Then `npm install` in `gameDir` (Bash).
- **Why STEP 0 is mandatory:** the template already wires the gamelabs.js App → DI → ScreenView/Controller path and
  pre-solves the **three known pitfalls** — the `.layer` overlay CSS in `index.html` (an empty world3d over hud2d =
  black-screen), the `.layout` declaration on screen views, and the `postInitialize`/`onResize` timing. You start from a
  working frame so every build inherits the fixes; you do **not** re-derive the wiring (and must not delete the `.layer`
  CSS — see §4).
- **You then BUILD ON TOP:** keep the App/DI/screen wiring (`<renamedTo>App` extends `GamelabsApp`,
  `configureDI`/`configureViews`/`postInitialize`, the registered screen); **replace** the placeholder
  `GameScreenView`/`GameScreenViewController` bodies with the real game, and add the Board/state, InputController, state
  machine, object pool etc. per §4. The scaffold is the frame; the game is yours.

## 3. Routing (agentic — list FIRST, then match; NOT keyword-if)
1. Read `GAME_DESIGN.md`.
2. **Call `mcp__ongame__knowledge_list()`** → get the canonical list of available keys.
   **Never pass a key that is NOT in this list to `knowledge_get`** (nonexistent key → 404).
3. Always fetch `knowledge_get(key="framework")`.
4. Match the type of the design against the `genre:*` keys in the list. **If there is an exact match**, fetch
   that `genre:<x>`.
5. **Genre miss (e.g. design is "snake" but `genre:snake` is not in the list):** do NOT CALL a nonexistent genre
   key. Instead, fall back to `framework` + the appropriate `pattern:*`s in the list
   (app-setup + game-loop + input + whatever else the design requires), and in the output document
   **note** "no genre knowledge existed, composed from framework + patterns".
6. Fetch the matched/selected `pattern:*`s (at minimum: app-setup, game-loop, input).
7. **Call `brain_recall`** (the DYNAMIC sibling of knowledge — compose static knowledge + LEARNED lessons):
   `brain_recall(phase="code", gameId=<game slug>, mechanic=<mechanic>, genre=<type>, query=<specific need>, buildId=<buildId>)`
   → returns curated lesson texts (if empty, no brain / no lessons → static knowledge only, that's fine). Use these
   together with the knowledge as **context** for the code; **YOU decide which to apply** (no keyword-if).
   Passing `buildId` automatically binds the recall **under the active phase span** (at the gate, `brain_score` scores that span —
   hierarchical Langfuse eval). `buildId` is optional; if omitted the recall is flat (backward-compatible).

> **End of phase — `brain_capture` (learn):** when the code phase ends, write down the lesson of what worked / didn't work. **YOU judge the scope:**
> a generalizable mechanic/pattern lesson → `scope:"global"` (collective moat); a quirk specific to this game →
> `scope:"game"` (gameId); a preference specific to this user → `scope:"user"`. The tenant is resolved server-side from the
> verified OAuth identity (do NOT self-assert a tenantId). `category` is free-form
> (e.g. `"pattern"`, `"bug-fix"`). Pass `buildId` (capture automatically nests under the active phase span).
> Do not fabricate lessons — write down what was genuinely learned. If brain is absent it's a no-op (pipeline is unaffected).

## 4. Architecture — separation of responsibility (mandatory)
When composing gamelabs.js Lego, do NOT MIX the layers. Every game keeps these units separate:

> gamelabs.js supports 3D via the three.js world3d layer (knowledge `pattern:3d-basics` / `pattern:3d-objects`);
> do not assume 2D-only — the concept decides the dimension.

- **Board / state (pure data + rules):** `src/game/<X>Board.ts` — game state like grid/entity/score
  + pure mutation methods. **Does NOT import PixiJS/DOM**, knows nothing about render, is
  testable. Score is also pure state (`score`, `reset()`).
- **View (pure render):** `src/views/*.pixi.ts` — extends `ScreenView`; only draws state, contains
  NO game rules. Does not listen to input.
- **Controller (orchestration):** `src/controllers/*.ts` — `IViewController`; takes input,
  updates the Board, syncs the View. Holds subscriptions with `UnsubscribeBag`.
- **App (wiring):** the scaffold's `<renamedTo>App` (extends `GamelabsApp`); keep its
  `configureDI` / `configureViews` / `postInitialize` wiring and the registered screen — bind your Board/Config in
  `configureDI`, register your real ScreenView/Controller in `configureViews`. Do NOT re-create the App from scratch and
  do NOT DELETE the `.layer` CSS in `index.html` (an empty world3d covering hud2d = black-screen bug; already solved by
  the template).

Rule: state does not leak into the View, render does not leak into the Board. If a unit does two jobs, split it.

## 5. State machine — clean, single transition path
- `type GameState = 'menu' | 'play' | 'gameover'` + a small state machine. Transitions happen **only**
  through `transition(to)`; do not set `current` by hand.
- `transition` is idempotent + listened to from a single point (`onChange`). Side effects on transition (startGame /
  showGameOver) live in the listener.
- **Gameover → restart wait period (~500ms):** so an accidental tap does not start a new game.

## 6. 60fps mobile-first performance (NO alloc on the hot path)
- Target **60 fps mobile**. In every-frame `mainLoop`/`update`, do NOT `new` up new objects, create
  array/object literals, or do closure alloc → GC pauses = jank. Reuse scratch
  variables for vector/range computations.
- **Object pool:** keep a pool for frequently spawned/dying entities (bullets, particles, falling tiles) —
  `acquire()`/`release()`, don't dispose on death, hide + return to the pool. Aim for
  zero allocation within a frame.
- Create Pixi objects once, reuse them via `visible`/transform; do not rebuild the scene
  tree every frame with addChild/removeChild.

## 6.5 Game feel — juice IS in the code (mandatory)
**Feel is architecture, not final paint.** Wire a multi-sensory feedback loop into EVERY significant player action
from the start — the jury scores this as **FEEL-WIRING**, and the bar is the **Mute Test**: *with sound off and score
hidden, the core mechanic must still feel good to perform.*

- **Never one layer.** The core verb (tap/swap/match/jump/shoot) needs **≥3 feedback layers** at once — e.g. a scale
  tween (squash/stretch) + a particle burst + a sound/score-pop. A button needs ≥2 (scale tween + sound). A "dead"
  interaction with no feedback is the #1 quality failure.
- **The 8 layers** (use the ones that fit, scaled to significance): animation (squash/stretch) · particles
  (directional, matching strength) · sound · hit-stop (a 3–8 frame freeze on impact = perceived weight) · hit-pause ·
  camera (shake/zoom — a light tap ≠ an explosion) · HUD (score pop, bar shake) · haptic.
- **Scale to significance + anticipation→action→recovery:** the player's action feels instant; weight comes from
  hit-stop + particles converging on impact, NOT from slowing the input.
- **Anti-pattern:** "feels flat → add a mechanic." WRONG — flat means the EXISTING verb needs more feel, not more
  systems. Don't spray uniform shake/particles everywhere either; scale intensity to the action.
- **Graybox note:** the visuals here are placeholders, but the FEEL hooks (tween/particle/shake/sound) are wired NOW —
  the later `assets`/`audio` phases swap the look, they do not add the feel. Use the gamelabs particle / timeline /
  camera modules (see knowledge), not hand-rolled.

## 7. Input lock (during cascade / animation)
- Keep an `inputLocked` flag (or `state === 'resolving'/'busy'`) in the Controller.
- During **match-3 cascade, tile falling, transition animation, gameover wait**, **reject** new input
  (early-return). Release the lock when the animation/cascade ends. Otherwise a double-tap
  corrupts the state (double-resolve bug).
- Keyboard + touch are unified behind a single interface; the lock applies to both sources.

## 8. Restart cleanup (no dangling state/listener/timer remains)
- Single restart path: **board/score `reset()` → rebuild entities → `transition('play')`**.
- On restart: **clear** all `setTimeout`/animation handles, remove old subscriptions with
  `UnsubscribeBag.flush()`, return pools to the pool, reset `inputLocked`. A half-finished
  cascade/tween must not leak into the restart (memory leak + ghost-entity bug).
- View `destroy()` cleans up children + listeners.

## 9. window.__game test-global (for Playwright verification)
- After the app is set up in `main.ts`, expose **`window.__game`**; containing at least:
  `state` (current GameState), `score`, and observable game data (grid/entity count).
  If possible, test-hooks like `restart()`.
- This global lets the headless **smoke/Playwright** test verify the game without canvas-pixel
  guessing (e.g. the change in `__game.score`/`__game.state` after an interaction).
  Production-harmless (read-only + test hook). Keep it compatible with `scripts/smoke-game.mjs`.
- **`__game.diagnostics` — the silent-failure surface (required whenever the game binds content by
  name or animates a subject).** Two things fail with a completely clean console and a clean `tsc`,
  so they are unknowable from outside and the game itself must report them:
  - `diagnostics.bindings: [{ requested, kind, status:'pending'|'resolved'|'failed', resolved:string|null }]`
    — **pre-register every expected binding as `pending` when you REQUEST it**, not when it resolves
    (an empty array inspected before a lazy load lands would vacuously "pass"), and flip it to
    `resolved`/`failed` when the load settles. Also expose `diagnostics.registrationComplete: boolean`,
    flipped true once you have registered every binding this game will ever ask for, and define
    `diagnostics.bindingsSettled = registrationComplete && nothing is pending`. Without the
    registration flag an empty table between request waves reads as "settled" and vacuously passes;
    with it, a verifier can wait rather than sample a half-loaded game.
  - `diagnostics.subjects: { <subjectId>: { poseChanges: number } }` — a **per-subject cumulative
    counter that increments only when THAT subject's rendered pose/frame actually changed** (bump it
    where you apply the pose, not on the generic tick — a frame counter advances happily while the
    character stands frozen, and clip time wraps every loop, so neither can be trusted).
  - `diagnostics.hitAreas` — the **interactive controls' hit rectangles in CSS pixels, in VIEWPORT
    coordinates** (the same space `getBoundingClientRect()` reports). A gamelabs HUD draws its buttons
    INTO THE CANVAS, so they are not DOM elements: `document.querySelector` finds nothing to measure and
    a touch-target check would score an empty set as a pass. Three properties make this surface
    trustworthy rather than another thing to keep in sync:
    - **Derive it from the input registry, never hand-maintain a list.** Build it by mapping over the
      SAME collection your hit-testing already consults, so a control that accepts input is
      structurally incapable of being missing from it. Use each control's own stable id.
    - **Compute it ON READ (a getter), not on a resize event.** Scroll, pinch-zoom (`visualViewport`)
      and layout all invalidate a cached rect, and a stale rect is worse than none — it reads as precise.
    - **Convert Pixi coordinates properly — scale by the CANVAS, not by `resolution`.** Bounds come back in
      the renderer's SCREEN space (logical units, "relative to the top-left of the screen"), while
      `resolution` maps logical→framebuffer — so dividing bounds by `resolution` shrinks every rect on a
      HiDPI display. Derive the factor from the element itself, which is resolution-agnostic AND survives a
      CSS-scaled/letterboxed canvas: `sx = canvasRect.width / renderer.screen.width` (same for `y`), then
      `viewportX = canvasRect.left + bounds.x * sx`, `viewportW = bounds.width * sx`. (Pixi v8 note:
      `getBounds()` returns a **Bounds** — take `.rectangle`.) Getting this wrong is the dpr-style error
      where every number looks plausible and is wrong.
    A genuinely DOM-based UI may skip this surface — its controls are already measurable as elements.

## 9.5 Framework-grounding — read the REAL gamelabs.js API before calling it (mandatory)
Before writing or editing ANY line that calls a gamelabs.js API (`@gamebyte/gamelabsjs` — PixiJS 2D + Three.js 3D),
ground yourself in the ACTUAL installed surface — do not assume a method name/signature from memory or from the
`knowledge_get("framework")` summary alone:
- **Read the real type definitions** — `node_modules/@gamebyte/gamelabsjs/**/*.d.ts` (or the package README) inside
  `gameDir` (present after `scaffold_materialize` + `npm install` in §2), or the template's own usage in
  `templates/gamelabs-base` if a given class/method isn't obviously covered there.
- **Why:** a hallucinated engine API (a call that looks plausible but doesn't exist, or exists with a different
  arity/return type/import path) is a common, expensive failure mode — it reads fine at write time, then blows the
  §11 tsc-clean gate and burns a full repair cycle. Grounding in the real `.d.ts` catches it BEFORE the cycle is
  spent, not after.
- **Targeted, not exhaustive:** check the SPECIFIC API surface you're about to use (e.g. the ScreenView/Controller
  base-class signatures, the particle/timeline/camera module entry points referenced in §6.5) — this is a lookup,
  not a full-package read. **Knowledge pattern text is never a substitute for this lookup**, even when it looks
  familiar: `knowledge_get("framework")` can drift behind the actually-installed version (e.g. it may still
  describe an older major than the template's pinned one), so "I recognize this from the pattern text" is not
  the same as "I checked the installed `.d.ts`."

## 10. Write
- **Compose** the `framework` + selected `pattern:*`/`genre:*` knowledge to fill in `src/`:
  Board/state, View, Controller, App, InputController, state machine, (if needed) object pool.
- Each file single-responsibility; `.js`-extension relative imports.

## 11. Verify — tsc clean GATE (mandatory)
- Fix until `npx tsc --noEmit` is **0 error / clean**. If it is not clean, the phase does NOT END
  (silencing via suppress / `any` = tech-debt, FORBIDDEN).
- **When you rename, move, or remove anything — audit every reference (tsc does NOT catch all of them).** `tsc`
  flags broken *types*, but a game breaks at *runtime* on links tsc can't see: a string asset id / texture key, an
  event name, a scene/screen id, a DI token, a `data-*` or DOM id, a file path in `public/`. After any such change,
  grep the whole `src/` (and `public/`) for the old name and update EVERY hit — a stale reference that still compiles
  is exactly the silent-broken class (an orphaned asset id → the phantom 404 load; a stale event name → a dead
  button). Leave nothing half-renamed.
- **Deterministic sub-score (`compiles`) — only when the compile check actually RAN:** right after the tsc check
  resolves, emit the objective result —
  `brain_score(gameId=<slug>, phase="code", name="compiles", value=<1 if tsc is clean else 0>, buildId=<buildId>, comment="<tsc result>")`
  (the judge-independent backbone, distinct from the gate's self-judged `phase_quality`).
  - **If no compile check applied, this is `unverified`, which is NOT a `0`** — same rule as `playable` below. That
    is the case when the target is not a TypeScript project (a Unity/native build compiles in its own toolchain,
    which this phase does not drive) or the check could not be run at all. Then **do not write the `compiles` score**:
    a `0` claims the code objectively failed to compile and is indistinguishable from a real compile error, which
    poisons the flywheel. Say plainly that the build is *not compile-verified* here and what compiles it instead. A
    `0` is only for a check you actually ran that actually failed.
  - Fail-soft: a failed `brain_score` NEVER blocks the build; no-op if `buildId`/brain is absent.

## 11.1 Sub-agent verify gate — never trust a "done" claim (mandatory whenever this phase delegates)
If any part of this phase's implementation or repair work is dispatched to an implementer/fixer sub-agent (the Agent
tool — e.g. splitting Board/View/Controller across parallel workers, or handing off a targeted tsc-error fix), that
sub-agent's own "done"/"fixed" report is **not evidence** — a sub-agent claiming success while the code doesn't
actually build is a common, expensive failure mode.
- **After ANY code-writing sub-agent reports completion, YOU (the orchestrator) re-run the real check yourself** —
  `npx tsc --noEmit` (and any test suite the game already has, e.g. `scripts/smoke-game.mjs`) — on the actual files,
  before accepting the work as done. The sub-agent's own summary/transcript is never a substitute for this.
  **Timing when work is split across parallel workers** (e.g. Board/View/Controller each dispatched separately):
  running the full check after only the FIRST worker reports is premature — it will fail on the other workers'
  not-yet-written files and waste a repair turn on the wrong target. Run the full `tsc`/test check once the whole
  delegated batch is integrated; a targeted single-worker repair (fixing one already-integrated file) still
  verifies immediately, as above.
- **On failure:** feed the sub-agent the concrete compiler/test error text (not a paraphrase) for a repair turn, or
  fix it yourself directly.
- **Bounded retry:** at most **3 repair attempts** per failure. If it's still not clean after 3, STOP dispatching
  further repair turns — escalate (surface the unresolved error to the user) rather than looping indefinitely.
- This gate composes with, not replaces, §11's tsc-clean gate above: the phase does not end clean until you have
  personally verified it, whether you or a sub-agent wrote the code.

## 11.5 Correction-learning — `friction_report` (feed the DELTA, not a self-summary)
If, during or right after this phase, the **user CORRECTS you** — rejects the gameplay/feel, asks for it "again",
redirects the mechanic/direction, or **hand-edits your code** — call
`friction_report(buildId, gameId=<slug>, phase="code", kind, agentDid, userWanted, evidence?)` (find by
bare name `friction_report` via ToolSearch). The code phase is the **highest-friction** point — the "the feel/mechanic
missed → user steered to X" delta is the most valuable signal in the whole moat.
- **Agentic, not a threshold:** YOU judge whether a *real correction* happened. Your own iteration to reach tsc-clean,
  or a clarifying question, is NOT a correction — only a place where the user steered you off what you produced.
- `kind` ∈ `rejection | iteration | redirect | user-edit | repeat`. `agentDid` = what you originally built / assumed
  (e.g. "tuned a fast arcade swap with instant cascade"). `userWanted` = the DELTA the user steered to (e.g. "wanted a
  slower, deliberate match with a visible think-pause"). `evidence` = an optional quote or a diff snippet of their edit.
- **Report the user-correction DELTA — NEVER restate what you built as a "lesson".** The agent already knows its own
  output; the moat fills only from "agent assumed X → user actually wanted Y". If the user did not correct you, do not
  call it. One report per distinct correction.
- The backend (brain) decides agentically whether the delta generalizes into a stored lesson + at what scope — you only
  report the raw delta. Fail-soft: if `friction_report` is unavailable/errors, never block the build.

## 12. Finish
- **`trace_emit` the headline `phase.output`** (ONE per phase — the code phase's main decision; nests as a Langfuse `generation` under the phase span, so the eval can read context→artifact→why). Emit it **after** the build is tsc-clean, **before** `state_advance`:
  ```
  trace_emit(buildId, name="phase.output", payload={
    input:    <the CONTEXT this phase consumed — the brain_recall lesson text(s)/signals (mechanic, genre, query), the knowledge_get key(s) used (framework + matched genre:* / pattern:*), and the GAME_DESIGN.md mechanic/genre this code targets>,
    output:   <the ARTIFACT produced — the src/ files written (Board/state, View, Controller, App, InputController, state machine, object pool if any), file count, main units, and the tsc-clean verification result>,
    metadata: {
      decision: <the MAIN architecture/mechanic choice this code made — e.g. the chosen genre composition (genre:* vs framework+pattern fallback), the state-machine + Board/View/Controller split, object-pool vs no-pool, input-lock strategy>,
      why:      <the RATIONALE, explicitly citing what drove it — name the brain_recall lesson(s) applied (or "recall empty → static knowledge only"), the knowledge pattern(s) composed (framework/genre:*/pattern:*), and the GAME_DESIGN.md user-intent/mechanic the choice serves>
    }
  })
  ```
  (prompt-level replay; no-op if buildId is absent.)
- **Deterministic sub-score (`playable`) — REQUIRES actually looking, or it is `unverified` not `1`:** `tsc` proves
  the code compiles; it does NOT prove the game runs. A game can compile clean and still be a black screen (a
  top-level-`await` deadlock, a failed WebGL context) with a **completely silent console**. So "playable" is only
  earned by loading the running preview in a **browser tool** and observing it:
  1. **Set a mobile-first viewport, then walk the real states — not just the first screen.** `preview_start(gameDir)`
     → a live URL. With the browser tool (ToolSearch `browser_navigate` / `browser_resize` / `browser_take_screenshot`
     / `browser_click`), first `browser_resize` to **390×844** (mobile-first default — most play happens phone-sized,
     and layout bugs often only show up narrow), then navigate there. Do not stop at the first render: walk through
     the game's actual reachable states via real interactions (tap PLAY, perform the core verb a few times, trigger
     gameover/win if reachable) — screenshot after **each** step, not only the first one. A build that renders a
     menu and nothing else has not been verified "playable"; a game breaks past the first screen just as often as
     on it.
     - **Dead-interaction check:** if two consecutive screenshots (before vs. after a tap/click meant to do
       something) are effectively identical, treat that control as a suspected dead button — investigate before
       reporting "playable" (a wired-looking `ButtonComponent` with no listener, or a listener that throws silently,
       passes a first-screen-only check but fails this one).
     - At each state check: (a) `window.__game` is reachable and `state`/`score` are observable; (b) the interaction
       actually changed `__game` (e.g. score/state moved) AND the screenshot visibly changed; (c) **no uncaught
       console errors**; (d) the canvas actually rendered (not a blank frame); (e) if the interaction opened a
       modal/overlay (pause, confirm, gameover), nothing renders OVER it — sample `browser_evaluate`
       `document.elementFromPoint` at several points across the modal's bounding rect (centre + edges, not just the
       viewport centre) and confirm each hit element is `.contains`-ed by the modal root, not a HUD bar or a leftover
       DOM node above the canvas. This is exactly the class of bug a
       URL — or a single first-screen screenshot — alone hides; (f) anything the game binds **by name** at
       load time — animation clips → logical states, audio ids, atlas/spritesheet frame keys — actually
       RESOLVED. A name-keyed lookup that matches **zero** entries throws nothing: it just yields a subject
       that never moves / never sounds, with a clean console and a clean `tsc`. Externally-authored content
       (rig/animation packs, generated atlases) renames things between packs, so a naive prefix match that
       happened to work on one pack silently resolves nothing on the next. You cannot probe this from
       outside — mixers, audio registries and atlas caches usually live in closures, and lazy loads land
       after your sample — which is exactly why §9's `__game.diagnostics.bindings` contract exists. So:
       `browser_evaluate` it, **wait for `bindingsSettled`** (poll to a short deadline rather than sampling
       once), then require **zero `pending` and zero `failed`** entries. A `failed`/`pending` binding, a
       deadline that expires, or a `bindings` table you never wired — which leaves this unknowable — is a
       defect to fix here, not a "playable" build.
  2. Emit the objective result ONLY when you actually observed the running game — `brain_score(gameId=<slug>,
     phase="code", name="playable", value=<1 if the browser check confirmed a running game (window.__game reachable,
     state/score observable, canvas rendered, no console errors, AND every requested name-keyed binding resolved per
     (f)); 0 if you looked and it is genuinely broken (black
     screen, console error, __game unreachable)>, buildId=<buildId>, comment="<what you observed>")` (ongame).
     `1` = verified running, `0` = verified BROKEN. Both mean you looked.
  - **If you could NOT look — no browser tool (preflight 0.1), OR the browser tool is present but unusable (Chromium not
    installed, the navigate/screenshot call errors or times out, the preview can't be automated):** this is **`unverified`,
    which is NOT a `0`.** Do **not** write the `playable` sub-score at all (a `0` would tell the flywheel the build is
    objectively broken — indistinguishable from a real defect — and poison the signal). Instead: tell the user the game
    is *built but not yet runtime-verified* + the one-line enable step (`npx playwright install chromium` + Playwright
    MCP), and never call an unlooked-at build "playable"/"working". **Degrade, never hard-block** — a missing/broken
    browser tool must not stop the build; only a defect you actually observed is a `0` to fix.
  - Judge-independent (`compiles` + `playable`). Fail-soft: a failed/unavailable `brain_score` write NEVER blocks the
    build; no-op if `buildId`/brain is absent. (Looking is not optional when a browser tool works; the score *write* and
    the tool's availability are.)
- **Independent quality check (advisory):** call `phase_review({ phase:'code', buildId, gameId, artifact:<the core architecture: the Board/View/Controller source + the FEEL wiring — the main game files, not every line>, context:{ genre:<mechanic>, gddSummary:<1-line GDD>, recalledSignal:<the brain_recall engine/genre lesson you applied, if any> } })` (bare name `phase_review` via ToolSearch) → `{ verdict, score, feedback:[{issue, confidence}] }`. **ADVISORY — you decide:** on `verdict:'revise'`, weigh each `feedback.issue` (architecture separation, 60fps discipline, **FEEL-WIRING — is the core verb juicy**, applied know-how); where you agree it improves the code, refactor (your judgment, keep it tsc-clean + playable), then you MAY re-review (a cap bounds re-runs). On `'pass'`/`'skip'` (or free/unavailable) proceed. **But a `'skip'` is not an approval — check `reason`, and treat ONLY `gated` as benign.** `gated` means the user isn't entitled to the review; that is expected and needs no remark. EVERY other reason means the review did not actually run on this artifact — `no-providers` (all providers failed), `unavailable` (reviewer unreachable), `rate-limited`, `cap` (re-review budget spent), `unknown-build`, `no-images` — and so does any reason you don't recognise, because a new one will be added before this line is updated. In all of those the phase went UNREVIEWED: the quality gate did not open, it was never closed. Still proceed (fail-soft is the rule), but do NOT carry it forward as if it had been checked, and tell the user plainly in your own voice that you had no second opinion on this one and it rests on your judgment alone. **And a verdict is only as strong as the panel behind it — read `perProvider` as `k of N`:** N is its length (the panel that was meant to answer), k the entries whose `score` is not null (the ones that actually did). `k = N` is the ordinary case. `k < N` but `k >= 2` is a PARTIAL panel: more than one provider contributed, which is all the number proves — it does NOT establish that any single rubric dimension was scored twice, since two providers can answer on disjoint dimensions and leave every one of them singly-scored. So note the reduced panel in passing rather than presenting full-jury health. `k = 1` is thinner still: with no second scorer there is no cross-check at all, which is the entire point of a panel, so that one model's bias goes unchallenged — a single-scorer `pass` is not WRONG, it is one opinion, and you disclose it the way you would a review that did not run. Never block on any of this; fail-soft holds throughout — the duty is accuracy about what was checked, not refusal. Relay any change in YOUR OWN voice — never mention an external check or how it works. Fail-soft: never block.
- `state_advance(buildId)` + `trace_emit(buildId, name="phase.code.done")`. (`/make-game` then does `preview_start`.)
