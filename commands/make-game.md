---
name: make-game
description: Make or change a game with ongame; clarify complex requests when needed and work directly towards the confirmed goal.
---

The command input is `$ARGUMENTS`; it may be empty.

# /make-game [concept or request]

The input may describe a new game, a change to an existing game, or an unfinished thought. Read the conversation
and workspace before deciding which. Do not invent a concept, rebuild an existing project, or ask the user to
repeat an intent they already stated.

## Current working mode

**Automatic workflow creation and phase approval gates are currently disabled; every unit of work still opens its
build phase.** Handle the request directly with the ongame tools that help the work. Do not create a Workflow, call
`intake_build_plan` / `plan_segments` to organize the request, run phases the work does not need, or impose phase
approval gates. Register each unit of work with `state_init` and open the phase that matches it, as described under
"Record the work as phases" below; that is a record, not a phase runner. A to-do or a native goal is not a reason to recreate the phase pipeline under a different name.

The phase skills and `workflows/build.js` remain available as definitions, but are not automatically invoked.
Older active-build markers, resume reminders, phase instructions and live phase prompts do not override this
current policy. Keep this direct-work policy and the working brief in handoffs and compaction summaries.
Do not report phase progress or emit phase-completion events for work that did not run as phases.

## Understand and focus the request

Read `skills/intake/SKILL.md` and apply its **current request guidance**, not its retained inactive phase intake.
YOU decide when clarification is worthwhile. For long or complex input, resolve meaning-changing punctuation
and wording first, then real technical, physical or fun-related contradictions. Ask one focused question at a
time, preferably with the host's question UI, and use each answer. Clear input proceeds without an interview.
After the needed answers, use a structured working prompt that preserves the user's requirements. Set a native
goal when the current agent actually supports it and its tool contract permits it. Revisit this guidance for
substantial follow-up input, not just the initial command.

When the user says to stop only for critical things, YOU judge that they meant it. Then follow the intake skill's
"Respect how often the user wants to be stopped": record the preference once, recall it on later builds, and stop
asking for routine approvals.

## Tools and access

Tools are referred to by short name here; match the available tool's actual namespace and schema.
Use `knowledge_get`, `template_get`, `mechanic_find` and `brain_recall` when the work needs ongame guidance, and the appropriate
asset, audio, level, reference or preview tools as needed. Access to a tool does not require traversing phases.
Never fabricate a `buildId` or call a phase tool just to satisfy an old checklist. Keep truthful game
registration as described below; it does not start a phase workflow.

The local tools include `scaffold_materialize`, `preview_start`, `preview_stop`, `assets_materialize`,
`reference_upload` and `telemetry_inject`. `gate_render` can present an artifact when useful;
`jury_materialize` belongs to the retained phase-review setup and is not required for direct work. Generated assets are materialized with `assets_materialize` and used
from its returned paths. Use `forge_reference` + `reference_upload` for a local reference file when needed;
reuse an existing suitable asset/reference via `editOf` rather than changing the game's visual language.

If ongame tools are absent, explain the installation or sign-in issue. In the public CLI, use the available
`login` tool when cloud access is missing; a session may need restarting to refresh its tool list. Do not
silently substitute an unavailable ongame capability and claim it ran. A typed `gated` or `limitReached`
result is different: follow the documented fallback and explain the actual limit or upgrade option briefly.
Do not reconstruct a withheld paid recipe. `upgrade`, `billing_status`, `usage_status` and `set_spend_cap` remain
available for account questions. Do not expose credentials or private service details.

## A new game starts with a concept review

A new game (`entry: "new"`) uses `path: "concept-to-game"` unless the maker clearly asked for another mode. YOU judge
that from their words; no phrase list decides it. A clear ask for a quick prototype, a full game, a playable ad or
docs only keeps `prototype`, `production`, `playable-ad` or `concept-only`. A one-line idea such as "a cozy farming
game" is no such signal. Say the choice in one sentence; the maker can redirect it.

