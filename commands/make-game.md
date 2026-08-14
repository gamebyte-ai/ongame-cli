---
name: make-game
description: Give a game concept; ongame produces a playable game via personalized intake → adaptive phase pipeline.
---

# /make-game [concept]

`$ARGUMENTS` **may hold a game concept, may hold something else entirely, or may be empty.** This is the plugin's
single front door: it is how a user starts a new game AND how they come back to one they are already building. Do not
assume the argument is a concept, and never invent a concept to fill an empty one — **step 0.5 decides which door you
are in** before anything else runs. Then follow the flow below **in order**.

> **🎮 ongame presence (do this throughout).** This is an ongame build — keep it gently visible so the user
> always knows ongame is doing the work. Prefix your phase/progress headlines with a small `🎮 ongame`
> marker (e.g. *"🎮 ongame · concept — sharpening the hook…"*), not on every line — at phase starts, gates,
> and the finish. Keep it light, never spammy. (Optional: the user can also enable a build-time statusline
> marker with `/ongame-statusline on`.)

**MCP server (one):** the plugin wires a single `ongame` MCP server (the ongame-cli binary). It presents
ALL tools in one list — runtime namespace `mcp__plugin_ongame_ongame__<tool>` — in two families:
- **Cloud tools** (require sign-in; appear only when authenticated): the orchestration + generation tools —
  `profile_get`, `profile_record_build`, `intake_context`, `intake_build_plan`, `plan_segments`, `state_init`,
  `state_get`, `state_advance`, `approve_phase`, `record_iteration`, `trace_emit`, `brain_recall`,
  `brain_capture`, `brain_reinforce`, `brain_score`, `friction_report`, `levels_generate`, `knowledge_get`,
  `knowledge_list`, `forge_request`, `sound_request`, `telemetry_provision`, `upgrade`, `billing_status`,
  `usage_status`, `set_spend_cap`, and more.
