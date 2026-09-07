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
  `bin/ongame-launcher.exe` is its Windows twin, a ~100KB C trampoline built reproducibly from
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

**One outside requirement.** Browser verification — the step that proves a build really runs before
anything is called playable — uses a bundled Playwright server that needs **Node.js 18+ on your `PATH`**
(for `npx`). Without it a build still runs end to end, but it is reported as `unverified` rather than
playable.

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
| Codex | **full** | `$ongame-make-game <idea>` | `$ongame-account` |
| Gemini CLI | **full** | `/make-game <idea>` | `/account` |
| Cursor | **full** | `/make-game <idea>` | `/account` |
| Windsurf | **commands** | `/make-game <idea>` | `/account` |
| opencode | **commands** | `/make-game <idea>` | `/account` |
| Copilot CLI | **full** | `/make-game <idea>` | `/account` |
| Amp | **commands** | `make-game: <idea>` | `account:` |

- **full** — the game-making tools, the `/make-game`, `/account` and `/publish` commands, the skills
  behind them, and session hooks where the agent has them (today: Codex).
- **commands** — the tools, the three commands however this agent invokes them, and a short note in the
  agent's own instructions file.

Whatever the agent, `ongame-cli account` in any terminal shows your plan and remaining usage, and
`/publish` (`$ongame-publish` in Codex, `publish:` in Amp) puts a finished game on a live URL.

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
- **You get:** tools, `$ongame-make-game`, `$ongame-account`, `$ongame-publish` (Codex has no user-defined
  `/commands`; skills are its equivalent, named after their folders — you invoke one by typing `$` and its
  name, or pick it from `/skills`), hooks.
- **Start:** `$ongame-make-game <your game idea>`. Codex asks you to trust new hooks before it runs them: in a
  session, type `/hooks` and approve the ongame entries (there are several — they cover four session events). Until you do, everything else still works —
  you only miss the session hooks.
- **Verify:** `codex mcp get ongame --json` (exit 0 = registered) or `codex mcp list`. If
  `codex mcp remove` reports nothing, the entries are in `~/.codex/config.toml` — remove the
  `[mcp_servers.ongame]` and `[mcp_servers.playwright]` tables there.
- **Uninstall:** `codex mcp remove ongame` and `codex mcp remove playwright`; delete
  `ongame-make-game/`, `ongame-account/` and `ongame-publish/` under `~/.agents/skills/`;
  remove the ongame entries from `~/.codex/hooks.json` and the block between `<!-- ongame:start -->` and
  `<!-- ongame:end -->` in `~/.codex/AGENTS.md`.

### Gemini CLI — full

- **Install:** automatic when `gemini` is installed — the installer runs `gemini mcp add -s user ongame`,
  writes `make-game.toml`, `account.toml` and `publish.toml` into `~/.gemini/commands/`, and appends a
  marked section to `~/.gemini/GEMINI.md`. Your other entries in `~/.gemini/settings.json` stay
  byte-for-byte.
- **You get:** tools, `/make-game`, `/account`, `/publish`.
- **Start:** `/make-game <your game idea>`. Gemini only starts tool servers in folders you have trusted —
  when it asks about the folder you're building in, say yes. A session that was already open picks the
  new pieces up on restart.
- **Verify:** `gemini mcp list` prints a line beginning `ongame:`.
- **Uninstall:** `gemini mcp remove -s user ongame` and `gemini mcp remove -s user playwright`; delete the three `.toml` files from
  `~/.gemini/commands/`; remove the marked block from `~/.gemini/GEMINI.md`. If `gemini mcp remove`
  reports nothing to remove, delete the `ongame` and `playwright` entries from
  `~/.gemini/settings.json` by hand — that file is the fallback when the CLI cannot do it.

### Cursor — full

- **Install:** automatic when Cursor is installed. Cursor has no command to register a tool server, so the
  installer merges an `ongame` entry into `~/.cursor/mcp.json` (your other servers stay byte-for-byte),
  and installs four skills under `~/.cursor/skills/` — `make-game`, `account`, `publish` and a shared
  `ongame` recipe skill.