The flag `--no-concept` in the request turns this default off. Drop the flag from the concept, then judge `path`
from the request alone, without this section's default.

`concept-to-game` registers `plan.target: "production"` and
`plan.phases: ["research", "concept", "assets", "docs"]`, in that order:
1. `research`: research the genre and write `docs/RESEARCH.md`.
2. `concept`: make the concept screens, a main menu and 2-3 in-game moments in one visual language.
3. `assets`: cut those screens into game-ready assets. Read `knowledge_get({ key: 'pattern:concept-cut' })` for how,
   then write the cut assets to the game with `assets_materialize` and use their returned paths.
4. `docs`: write the game's docs from the concept screens and the assets.

Then close the build and stop for the maker's review before any code. Show the screens, the assets and the docs, and
ask whether to build, change something or stop. This one stop is the mode's point. It is not a phase approval gate.
This build has no game to play yet, so call `play_gate` with `skip: {reason}` before `build.done`. Write no game
code before the maker answers. When they say to build, register the code work as a continuation of this game: same
`gameId`, `entry: "continue"`, the `intent` you judge, `continues` set to this `buildId`, and `path: "concept-to-game"`.
A maker who said not to stop for reviews asked for another mode; judge which.

A continuation keeps its game's `path`. The exception is a derived artifact, such as a playable ad cut from the game:
it takes that artifact's path with `intent: "derive"`. Never switch an existing game to `concept-to-game`.

## Keep the game's identity and record its phases

Before the first request-derived account write, including registration, show the notice once: "ℹ️ Build details
(your requests and work results) are recorded to your account to operate and improve the service." If the user
objects to request/feedback capture, keep their request, answers and working brief local: omit prompt/feedback
events and lesson capture, use a neutral project label for `concept` (also when calling `intake_context`), and
leave `personalization.notes` empty. Do not place their wording or a summary into other record fields. Register
only the minimal project metadata needed for the work; if their objection also covers that metadata, do not
register or call capabilities that require the record, and explain that limitation. This applies to the account
ledger below too; `profile_record_build` must reuse the registered metadata, not reintroduce the private brief.

When actually building or changing a game through ongame, preserve its account history and publishing identity.
Reuse the game's real `gameId`; use `games_list` / `game_summary` and the workspace to recognize existing work.
Every unit of work gets a build record: a new game, a continued game and a quick fix alike.
`state_init(gameId, plan)` is the registration tool:
use its current schema and an agent-authored plan describing the confirmed request. `concept` describes the
requested outcome; keep the full working brief in the session or project context; judge `path`, `target`, `persona`, `engine`, `deliveryTarget` and `entry` from the real task.
Use `intake_context.returning` for `personalization.userKnown`; set `personalization.decidedBy` from whether
you needed to ask and keep relevant confirmed notes in `personalization.notes`. Do not invent observations. A continuation needs its real
`intent` and may carry the prior build of THIS game as `continues`. `plan.phases` lists, in order, only the phase keys accepted by the schema that describe the actual
work: `["code"]` for a quick fix, `["assets", "code"]` for new art wired into the game.
Capture the returned `buildId`, check that registration succeeded, and keep it with the game's working context.
Emit `trace_emit(buildId, name="build.start", payload={path: plan.path})` for that actual new work record.
Never create an ownership record for a game you did not actually work on just to bypass a publishing refusal.

**Record the work as phases.** Walk `plan.phases` in order. For each phase `<p>`:
1. Before its work, call `state_advance(buildId)` and check that it returned `<p>` as the current phase. Then emit
   `trace_emit(buildId, name="phase.<p>.start")`.
2. Do the work of that phase.
3. When `<p>` is `concept`, `docs` or `levels`, call `phase_review` with `buildId` and `gameId` on what it
   produced. For `code`, Write/Edit code writes are reviewed on the game's whole source, and that feedback arrives
   in your context. Call it for `code` only at the end, when code changed after the last feedback you received,
   with every source file in full, never a summary or a selection. Either verdict is advice: apply or decline the feedback by your own judgment, and never
   wait on it.
   When the verdict is `pass`, call `brain_reinforce` once for each recalled lesson this phase applied, with the
   ref on its `[lesson ref: …]` line. A `revise` or a `skip` reinforces nothing for that phase.
