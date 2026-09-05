# ongame-cli

The official installer, agent integrations, and release host for **ongame** — an AI game-making
assistant that runs as a CLI and plugs into the coding agent you already use: Claude Code, Codex,
Gemini CLI, Cursor, Windsurf, Copilot CLI, opencode and Amp.

This repository is deliberately small. It contains no application source — only the pieces needed to
install the real `ongame-cli` binary, keep it up to date, and let each agent find it:

- `install.sh` / `install.ps1` — the one-line installers (macOS + Linux / Windows). They detect your
  OS/arch, download and checksum-verify the binary, put it on your `PATH`, and hand every remaining
  step to `ongame-cli install`, so the two can never drift apart.
- `.claude-plugin/` — the Claude Code plugin manifest + marketplace listing (a static shim that points
  at the installed binary; it is not the application itself).
- `bin/ongame-launcher` — a small, dependency-free launcher that hands off to the installed binary.
  `bin/ongame-launcher.exe` is its Windows twin, a ~10KB C trampoline built reproducibly from
  `bin/win/ongame-launcher.c`.
- `commands/`, `skills/`, `workflows/` — the Claude Code plugin's `/make-game`, `/account` and
  `/publish` commands, the skills behind them, and the build workflow.
- `hooks/hooks.json` — the plugin's hooks, all in Claude Code's **exec form** (`command` + `args`).
  That is deliberate and load-bearing: exec form spawns a real executable directly with **no shell on
  any platform**, so the hooks work identically on a Windows box that has no Git for Windows — where
  Claude Code registers no Bash tool at all and a `.sh` hook would be silently dead. The hook
  implementations themselves live in the binary (`ongame-cli hook <name>`), not in this repo.
- `codex/config-snippet.toml` — the MCP registration block for Codex, kept as the by-hand fallback.

The versions of those commands, skills and hook entries that the **other** agents get are not files in
this repo: they ship embedded in the binary, and `ongame-cli install` writes them into each agent's own
configuration — no network at wiring time, and always the version that matches the binary you have.

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

Either one detects your OS/arch, downloads and checksum-verifies the matching `ongame-cli` binary from
this repo's [Releases](https://github.com/gamebyte-ai/ongame-cli/releases), installs it to
`~/.ongame/bin` (`%USERPROFILE%\.ongame\bin` on Windows), adds it to your `PATH`, and then runs
`ongame-cli install`, which:

1. **detects** the coding agents on your machine (it never creates config for an agent you don't have);
2. **asks** which to set up — a numbered list, Claude Code and Codex pre-checked when present, Enter to
   accept. With no terminal to ask on (CI, a script) it installs those defaults and prints how to change
   the choice;
3. **wires** each one you picked — merging into the agent's existing config, never overwriting it — and
   reads the result back to verify it;
4. **prints a summary**, per agent: what you got and exactly what to type to start.

Re-run it any time with `ongame-cli install`. It re-detects, reports anything already set up as
"already wired", adds what is missing, and changes nothing else. That is also how you add an agent you
installed later.

### Choosing agents without the prompt

```
# pick agents (ids: claude codex gemini cursor windsurf copilot opencode amp)
curl -fsSL https://cli.ongame.ai/install.sh | sh -s -- --agents claude,codex

# the same choice as an environment variable — set it on `sh`, the side that runs the installer
curl -fsSL https://cli.ongame.ai/install.sh | ONGAME_AGENTS=claude,codex sh
$env:ONGAME_AGENTS = "claude,codex"; irm https://cli.ongame.ai/install.ps1 | iex

# accept the defaults with no questions · every agent it finds · the binary only
curl -fsSL https://cli.ongame.ai/install.sh | sh -s -- -y
curl -fsSL https://cli.ongame.ai/install.sh | sh -s -- --all
curl -fsSL https://cli.ongame.ai/install.sh | sh -s -- --no-agents

# after install, the same flags work on the binary directly
ongame-cli install --agents gemini
```

Flags win over the prompt; the prompt wins over the defaults. `ongame-cli install` always exits 0 and
reports on stderr, so a broken agent CLI can never turn a successful install into a failure.

## What you get, per agent

The tools are the same everywhere. What differs is the surface each agent gives us to hang them on, and
the table says so honestly — no agent is described as more than it is.

| Agent | You get | Start a game | Your account |
|---|---|---|---|
| Claude Code | **full** | `/make-game <idea>` | `/account` |
| Codex | **full** | `$make-game <idea>` | `$account` |
| Gemini CLI | **full** | `/make-game <idea>` | `/account` |
| Cursor | **full** | `/make-game <idea>` | `/account` |
| Windsurf | **commands** | `/make-game <idea>` | `/account` |
| opencode | **commands** | `/make-game <idea>` | `/account` |
| Copilot CLI | **tools + guidance** | just ask: *make a game about …* | `ongame-cli account` |
| Amp | **tools + guidance** | just ask: *make a game about …* | `ongame-cli account` |

- **full** — the game-making tools, the `/make-game`, `/account` and `/publish` commands, the skills
  behind them, and session hooks.
- **commands** — the tools, the three commands, and a short note in the agent's own instructions file.
- **tools + guidance** — the tools, plus a marked note in the agent's global instructions that says
  exactly how to start. These agents have no slash-command surface of their own, so you ask in words.

Whatever the agent, `ongame-cli account` in any terminal shows your plan and remaining usage, and
`/publish` (or, where there are no commands, "publish this game") puts a finished game on a live URL.

### Claude Code — full

- **Install:** automatic when `claude` is on your `PATH` — the installer adds the marketplace and
  installs the plugin. Manual fallback, only if the summary reported a failure: in a session,
  `/plugin marketplace add gamebyte-ai/ongame-cli` then `/plugin install ongame@ongame-cli`.
- **You get:** the plugin — tools, `/make-game`, `/account`, `/publish`, skills, hooks.
- **Start:** `/make-game <your game idea>`. If a session was already open when you installed, run
  `/reload-plugins` there first.
- **Verify:** `claude plugin list` shows `ongame`.
- **Uninstall:** `claude plugin uninstall ongame@ongame-cli` (and, if you want the listing gone too,
  `claude plugin marketplace remove ongame-cli`).

### Codex — full

- **Install:** automatic when `codex` is installed — the installer runs `codex mcp add ongame` with the
  absolute path to the binary, installs the three skills under `~/.agents/skills/`, adds its hooks to
  `~/.codex/hooks.json`, and appends a short marked section to `~/.codex/AGENTS.md`. Nothing outside
  those entries is touched. By hand: `codex mcp add ongame -- "$HOME/.ongame/bin/ongame-cli" mcp`; on a
  Codex too old to have `mcp add`, copy [`codex/config-snippet.toml`](./codex/config-snippet.toml) into
  your `config.toml`.
- **You get:** tools, `$make-game`, `$account`, `$publish` (Codex has no user-defined `/commands`; skills
  are its equivalent and you invoke one by typing `$` and its name, or pick it from `/skills`), hooks.
- **Start:** `$make-game <your game idea>`. Codex asks you to trust new hooks before it runs them: in a
  session, type `/hooks` and approve the two ongame entries. Until you do, everything else still works —
  you only miss the session hooks.
- **Verify:** `codex mcp get ongame --json` (exit 0 = registered) or `codex mcp list`.
- **Uninstall:** `codex mcp remove ongame`; delete the ongame skill folders under `~/.agents/skills/`;
  remove the ongame entries from `~/.codex/hooks.json` and the block between `<!-- ongame:start -->` and
  `<!-- ongame:end -->` in `~/.codex/AGENTS.md`.

### Gemini CLI — full

- **Install:** automatic when `gemini` is installed — the installer runs `gemini mcp add -s user ongame`,
  writes `make-game.toml`, `account.toml` and `publish.toml` into `~/.gemini/commands/`, adds its hooks to
  `~/.gemini/settings.json` (merged; your other hooks stay), and appends a marked section to
  `~/.gemini/GEMINI.md`.
- **You get:** tools, `/make-game`, `/account`, `/publish`, hooks.
- **Start:** `/make-game <your game idea>`. Gemini only starts tool servers in folders you have trusted —
  when it asks about the folder you're building in, say yes. A session that was already open picks the
  new pieces up on restart.
- **Verify:** `gemini mcp list` prints a line beginning `ongame:`.
- **Uninstall:** `gemini mcp remove -s user ongame`; delete the three `.toml` files from
  `~/.gemini/commands/`; remove the ongame entries from the `hooks` section of `~/.gemini/settings.json`
  and the marked block from `~/.gemini/GEMINI.md`.

### Cursor — full

- **Install:** automatic when Cursor is installed. Cursor has no command to register a tool server, so the
  installer merges an `ongame` entry into `~/.cursor/mcp.json` (your other servers stay byte-for-byte),
  installs the three commands as skills under `~/.cursor/skills/`, and adds its hooks to
  `~/.cursor/hooks.json`.
- **You get:** tools, `/make-game`, `/account`, `/publish`, hooks.
- **Start:** `/make-game <your game idea>`, in the IDE or the `agent` CLI. Cursor asks you to approve a new
  tool server the first time — approve `ongame` (in the CLI: `agent mcp enable ongame`). New skills show up
  in the `/` menu after a restart.
- **Verify:** `ongame` appears under Settings → MCP in the IDE; from a terminal, `jq -e '.mcpServers.ongame'
  ~/.cursor/mcp.json`.
- **Uninstall:** remove the `ongame` key from `~/.cursor/mcp.json`; delete the ongame skill folders from
  `~/.cursor/skills/`; remove the ongame entries from `~/.cursor/hooks.json`.

### Windsurf — commands

- **Install:** automatic when Windsurf is installed. Windsurf has no command to register a tool server, so
  the installer merges an `ongame` entry into `~/.codeium/windsurf/mcp_config.json`, writes
  `make-game.md`, `account.md` and `publish.md` into `~/.codeium/windsurf/global_workflows/`, and appends a
  short marked section to `~/.codeium/windsurf/memories/global_rules.md` (that file has a 6,000-character
  cap; if the note would not fit, the installer says so instead of truncating your rules).
- **You get:** tools, `/make-game`, `/account`, `/publish` as workflows, and the note. The workflows and
  the tools are wired for Windsurf's Cascade agent.
- **Start:** `/make-game <your game idea>`. Restart Windsurf after installing so it reloads the config.
- **Verify:** `~/.codeium/windsurf/mcp_config.json` contains `"ongame"` and
  `~/.codeium/windsurf/global_workflows/make-game.md` exists.
- **Uninstall:** remove the `ongame` key from `~/.codeium/windsurf/mcp_config.json`; delete the three
  workflow files; remove the marked block from `~/.codeium/windsurf/memories/global_rules.md`.

### opencode — commands

- **Install:** automatic when `opencode` is installed — the installer runs `opencode mcp add ongame` with
  the absolute path to the binary, writes `make-game.md`, `account.md` and `publish.md` into
  `~/.config/opencode/commands/`, and appends a marked section to opencode's global instructions file.
- **You get:** tools, `/make-game`, `/account`, `/publish`, and the note.
- **Start:** `/make-game <your game idea>`. opencode reads its config at startup — restart it after
  installing.
- **Verify:** `opencode mcp list` shows `✓ ongame connected`.
- **Uninstall:** remove the `ongame` entry under `mcp` in `~/.config/opencode/opencode.json` (or
  `opencode.jsonc`); delete the three command files; remove the marked block from
  `~/.config/opencode/AGENTS.md`.

### Copilot CLI — tools + guidance

- **Install:** automatic when the GitHub Copilot CLI is installed — the installer runs
  `copilot mcp add ongame` with the absolute path to the binary and appends a marked section to
  `~/.copilot/copilot-instructions.md`. (Another tool called `copilot` — AWS's — is common on the same
  PATH; the installer tells them apart by `copilot --version`.)
- **You get:** the tools and a note in your global Copilot instructions that says how to start.
- **Start:** there is no slash command here — just ask: *make a game about …*. Copilot reads its
  instructions at session start, so open a new session after installing.
- **Account:** `ongame-cli account` in any terminal.
- **Verify:** `copilot mcp get ongame --json` (exit 0 = registered) or `copilot mcp list`.
- **Uninstall:** `copilot mcp remove ongame`; remove the marked block from
  `~/.copilot/copilot-instructions.md`.

### Amp — tools + guidance

- **Install:** automatic when `amp` is installed — the installer runs `amp mcp add ongame` with the
  absolute path to the binary and appends a marked section to `~/.config/amp/AGENTS.md`.
- **You get:** the tools and a note in your Amp instructions that says how to start.
- **Start:** Amp has no slash commands (typing `/` opens its command palette) — just ask: *make a game
  about …*.
- **Account:** `ongame-cli account` in any terminal.
- **Verify:** `amp mcp list --json` includes `"name": "ongame"`.
- **Uninstall:** `amp mcp remove ongame`; remove the marked block from `~/.config/amp/AGENTS.md`.

## Your account

- Where your agent has commands: `/account` (`$account` in Codex) shows your plan, remaining usage and
  when it resets, and the link to manage your plan.
- Anywhere, including agents with no commands: `ongame-cli account` prints the same view from the
  terminal. If you are not signed in yet, it tells you to run `ongame-cli login`.
- Plan, payment, usage and spend caps live at [account.ongame.ai](https://account.ongame.ai).

## Windows notes

- Run the one-liner in PowerShell — Windows PowerShell 5.1 (already on every Windows machine) or
  PowerShell 7. Git for Windows is **not** required.
- Windows on ARM installs the x64 build, which runs under Windows' built-in x64 emulation.
- The binary lands in `%USERPROFILE%\.ongame\bin\ongame-cli.exe`. Where an agent resolves its tool
  command with a plain PATH lookup that ignores `PATHEXT` (Codex does), the installer writes that
  absolute `.exe` path rather than the bare name, so the entry works without any PATH help.
- Because `irm | iex` cannot pass parameters, choose agents through the environment:
  `$env:ONGAME_AGENTS = "claude,codex"; irm https://cli.ongame.ai/install.ps1 | iex`. Afterwards the
  flags work directly: `ongame-cli install --agents gemini`.
- Agent configs live under your profile: `%USERPROFILE%\.codex` (or `%CODEX_HOME%`), `.gemini`,
  `.cursor`, `.codeium\windsurf`, `.copilot`, `.config\opencode` and `.config\amp` — the same file
  names as on macOS/Linux.

## Updates

You never need to re-run the installer or update by hand. `ongame-cli` checks for a newer release on
every launch and swaps itself in place (checksum-verified) before running. The agent-side pieces are
thin shims that almost never change, so a new version simply takes effect on your next agent session.
When an update does add something an agent needs to know about, `ongame-cli install` puts it in place —
re-running it is always safe.

## Uninstall

Undo the agent wiring you want gone with the per-agent steps above, then delete `~/.ongame`
(`%USERPROFILE%\.ongame` on Windows) and the `PATH` line the installer added to your shell profile.

## Support

This is a commercial product. For questions, issues, or billing, reach out through the ongame product
you're using it from.