- **Local tools** (always present, token-less, run on the user's machine): `scaffold_materialize`,
  `preview_start`, `preview_stop`, `assets_materialize`, `telemetry_inject`, `reference_upload`,
  `jury_materialize`, `gate_render`, `publish_upload` — plus **`login`** (below).

  `reference_upload(gameDir, path, uploadUrl, token)` is the one that turns a picture ON DISK into an
  anchor you can generate against: `forge_reference` hands you `{uploadUrl, token}`, this sends the bytes,
  and you get back the `assetId` to pass as `editOf` (assets RULE 0). Reach for it only when the reference
  is a LOCAL FILE — an `assetId` or a public URL goes straight into `editOf` with no upload at all.

  **If a tool named here is absent from your session, that is a STALE INSTALL, not a missing feature** —
  say so and ask the user to reinstall the plugin (and restart, since local servers load at session start).
  Do not hand-roll a replacement: it works once, teaches nobody, and hides that everything else in this
  document is also older than it looks.

**🔑 Sign-in (`login` tool) — the ONE auth path.** If the cloud tools are missing from the tool list (fresh
install, or a call reports a missing/expired token): tell the user *"I'm opening your browser to sign you in
to ongame — complete the sign-in there and I'll continue"*, then call the **`login`** tool. It opens the
browser OAuth flow, waits, and on success the full cloud tool set appears in THIS session automatically (the
tool list refreshes live — no restart). It is idempotent (already signed in → returns immediately, no browser).
On `{ ok:false }` relay the typed `reason` honestly; on `coreReachable:false` say the sign-in worked but the
backend is momentarily unreachable — retry later, and continue with what the local tools allow meanwhile.

**💎 Monetization — surface upgrade value naturally (you decide when; never a scripted line).** Crown-jewel tools
return context you should weave into the build narration — do NOT silently swallow it:
- **Free build (`gated: true` + an `upgrade` object):** the tool withheld a Pro capability and used a fallback. Tell the
  user, in your own words, what Pro would have done better and that they can unlock it — e.g. *"On the free tier I can't
  pull the curated genre know-how, so I'm using general knowledge; as Pro I'd build on proven patterns."* Source it from
  `upgrade.message`/`unlocks`; keep it brief, honest, value-framed, and at natural moments (assets, levels, knowledge) —
  not on every call. To convert, call `upgrade` → it returns the **account console URL**; share it ("open this to pick a
  plan and pay — your plan unlocks automatically after checkout"). Card entry + plan/overage/cap management all live there.
- **Paid build hitting a limit (`limitReached: true` + `upgrade`):** generation paused — the plan's included usage is
  spent (`reason:'limit'`) or the user's spend cap is reached (`reason:'cap'`). Relay the doors: enable pay-as-you-go
  overage / set a cap (quickly with `set_spend_cap`, or in the console via `upgrade`), or move up a tier (console). For a
  cap hit, note NO charge occurs beyond their cap. Offer `usage_status` so they see what's left + when it resets.
- `upgrade` (→ console URL) / `billing_status` / `usage_status` / `set_spend_cap` are OPEN on every tier — always callable.

In this document tools are referred to by their **short names** (e.g. `profile_get`, `state_init`). If a short
name cannot be called directly, use the **bare tool name** to find it via ToolSearch and call it by its actual
namespaced name.

**Addressing:** cloud orchestration tools key on a server-minted **`buildId`** (captured from
`state_init`'s return — see step 2). Local file/preview tools key on the absolute **`gameDir`**
(derived in step 1.5). Pass the right key to each.

## 0. Preflight (BEFORE the pipeline, always)

Nothing to compile or install — the plugin's MCP server is the self-updating `ongame-cli` binary. Two quick
checks, both usually instant:

1. **No `ongame` tools at all in the tool list** → the CLI binary isn't installed on this machine. Tell the
   user to run the one-line installer for their platform and start a new session. Show BOTH lines — this
   preflight is exactly the state every new user is in, and you cannot reliably tell which OS they are on:
   - macOS / Linux: `curl -fsSL https://cli.ongame.ai/install.sh | sh`
   - Windows (in PowerShell): `irm https://cli.ongame.ai/install.ps1 | iex`

   Do not attempt to install it yourself from here. On Windows do **not** reach for the Bash tool — it is not
   even registered there unless Git for Windows is installed.
2. **Local tools present but cloud tools missing** → not signed in (or the backend was briefly unreachable at
   startup). Use the **`login` tool** per the Sign-in block above — the cloud tools appear in-session, then
   continue.

### 0.1 Verification setup (browser) — the honesty gate for "playable"

ongame can build and preview a game, but **seeing, testing and verifying it needs a real browser** (screenshot,
console, click-to-play). `preview_start` only returns a URL — it cannot, on its own, prove the game renders, catch a
black screen, read a console error, or detect a phantom asset load (a missing file the server answers with
`200 text/html`, so the loader fails silently and the console stays clean — **a clean console is NOT proof anything
worked**). Most real bug classes are only visible this way.

**The browser TOOLS ship with the plugin** — the `playwright` MCP is declared in `plugin.json`, so
`browser_navigate` / `browser_take_screenshot` / `browser_console_messages` / `browser_evaluate` are available every
session (find them with ToolSearch). The only thing that can be missing is a **browser binary** for those tools to
drive. The SessionStart hook already reported which case you're in (a `system-reminder` noting verification is *ready*
or *not yet enabled*). Act on it:

- **Browser present (hook said ready, or a `browser_navigate` smoke succeeds) →** proceed normally; the code and polish
  gates run real verification and record evidence.
- **No browser yet (hook said not enabled, or the first `browser_navigate` errors/times out) → ASK the user once, then
  set it up** (this is a first-run setup, so consent matters — do not silently download). Via `AskUserQuestion`:
  *"ongame verifies your game in a real browser — screenshots, console errors, click-through — which is how it catches a
  black screen or a broken asset that a clean compile hides. Enable it? It's a one-time browser setup (~tens of MB via
  `npx playwright install chromium --only-shell`, cached and reused after that; or if you already run Google Chrome,
  ongame can reuse it with no download)."* Options: **Enable (recommended)** / **Skip for now.**
  - **Enable →** run the setup with Bash (`cd` anywhere writable): `npx playwright install chromium --only-shell`
    (fall back to plain `npx playwright install chromium` if `--only-shell` is unsupported). If the MCP was just
    provisioned this session, note the tools may need a **CC restart** to load; otherwise proceed to verify.
  - **Skip →** honor it gracefully, and **warn plainly** (per the user's own guidance — declining is fine but has a
    cost): *"Okay — without the browser I can build your game but I can't verify it actually runs, so I can't
    confidently call it playable, and my quality checks are weaker (I'm working blind to the real look and to runtime
    errors). You can enable it anytime and I'll verify then."* Do not re-ask every phase.

When verification is unavailable (skipped, or present-but-unusable), the code-phase `playable` gate and the polish
screenshot degrade to **`unverified`** (see those phases — `unverified` SKIPS the score, it is not a failing `0`), and
you must **never claim the game is "playable", "working", "complete", or "shipped" without evidence you actually
looked** — say *"built, not yet runtime-verified"* instead. **Degrade, never hard-block:** a missing/declined/broken
browser never stops the build.

This is a *capability* prerequisite, **open on every tier** — not a paid gate.

### 0.2 Unity, when Unity is what they work in

The browser gate above is the web path's version of "can you actually see what you made". **Unity has the same
problem and a different answer**, and without the Unity MCP connection you cannot see the Editor at all: you can
write C# to disk and know nothing about whether it compiles, whether a scene holds what you think, or whether
anything renders. A folder of scripts reported as a working Unity game is the same silent substitution the
refusal rule exists to stop.

**Judge whether Unity is even in play** — do not ask everyone, and do not decide by keyword:

- The directory holds `ProjectSettings/ProjectVersion.txt` or an `Assets/` tree → this IS a Unity project.
- The user says Unity, or asks for a mobile/desktop/editor build that implies it.
- **A genuine first run** (`intake_context.returning === false`) with no signal either way → you may ask ONCE,
  in one line, as part of getting to know them: *"Do you build in Unity? If so I can set up the Editor
  connection now so I can actually see and test what I make — otherwise I'll assume the web path."* One
  question, then drop it. Never re-ask a user who has already told you.

**If Unity is in play and the Unity tools are NOT in your tool list**, offer to set it up before starting the
pipeline — with `AskUserQuestion`, and say what it buys them rather than naming packages: *"I can't see your
Unity Editor from here, so I'd be writing code blind. Want me to walk you through connecting it (a few minutes,
one-time)?"* On yes, follow **`skills/unity/SKILL.md`**, which carries the per-platform install, the official
Unity MCP setup, and the CLI. On no, continue — but you are now on the honesty rule: say plainly that Unity
output will be **unverified**, and do not describe it as working.

