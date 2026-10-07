# Changelog

## 1.7.36 — 2026-10-07

- A publish now boots the game first and refuses one that fails to start. It catches broken asset paths and boot errors; it does not judge whether a game is drawn. When the check cannot run, the game is published and you are told so.
- A publish refuses a page whose HTML points at a file the build does not contain, before any file is sent.
- Paid asset work started outside a build now gets its jury review.
- Claude Code publishes keep the game source again.
- A kept game source never includes a file a .gitignore hides. A publish run from a folder inside the game no longer keeps only part of its source. Without git, no source is kept.
- Ships with CLI 0.2.22.

## 1.7.35 — 2026-10-07

- Glows, light rays, skies and ribbon shading in new games are now drawn as one shape with a smooth gradient fill, so they no longer show visible rings or bands. The polish phase reads the gradient guide before drawing the first one.

## 1.7.34 — 2026-10-06

- Every publish now records the game's GitHub repository on its build, or `none` when the game folder has no remote. Only the host and repository path are sent; a user name, token or port in the remote is dropped on your machine.
- The CLI now downloads a new release in the background and runs it on the next start, so a slow line no longer drops the update. A new release that fails to start falls back to the previous one.
- On Windows, a self-update now waits out a brief lock on the running `ongame` program instead of failing.
- Ships with CLI 0.2.21.

## 1.7.33 — 2026-10-04

- `/publish` and the polish phase now check before publishing: they confirm a build exists for the game and run `precheck.mjs` on `dist/`, which lists every file a publish would refuse at once.
- An imported game that still holds another maker's telemetry config is no longer published with it: the publish stops until that config is removed.
- Every unit of work in `/make-game` opens its build steps, so each build's time and review are recorded.
- Large Unity web games, including `.br` and `.gz` files, publish in one go. Unity builds start from the Unity project.
- A failed upload no longer puts a broken page live: `index.html` goes up last.
- Ships with CLI 0.2.20.

## 1.7.32 — 2026-10-02

- The "Built with onGame" credit is now checked as a phone: the pill leaves when play starts (`window.ongameCredit.leave()`), stays on one line at 360 px, and a game can place it above its own bottom bar. `/make-game` runs the credit and a phone check (pause, background audio, back key, pixel ratio, safe area) before calling a web game done.
- `/publish` and the polish phase pass the new `source` slot through and report it. Keeping a game's source is off for accounts unless it has been turned on for them; when it is off, nothing changes and nothing is said.

## 1.7.31 — 2026-10-02

- Before the levels of a level-based game (puzzle, casual or hybrid-casual stages) are generated or written, `/make-game` now runs a level design step: it decides where the game is hard, where it rests and where a booster is offered, measures the levels against that, has the result reviewed, and keeps it in `docs/LEVEL_DESIGN.md`.

## 1.7.30 — 2026-10-01

- Before writing a game rule (a hit, a match, a merge, a spawn, a jump, a state change), `/make-game` now looks in the mechanics library for verified code first, reads when each one does not fit, and carries the licence note with anything it copies.

## 1.7.29 — 2026-09-28

- Every published game now carries a "Built with onGame" credit: an animated card at launch and a small pill on the first screen that leaves on the first tap. `/publish` adds it before the build and checks the built page for it; `--badge top|off` moves the pill off a game's own UI, and `--wait ready` lets a game with a late first screen say when it is drawn.
- Ships with CLI 0.2.18.

## 1.7.28 — 2026-09-28

- Before writing movement for more than one moving thing (walkers, crowds, units, traffic), point the build at the agent-space guidance: what is floor, wall or a reserved zone, who collides with whom, how routes go round what they must not cross, and how to keep a crowd apart without changing the game's pace.

## 1.7.26 — 2026-09-24

- Add a storyboard step: before the first visual of a multi-scene game or a recurring character, settle the scenes and cast in `docs/STORYBOARD.md` and show it before generating anything. A replica fills it from the reference instead of skipping it.
- Point feel work at the game-feel guidance: which player moments need a response, the recipe for each, and how to check it frame by frame.
- Ships with CLI 0.2.18.