4. Emit `trace_emit(buildId, name="phase.output")` once with the phase's headline decision, then
   `trace_emit(buildId, name="phase.<p>.done")`.

After the last phase, one more `state_advance(buildId)` closes the build. If the work grows into a phase the plan
does not list, close this build and register the next unit of work with `continues` set to this `buildId`. Never
advance past a phase whose work did not happen.

**Redo a phase when the user asks to change its work.** When the user corrects something a phase of this build
already produced, record the correction as `user.feedback` (below). Right before you redo that work, call
`record_iteration(buildId, <p>)`; never call it speculatively. It makes `<p>` current again and counts the redo.
Also call `friction_report(buildId, gameId, phase=<p>, kind, agentDid, userWanted)` once for that correction:
`agentDid` is what you produced or assumed, and `userWanted` is what the user asked for instead. Skip it for a
clarification, and when the user objected to capture.
Then repeat steps 2-4 for `<p>`, starting with `phase.<p>.start`; skip step 1's `state_advance`. Call it once for
each phase the change reaches. When the corrected request is complete, close the build with `build.done` again.

If `.ongame/active-build.json` exists or is written by registration, inspect it before acting. When it belongs
to this game and the build being handled in direct-work mode, preserve it as inactive history under a unique
name in `.ongame/` instead of leaving an active phase reminder. Do not touch another project's/build's marker,
overwrite history, or send a fake `build.done` just to clear it. This also applies when resuming an older build.

Use the real `buildId` for supported recording tools, without synthetic phase events. After the requested work
is verified, `profile_record_build` links its real concept/path/gameId/buildId to the account. Record only what
actually happened; a legacy phase list is not evidence its phases ran. Publishing remains an explicit user
request, with the same game identity and actual `buildId` passed to its recording steps.

## 1.5 Set up game-dir only when the request needs it

For an existing game, use its existing absolute project root and identity. Do not create a second game folder,
run `git init` over its repository, or scaffold over the user's files. Look at the actual workspace and supplied
references before choosing an engine or output target; ask only when the choice is consequential and unclear.

**WHEN THE ENGINE IS NOT THE WEB ONE**, use that engine's project root. Do not put a web baseplate into a Unity,
Godot or Unreal project. **Never tell the user this product is for one engine.** For Unity-specific work, consult
`skills/unity/SKILL.md` as needed and verify in the actual Editor/runtime.

For a new web game, use a clean standalone directory and keep its absolute `gameDir` for local tools. Do not use
a checkout of the ongame repository as the game. **Scaffold the baseplate:** when a new project needs an
ongame frame, call `scaffold_materialize` with the actual supported engine and its schema rather than
hand-copying it. A Unity baseplate is different from a web one. Never scaffold over an existing game. Preserve the generated engine wiring, including the world3d/hud2d overlay CSS.

When the request depends on external references, consult `skills/reference/SKILL.md` and carry the resulting
`referenceContext` unchanged into the working brief, any delegated work and every re-run. If reference preparation is unavailable or
gated, report fidelity as unverified. Do not claim to have checked a reference you could not inspect.

Before generating the first visual for a game that has more than one scene or a recurring character, consult
`skills/storyboard/SKILL.md` — or, where that file is not on disk, the same procedure as
`knowledge_get({ key: 'pattern:storyboard' })`: it settles which scenes exist and who the cast is, in one text file, while
disagreeing is still free. Carry the resulting `docs/STORYBOARD.md` unchanged into later work and re-runs. It is
a working artifact, not a phase or an approval gate, but it is ORDERED: show it before the first generated asset,
level or content art included — collecting reference evidence may come first. Skip it for single-screen or
non-visual work.