If the Unity tools ARE present, say nothing about setup and get on with it.

Open on every tier, same as the browser gate.

## 0.5 Entry triage — WHICH DOOR (before intake, always)

`/make-game` is the only entrance, so most of the time it is NOT being used to start a game from nothing. The user is
standing inside a game they are already building and wants a feature, another batch of levels, a bug gone, an ad cut
from it. Walking that user through "what's your concept?" is the wrong question asked confidently — and worse, the
new-build path would create `games/<slug>/` next to their project and scaffold a baseplate over the game they already
have.

**So the first thing you do is LOOK, not ask.** Judge whether a game already exists here — agentically, from evidence,
never from a keyword in `$ARGUMENTS`:

- **The workspace.** Is the directory you are in a game? A `package.json` (especially one depending on
  `@gamebyte/gamelabsjs`, three.js, pixi, phaser), a `src/` with game code, `index.html`, an `.ongame/` directory
  (an ongame build has been run here), `ProjectSettings/`+`Assets/` (Unity), `project.godot`. Read the README and the
  recent `git log` — they usually say what the thing is in one line.
- **The conversation.** You may already be deep in a session about this game. That context counts as evidence.
- **The account.** `games_list()` (`ongame`) returns this user's prior games (concept, `gameId`, `buildId`,
  newest first); `game_summary({ nameMatch | path })` resolves one. Use it to recognise the game you are standing in
  and to recover the `buildId` to continue from. A game built by hand or before the plugin simply will not be there —
  that is fine and expected, not a blocker.
- **`$ARGUMENTS` when non-empty.** It may itself be the answer ("add a boss fight", "fix the jump", "make a playable
  ad from this") — a request about an existing game, not a concept for a new one.

Then land on one of three, and say which in one sentence:

1. **CONTINUE (a game exists here).** Do NOT guess what they want done to it — the possibilities are genuinely
   different kinds of work and picking wrong wastes a whole pipeline. **Ask, with `AskUserQuestion`**, unless
   `$ARGUMENTS` or the conversation already states the intent plainly (then confirm in one line and move). Build the
   options from `intake_context(...).intentOptions` — each carries a plain-language `summary` and a
   `suggestedPhases` starting point: *feature · content (levels/waves/items) · bugfix · polish · art · performance ·
   ship · derive (e.g. a playable ad from this game) · other*. Show the four or five that actually fit what you found
   (a game with no deploy setup does not need `ship` offered first), and **always leave a way out to "start a
   different, new game"** — the user may genuinely be here for that. If they pick something the list does not cover,
   that is `other` + `notes`, not a forced fit.
2. **NEW with a concept.** `$ARGUMENTS` holds a real game concept and no existing game claims this session. Proceed as
   a new build.
3. **NEW with nothing.** Empty arguments, no game here. NOW ask for the concept — this is the one case where that is
   the right question. (Offer the shortcut of pointing at an existing project, in case they meant to run this
   elsewhere.)

Carry the outcome into intake as `entry` (`new` | `continue`) + `intent` + the game you identified. Everything below
that says "the game" means the SAME game on a continuation — same `gameId`, same directory, nothing scaffolded over.

## 1. Intake (Phase 0 — always, BEFORE the pipeline)

Apply `skills/intake/SKILL.md`. Output: an approved **BuildPlan**
(produced via the `intake_build_plan` tool). Put the answers asked (genre/mechanics)
into the `notes` parameter (so they don't get discarded).

> **Data-collection notice (show ONCE, in the first intake message):** include this line verbatim at
> the end of your first intake reply — *"ℹ️ Build details (your requests, phase outputs, quality
> scores) are recorded to your account to operate and improve the service."* Do not start emitting
> `user.prompt`/`user.feedback` (step 2) if the user objects — continue the build without prompt
> capture and note their objection.

## 1.5 Set up game-dir + worktree (AFTER intake, BEFORE state)

> **ON A CONTINUATION (`entry='continue'`), THIS WHOLE SECTION IS REPLACED BY THREE LINES** — the game already has a
> directory, a slug and a git history, and creating a second one would fork the user's project in half:
> 1. `gameDir` = **the existing project's absolute root** (the directory you identified in §0.5 — normally the one the
>    user is in, not `games/<slug>`). Never `mkdir` a new game directory, never `git init` over their repo.
> 2. `gameId` = the game's EXISTING slug — from `.ongame/`, from `games_list()`, or the project's own directory/package
>    name. Reusing it is what keeps every build of this game joined; a fresh slug silently splits its history and its
>    asset catalog in two (that split has happened before and cannot be repaired after the fact).
> 3. **Nothing is scaffolded.** `scaffold_materialize` copies the baseplate over `gameDir` and renames identifiers —
>    run against a real project it overwrites files the user wrote. The code phase's STEP 0 is skipped on a
>    continuation (see `skills/phases/code/SKILL.md`); if you find yourself about to scaffold, you are in the wrong
>    door.
>
> Then continue at §2.

1. **Derive slug:** convert the concept to a slug (`match-3` → `match3`, lowercase, alphanumeric).
2. **Determine gameDir + set up a clean directory:** `gameDir = <repo>/games/<slug>/`.
   - `mkdir -p games/<slug>` (a plain directory).
   - ⚠️ Do NOT use `git worktree add`: a worktree becomes a checkout of the ongame repo
     (all ongame files come along) — it is NOT a clean game project. The game is its own
     **standalone** project.
   - Add `games/` to the containing repo's `.gitignore` (the game is ongame's build output,
     not its source — it must not pollute the repo).
