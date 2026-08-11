# Changelog

All notable changes to `ongame-cli` are documented here. Distribution/plugin-manifest changes
(this repo) and CLI binary releases (tagged `cli-v*`) are both tracked in this one file since
they're released together conceptually, even though the CLI binary's own build lives in a
separate private repo.

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
  - `hooks/browser-check.sh` → `env: bash: No such file or directory` — the SessionStart hook error.
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