Five skills hold rules every game follows, with or without phases. Consult each before the work it names, in a
new game and in a change to a finished one:
- the concept, `docs/GAME_DESIGN.md` or the look of a game — `skills/game-concept/SKILL.md`: research the genre,
  the user's request outranks the research angle, the core loop and hook, a light design doc with every number
  labelled, and the look locked in `docs/ART_DIRECTION.md` before any asset;
- the game's code — `skills/game-code/SKILL.md`: the genre's knowledge, one state machine, input locked during
  animation, a clean restart, level tracking, ads, real-money items, lives or a shop only when the design chose
  them, and 60 fps on phones;
- the levels of a level-based game, before `skills/level-design/SKILL.md` — `skills/difficulty-curve/SKILL.md`: the
  curve from `levels_generate` on a D1, D7 or D30 profile, its check, and a levels review that reads the economy;
- any asset request — `skills/asset-anchor/SKILL.md`: anchor it to what the game already has, never generate cold;
  then `skills/forge-assets/SKILL.md` before a generated file goes into the game: real alpha, sliced sheets, the
  returned sound length and the character's pose and arms, measured;
- the HUD and screen layout, and before calling a game done on phones — `skills/phone-layout/SKILL.md`: layout
  components that reflow, and the device-reality checks; then `skills/mobile-ready/SKILL.md` for the pixel-ratio cap,
  late safe-area values, pause, backgrounding and the Android back key.

Before the levels of a level-based game are generated or authored — a numbered sequence of puzzle, casual or
hybrid-casual stages — consult `skills/level-design/SKILL.md` — or, where that file is not on disk, the same procedure as
`knowledge_get({ key: 'pattern:level-design' })`. For such games it is required. It is a working artifact, not a
phase or an approval gate. Carry the resulting `docs/LEVEL_DESIGN.md` into later work and re-runs; skip it for
games without a level sequence.

When a game has more than one big screen — a lobby and play, or levels with a result between them — consult
`skills/scene-transitions/SKILL.md` before wiring how they connect — or, where that file is not on disk, the same
procedure as `knowledge_get({ key: 'pattern:scene-transitions' })`. For such games it is required. It maps every edge
(lobby, next level, retry, home), picks a style per edge and routes every path through one entry. Carry the
resulting `docs/TRANSITIONS.md` into later work and re-runs; skip it for single-screen games.

When an existing game must look consistent or holistic, match a reference game's quality, or the user asks you to work
as an art director, consult `skills/art-direction/SKILL.md` — or, where that file is not on disk, the same procedure as
`knowledge_get({ key: 'pattern:art-direction-pass' })`. It audits every screen, writes `docs/ART_DIRECTION.md` before code and
proves the change with a control matrix. Carry `docs/ART_DIRECTION.md` into later work and re-runs.

When the user wants playable ads for a game that already plays — interactive ads, "playables", an ad end card, or
files for AppLovin, Unity Ads, Meta or Google — consult `skills/playable-ads/SKILL.md` — or, where that file is not on disk, the
same procedure as `knowledge_get({ key: 'pattern:playable-ads' })`. It builds them from the game's own code and art,
measures each board with the game's own simulation, and shows them on a review page before any network file.

When a character on a non-gameplay screen should move — the mascot in the lobby, on the win or fail card, on a
loading screen — consult `skills/mascot-video/SKILL.md` before the first `kind:"video"` request. It covers the still,
the prompt, sending takes one at a time, what to do when a video call times out (the clip is often delivered and billed
later), and the check and packing tools.

## Choose the game's strategy from what made its genre succeed