- **You get:** tools, `/make-game`, `/account`, `/publish`.
- **Start:** `/make-game <your game idea>`, in the IDE or the `agent` CLI. Cursor asks you to approve a new
  tool server the first time — approve `ongame` (in the CLI: `agent mcp enable ongame`). New skills show up
  in the `/` menu after a restart.
- **Verify:** `ongame` appears under Settings → MCP in the IDE; from a terminal, `jq -e '.mcpServers.ongame'
  ~/.cursor/mcp.json`.
- **Uninstall:** remove the `ongame` and `playwright` keys from `~/.cursor/mcp.json`; delete
  `make-game/`, `account/`, `publish/` and `ongame/` from `~/.cursor/skills/`.

### Windsurf — commands

- **Install:** automatic when Windsurf is installed. Windsurf has no command to register a tool server, so
  the installer merges an `ongame` entry into `~/.codeium/windsurf/mcp_config.json`, writes
  `make-game.md`, `account.md` and `publish.md` into `~/.codeium/windsurf/global_workflows/` (and
  `make-game` as a skill under `~/.codeium/windsurf/skills/`), and appends a
  short marked section to `~/.codeium/windsurf/memories/global_rules.md` (that file has a 6,000-character
  cap; if the note would not fit, the installer says so instead of truncating your rules).
- **You get:** tools, `/make-game`, `/account`, `/publish` as workflows, and the note. The workflows and
  the tools are wired for Windsurf's Cascade agent.
- **Start:** `/make-game <your game idea>`. Restart Windsurf after installing so it reloads the config.
- **Verify:** `~/.codeium/windsurf/mcp_config.json` contains `"ongame"` and
  `~/.codeium/windsurf/global_workflows/make-game.md` exists.
- **Uninstall:** remove the `ongame` and `playwright` keys from `~/.codeium/windsurf/mcp_config.json`; delete the three
  workflow files and the `make-game/` skill folder under `~/.codeium/windsurf/skills/`; remove the marked block
  from `~/.codeium/windsurf/memories/global_rules.md`.

### opencode — commands

- **Install:** automatic when `opencode` is installed — the installer runs `opencode mcp add ongame` with
  the absolute path to the binary, writes `make-game.md`, `account.md` and `publish.md` into
  `~/.config/opencode/commands/`, and — only if you already have one — appends a marked section to
  opencode's global instructions file (`~/.config/opencode/AGENTS.md`). The install summary says whether
  that step ran.
- **You get:** tools, `/make-game`, `/account`, `/publish`, and the note.
- **Start:** `/make-game <your game idea>`. opencode reads its config at startup — restart it after
  installing.
- **Verify:** `opencode mcp list` shows `✓ ongame connected`.
- **Uninstall:** remove the `ongame` and `playwright` entries under `mcp` in `~/.config/opencode/opencode.json` (or
  `opencode.jsonc`); delete the three command files; remove the marked block from
  `~/.config/opencode/AGENTS.md` if the summary said one was written.

### Copilot CLI — full

- **Install:** automatic when the GitHub Copilot CLI is installed — the installer runs
  `copilot mcp add ongame` with the absolute path to the binary, installs the three commands as skills
  under `~/.copilot/skills/`, and appends a marked section to `~/.copilot/copilot-instructions.md`.
  (Another tool called `copilot` — AWS's — is common on the same PATH; the installer tells them apart by
  `copilot --version`.)
- **You get:** tools, `/make-game`, `/account`, `/publish` as skills under `~/.copilot/skills/`, and a note
  in your global Copilot instructions.
- **Start:** `/make-game <your game idea>`. Copilot loads skills and tool servers at session start, so open a
  new session after installing.
- **Non-interactive runs** (`copilot -p "…"` in a script or CI) approve no tools by themselves — add
  `--allow-tool ongame --allow-tool playwright`, or the run silently proceeds with no tools at all.
- **Verify:** `copilot mcp get ongame --json` (exit 0 = registered) or `copilot mcp list`. If
  `copilot mcp remove` reports nothing, the entries were written to `~/.copilot/mcp-config.json`
  directly — remove them there.