3. **Scaffold the baseplate:** the **code phase's STEP 0** calls `scaffold_materialize(gameDir=<gameDir>,
   gameName=<display name>)` (`ongame`) — it copies `templates/gamelabs-base` into `gameDir`, renames every
   `MyGame*` identifier → PascalCase(`gameName`) (across file contents + names + the package `"name"`), then the phase
   runs `npm install` and builds on top. Do NOT hand-copy the template here — the scaffold tool owns the copy+rename so
   every build inherits the wired App/DI/screen frame and the three pre-solved gamelabs.js pitfalls (`.layer` CSS,
   `.layout` on screen views, postInitialize/onResize timing). gamelabs.js is a 2D AND 3D engine
   (PixiJS v8 HUD + three.js world3d); the concept decides the dimension — do not assume 2D-only.
4. **Make the game its own git repo:** `cd games/<slug> && git init` (standalone, shippable).
5. Keep this **absolute `gameDir`** path fixed for the local file/preview tools
   (`preview_start`, `preview_stop`, `assets_materialize`, `telemetry_inject`). The cloud
   orchestration tools do NOT take `gameDir` — they key on the `buildId` minted in step 2.

The game's own `.gitignore` (from the template) covers `node_modules/`, `dist/`.

## 2. Initialize state (capture the buildId)

> **CONTINUATION — CHECK THE PLAN CAME BACK AS ONE, before anything writes.** On `entry='continue'`, read the plan
> `intake_build_plan` returned: it must carry `entry: 'continue'` (plus your `intent`). If it does NOT, you are
> talking to a version of ongame that predates the mid-entry door and silently dropped those fields — and a plan that
> reads as a new build is exactly what makes the code phase scaffold the baseplate over the user's project. **Set
> `entry`/`intent`/`continues` on the plan object yourself before passing it to `state_init` and to build.js**, and
> say plainly that the build record may not capture the continuation until the backend catches up. Never proceed on a
> continuation with a plan that says `new`.

Call `state_init(gameId=<slug>, plan=<BuildPlan>)` (`ongame`) — on a continuation `gameId` is the game's
**existing** slug, so the new build lands in the same game's history rather than starting a second one. It
**returns `{ buildId, state }`** —
**capture the `buildId`** and thread it through the whole build (every later cloud orchestration call
addresses by it; the tenant is taken server-side from the OAuth token, never passed). Then
`trace_emit(buildId=<buildId>, name="build.start", payload={path:<plan.path>})`, followed by
`trace_emit(buildId=<buildId>, name="user.prompt", payload={output:<the user's VERBATIM /make-game request + any
intake answers they gave>})` — this persists what the user actually asked for onto the build record (concept alone
is a distillation; the record needs the source).

> **Hierarchical observability (build trace):** `build.start` + each `phase.<x>.start/done` open/close the
> build's phase spans **server-side** (the build doc holds the active phase span), forwarded to the
> backend. There is **no local build-ctx file** — to bind memory/score emissions to the active phase span, simply
> **pass `buildId`** to the `brain_recall/capture/score` calls (gate + code skill below). Core resolves the live
> span from the build doc. This way "which memory was used/updated in which phase + quality" appears in a single
> replayable tree.

## 2.5 Provision the phase jury (once, for under-the-hood auto-review)

Call `jury_provision(buildId=<buildId>)` (`ongame`) — it mints a hook token BOUND to this build (a stale/copied jury.json cannot review a different build). On `{ provisioned: true, token,
coreUrl }`, call `jury_materialize(gameDir=<gameDir>, coreUrl=<coreUrl>, token=<token>, buildId=<buildId>, gameId=<slug>)`
(`ongame`) — it writes `${gameDir}/.ongame/jury.json` (creating `.ongame/` + a self-ignoring `.gitignore`).

This lets the CC hook automatically send each phase's main artifact to the jury as it is written — the agent cannot
skip it or see the wiring. If it returns `provisioned: false` (free/unknown tier or no server auth), **do NOT write
jury.json** — the hook stays inert (graceful degrade). If `jury_materialize` returns `{ error }`, continue WITHOUT
jury.json (the hook stays inert — never block the build on it). Do this ONCE here at build start; the hook reuses the
file for every phase.

## 3. Segment + gate pipeline (gate state machine)

`plan_segments(plan=<BuildPlan>)` (`ongame`) → `{ A, B }` (A = research/concept up to
concept; B = the remaining docs/code/[levels/polish/deploy]).

> **🔁 Correction-learning — `friction_report` (feed the DELTA, the highest-value signal).** Whenever, at a gate or
> mid-phase, the **user CORRECTS the agent** — rejects a phase, asks for it "again", redirects the direction, hand-edits
> the agent's output, or repeats the same ask because the result missed — call
> `friction_report(buildId, gameId?, phase, kind, agentDid, userWanted, evidence?)` (`ongame`). This is "feeding
> data" — squarely within the client mandate. **Agentic, NOT a hardcoded threshold:** YOU judge whether a *real
> correction* happened (a clarifying back-and-forth or your own polish is NOT a correction — only a place where the
> user steered you off what you produced). Fail-soft: if `friction_report` is unavailable/errors, never block — just
> continue.
> - `kind` ∈ `rejection | iteration | redirect | user-edit | repeat` — what kind of correction it was.
> - `agentDid` = what you originally did / **assumed** (e.g. "generated a bright cartoon palette, fast-paced").
> - `userWanted` = what the user steered it to — **the DELTA, the actual signal** (e.g. "wanted a muted retro palette,
>   slower/strategic pacing").
> - `evidence` = an optional quote of the user's words or a diff snippet of their hand-edit.
> - **Report the user-correction DELTA — NOT a self-summary of what you built.** The agent already knows what it wrote;
>   the learning comes only from "agent assumed X → user actually wanted Y". Do not restate your own output as a "lesson";
>   if the user did not correct you, do not call it. One report per distinct correction (don't spam the same delta).
> - The backend (brain) decides agentically whether the delta generalizes into a stored lesson and at what scope — the
>   client only reports the raw delta; it does not pre-judge the lesson.

### Run Segment A
Call the `Workflow` tool **with an absolute `scriptPath`** (the plugin `workflows/` directory
is NOT an auto-registered workflow — it cannot be called by `name`, `scriptPath` is mandatory):

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/build.js",
  args: { plan: <BuildPlan>, phases: <A>, buildId: <buildId>, gameDir: <gameDir>, pluginRoot: "${CLAUDE_PLUGIN_ROOT}" }
})
```