Every new game, and every change to a game's mechanics, levels, difficulty, retention, money, live ops or
launch ads, follows `skills/strategy/SKILL.md` first. It is on by default, not a phase or an approval gate.
List `skills/strategy/genres/` and `skills/strategy/studios/`, read every file whose `match` fits the game or a
reference it names, and always read `skills/strategy/principles.md`. Decide each lesson for this game (apply,
adapt or not used, with where or why) and write the table to `docs/STRATEGY.md` before `docs/GAME_DESIGN.md`.
The user's request wins over any lesson. Carry `docs/STRATEGY.md` into later work and re-runs. Where those
files are not on disk, apply the same five lessons: a purchase needs a loss to restore (a fail state); new
mechanics on a schedule carry retention; no interstitials and no feature clutter in the first levels; reveal
big boards in parts; copy a proven core and win on the curve, economy and ads.

## Design the game's rules before its content

Every new game, and every change to a game's rules, levels, layout or economy, follows
`skills/game-design/SKILL.md` — or, where that file is not on disk, the same rules as stated here. It is on by
default, not a phase or an approval gate. Write the answers to `docs/GAME_DESIGN.md` before the first level or
game-rule code, and carry it into later work and re-runs:
1. **Capacity:** every container (jar, tube, slot, tray, queue) has a written capacity, shown on screen, and
   a rule for a piece that arrives when it is full.
2. **Waiting and blocked:** every state a piece can be in, and the exact condition that moves it in and out.
3. **Caps in play:** the most pieces in play, containers open and pieces sent at once, and what happens at each.
4. **Odds model first:** before levels are generated, compute the chances that matter (solvable deal, dead end,
   moves to win) and build the difficulty curve from them; level design then works from this model.
5. **Phone sizes:** each piece's size in CSS px at 360x640; tapped pieces at least 44x44 px, read-only pieces
   at least 28 px, kinds told apart by more than colour.
6. **Rival study, applied:** the looks, on-screen sizes and economy of at least three popular games in the
   genre, in one table, and where each finding changed this game.

## Work and verify

Work towards the confirmed brief, choose the necessary tools and implementation approach, and keep the scope
proportionate to the request. Diagnose the cause of bugs before editing. Preserve existing user work and make
reversible checkpoints when useful. Fetch specialized guidance when it helps; do not turn that into a mandatory
phase, approval ceremony or automatic extra polish pass.

When the change is about how a player action responds — a tap, drag, drop, hit, refusal or reward feels
flat, wrong or too much — read `knowledge_get({ key: 'pattern:game-feel' })` before adding or tuning the
response. It decides whether the moment needs a response at all, names the `feel:<id>` recipe and the code
templates to start from, and says how to check it with stepped frames.

Before writing movement for more than one moving thing — walkers, crowds, units, traffic — read
`knowledge_get({ key: 'pattern:agent-space' })`: what is floor, wall or a reserved zone, who collides with whom,
how routes go round what they must not cross, and how to keep a crowd apart without changing the game's pace.

Before writing a game rule — something that has to behave: a hit, a match, a merge, a spawn, a jump, a state
change — call `mechanic_find({ need })` with the need in the game's own words. The library holds verified mechanic
code with tests and licence; read `notFor` and `whenNot` before `mechanic_get({ id })`, and carry the licence note
with any code you copy. Nothing fits → write it yourself; the tool's description says when one re-phrasing is worth it.

**Sound fits the game and feels good.** Every sound effect, generated or written in code, matches the game's
look and material and is satisfying to hear, ASMR-like: soft, tactile, short, layered. Examples: tap → soft
wooden tap or bubble pop; slide → smooth whoosh or felt slide; match → juicy pop with a sparkle tail; coin →
warm clink; win → short warm chime flourish. Name the game's material in each sound text. No 8-bit sound:
no square-wave beeps or chiptune, unless the game's style is retro or pixel. In code, use sine or triangle
tones and filtered noise with smooth envelopes. Listen to each sound and replace any that sounds like an old
console. When `knowledge_get` is available, `pattern:audio-sound-design` has the full list and checks.