## 1.7.25 — 2026-09-16

- Temporarily suspend automatic workflow creation and phase routing; keep the phase definitions available.
- Let the agent clarify consequential ambiguity and contradictions one question at a time, then work from a structured brief and use a native goal when supported.
- Keep clear requests lightweight and preserve existing game identity and publishing.

All notable changes to `ongame-cli` are documented here. Distribution/plugin-manifest changes
(this repo) and CLI binary releases (tagged `cli-v*`) are both tracked in this one file since
they're released together conceptually, even though the CLI binary's own build lives in a
separate private repo.

## [1.7.24] - Mechanics guidance and instruction integrity

- The code phase and its implementation tasks now consult the mechanics library before writing
  gameplay rules, check each candidate's limits and evidence, and retain attribution when using it.
- Builds check the loaded plugin's instructions against its versioned content lock and report stale
  or incomplete installations with reinstall guidance that preserves the installation scope.
- Requires CLI binary `cli-v0.2.16` or newer; the launcher self-updates.

## [1.7.19] - Boot the build before publishing

Two generated games were published as a black page with a clean console, and no step in the
pipeline had ever opened the file being published. The dev server hides both causes by construction,
and the publish check compares bytes, not behaviour.

- **New:** the polish phase's deploy step now calls `verify_build({gameDir})` between `npm run build`
  and publish. It boots `dist/` in a real browser served from a sub-path, the way a published game is
  served, and answers `pass` / `fail` / `unverified` — three different things. `fail` blocks the
  publish; `unverified` ("we did not look") never counts as a failure and never authorises publishing
  either. Requires CLI binary `cli-v0.2.12` or newer (the launcher self-updates).

## [1.5.0] - Concept-driven assets

The `concept` phase already produced a menu mock and in-game frames with the HUD, and the `assets`
phase never looked at them — it built its manifest from the design doc and the approved pictures went
unused. The gap is now closed by asking.

- **New:** before building the asset manifest, the assets phase finds the concept visuals (reading
  `docs/CONCEPT.md`, checking the files exist and are real generations rather than gray-box
  placeholders) and asks whether the game should look like them. Plain language, in the agent's own
  voice — never pipeline vocabulary.
- Partial answers are honoured per group: "keep this menu" sources the menu from the concept and the
  rest from the doc. An unanswered question is unresolved, not consent — asked once more, then it
  falls back to the doc and says so, that being the cheaper and reversible path.
- When a group is sourced from the concept, the visual is copied into `assets/reference/`, uploaded
  via `forge_reference` / `reference_upload`, and the returned `assetId` becomes that group's `editOf`
  anchor — so "it will look like the concept" is wired, not just promised. Sprite sheets are carved
  out explicitly (they generate from the prompt and ignore `editOf`) and reported as style-matched by
  description.
- Backed by the gated `pattern:concept-deconstruction` knowledge: types and a placement table rather
  than one asset per visible object, and a shared frame extracted once instead of baked into every
  item.

## [1.4.x] - Not documented at the time

Shipped without changelog entries; recorded here for continuity: phase-skill sync from source (1.4.0),
the build-record instructions customers had never received (1.4.1), and the telemetry level-event
correction (1.4.2).

## [1.3.0] - Windows x64 support

First-class Windows support. Nothing in the payload is platform-specific any more: one manifest, one
launcher name, one implementation of every piece of logic.

- **New:** `install.ps1` (served at `https://cli.ongame.ai/install.ps1`, run with
  `irm https://cli.ongame.ai/install.ps1 | iex`). Windows PowerShell 5.1 and PowerShell 7, WoW64-correct
  architecture detection, checksum-verified download, rename-aside install over a running binary,
  non-truncating registry PATH update (never `setx`), then the same `ongame-cli install` handoff
  `install.sh` uses. `-NoPathUpdate` / `-NoPluginSetup` (also readable from `$env:ONGAME_NO_PATH_UPDATE` /
  `$env:ONGAME_NO_PLUGIN_SETUP`, since `irm | iex` cannot pass parameters).
