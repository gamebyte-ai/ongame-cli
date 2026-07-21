# Changelog

All notable changes to `ongame-cli` are documented here. Distribution/plugin-manifest changes
(this repo) and CLI binary releases (tagged `cli-v*`) are both tracked in this one file since
they're released together conceptually, even though the CLI binary's own build lives in a
separate private repo.

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