**Wins look rich and rewards look like the game.** Celebrations, explosions, fireworks and confetti use rich,
realistic particle effects: several layers (glow, burst, confetti, sparkle), depth, light, varied shapes and
physical motion (gravity, drag, spin, flip, fade). Never flat primitive particles, such as one layer of same-size
squares or dots. Draw every coin and reward in the game's own style and material, with depth and shine: a
leaf-stamped gold coin in a forest game, a jelly drop in a paint game. Never a generic flat coin with a `$`. Use
that same coin art everywhere it appears. Praise words (Great!, Superb!) sit tilted together with the ribbon behind
them, as one angled banner, never flat text on a flat band. Freeze the win celebration at its peak and look at the
frame before calling it done. When `knowledge_get` is available, `pattern:celebration-and-reward-art` has the
layers and checks. Light rays behind the end card fade from bright at the centre to transparent at the edge: fill
them with one radial gradient centred on the rays, never one flat colour. The polish phase's Sub-phase 8 has the code.

**Every web game reports how it is played.** Write the analytics calls from `src/telemetry.ts` (shim v2) while
you write the code they belong to: `screen('<id>')` where each screen is shown, `const a = levelStart(n)` when a
level begins play and `levelEnd(a, 'complete' | 'fail' | 'quit')` when it ends, `economy(...)` when currency
changes, and a short, stable `label` on every interactive Pixi object, whose taps the SDK then reports itself.
Settings gets an **Analytics** on/off switch calling `setConsent(on)`; once it works, pass `--opt-out yes` to the upgrade run below. The calls and rules: `skills/analytics/SKILL.md`.
If `src/telemetry.ts` exports no `levelStart` (shim v1, an older scaffold), use `trackLevelStart(n)`,
`trackLevelComplete(n)` and `trackLevelFail(n)`, add the labels, and skip the other v2 calls.
Before calling a web game done, run `node <pluginRoot>/skills/analytics/upgrade.mjs {gameDir}`. Exit 3 → ask the
maker once whether the game is aimed at children, as that skill says, and run it again with `--audience`. Then
`node <pluginRoot>/skills/analytics/upgrade.mjs --check {gameDir}` must exit 0. For a children's game it also takes the telemetry
tag out of `index.html`; exit 5 → remove the telemetry scripts it names and run it again. Exit 4 (shim v1) still saved the privacy page: skip `--check` and tell the maker an onGame CLI update brings the full analytics. Older games: `/analytics add`.

**Anything that fades is one shape with one gradient fill.** A glow, light rays, a sky, a vignette, a halo or
ribbon shading is never a stack of rings, bands, strips or discs: each step shows as a band. Read
`skills/gradients/SKILL.md` before drawing the first one, in a new game or a change to a finished one. It has the
PixiJS v8 `FillGradient` code and a source check.

Verify the behavior the user asked for in the relevant runtime. A preview URL, clean compile or empty console
alone is not proof that a game works. Inspect actual rendering and interaction in a browser or the engine.
If verification is unavailable, state what remains unverified. Do not mark a native goal complete without that
evidence, and do not claim a phase or review happened when it did not.
Before saying done, follow `skills/game-verify/SKILL.md`: the test pass and fail counts before and after the change,
a proof run with real input on the built page, every screen at its fullest, and a verdict only after the run ends.
Before calling a web game done, check it as a phone. The onGame launch card (the `credit` skill) is required in every game,
not only published ones: run `node <pluginRoot>/skills/credit/apply.mjs {gameDir}` before `npm run build`, then
`node <pluginRoot>/skills/credit/apply.mjs --check {gameDir}/dist/index.html` after it. Run
`node <pluginRoot>/skills/gradients/check.mjs {gameDir}` and replace every stacked-shape fade it names with one
gradient fill (exit 1 lists them). Open the built page at 360×640 and 414×896 with DPR 3, and walk
`pattern:gamelabs-shell-contract` §14 — pause halts the sim, background suspends audio, back key, pixel ratio
per canvas, safe-area fallback. Unity: the same list in `pattern:unity-shell-contract` §14. Run
`node <pluginRoot>/skills/mobile-ready/check.mjs {gameDir}` and fix every FAIL it prints (exit 1).
When the browser check is done, call `browser_close`: an open game keeps the browser rendering, and that drains the
user's battery.
Step the clock frame by frame for timing-critical moments, check placement with a numeric probe rather than by
eye, and reach hard states by seeding the save (`pattern:temporal-capture`, `pattern:visual-polish-loop`).

