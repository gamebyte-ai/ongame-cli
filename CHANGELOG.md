# Changelog

All notable changes to `ongame-cli` are documented here. Distribution/plugin-manifest changes
(this repo) and CLI binary releases (tagged `cli-v*`) are both tracked in this one file since
they're released together conceptually, even though the CLI binary's own build lives in a
separate private repo.

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