- **New:** `bin/ongame-launcher.exe` — the Windows twin of `bin/ongame-launcher`, a ~10KB C trampoline
  built reproducibly from `bin/win/ongame-launcher.c`. Both are reached through the SAME manifest string:
  an extensionless spawn path resolves to its `.exe` sibling on Windows.
- **Changed:** `hooks/hooks.json` now uses Claude Code's **exec form** (`command` + `args`) and points every
  hook at `bin/ongame-launcher` with `["hook", "<name>"]`. Exec form spawns a real executable with no shell
  on any platform, which removes three whole failure classes at once: the Git-Bash-vs-PowerShell dispatch,
  `${CLAUDE_PLUGIN_ROOT}` backslashes eaten as shell escapes, and a space in the user's name splitting the
  command into words.
- **Changed:** the `playwright` MCP server now goes through `bin/ongame-launcher playwright` instead of bare
  `npx`. `npx` is `npx.cmd` on Windows and a `.cmd` shim cannot be spawned without a shell — and neither a
  plugin's `mcpServers` block nor Codex's `[mcp_servers]` has a per-platform override, so one command string
  has to work everywhere.
- **Removed:** `hooks/*.sh` and `scripts/*.sh`. Every one of them was silently dead on a Windows machine
  without Git for Windows, where Claude Code registers no Bash tool at all. They now live inside the binary
  as `ongame-cli hook <name>` / `ongame-cli statusline`, with real unit tests — one implementation, not a
  POSIX copy and a Windows copy.
- **New:** `test/mock-release-server.mjs` — a dependency-free stand-in for the two GitHub hosts the install
  path talks to, plus the `ONGAME_LAUNCHER_API_ROOT` / `ONGAME_LAUNCHER_DOWNLOAD_ROOT` seams in `install.sh`
  and `install.ps1` that reach it (the launcher and the binary's updater already honoured those two names).
  Both installers were previously the one production path nothing could test end to end; the release gate now
  runs each of them against a real HTTP server and asserts checksum verification, idempotency, and that a
  corrupt release leaves no partial install. Unset in production, the seams change nothing — and they cannot
  weaken the trust chain, because `checksums.txt` is fetched from the same root as the binary and the sha256
  check stays unconditional.

## [1.2.3] - CRLF install fix

- **Fix:** add `.gitattributes` (`* text=auto eol=lf`) so shell scripts are ALWAYS checked out with LF,
  regardless of the user's `git config core.autocrlf`. Without it, a user whose git has
  `core.autocrlf=true` received CRLF line endings on `claude plugin install`, which broke the script
  shebangs and silently killed the plugin:
  - `bin/ongame-launcher` → `bad interpreter: /bin/sh^M` — the MCP server never started, so **none of the
    ongame tools appeared** in the session.
  - `hooks/browser-check.sh` → `env: bash
: No such file or directory` — the SessionStart hook error.
  Repo blobs were already LF; the corruption happened at checkout on the user's machine. `.gitattributes`
  overrides `core.autocrlf`, fixing it at the source for every install. Version bumped so the version-gated
  auto-update pulls the fix into a fresh, LF-clean plugin cache.

## [1.0.0] - Unreleased

Initial public release of the ongame-cli distribution.

- `install.sh`: one-line curl\|sh installer — OS/arch detection, checksum-verified binary
  download, PATH setup, Claude Code + Codex CLI MCP registration.
- `.claude-plugin/plugin.json` + `marketplace.json`: static Claude Code plugin manifest — a thin
  shim (`bin/ongame-launcher`) in front of the self-updating `ongame-cli` binary.
- `bin/ongame-launcher`: dependency-free Node.js launcher — checks GitHub Releases for a newer
  `ongame-cli` build at every process start, verifies its checksum, swaps it in place, then execs
  into it.
- `codex/config-snippet.toml`: MCP server registration for OpenAI Codex CLI.