build.js iterates over the filtered list; each phase does `state_advance(buildId)` (core) and writes via the
local tools with `gameDir`. (This slash-command instruction counts as a Workflow opt-in — the Workflow tool is usable.)

> **MODELS & ORCHESTRATION SHAPE — YOUR judgment, per build.** Don't run every phase on the session's top-tier
> model by default. Pass an optional `models: { <phase>: '<model>' }` in the args, composed from three inputs:
> the phase's weight (creative/engineering-heavy phases — typically concept/code/polish — deserve the stronger
> model; orchestration/transform phases usually don't need it), the build mode (a prototype tolerates lighter
> models than production), and **the user's stated preference, which outranks both**. A phase absent from the
> map inherits the session model. The same judgment applies to the run's SHAPE: build.js (sequential, one agent
> per phase) is the default runner, not a cage — when the job genuinely calls for a different structure (e.g.
> independent parallelizable work), you may author a purpose-built workflow script instead; keep ONE writer per
> gameDir (writer.lock, code SKILL §1.5) whatever the shape.

> **PHASE CLOSURE = EVIDENCE, not the workflow result.** A `completed` (or handed-off/partial) return from
> build.js is NOT proof a phase finished — a phase agent may have died mid-write or handed off with the
> phase still open. Before presenting the next gate, verify closure with
> `state_get(buildId)`: the phase is in `completed` and its output evidence exists (the phase's artifacts on
> disk; for `code` additionally `tsc --noEmit` clean). If the evidence is missing, the phase is OPEN — finish
> the closure yourself (run the checks, then `state_advance`) or re-run that phase; never gate on a phantom.

> **GATE PRESENTATION (all gates):** at every approval gate compose ONE approval artifact — YOU judge what
> belongs: build plan/status (phases done/pending), corrections applied this iteration, this gate's phase
> outputs (concept/docs excerpts; the preview URL at gate 2), generated images INLINE, and the concrete
> approval questions. **Categorized asset review — when the gate shows MULTIPLE generated assets, group them
> under clear section headings by kind** (e.g. "2D Art" / "Sprite Sheets" / "3D Models" / "Characters" / "Sound")
> instead of one flat list — the sections are the forge `AssetResult.kind` values (`2d-static`/`sprite`/
> `3d-static`/`3d-char`) plus `sound` for anything from `sound_request`. A single-kind gate (e.g. the concept
> anchor alone) needs no sections — group only once there is more than one kind to tell apart. Mechanics: Write
> `${gameDir}/.ongame/gates/gate-<n>.html` (self-contained, no external refs; plain relative
> `<img src="../../assets/forge/x.png">` — never inline base64 yourself) → `gate_render(gameDir, path)`
> (`ongame`) → publish the returned `.embedded.html` via the CC **Artifact** tool (stable favicon per
> build; redeploy the SAME file path on gate iterations so the URL stays put).
> **Never include `.ongame/` contents** (jury.json token, build internals) in the gate HTML. FAIL-SOFT: if
> `gate_render` or the Artifact tool is unavailable or errors, fall back to the plain-chat summary + image
> paths and continue — a broken artifact path never blocks a gate.

### GATE 1 — after concept (always)
Read the state with `state_get(buildId)` (`ongame`). Present the concept output (`docs/CONCEPT.md`) +
the forge placeholder image per the **GATE PRESENTATION** block, with a **natural question**. Ask for
approval/changes.

- **If they request changes → re-run only the changed phase(s):** call `record_iteration(buildId, phase)` —
  it **re-opens the phase server-side** (drops it from `completed`/`approved`, sets it current) so the re-run
  **regenerates** instead of verify-and-skipping the rejected artifacts. ⚠️ **Call it ONLY immediately before the
  actual build.js re-invoke, never speculatively at rejection time** — if the user then approves without a re-run,
  the rewound `currentPhase` makes every later `completed`-push lag one phase behind for the rest of the build.
  Then re-invoke build.js with `phases: [<only the phase(s) to redo>]` and
  `notes: <the user's correction — verbatim quote + your read of the delta>` (plus `buildId` + `gameDir` +
  `pluginRoot` as before). Do **NOT** pass the `completed` arg on a re-run (build.js filters on it and would skip
  the re-opened phase; the server now owns re-opening — you pass only the phases to redo). In practice **only
  `concept` re-runs** — `research` is simply not in the list.
  **A change request here is a correction** — if it reflects the user steering you off what you produced (not just a
  clarification), also call `friction_report(buildId, gameId, phase, kind, agentDid, userWanted, evidence?)` with the
  DELTA (see the correction-learning block above), then re-run.
  Before the re-invoke, also emit `trace_emit(buildId, name="user.feedback", payload={output:<the user's
  correction VERBATIM>, metadata:{phase}})` — the correction is part of the build record (what the user asked
  to change is as much "the prompts" as the original request).