**A game is done only after it was played on record.** After the last build and before `build.done`, call
`play_gate({gameDir, buildId, desktop, phone})`. Write both play scripts yourself: the shortest
keyboard play (desktop) and touch play (phone) from the first screen to the win or goal. A game played by dragging a
finger (connect letters, draw a line, pull a slingshot) uses a `drag` step through hit-area ids. The game prints `pass goal`
there (`pattern:gamelabs-self-check`). `state: "blocked"` names the failed checks: fix the game, rebuild and call it
again. `layout_fits` measures the phone layout at 360x640 and 390x844 (cut-off or covered text, controls under
44x44 px) from `window.__game.layout()`, which the gamelabs-base template publishes. Waive a check only when it is
wrong for this game, with the reason. On `"awaiting_review"`, open both footage
images, then call `play_review` with what you saw. Rays on the end card that keep one flat colour out to their tips
are a failed check: give them the gradient, rebuild and play again. `build.done` and `profile_record_build` are refused until it passed.
A Unity game is played the same way: build it for WebGL into `{gameDir}/dist` (`-buildTarget WebGL`). It prints
`pass boot` when its first scene is ready and `pass goal` at the win (`pattern:unity-self-check`); tap by `tapAt`.
A game with no web build to play (Unity with no WebGL build support, a docs-only change) calls `play_gate` with
`skip: {reason}`; tell the user it was not played. An install with no `play_gate` tool cannot play it either: say the game was not played on record.
Give the user the check lines and any waiver with its reason.
When the user gives a teardown's `mechanics.json` (the original game's feel numbers, each with its source), copy it
unchanged to `{gameDir}/mechanics.json` and start the game's tuning from its values. Publish those tuning values in
`__game.snapshot()`, and write `{gameDir}/mechanics.bind.json` beside the sheet: for each sheet id the game holds,
`{"<id>": {"path": "/tuning/reach", "tolerance": 0.05, "scale": 1}}`. `path` is the snapshot field; `tolerance` is the
allowed share of the value (default 0.05); `scale` is game units per sheet unit, for a game drawn at another size.
`play_gate` then returns `mechanics`: each bound number as `match`, `drift` or `unread`. It never blocks. Bring a
drifted number back to the sheet, or keep a deliberate change and say why in `play_review`.
When `play_gate` passes, call `brain_reinforce` once for each recalled lesson you applied that no `pass` verdict
reinforced yet. A blocked or skipped play reinforces nothing.

Use the registered game/build identifiers accepted by each tool. Do not invent phase completion or mark an
earlier phase build done. Follow the notice and capture choice established before registration; do not repeat
the notice or ask again. If the user objected, keep request/feedback and lesson capture off.
Otherwise preserve the verbatim request and clarification answers through `trace_emit` with `name="user.prompt"`
and `payload.output`; preserve later corrections with `name="user.feedback"`. The structured working brief guides
execution but never overwrites that original source. Do not assign these events to phases that did not run.

When the actual work yields a useful lesson, use `brain_capture` with the real `buildId` and appropriate `user`
or `game` scope, respecting any objection to capture; do not invent a lesson. Reinforce a recalled lesson only after
a passed review or play, as above. When the CURRENT direct-work
request is complete and verified, record `trace_emit(buildId, name="build.done", payload={path: plan.path})` and
its real `profile_record_build` entry. That is a work outcome, not a claim that the retained phase sequence ran.
Do not manufacture approvals, phase outputs, scores or completed phase states.

Close with the result, the verification evidence, and any material unresolved issue. Keep a light `🎮 ongame`
marker on meaningful progress updates. For account or publishing requests, use the corresponding command/skill;
a game-making request alone does not authorize publishing it.