- **Uninstall:** `copilot mcp remove ongame` and `copilot mcp remove playwright`; delete
  `make-game/`, `account/` and `publish/` under `~/.copilot/skills/`;
  remove the marked block from `~/.copilot/copilot-instructions.md`.

### Amp — commands

- **Install:** automatic when `amp` is installed — the installer runs `amp mcp add ongame` with the
  absolute path to the binary, installs the three commands as skills under `~/.config/agents/skills/`, and
  appends a marked section to `~/.config/amp/AGENTS.md`.
- **You get:** tools, the three commands as skills under `~/.config/agents/skills/`, and a note in your Amp
  instructions.
- **Start:** `make-game: <your game idea>`. Amp has no slash menu (typing `/` opens its own palette), so you
  name the skill in your message; `account:` and `publish:` work the same way. Restart Amp after installing.
- **Verify:** `amp mcp list --json` includes `"name": "ongame"`. If `amp mcp remove` reports nothing,
  the entries are in Amp's own settings file — remove them there.
- **Uninstall:** `amp mcp remove ongame` and `amp mcp remove playwright`; delete
  `make-game/`, `account/` and `publish/` under `~/.config/agents/skills/`;
  remove the marked block from `~/.config/amp/AGENTS.md`.

## Your account

- In your agent: `/account` — `$ongame-account` in Codex, `account:` in Amp — shows your plan, remaining
  usage and when it resets, and the link to manage your plan.
- In any terminal: `ongame-cli account` prints the same view, whatever agent you use. If you are not signed
  in yet, it tells you to run `ongame-cli login`.
- Plan, payment, usage and spend caps live at [account.ongame.ai](https://account.ongame.ai).

## Windows notes

- Run the one-liner in PowerShell — Windows PowerShell 5.1 (already on every Windows machine) or
  PowerShell 7. Git for Windows is **not** required.
- Windows on ARM installs the x64 build, which runs under Windows' built-in x64 emulation.
- The binary lands in `%USERPROFILE%\.ongame\bin\ongame-cli.exe`. Where an agent resolves its tool
  command with a plain PATH lookup that ignores `PATHEXT` (Codex does), the installer writes that
  absolute `.exe` path rather than the bare name, so the entry works without any PATH help.
- Because `irm | iex` cannot pass parameters, every selection control has an environment form — set it
  before the one-liner:

  ```powershell
  $env:ONGAME_AGENTS = "claude,codex"   # set up exactly these
  $env:ONGAME_ALL = 1                   # every agent it finds
  $env:ONGAME_YES = 1                   # accept the defaults, never ask
  $env:ONGAME_NO_AGENTS = 1             # the binary only
  irm https://cli.ongame.ai/install.ps1 | iex
  ```

  Or pass real parameters with the invocation form that carries arguments:
  `iex "& {$(irm https://cli.ongame.ai/install.ps1)} -All"`. Afterwards the flags work directly:
  `ongame-cli install --agents gemini`.
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
(`%USERPROFILE%\.ongame` on Windows). That also removes the shared build recipes at `~/.ongame/skills/`,
which every agent except Claude Code reads (the Claude Code plugin carries its own copy), the record of
what was installed at `~/.ongame/installed-files.json`, and the binary itself.

Two more things the installer can leave behind:

- **The `PATH` line.** It is in whichever startup files you already had — any of `~/.zshrc`, `~/.bashrc`,
  `~/.bash_profile`, `~/.bash_login`, `~/.profile` — or, for fish, in `~/.config/fish/conf.d/ongame.fish`
  (delete that file). Each edit is the block between `# ongame-cli (added by install.sh)` and
  `# ongame-cli end`. On Windows the entry is in the per-user `PATH` (System → Environment Variables).
- **Backups.** Where the installer had to write over a file you already had, the original is beside it as
  `<name>.ongame-backup-<timestamp>`. Nothing removes those but you.

## Support

This is a commercial product. For questions, issues or billing:
[account.ongame.ai](https://account.ongame.ai) or [support@ongame.ai](mailto:support@ongame.ai).