- **Once approved → continue:** call `approve_phase(buildId, phase)` to mark the phase approved (gate state
  machine), move on to Segment B.

> **"Enough iterations" = an explicit user approval signal** (not a counter):
> the user says "ok/approve" OR after a few revisions you ask
> "ship it, or keep tuning?" No silent auto-advance.
> `state_get(buildId).iterations[phase]` is the revision count — read it at the gate so you SEE how many
> rounds this phase has taken when judging whether it's time to ask.

> **`brain_score` at every gate (EVAL — quality measurement):** when a phase is approved, **measure that phase's**
> quality:
> `brain_score(gameId=<slug>, phase=<phase>, value=<0-1>, buildId=<buildId>)` (`ongame`; the tenant is taken
> server-side from the OAuth token). Passing `buildId` automatically binds the score to the currently **active phase
> span** (the hierarchical tree; core resolves the span from the build doc — YOU do not read any local file). YOU
> judge the `value`: approval on the first try ≈ **1.0**, **lower it** on each revision iteration, and ≈ **0.2** if it
> struggled a lot / was rejected. This way "which phase's recall context produced good output" is measured on that
> span; future builds learn from it. If there is no active span it falls back to flat automatically. If brain is
> missing it is a no-op.

### Run Segment B
The same way: `Workflow({ scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/build.js",
args: { plan, phases: B, buildId, gameDir, pluginRoot: "${CLAUDE_PLUGIN_ROOT}" } })`.

### GATE 2 — after code (playable check)
When the `code` phase finishes, call `preview_start(gameDir=<gameDir>)` (`ongame`) → show the
returned URL in the browser; present per **GATE PRESENTATION** (embed the playable-check context + URL).
Confirm playability with the user. If they request changes,
re-iterate only the `code` (and if needed `docs`) phase — same re-run mechanics as GATE 1 (including the
`user.feedback` trace_emit with the verbatim correction):
`record_iteration(buildId, phase)` immediately before the re-invoke (it re-opens the phase server-side),
then build.js with `phases: [<phase(s) to redo>]` + `notes: <the correction>`, **without** the `completed` arg.
**If the change is a correction** (the gameplay/feel/mechanic missed what the user wanted, they ask for it "again", or
they hand-edit your code), call `friction_report(buildId, gameId, phase="code", kind, agentDid, userWanted, evidence?)`
with the DELTA before re-iterating (correction-learning block above). This is the highest-friction gate — the
code-feel delta is the most valuable signal. **Before re-iterating on a reported bug, apply the root-cause
discipline (§4): diagnose why it broke and fix the cause, don't patch the symptom.**

### GATE 3 — production-tail (only on the production path)
If `plan.path === 'production'`, at the end of the tail phases (`levels`/`polish`/`deploy`)
at least one gate: present the polished output per **GATE PRESENTATION**, ask for approval. (The production
path is not gate-free.)
If the user corrects the tail output (rejects/redirects the levels difficulty curve, the polish/feel, or hand-edits),
call `friction_report(buildId, gameId, phase, kind, agentDid, userWanted, evidence?)` with the DELTA before
re-iterating (correction-learning block above). Re-runs use the same mechanics as GATE 1: `record_iteration`
immediately before the re-invoke, `phases: [<phase(s) to redo>]` + `notes`, no `completed` arg.

## 4. Phase execution

Each phase runs according to `skills/phases/<phase>/SKILL.md`. Phase skills call the `ongame` tools
`knowledge_get` / `knowledge_list` and `forge_request({kind, prompt, …})` as needed. **Forge is a two-step
hybrid:** `forge_request` returns a base64 asset **manifest** `{assets:[…]}` (NO path, NO disk write) → then call
`assets_materialize(gameDir, assets)` (`ongame`) → `{paths}`; use **those** returned paths. (Audio is the
same shape: `sound_request({prompt, …})` → `assets_materialize`.) Each phase leaves a trace via
`trace_emit(buildId=<buildId>, …)` (`ongame`) and advances with `state_advance(buildId)`.

> **NEVER generate a visual cold — anchor it to what already exists.** This holds for EVERY asset request, not
> only inside the `assets` phase: a one-off ask mid-build, and above all a request on a game that already exists
> ("add a boss", "one more icon"). That later case is where it gets dropped and where it costs most — an
> unanchored generation comes back in a different language and the game visibly stops being one game.
> Before any `forge_request`/`forge_batch`: look at what this game already has
> (`asset_library_list({ gameId })` — the user already paid for those and they define the look), the concept
> visuals, `docs/ART_DIRECTION.md`, and anything the user supplied. Pass the best match as `editOf` and write the
> prompt for the DIFFERENCE only. Prompt-alone is acceptable only when nothing relevant exists — and then say so
> in one line, because that is exactly when the result is most likely to look foreign.
> Full rule + the reference-hunting order: `skills/phases/assets/SKILL.md` RULE 0.

