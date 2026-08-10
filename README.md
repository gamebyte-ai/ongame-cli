# ongame-cli

The official installer, Claude Code plugin manifest, and release host for **ongame** — an AI
game-making assistant that runs as a CLI + Claude Code plugin.

This repository is deliberately small. It contains no application source — only the pieces needed
to install and keep the real `ongame-cli` binary up to date:

- `install.sh` / `install.ps1` — the one-line installers (macOS + Linux / Windows).
- `.claude-plugin/` — the Claude Code plugin manifest + marketplace listing (a static shim that
  points at the installed binary; it is not the application itself).
- `bin/ongame-launcher` — a small, dependency-free launcher that hands off to the installed binary.
  `bin/ongame-launcher.exe` is its Windows twin, a ~10KB C trampoline built reproducibly from
  `bin/win/ongame-launcher.c`.
- `hooks/hooks.json` — the plugin's hooks, all in Claude Code's **exec form** (`command` + `args`).
  That is deliberate and load-bearing: exec form spawns a real executable directly with **no shell
  on any platform**, so the hooks work identically on a Windows box that has no Git for Windows —
  where Claude Code registers no Bash tool at all and a `.sh` hook would be silently dead. The hook
  implementations themselves live in the binary (`ongame-cli hook <name>`), not in this repo.
- `codex/config-snippet.toml` — the MCP server registration block for OpenAI Codex CLI users.

The actual `ongame-cli` binary (and everything it talks to) is closed source. See
[`LICENSE`](./LICENSE).

## Install

**macOS / Linux**

```
curl -fsSL https://cli.ongame.ai/install.sh | sh
```

**Windows** (PowerShell — either Windows PowerShell 5.1, which every Windows machine already has, or
PowerShell 7)

```
irm https://cli.ongame.ai/install.ps1 | iex
```

Either one detects your OS/arch, downloads and checksum-verifies the matching `ongame-cli` binary
from this repo's [Releases](https://github.com/gamebyte-ai/ongame-cli/releases), installs it to
`~/.ongame/bin` (`%USERPROFILE%\.ongame\bin` on Windows), adds it to your `PATH`, and — if it finds
`claude` or a Codex CLI install on your machine — wires up the MCP integration for you. Everything
after the download is done by the binary itself (`ongame-cli install`), so the two installers cannot
drift apart.

Windows on ARM installs the x64 build, which runs under Windows' built-in x64 emulation. Git for
Windows is **not** required.

`install.ps1` accepts `-NoPathUpdate` and `-NoPluginSetup` if you would rather wire things up
yourself. Because `irm | iex` cannot pass parameters, the same two switches are also readable from
the environment:

```
$env:ONGAME_NO_PLUGIN_SETUP=1; irm https://cli.ongame.ai/install.ps1 | iex
```

### Claude Code

`install.sh` registers the marketplace and installs the plugin automatically when `claude` is on
your PATH — nothing to paste. If a Claude Code session is already open, run `/reload-plugins`
there; otherwise just start one and type `/make-game <your game idea>`. (Manual fallback, only if
the automatic step reported a failure: `/plugin marketplace add gamebyte-ai/ongame-cli` then
`/plugin install ongame@ongame-cli`.)

### Codex CLI

If `~/.codex/` (`%CODEX_HOME%`, else `%USERPROFILE%\.codex` on Windows) exists, the installer already
patched `config.toml` for you. To do it by hand instead, copy
[`codex/config-snippet.toml`](./codex/config-snippet.toml) into your own config.

On **Windows** that block differs in exactly one line: `command` must be the ABSOLUTE path to
`ongame-cli.exe`, e.g.

```toml
[mcp_servers.ongame]
command = "C:\\Users\\you\\.ongame\\bin\\ongame-cli.exe"
args = ["mcp"]
startup_timeout_sec = 120.0
```

Codex resolves `command` with a plain PATH lookup that does not apply `PATHEXT`, so the bare
`ongame-cli` name the POSIX snippet uses finds nothing there. The installer writes the right one for
your machine automatically.

## Updates

You never need to re-run the installer or update the plugin by hand. `ongame-cli` checks for a
newer release on every launch and swaps itself in place (checksum-verified) before running — the
Claude Code plugin manifest itself almost never changes. A new version takes effect on your next
Claude Code / Codex session, the same way any other config change would.

## Support

This is a commercial product. For questions, issues, or billing, reach out through the ongame
product you're using it from.
