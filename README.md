# ongame-cli

The official installer, Claude Code plugin manifest, and release host for **ongame** — an AI
game-making assistant that runs as a CLI + Claude Code plugin.

This repository is deliberately small. It contains no application source — only the pieces needed
to install and keep the real `ongame-cli` binary up to date:

- `install.sh` — the one-line installer.
- `.claude-plugin/` — the Claude Code plugin manifest + marketplace listing (a static shim that
  points at the installed binary; it is not the application itself).
- `bin/ongame-launcher` — a small, dependency-free launcher that self-updates the binary and
  hands off to it.
- `codex/config-snippet.toml` — the MCP server registration block for OpenAI Codex CLI users.

The actual `ongame-cli` binary (and everything it talks to) is closed source. See
[`LICENSE`](./LICENSE).

## Install

```
curl -fsSL https://raw.githubusercontent.com/gamebyte-ai/ongame-cli/main/install.sh | sh
```

This detects your OS/arch, downloads and checksum-verifies the matching `ongame-cli` binary from
this repo's [Releases](https://github.com/gamebyte-ai/ongame-cli/releases), installs it to
`~/.ongame/bin`, adds it to your `PATH`, and — if it finds `claude` or a Codex CLI install on your
machine — wires up the MCP integration for you.

### Claude Code

After installing, inside a Claude Code session:

```
/plugin marketplace add gamebyte-ai/ongame-cli
/plugin install ongame@ongame-cli
```

### Codex CLI

If `~/.codex/` exists, `install.sh` already patched `~/.codex/config.toml` for you. To do it by
hand instead, copy [`codex/config-snippet.toml`](./codex/config-snippet.toml) into your own config.

## Updates

You never need to re-run the installer or update the plugin by hand. `ongame-cli` checks for a
newer release on every launch and swaps itself in place (checksum-verified) before running — the
Claude Code plugin manifest itself almost never changes. A new version takes effect on your next
Claude Code / Codex session, the same way any other config change would.

## Support

This is a commercial product. For questions, issues, or billing, reach out through the ongame
product you're using it from.