**MODE-AWARE DEPTH + the LOCKED priority.** The phase SET is already mode-filtered
(`PHASES_BY_PATH`), but the DEPTH *within* each phase bends to `plan.path` (the mode), and every phase obeys the locked
priority order: **`first-working-output > graybox-first > honor-explicit-instructions > polish-later`**.
- **prototype** → race to a runnable graybox with minimal feel; skip depth/polish. (first-output is #1 — most
  users abandon before ever seeing a playable, so a runnable thing FAST beats a polished thing slow.)
- **production** → the full bar (feel, polish, depth, all systems).
- **playable-ad** → the hook + the core playable moment, short and conversion-shaped (dress runs early here).
Phase skills read the mode from the build state and calibrate accordingly (see each `SKILL.md`'s mode-aware note).
Always HONOR an explicit/repeated user instruction over any default.

**Per-phase commit checkpoints (rollback safety).** The game is its own git repo (§1.5), and each phase commits
its own output once **that phase's own SKILL verification passes** (its `tsc --noEmit` clean / smoke / file-write
check — NOT any later user-approval gate) — this is WIRED INTO THE PHASE RUNNER: `workflows/build.js` instructs
every phase agent to commit `gameDir` with git run **in `gameDir` as the working directory** (`Bash` `cwd`, never a
string-concatenated `cd`), fail-soft if git isn't set up. So the checkpoints exist even for phases you never see
directly (they run inside the Workflow segment). The payoff: a later phase or a bad re-iterate can be rolled back to
the last good phase, and history shows what each phase changed. When YOU run a phase or a gate re-iterate directly
(outside build.js), make the same commit yourself (git with `cwd={gameDir}`). Do not defer to one lump commit at the
end.

**Iterating on a bug or a user correction — root cause first (do NOT symptom-patch).** When a phase re-runs because
something is broken or the user corrected it, diagnose BEFORE editing: what is the actual root cause (a wrong
assumption? a recent change in a prior phase? an asset/API that isn't what you assumed?), is the error where it
looks or is it a side effect, and will your fix add new breakage? Fix the *cause*, minimally — not the symptom.
Two failed attempts on the same bug → stop and re-diagnose rather than pile on more patches. (This is the
highest-friction moment of a build; a symptom-patch here is what makes a game feel subtly broken later.)

## 5. Finalizer (path-agnostic, records on EVERY path)

No matter which path the build ends on (including concept-only — **every terminal path**), run the
finalizer below — do NOT tie `profile_record_build` to a code-only "finish":

**Live finalizer guidance (do this FIRST, fail-soft):** before step 0.5, call
`prompt_get({ phase: 'finalizer' })` (`ongame`) — **required whenever the cloud side is reachable**, not
optional: skipping it silently runs the whole finalizer on bundled defaults and makes a live override
inert. If it returns a non-null `override`, that is the
AUTHORITATIVE guidance for ALL the closing steps below (the live, optimized version) — follow it instead of
the defaults. It must be fetched before step 0.5, not later: an override that changes the polish offer or
the recording behaviour is useless once those have already run. Null / unavailable / error / gated → follow
the defaults below. Never block on it.

0.5. **Offer the visual polish loop — FIRST, before anything below records the build.** A build that plays
   correctly still usually *looks* like a prototype: the chrome, lighting and character motion were authored
   blind, never checked against the running game. Ask the user, via `AskUserQuestion`, whether they want a
   visual polish pass: screenshot the real build → redesign the UI chrome from that screenshot → slice it
   into runtime assets → re-screenshot and compare. Mention it costs asset generations and takes a few
   minutes, so the answer is genuinely theirs. This is **extra** polish on a build that is already done — ask
   politely, name the screens you think are weakest so the offer is concrete, and take "no" gracefully.
   **Describe that build honestly (§0.1):** "an already-finished, playable game" only if it was runtime-verified;
   if verification was degraded (no/unusable browser tool) say "a build that's done but not yet runtime-verified"
   — never call it finished/playable in the offer when you never looked.
   Ask **even if** polish Sub-phase 9.5 already ran a pass — a further round on the weakest screen is often
   the biggest visible win. **If they accept:** call `knowledge_get({ key: 'pattern:visual-polish-loop' })`
   (`ongame`) and run the loop it describes, then show the before/after and offer again. Skip the
   question only when there is nothing to look at (concept-only, or no runnable build).
   **If `knowledge_get` returns `gated: true`:** do NOT improvise or reconstruct the loop from general
   knowledge — the value is the specific proven recipe, and a half-version yields worse assets than doing
   nothing while still spending the user's forge budget. Then read WHICH gate fired: `rateLimited: true`
   (no `upgrade` payload) is a *paying* tenant who hit the crown-jewel read limiter — never pitch an upgrade
   at them; say the recipe is momentarily unavailable and retryable. An `upgrade` payload present means free
   tier — say plainly that the guided pass is a paid capability and relay those doors. The question is shown
   to everyone on purpose; only the pass itself is paid.
   **Why this runs first:** everything below is the build's *terminal record* — `brain_capture` learns from
   the trajectory, `build.done` closes the trace, and the git commit captures the files. If an accepted
   polish pass ran after them, the record would mark the build complete before its final assets existed and
   the pass's outcome would fall outside the trace entirely. Offer first; record what actually shipped.
1. `profile_record_build(concept=<plan.concept>, path=<plan.path>, gameId=<slug>, buildId=<buildId>)`
   (`ongame`; the tenant is the verified OAuth identity — no `gameDir`). `buildId` is the UNIQUE join key from
   this ledger entry to the build record (`game_summary` uses it; `gameId` groups re-builds of the same game).
   This grows the raw history (`priorGames`) so that the next intake agent can judge
   the user's direction from history (personalization works on day 1).
1.5. **`brain_capture`** (`ongame`; learn): write the **real** lesson that comes out of this build's
   trajectory. Most of the time `scope:"user"` ("this user prefers this direction/preference"; the tenant is the
   verified OAuth identity, not passed), or `scope:"game"` when it is true only of this game.
   Pass `buildId` to nest it under the build's span. YOU judge the scope/content; do not produce a fake lesson.
   - **A lesson bigger than one user — craft knowledge the whole platform should have — still gets captured
     as `user`, AND you say so to the person in one line.** Writing to the shared pool is not something a
     client does; telling them is the actual route into the product, and it is the step you cannot take
     alone. Do not hunt for a way around it and do not report it as a failure.
2. `trace_emit(buildId=<buildId>, name="build.done", payload={path:<plan.path>})` (`ongame`).
3. Make a final git commit in the game project (the per-phase checkpoints from §4 should already exist; this
   captures anything since the last phase). If git isn't set up, skip silently.
4. Summary to the user: the path produced, the gameDir, and (if any) the preview URL.
5. **Account footer (one line, always).** Close the build with a light usage/account line so the user knows
   where they stand and where to manage it — this is the anchor they'll otherwise never find. Call
   `usage_status` (+ `billing_status` if useful) and show a single line, e.g. *"🎮 ongame · plan: free ·
   ~35% of this week's included usage left · see or upgrade anytime: https://account.ongame.ai (or run
   /account)."* If usage is unavailable, still give the `/account` + `account.ongame.ai` pointer. Keep it to
   one line; don't pitch — just make "how much do I have / how do I upgrade" easy to find.


