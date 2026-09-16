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

**Automatic workflow creation and phase routing are currently disabled.** Handle the request directly with the
ongame tools that help the work. Do not create a Workflow, call `intake_build_plan` / `plan_segments` /
`state_advance` to organize the request, run a phase sequence yourself, or impose phase approval
gates. `state_init` is still permitted for truthful build registration, as described below; it is not a phase runner. A to-do or a native goal is not a reason to recreate the phase pipeline under a different name.

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

## Tools and access

Tools are referred to by short name here; match the available tool's actual namespace and schema.
Use `knowledge_get`, `template_get` and `brain_recall` when the work needs ongame guidance, and the appropriate
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

## Keep the game's identity without running phases

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
For a new unit of work that needs a build record, `state_init(gameId, plan)` is still the registration tool:
use its current schema and an agent-authored plan describing the confirmed request. `concept` describes the
requested outcome; keep the full working brief in the session or project context; judge `path`, `target`, `persona`, `engine`, `deliveryTarget` and `entry` from the real task.
Use `intake_context.returning` for `personalization.userKnown`; set `personalization.decidedBy` from whether
you needed to ask and keep relevant confirmed notes in `personalization.notes`. Do not invent observations. A continuation needs its real
`intent` and may carry the prior build of THIS game as `continues`. The schema still requires `phases`: include
only phase keys accepted by the schema that describe the actual work, as record metadata, not an execution sequence. Do not call
`intake_build_plan`, `plan_segments` or `state_advance` to turn that registration into a workflow.
Capture the returned `buildId`, check that registration succeeded, and keep it with the game's working context.
Emit `trace_emit(buildId, name="build.start", payload={path: plan.path})` for that actual new work record.
Never create an ownership record for a game you did not actually work on just to bypass a publishing refusal.

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

## Work and verify

Work towards the confirmed brief, choose the necessary tools and implementation approach, and keep the scope
proportionate to the request. Diagnose the cause of bugs before editing. Preserve existing user work and make
reversible checkpoints when useful. Fetch specialized guidance when it helps; do not turn that into a mandatory
phase, approval ceremony or automatic extra polish pass.

Verify the behavior the user asked for in the relevant runtime. A preview URL, clean compile or empty console
alone is not proof that a game works. Inspect actual rendering and interaction in a browser or the engine.
If verification is unavailable, state what remains unverified. Do not mark a native goal complete without that
evidence, and do not claim a phase or review happened when it did not.

Use the registered game/build identifiers accepted by each tool. Do not invent phase completion or mark an
earlier phase build done. Follow the notice and capture choice established before registration; do not repeat
the notice or ask again. If the user objected, keep request/feedback and lesson capture off.
Otherwise preserve the verbatim request and clarification answers through `trace_emit` with `name="user.prompt"`
and `payload.output`; preserve later corrections with `name="user.feedback"`. The structured working brief guides
execution but never overwrites that original source. Do not assign these events to phases that did not run.

When the actual work yields a useful lesson, use `brain_capture` with the real `buildId` and appropriate `user`
or `game` scope, respecting any objection to capture; do not invent a lesson. When the CURRENT direct-work
request is complete and verified, record `trace_emit(buildId, name="build.done", payload={path: plan.path})` and
its real `profile_record_build` entry. That is a work outcome, not a claim that the retained phase sequence ran.
Do not manufacture approvals, phase outputs, scores or completed phase states.

Close with the result, the verification evidence, and any material unresolved issue. Keep a light `🎮 ongame`
marker on meaningful progress updates. For account or publishing requests, use the corresponding command/skill;
a game-making request alone does not authorize publishing it.