## When ongame is not working — REFUSE, do not substitute

**This is the most important rule in this document.** If you cannot use the ongame tools, you must say so
loudly and stop. You must NOT quietly build the game with your own general knowledge and present the result
as an ongame build.

Understand why, because the reasoning is what makes you apply it in cases this text does not list. When you
silently fall back, the user gets a game that *looks* like an ongame output and *is not one*. They judge the
product by it. They report that the quality is poor. Nobody can explain it, because nothing recorded that the
asset engine, the retention curve, the shared learning and the quality gates were never in the room. A
visible failure costs one message. A silent substitution corrupts the only evidence anyone has about whether
the product works — and it is unrecoverable, because by the time someone doubts the output the run is gone.

**First, tell the two situations apart. They are opposites.**

- **`gated` / `limitReached` — NOT a fault.** The tool worked, and answered. The user is on a tier that does
  not include that capability, or has spent the included usage. This is the product behaving exactly as
  designed. Continue the build, use the documented fallback, and mention the upgrade naturally per the
  monetization block. Do not treat this as a breakage and do not make a scene about it.
- **Anything else — a FAULT.** The cloud tools are missing from your tool list; a call errors, times out or
  returns nothing; the `login` tool cannot complete sign-in; the same call fails repeatedly. Here the
  capability did not answer at all. Nothing about the run is what the user asked for.

**On a fault, in this order:**

1. **Stop the pipeline.** Do not start the next phase. Do not "do the concept yourself for now".
2. **Try the honest repair once** — the `login` tool for a missing/expired token; a single retry for something
   that looks transient. One attempt, not a loop.
3. **If it does not come back, say it plainly, in your own voice, at the top of your reply** — not as a
   footnote after a wall of output. Name the tool that failed, what it does, and what the user needs to do
   (sign in, restart the session, install the CLI, check their connection). Be direct that you are blocked;
   do not soften it into something that reads like progress.
4. **Ask before doing anything else** — with `AskUserQuestion`, and state the cost in the options themselves:
   *"I can build this with my own general knowledge instead, but it will not be an ongame build: no generated
   art, no retention curve, no learned patterns, no quality review, and nothing recorded."* Continuing without
   ongame is the user's decision to make, never yours to make quietly.
5. **If they choose to continue anyway, keep saying so.** Label it in the final summary in plain words — *"this
   was built without ongame"* — and do not describe the result as an ongame build anywhere.

**What you must never do:** substitute your own image/asset generation for `forge_request`; invent a
difficulty curve in place of `levels_generate`; write from general game-design knowledge where
`knowledge_get`/`brain_recall` were meant to supply it; skip `phase_review` and call the phase reviewed; or
present any of that as the pipeline having run. If you find yourself reaching for a workaround, that impulse
IS the signal — surface it to the user instead of acting on it.

**A partial run is still a fault.** If ongame worked for some phases and not others, say exactly which ones
did not run. "Mostly an ongame build" is not a thing the user can act on unless they know which parts.
The build workflow returns a `blocked` array for exactly this — phases that reported themselves unable to use
the tooling. When it is present, lead your reply with it; do not summarize the successful phases first and
mention it underneath, because that is how a reader concludes the build went fine.

**One thing does keep working:** the git commit. Whatever state the work is in, commit it so nothing is lost
while the user decides.
